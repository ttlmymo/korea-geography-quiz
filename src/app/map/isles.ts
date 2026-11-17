// 섬 상자(동 단원의 섬 과·섬 화면, 계획서 N8 · E5): 섬 동마다 따로 그리는 작은 지도의 범위와 배치(그리기·DOM 과 따로).
// 파이프라인(pipeline/emd-lib.mjs INSET)은 섬 하나를 ISLE_W×ISLE_H 상자(isleRange 범위 + 긴 변의 ISLE_PAD 여백)에 넣은 크기로 16px 검사를 한다.
// 앱은 그보다 작게 그리지 않는 것을 목표로 두 가지로 놓는다(E5 결정 — 섬 과를 폰에서 어떻게 보일지, E3 남은 거리):
//  · 격자(grid): 고를 칸이 모두 섬이면(옹진 1과처럼 섬만 든 과·화면) 본 지도는 그리지 않고 상자들이 지도 칸 전체를 격자로 나눠 쓴다.
//    섬 과는 본 지도 범위로 보면 칸이 16px 보다 작아 나눈 것이라 본 지도가 쓸모없고, 이웃 땅도 필요 없다(단원 지도 이웃 땅 범위 밖 문제도 없어짐)
//  · 줄(strip): 일부만 섬이면(본 땅 과에 먼 섬 하나를 붙인 과) 지도 칸 가장자리에 ISLE_W×ISLE_H 상자를 줄로 두고 본 지도는 그만큼 비켜 맞춘다.
//    넓은 칸(폭 ≥ 높이)은 왼쪽 세로 줄, 세로로 긴 칸(폰)은 아래 가로 줄 — 본 지도가 덜 줄어드는 쪽.
//    줄이 지도 칸의 절반(STRIP_MAX)을 넘으면 다른 방향, 그래도 넘으면 상자를 줄인다(stripFit — 2026-11-15 점검, 폰 완도군 섬 7곳)
//    섬이 모두 본 지도 범위의 동쪽 끝보다 동쪽이면(east — 경북 울릉군, E14 검수) 세로 줄은 오른쪽, 가로 줄은 오른쪽 끝에 붙인다.
//    울릉은 울진 동쪽 바다인데 왼쪽(서쪽 내륙 자리)에 그리면 위치를 잘못 알려 준다. 서·남·북쪽 섬(옹진·단원구·부안·제주시)은 전과 같다
// 상자 차례는 지리 차례다: 격자는 북쪽 섬부터 줄을 채우고 줄 안은 서쪽부터, 세로 줄은 북→남, 가로 줄은 서→동(판정 방위 문장과 대체로 맞게 — E5 검수)
// 축척(2026-11-15 사용자 지시 — '먼 섬 · 축척 다름' 대신 실제 축척): 상자마다 그 상자의 축척 막대를 본 지도 막대와 같은 1·2·5 계단으로 보인다(insetScale).
// 먼 섬 상자(지역 지도)와 상자가 하나뿐인 섬 상자는 아래 칸 '먼 섬' 옆에, 섬 상자가 여럿이면 상자마다 안 귀퉁이 칸에(땅을 가장 적게 덮는 귀퉁이 — cornerCover·pickCorner)
import type { Box } from './project.ts';
import { scaleStep, textWidth } from './labelfit.ts';
import { boxHits } from './poly.ts';

/** 섬 상자 한 칸(파이프라인 emd-lib INSET 과 같은 값 — tests/unit/emd-units.test.ts 가 견준다) */
export const ISLE_W = 128, ISLE_H = 112, ISLE_PAD = 0.12;
/** 섬 상자에서 지킬 칸 크기(내접원 지름 px — 파이프라인 TAP_FAIL 과 같은 값) */
export const ISLE_MIN_PX = 16;
/** 상자 사이 · '먼 섬' 글 줄 높이 */
export const ISLE_GAP = 8, ISLE_NOTE_H = 22;

export interface IslePart { box: Box; a: number }

/**
 * 섬 상자 한 곳의 범위(지도 단위 상자, 방향 무관): 가장 큰 덩어리 상자에서 시작해 덩어리 상자 가운데가 가까운 차례로(같으면 넓은 것 먼저) 더한다.
 * 더한 범위를 ISLE_W×ISLE_H 상자에 맞췄을 때 그 곳의 내접원 지름(반올림)이 ISLE_MIN_PX 이상일 때만 더한다.
 * 파이프라인 pipeline/emd-lib.mjs isleRange 와 같은 식(tests/unit/emd-units.test.ts 가 견준다). r = 내접원 반지름(지도 단위 = m)
 */
