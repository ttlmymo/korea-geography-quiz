import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_VER } from '../../src/consts.ts';
import { classifyTap } from '../../src/app/core/judge.ts';
import { buildShapes, probeAt, specOf, type Topology } from '../../src/app/map/shapes.ts';
import { boxOf, project, unproject } from '../../src/app/map/project.ts';
import { clampView, contains, cssBetween, fitView, toMap, toScreen, viewBox, zoomAround, MAX_K } from '../../src/app/map/view.ts';
import { boxHits, boxInside, edgeHitsBox, ringsOfD } from '../../src/app/map/poly.ts';
import { fitBox, labelBox, outsideSpot, placeInside, placeLabels, scaleStep, staticLabel, textWidth, type Obstacle } from '../../src/app/map/labelfit.ts';
import { geo, reg, idOf, nameOf } from './fixtures.ts';

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
    for (const k of ['outD', 'waterD', 'edgeD', 'rimD'] as const) assert.ok(s[k].length > 100, `${key} ${k}`);
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

/** path 의 d → 선분 묶음(방향 없이). 메쉬가 호를 어떻게 이어 붙였든 같은 선이면 같은 묶음이 된다 */
function segs(d: string): Set<string> {
  const out = new Set<string>();
  for (const part of d.split('M')) {
    const n = (part.match(/-?\d+/g) ?? []).map(Number);
    for (let i = 0; i + 3 < n.length; i += 2) {
      const a = `${n[i]},${n[i + 1]}`, b = `${n[i + 2]},${n[i + 3]}`;
      if (a !== b) out.add(a < b ? `${a}-${b}` : `${b}-${a}`);
    }
  }
  return out;
}
const union = (...sets: Set<string>[]) => new Set(sets.flatMap((s) => [...s]));

test('묶음 메쉬: 과 안 경계 · 강가까지 넣은 둘레 · 칸마다 굵은 테두리', () => {
  for (const key of ['seoul', 'incheon', 'gyeonggi']) {
    const s = shapes[key];
    const all = new Set(s.ids);
    // 모든 칸이면: 과 안 경계 = 칸끼리 경계 전체, 굵은 테두리 = 칸끼리 + 강가 + 외곽선
    assert.equal(s.innerOf(all), s.edgeD, key);
    assert.deepEqual(segs(s.outlineOf(all)), union(segs(s.edgeD), segs(s.bankD), segs(s.rimD)), key);
    assert.equal(s.innerOf(new Set()), '');
    assert.equal(s.outlineOf(new Set()), '');
    for (const l of reg.region(key)!.lessons) {
      const set = new Set(l.items);
      const inner = segs(s.innerOf(set)), rim = segs(s.rimOf(set, { bank: true })), outline = segs(s.outlineOf(set));
      // 칸마다 두른 테두리 = 묶음 둘레(강가 포함) + 묶음 안 경계, 둘은 겹치지 않는다
      assert.deepEqual(outline, union(inner, rim), `${key} ${l.no}과`);
      assert.equal([...inner].filter((x) => rim.has(x)).length, 0);
      // 강가를 뺀 둘레는 강가를 넣은 둘레의 일부
      const dry = segs(s.rimOf(set));
      assert.ok([...dry].every((x) => rim.has(x)));
      // 과 안 경계는 칸끼리 경계의 일부
      const edge = segs(s.edgeD);
      assert.ok([...inner].every((x) => edge.has(x)));
    }
  }
  // 서울 1과(도심과 서북)는 한강에 닿는다: 강가를 넣으면 둘레가 길어진다. 인천에는 강가가 없어 같다
  const s1 = new Set(reg.lesson('seoul', 1)!.items);
  assert.ok(segs(shapes.seoul.rimOf(s1, { bank: true })).size > segs(shapes.seoul.rimOf(s1)).size);
  const i1 = new Set(reg.lesson('incheon', 1)!.items);
  assert.deepEqual(segs(shapes.incheon.rimOf(i1, { bank: true })), segs(shapes.incheon.rimOf(i1)));
  // 한 칸의 굵은 테두리는 그 칸의 둘레 전부
  const one = new Set([idOf('종로구')]);
  assert.deepEqual(segs(shapes.seoul.outlineOf(one)), segs(shapes.seoul.rimOf(one, { bank: true })));
  // 같은 묶음은 기억해 둔 것을 준다(순서가 달라도)
  const a = shapes.seoul.outlineOf(new Set(['x', ...s1])), b = shapes.seoul.outlineOf(new Set([...[...s1].reverse(), 'x']));
  assert.equal(a, b);
});

