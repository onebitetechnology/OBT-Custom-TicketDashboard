# Release Checklist

Use this checklist each time you cut a new desktop release.

## Before Packaging

- confirm the board runs locally with `npm start`
- confirm the desktop settings still save and reload correctly
- confirm `Open in Browser` works from Settings
- confirm `Check for Updates` still behaves sensibly in packaged builds
- update `version` in `package.json`
- add or update release notes

## Branding Assets

- place `build/icon.png`
- place `build/icon.icns`
- place `build/icon.ico`

## macOS Build

```bash
cd /Users/jeff/Documents/Playground/onebite-ticket-display-desktop
npm install
npm run dist:mac
```

Artifacts to look for in `dist/`:

- `.dmg`
- `.zip`

## Windows Build

Run on a Windows machine:

```bash
npm install
npm run dist:win
```

Artifact to look for in `dist/`:

- `.exe` installer

## Verification

- install the Mac build on a clean Mac if possible
- install the Windows build on a clean Windows machine if possible
- verify the board launches
- verify the local bundled server starts
- verify settings persist after app restart
- verify `Restart Server` still works
- verify `Open in Browser` opens the local board
- verify update checks do not error immediately

## Release Publishing

- upload packaged artifacts to the chosen release host
- ensure the release tag matches the app version
- attach release notes
- publish the release

## Post-Release

- install/update from the published release on a test machine
- verify the app detects the new version from a prior installed version
- verify the update download and restart flow

