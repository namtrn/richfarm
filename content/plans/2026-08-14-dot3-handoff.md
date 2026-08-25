# Handoff — Đợt 3 (P1 ưu tiên Việt Nam) sang session mới

Ngày: 2026-08-14
Nguồn: `content/plans/2026-08-14-us-vn-care-guide-priority.md` (dòng 52-67)

## Trạng thái tổng thể

- ✅ **Đợt 1 - P0 (12 cây)**: đã viết đủ `vi.md` + `en.md` trong `content/plants/`.
- ✅ **Đợt 2 - P1 cả hai thị trường (14 cây)**: đã viết đủ `vi.md` + `en.md`.
- ⏳ **Đợt 3 - P1 ưu tiên Việt Nam (12 cây, #27-38)**: mới xong 1/12 (mồng tơi #27 — golden example); **11 cây còn lại (#28-38) là nhiệm vụ của session mới**.
- ⏳ Đợt 4 - P1 ưu tiên Mỹ (6 cây): chưa làm.

## Nhiệm vụ session mới: Đợt 3 - 11 cây còn lại

Mồng tơi (#27) đã hoàn thành và là **golden example** (bản refine theo guideline mục 7.2): **không viết lại**, chỉ dùng làm chuẩn đối chiếu. Mỗi cây còn lại tạo thư mục `content/plants/<scientific-name>/` gồm `vi.md` + `en.md`, viết theo golden example là bản refine của `content/plants/basella-alba/vi.md` và `en.md`.

| # | Cây | Tên khoa học | Thư mục đề xuất |
| --- | --- | --- | --- |
| 27 | Mồng tơi | *Basella alba* | ✅ đã xong (mẫu) |
| 28 | Rau muống | *Ipomoea aquatica* | `ipomoea-aquatica` |
| 29 | Cải thìa | *Brassica rapa* subsp. *chinensis* | `brassica-rapa-subsp-chinensis` |
| 30 | Đậu đũa | *Vigna unguiculata* | `vigna-unguiculata` |
| 31 | Sả | *Cymbopogon citratus* | `cymbopogon-citratus` |
| 32 | Tía tô | *Perilla frutescens* | `perilla-frutescens` |
| 33 | Đu đủ | *Carica papaya* | `carica-papaya` |
| 34 | Xoài | *Mangifera indica* | `mangifera-indica` |
| 35 | Chuối | *Musa acuminata* | `musa-acuminata` |
| 36 | Ổi | *Psidium guajava* | `psidium-guajava` |
| 37 | Hoa giấy | *Bougainvillea glabra* | `bougainvillea-glabra` |
| 38 | Dâm bụt | *Hibiscus rosa-sinensis* | `hibiscus-rosa-sinensis` |

## Yêu cầu bắt buộc

1. **Đọc trước** `content/guidelines/plant-information-guideline.md` — đặc biệt mục 5 (giọng văn), 6 (thông tin), 7 (bài mẫu), 9 (checklist).
2. **Nội dung khớp tính chất từng cây**, không copy khuôn "dây leo/giàn/đất xốp/đất ẩm":
   - Rau muống: cây thân bò/leo trên nước hoặc đất ẩm, thu ngọn, có thể trồng thủy canh/mương.
   - Cải thìa: cây thấp vụ mát, cuống lá mọng nước, không giàn.
   - Đậu đũa: dây leo quấn cần giàn, quả dài hái non, họ đậu tự cố định đạm.
   - Sả: cây bụi cỏ, nhân giống tách bụi, lá làm gia vị, ưa ẩm.
   - Tía tô: cây thân thảo, gieo hạt/tách bụi, lá có màu đỏ tía, gia vị ăn lá.
   - Đu đủ: cây thân gỗ mềm mọc nhanh, phân biệt cây đực/cái/lưỡng tính, thu quả khi vỏ chuyển màu.
   - Xoài: cây gỗ lớn lâu năm, cắt tỉa tạo tán, thời vụ theo vùng.
   - Chuối: cây thân giả, trồng bằng cây con từ củ, thu buồng, chăm theo đợt con.
   - Ổi: cây gỗ nhỏ sai quả quanh năm, tỉa cành, thu quả khi thơm.
   - Hoa giấy: cây bụi leo có gai, ưa khô hạn để ra hoa, chịu hạn tốt.
   - Dâm bụt: cây bụi, hoa tàn mỗi ngày, cắt tỉa, ưa nắng.
3. Đợt 3 là **P1**: phần mùa vụ viết theo **vùng trồng** (Mỹ ôn đới / Việt Nam nhiệt đới) thay vì giả định một khí hậu chung.
4. Kiểm tra pest/disease key trong `packages/convex/convex/data/pestsDiseasesSeed.ts` trước khi link; sâu hại tách riêng bệnh; mỗi key tồn tại mới được link `richfarm://pests-diseases/{key}`. Các key hiện có (2026-08-14): `aphids`, `spider_mites`, `whiteflies`, `caterpillars`, `thrips`, `mealybugs`, `fungus_gnats`, `slugs_snails`, `powdery_mildew`, `downy_mildew`, `early_blight`, `root_rot`, `leaf_spot`, `rust`, `late_blight`, `botrytis_gray_mold`, `bacterial_wilt`, `damping_off` — file seed là nguồn chính thức nếu danh sách thay đổi.
5. Checklist sau khi viết (mục 9 guideline): dấu `-` ASCII cho khoảng số (không `–`/`—`), không heading `#`, `bạn`/`you` ≤ 1 lần mỗi mục, không lặp tên cây đầu câu liên tiếp, không trợ từ `nhé/ạ/vâng/đâu`, hạn chế `đảm bảo/tối ưu/lý tưởng/thường xuyên`.
6. Độ dài ~350-700 từ tiếng Việt, `en` tương đương về thông tin.
7. Giữ trạng thái `needs_review` khi sync; chưa review nguồn thì không chuyển `awaiting_review`. Trước khi đề xuất `awaiting_review`, thực hiện mục "Kiểm tra trước khi chuyển sang `awaiting_review`" trong `content/plans/2026-08-14-us-vn-care-guide-priority.md` (dòng 86-92): xác nhận scientific name/cultivar/`plant_code` trong SQLite, có nguồn cho mọi con số/cảnh báo/mùa vụ, đủ cả `en` + `vi` (không dịch máy rồi đánh dấu đã review).

## Tham chiếu

- Guideline: `content/guidelines/plant-information-guideline.md`
- Golden example: `content/plants/basella-alba/vi.md` (bản refine theo guideline mục 7.2) + `en.md`
- Ví dụ cây tương tự đã viết: rau ăn lá → `lactuca-sativa`, dây leo → `cucumis-sativus`/`phaseolus-vulgaris`, cây ăn quả → `citrus-aurantiifolia`, hoa → `rosa-chinensis`.
- Preview nội bộ: tab "Preview cây" (plugin cprev-1, session cũ) hoặc `node scripts/preview-care-content.js --port 4173`.
