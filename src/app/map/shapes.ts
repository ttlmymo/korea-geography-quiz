// 경계(TopoJSON) → 화면에 그릴 path 와 판정용 다각형(설계서 5.2). 칸·한강 띠·이웃 땅은 같은 위상이라 경계 호를 함께 쓴다:
// 칸끼리 = 가는 선, 칸과 한강·해안·다른 시도와의 경계 = 굵은 선(지역 외곽선). 공유 호는 한 번씩만 그린다.
// 과·묶음에 따라 달라지는 선(과 안 경계, 묶음 둘레, 칸마다 굵은 테두리)도 칸마다 그리지 않고 메쉬 path 하나로 만든다(동 단위 수백 칸에서도 가볍게)
import { feature, mesh } from 'topojson-client';
import type { LabelsFile, Region } from '../types.ts';
import { FINGER_PX, type TapProbe } from '../core/judge.ts';
import { project, type Box } from './project.ts';
import { edgeDist, inside } from './poly.ts';

export { edgeDist, inside };

type Pos = number[];
interface Geo { type: string; coordinates: any }
interface TopoGeom { type: string; arcs?: unknown; properties?: Record<string, string> }
export interface Topology { type: 'Topology'; objects: Record<string, { type: 'GeometryCollection'; geometries: TopoGeom[] }>; arcs: unknown[] }

export interface Cell {
  id: string;
  rings: Float64Array[];   // 판정용(반올림 안 함) x0,y0,x1,y1…
  box: Box;
  d: string;               // 그리기용(1m 로 반올림)
  label: [number, number]; // 이름표 점
  r: number;               // 내접원 반지름(m)
}

/** 먼 섬(동경 125.9도 서쪽: 백령·대청·연평). 본 지도 범위 밖이라 '섬 상자'에 따로 그린다. 파이프라인과 같은 기준(바깥 고리 평균 경도) */
export const FAR_LON = 125.9;
export interface FarPart { id: string; d: string; rings: Float64Array[] }

export interface Shapes {
  ids: string[];
  cells: Map<string, Cell>;
  box: Box;           // 공부 칸 전체
  outD: string;       // 이웃 땅(다른 시도·북한). 이웃 땅끼리 경계는 만들지 않는다(합본 디자인 — 이웃 땅은 바탕색 한 덩어리)
  waterD: string;     // 한강 띠
  water: Float64Array[];
  edgeD: string;      // 칸끼리
  bankD: string;      // 칸과 한강 사이
  rimD: string;       // 해안·다른 시도와의 경계
  /**
   * 칸 묶음(과)의 바깥 경계: 묶음 안과 밖을 가르는 칸끼리 경계 + 해안·시도 경계.
   * bank 를 켜면 한강 쪽 변도 넣는다(합본 디자인: 묶음 둘레는 강가도 굵다). 끄면 한강 쪽은 뺀다
   */
  rimOf(ids: ReadonlySet<string>, opt?: { bank?: boolean }): string;
  /** 묶음 안 칸끼리의 경계(과 안의 가는 선). 모든 칸이면 edgeD 와 같다 */
  innerOf(ids: ReadonlySet<string>): string;
  /**
   * 묶음 칸들의 모든 변: 칸끼리·한강 쪽·해안·시도 경계('칸마다 굵은 테두리'용). 두 칸이 함께 쓰는 변도 한 번만.
   * bank: false 를 주면 한강 쪽 변은 뺀다(강가는 bankOf 로 따로 그어 강이 좁게 보일 때 가늘게 낮춘다)
   */
  outlineOf(ids: ReadonlySet<string>, opt?: { bank?: boolean }): string;
  /** 묶음 칸과 한강 사이의 변(묶음의 강가). 강에 닿지 않는 묶음이면 '' */
  bankOf(ids: ReadonlySet<string>): string;
  /** 먼 섬이 있으면 그 조각들과 범위 */
  far: { box: Box; parts: FarPart[] } | null;
  /** 맥락 이름(설계서 5.2 층 7): 이웃 땅·한강의 이름과 자리(파이프라인이 lp 로 싣는다) */
  names: { text: string; x: number; y: number; kind: 'out' | 'water'; sido: string }[];
}

