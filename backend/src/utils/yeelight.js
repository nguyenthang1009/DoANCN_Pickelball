const net = require('net');
const dgram = require('dgram');
const os = require('os');

// Giao thức LAN của Yeelight: TCP cổng 55443, mỗi lệnh là một dòng JSON kết thúc bằng \r\n.
// Phải bật "LAN Control" trong app Yeelight. Bóng giới hạn khoảng 60 lệnh/phút cho mỗi kết nối,
// nên chỉ gửi khi độ sáng đổi đủ nhiều và không gửi dồn dập.
const PORT = Number(process.env.YEELIGHT_PORT) || 55443;
const MIN_INTERVAL_MS = 2000;
const MIN_STEP = 3;
const WARNING_COOLDOWN_MS = 30000; // nháy cảnh báo tối đa một lần mỗi 30 giây, tránh nháy liên tục khi số đo dao động
const TIMEOUT_MS = 3000; // bóng thật thường trả lời trong 100-200 ms, Wi-Fi chập chờn có lúc chậm hơn nhiều

const bulbs = new Map(); // ip -> { level, warning, sentAt, online, error }
let nextId = 1;

// Chỉ cho kết nối tới địa chỉ trong mạng nội bộ, tránh dùng máy chủ để dò máy ngoài Internet
function isLanAddress(ip) {
  if (net.isIP(ip) !== 4) return false;
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

// Tìm đèn trong mạng (giao thức SSDP của Yeelight): gửi M-SEARCH tới 239.255.255.250:1982, đèn đã bật
// LAN Control trả lời kèm địa chỉ, đời máy, trạng thái. Gửi từ mọi card mạng vì máy có Docker, VirtualBox
// thường có nhiều card và gói multicast dễ đi nhầm card.
function discover(timeoutMs = 2500) {
  const message = Buffer.from('M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1982\r\nMAN: "ssdp:discover"\r\nST: wifi_bulb\r\n');
  const addresses = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  const found = new Map();
  return new Promise((resolve) => {
    const sockets = (addresses.length ? addresses : ['0.0.0.0']).map((address) => {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      socket.on('error', () => socket.close());
      socket.on('message', (msg) => {
        const headers = Object.fromEntries(msg.toString().split('\r\n').map((l) => l.match(/^([\w-]+):\s*(.*)$/)).filter(Boolean).map(([, k, v]) => [k.toLowerCase(), v.trim()]));
        const ip = /yeelight:\/\/([\d.]+):\d+/.exec(headers.location || '')?.[1];
        if (!ip) return;
        found.set(ip, {
          ip, id: headers.id, model: headers.model, firmware: headers.fw_ver, name: headers.name || '', power: headers.power,
          bright: headers.bright ? Number(headers.bright) : null, supports: (headers.support || '').split(' ').filter(Boolean),
        });
      });
      socket.bind(0, address, () => { try { socket.send(message, 1982, '239.255.255.250'); } catch { /* card không gửi được multicast */ } });
      return socket;
    });
    setTimeout(() => { sockets.forEach((s) => { try { s.close(); } catch { /* đã đóng */ } }); resolve([...found.values()]); }, timeoutMs);
  });
}

// Gửi lệnh, lỗi mạng hoặc quá thời gian thì thử lại một lần (các lệnh đặt độ sáng gửi lại không gây hại).
// Đèn từ chối lệnh thì không thử lại.
async function send(ip, commands) {
  try {
    return await sendOnce(ip, commands);
  } catch (err) {
    if (err.refused) throw err;
    return sendOnce(ip, commands);
  }
}

// Mở kết nối, gửi lần lượt các lệnh, chờ bóng trả lời từng lệnh. Trả về kết quả của từng lệnh theo thứ tự.
function sendOnce(ip, commands) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: ip, port: PORT });
    let buffer = '';
    const ids = [];
    const results = new Map();
    socket.setTimeout(TIMEOUT_MS, () => { socket.destroy(); reject(new Error('Đèn không phản hồi')); });
    socket.on('error', (err) => reject(new Error(`Không kết nối được đèn: ${err.code || err.message}`)));
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\r\n');
      buffer = lines.pop();
      for (const line of lines) {
        const reply = JSON.parse(line);
        if (reply.error) {
          socket.destroy();
          const quota = /quota/i.test(reply.error.message || '');
          reject(Object.assign(new Error(quota ? 'Đèn nhận quá nhiều lệnh trong một phút, tạm thời từ chối; chờ khoảng 1 phút' : `Đèn từ chối lệnh: ${reply.error.message}`), { refused: true }));
          return;
        }
        if (!reply.id || !ids.includes(reply.id)) continue; // bỏ qua thông báo trạng thái đèn tự gửi (method: props)
        results.set(reply.id, reply.result);
        if (results.size === commands.length) { socket.end(); resolve(ids.map((id) => results.get(id))); }
      }
    });
    socket.on('connect', () => {
      for (const [method, params] of commands) {
        const id = nextId++;
        ids.push(id);
        socket.write(`${JSON.stringify({ id, method, params })}\r\n`);
      }
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
  const startWarning = warning && !prev.warning && Date.now() - (prev.warnedAt || 0) >= WARNING_COOLDOWN_MS;
  const changed = prev.level === undefined || startWarning
    || (level === 0) !== (prev.level === 0) || Math.abs(level - prev.level) >= MIN_STEP;
  if (!changed || (!startWarning && Date.now() - (prev.sentAt || 0) < MIN_INTERVAL_MS)) return status(ip);
  try {
    await send(ip, commandsFor(level, startWarning));
    bulbs.set(ip, { level, warning, sentAt: Date.now(), warnedAt: startWarning ? Date.now() : prev.warnedAt, online: true, error: null });
  } catch (err) {
    bulbs.set(ip, { ...prev, sentAt: Date.now(), online: false, error: err.message });
  }
  return status(ip);
}

function status(ip) {
  const b = bulbs.get(ip);
  return b ? { online: b.online, level: b.level ?? null, error: b.error, sentAt: b.sentAt ? new Date(b.sentAt).toISOString() : null } : { online: null, level: null, error: null, sentAt: null };
}

// Đổi địa chỉ đèn thì quên trạng thái cũ để lần sau gửi lại đầy đủ
const forget = (ip) => bulbs.delete(ip);

// Đọc trạng thái hiện tại của đèn
async function readProps(ip) {
  const keys = ['power', 'bright', 'ct', 'name'];
  const [values] = await send(ip, [['get_prop', keys]]);
  return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
}

module.exports = { apply, status, forget, isLanAddress, commandsFor, discover, send, readProps };
