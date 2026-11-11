# Tính lại cùng bộ luật bằng scikit-fuzzy rồi so với bộ suy luận Node (cần: pip install scikit-fuzzy numpy scipy packaging)
import json
import os
import numpy as np
import skfuzzy as fuzz

HERE = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(HERE, 'grid.json'), encoding='utf-8'))
V, RULES = data['variables'], data['rules']
universe = np.arange(0, 100.0001, 0.25)
out_mf = {k: fuzz.trapmf(universe, s['points']) for k, s in V['level']['sets'].items()}


def degree(var, key, x):
    if key == '*':
        return 1.0
    p = V[var]['sets'][key]['points']
    grid = np.array([V[var]['min'], *p, V[var]['max']], dtype=float)
    u = np.unique(np.concatenate([np.linspace(V[var]['min'], V[var]['max'], 4001), grid]))
    return float(fuzz.interp_membership(u, fuzz.trapmf(u, p), x))


worst = 0
rows = []
for pt in data['points']:
    agg = np.zeros_like(universe)
    for r in RULES[pt['state']]:
        w = min(degree('lux', r['lux'], pt['lux']), degree('activity', r['activity'], pt['activity']))
        agg = np.fmax(agg, np.fmin(w, out_mf[r['level']]))
    sk = fuzz.defuzz(universe, agg, 'centroid') if agg.sum() > 0 else 0.0
    diff = abs(sk - pt['centroid'])
    worst = max(worst, diff)
    rows.append((pt['state'], pt['lux'], pt['activity'], pt['centroid'], sk, diff))

print('so diem', len(rows))
print('sai khac lon nhat (diem %):', round(worst, 4))
print('sai khac trung binh:', round(sum(r[5] for r in rows) / len(rows), 4))
for case in [('ACTIVE', 25, 0.0), ('ACTIVE', 25, 2.5), ('ACTIVE', 25, 8.0), ('ACTIVE', 250, 8.0), ('ACTIVE', 125, 8.0), ('IDLE', 25, 8.0), ('PREPARING', 25, 0.0)]:
    r = next(x for x in rows if x[:3] == case)
    print(f'{case[0]:9s} lux {case[1]:4d} hoat dong {case[2]:4.1f}: Node {r[3]:7.3f} | scikit-fuzzy {r[4]:7.3f}')