export function isleRange(parts: IslePart[], r: number): Box {
  const big = parts.reduce((x, y) => (y.a > x.a ? y : x));
  const cen = (b: Box) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  const c0 = cen(big.box);
  const rest = parts.filter((p) => p !== big).map((p) => ({ p, d: Math.hypot(cen(p.box)[0] - c0[0], cen(p.box)[1] - c0[1]) })).sort((x, y) => x.d - y.d || y.p.a - x.p.a);
  let b: Box = big.box;
  for (const { p } of rest) {
    const nb: Box = [Math.min(b[0], p.box[0]), Math.min(b[1], p.box[1]), Math.max(b[2], p.box[2]), Math.max(b[3], p.box[3])];
    const w = nb[2] - nb[0], h = nb[3] - nb[1], m = Math.max(w, h) * ISLE_PAD;
    if (Math.round(2 * r * Math.min(ISLE_W / (w + 2 * m), ISLE_H / (h + 2 * m))) >= ISLE_MIN_PX) b = nb;
  }
  return b;
}

/**
 * 섬 하나의 상자 범위(지도 단위, y 아래로): isleRange(16px 를 지키는 한 가까운 덩어리까지)를 긴 변의 ISLE_PAD 만큼 늘린 것.
 * 가장 큰 고리만 쓰면 섬 여럿으로 된 면의 넓이가 최대 66%(자월면) 잘려 격자에서는 어디에도 보이지 않았다(E5 검수).
 * 덩어리 전부는 128×112 상자에서 16px 검사를 깬다(자월면 5px). 고리마다 덩어리로 본다(구멍 고리는 바깥 고리 안이라 범위가 같다)
 */
export function isleView(rings: Float64Array[], r: number): Box {
  const parts: IslePart[] = rings.map((ring) => {
    let a = 0;
    const box: Box = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      a += ring[j] * ring[i + 1] - ring[i] * ring[j + 1];
      box[0] = Math.min(box[0], ring[i]); box[2] = Math.max(box[2], ring[i]);
      box[1] = Math.min(box[1], ring[i + 1]); box[3] = Math.max(box[3], ring[i + 1]);
    }
    return { box, a: Math.abs(a) / 2 };
  });
  const b = isleRange(parts, r);
  const m = Math.max(b[2] - b[0], b[3] - b[1]) * ISLE_PAD;
  return [b[0] - m, b[1] - m, b[2] + m, b[3] + m];
}

export interface IsleRect { x: number; y: number; w: number; h: number }
export interface IsleLayout {
  mode: 'grid' | 'col' | 'row';
  /** 줄을 붙인 쪽: 'l' = 왼쪽(세로 줄)·왼쪽부터(가로 줄), 'r' = 오른쪽(동쪽 섬 — east). 격자는 늘 'l' */
  side: 'l' | 'r';
  /** 상자 자리(px, 지도 칸 왼쪽 위 기준) */
  boxes: IsleRect[];
  /** '먼 섬' 칸 자리(2026-11-15 전에는 '먼 섬 · 축척 다름')(상자 묶음 끝에 1px 겹쳐 붙는다 — 먼 섬 상자의 아래 칸처럼 한 틀로 보이게). side 'r' 이면 오른쪽 끝(x + w)에 맞춰 글이 길면 왼쪽으로 늘어난다 */
  note: IsleRect;
  /** 본 지도 여백에 더할 것(줄일 때만: 왼쪽 세로 줄은 l, 오른쪽 세로 줄은 r, 아래 가로 줄은 b) */
  shift: { l: number; r: number; b: number };
  /** 섬마다 상자에서의 축척(px / 지도 단위) 가운데 가장 작은 값 — 시험이 ISLE_W×ISLE_H 상자의 축척과 견준다 */
  minK: number;
}

/** 상자(w×h px)에 범위 v 를 맞췄을 때의 축척(px / 지도 단위) */
export const fitK = (v: Box, w: number, h: number) => Math.min(w / Math.max(1e-9, v[2] - v[0]), h / Math.max(1e-9, v[3] - v[1]));

