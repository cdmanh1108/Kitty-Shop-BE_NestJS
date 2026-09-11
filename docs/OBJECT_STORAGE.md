# Object Storage Architecture & Product Media Guide

---

## 1. Overview & Vendor-Neutral Architecture

Hệ thống quản lý tài nguyên media của Kitty Rental Shop được thiết kế theo nguyên tắc **Zero Vendor Lock-in**, tuân thủ nghiêm ngặt chuẩn tương thích S3 (S3-Compatible API).

```text
Catalog / Product Domain (Business Logic)
            ↓
    ObjectStoragePort (Port / Common Interface)
            ↑
  S3ObjectStorageAdapter (Infrastructure Adapter using @aws-sdk/client-s3)
            ↓
  S3-Compatible Provider (Cloudflare R2, AWS S3, MinIO, Wasabi, v.v.)
```

- **Domain Independence**: Tầng Domain và Application tuyệt đối không import `@aws-sdk/client-s3`, Cloudflare SDK, hay bất kỳ SDK vendor cụ thể nào.
- **Provider Portability**: Triển khai hiện tại sử dụng **Cloudflare R2**, nhưng toàn bộ logic hoàn toàn có thể tráo đổi sang AWS S3, MinIO (on-premise), hay nhà cung cấp khác chỉ bằng thay đổi biến môi trường.

---

## 2. Environment Configuration

Các biến môi trường chuẩn được định nghĩa provider-neutral:

```env
# S3-Compatible Object Storage Provider
OBJECT_STORAGE_PROVIDER=s3
OBJECT_STORAGE_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
OBJECT_STORAGE_REGION=auto
OBJECT_STORAGE_BUCKET=kitty-assets-prod

# Credentials (Server-side only — NEVER expose to frontend)
OBJECT_STORAGE_ACCESS_KEY_ID=your-access-key-id
OBJECT_STORAGE_SECRET_ACCESS_KEY=your-secret-access-key

# Public Serving Base URL (CDN / Custom Domain or R2 Dev Domain)
OBJECT_STORAGE_PUBLIC_BASE_URL=https://pub-da9772f41ace4dda9871f112ae659353.r2.dev
```

### Ví dụ cấu hình Cloudflare R2:
- `OBJECT_STORAGE_ENDPOINT`: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
- `OBJECT_STORAGE_REGION`: `auto`
- `OBJECT_STORAGE_BUCKET`: Tên bucket đã tạo trên Cloudflare (ví dụ: `kitty-assets-prod`).
- `OBJECT_STORAGE_PUBLIC_BASE_URL`: Domain công khai trỏ tới bucket (r2.dev dev domain hoặc custom domain như `https://assets.kittyrental.com`).

---

## 3. Canonical Object Key Design

Database **chỉ lưu trữ duy nhất `storageKey`**, tuyệt đối không lưu trữ hardcoded domain hoặc URL đầy đủ (`https://...` hay `r2://...`).

### Định dạng Object Key:
```text
shops/<shop-code>/products/<product-code>/<content-sha256>.<extension>
```

Ví dụ thực tế:
```text
shops/main/products/sp001/21792c25ef7f5a7face7ce6b2a2610b3ce141aeec5a5961f372540abcd262149.jpg
```

### Ưu điểm của Content-Addressed Hash:
1. **Idempotency & Deduplication**: Cùng một file ảnh luôn sinh ra cùng một `storageKey` duy nhất.
2. **Immutability & Long-term Caching**: Key là bất biến nên object được lưu trữ với header HTTP:
   `Cache-Control: public, max-age=31536000, immutable`
   giúp trình duyệt và CDN cache tối ưu, tiết kiệm tối đa băng thông.
3. **Không rò rỉ hạ tầng**: Key không chứa tên bucket, account ID hay domain.

---

## 4. Public URL Resolution & API Boundary

Khi API đọc dữ liệu sản phẩm (`GET /api/v1/products` và `GET /api/v1/products/:id`):
- Nếu `media.storageKey` tồn tại: URL được resolve tập trung:
  ```ts
  url = resolvePublicUrl(process.env.OBJECT_STORAGE_PUBLIC_BASE_URL, media.storageKey)
  ```
- Nếu `media.storageKey` là null (chưa migrate): fallback về URL nguồn cũ (`media.url` từ Google Drive).

Frontend client nhận được URL hợp lệ trực tiếp tại `media.url` và tải ảnh thẳng từ CDN/R2 công khai, không tốn tài nguyên băng thông trung gian qua backend NestJS.

---

## 5. Media Sync CLI (`media:sync-storage`)

