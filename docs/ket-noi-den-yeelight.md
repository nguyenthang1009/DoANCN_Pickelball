# Kết nối đèn thật với hệ thống chiếu sáng Fuzzy

Hướng dẫn đưa một bóng đèn Xiaomi/Yeelight thật vào hệ thống. Một bóng đèn đại diện cho dàn đèn của một sân (mô hình thu nhỏ). Bộ suy luận mờ tính ra độ sáng, hệ thống gửi thẳng lệnh xuống bóng qua mạng Wi-Fi trong nhà, không đi qua máy chủ Xiaomi.

## 1. Kiểm tra bóng đèn có dùng được không

Hệ thống điều khiển đèn bằng **giao thức LAN của Yeelight**. Bóng do Yeelight sản xuất (kể cả loại mang tên Xiaomi/Mi) đều có giao thức này, nhưng phải bật tùy chọn **LAN Control** trong app Yeelight.

Cách xem bóng của bạn thuộc loại nào:

1. Mở app **Mi Home**, bấm vào bóng đèn.
2. Bấm dấu **⋯** góc trên bên phải → **Thông tin chung** (hoặc **Giới thiệu**, **Thông tin mạng**; tên mục khác nhau tùy phiên bản app).
3. Xem dòng **Model** (mã thiết bị), và ghi lại **Địa chỉ IP** nếu có:

| Model bắt đầu bằng | Dùng được không |
| --- | --- |
| `yeelink.light.` | Được. Làm tiếp mục 2 |
| `xiaomi.light.`, `mijia.light.`, `philips.light.` hoặc khác | Không dùng giao thức Yeelight. Xem mục 7 |

## 2. Bật LAN Control trong app Yeelight

Bóng đã kết nối với Mi Home rồi thì **không cần thêm thiết bị lại**. Màn hình "Thêm thiết bị → Đang quét các thiết bị ở gần" chỉ tìm bóng mới chưa ai kết nối, nên quét mãi không thấy là đúng.

1. Cài app **Yeelight** của nhà phát triển *Yeelink* từ **Google Play** (biểu tượng chữ Y trên nền đen). Không cài file APK tải ngoài, không chọn "Yeelight Pro" hay app của bên thứ ba.
2. Mở app, chọn **đúng vùng máy chủ** giống Mi Home (xem trong Mi Home: **Hồ sơ → Cài đặt → Quốc gia/Khu vực**).
3. Đăng nhập bằng **chính tài khoản Xiaomi** đang dùng trong Mi Home.
4. Bóng đèn tự hiện trong danh sách thiết bị. Bật **LAN Control**: tùy phiên bản app, vào bóng → cài đặt → **LAN Control**, hoặc vào trang **LAN** có danh sách mọi bóng và gạt công tắc cạnh bóng sang **bật** (màu xanh).

Nếu đăng nhập rồi mà không thấy bóng: kiểm tra lại vùng máy chủ ở bước 2. Đã đúng vùng mà vẫn không thấy thì bóng không phải loại Yeelight, xem mục 7.

## 3. Chuẩn bị mạng

- **Máy chạy backend** (laptop) phải bắt **cùng mạng Wi-Fi** (cùng modem) với bóng đèn. Bóng chỉ dùng Wi-Fi 2,4 GHz; laptop bắt Wi-Fi 5 GHz của cùng modem vẫn được.
- Trong Windows, đặt mạng Wi-Fi đó là **Private** (Cài đặt → Mạng và Internet → Wi-Fi → chọn mạng → Private network). Lần đầu chạy, Windows hỏi có cho Node.js dùng mạng không thì chọn **Cho phép** ở mạng Private.
- Nên **cố định IP** cho bóng: vào trang quản lý modem, phần DHCP, đặt địa chỉ cố định theo địa chỉ MAC của bóng. Không làm thì khi modem khởi động lại, bóng có thể đổi IP và phải gán lại.

## 4. Kiểm tra đèn bằng script

Mở terminal trong thư mục `backend`.

Tìm đèn trong mạng:

```bash
node scripts/yeelight-check.js
```

Thấy dòng `Tìm thấy 1 đèn: 192.168.x.x ...` là đèn đã sẵn sàng. Không thấy thì script in ra danh sách việc cần kiểm tra.

Thử điều khiển (thay IP bằng IP vừa tìm được): đèn bật 10%, lên 50%, 100%, nháy 3 lần, rồi về như cũ.

```bash
node scripts/yeelight-check.js 192.168.1.50
```

Chạy thử các tình huống Fuzzy ngay trên đèn thật, mỗi tình huống 4 giây:

```bash
node scripts/yeelight-check.js 192.168.1.50 --fuzzy
```

Script in ra đầu vào, luật nào kích hoạt, trọng tâm và độ sáng đẩy xuống đèn. Kết quả phải đúng như bảng ở mục 6.

## 5. Gán đèn cho sân trên web

1. Chạy backend và giao diện như [huong-dan-cai-dat.md](huong-dan-cai-dat.md).
2. Đăng nhập tài khoản Quản lý (`manager.q7@pickleball.vn`), vào **Vận hành → Chiếu sáng thông minh**.
3. Ở thẻ **Sân 01**, bấm **Tìm đèn trong mạng**, chọn đèn vừa hiện ra (hoặc gõ IP vào ô), bấm **Lưu**.
4. Chấm cạnh tên đèn chuyển **xanh**, ghi "Đèn 192.168.x.x" là đã kết nối. Chấm **đỏ** là mất kết nối; dòng chữ đỏ bên dưới cho biết lý do.

Từ đây, mỗi lần kết quả Fuzzy của Sân 01 thay đổi, đèn đổi theo trong khoảng 1–2 giây.

