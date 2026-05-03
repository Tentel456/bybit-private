#!/usr/bin/env python3
"""
Быстрый тест системы чата P2P
"""

import subprocess
import time
import webbrowser
import sys
import os

def check_dependencies():
    """Проверяем установлены ли зависимости"""
    try:
        import flask
        import flask_socketio
        print("✓ Зависимости установлены")
        return True
    except ImportError as e:
        print(f"✗ Ошибка: {e}")
        print("Установите зависимости: pip install -r requirements.txt")
        return False

def start_server():
    """Запускаем сервер чата"""
    print("Запуск сервера чата...")
    
    # Проверяем, что файл существует
    if not os.path.exists("chat_server.py"):
        print("✗ Файл chat_server.py не найден")
        return None
    
    # Запускаем сервер в отдельном процессе
    try:
        process = subprocess.Popen(
            [sys.executable, "chat_server.py"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            universal_newlines=True
        )
        
        # Даем серверу время на запуск
        time.sleep(3)
        
        # Проверяем, запустился ли процесс
        if process.poll() is not None:
            print("✗ Сервер не запустился")
            stdout, stderr = process.communicate()
            print(f"STDOUT: {stdout}")
            print(f"STDERR: {stderr}")
            return None
        
        print("✓ Сервер запущен на http://127.0.0.1:5000")
        return process
    except Exception as e:
        print(f"✗ Ошибка запуска сервера: {e}")
        return None

def open_browser_tabs():
    """Открываем вкладки браузера для тестирования"""
    urls = [
        "http://127.0.0.1:5000/test_chat.html",
        "http://127.0.0.1:5000/admin-chat.html",
        "http://127.0.0.1:5000/order-room.html"
    ]
    
    print("Открываю тестовые страницы в браузере...")
    
    for url in urls:
        try:
            webbrowser.open_new_tab(url)
            print(f"✓ Открыта: {url}")
            time.sleep(1)  # Небольшая задержка между открытием вкладок
        except Exception as e:
            print(f"✗ Не удалось открыть {url}: {e}")

def main():
    """Основная функция"""
    print("=" * 50)
    print("Быстрый тест системы чата P2P")
    print("=" * 50)
    
    # Проверяем зависимости
    if not check_dependencies():
        return
    
    # Запускаем сервер
    server_process = start_server()
    if not server_process:
        return
    
    try:
        # Открываем браузер
        open_browser_tabs()
        
        print("\n" + "=" * 50)
        print("Инструкции по тестированию:")
        print("1. В test_chat.html:")
        print("   - Левая панель: нажмите 'Подключиться как пользователь'")
        print("   - Правая панель: нажмите 'Подключиться как админ'")
        print("   - Отправьте сообщение из левой панели")
        print("   - Увидьте сообщение в правой панели")
        print("   - Ответьте из правой панели")
        print("2. В admin-chat.html: просмотрите список активных чатов")
        print("3. В order-room.html: проверьте работу существующего чата")
        print("\nДля остановки сервера нажмите Ctrl+C")
        print("=" * 50)
        
        # Ждем завершения (по Ctrl+C)
        while True:
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("\n\nОстановка сервера...")
        server_process.terminate()
        server_process.wait()
        print("Сервер остановлен")
    except Exception as e:
        print(f"\nОшибка: {e}")
        server_process.terminate()

if __name__ == "__main__":
    main()