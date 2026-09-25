@echo off
setlocal
cd /d "%~dp0"
set "DL_DIR=%CD%"
title Install Digital Lens App Inspector
echo.
echo   Installing Digital Lens App Inspector - one time only.
echo   This takes about 2 to 5 minutes. Please keep this window open.
echo.

rem ---------- 1. Python ----------
echo [1/4] Checking Python...
set "PY="
set "PYPATH="
where py >nul 2>nul && set "PY=py -3"
if not defined PY python --version >nul 2>nul && set "PY=python"
if defined PY goto :venv
echo       Python not found. Installing Python 3.12 with winget...
winget install -e --id Python.Python.3.12 --scope user --silent --accept-package-agreements --accept-source-agreements
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "PYPATH=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if defined PYPATH goto :venv
echo.
echo   Could not install Python automatically.
echo   Install it from https://www.python.org/downloads/ - tick "Add python.exe to PATH" -
echo   then run this installer again.
pause
exit /b 1

rem ---------- 2. mitmproxy ----------
:venv
echo [2/4] Installing the Digital Lens engine - mitmproxy...
if exist ".venv\Scripts\python.exe" goto :pip
if defined PYPATH "%PYPATH%" -m venv .venv
if not defined PYPATH %PY% -m venv .venv
if not exist ".venv\Scripts\python.exe" goto :fail
:pip
".venv\Scripts\python.exe" -m pip install -q --disable-pip-version-check --upgrade pip setuptools wheel
".venv\Scripts\python.exe" -m pip install -q --disable-pip-version-check -r requirements.txt
if errorlevel 1 goto :fail

rem ---------- 3. adb ----------
echo [3/4] Checking Android tools - adb...
set "ADBOK="
where adb >nul 2>nul && set "ADBOK=1"
if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" set "ADBOK=1"
if exist "platform-tools\adb.exe" set "ADBOK=1"
if defined ADBOK goto :autostart
echo       Downloading Android platform-tools from Google...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; $z=Join-Path $env:TEMP 'dl-platform-tools.zip'; Invoke-WebRequest -UseBasicParsing 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip' -OutFile $z; Expand-Archive -Force $z $env:DL_DIR"
if not exist "platform-tools\adb.exe" echo       WARNING: adb could not be downloaded. Install Android platform-tools manually.

rem ---------- 4. desktop icon ----------
:autostart
echo [4/4] Creating the desktop icon...
".venv\Scripts\python.exe" run_agent.py --install
start "" wscript.exe "%DL_DIR%\Open App Inspector.vbs"
echo.
echo   Done! App Inspector is opening in your browser.
echo.
echo   From now on:
echo     - Double-click the "Digital Lens App Inspector" icon on your desktop.
echo       It runs hidden - no black window - and opens App Inspector.
echo     - Just plug in your phone. Everything else is automatic.
echo.
pause
exit /b 0

:fail
echo.
echo   Installation failed. Check the internet connection and run this installer again.
pause
exit /b 1
