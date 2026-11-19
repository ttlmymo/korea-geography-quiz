import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_VER } from '../../src/consts.ts';
import { classifyTap } from '../../src/app/core/judge.ts';
import { buildShapes, probeAt, specOf, type Shapes, type Topology } from '../../src/app/map/shapes.ts';
import { createRegistry } from '../../src/app/registry.ts';
import { INSET_SHRINK, insetPad, wholeView } from '../../src/app/ui/maps.ts';
import { labelPx } from '../../src/app/map/svgmap.ts';
import { boxOf, project, unproject } from '../../src/app/map/project.ts';
import { clampView, contains, cssBetween, fitView, toMap, toScreen, viewBox, zoomAround, MAX_K } from '../../src/app/map/view.ts';
import { boxHits, boxInside, edgeDist, edgeHitsBox, inside, ringsOfD, segHitsBox, setRingIndex } from '../../src/app/map/poly.ts';
import { fitBox, labelBox, outsideSpot, placeInside, placeLabels, scaleStep, splitTwo, staticLabel, textWidth, type Obstacle } from '../../src/app/map/labelfit.ts';
import { BAR_FRAC, BAR_MAX, ISLE_H, ISLE_W, OWN_W, cornerCover, farInset, insetScale, pickCorner, scaleChip, type IsleCell } from '../../src/app/map/isles.ts';
import { UI_EN, UI_KO } from '../../src/app/text/ui.ts';
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
  // 칸과 맞닿지 않아 그리지 않는 강(인천 지도 구석의 한강 — 화면에서는 이웃 땅색으로 메운다, 2026-11-17 바다 표현)은 강으로 치지 않는다:
  // 이웃 땅·바다처럼 '밝은 칸 중에서 골라 주세요'(outside). 전에는 '땅을 눌러 주세요'(river)가 나왔다
  const [hx, hy] = project(126.812, 37.599);   // 행주대교 부근 강 위
  assert.ok(inside(shapes.incheon.water, hx, hy) && shapes.incheon.bankD === '', '인천 지도의 한강 띠 위 · 그리지 않는 강');
  const hidden = tap('incheon', 126.812, 37.599);
  assert.equal(hidden.water, 'sea');
  assert.deepEqual(classifyTap(hidden, new Set(shapes.incheon.ids)), { type: 'outside' });
  assert.equal(tap('gyeonggi', 126.812, 37.599, 2).water, 'river', '같은 자리도 강을 그리는 경기 지도에서는 강');
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
  // 서울 1과(북서쪽 — 도심과 서북)는 한강에 닿는다: 강가를 넣으면 둘레가 길어진다. 인천에는 강가가 없어 같다
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

test('영어 이름표 두 줄 나누기: 하이픈 뒤 · 띄어쓰기 · 한글은 나누지 않는다', () => {
  assert.equal(splitTwo('Yeongyang-gun'), 'Yeongyang-\ngun');
  assert.equal(splitTwo('Gyeongsangbuk-do'), 'Gyeongsangbuk-\ndo');
  assert.equal(splitTwo('Gaepo 1'), 'Gaepo\n1');
  assert.equal(splitTwo('East Sea'), 'East\nSea');
  assert.equal(splitTwo('Jung'), null);
  assert.equal(splitTwo('영양군'), null, '한국어는 늘 한 줄');
  assert.equal(splitTwo('Yeongyang-\ngun'), null, '이미 두 줄');
  const a = labelBox('Yeongyang-gun', 14), b = labelBox(splitTwo('Yeongyang-gun')!, 14);
  assert.ok(b.w < a.w && b.h > a.h, '두 줄은 좁고 높다');
});