test('묶음의 강가(bankOf): 강가를 뺀 테두리·둘레와 합치면 강가를 넣은 것(좁은 강에서 강가만 가늘게 낮추려고 따로 긋는다)', () => {
  for (const key of ['seoul', 'gyeonggi']) {
    const s = shapes[key];
    for (const l of reg.region(key)!.lessons) {
      const set = new Set(l.items);
      const bank = segs(s.bankOf(set));
      assert.deepEqual(union(segs(s.outlineOf(set, { bank: false })), bank), segs(s.outlineOf(set)), `${key} ${l.no}과 테두리`);
      assert.deepEqual(union(segs(s.rimOf(set)), bank), segs(s.rimOf(set, { bank: true })), `${key} ${l.no}과 둘레`);
      // 묶음의 강가는 지역 강가의 일부, 강가를 뺀 테두리에는 강가가 없다
      const all = segs(s.bankD);
      assert.ok([...bank].every((x) => all.has(x)));
      assert.equal([...segs(s.outlineOf(set, { bank: false }))].filter((x) => bank.has(x)).length, 0);
    }
  }
  // 경기 5과(구리·남양주 ↔ 하남·광주)는 한강 양쪽에 걸친다. 인천은 강가가 없다
  assert.ok(shapes.gyeonggi.bankOf(new Set(reg.lesson('gyeonggi', 5)!.items)).length > 0);
  assert.equal(shapes.incheon.bankOf(new Set(shapes.incheon.ids)), '');
});

/* ---------- 다각형·이름표 자리(합본 디자인 3.1: 14px 이상, 후광 없이 칸 안에) ---------- */

const sq = (x0: number, y0: number, x1: number, y1: number) => Float64Array.from([x0, y0, x1, y0, x1, y1, x0, y1]);

test('상자와 다각형: 온전히 안 · 걸침 · 밖', () => {
  const r = [sq(0, 0, 100, 100)];
  assert.equal(boxInside(r, 50, 50, 40, 20), true);
  assert.equal(boxInside(r, 85, 50, 40, 20), false, '오른쪽 변에 걸침');
  assert.equal(boxHits(r, 85, 50, 40, 20), true);
  assert.equal(boxHits(r, 150, 50, 40, 20), false);
  assert.equal(edgeHitsBox(r, 50, 50, 40, 20), false);
  // 상자가 다각형을 통째로 품어도 '닿음'(가운데가 안)
  assert.equal(boxHits(r, 50, 50, 300, 300), true);
  assert.equal(boxInside(r, 50, 50, 300, 300), false);
  // 구멍이 있는 칸: 구멍에 걸치면 안이 아니다
  const holed = [sq(0, 0, 100, 100), sq(40, 40, 60, 60)];
  assert.equal(boxInside(holed, 20, 20, 20, 10), true);
  assert.equal(boxInside(holed, 35, 50, 20, 10), false);
  // 변이 상자를 가로지르기만 해도(꼭짓점은 밖) 걸침
  const tri = [Float64Array.from([0, 0, 200, 0, 0, 200])];
  assert.equal(boxInside(tri, 95, 95, 30, 30), false);
  assert.equal(boxInside(tri, 40, 40, 30, 30), true);
});

