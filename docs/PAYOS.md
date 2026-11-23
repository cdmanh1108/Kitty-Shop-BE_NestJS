
# Thanh toán payOS

## Phân chia trách nhiệm

`PaymentsModule` điều phối link, webhook và đối soát qua `PaymentGateway`. `PayosAdapter` gọi SDK, xác minh chữ ký và chuẩn hóa phản hồi. `RentalsModule` cung cấp kho lưu lần thanh toán theo đơn và giữ quyền quyết định nhả đồ hoặc hủy đơn. `FinanceModule` cung cấp nghiệp vụ ghi sổ. Kho lưu thanh toán theo đơn dùng cùng transaction và khóa đơn cho mọi thay đổi liên quan đến bút toán, trạng thái đơn và kho.

## Rollout

1. Triển khai migration `202611230002_payos_rental_payments` và backend mới với `PAYOS_CHECKOUT_ENABLED=false`. Deploy storefront và admin đã đồng bộ OpenAPI. Giá trị mặc định khi thiếu flag là `false`, và backend khởi động với ba khóa để trống.
2. Tạo kênh thu dành riêng cho deployment KITTY. Đặt `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` của cùng một kênh trong `.env` trên VM. `WEB_URL` là origin HTTPS của storefront. `PAYOS_PAYMENT_TTL_MINUTES` mặc định 15. Tạo lại container API để nạp biến môi trường.
3. Đăng ký `https://<backend-host>/api/v1/webhooks/payos` trong kênh thu. Backend xác minh mẫu probe bằng SDK. Kênh tương ứng giữ nguyên URL webhook và bộ khóa trong suốt vòng đời của các link đã phát hành.
4. Bật `PAYOS_CHECKOUT_ENABLED=true` trên deployment kiểm thử có kênh thu riêng và thử thanh toán giá trị nhỏ. payOS dùng giao dịch thật cho bước xác minh đầu cuối. Kiểm tra một giao dịch xuất hiện một lần trong đối soát và tiền cọc tách khỏi tiền đơn trong lịch sử admin.
5. Bật `PAYOS_CHECKOUT_ENABLED=true` ở production và tạo lại API container. Storefront đọc trạng thái bật/tắt từ backend. Admin đọc trạng thái giao dịch theo từng đơn.

Khi tạm dừng, tắt flag tạo link và giữ webhook áp dụng cho link đã cấp. Link chưa cấp sẽ không mở được với flag tắt. Các lần tạo link chưa xác định vẫn đối soát theo mã đã lưu. Tác vụ nền vẫn chạy khi kênh có đủ ba khóa.

## Theo dõi vận hành

- `payment.provider_request_failed` ghi thao tác, mã thanh toán nội bộ và nhóm lỗi như timeout, quyền truy cập hoặc giới hạn tần suất. Bộ ghi log chỉ nhận thông tin đã lọc.
- `payment.reconciliation_overdue` ghi số lần thanh toán vẫn chờ xử lý sau khi quá hạn ít nhất 5 phút. Kiểm tra giao dịch trong màn hình đối soát admin và tra mã thanh toán khi cần rà lịch sử.
- `payment.reconciliation_failed` ghi lỗi đã lọc của tác vụ nền. Tác vụ sẽ tiếp tục theo lịch đối soát.

## Quản lý giao dịch

- Tiền thu lấy từ báo giá đã lưu trong đơn, gồm tiền thuê và phí sau giảm cùng tiền cọc. Toàn bộ lần thanh toán dùng số nguyên đồng. Đơn có tổng bằng 0 không lưu lần thanh toán payOS.
- Lần thanh toán được lưu trong transaction đặt thuê. Mỗi đơn có một mã payOS ổn định từ dải số dành riêng. Việc cấp link dùng claim ngắn có fencing. Với kết quả tạo link không rõ, tra cứu mã cũ và dùng lại mã đó nếu cần thử lại.
- Webhook chỉ áp dụng dữ liệu đã xác minh. API tra cứu có thể phục hồi giao dịch khi webhook không tới. Webhook và đối soát dùng chung ghi nhận. Một mã tham chiếu ngân hàng ghi một transfer và tối đa hai bút toán theo mục đích, cùng audit và outbox. Mã trả về từ trang payOS chỉ dùng để điều hướng. Nhân viên vẫn xác nhận đơn trước khi giao đồ.
- Khoản cọc và số tiền đơn được ghi riêng. Trước lúc xác nhận đơn đã thu payOS, staff có thể chuyển hoàn bằng ngân hàng, rồi dùng **Hoàn tiền và hủy đơn** để ghi hai khoản chi theo mục đích và nhả kho trong cùng transaction. Luồng này cần quyền tạo giao dịch và quyền hủy đơn. Sau khi giao đồ, hoàn cọc sử dụng bước kết toán hiện có.
- Hết hạn hoặc yêu cầu hủy sẽ đóng link và đối soát trước khi nhả đồ. Khi chưa xác định được kết quả từ provider, hệ thống giữ lịch và thử lại. Lượt ưu đãi trở lại khả dụng khi đơn hết hạn hoặc hủy mà chưa ghi nhận tiền.
- Chuyển sai số, chuyển thêm và chuyển sau khi đơn đã đóng được lưu để admin đối soát. Admin kiểm tra ngân hàng và thực hiện hoàn tiền trước khi ghi mã đã hoàn. Khoản chưa ghép không được ghi vào tiền thuê hoặc tiền cọc của đơn.
- Hàng chờ cũng hiển thị lần thanh toán đang đối soát khi payOS báo trạng thái mà chưa cung cấp giao dịch tương ứng. Dùng **Kiểm tra payOS** để lấy phản hồi mới. Số tiền hiển thị cho lần thanh toán là số tiền dự kiến của đơn. Chỉ giao dịch có mã chuyển khoản mới ghi nhận hoàn tiền được.
- Trang thanh toán không lưu cache và không tham gia analytics. Dữ liệu gửi sang payOS gồm mã, số tiền, hạn và đường dẫn quay lại. Backend chỉ lưu mã đối soát, thời điểm và số tiền cần thiết, cùng audit thao tác.

[Tài liệu Node SDK](https://payos.vn/docs/sdks/back-end/node/) · [API payOS](https://payos.vn/docs/api/) · [Môi trường test](https://payos.vn/docs/moi-truong-test/)
