# 한양대 서울·ERICA 캠퍼스 주변 OSM 데이터(건물·길·녹지·물)를 받는다 → osm-<name>.json
import json, sys, time, urllib.parse, urllib.request
BOXES = {
    'seoul': '37.5525,127.0390,37.5625,127.0510',
    'erica': '37.2905,126.8260,37.3035,126.8440',
}
for name, B in BOXES.items():
    q = f'''[out:json][timeout:120];
(way["building"]({B}); relation["building"]({B});
 way["highway"]({B});
 way["landuse"]({B}); way["leisure"]({B}); way["natural"]({B}); way["waterway"]({B});
 way["amenity"="university"]({B}); relation["amenity"="university"]({B}););
out geom tags;'''
    for i in range(6):
        try:
            d = json.loads(urllib.request.urlopen(urllib.request.Request('https://overpass-api.de/api/interpreter?data=' + urllib.parse.quote(q), headers={'User-Agent': 'hyu-love-in-deed/1.0'}), timeout=180).read())
            break
        except Exception as e:
            print('retry', e, file=sys.stderr); time.sleep(10)
    json.dump(d, open(f'osm-{name}.json', 'w'), ensure_ascii=False)
    print(name, len(d['elements']))
