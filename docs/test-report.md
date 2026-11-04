# Báo cáo kiểm thử – Tuần 4 đến Tuần 9

Ngày chạy: 03/11/2026 · MySQL 8.0.30 (Laragon) · Node.js 24 · Thanh toán chạy chế độ mock (chưa có khóa PayOS thật).

Toàn bộ bộ kiểm thử tự động đạt trên một CSDL tạo mới từ `database/schema.sql` + `database/seed.sql`: 145 request API với 180 assertion, 2 vòng tranh chấp 20 khách và 20 kịch bản thanh toán – check-in, không có lỗi nào; log server không ghi lỗi.

## 1. Tổng hợp

| Bộ kiểm thử | Phạm vi | Số ca | Kết quả |
| --- | --- | --- | --- |
| `postman/pickleball-auth-rbac` | Tuần 4: đăng ký, đăng nhập, JWT, `verifyToken`, `authorize`, đổi mật khẩu lần đầu | 27 request · 28 assertion | Đạt hết |
| `postman/pickleball-venues-pricing` | Tuần 5: cơ sở, sân con, bảng giá động, báo giá, dịch vụ, bảo trì | 54 request · 66 assertion | Đạt hết |
| `postman/pickleball-booking-pos` | Tuần 6–9: lịch trống, giữ chỗ, thanh toán, check-in, hủy/hoàn tiền, POS, báo cáo, quản trị tài khoản | 64 request · 86 assertion | Đạt hết |
| `scripts/race-test.js` | Tuần 7: 20 khách cùng giữ một khung; khung chồng lấn 30 phút | 2 vòng | Mỗi vòng đúng 1 đơn thắng, 19 nhận `409 SLOT_TAKEN` |
| `scripts/payment-test.js` | Tuần 8: webhook PayOS và check-in QR | 20 kịch bản | Đạt hết |
| Kiểm thử giao diện theo vai trò | Tuần 6–9: trình duyệt thật, 4 vai trò | 30 thao tác | Đạt sau khi sửa 5 lỗi (mục 4) |

Cách chạy lại (server đang chạy ở chế độ mock):

```bash
cd backend
npx newman run postman/pickleball-booking-pos.postman_collection.json --env-var "baseUrl=http://localhost:3000/api"
node scripts/race-test.js http://localhost:3000/api 20
DB_NAME=pickleball_booking node scripts/payment-test.js http://localhost:3000/api
```

`payment-test.js` chỉnh trực tiếp hạn giữ chỗ trong CSDL để giả lập hết hạn, chỉ nên chạy trên CSDL thử.

## 2. Ca kiểm thử nghiệp vụ chính

| Mã | Kịch bản | Kỳ vọng | Kết quả |
| --- | --- | --- | --- |
| TC-B01 | Khách giữ 2 ô liền nhau, khách khác giữ cùng khung | Người đầu `201 PENDING_PAYMENT`, người sau `409 SLOT_TAKEN` | Đạt |
| TC-B02 | 20 khách gửi cùng lúc một khung | Đúng 1 đơn, không lỗi 500 | Đạt |
| TC-B03 | Khung [t, t+60) và [t+30, t+90) gửi cùng lúc | Đúng 1 đơn | Đạt |
| TC-B04 | Đặt giờ đã qua / quá 14 ngày / dưới 60 phút / sân bảo trì | `SLOT_IN_PAST` / `TOO_FAR_AHEAD` / `INVALID_DURATION` / `COURT_UNAVAILABLE` | Đạt |
| TC-B05 | Giữ chỗ quá 10 phút | Job nền chuyển `EXPIRED`, ô trống lại, ma trận cập nhật không cần F5 | Đạt |
| TC-P01 | Tạo link VietQR hai lần | Cùng `orderCode`, không tạo giao dịch thừa | Đạt |
| TC-P02 | Webhook sai chữ ký | `400 INVALID_SIGNATURE`, đơn giữ nguyên | Đạt |
| TC-P03 | Webhook sai số tiền | `AMOUNT_MISMATCH`, không xác nhận đơn | Đạt |
| TC-P04 (TC09) | Gửi lại cùng một webhook | `DUPLICATE`, chỉ 1 giao dịch `SUCCESS` | Đạt |
| TC-P05 | Tiền về sau khi hết hạn, ô còn trống | Lấy lại ô, đơn `PAID` | Đạt |
| TC-P06 (TC10) | Tiền về sau khi hết hạn, ô đã có người | `CONFLICT_REFUND_PENDING` | Đạt |
| TC-C01 | QR bị sửa chữ ký | `400 INVALID_QR` | Đạt |
| TC-C02 | Nhận sân trước cửa sổ 30 phút / lần hai | `409 CANNOT_CHECK_IN` | Đạt |
| TC-C03 | Lễ tân Quận 7 tra cứu đơn Thủ Đức | `403` | Đạt |
| TC-R01 | Khách hủy đơn đã thanh toán trước 24 giờ | `REFUND_PENDING`, ô được trả lại | Đạt |
| TC-R02 | Manager xác nhận hoàn tiền | `REFUNDED`, ghi `audit_logs` | Đạt |
| TC-M01 | Chuyển sân sang bảo trì | Đơn sắp tới: `PAID → REFUND_PENDING`, `PENDING_PAYMENT → CANCELLED`; đơn đã qua giữ nguyên | Đạt |
| TC-M02 | Bảng giá hở / chồng lấn / thiếu cuối tuần / giá lẻ | `400` kèm khung giờ sai | Đạt |
| TC-M03 | Báo giá vắt qua hai khung giá, ngày lễ | 70.000 + 60.000 + 60.000; ngày 01/01 tính giá cuối tuần | Đạt |
| TC-S01 | POS: khách vãng lai + 2 nước + 1 vợt, tiền mặt | `PAID` ngay, dịch vụ 80.000đ cộng vào tổng | Đạt |
| TC-S02 | POS: VietQR | Mã QR tại quầy, webhook gồm cả tiền dịch vụ | Đạt |
| TC-S03 | Doanh thu ca | Staff chỉ thấy giao dịch của mình, tách tiền mặt / chuyển khoản | Đạt |

