# Plant content

Đây là workspace biên tập nội dung Plant Library, được lưu và review bằng Git.
Nó không phải coding task: Markdown, guideline và các kế hoạch curation được
đặt cùng nhau để người viết hoặc LLM có thể đọc trước khi tạo nội dung mới.

## Cấu trúc

- `guidelines/`: quy tắc biên tập chung.
- `plants/<scientific-name>/`: một file Markdown cho mỗi cây và locale.
- `pests-diseases/<key>/`: một file Markdown cho mỗi sâu hại hoặc bệnh và locale.
- `plans/`: kế hoạch, inventory và rollout liên quan đến nội dung.

Mỗi bài mới phải đọc `guidelines/plant-information-guideline.md`, dùng tên
phổ thông tự nhiên theo locale, và chỉ ghi claim có bằng chứng. Nội dung chưa
được review giữ trạng thái `needs_review`; không tự publish hoặc bịa thêm care
claim để làm bài có vẻ đầy đủ.
