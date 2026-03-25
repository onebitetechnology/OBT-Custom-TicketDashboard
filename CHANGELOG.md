# Changelog

All notable changes to One Bite Ticket Display Desktop should be recorded in this file.

## v2.1.68-beta.22

- Fixed the GitHub release workflow so the Windows and macOS CI build jobs no longer auto-publish partial releases before the final publish job runs, which should stop beta releases from ending up on GitHub without their updater metadata.

## v2.1.68-beta.21

- Replaced the giant raw updater stack trace in the app with calmer, user-friendly update error messages.
- Hardened the release workflow so beta builds fail before publish if `latest.yml` or `latest-mac.yml` are missing, instead of shipping a broken updater release.

## v2.1.68-beta.20

- Fixed the RepairDesk Ticket Counter fetch to aggregate paginated ticket pages instead of reading only the first page, which should bring older Waiting tickets back onto the board.

## v2.1.68-beta.19

- Hardened beta updater metadata publishing so Windows releases create a `latest.yml` compatibility file from any valid generated update metadata, instead of depending on one exact prerelease filename.

## v2.1.68-beta.18

- Added a targeted queue-membership debug endpoint so we can inspect exactly which raw statuses a ticket has, which merged queue the board chose, and whether Waiting-column filters are hiding it.

## v2.1.68-beta.17

- Replaced the final GitHub release publish step with the GitHub CLI so duplicate draft releases no longer break release finalization after the assets are already built and uploaded.

## v2.1.68-beta.16

- Fixed the release workflow so macOS and Windows builds no longer race each other while publishing the same GitHub release.
- Beta releases now publish updater assets through one final release job, which should stop the duplicate-tag finalization failures.

## v2.1.68-beta.15

- Moved the fullscreen, orientation, and display-target controls into the `Brand` section under a clearer `Window & Display` subsection.
- Made the major settings subsections collapsible so the settings drawer is easier to navigate as more features are added.

## v2.1.68-beta.13

- Fixed merged multi-row tickets so any row in `Waiting on Customer` or `Waiting for Parts` now keeps the ticket in the Waiting column instead of disappearing behind another service-row status. Quality Control still takes precedence when both are present.

## v2.1.68-beta.12

- Fixed beta release publishing to add compatibility updater metadata files like `latest.yml` for prerelease tags, so beta installs no longer fail update checks with missing-release-metadata 404s.

## v2.1.68-beta.11

- Centered the stacked queue header ticket totals on vertical layouts so the count pill sits neatly under the title.

## v2.1.68-beta.10

- Made the queue header ticket totals responsive so they stay on the right when there is room and stack below the title again on tighter vertical layouts.

## v2.1.68-beta.9

- Hardened the calendar week-rotation logic so stale in-flight fade callbacks can no longer flip the view back to the wrong week mid-cycle.

## v2.1.68-beta.8

- Fixed the queue column header layout rule that was still forcing ticket totals underneath the header title instead of beside it.

## v2.1.68-beta.7

- Fixed beta release packaging to generate update metadata for all channels, so beta installs no longer fail looking for missing `latest.yml` assets during update checks.

## v2.1.68-beta.6

- Matched the top-right `Settings`, clock, and refresh controls more closely in size and made their backgrounds a bit more visible.
- Fixed the week-rotation timer so `this week` and `next week` durations no longer get cut short by normal board refreshes.

## v2.1.68-beta.5

- Reissued the current beta with the larger side-by-side queue header title and ticket count changes so the updater sees a new version.

## v2.1.68-beta.4

- Moved queue column ticket totals back to the right of the header title and increased the size/weight of both the title and count pill for better readability.

## v2.1.68-beta.3

- Restored the `Settings` label beside the gear icon in the main board header so it stays consistent with the other apps.

## v2.1.68-beta.2

- Reissued the current beta so the latest settings polish and temporary appointment block changes can be installed cleanly.

## v2.1.68-beta.1

- Reorganized the Brand settings into clearer sub-sections for Logo, Header, Ticker, Background, General, and Side Media so shops can brand the board more easily.
- Added Header colour/size and ticker font colour/size controls to the Brand settings.
- Renamed the `App Updates` section to `Updates & Maintenance`.
- Polished settings alignment for branding controls, converted theme colour pickers into compact square swatches, and tightened the maintenance action layout.
- Moved `Columns` above `Ticket Details`, renamed the section from `Ticket Display`, and switched the main board Settings button to a gear icon.
- Future day-to-day releases now default to beta flow unless `--stable` is passed explicitly to the release script.
- Added temporary appointment date blocks so shops can mark one-off unavailable dates like `March 24` or `March 25` without changing the normal weekday blocks.

## v2.1.66

- Added brandable theme controls in the Brand section, including optional custom background image upload, background colors, text color, accent color, and text scale.
- Added live preview support for the custom background image so each shop can theme the board without forcing that look on everyone else.

## v2.1.65

- Upgraded the settings-side support email action into `Feature Request / Report Bug` and prefilled the email with app version, platform, update channel, and reproduction prompts.
- Added automatic support bundle generation before opening the email app, so the board now creates a diagnostics file the user can attach for bug reports.

## v2.1.64

