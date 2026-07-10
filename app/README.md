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
http://localhost:3000/
```

Or just open:

```text
http://localhost:3000
```

## Windows Setup

See `WINDOWS_TV_SETUP.md` in this folder.

## Main Files

- `server.js` — standalone RepairDesk ticket-display server
- `ticket-display.html` — TV UI
- `ticket-display.css` and `ticket-display.js` — renderer assets used by the strict Content Security Policy
- `lib/shared-auth.js` — HMAC authentication and replay protection for shared-board settings
- `ticket-meta-cache.json` — local derived ticket metadata cache in the app user-data directory
- `invoice-priority-cache.json` — derived Priority-fee cache with no raw invoice payloads
- `windows-start-server.bat` — starts the local server on Windows
- `windows-open-tv-display.bat` — opens the TV page in kiosk mode
- `windows-install-tv-tasks.ps1` — installs Windows Scheduled Tasks
