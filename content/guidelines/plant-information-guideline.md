# Guideline viết `careContent` cho cây trồng

> Phiên bản: 2.0
> Phạm vi: nội dung hướng dẫn chăm sóc hiển thị trong app
> Định dạng bắt buộc: Markdown thuần
> Ngôn ngữ tài liệu: tiếng Việt; nội dung cây: đa ngôn ngữ
> Bài mẫu: Mồng tơi (*Basella alba*)

## 1. Mục tiêu

`careContent` phải giống một người có kinh nghiệm trồng cây đang hướng dẫn người dùng, không giống dữ liệu thô, tài liệu nghiên cứu, bản dịch máy hoặc câu trả lời do AI ghép lại.

Người đọc cần nhanh chóng biết:

- nên đặt cây ở đâu;
- tưới và bón như thế nào;
- đất trồng cần ra sao;
- trồng hoặc nhân giống thế nào;
- khi nào có thể thu hoạch;
- dấu hiệu nào cần chú ý.

## 2. Format bắt buộc

`careContent` là **một chuỗi Markdown**, không phải JSON.

```markdown
## Ánh sáng và vị trí

Nội dung viết thành đoạn ngắn, tự nhiên.

- Chỉ dùng bullet khi thật sự có nhiều hành động cần nhớ.

## Tưới nước

Nội dung tiếp theo.
```

Cho phép:

- heading cấp 2: `##`;
- đoạn văn ngắn;
- bullet list `-`;
- chữ đậm để nhấn mạnh một cảnh báo ngắn;
- liên kết Markdown nội bộ đến màn hình chi tiết sâu hại hoặc bệnh;
- số và đơn vị khi đã có nguồn đáng tin cậy.

Khoảng số phải dùng dấu gạch ngang ASCII `-`, viết liền theo format `6-8`. Không dùng ký tự en dash `–`, em dash `—` hoặc ký tự gạch ngang đặc biệt khác ở giữa hai số. Quy tắc này áp dụng cho mọi locale để dữ liệu dễ tìm kiếm, kiểm tra và import nhất quán.

Không dùng:

- JSON hoặc code block làm nội dung lưu thực tế;
- bảng trong nội dung app;
- heading cấp 1 `#` vì tên cây đã có trên màn hình;
- HTML;
- emoji cho từng heading;
- danh sách bullet dài và đều nhau một cách máy móc;
- mục rỗng hoặc câu giữ chỗ như “đang cập nhật”.

## 3. Cấu trúc bài viết

Không bắt buộc mọi cây phải có đủ tất cả mục. Chỉ viết mục có thông tin hữu ích và đã được kiểm tra. Thứ tự khuyến nghị:

1. `## Ánh sáng và vị trí`
2. `## Tưới nước`
3. `## Đất trồng`
4. `## Bón phân`
5. `## Gieo trồng và nhân giống`
6. `## Chăm sóc và thu hoạch`
7. `## Sâu hại và bệnh thường gặp`
8. `## Lưu ý`

Có thể đổi tên mục cho tự nhiên hơn với từng loại cây. Ví dụ cây ăn lá dùng “Chăm sóc và thu hoạch”, cây hoa dùng “Ra hoa”, cây ăn quả dùng “Đậu quả và thu hoạch”.

### Sâu hại và bệnh là hai nhóm nội dung riêng

Mục sâu bệnh phải kiểm tra và trình bày riêng cả hai nhóm:

- **Sâu hại**: côn trùng, nhện, ốc sên hoặc động vật khác trực tiếp gây hại cho cây.
- **Bệnh**: bệnh do nấm, vi khuẩn, virus, oomycete hoặc tác nhân gây bệnh khác.

Không được viết một vài loài sâu rồi coi mục “Sâu bệnh” là đã hoàn chỉnh. Với mỗi nhóm, ưu tiên nêu 1-3 đối tượng thường gặp và có giá trị nhận biết thực tế đối với đúng loài cây đang viết. Nếu chưa có bệnh hoặc sâu hại nào được xác minh, bỏ nhóm chưa đủ bằng chứng và giữ bài ở trạng thái `needs_review`; không tự bổ sung tên chỉ để đủ cấu trúc.

Mỗi tên sâu hại hoặc bệnh đã có bản ghi trong thư viện phải là một liên kết Markdown để người dùng mở màn hình chi tiết. Nội dung `careContent` chỉ nêu dấu hiệu nhận biết sớm và hành động an toàn đầu tiên; thông tin nhận diện đầy đủ, phòng ngừa và kiểm soát thuộc màn hình sâu bệnh riêng.

Link nội bộ dùng stable `key` của bản ghi `pestsDiseases`, không dùng tên hiển thị đã dịch, `_id` của database hoặc URL nguồn tham khảo:

```markdown
[Ốc sên](richfarm://pests-diseases/slugs_snails)
[Bệnh đốm lá](richfarm://pests-diseases/leaf_spot)
```

