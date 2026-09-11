# Legacy Catalog Import Pipeline

Hướng dẫn vận hành và chi tiết kỹ thuật của pipeline nhập dữ liệu sản phẩm từ workbook Excel legacy (`Quản lý lịch thuê KITTY.xlsx`) vào hệ thống PostgreSQL (`kitty-be`).

## 0. Hướng dẫn chạy lần đầu từng bước (First-Time Quickstart)

Dành cho Developer hoặc Operator khi clone repo hoặc setup môi trường mới lần đầu:

### Bước 1: Chuẩn bị file Excel
Copy file workbook thật vào thư mục `kitty-be/private-data/legacy/`:
```text
kitty-be/private-data/legacy/Quản lý lịch thuê KITTY.xlsx
```
*(Thư mục này đã nằm trong `.gitignore` nên an toàn không sợ commit nhầm lên git).*

### Bước 2: Khởi động database & bootstrap
Đảm bảo PostgreSQL đang chạy và cơ sở dữ liệu đã có shop `MAIN`:
```bash
cd kitty-be
npm run bootstrap
```

### Bước 3: Chạy thử kiểm tra (DRY-RUN — Không ghi DB)

**Trên PowerShell (Windows):**
```powershell
# Cách 1: Chạy trên 1 dòng (khuyên dùng)
npm run import:legacy-catalog -- --file "./private-data/legacy/Quản lý lịch thuê KITTY.xlsx" --shop MAIN --dry-run

# Cách 2: Xuống dòng trong PowerShell (dùng dấu backtick `)
npm run import:legacy-catalog -- `
  --file "./private-data/legacy/Quản lý lịch thuê KITTY.xlsx" `
  --shop MAIN `
  --dry-run
```

**Trên Bash / Git Bash / Linux:**
```bash
npm run import:legacy-catalog -- \
  --file "./private-data/legacy/Quản lý lịch thuê KITTY.xlsx" \
  --shop MAIN \
  --dry-run
```
Báo cáo sẽ hiển thị trên terminal:
- **116** sản phẩm
- **117** tổng số lượng
- **0** Fatal errors
- **Difference = 0**

### Bước 4: Ghi dữ liệu chính thức vào PostgreSQL (APPLY)
Khi dry-run đã PASS, chạy lệnh apply:

**Trên PowerShell (Windows):**
```powershell
# Cách 1: Chạy trên 1 dòng (khuyên dùng)
npm run import:legacy-catalog -- --file "./private-data/legacy/Quản lý lịch thuê KITTY.xlsx" --shop MAIN --apply

# Cách 2: Xuống dòng trong PowerShell (dùng dấu backtick `)
npm run import:legacy-catalog -- `
  --file "./private-data/legacy/Quản lý lịch thuê KITTY.xlsx" `
  --shop MAIN `
  --apply
```

**Trên Bash / Git Bash / Linux:**
```bash
npm run import:legacy-catalog -- \
  --file "./private-data/legacy/Quản lý lịch thuê KITTY.xlsx" \
  --shop MAIN \
  --apply
```
Database sẽ được tạo:
- 116 Products
- 120 Variants
- 113 Inventory Items
- 120 Rental Rates
- 116 Product Media
- 16 Colors, 13 Categories (tái sử dụng 6 có sẵn + tạo thêm 7)

### Bước 5: Kiểm tra tính bất biến (Idempotency)
Chạy lại cùng lệnh apply trên một lần nữa trên PowerShell:
```powershell
npm run import:legacy-catalog -- --file "./private-data/legacy/Quản lý lịch thuê KITTY.xlsx" --shop MAIN --apply
```
Kết quả mong muốn: **0** bản ghi mới được tạo, **116** products unchanged, không bị trùng lặp dữ liệu.

### Bước 6: Xem dữ liệu trực quan
Mở Prisma Studio để xem dữ liệu trong bảng:
```bash
npm run db:studio
```

---

## 1. Vị trí file và Quản lý dữ liệu nhạy cảm

File workbook legacy thật được đặt tại:
```text
kitty-be/
└─ private-data/
   └─ legacy/
      └─ Quản lý lịch thuê KITTY.xlsx
```

> [!IMPORTANT]
> - Thư mục `/private-data/` đã được cấu hình trong `kitty-be/.gitignore`.
> - **KHÔNG BAO GIỜ** commit file workbook production chứa dữ liệu thật lên Git repository.
> - Importer nhận đường dẫn file tường minh qua tham số CLI `--file`, không hard-code đường dẫn tuyệt đối của máy developer.

