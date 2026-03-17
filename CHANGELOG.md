# Changelog

All notable changes to One Bite Ticket Display Desktop should be recorded in this file.

## v2.1.12

- Added a first-run welcome popup for new installs.
- New installs now prompt for shop name and RepairDesk API key before continuing.

## v2.1.11

- Removed the baked-in RepairDesk API key fallback from packaged builds.
- Fresh installs now start with a blank API key field and only use a key the user explicitly saves.
- Ticket metadata enrichment now safely skips itself when no API key is configured, instead of silently using a bundled key.

## v2.1.10

- Replaced the old global refurb filter with per-column refurb handling controls.
- Each column can now show all tickets, hide refurbs, show only refurbs, or rotate between customer tickets and refurbs.
- Added live assigned-tech filtering in `Ticket Display`, including `Unassigned`.

## v2.1.9

- Added an assigned-tech filter in `Ticket Display` so users can show tickets for selected techs only.
- The assigned-tech filter is populated from the live queue and includes `Unassigned`.

## v2.1.8

- Removed the duplicate queue totals strip above the ticket columns.
- Made the built-in queue column headers larger and more prominent so they carry the count and label on their own.

## v2.1.7

- Added release notes to the in-app update panel so users can see what changed before installing an update.
- Update status now shows the changelog text pulled from the published GitHub release when it is available.

## v2.1.6

- Added a `Hide Refurbs` setting to hide internal refurbishment tickets from the board.
- Refurbishment filtering now targets both RepairDesk `Refurbishment` task types and walk-in customer refurb tickets.

## v2.1.5

- Disabled in-app auto-update installs on macOS until signed and notarized builds are available, so Mac users get a clear manual-update message instead of a broken install attempt.
- Updated the settings update panel to hide install actions when automatic updates are unsupported on the current platform.

## v2.1.4

- Reorganized the settings drawer so `Ticket Display` now groups the assigned-tech toggle, customer name mode, and pulse timing controls together.
- Made every main settings section collapsible, including the RepairDesk API section.
- Added configurable logo sizing in Brand settings and enlarged the saved logo preview.
- Added suggested logo upload guidance next to the logo picker.

## v2.1.3

- Added visible update download progress in settings, including percent, transfer size, and speed.
- Added an `Install Update Now` action after an update finishes downloading.
- Added connected monitor detection so the display target setting can list specific screens instead of only primary/secondary.
- Improved settings dropdown styling so options remain readable on dark backgrounds.
- Added a `Feature Request` button that opens an email to `jeff@onebitetechnology.ca`.

## v2.1.2

- Stopped bundling `config.json` and cache files into packaged installs so new users start from a clean setup.
- Kept per-user settings and cache storage in the app-data folder so installed users retain their own configuration across updates.

## v2.1.1

- Added customer name display modes: full name, first name only, or hidden.
- Added a desktop display target setting so the board can use the current, primary, or secondary monitor.
- Fixed fullscreen behavior so applying window preferences no longer forces the board back to the primary display.
- Fixed the RepairDesk API key migration so waiting ages and appointment enrichment keep working after the API settings cleanup.
- Added the app version to the top of the settings panel and kept it in sync with the maintenance version display.
- Cleaned legacy `bearerToken` and `xTenant` keys out of saved config files.

## v2.1.0

- Added a desktop Electron wrapper around the ticket display so it can run as an installable app on macOS and Windows.
- Added persistent in-app settings for branding, display mode, appointments, pulse timing, column visibility, column labels, and included RepairDesk statuses.
- Added desktop-only controls for fullscreen mode, forced orientation, update checks, restart server, and open in browser.
- Added an appointment calendar with included weekdays, blocked weekdays, optional past-day dimming, and optional rotation between this week and next week.
- Added queue-card privacy and display controls including the assigned-tech visibility toggle.
- Added richer ticket metadata handling for waiting age, stale highlighting, priority detection, and appointment service matching.
- Added packaging and release scaffolding including icon generation, GitHub release workflow, macOS DMG packaging, and Windows NSIS packaging.
- Added a real RepairDesk API key setting in the UI for public API lookups.
- Improved resilience when RepairDesk detail lookups fail so the board can still render from the ticket-counter feed.
- Improved brand settings with live logo preview support.