Mọi locale dùng cùng link target và chỉ dịch nhãn hiển thị. Renderer phải mở đúng bản ghi theo `key`; nếu key không tồn tại hoặc không có nội dung cho locale hiện tại, link phải được hiển thị như văn bản thường thay vì đưa người dùng đến màn hình rỗng.

### Độ dài

- Toàn bài: khoảng 350-700 từ tiếng Việt.
- Mỗi mục: 1-3 đoạn ngắn, thường 2-5 câu.
- Bullet: tối đa 3-4 bullet trong một mục.
- Mỗi câu nên truyền đạt một ý chính.

Độ dài là chỉ dẫn, không phải quota. Một bài ngắn nhưng đủ ý tốt hơn một bài dài lặp lại.

## 4. Quy tắc đa ngôn ngữ

Guideline và kế hoạch biên tập được viết bằng tiếng Việt. `careContent` của mỗi cây được lưu thành một bản Markdown riêng cho từng locale, ví dụ:

- `vi`: tiếng Việt;
- `en`: tiếng Anh;
- các locale khác được bổ sung khi có người biên tập hoặc kiểm duyệt phù hợp.

Mỗi bản ngôn ngữ phải:

1. Giữ cùng sự thật, con số, đơn vị, cảnh báo và mức độ chắc chắn.
2. Giữ cấu trúc nội dung tương đương, nhưng heading và cách diễn đạt phải tự nhiên trong ngôn ngữ đích.
3. Không dịch từng chữ hoặc giữ cấu trúc câu của bản nguồn nếu cách viết đó thiếu tự nhiên.
4. Dùng tên phổ thông đúng locale; tên khoa học không dịch.
   Tên hiển thị phải là common name được người dùng của locale đó sử dụng tự nhiên, không phải bản dịch từng chữ từ tiếng Anh. Tên khoa học và các tên gọi thực sự khác được lưu riêng để hỗ trợ tìm kiếm và phân biệt. Không tạo alias bằng cách bỏ dấu, đảo thứ tự từ, đổi số ít/số nhiều hoặc thêm bớt các từ chung như `cây`, `rau`, `hoa`. Chỉ dùng tên khoa học làm fallback khi chưa xác minh được common name, đồng thời giữ locale ở trạng thái `needs_review`.
   Nội dung của một locale không được chèn common name của locale khác chỉ để giải thích tên cây, ví dụ bản tiếng Anh không viết “known in Vietnam as mồng tơi”. Tên địa phương chỉ được nhắc khi chính tên gọi đó là chủ đề cần giải thích và có giá trị nội dung rõ ràng; không dùng nó như câu giới thiệu trang trí. Alias đa ngôn ngữ thuộc metadata tìm kiếm, không thuộc `description` hoặc `careContent` mặc định.
5. Không tự thêm mẹo, cảnh báo hoặc con số vào một locale mà các locale khác chưa có bằng chứng tương ứng.
6. Được phép rút gọn hoặc đổi nhịp câu để giọng văn tự nhiên, miễn không làm mất ý nghĩa chăm sóc.

Một locale chưa được biên tập không được tạo bằng bản dịch máy rồi đánh dấu đã duyệt. Có thể dùng AI hoặc máy dịch để tạo bản nháp, nhưng bản nháp phải ở trạng thái `needs_review` cho đến khi được người đọc thông thạo ngôn ngữ kiểm tra.

Fallback hiển thị đề xuất:

```text
locale chính xác → en → không hiển thị careContent
```

Không fallback sang nội dung của một loài hoặc cultivar khác chỉ vì tên gần giống.

## 5. Giọng văn “gần giống người viết”

### Nên viết

- Nói trực tiếp nhưng gọn: “Bạn có thể…”, “Khi vừa phát hiện…”, “Trước tiên…”.
- Dùng từ quen thuộc: đất mặt, ngọn non, úng rễ, giàn leo, phân hữu cơ hoai mục.
- Giải thích ngắn lý do sau hướng dẫn: “giữ đất ẩm đều để lá không bị già và đắng”.
- Thể hiện sự linh hoạt theo điều kiện thực tế: “vào ngày nóng”, “nếu trồng trong chậu”, “khi mưa nhiều”.
- Xen kẽ đoạn văn và bullet; không biến cả bài thành checklist.
- Đưa mẹo thực tế có giá trị: kiểm tra đất bằng tay, cắt ngọn để cây phân nhánh, giảm tưới khi mưa.

### Tránh lặp tên cây

