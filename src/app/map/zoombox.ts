// 확대 상자(2026-11-15 사용자 결정 '확대 상자 덧붙임' — docs/review/00-DECISIONS.md D95 ㉣): 과 시작·과 요약은 지역(단원) 전체 지도라
// (같은 날 사용자 결정 '서울 전체가 나오게'), 넓은 시·군 단원에서 시가지 동만 묶은 과는 이번 과 칸이 몇 px 로 그려져 이름표 지시선이 한 점에 몰린다
// (폰 390 제주시 2과: 칠한 묶음 10×13px, 가장 작은 칸 2px). 그런 과에만 지역 전체 지도는 그대로 두고 그 과 범위(문제 화면과 같은 l.fit)를 확대한
// 작은 지도를 귀퉁이(맞는 귀퉁이가 없으면 지도 칸 아래 줄이나 옆 줄)에 덧붙인다. 본 지도에는 상자가 보이는 범위를 얇은 네모로 긋고,
// 이번 과 이름표는 상자 안으로 옮긴다(본 지도에 같은 이름을 두 번 달지 않는다). 큰 칸이 과 범위를 넓혀 상자 안에서도 작은 동이 몰리면
// 상자 범위를 작은 칸 묶음으로 좁히고(zoomFit — 같은 날 오케스트레이터 결정), 잘린 큰 칸 이름표는 본 지도에 둔다. 그리기·DOM 과 따로(svgmap setZoom 이 쓴다).
// 귀퉁이 고르기는 위치 지도(locator.ts locCorners · locCover · pickLoc — 섬 상자 축척 칸과 같은 isles.ts cornerCover)를 그대로 쓴다
import type { Box } from './project.ts';
import { fitView, viewBox, type Size } from './view.ts';
import { COVER_PX, OWN_W, type Corner, type IsleCell } from './isles.ts';
import { LOC_COVER_K, LOC_GAP, LOC_MARGIN, locCorners, locCover, locRect, pickLoc } from './locator.ts';

/**
 * 판정 문턱(px — 본 지도에 실제로 그려지는 크기, 지도 칸 크기에 달려 폰·PC 가 다르다): 이번 과(본 지도 칸 — 섬 상자 칸은 상자에 따로 크게 그려져 뺀다)
 * 묶음의 긴 변이 ZB_GROUP_PX 미만이거나, 가장 작은 칸의 긴 변이 ZB_CELL_PX 미만이거나, 칸 사이 평균 간격(묶음 긴 변 / √칸 수)이 ZB_SPACE_PX 미만이면 상자를 붙인다.
 * 근거(2026-11-15 탐침 — 과 시작 741쪽, 폰 390×844 · PC 1440×900, 칸 상자로 잼):
 *  · 묶음 40px 미만은 폰 11과(제주시 7과 9×12 · 2과 10×13 · 군산시 2과 21×20 · 춘천시 2과 24×17 · 통영시 1과 25×29 … 여수시 3과 39×29), PC 2과(제주시 7과 23×34 · 2과 28×36).
 *    40 위 가장 작은 것은 경기 일반구 1과 31×41(칸 23px 넘음)·포항시 북구 2과 42×44 — 칸이 커 이름표 점이 갈라져 보인다.
 *    지역 과 가운데 가장 작은 광주특별시 1과(51×35)·대구 1과(45×51)·인천 2과(51×50)는 이 문턱 위다(사용자가 '서울 전체'를 원했다 — 큰 과에는 붙이지 않는다)
 *  · 가장 작은 칸 10px 미만은 폰 14과(제주시 2과 2px · 서귀포시 2과 4px · 제주시 1과 4px · 춘천시 2과 6px · 구미시 1과 7px …), PC 2과(제주시 2과 6px · 서귀포시 2과 8px).
 *    10px 이면 지시선 끝 점(지름 6px)이 칸을 거의 덮는다. 지역 과의 가장 작은 칸은 폰 광주특별시 1과 15px(동구)·부산 1과 20px(중구)다
 *  · 평균 간격 19px 미만(점검 11-15 — 이름표 판 높이 약 20px 보다 점 사이가 좁으면 지시선이 한 덩어리로 모인다): PC 춘천시 2과(묶음 40.8px · 칸 5 → 18.2,
 *    두 문턱 바로 위라 상자가 없었는데 다섯 지시선이 40×25px 노란 덩어리로 몰렸다)·PC 군산시 2과(42.1 · 5 → 18.8). 지역·시·도·일반구 과의 가장 작은 값은
 *    폰 360 광주특별시 1과 20.2 · 폰 390 22.7(경기 일반구 1과 360 은 14.0 이지만 묶음 40 미만으로 이미 붙는다), 상자가 없던 동 단원 과는 폰 360·390 에서 20.4 위다
 *    (포항시 북구 2과 360) — 그래서 이 문턱이 더하는 과는 1440 의 두 과뿐이다
 */
