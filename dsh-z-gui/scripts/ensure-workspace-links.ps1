# Fix dsh-runtime node_modules link layout.
# pnpm deploy uses Junctions (Windows) into the .pnpm virtual store; if top-level
# links are missing or were replaced by plain dirs, package deps fail to resolve.
# This script: remove top-level plain dirs -> re-link Junctions to .pnpm entities ->
# for true peer packages absent from .pnpm, copy the workspace build output.
$ErrorActionPreference = "Stop"

$Root = "d:\sourceCode\ai-app\dsh-d"
$Harness = Join-Path $Root "deepseek-harness"
$Runtime = Join-Path $Root "dsh-z-gui\app\dsh-runtime"
$nm = Join-Path $Runtime "node_modules"
$scopeDir = Join-Path $nm "@deepseek-ai"
$pnpmDir = Join-Path $nm ".pnpm"

# 1) Remove top-level plain dirs (non-link)
$removed = @()
foreach ($item in Get-ChildItem $scopeDir -Directory -ErrorAction SilentlyContinue) {
    if ((Get-Item $item.FullName).LinkType) { continue }
    Remove-Item $item.FullName -Recurse -Force
    $removed += $item.Name
}
Write-Host "Removed top-level dirs: $($removed.Count)"

# Collect workspace package dirs
$wsDirs = @()
foreach ($d in Get-ChildItem "$Harness\vendor" -Directory) { $wsDirs += $d.FullName }
foreach ($group in Get-ChildItem "$Harness\packages" -Directory) {
    foreach ($pkg in Get-ChildItem $group.FullName -Directory) { $wsDirs += $pkg.FullName }
}
foreach ($app in Get-ChildItem "$Harness\apps" -Directory) { $wsDirs += $app.FullName }

$excludeNames = @('src', 'tests', 'test', 'node_modules', '.dsh-build', 'dist-src')
$createdLink = 0; $createdCopy = 0
foreach ($dir in $wsDirs) {
    $pj = Join-Path $dir "package.json"
    if (-not (Test-Path $pj)) { continue }
    try { $name = (Get-Content $pj -Raw | ConvertFrom-Json).name } catch { continue }
    if (-not $name -or $name -notlike "@deepseek-ai/*") { continue }
    $short = $name -replace '^@deepseek-ai/', ''
    $target = Join-Path $scopeDir $short
    if (Test-Path $target) { continue }

    # Prefer Junction into the .pnpm entity (keeps its dep context)
    $entity = Get-ChildItem $pnpmDir -Directory -Filter "@deepseek-ai+$short@*" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($entity) {
        $entityTarget = Join-Path $entity.FullName "node_modules\@deepseek-ai\$short"
        if (Test-Path $entityTarget) {
            New-Item -ItemType Junction -Path $target -Target $entityTarget | Out-Null
            $createdLink++
            continue
        }
    }

    # True peer missing from .pnpm: copy build output (simple deps resolve from top level)
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    Copy-Item $pj "$target\package.json" -Force
    foreach ($item in Get-ChildItem $dir -Force) {
        if ($excludeNames -contains $item.Name) { continue }
        if ($item.Name -like '*.map') { continue }
        Copy-Item $item.FullName $target -Recurse -Force
    }
    $createdCopy++
    Write-Host "Copied peer pkg: $name"
}
Write-Host "Re-linked Junctions: $createdLink, copied peers: $createdCopy"
