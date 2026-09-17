<#
.SYNOPSIS
  Remove Windows junctions under the shared profile dependency dir
  (~/.dsh/profiles/node_modules).

.DESCRIPTION
  dsh-app-boot mirrors each installation's dependency closure into the shared
  ~/.dsh/profiles/node_modules using junctions. After switching between the
  dev build (npm start) and the packaged build (DSH Desktop.exe), leftover
  junctions point at the other runtime; the next boot's heal then tries to
  replace them with unlinkSync, which fails with EPERM on Windows directory
  junctions, crashing the dsh backend with exit code 1.

  This script recursively deletes every junction under that directory
  (link only - never follows into the target). The next dsh boot rebuilds
  them automatically against its own runtime.

.PARAMETER DshHome
  dsh data directory (default: $env:DSH_HOME or %USERPROFILE%\.dsh).

.PARAMETER DryRun
  Only list what would be deleted.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File dsh-z-gui/scripts/clean-profiles-junctions.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File dsh-z-gui/scripts/clean-profiles-junctions.ps1 -DryRun
#>
[CmdletBinding()]
param(
    [string]$DshHome = '',
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$dataDir = if ($DshHome) { $DshHome } elseif ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$root = Join-Path $dataDir 'profiles\node_modules'

if (-not (Test-Path $root)) {
    Write-Host "Shared dependency dir not found: $root (nothing to clean)"
    exit 0
}

Write-Host "Scanning junctions under $root ..."
$junctions = Get-ChildItem $root -Force -Recurse -ErrorAction SilentlyContinue |
    ForEach-Object {
        $i = Get-Item $_.FullName -Force -ErrorAction SilentlyContinue
        if ($i -and $i.LinkType -eq 'Junction') { $i }
    }

if (-not $junctions) {
    Write-Host 'No junctions to clean.'
    exit 0
}

Write-Host "Found $($junctions.Count) junction(s):"
foreach ($j in $junctions) {
    $target = $j.Target -join ''
    if ($DryRun) {
        Write-Host "  [DryRun] $($j.FullName) -> $target"
        continue
    }
    # recursive=$false deletes only the junction link, never the target.
    [System.IO.Directory]::Delete($j.FullName, $false)
    Write-Host "  Deleted $($j.FullName) -> $target"
}

if (-not $DryRun) {
    Write-Host 'Done. The next dsh boot (dev or packaged) will rebuild the links against its own runtime.'
} else {
    Write-Host 'DryRun finished, nothing was deleted.'
}
