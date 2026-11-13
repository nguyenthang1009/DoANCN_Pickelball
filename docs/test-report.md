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
| Đặt tại quầy, bán dịch vụ | 403 | Cơ sở mình, đang trong ca | Cơ sở mình, đang trong ca | 403 (chỉ giám sát) |
| Check-in QR | 403 | Cơ sở mình, đang trong ca | Cơ sở mình, đang trong ca | 403 (chỉ giám sát) |
| Hủy đơn đã thanh toán | Trước 24 giờ | 403 | Có (cần lý do) | Có |
| Xác nhận hoàn tiền | 403 | 403 | Cơ sở mình | Mọi cơ sở |
| Doanh thu ca | 403 | Ca của mình | Cả cơ sở | Toàn hệ thống |
| Dashboard doanh thu | 403 | 403 | Cơ sở mình (bỏ qua `venueId` khác) | Toàn chuỗi, so sánh cơ sở |
| Sân con, bảng giá, dịch vụ | 403 | 403 | Cơ sở mình | Mọi cơ sở |
| Cụm sân, tài khoản, khóa tài khoản | 403 | 403 | 403 | Có (không tự khóa mình) |
| Nhật ký hoạt động, cảnh báo bất thường | 403 | 403 | 403 | Có |

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

Chạy lại 12/11/2026: 129 kiểm tra đạt. Thêm 12 ca cho công tắc khấu trừ thuế TNCN (mặc định tắt theo góp ý của giảng viên):
- Tắt: không có thuế, thực nhận bằng tổng thu nhập trừ 10,5% bảo hiểm.
- Quản lý không bật được; công tắc chỉ nhận 0 hoặc 1.
- Admin bật từ 01/2027 thì kỳ 01/2027 có thuế đúng theo giảm trừ gia cảnh và biểu thuế; kỳ 11/2026 đã chốt giữ nguyên.

Tham số pháp lý đã đối chiếu văn bản hiện hành (căn cứ ghi trong `database/seed.sql`). Còn thiếu: khoản thêm 20% khi làm thêm giờ vào ban đêm (Điều 57 Nghị định 145/2020/NĐ-CP).

Lỗi phát hiện và đã sửa:

| Lỗi | Phát hiện bởi | Cách sửa |
| --- | --- | --- |
| Phép trừ trên cột `BIGINT UNSIGNED` tràn khi có hóa đơn điều chỉnh giảm | `finance-test.js` | Đổi `debit`, `credit` sang số có dấu, kèm ràng buộc không âm |
| Lọc tài chính theo một cơ sở hiện doanh thu 0đ do sai thứ tự tham số SQL | Xem giao diện thật, test chưa phủ | Sửa thứ tự, thêm ca: cộng từng cơ sở phải bằng toàn chuỗi |
| Đơn tiền về trễ đã hoàn bị báo thiếu hóa đơn | `finance-test.js` | Loại trừ đúng trường hợp không phát sinh doanh thu |
| Admin không đổi được vai trò sang Lễ tân vì thiếu quyền `payroll.view_own` | `security-test.js` | Cấp quyền đó cho Admin |

## 7. Chiếu sáng thông minh

Ngày chạy: 11/11/2026. `scripts/lighting-test.js` gồm 54 kiểm tra; script so sánh với scikit-fuzzy chạy riêng.

| Phạm vi | Kết quả |
| --- | --- |
| Suy luận: các mức trong bảng thiết kế, trọng tâm tính tay 93, ví dụ hai luật cùng kích hoạt | Đạt |
| Không có lỗ hổng luật trên lưới, tính đơn điệu theo ánh sáng và theo hoạt động | Đạt |
| So với scikit-fuzzy 0.5.0 trên 2.583 điểm | Lệch 0 |
| Trạng thái theo lịch đặt: chưa tới giờ, cửa sổ check-in, trong giờ, hết giờ, bảo trì, đơn chưa thanh toán | Đạt |
| Phân quyền, khóa thiết bị, kiểm tra dữ liệu, chặn IP ngoài mạng nội bộ, chế độ thủ công | Đạt |
| Giao thức Yeelight với đèn giả lập: thứ tự lệnh, độ sáng, nháy cảnh báo, không gửi lặp, tắt hẳn, đèn mất kết nối | Đạt |
| Ước tính điện năng với số liệu tính tay | Đạt |
| Cảnh báo realtime tới lễ tân, giao diện ở 1440 px và 390 px | Đạt khi thử thật |

