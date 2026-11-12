# Đề xuất mở rộng nghiệp vụ và hoàn thiện giao diện

Tài liệu này gồm ba phần: khoảng cách giữa giao diện hiện tại và đặc tả UI/UX, các phân hệ nên bổ sung để hệ thống tiến gần một ERP thu nhỏ cho chuỗi sân Pickleball, và thứ tự triển khai đề xuất. Đã làm xong: trang chủ giới thiệu, Đợt 1, hóa đơn và VAT, sổ cái kế toán kép, tiền lương theo 4 hình thức (tháng, ngày, giờ, ca), xếp ca và chấm công vào ra ca, quản lý ảnh. Đã làm thêm chiếu sáng thông minh bằng Fuzzy Logic (xem [fuzzy-lighting.md](fuzzy-lighting.md)). Đã làm dự báo doanh thu cho Admin bằng Holt-Winters (xem [du-bao-doanh-thu.md](du-bao-doanh-thu.md)). Chưa làm: kho và cho thuê, sổ chi phí, AI agent.

Hệ thống hiện có sẵn nền tốt để mở rộng: 13 bảng CSDL, `system_configs` cho tham số, `audit_logs` cho nhật ký, phân quyền theo cơ sở (BR15).

## 1. Giao diện so với 8 màn hình đặc tả

Đối chiếu trên code của nhánh `feature/week9-pos-dashboard`. Các mục mức Cao đã xử lý trong Đợt 1, trừ phần `ServiceTile` chờ phân hệ kho.

| Màn hình | Đã có | Còn thiếu so với đặc tả | Mức |
| --- | --- | --- | --- |
| Ma trận chọn sân | Lịch 30 phút, chọn ô, thanh tóm tắt, realtime, icon từng trạng thái | Không thiếu mục lớn nào (đã xong Đợt 1) | Xong |
| Thanh toán VietQR | Đếm ngược, QR, tự chuyển trang khi nhận tiền | Không thiếu mục lớn nào | Thấp |
| Vé điện tử | QR, chi tiết đơn, badge, mốc giờ đọc từ cấu hình | Thiếu nút Tải vé PDF; nút Hủy đơn chỉ ở trang Lịch đặt | Trung bình |
| Lịch đặt của tôi | Danh sách đơn, thanh toán, hủy; ẩn nút Hủy khi quá hạn (BR11) | Không thiếu mục lớn nào (đã xong Đợt 1) | Xong |
| POS lễ tân | Ma trận thu nhỏ có icon, dấu tích ô đã check-in, giỏ hàng, tiền mặt, VietQR | `ServiceTile` chưa có ảnh và tồn kho, làm cùng phân hệ kho | Đợt 2 |
| Check-in QR | Quét camera, nhập mã đơn | Chưa tra cứu được theo số điện thoại | Trung bình |
| Quản lý sân, bảo trì | Bảng sân, modal bảo trì liệt kê đơn bị ảnh hưởng, gợi ý sân trống, đổi sân (BR17) | Không thiếu mục lớn nào (đã xong Đợt 1) | Xong |
| Cấu hình bảng giá | Sửa giá theo khung giờ | Chưa áp dụng cho nhiều sân cùng lúc; chưa có thanh kiểm tra độ phủ; lỗi chưa báo tại đúng dòng (BR07) | Trung bình |
| Dashboard | Doanh thu, lấp đầy, giờ cao điểm, so sánh cơ sở | Chưa tách thẻ tiền mặt và PayOS; chưa có biểu đồ nhiệt theo khung giờ | Trung bình |
| Khung chung | Thanh bên 240px, thẻ, bảng, Modal, thông báo và hộp xác nhận dùng chung | Khu nội bộ chưa co giãn trên màn hình nhỏ | Trung bình |

## 2. Nguyên tắc chung

