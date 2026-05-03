from __future__ import annotations

import os
import re
import threading
import time
import json
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional

from flask import Flask, abort, request, send_from_directory
from flask_socketio import SocketIO, emit, join_room, leave_room

BASE_DIR = Path(__file__).resolve().parent
app = Flask(__name__, static_folder=str(BASE_DIR), static_url_path="")
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY") or "dev-change-in-production"

_cors_raw = os.environ.get("SOCKETIO_CORS_ORIGINS", "*").strip()
if _cors_raw == "*":
    _cors_allowed = "*"
else:
    _cors_allowed = [x.strip() for x in _cors_raw.split(",") if x.strip()] or "*"

socketio = SocketIO(app, cors_allowed_origins=_cors_allowed, async_mode="threading")

_lock = threading.Lock()
sid_to_label: dict[str, str] = {}
num_to_sid: dict[int, str] = {}
last_message_sid: str | None = None

# Структуры данных для админ-чата
user_sessions: Dict[str, Dict] = {}  # sid -> user_data
admin_sessions: List[str] = []  # Список sid админов
active_chats: Dict[str, Dict] = {}  # chat_id -> chat_data
user_to_chat: Dict[str, str] = {}  # user_sid -> chat_id
typing_users: Dict[str, float] = {}  # user_sid -> timestamp


@app.get("/health")
def health() -> tuple[dict[str, str], int]:
    return {"status": "ok"}, 200


@app.get("/")
def serve_root():
    return send_from_directory(BASE_DIR, "index.html")


@app.get("/profile.html")
def serve_profile():
    return send_from_directory(BASE_DIR, "profile.html")


@app.get("/order-room.html")
def serve_order_room():
    return send_from_directory(BASE_DIR, "order-room.html")

@app.get("/admin-chat.html")
def serve_admin_chat():
    return send_from_directory(BASE_DIR, "admin-chat.html")

@app.get("/test_chat.html")
def serve_test_chat():
    return send_from_directory(BASE_DIR, "test_chat.html")

@app.get("/debug_test.html")
def serve_debug_test():
    return send_from_directory(BASE_DIR, "debug_test.html")


@app.get("/<path:requested_path>")
def serve_static_file(requested_path: str):
    safe_path = (BASE_DIR / requested_path).resolve()
    if not str(safe_path).startswith(str(BASE_DIR)):
        abort(404)
    if not safe_path.is_file():
        abort(404)
    return send_from_directory(BASE_DIR, requested_path)


def _smallest_free_user_num() -> int:
    used = set(num_to_sid.keys())
    n = 1
    while n in used:
        n += 1
    return n


def assign_label(sid: str) -> str:
    with _lock:
        n = _smallest_free_user_num()
        label = f"User{n}"
        sid_to_label[sid] = label
        num_to_sid[n] = sid
    return label


def drop_client(sid: str) -> None:
    global last_message_sid
    with _lock:
        label = sid_to_label.pop(sid, None)
        if label:
            m = re.match(r"User(\d+)", label, re.I)
            if m:
                num_to_sid.pop(int(m.group(1)), None)
        if last_message_sid == sid:
            last_message_sid = None
        
        # Очистка данных админ-чата
        if sid in admin_sessions:
            admin_sessions.remove(sid)
        
        if sid in user_sessions:
            user_data = user_sessions.pop(sid)
            chat_id = user_to_chat.get(sid)
            if chat_id:
                # Уведомляем админов о отключении пользователя
                for admin_sid in admin_sessions:
                    socketio.emit('chat_closed', {
                        'chatId': chat_id,
                        'userId': user_data.get('userId', sid),
                        'userName': user_data.get('userName', label or 'User'),
                        'reason': 'disconnected'
                    }, to=admin_sid)
                
                # Очищаем связанные данные
                user_to_chat.pop(sid, None)
                if chat_id in active_chats:
                    # Помечаем чат как неактивный, но не удаляем сразу
                    active_chats[chat_id]['active'] = False
        
        if sid in typing_users:
            typing_users.pop(sid)


