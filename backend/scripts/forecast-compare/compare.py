"""Đối chiếu bộ dự báo Holt-Winters (backend/src/utils/forecast.js) với statsmodels.

Mốc chính là ETSModel của statsmodels, cài đặt theo khung ETS của Hyndman (FPP3 chương 8), mô hình ETS(A,A,A)
và ETS(A,Ad,A). Cùng chuỗi, cùng tham số, cùng giá trị khởi tạo thì giá trị khớp một bước và dự báo 30 ngày
phải trùng nhau. Quy đổi tham số: dạng sai số dùng β_ETS = α·β (FPP3 mục 8.5), α và γ giữ nguyên.

Thêm phần tham khảo: lớp ExponentialSmoothing (Holt-Winters cũ của statsmodels) cho giá trị khớp trùng hẳn, nhưng
dự báo ngày thứ m, 2m, ... lấy mùa vụ của chu kỳ trước thay cho s_T vừa cập nhật như công thức FPP3 mục 8.3,
nên chỉ các ngày đó lệch. Script in ra để thấy rõ, không tính là lỗi.

Chạy: node scripts/forecast-compare/export.js && scripts/forecast-compare/.venv/Scripts/python -I scripts/forecast-compare/compare.py
"""
import json
import pathlib
import sys
import warnings

import numpy as np
from statsmodels.tsa.exponential_smoothing.ets import ETSModel
from statsmodels.tsa.holtwinters import ExponentialSmoothing

warnings.filterwarnings("ignore")
sys.stdout.reconfigure(encoding="utf-8")
data = json.loads((pathlib.Path(__file__).parent / "series.json").read_text(encoding="utf-8"))
y = np.array(data["y"], dtype=float)
worst = 0.0
for case in data["cases"]:
    p, init = case["params"], case["init"]
    damped = p["phi"] < 1
    ets = ETSModel(y, error="add", trend="add", seasonal="add", seasonal_periods=7, damped_trend=damped,
                   initialization_method="known", initial_level=init["level"], initial_trend=init["trend"], initial_seasonal=init["seasonal"])
    fixed = {"smoothing_level": p["alpha"], "smoothing_trend": p["alpha"] * p["beta"], "smoothing_seasonal": p["gamma"]}
    if damped:
        fixed["damping_trend"] = p["phi"]
    with ets.fix_params(fixed):
        res = ets.fit(disp=False)
    fit_diff = np.max(np.abs(res.fittedvalues - np.array(case["fitted"])))
    fc_diff = np.max(np.abs(res.forecast(30) - np.array(case["forecast"])))
    worst = max(worst, fit_diff, fc_diff)
    print(f"ETSModel, {case['name']}: lệch giá trị khớp {fit_diff:.6f}đ, lệch dự báo 30 ngày {fc_diff:.6f}đ")

    hw = ExponentialSmoothing(y, trend="add", seasonal="add", seasonal_periods=7, damped_trend=damped, initialization_method="known",
                              initial_level=init["level"], initial_trend=init["trend"], initial_seasonal=init["seasonal"])
    old = hw.fit(smoothing_level=p["alpha"], smoothing_trend=p["beta"], smoothing_seasonal=p["gamma"], damping_trend=p["phi"] if damped else None, optimized=False)
    diff = np.abs(old.forecast(30) - np.array(case["forecast"]))
    days = [int(i) + 1 for i in np.nonzero(diff > 0.01)[0]]
    print(f"  ExponentialSmoothing (tham khảo): lệch giá trị khớp {np.max(np.abs(old.fittedvalues - np.array(case['fitted']))):.6f}đ, dự báo lệch ở các ngày {days}")
print(f"Lệch lớn nhất so với ETSModel: {worst:.6f}đ")
raise SystemExit(0 if worst < 0.01 else 1)
