// 이름표 자리와 축척 막대 계산(그리기와 따로, DOM 없이). 합본 디자인 규칙(docs/REDESIGN_PLAN 3.1):
// 이름표는 14px 이상·후광 없이 칸 색 위에 바로 놓으므로, 글자 상자가 칸 안에 온전히 드는 자리를 찾는다.
// 안 들어가면 칸 밖 빈 바탕에 두고 지시선을 긋고, 그것도 안 되면 뺀다(꼭 보여야 하는 이름은 흰 판에 얹어 칸 위쪽에).
// 칸 안 자리는 배율에만 달려 있고(placeInside), 칸 밖 자리는 보이는 범위에도 달려 있다(placeOutside) — 지도가 둘을 따로 기억해 둔다
import type { Box } from './project.ts';
import { boxHits, boxInside, inside, segHitsBox } from './poly.ts';

/** 글자 폭 어림(px). 한글·전각은 글자 크기만큼, 라틴 글자는 굵기 600 기준으로 조금 넉넉하게 */
export function textWidth(text: string, px: number): number {
  let em = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x1100) em += 1;
    else if (ch === ' ') em += 0.28;
    else if ("ijlI.,'·:;|!".includes(ch)) em += 0.32;
    else if ('ftr-()'.includes(ch)) em += 0.4;
    else if (ch === 'm' || ch === 'w' || ch === 'M' || ch === 'W') em += 0.88;
    else if (ch >= 'A' && ch <= 'Z') em += 0.68;
    else em += 0.6;
  }
  return em * px;
}

/** 이름표 글자 상자(px): 글자 폭 + 좌우 여유 8, 높이 = 글자 크기 + 6 (14px 글자면 세 글자에 50×20) */
export const labelBox = (text: string, px: number): { w: number; h: number } => {
  const ls = text.split('\n');   // 두 줄 이름표(영어 'Yeongyang-' / 'gun'): 폭은 긴 줄, 높이는 줄 수만큼
  return { w: Math.ceil(Math.max(...ls.map((l) => textWidth(l, px)))) + 8, h: px + 6 + (ls.length - 1) * Math.ceil(px * 1.4) };
};

/**
 * 칸 안 자리를 찾을 때 먼저 써 보는 넉넉한 상자: 글자 상자보다 좌우 3px·위아래 2px 씩 크다(글자와 칸 경계 사이가 좌우 7px·위아래 5px).
 * 굵은 테두리는 칸 안쪽으로 1.2px 들어오고, 좁은 목에 끼인 이름은 양옆 선에 붙어 보인다 — 넓은 곳이 있으면 그리로 옮긴다.
 * 넉넉한 자리가 없는 칸만 글자 상자 그대로 잰다(그래서 이름이 들어가는 칸의 수는 줄지 않는다)
 */
const ROOM_W = 6, ROOM_H = 4;
/** 이름표끼리 띄우는 간격(px): 이보다 가까우면 한 덩어리로 읽힌다 */
const APART_PX = 6;
/** 훑는 간격 · 칸 밖 이름표를 찾는 가장 먼 거리(지시선이 칸 여럿을 가로지르지 않게) · 흰 판을 띄우는 높이 · 지시선과 글자 사이(모두 화면 px) */
const STEP_PX = 3, REACH_PX = 60, LIFT_PX = 22, GAP_PX = 4;
/** 흰 판 자리를 겹침 넓이로 고를 때 다른 이름표와 겹친 넓이의 무게(점·지시선 조각은 1) */
const NAME_W = 8;
/** 지시선이 막힌 판이 있을 때 차례를 바꿔 다시 놓아 보는 것은 칸 밖 이름표가 이만큼 이하일 때만(한 과는 3~8곳) */
const RETRY_MAX = 8;

/** 격자로 훑을 점 수의 상한(넘으면 간격을 넓힌다) */
const MAX_TRIES = 3000;

