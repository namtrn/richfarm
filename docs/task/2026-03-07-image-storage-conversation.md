# Image Storage Conversation

Date: 2026-03-07
Repo: `/Users/n/Documents/GitHub/richfarm`

## Context

User asked:
- current image storage mechanism works how?
- one plant/cultivar may have 2-3 images
- where images are stored
- how to save bandwidth and storage
- how to prevent abuse and cost explosion

Follow-up direction:
- master plant can have multiple images
- user plant images should sync to the user's own drive
- app/backend should only keep metadata such as name, file id, URL/link
- when user installs the app, there should be a dedicated folder for image storage when they add images
- identify edge cases

---

## Current Code Reality

### 1. Master plant images

Current schema only supports a single image per master plant:

- `plantsMaster.imageUrl` in [`/Users/n/Documents/GitHub/richfarm/convex/schema.ts`](/Users/n/Documents/GitHub/richfarm/convex/schema.ts#L100)
- update flow in [`/Users/n/Documents/GitHub/richfarm/convex/plantImages.ts`](/Users/n/Documents/GitHub/richfarm/convex/plantImages.ts#L181)

Implication:
- current code does **not** support 2-3 images per master plant/cultivar
- to support that, schema must change

### 2. User plant photos

User plant photos currently use a hybrid local-first + cloud-sync approach.

Local side:
- photo list is stored in `AsyncStorage`
- each photo entry stores local `uri`
- implementation in [`/Users/n/Documents/GitHub/richfarm/lib/plantLocalData.ts`](/Users/n/Documents/GitHub/richfarm/lib/plantLocalData.ts#L28)

UI add-photo flow:
- pick/capture image via `expo-image-picker`
- save local metadata first
- queue photo for sync
- implementation in [`/Users/n/Documents/GitHub/richfarm/app/(tabs)/plant/[userPlantId].tsx`](/Users/n/Documents/GitHub/richfarm/app/(tabs)/plant/[userPlantId].tsx#L397)

Sync flow:
- fetch local URI
- convert to blob
- request Convex upload URL
- upload blob to Convex Storage
- save metadata into `plantPhotos`
- implementation in [`/Users/n/Documents/GitHub/richfarm/lib/sync/useSyncExecutor.ts`](/Users/n/Documents/GitHub/richfarm/lib/sync/useSyncExecutor.ts#L65)

Server save flow:
- `generateUploadUrl`
- `savePhoto`
- implementation in [`/Users/n/Documents/GitHub/richfarm/convex/storage.ts`](/Users/n/Documents/GitHub/richfarm/convex/storage.ts#L14)

Photo table:
- multiple photos per user plant are supported
- schema in [`/Users/n/Documents/GitHub/richfarm/convex/schema.ts`](/Users/n/Documents/GitHub/richfarm/convex/schema.ts#L282)

### 3. Mismatch in current UX copy

Photo section UI still says local-only:
- [`/Users/n/Documents/GitHub/richfarm/components/plant/PlantPhotosSection.tsx`](/Users/n/Documents/GitHub/richfarm/components/plant/PlantPhotosSection.tsx#L53)

But actual behavior is:
- local-first
- then sync to Convex Storage

### 4. Scanner photo flow

Scanner-selected image also uploads to Convex Storage:
- [`/Users/n/Documents/GitHub/richfarm/hooks/useAddPlantFlow.ts`](/Users/n/Documents/GitHub/richfarm/hooks/useAddPlantFlow.ts#L196)

---

## Risks In Current Implementation

### Cost and bandwidth

Current upload path does not show a reliable pre-upload resize/compression step for user photos.

Implication:
- bandwidth cost grows close to original image size
- storage cost grows with every synced photo

### Abuse / missing protection

`generateUploadUrl` currently checks only that a user/device session exists:
- [`/Users/n/Documents/GitHub/richfarm/convex/storage.ts`](/Users/n/Documents/GitHub/richfarm/convex/storage.ts#L14)
- [`/Users/n/Documents/GitHub/richfarm/convex/lib/user.ts`](/Users/n/Documents/GitHub/richfarm/convex/lib/user.ts#L5)

Missing controls observed:
- no rate limit
- no quota per user/device
- no max photos per plant
- no max bytes per day/user
- no MIME whitelist enforcement in this path
- no explicit max file size enforcement in this path

### Deletion / orphan files

Removing a photo in the current plant detail UI removes the local entry, but no cloud delete path is visible there:
- [`/Users/n/Documents/GitHub/richfarm/app/(tabs)/plant/[userPlantId].tsx`](/Users/n/Documents/GitHub/richfarm/app/(tabs)/plant/[userPlantId].tsx#L433)

There is cleanup on full account deletion:
- [`/Users/n/Documents/GitHub/richfarm/convex/users.ts`](/Users/n/Documents/GitHub/richfarm/convex/users.ts#L148)

Implication:
- cloud objects may accumulate as orphan files

---

## Proposed Architecture Direction

### 1. Master plant images

Requirement:
- one master plant can have multiple images, typically 2-3

Recommendation:
- stop treating image as a single field on `plantsMaster`
- add a dedicated table such as `plantMasterImages`

Suggested fields:
- `plantId`
- `storageProvider`
- `storageKey`
- `url`
- `width`
- `height`
- `sizeBytes`
- `mimeType`
- `sortOrder`
- `isPrimary`
- `alt`

Rules:
- hard limit `max 3` images per master plant
- exactly one image can be `isPrimary = true`
- UI reads ordered gallery, not just one `imageUrl`

Storage recommendation:
- use storage the team controls, backed by CDN
- examples: R2 / S3 / Cloudinary / Convex for small scale
- for larger scale, R2/S3 + CDN is more cost-predictable than storing everything in Convex

### 2. User plant images

Requirement:
- user photos should sync to the user's own drive
- app/backend should only keep metadata

Recommendation:
- local-first storage on device
- optional cloud sync to user-owned storage
- backend stores metadata only, not image binaries

Local structure example:

```text
documentDirectory/richfarm/plants/{userPlantId}/photo_{timestamp}.jpg
documentDirectory/richfarm/plants/{userPlantId}/thumb_{timestamp}.jpg
```

Cloud structure example:

```text
RichFarm/Plants/{userPlantId}/photo_{timestamp}.jpg
RichFarm/Plants/{userPlantId}/thumb_{timestamp}.jpg
```

Suggested metadata table for user images:
- `userPlantId`
- `ownerUserId`
- `localId`
- `localPath`
- `thumbnailPath`
- `storageProvider` (`google_drive`, `icloud`, `dropbox`)
- `providerFileId`
- `providerFolderId`
- `providerUrl`
- `checksum`
- `takenAt`
- `syncStatus`
- `lastSyncedAt`
- `isPrimary`

Important note:
- do not rely on URL alone
- store provider `fileId` as the stable identifier

### 3. App behavior

When user installs app:
- app can always create an app-private local folder for photos
- cloud folder should be created only after user grants Drive/iCloud permission

Recommended sync states:
- `local_only`
- `syncing`
- `synced`
- `sync_failed`
- `missing_remote`

---

## Cost-Saving Recommendations

### Bandwidth and storage optimization

For user images:
- resize before saving or uploading
- keep display image at max `1280-1600px`
- quality around `0.65-0.75`
- generate thumbnail `240-320px`
- avoid keeping original full camera sensor file unless product really needs it
- deduplicate using checksum
- allow “keep thumbnails only after successful sync” if device storage matters

For master images:
- keep only 2-3 curated images per plant
- compress once offline before upload
- use CDN delivery

### Quotas

Recommended limits:
- max photos per user plant
- max total images per user
- max bytes uploaded per day per user
- max bytes uploaded per day per device
- optional rule: no cloud backup for anonymous users

### Server-side validation

Even if backend does not store binaries long-term, still validate:
- MIME whitelist: jpeg/png/webp
- file size limit
- image dimension sanity
- ownership of plant/user
- upload/session token bound to user and intended resource

---

## Edge Cases

### 1. User uninstalls app

If not synced:
- local photos are lost

If synced to user drive:
- metadata remains
- photos can be restored from provider

Need:
- clear status in UI
- clear message about unsynced photos

### 2. User changes phone

Without cloud sync:
- photos do not migrate

With successful cloud sync:
- metadata + provider file ids can restore image list

### 3. User revokes Drive/iCloud permission

Result:
- sync stops
- existing remote metadata may become stale

Need:
- detect auth failure
- mark photos `sync_failed`
- allow reconnect flow

### 4. User deletes or moves files manually in Drive

Result:
- URL/file id may become invalid
- app may show broken images

Need:
- detect remote missing
- mark `missing_remote`
- offer re-upload from local copy if available

### 5. Public link exposure

If sharing via public URL:
- privacy risk

Recommendation:
- prefer private file access through provider OAuth when possible
- do not make plant photos public by default

### 6. Duplicate uploads

Possible causes:
- retries
- queue duplication
- multi-device race

Need:
- `checksum`
- `localId`
- idempotent sync logic

### 7. Offline conflicts

Examples:
- local photo deleted on one device, still present remotely
- order/note changed from another device

Need:
- simple conflict policy
- recommended: binary immutable, metadata last-write-wins

### 8. Device storage full

Need:
- free-space check before save
- fallback message
- optional cleanup policy for old originals once sync succeeds

### 9. Delete behavior

Need explicit policy:
- deleting user plant should remove local folder or not
- deleting image should remove remote file or not
- deleting account should clean metadata and optionally request provider cleanup

### 10. Master plant image management

Need:
- `sortOrder`
- `isPrimary`
- limit to max 3 images
- migration path from legacy single `imageUrl`

### 11. Abuse even without backend binary storage

Still possible:
- spam metadata creation
- spam sync jobs
- spam AI analysis requests

Need:
- rate limiting
- quotas
- anomaly logging

---

## Recommended Product Split

### Master plant images

- stored in platform controlled by Richfarm
- served via CDN
- multiple images per plant
- hard cap 3 images

### User plant images

- stored locally first
- optional sync to user-owned drive
- backend stores metadata only
- do not trust URL alone; keep provider file id

---

## Practical Next Step

If implementing this direction in the repo, the next design step should define:

1. new schema for `plantMasterImages`
2. new schema for `userPlantImages`
3. migration plan from `plantsMaster.imageUrl`
4. local folder manager for device image storage
5. sync state machine for Drive/iCloud
6. delete/restore/conflict policy
7. quota and anti-abuse rules

---

## Short Summary

What is true today:
- master plant currently supports only one image
- user plant photos currently sync to Convex Storage
- current flow is not optimized enough for cost control at scale
- current upload path lacks strong anti-abuse controls

What was agreed as better direction:
- master plant should support multiple curated images
- user plant photos should live locally and optionally sync to the user's own drive
- backend should keep metadata, not image binaries
- app should maintain a dedicated local image folder
- edge cases around uninstall, revoke permission, missing remote files, duplicates, and delete policy must be designed up front
