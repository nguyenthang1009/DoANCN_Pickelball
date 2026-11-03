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