/**
 * 배치. area = 지도 칸 안쪽(여백 뺀 곳, px: x·y 는 지도 칸 왼쪽 위 기준), views = 섬마다 범위, grid = 고를 칸이 모두 섬.
 * 격자: 열 수 c = 1…n 가운데 섬마다 축척(상자에 범위를 맞춘 값)의 가장 작은 값이 가장 큰 c(같으면 열이 적은 쪽). '먼 섬' 칸은 맨 아래 한 줄.
 * 줄: ISLE_W×ISLE_H 상자를 왼쪽 세로 줄(넘치면 옆 줄로) 또는 아래 가로 줄(넘치면 윗줄로)에 두고, '먼 섬' 칸은 줄 끝에.
 * 줄이 지도 칸의 STRIP_MAX 를 넘으면 다른 방향이나 작은 상자로(stripFit — 섬이 많은 완도군 단원 쪽 폰).
 * east(섬이 모두 본 지도 동쪽 — 머리 주석)면 세로 줄은 오른쪽 끝, 가로 줄은 오른쪽 끝에 붙인다(상자 차례는 그대로 지리 차례). 격자에는 쓰지 않는다.
 * boxes[i] 는 views[i] 의 자리다. 자리 차례(slot)는 지리 차례(머리 주석)
 */
export function layoutIsles(views: Box[], area: IsleRect, grid: boolean, east = false, noteH = ISLE_NOTE_H): IsleLayout {
  // noteH = '먼 섬' 글 칸 높이(줄 모드만 — 글과 막대가 상자 묶음보다 넓어 막대를 아래 줄로 내리면 두 줄 높이, 결정표 D111). 줄의 방향·상자 크기(stripFit)는 한 줄 높이로 정한 그대로
  const n = views.length, g = ISLE_GAP;
  const cx = (i: number) => (views[i][0] + views[i][2]) / 2, cy = (i: number) => (views[i][1] + views[i][3]) / 2;
  const idx = views.map((_, i) => i);
  /** slot 차례의 views 번호 → 자리 배열을 views 차례로 */
  const place = (order: number[], slots: IsleRect[]) => { const out: IsleRect[] = new Array(n); order.forEach((vi, s) => { out[vi] = slots[s]; }); return out; };
  if (grid) {
    const H = Math.max(1, area.h - ISLE_NOTE_H);
    let best = { c: 1, k: -1, w: area.w, h: H };
    for (let c = 1; c <= n; c++) {
      const r = Math.ceil(n / c);
      const w = (area.w - (c - 1) * g) / c, h = (H - (r - 1) * g) / r;
      if (w <= 0 || h <= 0) continue;
      const k = Math.min(...views.map((v) => fitK(v, w, h)));
      if (k > best.k * (1 + 1e-9)) best = { c, k, w, h };
    }
    const slots = idx.map((s) => ({ x: area.x + (s % best.c) * (best.w + g), y: area.y + Math.floor(s / best.c) * (best.h + g), w: best.w, h: best.h }));
    // 북쪽(y 작은) 섬부터 c 개씩 한 줄, 줄 안은 서쪽부터
    const byY = [...idx].sort((a, b) => cy(a) - cy(b) || cx(a) - cx(b));
    const order: number[] = [];
    for (let s = 0; s < n; s += best.c) order.push(...byY.slice(s, s + best.c).sort((a, b) => cx(a) - cx(b)));
    return { mode: 'grid', side: 'l', boxes: place(order, slots), note: { x: area.x, y: area.y + H - 1, w: area.w, h: ISLE_NOTE_H + 1 }, shift: { l: 0, r: 0, b: 0 }, minK: best.k };
  }
  const pref = area.w >= area.h;
  const { col, W, Hh } = stripFit(n, area, pref);
  const side = east ? 'r' : 'l';
  const boxes: IsleRect[] = [];
  if (col) {
    // 세로 줄: 위에서 아래로, 높이(글 줄 빼고)가 모자라면 옆 줄로(왼쪽 줄은 오른쪽으로, 오른쪽 줄은 왼쪽으로 늘어난다)
    const per = Math.max(1, Math.floor((area.h - noteH + g) / (Hh + g)));
    const cols = Math.ceil(n / per), rows = Math.min(n, per);
    const width = cols * W + (cols - 1) * g;
    const x0 = east ? area.x + area.w - width : area.x;
    for (let i = 0; i < n; i++) boxes.push({ x: x0 + Math.floor(i / per) * (W + g), y: area.y + (i % per) * (Hh + g), w: W, h: Hh });
    const order = [...idx].sort((a, b) => cy(a) - cy(b) || cx(a) - cx(b));   // 북→남
    const nw = Math.max(width, W);
    return { mode: 'col', side, boxes: place(order, boxes), note: { x: east ? area.x + area.w - nw : area.x, y: area.y + rows * (Hh + g) - g - 1, w: nw, h: noteH + 1 }, shift: { l: east ? 0 : width + 2 * g, r: east ? width + 2 * g : 0, b: 0 }, minK: Math.min(...views.map((v) => fitK(v, W, Hh))) };
  }
  // 아래 가로 줄: 서→동 차례로 왼쪽부터(east 면 줄 전체를 오른쪽 끝에 붙인다), 폭이 모자라면 윗줄로. '먼 섬' 칸은 줄 위
  const per = Math.max(1, Math.floor((area.w + g) / (W + g)));
  const rows = Math.ceil(n / per);
  const top = area.y + area.h - rows * Hh - (rows - 1) * g;
  const rowW = Math.min(area.w, Math.min(n, per) * (W + g) - g);
  const x0 = east ? area.x + area.w - rowW : area.x;
  for (let i = 0; i < n; i++) boxes.push({ x: x0 + (i % per) * (W + g), y: top + Math.floor(i / per) * (Hh + g), w: W, h: Hh });
  const height = rows * Hh + (rows - 1) * g + noteH;
  const order = [...idx].sort((a, b) => cx(a) - cx(b) || cy(a) - cy(b));   // 서→동
  return { mode: 'row', side, boxes: place(order, boxes), note: { x: x0, y: top - noteH, w: rowW, h: noteH + 1 }, shift: { l: 0, r: 0, b: height + g }, minK: Math.min(...views.map((v) => fitK(v, W, Hh))) };
}

