# Manual portable packaging for Windows (avoids electron-builder sandbox conflicts
# and keeps dsh-runtime's pnpm junction layout to avoid entity-expansion blowup).
# Flow: copy Electron runtime -> write Electron shell app -> move dsh-runtime into
# resources -> rewrite junctions to the new location.
# Output: release\dsh-gui-win-x64\ (runnable DSH Desktop.exe).
$ErrorActionPreference = "Stop"

$Root = "d:\sourceCode\ai-app\dsh-d"
$App = Join-Path $Root "dsh-z-gui\app"
$Runtime = Join-Path $App "dsh-runtime"
$EDist = Join-Path $App "node_modules\electron\dist"
$Out = Join-Path $App "release\dsh-gui-win-x64"
$OutRuntime = Join-Path $Out "resources\dsh-runtime"

if (-not (Test-Path "$EDist\electron.exe")) { throw "Electron binary missing: $EDist" }
if (-not (Test-Path "$Runtime\lib\bin.js")) { throw "dsh-runtime missing: $Runtime (run build-win.ps1 or deploy first)" }

Write-Host "[1/4] Cleaning output dir ..."
if (Test-Path $Out) { Remove-Item $Out -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Force -Path $Out | Out-Null

Write-Host "[2/4] Copying Electron runtime ..."
Copy-Item "$EDist\*" $Out -Recurse -Force
if (Test-Path "$Out\electron.exe") { Rename-Item "$Out\electron.exe" "DSH Desktop.exe" }

Write-Host "[3/4] Writing Electron shell app (resources/app) ..."
New-Item -ItemType Directory -Force -Path "$Out\resources\app\main","$Out\resources\app\preload" | Out-Null
Copy-Item "$App\main\*" "$Out\resources\app\main\" -Recurse -Force
Copy-Item "$App\preload\*" "$Out\resources\app\preload\" -Recurse -Force
Copy-Item "$App\package.json" "$Out\resources\app\package.json" -Force

Write-Host "[4/4] Copying dsh-runtime (portable entity layout, no junctions) ..."
Copy-Item $Runtime "$Out\resources\dsh-runtime" -Recurse -Force

Write-Host "[4b] Copying builtin-plugins ..."
Copy-Item (Join-Path $App "builtin-plugins") "$Out\resources\builtin-plugins" -Recurse -Force

Write-Host "Done. Portable build at: $Out"
