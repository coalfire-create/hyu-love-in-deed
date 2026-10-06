# 연표 무대용 실제 건물 윤곽 (OSM) → src/assets/eras.json
# 1959 서울 본관 · 1979 ERICA 본관 · 2026 한양종합기술연구원(HIT). 미터 단위, 건물 중심이 원점
import json, math
pick = [('seoul', '본관', 1959), ('erica', '본관', 1979), ('seoul', '한양종합기술연구원(HIT)', 2026)]
out = {}
for camp, name, year in pick:
    els = json.load(open(f'osm-{camp}.json'))['elements']
    e = next(x for x in els if x.get('tags', {}).get('name') == name and 'building' in x['tags'])
    lat0 = sum(g['lat'] for g in e['geometry']) / len(e['geometry'])
    lon0 = sum(g['lon'] for g in e['geometry']) / len(e['geometry'])
    kx = 111320 * math.cos(math.radians(lat0)); kz = 110540
    pts = [[round((g['lon'] - lon0) * kx, 2), round(-(g['lat'] - lat0) * kz, 2)] for g in e['geometry']]
    if pts[0] == pts[-1]: pts = pts[:-1]
    t = e['tags']
    out[str(year)] = {'name': name, 'levels': t.get('building:levels'), 'height': t.get('height'), 'pts': pts}
    xs = [p[0] for p in pts]; zs = [p[1] for p in pts]
    print(year, name, len(pts), round(max(xs) - min(xs)), round(max(zs) - min(zs)), t.get('building:levels'))
json.dump(out, open('../src/assets/eras.json', 'w'), ensure_ascii=False, separators=(',', ':'))
