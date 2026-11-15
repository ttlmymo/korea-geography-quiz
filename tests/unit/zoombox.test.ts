// 확대 상자(map/zoombox.ts — D95 ㉣, 2026-11-15 사용자 결정 '확대 상자 덧붙임'): 과 시작·과 요약의 지역(단원) 전체 지도에서 이번 과가 너무 작게 그려지는 과에만
// 과 범위(l.fit)를 확대한 작은 지도를 귀퉁이나 지도 칸 아래 줄·옆 줄에 덧붙인다. 판정·자리 고르기는 svgmap 과 같은 순서로 흉내 낸다
// (지도 칸 크기는 쪽 CSS 와 같게: 폰 390 폭 · 높이 상한 444(844 높이 화면) · 264(주소줄 있는 보통 폰 664 높이), PC 761 폭 · 높이 상한 630(1440×900 화면),
// 가로로 돌린 폰 844×390 — 폭 560 이상(지역 비율에 달림) · 높이 상한 234 — 실제 화면 탐침과 같은 크기. 상한 식이 app.css 와 같은지는 '높이 상한' 시험이 본다).
// 모양은 커밋된 판(public/data/geo/<판>)의 지역·단원 경계로 만든다(.cache·docs·dist 에 기대지 않는다). 소스를 읽는 시험은 줄끝(CRLF)을 LF 로 맞춰 읽는다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_VER } from '../../src/consts.ts';
import { buildShapes, specOf, type Shapes, type Topology } from '../../src/app/map/shapes.ts';
import { boxOf, type Box } from '../../src/app/map/project.ts';
import { fitView, viewBox, type Pad, type Size } from '../../src/app/map/view.ts';
import { OWN_W, farInset, isleEast, isleView, layoutIsles, type IsleCell, type IsleLayout } from '../../src/app/map/isles.ts';
import { locRect } from '../../src/app/map/locator.ts';
import { labelBox, placeLabels } from '../../src/app/map/labelfit.ts';
import { COMPACT_PX, labelPx } from '../../src/app/map/svgmap.ts';
import {
  ZB_BIG, ZB_CELL_PX, ZB_GAP_PX, ZB_GROUP_PX, ZB_H, ZB_H_MIN, ZB_H_WIDE, ZB_LEAD_MIN, ZB_NOTE_H, ZB_PAD, ZB_ROOM, ZB_SPACE_PX, ZB_WIDE, ZB_WIDE_CAP, ZOOM_ROW,
  zoomCrowd, zoomFit, zoomGap, zoomNeed, zoomPlace, zoomSize,
  type Rect, type ZoomCell, type ZoomLayout, type ZoomPlace,
} from '../../src/app/map/zoombox.ts';
import { CARD_PAD, wholeView } from '../../src/app/ui/maps.ts';
import { startPage, summaryPage, homePage, unitPage } from '../../src/app/ui/pages.ts';
import { createRegistry, type Registry } from '../../src/app/registry.ts';
import { placeName } from '../../src/app/text/ui.ts';
import type { Ctx } from '../../src/app/ui/ctx.ts';
import type { EmdUnitFile, Lesson, Region } from '../../src/app/types.ts';
import { geo } from './fixtures.ts';

const DIR = path.join(import.meta.dirname, '../../public/data/geo', DATA_VER);
const J = (f: string) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const src = (f: string) => fs.readFileSync(path.join(import.meta.dirname, '../../src', f), 'utf8').replace(/\r\n/g, '\n');

/** 모든 단원을 등록한 레지스트리와 지역·단원 모양(ui/maps.ts shapesOf 와 같게) */
const R: Registry = createRegistry(geo);
const unitS = new Map<string, Shapes>();
for (const f of fs.readdirSync(path.join(DIR, 'emd')).filter((x) => /^\d+\.json$/.test(x))) {
  const u = J(`emd/${f}`) as EmdUnitFile;
  if (!u.lessons?.length) continue;
  const r = R.addUnit(u);
  unitS.set(r.key, buildShapes(J(`emd/${f.replace('.json', '.topo.json')}`) as Topology, { layer: 'emd', idKey: 'id', ids: u.items.map((it) => it.id), far: false }, u.labels));
}
const shapeMemo = new Map<string, Shapes>();
const shapesOf = (key: string): Shapes => {
  const u = unitS.get(key);
  if (u) return u;
  let s = shapeMemo.get(key);
  if (!s) {
    const r = R.region(key)!;
    s = r.layer === 'sido'
      ? buildShapes(J('sido.topo.json') as Topology, specOf(r), Object.fromEntries(r.items.map((it) => [it.id, R.point(it.id)!])))
      : buildShapes(J(`${r.unit?.parent ?? key}-sgg.topo.json`) as Topology, specOf(r), geo.labels);
    shapeMemo.set(key, s);
  }
  return s;
};
/** 과가 있는 모든 지역·시·도 단원·일반구 단원·동 단원 */
const KEYS = [...R.regions.filter((x) => x.lessons.length && !x.unit).map((x) => x.key), 'korea', ...['gyeonggi', 'chungbuk', 'gyeongnam'].map((k) => `${k}/gu`).filter((k) => R.region(k)), ...unitS.keys()];

const ctxOf = (r: Registry, o: Partial<Ctx> = {}): Ctx => ({
  reg: r, geo, base: '/', ver: DATA_VER, storageOk: true, inApp: false,
  mastery: {}, lessonDeck: null, otherDeck: null, checkDeck: null, checkStart: 0,
  daily: null, dailyEmd: null, last: null, lastUnit: null, settings: { autoNext: false }, homeRegion: null, bests: {}, bestUnits: {},
  today: () => 20000, save() {}, go() {}, back() {}, render() {}, toast() {},
  ...o,
}) as Ctx;
/** 지도 묶음의 지도 칸 비율 --ar(쪽 html) */
const arOf = (html: string) => Number(/class="h-mapcol"[^>]*style="--ar:([\d.]+)"/.exec(html)![1]);

const hit = (a: Rect, b: Rect) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0;
const inRect = (a: Rect, b: Rect, e = 0.5) => a.x >= b.x - e && a.y >= b.y - e && a.x + a.w <= b.x + b.w + e && a.y + a.h <= b.y + b.h + e;

/** 흉내 크기: 지도 칸 폭(px — 0 이면 600~1099 폭 규칙이라 지역 비율 ar 에 달림)과 높이 상한(px — app.css #app .h-map max-height 를 그 화면에서 셈) */
const SZ = {
  phone: { W: 390, cap: 444 },   // 390×844: min(60vh 506, 520, max(220, 844 − 400))
  low: { W: 390, cap: 264 },     // 390×664(주소줄·도구줄 있는 보통 폰의 보이는 높이): min(398, 520, max(220, 664 − 400))
  pc: { W: 761, cap: 630 },      // 1440×900: clamp(480, min(70vh 630, 900 − 260), 760)
  land: { W: 0, cap: 234 },      // 844×390(가로로 돌린 폰): 상한 min(60vh 234, 520), 폭 min(844 − 2·24, max(560, 234 × ar))
} as const;
const widthOf = (sz: keyof typeof SZ, ar: number) => SZ[sz].W || Math.min(844 - 48, Math.max(560, SZ[sz].cap * ar));
type SzName = keyof typeof SZ;

