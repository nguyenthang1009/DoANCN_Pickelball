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
    payment_link_id VARCHAR(100) NULL,                     -- Tuần 8: mã link thanh toán PayOS trả về
    checkout_url VARCHAR(255) NULL,                        -- Tuần 8: trang thanh toán của PayOS
    qr_code TEXT NULL,                                     -- Tuần 8: chuỗi VietQR để vẽ mã QR trên trang thanh toán
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

-- ----------------------------------------------------------------------------
-- 13. PHÂN QUYỀN THEO MÃ CHỨC NĂNG (ROLES, PERMISSIONS, ROLE_PERMISSIONS)
-- users.role giữ vai trò cấp phạm vi dữ liệu (toàn chuỗi / theo cơ sở / của mình, BR15).
-- users.custom_role_id trỏ tới vai trò tự tạo; NULL nghĩa là dùng vai trò hệ thống trùng tên users.role.
-- ----------------------------------------------------------------------------
CREATE TABLE roles (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL UNIQUE,
    base_role ENUM('ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER') NOT NULL, -- Cấp phạm vi dữ liệu của vai trò
    is_system BOOLEAN NOT NULL DEFAULT FALSE,     -- Vai trò hệ thống không xóa được
    created_by INT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_roles_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE permissions (
    code VARCHAR(50) PRIMARY KEY,                 -- VD: booking.refund, court.manage
    module VARCHAR(50) NOT NULL,                  -- Nhóm hiển thị trên ma trận quyền
    description VARCHAR(255) NOT NULL,
    admin_only BOOLEAN NOT NULL DEFAULT FALSE,    -- Quyền quản trị, không gán cho vai trò khác ngoài Admin
    sort_order INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE role_permissions (
    role_id INT UNSIGNED NOT NULL,
    permission_code VARCHAR(50) NOT NULL,
    PRIMARY KEY (role_id, permission_code),
    CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
    CONSTRAINT fk_rp_permission FOREIGN KEY (permission_code) REFERENCES permissions(code) ON DELETE CASCADE
) ENGINE=InnoDB;

ALTER TABLE users
ADD COLUMN custom_role_id INT UNSIGNED NULL AFTER role,
ADD CONSTRAINT fk_users_custom_role FOREIGN KEY (custom_role_id) REFERENCES roles(id) ON DELETE RESTRICT;

-- ----------------------------------------------------------------------------
-- 14. BẢNG REFRESH TOKEN (REFRESH_TOKENS) - Phiên đăng nhập xoay vòng, phát hiện token bị dùng lại
-- ----------------------------------------------------------------------------
CREATE TABLE refresh_tokens (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    family_id CHAR(36) NOT NULL,                  -- Các token nối tiếp nhau của cùng một lần đăng nhập
    token_hash CHAR(64) NOT NULL UNIQUE,          -- Chỉ lưu SHA-256, không lưu token gốc
    expires_at TIMESTAMP NOT NULL,
    rotated_at TIMESTAMP NULL,                    -- Đã đổi lấy token mới; dùng lại sau thời gian chờ là dấu hiệu lộ token
    revoked_at TIMESTAMP NULL,                    -- Đã thu hồi: đăng xuất, đổi mật khẩu hoặc phát hiện lộ token
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_refresh_family (family_id),
    INDEX idx_refresh_expiry (expires_at)
) ENGINE=InnoDB;


-- ----------------------------------------------------------------------------
-- 15. THAM SỐ PHÁP LÝ THEO NGÀY HIỆU LỰC - VAT, bảo hiểm, thuế TNCN, lương tối thiểu.
-- Tiền lưu VND số nguyên; tỷ lệ lưu theo phần vạn (800 = 8%). Luật đổi thì thêm dòng mới, không sửa dòng cũ.
-- ----------------------------------------------------------------------------
CREATE TABLE legal_parameters (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(40) NOT NULL,
    label VARCHAR(150) NOT NULL,
    value BIGINT NOT NULL,
    unit ENUM('VND', 'BP', 'NUMBER') NOT NULL DEFAULT 'VND', -- BP: phần vạn
    effective_from DATE NOT NULL,
    effective_to DATE NULL,
    legal_ref VARCHAR(255) NOT NULL,              -- Căn cứ pháp lý để đối chiếu
    updated_by INT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_legal_param UNIQUE (code, effective_from),
    CONSTRAINT fk_legal_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE pit_brackets (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    effective_from DATE NOT NULL,
    upper_limit BIGINT NULL,                      -- NULL: bậc cao nhất
    rate_bp INT UNSIGNED NOT NULL,
    legal_ref VARCHAR(255) NOT NULL,
    CONSTRAINT uq_pit_bracket UNIQUE (effective_from, upper_limit)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 16. HÓA ĐƠN BÁN HÀNG (INVOICES) - Số liên tục, chốt thuế suất và thông tin bên bán lúc phát hành.
-- Không sửa, không xóa: sai sót hoặc hoàn tiền được xử lý bằng hóa đơn điều chỉnh giảm (CREDIT).
-- ----------------------------------------------------------------------------
CREATE TABLE invoice_sequences (
    series VARCHAR(10) PRIMARY KEY,
    last_no INT UNSIGNED NOT NULL
) ENGINE=InnoDB;

CREATE TABLE invoices (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    invoice_no VARCHAR(24) NOT NULL UNIQUE,       -- VD: HD2026-0000123
    series VARCHAR(10) NOT NULL,
    seq INT UNSIGNED NOT NULL,
    invoice_type ENUM('SALE', 'CREDIT') NOT NULL DEFAULT 'SALE',
    original_invoice_id INT UNSIGNED NULL,        -- CREDIT trỏ về hóa đơn gốc
    venue_id INT UNSIGNED NOT NULL,
    booking_id INT UNSIGNED NULL,
    service_order_id INT UNSIGNED NULL,           -- Bán lẻ không kèm đơn sân
    customer_id INT UNSIGNED NULL,
    buyer_name VARCHAR(100) NOT NULL,
    buyer_phone VARCHAR(20) NULL,
    payment_method ENUM('VIETQR', 'CASH') NOT NULL,
    invoice_date DATE NOT NULL,
    vat_rate_bp INT UNSIGNED NOT NULL,            -- Chốt thuế suất lúc phát hành
    subtotal INT UNSIGNED NOT NULL,               -- Tiền chưa thuế
    vat_amount INT UNSIGNED NOT NULL,
    total INT UNSIGNED NOT NULL,                  -- Khách trả, đã gồm thuế
    seller JSON NOT NULL,                         -- Chốt thông tin bên bán lúc phát hành
    issued_by INT UNSIGNED NULL,                  -- NULL: hệ thống phát hành khi nhận tiền qua PayOS
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_invoice_seq UNIQUE (series, seq),
    CONSTRAINT uq_invoice_booking UNIQUE (booking_id, invoice_type),
    CONSTRAINT uq_invoice_order UNIQUE (service_order_id, invoice_type),
    CONSTRAINT chk_invoice_total CHECK (total = subtotal + vat_amount),
    CONSTRAINT fk_inv_original FOREIGN KEY (original_invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT,
    CONSTRAINT fk_inv_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT,
    CONSTRAINT fk_inv_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE RESTRICT,
    CONSTRAINT fk_inv_order FOREIGN KEY (service_order_id) REFERENCES service_orders(id) ON DELETE RESTRICT,
    CONSTRAINT fk_inv_customer FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_inv_issuer FOREIGN KEY (issued_by) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_inv_venue_date (venue_id, invoice_date),
    INDEX idx_inv_customer (customer_id, invoice_date)
) ENGINE=InnoDB;

CREATE TABLE invoice_lines (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT UNSIGNED NOT NULL,
    description VARCHAR(255) NOT NULL,
    quantity INT UNSIGNED NOT NULL,
    unit VARCHAR(30) NOT NULL,
    gross_amount INT UNSIGNED NOT NULL,           -- Thành tiền đã gồm thuế
    net_amount INT UNSIGNED NOT NULL,
    vat_amount INT UNSIGNED NOT NULL,
    revenue_account VARCHAR(10) NOT NULL,         -- Tài khoản doanh thu của dòng này
    CONSTRAINT chk_line_total CHECK (gross_amount = net_amount + vat_amount),
    CONSTRAINT fk_il_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 17. SỔ CÁI KẾ TOÁN KÉP (GL) - Nguồn số liệu duy nhất cho báo cáo tài chính
-- ----------------------------------------------------------------------------
CREATE TABLE gl_accounts (
    code VARCHAR(10) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    account_type ENUM('ASSET', 'LIABILITY', 'REVENUE', 'EXPENSE') NOT NULL
) ENGINE=InnoDB;

CREATE TABLE gl_entries (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    entry_date DATE NOT NULL,
    venue_id INT UNSIGNED NULL,
    source_type VARCHAR(30) NOT NULL,             -- INVOICE, HELD_RECEIPT, HELD_REFUND, PAYROLL_ACCRUAL, PAYROLL_PAYMENT
    source_id BIGINT UNSIGNED NOT NULL,
    memo VARCHAR(255) NOT NULL,
    created_by INT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_gl_source UNIQUE (source_type, source_id),   -- Một chứng từ chỉ ghi sổ một lần
    CONSTRAINT fk_gl_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT,
    CONSTRAINT fk_gl_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_gl_date (entry_date, venue_id)
) ENGINE=InnoDB;

CREATE TABLE gl_lines (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    entry_id BIGINT UNSIGNED NOT NULL,
    account_code VARCHAR(10) NOT NULL,
    debit BIGINT NOT NULL DEFAULT 0,              -- Số có dấu để báo cáo trừ nợ cho có không bị tràn
    credit BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT chk_gl_positive CHECK (debit >= 0 AND credit >= 0),
    CONSTRAINT chk_gl_side CHECK ((debit = 0) <> (credit = 0)),
    CONSTRAINT fk_gll_entry FOREIGN KEY (entry_id) REFERENCES gl_entries(id) ON DELETE RESTRICT,
    CONSTRAINT fk_gll_account FOREIGN KEY (account_code) REFERENCES gl_accounts(code) ON DELETE RESTRICT,
    INDEX idx_gll_account (account_code)
) ENGINE=InnoDB;

-- Chứng từ đã ghi sổ không sửa, không xóa được, kể cả khi thao tác thẳng trên CSDL
CREATE TRIGGER trg_invoices_no_update BEFORE UPDATE ON invoices FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hoa don da phat hanh khong duoc sua';
CREATE TRIGGER trg_invoices_no_delete BEFORE DELETE ON invoices FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hoa don da phat hanh khong duoc xoa';
CREATE TRIGGER trg_invoice_lines_no_update BEFORE UPDATE ON invoice_lines FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hoa don da phat hanh khong duoc sua';
CREATE TRIGGER trg_invoice_lines_no_delete BEFORE DELETE ON invoice_lines FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hoa don da phat hanh khong duoc xoa';
CREATE TRIGGER trg_gl_entries_no_update BEFORE UPDATE ON gl_entries FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'So cai khong duoc sua';
CREATE TRIGGER trg_gl_entries_no_delete BEFORE DELETE ON gl_entries FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'So cai khong duoc xoa';
CREATE TRIGGER trg_gl_lines_no_update BEFORE UPDATE ON gl_lines FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'So cai khong duoc sua';
CREATE TRIGGER trg_gl_lines_no_delete BEFORE DELETE ON gl_lines FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'So cai khong duoc xoa';

-- ----------------------------------------------------------------------------
-- 18. TIỀN LƯƠNG - Hợp đồng theo ngày hiệu lực, kỳ lương theo cơ sở, phiếu lương chốt số liệu
-- ----------------------------------------------------------------------------
CREATE TABLE employee_contracts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    position VARCHAR(100) NOT NULL,
    base_salary INT UNSIGNED NOT NULL,            -- Lương thỏa thuận theo tháng
    allowance INT UNSIGNED NOT NULL DEFAULT 0,    -- Phụ cấp tính thuế
    insured_salary INT UNSIGNED NOT NULL,         -- Lương đóng bảo hiểm
    dependents TINYINT UNSIGNED NOT NULL DEFAULT 0,  -- Người phụ thuộc đã đăng ký giảm trừ
    wage_region TINYINT UNSIGNED NOT NULL DEFAULT 1, -- Vùng lương tối thiểu 1-4
    effective_from DATE NOT NULL,
    effective_to DATE NULL,
    updated_by INT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_contract UNIQUE (user_id, effective_from),
    CONSTRAINT chk_region CHECK (wage_region BETWEEN 1 AND 4),
    CONSTRAINT fk_contract_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_contract_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE payroll_periods (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    venue_id INT UNSIGNED NOT NULL,
    period_month CHAR(7) NOT NULL,                -- VD: 2026-11
    standard_days TINYINT UNSIGNED NOT NULL,      -- Số ngày công chuẩn của tháng
    status ENUM('DRAFT', 'APPROVED', 'PAID') NOT NULL DEFAULT 'DRAFT',
    created_by INT UNSIGNED NOT NULL,
    approved_by INT UNSIGNED NULL,
    approved_at TIMESTAMP NULL,
    paid_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_period UNIQUE (venue_id, period_month),
    CONSTRAINT fk_period_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT,
    CONSTRAINT fk_period_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_period_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE payslips (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    period_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    contract_id INT UNSIGNED NOT NULL,
    -- Dữ liệu chấm công (giờ làm thêm tính theo phút để tránh số lẻ)
    work_days DECIMAL(4,1) NOT NULL DEFAULT 0,
    ot_weekday_minutes INT UNSIGNED NOT NULL DEFAULT 0,
    ot_weekend_minutes INT UNSIGNED NOT NULL DEFAULT 0,
    ot_holiday_minutes INT UNSIGNED NOT NULL DEFAULT 0,
    night_minutes INT UNSIGNED NOT NULL DEFAULT 0,
    -- Kết quả tính
    base_pay INT UNSIGNED NOT NULL DEFAULT 0,
    allowance INT UNSIGNED NOT NULL DEFAULT 0,
    ot_pay INT UNSIGNED NOT NULL DEFAULT 0,
    night_pay INT UNSIGNED NOT NULL DEFAULT 0,
    gross_pay INT UNSIGNED NOT NULL DEFAULT 0,
    si_employee INT UNSIGNED NOT NULL DEFAULT 0,
    hi_employee INT UNSIGNED NOT NULL DEFAULT 0,
    ui_employee INT UNSIGNED NOT NULL DEFAULT 0,
    si_employer INT UNSIGNED NOT NULL DEFAULT 0,
    hi_employer INT UNSIGNED NOT NULL DEFAULT 0,
    ui_employer INT UNSIGNED NOT NULL DEFAULT 0,
    tax_exempt_ot INT UNSIGNED NOT NULL DEFAULT 0, -- Phần tiền làm thêm cao hơn giờ thường, không tính thuế
    self_deduction INT UNSIGNED NOT NULL DEFAULT 0,
    dependent_deduction INT UNSIGNED NOT NULL DEFAULT 0,
    assessable_income INT UNSIGNED NOT NULL DEFAULT 0, -- Thu nhập tính thuế
    pit INT UNSIGNED NOT NULL DEFAULT 0,
    net_pay INT UNSIGNED NOT NULL DEFAULT 0,
    parameters JSON NULL,                         -- Chốt tham số pháp lý đã dùng để tính
    CONSTRAINT uq_payslip UNIQUE (period_id, user_id),
    CONSTRAINT fk_slip_period FOREIGN KEY (period_id) REFERENCES payroll_periods(id) ON DELETE RESTRICT,
    CONSTRAINT fk_slip_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_slip_contract FOREIGN KEY (contract_id) REFERENCES employee_contracts(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 19. NỘI DUNG WEBSITE - Ảnh thay thế và thông tin đồ án do Admin quản lý.
-- Không có dòng nào cho một vị trí nghĩa là dùng ảnh mặc định của frontend.
-- ----------------------------------------------------------------------------
CREATE TABLE site_media (
    media_key VARCHAR(60) PRIMARY KEY,            -- VD: hero.1, auth.login.2
    url VARCHAR(255) NULL,                        -- NULL: giữ ảnh mặc định, chỉ đổi điểm lấy nét
    alt VARCHAR(255) NULL,
    focus_x TINYINT UNSIGNED NOT NULL DEFAULT 50, -- Điểm giữ lại khi cắt ảnh theo khổ màn hình (%)
    focus_y TINYINT UNSIGNED NOT NULL DEFAULT 50,
    updated_by INT UNSIGNED NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_media_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE site_settings (
    setting_key VARCHAR(60) PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_by INT UNSIGNED NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_setting_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
