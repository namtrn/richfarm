# Guideline viết `detailContent` cho sâu hại và bệnh cây

> Phiên bản: 1.0  
> Phạm vi: nội dung chi tiết trên màn hình sâu hại và bệnh cây  
> Định dạng bắt buộc: Markdown thuần  
> Ngôn ngữ tài liệu: tiếng Việt; nội dung hiển thị: đa ngôn ngữ

## 1. Mục tiêu

`detailContent` phải giúp người dùng trả lời nhanh ba câu hỏi:

1. Những gì đang thấy có giống sâu hại hoặc bệnh này không?
2. Cần kiểm tra thêm ở đâu để phân biệt với nguyên nhân khác?
3. Có thể làm gì ngay mà chưa gây thêm hại cho cây hoặc người sử dụng?

Nội dung phải hữu ích cả khi người dùng nhìn thấy tác nhân lẫn khi chỉ thấy dấu vết để lại trên lá, thân, rễ, hoa hoặc quả.

## 2. Phân chia dữ liệu

Chỉ thông tin cần tìm kiếm, liên kết hoặc lọc mới được lưu thành field có cấu trúc, ví dụ:

```ts
{
  key: string;
  type: "pest" | "disease";
  scientificName?: string;
  imageUrl?: string;
  plantKeys: string[];
  sortOrder: number;
}
```

Tên và nội dung theo ngôn ngữ được lưu ở bản ghi locale riêng:

```ts
{
  pestDiseaseKey: string;
  locale: string;
  name: string;
  description?: string;
  detailContent: string;
  contentStatus?: "draft" | "published" | "needs_review" | "archived";
}
```

Hình dáng, màu sắc, kích thước, trứng, thời gian hoạt động, kiểu vết cắn, triệu chứng, diễn biến, điều kiện phát triển, cách phòng ngừa và xử lý đều thuộc `detailContent`. Không tạo field riêng cho từng chi tiết nếu app không cần dùng chúng để tính toán hoặc lọc.

## 3. Format Markdown

Cho phép:

- heading cấp 2 `##`;
- đoạn văn ngắn;
- bullet khi có nhiều dấu hiệu hoặc hành động cần đối chiếu;
- chữ đậm cho cảnh báo ngắn;
- link nội bộ đến cây hoặc nội dung liên quan;
- số và đơn vị khi có nguồn đáng tin cậy.

Không dùng:

- JSON hoặc HTML trong nội dung hiển thị;
- bảng dài;
- heading cấp 1 `#` vì tên đối tượng đã có trên màn hình;
- emoji cho từng heading;
- câu giữ chỗ như “đang cập nhật”;
- citation hoặc URL nguồn trong nội dung người dùng đọc.

Khoảng số dùng dấu gạch ngang ASCII theo dạng `1,5-3 mm`, không dùng en dash hoặc em dash.

## 4. Cấu trúc cho sâu hại

Không bắt buộc bài nào cũng có đủ mọi mục. Chỉ dùng heading có thông tin đã được xác minh và thực sự giúp nhận biết.

Ba heading trong mỗi nhóm dưới đây là gợi ý về giọng văn, không phải danh sách bắt buộc. Người viết được đặt heading khác hoặc gọi thẳng tên sâu hại khi cách đó rõ và tự nhiên hơn.

### Nhóm nội dung: đặc điểm nhận biết

Ba heading gợi ý:

- `## Các đặc điểm nhận biết`
- `## Hình dáng và đặc điểm nhận biết`
- `## Cách nhận biết [tên sâu hại]`

Mô tả những gì có thể quan sát trực tiếp:

- hình dáng và đặc điểm nổi bật;
- màu sắc, kể cả khác biệt giữa sâu non và trưởng thành;
- kích thước kèm vật so sánh quen thuộc nếu hữu ích;
- vị trí thường tìm thấy: mặt dưới lá, đọt non, nách lá, trong thân, dưới đất hoặc quanh rễ;
- cách di chuyển hoặc phản ứng khi bị chạm.

