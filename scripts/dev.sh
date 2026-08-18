#!/usr/bin/env bash
# 本地开发：Vite dev server + Electron 热更新
set -euo pipefail
cd "$(dirname "$0")/.."

npm install
npm run dev
