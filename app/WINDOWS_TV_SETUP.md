# Windows TV Setup

Use this folder as the permanent standalone TV app.

Recommended Windows path:

```text
C:\OneBiteTV\onebite-ticket-display
```

## Setup Checklist

1. Install Node.js LTS
2. Copy this whole folder to the Windows PC
3. Double-click `windows-start-server.bat`
4. If the TV should be split between cameras and tickets, double-click `windows-open-tv-split.bat`
5. If the TV should only show the ticket board, double-click `windows-open-tv-display.bat`
6. Confirm the display looks correct
7. Open PowerShell in this folder and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\windows-install-tv-tasks.ps1
```

8. Sign out and back in once to test auto-start
9. Turn off sleep and screen saver on the TV PC

## URLs

Main display:

```text
http://localhost:3000/
```

Shortcut root URL:

```text
http://localhost:3000
```

## Files

- `windows-start-server.bat`
- `windows-open-tv-display.bat`
- `windows-open-tv-split.bat`
- `windows-open-tv-split.ps1`
- `windows-install-tv-tasks.ps1`

## Remove Scheduled Tasks Later

```powershell
Unregister-ScheduledTask -TaskName "OneBiteTV Server" -Confirm:$false
Unregister-ScheduledTask -TaskName "OneBiteTV Browser" -Confirm:$false
```