const overlap = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
const boxAt = (x: number, y: number, w: number, h: number): Box => [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
const grow = (b: Box, m: number): Box => [b[0] - m, b[1] - m, b[2] + m, b[3] + m];

/**
 * 글자 상자(w×h, 지도 단위)가 칸 안에 온전히 드는 자리 가운데 at(이름표 점)에 가장 가까운 곳. 없으면 null.
 * box = 칸 범위, step = 훑는 간격(지도 단위, 화면 3px 쯤).
 * 이름표 점에서 상자 대각선(reach)보다 멀리는 옮기지 않는다 — 멀리 가면 다른 덩어리(딴 섬)에 이름이 붙는다.
 * avoid = 상자가 겹치면 안 되는 자리(다른 이름표 둘레)
 */
export function fitBox(
  rings: Float64Array[], box: Box, at: readonly [number, number], w: number, h: number, step: number, reach = Math.hypot(w, h), avoid: Box[] = [],
): [number, number] | null {
  const free = (x: number, y: number) => { if (!avoid.length) return true; const b = boxAt(x, y, w, h); return !avoid.some((k) => overlap(k, b)); };
  if (free(at[0], at[1]) && boxInside(rings, at[0], at[1], w, h)) return [at[0], at[1]];
  // 가운데가 올 수 있는 범위: 칸 범위에서 상자 반만큼 안쪽, 이름표 점에서 reach 안
  const x0 = Math.max(box[0] + w / 2, at[0] - reach), x1 = Math.min(box[2] - w / 2, at[0] + reach);
  const y0 = Math.max(box[1] + h / 2, at[1] - reach), y1 = Math.min(box[3] - h / 2, at[1] + reach);
  if (x1 < x0 || y1 < y0) return null;
  let s = Math.max(step, 1e-9);
  while (((x1 - x0) / s + 1) * ((y1 - y0) / s + 1) > MAX_TRIES) s *= 1.5;
  // at 을 지나는 격자로(칸 모양이 대칭이면 자리도 대칭이게)
  const xs = at[0] - Math.floor((at[0] - x0) / s) * s, ys = at[1] - Math.floor((at[1] - y0) / s) * s;
  let best: [number, number] | null = null, bd = reach * reach;
  for (let x = xs; x <= x1 + 1e-9; x += s) {
    for (let y = ys; y <= y1 + 1e-9; y += s) {
      const d = (x - at[0]) ** 2 + (y - at[1]) ** 2;
      if (d > bd || (best && d === bd) || !free(x, y) || !boxInside(rings, x, y, w, h)) continue;
      bd = d;
      best = [x, y];
    }
  }
  return best;
}

/**
 * 칸 안 자리(넉넉한 곳 먼저): 글자 상자보다 room 만큼 큰 상자가 드는 자리 → 글자 상자 그대로 드는 자리. 없으면 null.
 * r = 내접원 반지름(상자가 내접원에 통째로 들면 이름표 점 그대로 — 큰 칸은 훑지 않는다). apart = 떨어져 있어야 할 다른 이름표 둘레
 */
export function fitRoomy(
  rings: Float64Array[], box: Box, at: readonly [number, number], r: number, w: number, h: number, step: number, roomW: number, roomH: number, apart: Box[] = [],
): [number, number] | null {
  for (const [bw, bh] of [[w + roomW, h + roomH], [w, h]]) {
    if (2 * r >= Math.hypot(bw, bh) && !(apart.length && apart.some((k) => overlap(k, boxAt(at[0], at[1], bw, bh))))) return [at[0], at[1]];
    const spot = fitBox(rings, box, at, bw, bh, step, Math.hypot(bw, bh), apart);
    if (spot) return spot;
  }
  return null;
}

/** 이름표가 피해야 할 것: 칸·물(한강) */
export interface Obstacle { rings: Float64Array[]; box: Box }

/** 칸 밖 자리를 고를 때 더 보는 것(없으면 상자만 본다) */
export interface SpotOpt {
  /** 이 상자들과는 gap(지도 단위)만큼 띄운다: 이미 놓은 이름표·맥락 이름 */
  apart?: { boxes: Box[]; gap: number };
  /**
   * 지시선(at → 이름표 상자의 가까운 변)이 닿으면 안 되는 상자: 다른 이름표·맥락 이름·남의 지시선과 점.
   * 주면 지시선이 자기 칸 아닌 칸(이나 물)을 가로지르는 자리도 건너뛴다 — 어느 칸의 이름인지 헷갈리지 않게
   */
  line?: Box[];
  /** 지시선과 글자 사이(지도 단위) */
  lineGap?: number;
  /** 화면에 붙어 있는 것의 자리(섬 상자·축척 막대): 지도를 옮기면 달라진다 */
  screen?: Box[];
  /** 보이는 범위(within)나 화면에 붙은 것(screen) 때문에 건너뛴 자리가 있었으면 clipped 를 켠다(지도를 옮기면 결과가 달라질 수 있다는 표시) */
  note?: { clipped: boolean };
}

/** 점 p 와 선분 a–b 사이 거리(지도 단위) */
const segDist = (p: readonly [number, number], ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / l2)) : 0;
  return Math.hypot(ax + t * dx - p[0], ay + t * dy - p[1]);
};

/**
 * 글자만 있는 이름(판 없는 칸 밖 이름표·이웃 땅 이름)의 지시선 끝: 점에서 이름 가운데로 긋는 선이 글자(상자를 cut 만큼 줄인 것)와 만나는 곳.
 * 선이 글자 가운데를 향하므로 어느 쪽에서 오든 글자에 닿는다(2026-11-17 사용자 '점과 이어진 선이 글자와 정확히 이어지게 — 전국 전부 동일하게').
 * 전에는 상자에서 점에 가장 가까운 곳(모서리 쪽)에서 띄워 끝나, 옆으로 비낀 이름표('부천시'·'시흥시')는 선이 글자 위로 어긋나 보였다
 */
export const leadToCenter = (b: Box, at: readonly [number, number], cut = 0): [number, number] => {
  const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
  const hw = Math.max(0, (b[2] - b[0]) / 2 - cut), hh = Math.max(0, (b[3] - b[1]) / 2 - cut);
  const dx = at[0] - cx, dy = at[1] - cy;
  if (Math.abs(dx) <= hw && Math.abs(dy) <= hh) return [at[0], at[1]];
  const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  return [cx + dx * t, cy + dy * t];
};

/**
 * 지시선이 닿는 이름표 쪽 끝점.
 *  - g > 0(판 없는 이름표): 글자 가운데 쪽으로, 상자 여유를 뺀 글자 바로 옆(2px)까지(leadToCenter)
 *  - g = 0(흰 판): 판에서 칸 안 점에 가장 가까운 곳 — 선이 판 테두리에 닿으므로 어디에 닿아도 이어져 보이고, 선이 가장 짧아 다른 지시선과 덜 엇갈린다.
 *    2026-11-17 에 판도 가운데 쪽으로 바꿨더니 이름표 자리는 그대로인데 선이 기울어, 과 시작·요약 화면에서 지시선끼리 엇갈린 쪽이 폰 한국어 38 → 46 · 가로 폰 80 → 106 으로 늘어
 *    판은 되돌렸다(배포 전 측정 — 마포구 3과 '도화동' 선이 '염리동' 선을 가로지르고 그 점 2.2px 곁을 지났다)
 */
export const leaderEnd = (b: Box, at: readonly [number, number], g: number): [number, number] =>
  (g ? leadToCenter(b, at, (2 * g) / GAP_PX) : [Math.min(b[2], Math.max(b[0], at[0])), Math.min(b[3], Math.max(b[1], at[1]))]);

/**
 * 칸 밖 빈 바탕의 자리: at 에서 여러 방향으로 조금씩 나가며, 상자가 어떤 칸·물·이미 놓은 이름표와도 닿지 않고 within 안에 드는 첫 곳.
 * 같은 거리면 away(지역 가운데에서 바깥으로) 쪽을 먼저 본다. reach 안에 없으면 null
 */
