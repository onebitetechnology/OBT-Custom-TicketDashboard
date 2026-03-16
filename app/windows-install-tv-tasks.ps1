param(
    [string]$TaskPrefix = "OneBiteTV",
    [int]$BrowserDelaySeconds = 15
)

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverBat = Join-Path $projectDir "windows-start-server.bat"
$browserBat = Join-Path $projectDir "windows-open-tv-split.bat"

if (-not (Test-Path $serverBat)) {
    throw "Missing file: $serverBat"
}

if (-not (Test-Path $browserBat)) {
    throw "Missing file: $browserBat"
}

$serverTaskName = "$TaskPrefix Server"
$browserTaskName = "$TaskPrefix Browser"

$serverAction = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$serverBat`""
$browserAction = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$browserBat`""

$serverTrigger = New-ScheduledTaskTrigger -AtLogOn
$browserTrigger = New-ScheduledTaskTrigger -AtLogOn
$browserTrigger.Delay = "PT${BrowserDelaySeconds}S"

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew `
    -StartWhenAvailable

Register-ScheduledTask `
    -TaskName $serverTaskName `
    -Action $serverAction `
    -Trigger $serverTrigger `
    -Settings $settings `
    -Description "Starts the One Bite TV ticket display server at logon." `
    -Force | Out-Null

Register-ScheduledTask `
    -TaskName $browserTaskName `
    -Action $browserAction `
    -Trigger $browserTrigger `
    -Settings $settings `
    -Description "Opens the One Bite TV ticket display in kiosk mode at logon." `
    -Force | Out-Null

Write-Host ""
Write-Host "Installed scheduled tasks:"
Write-Host " - $serverTaskName"
Write-Host " - $browserTaskName"
Write-Host ""
Write-Host "Next:"
Write-Host " 1. Test windows-start-server.bat"
Write-Host " 2. Test windows-open-tv-split.bat"
Write-Host " 3. Sign out and sign back in on the TV PC"
