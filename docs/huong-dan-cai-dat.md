# Hướng dẫn cài đặt và chạy thử

Dành cho người tải mã nguồn về chạy thử trên máy Windows. Làm lần lượt từng bước, mất khoảng 15 phút.

## 1. Cần cài trước

| Phần mềm | Phiên bản | Ghi chú |
| --- | --- | --- |
| Git | bất kỳ | Cài kèm **Git Bash**, dùng để chạy script tạo CSDL |
| Node.js | 20 trở lên (nên dùng bản LTS) | Kiểm tra: `node -v` |
| Laragon | bản có MySQL 8 | Hoặc MySQL 8 cài riêng |

Máy cần trống các cổng 3000 (backend), 5173 (giao diện) và 3306 (MySQL).

## 2. Tải mã nguồn

```bash
git clone https://github.com/nguyenthang1009/DoANCN_Pickelball.git
```

```bash
cd DoANCN_Pickelball
```

Nếu nhánh `main` chưa có bản mới nhất, chuyển sang nhánh đang phát triển:

```bash
git checkout feature/week9-pos-dashboard
```

## 3. Tạo cơ sở dữ liệu

1. Mở Laragon, bấm **Start All** để bật MySQL.
2. Mở **Git Bash** tại thư mục `DoANCN_Pickelball`, chạy:

```bash
bash scripts/init-db.sh
```

Thấy hai dòng `[OK]` là xong. Script tạo CSDL `pickleball_booking` gồm 36 bảng và dữ liệu mẫu.

Script **xóa rồi tạo lại** CSDL cùng tên, muốn làm sạch dữ liệu thử thì chạy lại. MySQL của bạn có đặt mật khẩu thì truyền thêm:

```bash
DB_PASSWORD=matkhau_mysql bash scripts/init-db.sh
```

## 4. Chạy backend

Mở một cửa sổ terminal mới:

```bash
cd backend
```

```bash
npm install
```

Tạo file cấu hình `.env` từ file mẫu (dùng Git Bash; nếu dùng PowerShell thì thay `cp` bằng `Copy-Item`):

```bash
cp .env.example .env
```

Tạo khóa bí mật cho phiên đăng nhập:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Mở file `backend/.env`, dán chuỗi vừa in ra vào sau `JWT_SECRET=`. Nếu MySQL có mật khẩu thì điền vào `DB_PASSWORD=`. Các dòng khác giữ nguyên.

Chạy backend:

```bash
npm run dev
```

Kiểm tra: mở http://localhost:3000/api/health, thấy `{"status":"ok"}` là được. Để cửa sổ này chạy, không tắt.

## 5. Chạy giao diện

Mở thêm một cửa sổ terminal nữa, từ thư mục `DoANCN_Pickelball`:

```bash
cd frontend
```

```bash
npm install
```

```bash
npm run dev
```

Mở http://localhost:5173.

## 6. Tài khoản mẫu

Mật khẩu chung: `12345678`.

| Vai trò | Email |
| --- | --- |
| Admin | admin@pickleball.vn |
| Quản lý cơ sở Quận 7 | manager.q7@pickleball.vn |
| Lễ tân Quận 7 | staff.q7@pickleball.vn |
| Khách hàng | customer1@gmail.com |

Đây là tài khoản dùng để thử trên máy. Không đưa web lên Internet với các tài khoản và mật khẩu này.

## 7. Chạy thử nhanh (khoảng 5 phút)

