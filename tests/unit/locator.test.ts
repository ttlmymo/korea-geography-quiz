// 위치 지도(map/locator.ts — 2026-11-15 사용자 지시 '2과부터는 그 부분만 확대돼 어디인지 구분하기 어렵다'): 보일지 · 귀퉁이 고르기 · 이번 과 칠.
// 모양은 커밋된 판(public/data/geo/<판>)의 지역·단원 경계로 만든다(.cache·docs·dist 에 기대지 않는다). 소스를 읽는 시험은 줄끝(CRLF)을 LF 로 맞춰 읽는다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_VER } from '../../src/consts.ts';
import { buildShapes, specOf, type Shapes, type Topology } from '../../src/app/map/shapes.ts';
import { boxOf, type Box } from '../../src/app/map/project.ts';
import { fitView, viewBox, type Pad, type Size } from '../../src/app/map/view.ts';
import { OWN_W, type Corner, type IsleCell } from '../../src/app/map/isles.ts';
import {
  LOC_DOT, LOC_GAP, LOC_MARGIN, LOC_MAX_COVER, LOC_MIN, LOC_ORDER, LOC_PX, LOC_PX_WIDE,
  locBase, locCorners, locCover, locFrame, locLit, locRect, locShow, locSide, meshLines, pickLoc, snapD, viewCover,
} from '../../src/app/map/locator.ts';
import { COMPACT_PX } from '../../src/app/map/svgmap.ts';
import { wholeView } from '../../src/app/ui/maps.ts';
import { homePage, startPage, summaryPage, unitPage } from '../../src/app/ui/pages.ts';
import { createRegistry, type Registry } from '../../src/app/registry.ts';
import type { Ctx } from '../../src/app/ui/ctx.ts';
import type { EmdUnitFile, Region } from '../../src/app/types.ts';
import { geo, reg } from './fixtures.ts';

const DIR = path.join(import.meta.dirname, '../../public/data/geo', DATA_VER);
const J = (f: string) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const src = (f: string) => fs.readFileSync(path.join(import.meta.dirname, '../../src', f), 'utf8').replace(/\r\n/g, '\n');
/** 지역 모양(ui/maps.ts shapesOf 와 같게: 시·도 단원 korea 는 전국 시·도 지도 sido.topo.json + 레지스트리 이름표 점) */
const shapesOf = (key: string): Shapes => {
  const r = reg.region(key)!;
  if (r.layer === 'sido') return buildShapes(J('sido.topo.json') as Topology, specOf(r), Object.fromEntries(r.items.map((it) => [it.id, reg.point(it.id)!])));
  return buildShapes(J(`${r.unit?.parent ?? key}-sgg.topo.json`) as Topology, specOf(r), geo.labels);
};
/** 동 단원(판 emd/<코드>.json · .topo.json): 모양과 단원 정보(wholeView 를 쓰려고 Region 꼴로) */
const unitOf = (code: string) => {
  const u = J(`emd/${code}.json`);
  const S = buildShapes(J(`emd/${code}.topo.json`) as Topology, { layer: 'emd', idKey: 'id', ids: u.items.map((it: { id: string }) => it.id), far: false }, u.labels);
  return { u: u as Region & { lessons: Region['lessons'] }, S };
};

/** 문제 화면 지도 칸 크기(흉내 — 위치 지도는 문제 화면만 쓴다): 폰 만나기·찾기 390×570 · 폰 고르기 390×510(보기 단추 띠가 더 높다) · PC 980×740 */
const PHONE_PLAY: Size = { w: 390, h: 570 }, PHONE_CHOOSE: Size = { w: 390, h: 510 }, PC_PLAY: Size = { w: 980, h: 740 };
const pad = (m: number): Pad => ({ t: m, r: m, b: m, l: m });
const coverOf = (fit: Region['fit'], whole: Region['fit'], size: Size, m: number) => viewCover(fitView(boxOf(fit), size, pad(m)), size, boxOf(whole));

