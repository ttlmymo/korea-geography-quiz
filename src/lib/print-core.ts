// 인쇄용 백지도 계산(R1, 학습 기능 계획 docs/LEARNING_PLAN_DETAIL_2026-11-21.md 2절).
// 번호 매기기 · 인쇄 크기 · 번호 글자 크기 · 전국 시·도 지도 그리기. Astro 를 모른다 — 단위 시험(tests/unit/print.test.ts)이 그대로 읽는다.
// 지도는 앱·정적 지도와 같은 경계 데이터에서 나온다. 여기서는 그림을 종이(A4 세로)에 맞추는 계산만 한다.
import { feature } from 'topojson-client';
import { project } from '../app/map/project.ts';

/** A4 세로, 둘레 15mm 를 뺀 안쪽에서 지도가 쓰는 상자(mm). 위쪽 제목·아래쪽 출처 줄 자리를 남긴다 */
export const MAP_W_MM = 180;
export const MAP_H_MM = 225;
/** 1pt 는 몇 mm 인가 */
export const PT_MM = 25.4 / 72;
/** 번호 글자 크기(pt): 칸이 넉넉하면 이만큼, 좁으면 칸에 드는 만큼 줄인다 */
export const NUM_PT = 8;
export const NUM_MIN_PT = 5;
/** 번호 둘레 흰 테두리(mm) — 칸 경계선 위에서도 읽히게 */
export const HALO_MM = 0.5;

/** 지도 한 단위(지도 폭 1000)가 종이에서 몇 mm 인가: 폭·높이 중 먼저 차는 쪽 */
export function mmPerUnit(w: number, h: number, maxH = MAP_H_MM): number {
  return Math.min(MAP_W_MM / w, maxH / h);
}
/** 과 백지도(곳 8곳 이하)는 지도 아래 같은 쪽에 답 쓰는 칸을 두므로 지도 높이를 이만큼으로 줄인다 */
export const MAP_H_LESSON_MM = 150;

/**
 * 번호 글자 크기(pt). irMm = 칸 안에 들어가는 가장 큰 원의 반지름(mm), digits = 번호 자릿수.
 * 글자 상자(폭 0.58·크기·자릿수, 높이 0.72·크기)의 반대각선 절반 + 여유 0.3mm 가 반지름 안에 들어가야 한다.
 * NUM_PT 를 넘지 않고, NUM_MIN_PT 에 못 미치면 null(칸에 안 드는 곳 — 쪽이 그 목록을 알린다)
 */
export function numberPt(irMm: number, digits: number): number | null {
  const half = Math.hypot(0.29 * digits, 0.36);
  const pt = Math.min(NUM_PT, Math.max(0, (irMm - 0.3) / half) / PT_MM);
  return pt >= NUM_MIN_PT ? Math.floor(pt * 10) / 10 : null;
}

export interface PrintCell {
  id: string;
  no: number;          // 1부터, 가나다 차례
  ko: string;          // 한국어 이름
  en: string;          // 영어 이름
  full?: string;       // 정식 이름(시·도 표의 '전남광주통합특별시' 처럼 짧은 이름과 다를 때)
  d: string;           // 칸 경로
  lx: number; ly: number;   // 번호를 놓을 점(칸 안 가장 넓은 곳)
  pt: number | null;   // 번호 글자 크기(pt), null = 칸에 안 듦
  inset?: true;        // 지도 틀 밖의 먼 섬(경북 울릉군)을 점선 상자 안에 옮겨 놓은 칸
}

/** 먼 섬을 옮겨 놓은 점선 상자(지도 단위) */
export interface Inset { x: number; y: number; w: number; h: number }

export interface PrintMap {
  key: string;
  w: number; h: number;      // 보이는 범위의 폭·높이(지도 단위). 지역 전체면 데이터 범위(폭 1000) 그대로
  vb: [number, number, number, number];   // SVG viewBox(지역 전체 = 0 0 w h, 과 백지도 = 그 과 칸 둘레 + 여백)
  ctx: { id: string; d: string }[];       // 번호 없이 회색으로 그리는 칸(과 백지도에서 그 과가 아닌 칸)
  mm: number;                // 한 단위의 mm
  cells: PrintCell[];
  out: string;               // 이웃 땅 경로
  water: string;             // 강 띠 경로
  insets: Inset[];           // 먼 섬 상자
  /** 번호가 칸에 안 드는 곳 */
  tight: string[];
}

