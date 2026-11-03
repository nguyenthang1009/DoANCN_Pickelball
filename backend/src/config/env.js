require('dotenv').config({ quiet: true });

if (!process.env.JWT_SECRET) {
  throw new Error('Thiếu biến môi trường JWT_SECRET (xem backend/.env.example)');
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'pickleball_booking',
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  },
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 10,
};
