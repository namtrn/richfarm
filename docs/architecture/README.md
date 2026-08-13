# RichFarm Application Architecture

This directory is the source of truth for durable, cross-application architecture and engineering rules.

## What belongs here

- Runtime boundaries shared by more than one screen, feature, or app.
- Authentication, authorization, identity, ownership, and session contracts.
- Data-flow and synchronization rules.
- Client state, caching, offline, and recovery contracts.
- Invariants that new implementations and reviews must preserve.

Feature requirements, dated implementation plans, release evidence, and incident notes belong in `docs/specs/`, `docs/tasks/`, or `docs/reports/` instead. Architecture documents describe the lasting rule, not the history of one bug.

## Documents

- [Authentication and identity](./authentication-and-identity.md): Better Auth, Convex identity, guest behavior, authorization failures, and re-authentication rules.
- [Mobile state management](./mobile-state-management.md): mobile state ownership and coordination.
- [Dashboard architecture](./dashboard-architecture.md): dashboard data sources, list/search performance contract, and care guide editing rules.

## Documentation rules

1. State invariants before implementation details.
2. Identify every trust boundary and the component that owns it.
3. Separate local success from remote persistence success.
4. Document guest, authenticated, stale-session, offline, and account-transition behavior when applicable.
5. Link to canonical modules and tests, but do not duplicate source code.
6. Update the relevant document whenever a cross-app contract or data flow changes materially.