test('칸 안 자리: 한 줄이 안 들면 두 줄 상자로(영어), alt 가 없으면(한국어) 전과 같다', () => {
  const one = labelBox('Yeongyang-gun', 14), two = labelBox(splitTwo('Yeongyang-gun')!, 14);
  const S = Math.ceil((one.w + two.w) / 2) + 4;   // 한 줄 폭보다 좁고 두 줄 폭보다 넓은 정사각 칸
  const cell = sq(0, 0, S, S);
  const c = { rings: [cell], box: [0, 0, S, S] as [number, number, number, number], label: [S / 2, S / 2] as [number, number], r: S / 2 };
  assert.ok(one.w > S && two.w <= S && two.h <= S, `한 줄은 칸보다 넓고 두 줄은 든다 (${one.w} ${two.w}x${two.h} 칸 ${S})`);
  const plain = placeInside(() => c, [{ id: 'a', ...one }], 1);
  assert.equal(plain.placed.length, 0);
  assert.equal(plain.pending.length, 1, 'alt 가 없으면 칸 밖으로 넘어간다(한국어와 같은 경로)');
  const en = placeInside(() => c, [{ id: 'a', ...one, alt: two }], 1);
  assert.equal(en.pending.length, 0);
  assert.equal(en.placed[0].two, true);
  assert.ok(boxInside(c.rings, en.placed[0].x, en.placed[0].y, two.w, two.h));
  // 한 줄이 드는 칸은 한 줄 그대로
  const big = { ...c, rings: [sq(0, 0, 200, 80)], box: [0, 0, 200, 80] as [number, number, number, number], label: [100, 40] as [number, number], r: 40 };
  const ok = placeInside(() => big, [{ id: 'a', ...one, alt: two }], 1);
  assert.equal(ok.placed[0].two, undefined);
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

/** 지역 전체 지도(과 시작·요약·시험 결과)를 그리는 모든 지역·시·도·일반구(+ emd 면 동 단원) 칸 묶음. 판 public/data/geo 만 읽는다 */
function wholeMaps(emd: boolean): { R: ReturnType<typeof createRegistry>; maps: { key: string; S: Shapes }[] } {
  const dir = path.join(import.meta.dirname, '../../public/data/geo', DATA_VER);
  const J = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const R = createRegistry(geo);
  const maps: { key: string; S: Shapes }[] = [];
  for (const r of R.regions.filter((x) => x.lessons.length)) maps.push({ key: r.key, S: buildShapes(J(`${r.key}-sgg.topo.json`), specOf(r), geo.labels) });
  const ko = R.region('korea')!;
  maps.push({ key: 'korea', S: buildShapes(J('sido.topo.json'), specOf(ko), Object.fromEntries(ko.items.map((it) => [it.id, R.point(it.id)!]))) });
  for (const k of ['gyeonggi/gu', 'chungbuk/gu', 'gyeongnam/gu']) { const g = R.region(k); if (g) maps.push({ key: k, S: buildShapes(J(`${g.unit!.parent}-sgg.topo.json`), specOf(g), geo.labels) }); }
  if (emd) for (const f of fs.readdirSync(path.join(dir, 'emd')).filter((x) => /^\d+\.json$/.test(x))) {
    const u = J(`emd/${f}`);
    if (!u.lessons?.length) continue;
    const r = R.addUnit(u);
    maps.push({ key: r.key, S: buildShapes(J(`emd/${f.replace('.json', '.topo.json')}`), specOf(r), u.labels) });
  }
  return { R, maps };
}

/**
 * 지역 전체 지도(폰 지도 칸 390 × 범위 비율, PC 760 × 범위 비율(640 상한), 여백 14 — 쪽 지도 CARD_PAD, 칸 밖 이름표는 여백 안쪽에)에
 * 묶음(sets)마다 이름을 꼭 보이게(must) 놓고, 빠진 이름 · 이름표끼리 겹침 · 보이는 범위 밖 · 지시선이 다른 이름표를 지남 · 가장 긴 지시선을 센다
 */
function auditWhole(R: ReturnType<typeof createRegistry>, maps: { key: string; S: Shapes }[], setsOf: (r: ReturnType<ReturnType<typeof createRegistry>['region']> & object) => { tag: string; items: string[] }[]) {
  const bad: string[] = [];
  let n = 0, longest = 0;
  for (const { key, S } of maps) {
    const r = R.region(key)!, v0 = wholeView(r);
    if (v0.isles.length && r.items.every((it) => v0.isles.includes(it.id))) continue;   // 섬 격자(본 지도 없음 — 이름은 상자마다)
    const [x0, y0, x1, y1] = boxOf(v0.fit), ar = (x1 - x0) / (y1 - y0);
    for (const W of [390, 760]) {
      const size = { w: W, h: Math.min(W === 390 ? Infinity : 640, Math.round(W / ar)) }, pad = 14;
      const v = fitView(boxOf(v0.fit), size, { t: pad, r: pad, b: pad, l: pad }), u = v.u;
      const [vx, vy, vw, vh] = viewBox(v, size);
      const within: [number, number, number, number] = [vx + pad * u, vy + pad * u, vx + vw - pad * u, vy + vh - pad * u];
      for (const set of setsOf(r)) {
        const asks = set.items.filter((id) => !v0.isles.includes(id)).map((id) => ({ id, ...labelBox(R.place(id)!.item.ko, labelPx(W)) }));
        const res = placeLabels((id) => S.cells.get(id), asks, {
          mode: 'must', u, obstacles: S.ids.map((id) => ({ rings: S.cells.get(id)!.rings, box: S.cells.get(id)!.box })), within,
          center: [(S.box[0] + S.box[2]) / 2, (S.box[1] + S.box[3]) / 2], plateHome: r.layer === 'sido',
        });
        const at = `${key} ${set.tag} ${W}`;
        const ko = (id: string) => R.place(id)!.item.ko;
        if (res.length !== asks.length) bad.push(`${at}: ${asks.length - res.length}곳 빠짐`);
        const bx = res.map((p) => { const a = asks.find((q) => q.id === p.id)!; return { p, b: [p.x - (a.w * u) / 2, p.y - (a.h * u) / 2, p.x + (a.w * u) / 2, p.y + (a.h * u) / 2] }; });
        for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++) {
          const a = bx[i].b, b = bx[j].b;
          if (a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]) bad.push(`${at}: ${ko(bx[i].p.id)}·${ko(bx[j].p.id)} 겹침`);
        }
        for (const { p, b } of bx) {
          if (!p.out) continue;
          if (b[0] < within[0] - 1e-6 || b[1] < within[1] - 1e-6 || b[2] > within[2] + 1e-6 || b[3] > within[3] + 1e-6) bad.push(`${at}: ${ko(p.id)} 범위 밖`);
          const c = S.cells.get(p.id)!.label;
          longest = Math.max(longest, Math.hypot(p.out.ax - c[0], p.out.ay - c[1]) / u);
          for (const o of bx) if (o.p.id !== p.id && segHitsBox(c[0], c[1], p.out.ax, p.out.ay, o.b[0], o.b[1], o.b[2], o.b[3])) bad.push(`${at}: ${ko(p.id)} 지시선이 ${ko(o.p.id)} 이름표를 지남`);
        }
        n++;
      }
    }
  }
  return { bad, n, longest };
}

test('이름표 놓기(2026-11-15 과 시작·요약 = 지역 전체 지도): 모든 지역·시·도·일반구·동 단원 과의 이름을 폰·PC 지도 칸에 꼭 보이게(must) 놓으면 이름표끼리 겹치지 않고 보이는 범위 안이며, 지시선이 다른 이름표 밑을 지나지 않는다', () => {
  // 작은 칸이 몰린 과(광주특별시 1과 자치구 다섯 · 제주시 1과 동 등)는 흰 판 네 쪽이 다 막힌다. 옛 규칙(가리는 넓이가 가장 작은 쪽)은 판끼리 덮거나 범위를 넘었다
  // (이 흉내로 지역 과 3 · 동 단원 과 85 경우 — 폰 광주특별시 1과 '광산구' 판이 '동구' 판을 덮음). 지금은 점 둘레의 빈 자리를 먼저 찾는다(labelfit placeOutside).
  // 점검(11-15)에서 폰 동 단원 과 11곳의 지시선이 다른 판 밑을 지났다(여수시 2과 '미평동' → '문수동' 판 등) — 지시선이 이름표만 피하는 단계 · 막힌 판을 앞으로 옮겨 다시 놓기로 0
  const { R, maps } = wholeMaps(true);
  const { bad, n, longest } = auditWhole(R, maps, (r) => r.lessons.map((l) => ({ tag: `${l.no}과`, items: l.items })));
  assert.deepEqual(bad, []);
  assert.ok(n > 1000, `견준 과 지도 ${n}`);
  assert.ok(longest <= 120, `가장 긴 지시선 ${longest.toFixed(0)}px(반지름 2배 120px 안)`);
});