interface Sim {
  key: string; no: number; sz: SzName; need: boolean;
  /** 늘리기 전 지도 칸(px — 늘린 뒤 CSS 가 정한 높이) · 늘린 높이 · 자리 · 상자 · 범위 네모 · 이번 과 묶음(px) · 피할 것 · 지역 지도 그림 높이(px) */
  size: Size; grow: number; mode?: string; box?: Rect; frame?: Rect; own?: Rect; blocks: Rect[]; region?: Rect; pic?: Size;
  /** 상자 안 이름표: 겹침 · 범위 밖 · 수 */
  over: string[]; out: string[]; labels: number;
  /** 상자 범위(zoomFit — 좁혔으면 fit 과 다른 상자) · 좁혔는가 · 상자 1px 의 지도 단위 · 상자 판정 칸 · 이번 과 본 지도 칸 · 상자에 이름표를 둘 칸(svgmap zLab) */
  fitZ?: Box; narrowed?: boolean; zu?: number; zcells?: ZoomCell[]; ids?: string[]; zlab?: string[];
}

/**
 * svgmap 의 확대 상자 흉내(setZoom → syncZoom → layoutZoom): 지도 칸(폭 SZ.W, 높이 = 폭 / --ar 를 상한 SZ.cap 에서 자름), 여백 CARD_PAD + 섬 상자 줄(layoutIsles),
 * 먼 섬 상자(왼쪽 위 — insetPad 는 흉내 내지 않는다), 축척 막대(PC). 지도 칸을 늘리면(아래 줄·낮은 칸의 옆 줄) 높이 상한에서 늘린 높이를 빼(app.css #app .h-map.zoom-below)
 * 그 칸으로 다시 놓는다(고른 줄·상자 크기 그대로 — svgmap 의 keep)
 */
function simulate(key: string, l: Lesson, sz: SzName, ar: number): Sim {
  const r = R.region(key)!, S = shapesOf(key), v0 = wholeView(r), home = boxOf(v0.fit), isles = v0.isles;
  const { cap } = SZ[sz], W = widthOf(sz, ar), natural = W / ar;
  const ids = l.items.filter((id) => !isles.includes(id));
  const grid = isles.length > 0 && l.items.every((id) => isles.includes(id));
  const out: Sim = { key, no: l.no, sz, need: false, size: { w: W, h: Math.min(cap, natural) }, grow: 0, blocks: [], over: [], out: [], labels: 0 };
  const lay = (h: number): { p: Pad; il: IsleLayout | null } => {
    const p0 = CARD_PAD;
    if (!isles.length) return { p: p0, il: null };
    const views = isles.map((id) => isleView(S.cells.get(id)!.rings, S.cells.get(id)!.r));
    const il = layoutIsles(views, { x: p0.l, y: p0.t, w: W - p0.l - p0.r, h: h - p0.t - p0.b }, grid, !grid && isleEast(views, home));
    return { p: grid ? p0 : { ...p0, l: p0.l + il.shift.l, r: p0.r + il.shift.r, b: p0.b + il.shift.b }, il };
  };
  const zp = { t: ZB_PAD, r: ZB_PAD, b: ZB_PAD, l: ZB_PAD }, fit = boxOf(l.fit);
  // svgmap layoutZoom 의 fitOf 와 같다: 상자 그림 s 에서 판정할 이번 과 칸(이름표 판은 상자 그림 폭의 글자 크기)과 상자 범위
  const zc = (s: Size): ZoomCell[] => ids.map((id) => ({ box: S.cells.get(id)!.box, pt: S.cells.get(id)!.label, lb: labelBox(placeName(R, id), labelPx(s.w)) }));
  const fitOf = (s: Size) => zoomFit(fit, zc(s), s);
  const place = (h: number, keep: ZoomPlace | null) => {
    const size = { w: W, h }, { p, il } = lay(h), v = fitView(home, size, p);
    out.size = size;
    out.need = !grid && ids.length > 0 && ids.length < S.ids.length && zoomNeed(ids.map((id) => S.cells.get(id)!.box), v.u);
    if (!out.need) return null;
    // svgmap layoutZoom 의 layout 과 같다
    const layout: ZoomLayout = (cell, add, s) => {
      const vv = fitView(home, cell, { ...p, l: p.l + (add.l ?? 0), r: p.r + (add.r ?? 0) });
      const zv = fitView(fitOf(s), s, zp), [rx, ry, rw, rh] = viewBox(zv, s), [vx, vy] = viewBox(vv, cell);
      return { u: vv.u, frame: { x: (rx - vx) / vv.u, y: (ry - vy) / vv.u, w: rw / vv.u, h: rh / vv.u } };
    };
    const [vx, vy] = viewBox(v, size);
    const blocks: Rect[] = [];
    if (S.far) { const f = farInset(S.far.box); blocks.push({ x: 12, y: 12, w: f.w + 2, h: f.h + 2 + ZB_NOTE_H }); }
    if (W >= COMPACT_PX && !grid) blocks.push(locRect('br', size, 136, 40, 6));
    if (il && !grid) blocks.push(...il.boxes, il.note);
    const view: Box = [vx, vy, vx + W * v.u, vy + h * v.u];
    const own = new Set(ids), cells: IsleCell[] = [];
    for (const id of S.ids) {
      const c = S.cells.get(id)!;
      if (isles.includes(id) || c.box[2] < view[0] || c.box[0] > view[2] || c.box[3] < view[1] || c.box[1] > view[3]) continue;
      cells.push({ rings: c.rings, box: c.box, own: own.has(id) });
    }
    const wide = W >= COMPACT_PX, alt = wide && cap < ZB_WIDE_CAP ? zoomSize(false) : null;
    const at = zoomPlace({ size, cap, pic: zoomSize(wide), chrome: { w: 2, h: 2 + ZB_NOTE_H }, blocks, view, cells, layout, keep, alt });
    return { at, p, blocks, layout };
  };
  let res = place(out.size.h, null);
  if (res && res.at.grow) {
    // 늘린 줄: 높이 상한에서 늘린 높이를 뺀 칸으로 다시(고른 줄·상자 크기 그대로)
    const first = res.at;
    res = place(Math.min(natural, cap - first.grow), first);
    assert.ok(res && res.at.mode === first.mode && res.at.grow === first.grow, `${key} ${l.no}과 ${sz}: 늘린 뒤 칸이 낮아져도 상자가 있고 같은 줄·같은 높이다`);
  }
  if (!res) return out;
  const at = res.at, pic = at.pic, b: Rect = { x: at.x, y: at.y, w: pic.w + 2, h: pic.h + 2 + ZB_NOTE_H };
  // 늘린 뒤 본 지도(svgmap effPad — 여백에 at.add): 지도 칸 = 늘리기 전 + grow, 범위 네모와 이번 과 묶음의 자리(px)
  const cell = { w: W, h: out.size.h + at.grow }, pF = { ...res.p, l: res.p.l + at.add.l, r: res.p.r + at.add.r, b: res.p.b + at.add.b };
  const vF = fitView(home, cell, pF), [fx, fy] = viewBox(vF, cell);
  const px = (bb: Box): Rect => ({ x: (bb[0] - fx) / vF.u, y: (bb[1] - fy) / vF.u, w: (bb[2] - bb[0]) / vF.u, h: (bb[3] - bb[1]) / vF.u });
  const fitZ = fitOf(pic), zv0 = fitView(fitZ, pic, zp), [rx, ry, rw, rh] = viewBox(zv0, pic);
  const ownB = ids.map((id) => S.cells.get(id)!.box).reduce((a, c): Box => [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[2]), Math.max(a[3], c[3])]);
  Object.assign(out, { grow: at.grow, mode: at.mode, box: b, pic, frame: px([rx, ry, rx + rw, ry + rh]), own: px(ownB), region: px(home), blocks: res.blocks });
  // 상자 안 이름표(svgmap 의 작은 지도 drawLabels — must, 글자 labelPx(상자 폭), 피할 것은 모든 칸, 범위는 viewRect(4) = 여백 ZB_PAD 안)
  const zs = pic, zv = zv0, u = zv.u, [x, y, ww, hh] = viewBox(zv, zs), m = Math.max(4, ZB_PAD) * u;
  const within: Box = [x + m, y + m, x + ww - m, y + hh - m];
  // 상자 이름표 칸(svgmap zLab): 좁히지 않았으면 이번 과 모두, 좁혔으면 이름표 점이 상자가 보이는 범위(= 범위 네모) 안인 칸
  const zlab = fitZ === fit ? ids : ids.filter((id) => { const [px0, py0] = S.cells.get(id)!.label; return px0 >= x && px0 <= x + ww && py0 >= y && py0 <= y + hh; });
  Object.assign(out, { fitZ, narrowed: fitZ !== fit, zu: u, zcells: zc(pic), ids, zlab });
  const fs = labelPx(zs.w);
  const asks = zlab.map((id) => ({ id, ...labelBox(placeName(R, id), fs) }));
  const obstacles = S.ids.map((id) => ({ rings: S.cells.get(id)!.rings, box: S.cells.get(id)!.box }));
  if (S.water.length) {
    const wb: Box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const rg of S.water) for (let i = 0; i < rg.length; i += 2) { wb[0] = Math.min(wb[0], rg[i]); wb[2] = Math.max(wb[2], rg[i]); wb[1] = Math.min(wb[1], rg[i + 1]); wb[3] = Math.max(wb[3], rg[i + 1]); }
    if (S.bankD) obstacles.push({ rings: S.water, box: wb });
  }
  const placed = placeLabels((id) => S.cells.get(id), asks, { mode: 'must', u, obstacles, within, center: [(S.box[0] + S.box[2]) / 2, (S.box[1] + S.box[3]) / 2], avoid: [], screen: [] });
  const bx = placed.map((p) => { const a = asks.find((q) => q.id === p.id)!; return { id: p.id, b: [p.x - (a.w * u) / 2, p.y - (a.h * u) / 2, p.x + (a.w * u) / 2, p.y + (a.h * u) / 2] as Box, inCell: !p.out }; });
  out.labels = bx.length;
  for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++) {
    const a = bx[i].b, b = bx[j].b, ow = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), oh = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
    if (ow > 0 && oh > 0) out.over.push(`${placeName(R, bx[i].id)}·${placeName(R, bx[j].id)}`);
  }
  // 칸 안 이름표는 칸 안 자리라 범위를 보지 않는다(svgmap 과 같다) — 그래도 상자 그림 밖으로 나가면 안 된다
  const picB: Box = [x, y, x + ww, y + hh];
  for (const q of bx) {
    const lim = q.inCell ? picB : within;
    if (q.b[0] < lim[0] - 1e-6 || q.b[1] < lim[1] - 1e-6 || q.b[2] > lim[2] + 1e-6 || q.b[3] > lim[3] + 1e-6) out.out.push(placeName(R, q.id));
  }
  return out;
}

