// 다각형 계산(그리기·데이터와 따로). 고리는 x0,y0,x1,y1… 로 편 Float64Array 이고, 닫는 점(= 첫 점)은 있어도 없어도 된다.
// 누름 판정(shapes.ts)과 이름표 자리(labelfit.ts), 정적 쪽 지도(RegionMap.astro)가 함께 쓴다.
// 고리가 여럿인 칸(섬이 많은 옹진·신안 등)과 긴 고리는 고리·변 조각마다 상자를 한 번 구해 두고, 점·상자와 겹칠 수 없는 것은 건너뛴다(계획서 E5).
// 건너뛰는 것은 결과에 들 수 없는 변뿐이라 답은 다 훑을 때와 같다(tests/unit/map.test.ts '고리 상자' 시험이 견준다)

/** 고리 상자를 쓰는가(시험이 끄고 켜서 결과가 같은지 본다) */
let RING_INDEX = true;
export function setRingIndex(on: boolean) { RING_INDEX = on; }

/** 긴 고리는 변 PIECE 개씩 조각으로 나눠 조각마다 상자를 둔다(경기처럼 고리 하나에 점이 수백 개인 칸) */
const PIECE = 32;
/**
 * 고리 배열의 색인: box = 고리마다 [x0, y0, x1, y1], piece = 긴 고리의 조각마다 [x0, y0, x1, y1](짧은 고리는 null).
 * 조각 c 는 점 c·PIECE … 의 변(앞 점 → 그 점)을 맡고, 상자는 첫 변의 앞 점(0 이면 마지막 점)까지 넣는다.
 * 고리가 하나이고 짧으면 만들지 않는다(건너뛸 것이 없다)
 */
interface RingIdx { box: Float64Array; piece: (Float64Array | null)[] }
const ringIdx = new WeakMap<Float64Array[], RingIdx>();
function boxOfPts(r: Float64Array, from: number, to: number, out: Float64Array, at: number) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = from; i < to; i += 2) {
    if (r[i] < x0) x0 = r[i];
    if (r[i] > x1) x1 = r[i];
    if (r[i + 1] < y0) y0 = r[i + 1];
    if (r[i + 1] > y1) y1 = r[i + 1];
  }
  out[at] = x0; out[at + 1] = y0; out[at + 2] = x1; out[at + 3] = y1;
}
function indexOf(rings: Float64Array[]): RingIdx | null {
  if (!RING_INDEX || !rings.length || (rings.length < 2 && rings[0].length <= PIECE * 4)) return null;
  let ix = ringIdx.get(rings);
  if (ix && ix.piece.length === rings.length) return ix;
  const box = new Float64Array(rings.length * 4);
  const piece = rings.map((r, k) => {
    boxOfPts(r, 0, r.length, box, 4 * k);
    if (r.length <= PIECE * 4) return null;
    const n = r.length, step = PIECE * 2, m = Math.ceil(n / step), pb = new Float64Array(m * 4);
    for (let c = 0; c < m; c++) {
      const s = c * step, e = Math.min(s + step, n);
      boxOfPts(r, s, e, pb, 4 * c);
      // 첫 변의 앞 점
      const j = s ? s - 2 : n - 2;
      pb[4 * c] = Math.min(pb[4 * c], r[j]); pb[4 * c + 2] = Math.max(pb[4 * c + 2], r[j]);
      pb[4 * c + 1] = Math.min(pb[4 * c + 1], r[j + 1]); pb[4 * c + 3] = Math.max(pb[4 * c + 3], r[j + 1]);
    }
    return pb;
  });
  ix = { box, piece };
  ringIdx.set(rings, ix);
  return ix;
}

/**
 * 짝홀 규칙: 구멍(섬 속 호수 등)도 맞게 본다.
 * 상자로 거르기: 고리(조각)의 모든 점이 y 보다 위(y0 > y)거나 y 이하(y1 <= y)면 그 변은 가로선과 만나지 않고,
 * x 가 오른쪽 끝보다 오른쪽이면(교점은 변의 두 끝 x 사이) 'x < 교점'이 될 수 없다 — 부동소수 오차를 생각해 1e-6 m 여유를 둔다
 */
export function inside(rings: Float64Array[], x: number, y: number): boolean {
  const ix = indexOf(rings);
  const miss = (b: Float64Array, a: number) => b[a + 1] > y || b[a + 3] <= y || x - b[a + 2] > 1e-6;
  let c = false;
  for (let k = 0; k < rings.length; k++) {
    if (ix && miss(ix.box, 4 * k)) continue;
    const r = rings[k], n = r.length, pc = ix?.piece[k];
    const step = pc ? PIECE * 2 : n;
    for (let s = 0; s < n; s += step) {
      if (pc && miss(pc, (s / step) * 4)) continue;
      const e = Math.min(s + step, n);
      for (let i = s, j = s ? s - 2 : n - 2; i < e; j = i, i += 2) {
        const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
      }
    }
  }
  return c;
}