export const ZB_GROUP_PX = 40, ZB_CELL_PX = 10, ZB_SPACE_PX = 19;

/** 상자를 붙일까: boxes = 이번 과 본 지도 칸 상자(지도 단위), u = 본 지도 1px 의 지도 단위 */
export function zoomNeed(boxes: readonly Box[], u: number): boolean {
  if (!boxes.length || !(u > 0)) return false;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, m = Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]);
    m = Math.min(m, Math.max(b[2] - b[0], b[3] - b[1]));
  }
  const g = Math.max(x1 - x0, y1 - y0) / u;
  return g < ZB_GROUP_PX || m / u < ZB_CELL_PX || g / Math.sqrt(boxes.length) < ZB_SPACE_PX;
}

/**
 * 상자 지도 크기(px — 틀 1px 과 아래 칸 '확대 · 축척'은 뺀 그림 크기): 넓은 지도 칸(wide — 폭 COMPACT_PX 이상)이면 ZB_W_WIDE×ZB_H_WIDE, 아니면 ZB_W×ZB_H.
 * 과 범위 비율과 상관없이 늘 가로로 긴 꼴이다: 이름표가 가로로 길어(한글 넉 자 + 판 ≈ 64px) 세로로 긴 과도 양옆에 판을 둘 자리가 남고,
 * 아래 줄에 둘 때 지도 칸을 덜 늘린다(처음 흉내에서 세로로 긴 제주시 2과를 148×196 으로 그리자 폰 지도 칸이 176 → 408px 가 되었다)
 */
export const ZB_W = 196, ZB_H = 148, ZB_W_WIDE = 264, ZB_H_WIDE = 196;
export const zoomSize = (wide: boolean): Size => (wide ? { w: ZB_W_WIDE, h: ZB_H_WIDE } : { w: ZB_W, h: ZB_H });
/**
 * 아래 줄에서 상자 그림을 낮출 수 있는 가장 낮은 높이(px)와 그때의 문턱: 아래 줄까지 합친 높이는 지도 칸 높이 상한(cap — 폰은 주 단추가 첫 화면에 들게, 계획서 3.3) 안이라,
 * 낮은 화면에서 다 큰 상자를 아래 줄에 두면 지역 지도 그림이 늘리기 전의 ZB_KEEP 배보다 낮아진다(390×664 — 주소줄 있는 보통 폰 — 의 제주시 2과: 176 → 78px).
 * 그러면 상자 그림을 ZB_H_MIN 까지 낮춰 지역 지도에 높이를 돌려준다(같은 폰 제주시 2과: 지역 126px · 상자 그림 196×100)
 */
export const ZB_H_MIN = 100, ZB_KEEP = 0.5;
/** 상자 지도 안 여백(px): 과 범위를 이만큼 안쪽에 맞춘다(이름표 범위도 이 안 — svgmap viewRect) */
export const ZB_PAD = 10;
const ZB_PADS = { t: ZB_PAD, r: ZB_PAD, b: ZB_PAD, l: ZB_PAD };

