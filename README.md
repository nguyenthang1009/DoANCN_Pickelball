# DoANCN_Pickelball
Đồ án chuyên ngành: Website quản lý và đặt sân Pickleball trực tuyến (mô hình chuỗi cơ sở).

## Khởi tạo CSDL (MySQL 8.0 trên Laragon)

Bật MySQL trong Laragon rồi chạy từ thư mục gốc của repo. Script xóa và tạo lại database `pickleball_booking`.

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

API chạy tại `http://localhost:3000/api`.

| Method | Đường dẫn | Quyền |
| --- | --- | --- |
| POST | `/auth/register` | Công khai, luôn tạo CUSTOMER |
| POST | `/auth/login` | Công khai, đăng nhập bằng email hoặc SĐT |
| GET | `/auth/me` | Đã đăng nhập |
| POST | `/auth/change-password` | Đã đăng nhập |
| GET, POST | `/admin/users` | ADMIN |
| GET | `/venues/:venueId/staff` | ADMIN, MANAGER của đúng cơ sở |
| GET | `/venues`, `/venues/:venueId`, `/venues/:venueId/courts` | Công khai |
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

Tài khoản nội bộ do Admin tạo nhận mật khẩu tạm và phải đổi mật khẩu trước khi dùng các API có `authorize()`.

Quy tắc bảng giá và báo giá:

- Bảng giá của mỗi sân thay toàn bộ một lần (`PUT`), phải phủ kín giờ mở cửa cho cả `WEEKDAY` và `WEEKEND`, không hở, không chồng lấn; mốc giờ là bội số 30 phút, giá là bội số 1.000 VND.
- Báo giá tách khung giờ thành ô 30 phút, mỗi ô lấy nửa giá giờ của khung chứa nó. Thứ Bảy, Chủ Nhật và ngày trong bảng `holidays` tính giá cuối tuần. Thời lượng đặt nằm trong `MIN_BOOKING_MINUTES`–`MAX_BOOKING_MINUTES`.
- Chuyển sân sang `MAINTENANCE` hoặc `INACTIVE` (bắt buộc có lý do) sẽ hủy các đơn sắp tới trên sân: đơn đã thanh toán thành `REFUND_PENDING`, đơn đang giữ chỗ thành `CANCELLED`. Sân đã có lịch đặt không xóa được, chỉ chuyển `INACTIVE`.
- Mọi thay đổi cơ sở, sân, giá và dịch vụ được ghi vào `audit_logs`.

## Kiểm thử phân quyền

Trong `backend/postman/` có hai collection: `pickleball-auth-rbac` (tuần 4) và `pickleball-venues-pricing` (tuần 5). Import vào Postman và chọn Run collection, hoặc chạy bằng Newman khi server đang chạy:

```bash
npx newman run backend/postman/pickleball-auth-rbac.postman_collection.json
npx newman run backend/postman/pickleball-venues-pricing.postman_collection.json
```

Collection tuần 5 tạo thêm dữ liệu thử (một cơ sở, một món dịch vụ đã ngừng bán) mỗi lần chạy, nên chạy trên CSDL vừa khởi tạo lại.
