# Remaining Reddit/App Store Complaint Work

Date: 2026-05-12

## Context

This task tracks the parts of the Reddit/App Store competitor complaint research that were not completed in the May 12 QA/fix pass.

Source documents:

- `docs/task/2026-05-11-competitor-user-complaints.md`
- `docs/task/2026-05-11-richfarm-goal.md`

The May 12 pass fixed several core garden/plant/reminder flow issues, including:

- watering reminder wording now frames care as checking plant condition
- reminder skip support and recurring-reminder history behavior
- guest/gardener add-plant flow through Library -> Garden/My Plants
- scanner/library add flow carrying scan photo/history context
- hidden pending sync banners for background auto-sync
- nickname display in My Plants and Plant Detail
- garden assignment and Home unassigned-count bugs
- raw i18n key display in Plant Detail

## Not Done Yet

### 1. Reminder fatigue controls

Status: Partially complete

Users complain when reminders become noise. Richfarm still needs deeper reminder-volume controls.

May 12 continuation pass completed:

- Today reminders now batch by due day, target context, and care type so users can act on a group instead of tapping every single reminder.
- Batched reminders support visible Complete, Snooze, and Skip actions.
- Reminder actions now show an in-screen confirmation after save, complete, snooze, skip, enable/disable, and delete.
- Added a Garden Check ritual quick-create mode for daily or weekly garden review reminders.
- Added localized English/Vietnamese copy for the new reminder controls.

Remaining work:

- add quiet hours and notification frequency controls
- verify complete, skip, snooze, edit, and delete across recurring and one-time reminders
- add deeper grouping QA for mixed gardens, beds, and plant-linked reminders

### 2. AI diagnosis quality and humility

Status: Not complete

The current work improved scanner/add flow, but disease/pest diagnosis is not yet strong enough against the complaint that AI advice is generic or overconfident.

Remaining work:

- show confidence/uncertainty for diagnosis
- show likely causes rather than one generic answer
- explain what visual evidence or user input drove the suggestion
- provide safe next steps and inspection checklist
- include clear "not a guaranteed diagnosis" language
- handle API failures without leaving the user stuck

### 3. Companion planting guidance

Status: Not complete

Richfarm should avoid magical friend/foe companion charts. This has not been built yet.

Remaining work:

- prioritize practical layout constraints: spacing, mature size, sun/shade, water/soil needs, trellis habit, crop rotation, pest/pollinator rationale
- label anecdotal companion tips as anecdotal
- let users override suggestions
- avoid absolute language when sources conflict

### 4. Shared household care

Status: Future scope

Research shows household/shared care matters because multiple people may accidentally duplicate watering or care.

Remaining work:

- design shared garden roles
- add action attribution such as completed-by metadata
- support shared task visibility
- avoid data model choices that block this later

### 5. Safety metadata persistence

Status: Not complete

Toxicity, allergen, and pet-safety information should not be one-off scan output.

Remaining work:

- store safety metadata when available from library or scan result
- show toxicity/allergen/pet-safety info on plant profiles
- connect safety info to scan history and saved user plants
- phrase safety copy as informational, not a guarantee

### 6. Data-loss and sync hardening

Status: Partially complete, needs deeper QA

Pending sync banners were removed because auto-sync should feel automatic, but the underlying preservation guarantees still need more testing.

Remaining work:

- test app restart after creating gardens, plants, reminders, photos, logs, and harvests
- test offline creation and later sync recovery
- test failed sync retry/idempotency so photos/logs/harvests are not duplicated
- test guest data merge after sign-in
- test device-change/account recovery expectations
- decide where sync errors should surface now that normal pending sync is silent

### 7. Paywall and free-tier audit

Status: Not complete

The tested flow allows guest/basic usage, but the whole paywall surface has not been audited.

Remaining work:

- verify plant saving, garden planning, and basic reminders are not blocked by premium
- verify existing user-created data remains accessible after subscription changes
- audit paywall copy for clarity before users hit a limit
- confirm premium gates only advanced AI volume, diagnosis, analytics, widgets, or automation

### 8. Store-readiness QA

Status: Not complete

The iOS simulator flow passes, but App Store readiness needs broader checks.

Remaining work:

- verify camera/photo permission copy and flows on a real device
- verify RevenueCat Test Store keys are not used for App Store submission builds
- verify account deletion, support, privacy, and legal links
- run real-device push notification/reminder checks

## Suggested Next Pass

1. Finish reminder settings: quiet hours, notification frequency, and recurring/one-time QA.
2. Run data-loss QA: restart, offline, retry, and sign-in merge.
3. Add safety metadata display/persistence if catalog fields already exist.
4. Audit paywall/free-tier boundaries.
5. Plan AI diagnosis and companion guidance as product features, not quick fixes.
