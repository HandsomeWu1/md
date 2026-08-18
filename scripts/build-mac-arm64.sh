#!/usr/bin/env bash
# 在 macOS Apple Silicon 上构建未签名的 .dmg / .zip
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> 安装依赖"
npm install

echo "==> 构建渲染层 (Vite)"
npm run build:renderer

echo "==> 打包 macOS arm64 (.dmg + .zip，未签名)"
export CSC_IDENTITY_AUTO_DISCOVERY=false
npx electron-builder --mac --arm64

echo "==> 完成，产物在 ./release 目录"
