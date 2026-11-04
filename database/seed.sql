USE pickleball_booking;

-- 1. Nạp tham số hệ thống mặc định (NFR11, US-A07)
INSERT INTO system_configs (config_key, config_value, description) VALUES
('HOLD_DURATION_MINUTES', '10', 'Thời gian giữ chỗ chờ thanh toán (phút) - BR08'),
('MAX_ADVANCE_BOOKING_DAYS', '14', 'Số ngày tối đa cho phép khách đặt trước - BR03'),
('MIN_BOOKING_MINUTES', '60', 'Thời lượng đặt sân tối thiểu (phút) - BR02'),
('MAX_BOOKING_MINUTES', '180', 'Thời lượng đặt liên tục tối đa trên 1 sân (phút) - BR02'),
('ONLINE_CANCEL_DEADLINE_HOURS', '24', 'Số giờ tối thiểu trước giờ chơi được phép hủy online - BR11'),
('CHECKIN_EARLY_WINDOW_MINUTES', '30', 'Số phút mở cửa sổ check-in trước giờ bắt đầu sớm nhất - BR12');

-- 2. Nạp ngày lễ mẫu (US-A08)
INSERT INTO holidays (holiday_date, name) VALUES
('2026-09-02', 'Quốc khánh 2/9'),
('2027-01-01', 'Tết Dương lịch');

-- 3. Nạp tài khoản mẫu cho 4 Actors (Mật khẩu mẫu: 12345678 đã băm bcrypt)
INSERT INTO users (id, full_name, email, phone, password_hash, role) VALUES
(1, 'Nguyễn Hữu Thắng (Admin)', 'admin@pickleball.vn', '0901000001', '$2b$10$vh1SqBmM/8L4GIcI1YuWduAA1B0d5Gu3Nxs2eNo26aHfmfEHTJOOi', 'ADMIN'),
(2, 'Trần Quản Lý Q7', 'manager.q7@pickleball.vn', '0901000002', '$2b$10$vh1SqBmM/8L4GIcI1YuWduAA1B0d5Gu3Nxs2eNo26aHfmfEHTJOOi', 'MANAGER'),
(3, 'Lê Lễ Tân Q7', 'staff.q7@pickleball.vn', '0901000003', '$2b$10$vh1SqBmM/8L4GIcI1YuWduAA1B0d5Gu3Nxs2eNo26aHfmfEHTJOOi', 'STAFF'),
(4, 'Phạm Khách Hàng', 'customer1@gmail.com', '0909123456', '$2b$10$vh1SqBmM/8L4GIcI1YuWduAA1B0d5Gu3Nxs2eNo26aHfmfEHTJOOi', 'CUSTOMER');

-- 4. Tạo 2 Cơ sở sân (Quận 7 & Thủ Đức) và gán cơ sở cho Manager/Staff
INSERT INTO venues (id, name, address, open_time, close_time, manager_id) VALUES
(1, 'Cụm sân Pickleball Quận 7', '128 Nguyễn Thị Thập, Quận 7, TP.HCM', '06:00:00', '22:00:00', 2),
(2, 'Cụm sân Pickleball Thủ Đức', '45 Lê Văn Việt, TP. Thủ Đức, TP.HCM', '06:00:00', '22:00:00', NULL);

UPDATE users SET venue_id = 1 WHERE id IN (2, 3);

-- 5. Tạo Sân con cho Cơ sở Quận 7
INSERT INTO courts (id, venue_id, name, court_type, status) VALUES
(1, 1, 'Sân 01 (Trong nhà)', 'INDOOR', 'ACTIVE'),
(2, 1, 'Sân 02 (Trong nhà)', 'INDOOR', 'ACTIVE'),
(3, 1, 'Sân 03 (Ngoài trời)', 'OUTDOOR', 'ACTIVE'),
(4, 1, 'Sân 04 (Ngoài trời)', 'OUTDOOR', 'MAINTENANCE');