@socketio.on("connect")
def on_connect():
    sid = request.sid
    label = assign_label(sid)
    print(f"--- [NEW CONNECTION] ID: {label} зашел на сайт ---", flush=True)
    
    # Инициализируем пользователя в системе чатов
    with _lock:
        user_sessions[sid] = {
            'userId': sid,
            'userName': label,
            'userAvatar': label[0] if label else 'U'
        }
        print(f"--- [USER INITIALIZED] {label} initialized in chat system ---", flush=True)


@socketio.on("disconnect")
def on_disconnect():
    sid = request.sid
    with _lock:
        label = sid_to_label.get(sid, sid)
    print(f"--- [DISCONNECT] ID: {label} покинул сайт ---", flush=True)
    drop_client(sid)


@socketio.on("chat_message")
def on_chat_message(data):
    global last_message_sid
    sid = request.sid
    label = sid_to_label.get(sid, sid)
    if not isinstance(data, dict):
        data = {}
    message_text = data.get("text", "") or ""
    with _lock:
        last_message_sid = sid
    print(f"[{label}] отправил: {message_text}", flush=True)
    print(
        ">>> Введите ответ здесь (Enter). Или: UserN|текст — другому пользователю.",
        flush=True,
    )
    
    # Также отправляем сообщение админам
    with _lock:
        if sid in user_sessions:
            user_data = user_sessions[sid]
            chat_id = user_to_chat.get(sid)
            if chat_id:
                # Отправляем сообщение всем админам
                for admin_sid in admin_sessions:
                    socketio.emit('user_message', {
                        'chatId': chat_id,
                        'userId': user_data.get('userId', sid),
                        'userName': user_data.get('userName', label),
                        'text': message_text,
                        'timestamp': datetime.now().isoformat(),
                        'type': 'text'
                    }, to=admin_sid)


@socketio.on("chat_photo")
def on_chat_photo(data):
    sid = request.sid
    label = sid_to_label.get(sid, sid)
    if not isinstance(data, dict):
        data = {}
    
    image_data = data.get("imageData", "")
    file_name = data.get("fileName", "photo.jpg")
    file_type = data.get("fileType", "image/jpeg")
    
    if not image_data:
        return
    
    print(f"[{label}] отправил фото: {file_name}", flush=True)
    
    # Отправляем фото админам
    with _lock:
        if sid in user_sessions:
            user_data = user_sessions[sid]
            chat_id = user_to_chat.get(sid)
            if chat_id:
                # Отправляем фото всем админам
                for admin_sid in admin_sessions:
                    socketio.emit('user_message', {
                        'chatId': chat_id,
                        'userId': user_data.get('userId', sid),
                        'userName': user_data.get('userName', label),
                        'text': f'[Фото: {file_name}]',
                        'imageData': image_data,
                        'fileName': file_name,
                        'fileType': file_type,
                        'timestamp': datetime.now().isoformat(),
                        'type': 'image'
                    }, to=admin_sid)


# Новые обработчики для админ-чата
@socketio.on("admin_connect")
def on_admin_connect():
    sid = request.sid
    with _lock:
        if sid not in admin_sessions:
            admin_sessions.append(sid)
            print(f"--- [ADMIN CONNECTED] Admin {sid} connected ---", flush=True)
            
            # Отправляем список активных чатов новому админу
            for chat_id, chat_data in active_chats.items():
                if chat_data.get('active', True):
                    socketio.emit('new_chat', {
                        'chatId': chat_id,
                        'userId': chat_data.get('userId'),
                        'userName': chat_data.get('userName', 'User'),
                        'userAvatar': chat_data.get('userAvatar', 'U'),
                        'offerId': chat_data.get('offerId'),
                        'offerName': chat_data.get('offerName', 'Оффер'),
                        'amount': chat_data.get('amount', '0'),
                        'price': chat_data.get('price', '0'),
                        'status': chat_data.get('status', 'active'),
                        'createdAt': chat_data.get('createdAt'),
                        'lastMessage': chat_data.get('lastMessage', ''),
                        'lastMessageTime': chat_data.get('lastMessageTime')
                    }, to=sid)


