# Chiếu sáng thông minh bằng Fuzzy Logic

Mô-đun điều chỉnh độ sáng đèn sân theo ánh sáng môi trường, mức hoạt động trên sân và lịch đặt sân. Đèn chỉ sáng khi có khách đã thanh toán, sáng vừa đủ thay vì luôn bật 100%, và báo lễ tân khi có người vào sân mà không có đơn.

## 1. Vì sao dùng Fuzzy Logic

Cách làm thông thường là `if-else` với ngưỡng cứng, ví dụ “dưới 300 lux thì bật 100%”. Cách này khiến đèn nhảy đột ngột khi lux dao động quanh ngưỡng, và không diễn tả được những trạng thái trung gian như “trời hơi tối, khách đang nghỉ”.

Fuzzy Logic cho phép một giá trị thuộc nhiều tập cùng lúc với mức độ khác nhau. Ví dụ 125 lux vừa “Tối” 25%, vừa “Chạng vạng” 17%. Kết quả là độ sáng thay đổi mượt theo điều kiện thực tế.

## 2. Kiến trúc

```
Cảm biến (BH1750, camera)          Lịch đặt sân (CSDL)
  hoặc script giả lập IoT             đơn đã thanh toán, check-in
            │                                  │
            ▼                                  ▼
   lux, mức hoạt động  ───────►  Bộ điều khiển mờ (Node.js)  ◄───  trạng thái đặt sân
                                  mờ hóa → luật → gộp → giải mờ
                                               │
                         ┌─────────────────────┼─────────────────────┐
                         ▼                     ▼                     ▼
                Đèn Yeelight (LAN)   Màn hình Chiếu sáng      Cảnh báo lễ tân
                                       (Socket.io)              (Socket.io)
```

- **Đầu vào cảm biến** gửi tới `POST /api/lighting/readings` bằng khóa thiết bị (`X-Device-Key`), không dùng tài khoản người. Màn hình Chiếu sáng có thanh trượt để Quản lý mô phỏng cảm biến.
- **Vòng điều khiển** chạy mỗi 10 giây (`LIGHTING_INTERVAL_SECONDS`), và chạy ngay khi có số đo mới.
- **Thiếu số đo:** ánh sáng mặc định là tối, để không bao giờ để khách chơi trong bóng tối. Mức hoạt động lấy từ check-in: khách đã nhận sân thì coi là đang chơi (7/10).

## 3. Biến và tập mờ

Ba biến, mỗi tập là một hình thang (a, b, c, d); tam giác là hình thang có b = c.

**Ánh sáng môi trường** (lux, 0–1000):

| Tập | a | b | c | d |
| --- | --- | --- | --- | --- |
| Tối | 0 | 0 | 50 | 150 |
| Chạng vạng | 100 | 250 | 250 | 400 |
| Sáng | 350 | 500 | 1000 | 1000 |

**Mức hoạt động trên sân** (0–10):

| Tập | a | b | c | d |
| --- | --- | --- | --- | --- |
| Trống | 0 | 0 | 0,5 | 1,5 |
| Chờ / nghỉ | 0,5 | 1,5 | 3 | 4,5 |
| Thi đấu | 3,5 | 5 | 10 | 10 |

**Độ sáng đèn** (%, 0–100):

| Tập | a | b | c | d | Trọng tâm |
| --- | --- | --- | --- | --- | --- |
| Tắt | 0 | 0 | 0 | 10 | 3,3 |
| Cảnh báo | 5 | 15 | 15 | 25 | 15 |
| Dẫn đường | 10 | 25 | 25 | 40 | 25 |
| Duy trì | 35 | 50 | 50 | 65 | 50 |
| Bù sáng | 45 | 60 | 60 | 75 | 60 |
| Tối đa | 80 | 95 | 100 | 100 | 93 |

Các tập liền kề chồng lên nhau, nên mọi giá trị đầu vào đều thuộc ít nhất một tập.

## 4. Trạng thái đặt sân và bộ luật

Trạng thái đặt sân là giá trị rõ, không mờ hóa. Nó dùng để chọn bộ luật:

| Trạng thái | Điều kiện |
| --- | --- |
| Đang có khách | Trong giờ của một đơn đã thanh toán |
| Sắp tới giờ | Trong cửa sổ check-in trước giờ chơi (`CHECKIN_EARLY_WINDOW_MINUTES`, mặc định 30 phút) |
| Không có đơn | Còn lại |
| Bảo trì | Sân ngừng hoạt động: luôn tắt, không chạy suy luận |

