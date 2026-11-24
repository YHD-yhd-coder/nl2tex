@echo off
setlocal
cd /d "%~dp0"
title nl2tex

echo.
echo   nl2tex - natural language / screenshots  ->  LaTeX
echo   ---------------------------------------------------
echo.

if not exist "%~dp0node.exe" (
  echo   [ERROR] node.exe is missing.
  echo   You probably opened this file from inside the zip.
  echo   Please EXTRACT the whole zip to a folder first,
  echo   then double-click start.cmd there.
  echo.
  pause
  exit /b 1
)

if not exist "%~dp0server.mjs" (
  echo   [ERROR] server.mjs is missing. Please extract the whole zip.
  echo.
  pause
  exit /b 1
)

echo   Starting http://127.0.0.1:8777
echo   The browser will open in a few seconds.
echo   Close this window to stop the server.
echo.

start "" cmd /c "timeout /t 2 >nul & start http://127.0.0.1:8777"
"%~dp0node.exe" server.mjs

echo.
echo   Server stopped. If this happened immediately,
echo   the port 8777 may already be used by another program.
echo   Press any key to close.
pause >nul
