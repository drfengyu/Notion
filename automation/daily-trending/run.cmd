@echo off
REM Daily GitHub Trending Automation - Triggered by Windows Task Scheduler at 10:03
setlocal
chcp 65001 >nul

REM Add required tools to PATH
set "PATH=C:\Program Files\nodejs;C:\Users\Administrator\AppData\Roaming\npm;C:\Program Files\Git\cmd;C:\Python314;C:\Python314\Scripts;C:\Windows\System32;C:\Windows;%PATH%"

set "BASE=E:\Project\Github\Notion"
set "LOGDIR=%BASE%\automation\daily-trending\logs"

REM Get today's date yyyy-MM-dd
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "TODAY=%%i"

cd /d "%BASE%"

echo ================================================== >> "%LOGDIR%\%TODAY%.log"
echo [%DATE% %TIME%] Task started >> "%LOGDIR%\%TODAY%.log"

C:\Python314\python.exe "%BASE%\automation\daily-trending\daily_trending.py" >> "%LOGDIR%\%TODAY%.log" 2>&1

echo [%DATE% %TIME%] Task finished. Exit code=%ERRORLEVEL% >> "%LOGDIR%\%TODAY%.log"
endlocal
