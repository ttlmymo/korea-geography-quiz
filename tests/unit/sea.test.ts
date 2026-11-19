// 바다 표현(2026-11-17 사용자 결정 '모든 지도에 바다를 표현, 바다 색은 강보다 조금 더 파란색, 바다 이름을 넣는다' — docs/SEA_PLAN_2026-11-16.md):
//  · 색: 바다색·이웃 땅·강이 다른 토큰이고 물 이름 글자가 바다색 위에서 읽힌다
//  · 어느 바다인가(map/sea.ts seaOf)와 이름(한·영)
//  · 이웃 땅: 잘린 변 밖으로 늘린 땅(shapes.ts extendRects), 먼 이웃 땅(topo far 층 — pipeline farLand)이 화면에 보이는 둘레 땅을 덮는다
//  · 땅 판정 격자(landMask)와 바다 이름 자리(seaSpots), 이 지도가 닿는 바다(coastSeas — 닿는 바다 이름만)
//  · 지도가 그리는 차례·피하는 것(svgmap 소스)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import * as topojson from 'topojson-client';
import { DATA_VER } from '../../src/consts.ts';
import { buildShapes, extendRects, specOf, type Shapes, type Topology } from '../../src/app/map/shapes.ts';
import { SEA_GAP_PX, SEA_KO, coastSeas, landMask, maskAt, outDIn, seaCode, seaOf, seaSpots, type SeaKey } from '../../src/app/map/sea.ts';
import { locBase, locFrame } from '../../src/app/map/locator.ts';
import { inside } from '../../src/app/map/poly.ts';
import { boxOf, project, unproject, type Box } from '../../src/app/map/project.ts';
import { UI_EN, UI_KO } from '../../src/app/text/ui.ts';
import type { LabelsFile } from '../../src/app/types.ts';
import { geo, reg } from './fixtures.ts';

const ROOT = path.join(import.meta.dirname, '../..');
const VER = path.join(ROOT, 'public/data/geo', DATA_VER);
const src = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const topoAt = (f: string): Topology => JSON.parse(fs.readFileSync(path.join(VER, f), 'utf8'));
const gz9 = (f: string) => zlib.gzipSync(fs.readFileSync(path.join(VER, f)), { level: 9 }).length;
const regionShapes = (key: string): Shapes => buildShapes(topoAt(`${key}-sgg.topo.json`), specOf(reg.region(key)!), geo.labels);
const koreaShapes = (): Shapes => {
  const t = topoAt('sido.topo.json');
  const gs = t.objects.sido.geometries;
  const labels: LabelsFile = Object.fromEntries(gs.map((g) => [g.properties!.id, (g.properties as unknown as { l: [number, number, number] }).l]));
  return buildShapes(t, { layer: 'sido', idKey: 'id', ids: gs.map((g) => g.properties!.id), far: false }, labels);
};
/** topo 의 층 하나를 고리(지도 단위)로 */
const ringsOf = (t: Topology, layer: string): Float64Array[] => {
  if (!t.objects[layer]) return [];
  const out: Float64Array[] = [];
  for (const f of (topojson.feature(t as never, t.objects[layer] as never) as unknown as { features: { geometry: { type: string; coordinates: number[][][][] | number[][][] } }[] }).features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates as number[][][]] : (f.geometry.coordinates as number[][][][]);
    for (const p of polys) for (const r of p) out.push(Float64Array.from(r.flatMap(([lon, lat]) => project(lon, lat))));
  }
  return out;
};
/** 경도·위도 점이 지도 파일의 땅(칸 층·이웃 땅·먼 이웃 땅) 안인가 — 이웃 땅과 먼 이웃 땅은 겹칠 수 있어 따로 본다 */
const onLand = (t: Topology, layers: string[], lon: number, lat: number) => { const [x, y] = project(lon, lat); return layers.some((l) => { const r = ringsOf(t, l); return r.length > 0 && inside(r, x, y); }); };
const lum = (hex: string) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const token = (css: string, name: string) => { const m = new RegExp(`${name}: (#[0-9A-Fa-f]{6});`).exec(css); assert.ok(m, `토큰 ${name}`); return m![1]; };