1. **Không viết cứng số liệu nghiệp vụ.** Mọi tỷ lệ, mức lương, giới hạn nằm trong bảng cấu hình và có người sửa, thời điểm sửa.
2. **Tham số pháp lý có ngày hiệu lực.** Khi luật đổi, thêm dòng mới, không sửa dòng cũ, để tính lại kỳ cũ vẫn đúng.
3. **Chốt số liệu tại thời điểm phát sinh.** Bảng lương, hóa đơn lưu bản sao giá trị như `price_snapshot` đang làm.
4. **Quyền kiểm tra ở backend.** Giao diện chỉ ẩn nút cho dễ dùng, không phải lớp bảo vệ.
5. **Thao tác nhạy cảm đều ghi `audit_logs`.**

## 3. Phân hệ đề xuất

### 3.1. Kho và dịch vụ

Phân hệ này giải quyết luôn phần `ServiceTile` thiếu ảnh và tồn kho.

- Danh mục dịch vụ mở rộng: ảnh, đơn vị, nhóm, combo (ví dụ sân kèm thuê vợt và nước).
- **Cho thuê có vòng đời riêng:** giao vợt, nhận lại, tính phí trễ, ghi nhận hỏng hoặc mất, đặt cọc đồ thuê. Đây là điểm khác với bán đứt.
- Tồn kho theo từng cơ sở: phiếu nhập, xuất bán tự trừ kho, kiểm kê, cảnh báo sắp hết, điều chuyển giữa cơ sở, nhà cung cấp.
- Bảng dự kiến: `service_categories`, `suppliers`, `stock_movements`, `stock_counts`, `rental_assets`, `rental_orders`.

### 3.2. Nhân sự, ca trực và chấm công

- Hồ sơ nhân viên, hợp đồng, vị trí, cơ sở làm việc.
- Xếp ca theo tuần, đổi ca có duyệt, nghỉ phép, quên chấm công có duyệt.
- **Chấm công bằng QR động:** màn hình quầy hiện mã đổi sau vài chục giây, nhân viên quét bằng tài khoản của mình. Có thể thêm giới hạn IP mạng cơ sở để chống chấm hộ.
- **Bảng "Ai đang trong ca":** Admin và Manager xem theo thời gian thực qua Socket.io ai đang làm, đi trễ, vắng, ra vào lúc nào.
- **Mở và đóng ca thu ngân:** lễ tân nhập tiền đầu ca, cuối ca đếm tiền, hệ thống đối chiếu với doanh thu ca và ghi chênh lệch. Phần này nối trực tiếp với BR14.
- Bảng dự kiến: `employee_profiles`, `contracts`, `shifts`, `shift_assignments`, `attendance_logs`, `attendance_requests`, `leave_requests`, `cash_sessions`.

### 3.3. Tiền lương theo tham số pháp lý

Doanh nghiệp tư nhân không bắt buộc dùng hệ số lương như khu vực nhà nước, nên hệ số nên là cấu hình nội bộ theo vị trí, cộng phụ cấp và thưởng.

Bảng `payroll_parameters` (mã tham số, vùng, giá trị, ngày hiệu lực từ, đến, căn cứ pháp lý) lưu các giá trị dưới đây, đã đối chiếu với văn bản hiện hành vào tháng 11/2026. Chỉ Admin (quyền `legal.manage`) thêm được phiên bản mới khi luật đổi; số cũ giữ nguyên để kỳ trước vẫn tính đúng.

