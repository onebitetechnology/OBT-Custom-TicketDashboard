# One Bite Ticket Display Desktop

Standalone desktop application for displaying a RepairDesk ticket board on a TV or monitor.

It packages the custom ticket dashboard as an Electron app for Windows and macOS, with local settings, branding, queue rules, appointment views, and desktop-aware display controls.

On first launch, each install prompts for its own RepairDesk Ticket Counter Display URL and API key so the app reads the correct shop data.

## Features

- custom RepairDesk queue display designed for TV use
- configurable ticket columns and labels
- appointment calendar with optional week rotation
- per-column refurb handling
- assigned-tech filtering
- privacy controls for customer names
- branding controls for title and logo
- desktop app settings for fullscreen, orientation, and display target
- packaged installer builds for Windows and macOS
- GitHub Releases workflow for publishing app updates

## Project Structure

- `app/server.js`
  Local HTTP server and RepairDesk integration layer.
- `app/ticket-display.html`
  Main board UI.
- `main.js`
  Electron entrypoint that starts the local server and opens the desktop window.
- `preload.js`
  Safe bridge between the Electron shell and the renderer.

## Development

Install dependencies:

```bash
npm install
```

Start the desktop app in development:

```bash
npm start
```

This launches Electron, starts the bundled local server, and opens the ticket board in a desktop window.

## Building Installers

### Windows

Build the Windows installer:

```bash
npm run dist:win
```

This creates an NSIS installer in `dist/`.

### macOS

Build the macOS installer:

```bash
npm run dist:mac
```

If you only need a local unsigned test build:

```bash
npm run dist:mac:local
```

This creates a DMG and ZIP in `dist/`.

## Updates

The app is configured to publish releases through GitHub Releases.

Current behavior:

- Windows packaged builds can check for updates on launch, on a weekly schedule, or manually from Settings.
- macOS currently uses manual update installs from DMG releases unless signed and notarized distribution is added later.
- the in-app update panel can display release notes from published releases

For release/update planning, see:

- [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)
- [GITHUB_RELEASES_UPDATE_PLAN.md](./GITHUB_RELEASES_UPDATE_PLAN.md)

### Quick Release Helper

If the version has already been bumped in `package.json`, you can publish a release with one command:

```bash
bash ./release.sh
```

Optional custom commit message:

```bash
bash ./release.sh "Release 2.1.13"
```

The script will:

- stage all changes
- create the release commit
- push `main`
- create the matching git tag from `package.json`
- push the tag to GitHub

## Settings and Data Storage

User settings are stored in the app’s user-data directory, not in the install folder. This means:

- new installs start clean
- app updates keep the user’s existing settings
- uninstalling the app may leave user settings behind unless the user removes them manually

Typical stored data includes:

- app config
- ticket metadata cache
- invoice metadata cache
- user-editable rules files

## Icon Assets

Build resources live in `build/`.

Helpful files:

- `build/icon-source.svg`
- `build/make-icons.sh`
- `build/README.md`

To generate icon files locally:

```bash
chmod +x build/make-icons.sh
./build/make-icons.sh
```

## Notes

- This app depends on live RepairDesk data and requires internet access.
- Windows is currently the most complete platform for packaged installs and auto-update behavior.
- For smooth macOS public distribution later, Apple signing and notarization will be required.
