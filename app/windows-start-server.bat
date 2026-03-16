@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found in PATH.
  echo Install Node.js LTS from https://nodejs.org/ and try again.
  pause
  exit /b 1
)

echo Starting One Bite TV server...
node server.js
