@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [nl2tex] 没有找到 Node.js
  echo  请先安装：https://nodejs.org/  ^(选 LTS^)
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo  [nl2tex] 首次运行，正在安装依赖...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo  [nl2tex] 依赖安装失败
    pause
    exit /b 1
  )
)

echo.
echo  [nl2tex] 正在启动 http://127.0.0.1:8777
echo  关闭这个窗口即停止服务
echo.
start "" http://127.0.0.1:8777
node server.mjs
pause