test('path 의 d → 고리', () => {
  const rings = ringsOfD('M0 0 10 0 10 10 0 10ZM20 20 30 20 30 30Z');
  assert.equal(rings.length, 2);
  assert.deepEqual([...rings[0]], [0, 0, 10, 0, 10, 10, 0, 10]);
  assert.deepEqual([...rings[1]], [20, 20, 30, 20, 30, 30]);
  assert.equal(boxInside(rings, 5, 5, 4, 4), true);
});

test('글자 상자: 한글은 글자 크기만큼, 14px 세 글자면 50×20', () => {
  assert.equal(textWidth('종로구', 14), 42);
  assert.deepEqual(labelBox('종로구', 14), { w: 50, h: 20 });
  assert.deepEqual(labelBox('영등포구', 16), { w: 72, h: 22 });
  // 라틴 글자는 좁다(영어 이름은 길어서 폭을 따로 어림한다)
  assert.ok(textWidth('Jongno-gu', 14) < 14 * 9 * 0.75);
  assert.ok(textWidth('Jongno-gu', 14) > 14 * 9 * 0.45);
});

test('칸 안 자리: 이름표 점에 안 들어가면 가장 가까운 들어가는 곳, 없으면 null', () => {
  // ㄴ자 칸: 세로 기둥(폭 30)과 가로 바닥(높이 40). 이름표 점은 기둥 안
  const L = [Float64Array.from([0, 0, 30, 0, 30, 100, 120, 100, 120, 140, 0, 140])];
  const box: [number, number, number, number] = [0, 0, 120, 140];
  assert.deepEqual(fitBox(L, box, [15, 50], 20, 10, 2), [15, 50], '들어가면 그 자리 그대로');
  const moved = fitBox(L, box, [15, 90], 50, 20, 2);
  assert.ok(moved, '기둥에는 안 들어가도 바닥에는 들어간다');
  assert.ok(boxInside(L, moved![0], moved![1], 50, 20));
  assert.ok(moved![1] > 100 && Math.hypot(moved![0] - 15, moved![1] - 90) < 40, '가까운 곳으로');
  assert.equal(fitBox(L, box, [15, 50], 130, 20, 2), null, '칸보다 큰 상자');
  // 멀리(상자 대각선 너머)는 옮기지 않는다
  assert.equal(fitBox(L, box, [15, 10], 50, 20, 2), null);
});

test('칸 밖 자리: 칸·이미 놓은 이름표를 피해 바깥쪽 가까운 곳', () => {
  const cellsBox = (x0: number, y0: number, x1: number, y1: number): Obstacle => ({ rings: [sq(x0, y0, x1, y1)], box: [x0, y0, x1, y1] });
  // 왼쪽 큰 칸과 오른쪽 좁은 칸(이름이 안 들어감). 오른쪽 밖은 빈 바탕
  const obs = [cellsBox(0, 0, 200, 100), cellsBox(200, 0, 220, 100)];
  const spot = outsideSpot([210, 50], 50, 20, obs, [], null, 3, 90, [1, 0]);
  assert.ok(spot);
  assert.ok(spot![0] - 25 >= 220, '상자가 칸 밖(오른쪽)에');
  assert.ok(!obs.some((o) => boxHits(o.rings, spot![0], spot![1], 50, 20)));
  // 그 자리를 이미 다른 이름표가 썼으면 다른 곳
  const second = outsideSpot([210, 50], 50, 20, obs, [[spot![0] - 25, spot![1] - 10, spot![0] + 25, spot![1] + 10]], null, 3, 90, [1, 0]);
  assert.ok(second && (Math.abs(second[0] - spot![0]) >= 50 || Math.abs(second[1] - spot![1]) >= 20));
  // 보이는 범위가 칸뿐이면 자리가 없다
  assert.equal(outsideSpot([210, 50], 50, 20, obs, [], [0, 0, 220, 100], 3, 90, [1, 0]), null);
});