test('위치 지도 보일지: 사용자가 말한 서울 2과·경기 3과는 폰·PC 문제 화면 모두 보이고, 거의 전체가 보이는 과는 숨는다', () => {
  const seoul = reg.region('seoul')!, gg = reg.region('gyeonggi')!;
  for (const [r, no] of [[seoul, 2], [gg, 3], [seoul, 1]] as const) {
    const l = reg.lesson(r.key, no)!;
    for (const [size, m] of [[PHONE_PLAY, 12], [PC_PLAY, 24]] as const) {
      const c = coverOf(l.fit, wholeView(r).fit, size, m);
      assert.ok(c < LOC_MAX_COVER, `${r.key} ${no}과 ${size.w}: 지역 상자의 ${(c * 100).toFixed(0)}%`);
      assert.ok(locShow({ cover: c, lit: l.items.length, total: r.items.length, grid: false }));
    }
  }
  // 서울 2과 폰 문제 화면은 처음 문턱(0.6)에서 숨었다 — 과 판은 지역 외곽선이 옅어 그 정도로는 지역 모양을 알아볼 수 없다
  assert.ok(coverOf(reg.lesson('seoul', 2)!.fit, seoul.fit, PHONE_PLAY, 12) > 0.6);
  // 거의 전체: 강북구 2과(단원 상자의 93% 넘게 보임)는 숨는다
  const { u } = unitOf('11305');
  const c = coverOf(u.lessons[1].fit, wholeView(u).fit, PHONE_PLAY, 12);
  assert.ok(c >= LOC_MAX_COVER, `강북구 2과 ${(c * 100).toFixed(0)}%`);
  // 가리킬 과가 없거나(밝은 칸이 전부·없음) 섬 상자 격자(본 지도를 숨김 — D3)면 숨는다
  assert.equal(locShow({ cover: 0.1, lit: 25, total: 25, grid: false }), false);
  assert.equal(locShow({ cover: 0.1, lit: 0, total: 25, grid: false }), false);
  assert.equal(locShow({ cover: 0.1, lit: 5, total: 25, grid: true }), false);
  assert.equal(locShow({ cover: LOC_MAX_COVER, lit: 5, total: 25, grid: false }), false);
});

test('위치 지도 크기: 폰 84 · 넓은 칸 112, 납작한 지도 칸은 짧은 변의 34% 까지(56 아래로는 안 줄임), 짧은 변은 긴 변의 55% 이상이고 모양은 가운데', () => {
  assert.equal(locSide({ w: 390, h: 570 }, COMPACT_PX), LOC_PX);
  assert.equal(locSide({ w: 980, h: 740 }, COMPACT_PX), LOC_PX_WIDE);
  assert.equal(locSide({ w: 390, h: 195 }, COMPACT_PX), 66);
  assert.equal(locSide({ w: 390, h: 100 }, COMPACT_PX), LOC_MIN);
  const wide = locFrame([0, 0, 3000, 1000], 84), tall = locFrame([0, 0, 1000, 1000], 84);
  assert.deepEqual([wide.w, wide.h], [84, 46]);   // 76×25.3 + 여백 → 짧은 변은 46(84×0.55)
  assert.ok(Math.abs(wide.oy - (46 - 1000 * wide.k) / 2) < 1e-9, '납작한 모양은 위아래 가운데');
  assert.deepEqual([tall.w, tall.h], [84, 84]);
});

