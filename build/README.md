# Build Assets

Drop the production app icons here before making public installers.

Expected files:

- `icon.icns` for macOS packaging
- `icon.ico` for Windows packaging
- `icon.png` as a general fallback asset

Recommended source artwork:

- start from a square 1024x1024 PNG
- export `.icns` from that for macOS
- export `.ico` from that for Windows

If these files are missing, Electron Builder may still package in some cases, but the app branding will be incomplete and platform behavior may be inconsistent.

