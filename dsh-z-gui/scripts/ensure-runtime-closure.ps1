# Build a complete runtime closure for dsh-runtime.
# pnpm deploy --prod misses web-profile workspace packages and their third-party
# deps. This script BFS-copies only what is missing:
#   - workspace packages  -> .pnpm/node_modules/@deepseek-ai/<pkg> (real dir),
#                            then a top-level Junction so resolution works.
#   - third-party deps    -> .pnpm/node_modules/<pkg> (real dir) copied from the
#                            original harness store (entity-expanded).
$ErrorActionPreference = "Stop"

$Root = "d:\sourceCode\ai-app\dsh-d"
$Harness = Join-Path $Root "deepseek-harness"
$Runtime = Join-Path $Root "dsh-z-gui\app\dsh-runtime"
$nm = Join-Path $Runtime "node_modules"
$scopeDir = Join-Path $nm "@deepseek-ai"
$pnpmDir = Join-Path $nm ".pnpm"
$vdir = Join-Path $pnpmDir "node_modules"
$hvdir = Join-Path $Harness "node_modules\.pnpm\node_modules"

# 1) Remove any top-level plain dirs (non-links) we may have copied earlier
foreach ($item in Get-ChildItem $scopeDir -Directory -ErrorAction SilentlyContinue) {
    if ((Get-Item $item.FullName).LinkType) { continue }
    Remove-Item $item.FullName -Recurse -Force
}

# 1b) Remove dangling top-level junctions (target missing) so they re-enter closure
$removedDangling = @()
foreach ($item in Get-ChildItem $scopeDir -Directory -ErrorAction SilentlyContinue) {
    $li = Get-Item $item.FullName -Force
    if ($li.LinkType -and (-not (Test-Path $li.Target))) {
        Remove-Item $item.FullName -Recurse -Force -ErrorAction SilentlyContinue
        $removedDangling += $item.Name
    }
}
Write-Host "Removed dangling junctions: $($removedDangling.Count)"

# Collect workspace package dirs by package name
$wsByName = @{}
foreach ($d in (Get-ChildItem "$Harness\vendor" -Directory) + (Get-ChildItem "$Harness\apps" -Directory)) {
    $pj = Join-Path $d.FullName "package.json"
    if (-not (Test-Path $pj)) { continue }
    try { $name = (Get-Content $pj -Raw | ConvertFrom-Json).name } catch { continue }
    if ($name) { $wsByName[$name] = $d.FullName }
}
foreach ($group in Get-ChildItem "$Harness\packages" -Directory) {
    foreach ($pkg in Get-ChildItem $group.FullName -Directory) {
        $pj = Join-Path $pkg.FullName "package.json"
        if (-not (Test-Path $pj)) { continue }
        try { $name = (Get-Content $pj -Raw | ConvertFrom-Json).name } catch { continue }
        if ($name) { $wsByName[$name] = $pkg.FullName }
    }
}

# 2) Copy one workspace package into the virtual flat area and link it
function Ensure-WorkspacePackage([string]$name) {
    if (-not $wsByName.ContainsKey($name)) { return }
    $short = $name -replace '^@deepseek-ai/', ''
    $top = Join-Path $scopeDir $short
    # Top-level must exist as a valid junction; otherwise (re)build it.
    if (Test-Path $top) {
        $li = Get-Item $top -Force
        if ($li.LinkType -and (Test-Path $li.Target)) { return }
        Remove-Item $top -Recurse -Force -ErrorAction SilentlyContinue
    }
    $vPkg = Join-Path $vdir "@deepseek-ai\$short"
    if (-not (Test-Path $vPkg)) {
        $src = $wsByName[$name]
        New-Item -ItemType Directory -Force -Path $vPkg | Out-Null
        Copy-Item (Join-Path $src "package.json") (Join-Path $vPkg "package.json") -Force
        foreach ($item in Get-ChildItem $src -Force) {
            if ($item.Name -in @('src','tests','test','node_modules','.dsh-build')) { continue }
            if ($item.Name -like '*.map') { continue }
            Copy-Item $item.FullName $vPkg -Recurse -Force
        }
    }
    New-Item -ItemType Junction -Path $top -Target $vPkg -ErrorAction Stop | Out-Null
}

# 3) Copy a third-party package (entity-expanded) into the virtual flat area
function Ensure-ThirdPartyPackage([string]$name) {
    if ($name -like '@deepseek-ai/*') { Ensure-WorkspacePackage $name; return }
    $dest = Join-Path $vdir $name
    if (Test-Path $dest) { return }
    # locate entity in harness .pnpm: .pnpm/node_modules/<name> junction target
    $href = Join-Path $hvdir $name
    if (-not (Test-Path $href)) { return }
    $item = Get-Item $href -Force
    $target = $item.Target
    if (-not $target) { $target = $href }
    New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
    Copy-Item $target $dest -Recurse -Force
}

# 4) Read all deps (dependencies + peerDependencies) of a manifest, queue missing
function Get-DepsOf([string]$pkgJsonPath) {
    try {
        $j = Get-Content $pkgJsonPath -Raw | ConvertFrom-Json
        $keys = @()
        if ($j.dependencies) { $keys += @($j.dependencies.PSObject.Properties.Name) }
        if ($j.peerDependencies) { $keys += @($j.peerDependencies.PSObject.Properties.Name) }
        return $keys
    } catch { return @() }
}

# Whether a workspace package's top-level link is missing or dangling
function Test-TopNeedsFix([string]$name) {
    $top = Join-Path $scopeDir ($name -replace '^@deepseek-ai/', '')
    if (-not (Test-Path $top)) { return $true }
    $li = Get-Item $top -Force
    if (-not $li.LinkType) { return $true }
    return -not (Test-Path $li.Target)
}

# 5) BFS: seed with every workspace package so the whole dependency graph is
#    traversed (a deployed package's missing deps must also be discovered)
$queue = [System.Collections.Generic.Queue[string]]::new()
foreach ($name in $wsByName.Keys) { $queue.Enqueue($name) }

$seen = @{}
while ($queue.Count -gt 0) {
    $name = $queue.Dequeue()
    if ($seen.ContainsKey($name)) { continue }
    $seen[$name] = $true
    if ($name -like '@deepseek-ai/*') {
        $short = $name -replace '^@deepseek-ai/', ''
        $vPkg = Join-Path $vdir "@deepseek-ai\$short"
        Ensure-WorkspacePackage $name
        if (Test-Path $vPkg) { Write-Host "Workspace: $name" }
        $pkgJson = Join-Path $vPkg "package.json"
        if (-not (Test-Path $pkgJson)) { continue }
        foreach ($dep in (Get-DepsOf $pkgJson)) {
            if ($dep -like '@deepseek-ai/*') {
                if (-not (Test-TopNeedsFix $dep)) { continue }
            } else {
                if (Test-Path (Join-Path $vdir $dep)) { continue }
            }
            $queue.Enqueue($dep)
        }
    } else {
        $dest = Join-Path $vdir $name
        if (-not (Test-Path $dest)) {
            Ensure-ThirdPartyPackage $name
            if (Test-Path $dest) { Write-Host "ThirdParty: $name" } else { continue }
        }
        $pkgJson = Join-Path $dest "package.json"
        if (-not (Test-Path $pkgJson)) { continue }
        foreach ($dep in (Get-DepsOf $pkgJson)) {
            $t = Join-Path $vdir $dep
            if (-not (Test-Path $t)) { $queue.Enqueue($dep) }
        }
    }
}
Write-Host "Closure complete. Processed $($seen.Count) packages."