test('줄인 모양: 0.5px 격자에 맞춰 이웃 칸이 함께 쓰는 경계가 같고, 작은 고리·틀 밖 고리는 빠지며, 메쉬는 점 둘인 선도 남긴다', () => {
  const f = locFrame([0, 0, 1000, 1000], 84);   // k = 0.076
  // 두 칸이 x=500 에서 맞닿는다(같은 점들을 서로 거꾸로)
  const a = Float64Array.from([0, 0, 500, 0, 500, 333, 500, 1000, 0, 1000]);
  const b = Float64Array.from([500, 0, 1000, 0, 1000, 1000, 500, 1000, 500, 333]);
  const pairs = (d: string) => { const n = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number); return n.flatMap((v, i) => (i % 2 ? [] : [[v, n[i + 1]] as [number, number]])); };
  const pa = pairs(snapD([a], f, true)), pb = pairs(snapD([b], f, true));
  assert.ok(pa.flat().every((v) => Math.abs(v * 2 - Math.round(v * 2)) < 1e-9), '0.5px 격자');
  const sx = Math.round((500 * f.k + f.ox) * 2) / 2;
  const onEdge = (p: [number, number][]) => p.filter(([x]) => x === sx).map((q) => q.join(',')).sort();
  assert.equal(onEdge(pa).length, 3);
  assert.deepEqual(onEdge(pa), onEdge(pb), '맞닿은 경계의 점이 두 칸에서 같다');
  // 1.5px 보다 작은 고리(10m × 0.076 = 0.8px)와 틀 밖 고리는 뺀다. 큰 고리는 남는다
  assert.equal(snapD([Float64Array.from([100, 100, 110, 100, 110, 110, 100, 110])], f, true), '');
  assert.equal(snapD([Float64Array.from([5000, 5000, 6000, 5000, 6000, 6000])], f, true), '');
  assert.ok(LOC_DOT > 1 && snapD([Float64Array.from([100, 100, 200, 100, 200, 200, 100, 200])], f, true).endsWith('Z'));
  // 메쉬: 점 둘인 선도 남기고(poly.ts ringsOfD 는 셋 미만을 뺀다), 닫히지 않은 짧은 선은 빼지 않는다(긴 해안의 토막)
  assert.deepEqual(meshLines('M0 0 10 0M5 5 6 6 7 7'), [[0, 0, 10, 0], [5, 5, 6, 6, 7, 7]]);
  assert.match(snapD(meshLines('M0 0 10 0'), f, false), /^M[\d.]+ [\d.]+ [\d.]+ [\d.]+$/);
});

test('이번 과 칠: 이번 과 칸 모양만 이어 붙이고(다른 칸은 없음), 둘레는 닫힌 선 — 바탕은 지역 칸 모두이고 같은 틀이면 다시 만들지 않는다', () => {
  for (const [key, no] of [['seoul', 2], ['gyeonggi', 3], ['jeonnam-gwangju', 4]] as const) {
    const S = shapesOf(key), r = reg.region(key)!, l = reg.lesson(key, no)!;
    const f = locFrame(boxOf(wholeView(r).fit), LOC_PX);
    const base = locBase(S, f);
    assert.equal(locBase(S, f), base, '같은 모양·틀이면 기억해 둔 것');
    assert.equal(base.cell.size, S.ids.length);
    assert.equal(base.land, [...base.cell.values()].join(''));
    assert.ok(base.rim.length > 100);
    const lit = locLit(S, base, f, l.items);
    for (const id of l.items) assert.ok(base.cell.get(id)!.length > 0 && lit.fill.includes(base.cell.get(id)!), `${key} ${no}과 ${id} 칠`);
    for (const id of S.ids.filter((x) => !l.items.includes(x))) {
      const d = base.cell.get(id)!;
      if (d) assert.ok(!lit.fill.includes(d), `${key} ${no}과 밖 ${id} 는 칠하지 않는다`);
    }
    assert.ok(lit.rim.length > 20, '둘레');
    assert.deepEqual(locLit(S, base, f, []), { fill: '', rim: '' });
  }
  // 한강이 칸에 닿는 서울은 물을 그리고, 닿지 않는 인천은 그리지 않는다(본 지도와 같은 규칙)
  assert.ok(locBase(shapesOf('seoul'), locFrame(boxOf(reg.region('seoul')!.fit), LOC_PX)).water.length > 0);
  assert.equal(locBase(shapesOf('incheon'), locFrame(boxOf(reg.region('incheon')!.fit), LOC_PX)).water, '');
});