Không chỉ mô tả con trưởng thành nếu giai đoạn gây hại chính là sâu non, ấu trùng hoặc nhộng.

### Nhóm nội dung: dấu vết trên cây

Ba heading gợi ý:

- `## Các dấu vết trên cây`
- `## Những dấu vết thường gặp`
- `## Dấu vết [tên sâu hại] để lại`

Đây thường là mục quan trọng nhất vì người dùng có thể không nhìn thấy sâu. Mô tả cụ thể:

- hình dạng vết cắn: lỗ tròn nhỏ, mép lá nham nhở, lá bị ăn chỉ còn gân, đường hầm trong lá hoặc vết cạo trên bề mặt;
- vị trí vết hại xuất hiện đầu tiên và bộ phận bị hại nhiều nhất;
- dấu vết đi kèm như phân sâu, tơ, mật ngọt, lớp sáp, đường nhớt, lá cuốn hoặc thân bị đục;
- khác biệt giữa vết mới và tổn thương cũ nếu có giá trị thực hành.

Tránh câu chung chung như “gây hại lá” hoặc “làm cây yếu”. Người đọc cần biết vết hại trông như thế nào.

### Nhóm nội dung: trứng, sâu non và nơi ẩn náu

Ba heading gợi ý:

- `## Trứng và sâu non thường ở đâu?`
- `## Vị trí thường có trứng và sâu non`
- `## Trứng, sâu non và nơi ẩn náu`

Chỉ viết khi người dùng có khả năng quan sát hoặc việc loại bỏ giai đoạn đó giúp kiểm soát sâu:

- trứng nằm riêng lẻ hay thành cụm, có màu gì và thường ở đâu;
- sâu non hoặc ấu trùng khác con trưởng thành như thế nào;
- giai đoạn nào trực tiếp gây hại;
- nhộng hoặc nơi trú đông nếu thông tin này ảnh hưởng đến cách xử lý.

### Nhóm nội dung: thời gian và nơi hoạt động

Ba heading gợi ý:

- `## Thời điểm thường xuất hiện`
- `## Khi nào dễ bắt gặp?`
- `## Nơi và thời điểm hoạt động`

Nêu thời điểm kiểm tra dễ thấy nhất, chẳng hạn sáng sớm, ban ngày, chiều tối hoặc ban đêm. Có thể mô tả điều kiện làm mật độ tăng như nóng khô, ẩm kéo dài hoặc tán lá rậm.

Không dùng lịch tháng cố định cho mọi nơi. Mùa xuất hiện phụ thuộc khí hậu và địa phương.

### Nhóm nội dung: dấu hiệu dễ nhầm

Ba heading gợi ý:

- `## Các dấu vết dễ nhầm`
- `## Những dấu vết có biểu hiện tương tự`
- `## Phân biệt với [dấu vết hoặc đối tượng cụ thể]`

Nêu 1-3 khả năng có dấu vết gần giống và cách phân biệt bằng dấu hiệu người dùng có thể kiểm tra. Không khẳng định chắc chắn chỉ dựa trên một triệu chứng.

### Nhóm nội dung: theo dõi, phòng ngừa và xử lý

Ba heading gợi ý, tùy trọng tâm của bài:

- `## Cách theo dõi và phòng ngừa`
- `## Những việc giúp hạn chế [tên sâu hại]`
- `## Khi nào cần xử lý?`

Đi theo trình tự an toàn:

1. kiểm tra lại để xác nhận;
2. bắt bỏ, cắt bỏ hoặc cách ly khi phù hợp;
3. điều chỉnh cách chăm sóc hoặc môi trường;
4. dùng biện pháp sinh học hoặc thuốc chỉ khi đã xác định đúng đối tượng.

## 5. Cấu trúc cho bệnh cây

Bệnh không dùng các heading về hình dáng côn trùng, trứng hoặc thời gian hoạt động. Nội dung tập trung vào triệu chứng, quá trình lan và nguyên nhân dễ nhầm.