-- 6. Nạp Bảng giá chuẩn theo kịch bản kiểm thử Mục 7.2 (06:00-17:00 = 120k, 17:00-22:00 = 180k)
INSERT INTO price_rules (court_id, day_type, start_time, end_time, price_per_hour, updated_by) VALUES
(1, 'WEEKDAY', '06:00:00', '17:00:00', 120000, 2),
(1, 'WEEKDAY', '17:00:00', '22:00:00', 180000, 2),
(1, 'WEEKEND', '06:00:00', '17:00:00', 150000, 2),
(1, 'WEEKEND', '17:00:00', '22:00:00', 220000, 2),
(2, 'WEEKDAY', '06:00:00', '17:00:00', 120000, 2),
(2, 'WEEKDAY', '17:00:00', '22:00:00', 180000, 2),
(2, 'WEEKEND', '06:00:00', '17:00:00', 150000, 2),
(2, 'WEEKEND', '17:00:00', '22:00:00', 220000, 2),
(3, 'WEEKDAY', '06:00:00', '17:00:00', 120000, 2),
(3, 'WEEKDAY', '17:00:00', '22:00:00', 180000, 2),
(3, 'WEEKEND', '06:00:00', '17:00:00', 150000, 2),
(3, 'WEEKEND', '17:00:00', '22:00:00', 220000, 2),
(4, 'WEEKDAY', '06:00:00', '17:00:00', 120000, 2),
(4, 'WEEKDAY', '17:00:00', '22:00:00', 180000, 2),
(4, 'WEEKEND', '06:00:00', '17:00:00', 150000, 2),
(4, 'WEEKEND', '17:00:00', '22:00:00', 220000, 2);

-- 7. Nạp Danh mục dịch vụ tại quầy (G6)
INSERT INTO services (venue_id, name, category, unit, unit_price) VALUES
(1, 'Nước điện giải Revive', 'DRINK', 'Chai', 15000),
(1, 'Nước suối Aquafina', 'DRINK', 'Chai', 10000),
(1, 'Thuê vợt Pickleball Carbon', 'EQUIPMENT', 'Lượt', 50000),
(1, 'Bóng thi đấu Franklin X-40', 'EQUIPMENT', 'Quả', 60000);

-- 8. Cơ sở Thủ Đức: 3 sân con, bảng giá riêng (rẻ hơn Quận 7) và dịch vụ tại quầy
INSERT INTO courts (id, venue_id, name, court_type, status) VALUES
(5, 2, 'Sân A1 (Trong nhà)', 'INDOOR', 'ACTIVE'),
(6, 2, 'Sân A2 (Trong nhà)', 'INDOOR', 'ACTIVE'),
(7, 2, 'Sân B1 (Ngoài trời)', 'OUTDOOR', 'ACTIVE');

INSERT INTO price_rules (court_id, day_type, start_time, end_time, price_per_hour, updated_by) VALUES
(5, 'WEEKDAY', '06:00:00', '17:00:00', 100000, 1),
(5, 'WEEKDAY', '17:00:00', '22:00:00', 160000, 1),
(5, 'WEEKEND', '06:00:00', '17:00:00', 130000, 1),
(5, 'WEEKEND', '17:00:00', '22:00:00', 200000, 1),
(6, 'WEEKDAY', '06:00:00', '17:00:00', 100000, 1),
(6, 'WEEKDAY', '17:00:00', '22:00:00', 160000, 1),
(6, 'WEEKEND', '06:00:00', '17:00:00', 130000, 1),
(6, 'WEEKEND', '17:00:00', '22:00:00', 200000, 1),
(7, 'WEEKDAY', '06:00:00', '17:00:00', 100000, 1),
(7, 'WEEKDAY', '17:00:00', '22:00:00', 160000, 1),
(7, 'WEEKEND', '06:00:00', '17:00:00', 130000, 1),
(7, 'WEEKEND', '17:00:00', '22:00:00', 200000, 1);

INSERT INTO services (venue_id, name, category, unit, unit_price) VALUES
(2, 'Nước điện giải Revive', 'DRINK', 'Chai', 15000),
(2, 'Nước suối Aquafina', 'DRINK', 'Chai', 10000),
(2, 'Thuê vợt Pickleball Carbon', 'EQUIPMENT', 'Lượt', 50000);

-- 9. Phân quyền: 4 vai trò hệ thống và danh mục quyền theo chức năng
INSERT INTO roles (id, code, name, base_role, is_system) VALUES
(1, 'ADMIN', 'Admin', 'ADMIN', TRUE),
(2, 'MANAGER', 'Quản lý', 'MANAGER', TRUE),
(3, 'STAFF', 'Lễ tân', 'STAFF', TRUE),
(4, 'CUSTOMER', 'Khách hàng', 'CUSTOMER', TRUE);