/** 줄(세로·가로)이 차지해도 되는 몫: 지도 칸 폭(세로 줄)·높이(가로 줄)의 이만큼까지 — 넘으면 stripFit 이 다른 방향이나 작은 상자로 바꾼다 */
export const STRIP_MAX = 0.5;

/** 줄의 차지(본 지도 여백에 더하는 px — layoutIsles 의 shift 와 같은 셈): 세로 줄은 폭, 가로 줄은 높이 */
function stripSpan(n: number, area: IsleRect, col: boolean, W: number, Hh: number): number {
  const g = ISLE_GAP;
  if (col) {
    const per = Math.max(1, Math.floor((area.h - ISLE_NOTE_H + g) / (Hh + g))), cols = Math.ceil(n / per);
    return cols * W + (cols - 1) * g + 2 * g;
  }
  const per = Math.max(1, Math.floor((area.w + g) / (W + g))), rows = Math.ceil(n / per);
  return rows * Hh + (rows - 1) * g + ISLE_NOTE_H + g;
}

/**
 * 줄의 방향과 상자 크기. 처음 방향(pref — 넓은 칸은 세로 줄, 세로로 긴 칸은 가로 줄)의 128×112 줄이 지도 칸의 STRIP_MAX 안에 들면 그대로(지금 판의 섬 1~2곳 줄은 모두 이 경우).
 * 넘으면(2026-11-15 점검 — 폰 완도군 동 단원 쪽: 섬 7곳 세로 줄이 4열 536px 로 지도 칸 폭 362px 를 넘어 본 지도가 보이지 않았다)
 * 다른 방향 128×112 줄이 STRIP_MAX 안에 들면 그쪽으로, 둘 다 넘으면 상자를 같은 비율로 줄여 STRIP_MAX 안에 드는 가장 큰 크기(방향·열 수·줄 수를 모두 견줌, 같으면 처음 방향).
 * 줄인 상자는 파이프라인이 16px 를 잰 128×112 보다 작다 — 본 지도가 사라지는 것보다 낫다(섬 상자 안 누르기는 INSET_SNAP_PX 로 가까운 섬을 잡는다)
 */
export function stripFit(n: number, area: IsleRect, pref: boolean): { col: boolean; W: number; Hh: number } {
  const lim = (col: boolean) => STRIP_MAX * (col ? area.w : area.h);
  for (const col of [pref, !pref]) if (stripSpan(n, area, col, ISLE_W, ISLE_H) <= lim(col)) return { col, W: ISLE_W, Hh: ISLE_H };
  const g = ISLE_GAP;
  let best = { col: pref, s: 0 };
  for (const col of [pref, !pref]) {
    for (let k = 1; k <= n; k++) {
      // 세로 줄은 k 열(열마다 per 상자), 가로 줄은 k 줄(줄마다 per 상자)
      const per = Math.ceil(n / k);
      const s = col
        ? Math.min((area.h - ISLE_NOTE_H - (per - 1) * g) / per / ISLE_H, (lim(true) - 2 * g - (k - 1) * g) / k / ISLE_W)
        : Math.min((area.w - (per - 1) * g) / per / ISLE_W, (lim(false) - g - ISLE_NOTE_H - (k - 1) * g) / k / ISLE_H);
      if (s > best.s * (1 + 1e-9)) best = { col, s };
    }
  }
  const s = Math.min(1, Math.max(0.1, best.s));
  return { col: best.col, W: Math.floor(ISLE_W * s), Hh: Math.floor(ISLE_H * s) };
}