@socketio.on("user_connect")
def on_user_connect(data):
    sid = request.sid
    label = sid_to_label.get(sid, sid)
    
    if not isinstance(data, dict):
        data = {}
    
    with _lock:
        # Создаем или обновляем данные пользователя
        user_data = {
            'userId': data.get('userId', sid),
            'userName': data.get('userName', label),
            'userAvatar': data.get('userAvatar', label[0] if label else 'U'),
            'offerId': data.get('offerId'),
            'offerName': data.get('offerName', 'Оффер'),
            'amount': data.get('amount', '0'),
            'price': data.get('price', '0'),
            'status': data.get('status', 'active'),
            'createdAt': data.get('createdAt', datetime.now().isoformat())
        }
        
        user_sessions[sid] = user_data
        
        # Создаем уникальный ID чата
        chat_id = f"chat_{user_data['userId']}_{int(time.time())}"
        user_to_chat[sid] = chat_id
        
        # Создаем или обновляем данные чата
        chat_data = {
            'chatId': chat_id,
            'userId': user_data['userId'],
            'userName': user_data['userName'],
            'userAvatar': user_data['userAvatar'],
            'offerId': user_data['offerId'],
            'offerName': user_data['offerName'],
            'amount': user_data['amount'],
            'price': user_data['price'],
            'status': user_data['status'],
            'createdAt': user_data['createdAt'],
            'lastMessage': '',
            'lastMessageTime': datetime.now().isoformat(),
            'active': True,
            'userSid': sid
        }
        
        active_chats[chat_id] = chat_data
        
        # Уведомляем всех админов о новом чате
        for admin_sid in admin_sessions:
            socketio.emit('new_chat', {
                'chatId': chat_id,
                'userId': user_data['userId'],
                'userName': user_data['userName'],
                'userAvatar': user_data['userAvatar'],
                'offerId': user_data['offerId'],
                'offerName': user_data['offerName'],
                'amount': user_data['amount'],
                'price': user_data['price'],
                'status': user_data['status'],
                'createdAt': user_data['createdAt']
            }, to=admin_sid)
        
        print(f"--- [USER CHAT CREATED] {user_data['userName']} created chat {chat_id} ---", flush=True)


@socketio.on("user_typing")
def on_user_typing(data):
    sid = request.sid
    with _lock:
        if sid in user_sessions:
            user_data = user_sessions[sid]
            chat_id = user_to_chat.get(sid)
            if chat_id:
                typing_users[sid] = time.time()
                
                # Уведомляем админов
                for admin_sid in admin_sessions:
                    socketio.emit('user_typing', {
                        'chatId': chat_id,
                        'userId': user_data.get('userId', sid),
                        'userName': user_data.get('userName', 'User')
                    }, to=admin_sid)


@socketio.on("user_stop_typing")
def on_user_stop_typing(data):
    sid = request.sid
    with _lock:
        if sid in typing_users:
            typing_users.pop(sid)
            
            if sid in user_sessions:
                user_data = user_sessions[sid]
                chat_id = user_to_chat.get(sid)
                if chat_id:
                    # Уведомляем админов
                    for admin_sid in admin_sessions:
                        socketio.emit('user_stop_typing', {
                            'chatId': chat_id,
                            'userId': user_data.get('userId', sid),
                            'userName': user_data.get('userName', 'User')
                        }, to=admin_sid)