- Không lặp tên cây ở đầu hai câu hoặc hai đoạn gần nhau.
- Sau lần gọi tên đầu tiên, có thể dùng `cây`, `loài này` hoặc viết lại câu theo đặc tính của cây.
- Ưu tiên cách chuyển tự nhiên như `Với đặc tính thân leo`, `Do có bộ rễ nông`, `Khi bước vào giai đoạn ra hoa`.
- Không thay tên cây bằng một danh từ chung một cách máy móc; phần còn lại của câu cũng cần được viết lại để phù hợp.
- Tránh dùng `giống cây` nếu không nói về một cultivar cụ thể.
- Không dùng `họ dây leo` vì `họ` là một bậc phân loại thực vật. Dùng `cây thân leo`, `thuộc nhóm cây thân leo` hoặc diễn đạt bằng đặc tính.

### Trợ từ, trạng từ và đại từ chỉ người đọc

- Được dùng `bạn` trong tiếng Việt và `you` trong tiếng Anh khi cần làm rõ người thực hiện hoặc giúp câu bớt cứng.
- Giới hạn khuyến nghị: tối đa một lần trong mỗi mục. Không mở nhiều câu liên tiếp bằng `bạn` hoặc `you`.
- Khi câu vẫn rõ nghĩa, ưu tiên viết trực tiếp không có đại từ: “Kiểm tra lớp đất mặt trước khi tưới.”
- Dùng trạng từ và từ nối để làm rõ thời điểm, trình tự hoặc mức độ: `khi vừa`, `khi bắt đầu`, `trước tiên`, `sau đó`, `đặc biệt`, `tuy nhiên`, `ngược lại`, `thường`, `chỉ`.
- Chỉ giữ những từ làm thay đổi hoặc làm rõ ý nghĩa. Không thêm từ đệm chỉ để câu có vẻ thân mật.
- Tuyệt đối không dùng `nhé`, `ạ`, `vâng` trong `careContent`.
- Không dùng `đâu` ở cuối câu khẳng định hoặc phủ định.
- Hạn chế `cứ` và `hãy`; bỏ hai từ này nếu câu vẫn tự nhiên và giữ nguyên ý nghĩa.

### Tránh viết

- Giọng ra lệnh cứng: “Bắt buộc tưới chính xác mỗi 2 ngày”.
- Câu chung chung: “Cung cấp điều kiện tối ưu để cây phát triển tốt”.
- Mở đầu lặp lại: “Mồng tơi là một loại cây…”. Phần mô tả cây đã nằm ở nơi khác.
- Dùng quá nhiều từ như “đảm bảo”, “tối ưu”, “lý tưởng”, “thường xuyên”, “phù hợp”.
- Câu quảng cáo: “cực kỳ dễ trồng”, “lựa chọn hoàn hảo”, “siêu bổ dưỡng”.
- Viết mọi mục theo cùng công thức một câu giới thiệu cộng ba bullet.
- Nhắc đến “nguồn”, “nghiên cứu” hoặc tên tổ chức trong nội dung người dùng đọc. Nguồn được lưu ở metadata, không chen vào lời hướng dẫn.
- Tuyên bố chữa bệnh, an toàn ăn uống hoặc không độc khi chưa có nguồn chuyên môn.
- Lặp `bạn` hoặc `you` trong nhiều câu liên tiếp.
- Thêm trợ từ không mang thông tin như “chưa cần tưới thêm đâu”.

### So sánh giọng văn

Không nên:

> Cây cần được cung cấp độ ẩm tối ưu. Đảm bảo thực hiện tưới nước thường xuyên và tránh hiện tượng ngập úng để cây phát triển khỏe mạnh.

Nên:

> Mồng tơi thích đất luôn hơi ẩm. Hãy tưới khi lớp đất mặt bắt đầu se khô; nếu vừa có mưa lớn thì giảm tưới để gốc không bị úng.

Không nên:

> Tiến hành thu hoạch sau 6-8 tuần. Việc cắt tỉa sẽ kích thích sự phát triển của các chồi bên.

Nên:

> Bạn có thể hái lứa ngọn đầu tiên khoảng 6-8 tuần sau khi cây mọc. Cắt phía trên một mắt lá để cây bật thêm nhánh, rồi tiếp tục hái từng đợt khi ngọn còn non.

## 6. Quy tắc về thông tin

1. Mỗi hướng dẫn phải đúng với chính loài hoặc giống đang viết; không sao chép từ cây “gần giống”.
2. Không tự chuyển từ mô tả định tính sang con số. “Giữ ẩm” không có nghĩa là “tưới mỗi ngày”.
3. Khi lịch tưới phụ thuộc thời tiết, hướng dẫn người dùng quan sát đất thay vì đưa một chu kỳ cứng.
4. Mỗi con số phải có mốc rõ ràng: sau gieo, sau nảy mầm, giữa hai cây hay giữa hai hàng.
5. Nếu các nguồn đưa nhiều khoảng cách theo cách trồng khác nhau, giải thích theo bối cảnh thay vì chọn một số duy nhất.
6. Không nêu nhiệt độ, pH, lượng nước hoặc lượng phân nếu chưa có nguồn đủ tin cậy.
7. Thông tin chưa chắc chắn không được “làm mềm” rồi đưa vào bài. Hãy bỏ mục đó và chờ kiểm duyệt.
8. Không để citation hoặc URL trong `careContent`; provenance thuộc metadata quản trị.

