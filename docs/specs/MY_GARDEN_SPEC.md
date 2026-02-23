# My Garden — Spec

## Tổng quan
**Mục tiêu**: Tài liệu Markdown này tổng hợp yêu cầu, tính năng, schema cơ sở dữ liệu và phân tích **edge cases** cho ứng dụng **My Garden** (tabs: **Planning**, **Growing**, **Reminder**). Nội dung phù hợp để dán vào file `MY_GARDEN_SPEC.md` và dùng làm tài liệu phát triển hoặc chuyển cho team.

---

## Nhu cầu người dùng
- **Nhanh, trực quan**: thêm cây bằng ảnh hoặc nhập tay; thấy lịch chăm sóc ngay.  
- **Đáng tin cậy**: lịch dựa trên vùng khí hậu, frost dates, thời gian nảy mầm, khoảng cách trồng.  
- **Tùy chỉnh & tự động**: nhắc tưới/bón/prune; cho phép chỉnh tần suất.  
- **Hỗ trợ quyết định**: companion planting, luân canh, lựa chọn giống theo mục đích.  
- **Giá trị gia tăng**: mẹo bảo quản (phơi khô, muối, ủ, làm mắm), công thức, lưu trữ harvest.  
- **Offline & local**: cơ sở dữ liệu cơ bản offline; cập nhật online cho ID/disease.

---

## Tính năng theo tab

### Planning
- **Add plant**: *Scan hình* (photo ID), *Upload hình*, *Nhập tay* (search by name + autocomplete).  
- **Garden layout**: bed/pot canvas; square‑foot grid; kéo‑thả cây; companion warnings.  
- **Planting calendar**: auto-calc theo zone, frost dates, seed‑start, transplant, harvest.  
- **Templates**: kitchen herbs, hydroponics, regrow-from-scraps, fastest-growing.

### Growing
- **Plant profile**: species, variety, photo history, soil, light, spacing, companion list.  
- **Health checks**: upload photo cho disease/pest suggestions; manual symptom logging.  
- **Environment tracking**: optional sensor input hoặc manual logs.  
- **Harvest log**: record harvest dates, weight/qty, liên kết tới preservation recipes.

### Reminder
- **Smart reminders**: watering, fertilizing, pruning, pest checks, harvest; auto-schedule.  
- **Custom rules**: snooze, repeat intervals, group reminders theo bed/plant type.  
- **Notifications**: actionable cards, batch theo bed.

### Extras
- **Preservation recipes**: phơi khô, muối, ủ, làm mắm; mapping tới loại cây.  
- **Regrow workflows**: hướng dẫn step‑by‑step.  
- **Community / Tips**: optional feed, user contributed profiles.

---

## Database Schema đề xuất
**Thiết kế**: relational, normalized, offline‑friendly, dễ sync.

### Bảng chính
- **users**  
  - `id` (PK), `name`, `email`, `locale`, `timezone`, `zone_code`, `created_at`, `updated_at`

- **plants_master**  
  - `id` (PK), `scientific_name`, `common_names` (array), `group` (enum), `purposes` (set), `description`, `typical_days_to_harvest`, `light_requirements`, `soil_pref`, `spacing_cm`, `image_url`, `created_at`

- **user_plants**  
  - `id` (PK), `user_id` (FK), `plant_master_id` (FK nullable), `nickname`, `photo_url`, `bed_id` (FK), `planted_at`, `seed_start_date`, `transplant_date`, `expected_harvest_date`, `notes`, `status`, `client_id`, `server_id`, `version`, `merged_into`, `created_at`

- **beds**  
  - `id` (PK), `user_id` (FK), `name`, `area_m2`, `layout_json`, `location_type` (indoor/outdoor), `created_at`

- **plant_photos**  
  - `id` (PK), `user_plant_id` (FK), `photo_url`, `taken_at`, `analysis_result_json`, `created_at`

- **reminders**  
  - `id` (PK), `user_id` (FK), `user_plant_id` (FK nullable), `bed_id` (FK nullable), `type`, `rule_rrule`, `next_run_at`, `enabled`, `last_run_at`, `created_at`

- **logs**  
  - `id` (PK), `user_plant_id` (FK), `type`, `value_json`, `recorded_at`, `created_at`, `user_id` (actor)

- **plant_groups**  
  - `id` (PK), `key`, `display_name`, `description`

- **preservation_recipes**  
  - `id` (PK), `name`, `method` (dry/salt/ferment), `steps_text`, `suitable_plants` (array), `source`, `created_at`

### Ghi chú kỹ thuật
- Indexes: `users.zone_code`, `plants_master.scientific_name`, `user_plants.user_id`.  
- Sync metadata: `client_id`, `server_id`, `version`, `updated_at` cho conflict resolution.  
- `analysis_result_json` lưu confidence, disease tags, heatmap refs.

---

## Edge Cases chi tiết và cách xử lý
> Mỗi mục gồm **Vấn đề**, **Dấu hiệu**, **Tác động**, **Giải pháp**.

### 1. Ảnh mờ hoặc model ID sai
- **Vấn đề**: Ảnh mờ, cây non, giai đoạn bệnh lý → ID sai.  
- **Dấu hiệu**: confidence thấp, user chỉnh tay nhiều.  
- **Giải pháp**: hiển thị top‑3 kết quả kèm confidence; photo quality checks trước upload; fallback nhập tay; lưu ảnh để review.

### 2. Lịch tưới không phù hợp microclimate
- **Vấn đề**: ban công/nhà kính khác zone.  
- **Dấu hiệu**: nhắc quá thường/quá ít; cây úng/khô.  
- **Giải pháp**: adaptive scheduling dựa trên logs; hỗ trợ sensor; allow user overrides.