/**
 * 상자 범위 좁히기(2026-11-15 오케스트레이터 결정 — 사용자 결정 '확대 상자 덧붙임'의 뜻은 작은 동이 상자에서 읽히는 것, D95 ㉣ ㉮):
 * 상자는 과 범위(l.fit)를 보이는데, 이번 과에 큰 칸이 있으면 그 칸이 범위를 넓혀 작은 동이 상자 안에서도 한 덩어리로 몰린다
 * (폰 390 제주시 1과 — 연동의 한라산 쪽 긴 몫, 순천시 1과 — 향동·삼산동). 그런 과만 상자 범위를 큰 칸을 뺀 작은 칸 묶음으로 좁힌다(큰 칸은 상자 끝에서 잘린다).
 * 판정은 상자 크기(상자 그림 · 그 범위의 1px 지도 단위)에서 다시 한다:
 *  · 지시선 칸 = 칸 상자가 이름표 판(labelfit labelBox — 상자 글자 크기)보다 좁거나 낮은 칸. 칸 안에 이름이 들 수 없어 판을 밖에 두고 지시선을 긋는다.
 *  · 몰림(zoomCrowd) = 지시선 칸이 ZB_LEAD_MIN(3) 개 이상이고, 그 이름표 점 묶음의 긴 변 / √개수가 ZB_SPACE_PX(19 — 본 지도 판정과 같은 근거: 판 높이 약 20px
 *    보다 점이 촘촘하면 지시선이 한 덩어리로 모인다) 미만. 지시선이 둘뿐이면 서로 다른 쪽으로 나가 가릴 수 있다(폰 390 제주시 2과: 두 점 20.7px — 점검에서 잘 읽힘).
 *  · 큰 칸 = 상자 크기에서 긴 변이 상자 그림 짧은 변 − 여백 둘의 ZB_BIG 배 이상(상자 절반을 넘게 차지해 잘려도 알아본다). 좁힌 범위 = 큰 칸을 뺀 칸 상자 묶음.
 *  몰리면 둘 가운데 하나일 때 좁힌다:
 *  ① 넓힘 — 큰 칸을 뺀 묶음의 긴 변이 이번 과 묶음 긴 변의 ZB_WIDE 배 이하(좁히면 작은 칸이 2배 이상 커진다 — 제주시 1과 0.45 · 순천시 1과 0.40).
 *  ② 덜 줄어도(넓힘 > ZB_WIDE), 낮춘 상자(그림 높이 < ZB_H — 판 높이 20px 를 둘 세로 자리가 80px 뿐이라 같은 간격에서도 더 몰린다)이거나 지시선 칸 이름표 점
 *     사이 가장 짧은 거리(zoomGap)가 ZB_GAP_PX(12 — 지시선 끝 점 지름 6px 의 두 배: 그보다 가까우면 두 점이 맞닿아 어느 점이 어느 판인지 가리기 어렵다) 미만이면,
 *     좁힌 상자에서 다시 재어 몰리지 않을 때만 좁힌다(점검 11-15 — 낮은 폰 여수시 3과: 상자 축척 2km 에 일곱 동이 70×50px 로 몰려 지시선 엇갈림 4, 넓힘 0.66 ·
 *     폰 360 남원시 1과: 금동·동충동·죽항동 점 8.3px, 넓힘 0.68). 점이 떨어져 있고 간격만 판정에 걸린 과(폰 충주시 2과 — 점 14.5px, 엇갈림 0, 점검에서 읽힘)와
 *     좁혀도 몰림이 풀리지 않는 과(강릉시 2과 — 점 13.0px)는 그대로 둔다.
 * 근거(2026-11-15 흉내 — 상자가 붙는 모든 과 × 390×844 · 390×664 · 375×667 · 360×800 · 844×390 · 768×1024 · PC 1440×900, 탐침으로 확인):
 *  ①로 좁히는 과는 390×844 · 360×800 에서 제주시 1과(지시선 6 · 간격 17.8 · 넓힘 0.45)·순천시 1과(5 · 12.0 · 0.40) 둘, 낮은 폰(390×664 · 375×667 — 상자가 낮아 더 몰린다)에서
 *  제주시 1·2·3과·순천시 1과·영주시 1과, PC 는 없다. ②로 더 좁히는 과는 남원시 1과(360×800 · 375×667 · 844×390)·여수시 3과(390×664 · 375×667 · 844×390)뿐이다.
 *  좁힌 상자에서 다시 판정하면 모두 몰리지 않는다(tests/unit/zoombox.test.ts)
 */