test('귀퉁이: 축척 막대·먼 섬 상자·섬 상자 줄과 붙지 않고, 바깥이 뺀 귀퉁이(문제 화면 오른쪽 위)는 쓰지 않는다', () => {
  const size = { w: 390, h: 570 }, w = 86, h = 72;
  assert.deepEqual(locCorners(size, w, h, []), LOC_ORDER);
  assert.deepEqual(locCorners(size, w, h, [], ['tr']), ['tl', 'bl', 'br']);
  // 먼 섬 상자(왼쪽 위 12,12 · 130×134)와 축척 막대 자리(오른쪽 아래)
  const inset = { x: 12, y: 12, w: 130, h: 134 }, scale = locRect('br', size, 136, 40, 6);
  assert.deepEqual(locCorners(size, w, h, [inset, scale], ['tr']), ['bl']);
  // 아래 가로 섬 상자 줄(폭 전체)이면 아래 귀퉁이 둘 다 못 쓴다
  assert.deepEqual(locCorners(size, w, h, [{ x: 12, y: 420, w: 366, h: 138 }]), ['tl', 'tr']);
  // LOC_GAP 안으로 붙어도 못 쓴다(위치 지도 왼쪽 위 10,10 → 오른쪽 끝 96)
  assert.equal(locCorners(size, w, h, [{ x: 10 + w + LOC_GAP - 1, y: 10, w: 20, h: 20 }]).includes('tl'), false);
  assert.equal(locCorners(size, w, h, [{ x: 10 + w + LOC_GAP + 1, y: 10, w: 20, h: 20 }]).includes('tl'), true);
  // 고르기: 덮는 정도가 가장 적은 곳, 같으면 왼쪽 위 → 오른쪽 위 → 왼쪽 아래 → 오른쪽 아래. 쓸 수 있는 곳이 없으면 null(숨김)
  const cov = (o: Partial<Record<Corner, number>>): Record<Corner, number> => ({ tl: 0, tr: 0, bl: 0, br: 0, ...o });
  assert.equal(pickLoc(cov({}), LOC_ORDER), 'tl');
  assert.equal(pickLoc(cov({ tl: 3, tr: 3, bl: 1, br: 1 }), LOC_ORDER), 'bl');
  assert.equal(pickLoc(cov({ tl: OWN_W, bl: 40 }), ['tl', 'bl', 'br']), 'br');
  assert.equal(pickLoc(cov({}), []), null);
  assert.equal(locRect('br', size, w, h).x, size.w - LOC_MARGIN - w);
});

/**
 * svgmap layoutLoc 과 같은 셈: 과 기본 보기에서 귀퉁이마다 덮는 정도(이번 과 칸은 OWN_W 배)와 고른 귀퉁이.
 * 어느 귀퉁이든 이번 과 칸에 걸리면 가장 작은 크기(LOC_MIN)로 다시 재서 덜 걸리는 쪽(small = 작게 다시 잰 것)
 */
function cornerFor(S: Shapes, fit: Region['fit'], items: string[], whole: Region['fit'], size: Size, m: number, avoid: Corner[]) {
  const v = fitView(boxOf(fit), size, pad(m));
  const vb = viewBox(v, size), view: Box = [vb[0], vb[1], vb[0] + vb[2], vb[1] + vb[3]];
  const own = new Set(items);
  const cells: IsleCell[] = S.ids.map((id) => ({ rings: S.cells.get(id)!.rings, box: S.cells.get(id)!.box, own: own.has(id) }));
  const at = (side: number) => {
    const f = locFrame(boxOf(whole), side), W = f.w + 2, H = f.h + 2;
    const cover = locCover(view, size, W + LOC_MARGIN, H + LOC_MARGIN, cells);
    const c = pickLoc(cover, locCorners(size, W, H, size.w >= COMPACT_PX ? [locRect('br', size, 136, 40, 6)] : [], avoid))!;
    return { at: c, cover: cover[c], small: false, W, H };
  };
  const side = locSide(size, COMPACT_PX), got = at(side);
  if (got.cover < OWN_W) return got;
  const s = at(LOC_MIN);
  return s.cover < got.cover ? { ...s, small: true } : got;
}

