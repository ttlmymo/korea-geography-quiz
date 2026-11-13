// 다각형 계산(그리기·데이터와 따로). 고리는 x0,y0,x1,y1… 로 편 Float64Array 이고, 닫는 점(= 첫 점)은 있어도 없어도 된다.
// 누름 판정(shapes.ts)과 이름표 자리(labelfit.ts), 정적 쪽 지도(RegionMap.astro)가 함께 쓴다

/** 짝홀 규칙: 구멍(섬 속 호수 등)도 맞게 본다 */
export function inside(rings: Float64Array[], x: number, y: number): boolean {
  let c = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
  }
  return c;
}

/** 점에서 경계까지 가장 가까운 거리 */
export function edgeDist(rings: Float64Array[], x: number, y: number): number {
  let best = Infinity;
  for (const r of rings) {
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const ax = r[j], ay = r[j + 1], dx = r[i] - ax, dy = r[i + 1] - ay;
      const l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
      const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
      if (d < best) best = d;
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

/** 고리의 변 가운데 상자(가운데 cx·cy, 크기 w×h)에 닿는 것이 있나 */
export function edgeHitsBox(rings: Float64Array[], cx: number, cy: number, w: number, h: number): boolean {
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2;
  for (const r of rings) {
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      if (segHitsBox(r[j], r[j + 1], r[i], r[i + 1], x0, y0, x1, y1)) return true;
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
