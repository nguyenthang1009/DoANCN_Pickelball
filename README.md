# DoANCN_Pickelball
Đồ án chuyên ngành: Website quản lý và đặt sân Pickleball trực tuyến (mô hình chuỗi cơ sở).

Gồm backend Node.js + Express (MVC, MySQL, Socket.io) và frontend React (Vite) + Tailwind theo design system "Court" trên Figma. Báo cáo kiểm thử: [docs/test-report.md](docs/test-report.md).

## Khởi tạo CSDL (MySQL 8.0 trên Laragon)

Bật MySQL trong Laragon rồi chạy từ thư mục gốc của repo. Script xóa và tạo lại database `pickleball_booking`. Cần chạy lại sau khi kéo code tuần 8 (bảng `payment_transactions` có thêm cột).

```bash
bash scripts/init-db.sh
```

Tài khoản mẫu (mật khẩu `12345678`): `admin@pickleball.vn`, `manager.q7@pickleball.vn`, `staff.q7@pickleball.vn`, `customer1@gmail.com`.

## Chạy backend (Node.js + Express)

```bash
cd backend
npm install
cp .env.example .env   # sửa JWT_SECRET và thông tin MySQL nếu cần
npm run dev
```

API chạy tại `http://localhost:3000/api`, Socket.io cùng cổng. Job nền chạy mỗi 30 giây để hết hạn giữ chỗ (10 phút) và đánh dấu khách không đến.

Thanh toán PayOS: điền đủ `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` (và `PAYOS_RETURN_URL` là địa chỉ frontend) vào `.env` để gọi PayOS thật; webhook là `POST /api/payments/payos/webhook`. Thiếu khóa thì hệ thống chạy chế độ **mock**: trang thanh toán có nút "Giả lập chuyển khoản thành công", gửi webhook ký đúng chuẩn PayOS qua cùng bộ xử lý.

## Chạy frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

Mở `http://localhost:5173`. Vite chuyển `/api` và `/socket.io` sang backend cổng 3000 (đổi bằng biến `VITE_API_PROXY`).

| Vai trò | Trang chính |
| --- | --- |
| Khách hàng | Ma trận chọn sân `/`, thanh toán VietQR, vé QR, lịch đặt của tôi |
| Lễ tân | POS đặt tại quầy, check-in QR, bán dịch vụ, đơn trong ngày, doanh thu ca |
| Quản lý | Như lễ tân + tổng quan doanh thu, sân & bảng giá, dịch vụ, hoàn tiền (cơ sở của mình) |
| Admin | Như quản lý cho mọi cơ sở + cụm sân, tài khoản |

## API