## 7. Bài mẫu — Mồng tơi (*Basella alba*)

### 7.1. Bản tiếng Việt trước khi áp dụng đầy đủ rule — `vi`

Phần dưới đây là nội dung Markdown mẫu có thể hiển thị trực tiếp trong app:

```markdown
## Ánh sáng và vị trí

Mồng tơi thích thời tiết ấm và phát triển tốt ở nơi có nhiều nắng. Cây trong chậu thường mất ẩm nhanh hơn, vì vậy hãy để ý đất trong những ngày nóng.

Đây là cây dây leo khỏe. Làm một giàn đơn giản cao vừa tầm hái sẽ giúp dây thông thoáng, ngọn sạch và dễ thu hoạch hơn. Nếu không có giàn, cây vẫn có thể bò trên mặt đất nhưng sẽ chiếm nhiều chỗ và khó chăm sóc hơn.

## Tưới nước

Mồng tơi thích đất luôn hơi ẩm nhưng không chịu được ngập úng kéo dài. Hãy kiểm tra lớp đất mặt trước khi tưới: nếu đất bắt đầu se khô thì tưới đẫm quanh gốc, còn nếu đất vẫn ướt thì chờ thêm.

Vào những ngày nóng, cây trong chậu có thể khô nhanh hơn cây trồng ngoài đất. Khi mưa nhiều, giảm hoặc ngừng tưới và kiểm tra xem nước có thoát khỏi chậu, luống hay không. Một lớp phủ gốc mỏng giúp đất giữ ẩm ổn định hơn.

## Đất trồng

Chọn đất tơi xốp, giàu hữu cơ và thoát nước tốt. Bạn có thể trộn đất với compost hoặc phân chuồng đã hoai trước khi trồng. Với chậu, cần có lỗ thoát nước thông thoáng; không để đáy chậu ngâm trong nước sau khi tưới.

Mồng tơi cho nhiều lá khi đất giữ được độ ẩm đều. Đất quá khô làm cây chậm ra ngọn, còn đất sũng nước lâu ngày dễ gây vấn đề ở rễ.

## Bón phân

Nếu đất đã màu mỡ và được bổ sung compost hoặc phân hữu cơ hoai mục, mồng tơi thường không cần bón quá nhiều lúc mới trồng. Theo dõi tốc độ ra lá và chỉ bón bổ sung theo hướng dẫn phù hợp với loại phân bạn đang dùng.

Tránh bón phân đậm đặc sát thân hoặc bón khi đất đang khô. Nếu dùng phân dạng lỏng, hãy pha và sử dụng theo hướng dẫn của sản phẩm thay vì tự tăng liều để thúc cây lớn nhanh.

## Gieo trồng và nhân giống

Bạn có thể trồng mồng tơi bằng hạt hoặc hom thân. Có thể ngâm hạt trong nước khoảng một ngày trước khi gieo. Giữ giá thể ẩm trong thời gian chờ nảy mầm, nhưng đừng để khay gieo bị sũng nước.

Nếu trồng bằng hom, chọn một đoạn thân khỏe có vài mắt lá, cắt ngay dưới mắt rồi cắm vào giá thể ẩm. Có thể giâm trong chậu trước hoặc trồng trực tiếp xuống đất; giữ ẩm trong thời gian hom bắt đầu ra rễ.

## Chăm sóc và thu hoạch

Khi dây bắt đầu vươn dài, buộc nhẹ vào giàn và hướng ngọn lên trên. Bấm ngọn hoặc thu hái đều đặn sẽ giúp cây phân nhánh, nhờ đó bạn có thêm nhiều ngọn non thay vì một dây chính quá dài.

Lứa ngọn đầu tiên thường có thể thu khoảng 6-8 tuần sau khi cây mọc, tùy thời tiết và điều kiện chăm sóc. Dùng kéo sạch cắt ngọn phía trên một mắt lá, chừa lại phần thân khỏe để cây tiếp tục bật chồi. Nên hái lúc ngọn và lá còn non; đừng cắt trụi cây trong một lần.

## Sâu hại và bệnh thường gặp

[Ốc sên](richfarm://pests-diseases/slugs_snails) có thể ăn lá non, đặc biệt ở nơi ẩm và rậm. Kiểm tra quanh gốc, dưới chậu và mặt dưới lá vào sáng sớm hoặc chiều tối. Giữ khu vực trồng thông thoáng và dọn lá rụng để giảm chỗ trú của chúng.

[Bệnh đốm lá](richfarm://pests-diseases/leaf_spot) có thể tạo nhiều đốm bất thường hoặc làm phần bệnh lan nhanh trên lá. Tạm ngừng thu hái phần bị ảnh hưởng, loại bỏ lá bệnh và tránh làm ướt lá vào cuối ngày. Không tự dùng thuốc bảo vệ thực vật trên rau ăn lá khi chưa xác định đúng vấn đề và chưa có hướng dẫn an toàn phù hợp.
```

