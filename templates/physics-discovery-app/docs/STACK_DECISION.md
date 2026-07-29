# Stack decision: React Native + Expo

## Decision

Use React Native + Expo for the first production version.

Flutter is a credible choice for a simulation-heavy product, but it does not
create enough advantage here to justify discarding RichFarm's working
TypeScript/Expo knowledge and reusable application infrastructure.

## Why this fits

- The required targets are iOS and Android; Expo supports both from one
  TypeScript codebase.
- The first simulations are 2D and can start with SVG. Skia and Reanimated can
  be introduced behind the simulation boundary when profiling proves a need.
- The team's existing React Native experience shortens the riskiest work:
  validating the guided-discovery learning loop.
- Pure physics functions remain independent of React Native, so rendering can
  be replaced without rewriting lesson content or collected measurements.

## When to reconsider Flutter

Run a focused Flutter spike only if a representative simulation cannot hold its
frame budget after moving high-frequency drawing off React state, or if the
roadmap becomes a custom-rendered simulation platform where most screens are
canvas scenes rather than normal application UI.

Do not decide from a pendulum demo alone. Benchmark a worst-case target such as
multiple interacting bodies, trails, graph updates, gestures, and low-end
Android hardware.

## Boundary carried over from RichFarm

Reusable:

- routing and app-shell concepts
- theme and localization patterns
- local-first state and explicit sync boundaries
- pure domain functions separated from UI

Not reusable:

- plant schemas and commands
- RichFarm sync projections
- native garden widgets
- API and dashboard domain code
- account/subscription complexity before product validation
