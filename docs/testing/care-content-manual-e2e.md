# Care content manual E2E: Markdown → SQLite → Convex dev → mobile web

Status: executable scenario for Luna High; production rollout is out of scope.

## Safety gate

Run these checks before any write:

```bash
git status --short --branch
rg '^(CONVEX_URL|CONVEX_DEPLOYMENT|EXPO_PUBLIC_CONVEX_URL|PORT)=' \
  apps/api/.env packages/convex/.env.local apps/mobile/.env.local
```

The Convex target must be a `dev:*` deployment (currently `dev:fantastic-beagle-190` in this workspace), never a production deployment. Do not run `convex deploy`, production migrations, or production URLs.

Choose `content/plants/allium-cepa/vi.md` as the fixture. Before editing, save both the bytes and SHA-256 to a private temporary location; record existing `sync_outbox` statuses because unrelated pending rows may already exist.

## Preconditions

Start the local API and dashboard:

```bash
npm run dashboard:dev
```

Expected API output: `http://localhost:4000`, `Convex sync: enabled`, `Convex admin proxy: enabled`; expected dashboard URL: `http://localhost:51733/`. The API monitor must reach `ready` before editing.

For the optional mobile browser check, start Expo web separately:

```bash
npm run web
```

Use the same dev Convex URL in `apps/mobile/.env.local`.

## Test flow

1. Record the original fixture bytes/hash and current SQLite rows for plant code `ALLIUM_CEPA_Q5KS82ENRE`, locale `vi`, plus outbox counts.
2. Append a unique, harmless Markdown marker to `content/plants/allium-cepa/vi.md`, for example `<!-- E2E care-content marker <timestamp> -->`.
3. Refresh only the plant manifests:

   ```bash
   npm run content:manifests -- --action refresh --kind plants --plant-code ALLIUM_CEPA_Q5KS82ENRE --write
   ```

   If the CLI does not honor `--plant-code` for refresh, use `--kind plants --write`; verify the diff contains only the selected directory's `content.json`.
4. In the dashboard Content Inbox, refresh and select the `vi.md` event. Capture/record:
   - event path and `modified` event type;
   - incoming excerpt containing the unique marker;
   - staged-before care content and manifest identity (`ALLIUM_CEPA_Q5KS82ENRE`);
   - monitor phase `ready`.
5. Approve the Markdown event and its corresponding `content.json` event with reason `manual E2E dev test`; apply the resulting approved batch. Expected result: `status: applied`, `updatedLocales: 1`, `queuedOutbox >= 1`.
6. Verify SQLite readback before publishing:

   ```sql
   SELECT care_content FROM master_plant_i18n
   WHERE master_plant_id = (SELECT id FROM master_plants WHERE plant_code='ALLIUM_CEPA_Q5KS82ENRE')
     AND locale='vi';
   SELECT id, operation, source_id, locale, status FROM sync_outbox
   WHERE source_id='ALLIUM_CEPA_Q5KS82ENRE' ORDER BY id DESC;
   ```

   The marker must be present in `care_content`; the new row must be `pending`.
7. In Plants Master, use the publish/retry sync controls. If no row was queued by apply, use the explicit dashboard queue-local action first, then publish. Expected result: `applied: 1` (or the exact number of selected locale rows), no new failed/blocked row.
8. Verify Convex dev readback through the authenticated admin query or Convex dev dashboard. Query `masterSync:listAll` for `sourceId`/plant code `ALLIUM_CEPA_Q5KS82ENRE` and locale `vi`; assert `careContent` contains the unique marker and the canonical plant identity matches.
9. Open Expo web in the in-app browser and navigate to the plant detail for the same Convex plant ID. Open **Care Guide** and assert the unique marker/content is rendered. Reload once to rule out stale local cache; record the visible result and browser console errors.

## Rollback / cleanup

Always restore the exact original `vi.md` bytes from the private backup. Restore `content.json` from its backup or regenerate it from the restored Markdown. Then run the monitor/review flow only if the restore creates a new event; approve/apply the restore in dev and publish it so Convex dev returns to the original content. Re-run the SQLite/Convex readback and confirm the marker is absent. Do not delete or reset unrelated outbox rows.

If the test stops after SQLite apply, leave no unreviewed restore event: complete the restore through the same inbox flow or explicitly document the remaining pending event and stop before any production action.

## Evidence to report

Record: dev target and health output; fixture original/new SHA-256; event IDs and proposal ID; Content Inbox preview; apply outcome; SQLite care-content/outbox rows; Convex dev readback; Expo web visible text; browser console errors; cleanup verification. A blocked step should include its exact endpoint/UI message and whether the block is expected (for example missing Convex credentials or auth).
