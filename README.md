# DoANCN_Pickelball
Đồ án chuyên ngành: Website quản lý và đặt sân Pickleball trực tuyến (mô hình chuỗi cơ sở).

Gồm backend Node.js + Express (MVC, MySQL, Socket.io) và frontend React (Vite) + Tailwind theo design system "Court" trên Figma. Báo cáo kiểm thử: [docs/test-report.md](docs/test-report.md).

**Tải về chạy thử lần đầu:** làm theo [docs/huong-dan-cai-dat.md](docs/huong-dan-cai-dat.md) (từng bước, có tài khoản mẫu, kịch bản chạy thử và cách xử lý lỗi thường gặp).

## Khởi tạo CSDL (MySQL 8.0 trên Laragon)

Bật MySQL trong Laragon rồi chạy từ thư mục gốc của repo. Script xóa và tạo lại database `pickleball_booking`. Cần chạy lại khi schema đổi (mới nhất: thêm bảng phân quyền và `refresh_tokens`).

```bash
bash scripts/init-db.sh
```

Bảng hóa đơn và sổ cái có trigger chặn sửa, xóa. Muốn làm sạch dữ liệu thử thì chạy lại script này, không xóa tay.

Tài khoản mẫu (mật khẩu `12345678`): `admin@pickleball.vn`, `manager.q7@pickleball.vn`, `staff.q7@pickleball.vn`, `customer1@gmail.com`.

## Chạy backend (Node.js + Express)

```bash
cd backend
npm install
cp .env.example .env   # bắt buộc điền JWT_SECRET (từ 32 ký tự) và thông tin MySQL nếu cần
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # tạo JWT_SECRET
npm run dev
```

API chạy tại `http://localhost:3000/api`, Socket.io cùng cổng. Job nền chạy mỗi 30 giây để hết hạn giữ chỗ (10 phút) và đánh dấu khách không đến.

Frontend chạy ở địa chỉ khác `http://localhost:5173` thì thêm địa chỉ đó vào `CORS_ORIGINS`, nếu không trình duyệt sẽ không gọi được API kèm cookie.

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
| Khách hàng | Trang chủ `/`, ma trận chọn sân `/dat-san`, thanh toán VietQR, vé QR, lịch đặt, hóa đơn của tôi |
| Lễ tân | POS đặt tại quầy, check-in QR, bán dịch vụ, đơn trong ngày, doanh thu ca, hóa đơn cơ sở, phiếu lương của mình, xem đèn sân, tự chấm công |
| Quản lý | Như lễ tân + tổng quan doanh thu, sân & bảng giá, dịch vụ, hoàn tiền, tài chính, lập bảng lương, điều khiển đèn, xếp ca và sửa chấm công (cơ sở của mình) |
| Admin | Như quản lý cho mọi cơ sở + cụm sân, tài khoản, phân quyền, duyệt lương, đối soát, tham số pháp lý, ảnh và nội dung |

Menu và trang được ẩn hiện theo quyền của tài khoản, nên vai trò tự tạo (VD: Thu ngân) chỉ thấy đúng chức năng được cấp.

Mọi thao tác hiện thông báo kết quả. Thao tác nhạy cảm (hủy đơn, thu tiền, hoàn tiền, khóa tài khoản, đổi vai trò, đổi quyền, đổi giá, xóa sân, bảo trì) phải qua hộp xác nhận: dùng `useFeedback()` trong `frontend/src/lib/feedback.jsx`, không dùng `window.confirm`. Hiệu ứng động tự tắt khi người dùng bật giảm chuyển động trong hệ điều hành.

## API

