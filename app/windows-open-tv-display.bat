@echo off
setlocal

set "URL=http://localhost:3000/ticket-display?token=5ffbdae29a88a1610341090"
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"

if exist "%EDGE%" (
  start "" "%EDGE%" --kiosk "%URL%" --edge-kiosk-type=fullscreen
  exit /b 0
)

if exist "%CHROME%" (
  start "" "%CHROME%" --kiosk "%URL%"
  exit /b 0
)

start "" "%URL%"
