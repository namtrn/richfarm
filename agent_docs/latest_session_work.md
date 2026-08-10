# Latest Session Work

## 2026-08-10 — Dashboard local authoring boundary

- Completed the Heavy-route P3.1 local-authoring increment.
- Dashboard Plant/i18n/care list, detail, search, review, and writes now use SQLite through authenticated API routes; Groups and Photos remain Convex-owned.
- Local writes always enqueue deduplicated outbox work. Operators may queue existing local drafts without publishing, then explicitly publish pending work to Convex.
- Manual sidebar-browser verification: `mồng tơi` and `mong toi` each returned the same 10 rows; a clean reload produced no new console errors.
- Independent verification: focused tests 13/13, full API tests 42/42, API build PASS, dashboard build PASS.
- Mobile was inspected and left unchanged because its current active flow already uses Convex → persisted local snapshot → local search.
- Deferred: current SQLite search is normalized in-memory filtering rather than FTS; optimize only after measured scale requires it.