export function outsideSpot(
  at: readonly [number, number], w: number, h: number, obstacles: Obstacle[], taken: Box[], within: Box | null,
  step: number, reach: number, away: readonly [number, number] = [0, 1], o: SpotOpt = {},
): [number, number] | null {
  const base = Math.atan2(away[1], away[0]);
  // 바깥쪽에서 시작해 좌우로 번갈아 22.5도씩
  const dirs: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const a = base + (i % 2 ? -1 : 1) * Math.ceil(i / 2) * (Math.PI / 8);
    dirs.push([Math.cos(a), Math.sin(a)]);
  }
  const near = obstacles.filter((ob) => overlap(ob.box, [at[0] - reach - w, at[1] - reach - h, at[0] + reach + w, at[1] + reach + h]));
  // 지시선이 지나도 되는 칸: 이름표 점을 품은 칸(자기 칸)
  const own = o.line ? near.filter((ob) => inside(ob.rings, at[0], at[1])) : [];
  const others = o.line ? near.filter((ob) => !own.includes(ob)) : [];
  const lineClear = (b: Box) => {
    if (!o.line) return true;
    const [ex, ey] = leaderEnd(b, at, o.lineGap ?? 0);
    if (o.line.some((k) => segHitsBox(at[0], at[1], ex, ey, k[0], k[1], k[2], k[3]))) return false;
    // 지시선 위를 화면 6px 쯤마다 짚어, 자기 칸을 벗어난 뒤 다른 칸·물 위를 지나는지 본다
    const n = Math.max(3, Math.ceil(Math.hypot(ex - at[0], ey - at[1]) / (2 * step)));
    for (let i = 1; i <= n; i++) {
      const x = at[0] + ((ex - at[0]) * i) / n, y = at[1] + ((ey - at[1]) * i) / n;
      if (others.some((ob) => x >= ob.box[0] && x <= ob.box[2] && y >= ob.box[1] && y <= ob.box[3] && inside(ob.rings, x, y))) return false;
    }
    return true;
  };
  for (let t = step; t <= reach + 1e-9; t += step) {
    for (const [dx, dy] of dirs) {
      // 상자의 가까운 변이 t 만큼 떨어지게: 가운데는 상자 반만큼 더 나간다
      const x = at[0] + dx * (t + w / 2 * Math.abs(dx)), y = at[1] + dy * (t + h / 2 * Math.abs(dy));
      const b = boxAt(x, y, w, h);
      if (within && (b[0] < within[0] || b[1] < within[1] || b[2] > within[2] || b[3] > within[3])) { if (o.note) o.note.clipped = true; continue; }
      if (taken.some((k) => overlap(k, b))) continue;
      if (o.apart && o.apart.boxes.length) { const wide = grow(b, o.apart.gap); if (o.apart.boxes.some((k) => overlap(k, wide))) continue; }
      if (near.some((ob) => overlap(ob.box, b) && boxHits(ob.rings, x, y, w, h))) continue;
      if (o.screen?.some((k) => overlap(k, b))) { if (o.note) o.note.clipped = true; continue; }
      if (!lineClear(b)) continue;
      return [x, y];
    }
  }
  return null;
}

/**
 * 이름표 놓는 방식.
 * must = 꼭 보인다(과 시작·과 요약·만나기·시험 결과·시·도 지도·이름 가리기, 이름이 6곳 이하인 홈 지도): 칸 안 → 칸 밖 빈 바탕 + 지시선 → 칸 옆(위·아래·오른쪽·왼쪽)에 흰 판 + 지시선(네 쪽이 다 막히면 점 둘레의 빈 자리).
 * fit = 자리가 있을 때만(이름이 많은 홈 지도·둘러보기·고르기): 칸 안 → 칸 밖 빈 바탕 + 지시선 → 뺀다.
 * inside = 칸 안에 드는 것만(옛 labelsInside 와 같은 뜻)
 */
export type LabelMode = 'must' | 'fit' | 'inside';

export interface LabelCell { rings: Float64Array[]; box: Box; label: readonly [number, number]; r: number }
export interface LabelAsk { id: string; w: number; h: number }   // 글자 상자(px)
export interface Placed {
  id: string;
  /** 글자 가운데(지도 단위) */
  x: number; y: number;
  /** 칸 밖에 둔 이름표: 지시선이 닿는 이름표 쪽 끝점. plate = 흰 판에 얹는다(칸 위에 걸쳐서) */
  out?: { ax: number; ay: number; plate: boolean };
}