### 7.2. Bản tiếng Việt sau khi refine theo rule — `vi`

Bản dưới đây giữ cùng phạm vi thông tin nhưng sửa cách diễn đạt, bổ sung ngữ cảnh thực hành và kiểm soát trợ từ, trạng từ, đại từ:

```markdown
## Ánh sáng và vị trí

Mồng tơi thích thời tiết ấm và phát triển tốt ở nơi có nhiều nắng. Trong những ngày nắng nóng, đất thường mất ẩm nhanh hơn, vì vậy cần kiểm tra đất thường xuyên để cây không bị thiếu nước.

Với đặc tính thân leo, cây cần có chỗ để bám và vươn lên. Bạn có thể làm một giàn lưới hoặc giàn dây đơn giản, cao vừa tầm hái. Giàn giúp nâng đỡ các dây non, hạn chế dây bò rối trên mặt đất, đồng thời giúp việc chăm sóc và thu hoạch thuận tiện hơn. Khi cây bắt đầu leo, nhẹ nhàng hướng các ngọn non vào giàn; không buộc quá chặt vì phần thân còn khá mềm.

## Tưới nước

Mồng tơi phát triển tốt khi đất duy trì được độ ẩm ổn định. Tưới khi lớp đất mặt bắt đầu khô và tưới đủ để nước thấm đều xuống vùng rễ. Nếu đất vẫn còn ẩm thì chưa cần tưới thêm.

Trong những ngày nắng nóng, đất có thể khô nhanh hơn nên cần được kiểm tra thường xuyên. Ngược lại, sau khi mưa lớn, cần kiểm tra khả năng thoát nước và giảm tưới nếu đất vẫn còn ướt. Đặc biệt, tránh để nước đọng lâu quanh gốc vì tình trạng này có thể làm rễ thiếu không khí và dễ bị hư.

Một lớp rơm khô, lá khô hoặc vật liệu phủ gốc phù hợp có thể giúp đất giữ ẩm lâu hơn. Khi phủ, nên chừa một khoảng nhỏ quanh thân để phần gốc luôn thông thoáng.

## Đất trồng

Chọn đất tơi xốp, giàu hữu cơ và thoát nước tốt. Có thể trộn đất với compost hoặc phân chuồng đã hoai trước khi trồng. Nếu trồng trong chậu, cần chọn chậu có lỗ thoát nước thông thoáng và không để đáy chậu ngâm trong nước sau khi tưới.

Mồng tơi ra nhiều lá khi đất giữ được độ ẩm đều. Đất quá khô làm cây chậm phát triển ngọn mới; ngược lại, đất sũng nước trong thời gian dài có thể gây hư rễ.

## Bón phân

Trước khi trồng, nên trộn đất với compost hoặc phân chuồng đã hoai mục. Nguồn hữu cơ này vừa bổ sung dinh dưỡng vừa giúp đất giữ ẩm mà vẫn duy trì được độ tơi xốp.

Mồng tơi được trồng chủ yếu để thu lá và ngọn non, vì vậy đạm - ký hiệu **N** trong công thức N-P-K - là dưỡng chất cần thiết cho quá trình phát triển thân lá. Tuy nhiên, không nên bón quá nhiều đạm trong một lần vì cây có thể phát triển mềm yếu và lượng phân dư thừa dễ bị lãng phí.

Một công thức N-P-K `10-10-20` có thể được dùng làm thông tin tham khảo. Ba con số lần lượt thể hiện tỷ lệ đạm, lân và kali trong phân bón. Đây không phải liều dùng cố định cho mọi khu vườn; lượng bón còn phụ thuộc vào sản phẩm, độ màu mỡ của đất và điều kiện trồng.

Với quy mô gia đình, bạn nên bắt đầu bằng lượng thấp theo đúng hướng dẫn trên bao bì. Sau mỗi vài đợt thu hoạch, quan sát tốc độ ra ngọn và màu lá trước khi quyết định bón thêm:

- Nếu lá nhạt màu và cây ra ngọn chậm dù vẫn đủ nước, cây có thể cần được bổ sung dinh dưỡng.
- Nếu lá xanh và ngọn vẫn phát triển đều thì chưa cần bón thêm.
- Trước khi bón phân, nên làm ẩm đất nhẹ để hạn chế tổn thương rễ.
- Đặc biệt, không rải phân đậm đặc sát thân và không tự tăng liều để thúc cây lớn nhanh.

## Gieo trồng và nhân giống

Có thể trồng mồng tơi bằng hạt hoặc bằng cách giâm cành. Nếu trồng bằng hạt, ngâm hạt trong nước khoảng một ngày trước khi gieo. Sau khi gieo, giữ đất hoặc giá thể đủ ẩm để hạt nảy mầm. Tuy nhiên, cần tránh tưới quá nhiều làm khay gieo bị sũng nước vì hạt và rễ non có thể bị hư trước khi cây phát triển ổn định.

Nếu trồng bằng cách giâm cành, chọn một đoạn thân khỏe có khoảng 2-3 mắt lá. Cắt cành ngay bên dưới một mắt, bỏ bớt lá ở phần gốc rồi cắm phần thân này vào đất hoặc giá thể ẩm. Trong thời gian cành bắt đầu ra rễ, cần duy trì độ ẩm vừa phải nhưng không để đất bị úng.

Cành có thể được giâm trong chậu nhỏ trước rồi chuyển ra vị trí trồng chính, hoặc cắm trực tiếp xuống đất nếu điều kiện đủ ấm và ẩm. Khi cành đã đứng vững và bắt đầu ra lá mới, hướng ngọn lên giàn.

## Chăm sóc và thu hoạch

Khi dây bắt đầu vươn dài, nhẹ nhàng hướng ngọn lên giàn lưới hoặc giàn dây. Nếu cần cố định, dùng dây buộc mềm và buộc lỏng để không làm thắt hoặc tổn thương phần thân non.

Mồng tơi sẽ ra nhiều nhánh hơn khi được bấm ngọn và thu hái thường xuyên. Thay vì để một dây chính mọc quá dài, có thể ngắt phần ngọn phía trên một mắt lá. Từ vị trí này, cây sẽ tiếp tục phát triển các chồi bên và tạo thêm ngọn non cho những lần thu hoạch sau.

Lứa ngọn đầu tiên thường có thể thu khoảng 6-8 tuần sau khi cây mọc, tùy vào nhiệt độ, ánh sáng, đất trồng và chế độ chăm sóc. Khi thu hoạch, dùng kéo sạch cắt ngọn phía trên một mắt lá và chừa lại phần thân khỏe để cây tiếp tục phát triển.

Nên chọn những ngọn còn non, thân mềm và lá chưa quá già. Mỗi lần chỉ thu một phần ngọn và lá trên cây; đặc biệt, tránh cắt trụi toàn bộ dây trong một lần vì cây cần giữ lại đủ lá để tiếp tục quang hợp và phục hồi.

Nếu không có nhu cầu lấy hạt, bạn có thể ngắt bỏ các chùm hoa hoặc quả trước khi quả chín và rụng. Hạt từ quả chín có thể mọc thành cây mới quanh khu vực trồng, khiến mồng tơi lan sang những vị trí không mong muốn.

## Sâu hại và bệnh thường gặp

[Ốc sên](richfarm://pests-diseases/slugs_snails) có thể ăn lá và ngọn non, đặc biệt ở những khu vực ẩm, rậm hoặc có nhiều vật liệu nằm sát mặt đất. Nên kiểm tra quanh gốc, dưới chậu, phía sau giàn và mặt dưới lá vào sáng sớm hoặc chiều tối, khi ốc sên thường hoạt động mạnh hơn.

Giữ khu vực trồng thông thoáng, dọn lá rụng và hạn chế để chậu, ván gỗ hoặc vật dụng không cần thiết nằm sát gốc. Đây là những vị trí ẩm và tối mà ốc sên có thể ẩn náu trong ngày. Nếu chỉ có một số ít, có thể bắt và loại bỏ bằng tay thay vì sử dụng thuốc ngay từ đầu.

Mồng tơi cũng có thể xuất hiện [bệnh đốm lá](richfarm://pests-diseases/leaf_spot). Khi vừa phát hiện lá có nhiều đốm bất thường, phần bệnh lan rộng hoặc lá hư nhanh, trước tiên cần tách bỏ những lá bị ảnh hưởng và theo dõi các lá còn lại. Dụng cụ dùng để cắt lá bệnh cần được làm sạch trước khi tiếp tục sử dụng cho cây khỏe.

Khi tưới, đưa nước trực tiếp xuống đất quanh gốc thay vì làm ướt toàn bộ tán lá. Đặc biệt, tránh tưới lên lá vào cuối ngày vì lá có thể giữ ẩm trong thời gian dài qua đêm. Đồng thời, không trồng cây quá dày và nên hướng các dây lên giàn để không khí lưu thông tốt hơn giữa các lá.

Nếu vết bệnh tiếp tục lan rộng, cây ngừng phát triển hoặc nhiều cây cùng xuất hiện triệu chứng giống nhau, cần xác định đúng nguyên nhân trước khi xử lý. Không tự sử dụng thuốc bảo vệ thực vật trên rau ăn lá khi chưa biết rõ loại sâu bệnh, thời gian cách ly và hướng dẫn sử dụng an toàn của sản phẩm.
```