Lỗi phát hiện và đã sửa:

| Lỗi | Phát hiện bởi | Cách sửa |
| --- | --- | --- |
| Trọng tâm lệch tới 0,16 điểm % so với scikit-fuzzy | So sánh với scikit-fuzzy | Tích phân theo hình thang thay cho cộng hình chữ nhật |
| Điện tiết kiệm trong ngày hiện 0,00 kWh khi chưa đủ 10 Wh | Xem giao diện thật | Tính tới 1 Wh, dưới 1 kWh hiện bằng Wh |
| Lệnh xuống đèn bị gửi hai lần, nhật ký ghi trùng | `lighting-test.js` khi chạy cả bộ | Vòng điều khiển định kỳ và thao tác trên màn hình cùng tính lại một cơ sở. Nay mỗi cơ sở chỉ tính một lần tại một thời điểm. Thử lại với 10 yêu cầu cùng lúc và vòng điều khiển 1 giây: đèn nhận đúng một lượt lệnh; chạy bộ kiểm thử 3 lần liền đều 51/51 |
| Mở trang chiếu sáng khoảng một phút thì bị đẩy ra trang đăng nhập, đăng nhập lại báo "thao tác quá nhanh" | Người dùng thử thật | Đọc danh sách đèn cũng phát sự kiện "đèn đã đổi", trang nhận được lại đọc tiếp nên thành vòng lặp vô hạn, vượt 600 request/phút. Đồng thời làm mới phiên bị chặn 429 bị hiểu nhầm là phiên hết hạn. Sửa: chỉ phát khi thật sự có thay đổi hoặc vừa có thao tác ghi; trang gom thông báo trong 1,5 giây; 429 hay mất mạng không đăng xuất; số đo cảm biến có giới hạn riêng. Thêm 3 kiểm tra; đo lại trên trình duyệt: 16 request trong 40 giây |

Thử với đèn thật ngày 12/11/2026: bóng Yeelight đời `color4`, bật LAN Control trong app Yeelight.

| Bước | Kết quả |
| --- | --- |
| Tìm đèn trong mạng (`yeelight-check.js`, nút "Tìm đèn trong mạng") | Tìm thấy, đọc được IP, đời máy, trạng thái |
| Bật 10%, 50%, 100%, nháy cảnh báo, trả về trạng thái cũ | Đạt; đèn trả lời trong 100–175 ms |
| 7 tình huống Fuzzy đẩy xuống đèn (93%, 50%, 60%, tắt, 25%, 15% kèm nháy, tắt) | Đạt 7/7 |
| Gán đèn cho Sân 01 trên web, đặt mức hoạt động 6 khi không có đơn | Đèn thật sáng 15% và nháy, đọc lại từ đèn đúng 15% |

Lỗi phát hiện và đã sửa: một lần đèn trả lời chậm quá 1,5 giây ngay sau khi nháy cảnh báo (Wi-Fi chập chờn), lệnh bị báo lỗi. Sửa: chờ tối đa 3 giây và tự gửi lại một lần; đèn từ chối lệnh thì không gửi lại. Chạy lại 7/7 tình huống đạt, bộ kiểm thử chiếu sáng 54/54.

Lỗi người dùng gặp khi thử: kéo thanh trượt thì đèn tắt bật liên tục rồi mất kết nối. Nguyên nhân: cùng một bóng được gán cho Sân 01 (không có đơn, Fuzzy bảo tắt) và Sân 02 (có khách, Fuzzy bảo sáng 93%); mỗi lần tính lại, hai sân gửi lệnh ngược nhau, bóng bị dồn lệnh quá giới hạn và từ chối. Sửa: một bóng chỉ gán cho một sân (kiểm tra ở máy chủ và ràng buộc duy nhất trong CSDL); nháy cảnh báo tối đa một lần mỗi 30 giây; báo rõ khi bóng từ chối vì quá nhiều lệnh. Thử lại trên đèn thật: kéo thanh mức hoạt động 12 lần trong 4 giây, đèn vẫn giữ kết nối, dừng ở 15% đúng mức; kéo ánh sáng lên 800 lux thì đèn tắt; gán bóng cho sân thứ hai bị chặn. Bộ kiểm thử chiếu sáng 55/55.

