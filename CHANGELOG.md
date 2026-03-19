# Changelog

All notable changes to One Bite Ticket Display Desktop should be recorded in this file.

## v2.1.42

- Fixed the queue grid so when some ticket columns are hidden, the remaining visible columns expand to fill the available board width instead of leaving empty slots behind.

## v2.1.41

- Changed automatic update checks from weekly to hourly so overnight releases can be picked up by morning on running shop displays.
- Added an in-app update popup with release notes, background download status, and `Update Now` / `Skip` actions.
- Skipped updates are now remembered per version so the same release does not keep reappearing once dismissed.

## v2.1.40

- Added optional horizontal side media in the Brand settings, including image/video/GIF upload, width percentage control, and live preview.
- Side media now displays beside the ticket board on horizontal layouts, similar to the original RepairDesk ticket board style.

## v2.1.39

- Removed the obsolete Appointment Service Matchers setting from the calendar section.
- Reworked audio alert rules to target service type text directly, so rules can follow values like `onsite`, `remote`, or `in-store`.

## v2.1.38

- Fixed the Alert Rules settings block so clicks inside the rule editor no longer behave like label activation and accidentally remove rules.

## v2.1.37

- Tightened the alert-rule remove interaction so only the actual Remove button can delete a rule.
- Moved alert repeat cooldown into each alert rule, so different reminders can repeat on their own schedules.

## v2.1.36

- Fixed the appointment alert rule remove button hit area so clicks beside the button no longer trigger removal.

## v2.1.35

- Made the appointment calendar taller so each day has more room for appointment details and is easier to read from a distance.

## v2.1.34

- Added separate calendar rotation durations for this week and next week.
- Reworked appointment audio into customizable alert rules, so you can stack different chimes/messages by appointment type and lead time.
- Settings sections now open collapsed by default, and the settings drawer resets to the top when opened.
- Strengthened the queue column headers and top summary pills so they read more clearly from a distance.

## v2.1.33

- Cleaned up the appointment merge code with shared helpers for scheduled status, scheduled service labels, and empty metadata defaults.
- Aligned the appointment alert logic to use the same normalized due timestamp as the calendar display.

## v2.1.32

- Scheduled appointment rows now own the merged appointment time and displayed service label for tickets with multiple line items.
- Non-scheduled ticket rows no longer overwrite the scheduled appointment's time or label after the merge.

## v2.1.31

- Scheduled appointment times now prefer the Ticket Counter scheduled row's `due_on` value over the ticket-detail metadata timestamp.
- This fixes cases where the detail API reported an older due time even though RepairDesk's scheduled ticket row had already updated.

## v2.1.30

- Scheduled appointments now prefer fresh ticket-detail due times over stale ticket-counter values when metadata is available.
- Appointment metadata for scheduled or due-dated tickets now bypasses the short cache window so time changes refresh more reliably.

## v2.1.29

- Fixed appointment calendar day grouping to use local dates instead of UTC, so late-day appointments stay on the correct day.
- Fixed the displayed appointment time to use the normalized due timestamp, which helps updated appointment times show correctly.

## v2.1.28

- Appointment calendar grouping now prefers the due time from scheduled rows when a ticket has multiple merged lines.
- This helps time changes on scheduled appointments update correctly instead of sticking to an older merged due time.

## v2.1.27

- Tightened appointment calendar rules so tickets now appear only when their status contains `Scheduled` and they have a due date.
- This removes the older service-name fallback that could leave appointments visible after a status change.

## v2.1.26

- Appointment calendar tickets now qualify automatically when their status contains `Scheduled` and they have a due date.
- This keeps scheduled appointments visible even when RepairDesk service metadata is incomplete or inconsistent.

## v2.1.25

- Added numeric RepairDesk due-date parsing so appointment detection can use UNIX-style timestamps as well as date strings.
- Added a per-ticket appointment debug endpoint to make it easier to diagnose why a specific order is or is not appearing in the calendar.

## v2.1.24

- Expanded appointment metadata caching to include broader ticket-detail text and fallback due-date extraction from RepairDesk ticket details.
- This improves appointment detection when a ticket's added service or due date is not fully reflected in the Ticket Counter feed.

## v2.1.23

- Broadened appointment detection so the calendar can recognize service matches from the raw ticket feed's issue and device lines, not just the enriched RepairDesk service field.
- This helps existing tickets with newly added Tech Support or Remote Support services show up in the appointment calendar more reliably.

## v2.1.22

- Fixed Settings so the drawer opens back at the top instead of dropping into the previous scroll position.
- Added optional appointment audio alerts with chime, spoken message, or both, plus a repeat cooldown setting.

## v2.1.21

- Changed column status matching from exact matches to case-insensitive partial-text matching.
- Added clearer help text in Settings so users can enter full statuses or shorter contains-style values per line.

## v2.1.20

- Fixed the Windows installer build again by limiting the custom NSIS personal-data uninstall UI to the actual uninstaller build.
- This resolves the follow-up CI packaging failure where NSIS treated uninstaller-only code as a warning during the normal installer pass.

## v2.1.19

- Fixed the Windows installer build by wiring the custom personal-data uninstall page as a real uninstall page in NSIS.
- This resolves the CI packaging failure that blocked `v2.1.18` Windows builds.

## v2.1.18

- Fixed the GitHub release workflow so packaged update metadata files like `latest.yml` and blockmaps are uploaded with Windows and macOS releases.
- This allows in-app update checks to find the published release metadata instead of failing with missing `latest.yml`.

## v2.1.17

- Replaced the old ticket-token-only setup with a full Ticket Counter Display URL setting so each shop’s queue uses the correct RepairDesk subdomain.
- Updated first-run setup and Settings to ask for the full RepairDesk Ticket Counter Display URL instead of only the token.
- Added clearer validation when the Ticket Counter Display URL is missing or incomplete.

## v2.1.16

- Added a `Remove Personal Data` action in Settings to wipe saved settings, keys, tokens, and caches, then restart clean.
- Added a Windows uninstaller option to remove the app’s personal data folder during uninstall.

## v2.1.15

- Added clear in-app instructions for finding the RepairDesk ticket counter token from Ticket Counter Display > Copy Display URL.

## v2.1.14

- Removed the hardcoded One Bite ticket counter token from the app entry points and Windows launcher scripts.
- Added a saved per-user ticket counter token setting and welcome-setup field so each install reads the correct shop queue.
- Removed tracked local config and cache files from the repo so packaged builds no longer inherit developer data.

## v2.1.13

- Renamed the refurb display options to show all tickets, customer tickets only, refurb tickets only, or rotate between customer and refurb tickets.
- Added a per-column rotate timing setting in seconds for refurb/customer rotation.
- Updated column rotation so each queue can use its own refurb rotation timing instead of one shared fixed interval.

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
