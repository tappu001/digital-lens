@echo off
setlocal
cd /d "%~dp0"
title Digital Lens App Inspector
rem Runs Digital Lens with a visible window (useful for troubleshooting).
rem For everyday use, run "Install Digital Lens.bat" once and use the desktop icon.
if not exist ".venv\Scripts\python.exe" (
  echo Digital Lens is not installed yet. Running the installer...
  call "Install Digital Lens.bat"
  exit /b
)
echo.
echo   Digital Lens App Inspector: http://127.0.0.1:8088
echo   Press Ctrl+C to stop - the phone's normal internet is restored.
echo.
".venv\Scripts\python.exe" run_agent.py --open
