@echo off
rem Run local HTTP server and open default browser to the game page

:: Change working directory to the script location
cd /d "%~dp0"

:: Try to use python or py. If neither exists, show message.
where python >nul 2>&1
if %ERRORLEVEL%==0 (
  set PYCMD=python
) else (
  where py >nul 2>&1
  if %ERRORLEVEL%==0 (
    set PYCMD=py
  ) else (
    echo Python not found in PATH. Install Python or run the server manually.
    pause
    exit /b 1
  )
)

:: Start server in a new window and keep it open
start "Lumendria Server" cmd /k "%PYCMD% -m http.server 8000"

:: Give the server a moment to start
timeout /t 1 >nul 2>&1

:: Open default browser to the game page
start "" "http://localhost:8000/index.html"

:: Optional: exit this launcher window
exit /b 0