### 7.3. English version trước khi áp dụng đầy đủ rule — `en`

Đây là bản tiếng Anh tương đương về thông tin, nhưng được biên tập theo cách viết tự nhiên của tiếng Anh thay vì dịch từng câu:

```markdown
## Light and location

Malabar spinach thrives in warm weather and grows best in a sunny spot. Containers can dry out faster than garden beds, so keep a closer eye on the soil during hot weather.

This is a vigorous climbing vine. A simple trellis at a comfortable picking height keeps the vines tidy and makes the young shoots easier to harvest. The plant can trail along the ground, but it will take up more space and can be harder to manage.

## Watering

Keep the soil lightly and consistently moist without leaving the roots waterlogged. Check the surface before watering: give the plant a thorough drink when the top layer begins to dry, but wait if the soil still feels wet.

Potted plants may need attention sooner than plants growing in the ground. After heavy rain, reduce or skip watering and make sure excess water can drain from the bed or container. A thin layer of mulch helps the soil retain moisture more evenly.

## Soil

Use loose, fertile soil that drains well. Work mature compost or well-rotted manure into the soil before planting. Containers need clear drainage holes and should never be left standing in water.

Malabar spinach produces plenty of tender leaves when moisture remains steady. Very dry soil can slow new growth, while soil that stays saturated may lead to root problems.

## Feeding

Plants started in fertile soil enriched with compost or well-rotted organic matter usually need little additional fertilizer at first. Watch the rate of new leaf growth and follow the directions for the fertilizer you choose if feeding becomes necessary.

Avoid placing concentrated fertilizer against the stem or feeding while the soil is dry. Dilute liquid products as directed rather than increasing the dose to force faster growth.

## Sowing and propagation

Malabar spinach can be grown from seed or stem cuttings. Soaking the seeds in water for about a day before sowing can help prepare them for planting. Keep the growing medium moist while waiting for germination, but do not leave it soggy.

For cuttings, choose a healthy piece of stem with several nodes, make the cut just below a node, and place it in moist growing medium. Cuttings may be started in a container or planted directly in the ground. Keep the medium moist while roots begin to develop.

## Ongoing care and harvest

Guide the vines onto their support as they lengthen and tie them loosely when needed. Pinching the tips or harvesting regularly encourages side shoots, giving you more tender growth instead of one long main vine.

The first young shoots are often ready about 6-8 weeks after emergence, depending on the weather and growing conditions. Use clean scissors to cut just above a leaf node, leaving enough healthy stem for the plant to regrow. Pick the leaves and shoots while they are tender, and avoid stripping the whole plant at once.

## Common pests and diseases

[Snails and slugs](richfarm://pests-diseases/slugs_snails) may feed on young leaves, especially in damp, sheltered areas. Check around the base, beneath containers, and under the leaves in the early morning or evening. Keeping the growing area open and clearing fallen leaves reduces potential hiding places.

[Leaf spot](richfarm://pests-diseases/leaf_spot) may cause unusual spots that spread across the foliage. Stop harvesting the affected growth, remove diseased leaves, and avoid wetting the foliage late in the day. Do not apply a pesticide to leafy vegetables until the problem has been identified and you have appropriate safety instructions.
```