test('색 토큰: 바다는 강·이웃 땅과 다른 색이고, 물 이름 글자와 맥락 이름 글자가 바다색 위에서 4.5:1 을 넘는다', () => {
  const css = src('src/styles/tokens.css');
  const sea = token(css, '--map-sea'), water = token(css, '--map-water'), out = token(css, '--map-out'), bg = token(css, '--map-bg'), ink = token(css, '--map-water-ink'), ink2 = token(css, '--ink-2');
  assert.equal(sea, '#A3CDF2');
  assert.equal(water, '#BEDCF3', '강 색은 그대로');
  assert.equal(out, '#EFF1EE', '이웃 땅은 면색 그대로');
  assert.equal(bg, '#EFF1EE', '지도 칸 자리(받기 전)는 면색 그대로');
  // '강보다 조금 더 파란색': 강보다 어둡고 파란 쪽 — 빨강·초록이 더 낮고 파랑은 거의 같다
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [sr, sg, sb] = rgb(sea), [wr, wg, wb] = rgb(water);
  assert.ok(sr < wr && sg < wg && Math.abs(sb - wb) <= 4 && wr - sr >= 16 && wr - sr <= 40, `${sea} ↔ ${water}`);
  assert.ok(contrast(sea, ink) >= 4.5, `물 이름 글자 ${contrast(sea, ink).toFixed(2)}`);
  assert.ok(contrast(water, ink) >= 4.5 && contrast(out, ink) >= 4.5);
  assert.ok(contrast(sea, ink2) >= 4.5, `맥락 이름 글자(--ink-2) ${contrast(sea, ink2).toFixed(2)}`);
  // 지도 CSS: 바탕은 바다색, 이웃 땅은 이웃 땅색, 맥락 이름은 --ink-2, 바다 이름은 물 이름 색, 상자 그림·위치 지도 바탕도 바다색, 축척 막대는 흰 바탕
  const map = src('src/app/map/map.css');
  assert.match(map, /\.cmap \{[^}]*background: var\(--map-sea\);/);
  assert.match(map, /\.cm-out-fill \{ fill: var\(--map-out\); \}/);
  assert.match(map, /\.cm-ctxname text \{[^}]*fill: var\(--ink-2\);/);
  assert.match(map, /\.cm-seaname text \{[^}]*fill: var\(--map-water-ink\);/);
  assert.match(map, /\.cm-seaname\.ko text \{ letter-spacing: \.3em; \}/);
  assert.match(map, /\.cm-inset-svg \{ display: block; background: var\(--map-sea\); \}/);
  // 먼 섬 상자 틀 안(그림 양옆에 남는 자리)도 바다색, 아래 글 칸은 흰 바탕
  assert.match(map, /\.cm-inset \{[^}]*background: var\(--map-sea\); border: 1px solid var\(--ink\);/);
  assert.match(map, /\.cm-inset-note \{[^}]*background: var\(--white\);/);
  assert.match(map, /\.cm-inset-svg \.cm-out-fill \{ stroke: none; \}/);
  assert.match(map, /\.cm-loc \{[^}]*background: var\(--map-sea\);/);
  assert.match(map, /\.cm-loc-out \{ fill: var\(--map-out\); \}/);
  assert.match(map, /\.cm-scale \{[^}]*background: var\(--white\);/);
  // 홈·쪽 지도 칸(#app .h-map — 더 센 규칙)도 지도가 붙으면 바다색, 정적 쪽 지도도 같은 토큰
  assert.match(src('src/app/ui/app.css'), /#app \.h-map\.cmap \{ background: var\(--map-sea\); \}/);
  // 섬 상자 격자(본 지도가 숨는 지도 — svgmap 이 isle-grid 를 붙인다)는 상자 밖이 빈 자리라 면색 그대로
  assert.match(map, /\.cmap\.isle-grid \{ background: var\(--map-bg\); \}/);
  assert.match(src('src/app/ui/app.css'), /#app \.h-map\.cmap\.isle-grid \{ background: var\(--map-bg\); \}/);
  assert.match(src('src/app/map/svgmap.ts'), /host\.classList\.toggle\('isle-grid', grid\);/);
  const rm = src('src/components/RegionMap.astro');
  assert.match(rm, /\.rmap \{[^}]*background: var\(--map-sea\);/);
  assert.match(rm, /\.bg \{ fill: var\(--map-sea\); \}\n\s*\.out \{ fill: var\(--map-out\); \}/);
});

test('어느 바다인가(seaOf): 서해·남해·동해와 경계 둘레 띠 · 이름은 한국어 황해·남해·동해, 영어 Yellow Sea·South Sea·East Sea', () => {
  const at: [string, number, number, SeaKey | null][] = [
    ['인천 앞', 126.2, 37.3, 'w'], ['태안 앞', 126.0, 36.7, 'w'], ['군산 앞', 126.3, 35.9, 'w'], ['영광 앞', 126.2, 35.3, 'w'], ['목포 앞', 126.2, 34.8, 'w'], ['신안 비금도 서쪽', 125.7, 34.7, 'w'],
    ['진도 남서쪽', 125.9, 34.2, 'w'], ['진도 남서쪽 먼바다', 125.9, 33.9, 'w'], ['제주 북서쪽', 126.0, 33.6, null], ['흑산도', 125.4, 34.68, 'w'], ['백령도 남쪽', 124.7, 37.8, 'w'],
    ['해남 땅끝 둘레', 126.55, 34.25, null], ['해남 반도', 126.58, 34.5, null],
    ['완도 남쪽', 126.9, 34.2, 's'], ['강진만', 126.75, 34.5, 's'], ['고흥 남쪽', 127.3, 34.4, 's'], ['여수 남쪽', 127.75, 34.5, 's'], ['남해도 남쪽', 127.95, 34.65, 's'], ['거제 남쪽', 128.65, 34.6, 's'],
    ['진해만', 128.7, 35.05, 's'], ['부산 다대포 앞', 128.95, 35.0, 's'], ['제주해협', 126.6, 33.8, 's'], ['제주 남쪽', 126.5, 33.1, 's'], ['추자도 둘레', 126.5, 33.95, 's'],
    ['부산 오륙도·해운대 앞', 129.14, 35.12, null], ['대마도 남동쪽', 129.6, 34.2, null], ['제주 서쪽 먼바다', 125.5, 33.3, null],
    // 나라 밖 쪽 한계: 대마도 동쪽(일본 야마구치 앞) · 중국 산둥 앞 · 발해 · 제주 남쪽 먼바다(동중국해)에는 이름을 두지 않는다. 부산과 대마도 사이는 남해
    ['대마도 북동쪽', 129.8, 34.6, null], ['일본 야마구치 앞', 130.4, 34.6, null], ['중국 산둥 앞', 122.5, 37.0, null], ['발해', 120.5, 38.5, null], ['제주 남쪽 먼바다', 126.5, 32.5, null],
    ['부산과 대마도 사이', 129.15, 34.7, 's'], ['서해 한가운데', 124.0, 36.0, 'w'],
    ['부산 기장 앞', 129.3, 35.2, 'e'], ['울산 앞', 129.5, 35.5, 'e'], ['포항 앞', 129.6, 36.1, 'e'], ['울릉도 둘레', 130.7, 37.4, 'e'], ['속초 앞', 128.8, 38.2, 'e'], ['독도 둘레', 131.8, 37.3, 'e'],
  ];
  for (const [name, lon, lat, want] of at) assert.equal(seaOf(lon, lat), want, `${name} (${lon}, ${lat})`);
  assert.deepEqual(SEA_KO, { w: '황해', s: '남해', e: '동해' });
  for (const k of ['w', 's', 'e'] as const) {
    const cell = { sido: seaCode(k), text: SEA_KO[k] };
    assert.equal(UI_KO.ctxName(cell), SEA_KO[k]);
    assert.equal(UI_EN.ctxName(cell), { w: 'Yellow Sea', s: 'South Sea', e: 'East Sea' }[k], '영어 지도에 한글 바다 이름을 두지 않는다');
  }
});

test('늘린 땅(extendRects): 잘린 변 위에 놓인 선분만 밖으로 늘린다 — 변에 한 점만 닿은 땅은 늘리지 않고, 두 변이 땅으로 끝나는 모서리는 바깥도 땅', () => {
  const sq = (x0: number, y0: number, x1: number, y1: number) => Float64Array.from([x0, y0, x1, y0, x1, y1, x0, y1, x0, y0]);
  const box: Box = [0, 0, 100, 100];
  // 위쪽 변에 20~60 으로 닿은 땅, 오른쪽 변에 한 점(100, 50)만 닿은 세모, 왼쪽 아래 모서리를 낀 땅
  const rects = extendRects([sq(20, 0, 60, 30), Float64Array.from([100, 50, 80, 40, 80, 60, 100, 50]), sq(0, 70, 30, 100)], box);
  const hit = (x: number, y: number) => rects.some((r) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]);
  assert.ok(hit(40, -50) && !hit(10, -50) && !hit(70, -50), '위쪽: 20~60 구간만');
  assert.ok(!hit(150, 50) && !hit(150, 45), '오른쪽: 한 점만 닿은 땅은 늘리지 않는다(전에는 가는 띠가 뻗었다)');
  assert.ok(hit(-50, 85) && !hit(-50, 50), '왼쪽: 70~100 구간');
  assert.ok(hit(15, 150) && !hit(50, 150), '아래쪽: 0~30 구간');
  assert.ok(hit(-50, 150), '왼쪽 아래 모서리 바깥');
  assert.ok(!hit(-50, -50) && !hit(150, 150), '다른 모서리는 바다');
  assert.deepEqual(extendRects([], box), []);
  // 실제 판: 전국 지도는 칸(독도·백령도)이 상자 끝을 정하지만 이웃 땅만 본다 — 독도·백령도에서 뻗는 띠가 없다
  const K = koreaShapes();
  const dokdo = project(131.87, 37.24), baengnyeong = project(124.62, 37.95);
  assert.ok(!K.outExt.some((r) => dokdo[0] + 30000 >= r[0] && dokdo[0] + 30000 <= r[2] && dokdo[1] >= r[1] && dokdo[1] <= r[3]), '독도 동쪽');
  assert.ok(!K.outExt.some((r) => baengnyeong[0] - 30000 >= r[0] && baengnyeong[0] - 30000 <= r[2] && baengnyeong[1] >= r[1] && baengnyeong[1] <= r[3]), '백령도 서쪽');
});

test('먼 이웃 땅(topo far 층): 화면에 보이는 둘레 땅을 덮는다 — 전국 지도의 일본·중국·북한 북부, 인천 먼 섬 둘레의 북한, 신안 둘레의 본토, 전남광주 아래 제주', () => {
  const korea = topoAt('sido.topo.json');
  for (const [name, lon, lat] of [['대마도', 129.33, 34.4], ['후쿠오카', 130.4, 33.59], ['이키섬', 129.72, 33.78], ['시모노세키 북쪽', 131.0, 34.2], ['중국 산둥 웨이하이', 122.1, 37.3], ['신의주', 124.5, 40.0], ['함흥', 127.5, 39.95]] as const) {
    assert.ok(onLand(korea, ['far'], lon, lat), `전국 지도 ${name}`);
  }
  assert.ok(onLand(korea, ['out'], 125.75, 39.0), '평양은 전처럼 이웃 땅(북위 39.4도 아래)');
  assert.ok(!onLand(korea, ['out', 'far', 'sido'], 130.5, 36.5) && !onLand(korea, ['out', 'far', 'sido'], 125.0, 35.5), '동해·서해 가운데는 바다');
  // 인천: 먼 섬(백령·대청·연평) 둘레의 북한 땅 — 이웃 땅은 동경 125.63도에서 잘린다
  const icn = topoAt('incheon-sgg.topo.json');
  assert.ok(!onLand(icn, ['out'], 125.35, 37.95) && onLand(icn, ['far'], 125.35, 37.95), '옹진반도');
  assert.ok(onLand(icn, ['far'], 125.0, 38.1), '장산곶');
  // 신안군 단원 지도: 이웃 땅은 맞닿은 무안군뿐 — 목포·해남·진도는 먼 이웃 땅
  const sinan = topoAt('emd/12870.topo.json');
  assert.deepEqual(sinan.objects.out.geometries.map((g) => g.properties!.name), ['무안군']);
  for (const [name, lon, lat] of [['목포', 126.39, 34.8], ['해남읍', 126.6, 34.57], ['진도읍', 126.26, 34.48], ['영암', 126.7, 34.8]] as const) assert.ok(onLand(sinan, ['far'], lon, lat), `신안 지도 ${name}`);
  // 전남광주 지역 지도: 제주도는 이웃 땅이 북위 33.36도에서 잘린다 — 그 아래는 먼 이웃 땅
  const jg = topoAt('jeonnam-gwangju-sgg.topo.json');
  assert.ok(onLand(jg, ['out'], 126.53, 33.5) && onLand(jg, ['far'], 126.56, 33.27), '제주시 · 서귀포');
  // 사방이 바다뿐인 지도는 far 층이 없다
  assert.equal(topoAt('emd/47940.topo.json').objects.far, undefined, '울릉군');
  // 자기 것은 먼 이웃 땅에 넣지 않는다(칸 해안 밖으로 거친 땅이 삐져나오지 않게): 서울 지도의 서울 시청, 종로구 지도의 종로구
  assert.ok(!onLand(topoAt('seoul-sgg.topo.json'), ['far'], 126.978, 37.566));
  assert.ok(!onLand(topoAt('emd/11110.topo.json'), ['far'], 126.98, 37.59));
});

test('판 파일: far 층은 호 목록 끝에 덧붙인 것(다른 층의 호와 섞이지 않는다) · 단원 과 파일 + 지도 파일 gz 는 40KB 안 · 전국 지도 gz 35KB 안', () => {
  const files = [...geo.units.regions.map((r) => `${r.key}-sgg.topo.json`), 'sido.topo.json', ...fs.readdirSync(path.join(VER, 'emd')).filter((f) => f.endsWith('.topo.json')).map((f) => `emd/${f}`)];
  const flat = (a: unknown): number[] => (Array.isArray(a) ? a.flatMap(flat) : [a as number]);
  let withFar = 0;
  for (const f of files) {
    const t = topoAt(f) as Topology & { objects: Record<string, { geometries: { arcs?: unknown }[] }> };
    if (!t.objects.far) continue;
    withFar++;
    const idx = (layer: string) => t.objects[layer].geometries.flatMap((g) => flat(g.arcs ?? [])).map((i) => (i < 0 ? ~i : i));
    const far = idx('far'), rest = Object.keys(t.objects).filter((k) => k !== 'far').flatMap(idx);
    assert.ok(far.length > 0 && Math.min(...far) > Math.max(-1, ...rest), `${f}: far 호는 다른 층 호 뒤`);
    assert.equal(Math.max(...far), t.arcs.length - 1, `${f}: far 호가 호 목록의 끝`);
    assert.equal(new Set(far).size, far.length, `${f}: 고리마다 호 하나`);
  }
  assert.ok(withFar >= files.length - 4, `far 층 ${withFar}/${files.length}`);
  for (const list of Object.values(geo.units.emdUnits!)) for (const u of list) {
    const pair = gz9(`emd/${u.code}.json`) + gz9(`emd/${u.code}.topo.json`);
    assert.ok(pair <= 40 * 1024, `${u.ko} 단원 두 파일 gz ${pair}B`);
  }
  assert.ok(gz9('sido.topo.json') <= 35 * 1024, `전국 지도 ${gz9('sido.topo.json')}B`);
});

test('칸 만들기(buildShapes): 먼 이웃 땅은 이웃 땅과 따로(farD·farRings) — 늘린 땅은 둘을 함께 본 상자에서', () => {
  const S = regionShapes('incheon');
  assert.ok(S.farD.startsWith('M') && S.farRings.length > 0 && S.outRings.length > 0);
  assert.ok(S.outBox && S.outBox[0] < project(125.0, 37.5)[0], '이웃 땅 상자가 먼 섬 둘레(동경 125도 서쪽)까지');
  assert.ok(!S.outD.includes(S.farD.slice(0, 40)), 'outD 에는 먼 이웃 땅을 넣지 않는다(path 를 따로 둔다)');
  // far 층이 없는 옛 판(캐시) 모양: 이웃 땅과 늘린 땅만으로 그린다
  const old = topoAt('incheon-sgg.topo.json');
  delete (old.objects as Record<string, unknown>).far;
  const O = buildShapes(old, specOf(reg.region('incheon')!), geo.labels);
  assert.equal(O.farD, '');
  assert.equal(O.farRings.length, 0);
  assert.ok(O.outD.length > 100 && O.outBox);
  // 섬 상자·먼 섬 상자에 그릴 조각: [먼 이웃 땅, 이웃 땅 + 늘린 땅] — 먼 섬 상자 범위에는 북한 땅이 든다
  const far = S.far!.box;
  const [fd, od] = outDIn(S, far);
  assert.ok(fd.startsWith('M') && fd.endsWith('Z'), '인천 먼 섬 상자 범위의 먼 이웃 땅(북한)');
  assert.equal(typeof od, 'string');
  const south = project(126.5, 31);   // 제주 남쪽 먼바다
  assert.deepEqual(outDIn(regionShapes('jeju'), [south[0], south[1], south[0] + 1000, south[1] + 1000]), ['', ''], '겹치는 것이 없으면 빈 글');
});

test('땅 판정 격자(landMask): 바다 0 · 땅 1(칸·이웃 땅·먼 이웃 땅·작은 섬) · 강 2 — 격자 밖은 늘린 땅 네모 안만 땅', () => {
  const at = (S: Shapes, lon: number, lat: number) => maskAt(landMask(S), ...project(lon, lat));
  const I = regionShapes('incheon');
  assert.equal(at(I, 126.0, 37.2), 0, '인천 앞바다');
  assert.equal(at(I, 126.45, 37.7), 1, '강화도(칸)');
  assert.equal(at(I, 127.0, 37.3), 1, '경기 내륙(이웃 땅)');
  assert.equal(at(I, 125.35, 37.95), 1, '옹진반도(먼 이웃 땅)');
  assert.equal(at(I, 124.66, 37.95), 1, '백령도(먼 섬 — 칸)');
  assert.equal(landMask(I), landMask(I), '지도마다 한 번');
  const S = regionShapes('seoul');
  assert.equal(at(S, 126.9937, 37.5172), 2, '한강(한남대교 부근)');
  assert.equal(at(S, 126.98, 37.57), 1);
  assert.equal(at(S, 127.2, 38.5), 1, '서울 지도는 사방이 땅 — 격자 밖도 늘린 땅');
  const K = koreaShapes();
  assert.equal(at(K, 130.5, 36.5), 0);
  assert.equal(at(K, 131.87, 37.24), 1, '독도 — 격자 칸보다 작은 섬도 변이 지나는 칸을 땅으로');
  assert.equal(at(K, 129.33, 34.4), 1, '대마도');
});

test('바다 이름 자리(seaSpots): 바다마다 하나, 그 바다의 빈자리에 — 막으면 비키거나 빠지고, 전에 둔 자리는 쓸 수 있으면 그대로, 바다가 없는 지도는 없다', () => {
  const K = koreaShapes(), mask = landMask(K);
  const u = 1500, view: Box = [K.box[0] - 40 * u, K.box[1] - 40 * u, K.box[2] + 40 * u, K.box[3] + 40 * u];
  const asks = (['w', 's', 'e'] as const).map((key) => ({ key, w: 41, h: 18 }));
  const base = { mask, view, u, asks, blocked: [] as Box[], ok: () => true };
  const got = seaSpots(base);
  assert.deepEqual(got.map((s) => s.key), ['w', 's', 'e']);
  for (const s of got) {
    assert.equal(seaOf(...unproject(s.x, s.y)), s.key, `${s.key} 자리의 바다`);
    // 글자 상자와 둘레 틈이 모두 바다
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) assert.equal(maskAt(mask, s.x + dx * (20.5 + SEA_GAP_PX) * u, s.y + dy * (9 + SEA_GAP_PX) * u), 0, `${s.key} 상자 (${dx}, ${dy})`);
    assert.ok(s.x > view[0] && s.x < view[2] && s.y > view[1] && s.y < view[3]);
  }
  assert.deepEqual(seaSpots(base), got, '같은 조건이면 같은 자리');
  // 찾는 바다만: 영어 이름이 빈 바다는 묻지 않는다
  assert.deepEqual(seaSpots({ ...base, asks: [asks[2]] }).map((s) => s.key), ['e']);
  // 서해 자리를 막으면(이름표·상자) 다른 자리로 — 막은 상자와 겹치지 않는다
  const w0 = got[0], wall: Box = [w0.x - 60 * u, w0.y - 40 * u, w0.x + 60 * u, w0.y + 40 * u];
  const moved = seaSpots({ ...base, blocked: [wall] }).find((s) => s.key === 'w')!;
  assert.ok(moved && (Math.abs(moved.x - w0.x) > (60 + 20.5) * u || Math.abs(moved.y - w0.y) > (40 + 9) * u), '막은 상자 밖');
  // 다각형 확인(ok)이 모두 떨어지면 그 바다는 빠진다
  assert.deepEqual(seaSpots({ ...base, ok: () => false }), []);
  // 전에 둔 자리: 조금 옮긴 보기에서도 빈 바다면 그대로(지도를 끌 때 이름이 옮겨 다니지 않게), 막히면 새로 고른다
  const shifted: Box = [view[0] + 11 * u, view[1] + 5 * u, view[2] + 11 * u, view[3] + 5 * u];
  const fresh = seaSpots({ ...base, view: shifted }), kept = seaSpots({ ...base, view: shifted, prev: got });
  assert.deepEqual(kept, got, '전 자리 그대로');
  assert.notDeepEqual(fresh, got, '전 자리가 없으면 새 범위에서 고른 자리');
  assert.notDeepEqual(seaSpots({ ...base, blocked: [wall], prev: got }).find((s) => s.key === 'w'), w0, '전 자리가 막히면 옮긴다');
  // 지시선(선)도 피한다
  const line: [number, number, number, number] = [w0.x - 200 * u, w0.y, w0.x + 200 * u, w0.y];
  const off = seaSpots({ ...base, lines: [line] }).find((s) => s.key === 'w')!;
  assert.ok(Math.abs(off.y - w0.y) > 9 * u, '지시선 위에 두지 않는다');
  // 바다가 보이지 않는 지도(서울)·너무 좁은 범위는 없다
  const S = regionShapes('seoul');
  assert.deepEqual(seaSpots({ ...base, mask: landMask(S), view: [S.box[0] - 20000, S.box[1] - 20000, S.box[2] + 20000, S.box[3] + 20000], u: 100 }), []);
  assert.deepEqual(seaSpots({ ...base, view: [w0.x - 10 * u, w0.y - 5 * u, w0.x + 10 * u, w0.y + 5 * u] }), []);
  // 지역 지도: 부산은 남해와 동해가 함께, 전남광주는 서해와 남해가 함께 보인다(넓은 화면)
  for (const [key, want, px] of [['busan', ['s', 'e'], 700], ['jeonnam-gwangju', ['w', 's'], 760], ['gangwon', ['e'], 700], ['jeju', ['s'], 700]] as const) {
    const R = regionShapes(key), b = boxOf(reg.region(key)!.fit), uu = (b[2] - b[0]) / px, pad = 30 * uu;
    const res = seaSpots({ mask: landMask(R), view: [b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad], u: uu, asks, blocked: [], ok: () => true });
    assert.deepEqual(res.map((s) => s.key), want, key);
  }
});