test('귀퉁이 고르기(실제 과): 서울 2과·경기 3과·종로구 2과·전남광주 4과·전국 2과는 고른 귀퉁이가 이번 과 칸을 덮지 않는다(폰 만나기·찾기·고르기, PC 문제 화면)', () => {
  const cases: { name: string; S: Shapes; fit: Region['fit']; items: string[]; whole: Region['fit'] }[] = [];
  for (const [key, no] of [['seoul', 2], ['gyeonggi', 3], ['jeonnam-gwangju', 4], ['korea', 2]] as const) {
    const r = reg.region(key)!, l = reg.lesson(key, no)!;
    cases.push({ name: `${key} ${no}과`, S: shapesOf(key), fit: l.fit, items: l.items, whole: wholeView(r).fit });
  }
  const { u, S } = unitOf('11110');
  cases.push({ name: '종로구 2과', S, fit: u.lessons[1].fit, items: u.lessons[1].items, whole: wholeView(u).fit });
  // 과 시작(760×515, 오른쪽 위도 씀)은 2026-11-15 사용자 결정으로 지역 전체 지도라 위치 지도가 없다 → 그 자리에 폰 고르기 화면(지도 칸 약 510 — D95 ㉢).
  // 고르기 화면은 지도 칸이 낮아 작게(LOC_MIN) 다시 재는 과가 있다(종로구 2과) — 덮지 않는지만 본다
  for (const c of cases) {
    for (const [size, m, full] of [[PHONE_PLAY, 12, true], [PHONE_CHOOSE, 12, false], [PC_PLAY, 24, true]] as const) {
      const got = cornerFor(c.S, c.fit, c.items, c.whole, size, m, ['tr']);
      assert.ok(got.cover < OWN_W, `${c.name} ${size.w}×${size.h}: ${got.at} 가 이번 과 칸을 덮는다(${got.cover})`);
      assert.notEqual(got.at, 'tr', `${c.name}: 뺀 귀퉁이`);
      if (full) assert.equal(got.small, false, `${c.name} ${size.w}×${size.h}: 제 크기로 든다`);
    }
  }
  // 어느 귀퉁이든 과 칸에 걸리는 과(부산 1과 폰 문제 화면 — 84px 면 왼쪽 위가 중구·영도구 끝에 걸린다)는 56px 로 다시 재서 걸리지 않는 자리에 둔다
  const busan = reg.region('busan')!, b1 = reg.lesson('busan', 1)!;
  const got = cornerFor(shapesOf('busan'), b1.fit, b1.items, wholeView(busan).fit, PHONE_PLAY, 12, ['tr']);
  assert.ok(got.small && got.cover < OWN_W, `부산 1과: ${JSON.stringify(got)}`);
});