## 8. So sánh trước và sau khi áp dụng rule

| Trước khi áp dụng đầy đủ rule | Sau khi refine |
|---|---|
| “Cây trong chậu thường mất ẩm nhanh hơn” khiến chủ thể mất ẩm không rõ ràng. | “Trong những ngày nắng nóng, đất thường mất ẩm nhanh hơn” nói rõ nguyên nhân và đối tượng cần kiểm tra. |
| “Làm một giàn đơn giản” không cho biết loại giàn và cách sử dụng. | Nêu cụ thể giàn lưới hoặc giàn dây, chiều cao vừa tầm hái và cách hướng ngọn, buộc dây. |
| Phần bón phân chỉ nhắc làm theo hướng dẫn sản phẩm. | Giải thích vai trò của đạm, cách đọc N-P-K, công thức tham khảo và dấu hiệu cần cân nhắc trước khi bón thêm. |
| Dùng từ ít phổ biến như “hom thân”. | Dùng “giâm cành”, sau đó mô tả cách chọn và cắm cành. |
| Cảnh báo ngắn: “đừng để khay gieo bị sũng nước”. | Dùng từ nối “tuy nhiên”, nêu rõ điều cần tránh và hậu quả đối với hạt, rễ non. |
| Hướng dẫn sâu bệnh dừng ở việc kiểm tra và loại bỏ lá. | Bổ sung thời điểm kiểm tra, nơi sâu thường ẩn, trình tự xử lý, vệ sinh dụng cụ và điều kiện an toàn trước khi dùng thuốc. |