export interface PlaceOpt {
  mode: LabelMode;
  /** 화면 1px 당 지도 단위 */
  u: number;
  obstacles: Obstacle[];
  /** 이름표가 들어 있어야 할 범위(보이는 지도). 칸 안 이름표에는 적용하지 않는다 */
  within: Box | null;
  /** 지역 가운데(칸 밖 자리를 바깥쪽부터 찾는다) */
  center: readonly [number, number];
  /** 칸 밖 이름표가 피할 자리(지도 단위 상자): 이미 그려 둔 맥락 이름 등. 지시선도 이 위를 지나지 않는다 */
  avoid?: Box[];
  /** 화면에 붙어 있는 것의 자리(지도 단위 상자): 섬 상자·축척 막대 */
  screen?: Box[];
  /**
   * 흰 판을 되도록 제 칸 위에 둔다(전국 시·도 지도 — E10 검수). 휴대폰 전국 지도에서 '충북' 판이 경기·충남 경계 위에, '충남' 판이 전북 바로 위에 놓여
   * 이름과 칸을 잘못 짝짓기 쉬웠다. 켜면 ① 칸 밖에 둘 이름표를 큰 칸(내접원)부터 놓고(작은 칸 판이 큰 칸의 자리를 먼저 차지하지 않게)
   * ② 남의 칸과 전혀 닿지 않는 네 쪽이 없으면, 판 가운데가 제 칸 안이고 다른 이름표·점·지시선과 겹치지 않는 가장 가까운 자리를 먼저 고른다.
   * 그런 자리가 없는 작은 칸(세종·대전처럼 칸이 판보다 작은 곳)만 전처럼 칸 옆 판 + 지시선이다
   */
  plateHome?: boolean;
  /**
   * 지시선이 남의 지시선 끝 점(지름 6px) 곁을 지나지 않게 할 거리(화면 px — 점 가운데에서 지시선까지). 확대 상자 안 작은 지도(svgmap — zoombox.ts ZB_DOT_PX)만 쓴다.
   * 켜면 흰 판 단계가 다른 이름표·점·지시선과 남의 점 둘레를 모두 피하는 자리(네 쪽 → 점 둘레 REACH_PX)를 먼저 본 뒤 전과 같은 차례로 간다.
   * (칸 밖 빈 바탕 자리 outsideSpot 의 지시선은 남의 점 상자(8px 네모 — dots)만 피한다. 이 둘레까지 보는 조건을 넣었었는데 11-16 점검 2 흉내 2,684가지에서
   *  결과를 한 번도 바꾸지 않아 뺐다.) 전에는 판 단계 첫 자리(네 쪽)가 다른 이름표만 피해, 점이 몇 px 씩 붙은 상자에서
   * 지시선이 남의 점 바로 곁을 지났다(2026-11-15 확대 상자 점검 — 폰 제주시 3과 '화북동' 지시선이 '건입동' 점 4.7px 곁, 여수시 3과 '동문동' 지시선이 '한려동' 점 1.4px 곁 —
   * 어느 점이 어느 판인지 헷갈린다). 넓은 지도(본 지도·문제 화면)는 점이 드물어 그대로 둔다(끄면 전과 같다)
   */
  dotPx?: number;
  /** plateHome 판이 덮어도 되는 자기 칸 섬 수(기본 ISLE_OK). 시험이 Infinity 로 섬 규칙을 끈 자리(바꾸기 전과 같다)와 견준다 */
  isleOk?: number;
  /**
   * fit 에서도 흰 판을 쓰되 깨끗한 자리만: 남의 칸(이름표를 다는 칸)을 덮지 않고, 지시선이 다른 이름표·점·지시선·화면에 붙은 것을 지나지 않는 자리
   * (칸 옆 네 쪽 → 점 둘레 REACH_PX). 그런 자리가 없으면 fit 처럼 뺀다. 영어 동·일반구 단원 둘러보기(ui/explore.ts) — 2026-11-16 점검: 섬 단원을 한 장 지도로 바꾸자
   * 영어 이름(한국어의 2배쯤 길다)이 칸에도 칸 밖 빈 바탕에도 들지 않아 낮은 폰 신안 둘러보기에 13곳 가운데 1곳만 이름이 보였다(한국어 12곳)
   */
  cleanPlates?: boolean;
}

/** 칸 안에 놓은 이름표와, 칸에 안 들어가 남은 것 */
export interface InsideResult { placed: Placed[]; pending: LabelAsk[] }

/**
 * 칸 안 자리: 넉넉한 곳 → 글자 상자가 겨우 드는 곳. 먼저 놓은 이름표와 너무 가까우면(APART_PX) 다른 자리를 찾고, 없으면 가까운 채로 둔다
 * (칸 안에 든 상자끼리는 겹치지 않는다). 결과는 배율(u)과 목록에만 달려 있다 — 지도를 옮겨도 그대로 쓸 수 있다
 */
export function placeInside(cellOf: (id: string) => LabelCell | undefined, asks: LabelAsk[], u: number): InsideResult {
  const placed: Placed[] = [], pending: LabelAsk[] = [];
  const around: Box[] = [];   // 이미 놓은 이름표 상자를 간격만큼 키운 것
  for (const a of asks) {
    const c = cellOf(a.id);
    if (!c) continue;
    const w = a.w * u, h = a.h * u;
    const spot = (apart: Box[]) => fitRoomy(c.rings, c.box, c.label, c.r, w, h, STEP_PX * u, ROOM_W * u, ROOM_H * u, apart);
    const at = (around.length ? spot(around) : null) ?? spot([]);
    if (!at) { pending.push(a); continue; }
    placed.push({ id: a.id, x: at[0], y: at[1] });
    around.push(grow(boxAt(at[0], at[1], w, h), APART_PX * u));
  }
  return { placed, pending };
}

/**
 * 칸 안에 못 넣은 이름표(ins.pending)의 칸 밖 자리. mode 'inside' 면 아무것도 놓지 않는다.
 * clipped = 보이는 범위나 화면에 붙은 것 때문에 건너뛴 자리가 있었다(지도를 옮기면 다시 재야 한다)
 */
export function placeOutside(cellOf: (id: string) => LabelCell | undefined, asks: LabelAsk[], ins: InsideResult, opt: PlaceOpt): { placed: Placed[]; clipped: boolean } {
  const note = { clipped: false };
  if (opt.mode === 'inside' || !ins.pending.length) return { placed: [], clipped: false };
  const todo = ins.pending.map((a) => ({ a, c: cellOf(a.id) })).filter((x): x is Todo => !!x.c);
  if (opt.plateHome) todo.sort((p, q) => p.c.r - q.c.r);   // 작은 칸부터(같으면 원래 차례 — sort 는 안정)
  const first = outsideRun(cellOf, asks, ins, opt, todo, note);
  if (!first.stuck.length) return { placed: first.out, clipped: note.clipped };
  // 지시선을 보지 않고 놓은 판(stuck)이 있으면 그 칸들을 맨 앞으로 옮겨 다시 놓아 보고(막힌 칸을 쌓아 가며 3번까지), 막힌 판이 가장 적은 것을 쓴다(같으면 먼저 것).
  // 먼저 놓인 남의 판이 점 바로 옆을 막으면 어느 쪽으로 나가도 지시선이 그 판 밑을 지난다(2026-11-15 점검 흉내: 폰 마산합포구 1과 '자산동' 판이 '반월중앙동' 점 4px 아래 —
  // 반월중앙동을 앞으로 옮기면 산호동이 막히고, 둘 다 앞으로 옮기면 풀린다)
  // 칸 밖 이름표가 RETRY_MAX 곳 넘게 몰린 지도(시험 결과 쪽의 많이 틀린 곳)는 다시 놓지 않는다 — 한 번 놓는 데도 오래 걸리고(흉내: 군산시 27곳 폰 42ms → 다시 놓기 3번 152ms) 다시 놓아도 다른 판이 막힌다
  let best = first, cur = first, front: string[] = [];
  for (let k = 0; k < 3 && best.stuck.length && todo.length <= RETRY_MAX; k++) {
    front = [...front, ...cur.stuck.filter((id) => !front.includes(id))];
    cur = outsideRun(cellOf, asks, ins, opt, [...front.map((id) => todo.find((t) => t.a.id === id)!), ...todo.filter((t) => !front.includes(t.a.id))], note);
    if (cur.stuck.length < best.stuck.length) best = cur;
  }
  // 결과 차례는 처음 차례대로(그리는 차례가 다시 놓기에 따라 바뀌지 않게)
  const at = new Map(todo.map((t, i) => [t.a.id, i]));
  return { placed: best.out.sort((p, q) => at.get(p.id)! - at.get(q.id)!), clipped: note.clipped };
}