| Tham số | Giá trị | Căn cứ |
| --- | --- | --- |
| Lương tối thiểu vùng I | 5.310.000đ/tháng, 25.500đ/giờ | Nghị định 293/2025/NĐ-CP, từ 01/01/2026. Áp dụng theo địa bàn từng cơ sở. Các vùng II, III, IV có mức riêng |
| Người lao động đóng | BHXH 8%, BHYT 1,5%, BHTN 1%, tổng 10,5% | Các nguồn thống nhất |
| Doanh nghiệp đóng | BHXH 17,5%, BHYT 3%, BHTN 1%, tổng 21,5% | Các nguồn thống nhất |
| Trần lương đóng BHXH, BHYT | 46.800.000đ đến 30/06/2026; 50.600.000đ từ 01/07/2026 | 20 lần mức tham chiếu (Luật BHXH 2024). Lương cơ sở 2.530.000đ từ 01/07/2026 theo Nghị định 161/2026/NĐ-CP |
| Trần lương đóng BHTN | 20 lần lương tối thiểu vùng | Luật Việc làm 74/2025/QH15, từ 01/01/2026. Khác trần BHXH |
| Giảm trừ gia cảnh | Bản thân 15.500.000đ, người phụ thuộc 6.200.000đ/tháng | Nghị quyết 110/2025/UBTVQH15. Chỉ dùng khi bật khấu trừ thuế TNCN |
| Thuế TNCN lũy tiến | 5 bậc: 5%, 10%, 20%, 30%, 35%; ngưỡng tháng 10, 30, 60, 100 triệu | Luật Thuế TNCN 109/2025/QH15. Theo góp ý của giảng viên, đồ án tạm chưa khấu trừ: tham số `PIT_WITHHOLDING` = 0, Admin bật lại được |
| Làm thêm giờ, làm đêm | 150%, 200%, 300%; ban đêm thêm 30% | Điều 98 Bộ luật Lao động 2019, Điều 55, 56 Nghị định 145/2020/NĐ-CP. Làm thêm ban đêm thêm 20% lương giờ ban ngày (Điều 57): 200%, 210%, 270%, 390%. Tách từ giờ vào ra ca thực tế |

Quy trình: chốt công, tính lương nháp, Manager rà soát, Admin duyệt và khóa kỳ, phát phiếu lương. Kỳ đã khóa không sửa được, chỉ tạo điều chỉnh ở kỳ sau.

Bảng dự kiến: `payroll_parameters`, `salary_grades`, `payroll_periods`, `payslips`, `payslip_lines`.

### 3.4. Phân quyền linh hoạt có kiểm soát

Đã làm trong Đợt 1, trừ hai dòng ghi chú "chưa làm" ở bảng chốt chặn. Quyền theo mã chức năng:

- Bảng `permissions` (ví dụ `booking.refund`), `roles`, `role_permissions`. `users.role` giữ cấp phạm vi dữ liệu, `users.custom_role_id` trỏ tới vai trò tự tạo.
- Admin tạo được vai trò mới như Kế toán, Thu ngân, Kho trên giao diện dạng ma trận.
- Middleware là `can('booking.refund')`, vẫn giữ kiểm tra cơ sở `authorizeVenue`.

Các chốt chặn để linh hoạt mà không mất kiểm soát:

| Quy tắc | Lý do |
| --- | --- |
| Chỉ được cấp quyền mình đang có | Chặn leo thang đặc quyền |
| Không tự sửa quyền của chính mình | Chặn tự nâng quyền |
| Vai trò Admin gốc không xóa được, luôn còn ít nhất một Admin | Tránh khóa hệ thống |
| Người tạo không tự duyệt: hoàn tiền, duyệt lương, điều chỉnh kho (chưa làm, cần khi có phân hệ lương và kho) | Tách nhiệm vụ, giảm gian lận |
| Quyền xem lương và hồ sơ nhân sự tách riêng khỏi quyền quản lý vận hành (chưa làm, cần khi có phân hệ nhân sự) | Dữ liệu nhạy cảm chỉ người cần mới thấy |
| Mọi thay đổi quyền ghi `audit_logs` | Truy vết được |

### 3.5. Khách hàng và tăng doanh thu

- Đặt sân định kỳ (cố định khung giờ hằng tuần), rất phổ biến với nhóm chơi quen.
- Gói giờ trả trước, mã giảm giá, chương trình thành viên tích điểm.
- Danh sách chờ: khi ô bị hủy, tự báo cho người đang chờ.
- Đánh giá sau buổi chơi, chỉ khách đã check-in mới được đánh giá, để trang chủ có phản hồi thật.
- Thông báo email khi đặt thành công, nhắc giờ chơi, hoàn tiền.
- Quên mật khẩu (US-C03): CSDL đã có cột nhưng chưa có chức năng.

