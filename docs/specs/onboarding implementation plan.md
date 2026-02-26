# 🌱 ONBOARDING IMPLEMENTATION PLAN
## FARM / FOOD PRODUCTION / OFF-GRID

Dưới đây là một implementation plan cho onboarding được thiết kế đúng định hướng farm, tức là không phải app “chăm cây cute cute”, mà là một hệ thống hỗ trợ small farm + food production + off‑grid living. Mình sẽ xây dựng theo hướng thực dụng, tối ưu dữ liệu, và phân nhánh người dùng để sau này AI trong app có thể đưa ra gợi ý chính xác.

---

### 1. Mục tiêu của onboarding
* **Hiểu mô hình farm của user:** Quy mô, loại cây, mục đích.
* **Thu thập dữ liệu để:**
    * Gợi ý lịch trồng – thu hoạch – tái trồng.
    * Gợi ý quy trình chăm sóc theo từng loại cây.
    * Tạo nhật ký farm tự động.
    * Tối ưu sản lượng và tính tự cung tự cấp.
* **Phân loại user:** Theo mức độ kinh nghiệm, mức độ nghiêm túc, khả năng dành thời gian.

---

### 2. Flow tổng thể
Onboarding nên gồm 5 bước, mỗi bước cực kỳ rõ ràng, không dài dòng:

#### **Bước 1 – Xác định mục tiêu farm**
* **Câu hỏi:** *“Farm của bạn hướng đến điều gì?”*
* **Lựa chọn (Cho phép chọn nhiều):**
    * 🌾 Trồng để ăn / tự cung tự cấp
    * 🌼 Trồng hoa / ornamental
    * 🌿 Trồng dược liệu
    * 🧺 Kinh doanh nhỏ (bán rau, hoa, cây giống…)
    * 🏡 Off-grid / homestead
    * 🧪 Thử nghiệm – học hỏi
* **Output:** Phân loại user theo mục tiêu để cá nhân hóa toàn bộ app.

#### **Bước 2 – Quy mô & môi trường**
* **Câu hỏi:** *“Bạn đang vận hành farm ở đâu?”*
* **Lựa chọn (Cho phép chọn nhiều):**
    * Indoor (hydroponic, container, windowsill)
    * Outdoor (sân, ban công, rooftop)
    * Garden / đất vườn
    * Greenhouse
    * Farm mini (50–200m²)
    * Farm lớn (>200m²)
* **Output:** Giúp AI tính toán khả năng trồng, mật độ, lịch tưới, sâu bệnh theo môi trường.

#### **Bước 3 – Loại cây bạn đang trồng / muốn trồng**
* **Câu hỏi:** *“Bạn đang làm việc với loại cây nào?”*
* **Lựa chọn (Cho phép chọn nhiều):**
    * Rau ăn lá / Rau ăn quả / Cây lấy củ
    * Cây ăn trái / Cây gia vị
    * Hoa / Cây cảnh indoor
    * Cây lâu năm
    * Cây tái sinh nhanh (microgreens, sprouts)
* **Output:** Tạo bộ dữ liệu ban đầu cho farm profile.

#### **Bước 4 – Mức độ kinh nghiệm**
* **Câu hỏi:** *“Kinh nghiệm của bạn thế nào?”*
* **Lựa chọn:**
    * **New to farming:** “Tôi mới bắt đầu, cần hướng dẫn từng bước.”
    * **Intermediate grower:** “Tôi đã trồng rồi, nhưng muốn tối ưu sản lượng.”
    * **Experienced / Homesteader:** “Tôi muốn quản lý farm như một hệ thống hoàn chỉnh.”
* **Output:** Điều chỉnh độ chi tiết của hướng dẫn.

#### **Bước 5 – Bạn muốn app hỗ trợ điều gì?**
* **Lựa chọn:**
    * Chẩn đoán bệnh – sâu
    * Nhắc lịch tưới / bón phân / thu hoạch
    * Lập kế hoạch trồng – tái trồng
    * Theo dõi sản lượng / Quản lý nhật ký farm
    * Nhận diện cây / Tính toán mật độ trồng
    * Gợi ý giống phù hợp khí hậu
    * “Khác”
* **Output:** Bật/tắt các module trong app.

---

### 3. Logic phân nhánh sau onboarding
Dựa trên dữ liệu thu được, app sẽ:

* **Nếu user trồng để ăn → Kích hoạt module Food Production:**
    * Lịch trồng – thu hoạch.
    * Tính toán sản lượng dự kiến.
    * Gợi ý giống theo mùa.
    * Nhắc tái trồng để không bị “đứt bữa”.
* **Nếu user kinh doanh nhỏ → Kích hoạt module Business:**
    * Theo dõi chi phí – lợi nhuận.
    * Quản lý inventory.
    * Lịch thu hoạch tối ưu để bán.
* **Nếu user off-grid → Kích hoạt module Homestead:**
    * Gợi ý cây đa năng.
    * Lịch bảo tồn hạt giống.
    * Tối ưu tự cung tự cấp.
* **Nếu user indoor → Kích hoạt module Indoor Care:**
    * Lịch tưới theo môi trường.
    * Nhắc thay chậu.
    * Theo dõi ánh sáng.

---

