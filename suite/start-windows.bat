@echo off
setlocal
cd /d "%~dp0"
title Digital Lens App Inspector
rem Digital Lens(TM) App Inspector - Windows launcher.
rem Sets up Python + mitmproxy (first run only), starts the proxy, connects the phone over USB
rem and opens http://127.0.0.1:8088. Press Ctrl+C to stop; the phone's normal internet is restored.

set "PY=python"
where py >nul 2>nul && set "PY=py -3"
if not exist ".venv\Scripts\python.exe" goto :makevenv
goto :install

:makevenv
echo Setting up the Python environment - first run only...
%PY% -m venv .venv
if errorlevel 1 goto :nopython

:install
call ".venv\Scripts\activate.bat"
echo Installing / checking mitmproxy - first run takes 1 to 5 minutes, no output while downloading...
python -m pip install -q --disable-pip-version-check --upgrade pip setuptools wheel
python -m pip install -q --disable-pip-version-check -r requirements.txt
if errorlevel 1 goto :pipfail

where adb >nul 2>nul
if errorlevel 1 if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" set "PATH=%LOCALAPPDATA%\Android\Sdk\platform-tools;%PATH%"
where adb >nul 2>nul
if errorlevel 1 echo WARNING: adb was not found. Install Android platform-tools: https://developer.android.com/tools/releases/platform-tools
where adb >nul 2>nul && adb start-server >nul 2>nul

set "DL_MANAGE_PHONE=1"
start "" /b cmd /c "timeout /t 4 /nobreak >nul & start "" http://127.0.0.1:8088"
echo.
echo   Digital Lens App Inspector is starting: http://127.0.0.1:8088
echo   Press Ctrl+C to stop - the phone's normal internet is restored.
echo.
mitmdump -s suite_addon.py --listen-host 127.0.0.1 --listen-port 8080 --set flow_detail=0 --set termlog_verbosity=warn
goto :eof

:nopython
echo Python 3.10 or newer is required: https://www.python.org/downloads/
echo During setup, tick "Add python.exe to PATH".
pause
exit /b 1

:pipfail
echo Could not install mitmproxy. Check the internet connection and run this file again.
pause
exit /b 1
