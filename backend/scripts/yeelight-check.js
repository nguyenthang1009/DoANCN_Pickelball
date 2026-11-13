// Kiểm tra đèn Yeelight thật trước khi gán cho sân. Chạy trên máy cùng mạng Wi-Fi với đèn:
//   node scripts/yeelight-check.js                  tìm đèn trong mạng
//   node scripts/yeelight-check.js 192.168.1.50     đọc trạng thái, chỉnh thử độ sáng, nháy thử
//   node scripts/yeelight-check.js 192.168.1.50 --fuzzy   chạy các tình huống Fuzzy và đẩy kết quả xuống đèn
const net = require('net');
const yeelight = require('../src/utils/yeelight');
const { infer } = require('../src/utils/fuzzy');

const [ip, flag] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findBulbs() {
  console.log('Đang tìm đèn Yeelight trong mạng (khoảng 3 giây)...');
  const bulbs = await yeelight.discover(3000);
  if (!bulbs.length) {
    console.log(`
Không thấy đèn nào trả lời. Kiểm tra lần lượt:
  1. Đã bật "LAN Control" (Điều khiển LAN) cho đèn trong app Yeelight chưa.
  2. Máy tính và đèn có cùng một mạng Wi-Fi (cùng modem) không. Đèn chỉ dùng Wi-Fi 2,4 GHz.
  3. Tường lửa Windows có chặn Node.js không: lần đầu chạy, Windows hỏi thì chọn cho phép mạng Private.
  4. Đèn có đúng loại dùng giao thức Yeelight không (xem docs/ket-noi-den-yeelight.md, mục 1).
Biết địa chỉ IP của đèn (xem trong app Mi Home) thì chạy: node scripts/yeelight-check.js <IP>`);
    return;
  }
  console.log(`Tìm thấy ${bulbs.length} đèn:`);
  for (const b of bulbs) console.log(`  ${b.ip}  đời ${b.model || '?'}  tên "${b.name || ''}"  đang ${b.power === 'on' ? `bật ${b.bright}%` : 'tắt'}`);
  console.log(`\nKiểm tra một đèn: node scripts/yeelight-check.js ${bulbs[0].ip}`);
}

async function step(label, commands, wait = 1500) {
  process.stdout.write(`  ${label}... `);
  await yeelight.send(ip, commands);
  console.log('đèn đã nhận');
  await sleep(wait);
}

async function checkBulb() {
  if (!yeelight.isLanAddress(ip)) { console.log('Địa chỉ phải là IPv4 trong mạng nội bộ, VD 192.168.1.50'); process.exit(1); }
  const port = await new Promise((resolve) => {
    const s = net.createConnection({ host: ip, port: 55443 });
    s.setTimeout(2000, () => { s.destroy(); resolve('timeout'); });
    s.on('connect', () => { s.end(); resolve('open'); });
    s.on('error', (e) => resolve(e.code));
  });
  if (port !== 'open') {
    console.log(`Không mở được cổng 55443 của ${ip} (${port}).`);
    console.log(port === 'ECONNREFUSED'
      ? 'Đèn có trong mạng nhưng chưa bật LAN Control: bật trong app Yeelight rồi thử lại.'
      : 'Không tới được đèn: kiểm tra IP đúng chưa và máy tính có cùng mạng Wi-Fi với đèn không.');
    process.exit(1);
  }
  const before = await yeelight.readProps(ip);
  console.log(`Kết nối được. Đèn "${before.name || ip}" đang ${before.power === 'on' ? `bật ${before.bright}%` : 'tắt'}.`);

  if (flag === '--fuzzy') return fuzzyDemo(before);
  console.log('Chạy thử:');
  await step('Bật đèn, độ sáng 10%', yeelight.commandsFor(10, false));
  await step('Độ sáng 50%', yeelight.commandsFor(50, false));
  await step('Độ sáng 100%', yeelight.commandsFor(100, false));
  await step('Nháy cảnh báo 3 lần', [['start_cf', [6, 0, '400,2,4000,100,400,2,4000,1']]], 3000);
  await restore(before);
  console.log('\nĐèn hoạt động tốt. Vào trang Chiếu sáng thông minh, gán IP này cho một sân.');
}

// Mỗi tình huống: tính bằng đúng bộ suy luận mờ của hệ thống rồi đẩy kết quả xuống đèn như vòng điều khiển thật
async function fuzzyDemo(before) {
  const cases = [
    ['ACTIVE', 30, 8, 'Trong giờ đặt, trời tối, đang thi đấu'],
    ['ACTIVE', 30, 2, 'Trong giờ đặt, trời tối, đang nghỉ giữa hiệp'],
    ['ACTIVE', 250, 8, 'Trong giờ đặt, chạng vạng, đang thi đấu'],
    ['ACTIVE', 600, 8, 'Trong giờ đặt, trời còn sáng'],
    ['PREPARING', 30, 0, '15 phút trước giờ đặt, chuẩn bị sân'],
    ['IDLE', 30, 6, 'Không có đơn nhưng có người trên sân'],
    ['IDLE', 30, 0, 'Không có đơn, sân trống'],
  ];
  console.log('\nChạy các tình huống Fuzzy (mỗi tình huống 4 giây):');
  for (const [state, lux, activity, label] of cases) {
    const r = infer(state, lux, activity);
    const rules = r.fired.map((f) => `${f.lux}+${f.activity}→${f.level} (${f.strength.toFixed(2)})`).join(', ') || 'không luật nào';
    console.log(`\n  ${label}`);
    console.log(`  Đầu vào: ${lux} lux, hoạt động ${activity}/10, trạng thái ${state}`);
    console.log(`  Luật kích hoạt: ${rules}`);
    console.log(`  Trọng tâm ${r.centroid.toFixed(2)}% → độ sáng ${r.level}%${r.warning ? ', bật cảnh báo' : ''}`);
    await yeelight.send(ip, yeelight.commandsFor(r.level, r.warning));
    await sleep(4000);
  }
  await restore(before);
  console.log('\nXong. Đèn đã về trạng thái ban đầu.');
}

async function restore(before) {
  await yeelight.send(ip, before.power === 'on' ? yeelight.commandsFor(Number(before.bright), false) : yeelight.commandsFor(0, false));
}

(ip ? checkBulb() : findBulbs()).catch((e) => { console.error(`Lỗi: ${e.message}`); process.exit(1); });