/** 모든 과 × 폰·낮은 폰·PC 흉내(한 번만 돌려 여러 시험이 함께 쓴다) */
let ALL: Sim[] | null = null;
function all(): Sim[] {
  if (ALL) return ALL;
  const ctx = ctxOf(R);
  ALL = [];
  for (const key of KEYS) {
    const r = R.region(key)!;
    const ar = arOf(unitPage(ctx, key).html);   // 과 시작·요약 지도 칸 비율 = 단원 쪽(locator.test.ts 가 견준다)
    for (const l of r.lessons) for (const sz of Object.keys(SZ) as SzName[]) ALL.push(simulate(key, l, sz, ar));
  }
  return ALL;
}
const tag = (s: Sim) => `${s.key} ${s.no}과`;

test('판정 문턱: 이번 과 묶음 긴 변 40px 미만, 가장 작은 칸 긴 변 10px 미만, 칸 사이 평균 간격(묶음 / √칸 수) 19px 미만(본 지도에 그려지는 크기)', () => {
  assert.equal(ZB_GROUP_PX, 40);
  assert.equal(ZB_CELL_PX, 10);
  assert.equal(ZB_SPACE_PX, 19);
  // u = 1(1 지도 단위 = 1px): 묶음 39 → 붙임, 40 이고 칸 10 → 안 붙임, 칸 9 → 붙임
  assert.equal(zoomNeed([[0, 0, 39, 20]], 1), true);
  assert.equal(zoomNeed([[0, 0, 20, 20], [20, 0, 40, 10]], 1), false);
  assert.equal(zoomNeed([[0, 0, 31, 20], [31, 0, 40, 9]], 1), true);
  // 평균 간격: 묶음 42 · 칸 5 → 18.8 붙임(PC 군산시 2과 꼴), 묶음 51 · 칸 5 → 22.8 안 붙임(폰 광주특별시 1과 꼴)
  const five = (g: number): Box[] => [0, 1, 2, 3, 4].map((i) => [i * (g - 12) / 4, 0, i * (g - 12) / 4 + 12, 12]);
  assert.equal(zoomNeed(five(42), 1), true);
  assert.equal(zoomNeed(five(51), 1), false);
  // 같은 칸도 지도가 커지면(u 가 작아지면) 붙지 않는다 — 폰과 PC 가 다를 수 있다
  assert.equal(zoomNeed([[0, 0, 60, 60]], 2), true);
  assert.equal(zoomNeed([[0, 0, 60, 60]], 1), false);
  assert.equal(zoomNeed([], 1), false);
  // 상자 크기: 늘 가로로 긴 꼴(폰 196×148 · 넓은 지도 칸 264×196)
  assert.deepEqual(zoomSize(false), { w: 196, h: 148 });
  assert.deepEqual(zoomSize(true), { w: 264, h: 196 });
});

