# One Bite Ticket Display Desktop

Electron wrapper for the existing ticket board.

## Architecture

The desktop build keeps the current app mostly intact:

- `app/server.js` still runs the local HTTP API and serves the UI
- `app/ticket-display.html` stays the main TV interface
- `main.js` starts the bundled server on a free localhost port
- Electron opens a native desktop window pointed at that local server
- writable files are redirected into the app data directory via `APP_DATA_DIR`

This is the pragmatic first desktop architecture because it avoids a risky rewrite of the ticket board into Electron-specific code.

## Why This Shape

It gives us:

- an installable Windows application
- a clear migration path from the current working Node app
- a clean place to add auto-updates later
- local config/cache storage outside the install directory

It does not yet finish the update system. That comes next once the packaged app is stable.

## Run In Development

1. Install dependencies:

```bash
npm install
```

2. Start the desktop shell:

```bash
npm start
```

On macOS, that is enough to do the main development work:

- edit the desktop wrapper in this folder
- keep editing the ticket board inside `app/`
- run the Electron shell locally
- validate the desktop window, config storage, and restart behavior

The in-app settings now also include desktop-aware preferences for:

- fullscreen vs windowed startup
- forced horizontal or vertical layout mode
- showing or hiding queue columns
- opening the local board in the system browser

You will still want a Windows machine later for the last-mile checks:

- Windows installer behavior
- startup/login behavior
- SmartScreen and code signing
- auto-update install flow

## Package For Windows

```bash
npm run dist:win
```

That uses `electron-builder` to produce an NSIS installer.

The Windows installer will be written into `dist/` as something like:

- `OneBiteTicketDisplay-0.1.0-Setup.exe`

## Package For macOS

```bash
npm run dist:mac
```

That produces a shareable macOS disk image and zip in `dist/`, for example:

- `OneBiteTicketDisplay-0.1.0-arm64.dmg`
- `OneBiteTicketDisplay-0.1.0-arm64.zip`

If you also see a folder like `mac-arm64/` with `One Bite Ticket Display.app` inside, that is the unpacked build output. It is runnable for local testing, but it is not the installer artifact most people should receive. For sharing, use the `.dmg`.

If local Mac packaging fails because Electron Builder tries to auto-sign with a certificate on your machine, use the unsigned local test build instead:

```bash
npm run dist:mac:local
```

That is the right command for test installers when you only need a working `.dmg` and are not doing a signed public release yet.

## Quick Packaging Checklist

1. Install dependencies:

```bash
npm install
```

2. Test locally:

```bash
npm start
```

3. Build the Mac installer:

```bash
npm run dist:mac
```

If signing gets in the way for local testing:

```bash
npm run dist:mac:local
```

4. Copy the generated `.dmg` from `dist/` to the test machine.

5. On Windows, build the installer on Windows itself:

```bash
npm install
npm run dist:win
```

6. Copy the generated `.exe` installer from `dist/` to the target PC.

For local packaging on macOS later, we can also add:

- a macOS build target for local desktop testing
- a Windows release workflow for signed installers
- auto-update publishing

## Update Strategy

Recommended path:

- use `electron-builder` + `electron-updater`
- publish signed releases to GitHub Releases or S3
- check for updates on app launch and optionally on a timer
- download in background
- prompt to restart into the new version

Before that is production-ready, we still need:

- custom app icons (`.icns` for macOS, `.ico` for Windows)
- code signing for Windows
- code signing / notarization for macOS if you want a smoother Gatekeeper experience
- a release pipeline
- release publishing credentials
- Windows packaging test passes

Basic update scaffolding is already in `main.js`:

- packaged builds will attempt an update check on launch
- packaged builds also re-check on a weekly interval while running
- update state is exposed to the renderer through the Electron preload bridge
- the remaining work is mostly release hosting, signing, and UI polish

## Publishing Real Updates

To install once and send updates over the web later, the remaining pieces are:

1. Pick a release host.
   Recommended: GitHub Releases

2. Publish packaged builds there for each version.

3. Keep the version in `package.json` moving forward.

4. Add signing:
   - Windows code signing certificate
   - macOS signing/notarization if you want smoother installs

5. Keep the `publish` config in `package.json` pointed at the real repo that will host the releases.

Once that is in place, installed apps can:

- check for updates on launch
- check again weekly
- download updates in the background
- prompt the user to restart into the new version

Supporting docs in this project:

- [RELEASE_CHECKLIST.md](/Users/jeff/Documents/Playground/onebite-ticket-display-desktop/RELEASE_CHECKLIST.md)
- [GITHUB_RELEASES_UPDATE_PLAN.md](/Users/jeff/Documents/Playground/onebite-ticket-display-desktop/GITHUB_RELEASES_UPDATE_PLAN.md)
- [build/README.md](/Users/jeff/Documents/Playground/onebite-ticket-display-desktop/build/README.md)

## Icon Workflow

This project now includes:

- source icon art in [icon-source.svg](/Users/jeff/Documents/Playground/onebite-ticket-display-desktop/build/icon-source.svg)
- a local icon build helper in [make-icons.sh](/Users/jeff/Documents/Playground/onebite-ticket-display-desktop/build/make-icons.sh)

To generate the packaging icons on your Mac:

```bash
cd /Users/jeff/Documents/Playground/onebite-ticket-display-desktop
chmod +x build/make-icons.sh
./build/make-icons.sh
```

That should create:

- `build/icon.png`
- `build/icon.icns`
- `build/icon.ico`

## Important Runtime Paths

- app resources: bundled under `resources/app`
- writable data: Electron `userData/data`

That writable data directory will contain the copied app's:

- `config.json`
- `ticket-meta-cache.json`
- `invoice-detail-cache.json`
- any user-editable rules files
