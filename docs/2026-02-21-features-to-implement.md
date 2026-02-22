# Richfarm — Features To Implement

> Date: 2026-02-21
> Scope: All remaining features **excluding auth** (Google OAuth, email/password, forgot password — already in progress via Better Auth)

---

## Current Status Summary

| Area | Completion | Notes |
|------|-----------|-------|
| Project Structure | 100% | Expo + Convex + NativeWind + i18n |
| Database Schema | 95% | 14 tables defined, `localId` on `harvestRecords` still missing |
| Localization (i18n) | 90% | 6 languages, dynamic switching |
| Garden Management | 90% | CRUD + detail + beds |
| Bed Management | 85% | CRUD, missing layout canvas |
| Plant Library | 85% | 60+ plants, search, filter, detail modal |
| Planning Tab | 85% | Add plant, camera, library link |
| Reminder System | 85% | CRUD, recurring rules, complete action |
| Growing Tab | 80% | Active plants, harvest action |
| Profile / Settings | 80% | Language, timezone, sync panel |
| Offline / Sync | 55% | Queue exists, flush partially works, photos local-only |
| Widgets | 30% | Structure files only |
| Push Notifications | 0% | Schema ready, no implementation |
| AI Features | 0% | Schema ready, no implementation |
| Weather | 0% | Not started |
| Analytics | 0% | Not started |

---

## 🔴 High Priority — Should Implement Next

### 1. Push Notifications for Reminders
**Why**: Reminders are useless without notifications — this is core to the app's value.
| Item | Detail |
|------|--------|
| Schema | `deviceTokens` table ready |
| Backend | Create `convex/cron.ts` — scan upcoming reminders, trigger push |
| Client | `expo-notifications` — register token, handle foreground/background |
| Files to create | `lib/notifications.ts`, `convex/cron.ts`, `hooks/useNotifications.ts` |
| Complexity | **High** |

### 2. Fix Sync Critical Bugs
**Why**: Data loss risk — users will lose activities/harvests on partial sync failure.
| Item | Detail |
|------|--------|
| Partial failure | `useSyncExecutor` removes all actions even if some failed — keep failed items in queue |
| Harvest idempotency | `harvestRecords` missing `localId` field — causes duplicates on re-sync |
| Empty sync calls | If queue has only photos, `batchSync` is called with empty arrays |
| Obsolete stub | `[plantId].tsx` still calls old `syncQueue()` stub |
| Inflight result | Returns `queuedCount: 0` when already running — misleading UI |

### 3. Photo Upload to Convex Storage
**Why**: Photos are local-only — they are lost if user reinstalls or switches device.
| Item | Detail |
|------|--------|
| Flow | Generate upload URL → upload binary → save `storageId` in `plantPhotos` |
| Backend | Enhance `convex/storage.ts` — `generateUploadUrl`, `savePhoto` mutation |
| Client | Upload hook, progress indicator, retry on failure |
| Complexity | **High** |

### 4. Harvest Logging UI (Complete)
**Why**: Schema + local UI exist, but backend sync has bugs and stats are missing.
| Item | Detail |
|------|--------|
| Backend | Create `convex/harvest.ts` with CRUD mutations/queries |
| UI | Harvest history screen, weekly/monthly stats charts |
| Link | Connect harvest log → preservation recipes |
| Complexity | **Medium** |

---

## 🟡 Medium Priority — Should Implement Within 2–4 Weeks

### 5. Activity Logs (Complete Backend)
**Why**: Schema + local UI exist, but need proper backend queries and history views.
| Item | Detail |
|------|--------|
| Backend | Create `convex/logs.ts` — query logs by plant, date range, type |
| UI | Timeline view in plant detail, filter by action type |
| Complexity | **Medium** |

### 6. Plant Detail / Edit Screen Improvements
**Why**: Currently a very long file (604 lines) with limited functionality.
| Item | Detail |
|------|--------|
| Date Picker | Replace text `YYYY-MM-DD` input with native `@react-native-community/datetimepicker` |
| Edit activity/harvest | Currently can only delete — need edit functionality |
| Full-screen photo viewer | Photos are tiny 120×120 thumbnails — add tap-to-zoom |
| Garden/Bed assignment | Let users move plants between beds |
| Complexity | **Medium** |

### 7. Garden Detail & Bed Management Enhancement
**Why**: Garden detail exists but bed management inside garden needs polish.
| Item | Detail |
|------|--------|
| Bed list in garden | Show plants count per bed, quick actions |
| Bed CRUD inside garden | Create/edit/delete beds from garden detail screen |
| Plant ↔ Bed assignment | Drag or select to assign plants to beds |
| Complexity | **Medium** |

