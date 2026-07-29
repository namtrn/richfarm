# RichFarm Competitor User Complaints

Date: 2026-05-11

## Executive Summary

RichFarm is being built in a crowded category: plant care apps, plant identifier apps, and garden planners. Users do not only complain about missing features. They complain about apps that actively reduce trust:

- watering schedules that kill plants when followed blindly
- too many notifications until the user ignores all reminders
- paywalls that make basic plant tracking useless
- lost plant data, photos, and care schedules
- AI diagnosis that is wrong, generic, or impossible to correct
- garden planning advice presented as certainty when it is actually anecdotal

The product lesson is simple: RichFarm should win by being practical, humble, and reliable. It should help users check and decide, not pretend to know every plant's exact need from a static schedule.

## How To Use This Document

Use this document when making product, design, data-model, monetization, or AI-scan decisions. Each complaint includes:

- what users reported
- why it matters
- what RichFarm should do differently
- links to source material

The findings are qualitative. Reddit and app-store reviews are useful for discovering pain points, but they are not statistically representative.

## Apps And Sources Reviewed

Apps:

- Planta / Planta AI Plant & Garden Care
- Blossom / Blossom Plant Care Guide
- PictureThis
- Greg
- Plant Parent
- Planter and other garden planning apps

Source types:

- Reddit discussions from houseplant, succulent, gardening, vegetable gardening, and square-foot gardening communities
- App Store reviews
- Google Play reviews
- third-party issue/review pages
- one editorial review for PictureThis safety metadata

## Glossary

- `Library`: RichFarm's shared catalog of plants, flowers, herbs, edible crops, fruits, indoor plants, and ornamentals. This should map to shared master data such as `plantsMaster`.
- `User plant`: A plant saved by a user into their own garden or collection. This should map to user-owned data such as `userPlants`.
- `Planning`: Plants the user is considering, planning, or staging before actual planting/growing.
- `Growing`: Plants actively being grown in a garden, bed, pot, or user collection.
- `Reminder`: A care task such as check soil, water, fertilize, prune, pest check, or harvest.
- `Scanner`: AI/photo flow for identifying plants or possible plant health issues.
- `Diagnosis`: AI-assisted health/pest/disease suggestion. It is not a medical or guaranteed horticultural diagnosis.

## Complaint-To-Requirement Map

| User complaint | Risk if RichFarm ignores it | RichFarm requirement |
|---|---|---|
| Watering reminders are too prescriptive | Users overwater plants and stop trusting the app | Reminders should be check prompts with snooze/skip/log-condition |
| Too many reminders | Users ignore notifications | Batch by day/garden/bed and support garden-check rituals |
| Basic features locked behind paywall | Users churn before habit forms | Keep plant saving, garden planning, and basic reminders usable for free/guest users |
| Lost data after updates/device changes | Trust collapses | Offline queue and sync must preserve userPlants/photos/logs/harvests/reminders |
| AI ID/diagnosis wrong or generic | Users make bad care decisions | Show uncertainty, allow correction, save unknown plants, explain likely causes |
| Companion planting advice conflicts | App gives misleading certainty | Prefer practical layout guidance and label anecdotal advice |
| Household care not shared | Multiple people duplicate care tasks | Design future shared-garden roles and action attribution |
| Safety scan info not saved | Useful safety info disappears | Persist toxicity/allergen/pet-safety metadata when available |

## Detailed Findings

### 1. Watering Reminders Can Harm Plants

Users repeatedly report that plant care apps can encourage overwatering when reminders are treated as instructions instead of prompts to inspect the plant.

What users reported:

- Fixed watering schedules do not account for soil moisture, pot size/material, room microclimate, season, airflow, lighting, or dormancy.
- Succulents and sensitive plants are especially vulnerable to schedule-based watering.
- Some users say app advice led them toward root rot or near-root rot.
- Many users still like reminders, but only as "check the soil/plant" prompts.

Why it matters:

- Watering is one of the highest-frequency tasks in a plant app.
- If RichFarm is wrong here, the app can directly contribute to dead plants.
- Trust is hard to recover once the user believes the app gave harmful advice.

RichFarm requirements:

- Use wording like "Check soil", "Inspect plant", or "Check watering need" instead of blindly "Water now".
- Let users complete a reminder as checked/skipped/snoozed, not only watered.
- Encourage condition checks: soil dampness, leaf droop, weather, pot size, and recent watering.
- Store care logs so future reminders can become more adaptive.