/** 섬이 모두 본 지도 범위(home, 지도 단위 상자)의 동쪽 끝보다 동쪽인가(layoutIsles 의 east) — 상자 가운데로 잰다 */
export const isleEast = (views: Box[], home: Box) => views.length > 0 && views.every((v) => (v[0] + v[2]) / 2 > home[2]);

/* ---------- 상자 축척(2026-11-15) ---------- */

/**
 * 먼 섬 상자(지역 지도 svgmap S.far — 설계서 3.3)의 범위와 크기: 먼 섬 덩어리 상자를 긴 변의 ISLE_PAD 만큼 늘려 ISLE_W×ISLE_H 안에 맞춘다.
 * vb = svg viewBox [x, y, 폭, 높이](지도 단위), w·h = svg 크기(px, 반올림), k = 실제로 그려지는 배율(px / 지도 단위 — 반올림한 크기에 meet 으로 맞춘 값)
 */
export function farInset(box: Box): { vb: [number, number, number, number]; w: number; h: number; k: number } {
  const m = Math.max(box[2] - box[0], box[3] - box[1]) * ISLE_PAD;
  const vb: [number, number, number, number] = [box[0] - m, box[1] - m, box[2] - box[0] + 2 * m, box[3] - box[1] + 2 * m];
  const k0 = Math.min(ISLE_W / vb[2], ISLE_H / vb[3]);
  const w = Math.round(vb[2] * k0), h = Math.round(vb[3] * k0);
  return { vb, w, h, k: Math.min(w / vb[2], h / vb[3]) };
}

/** 상자 축척 막대의 가장 긴 길이(px)와, 상자 폭에 맞출 때의 비율(가장 긴 길이 = min(BAR_MAX, 상자 폭 × BAR_FRAC)) */
export const BAR_MAX = 40, BAR_FRAC = 0.3;

/**
 * 상자의 축척 막대: 상자 배율 k(px / 지도 단위 — 지도 단위는 m)로 본 지도 막대(labelfit scaleStep — 100m~100km 의 1·2·5 계단)와 같은 계단에서 고른다.
 * 상자가 작아 길이 범위를 상자 폭(boxW, px)에 맞춰 줄인다: 가장 긴 막대 = min(BAR_MAX, boxW × BAR_FRAC), 가장 짧은 막대 = 그 2/5.
 * 범위가 2.5배라 계단 값(1→2→5→10, 이웃 비율 2·2.5)이 늘 하나 이상 든다(둘이면 긴 쪽 — scaleStep 과 같다).
 * 128px 상자면 15~38px(옹진 백령면 2km 17px · 인천 먼 섬 20km 18px), 그 이하로 줄어든 격자 상자는 더 짧다
 */
export function insetScale(k: number, boxW: number): { m: number; px: number; text: string } {
  const max = Math.min(BAR_MAX, Math.max(1, boxW) * BAR_FRAC);
  return scaleStep(1 / Math.max(1e-12, k), max / 2.5, max);
}

/**
 * 상자 안 축척 칸(map.css .cm-isle-scale — 본 지도 막대 .cm-scale 과 같은 꼴: 길이 글 위, 막대 아래)의 크기(px).
 * 폭 = 막대와 글 가운데 긴 쪽 + 여백 5·5 + 안쪽 선 1, 높이 = 선 1 + 여백 2 + 글 14 + 사이 3 + 막대 6 + 여백 4.
 * 처음에는 '━ 5km' 한 줄(높이 22, 폭 60~90)이었는데 귀퉁이에 덜 들어가 그 섬을 덮는 경우가 운영 판 섬 상자 212경우(흉내) 가운데 45였다 — 이 꼴은 22
 */
export const SCALE_CHIP_H = 30;
export const scaleChip = (s: { px: number; text: string }) => ({ w: Math.max(Math.round(s.px), Math.ceil(textWidth(s.text, 14))) + 11, h: SCALE_CHIP_H });