Ba heading trong mỗi nhóm dưới đây cũng chỉ là gợi ý. Bài thực tế có thể dùng heading cụ thể hơn theo bộ phận cây, dấu hiệu hoặc cách lây của bệnh.

### Nhóm nội dung: dấu hiệu của bệnh

Ba heading gợi ý:

- `## Các dấu hiệu của bệnh`
- `## Những dấu hiệu xuất hiện sớm`
- `## [Tên bệnh] thường biểu hiện như thế nào?`

Mô tả nơi triệu chứng thường xuất hiện trước:

- lá già hay lá non;
- mép lá, gân lá, cuống, thân, cổ rễ, rễ, hoa hoặc quả;
- một cành, một phía của cây hay toàn cây;
- màu sắc, hình dạng và kết cấu ban đầu.

### Nhóm nội dung: kiểm tra thêm trên cây

Ba heading gợi ý:

- `## Các bước kiểm tra nhanh`
- `## Những vị trí cần kiểm tra thêm`
- `## Kiểm tra [bộ phận cụ thể của cây]`

Ưu tiên đặc điểm có thể quan sát:

- vết tròn, góc cạnh, đồng tâm, lõm hoặc mọng nước;
- tâm, viền và quầng có màu gì;
- mô khô, giòn, mềm, nhũn hoặc có mùi;
- mặt dưới lá có bột, mốc, dịch hoặc cấu trúc bất thường không;
- bên trong thân hoặc rễ đổi màu như thế nào nếu việc kiểm tra không làm tăng nguy cơ lây bệnh.

### Nhóm nội dung: triệu chứng thay đổi theo thời gian

Ba heading gợi ý:

- `## Các triệu chứng thay đổi theo thời gian`
- `## Bệnh tiến triển như thế nào?`
- `## Từ dấu hiệu ban đầu đến khi bệnh nặng`

Mô tả thứ tự thay đổi thay vì chỉ liệt kê hậu quả. Ví dụ: vết nhỏ lớn dần, nhập lại, lá vàng rồi rụng; hoặc một cành héo trước khi toàn cây suy sụp.

### Nhóm nội dung: điều kiện xuất hiện và lây lan

Ba heading gợi ý:

- `## Các điều kiện dễ làm bệnh xuất hiện`
- `## Khi nào bệnh dễ lây lan?`
- `## Thời tiết và môi trường thuận lợi cho bệnh`

Chỉ nêu điều kiện đã được xác minh cho đúng bệnh, như lá ướt kéo dài, đất thoát nước chậm, nhiệt độ phù hợp với tác nhân hoặc cây trồng quá dày. Không quy mọi bệnh cho “tưới quá nhiều”.

### Nhóm nội dung: dấu hiệu dễ nhầm

Ba heading gợi ý:

- `## Các dấu hiệu dễ nhầm`
- `## Những vấn đề có biểu hiện tương tự`
- `## Phân biệt với [nguyên nhân cụ thể]`

So sánh với vấn đề sinh lý và bệnh có biểu hiện gần giống, chẳng hạn thiếu nước, úng rễ, thiếu dinh dưỡng, cháy nắng, tổn thương do thuốc hoặc một bệnh khác.

Phải nêu cách kiểm tra tiếp theo. Không chỉ viết “có thể nhầm với thiếu dinh dưỡng”.

### Nhóm nội dung: theo dõi, hạn chế lây lan và loại bỏ cây

Ba heading gợi ý, tùy mức độ và cách lây của bệnh:

- `## Cách theo dõi và phòng ngừa`
- `## Cách hạn chế lây sang cây khác`
- `## Cách ly và loại bỏ cây`

Nêu hành động an toàn ban đầu như cách ly, bỏ lá bệnh, vệ sinh dụng cụ, thay đổi cách tưới hoặc ngừng di chuyển đất giữa các chậu. Nếu cần xét nghiệm hoặc chẩn đoán chuyên môn mới phân biệt được, phải nói rõ giới hạn đó.

## 6. Phòng ngừa và xử lý