### 4. Tone & UX của onboarding
* **Phong cách:** Ngắn gọn, không “cute hóa”. Hướng thực dụng, vibe “homestead / farm management”.
* **Visual:** Icon đơn giản, không màu mè.
* **Tương tác:** Mỗi bước chỉ 1 câu hỏi, không scroll dài.

---

### 5. Dữ liệu cần lưu sau onboarding
1. Mục tiêu farm
2. Quy mô & Môi trường
3. Loại cây
4. Kinh nghiệm
5. Nhu cầu hỗ trợ
6. Khí hậu (tự detect theo location)
7. Số giờ nắng trung bình (user nhập hoặc detect)

### 6. Kết quả rút ra sau 5 bước Onboarding
Sau khi hoàn thành 5 bước, hệ thống sẽ xác định được các yếu tố cốt lõi của user:

#### **A. Nhu cầu cốt lõi (Core Needs)**
Dựa trên mục tiêu, loại cây và nhu cầu hỗ trợ:
* **Tự cung tự cấp:** Cần lịch trồng, tái trồng và dự báo sản lượng.
* **Kinh doanh nhỏ:** Cần quản lý chi phí, kho (inventory) và dự báo thu hoạch.
* **Off-grid:** Cần tối ưu nguồn lực, chọn cây đa năng và bảo tồn hạt giống.
* **Indoor grower:** Cần lịch tưới, tối ưu ánh sáng và xử lý sâu bệnh trong nhà.
* **Người mới (Beginner):** Cần hướng dẫn chi tiết từng bước (step-by-step).
* **Người có kinh nghiệm:** Cần dashboard quản lý farm tổng thể.

#### **B. Mức độ cam kết (Commitment Level)**
* **Người mới:** Onboarding nhẹ nhàng, hướng dẫn đơn giản.
* **Người trung cấp:** Tập trung vào các công cụ tối ưu hóa.
* **Pro/Homesteader:** Cần các tính năng tự động hóa (automation) và phân tích sâu (analytics).

#### **C. Khả năng vận hành farm**
* **Indoor nhỏ:** Tập trung vào lịch tưới và ánh sáng nhân tạo.
* **Garden/Outdoor:** Tập trung vào quản lý sâu bệnh và biến đổi thời tiết.
* **Greenhouse:** Theo dõi chặt chẽ nhiệt độ và độ ẩm.
* **Farm mini/lớn:** Quản lý theo khu vực, nhật ký chi tiết và sản lượng lớn.

#### **D. Điều kiện khí hậu & rủi ro**
Dựa trên vị trí địa lý (location):
* Xác định mùa vụ phù hợp nhất.
* Cảnh báo sớm sương giá, nắng nóng hoặc bão.
* Tự động điều chỉnh lịch tưới dựa trên dự báo mưa.
* Gợi ý các giống cây bản địa phù hợp với thổ nhưỡng.

---

### 7. Khai thác dữ liệu Onboarding (Smart System)
Onboarding không chỉ để thu thập thông tin, mà là để kích hoạt hệ thống thông minh nhằm hỗ trợ user tối đa.

#### **A. Cá nhân hóa trải nghiệm (Personalization)**
* Gợi ý cây trồng phù hợp với môi trường và mục tiêu.
* Tạo lịch trồng riêng biệt theo vùng khí hậu.
* Nhắc nhở tái trồng đúng thời điểm để duy trì nguồn cung thực phẩm.

#### **B. Tự động hóa (Automation Layer)**
* **Smart Watering:** Tự động hoãn lịch tưới khi dự báo có mưa.
* **Extreme Weather:** Cảnh báo và đề xuất giải pháp khi thời tiết cực đoan.
* **Pest Alert:** Cảnh báo sâu bệnh theo mùa vụ tại địa phương.

#### **C. Xây dựng “Farm Profile”**
Hồ sơ farm là nền tảng để phân tích (Analytics):
* Danh mục cây đang trồng & Mật độ trồng.
* Lịch sử chăm sóc & Nhật ký farm.
* So sánh sản lượng dự kiến vs. thực tế.
* Báo cáo chi phí – lợi nhuận.

#### **D. Gợi ý hành động tiếp theo (Next Best Action)**
Hệ thống đưa ra các lời khuyên thực tế:
* *“3 ngày nữa có mưa, bạn có thể hoãn tưới hôm nay.”*
* *“Cà chua của bạn sắp ra hoa, hãy bổ sung thêm Kali.”*
* *“Thời điểm vàng để gieo rau muống là tuần này.”*

---

### 8. Tóm tắt logic hệ thống

| Dữ liệu thu thập | Mục đích sử dụng |
| :--- | :--- |
| **Mục tiêu farm** | Kích hoạt các module tính năng phù hợp (Business, Homestead...) |
| **Quy mô & Môi trường** | Tính toán mật độ, lịch tưới và rủi ro sâu bệnh |
| **Loại cây** | Cung cấp quy trình chăm sóc và lịch mùa vụ |
| **Kinh nghiệm** | Điều chỉnh độ chi tiết của hướng dẫn và UI/UX |
| **Nhu cầu hỗ trợ** | Ưu tiên hiển thị các tính năng user cần nhất |
| **Vị trí (Location)** | Tích hợp dữ liệu thời tiết và gợi ý giống địa phương |

---
**→ Mục tiêu cuối cùng:** Biến dữ liệu tĩnh từ Onboarding thành một **Hệ sinh thái hỗ trợ vận hành farm tự động và thông minh.**