export const ZB_LEAD_MIN = 3, ZB_BIG = 0.5, ZB_WIDE = 0.5, ZB_GAP_PX = 12;

/** 상자 판정에 쓰는 이번 과 칸: 칸 상자·이름표 점(지도 단위)과 상자 안 이름표 판 크기(px — 이름표가 없으면 0×0) */
export interface ZoomCell { box: Box; pt: readonly [number, number]; lb: Size }

const longOf = (b: Box) => Math.max(b[2] - b[0], b[3] - b[1]);
const unionOf = (bs: readonly Box[]): Box =>
  bs.reduce((a, c): Box => [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[2]), Math.max(a[3], c[3])]);
/** 지시선 칸(위 머리 주석): u = 상자 1px 의 지도 단위 */
const leadOf = (cells: readonly ZoomCell[], u: number) => cells.filter((c) => (c.box[2] - c.box[0]) / u < c.lb.w || (c.box[3] - c.box[1]) / u < c.lb.h);

/** 상자 안 몰림: u = 상자 1px 의 지도 단위(위 머리 주석) */
export function zoomCrowd(cells: readonly ZoomCell[], u: number): boolean {
  const lead = leadOf(cells, u);
  if (lead.length < ZB_LEAD_MIN || !(u > 0)) return false;
  const xs = lead.map((c) => c.pt[0]), ys = lead.map((c) => c.pt[1]);
  const g = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / u;
  return g / Math.sqrt(lead.length) < ZB_SPACE_PX;
}

/** 지시선 칸 이름표 점 사이 가장 짧은 거리(px — 지시선 칸이 둘 미만이면 Infinity) */
export function zoomGap(cells: readonly ZoomCell[], u: number): number {
  const p = leadOf(cells, u).map((c) => c.pt);
  let d = Infinity;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) d = Math.min(d, Math.hypot(p[i][0] - p[j][0], p[i][1] - p[j][1]) / u);
  return d;
}

/**
 * 좁힐 때 작은 칸 묶음 둘레에 더 두는 여백(px — 상자 여백 ZB_PAD 에 더해 둘레 20px = 이름표 판 높이 한 줄). 낮춘 상자(그림 높이가 폰 상자 ZB_H 보다 낮다 —
 * 낮은 폰의 아래 줄)에서만 둔다: 그림 높이 100 에 칸 묶음을 꽉 맞추면 지시선 판을 칸 밖에 둘 자리가 없다.
 * 흉내(시험 흉내 · 2026-11-15): 0 이면 낮은 폰 제주시 1과(상자 230×100)에서 삼도1동·삼도2동 판이 겹치고(실제 화면 탐침도 같았다 — 겹친 넓이 252px²),
 * 6·8 이면 낮은 폰 제주시 1과가, 20 이상이면 순천시 1과·낮은 폰 제주시 2과가 좁힌 상자에서도 다시 몰린다(지시선 칸 수가 칸 크기에 따라 바뀌어 고르게 늘지 않는다).
 * 10 은 둘 다 없다. 다 큰 상자(196×148)에 두면 범위가 넓어져 잘린 큰 칸의 이름표 점이 상자로 들어와 지시선이 하나 늘고 엇갈렸다
 * (탐침 390×844 제주시 1과: 연동 이름표가 상자로 들어오고 삼도2동 지시선이 삼도1동 점 0.9px 곁을 지남 — 두지 않으면 엇갈림·점 곁 0)
 */
export const ZB_ROOM = 10;

/**
 * 상자 범위: 상자 그림 pic 에 fit 을 맞췄을 때 몰리고(zoomCrowd) 위 ①·② 가운데 하나이면 큰 칸을 뺀 칸 상자 묶음을 맞춘 범위(낮춘 상자는 둘레 ZB_ROOM 을
 * 더 두어 — 상자 여백 ZB_PAD 로 다시 맞추면 같은 보기가 되는 상자), 아니면 fit 그대로(같은 배열)
 */