Chưa thử cảm biến ánh sáng BH1750 và camera; ánh sáng môi trường và mức hoạt động vẫn lấy từ thanh trượt hoặc script giả lập thiết bị IoT.

## 8. Ca làm, chấm công, lương theo hình thức

Ngày chạy: 12/11/2026. `scripts/shift-test.js` gồm 78 kiểm tra, số mong đợi tính tay theo Bộ luật Lao động 2019, Nghị định 145/2020/NĐ-CP, Nghị định 293/2025/NĐ-CP.

| Phạm vi | Kết quả |
| --- | --- |
| Bảng công: 8 giờ thường một ngày, phần vượt là làm thêm; ca qua nửa đêm; hai lượt trong một ngày cộng dồn | Đạt |
| Ngày nghỉ hằng tuần, ngày lễ, lễ trùng Chủ nhật thì nghỉ bù (Giỗ Tổ 26/4/2026 nghỉ bù 27/4) | Đạt |
| Làm thêm ban đêm 200%, 210% (đã làm thêm ban ngày), 270% (ngày nghỉ), 390% (ngày lễ); làm đêm giờ thường 130% | Đạt, khớp mức nêu trong hướng dẫn Điều 57 Nghị định 145/2020 |
| Lương tháng, ngày, giờ, ca; ngày lễ hưởng lương; lương tháng không vượt mức hợp đồng | Đạt |
| Lương tối thiểu giờ: 25.000đ/giờ và ca 200.000đ/8 giờ bị từ chối ở vùng I (25.500đ) | Đạt |
| Xếp ca: chặn trùng giờ, ca liền nhau không bị coi là trùng, chỉ xếp cho nhân sự đang làm | Đạt |
| Vào ca tự gắn ca trong lịch; bấm 10 lần cùng lúc chỉ ghi 1 lượt; ra ca khi chưa vào bị chặn | Đạt |
| Phân quyền: lễ tân không xem lịch xếp ca, không xem ai đang trong ca, không sửa chấm công; quản lý không tự sửa chấm công của mình; chỉ Admin sửa ngày lễ | Đạt |
| Bảng lương lấy từ chấm công: lương giờ 30.000đ, 16 giờ thường, 3 giờ làm thêm đêm, 4 giờ Chủ nhật ra 900.000đ đúng tính tay | Đạt |
| Sửa chấm công rồi tính lại; tháng đã duyệt lương thì khóa chấm công | Đạt |
| Giao diện ở 1280 px và 375 px, không tràn ngang | Đạt khi thử thật |

Lỗi phát hiện và đã sửa:

| Lỗi | Phát hiện bởi | Cách sửa |
| --- | --- | --- |
| Admin không cấp được quyền tự chấm công cho vai trò khác vì chính Admin không có quyền này | `security-test.js` | Cấp quyền cho Admin, ẩn mục Chấm công với Admin vì Admin không thuộc cơ sở nào |
| Trang Chấm công tràn ngang trên điện thoại do bảng chấm công kéo rộng cột lưới | Xem giao diện thật ở 375 px | Cột lưới dùng `minmax(0, 1fr)` |

Thêm 5 kiểm tra cảnh báo giới hạn làm thêm (Điều 107 BLLĐ 2019): 7 ngày làm 6h-20h thì cảnh báo 7 ngày quá 4 giờ và 42 giờ trong tháng quá 40 giờ; cộng dồn năm 50 giờ chưa quá 200 giờ; tiền làm thêm vẫn trả đủ. Tổng 83 kiểm tra.

