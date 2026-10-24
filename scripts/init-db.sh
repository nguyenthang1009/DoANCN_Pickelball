#!/usr/bin/env bash
set -e

DB_USER="root"
DB_NAME="pickleball_booking"

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
echo "  KHOI TAO CSDL PICKLEBALL BOOKING (TUAN 3 - 3NF SCHEMA)  "
echo "=========================================================="
echo "-> Dang su dung MySQL tai: $MYSQL_CMD"

"$MYSQL_CMD" -u "$DB_USER" < ./database/schema.sql
echo "[OK] Da tao 12 bang chuan 3NF va Unique Slot Lock thanh cong!"

"$MYSQL_CMD" -u "$DB_USER" "$DB_NAME" < ./database/seed.sql
echo "[OK] Da nap du lieu mau (Configs, Venues, Courts, Price Rules, Services)!"
echo "Hoan tat! Mo DBeaver nhan F5 de kiem tra ERD."