// 위치 한 줄의 명소 좌표 대조(출시 전 사실 확인, 설계서 15장): src/data/place-lines.json 의 at 좌표는 사람이 아는 값을 적은 것이라,
// 파이프라인은 '그 좌표가 그 시·군·구 안'까지만 본다. 여기서는 OpenStreetMap Nominatim 이 같은 이름으로 찾은 곳이
// 채움지도 경계로 어느 시·군·구 안에 드는지 재서, 원고가 말한 곳과 같은지 본다(OSM 의 주소 칸은 섬·산에서 비어 있어 쓰지 않음).
// - 같은 이름이 전국에 있으므로 우리 좌표에서 40km 안의 결과만 쓴다. 가게·음식점·버스 정류장·신호등처럼 이름만 빌린 것은 뺀다
// - 판정: 같음(남은 결과 가운데 하나라도 그곳 안) / 다름(남은 결과가 모두 다른 곳) / 못 찾음 → 다름·못 찾음만 사람이 본다
// OSM 결과는 대조에만 쓰고 사이트에 싣지 않는다(ODbL). 요청은 1.2초에 하나, 결과는 .cache/landmarks-osm/ 에 저장해 다시 묻지 않는다
// node tools/check-landmarks.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LINES = JSON.parse(fs.readFileSync(path.join(root, 'src/data/place-lines.json'), 'utf8'));
const CACHE = path.join(root, '.cache/landmarks-osm');
fs.mkdirSync(CACHE, { recursive: true });
const UA = 'chaeumjido-factcheck/1.0 (one-off landmark check)';
// 검색이 안 되는 이름은 다른 이름으로도 묻는다
const MORE = {
  '강화 부근리 고인돌': ['부근리 고인돌', '강화 지석묘', '부근리 지석묘', '강화 고인돌', 'Ganghwa Dolmen'],
  '부천시청역(7호선)': ['부천시청', 'Bucheon City Hall Station'],
  배곧신도시: ['배곧', '배곧생명공원'],
  '중앙역(4호선)': ['안산 중앙역', 'Jungang Station'],
  '의정부 부대찌개 거리': ['의정부부대찌개거리', '부대찌개거리'],
  '전곡리 선사유적': ['전곡리 유적', '전곡선사박물관', '연천 전곡리 유적'],
  연평도: ['대연평도', '연평면'],
  광명역: ['KTX광명역', '광명역 KTX', 'Gwangmyeong Station'],
  오산역: ['오산역 1호선', 'Osan Station'],
  연세대: ['연세대학교', 'Yonsei University'],
  예술의전당: ['예술의 전당', 'Seoul Arts Center'],
  '사우(김포시청)역': ['Sau Station'],
  평촌역: ['Pyeongchon Station'],
  경기도청: ['경기도청 광교신청사', 'Gyeonggi Provincial Government'],
  문학경기장: ['인천문학경기장', 'Incheon Munhak Stadium', '문학야구장'],
};
const NOISE = /^(shop|amenity\/(restaurant|cafe|fast_food|bar|pub)|highway\/(bus_stop|traffic_signals|crossing|path|footway|residential|service|toll_gantry)|office|craft)/;

// 채움지도 경계(서울·인천 시·군·구, 경기 시·군)
const ver = fs.readdirSync(path.join(root, 'public/data/geo')).sort().at(-1);
const polys = [];
for (const [rk, layer] of [['seoul', 'sgg'], ['incheon', 'sgg'], ['gyeonggi', 'si']]) {
  const topo = JSON.parse(fs.readFileSync(path.join(root, `public/data/geo/${ver}/${rk}-sgg.topo.json`), 'utf8'));
  for (const f of feature(topo, topo.objects[layer]).features) {
    const g = f.geometry;
    polys.push({ name: f.properties.siName, rings: g.type === 'Polygon' ? [g.coordinates] : g.coordinates });
  }
}
const inRing = (ring, x, y) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const placeAt = (lon, lat) => polys.find((p) => p.rings.some((poly) => inRing(poly[0], lon, lat) && !poly.slice(1).some((h) => inRing(h, lon, lat))))?.name ?? '수도권 밖·바다';
const km = (a, b) => Math.hypot((a[0] - b[0]) * 88.4, (a[1] - b[1]) * 110.5);

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
let last = 0;
async function search(q) {
  const file = path.join(CACHE, encodeURIComponent(q) + '.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const wait = last + 1200 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=10&countrycodes=kr&addressdetails=1&accept-language=ko`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${q}: HTTP ${res.status}`);
  const json = await res.json();
  fs.writeFileSync(file, JSON.stringify(json));
  return json;
}
// 괄호 풀이: '사우(김포시청)역' → ['사우역', '김포시청역'], '부천역(1호선)' → ['부천역']
function queries(name) {
  const m = name.match(/^(.*?)\((.*?)\)(.*)$/);
  const out = [];
  if (!m) out.push(name);
  else {
    const [, a, inner, b] = m;
    out.push(`${a}${b}`.trim());
    if (!/호선|선$|분당/.test(inner)) out.push(b ? `${inner}${b}` : inner);
  }
  return [...out, ...(MORE[name] ?? [])];
}

const rows = [];
for (const [rk, places] of Object.entries(LINES)) {
  if (rk.startsWith('_')) continue;
  for (const [place, v] of Object.entries(places)) {
    for (const [name, lon, lat] of v.at ?? []) {
      const seen = new Set();
      const cands = [];
      for (const q of queries(name)) {
        for (const r of await search(q)) {
          const type = `${r.category}/${r.type}`;
          const pt = [+r.lon, +r.lat];
          if (seen.has(r.place_id) || NOISE.test(type) || km(pt, [lon, lat]) > 40) continue;
          seen.add(r.place_id);
          cands.push({ q, type, pt, in: placeAt(...pt), d: km(pt, [lon, lat]) });
        }
      }
      const same = cands.filter((c) => c.in === place).sort((a, b) => a.d - b.d);
      rows.push({ region: rk, place, name, lon, lat, verdict: same.length ? '같음' : cands.length ? '다름' : '못 찾음', near: same[0] ?? null, cands });
    }
  }
}
const by = (v) => rows.filter((r) => r.verdict === v);
console.log(`명소 ${rows.length}곳: 같음 ${by('같음').length} · 다름 ${by('다름').length} · 못 찾음 ${by('못 찾음').length} (OSM 이 찾은 곳이 원고의 시·군·구 안인가)`);
for (const r of by('같음').filter((r) => r.near.d > 1)) console.log(`  같음, 다만 ${r.near.d.toFixed(1)}km 떨어짐  ${r.place} '${r.name}' 우리 [${r.lon}, ${r.lat}] · OSM ${r.near.type} [${r.near.pt.map((x) => x.toFixed(4)).join(', ')}]`);
for (const r of by('다름')) console.log(`  다름  ${r.place} '${r.name}' 우리 [${r.lon}, ${r.lat}] · OSM: ${r.cands.map((c) => `${c.type} → ${c.in} ${c.d.toFixed(1)}km`).join(' / ')}`);
for (const r of by('못 찾음')) console.log(`  못 찾음  ${r.place} '${r.name}' [${r.lon}, ${r.lat}] (물은 말: ${queries(r.name).join(', ')})`);
fs.writeFileSync(path.join(CACHE, '_result.json'), JSON.stringify(rows, null, 1));
