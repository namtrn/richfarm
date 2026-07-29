# Physics Discovery App Template

An Expo + React Native starting point extracted from RichFarm for an
experiment-first physics learning product.

## What was deliberately retained

- Expo Router navigation for iOS and Android
- strict TypeScript
- system-aware light/dark theme with persisted preference
- English/Vietnamese localization
- small Zustand stores for local learning state
- a feature-first folder structure
- pure, testable physics functions separated from rendering

## What was deliberately removed

- all garden and plant domain code
- RichFarm identifiers, assets, and native widget code
- Better Auth, Convex sync, RevenueCat, notifications, and the API/dashboard

Those services should be added only when the first learning loop proves it
needs accounts, cross-device progress, or paid content. The template starts
local-first so a pendulum lesson can be validated without backend complexity.

## Start

```bash
cd templates/physics-discovery-app
npm install
npm run ios
# or
npm run android
```

Before publishing, replace the example bundle identifiers in `app.json`.

## Product architecture

```text
app/                         routes only
src/core/                    cross-cutting theme and localization
src/features/lessons/        lesson schema, content, and session state
src/features/simulations/    physics math and visual interaction
```

An interactive lesson is data. Each step declares its pedagogical intent and
which variables the learner may change. A simulation owns physics and drawing;
it must not decide lesson progression.

## Recommended next increment

1. Replace the preset chips with direct drag gestures.
2. Capture learner predictions and measurements as first-class records.
3. Build the graph from those records.
4. Add Skia + Reanimated only when the SVG prototype has validated the loop.
5. Add persistence, auth, sync, and subscriptions in that order, when needed.

See `docs/STACK_DECISION.md` for the React Native/Flutter decision.