test('칸 밖 자리: 지시선이 남의 칸을 가로지르는 자리는 건너뛴다(어느 칸의 이름인지 헷갈리지 않게)', () => {
  const cellsBox = (x0: number, y0: number, x1: number, y1: number): Obstacle => ({ rings: [sq(x0, y0, x1, y1)], box: [x0, y0, x1, y1] });
  // 작은 칸(이름표 점 30,50) 바로 위에 이웃 칸이 덮여 있고, 오른쪽은 빈 바탕
  const own = cellsBox(10, 40, 50, 60), lid = cellsBox(0, 0, 60, 40), wall = cellsBox(50, 40, 60, 60);
  const obs = [own, lid, wall];
  const lead = (s: [number, number]) => {
    // 지시선 끝: 상자에서 이름표 점에 가장 가까운 곳
    const b = [s[0] - 20, s[1] - 8, s[0] + 20, s[1] + 8];
    return [Math.min(b[2], Math.max(b[0], 30)), Math.min(b[3], Math.max(b[1], 50))];
  };
  const crosses = (s: [number, number], ob: Obstacle) => {
    const [ex, ey] = lead(s);
    for (let i = 1; i <= 20; i++) { const x = 30 + ((ex - 30) * i) / 20, y = 50 + ((ey - 50) * i) / 20; if (boxHits(ob.rings, x, y, 0.001, 0.001) && !boxHits(own.rings, x, y, 0.001, 0.001)) return true; }
    return false;
  };
  // 선 검사 없이: 위쪽 바깥(이웃 칸 너머)도 후보
  const free = outsideSpot([30, 50], 40, 16, obs, [], null, 2, 80, [0, -1]);
  assert.ok(free);
  // 선 검사를 켜면 고른 자리의 지시선은 이웃 칸(lid·wall)을 지나지 않는다
  const spot = outsideSpot([30, 50], 40, 16, obs, [], null, 2, 80, [0, -1], { line: [], lineGap: 0 });
  assert.ok(spot);
  assert.ok(!crosses(spot!, lid) && !crosses(spot!, wall), `지시선이 이웃 칸을 지남: ${spot}`);
  assert.ok(!obs.some((o) => boxHits(o.rings, spot![0], spot![1], 39.99, 15.99)), '빈 바탕(변에 맞닿는 것은 괜찮다)');
  // 다른 이름표 상자와는 apart 간격만큼 띄운다
  const near: [number, number, number, number] = [spot![0] - 20, spot![1] - 8, spot![0] + 20, spot![1] + 8];
  const apart = outsideSpot([30, 50], 40, 16, obs, [], null, 2, 80, [0, -1], { line: [], lineGap: 0, apart: { boxes: [near], gap: 6 } });
  if (apart) assert.ok(Math.abs(apart[0] - spot![0]) >= 40 + 6 || Math.abs(apart[1] - spot![1]) >= 16 + 6);
});

test('칸 안 자리: 넉넉한 곳을 먼저, 먼저 놓은 이름표와 붙으면 다른 자리', () => {
  // ㄴ자 칸: 좁은 기둥(폭 34)과 넓은 바닥. 이름표 점은 기둥 안 — 글자 상자(30×14)는 기둥에도 들지만 넉넉한 상자(36×18)는 바닥에만 든다
  const L = [Float64Array.from([0, 0, 34, 0, 34, 100, 140, 100, 140, 160, 0, 160])];
  const cell = { rings: L, box: [0, 0, 140, 160] as [number, number, number, number], label: [17, 80] as const, r: 17 };
  const one = placeInside((id) => (id === 'a' ? cell : undefined), [{ id: 'a', w: 30, h: 14 }], 1);
  assert.equal(one.pending.length, 0);
  assert.ok(one.placed[0].y > 100, '넓은 바닥으로 옮긴다');
  assert.ok(boxInside(L, one.placed[0].x, one.placed[0].y, 36, 18));
  // 같은 칸 모양 둘이 바로 붙어 있으면(두 번째 이름표 점이 첫 이름표 바로 아래) 6px 넘게 띄운다
  const wide = { rings: [sq(0, 0, 200, 60)], box: [0, 0, 200, 60] as [number, number, number, number], label: [100, 30] as const, r: 30 };
  const below = { rings: [sq(0, 0, 200, 60)], box: [0, 0, 200, 60] as [number, number, number, number], label: [100, 46] as const, r: 14 };
  const two = placeInside((id) => (id === 'a' ? wide : below), [{ id: 'a', w: 40, h: 14 }, { id: 'b', w: 40, h: 14 }], 1);
  assert.equal(two.placed.length, 2);
  const [p, q] = two.placed;
  assert.ok(Math.abs(p.x - q.x) >= 40 + 6 || Math.abs(p.y - q.y) >= 14 + 6, `붙음: ${p.x},${p.y} · ${q.x},${q.y}`);
});

