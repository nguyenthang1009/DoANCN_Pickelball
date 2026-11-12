#!/usr/bin/env bash
# Tạo lại CSDL từ database/schema.sql và nạp database/seed.sql. XÓA dữ liệu cũ của CSDL cùng tên.
# Mặc định: tài khoản root không mật khẩu (Laragon), CSDL pickleball_booking. Đổi bằng biến môi trường:
#   DB_USER=root DB_PASSWORD=matkhau DB_NAME=pickleball_booking bash scripts/init-db.sh
set -e

DB_USER="${DB_USER:-root}"
DB_NAME="${DB_NAME:-pickleball_booking}"
# Mật khẩu truyền qua biến MYSQL_PWD để không hiện trên dòng lệnh
if [ -n "$DB_PASSWORD" ]; then export MYSQL_PWD="$DB_PASSWORD"; fi

# Tự động dò tìm file mysql.exe của Laragon ở ổ C hoặc ổ D
if command -v mysql >/dev/null 2>&1; then
    MYSQL_CMD="mysql"
else
    MYSQL_CMD=$(find /c/laragon/bin/mysql /d/laragon/bin/mysql /e/laragon/bin/mysql -name "mysql.exe" 2>/dev/null | head -n 1)
fi

if [ -z "$MYSQL_CMD" ]; then
    echo "[LOI] Khong tim thay mysql.exe! Ban hay kiem tra Laragon da cai o thu muc nao."
    exit 1
fi

echo "=========================================================="
echo "  KHOI TAO CSDL PICKLEBALL BOOKING: $DB_NAME"
echo "=========================================================="
echo "-> Dang su dung MySQL tai: $MYSQL_CMD"

# utf8mb4: client mysql tren Windows mac dinh cp850, se lam hong tieng Viet trong seed
sed "s/pickleball_booking/$DB_NAME/g" ./database/schema.sql | "$MYSQL_CMD" -u "$DB_USER" --default-character-set=utf8mb4
echo "[OK] Da tao 36 bang chuan 3NF va Unique Slot Lock thanh cong!"

# seed.sql mở đầu bằng USE pickleball_booking: đổi theo DB_NAME để không nạp nhầm vào CSDL khác
sed "s/pickleball_booking/$DB_NAME/g" ./database/seed.sql | "$MYSQL_CMD" -u "$DB_USER" --default-character-set=utf8mb4 "$DB_NAME"
echo "[OK] Da nap du lieu mau (tai khoan, co so, san, bang gia, dich vu, tham so phap ly)!"
echo "Hoan tat! Mo HeidiSQL hoac DBeaver de kiem tra."
