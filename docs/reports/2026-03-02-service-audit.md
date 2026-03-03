# Service Audit Report — 2026-03-02

## Context

Audit triggered by a loading screen hang caused by a `null ?? undefined = undefined` race condition in `useAuth`. After fixing auth, all other hooks were reviewed for the same class of issues.

---

## 🔴 Bugs Fixed

### 1. `usePlants` — Convex query fires without `deviceId` (no skip guard)

**File:** `hooks/usePlants.ts` line 16

```typescript
// BEFORE — fires with deviceId=undefined before AsyncStorage loads
const remotePlants = useQuery(api.plants.getUserPlants, { status, deviceId });

// AFTER
const remotePlants = useQuery(api.plants.getUserPlants, deviceId ? { status, deviceId } : 'skip');
```

**Impact:** On every render before `deviceId` loads (~50-100ms), Convex receives a query with `deviceId: undefined`. Backend has to handle/reject it unnecessarily on every app open.

---

### 2. `useReminders` — Both queries fire without `deviceId` skip guard

**File:** `hooks/useReminders.ts` lines 13–19

```typescript
// BEFORE
const remoteReminders = useQuery(api.reminders.getReminders, { userPlantId, enabledOnly: false, deviceId });
const remoteTodayReminders = useQuery(api.reminders.getTodayReminders, { deviceId });

// AFTER
const remoteReminders = useQuery(api.reminders.getReminders, deviceId ? { userPlantId, enabledOnly: false, deviceId } : 'skip');
const remoteTodayReminders = useQuery(api.reminders.getTodayReminders, deviceId ? { deviceId } : 'skip');
```

**Impact:** Same as above — 2× unnecessary Convex calls per app open.

---

### 3. `useBeds` — Conditional hook call (potential React rules violation)

**File:** `hooks/useBeds.ts` lines 13–18

```typescript
// BEFORE — ternary between two useQuery calls
const remoteBeds = gardenId
  ? useQuery(api.gardens.getBedsInGarden, ...)
  : useQuery(api.beds.getBeds, ...);

// AFTER — two unconditional hooks, one skipped based on args
const bedsFromGarden = useQuery(api.gardens.getBedsInGarden, gardenId && deviceId ? { gardenId, deviceId } : 'skip');
const allBeds = useQuery(api.beds.getBeds, !gardenId && deviceId ? { deviceId } : 'skip');
const remoteBeds = bedsFromGarden ?? allBeds;
```

**Impact:** React hooks must be called unconditionally. If `gardenId` switches from defined → undefined, the ternary changes which branch of `useQuery` is "active," potentially causing state desync.

---

## 🟡 Dead Code Removed

### 4. Redundant `shouldBypassRemote` fallback in array hooks

**Files:** `useBeds`, `useFavorites`, `usePlants`, `useReminders`

```typescript
// BEFORE — ternary always returns []
beds: beds ?? (shouldBypassRemote ? [] : []),

// AFTER
beds: beds ?? [],
```

`shouldBypassRemote ? [] : []` is always `[]`. The ternary was a leftover from a pattern where offline vs online might have returned different values.

---

## ✅ Hooks Confirmed Clean

| Hook | Notes |
|---|---|
| `usePaywall` | No Convex queries, pure RevenueCat |
| `usePlantSync` | Write-only, no loading state |
| `useWeatherCard` | Mock data only |
| `usePlantLocalized` | Pure data transform, no async |
| `useUnitSystem` | Local preference, proper hydration |
| `useNotifications` | Guarded by `enabled` flag |
| `useSyncTriggers` | Guarded by `enabled` flag |
| `useSubscription` | Guarded by `isReady` |
| `usePestsDiseases` | No `deviceId` needed, query is public |
| `useFavorites` | Has skip guard, logic correct |
| `useUserSettings` | Fixed (null/undefined race) |
| `useAuth` | Fixed (root cause of loading hang) |
| `usePlantLibrary` | Complex but correct |

---

## Root Cause of Loading Screen Hang (Fixed Earlier)

`useAuth` had `currentUser = rawUser ?? cachedUser ?? fallback`. When `rawUser = null` (Convex: no user) and `cachedUser = undefined` (AsyncStorage still loading), this evaluated to `undefined`, keeping `isLoading = true` forever.

**Fix:** Use `remoteResolved` from `useQueryCache` to short-circuit to `rawUser` the moment Convex responds, never falling through to cache.

**Deeper fix:** `useAppReady` now only waits for `deviceId` (`isReady = !!deviceId`), not for Convex confirmation at all. App shows in ~50-100ms on all subsequent launches.