type Todo = { a: LabelAsk; c: LabelCell };

/**
 * 칸의 떨어진 조각(섬 — 이름표 점을 품은 고리 밖에 있는 고리. 그 고리 안의 구멍·호수는 뺀다). 칸마다 한 번 잰다.
 * 2026-11-16: 폰 전국 시·도 지도에서 '광주특별시' 흰 판이 점 아래(남해안 다도해) 섬들을 덮었다 — 판 자리를 고를 때 자기 칸 섬도 피한다(plateHome)
 */
const isleCache = new WeakMap<LabelCell, Float64Array[]>();
const islesOf = (c: LabelCell): Float64Array[] => {
  let v = isleCache.get(c);
  if (!v) {
    const home = c.rings.filter((r) => inside([r], c.label[0], c.label[1]));
    v = home.length ? c.rings.filter((r) => !home.includes(r) && !inside(home, r[0], r[1])) : [];
    isleCache.set(c, v);
  }
  return v;
};
/** 판이 이만큼의 섬까지 덮는 것은 그대로 둔다(경기 판이 서해 섬 2~3개에 걸침 — 다른 시·도 판 자리를 바꾸지 않으려고) */
const ISLE_OK = 4;
const ringBoxes = new WeakMap<Float64Array, Box>();
const ringBox = (r: Float64Array): Box => {
  let b = ringBoxes.get(r);
  if (!b) {
    b = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < r.length; i += 2) { b[0] = Math.min(b[0], r[i]); b[1] = Math.min(b[1], r[i + 1]); b[2] = Math.max(b[2], r[i]); b[3] = Math.max(b[3], r[i + 1]); }
    ringBoxes.set(r, b);
  }
  return b;
};