INSERT INTO permissions (code, module, description, admin_only, sort_order) VALUES
('booking.create', 'Khách hàng', 'Đặt sân online', 0, 1),
('booking.view_own', 'Khách hàng', 'Xem lịch đặt của mình', 0, 2),
('booking.cancel_own', 'Khách hàng', 'Tự hủy đơn của mình', 0, 3),
('pos.create', 'Quầy lễ tân', 'Đặt sân tại quầy', 0, 4),
('pos.sell', 'Quầy lễ tân', 'Bán dịch vụ tại quầy', 0, 5),
('checkin.perform', 'Quầy lễ tân', 'Check-in khách', 0, 6),
('booking.view_venue', 'Quầy lễ tân', 'Xem đơn trong ngày của cơ sở', 0, 7),
('report.shift', 'Quầy lễ tân', 'Xem doanh thu ca', 0, 8),
('booking.cancel', 'Quản lý đơn', 'Hủy đơn của khách', 0, 9),
('booking.move', 'Quản lý đơn', 'Đổi sân cho khách', 0, 10),
('booking.refund', 'Quản lý đơn', 'Xác nhận hoàn tiền', 0, 11),
('court.manage', 'Sân và giá', 'Quản lý sân, bảo trì', 0, 12),
('price.manage', 'Sân và giá', 'Sửa bảng giá', 0, 13),
('service.view', 'Dịch vụ', 'Xem danh mục dịch vụ', 0, 14),
('service.manage', 'Dịch vụ', 'Quản lý danh mục dịch vụ', 0, 15),
('report.revenue', 'Báo cáo', 'Xem dashboard doanh thu', 0, 16),
('staff.view', 'Báo cáo', 'Xem nhân sự cơ sở', 0, 17),
('venue.manage', 'Quản trị', 'Tạo, sửa cụm sân', 1, 18),
('venue.view_all', 'Quản trị', 'Xem mọi cụm sân, cả cụm đã ngừng', 1, 19),
('user.view', 'Quản trị', 'Xem danh sách tài khoản', 1, 20),
('user.manage', 'Quản trị', 'Tạo, khóa tài khoản, đổi vai trò', 1, 21),
('role.manage', 'Quản trị', 'Quản lý vai trò và quyền', 1, 22);

-- Admin có mọi quyền nghiệp vụ nội bộ
INSERT INTO role_permissions (role_id, permission_code)
SELECT 1, code FROM permissions WHERE code NOT IN ('booking.create', 'booking.view_own', 'booking.cancel_own');
INSERT INTO role_permissions (role_id, permission_code)
SELECT 2, code FROM permissions WHERE code IN ('pos.create', 'pos.sell', 'checkin.perform', 'booking.view_venue', 'report.shift', 'service.view', 'booking.cancel', 'booking.move', 'booking.refund', 'court.manage', 'price.manage', 'service.manage', 'report.revenue', 'staff.view');
INSERT INTO role_permissions (role_id, permission_code)
SELECT 3, code FROM permissions WHERE code IN ('pos.create', 'pos.sell', 'checkin.perform', 'booking.view_venue', 'report.shift', 'service.view');
INSERT INTO role_permissions (role_id, permission_code)
SELECT 4, code FROM permissions WHERE code IN ('booking.create', 'booking.view_own', 'booking.cancel_own');


-- 10. Quyền cho hóa đơn, tài chính, tiền lương, nội dung website
INSERT INTO permissions (code, module, description, admin_only, sort_order) VALUES
('invoice.view_own', 'Khách hàng', 'Xem hóa đơn của mình', 0, 30),
('invoice.view_venue', 'Tài chính', 'Xem hóa đơn của cơ sở', 0, 31),
('finance.view', 'Tài chính', 'Xem báo cáo tài chính, sổ cái, thuế VAT', 0, 32),
('finance.reconcile', 'Tài chính', 'Xem đối soát số liệu toàn hệ thống', 1, 33),
('payroll.view_own', 'Tiền lương', 'Xem phiếu lương của mình', 0, 34),
('payroll.manage', 'Tiền lương', 'Quản lý hợp đồng, chấm công, lập bảng lương', 0, 35),
('payroll.approve', 'Tiền lương', 'Duyệt và chi trả bảng lương', 1, 36),
('legal.manage', 'Quản trị', 'Cập nhật tham số thuế, bảo hiểm, lương tối thiểu', 1, 37),
('site.manage', 'Quản trị', 'Quản lý ảnh và thông tin website', 1, 38);

