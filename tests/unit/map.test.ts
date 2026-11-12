import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_VER } from '../../src/consts.ts';
import { classifyTap } from '../../src/app/core/judge.ts';
import { buildShapes, probeAt, specOf, type Topology } from '../../src/app/map/shapes.ts';
import { boxOf, project, unproject } from '../../src/app/map/project.ts';
import { clampView, contains, cssBetween, fitView, toMap, toScreen, viewBox, zoomAround, MAX_K } from '../../src/app/map/view.ts';
import { geo, reg, idOf } from './fixtures.ts';

const topoOf = (region: string): Topology => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../public/data/geo', DATA_VER, `${region}-sgg.topo.json`), 'utf8'));
const shapes = Object.fromEntries(['seoul', 'incheon', 'gyeonggi'].map((k) => [k, buildShapes(topoOf(k), specOf(reg.region(k)!), geo.labels)]));

test('투영: 되돌리면 같은 점, 원점 근처 숫자', () => {
  const [x, y] = project(126.977, 37.5796);
  assert.ok(Math.abs(x) < 3000 && Math.abs(y) < 10000);
  const [lon, lat] = unproject(x, y);
  assert.ok(Math.abs(lon - 126.977) < 1e-9 && Math.abs(lat - 37.5796) < 1e-9);
  assert.ok(project(127, 37.6)[1] < project(127, 37.5)[1], 'y 는 아래로');
});

test('경계 → 칸: 지역마다 모든 곳, path 와 층이 다 있다', () => {
  for (const [key, n] of [['seoul', 25], ['incheon', 11], ['gyeonggi', 31]] as const) {
    const s = shapes[key];
    assert.equal(s.ids.length, n);
    for (const id of s.ids) assert.match(s.cells.get(id)!.d, /^M-?\d+ -?\d+/);
    for (const k of ['outD', 'waterD', 'edgeD', 'rimD', 'outEdgeD'] as const) assert.ok(s[k].length > 100, `${key} ${k}`);
    // 한강 띠는 김포·고양에서 끝나 인천 칸과는 맞닿지 않는다
    assert.equal(s.bankD.length > 100, key !== 'incheon', `${key} bankD`);
  }
});

const tap = (region: string, lon: number, lat: number, upp = 40, active?: string[]) => {
  const s = shapes[region];
  const [x, y] = project(lon, lat);
  return probeAt(s, x, y, upp, new Set(active ?? s.ids));
};

test('누른 점: 명소 좌표는 그 칸 안쪽 깊이', () => {
  const p = tap('seoul', 126.977, 37.5796);   // 경복궁
  assert.equal(p.hit, idOf('종로구'));
  assert.ok(p.depth > 6);
  assert.deepEqual(classifyTap(p, new Set(shapes.seoul.ids)), { type: 'cell', id: idOf('종로구') });
  assert.equal(tap('gyeonggi', 127.0286, 37.2636).hit, idOf('수원시'));   // 수원 화성 행궁
  assert.equal(tap('incheon', 126.4407, 37.4602).hit, idOf('영종구'));    // 인천공항
});

test('누른 점: 한강 한가운데는 강, 바다는 바다', () => {
  const river = tap('seoul', 126.9937, 37.5172, 2);   // 한남대교 부근 강 위, 아주 크게 키운 화면
  assert.equal(river.hit, null);
  assert.equal(river.water, 'river');
  assert.deepEqual(classifyTap(river, new Set(shapes.seoul.ids)), { type: 'river' });
  const sea = tap('incheon', 126.3, 37.3);
  assert.equal(sea.hit, null);
  assert.equal(sea.water, 'sea');
});

test('누른 점: 두 칸 경계 위를 넓은 화면에서 누르면 모호, 크게 키우면 칸', () => {
  // 종로구와 중구의 이름표 점 사이를 따라가다 경계를 넘는 첫 점
  const a = shapes.seoul.cells.get(idOf('종로구'))!.label, b = shapes.seoul.cells.get(idOf('중구', 'seoul'))!.label;
  let edge: [number, number] = a;
  for (let t = 0; t <= 1; t += 0.002) {
    const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
    if (probeAt(shapes.seoul, x, y, 1, new Set()).hit !== idOf('종로구')) { edge = [x, y]; break; }
  }
  const all = new Set(shapes.seoul.ids);
  const wide = probeAt(shapes.seoul, edge[0], edge[1], 40, all);
  assert.deepEqual(wide.near.sort(), [idOf('종로구'), idOf('중구', 'seoul')].sort());
  assert.deepEqual(classifyTap(wide, all), { type: 'ambiguous' });
  // 1px = 0.5m 로 키우면 손가락 반경이 6m 라 칸 하나
  const near = probeAt(shapes.seoul, edge[0] + (b[0] - a[0]) * 0.01, edge[1] + (b[1] - a[1]) * 0.01, 0.5, all);
  assert.equal(classifyTap(near, all).type, 'cell');
});