test('이름표 놓기(시험 결과 꼴): 지역·시·도·일반구 지도의 모든 칸을 꼭 보이게(must — 모두 틀린 결과) 놓아도 폰·PC 에서 겹치지 않고 범위 안, 지시선이 다른 이름표를 지나지 않는다', () => {
  // 결과 쪽은 틀린 곳 모두를 지역 전체 지도에 must 로 놓는다(과 크기 3~8곳보다 훨씬 많다). 동 단원은 넣지 않았다 — 폰 제주시(25동 모두 틀림)는 판 3쌍이 겹친다(구현 전부터)
  const { R, maps } = wholeMaps(false);
  const { bad, n, longest } = auditWhole(R, maps, (r) => [{ tag: '모두', items: r.items.map((it) => it.id) }]);
  assert.deepEqual(bad, []);
  assert.ok(n >= 30, `견준 지도 ${n}`);
  assert.ok(longest <= 120, `가장 긴 지시선 ${longest.toFixed(0)}px`);
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

test('섬 상자 축척(2026-11-15 — 먼 섬 · 축척 다름 대신 실제 축척): 상자 배율로 본 지도 막대와 같은 1·2·5 계단, 막대 범위는 상자 폭에 맞춰 줄인다', () => {
  // 128px 상자: 가장 긴 막대 38.4(= 128 × 0.3), 가장 짧은 막대 15.36(그 2/5)
  assert.deepEqual(insetScale(1 / 1100, ISLE_W), { m: 20000, px: 20000 / 1100, text: '20km' });   // 인천 먼 섬 상자 쯤(50km 는 45px 라 김)
  assert.equal(insetScale(1 / 119, ISLE_W - 2).text, '2km');                                        // 옹진 백령면 상자 쯤
  assert.equal(insetScale(1 / 275, ISLE_W).text, '10km');                                           // 충남 격렬비열도 상자 쯤
  assert.equal(insetScale(1 / 8, 300).text, '200m');                                                // 넓은 격자 상자 하나(많이 키움) — m 글
  assert.equal(insetScale(1 / 200, 2000).px, 5000 / 200, '가장 긴 막대는 40px 를 넘지 않는다(상자 폭이 커도)');
  // 상자 폭 80~400px · 1px 10m~2km(실제 상자 범위 — 1440 넓은 격자 상자 하나 ~10m, 인천 먼 섬 1.1km): 막대는 범위 안, 길이는 그 상자의 실제 축척(m × k)
  for (const w of [80, 117, 128, 179, 295, 400]) for (const u of [10, 37, 69, 140, 223, 870, 1100, 2000]) {
    const s = insetScale(1 / u, w), max = Math.min(BAR_MAX, w * BAR_FRAC);
    assert.ok(s.px >= max / 2.5 - 1e-9 && s.px <= max + 1e-9, `w=${w} u=${u}: ${s.text} ${s.px.toFixed(1)}px (${(max / 2.5).toFixed(1)}~${max.toFixed(1)})`);
    assert.ok(Math.abs(s.px - s.m / u) < 1e-9);
    assert.equal(s.text, s.m >= 1000 ? `${s.m / 1000}km` : `${s.m}m`);
  }
  // 상자 안 축척 칸 크기: 막대와 글 가운데 긴 쪽 + 11(여백·선), 높이 30(글 위 · 막대 아래)
  assert.deepEqual(scaleChip({ px: 20, text: '2km' }), { w: Math.ceil(textWidth('2km', 14)) + 11, h: 30 });
  assert.deepEqual(scaleChip({ px: 38, text: '5km' }), { w: 38 + 11, h: 30 });
});

test('먼 섬 상자(지역 지도 S.far): 상자 크기·배율과 아래 칸 막대 — 인천 20km · 충남 10km · 전남광주 20km', () => {
  const far = (key: string) => {
    const s = key in shapes ? shapes[key] : buildShapes(topoOf(key), specOf(reg.region(key)!), geo.labels);
    return farInset(s.far!.box);
  };
  for (const [key, text] of [['incheon', '20km'], ['chungnam', '10km'], ['jeonnam-gwangju', '20km']] as const) {
    const f = far(key);
    assert.ok(f.w <= ISLE_W && f.h <= ISLE_H && Math.max(f.w / ISLE_W, f.h / ISLE_H) > 0.99, `${key} 상자 ${f.w}×${f.h}`);
    // k 는 반올림한 그림 크기에 meet 으로 맞춘 실제 배율: 범위가 그림 안에 들고 한 변은 꼭 맞는다
    assert.ok(f.vb[2] * f.k <= f.w + 1e-9 && f.vb[3] * f.k <= f.h + 1e-9);
    assert.ok(Math.abs(f.vb[2] * f.k - f.w) < 1e-9 || Math.abs(f.vb[3] * f.k - f.h) < 1e-9);
    const s = insetScale(f.k, ISLE_W);   // svgmap 은 그림 폭이 아니라 상자 최대 폭으로 막대 범위를 정한다(전남광주 그림 62px)
    assert.equal(s.text, text, key);
    assert.ok(Math.abs(s.px - s.m * f.k) < 1e-9, `${key}: 막대 ${s.px.toFixed(1)}px = ${s.m}m × 배율`);
  }
});

test('섬 상자 축척 칸 귀퉁이: 그 상자의 섬을 덮지 않는 귀퉁이를 먼저(맥락 땅은 그다음), 해안선이 조금 걸쳐도 덮음으로 센다, 이름 칸 자리는 뺀다', () => {
  const sq = (x0: number, y0: number, x1: number, y1: number) => [new Float64Array([x0, y0, x1, y0, x1, y1, x0, y1])];
  const cell = (b: [number, number, number, number], own: boolean): IsleCell => ({ rings: sq(...b), box: b, own });
  const view: [number, number, number, number] = [0, 0, 1000, 1000];   // 100×100px 상자 → 1px = 10 지도 단위
  // 그 상자의 섬이 오른쪽 아래, 맥락 땅이 왼쪽 아래: 맥락 땅을 덮더라도 섬을 덮지 않는 왼쪽 아래(이름이 있어 위 둘은 막힘)
  const c1 = cornerCover(view, 100, 100, 40, 20, [cell([700, 700, 1000, 1000], true), cell([0, 700, 300, 1000], false)]);
  assert.ok(c1.br >= OWN_W && c1.bl > 0 && c1.bl < OWN_W, JSON.stringify(c1));
  assert.equal(pickCorner(c1, 100, 40, 60), 'bl');
  // 이름 칸이 없으면 덮는 것이 없는 위쪽(같으면 tr → tl 차례)
  assert.equal(pickCorner(c1, 100, 40, 0), 'tr');
  // 해안선이 칸 귀퉁이에 1px 만 걸쳐도 센다(섬 [390,0]–[590,805] 는 왼쪽 아래 칸 [0,800]–[400,1000] 에 10×5 단위만 들어간다)
  const c2 = cornerCover(view, 100, 100, 40, 20, [cell([390, 0, 590, 805], true)]);
  assert.ok(c2.bl >= OWN_W, JSON.stringify(c2));
  assert.equal(c2.br, 0);
  // 오른쪽 위는 이름 칸(폭 nameW)과 4px 넘게 떨어질 때만, 왼쪽 위는 이름이 있으면 안 됨. 모두 같으면 오른쪽 아래 먼저
  const flat = { br: 5, bl: 5, tr: 0, tl: 0 };
  assert.equal(pickCorner(flat, 100, 40, 50), 'tr');
  assert.equal(pickCorner(flat, 100, 40, 57), 'br');
  assert.equal(pickCorner({ br: 0, bl: 0, tr: 0, tl: 0 }, 100, 40, 0), 'br');
});

test('섬 상자 글(2026-11-15): 먼 섬 · 축척 다름 → 먼 섬(영어 Far islands) — 축척은 막대로', () => {
  assert.equal(UI_KO.inset, '먼 섬');
  assert.equal(UI_EN.inset, 'Far islands');
  const all = JSON.stringify([UI_KO, UI_EN], (_, v) => (typeof v === 'function' ? String(v) : v));
  assert.ok(!/축척 다름|not to scale/.test(all), '옛 글이 남지 않았다');
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

// 동 단원 지도(계획서 N11·E5): 지역 동 파일(seoul-emd.topo.json·labels-emd.json)은 E5 부터 내보내지 않아 시험용 단원 파일(tests/fixtures/emd)로 본다
const FIX_EMD = path.join(import.meta.dirname, '../fixtures/emd');
const unitFix = (code: string) => ({
  topo: JSON.parse(fs.readFileSync(path.join(FIX_EMD, `${code}.topo.json`), 'utf8')) as Topology,
  file: JSON.parse(fs.readFileSync(path.join(FIX_EMD, `${code}.json`), 'utf8')) as { items: { id: string }[]; labels: Record<string, [number, number, number]>; layer: 'emd' },
});

test('동 층(단원 파일: 종로구 17동)도 같은 함수로 — 동과 같은 위상의 이웃 땅, 먼 섬 상자는 끈다', () => {
  const { topo, file } = unitFix('11110');
  const ids = file.items.map((it) => it.id);
  const s = buildShapes(topo, { layer: 'emd', idKey: 'id', ids, far: false }, file.labels);
  assert.equal(s.ids.length, 17);
  // 동 단원은 늘 단원 정보(unit)가 붙어 등록된다(registry addUnit)
  assert.deepEqual(specOf({ layer: 'emd', items: file.items, unit: { parent: 'seoul', code: '11110', meet: {}, outside: {} } } as never), { layer: 'emd', idKey: 'id', ids, far: false });
  // 단원 정보가 없는 layer 'emd' 는 과 없는 지역(세종·제주, E8)의 지역 지도 — 지역 -sgg 파일의 시·군·구 층
  // (E16) 지역 지도는 먼 섬 경도(farLon)를 지역 표에서 받는다 — 키가 없거나 far 가 기본 규칙이면 FAR_LON(125.9)
  assert.deepEqual(specOf({ layer: 'emd', items: [{ id: 'kr:sgg:36110' }] } as never), { layer: 'sgg', idKey: 'sggId', ids: ['kr:sgg:36110'], farLon: 125.9 });
  assert.ok(s.edgeD.length > 1000);
  assert.ok(s.outD.length > 1000, '이웃 시·군·구 땅');
  assert.ok(s.names.some((n) => n.text === '은평구'), '이웃 땅 이름(맥락 이름)');
  // 옹진군 단원: 모든 동이 섬이라도 FAR_LON 섬 상자는 만들지 않는다(동 단원은 과·화면의 insets 로 섬마다 상자를 둔다)
  const o = unitFix('28720');
  assert.equal(buildShapes(o.topo, specOf({ layer: 'emd', items: o.file.items, unit: { parent: 'incheon', code: '28720', meet: {}, outside: {} } } as never), o.file.labels).far, null);
});

test('고리 상자: 켜고 끈 판정·거리·이름표 자리가 세 지역 모든 칸에서 같다(계획서 E5 결과 같음 시험)', () => {
  const run = () => {
    const out: unknown[] = [];
    for (const [key, s] of Object.entries(shapes)) {
      const r = reg.region(key)!;
      const cellOf = (id: string) => s.cells.get(id);
      for (const width of [358, 900]) {
        const u = (s.box[2] - s.box[0]) / width;
        out.push(placeInside(cellOf, r.items.map((it) => ({ id: it.id, ...labelBox(it.ko, 14) })), u));
      }
      for (const id of s.ids) {
        const c = s.cells.get(id)!;
        // 칸 상자 안팎 격자 점 7×7: 안·밖, 경계까지 거리, 작은 상자 겹침
        for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) {
          const x = c.box[0] + ((c.box[2] - c.box[0]) * (i - 0.5)) / 6, y = c.box[1] + ((c.box[3] - c.box[1]) * (j - 0.5)) / 6;
          out.push(inside(c.rings, x, y), edgeDist(c.rings, x, y), edgeHitsBox(c.rings, x, y, 800, 300), boxInside(c.rings, x, y, 400, 200));
        }
      }
    }
    return JSON.stringify(out);
  };
  setRingIndex(false);
  const plain = run();
  setRingIndex(true);
  assert.equal(run(), plain);
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

/* ---------- 2026-11-16 묶음 점검 뒤 고치기 ---------- */

test('먼 섬 상자 자리(maps.ts insetPad — 2026-11-16 점검 1): 본 지도가 가장 큰 안의 1/INSET_SHRINK 보다 작아지는 안은 고르지 않는다 · 낮은 폰 375×667(지도 칸 375×267) 전남광주 지역 지도가 97×67px 로 줄던 것', () => {
  const fake = (w: number, h: number, iw: number, ih: number) => {
    const cls = new Set<string>();
    const host = {
      clientWidth: w, clientHeight: h,
      classList: { remove: (c: string) => cls.delete(c), toggle: (c: string, on: boolean) => { if (on) cls.add(c); else cls.delete(c); return on; } },
      querySelector: () => ({ offsetLeft: 12, offsetWidth: iw, offsetHeight: ih }),
    };
    return { host: host as unknown as HTMLElement, cls };
  };
  const base = { t: 14, r: 14, b: 14, l: 14 };
  const run = (key: string, w: number, h: number, iw: number, ih: number) => {
    const r = reg.region(key)!, S = buildShapes(topoOf(key), specOf(r), geo.labels), box = boxOf(r.fit), size = { w, h };
    const { host, cls } = fake(w, h, iw, ih);
    const p = insetPad(host, S, box, S.ids, base);
    return { p, bl: cls.has('inset-bl'), k: fitView(box, size, base).u / fitView(box, size, p).u };
  };
  // 전남광주(먼 섬 상자 77×160 — 세로로 긴 흑산·홍도·가거도): 위를 비우는 안(덮음 0, 지역 지도 28%) 대신 옆을 비우는 안(작은 섬 하나에 걸침, 거의 그대로)
  for (const [w, h] of [[375, 267], [390, 264], [360, 220]] as const) {
    const g = run('jeonnam-gwangju', w, h, 77, 160);
    assert.equal(g.p.l, 12 + 77 + 14, `${w}x${h} 옆을 비움`);
    assert.equal(g.p.t, 14, `${w}x${h} 위는 그대로`);
    assert.ok(g.k >= 1 / INSET_SHRINK, `${w}x${h} 지역 지도 ${(g.k * 100).toFixed(0)}%`);
  }
  // 덮음을 피하느라 절반보다 덜 줄어드는 안(인천·충남 낮은 칸 — 지도 55~65%)은 전처럼 고른다(문턱이 1.5 면 이 경우들이 섬을 덮는 안으로 바뀌었다)
  const ic = run('incheon', 343, 340, 130, 138);
  assert.notDeepEqual(ic.p, base);
  assert.ok(ic.k < 0.7 && ic.k >= 1 / INSET_SHRINK, `인천 343x340 ${(ic.k * 100).toFixed(0)}%`);
  assert.equal(INSET_SHRINK, 2);
});

test('영어 둘러보기 깨끗한 흰 판(labelfit cleanPlates — 2026-11-16 점검 1): fit 에서 칸에도 빈 바탕에도 안 드는 이름을 남의 칸을 덮지 않는 판에 둔다, 그런 자리가 없으면 전처럼 뺀다 · 켜지 않으면 fit 그대로', () => {
  // 가로 200 의 칸 셋이 위아래로 붙어 있다(가운데 칸 B 는 높이 16 이라 이름표 20 이 들지 않는다). 바탕 없음(within 이 칸 범위와 같아 빈 바탕 자리가 없다)
  const sq = (x0: number, y0: number, x1: number, y1: number) => new Float64Array([x0, y0, x1, y0, x1, y1, x0, y1, x0, y0]);
  const cell = (x0: number, y0: number, x1: number, y1: number) => ({ rings: [sq(x0, y0, x1, y1)], box: [x0, y0, x1, y1] as [number, number, number, number], label: [(x0 + x1) / 2, (y0 + y1) / 2] as const, r: Math.min(x1 - x0, y1 - y0) / 2 });
  const cells: Record<string, ReturnType<typeof cell>> = { A: cell(0, 0, 200, 100), B: cell(0, 100, 200, 116), C: cell(0, 116, 200, 216) };
  const asks = [{ id: 'B', w: 120, h: 20 }];
  const opt = { mode: 'fit' as const, u: 1, obstacles: Object.values(cells).map((c) => ({ rings: c.rings, box: c.box })), within: [0, 0, 200, 216] as [number, number, number, number], center: [100, 108] as const };
  const of = (id: string) => cells[id];
  assert.deepEqual(placeLabels(of, asks, opt), [], 'fit — 칸에도 빈 바탕에도 안 들어 뺀다');
  // A·C 도 이름표를 다는 칸이면 B 판은 남의 칸을 덮을 수밖에 없다 — 2026-11-20: 영어 이름이 빠지지 않게 덮는 자리도 쓴다(다른 이름표·점과는 겹치지 않는다)
  const all = [{ id: 'A', w: 40, h: 20 }, ...asks, { id: 'C', w: 40, h: 20 }];
  const got = placeLabels(of, all, { ...opt, cleanPlates: true });
  const pb = got.find((p) => p.id === 'B');
  assert.ok(pb?.out?.plate, '남의 칸을 덮어도 판을 둔다');
  const pa = got.find((p) => p.id === 'A')!, pc = got.find((p) => p.id === 'C')!;
  const hit = (p: { x: number; y: number }, q: { x: number; y: number }, w: number, h: number) => Math.abs(p.x - q.x) < w && Math.abs(p.y - q.y) < h;
  assert.ok(!hit(pb!, pa, 80, 20) && !hit(pb!, pc, 80, 20), '다른 이름표와 겹치지 않는다');
  assert.equal(placeLabels(of, all, opt).some((p) => p.id === 'B'), false, '켜지 않으면 fit 그대로 — 뺀다');
  // 이름표를 다는 칸이 B 뿐이면(A·C 는 다른 과) 판을 둔다 — 자기 점 위 22px(LIFT_PX) 위 판
  const one = placeLabels(of, asks, { ...opt, cleanPlates: true });
  assert.equal(one.length, 1);
  assert.equal(one[0].out?.plate, true);
  assert.ok(one[0].y < 108, '판이 점 위');
});

test('맥락 이름 자리 한 벌(svgmap ctxPlaced·layCtxLead — 결정표 D96 사용자 결정 11-17): 제자리 → 점을 덮은 채 조금 옮김 → 점·선(이름표를 놓은 뒤, 바다 이름보다 먼저)(소스)', () => {
  const sv = fs.readFileSync(path.join(import.meta.dirname, '../../src/app/map/svgmap.ts'), 'utf8');
  const body = (name: string) => { const i = sv.indexOf(`  function ${name}(`); return sv.slice(i, sv.indexOf('\n  }\n', i)); };
  assert.match(body('drawContext'), /for \(const \{ n, t, w, h, at, show \} of ctxPlaced\(\)\)/);
  assert.match(body('layLabels'), /const avoid = !opt\.contextNames \? \[\] : ctxPlaced\(\)\.flatMap/);
  const cp = body('ctxPlaced');
  // 강 이름은 옮기지 않는다(물가·띠 자리 ctxSpot)
  assert.match(cp, /if \(n\.kind === 'water' \|\| !spot\) \{/);
  // 그 땅의 점이 안 보이면 이름도 없다
  assert.match(cp, /if \(hx < view\[0\] \|\| hx > view\[2\] \|\| hy < view\[1\] \|\| hy > view\[3\]\) \{ out\.push\(\{ n, t, w, h, at: spot, show: false \}\); continue; \}/);
  // ① 제자리: 보이는 범위 안 · 겹침 없음 · 이 지역 칸에 걸치지 않음
  assert.match(cp, /if \(homeIn && !block\.length && !onCell\(hx, hy, hb\)\) \{ drawn\.push\(hb\);/);
  assert.match(cp, /const onCell = \(x: number, y: number, nb: Box\) => obstacles\.some\(\(ob\) => hit\(ob\.box, nb\) && boxHits\(ob\.rings, x, y, w, h\)\);/);
  // ② 그 땅 안에서 글자(상자 여유를 뺀 것)가 드는 가장 가까운 자리 — 보이는 범위 안, 먼저 놓은 이름·화면에 붙은 것을 피해서(labelfit fitBox). 땅 도형이 없을 때만 점을 덮은 채 조금 옮기기
  // (제 땅 안이라 강 띠에 걸치는 것은 둔다 — 사용자 11-17 '한강을 지우고 서울을 넣으면': 강 이름은 땅 이름 뒤에 놓고, 겹치면 강 이름을 뺀다)
  assert.match(cp, /if \(n\.land\?\.length\) \{/);
  assert.match(cp, /near = fitBox\(n\.land, vb, from, fw, th, st, Math\.hypot\(lb\[2\] - lb\[0\], lb\[3\] - lb\[1\]\), av\);/);
  // 고른 자리의 글자 상자가 보이는 범위 안인지 다시 본다(fitBox 는 시작점이 땅 안이면 그 점을 돌려준다 — 탐침에서 지도 밖으로 잘린 이름 30곳쯤)
  assert.match(cp, /if \(near && !boxIn\(view, near\[0\], near\[1\], w, h\)\) near = null;/);
  assert.match(cp, /const vb: Box = \[Math\.max\(lb\[0\], view\[0\] \+ e\), Math\.max\(lb\[1\], view\[1\] \+ m\), Math\.min\(lb\[2\], view\[2\] - e\), Math\.min\(lb\[3\], view\[3\] - m\)\];/);
  // 다 들지 않으면 글자 폭의 85%만 들어도 둔다(폰 경기 지도의 서울 — 그보다 좁으면 점·선)
  assert.match(cp, /for \(const f of \[1, LAND_FIT\]\) \{/);
  assert.match(sv, /const LAND_FIT = 0\.85;/);
  // 강이 그 땅을 가르면(경기 지도의 서울) 땅과 강을 합친 곳 안에 드는 자리 — 글자가 강 위에 걸친다(사용자 11-17 '한강을 지우고 서울을 넣으면')
  assert.match(cp, /if \(!river \|\| !S\.water\.length\) continue;/);
  assert.match(cp, /landAt\.set\(key, c = landSpan\(n\.land, lb, hx, hy, fw, th, st\)\);/);
  assert.match(body('landSpan'), /if \(!inside\(land, xx, yy\) && !inside\(S\.water, xx, yy\)\) return false;/);
  assert.match(cp, /\} else near = nearest\(Math\.max\(0, w \/ 2 - 3 \* u\), Math\.max\(0, h \/ 2 - 2 \* u\), false, true\);/);
  assert.match(cp, /for \(const n of \[\.\.\.S\.names\.filter\(\(m\) => m\.kind !== 'water'\), \.\.\.S\.names\.filter\(\(m\) => m\.kind === 'water'\)\]\) \{/);
  assert.match(cp, /const show = !!spot && boxIn\(view, spot\[0\], spot\[1\], w, h\) && !drawn\.some\(\(k\) => hit\(grow\(k\), boxAt\(spot\[0\], spot\[1\], w, h\)\)\);/);
  assert.match(cp, /return overRiver \|\| !\(river && S\.water\.length && hit\(waterBox, nb\) && boxHits\(S\.water, x, y, w, h\)\);/);
  // ③ 아니면 지시선 대상 — 자리(at)가 없어 칸 밖 이름표가 피할 자리에서 빠진다. 전 방식 자리는 예비(fb)로 남긴다(이름을 빼지는 않는다)
  assert.match(cp, /out\.push\(\{ n, t, w, h, at: null, show: false, lead: \{ home: \[hx, hy\], fb \} \}\);/);
  assert.match(cp, /let fb: \[number, number\] \| null = homeIn \? \[hx, hy\] : null;/);
  // 점이 화면에 붙은 것 밑이면 선 없이 전 방식으로
  assert.match(cp, /if \(sc\.some\(\(k\) => hx >= k\[0\] && hx <= k\[2\] && hy >= k\[1\] && hy <= k\[3\]\)\) \{/);
  // 지시선 이름은 이름표를 놓은 뒤·바다 이름보다 먼저(drawSea 맨 앞 — 이름표가 없는 지도도 지난다), 바다 이름은 그 글자 상자와 선을 피한다
  const ds = body('drawSea');
  assert.match(ds, /^  function drawSea\(\) \{\n\s+layCtxLead\(\);/);
  assert.match(ds, /const blocked: Box\[\] = grid \? \[\] : \[\.\.\.screenBoxes\(\), \.\.\.ctxTaken, \.\.\.leadTaken\];/);
  assert.match(ds, /const lines: \[number, number, number, number\]\[\] = grid \? \[\] : \[\.\.\.leadLines\];/);
  const ll = body('layCtxLead');
  // 피하는 것: 화면에 붙은 것·맥락 이름·칸 밖 이름표(+ 지시선)·지역 칸·그린 강. 선은 이름표(칸 안·밖)·다른 이름 위로 지나지 않고 다른 지시선과 엇갈리지 않는다
  assert.match(ll, /const blocked: Box\[\] = \[\.\.\.screenBoxes\(\), \.\.\.ctxTaken\];/);
  assert.match(ll, /blocked\.push\(\.\.\.outLab\);/);
  assert.match(ll, /if \(obstacles\.some\(\(ob\) => hit\(ob\.box, nb\) && boxHits\(ob\.rings, cx, cy, w, h\)\)\) return false;/);
  assert.match(ll, /if \(all\.some\(\(k\) => segBox\(seg, k\)\) \|\| inLab\.some\(\(k\) => segBox\(seg, k\)\)\) return false;/);
  assert.match(ll, /return !allLines\.some\(\(l\) => segSeg\(seg, l\)\);/);
  // 선이 이 지역 칸 위를 지나는 것은 둔다(칸에 둘러싸인 서울·세종 — 칸 밖 이름표 '완주군'의 지시선과 같다)
  assert.doesNotMatch(ll, /inside\(ob\.rings/);
  // 가까운 자리부터(선 길이 → 가운데 거리). 끌기만 했으면 전 자리를 그대로. 자리가 없으면 전 방식 자리 — 이름표·지시선과 겹치면 뺀다(공부할 칸의 이름표가 먼저)
  assert.match(ll, /cands\.sort\(\(p, q\) => p\[4\] - q\[4\] \|\| p\[5\] - q\[5\]\);/);
  assert.match(ll, /const found = \(was && was\.u === u && fits\(was\.at\) \? was\.at : undefined\) \?\? cands\.find\(fits\);/);
  assert.match(ll, /if \(outLab\.some\(\(k\) => hit\(k, nb\)\) \|\| inLab\.some\(\(k\) => hit\(k, nb\)\) \|\| leadTaken\.some\(\(k\) => hit\(k, nb\)\) \|\| allLines\.some\(\(l\) => segBox\(l, nb\)\)\) continue;/);
  // 선 끝은 점에서 글자 가운데로 긋는 선이 글자 상자와 만나는 곳(칸 밖 이름표의 지시선과 같은 함수)
  assert.match(ll, /const \[ex, ey\] = leadToCenter\(\[cx - w \/ 2, cy - h \/ 2, cx \+ w \/ 2, cy \+ h \/ 2\], \[hx, hy\]\);/);
  // 점·선은 따로 묶고(cm-ctxlead) 글은 맥락 이름 그대로(cm-ctxname out lead)
  assert.match(ll, /pxGroup\(hx, hy, 'cm-ctxlead', gLead\)/);
  assert.match(ll, /`cm-ctxname out\$\{found \? ' lead' : ''\}`/);
  const css = fs.readFileSync(path.join(import.meta.dirname, '../../src/app/map/map.css'), 'utf8');
  assert.match(css, /\.cm-ctxlead path \{ fill: none; stroke: var\(--ink-2\); stroke-width: 1; \}\n\.cm-ctxlead circle \{ fill: var\(--ink-2\); \}/);
});

test('지시선 끝(labelfit leaderEnd·leadToCenter — 사용자 11-17 \'점과 이어진 선이 글자와 정확히 이어지게, 전국 전부\'): 글자만 있는 이름은 글자 가운데 쪽으로, 흰 판은 판에서 점에 가장 가까운 곳', async () => {
  const { leaderEnd, leadToCenter } = await import('../../src/app/map/labelfit.ts');
  const b: [number, number, number, number] = [100, 50, 160, 70];   // 가운데 (130, 60), 반폭 30 · 반높이 10
  // 가운데 쪽(이웃 땅 이름 — cut 0): 옆에서 오면 옆 변의 가운데 높이, 위·아래에서 오면 가로 가운데
  assert.deepEqual(leadToCenter(b, [200, 60]), [160, 60]);
  assert.deepEqual(leadToCenter(b, [130, 0]), [130, 50]);
  assert.deepEqual(leadToCenter(b, [130, 200]), [130, 70]);
  // 비낀 자리: 선은 가운데를 향하고(끝점·점·가운데가 한 줄), 끝점은 상자 변 위
  for (const at of [[220, 30], [40, 110], [150, -40], [60, 55]] as [number, number][]) {
    const [x, y] = leadToCenter(b, at);
    assert.ok(Math.abs((x - 130) * (at[1] - 60) - (y - 60) * (at[0] - 130)) < 1e-6, `한 줄 ${at}`);
    assert.ok(Math.abs(Math.max(Math.abs(x - 130) / 30, Math.abs(y - 60) / 10) - 1) < 1e-9, `변 위 ${at}`);
    assert.ok((x - 130) * (at[0] - 130) >= 0 && (y - 60) * (at[1] - 60) >= 0, `점 쪽 ${at}`);
  }
  assert.deepEqual(leadToCenter(b, [220, 50]).map((v) => +v.toFixed(2)), [160, 56.67]);
  assert.deepEqual(leadToCenter(b, [140, 62]), [140, 62], '점이 상자 안이면 그 점');
  // 판 없는 칸 밖 이름표(g > 0): 가운데 쪽, 상자 여유를 뺀 글자 바로 옆(2px — g 가 GAP_PX 4px 일 때 지도 단위 1 = 1px)
  assert.deepEqual(leaderEnd(b, [200, 60], 4), [158, 60]);
  assert.deepEqual(leaderEnd(b, [130, 0], 4), [130, 52]);
  assert.deepEqual(leaderEnd(b, [220, 50], 4), leadToCenter(b, [220, 50], 2));
  // 흰 판(g = 0): 판에서 점에 가장 가까운 곳(판 테두리 — 선이 가장 짧다). 가운데 쪽으로 기울이면 이름표 자리는 그대로인데 옆 지시선과 엇갈렸다(배포 전 측정)
  assert.deepEqual(leaderEnd(b, [220, 50], 0), [160, 50]);
  assert.deepEqual(leaderEnd(b, [140, 0], 0), [140, 50]);
  assert.deepEqual(leaderEnd(b, [200, 62], 0), [160, 62]);
  // 그때 걸린 곳(마포구 3과 폰 — 화면 px): '도화동' 판(280~330 × 158~178, 점 323,225)의 선은 곧게 위로, '염리동' 판(241~291 × 178~198, 점 313,188)의 선은 곧게 옆으로 — 엇갈리지 않는다
  const dohwa = leaderEnd([280, 158, 330, 178], [323, 225], 0), yeomni = leaderEnd([241, 178, 291, 198], [313, 188], 0);
  assert.deepEqual([dohwa, yeomni], [[323, 178], [291, 188]]);
  assert.ok(dohwa[0] > 313, '도화동 선(x = 323)은 염리동 선(x 291~313) 오른쪽');
});

test('이웃 땅 이름에 그 땅의 도형(shapes names.land): 글자가 그 땅 안에 드는 자리를 찾는 데 쓴다 — 강 이름에는 없다', () => {
  const s = shapes.gyeonggi;
  const seoul = s.names.find((n) => n.text === '서울특별시');
  assert.ok(seoul?.land?.length, '서울 땅 도형');
  // 이름 점은 그 땅 안
  assert.ok(inside(seoul!.land!, seoul!.x, seoul!.y), '서울 이름 점이 서울 땅 안');
  for (const n of s.names) assert.equal(!!n.land?.length, n.kind === 'out', `${n.text} ${n.kind}`);
});

test('섬 상자 묶음 글(결정표 D2 ⓑ · D111 — 사용자 결정 11-17): 정말 먼 섬이 없는 묶음은 \'섬\', 글과 막대가 상자보다 넓으면 막대를 아래 줄로', async () => {
  const { layoutIsles, ISLE_NOTE_H, ISLE_W, ISLE_H } = await import('../../src/app/map/isles.ts');
  // 글 칸 높이를 두 줄로 주면(상자 하나 — 가로 줄·세로 줄) 글 칸만 커지고 상자 크기는 그대로, 가로 줄은 본 지도가 그만큼 더 비킨다
  const one: [number, number, number, number][] = [[0, 0, 1000, 800]];
  for (const area of [{ x: 12, y: 12, w: 366, h: 470 }, { x: 24, y: 24, w: 900, h: 600 }]) {
    const a = layoutIsles(one, area, false), b = layoutIsles(one, area, false, false, 2 * ISLE_NOTE_H - 2);
    assert.equal(a.mode, b.mode);
    assert.deepEqual([b.boxes[0].w, b.boxes[0].h], [ISLE_W, ISLE_H]);
    assert.equal(b.note.h - a.note.h, ISLE_NOTE_H - 2);
    assert.equal(b.note.w, a.note.w);
    if (a.mode === 'row') { assert.equal(b.shift.b - a.shift.b, ISLE_NOTE_H - 2); assert.equal(b.boxes[0].y, a.boxes[0].y); assert.equal(a.note.y - b.note.y, ISLE_NOTE_H - 2); }
    else { assert.deepEqual(b.shift, a.shift); assert.equal(b.note.y, a.note.y); }
  }
  const sv = fs.readFileSync(path.join(import.meta.dirname, '../../src/app/map/svgmap.ts'), 'utf8');
  // 한 줄로 재서 상자 묶음보다 넓을 때만 두 줄(막대가 있는 묶음 — 상자 하나)
  assert.match(sv, /if \(isleNoteBar && noteEl\.offsetWidth > L\.note\.w \+ 1\) \{ noteEl\.classList\.add\('wrap'\); L = lay\(2 \* ISLE_NOTE_H - 2\); \}/);
  assert.match(sv, /width: noteEl\.classList\.contains\('wrap'\) \? `\$\{n\.w\}px` : ''/);
  assert.match(fs.readFileSync(path.join(import.meta.dirname, '../../src/app/map/map.css'), 'utf8'), /\.cm-isles-note\.wrap \{ flex-direction: column; row-gap: 0; \}/);
  // '섬' 글: 단원의 먼 섬 목록(farIsles)을 받았고 묶음에 그 섬이 하나도 없을 때만. 목록이 없으면(지역 지도·옛 캐시 파일) 전처럼 '먼 섬'
  assert.match(sv, /label\.textContent = far && !ids\.some\(\(id\) => far\.includes\(id\)\) \? \(opt\.isleNote \?\? '섬'\) : \(opt\.insetNote \?\? '먼 섬'\);/);
  assert.deepEqual([UI_KO.inset, UI_KO.isles, UI_EN.inset, UI_EN.isles], ['먼 섬', '섬', 'Far islands', 'Islands']);
  for (const f of ['ui/maps.ts', 'ui/play.ts']) assert.match(fs.readFileSync(path.join(import.meta.dirname, '../../src/app', f), 'utf8'), /insetNote: L\.inset, isleNote: L\.isles, \.\.\.\((region|r)\?\.unit\?\.far \? \{ farIsles: (region|r)\.unit\.far \} : \{\}\)/);
  // 판: 섬 상자가 있는 단원 일곱에만 far 열쇠 — 먼 섬이 있는 곳은 신안(흑산면)·옹진(백령·대청·연평)·제주시(추자면), 나머지 넷은 빈 목록('섬')
  const dir = path.join(import.meta.dirname, '../../public/data/geo', DATA_VER, 'emd');
  const got: Record<string, string[]> = {};
  for (const f of fs.readdirSync(dir).filter((x) => /^\d{5}\.json$/.test(x))) {
    const u = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const boxed = [...u.lessons, ...u.screens].some((x: { insets?: string[] }) => x.insets?.length);
    assert.equal(Array.isArray(u.far), boxed, `${u.ko}: far 열쇠는 섬 상자가 있는 단원에만`);
    if (u.far) got[u.ko] = u.far.map((id: string) => u.items.find((it: { id: string }) => it.id === id).ko).sort();
  }
  assert.deepEqual(got, { 여수시: [], 영광군: [], 신안군: ['흑산면'], 옹진군: ['대청면', '백령면', '연평면'], '안산시 단원구': [], 제주시: ['추자면'], 부안군: [] });
  // 등록: 단원 파일의 far 가 지역(unit.far)으로
  const { createRegistry: mk } = await import('../../src/app/registry.ts');
  const r2 = mk(geo);
  const uf = JSON.parse(fs.readFileSync(path.join(dir, '28720.json'), 'utf8'));
  assert.deepEqual(r2.addUnit(uf).unit!.far, uf.far);
  assert.equal(r2.addUnit(JSON.parse(fs.readFileSync(path.join(dir, '11110.json'), 'utf8'))).unit!.far, undefined, '섬 상자 없는 단원');
});
