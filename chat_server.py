from __future__ import annotations

import eventlet
eventlet.monkey_patch()

import os
import re
import threading
import time
import json
from pathlib import Path
from datetime import datetime
from typing import Dict, List

from flask import Flask, abort, request, send_from_directory
from flask_socketio import SocketIO

BASE_DIR = Path(__file__).resolve().parent

app = Flask(__name__, static_folder=str(BASE_DIR), static_url_path="")
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY") or "dev-change-in-production"

_cors_raw = os.environ.get("SOCKETIO_CORS_ORIGINS", "*").strip()
if _cors_raw == "*":
    _cors_allowed = "*"
else:
    _cors_allowed = [x.strip() for x in _cors_raw.split(",") if x.strip()] or "*"

# ❗ УБРАЛ async_mode="threading"
socketio = SocketIO(app, cors_allowed_origins=_cors_allowed)

_lock = threading.Lock()
sid_to_label: dict[str, str] = {}
num_to_sid: dict[int, str] = {}
last_message_sid: str | None = None

user_sessions: Dict[str, Dict] = {}
admin_sessions: List[str] = []
active_chats: Dict[str, Dict] = {}
user_to_chat: Dict[str, str] = {}
typing_users: Dict[str, float] = {}


@app.get("/health")
def health():
    return {"status": "ok"}, 200


@app.get("/")
def serve_root():
    return send_from_directory(BASE_DIR, "index.html")


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

        admin_sessions[:] = [a for a in admin_sessions if a != sid]
        user_sessions.pop(sid, None)
        user_to_chat.pop(sid, None)
        typing_users.pop(sid, None)


@socketio.on("connect")
def on_connect():
    sid = request.sid
    label = assign_label(sid)
    print(f"[CONNECT] {label}", flush=True)

    with _lock:
        user_sessions[sid] = {
            "userId": sid,
            "userName": label,
            "userAvatar": label[0],
        }


@socketio.on("disconnect")
def on_disconnect():
    sid = request.sid
    drop_client(sid)


@socketio.on("chat_message")
def on_chat_message(data):
    global last_message_sid

    sid = request.sid
    label = sid_to_label.get(sid, sid)

    message_text = (data or {}).get("text", "")

    with _lock:
        last_message_sid = sid

    print(f"[{label}] {message_text}", flush=True)


@socketio.on("admin_connect")
def on_admin_connect():
    sid = request.sid
    with _lock:
        if sid not in admin_sessions:
            admin_sessions.append(sid)


@socketio.on("user_connect")
def on_user_connect(data):
    sid = request.sid
    label = sid_to_label.get(sid, sid)

    with _lock:
        user_sessions[sid] = {
            "userId": sid,
            "userName": label,
        }


def cleanup_typing_indicators():
    while True:
        time.sleep(5)
        with _lock:
            now = time.time()
            expired = [sid for sid, ts in typing_users.items() if now - ts > 10]
            for sid in expired:
                typing_users.pop(sid, None)


# ✅ ЗАПУСК ФОНОВОГО ПОТОКА (ВАЖНО ДЛЯ RENDER)
threading.Thread(target=cleanup_typing_indicators, daemon=True).start()


# ❗ ОСТАВИЛ, НО ОТКЛЮЧИЛ (НЕ РАБОТАЕТ НА ХОСТИНГЕ)
def terminal_reply_loop():
    if os.environ.get("ENABLE_TERMINAL") != "1":
        return
    while True:
        try:
            line = input()
        except:
            break


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))

    # локально можно включить
    threading.Thread(target=terminal_reply_loop, daemon=True).start()

    socketio.run(app, host="0.0.0.0", port=port)
