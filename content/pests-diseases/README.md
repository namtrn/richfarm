# Nội dung sâu hại và bệnh cây

Đây là workspace biên tập nội dung `detailContent` cho sâu hại và bệnh cây,
được lưu và review bằng Git. Nó đi theo cùng mô hình với `content/plants/`:
mỗi đối tượng là một thư mục riêng, mỗi locale là một file Markdown.

## Cấu trúc

- `pests-diseases/<key>/vi.md`: bản tiếng Việt.
- `pests-diseases/<key>/en.md`: bản tiếng Anh.
- Các locale khác được bổ sung khi có người biên tập hoặc kiểm duyệt phù hợp.

`key` là stable key của bản ghi `pestsDiseases`, dùng làm target cho link nội bộ
trong `careContent` của cây, ví dụ `richfarm://pests-diseases/slugs_snails`.
Không dùng tên hiển thị đã dịch hoặc `_id` database làm tên thư mục.

## Quy tắc bắt buộc

Mỗi bài mới phải đọc trước `docs/standards/pest-disease-information-guideline.md`:

- Phân biệt rõ hai nhóm: **sâu hại** (`type: "pest"`) và **bệnh** (`type: "disease"`).
- Sâu hại phải mô tả dấu vết trên cây, không chỉ mô tả hình dáng con sâu.
- Bệnh phải có dấu hiệu ban đầu, quá trình tiến triển và phần phân biệt với
  nguyên nhân dễ nhầm.
- Không khuyến nghị thuốc thiếu nhãn sử dụng, liều lượng hoặc thời gian cách ly.
- Chỉ ghi claim có bằng chứng. Nội dung chưa được review giữ trạng thái
  `needs_review`; không tự publish hoặc bịa thêm chi tiết để bài có vẻ đầy đủ.
- Không chèn citation hoặc URL nguồn vào nội dung hiển thị; provenance thuộc
  metadata quản trị.

## Liên kết với nội dung cây

Cây trong `content/plants/` chỉ nêu dấu hiệu nhận biết sớm và hành động an toàn
đầu tiên, rồi liên kết sang màn hình chi tiết bằng `richfarm://pests-diseases/{key}`.
Khi tạo bài mới, kiểm tra các key đã được cây tham chiếu để tránh trùng lặp hoặc
lệch target.

## Trạng thái hiện tại

- Đã có 18 stable key hiện có trong seed, mỗi key gồm `vi.md` và `en.md`.
- Metadata common name tiếng Việt, tên khoa học đại diện và `plantKeys` nằm trong
  `packages/convex/convex/data/pestsDiseasesSeed.ts`.
- Nội dung và tên khoa học mới chỉ là bản biên tập ban đầu; giữ ở trạng thái cần
  kiểm duyệt nguồn trước khi publish.