---

## 2. Các Sheet được xử lý

Workbook gồm 6 sheet, pipeline Task #2 chỉ đọc 3 sheet:
1. **`Sản phẩm`**: Dữ liệu master sản phẩm, size, màu, số lượng, giá thuê, cọc và ảnh.
2. **`Danh mục`**: Danh mục phân loại sản phẩm và kích cỡ master.
3. **`Cài đặt`**: Cấu hình tiền tệ (VND) và metadata Google Drive.

Các sheet còn lại (`Khách hàng`, `Đơn thuê`, `Chi tiết đơn thuê`) nằm ngoài phạm vi Catalog và không được xử lý trong task này.

---

## 3. Dynamic Header Detection

Workbook chứa các dòng tiêu đề/trống trước bảng dữ liệu chính. Importer không giả định header nằm ở dòng 1:
- Sheet `Sản phẩm`: Tự động tìm dòng chứa `Mã sản phẩm` (thực tế tại dòng 10).
- Sheet `Danh mục`: Tự động tìm dòng chứa `Nhóm sản phẩm` (thực tế tại dòng 10).
- Sheet `Cài đặt`: Tự động tìm dòng chứa `Khóa` (thực tế tại dòng 10).

---

## 4. Quy tắc Mapping Dữ liệu (Source-of-Truth Invariants)

### 4.1. Domain Invariant: `Product != ProductVariant != InventoryItem`
- **Product**: Định danh duy nhất theo `shopId + Product.code` (`SP001` - `SP116`). Đại diện cho mẫu sản phẩm tổng thể.
- **ProductVariant**: Đại diện cho sự kết hợp cụ thể giữa một Kích cỡ (Size) và một Màu sắc (Color). Mã variant có cấu trúc xác định: `${Product.code}-${Size.code}-${Color.code}` (ví dụ: `SP001-M-DO`, `SP040-M-DEFAULT`).
- **InventoryItem**: Đại diện cho **món đồ vật lý thực tế** trong kho. Tổng số lượng vật lý luôn là `count(InventoryItem)`. Hệ thống **không** lưu cột `Product.quantity` dư thừa.

### 4.2. Bảo toàn Giá trị Legacy (Không bị Rental Policy ghi đè)
- Giá thuê: 99 sản phẩm giá **50,000 VND** và 17 sản phẩm giá **30,000 VND** được giữ nguyên giá trị gốc; không bị policy default (50,000 VND) ghi đè lên các sản phẩm 30,000 VND.
- Tiền cọc: 61 sản phẩm cọc **200,000 VND** và 55 sản phẩm cọc **0 VND** được giữ nguyên giá trị gốc; không bị policy default (200,000 VND) ghi đè lên các sản phẩm 0 VND.
- Thời lượng thuê: Tạo bản ghi `RentalRate` 1 ngày (`durationDays: 1`) với giá tương ứng.

### 4.3. Phân tách Multi-Color (Đa màu)
- Khi ô Màu có nhiều màu (ví dụ: `Trắng, Hồng` hoặc `Đỏ, Trắng` hoặc `Đen trắng`):
  - Hệ thống tách thành nhiều variant độc lập (`Variant Trắng` và `Variant Hồng`).
  - **Không** tạo màu master gộp `"Trắng Hồng"`.
  - Từ điển màu tiếng Việt nhận diện các màu nhiều từ (`Vàng chanh`, `Vàng nhạt`, `Xanh lá nhạt`, `Xanh dương nhạt`, `Loang màu`, `Xanh lá`) là một màu đơn lẻ, không split khoảng trắng mù.

### 4.4. Phân bổ Kho (Inventory Allocation) & Bất biến Số lượng
- **Tổng số lượng legacy trong workbook**: **117**.
- Tách multi-color variant **tuyệt đối không** được làm thổi phồng số lượng vật lý thực tế:
  - 107 sản phẩm đơn màu Qty = 1: Tạo đúng 1 `InventoryItem`.
  - 3 sản phẩm đơn màu Qty = 2 (`SP022`, `SP041`, `SP054`): Tạo đúng 2 `InventoryItem`s cho variant đó.
  - 2 sản phẩm Qty = 0 (`SP040`, `SP047`): Tạo Product + Variant, **0** `InventoryItem`, phát cảnh báo `ACTIVE_PRODUCT_WITH_ZERO_INVENTORY`.
  - 4 sản phẩm multi-color nhưng Qty = 1 (`SP026`, `SP057`, `SP068`, `SP075`): Tạo 2 variants, nhưng do nguồn không chỉ rõ 1 món đồ vật lý này thuộc màu nào trong 2 màu, hệ thống phát cảnh báo `INVENTORY_ALLOCATION_REVIEW_REQUIRED`, **0** physical item được gán tự động.
