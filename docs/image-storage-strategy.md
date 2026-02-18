# Richfarm — Image Storage Strategy

> Ngày tạo: 2026-02-18  
> Trạng thái: Research & Decision  
> Mục tiêu: Cân bằng giữa lưu ảnh trên Convex cloud và local device

---

## 1. Phân loại ảnh trong app

| Loại | Ví dụ | Nguồn | Số lượng | Kích thước |
|------|-------|-------|----------|------------|
| **Library (Plant DB)** | Ảnh minh họa cà chua, húng quế | Hệ thống cung cấp | ~200 ảnh, tĩnh | ~200KB/ảnh = ~40MB |
| **User photos** | Ảnh luống rau, cây cụ thể | User chụp/chọn | Không giới hạn | ~1-5MB/ảnh gốc |
| **Thumbnails** | Ảnh nhỏ hiển thị trong danh sách | Tự sinh từ ảnh gốc | = số ảnh gốc | ~30-50KB/ảnh |

---

## 2. Convex Storage — Giới hạn & Chi phí

| Plan | Storage | Giá |
|------|---------|-----|
| **Free (Starter)** | 1 GB | $0 |
| **Pro** | 100 GB included | $25/member/tháng + $0.03/GB thêm |
| **500 GB** | 100 + 400 extra | $25 + $12/tháng = **~$37/tháng** |

> [!WARNING]
> Với 1,000 user, mỗi user upload ~50 ảnh × 2MB = 100GB → hết Pro plan.
> Với 10,000 user → 1TB → ~$300/tháng chỉ riêng storage.

---

## 3. Các phương án

### Option A: Ảnh library trên Convex, user photos local ✅ **Đề xuất**

```
plantsMaster.imageUrl  →  Convex Storage / CDN
                           ~40MB cho 200 ảnh
                           Shared, không trùng

userPlants.photoUrl    →  Local device (expo-file-system)
                           documentDirectory
                           Mỗi user tự chứa

plantPhotos            →  Local device
                           Ghi lại path local
                           Convex chỉ lưu metadata
```

**Ưu điểm:**
- Storage Convex rất nhỏ (~40MB), nằm trong Free plan
- User photos không tốn cloud, chạy offline
- Nhanh vì không cần upload/download ảnh user

**Nhược điểm:**
- Ảnh user mất khi xóa app / đổi điện thoại
- Không xem ảnh trên nhiều thiết bị
- Cần xử lý path thay đổi trên iOS rebuild

---

### Option B: Tất cả lên Convex Storage

**Ưu điểm:** Đồng bộ mọi nơi, backup tự động  
**Nhược điểm:** Chi phí tăng nhanh theo user, cần internet để xem ảnh  

---

### Option C: Cloudinary cho library, local cho user photos

**Ưu điểm:** Cloudinary free 25GB, có transform (resize, crop, optimize)  
**Nhược điểm:** Thêm dependency bên thứ 3  

---

### Option D: Hybrid — local mặc định, optional cloud backup

**Ưu điểm:** Linh hoạt, user chọn backup khi muốn  
**Nhược điểm:** Phức tạp hơn để implement  

---

## 4. Đề xuất: Option A + D (phase sau)

### MVP (bây giờ)
- **Library images**: Convex Storage → cache local bằng `expo-image`
- **User photos**: `expo-file-system` documentDirectory → Convex chỉ lưu metadata

### Phase 2 (sau này)
- Thêm nút "Backup photos" → upload lên Cloudinary hoặc Convex Storage tùy plan

---

## 5. Kiến trúc kỹ thuật

### 5.1 Library Images (Plant DB)

```
[Convex Storage]  →  plantsMaster.imageUrl = "https://convex.cloud/..."
                  →  expo-image auto-cache (disk + memory)
                  →  User thấy ảnh ngay lần 2+ (offline OK)
```

**Flow:**
1. Seed `plantsMaster` với `imageUrl` trỏ đến Convex Storage
2. App dùng `<Image source={{ uri: plant.imageUrl }}` />` (expo-image)
3. `expo-image` tự cache vào disk, lần sau load từ cache
4. Nếu offline → hiển thị từ cache, hoặc fallback placeholder

**Tối ưu:**
- Ảnh resize xuống 400×400px trước khi upload (~50KB/ảnh)
- Tổng: 200 ảnh × 50KB = **~10MB trên Convex** (trong Free 1GB)
- Prefetch ảnh khi app mở lần đầu

### 5.2 User Photos

```
[expo-image-picker]
    → chụp / chọn ảnh
    → copyToCacheDirectory: true
    → FileSystem.moveAsync(cache → documentDirectory/plants/{plantId}/{timestamp}.jpg)
    → Convex: plantPhotos.photoUrl = relative path ("plants/abc123/1234.jpg")
    → Hiển thị: FileSystem.documentDirectory + photoUrl