/** 홈 PC 지도(시안: 폭 760 안팎)에 지역 전체를 맞춘 보기에서 이름표를 놓는다 */
function place(region: string, ids: string[], w: number, h: number, mode: 'must' | 'fit' | 'inside', px = 15) {
  const s = shapes[region];
  const sz = { w, h };
  const v = fitView(boxOf(reg.region(region)!.fit), sz, { t: 14, r: 14, b: 14, l: 14 });
  const [x, y, vw, vh] = viewBox(v, sz);
  const obstacles = s.ids.map((id) => ({ rings: s.cells.get(id)!.rings, box: s.cells.get(id)!.box }));
  const res = placeLabels((id) => s.cells.get(id), ids.map((id) => ({ id, ...labelBox(nameOf(id)!, px) })), {
    mode, u: v.u, obstacles, within: [x, y, x + vw, y + vh], center: [(s.box[0] + s.box[2]) / 2, (s.box[1] + s.box[3]) / 2],
  });
  return { res, v, s, px };
}

test('이름표 놓기: 서울 3과는 금천구만 칸 밖(시안과 같다)', () => {
  const l3 = reg.lesson('seoul', 3)!.items;
  const { res, v, s, px } = place('seoul', l3, 760, 618, 'fit');
  assert.deepEqual(res.filter((p) => p.out).map((p) => nameOf(p.id)), ['금천구']);
  assert.equal(res.length, l3.length);
  for (const p of res) {
    const b = labelBox(nameOf(p.id)!, px), c = s.cells.get(p.id)!;
    if (!p.out) {
      assert.ok(boxInside(c.rings, p.x, p.y, b.w * v.u, b.h * v.u), `${nameOf(p.id)}: 글자 상자가 칸 안`);
      continue;
    }
    // 칸 밖 이름표는 어느 칸에도 닿지 않고(빈 바탕), 흰 판 없이 지시선만
    assert.equal(p.out.plate, false);
    assert.ok(!s.ids.some((id) => boxHits(s.cells.get(id)!.rings, p.x, p.y, b.w * v.u, b.h * v.u)));
    assert.ok(Math.hypot(p.x - c.label[0], p.y - c.label[1]) / v.u < 140, '멀지 않게');
  }
});