## 3. Ma trận phân quyền đã kiểm

| Chức năng | Khách | Lễ tân | Quản lý | Admin |
| --- | --- | --- | --- | --- |
| Xem lịch trống | Có | Có | Có | Có |
| Đặt online, thanh toán VietQR | Có | — | — | — |
| Đặt tại quầy, bán dịch vụ | 403 | Cơ sở mình | Cơ sở mình | Mọi cơ sở |
| Check-in QR | 403 | Cơ sở mình | Cơ sở mình | Mọi cơ sở |
| Hủy đơn đã thanh toán | Trước 24 giờ | 403 | Có (cần lý do) | Có |
| Xác nhận hoàn tiền | 403 | 403 | Cơ sở mình | Mọi cơ sở |
| Doanh thu ca | 403 | Ca của mình | Cả cơ sở | Toàn hệ thống |
| Dashboard doanh thu | 403 | 403 | Cơ sở mình (bỏ qua `venueId` khác) | Toàn chuỗi, so sánh cơ sở |
| Sân con, bảng giá, dịch vụ | 403 | 403 | Cơ sở mình | Mọi cơ sở |
| Cụm sân, tài khoản, khóa tài khoản | 403 | 403 | 403 | Có (không tự khóa mình) |

Giao diện chặn cùng ma trận này: mỗi vai trò chỉ thấy mục menu của mình; gõ thẳng URL trang không được phép sẽ bị đưa về trang chủ của vai trò. Tài khoản nội bộ mới bị giữ ở trang đổi mật khẩu cho tới khi đổi xong.

## 4. Lỗi phát hiện trong quá trình kiểm thử và đã sửa

| Lỗi | Phát hiện bằng | Cách sửa |
| --- | --- | --- |
| 9/12 yêu cầu đồng thời trả 500 `ER_LOCK_DEADLOCK` (không đặt trùng, nhưng phản hồi sai) | `race-test.js` | Tách bước giải phóng giữ chỗ quá hạn ra transaction riêng; transaction đặt sân tự chạy lại khi MySQL báo deadlock |
| Hash mật khẩu trong seed không khớp `12345678` | Kiểm tra bcrypt tuần 4 | Thay hash đúng |
| Tên tiếng Việt bị lỗi font khi nạp seed | Phản hồi API tuần 4 | `init-db.sh` dùng `--default-character-set=utf8mb4` |
| Bấm nhanh nhiều món ở POS làm mất món trước (tính 170.000đ thay vì 200.000đ) | Kiểm thử giao diện POS | Giỏ hàng cập nhật bằng hàm (`setState(fn)`) |
| Giờ giao dịch hiện theo UTC (11:38 thay vì 18:38) | Trang Doanh thu ca | Đổi mốc ISO UTC sang giờ Việt Nam khi hiển thị |
| Ma trận POS tràn ngang, chỉ thấy tới 14:00 | Ảnh chụp 1440 × 900 | Nhãn giờ không chiếm độ rộng cột; bản thu nhỏ co vừa khung |
| Thông báo bảo trì không liệt kê đơn bị ảnh hưởng | Trang Sân & bảng giá | Dựng thông báo từ kết quả API |

## 5. Đợt 1: phân quyền, bảo mật, giao diện theo đặc tả

Ngày chạy: 05/11/2026 · trên CSDL thử tạo mới từ `schema.sql` + `seed.sql`.

| Bộ kiểm thử | Phạm vi | Số ca | Kết quả |
| --- | --- | --- | --- |
| Ba collection Postman ở mục 1 | Hồi quy sau khi đổi sang quyền theo mã chức năng và cookie | 145 request · 180 assertion | Đạt hết, bằng mốc trước khi sửa |
| `scripts/race-test.js` | Tranh chấp giữ chỗ | 2 vòng | Đạt |
| `scripts/payment-test.js` | Webhook, check-in | 16 kiểm tra | Đạt |
| `scripts/security-test.js` | Phiên cookie, CSRF, CORS, giới hạn đăng nhập, chốt chặn phân quyền, đổi sân, quy tắc hủy | 62 kiểm tra | Đạt |
| Giao diện trên trình duyệt thật | Khách, Lễ tân, Quản lý, Admin, vai trò Thu ngân tự tạo; trang chủ ở 375 px và 1440 px | Theo luồng | Đạt |

