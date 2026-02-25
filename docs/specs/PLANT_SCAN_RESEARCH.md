# 🔬 Plant Scan / Detect Feature — Full Research Report

> **Date**: 2026-02-23
> **Author**: AI Research Agent
> **Sources**: Reddit (r/houseplants, r/gardening, r/plantclinic, r/IndoorGarden), App Store Reviews, Play Store Reviews, API Documentation, Academic Studies  
> **As-of**: 2026-02-23 (pricing/terms and APIs can change — recheck before implementation)

---

## Table of Contents

0. [Methodology & Evidence Notes](#0-methodology--evidence-notes)
1. [Competitor Deep Dive](#1-competitor-deep-dive)
2. [User Forum Feedback (Anecdotal)](#2-user-forum-feedback-anecdotal)
3. [General User Pain Points & Wishes](#3-general-user-pain-points--wishes)
4. [Plant Identification API Comparison](#4-plant-identification-api-comparison)
5. [Technical Edge Cases & Solutions](#5-technical-edge-cases--solutions)
6. [Rate Limiting & Abuse Prevention Strategy](#6-rate-limiting--abuse-prevention-strategy)
7. [Existing Infrastructure in Richfarm](#7-existing-infrastructure-in-richfarm)
8. [Recommendations & Decision Log](#8-recommendations--decision-log)
9. [Appendix A — Source Links (Forums & Reviews)](#9-appendix-a--source-links-forums--reviews)

---

## 0. Methodology & Evidence Notes

- This report combines official docs (API/pricing/terms), peer‑reviewed studies/extension evaluations, and user forum feedback.
- Forum feedback is **anecdotal** and **not statistically representative**; use it to identify themes, not to quantify prevalence. Sample threads are listed in Appendix A.
- Accuracy comparisons vary by dataset, scoring method, geography, and app version; treat them as directional, not absolute. See Section 4.2 for normalized notes.
- App‑store descriptions reflect vendor claims; they are useful for feature scope but not accuracy.

---

## 1. Competitor Deep Dive

### 1.1 Planta: Plant & Garden Care

**Overview**: Subscription-based plant care app focused on reminders and plant identification. (See app listing for feature scope.)  
Source: App Store listing — https://apps.apple.com/us/app/planta-complete-plant-care/id1410126781

**Features Relevant to Scan/Detect** (per app listing):
- Instant plant identification from photo
- "Dr. Planta" diagnostic/plant doctor feature
- Care schedules/reminders (watering, fertilizing, etc.)
- Light meter
- Plant journal / collection tracking

**User Feedback (Anecdotal — Reddit)**:
- Many users treat watering reminders as prompts to check soil rather than follow blindly; several threads describe schedules that water too often, especially for succulents or sensitive plants.  
  Sources:  
  - https://www.reddit.com/r/succulents/comments/1ebjqbh  
  - https://www.reddit.com/r/plants/comments/137tvuv  
  - https://www.reddit.com/r/houseplants/comments/13gh00p  
  - https://www.reddit.com/r/houseplants/comments/1encd2t
- Some users disable or ignore misting advice and rely on their own judgment/humidity setup.  
  Sources:  
  - https://www.reddit.com/r/plants/comments/137tvuv  
  - https://www.reddit.com/r/plants/comments/13zivbo

**Key Lessons for Richfarm**:
1. Frame reminders as “check” prompts, not prescriptions.
2. Watering guidance must be contextual (environment, soil, pot size) or users will override it.
3. Provide easy schedule overrides and “snooze” controls to keep trust.

---

### 1.2 Blossom — Plant Care Guide

**Overview**: Feature-rich plant care app with plant identification, disease diagnosis, care reminders, and chatbot-style help.  
Source: App Store listing — https://apps.apple.com/us/app/blossom-plant-identification/id1445975597

**Claimed Features** (per app listing):
- Plant identification
- Disease identification from plant photos — provides diagnosis, causes, treatment, prevention
- Personalized care reminders (watering, fertilizing, repotting) adapted to lighting/season
- Water calculator based on plant type + pot size
- AI Botanist chatbot for Q&A
- Weather alerts with care guidance
- Green Blog (articles + video tutorials)
- Plant journal with photo attachments
- Collections organized by room
- Multiple image support for better identification accuracy

**User Feedback (Anecdotal — Reddit)**:
- A February 2025 thread reports quality declines: crashes, chatbot responses that feel automated, less personalized schedules, and perceived declines in ID/diagnosis accuracy.  
  Source: https://www.reddit.com/r/plantclinic/comments/1ik19m2

**Key Lessons for Richfarm**:
1. **Quality must be maintained** — Blossom's decline shows users will leave fast if accuracy drops
2. AI chatbot is a risky feature — if it gives bad answers, it's worse than no chatbot
3. Disease diagnosis is highly valued but must be accurate
4. Don't over-promise on plant count; accuracy matters more than database size
5. Care info must be substantial — empty profiles are worse than no profile

---

### 1.3 Planter: Garden Planner

**Overview**: Focused on garden layout planning rather than plant identification; uses a grid / square‑foot planning workflow.  
Source: https://planter.garden/

**Features**:
- Garden grid layout planner (square-foot method)
- Companion planting information (which plants grow well together / which to avoid)
- Sowing, fertilizing, watering, and harvesting schedules
- Supports vegetables, flowers, and fruits
- Location-aware frost date information

**User Feedback (Anecdotal — Reddit)**:
- Some users report conflicting advice when comparing Planter to other apps; treat as anecdotal and validate against horticultural sources.  
  Source: https://www.reddit.com/r/vegetablegardening/comments/1cv95n3

**Key Lessons for Richfarm**:
1. Not a direct competitor for scan feature (planning-focused)
2. Companion planting data is highly valued by users — we already have this in `plantsMaster`
3. Garden size restrictions frustrate users — good that our bed system is flexible
4. Information accuracy is paramount — conflicting data is the #1 complaint

---

### 1.4 GrowIt: Garden Planner (Vegetable Garden Care)

**Overview**: Targeted at home gardeners, especially beginners; combines garden planning with plant identification and community features.  
Source: App Store listing — https://apps.apple.com/us/app/growit-vegetable-garden/id920034986

**Features Relevant to Scan/Detect**:
- Plant identification via photo
- Disease diagnosis
- Zip code-based climate recommendations
- Companion planting info
- Growth tracking with photos
- Community feature (connect with local growers, rate plants)
- Weather warnings
- Care reminders (watering, fertilizing, harvesting)

**User Feedback (Anecdotal — App Store Reviews)**:
- Reviews mention missing plants in the database and a desire for more granular watering guidance.  
  Source: App Store reviews on listing — https://apps.apple.com/us/app/growit-vegetable-garden/id920034986

**Key Lessons for Richfarm**:
1. Community features are valued but complex to build — consider for future.
2. Coverage gaps (missing plants) are a common pain point — require curation + user feedback loops.
3. Zip/zone-based recommendations work well — we already have USDA zone support.

---

## 2. User Forum Feedback (Anecdotal)

### 2.1 Frequently Mentioned Apps in Reddit Threads (Not Ranked)
- **Seek / iNaturalist** — commonly recommended free options for identification.  
  Sources:  
  - https://www.reddit.com/r/houseplants/comments/15tgqw1  
  - https://www.reddit.com/r/NoStupidQuestions/comments/15yls6d
- **PlantNet** — frequently mentioned as a free, science‑oriented identifier.  
  Sources:  
  - https://www.reddit.com/r/houseplants/comments/15tgqw1  
  - https://www.reddit.com/r/NoStupidQuestions/comments/15yls6d
- **Google Lens** — mentioned as a convenient baseline, though not plant‑specific.  
  Sources:  
  - https://www.reddit.com/r/houseplants/comments/15tgqw1  
  - https://www.reddit.com/r/ios/comments/1de271n
- **PictureThis** — often cited as accurate but criticized for aggressive paywalls/subscriptions.  
  Sources:  
  - https://www.reddit.com/r/botany/comments/18v81bd  
  - https://www.reddit.com/r/NoStupidQuestions/comments/15yls6d

### 2.2 Common Themes (Qualitative)
- Desire for **reliable identification** and confidence scores.
- Preference for **customizable reminders** and reduced manual entry.
- Interest in **disease/pest diagnosis**, but skepticism about accuracy without evidence.
- Frustration with **aggressive paywalls** for basic features.

Notes:
- These themes are **directional only** and drawn from a limited set of threads. See Appendix A for source links.

---

## 3. General User Pain Points & Wishes

### 3.1 Pain Points Matrix (Qualitative, Anecdotal)

| Category | Pain Point | Severity | Affected Apps | Evidence |
|---|---|---|---|---|
| **Pricing** | Aggressive paywalls for core features | 🔴 Critical | PictureThis | Forum samples (Appendix A) |
| **Pricing** | Subscription value questioned | 🟡 High | Blossom | Forum samples (Appendix A) |
| **Accuracy** | Watering schedules feel too generic | 🔴 Critical | Planta, Blossom | Forum samples (Appendix A) |
| **Accuracy** | Diagnosis/ID reliability concerns | 🟡 High | Blossom | Forum samples (Appendix A) |
| **Reliability** | App crashes / degraded quality | 🟡 High | Blossom | Forum samples (Appendix A) |
| **Content** | Missing plants / limited coverage | 🟠 Medium | GrowIt | App Store reviews (Appendix A) |
| **UX** | Heavy manual data entry | 🟠 Medium | General | Anecdotal (needs validation) |
| **Privacy** | Data usage / AI training uncertainty | 🟢 Low | General | Anecdotal (needs validation) |

### 3.2 User Wishes — Hypotheses to Validate

_Derived from a qualitative scan of forum posts and reviews; validate via interviews/surveys before prioritizing._

| Wish | Detail | Feasibility for Richfarm |
|---|---|---|
| **Free accurate plant ID** | Willing to accept limited scans/day if quality is high | ✅ Can do with rate-limited plant.id |
| **Disease diagnosis from photo** | Snap a pic of sick leaf, get diagnosis + treatment | ✅ plant.id health assessment API |
| **Adaptive watering schedules** | Account for pot size, soil type, season, location, humidity | ⚠️ Partial — need sensor data or manual input |
| **Educational "why" content** | Don't just say "water now" — explain why and what to look for | 🟡 Future — can add to care guides |
| **Companion planting guidance** | What grows well together vs. what to avoid | ✅ Already in `plantsMaster.companionPlants` |
| **Photo growth journal** | Track plant progress over time with photos | ✅ Already have `plantPhotos` table |
| **Offline functionality** | Core features work without internet | ⚠️ Scan needs internet; cache results |
| **Community features** | Connect with local growers, share tips | 🔴 Future — complex to build |
| **One-time purchase option** | Users who hate subscriptions | 🟡 Pricing decision needed |
| **Custom reminders** | Set specific times, custom task types | ✅ Already have flexible `reminders` table |

---

## 4. Plant Identification API Comparison

### 4.1 Detailed API Comparison

#### 4.1.1 plant.id (by Kindwise)

**Website**: https://plant.id
**Documentation**: https://plant.id/docs

**Capabilities**:
- Plant species identification from photo (single or multiple images)
- Health assessment (diseases, pests, abiotic disorders) — separate from ID
- Returns: common name, scientific name, probability score, description, similar images, taxonomy
- Disease database with treatment recommendations

**Pricing** (credit-based; _as of 2026-02-23_):  
Source: https://web.plant.id/pricing/
| Volume | Price/Credit | Minimum Order |
|---|---|---|
| 1,000 credits | €0.05 | €50 |
| 10,000 credits | €0.03 | €300 |
| 50,000 credits | €0.02 | €1,000 |
| 200,000 credits | €0.015 | €3,000 |
| 800,000 credits | €0.012 | €9,600 |
| 1,500,000 credits | €0.01 | €15,000 |

- Credits are valid for 3 months (see pricing notes).  
  Source: https://www.kindwise.com/pricing
- Each successful identification deducts **1 credit**; plant.health adds **1 additional credit** when requested together.  
  Sources:  
  - https://www.kindwise.com/faq  
  - https://www.kindwise.com/plant-health
- Demo limits and initial free credits are described in the FAQs (limits can change).  
  Source: https://www.kindwise.com/faqs-admin-panel
- Prepaid billing is standard; **retroactive monthly invoicing** is available for long‑term clients.  
  Source: https://web.plant.id/pricing/

**Accuracy**:
- See Section 4.2 for normalized notes from published evaluations. Accuracy varies by dataset and scoring method.

**Integration for React Native**:
- REST API with JSON responses  
- Authentication via `Api-Key` header  
- Image submission: Base64 in JSON or multipart/form-data; optional `latitude/longitude` to improve accuracy  
- No official SDK, but simple HTTP integration  
Sources:  
  - https://www.postman.com/winter-shadow-932363/workspace/kindwise/collection/24599534-c4a4048d-ed97-4532-8980-3159ddbfe629  
  - https://www.kindwise.com/handbook
  
Example endpoint: `POST https://plant.id/api/v3/identification`

**Request format**:
```json
{
  "images": ["base64_encoded_image_string"],
  "latitude": 49.207,
  "longitude": 16.608,
  "similar_images": true
}
```

**Response format (simplified)**:
```json
{
  "result": {
    "classification": {
      "suggestions": [
        {
          "name": "Monstera deliciosa",
          "probability": 0.95,
          "details": {
            "common_names": ["Swiss cheese plant"],
            "taxonomy": { "family": "Araceae" },
            "description": { "value": "..." },
            "image": { "value": "https://..." }
          }
        }
      ]
    }
  }
}
```

**Pros**:
- Health assessment included (diseases, pests)
- Rich response data (care info, taxonomy, images)
- Simple REST API integration
- Supports location context for better accuracy

**Cons**:
- Not free — credit-based pricing
- Credits expire after 3 months (per pricing notes)
- No official React Native SDK (but REST is fine)

---

#### 4.1.2 PlantNet

**Website**: https://plantnet.org
**Documentation**: https://my.plantnet.org/usage/api

**Capabilities**:
- Plant species identification from photo
- Multiple image support (leaf, flower, fruit separately)
- Community-driven database (citizen science)
- Returns: scientific name, common names per locale, confidence score, similar images
- Specialized botanical focus

**Pricing**:
- **Free** for up to 500 requests/day for non‑commercial use (per terms/pricing)  
- Commercial usage beyond free limits requires a paid plan or agreement  
Sources:  
  - https://my.plantnet.org/doc/terms  
  - https://my.plantnet.org/doc/pricing

**Accuracy**:
- See Section 4.2 for normalized notes from published evaluations.

**Integration**:
- REST API
- API key via query parameter or header
- Image as URL or multipart upload (JPEG/PNG; up to 5 images; total POST size <= 50MB)  
  Source: https://my.plantnet.org/doc/api/identify
- Endpoint: `POST https://my-api.plantnet.org/v2/identify/all`

**Pros**:
- Free for most use cases
- Scientifically curated database
- Contributes to biodiversity research
- Multi-locale support for common names

**Cons**:
- **No disease detection** — identification only
- No care information in responses
- Commercial usage requires agreement beyond free limits (see terms)
- Community-driven means some species have limited coverage

---

#### 4.1.3 Google Cloud Vision API

**Website**: https://cloud.google.com/vision
**Documentation**: https://cloud.google.com/vision/docs

**Capabilities**:
- General image analysis (not plant-specific)
- Label detection (returns generic labels like "flower", "plant", "tree")
- Object localization
- Text detection (OCR)
- Safe search detection
- GenAI Vision for custom analysis (2025 — disease detection demos)

**Pricing**:
- Free tier: 1,000 units/month
- $1.50 per 1,000 units for label detection
- More complex features cost more

**Accuracy for Plant ID**:
- Not plant‑specific; would require a custom model or plant database for species‑level ID

**Pros**:
- Google infrastructure reliability
- General-purpose (can do more than just plants)

**Cons**:
- **Not specialized for plants** — low accuracy for species identification
- No built-in plant database
- No disease detection (would require custom ML model)
- Would need to build plant-matching logic on top
- More complex SDK integration
- Raw labels are not useful ("flower" is not "Monstera deliciosa")

---

#### 4.1.4 PictureThis (API unavailable)

**Note**: PictureThis is a consumer app only. They do NOT offer a public API for developers. Cannot be integrated into third-party apps. Included here for reference only since Reddit frequently mentions it.

 - Commonly cited by users, but no public developer API
 - Aggressive paywall complaints appear in forum threads (see Appendix A)

---

#### 4.1.5 Comparison Table

| Feature | plant.id | PlantNet | Google Vision |
|---|---|---|---|
| Plant ID accuracy | Reported performance varies by study (see 4.2) | Reported performance varies by study (see 4.2) | Not plant‑specific (label detection) |
| Disease detection | ✅ Built-in | ❌ No | ❌ No (custom only) |
| Care info returned | ✅ Common names, desc, taxonomy | ⚠️ Scientific name + common names | ❌ Generic labels |
| Multi-image support | ✅ Yes | ✅ Yes | ✅ Yes |
| Location context | ✅ Lat/Lon for better results | ✅ Flora filters | ❌ No |
| Free tier | Demo limits in FAQ (see provider) | Free up to 500/day non‑commercial | See provider pricing |
| Paid pricing | See provider pricing | Paid plans for commercial use | See provider pricing |
| API complexity | Easy (REST + JSON) | Easy (REST) | Medium (SDK) |
| Response richness | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐ |
| React Native fit | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |

---

### 4.2 Evidence on Identification Accuracy (Not Directly Comparable)

Accuracy claims are **highly sensitive** to dataset, geography, and scoring rules. Use these studies to understand **relative behavior**, not absolute % across apps.

**Published / Extension Evaluations**:
- **AoB PLANTS (2020)** — British flora dataset; compares multiple apps and notes variability by taxonomic rank and app version.  
  Source: https://academic.oup.com/aobpla/article/12/6/plaa052/5931086
- **Michigan State University Extension (2023)** — Comparative evaluation across several apps; emphasizes variability and practical limitations in real‑world identification.  
  Source: https://www.canr.msu.edu/news/which-plant-identification-app-is-best
- **University of Maryland Extension (2025)** — Tests multiple apps on forage/pasture species and highlights that accuracy varies by species and photo quality.  
  Source: https://extension.umd.edu/resource/plant-identification-apps-part-1/

**Normalization Guidance**:
- Do not compare raw % across studies unless datasets and scoring rules match.
- Prefer **confidence + fallback UI** (top‑3 results) over single‑label certainty.

---

## 5. Technical Edge Cases & Solutions

### 5.1 Network & Connectivity

| # | Edge Case | Impact | Solution | Implementation |
|---|---|---|---|---|
| 1 | **No internet before initiating scan** | User gets confusing error | Check connectivity via `expo-network` BEFORE starting upload | `import * as Network from 'expo-network'; const status = await Network.getNetworkStateAsync(); if (!status.isConnected) { show "no internet" UI }` |
| 2 | **Internet drops during image upload to Convex Storage** | Upload hangs indefinitely | Set timeout on upload (30s); catch network error; show retry button | `try { await uploadWithTimeout(uri, 30000) } catch(e) { showRetry() }` |
| 3 | **Internet drops during plant.id API call** | Convex action hangs; user waits forever | Convex action has built-in timeout; set scan status to "failed"; show retry to user | Store status in `plantScans` table; poll from client |
| 4 | **Slow 3G/Edge connection** | Upload takes minutes; bad UX | Compress image before upload (max 1MB); show progress bar; allow cancel | Use `expo-image-manipulator` for compression |
| 5 | **VPN/proxy blocks plant.id domain** | API call fails silently | Detect specific HTTP errors; show "service unavailable — check network settings" | Catch HTTP 403/connection refused specifically |
| 6 | **Airplane mode toggled mid-scan** | Partial operation state | Track scan status in DB; on app resume, check for pending scans and either retry or show cached result | `plantScans.status === "processing"` → retry on next open |

### 5.2 Image Quality & Content

| # | Edge Case | Impact | Solution | Implementation |
|---|---|---|---|---|
| 7 | **Blurry / out-of-focus image** | Low confidence results | If top suggestion < 30% confidence → show "try a clearer photo" message | Check `result.suggestions[0].probability < 0.3` |
| 8 | **Very dark image** | Can't identify anything | API returns no results or very low confidence | Same as blurry — suggest better lighting |
| 9 | **Image is not a plant** (person, food, car) | API returns "no results" or wrong plant match | Show "We couldn't identify a plant in this image" + suggestion to try another photo | Check if suggestions array is empty or top < 10% |
| 10 | **Multiple plants in frame** | API identifies the most prominent one; others missed | Show "Multiple plants detected? Try photographing one at a time" if results seem mixed | Could add multi-crop in future |
| 11 | **Very zoomed-in (texture only)** | Not enough context for identification | API will have low confidence; suggest zooming out | Show when confidence < 30% |
| 12 | **Screenshot from internet** | API may identify correctly but user doesn't own plant | Allow it — useful for learning. Consider de-emphasizing "Add to Garden" for screenshots | No technical restriction needed |
| 13 | **Dried/dead plant** | Harder to identify; health assessment more valuable here | Show both ID suggestions and health assessment prominently | Prioritize health results in UI |
| 14 | **Artificial/fake plant** | API may mis-identify or report as healthy | No easy detection; let it flow normally | Acceptable edge case |
| 15 | **Image too large (>10MB RAW)** | Upload slow/fails; API rejects | Compress to max 1MB / 1024px on longest side before upload | Pre-process with `expo-image-manipulator` |

### 5.3 API & Service Issues

| # | Edge Case | Impact | Solution | Implementation |
|---|---|---|---|---|
| 16 | **plant.id returns HTTP 429 (rate limited)** | Too many requests from our server | Retry once after 2-second delay; if still 429, fall back to PlantNet for basic ID | Exponential backoff: wait 2s → retry → if fails, use PlantNet |
| 17 | **plant.id returns HTTP 500** | Server error on their end | Log error with request ID; show "service temporarily unavailable" to user; auto-retry once | `plantScans.errorMessage = "API 500"` |
| 18 | **plant.id returns unexpected/malformed JSON** | App crash if not handled | Wrap parsing in try-catch; log raw response for debugging; show generic error | `try { JSON.parse() } catch { logError(); showGenericError() }` |
| 19 | **API key expired or invalid** | All scans fail | Detect 401/403 response; log CRITICAL alert; show "service temporarily unavailable" (don't expose API details) | Check response.status === 401 → critical log |
| 20 | **Credits exhausted (budget depleted)** | Scans stop working entirely | Immediate fallback to PlantNet API (free); provide ID-only results (no disease detection); alert admin | Monitor credit balance; PlantNet as degraded fallback |
| 21 | **API response timeout (>30s)** | User waits too long | 30-second timeout on HTTP fetch in Convex action; mark scan as "failed"; offer retry | `AbortController` with 30s timeout |
| 22 | **API returns 0 suggestions** | Valid response but no identification | Show "We couldn't identify this plant" + tips for better photos | Empty suggestions array → show tips UI |
| 23 | **Lat/Lon unavailable** | Slightly lower accuracy (no location context) | Scan still works without coordinates; just omit from request | Make latitude/longitude optional in request |

### 5.4 Rate Limiting Edge Cases

| # | Edge Case | Impact | Solution | Implementation |
|---|---|---|---|---|
| 24 | **User scans exactly at midnight** | Daily count resets; could squeeze extra scans | Use UTC-based day boundary for consistency; minor issue | `scannedAt >= todayUTCStart && scannedAt < tomorrowUTCStart` |
| 25 | **User has multiple devices** | Could bypass per-device limit | Rate limit is per-USER (not per-device) — enforced server-side via userId | Query `plantScans` by `userId` not device |
| 26 | **User deletes and recreates account** | Could reset scan count | Rate limit tied to user record; new account = new limits (acceptable) | Minor abuse vector; not worth blocking |
| 27 | **Concurrent scan requests** | User taps button twice quickly; two API calls | Debounce on client (5s cooldown); server-side check for recent pending scan | Client: disable button after tap. Server: check `status === "processing"` for this user in last 10s |
| 28 | **Failed scans counting toward limit** | Unfair to user | Only count scans with `status === "completed"` toward daily limit | Filter: `plantScans.where(s => s.status === "completed" && s.scannedAt >= todayStart)` |
| 29 | **Admin/tester needs unlimited scans** | Can't test with 5/day limit | Add admin bypass: if `users.subscription.tier === "admin"`, skip rate check | Special tier check in action |

### 5.5 Data & Integration

| # | Edge Case | Impact | Solution | Implementation |
|---|---|---|---|---|
| 30 | **Scan result matches a `plantsMaster` record** | Best case: pre-fill all garden data | Match by scientific name (`scientificName` field); link via `matchedPlantMasterId` | `db.query("plantsMaster").withIndex("by_scientific_name", q => q.eq("scientificName", result.scientificName))` |
| 31 | **Scan result has no `plantsMaster` match** | User gets ID but can't auto-add to garden | Allow creating as "custom plant" with data from API response (name, description) | Redirect to "Add Custom Plant" flow pre-filled |
| 32 | **Multiple close matches in `plantsMaster`** | App picks wrong one; user gets wrong care info | Show top 3 matches from both API and local DB; let user choose or confirm | Present selection UI |
| 33 | **User's locale not matching API response** | API returns English; user expects Vietnamese | Map API scientific name → find i18n data via `plantI18n` table | Show localized name if available, fallback to API English name |
| 34 | **Extremely rare/exotic plant** | Not in API database; not in our `plantsMaster` | Show "rare plant — limited info available" + allow manual entry | Graceful degradation |

### 5.6 Device-Specific Issues

| # | Edge Case | Impact | Solution | Implementation |
|---|---|---|---|---|
| 35 | **Camera permission denied** | Can't take photo | Catch permission error; show "Camera access needed" with link to settings | `expo-image-picker` handles this; add custom message |
| 36 | **Gallery permission denied** | Can't choose photo from library | Same as camera — show permission instructions | Built into `expo-image-picker` |
| 37 | **No camera on device** (simulator/iPad) | Camera button does nothing | Hide camera button; only show gallery option | Check `ImagePicker.getCameraPermissionsAsync()` availability |
| 38 | **Device storage full** | Can't save captured photo temporarily | Catch storage error; suggest clearing space | Try-catch around image picker |
| 39 | **App backgrounded during scan** | Scan continues on server; result available when returning | Poll `plantScans` table on app foreground; show result if ready | Convex reactive query will auto-update |

---

## 6. Rate Limiting & Abuse Prevention Strategy

### 6.1 Rationale

**Why rate limit?**
1. **Cost control**: Each ID consumes 1 credit; adding health assessment consumes another credit. At €0.05/credit (1k tier), that’s ~€0.05–€0.10 per scan (as of 2026-02-23).  
   Sources:  
   - https://www.kindwise.com/faq  
   - https://www.kindwise.com/plant-health  
   - https://web.plant.id/pricing/
2. **Abuse prevention**: Bots or scripts could exhaust credits in minutes
3. **Fair usage**: Ensure all users can benefit, not just heavy users
4. **API provider limits**: plant.id may rate-limit our API key if we over-request

### 6.2 Proposed Limits

| User Tier | Daily Limit | Monthly Limit | Cost/User/Day (max) |
|---|---|---|---|
| Free | 5 scans | ~150/month | €0.50 |
| Premium | 20 scans | ~600/month | €2.00 |
| Admin/Tester | Unlimited | Unlimited | Variable |

_Assumption_: 2 credits/scan (ID + health) at €0.05/credit tier. Adjust if pricing or credit usage changes.  
Sources:  
- https://www.kindwise.com/faq  
- https://www.kindwise.com/plant-health  
- https://web.plant.id/pricing/

**Cost projection at 1,000 free users (10% active/day)**:
- 100 active users × 3 avg scans/day = 300 scans → 600 credits → €30/day → ~€900/month
- With 10,000 credit pricing (€0.03): ~€540/month (if volume pricing applies)

### 6.3 Implementation Details

**Server-side enforcement** (in Convex action):
```
1. Query plantScans WHERE userId = currentUser AND scannedAt >= todayStart AND status = "completed"
2. Count results
3. If count >= dailyLimit(user.subscription.tier) → throw "RATE_LIMIT_EXCEEDED"
4. Else → proceed with scan
```

**Client-side UX**:
- Show remaining scans counter: "3/5 scans remaining today"
- Disable scan button when limit reached
- Show countdown to reset: "Resets in 6 hours"
- Premium upsell: "Upgrade for 20 daily scans"

**Anti-abuse measures**:
| Measure | Purpose | Implementation |
|---|---|---|
| Server-side rate limit | Can't be bypassed by client manipulation | Query DB before API call |
| 5-second debounce | Prevent accidental double-taps | Client-side button disable |
| Pending scan check | Prevent concurrent scan requests | Check for `status === "processing"` before starting new one |
| Image hash comparison | Detect same image submitted repeatedly | Use perceptual hash (pHash/dHash) after normalizing size/format; avoid raw Base64 MD5 |
| Failed scan exclusion | Don't count errors against user's limit | Only count `status === "completed"` |

---

## 7. Existing Infrastructure in Richfarm

### 7.1 What We Already Have (Reduces Work Significantly)

| Component | Location | Relevance |
|---|---|---|
| **Image upload infrastructure** | `convex/storage.ts` | `generateUploadUrl()` + `savePhoto()` — reuse for scan image upload |
| **`expo-image-picker`** | `package.json` | Already installed — use for camera/gallery |
| **`plantPhotos` table with AI fields** | `convex/schema.ts:266-295` | Has `analysisResult`, `analysisStatus`, `aiModelVersion` — can extend |
| **`aiAnalysisQueue` table** | `convex/schema.ts:450-467` | Queue system already designed for background AI processing |
| **`plantsMaster` with `scientificName`** | `convex/schema.ts:83-127` | Can match scan results to existing plant database |
| **`plantI18n` table** | `convex/schema.ts:132-139` | Localized names for matched plants |
| **User auth + `requireUser`** | `convex/lib/user.ts` | Auth helper already exists for securing mutations/actions |
| **Device ID system** | `lib/deviceId.ts` | For anonymous users |
| **i18n system** | `lib/i18n.ts` + `lib/locales/` | 6 languages already configured |
| **`expo-network`** | `package.json` | Already installed — for connectivity checks |
| **`subscription` field on users** | `convex/schema.ts:49-52` | Tier system exists for rate limit differentiation |
| **Maestro E2E tests** | `.maestro/` | Test framework already set up |
| **Theme system** | `lib/theme.ts` | For consistent UI styling |

### 7.2 What Needs To Be Built

| Component | Type | Complexity |
|---|---|---|
| `plantScans` schema table | Schema change | Low |
| `convex/plantScan.ts` action (API proxy) | Backend | High |
| Rate limit logic in action | Backend | Medium |
| `hooks/usePlantScan.ts` | Frontend hook | Medium |
| `app/(tabs)/scan.tsx` UI | Frontend screen | High |
| Scan results display components | Frontend UI | Medium |
| "Add to Garden" from scan result flow | Frontend navigation | Medium |
| i18n translations (6 languages) | Content | Low |
| Image compression before upload | Frontend utility | Low |
| Maestro smoke test | Testing | Low |

---

## 8. Recommendations & Decision Log

### 8.1 API Recommendation

**Primary**: plant.id (Kindwise)
- Strong feature coverage (ID + health assessment) and rich response data; see Section 4.2 for accuracy evidence
- Budget: Start with 1,000 credits (€50) for MVP testing

**Fallback**: PlantNet (free)
- Activate when plant.id credits are exhausted
- ID-only (no disease detection) — show "health assessment unavailable" in results
 - **Compliance note**: commercial usage beyond free limits requires a paid plan/contract — confirm ToS before shipping fallback.  
   Source: https://my.plantnet.org/doc/terms

### 8.2 Architecture Recommendation

**Proxy pattern via Convex HTTP Action**:
```
Client → Convex Action (server) → plant.id API
               ↓
     plantScans table (result stored)
               ↓
     Client receives result via reactive query
```

This pattern:
- ✅ Keeps API key server-side only (security)
- ✅ Enables server-side rate limiting (can't be bypassed)
- ✅ Stores scan history for future analytics
- ✅ Allows background processing if needed
- ✅ Automatic retry logic on server

### 8.3 UX Recommendation

Based on competitor failures and Reddit feedback:

1. **Don't lock scan behind paywall** — offer free tier (5/day) to build trust
2. **Show confidence clearly** — "95% match" is more trustworthy than just a name
3. **Always offer alternatives** — show top 3 results, not just top 1
4. **Disease detection is a killer feature** — competitors either don't have it or do it poorly
5. **Auto-populate from scan** — reduce manual data entry (biggest UX win vs competitors)
6. **Show honest "I don't know"** — when confidence is low, say so (builds trust vs competitors who guess wildly)

### 8.4 Open Decisions (Need User Input)

| Decision | Options | Recommendation |
|---|---|---|
| API choice | plant.id (€0.05/credit, as of 2026-02-23) vs PlantNet (free up to 500/day non‑commercial) | plant.id primary + PlantNet fallback |
| Daily scan limit (free) | 3, 5, or 10 | 5/day (balanced) |
| Daily scan limit (premium) | 10, 20, or unlimited | 20/day |
| Where to put scan tab | Bottom nav tab / Floating button / Inside Health screen | New bottom nav tab |
| Image compression target | 512KB / 1MB / 2MB | 1MB (good quality + fast upload) |
| Scan both ID + health by default | Always both (2 credits) / User chooses / ID only default | Always both (best user value) |

---

## 9. Appendix A — Source Links (Forums & Reviews)

**Reddit Threads (Sample, Anecdotal)**
- Planta watering/misting discussions:  
  - https://www.reddit.com/r/succulents/comments/1ebjqbh  
  - https://www.reddit.com/r/plants/comments/137tvuv  
  - https://www.reddit.com/r/plants/comments/13zivbo  
  - https://www.reddit.com/r/houseplants/comments/13gh00p  
  - https://www.reddit.com/r/houseplants/comments/1encd2t
- Blossom quality decline report:  
  - https://www.reddit.com/r/plantclinic/comments/1ik19m2
- Planter conflicting info discussion:  
  - https://www.reddit.com/r/vegetablegardening/comments/1cv95n3
- Plant identification app recommendations / paywall complaints:  
  - https://www.reddit.com/r/houseplants/comments/15tgqw1  
  - https://www.reddit.com/r/NoStupidQuestions/comments/15yls6d  
  - https://www.reddit.com/r/botany/comments/18v81bd  
  - https://www.reddit.com/r/ios/comments/1de271n

**App Store Listings (Feature Scope + Review Samples)**
- Planta: https://apps.apple.com/us/app/planta-complete-plant-care/id1410126781  
- Blossom: https://apps.apple.com/us/app/blossom-plant-identification/id1445975597  
- GrowIt: https://apps.apple.com/us/app/growit-vegetable-garden/id920034986
