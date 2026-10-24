-- ============================================================================
-- ĐỒ ÁN CHUYÊN NGÀNH CNTT: HỆ THỐNG QUẢN LÝ & ĐẶT SÂN PICKLEBALL TRỰC TUYẾN
-- Phiên bản Schema: Tuần 3 (Chuẩn hóa 3NF - SRS & Báo cáo BA Tuần 2)
-- Hệ quản trị CSDL: MySQL 8.0 (Laragon) | Tiền tệ: VND số nguyên (BR18)
-- ============================================================================

DROP DATABASE IF EXISTS pickleball_booking;
CREATE DATABASE pickleball_booking DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE pickleball_booking;

SET time_zone = '+07:00'; -- BR18: Múi giờ Asia/Ho_Chi_Minh

-- ----------------------------------------------------------------------------
-- 1. BẢNG CƠ SỞ SÂN (VENUES) - Khởi tạo trước để gán khóa ngoại hai chiều
-- ----------------------------------------------------------------------------
CREATE TABLE venues (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    address VARCHAR(255) NOT NULL,
    open_time TIME NOT NULL DEFAULT '06:00:00',  -- BR01: Bội của 30 phút
    close_time TIME NOT NULL DEFAULT '22:00:00', -- BR01: Giờ đóng > Giờ mở
    manager_id INT UNSIGNED NULL UNIQUE,         -- US-A01: Mỗi cơ sở tối đa 1 Manager
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 2. BẢNG NGƯỜI DÙNG (USERS) - Giải quyết G7 (US-A02, US-A03, US-S10, BR15)
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    phone VARCHAR(20) NOT NULL UNIQUE,           -- US-C01: SĐT 10 số duy nhất
    password_hash VARCHAR(255) NOT NULL,         -- NFR04: Bcrypt hash
    role ENUM('ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER') NOT NULL DEFAULT 'CUSTOMER',
    venue_id INT UNSIGNED NULL,                  -- G7, BR15: Cơ sở được gán cho Staff/Manager
    is_active BOOLEAN NOT NULL DEFAULT TRUE,     -- G7, US-A03: Khóa/Mở khóa tài khoản
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE, -- US-S10: Đổi MK lần đầu với nội bộ
    password_reset_token VARCHAR(255) NULL,      -- US-C03: Đặt lại mật khẩu
    password_reset_expires TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE SET NULL,
    INDEX idx_users_role_venue (role, venue_id)
) ENGINE=InnoDB;