export function zoomFit(fit: Box, cells: readonly ZoomCell[], pic: Size): Box {
  if (!cells.length) return fit;
  const u = fitView(fit, pic, ZB_PADS).u;
  if (!zoomCrowd(cells, u)) return fit;
  const inner = Math.min(pic.w, pic.h) - 2 * ZB_PAD;
  const small = cells.filter((c) => longOf(c.box) / u < inner * ZB_BIG);
  if (small.length < 2 || small.length === cells.length) return fit;
  const b = unionOf(small.map((c) => c.box));
  const low = pic.h < ZB_H, r = ZB_PAD + (low ? ZB_ROOM : 0), v = fitView(b, pic, { t: r, r, b: r, l: r });
  const [x, y, w, h] = viewBox(v, pic), m = ZB_PAD * v.u;
  const z: Box = [x + m, y + m, x + w - m, y + h - m];
  if (longOf(b) <= longOf(unionOf(cells.map((c) => c.box))) * ZB_WIDE) return z;   // ①
  return (low || zoomGap(cells, u) < ZB_GAP_PX) && !zoomCrowd(cells, v.u) ? z : fit;   // ②
}

/**
 * 상자 아래 칸 높이(px — map.css .cm-inset-note: 위 선 1 + 여백 2·3 + 글 줄 20). svgmap 은 상자 크기를 DOM 에서 재고, 시험(tests/unit/zoombox.test.ts)이
 * 상자 바깥 크기(그림 + 틀 2 + 이 칸)를 어림할 때 쓴다. 'Zoomed in' + 막대도 한 줄에 든다(폰 상자 196px)
 */
export const ZB_NOTE_H = 26;

/**
 * 넓은 상자(zoomSize(true))를 줄(아래·옆)에 둘 수 있는 지도 칸 높이 상한(px): 넓은 상자 바깥(그림 ZB_H_WIDE + 틀 2 + 아래 칸 ZB_NOTE_H)과 위아래 여백(LOC_MARGIN)이
 * 높이 상한 안에 들어야 옆 줄에 둘 수 있다(244). 폭은 넓어도(지도 칸 COMPACT_PX 이상) 상한이 이보다 낮은 칸 — 가로로 돌린 폰(844×390 등, 600~1099 폭이라
 * 지도 칸은 560 폭이지만 상한 60vh = 234) — 에서 넓은 상자가 귀퉁이에 들지 않으면 폰 상자로 다시 고른다(zoomPlace alt). 넓은 상자는 그 칸의 옆 줄에 들지 않아
 * 아래 줄에서 낮춰졌고, 그 줄 때문에 지역 지도 그림이 234 → 68~96px 띠로 줄었다(2026-11-15 점검 — 상자 58과 가운데 43과, 지역 그림 약 1/3. 이 크기에서는
 * 지도 칸 위 끝이 이미 첫 화면 아래라 줄여서 얻는 것도 없다). 폰 상자는 그 칸의 귀퉁이나 옆 줄에 지도 칸을 늘리지 않고 드는 일이 많다.
 * 넓은 상자가 귀퉁이에 드는 과(순천시 4과 등)는 넓은 상자 그대로다 — 처음에 이 칸에서 늘 폰 상자를 쓰자 그런 과의 상자 안 지시선이 엇갈렸다(순천시 4과 0 → 3쌍)
 */
export const ZB_WIDE_CAP = ZB_H_WIDE + 2 + ZB_NOTE_H + 2 * LOC_MARGIN;

/** 지도 칸 위의 네모(px, 지도 칸 왼쪽 위 기준) */
export interface Rect { x: number; y: number; w: number; h: number }

/**
 * 귀퉁이 상자가 덮어도 되는 땅(지역 칸 — 이웃 땅·바다는 세지 않는다)의 몫: 상자(+ 가장자리 여백)를 LOC_COVER_K 배로 줄여 COVER_PX 작은 칸으로 나눴을 때
 * 지역 칸에 닿는 작은 칸의 비율. 이보다 많이 덮는 귀퉁이밖에 없으면 지도 칸 아래·옆에 줄을 두어 놓는다 — 과 시작·요약 지도는 지역 전체를 보이려는 것이라
 * 상자가 지역 모양을 크게 가리면 안 된다(사용자 결정 '서울 전체가 나오게')
 */