/** placeOutside 한 차례: todo 차례로 놓는다. stuck = 지시선을 보지 않는 단계까지 가서 놓은 판(지시선이 다른 판 밑을 지날 수 있다) */
function outsideRun(cellOf: (id: string) => LabelCell | undefined, asks: LabelAsk[], ins: InsideResult, opt: PlaceOpt, todo: Todo[], note: { clipped: boolean }): { out: Placed[]; stuck: string[] } {
  const { u } = opt;
  const out: Placed[] = [], stuck: string[] = [];
  const ask = new Map(asks.map((a) => [a.id, a]));
  // 이름표 상자(칸 안 것 + 놓아 가는 칸 밖 것)와 맥락 이름: 간격을 두고 피한다
  const names: Box[] = [...(opt.avoid ?? [])];
  for (const p of ins.placed) { const a = ask.get(p.id); if (a) names.push(boxAt(p.x, p.y, a.w * u, a.h * u)); }
  // 이름표를 다는 모든 칸(흰 판이 덮지 않게 먼저 피한다)
  const targets = asks.map((a) => ({ id: a.id, c: cellOf(a.id) })).filter((x): x is { id: string; c: LabelCell } => !!x.c);
  // 칸 밖 이름표는 칸 안의 점에서 지시선이 나간다: 다른 이름표가 그 점을 덮지 않게 점 자리도 잡아 둔다
  const dots = todo.map(({ c }) => boxAt(c.label[0], c.label[1], 2 * GAP_PX * u, 2 * GAP_PX * u));
  const lines: Box[] = [];   // 이미 그은 지시선(작은 상자로 쪼갠 것): 다른 이름표·지시선이 그 위에 놓이지 않게
  const inView = (b: Box) => !opt.within || (b[0] >= opt.within[0] && b[1] >= opt.within[1] && b[2] <= opt.within[2] && b[3] <= opt.within[3]);
  // 남의 점 둘레(dotPx — 확대 상자만): 지시선이 이 거리 안으로 지나지 않게
  const dotR = opt.dotPx ? opt.dotPx * u : 0;
  todo.forEach(({ a, c }, i) => {
    const w = a.w * u, h = a.h * u;
    const dx = c.label[0] - opt.center[0], dy = c.label[1] - opt.center[1], dl = Math.hypot(dx, dy) || 1;
    const g = GAP_PX * u;
    const others = dotR ? todo.filter((_, j) => j !== i).map((t) => t.c.label) : [];
    const spot = outsideSpot(c.label, w, h, opt.obstacles, [...dots, ...lines], opt.within, STEP_PX * u, REACH_PX * u, [dx / dl, dy / dl], {
      apart: { boxes: names, gap: APART_PX * u }, line: [...names, ...dots.filter((_, j) => j !== i), ...lines], lineGap: g, screen: opt.screen, note,
    });
    let x: number, y: number, plate = false;
    if (spot) [x, y] = spot;
    else if (opt.mode === 'must' || (opt.mode === 'fit' && opt.cleanPlates)) {
      // 빈 바탕이 없으면 칸 바로 옆에 흰 판으로: 위 → 아래 → 오른쪽 → 왼쪽 가운데 다른 이름표·점과 겹치지 않는 첫 자리.
      // 이름표를 다는 다른 칸(시험 결과의 다른 틀린 칸 등)도 덮지 않는 자리를 먼저 찾는다(plateHome 이면 그다음 판 가운데가 남의 칸 밖인 자리)
      const lift = LIFT_PX * u;
      const sides: [number, number][] = [[0, -(lift + h / 2)], [0, lift + h / 2], [lift + w / 2, 0], [-(lift + w / 2), 0]];
      // 자기 점은 판이 피할 것(taken)에서 빼고 own 으로 따로 본다(cover 는 자기 점을 세지 않는다 — 네 쪽은 점에서 LIFT_PX 떨어져 늘 닿지 않는다)
      const taken = [...names, ...dots.filter((_, j) => j !== i), ...lines, ...(opt.screen ?? [])];
      const own = boxAt(c.label[0], c.label[1], 2 * g, 2 * g);
      // cleanPlates(fit)면 다른 이름표·맥락 이름과 APART_PX 띄운다(붙여 두면 판 틀이 이웃 이름 글자 끝을 덮었다 — 11-16 영어 여수시 둘러보기 'Myodo' 판 × 'Namhae-gun')
      const sep = opt.mode === 'must' ? 0 : APART_PX * u;
      const clear = (b: Box) => !taken.some((k) => overlap(k, b)) && !overlap(own, b) && (!sep || !names.some((k) => overlap(k, grow(b, sep))));
      // 지시선(점 → 판의 가까운 변)이 지나면 안 되는 것: 'all' = 다른 이름표·점·지시선·화면에 붙은 것, 'names' = 다른 이름표(맥락 이름 포함)·화면에 붙은 것만.
      // 지시선이 다른 판 밑으로 지나면 판 둘이 한 줄에 붙고 점도 둘이라 어느 판이 어느 칸인지 헷갈린다(2026-11-15 점검: 폰 여수시 2과 '미평동' 지시선이 '문수동' 판 밑으로)
      const nameLines = [...names, ...(opt.screen ?? [])];
      // dotPx(확대 상자)면 'all' 은 남의 점 둘레(dotR)도 피한다
      const leadOk = (b: Box, lead: false | 'all' | 'names') => {
        if (!lead) return true;
        const [ex, ey] = leaderEnd(b, c.label, 0);
        if ((lead === 'all' ? taken : nameLines).some((k) => segHitsBox(c.label[0], c.label[1], ex, ey, k[0], k[1], k[2], k[3]))) return false;
        return !(lead === 'all' && dotR && others.some((p) => segDist(p, c.label[0], c.label[1], ex, ey) < dotR));
      };
      // plateHome 이면 첫 단계(spare)에서 자기 칸의 섬을 ISLE_OK 개 넘게 덮는 쪽도 건너뛴다(그다음 단계 — 판 가운데가 제 칸 안인 자리, homeSpot — 로 간다)
      const isles = opt.plateHome ? islesOf(c) : [], isleOk = opt.isleOk ?? ISLE_OK;
      /** (x0, y0) 가운데 판이 닿는 자기 칸 섬 수 */
      const isleHits = (x0: number, y0: number) => { const b = boxAt(x0, y0, w, h); let n = 0; for (const r of isles) if (overlap(ringBox(r), b) && boxHits([r], x0, y0, w, h)) n++; return n; };
      const free = (spare: boolean, lead: 'all' | 'names' = 'names') => sides.find(([sx, sy]) => {
        const x0 = c.label[0] + sx, y0 = c.label[1] + sy, b = boxAt(x0, y0, w, h);
        if (!inView(b)) { note.clipped = true; return false; }
        if (!clear(b) || !leadOk(b, lead)) return false;
        if (spare && isles.length && isleHits(x0, y0) > isleOk) return false;
        return !spare || !targets.some((t) => t.id !== a.id && overlap(t.c.box, b) && boxHits(t.c.rings, x0, y0, w, h));
      });
      // plateHome: 판 가운데가 제 칸 안이고 다른 이름표·점·지시선과 겹치지 않는 자리 가운데 점에 가장 가까운 곳(점 둘레 REACH_PX 안을 STEP_PX 격자로 훑는다).
      // 바다 위는 고르지 않는다 — 바다 쪽 빈 바탕은 앞 단계(outsideSpot)가 이미 보았고, 내륙의 작은 칸 판이 먼 바다에 가면 바닷가 곳으로 읽힌다(흉내에서 대전 판이 아산만에 갔다).
      // 작은 칸(세종·대전)은 판이 점을 덮지 않고는 가운데가 제 칸에 들 수 없어 없을 수 있다 — 그때는 전처럼 옆 판 + 지시선
      // levels = 지시선 수준(leadOk) 목록: 한 번 훑으며 수준마다 가장 가까운 자리를 함께 찾는다(반지름 2배 훑기를 수준마다 되풀이하지 않게).
      // spare = 이름표를 다는 다른 칸을 덮지 않는 자리만, reach = 훑는 반지름(px)
      const scan = (homeOnly: boolean, levels: (false | 'all' | 'names')[], spare = false, reach = REACH_PX): ([number, number] | undefined)[] => {
        const R = reach * u, st = STEP_PX * u;
        const best: ([number, number] | undefined)[] = levels.map(() => undefined), bd = levels.map(() => R * R);
        const done = (d: number, k: number) => d > bd[k] || (best[k] !== undefined && d === bd[k]);
        for (let sx = -R; sx <= R + 1e-9; sx += st) for (let sy = -R; sy <= R + 1e-9; sy += st) {
          const d = sx * sx + sy * sy;
          if (levels.every((_, k) => done(d, k))) continue;
          const x0 = c.label[0] + sx, y0 = c.label[1] + sy;
          if (homeOnly && (x0 < c.box[0] || x0 > c.box[2] || y0 < c.box[1] || y0 > c.box[3] || !inside(c.rings, x0, y0))) continue;
          const b = boxAt(x0, y0, w, h);
          if (!inView(b) || !clear(b)) continue;
          if (spare && targets.some((t) => t.id !== a.id && overlap(t.c.box, b) && boxHits(t.c.rings, x0, y0, w, h))) continue;
          levels.forEach((lead, k) => { if (!done(d, k) && leadOk(b, lead)) { bd[k] = d; best[k] = [sx, sy]; } });
        }
        return best;
      };
      const nearest = (homeOnly: boolean, lead: false | 'all' | 'names' = false, spare = false, reach = REACH_PX) => scan(homeOnly, [lead], spare, reach)[0];
      // 네 쪽이 모두 막히면(좁은 지도에 이름이 몰린 곳 — 휴대폰 전국 시·도 지도의 세종 등, E10) 가리는 넓이가 가장 작은 쪽(같으면 위 → 아래 → 오른쪽 → 왼쪽).
      // 전에는 늘 위라 바로 위 이름표를 덮었다. 다른 이름표(맥락 이름 포함)와 겹친 넓이와 보이는 범위 밖으로 나간 넓이는 NAME_W 배로 센다 —
      // 글자가 겹치거나 잘리면 읽히지 않지만 점·지시선 조각은 판 밑에 깔려도 이름은 읽힌다. 범위 밖을 아예 고르지 않으면 지도 가장자리 점의 판이
      // 범위를 1px 넘는 것을 피하려고 옆 이름표를 덮었다(E10 검수 흉내: 서울 강서구 1과 358폭 우장산동 → 발산1동 465px²)
      const cover = ([sx, sy]: [number, number]) => {
        const b = boxAt(c.label[0] + sx, c.label[1] + sy, w, h);
        const area = (k: Box) => (overlap(k, b) ? (Math.min(k[2], b[2]) - Math.max(k[0], b[0])) * (Math.min(k[3], b[3]) - Math.max(k[1], b[1])) : 0);
        const vw = opt.within, cut = vw ? w * h - Math.max(0, Math.min(b[2], vw[2]) - Math.max(b[0], vw[0])) * Math.max(0, Math.min(b[3], vw[3]) - Math.max(b[1], vw[1])) : 0;
        return NAME_W * (cut + names.reduce((t, k) => t + area(k), 0)) + taken.slice(names.length).reduce((t, k) => t + area(k), 0);
      };
      // 네 쪽이 모두 막히면 먼저 점 둘레(REACH_PX)에서 다른 이름표·점·지시선과 겹치지 않고 보이는 범위 안이며 지시선도 그것들을 지나지 않는 가장 가까운 자리
      // (되도록 이름표를 다는 다른 칸을 덮지 않는 곳). 2026-11-15 과 시작·요약을 지역 전체 지도로 바꾸자 폰 광주특별시 1과에서 작은 자치구 다섯의 판이 몰려
      // 네 쪽이 다 막혀 '광산구' 판이 '동구' 판을 덮었고, 인천 1과 폰에서는 '계양구' 판이 보이는 범위를 넘었다. 그다음은 반지름 2배.
      // 점이 몰린 곳(폰 동 단원 — 칸이 몇 px)은 어느 쪽으로 나가도 지시선이 남의 점을 지나므로, 지시선이 다른 이름표·화면에 붙은 것만 피하는 자리를 그다음에 본다
      // (점검 흉내: 폰 동 단원 과 11곳에서 지시선이 다른 판 밑으로 지났다). 그런 자리도 없을 때만 지시선을 보지 않는 자리, 마지막에 가리는 넓이가 가장 작은 쪽
      // plateHome: 판 가운데가 제 칸 안인 가장 가까운 자리가 자기 칸 섬을 ISLE_OK 개 넘게 덮으면, 같은 조건(제 칸 안·다른 이름표·점·지시선과 겹치지 않음·
      // 지시선이 이름표를 지나지 않음) 가운데 덮는 섬이 가장 적은 자리(같으면 점에 가까운 곳)로 옮긴다.
      // 2026-11-16 사용자 결정: 폰 전국 지도 '광주특별시' 판이 점 아래 남해안 다도해(섬 25~40개)를 가렸다 → 육지 안 빈자리나 점 위로.
      // 섬 몇 개에 걸치는 판(경기 판 — 서해 섬 2~3개)과 섬 없는 칸은 전과 같은 자리
      const homeSpot = (): [number, number] | undefined => {
        const p = nearest(true, 'names');
        if (!p || !isles.length) return p;
        let best = p, bn = isleHits(c.label[0] + p[0], c.label[1] + p[1]), bd = p[0] ** 2 + p[1] ** 2;
        if (bn <= isleOk) return p;
        const R = REACH_PX * u, st = STEP_PX * u;
        for (let sx = -R; sx <= R + 1e-9; sx += st) for (let sy = -R; sy <= R + 1e-9; sy += st) {
          const d = sx * sx + sy * sy, x0 = c.label[0] + sx, y0 = c.label[1] + sy;
          if (d > R * R || x0 < c.box[0] || x0 > c.box[2] || y0 < c.box[1] || y0 > c.box[3] || !inside(c.rings, x0, y0)) continue;
          const b = boxAt(x0, y0, w, h);
          if (!inView(b) || !clear(b) || !leadOk(b, 'names')) continue;
          const n = isleHits(x0, y0);
          if (n < bn || (n === bn && d < bd)) { best = [sx, sy]; bn = n; bd = d; }
        }
        return best;
      };
      // fit + cleanPlates(영어 동 단원 둘러보기): 남의 칸을 덮지 않고 지시선이 다른 이름표·점·지시선을 지나지 않는 판(네 쪽 → 점 둘레)만. 없으면 뺀다(fit)
      if (opt.mode !== 'must') {
        const clean = free(true, 'all') ?? nearest(false, 'all', true);
        if (!clean) return;
        x = c.label[0] + clean[0];
        y = c.label[1] + clean[1];
        plate = true;
      } else {
      // dotPx(확대 상자): 지시선이 다른 이름표·점·지시선과 남의 점 둘레를 모두 피하는 자리(네 쪽 → 점 둘레)를 먼저(PlaceOpt dotPx 주석)
      // 2026-11-17(사용자 '더 손본다'): 본 지도도 네 쪽 가운데 지시선이 다른 이름표·점·지시선을 지나지 않는 쪽을 먼저 본다. 전에는 본 지도의 네 쪽 판이 다른 이름표만 피해(free(true)),
      // 지시선 끝을 글자 가운데 쪽으로 바꾼 뒤(leaderEnd) 지시선끼리 엇갈린 과 시작·요약 화면이 늘었다(폰 한국어 38 → 46쪽 등 — 배포 전 측정)
      let side = (dotR ? free(true, 'all') ?? free(false, 'all') ?? nearest(false, 'all', true) ?? nearest(false, 'all') : free(true, 'all'))
        ?? free(true)
        ?? (opt.plateHome ? homeSpot() ?? nearest(false, 'names') : undefined)
        ?? free(false)
        ?? nearest(false, 'all', true) ?? nearest(false, 'all');
      if (!side) {
        const [all, nameOnly, any] = scan(false, ['all', 'names', false], false, 2 * REACH_PX);
        side = all ?? nameOnly;
        if (!side) {
          stuck.push(a.id);
          side = any ?? sides.reduce((best, s) => (cover(s) < cover(best) ? s : best));
        }
      }
      x = c.label[0] + side[0];
      y = c.label[1] + side[1];
      plate = true;
      }
    } else return;
    const b = boxAt(x, y, w, h);
    // 지시선: 판 없는 이름표는 칸 안 점에서 글자 가운데 쪽으로 글자 바로 옆까지, 흰 판은 판에서 점에 가장 가까운 곳까지(leaderEnd)
    const [ax, ay] = leaderEnd(b, c.label, plate ? 0 : g);
    out.push({ id: a.id, x, y, out: { ax, ay, plate } });
    names.push(b);
    const n = Math.max(1, Math.ceil(Math.hypot(ax - c.label[0], ay - c.label[1]) / g));
    // 끝점(k = n)까지: 칸 밖 이름표는 지시선 끝과 글자 사이를 띄우므로(g) 그 틈에 남의 판이 걸치지 않게(점검 흉내: 폰 검단구 2과 '아라1동' 판이 '원당동' 지시선 끝에)
    for (let k = 1; k <= n; k++) lines.push(boxAt(c.label[0] + ((ax - c.label[0]) * k) / n, c.label[1] + ((ay - c.label[1]) * k) / n, g, g));
  });
  return { out, stuck };
}