Lỗi phát hiện và đã sửa trong đợt này:

| Lỗi | Phát hiện bởi | Cách sửa |
| --- | --- | --- |
| Refresh token vừa bị thu hồi (đăng xuất, lộ token) vẫn đổi được trong 10 giây chờ dành cho hai tab | `security-test.js` | Tách `rotated_at` khỏi `revoked_at`; token đã thu hồi bị từ chối ngay |
| Trang Đơn trong ngày gọi `can` chưa khai báo, build vẫn qua nhưng lỗi khi chạy | Rà soát trước khi chạy giao diện | Lấy `can` từ `useAuth` |
| Trang chủ hiện "0 ô trống" sau giờ đóng cửa | Chạy thật lúc 22 giờ | Hiện "Đã hết" |
| Sự kiện realtime của đơn phát cho mọi kết nối, lộ mã đơn | Rà soát khi thêm cookie | Chỉ gửi tới phòng của đúng đơn |

Hai request "Không có token" trong Postman được tắt cookie, vì Newman tự giữ cookie từ lần đăng nhập trước.

Sau đó bổ sung thông báo, hộp xác nhận, ảnh và hiệu ứng (chỉ đổi frontend, không đổi API). Đã thử trên trình duyệt thật, CSDL thử:

| Vai trò | Thao tác đã thử |
| --- | --- |
| Khách | Sai mật khẩu, đăng nhập, hủy đơn (Giữ lại, Esc, đồng ý), đăng xuất |
| Lễ tân | Thu tiền mặt POS (Xem lại thì không tạo đơn, đồng ý thì tạo), bán dịch vụ |
| Quản lý | Đổi giá dịch vụ (chặn giá sai), ngừng bán, xác nhận hoàn tiền, xóa sân |
| Admin | Khóa, mở khóa, đổi vai trò, lưu quyền, đổi giờ cơ sở (chặn định dạng sai), tạm ngừng cơ sở, bảo trì nhiều đơn |

Realtime vẫn đạt: ô lịch đổi sau 90 ms khi có người giữ chỗ từ máy khác. Trang chủ, đặt sân, đăng nhập, đăng ký không tràn ngang ở 375 px.

## 6. Hóa đơn, thuế, sổ cái, tiền lương

Ngày chạy: 05/11/2026. `scripts/finance-test.js` gồm các ca tính tay độc lập với code: lương 20, 40, 80 triệu đồng, chạm trần bảo hiểm, làm thêm giờ, dưới 14 ngày công, biểu thuế 5 bậc, tách VAT trên 4.000 mức giá; luồng hóa đơn, hoàn tiền, tiền về trễ, trigger chặn sửa, quy trình lương, đối soát 12 điểm, lọc theo cơ sở.

Lỗi phát hiện và đã sửa:

| Lỗi | Phát hiện bởi | Cách sửa |
| --- | --- | --- |
| Phép trừ trên cột `BIGINT UNSIGNED` tràn khi có hóa đơn điều chỉnh giảm | `finance-test.js` | Đổi `debit`, `credit` sang số có dấu, kèm ràng buộc không âm |
| Lọc tài chính theo một cơ sở hiện doanh thu 0đ do sai thứ tự tham số SQL | Xem giao diện thật, test chưa phủ | Sửa thứ tự, thêm ca: cộng từng cơ sở phải bằng toàn chuỗi |
| Đơn tiền về trễ đã hoàn bị báo thiếu hóa đơn | `finance-test.js` | Loại trừ đúng trường hợp không phát sinh doanh thu |
| Admin không đổi được vai trò sang Lễ tân vì thiếu quyền `payroll.view_own` | `security-test.js` | Cấp quyền đó cho Admin |

## 7. Chưa kiểm thử được

- **PayOS thật**: chưa có `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`. Cách ký chữ ký làm theo SDK chính thức của payOS; cần chạy thử với tài khoản PayOS sandbox trước khi demo.
- **Quét QR bằng camera**: trình duyệt kiểm thử không có camera; đã kiểm luồng nhập mã tay và API quét QR (`/checkin/lookup` với chuỗi QR).
- **Giao diện điện thoại**: trang chủ đã kiểm ở 375 px; các trang khách còn lại co được và ma trận cuộn ngang, nhưng chưa rà riêng từng màn. Modal bảo trì và màn Phân quyền chưa kiểm ở khổ nhỏ.
- **Email gửi vé**: chưa làm, vé hiển thị trên trang "Lịch đặt của tôi".
- **Hóa đơn điện tử thật**: chưa kết nối nhà cung cấp, chưa có mã của cơ quan thuế.
- **Số liệu lớn**: đối soát chạy trên dữ liệu thử nhỏ, chưa thử với hàng chục nghìn hóa đơn.
- **HTTPS và cookie `Secure`**: máy phát triển chạy HTTP nên chưa chạy thử với `NODE_ENV=production`.
