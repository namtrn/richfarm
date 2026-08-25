# Danh sách ưu tiên care guide cho Mỹ và Việt Nam

## Cơ sở dữ liệu

Danh sách này được lập từ `apps/api/data/richfarm.db` ngày 2026-08-14. Database có 1.553 cây đang hoạt động; 1.519 bản ghi có `care_status = missing`. Hiện chỉ có 2 care guide tiếng Anh và 3 care guide tiếng Việt. Vì vậy, đây là backlog biên tập, không phải danh sách cây đã được xác minh care claim.

Các bản ghi trong database phần lớn là cultivar. Mỗi care guide mới phải gắn đúng `plant_code` của cultivar hoặc được thiết kế rõ quan hệ kế thừa từ taxon gốc; không dùng nội dung của cultivar này cho cultivar khác chỉ vì cùng tên loài.

## Nguyên tắc xếp hạng

- P0: xuất hiện phổ biến trong cả vườn nhà Mỹ và Việt Nam, hoặc có nhu cầu trồng chậu cao ở cả hai thị trường.
- P1: ưu tiên theo thị trường; vẫn có bản `en` và `vi`, nhưng phần mùa vụ phải viết theo vùng trồng thay vì giả định một khí hậu chung.
- P0 trước tiên viết đủ `en` và `vi`; mọi số liệu, cảnh báo và mức độ chắc chắn phải tương đương giữa hai locale.
- Không bắt đầu viết care guide khi chưa có nguồn chăm sóc phù hợp với đúng taxon/cultivar và khi chưa kiểm tra pest/disease key để liên kết nội bộ.

## Đợt 1 - P0, dùng cho cả Mỹ và Việt Nam

| # | Cây hiển thị chuẩn | Tên khoa học | Nhóm | Lý do ưu tiên |
| --- | --- | --- | --- | --- |
| 1 | Cà chua / Tomato | *Solanum lycopersicum* | Rau ăn quả | Cây vườn nhà phổ biến, có nhiều điểm chăm sóc quan trọng. |
| 2 | Ớt chuông / Bell pepper | *Capsicum annuum* | Rau ăn quả | Phổ biến ở vườn và chậu; cần phân biệt với nhóm ớt cay. |
| 3 | Dưa leo / Cucumber | *Cucumis sativus* | Rau ăn quả | Có nhu cầu làm giàn, tưới và phòng bệnh rõ rệt. |
| 4 | Xà lách / Lettuce | *Lactuca sativa* | Rau ăn lá | Chu kỳ ngắn, trồng liên tục và phù hợp người mới. |
| 5 | Húng quế / Basil | *Ocimum basilicum* | Gia vị | Phổ biến trong bếp và chậu ở cả hai thị trường. |
| 6 | Ngò rí / Cilantro | *Coriandrum sativum* | Gia vị | Nhu cầu sử dụng cao, care thay đổi mạnh theo nhiệt độ. |
| 7 | Bạc hà / Mint | *Mentha × piperita* | Gia vị | Phổ biến trong chậu; cần cảnh báo lan rộng và úng rễ. |
| 8 | Dâu tây / Strawberry | *Fragaria × ananassa* | Cây ăn quả | Phổ biến trồng chậu, cần nội dung về ngó, quả và bệnh. |
| 9 | Chanh / Lime | *Citrus aurantiifolia* | Cây ăn quả | Cây có múi quen thuộc, dễ trồng chậu ở khí hậu phù hợp. |
| 10 | Hoa hồng / Rose | *Rosa chinensis* | Hoa | Nhu cầu cao, sâu hại và bệnh cần hướng dẫn chính xác. |
| 11 | Trầu bà / Pothos | *Epipremnum aureum* | Cây nội thất | Một trong các cây trong nhà quen thuộc nhất. |
| 12 | Trầu bà Nam Mỹ / Monstera | *Monstera deliciosa* | Cây nội thất | Phổ biến trồng nội thất, cần hướng dẫn ánh sáng và giá thể thoát nước. |

## Đợt 2 - P1, cây phổ biến cho cả hai thị trường

