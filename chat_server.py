from __future__ import annotations

import eventlet
eventlet.monkey_patch()

import os
import re
import time
from pathlib import Path
from datetime import datetime
from typing import Dict, List

from flask import Flask, abort, request, send_from_directory
from flask_socketio import SocketIO
from eventlet.semaphore import Semaphore

BASE_DIR = Path(__file__).resolve().parent

app = Flask(__name__, static_folder=str(BASE_DIR), static_url_path="")
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY") or "dev-change-in-production"

_cors_raw = os.environ.get("SOCKETIO_CORS_ORIGINS", "*").strip()
_cors_allowed = "*" if _cors_raw == "*" else [x.strip() for x in _cors_raw.split(",") if x.strip()] or "*"

# ✅ eventlet mode
socketio = SocketIO(app, cors_allowed_origins=_cors_allowed, async_mode="eventlet")

# ✅ eventlet-safe lock
_lock = Semaphore()

sid_to_label: dict[str, str] = {}
num_to_sid: dict[int, str] = {}

last_message_sid: str | None = None

user_sessions: Dict[str, Dict] = {}
admin_sessions: List[str] = []
user_to_chat: Dict[str, str] = {}
typing_users: Dict[str, float] = {}


# ---------------- ROUTES ----------------

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


# ---------------- HELPERS ----------------

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


# ---------------- SOCKET EVENTS ----------------

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
    drop_client(request.sid)


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


# ---------------- BACKGROUND TASK ----------------

def cleanup_typing_indicators():
    while True:
        socketio.sleep(5)  # ✅ вместо time.sleep
        now = time.time()

        with _lock:
            expired = [sid for sid, ts in typing_users.items() if now - ts > 10]
            for sid in expired:
                typing_users.pop(sid, None)


# старт через socketio (ВАЖНО)
socketio.start_background_task(cleanup_typing_indicators)


# ---------------- MAIN ----------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))

    socketio.run(
        app,
        host="0.0.0.0",
        port=port
    )