| Method | Đường dẫn | Quyền |
| --- | --- | --- |
| POST | `/auth/register` | Công khai, luôn tạo CUSTOMER |
| POST | `/auth/login` | Công khai, đăng nhập bằng email hoặc SĐT |
| GET | `/auth/me` | Đã đăng nhập |
| POST | `/auth/change-password` | Đã đăng nhập |
| GET, POST | `/admin/users` | ADMIN |
| PATCH | `/admin/users/:id` | ADMIN (khóa / mở khóa) |
| GET | `/admin/venues` | ADMIN (cả cơ sở đã ngừng) |
| GET | `/venues/:venueId/staff` | ADMIN, MANAGER của đúng cơ sở |
| GET | `/venues`, `/venues/:venueId`, `/venues/:venueId/courts` | Công khai |
| GET | `/venues/:venueId/availability?date=YYYY-MM-DD` | Công khai (ma trận lịch trống) |
| POST, PATCH | `/venues`, `/venues/:venueId` | ADMIN |
| POST | `/venues/:venueId/courts` | ADMIN, MANAGER của đúng cơ sở |
| GET | `/courts/:courtId`, `/courts/:courtId/price-rules` | Công khai |
| GET | `/courts/:courtId/quote?date=YYYY-MM-DD&start=HH:MM&end=HH:MM` | Công khai (báo giá) |
| PATCH, DELETE | `/courts/:courtId` | ADMIN, MANAGER của đúng cơ sở |
| PATCH | `/courts/:courtId/status` | ADMIN, MANAGER của đúng cơ sở (bảo trì) |
| PUT | `/courts/:courtId/price-rules` | ADMIN, MANAGER của đúng cơ sở |
| GET | `/venues/:venueId/services` | ADMIN, MANAGER, STAFF của đúng cơ sở |
| POST | `/venues/:venueId/services` | ADMIN, MANAGER của đúng cơ sở |
| PATCH | `/services/:serviceId` | ADMIN, MANAGER của đúng cơ sở |
| POST | `/bookings` | CUSTOMER (online); STAFF, MANAGER, ADMIN (tại quầy, kèm `guestName`, `guestPhone`, `paymentMethod`, `services`) |
| GET | `/bookings/my` | CUSTOMER |
| GET | `/bookings/:code` | Chủ đơn, nhân sự cơ sở của đơn, ADMIN |
| POST | `/bookings/:code/cancel` | Chủ đơn (trước 24 giờ nếu đã thanh toán); MANAGER, ADMIN (cần lý do) |
| POST | `/bookings/:code/payment-link` | Chủ đơn, nhân sự cơ sở |
| POST | `/bookings/:code/check-in` | STAFF, MANAGER, ADMIN của đúng cơ sở |
| GET | `/bookings/refunds`, POST `/bookings/:code/refund` | MANAGER, ADMIN |
| GET | `/venues/:venueId/bookings?date=` | STAFF, MANAGER, ADMIN của đúng cơ sở |
| POST | `/venues/:venueId/service-orders` | STAFF, MANAGER, ADMIN của đúng cơ sở (bán lẻ) |
| POST | `/checkin/lookup` | STAFF, MANAGER, ADMIN (quét QR hoặc nhập mã đơn) |
| POST | `/payments/payos/webhook` | PayOS (xác thực bằng chữ ký HMAC) |
| POST | `/payments/mock/:code/pay` | Chỉ chế độ mock |
| GET | `/reports/shift?date=` | STAFF (ca của mình), MANAGER (cơ sở), ADMIN (toàn hệ thống) |
| GET | `/reports/revenue?from=&to=&venueId=` | MANAGER (cơ sở mình), ADMIN |

Tài khoản nội bộ do Admin tạo nhận mật khẩu tạm và phải đổi mật khẩu trước khi dùng các API có `authorize()`.

Quy tắc nghiệp vụ chính:

- Bảng giá của mỗi sân thay toàn bộ một lần (`PUT`), phải phủ kín giờ mở cửa cho cả `WEEKDAY` và `WEEKEND`, không hở, không chồng lấn; mốc giờ là bội số 30 phút, giá là bội số 1.000 VND. Thứ Bảy, Chủ Nhật và ngày trong bảng `holidays` tính giá cuối tuần.
- Mỗi ô 30 phút là một dòng `booking_slots`; khóa UNIQUE `active_slot_lock` chặn hai đơn cùng giữ một ô, người đến sau nhận `409 SLOT_TAKEN`.
- Giữ chỗ online 10 phút chờ VietQR; tiền về trễ khi ô đã thuộc người khác thì đơn chuyển `CONFLICT_REFUND_PENDING`.
- Mã QR trên vé là mã đơn + chữ ký HMAC; chỉ nhận sân trong khoảng 30 phút trước giờ chơi tới giờ kết thúc.
- Chuyển sân sang `MAINTENANCE`/`INACTIVE` (bắt buộc có lý do) hủy các đơn sắp tới trên sân. Sân đã có lịch đặt không xóa được.
- Mọi thay đổi cơ sở, sân, giá, dịch vụ, hủy đơn, hoàn tiền, check-in được ghi vào `audit_logs`.

## Kiểm thử

Trong `backend/postman/` có ba collection: `pickleball-auth-rbac` (tuần 4), `pickleball-venues-pricing` (tuần 5), `pickleball-booking-pos` (tuần 6–9). Import vào Postman và chọn Run collection, hoặc chạy bằng Newman khi server đang chạy:

```bash
npx newman run backend/postman/pickleball-booking-pos.postman_collection.json
```

Kịch bản tranh chấp (nhiều khách cùng đặt một ô) và kịch bản thanh toán – check-in:

```bash
cd backend
node scripts/race-test.js http://localhost:3000/api 20
DB_NAME=pickleball_booking node scripts/payment-test.js http://localhost:3000/api
```

Các collection và script tạo thêm dữ liệu thử mỗi lần chạy (`payment-test.js` còn sửa trực tiếp hạn giữ chỗ), nên chạy trên CSDL vừa khởi tạo lại.
