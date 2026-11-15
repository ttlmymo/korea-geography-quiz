// 위치 지도(2026-11-15 사용자 지시 — '1과는 서울 전체 지도가 나오는데 2과부터는 그 부분만 확대돼 어디인지 구분하기 어렵다'): 과 지도 귀퉁이의 작은 지도.
// 지역(동 단원이면 그 시·군·구, 시·도 단원이면 전국) 전체 모양 위에 이번 과 칸을 흰 칸 + 먹 둘레(문제 화면 범례 '고를 칸')로 칠하고, 지금 보이는 범위를 먹선 네모로 그린다.
// 과 지도는 칸이 16px 아래로 작아지지 않게(계획서 minTapPx) 과 범위로 확대하므로 확대는 그대로 두고 이것만 얹는다. 그리기·DOM 과 따로(svgmap 이 쓴다).
// 모양은 이미 받은 지역·단원 경계(Shapes)를 작은 크기에 맞게 줄인 것이다(새로 받지 않는다 — 부팅 데이터 예산 그대로):
// 꼭짓점을 위치 지도 0.5px 격자에 맞추고 겹친 점을 뺀다. 이웃 칸이 함께 쓰는 경계는 같은 점들이라 맞춘 뒤에도 같아 틈이 생기지 않는다(칸마다 따로 줄여도 된다).
// 언제 보이나: 과 기본 보기에 지역 전체 상자의 LOC_MAX_COVER 미만만 보일 때(locShow). 어디에: 축척 막대·먼 섬 상자·섬 상자 줄과 겹치지 않는 귀퉁이 가운데
// 이번 과 칸을 가장 덜 가리는 곳(locCorners·pickLoc — 덮는 정도는 섬 상자 축척 칸과 같은 isles.ts cornerCover 로 잰다).
// 다시 그리기: 모양 path 는 지역·크기마다 한 번(locBase, Shapes 마다 기억), 이번 과 칸은 과(밝은 칸 묶음)가 바뀔 때만(locLit), 귀퉁이·보이기는 과 기본 보기·지도 칸 크기·
// 귀퉁이를 쓰는 것이 바뀔 때만 다시 정한다. 그리기(commit)마다 하는 일은 보이는 범위 네모의 좌표 넷을 바꾸는 것뿐이다.
// 쓰는 화면: 문제 화면(play.ts)만. 과 시작·과 요약은 같은 날 사용자 결정('서울 전체가 나오게')으로 확대하지 않고 지역 전체 지도라 쓰지 않는다(pages.ts lessonWhole)
import type { Box } from './project.ts';
import type { Shapes } from './shapes.ts';
import { viewBox, type Size, type View } from './view.ts';
import { cornerCover, type Corner, type IsleCell } from './isles.ts';

/**
 * 과 기본 보기에 지역(단원) 전체 상자의 이 비율 이상이 보이면 '거의 전체가 보인다'고 보고 위치 지도를 숨긴다(넓이 비 — 가로·세로로 약 92%).
 * 근거(2026-11-15, 운영 판 여러 과 단원의 715과를 폰 과 시작 390·폰 문제 390×570·PC 과 시작 700·PC 문제 980×740 으로 흉내 — 넓이 비):
 * 사용자가 어디인지 모르겠다고 한 서울 2과는 40~64%, 경기 3과는 16~32%다. 과 판은 지역 외곽선을 옅은 선으로 낮춰(map.css .cmap.part .cm-rim)
 * 지역 상자의 60% 남짓이 보여도 지역 모양을 알아보기 어렵다(처음 문턱 0.6 에서는 폰 문제 화면의 서울 2과가 64%라 숨었다).
 * 거의 전체가 보이는 과는 강북구 2과(93~100%)·광양시 2과(99~100%)·종로구 1과 PC(91·100%) 같은 것이고, 이 문턱이면 715과 가운데 634~679과에 보인다.
 * 서울 1과도 26~37%라 보인다(과 범위가 서울 상자 가로의 약 40%)
 */