test('이름표 놓기: inside ⊆ fit ⊆ must, must 는 하나도 빼지 않는다', () => {
  for (const [region, w, h] of [['seoul', 390, 317], ['incheon', 760, 874], ['gyeonggi', 760, 874]] as const) {
    const ids = reg.region(region)!.items.map((it) => it.id);
    const inside = place(region, ids, w, h, 'inside').res, fit = place(region, ids, w, h, 'fit').res, must = place(region, ids, w, h, 'must').res;
    assert.equal(must.length, ids.length, region);
    assert.ok(inside.every((p) => !p.out));
    const fitIn = fit.filter((p) => !p.out).map((p) => p.id);
    assert.deepEqual(inside.map((p) => p.id), fitIn, `${region}: 칸 안에 드는 것은 같다`);
    assert.ok(fit.length >= inside.length && fit.length <= must.length);
    // fit 은 칸 위에 걸치는 이름표(흰 판)를 만들지 않는다
    assert.ok(fit.every((p) => !p.out?.plate));
    // 이름표 상자끼리 겹치지 않는다(fit)
    const u = place(region, ids, w, h, 'fit').v.u;
    const boxes = fit.map((p) => { const b = labelBox(nameOf(p.id)!, 15); return [p.x - b.w * u / 2, p.y - b.h * u / 2, p.x + b.w * u / 2, p.y + b.h * u / 2]; });
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      assert.ok(!(a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]), `${region}: ${nameOf(fit[i].id)} · ${nameOf(fit[j].id)} 겹침`);
    }
  }
  // 넓은 서울 지도에서는 25곳이 모두 칸 안에 들어간다
  const ids = reg.region('seoul')!.items.map((it) => it.id);
  assert.equal(place('seoul', ids, 1000, 813, 'inside', 16).res.length, 25);
});

test('이름표 놓기: 꼭 보일 이름(must)의 흰 판은 다른 이름표·점을 덮지 않는다', () => {
  // 경기 전체를 작게 그린 지도(시험 결과): 안쪽의 작은 시들은 빈 바탕이 없어 흰 판에 얹힌다
  const names = ['구리시', '오산시', '과천시', '광명시', '수원시', '의왕시', '안양시', '양평군'];
  const ids = names.map((n) => idOf(n));
  const { res, v, s } = place('gyeonggi', ids, 770, 626, 'must');
  assert.equal(res.length, ids.length);
  const plates = res.filter((p) => p.out?.plate);
  assert.ok(plates.length >= 2, '흰 판이 둘 이상 나오는 보기');
  const u = v.u;
  const boxes = res.map((p) => { const b = labelBox(nameOf(p.id)!, 15); return { id: p.id, b: [p.x - b.w * u / 2, p.y - b.h * u / 2, p.x + b.w * u / 2, p.y + b.h * u / 2] }; });
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i].b, b = boxes[j].b;
    assert.ok(!(a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]), `${nameOf(boxes[i].id)} · ${nameOf(boxes[j].id)} 겹침`);
  }
  // 칸 밖 이름표의 지시선이 시작하는 점(칸 안 이름표 점)을 다른 이름표가 덮지 않는다
  for (const p of res.filter((q) => q.out)) {
    const at = s.cells.get(p.id)!.label;
    for (const o of boxes) if (o.id !== p.id) assert.ok(!(at[0] > o.b[0] && at[0] < o.b[2] && at[1] > o.b[1] && at[1] < o.b[3]), `${nameOf(o.id)} 이름표가 ${nameOf(p.id)} 의 점을 덮음`);
  }
  // 흰 판은 이름표를 다는 다른 칸(시험 결과의 다른 틀린 칸)을 피할 자리가 있으면 피한다.
  // 틀린 곳 6곳(검수에서 오산시 판이 수원시를 덮던 화면)은 모두 피하고, 안쪽 작은 시가 몰린 8곳에서도 덮는 판은 하나뿐(안양시 — 네 쪽이 다 막힘)
  const covers = (list: string[]) => {
    const ids6 = list.map((n) => idOf(n));
    const r6 = place('gyeonggi', ids6, 770, 626, 'must');
    return r6.res.filter((p) => p.out?.plate).filter((p) => {
      const b = labelBox(nameOf(p.id)!, 15);
      return ids6.some((id) => id !== p.id && boxHits(r6.s.cells.get(id)!.rings, p.x, p.y, b.w * r6.v.u, b.h * r6.v.u));
    }).map((p) => nameOf(p.id));
  };
  assert.deepEqual(covers(['구리시', '오산시', '과천시', '광명시', '수원시', '의왕시']), []);
  assert.ok(covers(names).length <= 1);
});

