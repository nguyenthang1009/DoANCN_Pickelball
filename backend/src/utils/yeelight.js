const net = require('net');

// Giao thức LAN của Yeelight: TCP cổng 55443, mỗi lệnh là một dòng JSON kết thúc bằng \r\n.
// Phải bật "LAN Control" trong app Yeelight. Bóng giới hạn khoảng 60 lệnh/phút cho mỗi kết nối,
// nên chỉ gửi khi độ sáng đổi đủ nhiều và không gửi dồn dập.
const PORT = Number(process.env.YEELIGHT_PORT) || 55443;
const MIN_INTERVAL_MS = 2000;
const MIN_STEP = 3;
const TIMEOUT_MS = 1500;

const bulbs = new Map(); // ip -> { level, warning, sentAt, online, error }
let nextId = 1;

// Chỉ cho kết nối tới địa chỉ trong mạng nội bộ, tránh dùng máy chủ để dò máy ngoài Internet
function isLanAddress(ip) {
  if (net.isIP(ip) !== 4) return false;
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

// Mở kết nối, gửi lần lượt các lệnh, chờ bóng trả lời từng lệnh
function send(ip, commands) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: ip, port: PORT });
    let buffer = '';
    let answered = 0;
    socket.setTimeout(TIMEOUT_MS, () => { socket.destroy(); reject(new Error('Đèn không phản hồi')); });
    socket.on('error', (err) => reject(new Error(`Không kết nối được đèn: ${err.code || err.message}`)));
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\r\n');
      buffer = lines.pop();
      for (const line of lines) {
        const reply = JSON.parse(line);
        if (reply.error) { socket.destroy(); reject(new Error(`Đèn từ chối lệnh: ${reply.error.message}`)); return; }
        if (reply.id && ++answered === commands.length) { socket.end(); resolve(); }
      }
    });
    socket.on('connect', () => {
      for (const [method, params] of commands) socket.write(`${JSON.stringify({ id: nextId++, method, params })}\r\n`);
    });
  });
}

// Đổi độ sáng mượt trong 0,5 giây; 0% thì tắt hẳn vì bóng chỉ nhận độ sáng 1-100.
// Bật cảnh báo thì nháy 3 lần rồi trở lại trạng thái trước đó.
function commandsFor(level, startWarning) {
  const commands = level === 0
    ? [['set_power', ['off', 'smooth', 500]]]
    : [['set_power', ['on', 'smooth', 500]], ['set_bright', [level, 'smooth', 500]]];
  if (startWarning) commands.push(['start_cf', [6, 0, '400,2,4000,100,400,2,4000,1']]);
  return commands;
}

// Đẩy kết quả điều khiển xuống đèn. Trả về trạng thái kết nối để hiện trên giao diện.
async function apply(ip, { level, warning }) {
  const prev = bulbs.get(ip) || {};
  const startWarning = warning && !prev.warning;
  const changed = prev.level === undefined || startWarning
    || (level === 0) !== (prev.level === 0) || Math.abs(level - prev.level) >= MIN_STEP;
  if (!changed || (!startWarning && Date.now() - (prev.sentAt || 0) < MIN_INTERVAL_MS)) return status(ip);
  try {
    await send(ip, commandsFor(level, startWarning));
    bulbs.set(ip, { level, warning, sentAt: Date.now(), online: true, error: null });
  } catch (err) {
    bulbs.set(ip, { ...prev, warning: prev.warning, sentAt: Date.now(), online: false, error: err.message });
  }
  return status(ip);
}

function status(ip) {
  const b = bulbs.get(ip);
  return b ? { online: b.online, level: b.level ?? null, error: b.error, sentAt: b.sentAt ? new Date(b.sentAt).toISOString() : null } : { online: null, level: null, error: null, sentAt: null };
}

// Đổi địa chỉ đèn thì quên trạng thái cũ để lần sau gửi lại đầy đủ
const forget = (ip) => bulbs.delete(ip);

module.exports = { apply, status, forget, isLanAddress, commandsFor };