test('이 지도가 닿는 바다(coastSeas): 칸 전체 상자 안의 바다 — 닿는 바다가 있는 지도는 그 바다 이름만 낸다(멀리 보이는 다른 바다에는 이름을 두지 않는다), 내륙 지도는 빈 목록', () => {
  const want: [string, SeaKey[]][] = [
    ['seoul', []], ['daegu', []], ['daejeon', []], ['sejong', []], ['chungbuk', []],
    ['incheon', ['w']], ['gyeonggi', ['w']], ['chungnam', ['w']], ['jeonbuk', ['w']], ['jeonnam-gwangju', ['w', 's']],
    ['gyeongnam', ['s']], ['busan', ['s', 'e']], ['ulsan', ['e']], ['gyeongbuk', ['e']], ['gangwon', ['e']],
  ];
  for (const [key, seas] of want) assert.deepEqual(coastSeas(regionShapes(key)), seas, key);
  assert.equal(want.length + 1, geo.units.regions.length, '지역마다(제주는 아래에서 따로)');
  // 제주: 본섬 둘레는 남해. 칸 상자가 추자도까지라 그 서쪽 바다(서해)도 닿는 바다로 잡히지만 본섬 지도에는 보이지 않는다
  assert.ok(coastSeas(regionShapes('jeju')).includes('s'));
  assert.deepEqual(coastSeas(koreaShapes()), ['w', 's', 'e']);
  const K = koreaShapes();
  assert.equal(coastSeas(K), coastSeas(K), '지도마다 한 번');
  // 경남 칸 상자 끝에 살짝 걸친 부산 기장 앞바다(동해)는 닿은 것으로 치지 않는다 — 전에는 가로로 돌린 휴대폰 경남 지도에 '동해'만 보였다
  assert.ok(!coastSeas(regionShapes('gyeongnam')).includes('e'));
  // 지도가 묻는 바다: 닿는 바다가 있으면 그 바다만, 없으면 셋 다(소스)
  const sv = src('src/app/map/svgmap.ts');
  assert.match(sv, /const coast = coastSeas\(S\);\n\s+const asks = grid \? \[\] : SEAS\.filter\(\(key\) => !coast\.length \|\| coast\.includes\(key\)\)\.flatMap\(/);
  // 가로로 돌린 휴대폰 강원 지도(지도 칸 560×234 흉내 — 서쪽 끝에 경기만이 보인다): 닿는 바다(동해)만 물으면 '서해'는 없다
  const G = regionShapes('gangwon'), b = boxOf(reg.region('gangwon')!.fit), uu = (b[3] - b[1]) / 200, cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
  const view: Box = [cx - 280 * uu, cy - 117 * uu, cx + 280 * uu, cy + 117 * uu];
  const ask = (keys: SeaKey[]) => seaSpots({ mask: landMask(G), view, u: uu, asks: keys.map((key) => ({ key, w: 41, h: 18 })), blocked: [], ok: () => true }).map((s) => s.key);
  assert.deepEqual(ask(['w', 's', 'e']), ['w', 'e'], '셋 다 물으면 경기만에 서해');
  assert.deepEqual(ask(coastSeas(G)), ['e']);
});

test('위치 지도 바탕(locBase): 이웃 땅·먼 이웃 땅을 따로 싣는다(틀 바탕이 바다색이라 땅색으로 깐다) — 그리지 않는 강은 이웃 땅에 메운다', () => {
  const I = regionShapes('incheon');
  const f = locFrame(I.box, 112);
  const b = locBase(I, f);
  assert.ok(b.out.startsWith('M') && b.far.startsWith('M') && b.land.startsWith('M'));
  assert.equal(b.water, '', '인천은 한강이 칸과 맞닿지 않아 강을 그리지 않는다');
  const S = regionShapes('seoul');
  const bs = locBase(S, locFrame(S.box, 112));
  assert.ok(bs.water.startsWith('M') && bs.out.startsWith('M'));
});

test('지도 그리기(svgmap 소스): 이웃 땅 밑에 먼 이웃 땅 · 바다 이름은 이름표를 놓은 뒤 · 상자 안 작은 지도에는 없음 · 그리지 않는 강은 이웃 땅색 · 상자 그림에 이웃 땅', () => {
  const sv = src('src/app/map/svgmap.ts');
  const body = (name: string) => { const i = sv.indexOf(`  function ${name}(`); assert.ok(i >= 0, name); return sv.slice(i, sv.indexOf('\n  }\n', i)); };
  // 층: 먼 이웃 땅 → 이웃 땅(같은 칠) → 칸
  assert.match(sv, /if \(S\.farD\) el\('path', \{ d: S\.farD, class: 'cm-out-fill' \}, gOut\);\n\s+el\('path', \{ d: S\.outD, class: 'cm-out-fill' \}, gOut\);\n\s+const gCells/);
  // 칸과 맞닿지 않는 강은 강색으로 그리지 않고 이웃 땅색으로 메운다
  assert.match(sv, /if \(river\) el\('path', \{ d: S\.waterD, class: 'cm-water' \}, svg\);\n\s+else if \(S\.waterD\) el\('path', \{ d: S\.waterD, class: 'cm-out-fill' \}, gOut\);/);
  // 바다 이름 층은 맥락 이름 뒤·문제 칸 앞
  assert.match(sv, /const gCtx = el\('g', \{ class: 'cm-ctx' \}, svg\);\n\s+const gLead = el\('g', \{ class: 'cm-ctx cm-lead' \}, svg\);\n\s+const gSea = el\('g', \{ class: 'cm-ctx cm-sea' \}, svg\);\n\s+const gState/);
  // 이름표를 놓은 뒤 바다 이름(이름표가 없는 지도도)
  assert.match(body('drawLabels'), /layLabels\(\);\n\s+drawSea\(\);/);
  assert.match(body('commit'), /if \(labels\.length\) drawLabels\(\);[^\n]*\n\s+else drawSea\(\);/);
  const sea = body('drawSea');
  assert.match(sea, /if \(!seaOn\) return;/);
  // 피하는 것: 화면에 붙은 것·맥락 이름, 칸 밖 이름표와 지시선, 확대 상자 범위 네모, '전체 보기' 단추 자리
  assert.match(sea, /\[\.\.\.screenBoxes\(\), \.\.\.ctxTaken, \.\.\.leadTaken\]/);   // 지시선으로 둔 이웃 이름(layCtxLead)도
  assert.match(sea, /if \(!p\.out\) continue;/);
  assert.match(sea, /lines\.push\(\[c\.label\[0\], c\.label\[1\], p\.out\.ax, p\.out\.ay\]\)/);
  assert.match(sea, /if \(zOn && zb\) \{/);
  assert.match(sea, /if \(interaction === 'full' && movedFrom\(rendered\)\) blocked\.push/);
  // 고른 자리는 칸·이웃 땅·먼 이웃 땅·늘린 땅·강을 다각형으로 확인한다
  assert.match(sea, /boxHits\(S\.outRings, x, y, w, h\)/);
  assert.match(sea, /boxHits\(S\.farRings, x, y, w, h\)/);
  assert.match(sea, /S\.outExt\.some\(hit\)/);
  // 글은 ctxName 으로(영어 화면) — 빈 글이면 묻지 않는다
  assert.match(sv, /const seaText = \(k: SeaKey\) => \{ const n: CtxCell = \{ sido: seaCode\(k\), text: SEA_KO\[k\] \}; return opt\.ctxName \? opt\.ctxName\(n\) : n\.text; \};/);
  assert.match(sea, /return text \? \[\{ key, text, \.\.\.ctxSize\(text, 'water'\)(, \.\.\.\(t2 \? \{ alt: ctxSize\(t2, 'water'\) \} : \{\}\))? \}\] : \[\];/);
  assert.match(sv, /seaOn = opt\.seaNames !== false/);
  // 먼 섬 상자·섬 상자 그림에 범위 안 이웃 땅(둘 다 outDIn — 먼 이웃 땅과 이웃 땅을 따로 path 로)
  assert.equal(sv.split("for (const d of outDIn(S, ").length - 1, 2);
  // 위치 지도: 먼 이웃 땅·이웃 땅 path
  assert.match(sv, /far: p\('cm-loc-out'\), out: p\('cm-loc-out'\), land: p\('cm-loc-land'\)/);
});