References:

- https://www.reddit.com/r/succulents/comments/1ebjqbh
- https://www.reddit.com/r/houseplants/comments/12hlz6h/do_yall_use_the_planta_app_has_anyone_run_into/
- https://www.reddit.com/r/houseplants/comments/13gh00p
- https://www.reddit.com/r/houseplants/comments/1fjirvt/is_there_a_good_plant_watering_app/

### 2. Reminder Fatigue Makes Users Ignore the App

Users with many plants report that daily or near-daily reminders become noise. Some eventually ignore all notifications.

What users reported:

- Too many care tasks arrive separately.
- Users want reminders grouped into a ritual, such as a weekly garden check.
- People with ADHD or large plant collections may prefer fewer, bundled prompts.

Why it matters:

- Reminders are central to RichFarm's value.
- If reminders become noisy, users will disable notifications or mentally ignore the app.
- A gardening workflow often happens as a batch: check the bed, water several plants, inspect pests, harvest what is ready.

RichFarm requirements:

- Support task batching by garden, bed, plant type, and day.
- Offer a "garden check" or "weekly ritual" style grouping.
- Make snooze, skip, and complete fast.
- Consider quiet hours and notification frequency controls.

Reference:

- https://www.reddit.com/r/houseplants/comments/13gh00p

### 3. Paywalls Lock Basic Value

Several apps receive complaints that core features become useless without premium. Users tolerate premium features, but dislike losing basics like saving plants, alerts, logs, or useful watering controls.

What users reported:

- Basic tracking or saving feels artificially limited.
- Alerts, watering guidance, or logs become locked after subscription changes.
- Users describe some apps as cash grabs when the free tier cannot support normal use.
- Billing confusion and unexpected charges show up in PictureThis user reviews.

Why it matters:

- RichFarm needs users to build a habit before premium value is obvious.
- Locking already-created data or core reminders creates resentment.
- Guest/local-first usage is part of the app's current architecture and should remain useful.

RichFarm requirements:

- Free/guest users should be able to save plants, manage basic garden state, and use basic reminders.
- Premium should gate advanced AI volume, advanced diagnosis, analytics, widgets, or automation.
- Never block access to already-created user data because a subscription changed.
- Paywall copy must clearly explain what is premium before the user hits the wall.

References:

- https://apps.apple.com/us/app/blossom-plant-care-guide/id1487453649?platform=iphone&see-all=reviews
- https://apps.apple.com/us/app/greg-plant-identifier-care/id1512912236?see-all=reviews
- https://www.commonsensemedia.org/app-reviews/picturethis-plant-identifier/user-reviews/adult

### 4. Data Loss And Sync Bugs Destroy Trust

Some app reviews report lost plant data, lost photos, and broken care schedules after updates or device changes.

What users reported:

- Plant data/photos disappeared after a phone update.
- Watering schedules reset incorrectly and could not be corrected.
- Support was required for basic recovery.

Why it matters:

- A plant care app becomes a personal record: photos, logs, harvests, schedules, and names.
- Losing that data is worse than missing a feature.
- RichFarm already has offline/sync groundwork, so correctness here is a core product quality bar.

RichFarm requirements:

- Offline queue must preserve failed actions instead of dropping them.
- Photos, harvest logs, activity logs, reminders, and userPlants must survive restart.
- Guest data must merge safely when the user signs in.
- Sync status should be visible enough that users know what is pending vs synced.
- Re-running sync should be idempotent and not duplicate harvests/logs/photos.

Reference:

- https://apps.apple.com/us/app/greg-plant-identifier-care/id1512912236?platform=iphone&see-all=reviews

### 5. AI Identification And Diagnosis Are Often Wrong Or Too Generic

Users complain when plant ID is wrong, diagnosis always returns generic advice, or the app does not allow manual correction.

What users reported:

- Plant identification can suggest the wrong species.
- Diagnosis often says overwatering even when the user only watered because the app told them to.
- Some apps crash during photo identification.
- Some apps do not allow the user to manually add a plant when it is missing from the database.

Why it matters:

- AI is high-value, but a wrong answer can cause wrong care decisions.
- Scanner flows are also likely to be a first impression of the app.
- Users need control when the model is uncertain or wrong.

RichFarm requirements:

- Scanner must show uncertainty and allow manual correction.
- Save unknown plants as userPlants without creating shared library rows.
- Show top candidates when possible.
- Diagnosis should include likely causes, confidence/uncertainty, what to inspect next, and safe next steps.
- If real AI APIs are not configured, use a clear adapter/mock boundary rather than fake hidden behavior.
- Scanner crashes or API failures must return the user to a recoverable state.

References:

- https://apps.apple.com/us/app/greg-plant-identifier-care/id1512912236?see-all=reviews
- https://play.google.com/store/apps/details?id=com.conceptivapps.blossom
- https://justuseapp.com/en/app/1252497129/picturethis-plant-identifier/problems

### 6. Companion Planting Advice Is Conflicting

Gardeners repeatedly report that companion planting information online is contradictory and often anecdotal. Many experienced gardeners prefer practical layout rules over friend/foe charts.

What users reported:

- Different sources contradict each other.
- Some companion claims are treated as myth or overstated.
- Users still value practical guidance around spacing, shade, water needs, trellis habit, pollinators, pest pressure, and crop rotation.

Why it matters:

- RichFarm's garden planning should help users place plants better, not amplify uncertain folklore.
- Beginner gardeners need confidence, but false certainty is harmful.

RichFarm requirements:

- Do not present companion planting as absolute truth.
- Prefer evidence-aware guidance:
  - spacing and mature size
  - shade and sun exposure
  - water and soil compatibility
  - trellis/bush habit
  - crop rotation
  - pest/pollinator/trap-crop rationale
- Label anecdotal companion tips as anecdotal.
- Let users override suggestions.

References:

- https://www.reddit.com/r/vegetablegardening/comments/1t3q3bw/companion_planting/
- https://www.reddit.com/r/vegetablegardening/comments/u4amou
- https://www.reddit.com/r/gardening/comments/1df0x7c
- https://www.reddit.com/r/vegetablegardening/comments/1rtuy81/garden_plan_advice/

### 7. Shared Household Care Is Underserved

Users want family or household members to see care tasks so multiple people do not accidentally water the same plant.

What users reported:

- One person wants household sharing to avoid accidental overwatering by another person.
- Support-mediated sharing is not as good as a clear in-app shared garden model.

Why it matters:

- Gardens and houseplants are often cared for by a household, not a single person.
- Duplicate care tasks can directly harm plants.

RichFarm requirements:

- Shared gardens are not required for the immediate MVP, but data design should not block them.
- Future fields should support roles, action attribution, completed-by metadata, and shared task visibility.

Reference:

- https://apps.apple.com/us/app/greg-plant-identifier-care/id1512912236?platform=iphone&see-all=reviews

### 8. Safety Metadata Is Valuable But Often Not Persisted

PictureThis reviews highlight toxicity/allergen/pet safety as useful. One review notes that toxic/allergen scan information is not stored in the user's plant library, making it hard to revisit.

Why it matters:

- Toxicity and allergen information is high-signal for homes with children or pets.
- If safety information is only shown once after a scan, the user may not find it later.

RichFarm requirements:

- Store and show toxicity, allergen, and pet-safety metadata when available.
- If a scan surfaces safety information, connect it to the plant profile or scan history.
- Make safety copy careful: informational, not a guarantee.

Reference:

- https://www.techradar.com/computing/websites-apps/picturethis

## RichFarm Product Guardrails

- Treat reminders as prompts to inspect, not commands to blindly water/fertilize.
- Reduce reminder fatigue with batching, snooze, skip, quiet hours, and ritual modes.
- Do not lock core plant saving, garden planning, or basic reminders behind premium.
- Make scanner and diagnosis correctable, humble, and transparent.
- Preserve user data across offline, restart, sign-in, and device-change paths.
- Keep library data read-only from user app flows; personal actions belong in userPlants/logs/reminders/harvests.
- Present companion guidance as practical layout support, not folklore certainty.
- Design now so shared gardens and household roles can be added later.
- Persist safety metadata when available instead of making it a one-time scan result.

## Open Questions For Product

- Which features belong in free vs premium?
- How many free AI scans per day/week are acceptable?
- Should reminders default to "check" wording globally, or only for watering?
- Should RichFarm add a household/shared-garden MVP now, or only preserve data-model room for it?
- What source of truth should RichFarm use for plant safety/toxicity metadata?