### 3. Duplicate records khi thêm nhiều nguồn
- **Vấn đề**: cùng cây thêm bằng ảnh, nhập tay, template.  
- **Dấu hiệu**: profile trùng, nhắc chồng.  
- **Giải pháp**: duplicate detection khi thêm; merge workflow; trường `merged_into`.

### 4. Offline sync conflict
- **Vấn đề**: thao tác offline rồi sync gây xung đột.  
- **Dấu hiệu**: lịch bị ghi đè, ảnh mất.  
- **Giải pháp**: lưu `version`, `client_id`; CRDT-lite hoặc last-writer-wins với audit; conflict UI cho user chọn.

### 5. Reminders quá nhiều gây fatigue
- **Vấn đề**: nhiều cây → nhiều thông báo.  
- **Dấu hiệu**: user tắt notification.  
- **Giải pháp**: smart batching theo bed/ngày; user control mức chi tiết; quiet hours.

### 6. Ảnh chứa EXIF/geo và privacy
- **Vấn đề**: ảnh chứa vị trí hoặc vật dụng cá nhân.  
- **Dấu hiệu**: user lo ngại upload.  
- **Giải pháp**: strip EXIF trước upload; local-first xử lý; opt-in sharing; rõ consent.

### 7. Sensor báo sai hoặc mất tín hiệu
- **Vấn đề**: dữ liệu nhảy loạn hoặc offline.  
- **Dấu hiệu**: giá trị bất thường, không cập nhật.  
- **Giải pháp**: sanity checks, flag suspect, fallback lịch dựa logs, health dashboard.

### 8. Sensor spoofing hoặc dữ liệu giả
- **Vấn đề**: thiết bị gửi dữ liệu giả.  
- **Dấu hiệu**: pattern lặp bất thường, mismatch logs.  
- **Giải pháp**: device auth & signing; anomaly detection; tạm ngắt automation khi nghi ngờ.

### 9. Timezone và daylight saving
- **Vấn đề**: user di chuyển hoặc timezone sai.  
- **Dấu hiệu**: reminders xuất giờ lạ.  
- **Giải pháp**: store timezone per user/device; detect drift on sync; audit log khi shift.

### 10. Legal risk cho preservation recipes
- **Vấn đề**: hướng dẫn bảo quản có rủi ro an toàn thực phẩm.  
- **Dấu hiệu**: user hỏi về an toàn hoặc báo sự cố.  
- **Giải pháp**: disclaimers rõ ràng; nguồn vetting; opt‑in advanced tips.

### 11. Multi‑user access same garden
- **Vấn đề**: nhiều người thao tác cùng bed.  
- **Dấu hiệu**: duplicate logs, reminders bị hoàn thành bởi người khác.  
- **Giải pháp**: shared garden model với roles; action attribution; claim task.

### 12. Long tail species no care data
- **Vấn đề**: loài hiếm không có profile.  
- **Dấu hiệu**: app trả “no data”.  
- **Giải pháp**: community contributed profiles (unverified); similarity inference từ taxon gần nhất.

### 13. Model drift giảm accuracy
- **Vấn đề**: model ID/disease giảm hiệu năng theo thời gian.  
- **Dấu hiệu**: tăng false positives/negatives.  
- **Giải pháp**: continuous evaluation, human‑in‑loop feedback, retrain pipeline.

### 14. Billing và feature gating
- **Vấn đề**: upgrade/downgrade giữa thiết bị.  
- **Dấu hiệu**: feature mismatch, support requests.  
- **Giải pháp**: entitlement service server‑side; cache entitlements với expiry; grace period.

### 15. Accessibility và cognitive load
- **Vấn đề**: quá nhiều tuỳ chọn làm novice users bối rối.  
- **Dấu hiệu**: dropoff onboarding.  
- **Giải pháp**: progressive disclosure; guided tours; expert mode.

---

## Ưu tiên xử lý và Roadmap ngắn hạn
**Ưu tiên cao**
1. Photo quality checks + ID fallback.  
2. Privacy EXIF stripping + consent.  
3. Adaptive scheduling + sensor sanity checks.  
4. Offline sync conflict handling + versioning.  

**Ưu tiên trung bình**
1. Duplicate detection & merge UI.  
2. Smart reminder batching.  
3. Disease alert explainability.  
4. Localization của plant names và community vetting.

**MVP đề xuất (4–6 tuần)**
- Onboarding zone, plants_master seed data, add plant manual/search, planting calendar, reminders, user_plants CRUD.

**Phase 2**
- Photo ID, disease suggestion, garden layout canvas, harvest logging, preservation recipes.

**Phase 3**
- Community features, sensor integrations, advanced analytics, offline-first sync refinement.

---

## Next steps đề xuất
- **Chuyển schema thành SQL DDL mẫu** để dev bắt đầu.  
- **Viết user stories ưu tiên** cho edge cases cao.  
- **Thiết kế mock UI cho conflict/merge flows** và reminder batching.  
- **Thiết lập privacy policy snippet** cho ảnh và model training opt‑in.

---

## Appendix
- **Danh mục nhóm cây gợi ý**: alliums; cole crops; flowers; fruit; grains; greens; herbs; legumes; melons/squashes; nightshades; others.  
- **Danh mục mục đích**: cooking spices; regrow from scraps; grow indoor; hydroponics; fastest growing.

---
**Hoàn tất**. Tài liệu này đã sẵn sàng để lưu thành file Markdown. Bạn có thể copy toàn bộ nội dung vào file `MY_GARDEN_SPEC.md` và chia sẻ cho team.  