@socketio.on("admin_message")
def on_admin_message(data):
    if not isinstance(data, dict):
        return
    
    chat_id = data.get('chatId')
    text = data.get('text', '').strip()
    admin_sid = request.sid
    
    if not chat_id or not text or admin_sid not in admin_sessions:
        return
    
    with _lock:
        chat_data = active_chats.get(chat_id)
        if not chat_data:
            return
        
        user_sid = chat_data.get('userSid')
        if not user_sid:
            return
        
        # Обновляем последнее сообщение в чате
        chat_data['lastMessage'] = text[:100] + '...' if len(text) > 100 else text
        chat_data['lastMessageTime'] = datetime.now().isoformat()
        
        # Отправляем сообщение пользователю
        socketio.emit('chat_reply', {
            'text': text,
            'from': 'admin',
            'timestamp': datetime.now().isoformat()
        }, to=user_sid)
        
        # Уведомляем всех админов о сообщении (для синхронизации между админами)
        for other_admin_sid in admin_sessions:
            if other_admin_sid != admin_sid:
                socketio.emit('admin_message_sent', {
                    'chatId': chat_id,
                    'text': text,
                    'timestamp': datetime.now().isoformat()
                }, to=other_admin_sid)
        
        print(f"--- [ADMIN MESSAGE] Admin to {chat_data['userName']}: {text} ---", flush=True)


@socketio.on("message_received")
def on_message_received(data):
    # Подтверждение получения сообщения (можно использовать для отметки "прочитано")
    pass


# Фоновая задача для очистки устаревших индикаторов печатания
def cleanup_typing_indicators():
    while True:
        time.sleep(5)
        with _lock:
            now = time.time()
            expired = [sid for sid, ts in typing_users.items() if now - ts > 10]
            for sid in expired:
                typing_users.pop(sid, None)
                if sid in user_sessions:
                    user_data = user_sessions.get(sid)
                    chat_id = user_to_chat.get(sid)
                    if chat_id:
                        # Уведомляем админов об остановке печатания
                        for admin_sid in admin_sessions:
                            socketio.emit('user_stop_typing', {
                                'chatId': chat_id,
                                'userId': user_data.get('userId', sid),
                                'userName': user_data.get('userName', 'User')
                            }, to=admin_sid)


def terminal_reply_loop() -> None:
    print(
        "\n=== Режим оператора: ответы только отсюда. "
        "Строка → последний написавший; User2|привет → User2. ===\n",
        flush=True,
    )
    while True:
        try:
            line = input()
        except (EOFError, KeyboardInterrupt):
            print("\n[stdin закрыт]", flush=True)
            break
        raw = line.rstrip("\r\n")
        if not raw.strip():
            continue

        m = re.match(r"^User(\d+)\s*\|\s*(.+)$", raw, re.IGNORECASE | re.DOTALL)
        if m:
            num = int(m.group(1))
            text = m.group(2).strip()
            with _lock:
                target_sid = num_to_sid.get(num)
        else:
            text = raw.strip()
            with _lock:
                target_sid = last_message_sid

        if not target_sid:
            print("[Некому отправить: ещё не было сообщений или UserN не в сети]", flush=True)
            continue

        try:
            socketio.emit("chat_reply", {"text": text}, to=target_sid)
            with _lock:
                tl = sid_to_label.get(target_sid, target_sid)
            print(f"[ОТПРАВЛЕНО → {tl}] {text}", flush=True)
        except Exception as e:
            print(f"[Ошибка отправки] {e}", flush=True)


if __name__ == "__main__":
    # Запускаем фоновые задачи
    threading.Thread(target=terminal_reply_loop, daemon=True).start()
    threading.Thread(target=cleanup_typing_indicators, daemon=True).start()
    
    _port = int(os.environ.get("PORT", "5000"))
    print(
        f"Socket.IO: слушает 0.0.0.0:{_port} (LAN: http://ВАШ_IP:{_port}; на хостинге задайте PORT)",
        flush=True,
    )
    print(
        f"Админ-чат доступен по адресу: http://127.0.0.1:{_port}/admin-chat.html",
        flush=True,
    )
    socketio.run(
        app,
        host="0.0.0.0",
        port=_port,
        debug=False,
        use_reloader=False,
        allow_unsafe_werkzeug=True,
    )
