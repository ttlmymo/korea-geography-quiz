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
export const labelBox = (text: string, px: number): { w: number; h: number } => ({ w: Math.ceil(textWidth(text, px)) + 8, h: px + 6 });

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

/** 지시선이 닿는 이름표 쪽 끝점: 상자에서 칸 안 점에 가장 가까운 곳(좌우로는 글자에 닿지 않게 g 만큼 띄운다) */
const leaderEnd = (b: Box, at: readonly [number, number], g: number): [number, number] =>
  [Math.min(b[2] + g, Math.max(b[0] - g, at[0])), Math.min(b[3], Math.max(b[1], at[1]))];

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
 * must = 꼭 보인다(만나기·시험 결과): 칸 안 → 칸 밖 빈 바탕 + 지시선 → 칸 옆(위·아래·오른쪽·왼쪽)에 흰 판 + 지시선.
 * fit = 자리가 있을 때만(홈 지도·둘러보기·과 시작·요약): 칸 안 → 칸 밖 빈 바탕 + 지시선 → 뺀다.
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
  const { u } = opt;
  const out: Placed[] = [];
  const note = { clipped: false };
  if (opt.mode === 'inside' || !ins.pending.length) return { placed: out, clipped: false };
  const ask = new Map(asks.map((a) => [a.id, a]));
  // 이름표 상자(칸 안 것 + 놓아 가는 칸 밖 것)와 맥락 이름: 간격을 두고 피한다
  const names: Box[] = [...(opt.avoid ?? [])];
  for (const p of ins.placed) { const a = ask.get(p.id); if (a) names.push(boxAt(p.x, p.y, a.w * u, a.h * u)); }
  const todo = ins.pending.map((a) => ({ a, c: cellOf(a.id) })).filter((x): x is { a: LabelAsk; c: LabelCell } => !!x.c);
  // 이름표를 다는 모든 칸(흰 판이 덮지 않게 먼저 피한다)
  const targets = asks.map((a) => ({ id: a.id, c: cellOf(a.id) })).filter((x): x is { id: string; c: LabelCell } => !!x.c);
  // 칸 밖 이름표는 칸 안의 점에서 지시선이 나간다: 다른 이름표가 그 점을 덮지 않게 점 자리도 잡아 둔다
  const dots = todo.map(({ c }) => boxAt(c.label[0], c.label[1], 2 * GAP_PX * u, 2 * GAP_PX * u));
  const lines: Box[] = [];   // 이미 그은 지시선(작은 상자로 쪼갠 것): 다른 이름표·지시선이 그 위에 놓이지 않게
  const inView = (b: Box) => !opt.within || (b[0] >= opt.within[0] && b[1] >= opt.within[1] && b[2] <= opt.within[2] && b[3] <= opt.within[3]);
  todo.forEach(({ a, c }, i) => {
    const w = a.w * u, h = a.h * u;
    const dx = c.label[0] - opt.center[0], dy = c.label[1] - opt.center[1], dl = Math.hypot(dx, dy) || 1;
    const g = GAP_PX * u;
    const spot = outsideSpot(c.label, w, h, opt.obstacles, [...dots, ...lines], opt.within, STEP_PX * u, REACH_PX * u, [dx / dl, dy / dl], {
      apart: { boxes: names, gap: APART_PX * u }, line: [...names, ...dots.filter((_, j) => j !== i), ...lines], lineGap: g, screen: opt.screen, note,
    });
    let x: number, y: number, plate = false;
    if (spot) [x, y] = spot;
    else if (opt.mode === 'must') {
      // 빈 바탕이 없으면 칸 바로 옆에 흰 판으로: 위 → 아래 → 오른쪽 → 왼쪽 가운데 다른 이름표·점과 겹치지 않는 첫 자리(없으면 위).
      // 이름표를 다는 다른 칸(시험 결과의 다른 틀린 칸 등)도 덮지 않는 자리를 먼저 찾는다
      const lift = LIFT_PX * u;
      const sides: [number, number][] = [[0, -(lift + h / 2)], [0, lift + h / 2], [lift + w / 2, 0], [-(lift + w / 2), 0]];
      const taken = [...names, ...dots, ...lines, ...(opt.screen ?? [])];
      const free = (spare: boolean) => sides.find(([sx, sy]) => {
        const x0 = c.label[0] + sx, y0 = c.label[1] + sy, b = boxAt(x0, y0, w, h);
        if (!inView(b)) { note.clipped = true; return false; }
        if (taken.some((k) => overlap(k, b))) return false;
        return !spare || !targets.some((t) => t.id !== a.id && overlap(t.c.box, b) && boxHits(t.c.rings, x0, y0, w, h));
      });
      const side = free(true) ?? free(false) ?? sides[0];
      x = c.label[0] + side[0];
      y = c.label[1] + side[1];
      plate = true;
    } else return;
    const b = boxAt(x, y, w, h);
    // 지시선은 이름표 상자에서 칸 안 점에 가장 가까운 곳으로(글자에 닿지 않게 조금 띄운다. 흰 판은 판의 변까지)
    const [ax, ay] = leaderEnd(b, c.label, plate ? 0 : g);
    out.push({ id: a.id, x, y, out: { ax, ay, plate } });
    names.push(b);
    const n = Math.max(1, Math.ceil(Math.hypot(ax - c.label[0], ay - c.label[1]) / g));
    for (let k = 1; k < n; k++) lines.push(boxAt(c.label[0] + ((ax - c.label[0]) * k) / n, c.label[1] + ((ay - c.label[1]) * k) / n, g, g));
  });
  return { placed: out, clipped: note.clipped };
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