### 3.6. Tài chính và báo cáo Admin

- Sổ thu chi theo cơ sở: chi phí điện, mặt bằng, lương, nhập hàng.
- Lãi lỗ theo cơ sở và toàn chuỗi; đối soát PayOS theo ngày.
- Dashboard Admin chia theo từng khâu: đặt sân, thanh toán, check-in, dịch vụ, kho, nhân sự, tiền lương.
- Biểu đồ nhiệt lấp đầy, tỷ lệ không đến, tỷ lệ hủy, doanh thu trên mỗi sân mỗi giờ, khách quay lại.
- Xuất Excel, PDF.

### 3.7. AI cho Admin

Chỉ dùng dữ liệu tổng hợp theo ngày và khung giờ, không đưa dữ liệu cá nhân vào mô hình.

| Bài toán | Thuật toán đề xuất | Đầu ra |
| --- | --- | --- |
| Dự báo doanh thu 14–30 ngày | Holt-Winters theo chu kỳ 7 ngày làm mốc chuẩn; so với SARIMA hoặc Prophet | Đường dự báo kèm khoảng tin cậy |
| Dự báo lấp đầy theo khung giờ | Gradient Boosting với đặc trưng thứ, giờ, ngày lễ, giá | Khung giờ dự kiến kín hoặc vắng |
| Phát hiện bất thường | Z-score hoặc Isolation Forest | Cảnh báo ca lệch tiền, hoàn tiền bất thường |
| Rủi ro không đến | Hồi quy logistic | Gợi ý nhắc khách, không tự động xử phạt |
| Gợi ý giá giờ thấp điểm | Quy tắc dựa trên dự báo lấp đầy | Đề xuất để Manager tự quyết |

Hai điều cần trung thực khi bảo vệ đồ án:

- Dự báo cần tối thiểu 8–12 tuần dữ liệu. Hệ thống mới không có, nên phải sinh dữ liệu mô phỏng và ghi rõ đây là dữ liệu mô phỏng.
- Phải đo sai số bằng kiểm thử quá khứ (MAPE, RMSE) và so với cách dự báo đơn giản. Nếu mô hình không tốt hơn thì báo cáo đúng như vậy.

### 3.8. Bảo mật

| Hạng mục | Hiện tại | Đề xuất |
| --- | --- | --- |
| Mã hóa đường truyền | HTTP khi chạy máy cá nhân | HTTPS TLS 1.2+ qua Nginx, bật HSTS khi triển khai |
| Header bảo mật | Đã có `helmet` cho API (Đợt 1) | Thêm Content Security Policy cho trang frontend khi triển khai |
| CORS | Đã giới hạn theo `CORS_ORIGINS`, chặn request ghi từ nguồn lạ (Đợt 1) | Giữ nguyên |
| Chống dò mật khẩu | Đã giới hạn đăng nhập sai theo IP + tài khoản (Đợt 1) | Dùng Redis nếu chạy nhiều tiến trình |
| Lưu phiên | Đã dùng cookie `httpOnly`, `SameSite`, refresh token xoay vòng (Đợt 1) | Bật `Secure` khi có HTTPS |
| Xác thực hai lớp | Chưa có | TOTP bắt buộc cho Admin và người xem lương |
| Dữ liệu nhạy cảm khi lưu | Chưa có loại dữ liệu này | Mã hóa cột AES-256-GCM cho CCCD, số tài khoản, lương; khóa để ngoài CSDL |
| Mật khẩu | Băm bcrypt | Giữ nguyên. Mật khẩu phải băm, không mã hóa hai chiều |
| Webhook, QR | Chữ ký HMAC | Giữ nguyên |
| Dữ liệu cá nhân | Chưa có quy trình | Thông báo mục đích, xin đồng ý, cho sửa và xóa, che bớt dữ liệu khi hiển thị và trong log, theo Luật 91/2025/QH15 và Nghị định 356/2025/NĐ-CP |
| Sao lưu | Chưa có | Sao lưu mã hóa định kỳ, diễn tập khôi phục |