Biện pháp xử lý không cần chia cứng thành `physical`, `organic` và `chemical`. Viết theo thứ tự phù hợp với tình huống thực tế.

- Ưu tiên xác nhận đúng nguyên nhân trước khi xử lý.
- Bắt đầu bằng biện pháp ít rủi ro như loại bỏ bộ phận bị hại, vệ sinh, cải thiện thông thoáng hoặc điều chỉnh tưới.
- Không dùng từ `hữu cơ` như một từ đồng nghĩa với an toàn.
- Không khuyên dùng hoạt chất hoặc sản phẩm nếu chưa kiểm tra cây được phép sử dụng, liều lượng, thời gian cách ly và quy định tại locale của người dùng.
- Không hứa một biện pháp sẽ chữa khỏi bệnh đã xâm nhập toàn cây.
- Với cây ăn được, không đưa hướng dẫn thuốc chung chung thiếu thời gian cách ly và nhãn sử dụng phù hợp.

## 7. Hình ảnh

Ảnh phải giúp nhận biết đúng đối tượng, không chỉ dùng để trang trí.

Với sâu hại, ưu tiên:

1. dấu vết điển hình trên cây;
2. giai đoạn trực tiếp gây hại;
3. trứng hoặc giai đoạn khác nếu có giá trị nhận biết.

Với bệnh, ưu tiên:

1. triệu chứng sớm;
2. cận cảnh vết bệnh;
3. triệu chứng nặng hoặc toàn cây để thể hiện quá trình tiến triển.

Không dùng một ảnh mock chung cho nhiều đối tượng. Ảnh phải có nguồn và quyền sử dụng được lưu trong metadata quản trị.

## 8. Giọng văn và mức độ chắc chắn

- Viết từ điều người dùng nhìn thấy đến hành động cần làm.
- Dùng từ quen thuộc; giải thích thuật ngữ ngay lần đầu xuất hiện.
- Không lặp tên đối tượng ở đầu nhiều đoạn liên tiếp.
- Tránh câu máy móc như “thực hiện biện pháp kiểm soát phù hợp”.
- Không gọi một triệu chứng đơn lẻ là bằng chứng chắc chắn.
- Dùng “có thể”, “thường” hoặc “cần kiểm tra thêm” khi thực sự còn khả năng khác.
- Không làm mềm một thông tin chưa được xác minh rồi đưa vào bài.

Một câu cảnh báo ngắn nên xuất hiện khi triệu chứng dễ bị chẩn đoán nhầm:

> Các dấu hiệu này giúp thu hẹp nguyên nhân nhưng có thể trùng với bệnh, sâu hại hoặc vấn đề chăm sóc khác.

### Tên phổ thông theo từng ngôn ngữ

Tên hiển thị phải là common name được người dùng của locale đó sử dụng tự nhiên. Không dịch từng chữ từ tên tiếng Anh và không dùng tên khoa học làm tiêu đề mặc định khi đã có tên phổ thông rõ ràng.

Ví dụ:

```text
vi: Bệnh héo xanh do vi khuẩn
en: Bacterial wilt
scientificName: Ralstonia solanacearum
```

Chỉ lưu alias khi đó là một cách gọi thực sự khác và giúp người dùng tìm thấy nội dung bằng từ họ có khả năng sử dụng. Alias có thể là tên địa phương, tên dân gian, tên chuyên ngành cũ hoặc chữ viết tắt phổ biến; không ghép tất cả vào tên hiển thị:

```text
vi aliases: Héo rũ vi khuẩn
en aliases: Bacterial vascular wilt
```

Không tạo alias chỉ bằng cách:

- đổi thứ tự các từ, như `Bệnh héo xanh do vi khuẩn` thành `Héo xanh vi khuẩn`;
- bỏ dấu tiếng Việt, vì search đã chuẩn hóa dấu;
- đổi số ít thành số nhiều;
- thêm hoặc bỏ các từ chung như `bệnh`, `cây`, `sâu`;
- thay đổi chữ hoa, dấu câu hoặc khoảng trắng.

