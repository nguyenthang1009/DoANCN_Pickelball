require('dotenv').config({ quiet: true });
const crypto = require('crypto');

// Khóa ký phiên đăng nhập: ai biết khóa này là tự tạo được phiên Admin. Repo công khai nên chặn chuỗi mẫu và chuỗi ngắn.
const JWT_SAMPLE = 'doi-chuoi-nay-thanh-chuoi-ngau-nhien-dai';
const GENERATE_HINT = 'Tạo khóa bằng lệnh: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))" rồi dán vào backend/.env';
if (!process.env.JWT_SECRET) {
  throw new Error(`Thiếu JWT_SECRET trong backend/.env. ${GENERATE_HINT}`);
}
if (process.env.JWT_SECRET === JWT_SAMPLE || process.env.JWT_SECRET.length < 32) {
  throw new Error(`JWT_SECRET phải là chuỗi ngẫu nhiên từ 32 ký tự, không dùng chuỗi mẫu. ${GENERATE_HINT}`);
}

const isProduction = process.env.NODE_ENV === 'production';
const listOf = (value) => value.split(',').map((s) => s.trim()).filter(Boolean);

const config = {
  isProduction,
  port: Number(process.env.PORT) || 3000,
  // Chỉ các địa chỉ frontend này được gọi API kèm cookie đăng nhập
  corsOrigins: listOf(process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173'),
  // Số proxy đứng trước server (Nginx = 1), để lấy đúng IP thật khi giới hạn tần suất
  trustProxy: Number(process.env.TRUST_PROXY) || 0,
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'pickleball_booking',
  },
  jwt: { secret: process.env.JWT_SECRET },
  session: {
    accessMinutes: Number(process.env.ACCESS_TOKEN_MINUTES) || 15,
    refreshDays: Number(process.env.REFRESH_TOKEN_DAYS) || 7,
    // Cookie Secure chỉ gửi qua HTTPS, bật khi triển khai thật
    cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProduction,
  },
  rateLimit: {
    api: Number(process.env.API_RATE_LIMIT) || 600, // mỗi phút, theo IP
    login: Number(process.env.LOGIN_RATE_LIMIT) || 10, // lần sai trong 15 phút, theo IP + tài khoản
    auth: Number(process.env.AUTH_RATE_LIMIT) || 60, // trong 15 phút, theo IP
    device: Number(process.env.DEVICE_RATE_LIMIT) || 600, // số đo cảm biến mỗi phút, theo IP
  },
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 10,
  // BR13: khóa ký mã QR check-in; mặc định suy ra từ JWT_SECRET nếu không đặt riêng
  qrSecret: process.env.QR_SECRET || `${process.env.JWT_SECRET}:qr`,
  jobIntervalSeconds: Number(process.env.JOB_INTERVAL_SECONDS) || 30,
  // Cổng PayOS: đủ 3 khóa thì gọi API thật, thiếu thì chạy chế độ mock (giả lập webhook ký đúng chuẩn)
  payos: {
    clientId: process.env.PAYOS_CLIENT_ID || '',
    apiKey: process.env.PAYOS_API_KEY || '',
    // Chế độ mock không có khóa thật: sinh khóa ngẫu nhiên mỗi lần chạy để không ai giả được webhook từ bên ngoài
    checksumKey: process.env.PAYOS_CHECKSUM_KEY || crypto.randomBytes(32).toString('hex'),
    baseUrl: process.env.PAYOS_BASE_URL || 'https://api-merchant.payos.vn',
    returnUrl: process.env.PAYOS_RETURN_URL || 'http://localhost:5173',
    get mode() { return this.clientId && this.apiKey && process.env.PAYOS_CHECKSUM_KEY ? 'payos' : 'mock'; },
  },
};

// Chế độ mock cho mọi tài khoản bấm "đã thanh toán", chỉ dùng khi phát triển và trình diễn
if (isProduction && config.payos.mode === 'mock') {
  throw new Error('NODE_ENV=production cần đủ PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY; chế độ giả lập thanh toán chỉ dùng khi phát triển');
}

module.exports = config;