test('과 밖 칸을 누르면 밖(누를 수 없음)', () => {
  const p = tap('seoul', 127.0473, 37.5172, 40, reg.lesson('seoul', 1)!.items);   // 강남구(2과)
  assert.equal(p.hit, idOf('강남구'));
  assert.deepEqual(classifyTap(p, new Set(reg.lesson('seoul', 1)!.items)), { type: 'outside' });
});

test('과 경계(rimOf)는 칸 경계와 해안·시도 경계 사이에서만 나온다', () => {
  const s = shapes.seoul;
  const l1 = s.rimOf(new Set(reg.lesson('seoul', 1)!.items));
  assert.ok(l1.length > 100);
  assert.equal(s.rimOf(new Set()), '');
});

const size = { w: 358, h: 560 };

test('보기: 맞춤·좌표 왕복·확대', () => {
  const box = boxOf(reg.lesson('seoul', 1)!.fit);
  const pad = { t: 12, r: 16, b: 92, l: 16 };
  const v = fitView(box, size, pad);
  assert.ok(contains(v, size, box, pad));
  // 상자의 한 변이 여백 칸에 딱 붙는다
  const [sx0, sy0] = toScreen(v, size, box[0], box[1]), [sx1, sy1] = toScreen(v, size, box[2], box[3]);
  assert.ok(Math.abs(sx0 - 16) < 1e-6 || Math.abs(sy0 - 12) < 1e-6);
  assert.ok(sx1 <= size.w - 16 + 1e-6 && sy1 <= size.h - 92 + 1e-6);
  const [x, y] = toMap(v, size, 100, 200);
  const [px, py] = toScreen(v, size, x, y);
  assert.ok(Math.abs(px - 100) < 1e-9 && Math.abs(py - 200) < 1e-9);
  const z = zoomAround(v, size, 100, 200, 2.5);
  assert.equal(z.u, v.u / 2.5);
  const [qx, qy] = toScreen(z, size, x, y);
  assert.ok(Math.abs(qx - 100) < 1e-9 && Math.abs(qy - 200) < 1e-9, '누른 곳이 제자리');
  const vb = viewBox(v, size);
  assert.ok(Math.abs(vb[2] / vb[3] - size.w / size.h) < 1e-9);
});

test('보기: 한계(0.8~8배, 가운데는 범위 안)', () => {
  const box = boxOf(reg.lesson('seoul', 1)!.fit);
  const home = fitView(box, size);
  assert.equal(clampView({ ...home, u: home.u / 100 }, home, box).u, home.u / MAX_K);
  assert.equal(clampView({ ...home, u: home.u * 100 }, home, box).u, home.u / 0.8);
  const far = clampView({ cx: box[2] + 1e6, cy: box[1] - 1e6, u: home.u }, home, box);
  assert.deepEqual([far.cx, far.cy], [box[2], box[1]]);
});

test('CSS 변환: from 으로 그린 그림이 to 처럼 보인다', () => {
  const box = boxOf(reg.lesson('seoul', 2)!.fit);
  const from = fitView(box, size), to = zoomAround(from, size, 50, 80, 3);
  const { k, tx, ty } = cssBetween(from, to, size);
  for (const [x, y] of [[box[0], box[1]], [box[2], box[3]]]) {
    const [fx, fy] = toScreen(from, size, x, y), [gx, gy] = toScreen(to, size, x, y);
    assert.ok(Math.abs(fx * k + tx - gx) < 1e-6 && Math.abs(fy * k + ty - gy) < 1e-6);
  }
});

test('동 층(서울 427동)도 같은 함수로', () => {
  const t = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../public/data/geo', DATA_VER, 'seoul-emd.topo.json'), 'utf8'));
  const labels = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../public/data/geo', DATA_VER, 'labels-emd.json'), 'utf8'));
  const ids = t.objects.emd.geometries.map((g: { properties: { id: string } }) => g.properties.id);
  const s = buildShapes(t, { layer: 'emd', idKey: 'id', ids }, labels);
  assert.equal(s.ids.length, 427);
  assert.equal(s.waterD, '');   // 동 파일에는 강·이웃 땅 층이 없다
  assert.ok(s.edgeD.length > 1000);
});

test('먼 섬: 인천 옹진군의 백령·대청·연평만 섬 상자로', () => {
  assert.equal(shapes.seoul.far, null);
  assert.equal(shapes.gyeonggi.far, null);
  const far = shapes.incheon.far!;
  assert.deepEqual(far.parts.map((p) => p.id), [idOf('옹진군')]);
  // 백령도(124.67, 37.95)·연평도(125.70, 37.66)는 상자 안, 덕적도(126.13, 37.23)는 밖
  const inBox = (lon: number, lat: number) => { const [x, y] = project(lon, lat); return x >= far.box[0] && x <= far.box[2] && y >= far.box[1] && y <= far.box[3]; };
  assert.equal(inBox(124.67, 37.95), true);
  assert.equal(inBox(125.70, 37.66), true);
  assert.equal(inBox(126.13, 37.23), false);
});