test('상자 안 몰림·범위 좁히기 문턱: 지시선 칸(칸 상자에 이름표 판이 들지 않는 칸) 3개 이상의 점 간격(묶음 / √개수) 19px 미만이 몰림, 큰 칸(상자 짧은 변 − 여백의 절반 이상)을 빼면 묶음이 절반 이하이면 좁힌다(①)', () => {
  assert.deepEqual([ZB_LEAD_MIN, ZB_BIG, ZB_WIDE], [3, 0.5, 0.5]);
  const lb = { w: 40, h: 20 };
  // u = 1: 판(40×20)보다 작은 칸 셋, 점 묶음 30 → 30/√3 = 17.3 몰림 · 40 → 23.1 아님 · 지시선 둘이면 아님 · 판이 드는 칸은 지시선 칸이 아니다
  const tri = (g: number, w = 10): ZoomCell[] => [0, 1, 2].map((i) => ({ box: [i * g / 2, 0, i * g / 2 + w, w], pt: [i * g / 2 + w / 2, w / 2], lb }));
  assert.equal(zoomCrowd(tri(30), 1), true);
  assert.equal(zoomCrowd(tri(40), 1), false);
  assert.equal(zoomCrowd(tri(30).slice(0, 2), 1), false);
  assert.equal(zoomCrowd(tri(30, 50).map((c) => ({ ...c, lb: { w: 40, h: 20 } })), 1), false);
  // 좁히기: 상자 196×148(짧은 변 − 여백 = 128) — 큰 칸(긴 변 ≥ 64px) 하나가 범위를 넓혀 작은 칸 셋이 몰리면 작은 칸 묶음으로, 아니면 fit 그대로(같은 배열)
  const pic = { w: 196, h: 148 };
  const big: ZoomCell = { box: [0, 0, 20, 300], pt: [10, 10], lb };
  const small: ZoomCell[] = [0, 1, 2].map((i) => ({ box: [20 + i * 8, 0, 28 + i * 8, 8], pt: [24 + i * 8, 4], lb }));
  const fit: Box = [0, 0, 44, 300];
  // 작은 칸 묶음 [20, 0, 44, 8](가로 24 가 맞춤 변)을 맞춘 범위: 묶음을 담고, 상자 여백으로 다시 맞추면 묶음 가로가 196 − 2·ZB_PAD px(다 큰 상자는 둘레를 더 두지 않는다)
  const zp = { t: ZB_PAD, r: ZB_PAD, b: ZB_PAD, l: ZB_PAD };
  const z = zoomFit(fit, [big, ...small], pic), zu = fitView(z, pic, zp).u;
  assert.ok(z[0] <= 20 + 1e-9 && z[1] < 0 && z[2] >= 44 - 1e-9 && z[3] > 8 && z[3] - z[1] < 30, JSON.stringify(z));
  assert.ok(Math.abs(24 / zu - (196 - 2 * ZB_PAD)) < 1e-6, String(24 / zu));
  // 좁힌 범위에서 다시 재면 몰리지 않아 그대로(판정 고정점)
  assert.equal(zoomFit(z, [big, ...small], pic), z);
  // 낮춘 상자(230×100 — 높이 < 148)는 둘레 ZB_ROOM 을 더 둔다: 묶음 세로(8 이 맞춤 변)가 100 − 2·(ZB_PAD + ZB_ROOM) px
  const low = { w: 230, h: 100 }, zl = zoomFit(fit, [big, ...small], low);
  assert.equal(ZB_ROOM, 10);
  assert.ok(Math.abs(8 / fitView(zl, low, zp).u - (100 - 2 * (ZB_PAD + ZB_ROOM))) < 1e-6, JSON.stringify(zl));
  assert.equal(zoomFit(zl, [big, ...small], low), zl);
  // 큰 칸이 없거나(모두 작은 칸 — 좁혀도 커지지 않는다) 몰리지 않으면 fit 그대로
  assert.equal(zoomFit(fit, small, pic), fit);
  const wide: Box = [0, 0, 300, 300], roomy: ZoomCell[] = small.map((c, i) => ({ ...c, pt: [24 + i * 100, 4] }));
  assert.equal(zoomFit(wide, [big, ...roomy], pic), wide);
});

test('상자 범위 좁히기 ②(점검 11-15): 큰 칸을 빼도 묶음이 절반 넘게 남지만 지시선 점이 12px 미만으로 붙었으면(또는 낮춘 상자이면), 좁힌 상자에서 몰림이 풀릴 때만 좁힌다', () => {
  assert.equal(ZB_GAP_PX, 12);
  const lb = { w: 40, h: 20 }, pic = { w: 196, h: 148 }, fit: Box = [0, 0, 176, 128], zp = { t: ZB_PAD, r: ZB_PAD, b: ZB_PAD, l: ZB_PAD };
  const C = (b: Box): ZoomCell => ({ box: b, pt: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], lb });
  // u = 1: 큰 칸(긴 변 128 ≥ 64) 하나, 판이 드는 작은 칸 하나, 지시선 칸 셋(점 묶음 25 → 25/√3 = 14.4 몰림). 큰 칸을 뺀 묶음 96 / 176 = 0.55 라 ①은 아니다
  const big = C([0, 0, 70, 128]), roomy = C([126, 90, 176, 120]);
  const tri = (dx: number) => [C([80, 50, 88, 58]), C([80 + dx, 50, 88 + dx, 58]), C([80, 75, 88, 83])];
  const near = [big, roomy, ...tri(10)], far = [big, roomy, ...tri(16)];
  assert.equal(fitView(fit, pic, zp).u, 1);
  assert.deepEqual([zoomCrowd(near, 1), zoomCrowd(far, 1), zoomGap(near, 1), zoomGap(far, 1)], [true, true, 10, 16]);
  // 점이 10px(맞닿음) → 좁힌다: 좁힌 상자에서는 몰리지 않고, 다시 재도 그대로(판정 고정점)
  const z = zoomFit(fit, near, pic);
  assert.notEqual(z, fit);
  assert.equal(zoomCrowd(near, fitView(z, pic, zp).u), false);
  assert.equal(zoomFit(z, near, pic), z);
  // 점이 16px(떨어짐 — 폰 충주시 2과 꼴) → 그대로
  assert.equal(zoomFit(fit, far, pic), fit);
  // 지시선 칸이 둘 미만이면 점 사이 거리는 없다
  assert.equal(zoomGap([big, roomy], 1), Infinity);
  assert.equal(ZB_H, 148);
});

