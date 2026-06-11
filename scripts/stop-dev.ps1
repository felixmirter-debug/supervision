$ErrorActionPreference = "SilentlyContinue"

$ports = @(3000, 8000)
$listeners = Get-NetTCPConnection -LocalPort $ports -State Listen

if (-not $listeners) {
    Write-Output "No dev listeners found on ports 3000 or 8000."
    exit 0
}

$targetPids = [System.Collections.Generic.HashSet[int]]::new()

foreach ($listener in $listeners) {
    [void]$targetPids.Add([int]$listener.OwningProcess)
}

# Uvicorn's reloader can leave the server in a child process whose command line
# only references the listener PID as parent_pid.
$parentPidPattern = ($targetPids | ForEach-Object { "parent_pid=$_" }) -join "|"
if ($parentPidPattern) {
    $children = Get-CimInstance Win32_Process |
        Where-Object { $_.CommandLine -match $parentPidPattern }

    foreach ($child in $children) {
        [void]$targetPids.Add([int]$child.ProcessId)
    }
}

foreach ($processId in $targetPids) {
    $process = Get-Process -Id $processId
    if (-not $process) {
        continue
    }

    Write-Output "Stopping PID $processId ($($process.ProcessName))"
    Stop-Process -Id $processId -Force
}

Start-Sleep -Seconds 1

$remaining = Get-NetTCPConnection -LocalPort $ports -State Listen
if ($remaining) {
    Write-Output "Still listening:"
    $remaining | Select-Object LocalAddress, LocalPort, OwningProcess | Format-Table -AutoSize
    exit 1
}

Write-Output "Ports 3000 and 8000 are free."
