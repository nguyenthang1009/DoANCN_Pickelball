# Dự báo doanh thu và tăng trưởng

Chức năng dành cho Admin (quyền `forecast.view`, chỉ vai trò Admin có): dự báo doanh thu từng ngày cho 14 đến 90 ngày tới, tăng trưởng 30 ngày tới so với 30 ngày qua, kèm khoảng dự báo và sai số đo trên dữ liệu đã có. Xem theo từng cơ sở hoặc toàn chuỗi.

Mã nguồn: [backend/src/utils/forecast.js](../backend/src/utils/forecast.js) (thuật toán, không đụng CSDL), [backend/src/services/forecast.service.js](../backend/src/services/forecast.service.js) (đọc sổ cái), [frontend/src/pages/finance/Forecast.jsx](../frontend/src/pages/finance/Forecast.jsx).

## 1. Dữ liệu

Doanh thu ròng từng ngày đọc từ sổ cái: tài khoản 5111 (dịch vụ tại quầy) và 5113 (cho thuê sân), lấy bên có trừ bên nợ nên đã trừ hóa đơn điều chỉnh giảm khi hoàn tiền, chưa gồm VAT. Chuỗi chạy từ ngày đầu có phát sinh tới hôm qua (hôm nay chưa hết ngày). Ngày không có phát sinh tính 0.

Dùng sổ cái thay cho bảng đơn đặt sân để số dự báo khớp với báo cáo tài chính và bảng cân đối.

## 2. Mô hình

Doanh thu sân thể thao có chu kỳ tuần rõ (cuối tuần đông hơn) và xu hướng tăng giảm theo thời gian, nên dùng làm trơn hàm mũ Holt-Winters với mùa vụ cộng tính, chu kỳ m = 7 ngày [1, 2, 3].

Phương trình dạng thành phần [1, mục 8.2 và 8.3], φ = 1 là Holt-Winters thường, φ < 1 là xu hướng giảm dần:

```
ℓt = α(yt − st−m) + (1 − α)(ℓt−1 + φ·bt−1)                      mức
bt = β(ℓt − ℓt−1) + (1 − β)·φ·bt−1                                xu hướng
st = γ(yt − ℓt−1 − φ·bt−1) + (1 − γ)·st−m                        mùa vụ
ŷt+h|t = ℓt + (φ + φ² + … + φʰ)·bt + st+h−m(k+1),  k = ⌊(h−1)/m⌋   dự báo
```

- **Khởi tạo:** mức bằng trung bình tuần đầu, xu hướng bằng chênh lệch trung bình hai tuần đầu chia 7, mùa vụ bằng độ lệch từng ngày tuần đầu so với mức.
- **Ước lượng α, β, γ, φ:** tìm trên lưới, cực tiểu tổng bình phương sai số dự báo một bước. Ràng buộc 0 < β < α, 0 < γ < 1 − α như [1, mục 8.4].
- **Mốc so sánh:** naive theo mùa, ngày cần dự báo bằng cùng thứ tuần trước [1, mục 5.2]. Mô hình phức tạp mà không thắng được mốc này thì không có giá trị.

## 3. Chọn mô hình và đo sai số

Giữ lại các ngày cuối làm tập kiểm tra: 28 ngày nếu có từ 12 tuần dữ liệu, 14 ngày nếu ít hơn. Mỗi mô hình chỉ học phần trước đó rồi dự báo tập kiểm tra. Bốn độ đo [1, mục 5.8; 4]:

| Độ đo | Ý nghĩa |
| --- | --- |
| MAE | Sai lệch tuyệt đối trung bình, tính bằng đồng |
| RMSE | Căn trung bình bình phương sai lệch, phạt nặng ngày lệch nhiều |
| MAPE | Sai lệch theo phần trăm, dễ hiểu nhưng không dùng được khi có ngày doanh thu 0 |
| MASE | MAE chia cho sai số của naive theo mùa trên tập huấn luyện. Dưới 1 là tốt hơn mốc so sánh |

Chọn mô hình có MASE nhỏ nhất, rồi khớp lại trên toàn bộ dữ liệu để dự báo. Cần ít nhất 4 tuần dữ liệu: 2 tuần để khởi tạo, phần còn lại để kiểm tra.