export interface SvgItemLike { id: string; d: string; lx: number; ly: number; ir: number }
export interface Named { id: string; ko: string; en: string; full?: string }

const ko = (a: string, b: string) => a.localeCompare(b, 'ko');

/** 데이터 범위(0~w, 0~h) 밖의 섬 조각을 뺀 경로(정적 지도 RegionMap 과 같은 규칙: 인천 옹진군의 먼 섬이 틀 밖으로 삐져나오지 않게) */
export function clipToData(d: string, w: number, h: number): string {
  const inData = (part: string) => { const m = part.match(/(-?\d+) (-?\d+)/); return !!m && +m[1] >= 0 && +m[1] <= w && +m[2] >= 0 && +m[2] <= h; };
  return d.split('M').filter((p) => p && inData(p)).map((p) => `M${p}`).join('');
}

const shift = (d: string, dx: number, dy: number) => d.replace(/(-?\d+) (-?\d+)/g, (_, x, y) => `${+x + dx} ${+y + dy}`);
const pointsOf = (d: string): [number, number][] => [...d.matchAll(/(-?\d+) (-?\d+)/g)].map((m) => [+m[1], +m[2]]);
const inRange = (x: number, y: number, w: number, h: number) => x >= 0 && x <= w && y >= 0 && y <= h;

/** buildPrintMap 선택: clip = 데이터 범위 밖 섬 조각 빼기(지역 전체), focus = 번호를 붙일 곳(과 백지도 — 나머지는 회색 맥락), maxH = 지도 높이 상한(mm) */
export interface BuildOpt { clip?: boolean; focus?: readonly string[]; maxH?: number }

/**
 * 곳 목록과 지도 칸을 이어 번호를 붙인다. 번호 차례는 한국어 가나다(영어 쪽도 같은 번호 — 두 말 쪽이 같은 문제지가 되게).
 * 이름이 있는데 칸이 없거나(그 반대) 번호 점이 지도 밖이면서 옮겨 놓을 자리도 없으면 멈춘다 — 조용히 빠뜨리지 않는다.
 * 번호 점이 보이는 범위 밖인 곳(경북 울릉군: 울릉도·독도가 지도 틀 한참 밖)은 지도 모서리의 점선 상자 안에 옮겨 그린다.
 * focus 가 있으면(과 백지도) 보이는 범위를 그 곳들 둘레(+8%)로 좁히고, 번호·정답은 그 곳들만, 범위 안의 다른 칸은 회색 맥락으로 그린다
 */
