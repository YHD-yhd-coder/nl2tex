#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "没有找到 Node.js，请先安装：https://nodejs.org/（选 LTS）"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "首次运行，正在安装依赖..."
  npm install --no-audit --no-fund
fi

echo "正在启动 http://127.0.0.1:8777"
( sleep 1; open http://127.0.0.1:8777 2>/dev/null || xdg-open http://127.0.0.1:8777 2>/dev/null || true ) &
exec node server.mjs