test('이름표 놓기: 먼 섬으로 이름을 옮기지 않는다(옹진군)', () => {
  const ids = [idOf('옹진군')];
  const { res, s, v } = place('incheon', ids, 1000, 1150, 'must', 16);
  const c = s.cells.get(ids[0])!;
  assert.equal(res.length, 1);
  assert.ok(Math.hypot(res[0].x - c.label[0], res[0].y - c.label[1]) / v.u < 160);
});

test('축척 막대: 1·2·5·10km 가운데 60~120px 가 되는 값', () => {
  assert.deepEqual(scaleStep(51), { m: 5000, px: 5000 / 51, text: '5km' });      // 홈 PC 의 서울 전체
  assert.equal(scaleStep(20).text, '2km');                                        // 문제 PC 의 과 하나
  assert.equal(scaleStep(10).text, '1km');
  assert.equal(scaleStep(108).text, '10km');                                      // 인천 전체
  assert.equal(scaleStep(183).text, '20km');                                      // 경기 전체
  assert.equal(scaleStep(3).text, '200m');                                        // 많이 키움
  // 두 값이 다 들면 긴 쪽
  assert.equal(scaleStep(1000 / 60).text, '2km');
  // 드는 값이 없으면(2km 는 짧고 5km 는 김) 조금 긴 쪽
  const s = scaleStep(38);
  assert.equal(s.text, '5km');
  assert.ok(s.px > 120 && s.px < 150);
  for (const u of [2, 5, 9, 14, 26, 47, 77, 130, 240, 400]) {
    const r = scaleStep(u);
    assert.ok(r.px >= 60 && r.px < 150, `u=${u}: ${r.text} ${r.px.toFixed(0)}px`);
  }
});

test('정적 지도 이름표: 들어가기 시작하는 지도 폭과 자리', () => {
  const svg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../src/data/svg/seoul.json'), 'utf8')) as { w: number; items: { id: string; d: string; lx: number; ly: number }[] };
  const boxOfRings = (rings: Float64Array[]) => {
    const b: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const r of rings) for (let i = 0; i < r.length; i += 2) { b[0] = Math.min(b[0], r[i]); b[1] = Math.min(b[1], r[i + 1]); b[2] = Math.max(b[2], r[i]); b[3] = Math.max(b[3], r[i + 1]); }
    return b;
  };
  const at = (name: string) => {
    const it = svg.items.find((x) => x.id === idOf(name, 'seoul'))!;
    const rings = ringsOfD(it.d);
    return { it, rings, s: staticLabel(rings, boxOfRings(rings), [it.lx, it.ly], name, 14, svg.w, 240, 1000) };
  };
  const all = svg.items.map((it) => at(nameOf(it.id)!));
  // PC 폭(1000)에서는 25곳이 모두 들어간다. 휴대폰 폭(358)에서는 거의 안 들어간다
  assert.ok(all.every((x) => x.s));
  assert.ok(all.filter((x) => x.s!.minWidth <= 358).length <= 2);
  for (const { it, rings, s } of all) {
    const b = labelBox(nameOf(it.id)!, 14);
    for (const W of [s!.minWidth, 1000]) {
      const k = svg.w / W;
      assert.ok(boxInside(rings, s!.x, s!.y, b.w * k, b.h * k), `${nameOf(it.id)}: 폭 ${W} 에서 칸 안`);
    }
  }
  // 큰 칸은 좁은 지도에서도, 좁은 칸은 넓은 지도에서만
  assert.ok(at('강서구').s!.minWidth < at('종로구').s!.minWidth);
  assert.ok(at('종로구').s!.minWidth < at('금천구').s!.minWidth);
  // 어떤 폭에서도 안 들어가면 null
  const g = at('금천구');
  assert.equal(staticLabel(g.rings, boxOfRings(g.rings), [g.it.lx, g.it.ly], '금천구', 14, svg.w, 240, 400), null);
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
