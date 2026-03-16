# GitHub Releases Update Plan

This app is already configured to use GitHub Releases as its update provider through Electron Builder.

Current config location:

- `package.json`

Current publish target:

- owner: `onebitetechnology`
- repo: `onebite-ticket-display`

## What This Enables

Once releases are published correctly, installed desktop apps can:

- check for updates on launch
- check weekly while running
- let the user click `Check for Updates`
- download updates in the background
- prompt for restart when the update is ready

## Setup Steps

1. Create or confirm the GitHub repository that will host releases.

2. Make sure the `publish` block in `package.json` matches the real repo.

3. Package artifacts for each platform:

- macOS `.dmg` and `.zip`
- Windows `.exe`

4. Create a GitHub Release whose tag matches the app version.

Example:

- app version: `0.1.0`
- tag: `v0.1.0`

5. Upload the packaged artifacts to that release.

6. Publish the release.

## Signing

For the smoothest installer and update experience:

- sign the Windows app with a code signing certificate
- sign and notarize the macOS app

Without signing:

- Windows SmartScreen warnings are more likely
- macOS Gatekeeper warnings are more likely

## Recommended Versioning Rule

Every public release should increment `package.json`:

- patch for fixes
- minor for new features
- major for breaking changes

## Suggested Release Flow

1. finish app changes
2. bump version in `package.json`
3. package Mac and Windows builds
4. verify both on test machines
5. create GitHub Release
6. upload artifacts
7. publish release
8. verify an already-installed app can detect the update

## Optional Next Step

If you want this more automated, the next improvement is a GitHub Actions workflow that:

- builds the app on tagged releases
- uploads artifacts to GitHub Releases
- standardizes the release process