/** '서울특별시' → '서울', '강원특별자치도' → '강원도'. 지도 위 이름은 짧게 */
export const shortSido = (name: string) => name.replace(/특별자치도$/, '도').replace(/(특별자치시|특별시|광역시)$/, '');

const polysOf = (g: Geo | null): Pos[][][] => (!g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
const linesOf = (g: Geo | null): Pos[][] => (!g ? [] : g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []);

function lineD(line: Pos[], close: boolean): string {
  const n = close && line.length > 1 ? line.length - 1 : line.length;   // 닫힌 고리의 마지막 점(= 첫 점)은 Z 로
  let s = '';
  for (let i = 0; i < n; i++) {
    const [x, y] = project(line[i][0], line[i][1]);
    s += (i ? ' ' : 'M') + Math.round(x) + ' ' + Math.round(y);
  }
  return close ? s + 'Z' : s;
}
const polyD = (g: Geo | null) => polysOf(g).map((p) => p.map((r) => lineD(r, true)).join('')).join('');
const meshD = (g: Geo | null) => linesOf(g).map((l) => lineD(l, false)).join('');

function ringsOf(g: Geo | null): Float64Array[] {
  const out: Float64Array[] = [];
  for (const p of polysOf(g)) for (const r of p) {
    const a = new Float64Array(r.length * 2);
    r.forEach(([lon, lat], i) => { const [x, y] = project(lon, lat); a[2 * i] = x; a[2 * i + 1] = y; });
    out.push(a);
  }
  return out;
}

function boxOfRings(rings: Float64Array[]): Box {
  const b: Box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings) for (let i = 0; i < r.length; i += 2) {
    if (r[i] < b[0]) b[0] = r[i];
    if (r[i] > b[2]) b[2] = r[i];
    if (r[i + 1] < b[1]) b[1] = r[i + 1];
    if (r[i + 1] > b[3]) b[3] = r[i + 1];
  }
  return b;
}

/** 칸 층·id 이름·곳 목록. 보통은 지역(units.json)에서 오고, 동 층(P1·부하 시험)은 따로 준다 */
export interface LayerSpec { layer: string; idKey: string; ids: string[] }

export const specOf = (region: Region): LayerSpec => ({
  layer: region.layer, idKey: region.layer === 'si' ? 'siId' : 'sggId', ids: region.items.map((it) => it.id),
});

/**
 * 이웃 땅은 지역 둘레만 잘라 담았다(파이프라인 CTX_MARGIN). 화면이 그보다 넓으면(세로 휴대폰에 지역 전체 등) 잘린 변이 직선으로 보이므로,
 * 잘린 변에 땅이 닿은 구간만 바깥으로 길게 늘여 그린다. 바다가 닿은 구간은 그대로 바다다. 변마다 고리와 만나는 점을 구해 짝홀로 구간을 찾는다
 */
function extendD(rings: Float64Array[], box: Box): string {
  if (!rings.length || !isFinite(box[0])) return '';
  const W = box[2] - box[0], H = box[3] - box[1];
  const eps = Math.max(W, H) * 1e-4, far = Math.max(W, H) * 5;
  const spans = (horizontal: boolean, at: number): [number, number][] => {
    const xs: number[] = [];
    for (const r of rings) {
      for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
        const [a0, a1, b0, b1] = horizontal ? [r[j], r[j + 1], r[i], r[i + 1]] : [r[j + 1], r[j], r[i + 1], r[i]];
        if ((a1 > at) !== (b1 > at)) xs.push(a0 + ((at - a1) * (b0 - a0)) / (b1 - a1));
      }
    }
    xs.sort((a, b) => a - b);
    const out: [number, number][] = [];
    for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > eps) out.push([xs[i], xs[i + 1]]);
    return out;
  };
  const rect = (x0: number, y0: number, x1: number, y1: number) =>
    `M${Math.round(x0)} ${Math.round(y0)} ${Math.round(x1)} ${Math.round(y0)} ${Math.round(x1)} ${Math.round(y1)} ${Math.round(x0)} ${Math.round(y1)}Z`;
  const top = spans(true, box[1] + eps), bottom = spans(true, box[3] - eps);
  const left = spans(false, box[0] + eps), right = spans(false, box[2] - eps);
  let d = '';
  for (const [a, b] of top) d += rect(a, box[1] - far, b, box[1] + eps);
  for (const [a, b] of bottom) d += rect(a, box[3] - eps, b, box[3] + far);
  for (const [a, b] of left) d += rect(box[0] - far, a, box[0] + eps, b);
  for (const [a, b] of right) d += rect(box[2] - eps, a, box[2] + far, b);
  // 두 변이 모두 땅으로 끝나는 모서리는 바깥 사분면도 땅
  const has = (sp: [number, number][], v: number) => sp.some(([a, b]) => a <= v + eps * 2 && b >= v - eps * 2);
  if (has(top, box[0]) && has(left, box[1])) d += rect(box[0] - far, box[1] - far, box[0] + eps, box[1] + eps);
  if (has(top, box[2]) && has(right, box[1])) d += rect(box[2] - eps, box[1] - far, box[2] + far, box[1] + eps);
  if (has(bottom, box[0]) && has(left, box[3])) d += rect(box[0] - far, box[3] - eps, box[0] + eps, box[3] + far);
  if (has(bottom, box[2]) && has(right, box[3])) d += rect(box[2] - eps, box[3] - eps, box[2] + far, box[3] + far);
  return d;
}