| Method | Đường dẫn | Quyền |
| --- | --- | --- |
| POST | `/auth/register` | Công khai, luôn tạo CUSTOMER |
| POST | `/auth/login` | Công khai, đăng nhập bằng email hoặc SĐT |
| GET | `/auth/me` | Đã đăng nhập |
| POST | `/auth/change-password` | Đã đăng nhập |
| POST | `/auth/refresh`, `/auth/logout` | Theo cookie phiên |
| GET, POST | `/admin/users` | ADMIN |
| PATCH | `/admin/users/:id` | ADMIN (khóa / mở khóa) |
| PATCH | `/admin/users/:id/role` | ADMIN (đổi vai trò) |
| GET, POST | `/admin/roles` | ADMIN (ma trận quyền, tạo vai trò) |
| PUT, DELETE | `/admin/roles/:id` | ADMIN |
| GET | `/admin/venues` | ADMIN (cả cơ sở đã ngừng) |
| GET | `/venues/:venueId/staff` | ADMIN, MANAGER của đúng cơ sở |
| GET | `/venues`, `/venues/:venueId`, `/venues/:venueId/courts` | Công khai |
| GET | `/venues/:venueId/availability?date=YYYY-MM-DD` | Công khai (ma trận lịch trống) |
| POST, PATCH | `/venues`, `/venues/:venueId` | ADMIN |
| POST | `/venues/:venueId/courts` | ADMIN, MANAGER của đúng cơ sở |
| GET | `/courts/:courtId`, `/courts/:courtId/price-rules` | Công khai |
| GET | `/courts/:courtId/quote?date=YYYY-MM-DD&start=HH:MM&end=HH:MM` | Công khai (báo giá) |
| PATCH, DELETE | `/courts/:courtId` | ADMIN, MANAGER của đúng cơ sở |
| GET | `/courts/:courtId/impact` | ADMIN, MANAGER của đúng cơ sở (đơn bị ảnh hưởng, sân thay thế) |
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
| POST | `/bookings/:code/move` | MANAGER, ADMIN của đúng cơ sở (đổi sân, giữ nguyên giá) |
| GET | `/venues/:venueId/bookings?date=` | STAFF, MANAGER, ADMIN của đúng cơ sở |
| POST | `/venues/:venueId/service-orders` | STAFF, MANAGER, ADMIN của đúng cơ sở (bán lẻ) |
| POST | `/checkin/lookup` | STAFF, MANAGER, ADMIN (quét QR hoặc nhập mã đơn) |
| POST | `/payments/payos/webhook` | PayOS (xác thực bằng chữ ký HMAC) |
| POST | `/payments/mock/:code/pay` | Chỉ chế độ mock |
| GET | `/reports/shift?date=` | STAFF (ca của mình), MANAGER (cơ sở), ADMIN (toàn hệ thống) |
| GET | `/reports/revenue?from=&to=&venueId=` | MANAGER (cơ sở mình), ADMIN |

Cột Quyền ghi theo cấu hình mặc định. Mỗi API thực tế kiểm tra một mã chức năng (xem mục Phân quyền), nên đổi được trên màn Phân quyền.

Tài khoản nội bộ do Admin tạo nhận mật khẩu tạm và phải đổi mật khẩu trước khi dùng các API có `can()`.

Quy tắc nghiệp vụ chính:

- Bảng giá của mỗi sân thay toàn bộ một lần (`PUT`), phải phủ kín giờ mở cửa cho cả `WEEKDAY` và `WEEKEND`, không hở, không chồng lấn; mốc giờ là bội số 30 phút, giá là bội số 1.000 VND. Thứ Bảy, Chủ Nhật và ngày trong bảng `holidays` tính giá cuối tuần.
- Mỗi ô 30 phút là một dòng `booking_slots`; khóa UNIQUE `active_slot_lock` chặn hai đơn cùng giữ một ô, người đến sau nhận `409 SLOT_TAKEN`.
- Giữ chỗ online 10 phút chờ VietQR; tiền về trễ khi ô đã thuộc người khác thì đơn chuyển `CONFLICT_REFUND_PENDING`.
- Mã QR trên vé là mã đơn + chữ ký HMAC; chỉ nhận sân trong khoảng 30 phút trước giờ chơi tới giờ kết thúc.
- Chuyển sân sang `MAINTENANCE`/`INACTIVE` (bắt buộc có lý do) hủy các đơn sắp tới còn lại trên sân. Trước khi khóa, Quản lý xem danh sách đơn bị ảnh hưởng và đổi khách sang sân còn trống cùng khung giờ. Sân đã có lịch đặt không xóa được.
- Mọi thay đổi cơ sở, sân, giá, dịch vụ, hủy đơn, hoàn tiền, check-in được ghi vào `audit_logs`.

## Tài chính

Mô hình ERP thu nhỏ, tiền lưu VND số nguyên, không dùng số thực:

- **Hóa đơn:** tự phát hành khi tiền về (tiền mặt, VietQR, bán lẻ) trong cùng transaction với nghiệp vụ, số liên tục theo năm. Giá niêm yết đã gồm thuế, thuế suất chốt lúc phát hành. Hoàn tiền phát hành hóa đơn điều chỉnh giảm.
- **Sổ cái kế toán kép:** mọi khoản thu, hoàn tiền, lương đều ghi bút toán nợ có; bút toán lệch thì cả nghiệp vụ dừng lại. Báo cáo tài chính đọc từ sổ cái. Trigger MySQL chặn sửa, xóa hóa đơn và sổ cái.
- **Đối soát:** Admin chạy 12 phép so chéo giữa nghiệp vụ, hóa đơn, sổ cái, PayOS và bảng lương ở mục Tài chính.
- **Tiền lương:** hợp đồng theo ngày hiệu lực với 4 hình thức trả lương: tháng, ngày, giờ, ca (Điều 96 BLLĐ 2019). Lương giờ, ngày, ca quy ra giờ phải không thấp hơn lương tối thiểu giờ. Quản lý lập bảng, Admin duyệt rồi xác nhận chi trả; người lập không tự duyệt được. Tính BHXH, BHYT, BHTN, làm thêm 150/200/300%, ban đêm 30%, làm thêm ban đêm thêm 20% (200/210/270/390%) theo tham số pháp lý có ngày hiệu lực. Khấu trừ thuế TNCN (giảm trừ gia cảnh, biểu 5 bậc) mặc định tắt theo phạm vi đồ án, Admin bật lại trong Tham số pháp lý.
- **Tham số pháp lý:** lưu theo ngày hiệu lực ở mục Tham số pháp lý. Luật đổi thì thêm phiên bản mới, không sửa code.

Hóa đơn hiện là chứng từ nội bộ, chưa phải hóa đơn điện tử có mã của cơ quan thuế; muốn dùng thật cần kết nối nhà cung cấp hóa đơn điện tử. Các tham số thuế là giá trị tham khảo, cần kế toán xác nhận.

Admin thay ảnh hệ thống, chọn điểm lấy nét khi cắt ảnh theo khổ màn hình và sửa thông tin đồ án ở mục Ảnh & nội dung. Ảnh tải lên nằm ở `backend/uploads/` (không commit).

## Dự báo doanh thu

Dành cho Admin: dự báo doanh thu từng ngày và tăng trưởng 30 ngày tới bằng Holt-Winters theo mùa vụ tuần. Chọn mô hình bằng sai số trên các ngày cuối, kèm khoảng dự báo 80% và 95%. Doanh thu đọc từ sổ cái nên khớp báo cáo tài chính. Phương pháp, công thức, tài liệu tham khảo và kết quả đối chiếu với statsmodels: [docs/du-bao-doanh-thu.md](docs/du-bao-doanh-thu.md).

## Ca làm và chấm công

- **Xếp ca:** mẫu ca theo cơ sở (sáng, chiều, đêm trực), lịch tuần cho từng nhân sự, chặn xếp trùng giờ. Ca chốt giờ lúc xếp nên sửa mẫu ca không đổi lịch cũ.
- **Chấm công:** nhân viên tự vào ca, ra ca trên trang Chấm công. Vào trong khung giờ ca (sớm tối đa 30 phút) thì tự gắn với ca. Mỗi người chỉ có một lượt đang mở; CSDL chặn bằng ràng buộc duy nhất nên bấm nhiều lần cùng lúc vẫn chỉ ghi một lượt.
- **Đang trong ca:** quản lý xem ai đang làm, từ mấy giờ.
- **Sửa chấm công:** quản lý ghi bù, sửa giờ, bắt buộc ghi lý do, có nhật ký. Không tự sửa chấm công của mình, không sửa tháng đã duyệt lương.
- **Bảng công:** tổng hợp từng ngày theo luật: tối đa 8 giờ thường một ngày, phần vượt là làm thêm; ngày nghỉ hằng tuần và ngày lễ là làm thêm; ban đêm 22h-6h; lễ trùng ngày nghỉ hằng tuần thì nghỉ bù ngày kế tiếp. Nút "Tính lại từ chấm công" trên bảng lương đổ thẳng số giờ vào phiếu lương.
- **Ngày lễ:** Admin nhập theo từng năm (đã có 12 ngày của 2026, gồm 24/11 Ngày Văn hóa Việt Nam).
- **Giới hạn làm thêm:** bảng lương cảnh báo khi một ngày làm thêm quá 50% giờ làm bình thường, quá 40 giờ một tháng hoặc 200 giờ một năm (Điều 107 BLLĐ 2019). Chỉ cảnh báo, tiền làm thêm vẫn trả đủ.

## Chiếu sáng thông minh

Fuzzy Logic (Mamdani, giải mờ trọng tâm) chỉnh độ sáng đèn từng sân theo ánh sáng môi trường, mức hoạt động trên sân và lịch đặt sân. Đèn chỉ sáng khi có đơn đã thanh toán, có người trên sân mà không có đơn thì báo lễ tân. Có thể nối đèn Yeelight qua mạng LAN. Thiết kế, bảng luật và ví dụ tính tay: [docs/fuzzy-lighting.md](docs/fuzzy-lighting.md).