Nếu alias sau khi chuẩn hóa vẫn gần như cùng cụm từ với common name, hãy bỏ alias đó. Tên khoa học cũ hoặc đồng danh khoa học được lưu ở trường scientific synonym riêng, không trộn với common-name aliases.

Mỗi locale phải được kiểm tra độc lập vì một common name có thể chỉ đúng với một nhóm cây, một khu vực hoặc một tác nhân cụ thể. Nếu chưa xác minh được tên phổ thông của locale, dùng tên khoa học kèm trạng thái `needs_review`; không tự tạo tên bằng bản dịch máy.

## 9. Độ dài và đa ngôn ngữ

- Toàn bài thường khoảng 250-600 từ tiếng Việt.
- Mỗi mục thường có 1-3 đoạn ngắn.
- Không kéo dài bài chỉ để đủ số mục.
- Các locale phải giữ cùng sự thật, con số, cảnh báo và mức độ chắc chắn.
- Tên phổ thông được dịch tự nhiên; tên khoa học giữ nguyên.
- Bản AI hoặc máy dịch chưa được người thông thạo locale duyệt phải giữ trạng thái `needs_review`.

Fallback hiển thị đề xuất:

```text
locale chính xác -> en -> không hiển thị detailContent
```

Không fallback sang một sâu hại hoặc bệnh khác chỉ vì tên hay triệu chứng gần giống.

## 10. Bài mẫu

Hai bài dưới đây là nội dung Markdown có thể hiển thị trực tiếp trong app. Citation và URL được giữ ngoài `detailContent`.

### 10.1. Sâu hại - Bọ nhảy

```markdown
## Các đặc điểm nhận biết

Bọ nhảy trưởng thành rất nhỏ, thường dài khoảng 1,7-4,2 mm. Thân có thể màu đen, nâu, xanh ánh kim hoặc xám kim loại; một số loài có sọc hoặc đốm. Cặp chân sau lớn giúp chúng bật khỏi lá rất nhanh khi cây bị chạm, vì vậy đôi khi chỉ kịp thấy một chấm đen nhỏ biến mất.

Kiểm tra trên lá non, lá mầm và phần đọt của cây. Có thể quan sát dễ hơn vào buổi sáng mát, khi bọ di chuyển chậm hơn. Không nên xác định chỉ dựa vào màu sắc vì nhiều loài bọ nhảy có hình thức khác nhau.

## Các dấu vết trên cây

Dấu hiệu điển hình là nhiều lỗ nhỏ, tròn hoặc hơi méo nằm rải rác trên lá, trông giống bề mặt bị bắn bằng những hạt li ti. Phần lớn lỗ có đường kính khoảng 1,5-3,2 mm. Trên lá dày hoặc có lớp sáp, bọ có thể chỉ cạo thành các hố nông thay vì ăn thủng hoàn toàn.

Cây con chịu tổn thương nặng hơn cây đã lớn. Khi mật độ bọ cao, lá mầm và lá non có thể bị thủng dày, cây chậm phát triển hoặc héo. Vết cắn cũ vẫn còn sau khi bọ đã rời đi, vì vậy cần kiểm tra thêm xem có bọ mới, lỗ mới hoặc lá non tiếp tục bị hại hay không.

## Trứng, sâu non và nơi ẩn náu

Phần lớn bọ nhảy đẻ trứng riêng lẻ hoặc thành cụm nhỏ trong đất gần gốc cây ký chủ. Trứng nhỏ, hình bầu dục, màu trắng đến vàng xám nên khó phát hiện bằng mắt thường.

Ấu trùng có thân trắng nhỏ giống sâu, đầu màu nâu và thường sống dưới đất để ăn rễ nhỏ. Với đa số cây rau, con trưởng thành ăn lá mới là giai đoạn gây hại dễ thấy nhất. Ấu trùng hóa nhộng trong đất trước khi bọ trưởng thành xuất hiện trở lại.

## Các dấu vết dễ nhầm

Một số sâu non cũng tạo lỗ trên lá, nhưng vết của chúng thường lớn hơn, mép nham nhở và có thể đi kèm phân sâu. Ốc sên để lại vết cắn lớn, không đều cùng đường nhớt sáng trên lá hoặc mặt đất. Nếu chỉ có vài lỗ cũ và không tìm thấy dấu hiệu mới, tác nhân có thể không còn hoạt động trên cây.

## Cách theo dõi và phòng ngừa

Kiểm tra cây con ngay khi vừa mọc và theo dõi các lá mới thay vì chỉ nhìn lá đã hư. Có thể dùng lưới chắn côn trùng để ngăn bọ tiếp cận cây non, nhưng mép lưới cần được giữ kín và phải tháo khi cây cần côn trùng thụ phấn.

Dọn cỏ dại và tàn dư cây trồng quanh luống để giảm nơi bọ trú và nguồn thức ăn thay thế. Nếu cây đã lớn khỏe, một ít lỗ nhỏ thường không cần xử lý bằng thuốc. Khi tổn thương tiếp tục tăng nhanh, cần xác định đúng cây trồng, loài bọ và sản phẩm được phép sử dụng trước khi chọn biện pháp kiểm soát.
```