Bản refine giống người viết hơn vì nội dung đi từ việc cần làm, giải thích vừa đủ lý do và luôn đặt hành động trong điều kiện thực tế. Các câu không cố tạo vẻ thân mật bằng trợ từ; `bạn` chỉ xuất hiện khi giúp xác định rõ người thực hiện.

## 9. Checklist biên tập trước khi publish

- [ ] Giá trị lưu là Markdown thuần, không phải JSON.
- [ ] Không dùng heading `#`; bắt đầu các mục bằng `##`.
- [ ] Bài viết tự nhiên khi đọc thành tiếng.
- [ ] Tên cây không bị lặp ở đầu hai câu hoặc hai đoạn gần nhau.
- [ ] Các từ thay thế như `cây`, `loài này` hoặc cụm mô tả đặc tính được dùng tự nhiên và không làm sai taxonomy.
- [ ] `Bạn` hoặc `you` xuất hiện tối đa một lần trong mỗi mục và không lặp ở nhiều câu liên tiếp.
- [ ] Không có `nhé`, `ạ`, `vâng` hoặc `đâu` dùng như từ đệm.
- [ ] `Cứ` và `hãy` đã được bỏ nếu không làm thay đổi ý nghĩa.
- [ ] Các trạng từ, từ nối đều làm rõ thời điểm, trình tự, mức độ hoặc quan hệ đối lập.
- [ ] Không lặp lại phần mô tả chung của cây.
- [ ] Mỗi mục trả lời một nhu cầu thực tế của người trồng.
- [ ] Mục sâu bệnh đã kiểm tra riêng cả sâu hại và bệnh; không dùng một nhóm để thay cho nhóm còn lại.
- [ ] Mỗi sâu hại và bệnh đã có trong thư viện được gắn link nội bộ bằng stable `pestsDiseases.key`.
- [ ] Nhãn link được dịch tự nhiên theo locale nhưng link target giữ nguyên giữa các locale.
- [ ] Có hướng dẫn quan sát và điều chỉnh theo điều kiện thực tế.
- [ ] Không có câu chung chung, quảng cáo hoặc dấu hiệu bản dịch máy.
- [ ] Không có con số, lịch tưới/bón hoặc cảnh báo thiếu căn cứ.
- [ ] Mọi khoảng số dùng dấu `-` theo format `6-8`, không dùng `–` hoặc `—`.
- [ ] Không có URL nguồn hoặc citation trong nội dung hiển thị; chỉ cho phép deep link nội bộ đã định nghĩa.
- [ ] Nội dung đã được một người đọc lại và chỉnh giọng văn.
- [ ] Các locale truyền đạt cùng sự thật, con số và cảnh báo.
- [ ] Tên hiển thị là common name tự nhiên của từng locale; tên khoa học và alias không bị ghép vào tên hiển thị.
- [ ] Nội dung không chèn common name của locale khác để trang trí hoặc giải thích tên cây; alias đa ngôn ngữ chỉ nằm trong metadata tìm kiếm, trừ khi tên địa phương là chủ đề thực sự của bài.
- [ ] Alias mở rộng khả năng tìm kiếm bằng một cách gọi thực sự khác, không lặp lại common name dưới dạng biến thể hình thức.
- [ ] Bản dịch đã được biên tập tự nhiên, không phải bản dịch từng chữ.
- [ ] Mỗi locale có trạng thái review riêng; chưa duyệt thì giữ `needs_review`.

## 10. Nguồn tham khảo cho bài mẫu

Nguồn chỉ phục vụ biên tập và kiểm duyệt, không chèn vào `careContent` hiển thị:

- [University of Guam Cooperative Extension — Malabar Spinach](https://www.uog.edu/_resources/files/extension/publications/Malabar_Spinach_30_12_21.pdf)
- [World Vegetable Center — Home Gardens Training Manual, mục Basella](https://avrdc.org/download/publications/manuals/Home-gardens-training-manual_South-Asia.pdf)

## 11. Lưu ý triển khai hiện tại

Guideline này định nghĩa contract nội dung mới: `careContent` là Markdown thuần. Hiện tại một số phần của dashboard, mobile và sync vẫn gọi `JSON.parse` hoặc chuyển `care_content_json` thành JSON. Các read/write path đó phải được migration sang render và lưu Markdown trước khi đưa nội dung theo guideline này vào production.

Màn sâu bệnh trên mobile hiện được mở bằng state của modal trong tab Library, chưa có route nhận stable `pestsDiseases.key`. Trước khi publish nội dung có link `richfarm://pests-diseases/{key}`, mobile phải bổ sung deep-link handler mở đúng tab và đúng bản ghi; `MarkdownText` cũng phải chuyển link nội bộ qua router của app thay vì giao cho hệ điều hành xử lý như URL ngoài.