Công cụ migration an toàn, có khả năng resume, cache đĩa cục bộ, và xử lý giới hạn Google Drive:

```bash
# 1. Kiểm tra kết nối và quyền đọc/ghi bucket
npm run object-storage:check

# 2. Chạy mô phỏng trước (Dry-run — Mặc định an toàn)
npm run media:sync-storage -- --dry-run

# 3. Chạy thực tế (Apply mutations)
npm run media:sync-storage -- --apply

# 4. Các tham số lọc và kiểm soát
npm run media:sync-storage -- --apply --limit 10
npm run media:sync-storage -- --apply --product-code SP001
npm run media:sync-storage -- --apply --concurrency 2
npm run media:sync-storage -- --apply --force
```

### Cơ chế bảo vệ và tối ưu:
- **Local Disk Cache (`private-data/cache/product-media/`)**: Ảnh sau khi tải về lần đầu được cache cục bộ theo ID. Các lần chạy tiếp theo tái sử dụng 100% từ cache, không tạo request mới đến Google Drive.
- **Bounded Concurrency**: Giới hạn tải 2-4 luồng đồng thời để không bị Google Drive chặn IP.
- **Exponential Backoff & Jitter**: Tự động retry khi gặp mã lỗi tạm thời 429 (Rate Limit) hoặc 5xx.
- **HEAD-before-PUT**: Kiểm tra object đã tồn tại trên bucket chưa trước khi upload; nếu đã có trên storage thì bỏ qua bước PUT và chỉ liên kết DB.
- **Safe Transaction Boundary**: Quá trình upload hoàn tất thành công mới cập nhật DB, tránh lỗi treo transaction database.

---

## 6. Bucket Migration Procedure (Quy trình chuyển đổi Bucket / Provider)

Khi cần di dời media sang một Bucket mới hoặc đổi nhà cung cấp (ví dụ từ R2 Bucket A sang R2 Bucket B hoặc sang AWS S3):

1. **Tạo Bucket mới**: Tạo bucket đích trên provider mới (ví dụ AWS S3 hoặc Cloudflare R2 mới).
2. **Copy Objects**: Sử dụng công cụ tương thích S3 (như `rclone`, `aws s3 sync`, hoặc Cloudflare Super Slurper) copy toàn bộ file từ bucket cũ sang bucket mới, **giữ nguyên toàn bộ cấu trúc key**.
3. **Kiểm tra Checksum**: Xác minh số lượng object và SHA-256 khớp nhau giữa 2 bucket.
4. **Cập nhật Biến Môi Trường**:
   ```env
   OBJECT_STORAGE_ENDPOINT=<new-endpoint>
   OBJECT_STORAGE_BUCKET=<new-bucket>
   OBJECT_STORAGE_ACCESS_KEY_ID=<new-key>
   OBJECT_STORAGE_SECRET_ACCESS_KEY=<new-secret>
   OBJECT_STORAGE_PUBLIC_BASE_URL=<new-cdn-url>
   ```
5. **Khởi động lại / Deploy**: Khởi động lại dịch vụ backend.
6. **Smoke Test**: Mở Admin kiểm tra ảnh sản phẩm tải bình thường từ URL mới.

> [!NOTE]
> **Database không cần chạy bất kỳ câu lệnh SQL UPDATE nào!** Vì database chỉ lưu `storageKey`, việc chuyển bucket hay đổi tên miền chỉ là thao tác cấu hình môi trường.

---

## 7. Security Boundaries

1. **Public Asset vs Sensitive Documents**:
   - Media của Product trong task này là **Public Catalog Assets**, phục vụ hiển thị công khai trên website và app quản lý.
   - Các tài liệu định danh nhạy cảm của khách hàng trong các tính năng tương lai (như **CCCD / CMND / GPLX** để giữ tài sản thế chấp) **TUYỆT ĐỐI KHÔNG ĐƯỢC LƯU CHUNG** trong public bucket này.
   - Tài liệu nhạy cảm bắt buộc phải dùng bucket riêng tư (Private Storage), mã hóa at-rest, và chỉ truy cập thông qua Pre-signed URL có thời hạn cùng phân quyền bảo mật chặt chẽ.
2. **Credential Protection**:
   - `OBJECT_STORAGE_ACCESS_KEY_ID` và `OBJECT_STORAGE_SECRET_ACCESS_KEY` chỉ tồn tại ở backend (`kitty-be`).
   - Tuyệt đối không import hoặc cấu hình các biến bí mật này vào frontend (`kitty-admin-fe`).