Đơn đang giữ chỗ nhưng chưa thanh toán không làm bật đèn.

**Đang có khách:**

| Ánh sáng \ Hoạt động | Trống | Chờ / nghỉ | Thi đấu |
| --- | --- | --- | --- |
| Tối | Dẫn đường (25%) | Duy trì (50%) | Tối đa (93%) |
| Chạng vạng | Dẫn đường | Dẫn đường | Bù sáng (60%) |
| Sáng | Tắt | Tắt | Tắt |

**Sắp tới giờ:** Tối hoặc Chạng vạng thì Dẫn đường, Sáng thì Tắt.

**Không có đơn:** sân Trống thì Tắt. Có người (Chờ / nghỉ hoặc Thi đấu) khi trời Tối hoặc Chạng vạng thì Cảnh báo (15%), trời Sáng thì Tắt.

**Cảnh báo** là đầu ra rõ: không có đơn mà độ thuộc “Trống” của mức hoạt động dưới 0,5. Khi cảnh báo bật, đèn nháy 3 lần và lễ tân đang mở bất kỳ trang nội bộ nào cũng nhận thông báo.

Kiểm thử quét lưới 2.583 điểm cho cả ba bộ luật: điểm nào cũng có ít nhất một luật áp dụng.

## 5. Suy luận Mamdani

1. **Mờ hóa:** tính độ thuộc của lux và mức hoạt động với từng tập.
2. **Đánh giá luật:** độ mạnh của luật = min(độ thuộc ánh sáng, độ thuộc hoạt động). Luật không xét một biến thì coi độ thuộc biến đó là 1.
3. **Suy diễn:** cắt ngọn tập đầu ra ở đúng độ mạnh của luật (min).
4. **Gộp:** lấy max của các tập đã cắt.
5. **Giải mờ trọng tâm:** lấy mẫu trục độ sáng mỗi 0,25%, coi đường gộp là tuyến tính giữa hai mẫu, cộng từng hình thang:

   trọng tâm = Σ (diện tích đoạn × hoành độ trọng tâm đoạn) / Σ diện tích đoạn

6. **Ngưỡng tắt:** trọng tâm dưới 5% thì tắt hẳn, vì đèn không giữ được độ sáng quá thấp và tập “Tắt” có trọng tâm 3,3% chứ không phải 0.

### Ví dụ tính tay: 125 lux, mức hoạt động 8, đang có khách

- Ánh sáng: Tối = (150 − 125) / (150 − 50) = **0,25**; Chạng vạng = (125 − 100) / (250 − 100) = **0,167**; Sáng = 0.
- Hoạt động: Thi đấu = **1**; Trống = Chờ / nghỉ = 0.
- Luật kích hoạt:
  - Tối VÀ Thi đấu → Tối đa, độ mạnh min(0,25; 1) = **0,25**
  - Chạng vạng VÀ Thi đấu → Bù sáng, độ mạnh min(0,167; 1) = **0,167**
- Gộp: tập Tối đa cắt ở 0,25 và tập Bù sáng cắt ở 0,167.
- Trọng tâm vùng gộp = **75,36%**, làm tròn **75%**: nằm giữa Bù sáng (60%) và Tối đa (93%), lệch về Tối đa vì luật đó mạnh hơn.

## 6. Kiểm chứng

| Kiểm tra | Kết quả |
| --- | --- |
| Các mức trong bảng thiết kế ban đầu (25%, 50%, 60%, 15%) | Ra đúng |
| Trọng tâm tập Tối đa tính tay: (7,5 × 90 + 5 × 97,5) / 12,5 = 93 | Ra đúng 93,000 |
| So với thư viện scikit-fuzzy 0.5.0 trên 2.583 điểm | Lệch 0 (làm tròn 4 chữ số) |
| Lỗ hổng luật | 0 điểm thiếu luật |
| Tính đơn điệu khi thi đấu | Trời càng sáng thì đèn không bao giờ sáng hơn |
| Tính đơn điệu khi trời tối | Hoạt động càng nhiều thì đèn không bao giờ tối đi |

Chạy lại phép so với scikit-fuzzy:

```bash
cd backend
node scripts/fuzzy-compare/export.js
python scripts/fuzzy-compare/compare.py
```