INSERT INTO role_permissions (role_id, permission_code) VALUES
(1, 'invoice.view_venue'), (1, 'payroll.view_own'), (1, 'finance.view'), (1, 'finance.reconcile'), (1, 'payroll.manage'), (1, 'payroll.approve'), (1, 'legal.manage'), (1, 'site.manage'),
(2, 'invoice.view_venue'), (2, 'finance.view'), (2, 'payroll.view_own'), (2, 'payroll.manage'),
(3, 'invoice.view_venue'), (3, 'payroll.view_own'),
(4, 'invoice.view_own');

-- 11. Tham số pháp lý: giá trị tham khảo, cần đối chiếu văn bản gốc trước khi dùng thật
INSERT INTO legal_parameters (code, label, value, unit, effective_from, effective_to, legal_ref) VALUES
('VAT_RATE', 'Thuế suất VAT dịch vụ sân và bán tại quầy', 800, 'BP', '2025-07-01', '2026-12-31', 'Nghị quyết 204/2025/QH15, Nghị định 174/2025/NĐ-CP (cần đối chiếu Phụ lục I, II)'),
('VAT_RATE', 'Thuế suất VAT dịch vụ sân và bán tại quầy', 1000, 'BP', '2027-01-01', NULL, 'Luật Thuế GTGT 2024, thuế suất phổ thông'),
('SI_EMPLOYEE', 'BHXH người lao động đóng', 800, 'BP', '2025-07-01', NULL, 'Luật BHXH 2024'),
('HI_EMPLOYEE', 'BHYT người lao động đóng', 150, 'BP', '2025-07-01', NULL, 'Luật BHYT'),
('UI_EMPLOYEE', 'BHTN người lao động đóng', 100, 'BP', '2025-07-01', NULL, 'Luật Việc làm'),
('SI_EMPLOYER', 'BHXH doanh nghiệp đóng', 1750, 'BP', '2025-07-01', NULL, 'Luật BHXH 2024'),
('HI_EMPLOYER', 'BHYT doanh nghiệp đóng', 300, 'BP', '2025-07-01', NULL, 'Luật BHYT'),
('UI_EMPLOYER', 'BHTN doanh nghiệp đóng', 100, 'BP', '2025-07-01', NULL, 'Luật Việc làm'),
('SI_SALARY_CAP', 'Trần lương đóng BHXH, BHYT', 46800000, 'VND', '2025-07-01', '2026-06-30', '20 lần mức tham chiếu 2.340.000đ'),
('SI_SALARY_CAP', 'Trần lương đóng BHXH, BHYT', 50600000, 'VND', '2026-07-01', NULL, '20 lần mức tham chiếu 2.530.000đ (cần đối chiếu nghị định lương cơ sở)'),
('UI_CAP_MULTIPLE', 'Trần lương đóng BHTN, số lần lương tối thiểu vùng', 20, 'NUMBER', '2025-07-01', NULL, 'Luật Việc làm'),
('SI_MIN_WORK_DAYS', 'Số ngày công tối thiểu trong tháng để đóng bảo hiểm', 14, 'NUMBER', '2025-07-01', NULL, 'Luật BHXH 2024 (nghỉ từ 14 ngày làm việc trở lên thì không đóng tháng đó)'),
('MIN_WAGE_REGION_1', 'Lương tối thiểu vùng I', 5310000, 'VND', '2026-01-01', NULL, 'Nghị định 293/2025/NĐ-CP'),
('MIN_WAGE_REGION_2', 'Lương tối thiểu vùng II', 4730000, 'VND', '2026-01-01', NULL, 'Nghị định 293/2025/NĐ-CP'),
('MIN_WAGE_REGION_3', 'Lương tối thiểu vùng III', 4140000, 'VND', '2026-01-01', NULL, 'Nghị định 293/2025/NĐ-CP'),
('MIN_WAGE_REGION_4', 'Lương tối thiểu vùng IV', 3700000, 'VND', '2026-01-01', NULL, 'Nghị định 293/2025/NĐ-CP'),
('PIT_SELF_DEDUCTION', 'Giảm trừ gia cảnh bản thân mỗi tháng', 15500000, 'VND', '2026-01-01', NULL, 'Nghị quyết 110/2025/UBTVQH15'),
('PIT_DEPENDENT_DEDUCTION', 'Giảm trừ mỗi người phụ thuộc mỗi tháng', 6200000, 'VND', '2026-01-01', NULL, 'Nghị quyết 110/2025/UBTVQH15'),
('OT_WEEKDAY_RATE', 'Hệ số làm thêm ngày thường', 15000, 'BP', '2021-01-01', NULL, 'Điều 98 Bộ luật Lao động 2019 (cần đối chiếu)'),
('OT_WEEKEND_RATE', 'Hệ số làm thêm ngày nghỉ hằng tuần', 20000, 'BP', '2021-01-01', NULL, 'Điều 98 Bộ luật Lao động 2019 (cần đối chiếu)'),
('OT_HOLIDAY_RATE', 'Hệ số làm thêm ngày lễ, Tết', 30000, 'BP', '2021-01-01', NULL, 'Điều 98 Bộ luật Lao động 2019 (cần đối chiếu)'),
('NIGHT_RATE', 'Phụ cấp làm việc ban đêm', 3000, 'BP', '2021-01-01', NULL, 'Điều 98 Bộ luật Lao động 2019 (cần đối chiếu)');