Chưa làm: tiền lương ngày lễ cho người làm theo giờ, theo ca (luật chưa có công thức chung, cần thỏa thuận trong hợp đồng).

## 9. Dự báo doanh thu

Ngày chạy: 12/11/2026. `scripts/forecast-test.js` gồm 30 kiểm tra; đối chiếu statsmodels chạy riêng.

| Phạm vi | Kết quả |
| --- | --- |
| Chuỗi lặp theo tuần: giá trị khớp và dự báo 21 ngày trùng giá trị thật | Đạt |
| Chuỗi có xu hướng: sau 10 tuần dự báo lệch dưới 1%; xu hướng giảm dần đúng công thức | Đạt |
| Doanh thu không đổi: dự báo giữ nguyên, khoảng dự báo bằng 0; dưới 4 tuần thì không dự báo | Đạt |
| MAE, RMSE, MAPE, MASE, naive theo mùa với số tính tay | Đạt |
| Chuỗi có xu hướng và mùa vụ: Holt-Winters thắng naive theo mùa | Đạt |
| Độ phủ khoảng 80% trên 280 ngày kiểm tra nằm trong 70-90% | Đạt |
| Chỉ Admin xem được; số ngày dự báo ngoài 7-90 bị từ chối | Đạt |
| Đọc 56 ngày doanh thu từ sổ cái, tổng 30 ngày khớp sổ cái, lọc theo cơ sở | Đạt |
| Đối chiếu ETSModel (statsmodels 0.15.0), 3 bộ tham số | Lệch 0,000000đ |
| Giao diện ở 1280 px và 375 px | Đạt khi thử thật |

Lỗi phát hiện và đã sửa:

| Lỗi | Phát hiện bởi | Cách sửa |
| --- | --- | --- |
| Lớp ExponentialSmoothing của statsmodels lệch ở ngày dự báo thứ 7, 14, 21, 28 | Đối chiếu statsmodels | Không phải lỗi của hệ thống: thư viện lấy mùa vụ chu kỳ trước. Đối chiếu thêm với ETSModel theo đúng công thức FPP3 thì trùng khớp, dùng ETSModel làm mốc |
| Bảng đánh giá mô hình xuống dòng giữa số và đơn vị | Xem giao diện thật | Giữ số trên một dòng |

## 10. Kiểm soát thao tác nhân sự, ca trực, nhật ký hoạt động

`scripts/operations-test.js`: 47 kiểm tra, đạt hết. Chạy lại toàn bộ trên CSDL vừa khởi tạo: Postman 28 + 66 + 86 assertion, race 2 vòng, payment 20, security 63, finance 130, lighting 55, shift 85, forecast 30, operations 47, đạt hết. Collection `booking-pos` chạy sau `scripts/setup-duty.js` (cho lễ tân, quản lý vào ca).

