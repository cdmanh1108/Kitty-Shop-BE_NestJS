# Giá thuê riêng của sản phẩm

`Product.rentalPriceOverride` là giá một lượt thuê của một món, dùng chung mọi
size/màu của sản phẩm. `null` lấy giá hiện tại từ `rental_policy`; `0` là giá
riêng hợp lệ. API/SQL giới hạn 0–100.000.000 VND, tối đa hai chữ số thập phân.
Tiền cọc và phụ phí ngày tiếp theo độc lập với trường này.

Thứ tự ưu tiên cho dòng PAID:

1. Giá ghi đè của dòng đơn Admin (`ITEM`).
2. Giá ghi đè của cả đơn Admin (`ORDER`).
3. Giá riêng sản phẩm (`PRODUCT`).
4. Giá chung trong Cài đặt (`SHOP`).

Giá được dùng lại ở mỗi lượt mới theo chu kỳ hiện tại. Ngày không bắt đầu lượt
mới vẫn tính `additionalDayFee` chung. FREE_ACCESSORY luôn có tiền thuê/cọc 0;
giá riêng của catalog không đổi vai trò tính phí của dòng.

Ví dụ giá sản phẩm 80.000đ, phụ phí ngày 10.000đ, đơn dưới ba món PAID:
hai ngày là 90.000đ/món; năm ngày là 2 lượt × 80.000 + 3 ngày × 10.000 = 190.000đ.

## Contract và snapshot

Admin nhận giá riêng dưới dạng Decimal/string nullable và ghi số/null qua
API tạo/sửa sản phẩm. Web catalog/favorites trả `rentalPriceOverride` nullable
và `rentalPrice` numeric đã tính fallback. Quote/create tự đọc catalog phía
server, không dùng giá hiển thị do client gửi làm nguồn tính tiền.

Báo giá Web có `items[].pricing` cho từng dòng PAID. `pricing` ở cấp báo giá
là null khi các dòng khác giá hoặc nguồn giá; client phải dùng từng dòng để hiển thị và xác
định báo giá đầy đủ. Các khoản tiền tổng vẫn do backend tính.

Snapshot CYCLE_V1 mới ghi thêm `productCyclePriceOverride` và nguồn PRODUCT.
Snapshot CYCLE_V1 cũ thiếu trường này vẫn được đọc như null; không viết lại
đơn cũ. Báo cáo, đổi lịch, trả đồ/phí trả trễ tiếp tục dùng giá đã chụp, không
đọc lại giá sản phẩm/setting hiện tại. Replay idempotency trả đơn đã tạo trước
khi đọc giá mới.

Booking kiểm tra lại giá catalog trong transaction Serializable. Nếu giá đã
đổi sau preflight, trả `RENTAL_PRODUCT_PRICE_CHANGED` và rollback. Override
Admin tường minh vẫn được ưu tiên. Checkout Web gửi thêm `expectedRentalSubtotal`
từ báo giá vừa xem; nếu tổng tiền thuê hiện tại khác, backend trả conflict trước
khi tạo đơn, client bỏ intent bị từ chối và tải lại báo giá. Trường này chỉ là
đối chiếu freshness, không cho phép client đặt giá. Retry chưa rõ kết quả giữ
nguyên cả expected subtotal và idempotency key.

## Triển khai

Baseline `202610230001_initial_release` đã chạy phải giữ nguyên. Migration
`202611160001_product_rental_price_override` chỉ thêm cột nullable và CHECK;
tất cả sản phẩm hiện tại tiếp tục theo setting chung. Không reset database.

```bash
npm run db:migrate
npm run db:generate
```

Chạy migration bằng đúng cấu hình target, rồi deploy backend trước hai FE có
contract mới. Image API đã generate Prisma client trong lúc build; deploy
Docker sử dụng one-off migrator như RUNBOOK. Không cần seed lại dữ liệu đang có.

Seed release không gán giá riêng từ bảng giá business cũ. Chạy lại seed đã hoàn
tất không ghi đè giá sản phẩm do người dùng sửa. Catalog Web có cache hữu hạn;
quote/create luôn đọc giá hiện tại và checkout phát hiện thay đổi tổng thuê.

## Kiểm thử

Unit test kiểm tra thứ tự ưu tiên, null/0, chu kỳ, validation và đọc snapshot cũ.
PostgreSQL integration kiểm tra ràng buộc SQL, fallback khi đổi setting, báo giá
nhiều mức giá, persist/replay và phát hiện thay đổi giá. Hai FE kiểm tra form,
ước tính Admin, parser PRODUCT, giỏ nhiều giá và hiển thị giá 0.