export const ZB_LAND_MAX = 0.2;

/** 상자 자리: 귀퉁이(본 지도 위에 얹음) · 아래 줄(지도 칸을 아래로 늘림) · 옆 줄(본 지도를 반대쪽으로 비켜 왼쪽 l / 오른쪽 r 에 세로 줄) */
export type ZoomMode = Corner | 'below' | 'l' | 'r';
export const ZOOM_ROW: readonly ZoomMode[] = ['below', 'l', 'r'];

export interface ZoomPlace {
  mode: ZoomMode;
  /** 상자 왼쪽 위(px, 지도 칸 왼쪽 위 기준) */
  x: number; y: number;
  /** 상자 그림 크기(아래 줄에서 낮출 수 있다 — ZB_H_MIN) */
  pic: Size;
  /** 상자를 두려고 지도 칸을 아래로 늘릴 높이(px — 아래 줄은 상자 높이 + 여백, 옆 줄은 지도 칸이 상자보다 낮을 때만) */
  grow: number;
  /** 본 지도 여백에 더할 몫(px — 아래 줄은 b = grow, 옆 줄은 그쪽 l·r = 상자 폭 + 여백) */
  add: { l: number; r: number; b: number };
}

/** 본 지도를 cell 크기 칸에 여백 add 를 더해 맞췄을 때의 1px 지도 단위(u)와 상자 그림 pic 이 보이는 범위 네모(px, 칸 왼쪽 위 기준) */
export type ZoomLayout = (cell: Size, add: { l?: number; r?: number }, pic: Size) => { u: number; frame: Rect };

const hitsAny = (r: Rect, list: readonly Rect[]) =>
  list.some((b) => b.w > 0 && b.h > 0 && r.x - LOC_GAP < b.x + b.w && r.x + r.w + LOC_GAP > b.x && r.y - LOC_GAP < b.y + b.h && r.y + r.h + LOC_GAP > b.y);

/**
 * 상자 자리. size = 늘리기 전 지도 칸(px), cap = 지도 칸 높이 상한(px — 늘린 줄까지 합쳐 이 안, 모르면 Infinity), pic = 다 큰 상자 그림(zoomSize),
 * chrome = 상자 바깥 − 그림(틀·아래 칸, px), blocks = 귀퉁이를 쓰는 것(먼 섬 상자·축척 막대·섬 상자 줄과 글 칸), view = 본 지도 기본 보기(지도 단위 상자),
 * cells = 본 지도 칸(이번 과 = own), layout = 본 지도를 다시 맞췄을 때의 배율·범위 네모(ZoomLayout).
 * ① 쓸 수 있는 귀퉁이(locCorners — blocks·범위 네모와 LOC_GAP 안으로 붙지 않음) 가운데 덮는 정도(locCover — 이번 과 칸은 OWN_W 배)가 가장 적은 곳(pickLoc 차례 tl·tr·bl·br).
 *    이번 과 칸에 닿지 않고 땅을 ZB_LAND_MAX 넘게 덮지 않으면 그 귀퉁이.
 * ② 아니면 줄에 둔다. 아래 줄(지도 칸을 상자 높이 + 여백만큼 늘림 — 늘린 줄까지 cap 안이라 지역 지도 그림이 그만큼 낮아진다. 늘리기 전의 ZB_KEEP 배보다 낮아지면 상자 그림을
 *    ZB_H_MIN 까지 낮춘다)과 옆 줄(왼쪽·오른쪽 — 본 지도를 반대쪽으로 비키고, 지도 칸이 상자보다 낮으면 그만큼만 늘림) 가운데 지역 지도가 가장 크게 그려지는 것(u 가 작은 것).
 *    아래 줄이 2% 안으로 비기면 아래 줄. 보통 폰(390×844)·PC 에서는 아래 줄이고, 주소줄이 있는 낮은 폰(390×664)에서 세로로 긴 시·군(춘천시 등)은 옆 줄이 된다.
 *    아래 줄 가로 자리는 범위 네모 가운데가 지도 칸 왼쪽 절반이면 왼쪽, 아니면 오른쪽 끝(LOC_MARGIN). 옆 줄은 위 끝, 막히면 아래 끝.
 * keep = 이미 줄에 두었고 지도 칸 높이만 바뀌었을 때(svgmap syncZoom): 고르지 않고 그 줄·그 그림 크기로 자리만 다시 잰다(오가지 않게).
 * alt = pic 이 귀퉁이에 들지 않으면 대신 쓸 작은 상자 그림(넓은 상자를 줄에 둘 수 없는 낮은 칸 — ZB_WIDE_CAP): 그때는 alt 로 처음부터(귀퉁이 → 줄) 다시 고른다
 */