**Một bóng chỉ gán cho một sân.** Muốn chuyển bóng sang sân khác thì xóa IP ở sân cũ, bấm Lưu, rồi mới gán cho sân mới. Hai sân cùng điều khiển một bóng sẽ gửi lệnh ngược nhau (sân không có đơn bảo tắt, sân có khách bảo bật), đèn tắt bật liên tục; hệ thống đã chặn việc này.

## 6. Trình diễn Fuzzy trên đèn thật

Hệ thống không có cảm biến ánh sáng thật, nên dùng **thanh trượt** trên thẻ sân thay cho cảm biến (hoặc script `iot-simulator.js` giả lập thiết bị IoT gửi số đo). Kéo thanh trượt rồi xem đèn thay đổi:

| Thao tác | Kết quả Fuzzy | Đèn thật |
| --- | --- | --- |
| Có đơn đang chơi, ánh sáng 30 lux, hoạt động 8 | Tối + thi đấu → Tối đa, trọng tâm 93% | Sáng 93% |
| Giữ 30 lux, hạ hoạt động xuống 2 | Tối + nghỉ → Vừa, 50% | Dịu xuống 50% |
| Kéo ánh sáng lên 250 lux, hoạt động 8 | Chạng vạng + thi đấu → Khá, 60% | 60% |
| Kéo ánh sáng lên 600 lux | Sáng → Tắt | Tắt |
| Sân không có đơn, hoạt động 6 | Có người khi không có đơn → Cảnh báo, 15% | Sáng nhẹ 15% và nháy 3 lần, lễ tân nhận thông báo |
| Bấm **Chuyển thủ công**, nhập 70 | Bỏ qua Fuzzy | Giữ cố định 70% |

Trạng thái theo lịch đặt (có đơn, sắp tới giờ, không có đơn, bảo trì) do hệ thống tự xác định theo giờ hiện tại và các đơn đã thanh toán. Muốn trình diễn trạng thái "đang có đơn" thì đặt và thanh toán (giả lập) một đơn cho Sân 01 vào giờ hiện tại.

Cách hệ thống chuyển kết quả Fuzzy thành lệnh cho đèn (`backend/src/utils/yeelight.js`):

- **Độ sáng 1–100%:** bật đèn và đặt độ sáng đúng bằng kết quả, chuyển mượt trong 0,5 giây.
- **Độ sáng 0%:** tắt hẳn, vì bóng không nhận độ sáng 0.
- **Cảnh báo:** nháy 3 lần rồi giữ mức hiện tại. Mỗi bóng nháy tối đa một lần trong 30 giây, nên kéo thanh trượt qua lại quanh ngưỡng cảnh báo không làm đèn nháy liên tục.
- **Kéo thanh ánh sáng lên cao thì đèn tắt** là đúng Fuzzy: trời đủ sáng (từ khoảng 500 lux) thì không cần bật đèn. Kéo xuống lại thì đèn bật lại.
- **Giới hạn của bóng:** mỗi bóng nhận khoảng 60 lệnh mỗi phút. Hệ thống chỉ gửi khi độ sáng đổi từ 3% trở lên, và hai lệnh cách nhau ít nhất 2 giây; cảnh báo thì gửi ngay. Vì vậy kéo thanh trượt liên tục không làm bóng bị khóa lệnh.

## 7. Bóng không phải loại Yeelight

Bóng có model `xiaomi.light.*`, `mijia.light.*` hoặc không hiện trong app Yeelight thì không dùng được giao thức Yeelight. Có hai cách:

- **Đổi bóng** sang loại có LAN Control, ví dụ dòng Yeelight Smart LED Bulb (1S, W3). Kiểm tra mô tả sản phẩm có ghi "LAN Control" trước khi mua.
- **Thêm trình điều khiển giao thức Xiaomi (miIO).** Cách này cần lấy "token" riêng của bóng từ tài khoản Xiaomi, tự bạn làm trên máy mình và không gửi token cho ai. Hệ thống chưa có trình điều khiển này; gửi model của bóng để nhóm bổ sung.

## 8. Lỗi thường gặp

| Hiện tượng | Cách xử lý |
| --- | --- |
| Script không tìm thấy đèn | Chưa bật LAN Control; laptop khác mạng Wi-Fi với đèn; tường lửa chặn Node.js; mạng Wi-Fi đang để Public |
| `ECONNREFUSED` khi kiểm tra IP | Đèn có trong mạng nhưng chưa bật LAN Control |
| `timeout` khi kiểm tra IP | Sai IP hoặc khác mạng. Xem lại IP trong Mi Home |
| Chấm đỏ "Đèn mất kết nối" trên web | Đèn bị tắt công tắc điện, đổi IP, hoặc laptop đổi mạng Wi-Fi |
| Đèn tắt bật liên tục | Cùng một bóng đang gán cho hai sân (phiên bản cũ chưa chặn): gỡ bóng ở một sân |
| "Đèn nhận quá nhiều lệnh trong một phút" | Bóng giới hạn khoảng 60 lệnh mỗi phút. Chờ khoảng 1 phút là đèn nhận lệnh lại |
| Đèn phản hồi chậm hoặc bỏ qua lệnh | Đang mở thêm nhiều app điều khiển cùng lúc; đóng app Yeelight, Mi Home trên điện thoại khi trình diễn |
| Wi-Fi trường, quán cà phê không tìm thấy đèn | Mạng công cộng thường chặn các máy nhìn thấy nhau. Dùng modem riêng hoặc phát Wi-Fi từ điện thoại cho cả đèn và laptop |