### 10.2. Bệnh cây - Héo xanh vi khuẩn

```markdown
## Các dấu hiệu của bệnh

Bệnh héo xanh vi khuẩn do *Ralstonia solanacearum* gây ra. Cây có thể héo đột ngột dù đất vẫn còn đủ ẩm. Trong giai đoạn đầu, một cành hoặc một phía của cây có thể héo trước; lá thường vẫn xanh hoặc chỉ vàng nhẹ, khác với tình trạng nhiều lá già chuyển vàng từ từ.

Triệu chứng dễ thấy hơn vào lúc trời nóng. Cây có thể tạm bớt héo khi nhiệt độ giảm rồi tiếp tục héo nặng hơn, sau đó toàn cây suy sụp trong thời gian ngắn.

## Các bước kiểm tra nhanh

Khi cắt ngang phần thân gần gốc, các bó nhỏ bên trong thân có thể chuyển màu nâu hoặc nâu đỏ. Đây là phần đưa nước từ rễ lên lá, thường được gọi là mạch dẫn. Một cách kiểm tra sơ bộ là đặt đầu thân vừa cắt vào cốc nước sạch; nếu có dòng dịch trắng đục chảy ra từ phần này, cây có khả năng bị héo xanh vi khuẩn.

Thử nghiệm bằng nước chỉ là dấu hiệu hỗ trợ, không thay thế xét nghiệm. Không dùng cùng một dao để cắt tiếp cây khỏe nếu dụng cụ chưa được làm sạch.

## Các triệu chứng thay đổi theo thời gian

Vi khuẩn làm tắc hệ thống dẫn nước nên cây tiếp tục héo dù đất không khô. Khi bệnh nặng, toàn bộ tán héo rũ và cây chết nhanh. Tưới thêm nước không giúp cây phục hồi và có thể làm đất di chuyển sang chậu hoặc luống khác.

## Các dấu hiệu dễ nhầm

Thiếu nước cũng làm cây héo, nhưng đất thường khô và cây có thể phục hồi sau khi được tưới đúng cách. Đất úng có thể khiến rễ nâu, mềm hoặc có mùi bất thường. Bệnh héo Verticillium thường bắt đầu ở các lá phía dưới, làm lá vàng và khô dần; triệu chứng thường tiến triển chậm hơn héo xanh vi khuẩn.

Các dạng héo có biểu hiện gần nhau. Nếu không thấy đổi màu trong thân hoặc dòng dịch trắng đục, cần kiểm tra rễ, khả năng thoát nước và các nguyên nhân khác trước khi kết luận.

## Cách ly và loại bỏ cây

Cây đã héo nặng do vi khuẩn thường không thể phục hồi. Nhổ bỏ cả cây cùng phần rễ và không đưa vật liệu bệnh vào compost dùng lại trong vườn. Làm sạch dụng cụ, cọc đỡ và vật dụng đã tiếp xúc với đất hoặc dịch cây bệnh trước khi dùng ở khu vực khác.

Không trồng tiếp cà tím, cà chua, ớt hoặc khoai tây tại vị trí đã có bệnh trong ít nhất 3 năm. Trong thời gian đó, chọn cây không phải ký chủ và hạn chế mang đất, nước chảy hoặc cây giống từ khu vực bệnh sang luống sạch.

**Không có thuốc chữa đáng tin cậy cho cây đã nhiễm bệnh.** Nếu nhiều cây cùng héo hoặc cần xác nhận trước khi thay đổi khu vực trồng, nên gửi mẫu đến đơn vị chẩn đoán bệnh cây phù hợp tại địa phương.
```