test('귀퉁이는 문제를 보일 때의 지도 칸 높이로 정한다: 다른 높이(지도를 만들 때 — 단추 띠가 그려지기 전)에서 정한 자리를 쓰면 이번 과 칸을 덮는다', () => {
  // 2026-11-15 점검: 폰 문제 화면은 지도를 만들 때(단추 띠 전) 지도 칸이 약 660 이고, 찾기 화면은 570 이다(390×844 그림).
  // 부산 1과는 660 에서 오른쪽 아래 86px 를 고르는데, 그 자리를 570 에서 쓰면 영도구 남쪽 끝을 덮는다. 570 에서 다시 정하면 덮지 않는다
  const busan = reg.region('busan')!, b1 = reg.lesson('busan', 1)!, S = shapesOf('busan'), whole = wholeView(busan).fit;
  const tall = cornerFor(S, b1.fit, b1.items, whole, { w: 390, h: 660 }, 12, ['tr']);
  const v = fitView(boxOf(b1.fit), PHONE_PLAY, pad(12)), vb = viewBox(v, PHONE_PLAY);
  const own = new Set(b1.items);
  const cells: IsleCell[] = S.ids.map((id) => ({ rings: S.cells.get(id)!.rings, box: S.cells.get(id)!.box, own: own.has(id) }));
  const stale = locCover([vb[0], vb[1], vb[0] + vb[2], vb[1] + vb[3]], PHONE_PLAY, tall.W + LOC_MARGIN, tall.H + LOC_MARGIN, cells)[tall.at];
  assert.ok(tall.cover < OWN_W && stale >= OWN_W, `660 에서 고른 ${tall.at}(${tall.W}px)를 570 에서 쓰면 덮는다(${stale})`);
  assert.ok(cornerFor(S, b1.fit, b1.items, whole, PHONE_PLAY, 12, ['tr']).cover < OWN_W, '570 에서 다시 정하면 덮지 않는다');
  // 그래서 svgmap setHome 은 지도 칸을 다시 재고(measure), 마지막으로 귀퉁이를 정한 높이(usedH)와 다르면 다시 정하게 한다(key 를 비움).
  // ResizeObserver(한 문제 안에서 판정 띠로 높이만 바뀜)는 이 일을 하지 않는다
  const svg = src('app/map/svgmap.ts');
  const setHome = svg.slice(svg.indexOf('setHome(box, p = pad, animate = false) {'), svg.indexOf('setPad(p, animate = true) {'));
  assert.ok(setHome.indexOf('measure();') > 0 && setHome.indexOf('measure();') < setHome.indexOf('fitView('), 'setHome 이 맞추기 전에 잰다');
  assert.match(setHome, /if \(loc && loc\.usedH !== size\.h\) loc\.key = '';/);
  const layout = svg.slice(svg.indexOf('function layoutLoc('), svg.indexOf('function drawLocView('));
  assert.match(layout, /L\.usedH = size\.h;/);
  const ro = svg.slice(svg.indexOf('const ro = typeof ResizeObserver'), svg.indexOf('ro?.observe(host);'));
  assert.doesNotMatch(ro, /usedH|loc\.key/, 'ResizeObserver 는 위치 지도를 다시 정하게 하지 않는다');
});