- Added a `Receive beta updates` setting so each shop can opt into beta releases or stay on stable-only updates.
- Wired the desktop updater to switch between stable and beta channels based on that saved preference before each update check.
- Updated the release workflow to publish channel metadata for both stable and beta releases, so future prerelease tags can flow to beta testers correctly.

## v2.1.63

- Added a direct GitHub release-notes fallback for update popups, so changelog text still appears even if `electron-updater` returns an empty `releaseNotes` field for a version.

## v2.1.62

- Restyled the settings drawer to better match the cleaner PC AutoSpec card layout, including stronger card contrast and clearer field readability.
- Reworked section headers to use explicit `Show Details` / `Hide Details` controls that feel much closer to the AutoSpec settings pattern.
- Updated the `App Updates` card and settings action buttons to use the same stronger primary green and outlined secondary button treatment.

## v2.1.61

- Switched the main UI font to `Atkinson Hyperlegible Next` to improve readability across the board and settings.
- Brightened and clarified the settings drawer with stronger contrast, larger form text, and easier-to-read labels/help text.
- Refined the `App Updates` card further so it feels closer to the PC AutoSpec settings card while keeping the ticket display app’s background-download update flow.

## v2.1.60

- Polished the `App Updates` card after the `v2.1.59` release, including cleaner rounded progress fill styling so the download bar sits properly inside its rounded track.

## v2.1.59

- Added optional Priority strobe controls so shops can turn the red synced-priority flash on or off and choose a subtle, medium, or intense effect.
- Added an optional top ticker bar in Branding for scrolling specials, promos, reminders, or other shop announcements.
- Added an optional sixth queue column, disabled by default, so wider board layouts can support one more custom status bucket when needed.
- Moved the Appointments settings section up under Brand so signage and scheduling controls sit together more naturally.
- Reworked the settings-side update area into a cleaner `App Updates` card so it matches the compact version/latest/status/progress layout used in the PC AutoSpec app.

## v2.1.58

- Updated true Rush ticket badges to display as `Priority`, with a solid red strobe-style badge so authenticated RepairDesk priority jobs stand out more clearly on the board.

## v2.1.57

- Fixed RepairDesk Rush Sync parsing so it reads ticket rows from the authenticated `ticket/listings` response shape actually returned by RepairDesk, instead of treating a connected sync as empty.

## v2.1.56

- Added a Rush Sync debug endpoint so we can inspect exactly what the authenticated RepairDesk rush listing sees for a specific ticket, including sample rush order ids and matched rows.

## v2.1.55

- Added optional RepairDesk Rush Sync using a logged-in web session cookie, so the board can merge true `rush_job` flags when that sync is connected.
- Kept fee-based Priority detection as the fallback path whenever Rush Sync is disabled, unconfigured, or temporarily disconnected.
- Added Rush Sync settings fields plus a warning popup when the authenticated rush sync drops and the board falls back to fee-based priority detection.

## v2.1.54

- Shortened the ticket wait badge labels to `Day/Days` and `Hour/Hours` so queue cards have a little more room for rush/priority tags.

## v2.1.53

- Added a public-API rush debug endpoint so we can inspect whether the existing API-key-based RepairDesk ticket lookup/detail responses expose any real rush or priority fields.

## v2.1.52

- Updated the `Oldest Priority Ticket` top summary pill so it now considers both `Ready to Start` and `In Progress` priority jobs instead of only the ready queue.

## v2.1.51

- Updated the ticket wait badge so same-day tickets now show `Hours Waiting` instead of an awkward zero-day label, and cleaned up singular/plural wording like `1 Hour Waiting` and `1 Day Waiting`.

## v2.1.50

- Fixed grouped multi-line tickets so a `Quality Control` service row can correctly move the merged ticket card into the Quality Control column instead of being hidden behind another row status.

## v2.1.49

- Made the rush debug endpoint accept either the public ticket number or the internal RepairDesk row id, and return the matched ids more clearly.

## v2.1.48

- Cleaned up update popup changelog formatting so release notes render as readable plain bullets instead of raw HTML tags.

## v2.1.47

- Added rush-job plumbing so the board now preserves a real `rush_job` flag from incoming RepairDesk ticket rows when available.
- Added rush/priority badges to queue cards, with rush taking precedence when a real rush flag is present and fee-based priority remaining as a fallback.
- Added a `/api/debug/ticket-rush?orderId=...` endpoint to inspect whether a live ticket row includes the RepairDesk rush flag.

## v2.1.46

- Fixed GitHub release publishing so the current changelog entry is included in each release, allowing the in-app update popup to show the list of changes.

## v2.1.45

- Stopped appointment audio alerts from continuing to replay after the appointment time has already been reached or passed.

## v2.1.44

- Added a global speech voice selector for spoken appointment alerts, using the voices installed on the local computer.
- If the chosen voice is unavailable later, spoken alerts automatically fall back to the system default voice.

## v2.1.43

- Made alert rule cooldown optional, with blank meaning the alert plays once for that appointment and does not repeat on later data refreshes.
- Collapsed audio alert rules by default so the alert editor takes up much less space once rules are set up.
- Restacked queue column headers so the title sits above the ticket count, keeping header boxes aligned more consistently on vertical displays with longer labels.

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