INSERT INTO pit_brackets (effective_from, upper_limit, rate_bp, legal_ref) VALUES
('2026-01-01', 10000000, 500, 'Luật Thuế TNCN 109/2025/QH15, áp dụng cho kỳ tính thuế 2026'),
('2026-01-01', 30000000, 1000, 'Luật Thuế TNCN 109/2025/QH15, áp dụng cho kỳ tính thuế 2026'),
('2026-01-01', 60000000, 2000, 'Luật Thuế TNCN 109/2025/QH15, áp dụng cho kỳ tính thuế 2026'),
('2026-01-01', 100000000, 3000, 'Luật Thuế TNCN 109/2025/QH15, áp dụng cho kỳ tính thuế 2026'),
('2026-01-01', NULL, 3500, 'Luật Thuế TNCN 109/2025/QH15, áp dụng cho kỳ tính thuế 2026');

-- 12. Hệ thống tài khoản dùng cho website (theo số hiệu Thông tư 133/2016/TT-BTC, rút gọn)
INSERT INTO gl_accounts (code, name, account_type) VALUES
('1111', 'Tiền mặt', 'ASSET'),
('1121', 'Tiền gửi ngân hàng', 'ASSET'),
('33311', 'Thuế GTGT đầu ra phải nộp', 'LIABILITY'),
('3335', 'Thuế thu nhập cá nhân phải nộp', 'LIABILITY'),
('334', 'Phải trả người lao động', 'LIABILITY'),
('3383', 'Bảo hiểm xã hội phải nộp', 'LIABILITY'),
('3384', 'Bảo hiểm y tế phải nộp', 'LIABILITY'),
('3386', 'Bảo hiểm thất nghiệp phải nộp', 'LIABILITY'),
('3388', 'Phải trả khác: tiền khách chuyển chờ xử lý', 'LIABILITY'),
('5111', 'Doanh thu bán hàng và dịch vụ tại quầy', 'REVENUE'),
('5113', 'Doanh thu cho thuê sân', 'REVENUE'),
('6421', 'Chi phí tiền lương', 'EXPENSE'),
('6422', 'Chi phí bảo hiểm doanh nghiệp đóng', 'EXPENSE');

-- 13. Thông tin hiển thị trên website và hóa đơn: mã số thuế, thành viên nhóm do Admin nhập
INSERT INTO site_settings (setting_key, setting_value) VALUES
('project_name', 'Website quản lý và đặt sân Pickleball trực tuyến'),
('project_type', 'Đồ án chuyên ngành Công nghệ thông tin'),
('team_members', ''),
('advisor', ''),
('tech_stack', 'React, Vite, Tailwind CSS, Node.js, Express, MySQL 8, Socket.io, PayOS'),
('deployment', 'Môi trường phát triển: Laragon, Node.js'),
('seller_name', 'Hệ thống sân Pickleball'),
('seller_tax_code', ''),
('seller_address', ''),
('hotline', '');
