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
- `app/ticket-display.css` and `app/ticket-display.js`
  Renderer styles and behavior, kept separate for a strict Content Security Policy.
- `app/lib/shared-auth.js`
  Signed shared-board request protocol and replay protection.
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

Build the signed Windows installer:

```bash
npm run dist:win
```

This requires `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`. For an explicitly unsigned local test package, use `npm run dist:win:local`.

### macOS

Build the signed and notarized macOS installer:

```bash
npm run dist:mac
```

If you only need a local unsigned test build:

```bash
npm run dist:mac:local
```

Production builds require the signing and Apple notarization credentials described in [SECURITY.md](./SECURITY.md). Unsigned local package commands write to the operating system temp directory and print the exact output path. This avoids macOS File Provider metadata corrupting ad-hoc signatures when the repository is stored under a managed Documents folder.

## Updates

The app is configured to publish releases through GitHub Releases.

Current behavior:

- Windows packaged builds can check for updates on launch, on a weekly schedule, or manually from Settings.
- production releases are blocked unless the macOS app is signed/notarized and the Windows installer has a valid Authenticode signature
- each release includes SHA-256 checksums and a GitHub build-provenance attestation
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

- run preflight checks before making the release commit
- stage modified and deleted tracked files; intentional new files must already be reviewed and staged
- create the release commit
- push `main`
- create the matching git tag from `package.json`
- push the tag to GitHub

Run the preflight checks by themselves:

```bash
bash ./preflight.sh
```

If you want a slower but stronger packaging smoke test before tagging:

```bash
bash ./preflight.sh --with-packaging
```

## Settings and Data Storage

User settings are stored in the app’s user-data directory, not in the install folder. This means:

- new installs start clean
- app updates keep the user’s existing settings
- uninstalling the app may leave user settings behind unless the user removes them manually

Typical stored data includes:

- app config
- ticket metadata cache
- derived Priority-fee cache without raw invoice payloads
- rotating config backups

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
- Do not expose the local board port to the public internet. Shared-board sync is designed for a trusted store LAN.
- Production releases require configured Apple and Windows signing credentials; unsigned local builds are test artifacts only.
