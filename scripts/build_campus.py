# OSM → 3D 캠퍼스 조감도용 데이터 (src/assets/campus.json)
# 좌표: 캠퍼스 경계 중심을 원점으로 한 미터 단위 (x = 동쪽, z = 남쪽)
import json, math

def dp(pts, eps):
    # Douglas-Peucker 단순화
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]
    dx, dz = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dz) or 1e-9
    i, dmax = 0, 0
    for k in range(1, len(pts) - 1):
        d = abs(dz * (pts[k][0] - a[0]) - dx * (pts[k][1] - a[1])) / L
        if d > dmax: i, dmax = k, d
    if dmax > eps:
        return dp(pts[:i + 1], eps)[:-1] + dp(pts[i:], eps)
    return [a, b]

def ring(pts, eps):
    # 닫힌 고리: 첫 점에서 가장 먼 점으로 둘로 나눠 각각 단순화한다 (첫 점 = 끝 점이면 그냥은 안 된다)
    if pts[0] == pts[-1]: pts = pts[:-1]
    if len(pts) < 4: return pts
    far = max(range(len(pts)), key=lambda k: (pts[k][0] - pts[0][0]) ** 2 + (pts[k][1] - pts[0][1]) ** 2)
    a = dp(pts[:far + 1], eps); b = dp(pts[far:] + [pts[0]], eps)
    return a[:-1] + b[:-1]

def area(p):
    return abs(sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p)))) / 2

out = {}
for name, uni_name in [('seoul', '한양대학교 서울캠퍼스'), ('erica', '한양대학교 ERICA캠퍼스')]:
    els = json.load(open(f'osm-{name}.json'))['elements']
    uni = next(e for e in els if e.get('tags', {}).get('name') == uni_name)
    lat0 = sum(g['lat'] for g in uni['geometry']) / len(uni['geometry'])
    lon0 = sum(g['lon'] for g in uni['geometry']) / len(uni['geometry'])
    kx = 111320 * math.cos(math.radians(lat0)); kz = 110540
    P = lambda g: [round((g['lon'] - lon0) * kx, 1), round(-(g['lat'] - lat0) * kz, 1)]
    flat = lambda pts: [v for p in pts for v in p]
    o = {'uni': flat(ring([P(g) for g in uni['geometry']], 2)), 'b': [], 'r': [], 'g': [], 'w': []}
    for e in els:
        if e['type'] != 'way' or 'geometry' not in e: continue
        t = e.get('tags', {})
        pts = [P(g) for g in e['geometry']]
        if 'building' in t:
            pts = ring(pts, 0.8)
            if len(pts) < 3 or area(pts) < 25: continue
            lv = t.get('building:levels'); h = t.get('height')
            try: hh = float(h) if h else float(lv) * 3.6 if lv else None
            except ValueError: hh = None
            if hh is None: hh = 7 + min(30, area(pts) / 120)  # 층수 정보가 없으면 면적으로 대충
            o['b'].append([round(min(hh, 120), 1)] + flat(pts))
        elif 'highway' in t:
            hw = t['highway']
            if hw in ('footway', 'steps', 'path', 'corridor', 'pedestrian', 'service', 'cycleway', 'track'): w = 0
            elif hw in ('primary', 'secondary', 'trunk', 'motorway', 'tertiary', 'primary_link', 'secondary_link'): w = 2
            else: w = 1
            o['r'].append([w] + flat(dp(pts, 1.5)))
        elif t.get('leisure') in ('park', 'garden', 'pitch', 'playground', 'track', 'stadium') or t.get('landuse') in ('grass', 'forest', 'recreation_ground', 'meadow') or t.get('natural') in ('wood', 'scrub', 'grassland'):
            if pts[0] == pts[-1] and len(pts) > 3: o['g'].append(flat(ring(pts, 1.5)))
        elif t.get('natural') == 'water' or t.get('waterway') or t.get('landuse') == 'reservoir':
            if pts[0] == pts[-1] and len(pts) > 3: o['w'].append(flat(ring(pts, 1.5)))
    print(name, {k: len(v) for k, v in o.items()})
    out[name] = o
json.dump(out, open('../src/assets/campus.json', 'w'), separators=(',', ':'))