test('자리: 덮는 땅이 적은 빈 귀퉁이, 없으면 지역 지도가 가장 크게 남는 줄(아래 · 옆), 낮은 칸에서는 상자를 낮추고, 줄을 그대로 두라면 고르지 않는다', () => {
  const pic = { w: 196, h: 148 }, chrome = { w: 2, h: 28 }, size = { w: 390, h: 300 }, view: Box = [0, 0, 390, 300];
  // 본 지도 흉내: 390×300 땅을 칸·여백에 맞춘다(범위 네모는 땅 오른쪽 가운데 20×20)
  const layout: ZoomLayout = (cell, add) => {
    const l = 14 + (add.l ?? 0), r = 14 + (add.r ?? 0), u = Math.max(390 / Math.max(1, cell.w - l - r), 300 / Math.max(1, cell.h - 28));
    const ox = l + (cell.w - l - r - 390 / u) / 2, oy = 14 + (cell.h - 28 - 300 / u) / 2;
    return { u, frame: { x: ox + 300 / u, y: oy + 140 / u, w: 20 / u, h: 20 / u } };
  };
  const base = { size, cap: Infinity, pic, chrome, blocks: [] as Rect[], view, cells: [] as IsleCell[], layout };
  // 땅 없음 → 왼쪽 위(LOC_ORDER 첫 귀퉁이)
  const a = zoomPlace(base);
  assert.equal(a.mode, 'tl');
  assert.equal(a.grow, 0);
  assert.deepEqual(a.add, { l: 0, r: 0, b: 0 });
  // 지도 칸 전체가 땅(이번 과 아님) → 덮는 몫이 커서 줄. 상한이 넉넉하면 아래 줄(범위 네모가 오른쪽 절반이라 오른쪽 끝), 본 지도 아래 여백에 줄 높이
  const land: IsleCell = { rings: [new Float64Array([-10, -10, 400, -10, 400, 310, -10, 310])], box: [-10, -10, 400, 310], own: false };
  const b = zoomPlace({ ...base, cells: [land] });
  assert.equal(b.mode, 'below');
  assert.deepEqual([b.x, b.y, b.grow, b.add.b, b.pic.h], [390 - 10 - 198, 300, 176 + 10, 186, 148]);
  // 낮은 상한(264): 다 큰 상자를 아래 줄에 두면 지역 지도가 300 → 78 로 절반 아래 — 상자를 낮춘 아래 줄(지역 126)과 옆 줄(지역 폭 390 − 208)을 견줘 큰 쪽.
  // 가로로 긴 땅(390×300 비)은 아래 줄이 크다
  const c = zoomPlace({ ...base, cells: [land], cap: 264 });
  assert.equal(c.mode, 'below');
  assert.equal(c.pic.h, ZB_H_MIN);
  assert.equal(c.y + c.grow, 264);
  // 세로로 긴 땅이면 옆 줄: 범위 네모 쪽(오른쪽), 본 지도 여백 오른쪽에 상자 폭 + 여백, 지도 칸은 늘리지 않음
  const tall: ZoomLayout = (cell, add) => {
    const l = 14 + (add.l ?? 0), r = 14 + (add.r ?? 0), u = Math.max(150 / Math.max(1, cell.w - l - r), 300 / Math.max(1, cell.h - 28));
    const ox = l + (cell.w - l - r - 150 / u) / 2, oy = 14 + (cell.h - 28 - 300 / u) / 2;
    return { u, frame: { x: ox + 120 / u, y: oy + 140 / u, w: 20 / u, h: 20 / u } };
  };
  const d = zoomPlace({ ...base, cells: [land], cap: 264, size: { w: 390, h: 264 }, layout: tall });
  assert.equal(d.mode, 'r');
  assert.deepEqual([d.x, d.y, d.grow, d.add.r, d.pic.h], [390 - 10 - 198, 10, 0, 208, 148]);
  // 귀퉁이를 쓰는 것이 막으면(먼 섬 상자 왼쪽 위 · 범위 네모가 왼쪽 아래 근처) 남은 귀퉁이
  const frameAt = (x: number, y: number): ZoomLayout => (cell, add, s) => ({ ...layout(cell, add, s), frame: { x, y, w: 20, h: 20 } });
  const e = zoomPlace({ ...base, layout: frameAt(20, 250), blocks: [{ x: 12, y: 12, w: 130, h: 140 }] });
  assert.equal(e.mode, 'tr');
  // 아래 줄로 들어오는 것(낮아진 칸 아래로 넘친 섬 상자 세로 줄)은 비켜 빈 구간에 — 낮춘 상자는 그 구간 폭까지 넓어진다
  const f = zoomPlace({ ...base, cells: [land], cap: 264, blocks: [{ x: 14, y: 14, w: 128, h: 134 }] });
  assert.equal(f.mode, 'below');
  assert.ok(f.x >= 14 + 128 + 6 && f.x + f.pic.w + 2 <= 380 && f.pic.w > 196, JSON.stringify(f));
  // 이번 과 칸(own)은 조금도 덮지 않는다
  const ownCell: IsleCell = { ...land, own: true };
  assert.ok(ZOOM_ROW.includes(zoomPlace({ ...base, cells: [ownCell] }).mode));
  // keep: 귀퉁이가 비어 있어도 고르지 않고 그 줄·그 상자 크기로 자리만(늘린 뒤 낮아진 칸)
  const k = zoomPlace({ ...base, size: { w: 390, h: 126 }, keep: { mode: 'below', pic: { w: 196, h: 100 } } });
  assert.deepEqual([k.mode, k.y, k.grow, k.pic.h], ['below', 126, 138, 100]);
  assert.equal(zoomPlace({ ...base, size: { w: 390, h: 264 }, layout: tall, keep: { mode: 'l', pic } }).mode, 'l');
  // alt(넓은 상자를 줄에 둘 수 없는 낮은 칸 — 가로로 돌린 폰): pic 이 귀퉁이에 들면 pic 그대로, 줄로 가야 하면 alt 로 처음부터 다시 고른다. keep 이면 alt 를 보지 않는다
  const small = { w: 100, h: 80 };
  assert.deepEqual(zoomPlace({ ...base, alt: small }).pic, pic);
  const g = zoomPlace({ ...base, cells: [land], alt: small });
  assert.ok(ZOOM_ROW.includes(g.mode));
  assert.deepEqual(g.pic, small);
  assert.deepEqual(zoomPlace({ ...base, size: { w: 390, h: 126 }, keep: { mode: 'below', pic: { w: 196, h: 100 } }, alt: small }).pic, { w: 196, h: 100 });
  assert.ok(OWN_W > 100);
});

test('모든 과 시작·요약 × 폰(390×844 · 390×664)·PC: 이번 과 묶음이 문턱 이상이거나 확대 상자가 있고, 상자는 지도 칸 안에서 범위 네모·이번 과·먼 섬 상자·섬 상자·축척 막대를 덮지 않으며 상자 안 이름표가 겹치거나 범위를 넘지 않고, 늘린 줄까지 높이 상한 안이다', () => {
  const S = all();
  const bad: string[] = [];
  for (const s of S) {
    if (!s.need) continue;
    const at = `${tag(s)} ${s.sz}`;
    const host: Rect = { x: 0, y: 0, w: s.size.w, h: s.size.h + s.grow };
    if (!inRect(s.box!, host)) bad.push(`${at}: 상자가 지도 칸 밖 ${JSON.stringify(s.box)} / ${JSON.stringify(host)}`);
    if (hit(s.box!, s.frame!)) bad.push(`${at}: 상자가 범위 네모를 덮음`);
    if (hit(s.box!, s.own!)) bad.push(`${at}: 상자가 이번 과 묶음을 덮음`);
    for (const b of s.blocks) if (hit(s.box!, b)) bad.push(`${at}: 상자가 ${JSON.stringify(b)} 를 덮음`);
    if (!s.labels) bad.push(`${at}: 상자 안 이름표 없음`);
    if (s.over.length || s.out.length) bad.push(`${at}: 상자 안 이름표 겹침 [${s.over.join(', ')}] 범위 밖 [${s.out.join(', ')}]`);
    // 늘린 줄까지 합친 높이가 높이 상한 안(폰은 낮은 폰에서도 주 단추가 첫 화면에 — 계획서 3.3, 2026-11-15 점검 전에는 200px 바닥 때문에 넘쳤다)
    if (s.size.h + s.grow > SZ[s.sz].cap + 1e-6) bad.push(`${at}: 높이 ${s.size.h.toFixed(1)} + ${s.grow} > 상한 ${SZ[s.sz].cap}`);
    // 줄에 두면 상자가 지역 지도 그림과 겹치지 않는다(옆 줄은 본 지도를 비켜 둔다)
    if (ZOOM_ROW.includes(s.mode as never) && hit(s.box!, s.region!)) bad.push(`${at}: 줄(${s.mode})에 둔 상자가 지역 지도와 겹침`);
  }
  assert.deepEqual(bad, []);
  // 과 시작과 과 요약은 같은 지도(지역 전체 범위·섬 상자)에 같은 과 범위(l.fit)를 넘긴다 — 판정·자리가 같다
  const ctx = ctxOf(R);
  for (const key of KEYS) for (const l of R.region(key)!.lessons) {
    const st = startPage(ctx, key, l.no).maps!.start, sm = summaryPage(ctx, { region: key, no: l.no, newly: [], firstTry: 0, total: l.items.length, confused: [] }).maps!.sum;
    assert.deepEqual(st.zoom, l.fit, `${key} ${l.no}과 과 시작`);
    assert.deepEqual(sm.zoom, l.fit, `${key} ${l.no}과 과 요약`);
    assert.deepEqual([sm.home, sm.isles, sm.whole], [st.home, st.isles, st.whole]);
  }
  assert.ok(S.length > 2100, `흉내 ${S.length}`);
});