/** 이름표 자리 한 벌: 칸 안(placeInside) 다음에 칸 밖(placeOutside). 칸 안 것이 먼저, 그 뒤에 칸 밖 것 */
export function placeLabels(cellOf: (id: string) => LabelCell | undefined, asks: LabelAsk[], opt: PlaceOpt): Placed[] {
  const ins = placeInside(cellOf, asks, opt.u);
  return [...ins.placed, ...placeOutside(cellOf, asks, ins, opt).placed];
}

/**
 * 정적 쪽 지도(JS 없이 화면 폭만 바뀐다): 이름표가 px 크기 글자 그대로 칸 안에 들기 시작하는 지도 폭과 그때의 자리.
 * 그보다 넓은 지도에서는 같은 자리에 상자가 더 작게 놓이므로 늘 들어간다. unitsWide = 지도 가로 전체의 지도 단위(viewBox 폭).
 * maxW 폭에서도 안 들어가면 null.
 * 자리는 넉넉한 곳을 먼저 고른다: 문턱 폭에서 넉넉한 상자가 드는 곳, 없으면 넉넉한 상자가 들기 시작하는 폭의 자리(문턱 폭에서도 글자가 드는 곳일 때만)
 */
export function staticLabel(
  rings: Float64Array[], box: Box, at: readonly [number, number], text: string, px: number, unitsWide: number, minW = 240, maxW = 1100, grain = 20,
): { minWidth: number; x: number; y: number } | null {
  const b = labelBox(text, px);
  const search = (rw: number, rh: number, from: number): { minWidth: number; x: number; y: number } | null => {
    const tryAt = (W: number) => { const k = unitsWide / W; return fitBox(rings, box, at, (b.w + rw) * k, (b.h + rh) * k, STEP_PX * k); };
    let hi = maxW, spot = tryAt(hi);
    if (!spot) return null;
    let lo = from;
    const low = tryAt(lo);
    if (low) return { minWidth: lo, x: low[0], y: low[1] };
    // lo 에서는 안 들어가고 hi 에서는 들어간다: 그 사이를 반씩 좁힌다
    while (hi - lo > grain) {
      const mid = Math.round((lo + hi) / 2 / grain) * grain;
      if (mid <= lo || mid >= hi) break;
      const m = tryAt(mid);
      if (m) { hi = mid; spot = m; } else lo = mid;
    }
    return { minWidth: hi, x: spot[0], y: spot[1] };
  };
  const tight = search(0, 0, minW);
  if (!tight) return null;
  const roomy = search(ROOM_W, ROOM_H, tight.minWidth);
  if (roomy) {
    const k = unitsWide / tight.minWidth;
    if (boxInside(rings, roomy.x, roomy.y, b.w * k, b.h * k)) return { minWidth: tight.minWidth, x: roomy.x, y: roomy.y };
  }
  return tight;
}

/* ---------- 축척 막대 ---------- */

/** 막대 길이 후보(m): 1·2·5·10km 를 먼저 쓰고, 많이 키우거나 줄인 화면은 그 위아래 */
const SCALE_STEPS = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];

/**
 * 화면 1px = u m 일 때의 축척 막대: 길이가 minPx~maxPx 에 드는 값(둘이면 큰 쪽), 없으면 가장 가까운 값.
 * 지도 단위는 미터(project.ts)라 그대로 잰다
 */
export function scaleStep(u: number, minPx = 60, maxPx = 120): { m: number; px: number; text: string } {
  const ok = SCALE_STEPS.filter((m) => m / u >= minPx && m / u <= maxPx);
  // 드는 값이 없으면(2km 는 짧고 5km 는 긴 배율) 조금 긴 쪽: minPx 를 넘는 가장 작은 값
  const m = ok.length ? ok[ok.length - 1] : SCALE_STEPS.find((v) => v / u >= minPx) ?? SCALE_STEPS[SCALE_STEPS.length - 1];
  return { m, px: m / u, text: m >= 1000 ? `${m / 1000}km` : `${m}m` };
}
