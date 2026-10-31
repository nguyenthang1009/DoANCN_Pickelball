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

Tài khoản nội bộ do Admin tạo nhận mật khẩu tạm và phải đổi mật khẩu trước khi dùng các API có `authorize()`.

## Kiểm thử phân quyền

Import `backend/postman/pickleball-auth-rbac.postman_collection.json` vào Postman và chọn Run collection, hoặc chạy bằng Newman khi server đang chạy:

```bash
npx newman run backend/postman/pickleball-auth-rbac.postman_collection.json
```
