#!/usr/bin/env bash
# dsh-gui Linux 绿色版打包脚本。
# 流程：构建 harness -> deploy dsh-runtime（hoisted 实体布局）-> 注入 webhook ->
#       实体化闭包补齐 -> 复制 Electron + 壳 + dsh-runtime。
# 产出 release/dsh-gui-linux-x64/ 可直接运行（./DSH Desktop）。
# 需在 Linux 上执行（Node >=22.19、pnpm 11.7、python3；npm/pnpm 走 npmmirror 加速）。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HARNESS="$ROOT/deepseek-harness"
APP="$ROOT/dsh-z-gui/app"
RUNTIME="$APP/dsh-runtime"
WEBHOOK_SRC="$ROOT/dsh-webhook-plugin"
APP_WEBHOOK="$APP/webhook"
OUT="$APP/release/dsh-gui-linux-x64"
OUT_RUNTIME="$OUT/resources/dsh-runtime"

# --- 工具链查找：优先使用 .tools 下的便携 Node/pnpm ---
if [ -d "$ROOT/.tools" ]; then
  NODE_BIN="$(find "$ROOT/.tools" -maxdepth 2 -name node -type f 2>/dev/null | head -n1)"
  if [ -n "$NODE_BIN" ]; then export PATH="$(dirname "$NODE_BIN"):$PATH"; fi
fi
command -v node >/dev/null || { echo "缺少 node (>=22.19)"; exit 1; }
command -v pnpm >/dev/null || { echo "缺少 pnpm (11.7)"; exit 1; }
command -v python3 >/dev/null || { echo "缺少 python3"; exit 1; }

export DSH_CLIENT_COMMIT_HASH="a1b2c3d"
export TMPDIR="${TMPDIR:-$ROOT/.tools/tmp}"; mkdir -p "$TMPDIR"
# npm/pnpm/electron 国内镜像加速（可按需调整）
npm config set registry https://registry.npmmirror.com 2>/dev/null || true
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
export ELECTRON_CACHE="$ROOT/.tools/electron-cache"

# --- 1. 构建 harness（首次或产物缺失） ---
if [ ! -f "$HARNESS/apps/cli/lib/bin.js" ]; then
  echo "[1/6] 构建 deepseek-harness ..."
  ( cd "$HARNESS" && pnpm install && pnpm run build )
else
  echo "[1/6] 复用已构建的 deepseek-harness（如需重新构建请删除 apps/cli/lib）"
fi

# --- 2. 生成 dsh-runtime（hoisted 实体布局） ---
echo "[2/6] 生成 dsh-runtime ..."
rm -rf "$RUNTIME"
( cd "$HARNESS" && pnpm --filter @deepseek-ai/dsh deploy "$RUNTIME" --prod --legacy --config.node-linker=hoisted )

# --- 2b. 清理 deploy 在 vendor 下残留的幽灵目录 ---
rm -rf "$HARNESS/vendor/dsh-z-gui"

# --- 3. 注入 webhook 资源 ---
echo "[3/6] 注入 webhook 资源 ..."
cp "$APP_WEBHOOK/webhook.cordis.yml" "$RUNTIME/webhook.cordis.yml"
mkdir -p "$RUNTIME/webhook-plugin/lib"
cp "$WEBHOOK_SRC/lib/index.js" "$RUNTIME/webhook-plugin/lib/index.js"
cp "$WEBHOOK_SRC/package.json" "$RUNTIME/webhook-plugin/package.json"
cp "$WEBHOOK_SRC/cordis.patch.yml" "$RUNTIME/webhook-plugin/cordis.patch.yml"

# --- 4. 实体化闭包补齐（hoisted 布局下把遗漏包实体复制到顶层） ---
echo "[4/6] 补齐依赖闭包 ..."
python3 "$ROOT/dsh-z-gui/scripts/ensure-portable-closure.py" "$ROOT"

# --- 5. 安装 Electron 依赖（Linux 版） ---
echo "[5/6] 安装 Electron 依赖 ..."
( cd "$APP" && npm install )

# --- 6. 打包 ---
echo "[6/6] 打包 Linux 绿色版 ..."
rm -rf "$OUT"; mkdir -p "$OUT"
ELECTRON_DIST="$APP/node_modules/electron/dist"
if [ ! -f "$ELECTRON_DIST/electron" ]; then
  echo "未找到 Linux 版 Electron，请在 Linux 上执行：cd $APP && npm install"
  exit 1
fi
cp -a "$ELECTRON_DIST/." "$OUT/"
# 重命名可执行文件
if [ -f "$OUT/electron" ]; then mv "$OUT/electron" "$OUT/DSH Desktop"; fi
# 壳应用
mkdir -p "$OUT/resources/app/main" "$OUT/resources/app/preload"
cp -a "$APP/main/." "$OUT/resources/app/main/"
cp -a "$APP/preload/." "$OUT/resources/app/preload/"
cp "$APP/package.json" "$OUT/resources/app/package.json"
# dsh-runtime：实体布局直接复制（无需符号链接重定向）
cp -a "$RUNTIME" "$OUT_RUNTIME"
chmod +x "$OUT_RUNTIME/lib/bin.js" 2>/dev/null || true

echo "完成。Linux 绿色版位于：$OUT"
echo "运行：$OUT/DSH Desktop"