| Kịch bản | Kỳ vọng | Kết quả |
| --- | --- | --- |
| Admin đặt sân tại quầy | `403 ADMIN_NO_FRONTLINE` | Đạt |
| Admin bán dịch vụ, check-in, vào ca | `403 FORBIDDEN` | Đạt |
| Admin cấp quyền đặt tại quầy, check-in cho vai trò nhân sự mới | Tạo được | Đạt |
| Lễ tân chưa vào ca đặt tại quầy, bán dịch vụ, check-in | `403 NOT_ON_DUTY` | Đạt |
| Khách đặt online, thanh toán | Không bị ảnh hưởng | Đạt |
| Vào ca khi chưa được xếp ca | `409 NO_ASSIGNED_SHIFT` | Đạt |
| Vào ca khi ca được xếp là ngày mai | `409`, thông báo tên ca và giờ ca tới | Đạt |
| Ca vừa hết giờ, chưa ra ca, đặt tại quầy | `403 NOT_ON_DUTY` | Đạt |
| Ra ca muộn | Giờ ra ca ghi đúng giờ hết ca | Đạt |
| Quên ra ca | Tác vụ nền tự kết thúc tại giờ hết ca, đánh dấu `auto_closed` | Đạt |
| Vào ca sớm 14 phút | Giờ công tính từ giờ bắt đầu ca | Đạt |
| Nhật ký ghi đăng nhập (cả sai), vào/ra ca, tự kết thúc ca, đặt tại quầy, bán hàng | Có đủ, có người thực hiện và mã đơn | Đạt |
| Lọc nhật ký theo nhân sự, tìm theo mã đơn; quản lý xem nhật ký | Lọc đúng; quản lý `403` | Đạt |
| Sửa hoặc xóa `audit_logs` trực tiếp trong MySQL | Trigger chặn | Đạt |
| Lễ tân đặt tại quầy cho số điện thoại của chính mình | Cảnh báo mức cao `STAFF_PHONE` | Đạt |
| Đơn tại quầy đã thu tiền mặt bị hủy | Cảnh báo `POS_CANCELLED` | Đạt |
| Ảnh món: lễ tân đổi ảnh; file SVG đổi đuôi PNG | `403`; `415 UNSUPPORTED_IMAGE` | Đạt |
| Quản lý thêm ảnh, màn bán hàng nhận ảnh, gỡ ảnh | Đúng | Đạt |
| Admin sửa nhân sự; SĐT sai; chuyển cơ sở khi đang trong ca; quản lý sửa | Lưu được; `400`; `409 USER_ON_DUTY`; `403` | Đạt |
| Đặt lại mật khẩu | Mật khẩu cũ hết hiệu lực, đăng nhập bằng mật khẩu tạm phải đổi ngay | Đạt |
| Xóa bảng lương nháp; bảng đã duyệt; lễ tân xóa | Xóa được; `409 PAYROLL_LOCKED`; `403` | Đạt |
| Giao diện: lễ tân chưa vào ca, đang trong ca; Admin mở POS; nhật ký, cảnh báo; sửa nhân sự; ảnh món | Thẻ "Chưa vào ca trực", thanh "Đang trong ca", thẻ "Không có quyền truy cập", ảnh hiện ở màn bán hàng, không lỗi console | Đạt khi thử thật |

Lỗi phát hiện và đã sửa:

| Lỗi | Phát hiện bởi | Cách sửa |
| --- | --- | --- |
| Ca bị dời giờ sau khi nhân viên đã vào ca làm giờ hết ca rơi trước giờ vào: ra ca báo "Vừa vào ca" mãi, tác vụ tự kết thúc ca vi phạm ràng buộc `chk_attendance_times` | `operations-test.js` | Lượt đó được đóng ngay sau giờ vào ca (không tính công) thay vì kẹt lượt mở |
| Nhật ký đổi ảnh món hiện `SERVICE #3` | Xem giao diện thật | Hiện tên món |

### Bảo vệ khách đang chơi khi xóa, sửa

Thêm vào `operations-test.js` (tổng 63 kiểm tra) và `security-test.js` (tổng 65), đạt hết. Chạy lại toàn bộ: Postman 28 + 66 + 86, race 2 vòng, payment 16 (bỏ qua bước nhận sân thật vì chạy sau 21 giờ không còn khung trống trong 30 phút tới, phụ thuộc giờ chạy), security 65, finance 130, lighting 55, shift 85, forecast 30, operations 63.

