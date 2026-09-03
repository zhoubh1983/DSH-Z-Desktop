# 补齐 dsh-runtime 中缺失的 @deepseek-ai/* workspace 包。
# pnpm deploy --prod 不解析 peerDependencies，导致部分运行时被 import 的包缺失；
# 本脚本扫描 workspace 并复制缺失包的构建产物（lib、package.json、patch、dist 等）。
$ErrorActionPreference = "Stop"

$Root = "d:\sourceCode\ai-app\dsh-d"
$Harness = Join-Path $Root "deepseek-harness"
$Runtime = Join-Path $Root "dsh-z-gui\app\dsh-runtime"

$wsDirs = @()
foreach ($d in Get-ChildItem "$Harness\vendor" -Directory) { $wsDirs += $d.FullName }
foreach ($group in Get-ChildItem "$Harness\packages" -Directory) {
    foreach ($pkg in Get-ChildItem $group.FullName -Directory) { $wsDirs += $pkg.FullName }
}
foreach ($app in Get-ChildItem "$Harness\apps" -Directory) { $wsDirs += $app.FullName }

$excludeNames = @('src', 'tests', 'test', 'node_modules', '.dsh-build', 'dist-src')
$copied = @()
foreach ($dir in $wsDirs) {
    $pj = Join-Path $dir "package.json"
    if (-not (Test-Path $pj)) { continue }
    try { $name = (Get-Content $pj -Raw | ConvertFrom-Json).name } catch { continue }
    if (-not $name -or $name -notlike "@deepseek-ai/*") { continue }
    $short = $name -replace '^@deepseek-ai/', ''
    $target = Join-Path $Runtime "node_modules\@deepseek-ai\$short"
    if (Test-Path $target) { continue }
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    Copy-Item $pj "$target\package.json" -Force
    foreach ($item in Get-ChildItem $dir -Force) {
        if ($excludeNames -contains $item.Name) { continue }
        if ($item.Name -like '*.map') { continue }
        Copy-Item $item.FullName $target -Recurse -Force
    }
    $copied += $name
    Write-Host "补齐: $name"
}
Write-Host "补齐完成，共 $($copied.Count) 个包"