/** 상자 귀퉁이: 오른쪽 아래 · 왼쪽 아래 · 오른쪽 위 · 왼쪽 위(왼쪽 위는 섬 이름 칸 자리 — 이름이 없을 때만) */
export type Corner = 'br' | 'bl' | 'tr' | 'tl';
export const CORNERS: Corner[] = ['br', 'bl', 'tr', 'tl'];
/**
 * 덮는 정도를 셀 때 그 상자의 섬(own)에 닿는 작은 칸의 무게. 작은 칸 수(축척 칸 하나에 많아야 수십)보다 훨씬 커서 사실상 사전식이다:
 * 그 상자의 섬을 덮지 않는 귀퉁이가 있으면 맥락 땅(옆 섬·본 땅 — 회색)을 얼마나 덮든 그쪽을 고른다(처음 4 로 두자 신안 폰 격자에서 맥락 땅을 피하려고 노란 섬 끝을 덮었다)
 */
export const OWN_W = 1000;
/** 덮는 정도를 재는 작은 칸 크기(px): 축척 칸을 이 크기 안팎으로 나눠 작은 칸마다 땅에 닿는지 본다(확대 상자 zoombox.ts 는 덮은 몫을 셀 때 쓴다) */
export const COVER_PX = 6;

/** 상자에 그리는 칸 하나(그 상자의 섬이면 own) */
export interface IsleCell { rings: Float64Array[]; box: Box; own: boolean }

/**
 * 상자(w×h px — 테두리 안쪽, 범위 view 를 xMidYMid meet 으로 맞춤) 네 귀퉁이에 칸(cw×ch px)을 두었을 때 땅을 덮는 정도.
 * 덮는 정도 = 칸을 COVER_PX 안팎의 작은 칸으로 나눠 땅(칸 안이거나 해안선이 지나감 — poly boxHits)에 닿는 작은 칸 수. 그 상자의 섬에 닿으면 OWN_W 배.
 * 해안선이 지나가는 작은 칸도 세므로 섬 끝을 조금 덮는 것도 잡힌다(처음에는 표본 점만 봐 경북 울릉도 남쪽 끝을 덮는 귀퉁이를 골랐다).
 * 상자 크기가 바뀔 때만 잰다(svgmap layoutIsle — 그리기(commit)마다 재지 않는다)
 */
export function cornerCover(view: Box, w: number, h: number, cw: number, ch: number, cells: IsleCell[]): Record<Corner, number> {
  const k = fitK(view, w, h);
  const ox = (w - (view[2] - view[0]) * k) / 2, oy = (h - (view[3] - view[1]) * k) / 2;
  const nx = Math.max(1, Math.round(cw / COVER_PX)), ny = Math.max(1, Math.round(ch / COVER_PX));
  const sw = cw / nx / k, sh = ch / ny / k;   // 작은 칸 크기(지도 단위)
  const out = {} as Record<Corner, number>;
  for (const c of CORNERS) {
    const x0 = c[1] === 'r' ? w - cw : 0, y0 = c[0] === 'b' ? h - ch : 0;
    let n = 0;
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const x = view[0] + (x0 + ((i + 0.5) * cw) / nx - ox) / k, y = view[1] + (y0 + ((j + 0.5) * ch) / ny - oy) / k;
      let wgt = 0;
      for (const cl of cells) {
        if (wgt >= (cl.own ? OWN_W : 1)) continue;
        if (cl.box[2] < x - sw / 2 || cl.box[0] > x + sw / 2 || cl.box[3] < y - sh / 2 || cl.box[1] > y + sh / 2) continue;
        if (boxHits(cl.rings, x, y, sw, sh)) wgt = cl.own ? OWN_W : 1;
      }
      n += wgt;
    }
    out[c] = n;
  }
  return out;
}

/**
 * 축척 칸 귀퉁이: 덮는 정도가 가장 적은 곳(같으면 br → bl → tr → tl 차례 — 본 지도 막대처럼 오른쪽 아래가 먼저).
 * 섬 이름 칸(왼쪽 위, nameW px)이 보이면 왼쪽 위는 빼고, 오른쪽 위는 이름 칸과 4px 넘게 떨어질 때만(w = 상자 안쪽 폭, cw = 축척 칸 폭)
 */
export function pickCorner(cover: Record<Corner, number>, w: number, cw: number, nameW: number): Corner {
  const ok = CORNERS.filter((c) => !nameW || (c !== 'tl' && (c !== 'tr' || nameW + 4 + cw <= w)));
  return ok.reduce((best, c) => (cover[c] < cover[best] ? c : best));
}