| Kịch bản | Kỳ vọng | Kết quả |
| --- | --- | --- |
| Đặt bảo trì hoặc ngừng sân khi khách đang chơi | `409 COURT_IN_USE`, đơn của khách giữ nguyên `PAID` | Đạt |
| Xem trước bảo trì khi khách đang chơi | Trả `playing` (mã đơn, giờ kết thúc); đơn đang chơi không nằm trong danh sách hủy, đổi sân | Đạt |
| Hủy, đổi sân đơn đã tới giờ chơi | `409 BOOKING_STARTED` | Đạt |
| Chỉnh đèn tay 0% khi khách đang chơi | Đèn giữ mức Fuzzy, `manualLimited = true`; chỉnh 100% vẫn được | Đạt |
| Tạm ngừng cơ sở còn đơn sắp tới | `409 VENUE_HAS_BOOKINGS` | Đạt |
| Đổi giờ mở cửa làm đơn đã đặt nằm ngoài giờ | `409 BOOKINGS_OUTSIDE_HOURS` | Đạt |
| Xóa một khung giá (gộp vào khung liền trước) | Lưu được, bớt một khung | Đạt |
| Xóa khung để hở giờ | `400 INVALID_PRICE_RULES` | Đạt |
| Đổi bảng giá khi đã có đơn | Đơn giữ nguyên `price_snapshot`; API trả `keptSlots` | Đạt |
| Đổi vai trò người đang trong ca | `409 USER_ON_DUTY` | Đạt |
| Khóa tài khoản đang trong ca | Lượt chấm công kết thúc ngay | Đạt |
| Vai trò vừa bị gỡ quyền chấm công bấm ra ca | Ra ca được | Đạt |
| Giao diện: xóa khung giá, hộp bảo trì khi sân có khách, đơn đã tới giờ ở Đơn trong ngày | Hộp xác nhận ghi khung trước và sau khi gộp; nút bảo trì khóa kèm giờ khách chơi xong; thay nút Hủy bằng "Đã tới giờ chơi" | Đạt khi thử thật |

Lỗi phát hiện và đã sửa:

| Lỗi | Phát hiện bởi | Cách sửa |
| --- | --- | --- |
| Đặt bảo trì khi đơn đang chơi dở: các ô còn lại khớp điều kiện "sắp tới" nên cả đơn bị hủy, chuyển chờ hoàn tiền, đèn có thể tắt khi khách đang chơi | Rà soát nghiệp vụ | Chặn đóng sân khi có khách đang chơi; danh sách đơn bị ảnh hưởng bỏ đơn đã tới giờ |
| Quản lý hủy được đơn đã thanh toán sau giờ bắt đầu chơi | Rà soát nghiệp vụ | Chỉ hủy trước giờ chơi |
| Chế độ đèn thủ công 0% tắt đèn sân đang có khách | Rà soát nghiệp vụ | Đang có khách thì không giảm dưới mức Fuzzy |
| Tạm ngừng cơ sở, đổi giờ mở cửa không kiểm tra đơn đã đặt | Rà soát nghiệp vụ | Chặn khi còn đơn bị ảnh hưởng |
| Admin gỡ quyền chấm công của vai trò khi người đó đang trong ca: người đó không ra ca được (403) | `security-test.js` | Ra ca chỉ cần đang có lượt mở |
| Nút ✕ xóa khung giá chỉ bỏ dòng, để hở giờ nên lưu bị lỗi; nút "Thêm khung giờ" tạo khung trùng cả ngày; hộp lưu giá dùng `confirm` của trình duyệt; dòng khung giá tràn khỏi thẻ khi ô giờ hiện AM/PM | Thử giao diện | Xóa thì gộp vào khung bên cạnh, thêm thì chia đôi khung dài nhất, dùng hộp xác nhận của hệ thống, dòng tự xuống hàng |

## 11. Chưa kiểm thử được

- **PayOS thật**: chưa có `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`. Cách ký chữ ký làm theo SDK chính thức của payOS; cần chạy thử với tài khoản PayOS sandbox trước khi demo.
- **Quét QR bằng camera**: trình duyệt kiểm thử không có camera; đã kiểm luồng nhập mã tay và API quét QR (`/checkin/lookup` với chuỗi QR).
- **Giao diện điện thoại**: trang chủ đã kiểm ở 375 px; các trang khách còn lại co được và ma trận cuộn ngang, nhưng chưa rà riêng từng màn. Modal bảo trì và màn Phân quyền chưa kiểm ở khổ nhỏ.
- **Email gửi vé**: chưa làm, vé hiển thị trên trang "Lịch đặt của tôi".
- **Hóa đơn điện tử thật**: chưa kết nối nhà cung cấp, chưa có mã của cơ quan thuế.
- **Số liệu lớn**: đối soát chạy trên dữ liệu thử nhỏ, chưa thử với hàng chục nghìn hóa đơn.
- **HTTPS và cookie `Secure`**: máy phát triển chạy HTTP nên chưa chạy thử với `NODE_ENV=production`.