1. **Khách đặt sân:** đăng nhập `customer1@gmail.com`, vào **Đặt sân**, chọn ngày và các ô giờ trống, bấm đặt.
2. **Thanh toán:** chưa có khóa PayOS thì trang thanh toán chạy chế độ giả lập. Bấm **Giả lập chuyển khoản thành công**, đơn chuyển sang đã thanh toán và hiện vé có mã QR.
3. **Quản lý xếp ca:** đăng xuất, đăng nhập `manager.q7@pickleball.vn`, vào **Ca làm & chấm công**, xếp cho lễ tân một ca hôm nay đang diễn ra (chưa có mẫu ca hợp giờ thì tạo mẫu ca mới).
4. **Lễ tân vào ca:** đăng nhập `staff.q7@pickleball.vn`, vào **Chấm công**, bấm **Vào ca**. Chưa vào ca thì POS, check-in, bán dịch vụ đều bị khóa.
5. **Lễ tân check-in:** vào **Check-in QR**, nhập mã đơn, bấm **Xác nhận nhận sân**.
6. **Quản lý:** xem **Chiếu sáng thông minh** (kéo thanh trượt ánh sáng và mức hoạt động để xem đèn tự chỉnh).
7. **Admin:** đăng nhập `admin@pickleball.vn`, vào **Nhật ký hoạt động** xem lại các thao tác vừa rồi, vào **Dự báo doanh thu**, chọn nguồn **Mô phỏng để trình diễn** để xem biểu đồ dự báo (máy mới chưa có đủ lịch sử doanh thu thật). Admin chỉ giám sát nên không đặt sân, bán hàng hay check-in.

## 8. Phần tùy chọn

Không cần cho chạy thử, chỉ làm khi muốn dùng thật:

- **Thanh toán PayOS thật:** đăng ký tại my.payos.vn, điền `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` vào `backend/.env`.
- **Thiết bị IoT giả lập gửi số đo ánh sáng:** đặt `IOT_DEVICE_KEY` trong `backend/.env` (một chuỗi bất kỳ tự đặt), khởi động lại backend, rồi trong thư mục `backend` chạy `IOT_DEVICE_KEY=<chuỗi đã đặt> node scripts/iot-simulator.js http://localhost:3000/api 1,2,3`.
- **Đèn Yeelight thật:** xem [fuzzy-lighting.md](fuzzy-lighting.md).

## 9. Lỗi thường gặp

| Thông báo | Cách xử lý |
| --- | --- |
| `Thiếu JWT_SECRET` hoặc `JWT_SECRET phải là chuỗi ngẫu nhiên từ 32 ký tự` | Làm lại bước tạo khóa ở mục 4, dán vào `backend/.env` |
| `ECONNREFUSED 127.0.0.1:3306` | MySQL chưa bật: mở Laragon, bấm Start All |
| `ER_ACCESS_DENIED_ERROR` | Sai mật khẩu MySQL: sửa `DB_PASSWORD` trong `backend/.env` |
| `ER_BAD_DB_ERROR: Unknown database` | Chưa tạo CSDL: làm mục 3 |
| `EADDRINUSE :::3000` | Cổng 3000 đang bị chiếm: tắt chương trình đang dùng cổng, hoặc đổi `PORT` trong `.env` |
| `[LOI] Khong tim thay mysql.exe` | Laragon cài ở chỗ khác: thêm thư mục chứa `mysql.exe` vào biến PATH |
| Chữ tiếng Việt trong dữ liệu bị lỗi | Tạo CSDL bằng `scripts/init-db.sh`, không nhập file SQL bằng công cụ khác |
| Giao diện báo "Bạn thao tác quá nhanh" | Chờ 1 phút rồi thử lại |
| Giao diện mở được nhưng không đăng nhập được | Kiểm tra backend còn chạy; nếu đổi cổng giao diện thì thêm địa chỉ đó vào `CORS_ORIGINS` trong `backend/.env` |

## 10. Lưu ý bảo mật

- **Không commit, không gửi file `backend/.env`** cho người khác. File này đã nằm trong `.gitignore`.
- Mỗi máy tự tạo `JWT_SECRET` riêng. Backend không chạy nếu dùng chuỗi mẫu hoặc chuỗi ngắn.
- Khóa PayOS thật chỉ dán vào `.env` trên máy mình, không dán vào mã nguồn hay tin nhắn.
- Khi chưa có khóa PayOS, khóa ký thanh toán giả lập được sinh ngẫu nhiên mỗi lần chạy, nên không ai giả được tín hiệu thanh toán từ bên ngoài. Backend không cho chạy chế độ giả lập khi đặt `NODE_ENV=production`.