- **Reconciliation toán học**:
  $$\text{Imported Physical Items (113)} + \text{Unallocated Items (4)} = \text{Legacy Total (117)} \quad (\Delta = 0)$$

### 4.5. Xử lý các Dị thường đã biết (Known Anomalies)
1. **Category `Đầm`** (tại `SP017`, `SP064`): Xuất hiện trong sản phẩm nhưng không có trong sheet `Danh mục`. Pipeline tạo Category riêng `code: 'DAM'`, `name: 'Đầm'` và phát cảnh báo `CATEGORY_NOT_DECLARED_IN_MASTER_SHEET`.
2. **Invalid Numeric Color** (`SP040`, Màu = 1): `colorId = null`, variant được tạo bình thường, phát cảnh báo `INVALID_COLOR_VALUE`. Không tạo Color master `"1"`.
3. **Missing Color** (`SP091`, `SP098`): `colorId = null`, không tạo fallback giả lập như "Khác" hay "Unknown".
4. **Ảnh sản phẩm**: 116/116 sản phẩm có Google Drive URL hợp lệ, được map vào `ProductMedia` (`isPrimary: true`, `sortOrder: 0`).

---

## 5. Hướng dẫn Chạy CLI

### 5.1. Chạy Dry-Run (Mặc định — An toàn, không sửa database)

**PowerShell (Windows):**
```powershell
npm run import:legacy-catalog -- --file "./private-data/legacy/Quản lý lịch thuê KITTY.xlsx" --shop MAIN --dry-run
```

**Bash / Git Bash / Linux:**
```bash
npm run import:legacy-catalog -- \
  --file "./private-data/legacy/Quản lý lịch thuê KITTY.xlsx" \
  --shop MAIN \
  --dry-run
```
*(Nếu không truyền cờ `--apply`, hệ thống tự động chạy ở chế độ DRY-RUN).*

### 5.2. Chạy Apply (Ghi dữ liệu vào Database)

**PowerShell (Windows):**
```powershell
npm run import:legacy-catalog -- --file "./private-data/legacy/Quản lý lịch thuê KITTY.xlsx" --shop MAIN --apply
```

**Bash / Git Bash / Linux:**
```bash
npm run import:legacy-catalog -- \
  --file "./private-data/legacy/Quản lý lịch thuê KITTY.xlsx" \
  --shop MAIN \
  --apply
```

---

## 6. Tính Bất biến & Chạy Lại (Idempotency & Non-destructive)

- **Idempotency**: Chạy lệnh `--apply` lần thứ 2 với cùng file sẽ:
  - 0 Category mới tạo
  - 0 Size mới tạo
  - 0 Color mới tạo
  - 0 Product mới tạo (116 unchanged)
  - 0 Variant mới tạo (120 unchanged)
  - 0 InventoryItem mới tạo (113 unchanged)
  - 0 RentalRate mới tạo (120 unchanged)
  - 0 ProductMedia mới tạo (116 unchanged)
- **Non-destructive**:
  - Không bao giờ xóa sản phẩm hoặc InventoryItem đã được tạo thủ công ngoài workbook.
  - Nếu sản phẩm trong DB có tên khác với Excel do người vận hành sửa, importer phát cảnh báo `EXISTING_PRODUCT_CONFLICT` và **không** tự động ghi đè.

---

## 7. Cấu trúc Báo cáo (Report Format)

Mỗi lần chạy CLI xuất báo cáo 4 phần:
1. **SOURCE RECONCILIATION**: Xác nhận khớp đúng 116 sản phẩm, 117 số lượng, 99 giá 50k, 17 giá 30k, 61 cọc 200k, 55 cọc 0, 116 ảnh, 116 active.
2. **INVENTORY RECONCILIATION**: Chi tiết số lượng đã tạo (113), số lượng chờ review (4), chênh lệch (0).
3. **DATABASE MUTATIONS**: Số lượng bản ghi thêm mới / giữ nguyên cho từng bảng.
4. **VALIDATION & ANOMALIES**: Danh sách chi tiết từng warning kèm dòng, mã sản phẩm, trường dữ liệu và mô tả.