export const LOC_MAX_COVER = 0.85;
/** 위치 지도 긴 변(px, 틀 안): 지도 칸이 좁으면(폰 — 폭 < wideFrom) 84, 넓으면 112. 지도 칸 짧은 변의 LOC_FRAC 를 넘지 않고 LOC_MIN 아래로 줄지 않는다 */
export const LOC_PX = 84, LOC_PX_WIDE = 112, LOC_FRAC = 0.34, LOC_MIN = 56;
/** 지도 칸 가장자리에서 띄우는 거리(px)와, 귀퉁이를 쓰는 다른 것(축척 막대·섬 상자)과 띄울 거리(px) */
export const LOC_MARGIN = 10, LOC_GAP = 6;
/** 모양을 틀 안쪽에서 띄우는 여백(px) · 짧은 변의 가장 작은 비(가늘고 긴 단원도 너무 납작하지 않게 — 모양은 가운데) */
const LOC_INNER = 4, LOC_SHORT = 0.55;
/** 이보다 작은(가로·세로 모두) 고리는 그리지 않는다(px) */
export const LOC_DOT = 1.5;
/** 덮는 정도가 같을 때의 귀퉁이 차례: 왼쪽 위 먼저(문제 화면 오른쪽 위는 '⤢ 전체 보기' 자리라 빼고, 오른쪽 아래는 넓은 화면의 축척 막대 자리) */
export const LOC_ORDER: Corner[] = ['tl', 'tr', 'bl', 'br'];

/** 과 기본 보기(v — 지도 칸 size)에 지역 전체 상자(whole)의 몇 비율이 보이나(0~1, 넓이) */
export function viewCover(v: View, size: Size, whole: Box): number {
  const [x, y, w, h] = viewBox(v, size);
  const ix = Math.max(0, Math.min(x + w, whole[2]) - Math.max(x, whole[0]));
  const iy = Math.max(0, Math.min(y + h, whole[3]) - Math.max(y, whole[1]));
  const a = (whole[2] - whole[0]) * (whole[3] - whole[1]);
  return a > 0 ? (ix * iy) / a : 1;
}

/**
 * 위치 지도를 보이나: 밝은 칸(이번 과)이 지역 칸의 일부이고(전부·하나도 없음이면 가리킬 과가 없다), 섬 상자 격자가 아니며(본 지도를 숨긴다 — D3 '숨김'),
 * 과 기본 보기가 지역 전체 상자의 LOC_MAX_COVER 미만을 보일 때
 */
export const locShow = (o: { cover: number; lit: number; total: number; grid: boolean }) => o.lit > 0 && o.lit < o.total && !o.grid && o.cover < LOC_MAX_COVER;

/** 위치 지도 긴 변(px): 지도 칸 폭이 wideFrom 이상이면 LOC_PX_WIDE, 아니면 LOC_PX. 지도 칸 짧은 변 × LOC_FRAC 를 넘지 않게(납작한 지도 칸) */
export const locSide = (size: Size, wideFrom: number) => Math.max(LOC_MIN, Math.min(size.w >= wideFrom ? LOC_PX_WIDE : LOC_PX, Math.round(Math.min(size.w, size.h) * LOC_FRAC)));

/** 위치 지도 틀: w·h = svg 크기(px), 지도 점 (x, y) → ((x - x0)·k + ox, (y - y0)·k + oy) */
export interface LocFrame { w: number; h: number; k: number; x0: number; y0: number; ox: number; oy: number }

/** 지역 전체 상자를 긴 변 side px 안(여백 LOC_INNER)에 맞춘 틀. 짧은 변은 side × LOC_SHORT 아래로 줄지 않고 모양은 가운데 */
export function locFrame(whole: Box, side: number): LocFrame {
  const W = Math.max(1e-9, whole[2] - whole[0]), H = Math.max(1e-9, whole[3] - whole[1]);
  const k = (side - 2 * LOC_INNER) / Math.max(W, H);
  const short = Math.round(side * LOC_SHORT);
  const w = Math.max(short, Math.round(W * k + 2 * LOC_INNER)), h = Math.max(short, Math.round(H * k + 2 * LOC_INNER));
  return { w, h, k, x0: whole[0], y0: whole[1], ox: (w - W * k) / 2, oy: (h - H * k) / 2 };
}

