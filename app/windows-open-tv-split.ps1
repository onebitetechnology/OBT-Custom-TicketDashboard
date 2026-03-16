Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class WindowTools {
  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
}
"@

Add-Type -AssemblyName System.Windows.Forms

function Get-BrowserPath {
    param([string[]]$Candidates)
    foreach ($candidate in $Candidates) {
        if (Test-Path $candidate) { return $candidate }
    }
    return $null
}

function Wait-MainWindow {
    param(
        [Parameter(Mandatory=$true)] $Process,
        [int]$TimeoutSeconds = 15
    )

    $end = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $end) {
        $Process.Refresh()
        if ($Process.MainWindowHandle -and $Process.MainWindowHandle -ne 0) {
            return $Process.MainWindowHandle
        }
        Start-Sleep -Milliseconds 250
    }
    return [IntPtr]::Zero
}

function Move-ProcessWindow {
    param(
        [Parameter(Mandatory=$true)] $Process,
        [Parameter(Mandatory=$true)] [int]$X,
        [Parameter(Mandatory=$true)] [int]$Y,
        [Parameter(Mandatory=$true)] [int]$Width,
        [Parameter(Mandatory=$true)] [int]$Height
    )

    $handle = Wait-MainWindow -Process $Process
    if ($handle -eq [IntPtr]::Zero) {
        throw "Could not get a window handle for process $($Process.Id)"
    }

    [void][WindowTools]::ShowWindowAsync($handle, 9)
    Start-Sleep -Milliseconds 150
    [void][WindowTools]::MoveWindow($handle, $X, $Y, $Width, $Height, $true)
    [void][WindowTools]::SetForegroundWindow($handle)
}

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ticketUrl = "http://localhost:3000/ticket-display?token=5ffbdae29a88a1610341090"
$cameraUrl = "http://10.0.10.108/"

$edgePath = Get-BrowserPath @(
    "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)

$chromePath = Get-BrowserPath @(
    "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
)

if (-not $edgePath) {
    throw "Microsoft Edge was not found."
}

if (-not $chromePath) {
    throw "Google Chrome was not found."
}

$screens = [System.Windows.Forms.Screen]::AllScreens
if ($screens.Length -lt 2) {
    throw "A second display was not detected."
}

$targetScreen = $screens | Where-Object { -not $_.Primary } | Select-Object -First 1
if (-not $targetScreen) {
    throw "Could not find a secondary display."
}

$bounds = $targetScreen.WorkingArea
$x = $bounds.X
$y = $bounds.Y
$width = $bounds.Width
$height = $bounds.Height

$cameraHeight = [int][Math]::Round($height / 3.0)
$ticketHeight = $height - $cameraHeight

$cameraProcess = Start-Process -FilePath $chromePath -ArgumentList "--app=$cameraUrl" -PassThru
Start-Sleep -Seconds 2
Move-ProcessWindow -Process $cameraProcess -X $x -Y $y -Width $width -Height $cameraHeight

$ticketProcess = Start-Process -FilePath $edgePath -ArgumentList "--app=$ticketUrl" -PassThru
Start-Sleep -Seconds 2
Move-ProcessWindow -Process $ticketProcess -X $x -Y ($y + $cameraHeight) -Width $width -Height $ticketHeight

Write-Host "Camera and ticket windows were placed on the secondary display."
