# Changelog

All notable changes to One Bite Ticket Display Desktop should be recorded in this file.

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