Giả lập thiết bị IoT gửi số đo cảm biến (đặt `IOT_DEVICE_KEY` trong `.env` trước):

```bash
cd backend
IOT_DEVICE_KEY=<khóa trong .env> node scripts/iot-simulator.js http://localhost:3000/api 1,2,3
```

## Phân quyền

`users.role` là cấp phạm vi dữ liệu (toàn chuỗi, theo cơ sở, của mình). Quyền dùng chức năng nằm ở `permissions` và `role_permissions`, route kiểm tra bằng `can('booking.refund')`. Đổi quyền có hiệu lực ngay vì mỗi request đọc lại từ CSDL.

Admin tạo vai trò mới và tích quyền trên màn Phân quyền. Các chốt chặn nằm ở backend:

- Vai trò tự tạo chỉ có phạm vi theo cơ sở, không có cấp toàn chuỗi.
- Quyền quản trị (`admin_only`) không gán được cho vai trò khác ngoài Admin.
- Chỉ cấp hoặc gỡ được quyền mình đang có.
- Không tự sửa vai trò của mình, không tự đổi vai trò của mình.
- Vai trò Admin không sửa được; vai trò hệ thống và vai trò đang dùng không xóa được.
- Hệ thống luôn còn ít nhất một Admin hoạt động.
- Mọi thay đổi ghi `audit_logs`.

## Bảo mật

- Phiên đăng nhập nằm trong cookie `httpOnly`, `SameSite=Lax`: token truy cập 15 phút, refresh token 7 ngày, xoay vòng mỗi lần dùng. CSDL chỉ lưu giá trị băm SHA-256. Refresh token cũ bị dùng lại sẽ thu hồi cả chuỗi phiên.
- Đổi mật khẩu đăng xuất mọi thiết bị.
- `helmet` đặt header bảo mật. CORS chỉ mở cho `CORS_ORIGINS`. Request ghi dữ liệu kèm cookie từ nguồn lạ bị chặn.
- Giới hạn tần suất: 600 request/phút theo IP; 10 lần đăng nhập sai/15 phút theo IP + tài khoản; 60 lần đăng ký, làm mới phiên, đổi mật khẩu/15 phút. Bộ đếm nằm trong RAM, chạy nhiều tiến trình thì cần Redis.
- Webhook PayOS không dùng cookie, xác thực bằng chữ ký HMAC.

Khi triển khai thật: chạy sau HTTPS, đặt `NODE_ENV=production` (bật cookie `Secure`, ẩn token khỏi JSON), `TRUST_PROXY=1` nếu đứng sau Nginx, đổi toàn bộ khóa bí mật. Ngoài production, API vẫn trả `token` trong JSON và nhận header `Authorization: Bearer` để Postman và script kiểm thử chạy được.

## Kiểm thử

Trong `backend/postman/` có ba collection: `pickleball-auth-rbac` (tuần 4), `pickleball-venues-pricing` (tuần 5), `pickleball-booking-pos` (tuần 6–9). Import vào Postman và chọn Run collection, hoặc chạy bằng Newman khi server đang chạy:

```bash
npx newman run backend/postman/pickleball-booking-pos.postman_collection.json
```

Kịch bản tranh chấp (nhiều khách cùng đặt một ô), thanh toán – check-in, và bảo mật – phân quyền – đổi sân:

```bash
cd backend
node scripts/race-test.js http://localhost:3000/api 20
DB_NAME=pickleball_booking PAYOS_CHECKSUM_KEY=<giống server> node scripts/payment-test.js http://localhost:3000/api
DB_NAME=pickleball_booking node scripts/security-test.js http://localhost:3000/api
DB_NAME=pickleball_booking PAYOS_CHECKSUM_KEY=<giống server> node scripts/finance-test.js http://localhost:3000/api
DB_NAME=pickleball_booking IOT_DEVICE_KEY=<khóa> node scripts/lighting-test.js http://localhost:3000/api
DB_NAME=pickleball_booking node scripts/shift-test.js http://localhost:3000/api
DB_NAME=pickleball_booking node scripts/forecast-test.js http://localhost:3000/api
```

Các collection và script tạo thêm dữ liệu thử mỗi lần chạy (`payment-test.js` còn sửa trực tiếp hạn giữ chỗ), nên chạy trên CSDL vừa khởi tạo lại. `payment-test.js` và `finance-test.js` tự ký webhook PayOS nên server cần chạy với cùng `PAYOS_CHECKSUM_KEY` (ví dụ `PAYOS_CHECKSUM_KEY=khoa-thu npm run dev`); khi không đặt, server tự sinh khóa ngẫu nhiên và từ chối mọi webhook từ bên ngoài.