export function zoomPlace(o: {
  size: Size; cap: number; pic: Size; chrome: Size; blocks: Rect[]; view: Box; cells: IsleCell[]; layout: ZoomLayout;
  keep?: { mode: ZoomMode; pic: Size } | null; alt?: Size | null;
}): ZoomPlace {
  if (o.alt && !o.keep) {
    const a = zoomPlace({ ...o, alt: null });
    return ZOOM_ROW.includes(a.mode) ? zoomPlace({ ...o, pic: o.alt, alt: null }) : a;
  }
  const { size, cap, chrome } = o, M = LOC_MARGIN;
  const outer = (p: Size): Size => ({ w: p.w + chrome.w, h: p.h + chrome.h });
  /**
   * 아래 줄 가로 자리: 줄(y..y+h)로 들어오는 것(낮아진 지도 칸 아래로 넘친 섬 상자 세로 줄 등 blocks)을 LOC_GAP 띄워 피한 빈 구간 가운데 가장 넓은 곳에
   * 바깥 폭 wMin~wMax 로 — 범위 네모가 왼쪽 절반이면 그 구간 왼쪽 끝, 아니면 오른쪽 끝. 드는 구간이 없으면 피하지 않고 그쪽 끝(LOC_MARGIN)에 바깥 폭 wMax 로
   * (지도 칸 폭 안). 피할 것은 늘리기 전 칸의 자리라, 늘린 뒤 섬 상자가 낮아지면 줄이 빈다 — 이때 wMin 으로 두면 keep 이 그 좁은 폭을 그대로 써서
   * 가로 폰 여수시 3과 낮춘 상자가 196×100 에 일곱 이름표를 넣어 넷이 겹쳤다(2026-11-15 흉내 — 넓은 폭이면 0)
   */
  const rowAt = (y: number, h: number, wMin: number, wMax: number, left: boolean): { x: number; w: number } => {
    const cuts = o.blocks.filter((b) => b.w > 0 && b.h > 0 && b.y - LOC_GAP < y + h && b.y + b.h + LOC_GAP > y).map((b): [number, number] => [b.x - LOC_GAP, b.x + b.w + LOC_GAP]).sort((a, b) => a[0] - b[0]);
    const spans: [number, number][] = [];
    let x0 = M;
    for (const [a, b] of cuts) { if (a > x0) spans.push([x0, a]); x0 = Math.max(x0, b); }
    if (size.w - M > x0) spans.push([x0, size.w - M]);
    const fit = spans.filter(([a, b]) => b - a >= wMin - 0.5);
    if (!fit.length) { const w = Math.min(wMax, size.w - 2 * M); return { x: left ? M : size.w - M - w, w }; }
    const [a, b] = fit.reduce((p, q) => (q[1] - q[0] > p[1] - p[0] + 0.5 ? q : p));
    const w = Math.min(wMax, b - a);
    return { x: left ? a : b - w, w };
  };
  /** 아래 줄: pic = 상자 그림(가장 넓게), wMin = 빈 구간이 좁을 때 줄일 수 있는 그림 폭 */
  const below = (pic: Size, img: number, wMin = pic.w): ZoomPlace & { u: number } => {
    const bh = pic.h + chrome.h, grow = bh + M;
    const lay = o.layout({ w: size.w, h: Math.max(1, img) }, {}, pic);
    const at = rowAt(img, bh, wMin + chrome.w, pic.w + chrome.w, lay.frame.x + lay.frame.w / 2 < size.w / 2);
    // 지역 지도 그림이 여백 둘(위·아래)도 안 남으면 고르지 않는다(옆 줄이 있으면 그쪽)
    const u = img > 40 ? lay.u : Infinity;
    return { mode: 'below', x: at.x, y: img, pic: { w: at.w - chrome.w, h: pic.h }, grow, add: { l: 0, r: 0, b: grow }, u };
  };
  const side = (s: 'l' | 'r', pic: Size): (ZoomPlace & { u: number }) | null => {
    const b = outer(pic), H = Math.max(size.h, b.h + 2 * M);
    if (H > cap + 0.5) return null;
    const col = b.w + M, add = s === 'l' ? { l: col } : { r: col };
    const lay = o.layout({ w: size.w, h: H }, add, pic);
    const x = s === 'l' ? M : size.w - M - b.w;
    for (const y of [M, H - M - b.h]) {
      const r = { x, y, w: b.w, h: b.h };
      if (!hitsAny(r, o.blocks) && !hitsAny(r, [lay.frame])) return { mode: s, x, y, pic, grow: H - size.h, add: { l: s === 'l' ? col : 0, r: s === 'r' ? col : 0, b: 0 }, u: lay.u };
    }
    return null;
  };
  const strip = ({ u: _u, ...p }: ZoomPlace & { u: number }): ZoomPlace => p;
  if (o.keep) {
    const k = o.keep;
    if (k.mode === 'l' || k.mode === 'r') { const s = side(k.mode, k.pic); if (s) return strip(s); }
    return strip(below(k.pic, size.h));
  }
  // ① 귀퉁이
  const full = outer(o.pic);
  const frame = o.layout(size, {}, o.pic).frame;
  const free = locCorners(size, full.w, full.h, [...o.blocks, frame]);
  if (free.length) {
    const cv = locCover(o.view, size, full.w + M, full.h + M, o.cells);
    const at = pickLoc(cv, free)!;
    const n = Math.max(1, Math.round(((full.w + M) * LOC_COVER_K) / COVER_PX)) * Math.max(1, Math.round(((full.h + M) * LOC_COVER_K) / COVER_PX));
    if (cv[at] < OWN_W && cv[at] <= ZB_LAND_MAX * n) {
      const r = locRect(at, size, full.w, full.h);
      return { mode: at, x: r.x, y: r.y, pic: o.pic, grow: 0, add: { l: 0, r: 0, b: 0 } };
    }
  }
  // ② 아래 줄 · 옆 줄
  let img = Math.min(size.h, cap - (full.h + M)), pic = o.pic;
  if (img < size.h * ZB_KEEP) {
    // 낮춘 상자는 줄 폭을 더 쓴다(빈 구간 안에서 지도 칸 폭 − 여백, 다 큰 폭의 2배까지): 이름표는 가로로 길어 낮은 상자에서는 옆으로 비켜 놓을 자리가 있어야 한다
    // (흉내: 낮은 폰 여수시 3과 일곱 이름표가 196×100 에서는 넷이 겹쳤다)
    img = Math.min(size.h, cap - (ZB_H_MIN + chrome.h + M));
    pic = { w: Math.max(o.pic.w, Math.min(2 * o.pic.w, size.w - 2 * M - chrome.w)), h: Math.max(ZB_H_MIN, Math.min(o.pic.h, cap - img - chrome.h - M)) };
  }
  let best = below(pic, img, o.pic.w);
  const order: ('l' | 'r')[] = frame.x + frame.w / 2 < size.w / 2 ? ['l', 'r'] : ['r', 'l'];
  for (const s of order) {
    const c = side(s, o.pic);
    if (c && c.u < best.u * 0.98) { best = c; break; }
  }
  return strip(best);
}
