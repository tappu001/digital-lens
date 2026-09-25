@echo off
cd /d "%~dp0"
title Uninstall Digital Lens App Inspector
if exist ".venv\Scripts\python.exe" ".venv\Scripts\python.exe" run_agent.py --uninstall
echo.
echo   The desktop icon was removed and Digital Lens was stopped.
echo   You can now delete this folder.
pause