test('상자가 붙는 과(지금 판): 폰 18과 · PC 5과, 모두 동 단원 — 사용자에게 보인 제주시 2과는 폰·PC 모두, 큰 과(서울·부산·광주특별시 지역 과 등)는 붙지 않는다', () => {
  const S = all();
  const on = (sz: SzName) => S.filter((s) => s.need && s.sz === sz).map(tag).sort();
  const phone = on('phone'), pc = on('pc');
  assert.deepEqual(pc, ['gangwon/chuncheon-si 2과', 'jeju/jeju-si 2과', 'jeju/jeju-si 7과', 'jeju/seogwipo-si 2과', 'jeonbuk/gunsan-si 2과']);
  assert.deepEqual(phone, [
    'chungbuk/cheongju-si-sangdang-gu 1과', 'chungbuk/chungju-si 2과', 'gangwon/chuncheon-si 2과', 'gangwon/chuncheon-si 3과', 'gangwon/gangneung-si 2과', 'gangwon/wonju-si 1과',
    'gyeongbuk/gumi-si 1과', 'gyeongnam/tongyeong-si 1과', 'jeju/jeju-si 1과', 'jeju/jeju-si 2과', 'jeju/jeju-si 3과', 'jeju/jeju-si 4과', 'jeju/jeju-si 7과', 'jeju/seogwipo-si 2과',
    'jeonbuk/gunsan-si 1과', 'jeonbuk/gunsan-si 2과', 'jeonnam-gwangju/suncheon-si 1과', 'jeonnam-gwangju/yeosu-si 3과',
  ]);
  // 모두 동 단원(지역·시·도·일반구 단원 과에는 없다)
  for (const t of [...phone, ...pc]) assert.ok(R.region(t.split(' ')[0])!.unit && R.region(t.split(' ')[0])!.layer === 'emd', t);
  // 큰 과: 서울 1·2과, 부산 1과, 광주특별시 1과(지역 과 가운데 가장 작은 묶음), 대구 1과, 인천 1·2과, 경기 일반구 1과, 종로구 2과
  const big = ['seoul 1과', 'seoul 2과', 'busan 1과', 'jeonnam-gwangju 1과', 'daegu 1과', 'incheon 1과', 'incheon 2과', 'gyeonggi/gu 1과', 'seoul/jongno-gu 2과'];
  for (const b of big) {
    const ss = S.filter((s) => tag(s) === b && (s.sz === 'phone' || s.sz === 'pc'));
    assert.equal(ss.length, 2, b);
    for (const s of ss) assert.equal(s.need, false, `${b} ${s.sz}`);
  }
});