export function buildShapes(topo: Topology, spec: LayerSpec, labels: LabelsFile): Shapes {
  const layer = topo.objects[spec.layer];
  if (!layer) throw new Error(`경계 파일에 ${spec.layer} 층이 없음`);
  const idKey = spec.idKey;
  const tag = (gs: TopoGeom[] | undefined, k: string) => (gs ?? []).map((g): TopoGeom => ({ ...g, properties: { ...g.properties, k } }));
  const cellsT = tag(layer.geometries, 'c');
  const waterT = tag(topo.objects.water?.geometries, 'w');
  const outT = tag(topo.objects.out?.geometries, 'o');
  const all = { type: 'GeometryCollection', geometries: [...cellsT, ...waterT, ...outT] };
  const cellsObj = { type: 'GeometryCollection', geometries: cellsT };
  const outObj = { type: 'GeometryCollection', geometries: outT };
  const waterObj = { type: 'GeometryCollection', geometries: waterT };
  const k = (g: TopoGeom) => g.properties?.k;
  const idOf = (g: TopoGeom) => g.properties?.[idKey] ?? '';

  const want = new Set(spec.ids);
  const cells = new Map<string, Cell>();
  const farParts: FarPart[] = [];
  for (const f of feature(topo, cellsObj).features as { properties: Record<string, string>; geometry: Geo }[]) {
    const id = f.properties[idKey];
    if (!want.has(id)) continue;
    const rings = ringsOf(f.geometry);
    const far = polysOf(f.geometry).filter((p) => p[0].reduce((a, c) => a + c[0], 0) / p[0].length < FAR_LON);
    if (far.length) {
      const g = { type: 'MultiPolygon', coordinates: far };
      farParts.push({ id, d: polyD(g), rings: ringsOf(g) });
    }
    const l = labels[id];
    if (!l) throw new Error(`이름표 점 없음: ${id}`);
    cells.set(id, { id, rings, box: boxOfRings(rings), d: polyD(f.geometry), label: project(l[0], l[1]), r: l[2] });
  }
  const ids = spec.ids.filter((id) => cells.has(id));
  if (ids.length !== spec.ids.length) throw new Error(`경계에 없는 곳: ${spec.ids.filter((id) => !cells.has(id)).join(', ')}`);
  const water = feature(topo, waterObj).features.map((f: { geometry: Geo }) => f.geometry);
  const outGeoms = feature(topo, outObj).features.map((f: { geometry: Geo }) => f.geometry);
  const outRings = outGeoms.flatMap(ringsOf);
  const landRings = [...outRings, ...ids.flatMap((id) => cells.get(id)!.rings)];
  // 묶음별 메쉬는 문제마다 다시 불리므로 기억해 둔다(묶음 = 과·화면·복습할 곳이라 가짓수가 적다)
  const memo = new Map<string, string>();
  const meshOf = (kind: string, set: ReadonlySet<string>, make: () => string): string => {
    if (!set.size) return '';
    const key = kind + [...set].sort().join(',');
    let d = memo.get(key);
    if (d === undefined) {
      if (memo.size > 120) memo.clear();
      memo.set(key, d = make());
    }
    return d;
  };
  const inSet = (g: TopoGeom, set: ReadonlySet<string>) => k(g) === 'c' && set.has(idOf(g));

  return {
    ids,
    cells,
    box: boxOfRings(ids.flatMap((id) => cells.get(id)!.rings)),
    outD: outGeoms.map(polyD).join('') + extendD(landRings, boxOfRings(outRings.length ? landRings : [])),
    waterD: water.map(polyD).join(''),
    water: water.flatMap(ringsOf),
    edgeD: meshD(mesh(topo, cellsObj, (a, b) => a !== b)),
    bankD: meshD(mesh(topo, all, (a, b) => (k(a) === 'c' && k(b) === 'w') || (k(a) === 'w' && k(b) === 'c'))),
    rimD: meshD(mesh(topo, all, (a, b) => (a === b ? k(a) === 'c' : (k(a) === 'c' && k(b) === 'o') || (k(a) === 'o' && k(b) === 'c')))),
    far: farParts.length ? { box: boxOfRings(farParts.flatMap((p) => p.rings)), parts: farParts } : null,
    names: [...outT.map((g) => ({ g, kind: 'out' as const, sido: g.properties?.sido ?? '', text: shortSido(g.properties?.name ?? '') })),
      ...waterT.map((g) => ({ g, kind: 'water' as const, sido: 'water', text: g.properties?.name ?? '한강' }))]
      .filter(({ g, text }) => text && Array.isArray((g.properties as { lp?: unknown } | undefined)?.lp))
      .map(({ g, kind, sido, text }) => {
        const [lon, lat] = (g.properties as unknown as { lp: [number, number] }).lp;
        const [x, y] = project(lon, lat);
        return { text, x, y, kind, sido };
      }),
    rimOf(set, opt) {
      const bank = !!opt?.bank;
      return meshOf(bank ? 'rb:' : 'r:', set, () => meshD(mesh(topo, all, (a, b) => {
        const ia = inSet(a, set), ib = inSet(b, set);
        if (a === b) return ia;
        if (!bank && (k(a) === 'w' || k(b) === 'w')) return false;
        return ia !== ib;
      })));
    },
    innerOf(set) {
      return meshOf('i:', set, () => meshD(mesh(topo, cellsObj, (a, b) => a !== b && set.has(idOf(a)) && set.has(idOf(b)))));
    },
    outlineOf(set, opt) {
      const bank = opt?.bank !== false;
      return meshOf(bank ? 'o:' : 'od:', set, () => meshD(mesh(topo, all, (a, b) =>
        (inSet(a, set) || inSet(b, set)) && (bank || (k(a) !== 'w' && k(b) !== 'w')))));
    },
    bankOf(set) {
      return meshOf('b:', set, () => meshD(mesh(topo, all, (a, b) => (inSet(a, set) && k(b) === 'w') || (k(a) === 'w' && inSet(b, set)))));
    },
  };
}

/**
 * 누른 점(지도 단위)을 판정 입력으로 잰다. upp = 화면 1px 에 해당하는 지도 단위.
 * active = 지금 고를 수 있는 밝은 칸(손가락 반경 후보는 이 칸들만)
 */
export function probeAt(s: Shapes, x: number, y: number, upp: number, active: ReadonlySet<string>): TapProbe {
  const rad = FINGER_PX * upp;
  let hit: string | null = null;
  let depth = 0;
  const near: string[] = [];
  for (const id of s.ids) {
    const c = s.cells.get(id)!;
    const b = c.box;
    if (x < b[0] - rad || x > b[2] + rad || y < b[1] - rad || y > b[3] + rad) continue;
    const isIn = inside(c.rings, x, y);
    const d = edgeDist(c.rings, x, y);
    if (isIn) {
      hit = id;
      depth = d / upp;
    }
    if (active.has(id) && (isIn || d <= rad)) near.push(id);
  }
  return { hit, depth, near, water: hit ? null : inside(s.water, x, y) ? 'river' : 'sea' };
}
