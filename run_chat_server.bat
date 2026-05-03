@echo off
cd /d "%~dp0"
py chat_server.py
if errorlevel 1 pause
