# One Bite Technology — Ticket Display

Standalone local Node.js app for the TV ticket display.

This app is separate from the parts audit dashboard. It has its own:

- folder
- server process
- ticket metadata cache
- Windows startup scripts

## Run

```bash
node server.js
```

Then open:

```text
http://localhost:3000/ticket-display?token=5ffbdae29a88a1610341090
```

Or just open:

```text
http://localhost:3000
```

## Windows Setup

See:

[`WINDOWS_TV_SETUP.md`](/Users/jeff/Documents/Playground/onebite-ticket-display/WINDOWS_TV_SETUP.md)

## Main Files

- `server.js` — standalone RepairDesk ticket-display server
- `ticket-display.html` — TV UI
- `ticket-meta-cache.json` — persistent ticket timestamp cache
- `windows-start-server.bat` — starts the local server on Windows
- `windows-open-tv-display.bat` — opens the TV page in kiosk mode
- `windows-install-tv-tasks.ps1` — installs Windows Scheduled Tasks