Nếu đưa lên mạng, cần đổi toàn bộ khóa đang dùng khi phát triển.

## 4. Thứ tự triển khai đề xuất

Tổng khối lượng trên lớn hơn nhiều so với kế hoạch ban đầu, nên cần chia theo mức ưu tiên thay vì làm tất cả cùng lúc.

| Đợt | Nội dung | Lý do |
| --- | --- | --- |
| 1 (xong) | Sửa các mục mức Cao ở phần 1; phân quyền theo mã chức năng; bảo mật nền (`helmet`, CORS, giới hạn tần suất, cookie) | Làm đúng nền trước, các phân hệ sau đều dựa vào phân quyền |
| 2 | Kho, cho thuê; ca trực, chấm công, mở đóng ca | Nghiệp vụ vận hành hằng ngày, dễ trình diễn |
| 3 | Tiền lương; dashboard Admin theo từng khâu; sổ thu chi | Dùng dữ liệu của đợt 2 |
| 4 | Dự báo doanh thu; phát hiện bất thường | Cần dữ liệu của các đợt trước |
| 5 | Đặt định kỳ, thành viên, đánh giá, thông báo | Làm nếu còn thời gian |

## 5. Nguồn tham khảo

- [Mức lương tối thiểu vùng 2026](https://thuvienphapluat.vn/lao-dong-tien-luong/muc-luong-toi-thieu-vung-2026-la-bao-nhieu-54177.html)
- [Tỷ lệ đóng BHXH 2026](https://amis.misa.vn/292831/ty-le-dong-bhxh/)
- [Tỷ lệ đóng BHXH, BHYT, BHTN và mức đóng tối đa 2026](https://fastca.vn/ty-le-dong-bhxh-bat-buoc-bhyt-bhtn-nam-2026-cu-the-ra-sao)
- [Biểu thuế TNCN 5 bậc 2026](https://thuvienphapluat.vn/lao-dong-tien-luong/bieu-thue-tncn-2026-ra-sao-56757.html)
- [Lương cơ sở 2.530.000đ từ 01/7/2026, Nghị định 161/2026/NĐ-CP](https://baochinhphu.vn/chinh-thuc-tang-luong-co-so-len-2530000-dong-thang-tu-01-7-2026-102260516214238878.htm)
- [Lương tối thiểu vùng theo Nghị định 293/2025/NĐ-CP](https://thuvienphapluat.vn/hoi-dap-phap-luat/nghi-dinh-luong-toi-thieu-vung-2026-la-nghi-dinh-nao-138076681.html)
- [Nghị định 174/2025/NĐ-CP giảm thuế GTGT](https://thuvienphapluat.vn/van-ban/Thue-Phi-Le-Phi/Nghi-dinh-174-2025-ND-CP-chinh-sach-giam-thue-gia-tri-gia-tang-theo-Nghi-quyet-204-2025-QH15-663151.aspx)
- [Luật Việc làm 74/2025/QH15](https://thuvienphapluat.vn/van-ban/lao-dong-tien-luong/Luat-Viec-lam-2025-so-74-2025-QH15-530912.aspx)
- [Mức giảm trừ gia cảnh từ 01/01/2026](https://thuvienphapluat.vn/lao-dong-tien-luong/muc-giam-tru-gia-canh-tu-01012026-la-bao-nhieu-49910.html)
- [Hiệu lực Luật Bảo vệ dữ liệu cá nhân 2025](https://luatvietnam.vn/dan-su/luat-bao-ve-du-lieu-ca-nhan-2025-co-hieu-luc-khi-nao-568-103652-article.html)
- [Nghị định 356/2025/NĐ-CP](https://thuvienphapluat.vn/van-ban/Quyen-dan-su/Nghi-dinh-356-2025-ND-CP-huong-dan-Luat-Bao-ve-du-lieu-ca-nhan-687428.aspx)
