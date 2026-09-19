@echo off
REM Daily GitHub Trending Automation (fallback) - Triggered by Windows Task Scheduler at 13:03
REM NOTE: keep this file ASCII-only. Non-ASCII bytes shred batch parsing under codepage mismatch.
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

REM --- Proxy self-check ---
REM curl uses explicit -x socks5, which only needs the port listening; it does NOT
REM depend on v2rayN's system-proxy mode. Once the port is up we also set explicit
REM proxy env vars for this process so git push is independent of system proxy too.
set "PROXY_PORT=10808"
set "V2RAYN_EXE=E:\Download\v2rayN-master\v2rayN\v2rayN.Desktop\bin\Debug\net8.0\v2rayN.exe"

call :check_port
if %errorlevel% equ 0 goto proxy_ready

echo [%DATE% %TIME%] Proxy port %PROXY_PORT% not listening, starting v2rayN >> "%LOGDIR%\%TODAY%.log"
if not exist "%V2RAYN_EXE%" goto no_v2rayn
start "" /min "%V2RAYN_EXE%"
set /a WAIT=0

:wait_proxy
ping -n 2 -w 1000 127.0.0.1 >nul
set /a WAIT+=1
call :check_port
if %errorlevel% equ 0 goto proxy_ready
if %WAIT% lss 30 goto wait_proxy
goto proxy_unavailable

:no_v2rayn
echo [%DATE% %TIME%] v2rayN.exe not found, skip auto-start >> "%LOGDIR%\%TODAY%.log"

:proxy_unavailable
echo [%DATE% %TIME%] WARN: proxy unavailable, fetch falls back to direct/WebSearch, push goes direct >> "%LOGDIR%\%TODAY%.log"
goto proxy_done

:proxy_ready
set "http_proxy=socks5h://127.0.0.1:%PROXY_PORT%"
set "https_proxy=socks5h://127.0.0.1:%PROXY_PORT%"
echo [%DATE% %TIME%] Proxy port %PROXY_PORT% ready, fetch and push go via proxy >> "%LOGDIR%\%TODAY%.log"

:proxy_done
C:\Python314\python.exe "%BASE%\automation\daily-trending\daily_trending.py" >> "%LOGDIR%\%TODAY%.log" 2>&1

echo [%DATE% %TIME%] Task finished. Exit code=%ERRORLEVEL% >> "%LOGDIR%\%TODAY%.log"
endlocal
exit /b 0

:check_port
netstat -ano | findstr ":%PROXY_PORT% " | findstr "LISTENING" >nul
exit /b %errorlevel%