test('위치 지도는 그리기마다 다시 그리지 않고, 누르기를 막지 않으며, 보조 기술에 읽히지 않는다(소스)', () => {
  const svg = src('app/map/svgmap.ts'), css = src('app/map/map.css');
  // 귀퉁이·모양을 정하는 layoutLoc 은 syncLoc 이 key 가 바뀔 때만 부르고, key 에는 그리는 보기(rendered·shown)가 없다
  assert.equal(svg.match(/layoutLoc\(/g)?.length, 2, 'layoutLoc 정의 하나 + 부르는 곳 하나');
  const sync = svg.slice(svg.indexOf('function syncLoc()'), svg.indexOf('function layoutLoc('));
  assert.match(sync, /if \(key !== loc\.key\) \{\s*loc\.key = key;\s*layoutLoc\(/);
  const keyLine = sync.slice(sync.indexOf('const key ='), sync.indexOf('if (key !== loc.key)'));
  // 지도 칸 높이도 없다: 판정 띠로 높이만 바뀔 때는 다시 정하지 않고, 문제가 바뀔 때(setHome)만 높이를 견준다(위 시험)
  assert.doesNotMatch(keyLine, /rendered|shown|size\.h/, 'key 에 그리는 보기·지도 칸 높이가 없다');
  // 바탕 모양(locBase)은 layoutLoc 안에서만
  const layout = svg.slice(svg.indexOf('function layoutLoc('), svg.indexOf('function drawLocView('));
  assert.equal(svg.match(/locBase\(/g)?.length, layout.match(/locBase\(/g)?.length);
  // 누름은 밑의 지도로, 그림은 aria-hidden
  assert.match(css, /\.cm-loc \{[^}]*pointer-events: none/);
  assert.match(svg, /box\.className = 'cm-loc';\s*box\.setAttribute\('aria-hidden', 'true'\)/);
  // 쓰는 화면: 문제 화면(play.ts — 오른쪽 위 '⤢ 전체 보기' 자리는 뺀다)만. 과 시작·과 요약(pages.ts)은 2026-11-15 사용자 결정('서울 전체가 나오게')으로
  // 지역 전체 지도라 위치 지도가 없고, 쪽 지도를 붙이는 maps.ts(MapSpec·mountMap)에는 위치 지도를 넘기는 길이 없다
  assert.match(src('app/ui/play.ts'), /locator: \{ whole: boxOf\(wholeView\(r\)\.fit\), avoid: \['tr'\] \}/);
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(ts|astro)$/.test(e.name) ? [path.join(d, e.name)] : []));
  const SRC = path.join(import.meta.dirname, '../../src');
  const passing = walk(SRC).filter((f) => /\blocator: /.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(SRC, f).replace(/\\/g, '/'));
  assert.deepEqual(passing, ['app/ui/play.ts'], '위치 지도를 넘기는 곳은 문제 화면 하나');
  assert.doesNotMatch(src('app/ui/pages.ts'), /locator/);
  assert.doesNotMatch(src('app/ui/maps.ts').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), /locator/, 'maps.ts 코드(주석 빼고)에 위치 지도 없음');
});

const ctxOf = (r: Registry, o: Partial<Ctx> = {}): Ctx => ({
  reg: r, geo, base: '/', ver: DATA_VER, storageOk: true, inApp: false,
  mastery: {}, lessonDeck: null, otherDeck: null, checkDeck: null, checkStart: 0,
  daily: null, dailyEmd: null, last: null, lastUnit: null, settings: { autoNext: false }, homeRegion: null, bests: {}, bestUnits: {},
  today: () => 20000, save() {}, go() {}, back() {}, render() {}, toast() {},
  ...o,
}) as Ctx;

/** 지도 묶음(mapColumn)의 지도 칸 비율 --ar(쪽 html — 지도 묶음은 쪽마다 하나) */
const arOf = (html: string) => {
  const m = [...html.matchAll(/class="h-mapcol"[^>]*style="--ar:([\d.]+)"/g)];
  assert.equal(m.length, 1, '지도 묶음 하나');
  return Number(m[0][1]);
};

test('과 시작·과 요약 지도(2026-11-15 사용자 결정 — 서울 전체가 나오게): 확대하지 않고 단원 쪽·홈 과 지도와 같은 지역(단원) 전체 범위·섬 상자·지도 칸 비율, 위치 지도 없음, 칠·이름표는 이번 과', () => {
  // 모든 지역(시·도 단원 korea·일반구 단원 포함)과 섬 상자가 있는 동 단원(판 emd — 옹진·신안 격자, 완도·여수·제주시 등 줄) + 종로구
  const R = createRegistry(geo);
  const codes = ['11110', '28720', '12870', '12850', '12130', '12830', '41273', '50110', '52800'];
  const unitKeys = codes.map((c) => R.addUnit(J(`emd/${c}.json`) as EmdUnitFile).key);
  const keys = [...R.regions.map((x) => x.key), 'korea', ...['gyeonggi', 'chungbuk', 'gyeongnam'].map((k) => `${k}/gu`).filter((k) => R.region(k)), ...unitKeys];
  const ctx = ctxOf(R);
  let n = 0, isleN = 0;
  for (const key of keys) {
    const r = R.region(key);
    if (!r || !r.lessons.length) continue;   // 과 없는 지역(세종·제주)은 단원으로 배운다
    const unit = unitPage(ctx, key);
    const u = unit.maps!.unit, v = wholeView(r);
    for (const l of r.lessons) {
      const st = startPage(ctx, key, l.no), sm = summaryPage(ctx, { region: key, no: l.no, newly: [], firstTry: 0, total: l.items.length, confused: [] });
      for (const [what, page, spec] of [['과 시작', st, st.maps!.start], ['과 요약', sm, sm.maps!.sum]] as const) {
        const at = `${key} ${l.no}과 ${what}`;
        // 범위·섬 상자: 단원 쪽 지도(wholeView → viewSpec)와 같다(넘기지 않은 범위는 mountMap 이 지역 범위 r.fit — 단원 쪽 homeMap 의 home 과 같다)
        assert.deepEqual(spec.home ?? r.fit, u.home ?? r.fit, `${at}: 범위`);
        assert.deepEqual(spec.isles ?? [], u.isles ?? [], `${at}: 섬 상자`);
        assert.deepEqual(spec.home ?? r.fit, v.fit, `${at}: 지역 전체(wholeView) 범위 — 과 범위(l.fit)로 확대하지 않는다`);
        assert.equal(spec.whole, true, `${at}: 먼 섬 상자·섬 상자·축척 막대 자리는 지역 칸 모두로`);
        assert.ok(!('locator' in spec), `${at}: 위치 지도 없음`);
        assert.equal(arOf(page.html), arOf(unit.html), `${at}: 지도 칸 비율`);
        // 칠·이름표는 이번 과(과 시작 노랑·굵은 테두리, 과 요약 익힌 정도 색)
        assert.deepEqual(spec.active, l.items, `${at}: 밝은 칸`);
        assert.deepEqual(spec.labels!.map((x) => x.id), l.items, `${at}: 이름표`);
        assert.equal(spec.labelMode, 'must');
        if (what === '과 시작') { assert.deepEqual(spec.highlight, l.items); assert.deepEqual(spec.bold, l.items); }
        else assert.deepEqual(Object.keys(spec.fills!), l.items);
        n++;
        if (v.isles.length) isleN++;
      }
    }
  }
  // 지금 판: 96과 × 2쪽 = 192, 섬 상자 쪽 58(경북 울릉 · 동 단원 8곳)
  assert.ok(n >= 180 && isleN >= 50, `견준 쪽 ${n} · 섬 상자 쪽 ${isleN}`);
  // whole 의 뜻(소스): 이번 과만 밝아도 먼 섬 상자를 늘 보이고(인천 1과 — 옹진이 없어도 홈 지도처럼), 섬 상자·축척 막대 자리는 지역 칸 모두로 정한다
  const mount = src('app/ui/maps.ts').slice(src('app/ui/maps.ts').indexOf('export async function mountMap('));
  assert.match(mount, /\.\.\.\(spec\.whole \? \{ insetAlways: true \} : \{\}\)/);
  assert.match(mount, /const lit = new Set\(spec\.whole \? shapes\.ids : /);
  assert.match(src('app/map/svgmap.ts'), /inset\.box\.hidden = !\(opt\.insetAlways \|\| fills \|\| /);
  // 홈 과 지도(사용자가 '1과는 서울 전체 지도가 나오는데'라고 한 화면)와도 같다: 홈 탭 지역마다 다음 과의 과 시작
  for (const x of R.regions.filter((y) => y.lessons.length)) {
    const hc = ctxOf(R, { homeRegion: x.key });
    const home = homePage(hc), st = startPage(hc, x.key, 1);
    assert.deepEqual(st.maps!.start.home ?? x.fit, home.maps!.main.home ?? x.fit, `${x.key} 홈 범위`);
    assert.deepEqual(st.maps!.start.isles ?? [], home.maps!.main.isles ?? [], `${x.key} 홈 섬 상자`);
    assert.equal(arOf(st.html), arOf(home.html), `${x.key} 홈 지도 칸 비율`);
  }
});