-- Bổ sung khóa ngoại manager_id cho bảng venues
ALTER TABLE venues
ADD CONSTRAINT fk_venues_manager FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 3. BẢNG SÂN CON (COURTS) - Giải quyết US-M01, US-M02, BR16, BR17
-- ----------------------------------------------------------------------------
CREATE TABLE courts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    venue_id INT UNSIGNED NOT NULL,
    name VARCHAR(50) NOT NULL,
    court_type ENUM('INDOOR', 'OUTDOOR') NOT NULL DEFAULT 'OUTDOOR',
    status ENUM('ACTIVE', 'MAINTENANCE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE', -- BR16, BR17
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_courts_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT,
    CONSTRAINT uq_court_name_per_venue UNIQUE (venue_id, name) -- US-M01: Tên sân không trùng trong cùng cơ sở
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 4. BẢNG QUY TẮC BẢNG GIÁ (PRICE_RULES) - Giải quyết US-M04, BR05, BR07
-- ----------------------------------------------------------------------------
CREATE TABLE price_rules (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    court_id INT UNSIGNED NOT NULL,
    day_type ENUM('WEEKDAY', 'WEEKEND') NOT NULL, -- BR05: T2-T6 = WEEKDAY; T7, CN, Lễ = WEEKEND
    start_time TIME NOT NULL,                     -- Bội của 30 phút
    end_time TIME NOT NULL,                       -- Bội của 30 phút
    price_per_hour INT UNSIGNED NOT NULL,         -- BR18: VND số nguyên (> 0)
    updated_by INT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_price_rules_court FOREIGN KEY (court_id) REFERENCES courts(id) ON DELETE CASCADE,
    CONSTRAINT fk_price_rules_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_price_positive CHECK (price_per_hour > 0 AND end_time > start_time),
    INDEX idx_price_lookup (court_id, day_type, start_time, end_time)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 5. BẢNG ĐƠN ĐẶT SÂN (BOOKINGS) - Giải quyết G1, G2, G3, G4, BR04, Sơ đồ 6.3
-- ----------------------------------------------------------------------------
CREATE TABLE bookings (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    booking_code VARCHAR(20) NOT NULL UNIQUE,     -- FR05: Mã đơn không lộ số thứ tự (VD: PKB-261024-8F3A)
    venue_id INT UNSIGNED NOT NULL,               -- G3, BR04: 1 đơn thuộc đúng 1 cơ sở
    booking_date DATE NOT NULL,                   -- G3, BR04: 1 đơn thuộc đúng 1 ngày chơi
    booking_source ENUM('ONLINE', 'POS') NOT NULL DEFAULT 'ONLINE', -- G2: Nguồn tạo đơn
    
    -- Thông tin khách hàng (G1, Q9: Cho phép khách vãng lai không có tài khoản)
    customer_id INT UNSIGNED NULL,
    guest_name VARCHAR(100) NULL,
    guest_phone VARCHAR(20) NULL,
    
    -- Nhân sự tạo đơn (G2, BR14: Tính doanh thu ca trực của Staff)
    created_by INT UNSIGNED NOT NULL,
    
    -- Tiền tệ (BR18: VND số nguyên)
    total_court_amount INT UNSIGNED NOT NULL DEFAULT 0,
    total_service_amount INT UNSIGNED NOT NULL DEFAULT 0,
    total_amount INT UNSIGNED GENERATED ALWAYS AS (total_court_amount + total_service_amount) STORED,
    payment_method ENUM('VIETQR', 'CASH') NOT NULL DEFAULT 'VIETQR',
    
    -- Hai chiều trạng thái độc lập theo Sơ đồ Vòng đời đơn 6.3 (G4)
    payment_status ENUM(
        'PENDING_PAYMENT',          -- Đang giữ chỗ 10 phút (slot HELD)
        'PAID',                     -- Đã thanh toán (slot CONFIRMED)
        'EXPIRED',                  -- Quá 10 phút chưa thanh toán
        'CANCELLED',                -- Khách tự hủy khi chưa thanh toán
        'REFUND_PENDING',           -- Hủy trước >= 24h hoặc do bảo trì sân, chờ hoàn tiền
        'CONFLICT_REFUND_PENDING',  -- Webhook tiền về trễ khi ô đã thuộc người khác (TC10)
        'REFUNDED'                  -- Manager đã xác nhận hoàn tiền thủ công (UC20)
    ) NOT NULL DEFAULT 'PENDING_PAYMENT',
    
    checkin_status ENUM(
        'PENDING',                  -- Chưa check-in
        'CHECKED_IN',               -- Đã nhận sân (UC11)
        'NO_SHOW'                   -- Quá giờ kết thúc không đến nhận sân (UC10, BR12)
    ) NOT NULL DEFAULT 'PENDING',
    
    -- Thông tin giữ chỗ & QR Check-in (BR08, BR12, BR13)
    hold_expires_at TIMESTAMP NULL,
    qr_signature VARCHAR(255) NULL,               -- BR13: Chữ ký HMAC của mã đơn
    checked_in_at TIMESTAMP NULL,
    checked_in_by INT UNSIGNED NULL,
    
    -- Thông tin Hủy & Hoàn tiền (US-M09, US-M10)
    cancelled_at TIMESTAMP NULL,
    cancelled_by INT UNSIGNED NULL,
    cancel_reason VARCHAR(255) NULL,
    refunded_at TIMESTAMP NULL,
    refunded_by INT UNSIGNED NULL,
    refund_note VARCHAR(255) NULL,
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_bookings_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT,
    CONSTRAINT fk_bookings_customer FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_bookings_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_bookings_checkin_staff FOREIGN KEY (checked_in_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_bookings_cancel_user FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_bookings_refund_mgr FOREIGN KEY (refunded_by) REFERENCES users(id) ON DELETE SET NULL,
    
    INDEX idx_bookings_venue_date (venue_id, booking_date),
    INDEX idx_bookings_customer_status (customer_id, payment_status),
    INDEX idx_bookings_staff_shift (venue_id, created_by, booking_source, created_at),
    INDEX idx_bookings_hold_expiry (payment_status, hold_expires_at)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 6. BẢNG CHI TIẾT Ô LỊCH 30 PHÚT (BOOKING_SLOTS) - Giải quyết G9, BR02, BR06, BR09
-- ----------------------------------------------------------------------------
CREATE TABLE booking_slots (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    booking_id INT UNSIGNED NOT NULL,
    venue_id INT UNSIGNED NOT NULL,
    court_id INT UNSIGNED NOT NULL,
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,                     -- BR02: Ô nguyên tử 30 phút (VD: 18:00:00)
    end_time TIME NOT NULL,                       -- BR02: Cách start_time đúng 30 phút (VD: 18:30:00)
    price_snapshot INT UNSIGNED NOT NULL,         -- BR05, BR06: Giá chốt lúc giữ chỗ (= giá giờ * 0.5)
    slot_status ENUM('HELD', 'CONFIRMED', 'CANCELLED') NOT NULL DEFAULT 'HELD',
    
    -- G9, BR09: Khóa duy nhất động chỉ kích hoạt khi slot đang HELD hoặc CONFIRMED
    active_slot_lock VARCHAR(64) GENERATED ALWAYS AS (
        CASE 
            WHEN slot_status IN ('HELD', 'CONFIRMED') 
            THEN CONCAT(court_id, '_', booking_date, '_', TIME_FORMAT(start_time, '%H:%i'))
            ELSE NULL 
        END
    ) STORED,
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_slots_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    CONSTRAINT fk_slots_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT,
    CONSTRAINT fk_slots_court FOREIGN KEY (court_id) REFERENCES courts(id) ON DELETE RESTRICT,
    
    -- Chặn vật lý 100% việc 2 đơn cùng giữ/đặt 1 ô 30 phút tại cùng 1 sân
    CONSTRAINT uq_active_court_slot UNIQUE (active_slot_lock),
    INDEX idx_slots_matrix_view (venue_id, booking_date, slot_status),
    INDEX idx_slots_court_date (court_id, booking_date, start_time)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 7. BẢNG GIAO DỊCH THANH TOÁN PAYOS (PAYMENT_TRANSACTIONS) - Giải quyết G5, BR10, NFR12
-- ----------------------------------------------------------------------------
CREATE TABLE payment_transactions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    booking_id INT UNSIGNED NOT NULL,
    payos_order_code BIGINT UNSIGNED NOT NULL UNIQUE,      -- Mã orderCode số nguyên gửi sang PayOS
    payos_transaction_id VARCHAR(100) NULL UNIQUE,         -- G5, TC09: Chống xử lý lặp cùng 1 Webhook
    amount INT UNSIGNED NOT NULL,                          -- Số tiền thực nhận (VND)
    transaction_status ENUM('PENDING', 'SUCCESS', 'FAILED', 'INVALID_SIGNATURE', 'AMOUNT_MISMATCH') NOT NULL DEFAULT 'PENDING',
    raw_webhook_payload JSON NULL,                         -- NFR12: Lưu toàn bộ JSON gốc từ PayOS để đối soát
    processed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_payments_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 8. BẢNG DANH MỤC DỊCH VỤ (SERVICES) - Giải quyết G6, UC19, BR16
-- ----------------------------------------------------------------------------
CREATE TABLE services (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    venue_id INT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,                   -- VD: Nước khoáng Revive, Thuê vợt Carbon
    category ENUM('DRINK', 'EQUIPMENT', 'OTHER') NOT NULL DEFAULT 'DRINK',
    unit VARCHAR(30) NOT NULL DEFAULT 'Chai',     -- Chai, Lon, Lượt, Quả
    unit_price INT UNSIGNED NOT NULL,             -- BR18: Giá bán VND số nguyên
    is_active BOOLEAN NOT NULL DEFAULT TRUE,      -- BR16: Món đã bán không xóa, chỉ ngừng bán
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_services_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT,
    INDEX idx_services_venue_active (venue_id, is_active)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 9. BẢNG HÓA ĐƠN & DÒNG DỊCH VỤ BÁN TẠI QUẦY (SERVICE_ORDERS & ITEMS) - Giải quyết G6, US-S06, BR14
-- Hỗ trợ cả 2 trường hợp: Bán kèm đơn đặt sân (booking_id != NULL) hoặc Bán lẻ tại quầy (booking_id IS NULL)
-- ----------------------------------------------------------------------------
CREATE TABLE service_orders (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    venue_id INT UNSIGNED NOT NULL,
    booking_id INT UNSIGNED NULL,                 -- NULL nếu khách mua lẻ nước không kèm đơn sân
    sold_by INT UNSIGNED NOT NULL,                -- BR14: Lễ tân bán (tính vào doanh thu ca của lễ tân này)
    total_service_amount INT UNSIGNED NOT NULL DEFAULT 0,
    payment_method ENUM('CASH', 'VIETQR') NOT NULL DEFAULT 'CASH',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sorders_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT,
    CONSTRAINT fk_sorders_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
    CONSTRAINT fk_sorders_staff FOREIGN KEY (sold_by) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_sorders_staff_shift (venue_id, sold_by, created_at)
) ENGINE=InnoDB;

CREATE TABLE service_order_items (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    service_order_id INT UNSIGNED NOT NULL,
    service_id INT UNSIGNED NOT NULL,
    quantity INT UNSIGNED NOT NULL CHECK (quantity >= 1),
    unit_price_snapshot INT UNSIGNED NOT NULL,    -- G6, US-M05: Chốt giá tại thời điểm bán
    line_total INT UNSIGNED GENERATED ALWAYS AS (quantity * unit_price_snapshot) STORED,
    CONSTRAINT fk_sitems_order FOREIGN KEY (service_order_id) REFERENCES service_orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_sitems_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 10. BẢNG NGÀY LỄ (HOLIDAYS) - Giải quyết G8, US-A08, BR05
-- ----------------------------------------------------------------------------
CREATE TABLE holidays (
    holiday_date DATE PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    created_by INT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_holidays_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 11. BẢNG THAM SỐ HỆ THỐNG (SYSTEM_CONFIGS) - Giải quyết G8, US-A07, NFR11
-- ----------------------------------------------------------------------------
CREATE TABLE system_configs (
    config_key VARCHAR(50) PRIMARY KEY,
    config_value VARCHAR(100) NOT NULL,
    description VARCHAR(255) NOT NULL,
    updated_by INT UNSIGNED NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_configs_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 12. BẢNG NHẬT KÝ HỆ THỐNG (AUDIT_LOGS) - Giải quyết G8, FR04
-- ----------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    actor_id INT UNSIGNED NULL,
    venue_id INT UNSIGNED NULL,
    action_type VARCHAR(50) NOT NULL,             -- VD: UPDATE_PRICE, CANCEL_BOOKING, CHECK_IN, COURT_MAINTENANCE, LOCK_USER, CONFIRM_REFUND
    entity_type VARCHAR(50) NOT NULL,             -- VD: BOOKING, COURT, PRICE_RULE, USER
    entity_id INT UNSIGNED NOT NULL,
    old_values JSON NULL,
    new_values JSON NULL,
    reason VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_audit_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE SET NULL,
    INDEX idx_audit_venue_time (venue_id, created_at),
    INDEX idx_audit_entity (entity_type, entity_id)
) ENGINE=InnoDB;