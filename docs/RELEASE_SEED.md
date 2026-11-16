# Khởi tạo dữ liệu release

`npm run db:seed` tạo admin/RBAC từ cấu hình và nhập bộ catalog đã xác nhận.
Dataset được lưu trong `prisma/seed/release-catalog.data.ts`, nằm trong source và
image migrator; không phụ thuộc thư mục `private-data` khi triển khai.

## Dữ liệu được nhập

| Nhóm     | Số lượng |
| -------- | -------: |
| Danh mục |       13 |
| Màu      |       16 |
| Size     |        6 |
| Sản phẩm |      116 |
| Biến thể |      121 |
| Ảnh      |      116 |
| SKU kho  |      116 |

Giữ mã, UUID, cây danh mục, mô tả, metadata, slug, cọc, URL Facebook,
trạng thái và liên kết size/màu/ảnh. Sáu sản phẩm `SP026`, `SP040`, `SP047`,
`SP057`, `SP068`, `SP075` vẫn tồn tại với tồn kho bằng 0.

Không nhập `TEST`, `TEST-02`, `TEST-PHU-KIEN-FREE` cùng dữ liệu con; không nhập
khách hàng, tài khoản web, đơn thuê, giữ chỗ, thanh toán, lịch sử, hay bảng giá
`rental_rates` cũ. SKU khởi tạo có bộ đếm thuê 0 và ngày thuê gần nhất NULL.

Không nhập hồ sơ shop/vị trí cũ. Seed tạo shop `MAIN` từ `DEFAULT_SHOP_NAME`,
múi giờ `Asia/Ho_Chi_Minh`, và vị trí mặc định `MAIN`; toàn bộ catalog/kho được
gán sang các bản ghi mới này. Cấu hình `rental_policy` giữ giá lượt 50.000đ,
phí ngày tiếp theo 10.000đ và cọc mặc định 200.000đ.

Admin lấy từ `DEFAULT_ADMIN_EMAIL`, `DEFAULT_ADMIN_PASSWORD`,
`DEFAULT_ADMIN_NAME`. Mật khẩu không nằm trong dataset và được bcrypt hash khi
seed. Production yêu cầu mật khẩu khác giá trị mặc định.

Ảnh chỉ có metadata và tham chiếu R2. Giữ file/bucket hiện tại và cấu hình
`OBJECT_STORAGE_PUBLIC_BASE_URL`; seed không tải lên hoặc xóa file ảnh.

## Kiểm tra trước khi reset

Trong thư mục `kitty-be`:

```powershell
npm run db:seed:check
```

Lệnh này kiểm tra dataset, số lượng, UUID, các liên kết và sản phẩm không có
tồn kho. Nó không kết nối hoặc ghi database. Giữ một bản snapshot/backup riêng
trước khi xóa dữ liệu.

Prisma và seed mặc định đọc `.env`, không tự chọn file đang mở trong IDE.
Biến môi trường đã tồn tại trong terminal có ưu tiên cao hơn file dotenv;
kiểm tra `DATABASE_URL` đang áp dụng trước khi chạy lệnh thay đổi database.

## Reset database local chứa dữ liệu thử

Dừng API/worker và các kết nối ứng dụng đang dùng database. Xác nhận
`DATABASE_URL` đang trỏ đúng database local cần reset. Sau đó chạy lần lượt:

```powershell
npx prisma migrate reset --skip-seed
npm run db:seed
npm run start:dev
```

`migrate reset` xóa dữ liệu/schema đích và áp dụng lại toàn bộ migration,
bắt đầu từ baseline `202610230001_initial_release`. Giữ lời nhắc xác nhận tương tác của Prisma;
chỉ chạy seed nếu reset thành công. Không dùng quy trình reset local này trên
database production hiện có.

## Database mới trên server

Provision database rỗng và cho phép `pgcrypto`, `btree_gist`, `pg_trgm`,
`unaccent` trước khi chạy baseline. Không apply baseline lên database có lịch sử
migration cũ. Với source checkout đã cài dependencies:

```powershell
npm run db:generate
npm run db:migrate
npm run db:seed
```

Để chọn `.env.production` một cách tường minh khi chạy bằng source trên
PowerShell, đặt biến dưới đây trước các lệnh trên và bỏ nó khi hoàn tất:

```powershell
$env:DOTENV_CONFIG_PATH = '.env.production'
# Chạy các lệnh migrate/seed cho database mới đã kiểm tra target.
Remove-Item Env:\DOTENV_CONFIG_PATH
```

Với Docker Compose trên server, cấu hình kết nối/credentials của database mới
trong `.env` server, build/publish đúng image migrator của release rồi chạy:

```bash
docker compose --profile migrate pull migrate
docker compose --profile migrate run --rm migrate
docker compose --profile migrate run --rm migrate npm run db:seed
docker compose pull api
docker compose up -d api
```

Chỉ chuyển sang bước tiếp theo khi lệnh trước thành công. Migration mặc định
không tự seed. Image API không chứa bộ công cụ để chạy seed; dùng image
migrator cho công việc một lần này.

## Chạy lại và xử lý lỗi

Seed yêu cầu baseline init đã hoàn tất. Khi nhập catalog lần đầu, catalog và
chính sách giá phải rỗng. Toàn bộ admin/RBAC/catalog được ghi trong một
transaction; nếu có lỗi thì rollback cùng nhau.

Seed ghi marker `seed.release_catalog` trong `app_settings` khi nhập thành công.
Lần chạy sau nhận marker và bỏ qua catalog/chính sách giá, giữ các chỉnh sửa
sản phẩm, SKU, bộ đếm thuê, giá và mật khẩu admin đã thay đổi. RBAC hệ thống
vẫn được đồng bộ. Không xóa marker để ép nhập lại lên dữ liệu đang dùng.

Seed dừng nếu có catalog chưa được khởi tạo bởi seed này, marker khác phiên bản,
hoặc lịch sử migration cũ. Cần chọn database mới/reset đúng quy trình; seed
không tự xóa dữ liệu để vượt qua các kiểm tra này.

Sau lần nhập đầu tiên, đối chiếu số lượng trong bảng trên, kiểm tra admin đăng
nhập, ảnh và sáu sản phẩm tồn kho 0. Xem `test/integration/release-seed.integration.spec.ts`
cho kiểm thử import, chạy lại, bảo toàn dữ liệu và rollback trên PostgreSQL riêng.