/**
 * 고리·선을 틀 좌표 0.5px 격자에 맞춘 path d. 겹친 점은 빼고, 점이 모자라거나(고리 3 · 선 2 미만) 틀 밖에 있는 것은 뺀다.
 * close = 고리(Z 로 닫음), 아니면 선(메쉬)
 */
export function snapD(lines: Iterable<ArrayLike<number>>, f: LocFrame, close: boolean): string {
  let d = '';
  for (const r of lines) {
    let s = '', n = 0, px = NaN, py = NaN, ax = Infinity, ay = Infinity, bx = -Infinity, by = -Infinity;
    for (let i = 0; i + 1 < r.length; i += 2) {
      const x = Math.round(((r[i] - f.x0) * f.k + f.ox) * 2) / 2, y = Math.round(((r[i + 1] - f.y0) * f.k + f.oy) * 2) / 2;
      if (x === px && y === py) continue;
      s += `${n ? ' ' : 'M'}${x} ${y}`;
      n++; px = x; py = y;
      if (x < ax) ax = x;
      if (x > bx) bx = x;
      if (y < ay) ay = y;
      if (y > by) by = y;
    }
    if (n < (close ? 3 : 2) || bx < 0 || ax > f.w || by < 0 || ay > f.h) continue;
    // 1.5px 보다 작은 고리(작은 섬 — 전남광주는 섬 수천 개라 이것만으로 바탕이 95KB 였다)는 뺀다. 섬을 품은 칸의 구멍 고리도 같은 점이라 함께 빠져 틈이 생기지 않는다.
    // 선(메쉬)은 닫힌 것(작은 섬 해안 — 처음 점 = 끝 점)만 뺀다(긴 해안의 짧은 토막을 빼면 외곽선이 끊긴다)
    const loop = close || (r[0] === r[r.length - 2] && r[1] === r[r.length - 1]);
    if (loop && bx - ax < LOC_DOT && by - ay < LOC_DOT) continue;
    d += close ? `${s}Z` : s;
  }
  return d;
}

/** 메쉬 path d('M x y x y …M …' — shapes.ts meshD)를 선마다 숫자 배열로(점 둘인 선도 남긴다 — poly.ts ringsOfD 는 셋 미만을 뺀다) */
export function meshLines(d: string): number[][] {
  const out: number[][] = [];
  for (const part of d.split('M')) {
    const n = part.match(/-?\d+(?:\.\d+)?/g);
    if (n && n.length >= 4) out.push(n.slice(0, n.length - (n.length % 2)).map(Number));
  }
  return out;
}

/** 위치 지도 바탕 모양(틀 하나에 한 번): 지역 칸 모두(land), 칸에 닿는 강(water — 본 지도처럼 칸과 맞닿은 강만), 지역 외곽선(rim — 해안·다른 시·도 경계), 칸마다 모양(cell — 이번 과 칠에 쓴다) */
export interface LocBase { land: string; water: string; rim: string; cell: Map<string, string> }
const baseMemo = new WeakMap<Shapes, Map<string, LocBase>>();

/** 바탕 모양: 같은 지역 모양(Shapes — ui/maps.ts 가 지역마다 한 번 만들어 둔다)과 같은 틀이면 다시 만들지 않는다(같은 지역의 문제 화면을 다시 열어도) */
export function locBase(S: Shapes, f: LocFrame): LocBase {
  const key = `${f.w},${f.h},${f.k},${f.x0},${f.y0}`;
  let m = baseMemo.get(S);
  if (!m) baseMemo.set(S, (m = new Map()));
  let b = m.get(key);
  if (!b) {
    const cell = new Map<string, string>();
    for (const id of S.ids) cell.set(id, snapD(S.cells.get(id)!.rings, f, true));
    b = { land: [...cell.values()].join(''), water: S.bankD ? snapD(S.water, f, true) : '', rim: snapD(meshLines(S.rimD), f, false), cell };
    if (m.size >= 8) m.clear();
    m.set(key, b);
  }
  return b;
}