| # | Cây hiển thị chuẩn | Tên khoa học | Nhóm |
| --- | --- | --- | --- |
| 13 | Cà tím / Eggplant | *Solanum melongena* | Rau ăn quả |
| 14 | Đậu cô ve / Common bean | *Phaseolus vulgaris* | Họ đậu |
| 15 | Bí ngòi / Zucchini | *Cucurbita pepo* | Rau ăn quả |
| 16 | Cà rốt / Carrot | *Daucus carota* | Rau củ |
| 17 | Bắp cải / Cabbage | *Brassica oleracea* | Rau ăn lá |
| 18 | Hành tây / Onion | *Allium cepa* | Họ hành |
| 19 | Tỏi / Garlic | *Allium sativum* | Họ hành |
| 20 | Ngò tây / Parsley | *Petroselinum crispum* | Gia vị |
| 21 | Hương thảo / Rosemary | *Salvia rosmarinus* | Gia vị |
| 22 | Xạ hương / Thyme | *Thymus vulgaris* | Gia vị |
| 23 | Kinh giới tây / Oregano | *Origanum vulgare* | Gia vị |
| 24 | Nha đam / Aloe vera | *Aloe vera* | Cây nội thất |
| 25 | Lưỡi hổ / Snake plant | *Dracaena trifasciata* | Cây nội thất |
| 26 | Lan ý / Peace lily | *Spathiphyllum wallisii* | Cây nội thất |

## Đợt 3 - P1, ưu tiên Việt Nam

| # | Cây hiển thị chuẩn | Tên khoa học | Nhóm |
| --- | --- | --- | --- |
| 27 | Mồng tơi / Malabar spinach | *Basella alba* | Rau ăn lá |
| 28 | Rau muống / Water spinach | *Ipomoea aquatica* | Rau ăn lá |
| 29 | Cải thìa / Bok choy | *Brassica rapa* subsp. *chinensis* | Rau ăn lá |
| 30 | Đậu đũa / Yard-long bean | *Vigna unguiculata* | Họ đậu |
| 31 | Sả / Lemongrass | *Cymbopogon citratus* | Gia vị |
| 32 | Tía tô / Perilla | *Perilla frutescens* | Gia vị |
| 33 | Đu đủ / Papaya | *Carica papaya* | Cây ăn quả |
| 34 | Xoài / Mango | *Mangifera indica* | Cây ăn quả |
| 35 | Chuối / Banana | *Musa acuminata* | Cây ăn quả |
| 36 | Ổi / Guava | *Psidium guajava* | Cây ăn quả |
| 37 | Hoa giấy / Bougainvillea | *Bougainvillea glabra* | Hoa |
| 38 | Dâm bụt / Chinese hibiscus | *Hibiscus rosa-sinensis* | Hoa |

## Đợt 4 - P1, ưu tiên Mỹ

| # | Cây hiển thị chuẩn | Tên khoa học | Nhóm |
| --- | --- | --- | --- |
| 39 | Bí đỏ mùa đông / Winter squash | *Cucurbita moschata* | Rau ăn quả |
| 40 | Bắp ngọt / Sweet corn | *Zea mays* convar. *saccharata* | Rau ăn quả |
| 41 | Việt quất / Blueberry | *Vaccinium corymbosum* | Cây ăn quả |
| 42 | Táo tây / Apple | *Malus domestica* | Cây ăn quả |
| 43 | Hướng dương / Sunflower | *Helianthus annuus* | Hoa |
| 44 | Cúc ngũ sắc / Zinnia | *Zinnia elegans* | Hoa |

## Quy cách một care guide

Mỗi bài dùng Markdown theo `content/guidelines/plant-information-guideline.md`, thường gồm: ánh sáng và vị trí, tưới nước, đất trồng, bón phân, gieo trồng/nhân giống, chăm sóc theo giai đoạn hoặc thu hoạch, sâu hại, bệnh và lưu ý.

Với cây ăn được, ưu tiên hướng dẫn quan sát đất và cây thay cho lịch tưới cứng. Với cây lâu năm, tách rõ năm đầu, giai đoạn trưởng thành và yêu cầu theo mùa. Với cây nội thất, nêu giới hạn ánh sáng, dấu hiệu tưới quá tay và cách thoát nước trước khi thêm mẹo trang trí.

## Kiểm tra trước khi chuyển sang `awaiting_review`

- Xác nhận scientific name, cultivar và `plant_code` đích trong SQLite.
- Có nguồn phù hợp cho mọi con số, cảnh báo và thông tin mùa vụ.
- Có cả nội dung `en` và `vi`; không dịch máy rồi đánh dấu đã review.
- Tách sâu hại khỏi bệnh; chỉ dùng richfarm link khi key đã tồn tại.
- Kiểm tra Markdown, độ dài và các quy tắc trong guideline.