test('높이 상한: 지도 칸을 늘릴 때의 상한 식은 원래 상한 식에서 늘린 높이를 뺀 것이고 바닥이 없다(app.css — 흉내 SZ.cap 과 같은 식)', () => {
  const css = fs.readFileSync(path.join(import.meta.dirname, '../../src/app/ui/app.css'), 'utf8').replace(/\r\n/g, '\n');
  const rule = (sel: string, at: string) => {
    const scope = at ? css.slice(css.indexOf(at)) : css;
    return new RegExp(`${sel.replace(/[.#]/g, (c) => `\\${c}`)} \\{ max-height: ([^;]+); \\}`).exec(scope)?.[1];
  };
  // 폰(599 이하) · 기본(600~1099) · 1100 이상: 원래 상한 X 와 늘릴 때 max(0px, calc(X - var(--zb-h, 0px)))
  const phone = '#app .h-map { width: calc(100% + 2 * var(--gutter))', wide = '@media (min-width: 1100px) {\n  .h-main';
  const pairs: [string | undefined, string][] = [
    [rule('#app .h-map', phone), '@media (max-width: 599px) {\n  #app .h-map.zoom-below'],
    [/#app \.h-map \{ height: auto; aspect-ratio: var\(--ar, 1\.23\); max-height: ([^;]+);/.exec(css)?.[1], '#app .h-map.zoom-below { max-height'],
    [rule('#app .h-map', wide), '@media (min-width: 1100px) {\n  #app .h-map.zoom-below'],
  ];
  for (const [x, at] of pairs) {
    assert.ok(x, at);
    const z = css.slice(css.indexOf(at)).match(/#app \.h-map\.zoom-below \{ max-height: ([^;]+); \}/)?.[1];
    assert.equal(z, `max(0px, calc(${x} - var(--zb-h, 0px)))`, at);
  }
  assert.equal(rule('#app .h-map', phone), 'min(60vh, 520px, max(220px, calc(100svh - 400px)))');
  assert.equal(rule('#app .h-map', wide), 'clamp(480px, min(70vh, 100vh - 260px), 760px)');
});

test('낮은 폰(390×664): 늘린 줄까지 높이 상한(264) 안이고, 세로로 긴 시·군은 옆 줄, 가로로 긴 제주시는 상자를 낮춘 아래 줄 — 지역 지도 그림이 너무 작아지지 않는다', () => {
  const S = all().filter((s) => s.sz === 'low' && s.need);
  const by = (t: string) => S.find((s) => tag(s) === t)!;
  assert.ok(S.length >= 18, `낮은 폰 ${S.length}과`);
  assert.equal(by('gangwon/chuncheon-si 2과').mode === 'l' || by('gangwon/chuncheon-si 2과').mode === 'r', true, `춘천시 2과 ${by('gangwon/chuncheon-si 2과').mode}`);
  const j = by('jeju/jeju-si 2과');
  assert.equal(j.mode, 'below');
  assert.ok(j.pic!.h < 148 && j.pic!.h >= ZB_H_MIN, `제주시 2과 상자 ${j.pic!.h}`);
  // 줄에 둔 과는 지역 지도 그림(여백 안 지역 상자)의 긴 변이 90px 이상(가장 작은 것은 섬 상자 세로 줄이 왼쪽을 쓰는 여수시 3과 98px. 다 큰 상자를 200px 바닥 없이 아래 줄에 두면 제주시 2과 지역 그림은 50px 남짓이었다)
  const small = S.filter((s) => ZOOM_ROW.includes(s.mode as never) && Math.max(s.region!.w, s.region!.h) < 90).map((s) => `${tag(s)} ${s.mode} ${s.region!.w.toFixed(0)}×${s.region!.h.toFixed(0)}`);
  assert.deepEqual(small, []);
});

test('가로로 돌린 폰(844×390 — 지도 칸은 560 폭이지만 높이 상한 234): 넓은 상자가 귀퉁이에 들지 않으면 폰 상자로 다시 골라 귀퉁이·옆 줄에 두고(지역 지도 그림이 상자 없을 때와 같다), 아래 줄은 귀퉁이·옆 줄이 막힌 몇 과뿐이다', () => {
  // 넓은 상자 바깥(196 + 28)과 여백 둘 = 244 > 234: 점검(11-15) 전에는 넓은 상자를 아래 줄에서 낮춰 지역 지도가 68~96px 띠로 줄었다(58과 가운데 43과)
  assert.equal(ZB_WIDE_CAP, ZB_H_WIDE + 2 + ZB_NOTE_H + 2 * 10);
  assert.equal(ZB_WIDE_CAP, 244);
  const S = all().filter((s) => s.sz === 'land' && s.need);
  assert.ok(S.length >= 50, `가로 폰 ${S.length}과`);
  // 넓은 상자는 귀퉁이에만(전과 같다), 줄(아래·옆)에는 폰 상자(낮춘 아래 줄은 높이 100 · 폭 2배까지)
  for (const s of S) {
    const wideBox = s.pic!.w === 264 && s.pic!.h === 196;
    if (wideBox) assert.ok(!ZOOM_ROW.includes(s.mode as never), `${tag(s)} 넓은 상자가 줄 ${s.mode}`);
    else assert.ok(s.pic!.w <= 2 * 196 && s.pic!.h <= ZB_H, `${tag(s)} 상자 ${s.pic!.w}×${s.pic!.h}`);
  }
  const rows = S.filter((s) => s.mode === 'below').map(tag).sort();
  assert.deepEqual(rows, ['incheon 2과', 'jeju/jeju-si 1과', 'jeju/jeju-si 2과', 'jeju/jeju-si 7과', 'jeonnam-gwangju 1과', 'jeonnam-gwangju/yeosu-si 3과']);
  // 귀퉁이·옆 줄은 지도 칸을 늘리지 않는다(옆 줄은 본 지도를 비킬 뿐 — 높이 그대로)
  for (const s of S) if (s.mode !== 'below') assert.equal(s.grow, 0, tag(s));
  // 넓은 상자 그대로인 귀퉁이 과가 있다(순천시 4과 등 — 처음에 이 칸에서 늘 폰 상자를 쓰자 상자 안 지시선이 엇갈렸다)
  assert.ok(S.some((s) => tag(s) === 'jeonnam-gwangju/suncheon-si 4과' && s.pic!.w === 264));
});

test('상자 범위 좁히기(D95 ㉣ ㉮ — 지금 판): 큰 칸 때문에 상자 안에서도 몰리는 과만 좁히고(폰 제주시 1과·순천시 1과, 낮은 폰은 더), 좁힌 상자에서 다시 재면 몰리지 않으며, 이름은 상자·본 지도 가운데 한 곳에, 좁히지 않은 상자는 l.fit 그대로', () => {
  const S = all().filter((s) => s.need);
  const on = (sz: SzName) => S.filter((s) => s.sz === sz && s.narrowed).map(tag).sort();
  assert.deepEqual(on('phone'), ['jeju/jeju-si 1과', 'jeonnam-gwangju/suncheon-si 1과']);
  assert.deepEqual(on('low'), ['gyeongbuk/yeongju-si 1과', 'jeju/jeju-si 1과', 'jeju/jeju-si 2과', 'jeju/jeju-si 3과', 'jeonnam-gwangju/suncheon-si 1과', 'jeonnam-gwangju/yeosu-si 3과']);
  assert.deepEqual(on('pc'), []);
  // 가로로 돌린 폰(844×390 — 폰 상자): ①과 ②(남원시 1과 점 8.3px · 여수시 3과 낮춘 상자)
  assert.deepEqual(on('land'), [
    'daejeon/dong-gu 3과', 'gyeongbuk/yeongju-si 1과', 'jeju/jeju-si 1과', 'jeju/jeju-si 2과', 'jeonbuk/namwon-si 1과', 'jeonnam-gwangju/gwangsan-gu 2과', 'jeonnam-gwangju/suncheon-si 1과',
    'jeonnam-gwangju/yeosu-si 3과',
  ]);
  const bad: string[] = [];
  const long = (b: Box) => Math.max(b[2] - b[0], b[3] - b[1]);
  for (const s of S) {
    const at = `${tag(s)} ${s.sz}`, l = R.region(s.key)!.lessons.find((x) => x.no === s.no)!;
    if (!s.narrowed) {
      // 좁히지 않은 상자: 범위는 과 범위(l.fit) 그대로, 상자 이름표는 이번 과 본 지도 칸 모두(전과 같다)
      if (JSON.stringify(s.fitZ) !== JSON.stringify(boxOf(l.fit))) bad.push(`${at}: 좁히지 않았는데 범위가 l.fit 과 다름`);
      if (s.zlab!.length !== s.ids!.length) bad.push(`${at}: 좁히지 않았는데 상자 이름표 ${s.zlab!.length}/${s.ids!.length}`);
      continue;
    }
    // 좁힌 상자: 그 상자 크기에서 다시 재면 몰리지 않고(더 좁히지 않는다 — 판정 고정점), 상자 이름표 칸 묶음은 본 지도 판정 문턱도 넘는다
    if (zoomCrowd(s.zcells!, s.zu!)) bad.push(`${at}: 좁힌 상자에서도 몰림`);
    if (zoomFit(s.fitZ!, s.zcells!, s.pic!) !== s.fitZ) bad.push(`${at}: 좁힌 범위에서 다시 좁힘`);
    const lab = s.zcells!.filter((_, i) => s.zlab!.includes(s.ids![i]));
    if (lab.length < 2 || zoomNeed(lab.map((c) => c.box), s.zu!)) bad.push(`${at}: 좁힌 상자의 이름표 칸이 문턱 아래(${lab.length})`);
    // 이름은 한 곳에 한 번: 상자에 없는 이번 과 칸은 본 지도에 이름표를 단다(svgmap drawLabels — zLab 밖). 상자 밖으로 나간 것은 잘린 큰 칸뿐이다
    const inner = Math.min(s.pic!.w, s.pic!.h) - 2 * ZB_PAD;
    for (const [i, id] of s.ids!.entries()) {
      if (s.zlab!.includes(id)) continue;
      if (long(s.zcells![i].box) / s.zu! < inner * ZB_BIG) bad.push(`${at}: 작은 칸 ${placeName(R, id)} 이름표가 상자 밖`);
    }
    if (new Set(s.zlab).size !== s.zlab!.length || s.zlab!.some((id) => !s.ids!.includes(id))) bad.push(`${at}: 상자 이름표 칸 목록 이상`);
  }
  assert.deepEqual(bad, []);
});

test('확대 상자는 과 시작·과 요약 지도만: 문제 화면(과 확대 + 위치 지도)·홈·단원 쪽에는 넘기지 않고, 붙일지는 지도가 맨 끝에 실제 크기로 정한다(소스)', () => {
  const ctx = ctxOf(R, { homeRegion: 'jeju' });
  assert.ok(!('zoom' in homePage(ctx).maps!.main));
  assert.ok(!('zoom' in unitPage(ctx, 'jeju/jeju-si').maps!.unit));
  assert.doesNotMatch(src('app/ui/play.ts'), /setZoom|zoom:/);
  assert.doesNotMatch(src('app/ui/explore.ts'), /setZoom|zoom:/);
  const mount = src('app/ui/maps.ts').slice(src('app/ui/maps.ts').indexOf('export async function mountMap('));
  // 먼 섬 상자·축척 막대 자리(insetPad·scalePad)와 섬 상자·칠·이름표가 다 정해진 뒤에
  assert.match(mount, /if \(spec\.marks\) map\.mark\(spec\.marks\);\n\s+\/\/[^\n]*\n\s+if \(spec\.zoom\) map\.setZoom\(\{ fit: boxOf\(spec\.zoom\), note: L\.zoom \}\);\n\s+return map;/);
  const sv = src('app/map/svgmap.ts');
  // 이번 과 이름표는 상자 안에만(본 지도에 같은 이름을 두 번 달지 않는다 — 상자 범위를 좁혀 상자 밖으로 나간 큰 칸만 본 지도에, zLab), 상자는 누르기를 막지 않고 보조 기술에 읽히지 않는다
  assert.match(sv, /const list = isleSet\.size \|\| zOn \? labels\.filter\(\(l\) => !isleSet\.has\(l\.id\) && !zLab\.has\(l\.id\)\) : labels;/);
  assert.match(sv, /m\.setLabels\(labels\.filter\(\(l\) => zLab\.has\(l\.id\)\), \{ mode: labelMode \}\);/);
  assert.match(sv, /box\.className = 'cm-zoom';\n\s+box\.setAttribute\('aria-hidden', 'true'\);/);
  assert.match(src('app/map/map.css'), /\.cm-zoom \{[^}]*pointer-events: none;/);
  // 상자가 필요 없는 지도는 DOM 이 전과 같다: 상자·범위 네모는 처음 붙일 때 만든다
  assert.match(sv, /const z = zb \?\? \(zb = buildZoom\(\)\);/);
  // 글: '확대' / 'Zoomed in'
  assert.match(src('app/text/ui.ts'), /zoom: '확대',/);
  assert.match(src('app/text/ui.ts'), /zoom: 'Zoomed in',/);
});

test('확대 상자 svgmap 길(소스): 처음 붙을 때는 어느 길로 붙든(setZoom · 칠 · 창 크기 바뀜 → commit) 작은 지도 칠·이름표를 맞추고, 상자가 붙지 않는 지도는 이름표를 다시 놓지 않는다', () => {
  const sv = src('app/map/svgmap.ts');
  const body = (name: string) => { const i = sv.indexOf(`  function ${name}(`); return sv.slice(i, sv.indexOf('\n  }\n', i)); };
  // 2026-11-15 점검: 상자가 없던 크기에서 연 지도를 줄여 처음 붙으면(ResizeObserver → commit → syncZoom) 작은 지도가 빈 채였다 — syncZoom 이 붙인 뒤 맞춘다
  const sync = body('syncZoom');
  // (상자 범위를 좁히면 상자 이름표 칸 zLab 도 바뀐다 — 서명 zSig 에 둘 다)
  assert.match(sync, /was = zSig\(\);/);
  assert.match(sync, /zAt = on \? layoutZoom\([^\n]+\n(?:[^\n]*\n){4}\s+if \(on && zSig\(\) !== was\) mirrorZoom\(\);/);
  assert.match(sv, /const zSig = \(\) => \(zOn \? `\$\{\[\.\.\.zIds\]\.join\(','\)\}\|\$\{\[\.\.\.zLab\]\.join\(','\)\}` : ''\);/);
  // commit 길은 syncZoom 을 부른다(그 뒤에 mirrorZoom 이 따로 없다 — 위 줄이 맡는다)
  assert.match(body('commit'), /if \(syncZoom\(\)\) \{ home = fitView\(homeBox, size, effPad\(\)\); return commit\(home\); \}/);
  // 새로 고를 때는 늘린 줄을 걷고 다시 잰 뒤 고른다(줄인 상한·늘린 칸으로 고르지 않게), 상한은 지도 칸 max-height 를 읽는다
  assert.match(sync, /const reset = !stay && zGrow > 0;\n\s+if \(reset\) \{ setGrow\(0\); measure\(\); layoutIsle\(\); k = keys\(\); zKey = k\.key; \}/);
  // 다시 고른 뒤에는 늘린 높이가 전과 같아도 true(부르는 쪽이 다시 그리며 늘린 칸으로 자리를 다시 잰다 — 처음 열 때와 같은 차례. 2026-11-15 CDP: 제주시 1과 390×664 → 844×390 상자 자리)
  assert.match(sync, /return zGrow !== grow0 \|\| addKey\(\) !== add0 \|\| reset;/);
  assert.match(sync, /const mh = zoom \? parseFloat\(getComputedStyle\(host\)\.maxHeight\) : NaN;\n\s+const cap = Number\.isFinite\(mh\) \? mh \+ zGrow : Infinity;/);
  // 고른 줄을 그대로 두는 것은 높이 상한이 같을 때만(늘린 줄 때문에 칸이 낮아진 것은 그대로, 화면 높이가 바뀌어 상한이 바뀌면 다시 고른다)
  assert.match(sync, /\|\$\{Math\.round\(base\.w\)\}\|\$\{Math\.round\(cap\)\}\|/);
  // setZoom: 이번 과 이름표가 옮겨 갈 때만 다시 놓는다(상자가 붙지 않는 과 시작·요약은 이름표 놓기를 두 번 하지 않는다)
  const set = sv.slice(sv.indexOf('    setZoom(z) {'), sv.indexOf('    isZoomed:'));
  assert.match(set, /if \(zSig\(\) !== s0 && !\(moved && !zoomedFlag\)\) drawLabels\(\);/);
  assert.doesNotMatch(set, /^\s+drawLabels\(\);/m);
  assert.doesNotMatch(set, /mirrorZoom\(\)/);
  // 범위 네모 = 상자가 실제로 보이는 범위: 자리 고르기(range)·작은 지도 맞춤(setHome)·범위 네모(frame)가 같은 상자 범위(zoomFit)·같은 그림 크기·같은 여백에서 나온다
  const lay = body('layoutZoom');
  assert.match(lay, /const fitOf = \(s: Size\) => zoomFit\(fit, ids\.map\(/);
  assert.match(lay, /const range = \(s: Size\) => viewBox\(fitView\(fitOf\(s\), s, zpad\), s\);/);
  assert.match(lay, /const fitZ = fitOf\(pic\);\n\s+z\.map\.setHome\(fitZ, zpad\);\n\s+const zv = fitView\(fitZ, pic, zpad\);\n[^\n]*\n\s+const \[rx, ry, rw, rh\] = viewBox\(zv, pic\);/);
  assert.match(lay, /z\.frame\.setAttribute\('x', rx\.toFixed\(1\)\);\n\s+z\.frame\.setAttribute\('y', ry\.toFixed\(1\)\);\n\s+z\.frame\.setAttribute\('width', rw\.toFixed\(1\)\);\n\s+z\.frame\.setAttribute\('height', rh\.toFixed\(1\)\);/);
  // 상자 이름표 칸: 좁히지 않았으면 이번 과 모두, 좁혔으면 이름표 점이 작은 지도 이름표 범위(여백 ZB_PAD 안) 안인 칸
  assert.match(lay, /zLab = new Set\(fitZ === fit \? ids : ids\.filter\(\(id\) => \{\n\s+const \[x, y\] = S\.cells\.get\(id\)!\.label;\n\s+return x >= rx && x <= rx \+ rw && y >= ry && y <= ry \+ rh;/);
  // 넓어도 낮은 칸(가로로 돌린 폰)은 폰 상자
  assert.match(lay, /const wide = base\.w >= COMPACT_PX, full = zoomSize\(wide\);/);
  assert.match(lay, /const alt = wide && cap < ZB_WIDE_CAP \? zoomSize\(false\) : null;\n\s+const at = zoomPlace\(\{[^\n]*keep: keep && \{ mode: keep\.mode, pic: keep\.pic \}, alt \}\);/);
  // 상자가 떨어지면 상자 이름표 칸을 비운다(남으면 섬 상자 있는 지도에서 본 지도가 이번 과 이름표를 거른다 — 점검 11-15 변이 시험에서 잡지 못했다)
  assert.match(sync, /zAt = on \? layoutZoom\([^\n]+\n\s+if \(!on\) zLab = new Set\(\);/);
  // 작은 지도 이름표는 상자 이름표 칸(zLab)만, 한 번만 놓는다
  const mir = body('mirrorZoom');
  assert.equal(mir.match(/setLabels\(/g)?.length, 1);
  assert.match(mir, /m\.setLabels\(labels\.filter\(\(l\) => zLab\.has\(l\.id\)\), \{ mode: labelMode \}\);\s*$/);
  // 숨은 지도(상자를 걷은 작은 지도 — 0×0)는 ResizeObserver 에서 다시 그리지 않고, 다시 보일 때 그린다(점검 11-15 — 떨어질 때 27~33ms 헛일)
  const ro = sv.slice(sv.indexOf('const ro = typeof ResizeObserver'), sv.indexOf('ro?.observe(host);'));
  assert.match(ro, /if \(!r\.width && !r\.height\) \{ ghost = true; return; \}\n\s+const before = size, was = ghost;\n\s+measure\(\);\n\s+if \(!was && before\.w === size\.w && before\.h === size\.h\) return;/);
  assert.match(sv, /ghost = !r\.width && !r\.height;\n\s+size = \{ w: Math\.max\(1, r\.width\), h: Math\.max\(1, r\.height\) \};/);
});