/** 점에서 경계까지 가장 가까운 거리. 상자까지의 거리가 지금까지의 가장 가까운 값보다 먼 고리(조각)는 건너뛴다(변까지 거리 ≥ 상자까지 거리, 반올림 여유 1e-6 m) */
export function edgeDist(rings: Float64Array[], x: number, y: number): number {
  const ix = indexOf(rings);
  let best = Infinity;
  const far = (b: Float64Array, a: number) => best < Infinity && Math.hypot(Math.max(b[a] - x, 0, x - b[a + 2]), Math.max(b[a + 1] - y, 0, y - b[a + 3])) - best > 1e-6;
  for (let k = 0; k < rings.length; k++) {
    if (ix && far(ix.box, 4 * k)) continue;
    const r = rings[k], n = r.length, pc = ix?.piece[k];
    const step = pc ? PIECE * 2 : n;
    for (let s = 0; s < n; s += step) {
      if (pc && far(pc, (s / step) * 4)) continue;
      const e = Math.min(s + step, n);
      for (let i = s, j = s ? s - 2 : n - 2; i < e; j = i, i += 2) {
        const ax = r[j], ay = r[j + 1], dx = r[i] - ax, dy = r[i + 1] - ay;
        const l2 = dx * dx + dy * dy;
        const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
        const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
        if (d < best) best = d;
      }
    }
  }
  return best;
}

/** 선분 a–b 가 상자 [x0,x1]×[y0,y1] 에 닿나(잘라 보기) */
export function segHitsBox(ax: number, ay: number, bx: number, by: number, x0: number, y0: number, x1: number, y1: number): boolean {
  if (Math.max(ax, bx) < x0 || Math.min(ax, bx) > x1 || Math.max(ay, by) < y0 || Math.min(ay, by) > y1) return false;
  const dx = bx - ax, dy = by - ay;
  let t0 = 0, t1 = 1;
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  return clip(-dx, ax - x0) && clip(dx, x1 - ax) && clip(-dy, ay - y0) && clip(dy, y1 - ay);
}

/** 고리의 변 가운데 상자(가운데 cx·cy, 크기 w×h)에 닿는 것이 있나. 상자가 떨어진 고리(조각)는 건너뛴다(segHitsBox 의 첫 거르기와 같은 비교) */
export function edgeHitsBox(rings: Float64Array[], cx: number, cy: number, w: number, h: number): boolean {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  const ix = indexOf(rings);
  const apart = (b: Float64Array, a: number) => b[a + 2] < x0 || b[a] > x1 || b[a + 3] < y0 || b[a + 1] > y1;
  for (let k = 0; k < rings.length; k++) {
    if (ix && apart(ix.box, 4 * k)) continue;
    const r = rings[k], n = r.length, pc = ix?.piece[k];
    const step = pc ? PIECE * 2 : n;
    for (let s = 0; s < n; s += step) {
      if (pc && apart(pc, (s / step) * 4)) continue;
      const e = Math.min(s + step, n);
      for (let i = s, j = s ? s - 2 : n - 2; i < e; j = i, i += 2) {
        if (segHitsBox(r[j], r[j + 1], r[i], r[i + 1], x0, y0, x1, y1)) return true;
      }
    }
  }
  return false;
}

/** 상자가 다각형 안에 온전히 드나(경계선에 닿지도 않게) */
export const boxInside = (rings: Float64Array[], cx: number, cy: number, w: number, h: number) =>
  inside(rings, cx, cy) && !edgeHitsBox(rings, cx, cy, w, h);

/** 상자가 다각형과 조금이라도 겹치나 */
export const boxHits = (rings: Float64Array[], cx: number, cy: number, w: number, h: number) =>
  inside(rings, cx, cy) || edgeHitsBox(rings, cx, cy, w, h);

/** path 의 d('M x y x y…Z' 를 이어 쓴 것, 좌표는 정수 짝) → 고리. 정적 쪽 지도 데이터(src/data/svg)용 */
export function ringsOfD(d: string): Float64Array[] {
  const out: Float64Array[] = [];
  for (const part of d.split('M')) {
    const n = part.match(/-?\d+(?:\.\d+)?/g);
    if (!n || n.length < 6) continue;
    out.push(Float64Array.from(n.slice(0, n.length - (n.length % 2)), Number));
  }
  return out;
}