Bộ kiểm thử đầy đủ `backend/scripts/lighting-test.js` gồm: suy luận, trạng thái theo lịch đặt, phân quyền, khóa thiết bị, giao thức đèn (đèn giả lập trên 127.0.0.1:55443), ước tính điện năng.

## 7. Đèn Yeelight

Hướng dẫn từng bước nối bóng đèn thật, kiểm tra bằng script và trình diễn: [ket-noi-den-yeelight.md](ket-noi-den-yeelight.md).

- Tìm đèn: gửi M-SEARCH (SSDP) tới `239.255.255.250:1982`, đèn đã bật LAN Control trả lời kèm địa chỉ, đời máy, trạng thái. Nút "Tìm đèn trong mạng" trên màn hình và `scripts/yeelight-check.js` dùng cách này.
- Giao thức LAN: TCP cổng 55443, mỗi lệnh là một dòng JSON. Hệ thống dùng `set_power`, `set_bright` (1–100, chuyển mượt 0,5 giây) và `start_cf` (nháy cảnh báo rồi trở lại trạng thái cũ).
- Phải bật **LAN Control** trong app Yeelight. Một số đời bóng không có tùy chọn này, nên cần kiểm tra trước khi mua.
- Bóng giới hạn khoảng 60 lệnh/phút cho mỗi kết nối (số liệu cộng đồng), nên hệ thống chỉ gửi khi độ sáng đổi từ 3% trở lên hoặc chuyển bật/tắt, và cách nhau ít nhất 2 giây.
- Chỉ nhận địa chỉ IPv4 trong mạng nội bộ, để máy chủ không bị dùng để dò máy bên ngoài.
- Đèn mất kết nối thì màn hình báo đỏ, vòng điều khiển vẫn chạy bình thường.
- Một bóng gia dụng không đủ chiếu sáng sân thật ở mức 300–500 lux. Trong đồ án, bóng đóng vai một **mô hình sân thu nhỏ**; sân thật cần đèn pha LED có điều chỉnh độ sáng.

## 8. Ước tính điện năng

Hệ thống ghi nhật ký mỗi khi độ sáng hoặc trạng thái đổi, rồi cộng dồn theo thời gian:

- **Thực tế** = Σ (độ sáng / 100 × số giờ ở mức đó) × công suất đèn.
- **Cách cũ** = số giờ có khách × công suất đèn (bật 100% suốt giờ thuê).
- **Tiết kiệm** = cách cũ − thực tế.

Công suất mỗi sân lấy từ `COURT_LIGHT_WATTS` (mặc định 1.600 W, giá trị giả định để minh họa). Ví dụ kiểm thử: sáng 100% trong 1 giờ rồi 50% trong 1 giờ, tức 2,4 kWh so với 3,2 kWh theo cách cũ, tiết kiệm 25%.

## 9. Chạy demo

1. Mở **Vận hành → Chiếu sáng thông minh** bằng tài khoản Quản lý.
2. Kéo thanh trượt ánh sáng và mức hoạt động của từng sân, rồi bấm **Xem suy luận** để xem biểu đồ hàm thuộc, các luật đang chạy và trọng tâm.
3. Hoặc chạy script giả lập thiết bị. Script gửi số đo mỗi 2 giây, mô phỏng buổi chiều tà rút gọn: 1 phút thật bằng 1 giờ.

```bash
cd backend
IOT_DEVICE_KEY=<khóa trong .env> node scripts/iot-simulator.js http://localhost:3000/api 1,2,3
```

4. Nếu có đèn: điền IP đèn vào ô của sân tương ứng.

Trạng thái “đang có khách” phụ thuộc giờ thật. Muốn demo vào buổi tối thì cần một đơn đã thanh toán trùng giờ đó.

## 10. Giới hạn và hướng phát triển

- Mức hoạt động hiện lấy từ thanh trượt, script giả lập hoặc trạng thái check-in. Bước tiếp theo là camera với mô hình YOLOv8 đếm người và đo chuyển động, gửi điểm 0–10 qua cùng API thiết bị.
- Cảm biến BH1750 cần thêm ESP32. API `POST /api/lighting/readings` đã sẵn sàng nhận số đo từ thiết bị thật.
- Bộ luật và tập mờ đang nằm trong code. Có thể chuyển vào CSDL để Quản lý tinh chỉnh mà không cần sửa code.