## 4. Khoảng dự báo

Khoảng 80% và 95% tính bằng bootstrap phần dư [1, mục 5.5]. Mô phỏng 1.000 đường tương lai: mỗi ngày lấy ngẫu nhiên một phần dư một bước trong quá khứ cộng vào dự báo, rồi cập nhật trạng thái theo đúng phương trình, lấy phân vị của từng ngày. Cách này không giả định sai số phân phối chuẩn. Hạt giống cố định nên lần nào xem cũng ra cùng số.

## 5. Kiểm chứng

- **Đối chiếu thư viện:** `backend/scripts/forecast-compare/` so với ETSModel của statsmodels 0.15.0, khung ETS của Hyndman, mô hình ETS(A,A,A) và ETS(A,Ad,A). Cùng chuỗi 140 ngày, cùng tham số và giá trị khởi tạo, giá trị khớp và dự báo 30 ngày lệch 0,000000đ ở cả 3 bộ tham số.
- **Ghi chú:** lớp ExponentialSmoothing cũ của statsmodels cho giá trị khớp trùng hẳn, nhưng dự báo ngày thứ 7, 14, 21, 28 lấy mùa vụ của chu kỳ trước, không dùng giá trị vừa cập nhật như công thức trên. Vì vậy mốc đối chiếu chính là ETSModel.
- **Kiểm thử:** `backend/scripts/forecast-test.js`, 30 kiểm tra.
  - Chuỗi biết trước đáp án và độ đo sai số tính tay.
  - Độ phủ khoảng 80% trên 280 ngày kiểm tra.
  - Phân quyền.
  - Đọc đúng doanh thu từ sổ cái.

```bash
cd backend
node scripts/forecast-compare/export.js
scripts/forecast-compare/.venv/Scripts/python -I scripts/forecast-compare/compare.py
```

Môi trường Python cho bước đối chiếu tạo một lần bằng `python -m venv scripts/forecast-compare/.venv` rồi `pip install statsmodels`; thư mục `.venv` không đưa lên git.

## 6. Dữ liệu mô phỏng

Hệ thống mới chạy nên sổ cái chưa đủ lịch sử. Trang có lựa chọn "Mô phỏng để trình diễn": 26 tuần doanh thu giả lập, tăng nhẹ theo thời gian, cuối tuần đông hơn, có nhiễu, hạt giống cố định. Khi bật, trang luôn hiện thông báo đây không phải doanh thu thật. Dữ liệu mô phỏng chỉ tạo trong bộ nhớ, không ghi vào CSDL.

## 7. Giới hạn

- Chưa tính ngày lễ, giải đấu, thời tiết; một sự kiện lớn sẽ làm phần dư lớn và khoảng dự báo rộng ra.
- Chỉ có mùa vụ tuần. Khi có từ hai năm dữ liệu nên xét thêm mùa vụ năm, ví dụ dùng mô hình TBATS hoặc hồi quy với biến ngày lễ [1, chương 12].
- Dự báo là ước lượng thống kê để tham khảo khi lập kế hoạch, không phải cam kết doanh thu.

## Tài liệu tham khảo

1. Hyndman, R.J., Athanasopoulos, G. (2021). *Forecasting: Principles and Practice*, 3rd ed. OTexts. https://otexts.com/fpp3/
2. Winters, P.R. (1960). Forecasting sales by exponentially weighted moving averages. *Management Science* 6(3), 324–342. https://doi.org/10.1287/mnsc.6.3.324
3. Holt, C.C. (2004). Forecasting seasonals and trends by exponentially weighted moving averages. *International Journal of Forecasting* 20(1), 5–10. https://doi.org/10.1016/j.ijforecast.2003.09.015
4. Hyndman, R.J., Koehler, A.B. (2006). Another look at measures of forecast accuracy. *International Journal of Forecasting* 22(4), 679–688. https://doi.org/10.1016/j.ijforecast.2006.03.001
5. Seabold, S., Perktold, J. (2010). statsmodels: Econometric and statistical modeling with Python. *Proceedings of the 9th Python in Science Conference*. https://www.statsmodels.org/