export function buildPrintMap(key: string, size: { w: number; h: number }, items: SvgItemLike[], names: Named[], out: string, water: string, opt: boolean | BuildOpt = true): PrintMap {
  const o: BuildOpt = typeof opt === 'boolean' ? { clip: opt } : opt;
  const byId = new Map(items.map((it) => [it.id, it]));
  if (byId.size !== items.length) throw new Error(`${key}: 칸 id 가 겹침`);
  const missing = names.filter((n) => !byId.has(n.id)).map((n) => n.id);
  const extra = items.filter((it) => !names.some((n) => n.id === it.id)).map((it) => it.id);
  if (missing.length || extra.length) throw new Error(`${key}: 이름과 칸이 어긋남 — 칸 없음 [${missing.join(', ')}], 이름 없음 [${extra.join(', ')}]`);
  const focus = o.focus ? new Set(o.focus) : null;
  if (focus) for (const id of focus) if (!byId.has(id)) throw new Error(`${key}: 번호를 붙일 곳 ${id} 의 칸이 없음`);
  const isFocus = (id: string) => !focus || focus.has(id);
  // 보이는 범위: 지역 전체 = 데이터 범위, 과 = 그 곳들의 (데이터 범위 안) 점 둘레 + 8%
  let vb: [number, number, number, number] = [0, 0, size.w, size.h];
  if (focus) {
    const pts = [...focus].flatMap((id) => pointsOf(byId.get(id)!.d)).filter(([x, y]) => inRange(x, y, size.w, size.h));
    if (!pts.length) throw new Error(`${key}: 과 곳들의 점이 데이터 범위 안에 없음`);
    const b = [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
    const pad = Math.max(20, Math.round(Math.max(b[2] - b[0], b[3] - b[1]) * 0.08));
    vb = [b[0] - pad, b[1] - pad, b[2] - b[0] + 2 * pad, b[3] - b[1] + 2 * pad];
  }
  const [vx, vy, vw, vh] = vb;
  const inView = (x: number, y: number) => x >= vx && x <= vx + vw && y >= vy && y <= vy + vh;
  const mm = mmPerUnit(vw, vh, o.maxH);
  const clip = (o.clip ?? true) && !focus;
  const sorted = names.filter((n) => isFocus(n.id)).sort((a, b) => ko(a.ko, b.ko) || (a.id < b.id ? -1 : 1));
  const far = new Set(sorted.map((n) => byId.get(n.id)!).filter((it) => !inView(it.lx, it.ly)).map((it) => it.id));
  // 보이는 칸의 점(상자가 칸을 덮는지 보는 데 쓴다)
  const mainPts = items.filter((it) => !far.has(it.id)).flatMap((it) => pointsOf(it.d)).filter(([x, y]) => inView(x, y));
  const insets: Inset[] = [];
  const farCell = new Map<string, { d: string; lx: number; ly: number }>();
  for (const id of far) {
    const it = byId.get(id)!;
    const pts = pointsOf(it.d);
    if (!pts.length) throw new Error(`${key}: ${id} 의 번호 점이 지도 밖이고 경로도 없음`);
    const bx = [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
    const bw = Math.max(120, Math.ceil((bx[2] - bx[0]) * 1.3)), bh = Math.max(110, Math.ceil((bx[3] - bx[1]) * 1.3));
    const M = 10;
    const corners: Inset[] = [{ x: vx + M, y: vy + M, w: bw, h: bh }, { x: vx + M, y: vy + vh - bh - M, w: bw, h: bh }, { x: vx + vw - bw - M, y: vy + M, w: bw, h: bh }, { x: vx + vw - bw - M, y: vy + vh - bh - M, w: bw, h: bh }];
    const free = corners.find((c) => !mainPts.some(([x, y]) => x > c.x - 6 && x < c.x + c.w + 6 && y > c.y - 6 && y < c.y + c.h + 6) && !insets.some((t) => c.x < t.x + t.w && c.x + c.w > t.x && c.y < t.y + t.h && c.y + c.h > t.y));
    if (!free) throw new Error(`${key}: ${id} 을 옮겨 놓을 빈 모서리가 없음`);
    insets.push(free);
    // 상자 가운데에 상자 안 그림이 오도록 옮긴다. 번호 점(가장 큰 조각의 점)도 같이 옮기면 상자 안에 든다
    const dx = Math.round(free.x + (free.w - (bx[2] - bx[0])) / 2 - bx[0]);
    const dy = Math.round(free.y + (free.h - (bx[3] - bx[1])) / 2 - bx[1]);
    farCell.set(id, { d: shift(it.d, dx, dy), lx: it.lx + dx, ly: it.ly + dy });
  }
  const clipD = (d: string) => (clip ? clipToData(d, size.w, size.h) : d);
  const cells: PrintCell[] = sorted.map((n, i) => {
    const it = byId.get(n.id)!;
    const no = i + 1;
    const f = farCell.get(n.id);
    const ir = it.ir * mm;
    if (f) {
      if (!inView(f.lx, f.ly)) throw new Error(`${key}: ${n.id} 을 옮겼는데도 번호 점이 지도 밖 (${f.lx}, ${f.ly})`);
      return { id: n.id, no, ko: n.ko, en: n.en, ...(n.full ? { full: n.full } : {}), d: f.d, lx: f.lx, ly: f.ly, pt: numberPt(ir, String(no).length), inset: true };
    }
    return { id: n.id, no, ko: n.ko, en: n.en, ...(n.full ? { full: n.full } : {}), d: clipD(it.d), lx: it.lx, ly: it.ly, pt: numberPt(ir, String(no).length) };
  });
  // 회색 맥락 칸: 과 백지도에서 보이는 범위에 걸치는 다른 칸
  const ctx = focus ? items.filter((it) => !focus.has(it.id) && pointsOf(it.d).some(([x, y]) => inView(x, y))).map((it) => ({ id: it.id, d: it.d })) : [];
  return {
    key, w: vw, h: vh, vb, ctx, mm, cells, insets,
    out: clipD(out), water: clipD(water),
    tight: cells.filter((c) => c.pt === null).map((c) => c.id),
  };
}

/* ---------- 전국 시·도 지도: 앱이 쓰는 sido.topo.json 에서 정적 SVG 모양으로 ---------- */

interface Ring { x: number; y: number }
type Poly = number[][][];   // [고리][점][경도, 위도]

const polysOf = (g: { type: string; coordinates: unknown }): Poly[] => (g.type === 'Polygon' ? [g.coordinates as Poly] : (g.coordinates as Poly[]));

/** 고리 면적(제곱 단위, 부호 없음) */
function ringArea(r: Ring[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j].x * r[i].y - r[i].x * r[j].y;
  return Math.abs(a) / 2;
}

export interface SidoTopo { objects: { sido: unknown; out: unknown } }
export interface KoreaSvg {
  w: number; h: number;
  items: (SvgItemLike & { code: string; name: string })[];
  out: string;
}

/**
 * 전국 시·도 지도를 폭 1000 단위 경로로 그린다. 투영은 앱 지도와 같다(map/project.ts). 둘레 3% 를 두고,
 * 정수 좌표·겹친 점 제거·1단위² 보다 작은 조각(먼 섬 조각)은 뺀다 — 이 크기에서는 점으로도 안 보인다.
 * labels: 시·도 id 의 [경도, 위도, 안쪽 반지름(m)](판의 l 칸)
 */
export function koreaSvg(topology: SidoTopo): KoreaSvg {
  const sido = feature(topology, topology.objects.sido).features as { properties: { id: string; name: string; sido: string; l: [number, number, number] }; geometry: { type: string; coordinates: unknown } }[];
  const outFc = feature(topology, topology.objects.out).features as { geometry: { type: string; coordinates: unknown } }[];
  const metres = (poly: Poly): Ring[][] => poly.map((r) => r.map(([lo, la]) => { const [x, y] = project(lo, la); return { x, y }; }));
  let box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of sido) for (const poly of polysOf(f.geometry)) for (const r of metres(poly)) for (const p of r) box = [Math.min(box[0], p.x), Math.min(box[1], p.y), Math.max(box[2], p.x), Math.max(box[3], p.y)];
  const pad = (box[2] - box[0]) * 0.03;
  const x0 = box[0] - pad, y0 = box[1] - pad;
  const s = 1000 / (box[2] - box[0] + 2 * pad);
  const w = 1000, h = Math.round((box[3] - box[1] + 2 * pad) * s);
  const px = (p: Ring) => [Math.round((p.x - x0) * s), Math.round((p.y - y0) * s)];
  const pathOf = (polys: Poly[], minArea: number): string => polys.map((poly) => {
    const rings = metres(poly).map((r) => {
      const pts = r.map(px).filter((q, i, a) => i === 0 || q[0] !== a[i - 1][0] || q[1] !== a[i - 1][1]);
      return pts.length >= 3 ? pts : null;
    });
    const outer = rings[0];
    if (!outer || ringArea(outer.map(([x, y]) => ({ x, y }))) < minArea) return '';
    return rings.filter((r): r is number[][] => !!r).map((r) => `M${r.map((q) => q.join(' ')).join('L')}Z`).join('');
  }).join('');
  const items = sido.map((f) => {
    const [lo, la, irM] = f.properties.l;
    const [lx, ly] = px(((): Ring => { const [x, y] = project(lo, la); return { x, y }; })());
    return { id: f.properties.id, code: f.properties.sido, name: f.properties.name, d: pathOf(polysOf(f.geometry), 1), lx, ly, ir: +(irM * s).toFixed(1) };
  });
  const out = pathOf(outFc.flatMap((f) => polysOf(f.geometry)), 1);
  return { w, h, items, out };
}
