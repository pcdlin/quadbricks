@echo off
rem Serve the browser game from game/ and open it in the default browser.
rem Close the "Quadbricks web server" window (or press Ctrl+C in it) to stop the server.

setlocal
set PORT=8123
set URL=http://localhost:%PORT%

cd /d "%~dp0"

rem Start the server in its own window so its log stays visible and it can be stopped.
start "Quadbricks web server" cmd /k python -m http.server %PORT% --directory game

rem Give the server a moment to bind the port before the browser requests the page.
ping -n 3 127.0.0.1 >nul

start "" "%URL%"
endlocal