/** 이번 과 칠(fill — 칸마다 모양을 이어 붙임)과 둘레(rim — 묶음 둘레 메쉬, 강가 포함이라 닫힌 선) */
export function locLit(S: Shapes, base: LocBase, f: LocFrame, ids: readonly string[]): { fill: string; rim: string } {
  if (!ids.length) return { fill: '', rim: '' };
  return { fill: ids.map((id) => base.cell.get(id) ?? '').join(''), rim: snapD(meshLines(S.rimOf(new Set(ids), { bank: true })), f, false) };
}

/** 귀퉁이 c 에 w×h 위치 지도를 두었을 때의 자리(px, 지도 칸 왼쪽 위 기준) */
export function locRect(c: Corner, size: Size, w: number, h: number, m = LOC_MARGIN): { x: number; y: number; w: number; h: number } {
  return { x: c[1] === 'r' ? size.w - m - w : m, y: c[0] === 'b' ? size.h - m - h : m, w, h };
}

/**
 * 쓸 수 있는 귀퉁이(LOC_ORDER 차례): avoid(바깥이 정한 자리 — 문제 화면 오른쪽 위 '⤢ 전체 보기')가 아니고,
 * 귀퉁이를 쓰는 것(blocks — 축척 막대·먼 섬 상자·섬 상자와 그 글 칸, px)과 LOC_GAP 안으로 붙지 않는 곳
 */
export function locCorners(size: Size, w: number, h: number, blocks: { x: number; y: number; w: number; h: number }[], avoid: readonly Corner[] = []): Corner[] {
  return LOC_ORDER.filter((c) => {
    if (avoid.includes(c)) return false;
    const r = locRect(c, size, w, h);
    return !blocks.some((b) => b.w > 0 && b.h > 0 && r.x - LOC_GAP < b.x + b.w && r.x + r.w + LOC_GAP > b.x && r.y - LOC_GAP < b.y + b.h && r.y + r.h + LOC_GAP > b.y);
  });
}

/**
 * 귀퉁이마다 덮는 정도(isles.ts cornerCover — 이번 과 칸 = own 은 OWN_W 배): 과 기본 보기(view — 지도 단위 상자, 지도 칸 size 와 같은 비)에서
 * 귀퉁이에 w×h(위치 지도 + 가장자리 여백) 를 두었을 때. 작은 칸은 12px — 크기를 LOC_COVER_K 배로 줄여 넘기면 같은 땅을 cornerCover 의 6px 칸 대신 12px 칸으로 잰다.
 * 위치 지도는 섬 상자 축척 칸보다 훨씬 커서 그것으로 충분하고, 섬 많은 전남광주 4과에서 6px 는 PC 약 5ms, 12px 는 약 1ms 였다(고른 귀퉁이는 같았다 — 2026-11-15)
 */
export const LOC_COVER_K = 0.5;
export const locCover = (view: Box, size: Size, w: number, h: number, cells: IsleCell[]) =>
  cornerCover(view, size.w * LOC_COVER_K, size.h * LOC_COVER_K, w * LOC_COVER_K, h * LOC_COVER_K, cells);

/** 귀퉁이 고르기: 쓸 수 있는 귀퉁이 가운데 덮는 정도(cover — isles.ts cornerCover, 이번 과 칸은 OWN_W 배)가 가장 적은 곳, 같으면 LOC_ORDER 차례. 없으면 null(숨김) */
export function pickLoc(cover: Record<Corner, number>, free: readonly Corner[]): Corner | null {
  let best: Corner | null = null;
  for (const c of LOC_ORDER) if (free.includes(c) && (best === null || cover[c] < cover[best])) best = c;
  return best;
}