## 11. Nguồn tham khảo cho bài mẫu

Nguồn chỉ phục vụ biên tập và kiểm duyệt, không chèn vào `detailContent` hiển thị:

- [University of Minnesota Extension - Flea beetles](https://extension.umn.edu/yard-and-garden-insects/flea-beetles)
- [Utah State University Extension - Flea Beetles on Vegetables](https://extension.usu.edu/planthealth/research/flea-beetles-vegetables)
- [Clemson Cooperative Extension - Eggplant Insect Pests & Diseases](https://hgic.clemson.edu/factsheet/eggplant-insect-pests-diseases/)
- [University of Minnesota Extension - Growing eggplant in home gardens](https://extension.umn.edu/vegetables/growing-eggplant)

## 12. Checklist trước khi publish

- [ ] `detailContent` là Markdown thuần.
- [ ] `key` ổn định và `type` là `pest` hoặc `disease`.
- [ ] Tên hiển thị là common name tự nhiên của locale; tên khoa học và alias được lưu riêng.
- [ ] Common name không được dịch từng chữ hoặc tự tạo khi chưa có bằng chứng sử dụng thực tế.
- [ ] Mỗi alias là một cách gọi khác biệt có giá trị tìm kiếm; không lưu biến thể bỏ dấu, đảo từ hoặc thêm bớt từ chung.
- [ ] Nội dung dùng cấu trúc phù hợp với loại; không ép bệnh dùng format của sâu hại.
- [ ] Sâu hại có mô tả dấu vết trên cây, không chỉ mô tả hình dáng con sâu.
- [ ] Kiểu vết cắn hoặc dấu vết được mô tả đủ cụ thể để quan sát.
- [ ] Trứng và các giai đoạn phát triển chỉ được nêu khi hữu ích và có nguồn.
- [ ] Bệnh có dấu hiệu ban đầu, hình dạng vết bệnh và quá trình tiến triển nếu đã xác minh.
- [ ] Có phần phân biệt với ít nhất một nguyên nhân gần giống khi nguy cơ nhầm lẫn cao.
- [ ] Hành động đầu tiên an toàn và phù hợp với mức độ chắc chắn.
- [ ] Không có khuyến nghị thuốc thiếu nhãn sử dụng, liều lượng hoặc thời gian cách ly phù hợp.
- [ ] Không dùng ảnh mock hoặc ảnh không đúng đối tượng.
- [ ] Mọi số liệu có provenance trong metadata quản trị.
- [ ] Không có citation hoặc URL nguồn trong nội dung hiển thị.
- [ ] Các locale giữ cùng sự thật và cảnh báo.
- [ ] Nội dung chưa được duyệt giữ trạng thái `needs_review`.

## 13. Lưu ý triển khai hiện tại

Schema hiện tại vẫn lưu `name`, `identification`, `damage`, `prevention`, `control` và `plantsAffected` trực tiếp trong bảng `pestsDiseases`. Màn mobile chỉ hiển thị một phần các field này và chưa có `detailContent` Markdown hoặc bảng locale riêng.

Trước khi áp dụng guideline vào production cần migration sang mô hình identity + locale content. Dữ liệu cũ phải được ghép thành bản nháp Markdown và giữ `needs_review`; không tự đánh dấu là đã duyệt chỉ vì migration thành công.
