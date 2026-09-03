# Rewrite all Windows junctions under a dsh-runtime tree to point at their new
# location (after moving the runtime directory). Junction targets are absolute;
# this script maps the old root prefix to the new one and rebuilds each junction.
param(
    [string]$Root,
    [string]$OldPrefix,
    [string]$NewPrefix
)
$ErrorActionPreference = "Stop"
if (-not $Root -or -not $OldPrefix -or -not $NewPrefix) { throw "usage: rewrite-junctions.ps1 -Root <dir> -OldPrefix <old> -NewPrefix <new>" }

function Rewrite-Junctions([string]$dir) {
    foreach ($item in Get-ChildItem $dir -Force -ErrorAction SilentlyContinue) {
        if (-not $item.PSIsContainer) { continue }
        $li = Get-Item $item.FullName -Force
        if ($li.LinkType -eq "Junction") {
            $target = $li.Target
            if ($target -like "$OldPrefix*") {
                $newTarget = $NewPrefix + $target.Substring($OldPrefix.Length)
                if (Test-Path $newTarget) {
                    Remove-Item $item.FullName -Force -ErrorAction SilentlyContinue
                    New-Item -ItemType Junction -Path $item.FullName -Target $newTarget -ErrorAction Stop | Out-Null
                } else {
                    Write-Warning "target missing, keeping: $newTarget"
                }
            }
        } else {
            Rewrite-Junctions $item.FullName
        }
    }
}

Rewrite-Junctions $Root
Write-Host "Junction rewrite complete under $Root"
