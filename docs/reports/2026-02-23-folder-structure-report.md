# Folder Structure Report — 2026-02-23

## Summary

Audit of the `richfarm` Expo/React Native project folder structure. 9 issues identified across 3 severity levels. Recommended approach: do quick cleanup first, then migrate the stray feature folder, then refactor module boundaries, and finally extract large screen logic.

## Scope And Assumptions

- Snapshot based on the current on-disk tree as of 2026-02-23.
- This is a structural refactor only; behavior should not change.
- Expo Router routes remain in `app/` and stay thin (render + wiring only).

## Current Structure (Snapshot)

```
richfarm/
├── app/                  ← Expo Router screens
│   ├── _layout.tsx
│   ├── index.tsx         ⚠️ 8KB root screen with mixed logic
│   └── (tabs)/
│       ├── garden/
│       ├── plant/
│       ├── home.tsx
│       ├── library.tsx   ⚠️ 27KB
│       ├── health.tsx    ⚠️ 20KB
│       ├── reminder.tsx  ⚠️ 27KB
│       ├── planning.tsx  13KB
│       ├── profile.tsx   ⚠️ 20KB
│       └── growing.tsx
├── components/
│   ├── plant/
│   └── ui/               (only 3 files)
├── hooks/                (12 files, flat — no domain grouping)
├── lib/                  (flat dump: auth, i18n, sync, units mixed)
│   └── locales/
│   └── sync/
├── modules/              ← native widget bridge
├── my-garden/            ⚠️ stray feature folder at root
├── types/                (only 1 declaration file)
├── widgets/              ← Android/iOS native widget code
├── convex/               ← backend (well structured)
├── docs/                 (mixed: specs, daily reports, schema copy)
├── scripts/              (1 file, no README)
├── assets/
├── expo_out.txt          ⚠️ stray log file
└── expo_out2.txt         ⚠️ stray log file
```

## Issues Found

| # | Problem | Severity | Recommended Fix |
|---|---------|----------|-----------------|
| 1 | `my-garden/` is a stray feature folder at the project root | 🔴 High | Move into `features/garden/` and update imports |
| 2 | Large screen files (20–27KB) mix UI + business logic | 🔴 High | Extract feature components/hooks |
| 3 | `lib/` is a flat dumping ground (auth, i18n, sync, units, widget helpers) | 🟡 Medium | Group by domain under `lib/` |
| 4 | `hooks/` has 12 files with no domain grouping | 🟡 Medium | Group hooks by domain |
| 5 | `components/ui/` has only 3 files; unclear boundary with feature components | 🟡 Medium | Define shared vs feature-only component policy |
| 6 | `types/` has only 1 vendor declaration; project-level types have no home | 🟡 Medium | Add domain type files |
| 7 | `expo_out.txt` / `expo_out2.txt` are stray logs at root | 🟢 Low | Delete and gitignore |
| 8 | `docs/` mixes specs, daily reports, and a schema copy | 🟢 Low | Split into `docs/specs/` and `docs/reports/` |
| 9 | `scripts/` has one file and no README | 🟢 Low | Add README describing script usage |

## Target Structure (Proposed)

Note: `components/` should only contain shared, cross-feature UI. Feature-specific UI belongs under `features/<domain>/components/`.

```
richfarm/
├── app/                        ← routes only (thin)
│   ├── _layout.tsx
│   ├── index.tsx
│   └── (tabs)/
│       ├── garden/
│       ├── plant/
│       └── ...tab screens
├── features/                   ← feature-slice modules
│   ├── garden/
│   │   ├── components/
│   │   └── hooks/
│   ├── plant/
│   │   ├── components/
│   │   └── hooks/
│   ├── reminders/
│   │   └── components/
│   ├── health/
│   │   └── components/
│   ├── planning/
│   │   └── components/
│   └── profile/
│       └── components/
├── components/                 ← shared UI only
│   └── ui/
├── hooks/                      ← grouped by domain (if kept at root)
│   ├── garden/
│   ├── plant/
│   ├── reminders/
│   ├── settings/
│   ├── useAppReady.ts
│   ├── useNotifications.ts
│   └── useSyncTriggers.ts
├── lib/                        ← grouped by domain
│   ├── auth/
│   │   ├── auth.ts
│   │   └── auth-client.ts
│   ├── i18n/
│   │   ├── i18n.ts
│   │   └── locales/
│   ├── sync/
│   ├── convex.ts
│   ├── notifications.ts
│   ├── units.ts
│   └── deviceId.ts
├── types/                      ← domain types
│   ├── lucide.d.ts
│   ├── plant.ts
│   ├── garden.ts
│   └── sync.ts
├── convex/
├── docs/
│   ├── specs/
│   └── reports/
├── scripts/
├── assets/
├── widgets/
└── modules/
```

## Improvement Plan (Phased)

### Phase 1 — Cleanup (Low effort, safe)

- Delete `expo_out.txt` and `expo_out2.txt`
- Add `expo_out*.txt` to `.gitignore`
- Reorganize `docs/` into `docs/specs/` and `docs/reports/`
- Update any doc links or references after the move
- Remove or relocate `docs/specs/convex-schema.ts` (copy of `convex/schema.ts`)
- Add `scripts/README.md` describing available scripts and usage

### Phase 2 — Relocate `my-garden/` (Medium effort)

- Create `features/garden/`
- Move `my-garden/components/` → `features/garden/components/`
- Move `my-garden/hooks/` → `features/garden/hooks/`
- Move `components/plant/` into `features/plant/components/` unless it is shared UI
- Update imports referencing `my-garden/`

### Phase 3 — Reorganize `lib/` (Medium effort)

- Create `lib/auth/` and move `auth.ts`, `auth-client.ts`
- Create `lib/i18n/` and move `i18n.ts` + `locales/`
- Move `plantLocalData.ts` into `features/plant/` (or `lib/plant/` if shared)
- Move `useWidget.ts` to `widgets/` or `features/widgets/` (decide ownership)

### Phase 4 — Group `hooks/` By Domain (Medium effort)

- Create subfolders: `garden/`, `plant/`, `reminders/`, `settings/`
- Move hooks accordingly and update imports
- If most hooks are feature-specific, consider moving them into `features/<domain>/hooks/`

### Phase 5 — Extract Components From Large Screens (High effort, incremental)

- `reminder.tsx` → extract to `features/reminders/components/`
- `library.tsx` → extract to `features/plant/components/`
- `health.tsx` → extract to `features/health/components/`
- `profile.tsx` → extract to `features/profile/components/`
- `planning.tsx` → extract to `features/planning/components/`

### Phase 6 — Expand `types/` (Low effort)

- Add `plant.ts`, `garden.ts`, `sync.ts` domain type files
- Move `lib/sync/types.ts` → `types/sync.ts`

## Verification After Each Phase

```bash
npx tsc --noEmit
npx expo start
```

## Notes And Risks

- Ensure `components/` is reserved for shared UI; feature-only components should live under `features/<domain>/`.
- Update all import paths when moving files; prefer `rg` to find all references.
- Keep `app/` screens thin to avoid regressions; heavy logic should reside in `features/` or `lib/`.