### 8. Onboarding Flow
**Why**: Currently just a language picker → app. New users need guidance.
| Item | Detail |
|------|--------|
| Zone selection | Ask USDA hardiness zone or auto-detect from location |
| Frost dates | Input last spring / first fall frost dates |
| First garden creation | Guided wizard to create first garden + bed |
| Complexity | **Medium** |

### 9. Widget Implementation (iOS & Android)
**Why**: Structure exists but no real data or logic.
| Item | Detail |
|------|--------|
| iOS | Swift WidgetKit — show today's reminders, watering status |
| Android | Kotlin AppWidget — same as iOS |
| Bridge | `modules/widget-bridge/` — pass data from RN to native widgets |
| Complexity | **High** |

---

## 🟢 Lower Priority — Can Implement Later

### 10. AI Plant Identification
**Why**: Differentiating feature but not blocking MVP.
| Item | Detail |
|------|--------|
| API | Integrate Plant.id API or Google Cloud Vision |
| Backend | Complete `convex/aiAnalysisQueue.ts` — process queue, store results |
| UI | Photo capture → show top-3 results with confidence → select correct plant |
| Complexity | **High** |

### 11. Preservation Recipes UI
**Why**: Schema + i18n ready, just needs a browsable UI.
| Item | Detail |
|------|--------|
| UI | Recipe browser — filter by method (dry/ferment/pickle/etc.) |
| Link | Connect recipes to plants (which plants work for which recipe) |
| Link | Connect to harvest log — "Preserve this harvest" |
| Complexity | **Low** |

### 12. Weather Integration
**Why**: Useful but not critical for MVP.
| Item | Detail |
|------|--------|
| API | OpenWeatherMap or similar — current conditions + forecast |
| Features | Smart watering suggestions (skip if rain expected), frost alerts |
| UI | Weather card on garden/homepage |
| Complexity | **Medium** |

### 13. Analytics & Statistics Dashboard
**Why**: Nice-to-have for engagement.
| Item | Detail |
|------|--------|
| Metrics | Harvest totals (kg/week, kg/month), plant success rate, most productive plants |
| UI | Charts/graphs in profile or dedicated tab |
| Complexity | **Medium** |

### 14. Garden Canvas / Visual Layout
**Why**: Currently list-only view of beds.
| Item | Detail |
|------|--------|
| UI | Visual grid canvas — drag-drop plants into square-foot layout |
| Companion warnings | Show alerts when incompatible plants are placed near each other |
| `layoutJson` | Already in beds schema — store canvas state |
| Complexity | **High** |

### 15. True Offline-First Support
**Why**: Currently relies on Convex caching — needs proper offline queue.
| Item | Detail |
|------|--------|
| Approach | AsyncStorage queue for all mutations, auto-sync on reconnect |
| Conflict resolution | Version-based — already in `userPlants` schema |
| Network detection | `@react-native-community/netinfo` already installed |
| Complexity | **High** |

---

## 🔧 Technical Debt (Should Address Alongside Features)

| # | Issue | Priority |
|---|-------|----------|
| 1 | Global error boundary + retry logic | High |
| 2 | TypeScript strict mode — remove remaining `any` types | Medium |
| 3 | Performance — `useMemo`/`useCallback` in tab screens | Medium |
| 4 | Unit tests for hooks and Convex functions | Low (for MVP) |
| 5 | Maestro E2E test coverage (currently 1 smoke test) | Low |

---

## Suggested Implementation Order

```
Phase 1 (Week 1-2): Core completion
  ├── Fix sync critical bugs (#2)
  ├── Push notifications (#1)
  └── Photo upload to Convex (#3)

Phase 2 (Week 3-4): Feature completion
  ├── Harvest logging complete (#4)
  ├── Activity logs backend (#5)
  ├── Plant detail improvements (#6)
  └── Onboarding flow (#8)

Phase 3 (Week 5-6): Enhancement
  ├── Garden/Bed enhancements (#7)
  ├── Preservation recipes UI (#11)
  └── Widgets (#9)

Phase 4 (Week 7+): Differentiation
  ├── AI plant identification (#10)
  ├── Weather integration (#12)
  ├── Analytics dashboard (#13)
  └── Garden canvas (#14)
```
Report: Plan hợp lý, ưu tiên đúng (sync + push + photo), nhưng cần bổ sung tiêu chí hoàn thành, phụ thuộc kỹ thuật (APNs/FCM, migration `localId`, chính sách ảnh), cùng kế hoạch test/rollback để giảm rủi ro.