```

**Flow:**
1. User chụp ảnh → `expo-image-picker` trả về temp URI
2. Resize xuống 1024px max (dùng `expo-image-manipulator`)
3. Di chuyển vào `documentDirectory/plants/{plantId}/`
4. Lưu **relative path** vào Convex (không lưu absolute path vì iOS thay đổi)
5. Tạo thumbnail 200px lưu cùng folder
6. Hiển thị: ghép `documentDirectory + relativePath` lúc runtime

---

## 6. Xử lý các trường hợp

### 6.1 User xóa app → mất ảnh
- **MVP**: Chấp nhận. Convex metadata vẫn còn, ảnh mất
- **Sau**: Thêm "Backup to cloud" trước khi xóa
- **UX**: Thông báo "Ảnh chỉ lưu trên thiết bị" khi chụp

### 6.2 User đổi điện thoại
- **MVP**: Ảnh không chuyển được. Metadata (tên cây, nhắc nhở) sync qua Convex
- **Sau**: Export/Import hoặc Cloud backup

### 6.3 Storage đầy trên device
- **Xử lý**: Kiểm tra `FileSystem.getFreeDiskStorageAsync()` trước khi lưu
- **Nếu đầy**: Thông báo user, gợi ý xóa ảnh cũ hoặc giảm quality

### 6.4 iOS path thay đổi khi rebuild
- **Xử lý**: Chỉ lưu **relative path** (`plants/abc/123.jpg`), ghép `documentDirectory` lúc runtime
- **Quan trọng**: Không bao giờ lưu absolute path vào database

### 6.5 Ảnh library cần cập nhật (thêm cây mới)
- **Xử lý**: Cập nhật `plantsMaster.imageUrl` trên Convex → app tự tải ảnh mới
- **Không cần update qua stores** — đây là lý do dùng Convex cho library

### 6.6 Offline mode
- **Library images**: `expo-image` cache → hiển thị được offline sau lần đầu
- **User photos**: Luôn offline vì đã lưu local
- **Metadata**: Convex có optimistic updates, nhưng không có full offline. Cân nhắc queue local

### 6.7 Nhiều ảnh cho 1 cây (photo journal)
- **Folder structure**: `documentDirectory/plants/{plantId}/{timestamp}.jpg`
- **Convex**: Mỗi ảnh 1 record trong `plantPhotos`, lưu relative path
- **Limit**: Cân nhắc giới hạn ~50 ảnh/cây để không tốn storage device

---

## 7. Thư viện cần dùng

| Package | Mục đích |
|---------|----------|
| `expo-image` | Hiển thị + auto-cache ảnh library từ URL |
| `expo-image-picker` | Chụp/chọn ảnh từ camera/gallery |
| `expo-file-system` | Lưu ảnh local, quản lý folder |
| `expo-image-manipulator` | Resize, compress trước khi lưu |
| `expo-media-library` | (Optional) Lưu bản copy vào Camera Roll |

---

## 8. Folder structure trên device

```
documentDirectory/
└── richfarm/
    ├── plants/
    │   ├── {userPlantId_1}/
    │   │   ├── photo_1708123456.jpg       (1024px)
    │   │   ├── thumb_1708123456.jpg       (200px)
    │   │   ├── photo_1708234567.jpg
    │   │   └── thumb_1708234567.jpg
    │   └── {userPlantId_2}/
    │       └── ...
    └── beds/
        └── {bedId}/
            └── photo_xxx.jpg              (ảnh luống/khu vực)
```

---

## 9. Tổng kết quyết định

| Loại ảnh | Lưu ở đâu | Tại sao |
|----------|-----------|---------|
| Library (Plant DB) | **Convex Storage** + expo-image cache | Shared, cập nhật không cần store update, ~10MB |
| User plant photos | **Local device** (documentDirectory) | Không tốn cloud, offline, nhanh |
| Thumbnails | **Local device** (tạo từ ảnh gốc) | Performance, hiển thị nhanh trong list |
| Metadata ảnh | **Convex** (plantPhotos table) | Sync, query, liên kết với plant |

> [!IMPORTANT]
> Quy tắc vàng: **Convex lưu metadata + URLs, device lưu pixels.**


