# dsh-gui Windows 构建脚本。
# 流程：构建 deepseek-harness -> pnpm deploy 生成 dsh-runtime -> 注入 webhook 资源
#       -> 安装 Electron 依赖 -> electron-builder 打包 Windows 产物。
# 用法：powershell -ExecutionPolicy Bypass -File scripts/build-win.ps1 [-SkipHarnessBuild]
param(
    [switch]$SkipHarnessBuild
)
$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Harness = Join-Path $Root "deepseek-harness"
$NodeBin = Join-Path $Root ".tools\node-v24.20.0-win-x64"
$App = Join-Path $Root "dsh-z-gui\app"
$Runtime = Join-Path $App "dsh-runtime"
$WebhookSrc = Join-Path $Root "dsh-webhook-plugin"
$AppWebhook = Join-Path $App "webhook"

if (-not (Test-Path (Join-Path $NodeBin "node.exe"))) {
    throw "未找到便携 Node：$NodeBin。请先准备 Node 24 便携版。"
}
$env:PATH = "$NodeBin;$env:PATH"
$env:TMP = Join-Path $Root ".tools\tmp"
$env:TEMP = $env:TMP
$env:DSH_CLIENT_COMMIT_HASH = "a1b2c3d"

# 1) 构建 deepseek-harness（首次或产物缺失时）
$cliBin = Join-Path $Harness "apps\cli\lib\bin.js"
if (-not $SkipHarnessBuild -and -not (Test-Path $cliBin)) {
    Write-Host "[1/5] 构建 deepseek-harness ..."
    Push-Location $Harness
    pnpm run build
    if ($LASTEXITCODE -ne 0) { throw "deepseek-harness 构建失败" }
    Pop-Location
} else {
    Write-Host "[1/5] 复用已构建的 deepseek-harness 产物"
}

# 2) 生成 dsh-runtime（hoisted 实体布局，可分发）
Write-Host "[2/5] 生成 dsh-runtime ..."
if (Test-Path $Runtime) {
  $empty = Join-Path $Root ".tools\empty-runtime"
  New-Item -ItemType Directory -Force -Path $empty | Out-Null
  robocopy $empty $Runtime /MIR /XJ /NFL /NDL /NJH /NJS /NP | Out-Null
  Remove-Item $empty -Force
  Remove-Item $Runtime -Recurse -Force -ErrorAction SilentlyContinue
}
Push-Location $Harness
pnpm --filter @deepseek-ai/dsh deploy $Runtime --prod --legacy --config.node-linker=hoisted
if ($LASTEXITCODE -ne 0) { throw "pnpm deploy 失败" }
Pop-Location

# 2b) pnpm deploy 会在 harness/vendor 下残留幽灵目录 vendor/dsh-z-gui，必须清理，
#     否则 tsdown 会把它当 workspace 项目导致构建/运行时异常。
$ghost = Join-Path $Harness "vendor\dsh-z-gui"
if (Test-Path $ghost) { Remove-Item $ghost -Recurse -Force -ErrorAction SilentlyContinue }

# 3) 注入 webhook 资源：启用补丁 + 内置插件副本
Write-Host "[3/5] 注入 webhook 资源 ..."
Copy-Item (Join-Path $AppWebhook "webhook.cordis.yml") (Join-Path $Runtime "webhook.cordis.yml") -Force
$pluginTarget = Join-Path $Runtime "webhook-plugin"
New-Item -ItemType Directory -Force -Path (Join-Path $pluginTarget "lib") | Out-Null
Copy-Item (Join-Path $WebhookSrc "lib\index.js") (Join-Path $pluginTarget "lib\index.js") -Force
Copy-Item (Join-Path $WebhookSrc "package.json") (Join-Path $pluginTarget "package.json") -Force
Copy-Item (Join-Path $WebhookSrc "cordis.patch.yml") (Join-Path $pluginTarget "cordis.patch.yml") -Force
Write-Host "    dsh-runtime: $Runtime"

# 3b) 补齐 dsh-runtime 依赖闭包（hoisted 布局：实体复制遗漏的 workspace 包与第三方依赖）
Write-Host "[3b] 补齐依赖闭包 ..."
python (Join-Path $PSScriptRoot "ensure-portable-closure.py") $Root
if ($LASTEXITCODE -ne 0) { throw "依赖闭包补齐失败" }

# 4) 安装 Electron 应用依赖
Write-Host "[4/5] 安装 Electron 依赖 ..."
Push-Location $App
npm install
if ($LASTEXITCODE -ne 0) { throw "app 依赖安装失败" }
Pop-Location

# 5) 手动绿色版打包（移动 dsh-runtime + 重定向 junction）
Write-Host "[5/5] 打包 Windows 绿色版 ..."
powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "package-win.ps1")
if ($LASTEXITCODE -ne 0) { throw "打包失败" }

Write-Host "完成。产物位于 $App\release\dsh-gui-win-x64"
