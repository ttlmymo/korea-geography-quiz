// 경계(TopoJSON) → 화면에 그릴 path 와 판정용 다각형(설계서 5.2). 칸·한강 띠·이웃 땅은 같은 위상이라 경계 호를 함께 쓴다:
// 칸끼리 = 가는 선, 칸과 한강·해안·다른 시도와의 경계 = 굵은 선(지역 외곽선). 공유 호는 한 번씩만 그린다.
// 과·묶음에 따라 달라지는 선(과 안 경계, 묶음 둘레, 칸마다 굵은 테두리)도 칸마다 그리지 않고 메쉬 path 하나로 만든다(동 단위 수백 칸에서도 가볍게)
import { feature, mesh } from 'topojson-client';
import type { CtxCell, LabelsFile, Region } from '../types.ts';
import { FINGER_PX, type TapProbe } from '../core/judge.ts';
import { project, type Box } from './project.ts';
import { edgeDist, inside } from './poly.ts';
import { sidoByCode, sidoOf } from '../sidos.ts';

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

/**
 * 먼 섬(동경 125.9도 서쪽: 백령·대청·연평). 본 지도 범위 밖이라 '섬 상자'에 따로 그린다. 기준은 덩어리 바깥 고리 평균 경도로,
 * 지역 표 far 가 { lonLt: 125.9 } 인 수도권(서울·인천·경기)의 파이프라인 규칙과 같다.
 * far 가 기본 규칙(null — 그 시·도 가장 큰 땅 상자 +30km 밖, 계획서 N8)인 지역은 앱이 그 규칙을 따로 읽지 않는다(E13 검수):
 *  - 기본 규칙의 먼 덩어리(공개 지역은 제주 추자면, 전북 군산 옥도면 한 덩어리)는 파이프라인이 지역 범위(fit)에서 빼서 지역 지도에 보이지 않는다
 *    (추자면은 제주시 동 단원 지도의 섬 상자에 보인다)
 *  - 125.9 서쪽 덩어리가 있는 지역(충남 태안 근흥면 일부 — E14)은 앱만 섬 상자로 옮겨 파이프라인 fit 과 어긋날 수 있다 → 그 지역은 지역 표 far 를
 *    { lonLt: 125.9 } 로 맞추거나, 앱이 지역 표 규칙을 읽게 고친다
 *  - 통째로 먼 섬인 곳(경북 울릉군)은 지역 과·화면 insets(섬 상자, ui/maps.ts wholeView)로 보인다
 * E16: 지역 표 far 가 { lonLt } 인 지역은 그 경도를 쓴다(farLonOf). 전남광주는 125.7 — 125.9 면 신안 도초면 우이도(125.83~)·진도 조도면(125.84~) 같은
 * 가까운 섬까지 먼 섬 상자로 옮겨졌다(파이프라인 fit 은 지역 표 규칙이라 어긋남). 흑산면 덩어리(125.08~125.47)만 상자에 든다. 다른 지역은 전과 같은 125.9
 */
export const FAR_LON = 125.9;
/** 지역(또는 단원 키 '{지역}/gu')의 먼 섬 경도: 지역 표 far.lonLt, 없으면(far null — 기본 규칙) FAR_LON */
export const farLonOf = (key?: string): number => { const f = key ? sidoOf(key.split('/')[0])?.far : null; return typeof f?.lonLt === 'number' ? f.lonLt : FAR_LON; };
export interface FarPart { id: string; d: string; rings: Float64Array[] }

export interface Shapes {
  ids: string[];
  cells: Map<string, Cell>;
  box: Box;           // 공부 칸 전체
  outD: string;       // 이웃 땅(다른 시도·북한). 이웃 땅끼리 경계는 만들지 않는다(합본 디자인 — 이웃 땅은 바탕색 한 덩어리)
  /**
   * 먼 이웃 땅(topo far 층 — 2026-11-17 바다 표현, pipeline/build-geo.mjs farLand): 이웃 땅(out)이 담기지 않은 범위에서 화면에 보일 수 있는 땅을 거칠게 실은 것.
   * 이웃 땅 밑에 같은 면색으로 깐다(farD → outD → 칸). 칸·이웃 땅과 위상을 함께 쓰지 않아(조금 겹친다) 선·맥락 이름에는 쓰지 않는다. 옛 판(far 층 없음)은 ''
   */
  farD: string;
  /**
   * 이웃 땅·먼 이웃 땅의 고리(지도 단위 — 2026-11-17 바다 표현): 바다 이름 자리(map/sea.ts 땅 판정), 섬 상자·먼 섬 상자·위치 지도에 이웃 땅을 그릴 때 쓴다.
   * 둘은 겹치고 고리 방향도 다를 수 있어 늘 따로 다룬다(한 path·한 짝홀 판정에 섞지 않는다).
   * outExt = 잘린 변 밖으로 늘린 땅(extendRects — outD 뒤쪽 조각과 같은 네모), outBox = 그 변을 정한 상자(이웃 땅과 먼 이웃 땅 전체. 둘 다 없으면 null)
   */
  outRings: Float64Array[];
  farRings: Float64Array[];
  outExt: Box[];
  outBox: Box | null;
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
  /**
   * 맥락 이름(설계서 5.2 층 7): 이웃 땅·한강의 이름과 자리(파이프라인이 lp 로 싣는다). 동 단원 지도의 이웃 땅은 id·en(판 .2 — 영어 화면이 쓴다, EN_EMD 5.2),
   * 일반구 단원의 나머지 칸은 id(그 칸의 시·군 곳 id)와 rest
   */
  /** land = 그 이름의 땅 도형(이웃 땅 이름만 — 글자가 그 땅 안에 드는 자리를 찾는다, svgmap ctxPlaced) */
  names: (CtxCell & { x: number; y: number; kind: 'out' | 'water'; land?: Float64Array[] })[];
}

const CITY_END = /(특별자치시|광역시|특별시)$/;
/**
 * 이웃 시·도 이름표(맥락 이름)의 한국어 글. code = 원자료 시·도 코드(이웃 땅의 sido 칸).
 *  - 시 꼴(특별시·광역시·특별자치시·통합특별시)은 앱이 그 시·도를 부르는 짧은 이름(지역 표 ko): '서울특별시' → '서울',
 *    '전남광주통합특별시' → 법정 약칭 '광주특별시'(특별법 제7조 제1항)
 *  - 도 꼴(도·특별자치도)은 법정 이름 그대로: '경기도', '강원특별자치도'
 * 2026-11-15 사용자 결정('모든 명칭은 법이 정한 명칭으로')으로 바꿈. 전에는 꼬리만 떼어 '전남광주통합'(법정 이름도 약칭도 아님)이 되었고,
 * 특별자치도를 '강원도'·'제주도'(폐지된 옛 이름)·'전북도'로 줄였다.
 * 지역 표에 없는 이름(시험용 가짜 판 등)은 시 꼴 꼬리만 떼고, 약칭을 모르는 통합특별시는 정식 이름 그대로 둔다
 */
export const shortSido = (name: string, code?: string): string => {
  if (!CITY_END.test(name)) return name;
  const row = code ? sidoByCode(code) : undefined;
  if (row && row.full === name) return row.ko;
  return /통합특별시$/.test(name) ? name : name.replace(CITY_END, '');
};

/**
 * 지도에 적는 이웃 시·도 이름(2026-11-17 사용자 결정 — 결정표 D96): 법이 정한 정식 이름 그대로('서울특별시'·'세종특별자치시'·'경기도'),
 * 전남광주통합특별시만 법정 약칭 '광주특별시'. 이름이 길어 이웃 땅에 들지 않으면 그 땅에 점을 찍고 빈자리의 이름까지 선을 잇는다(svgmap layCtxLead).
 * 전에는 시 꼴을 짧은 이름으로 줄였다(shortSido — '서울').
 */
export const ctxSido = (name: string, code?: string): string => (/통합특별시$/.test(name) ? shortSido(name, code) : name);

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

/**
 * 칸 층·id 이름·곳 목록. 지역(units.json)과 동 단원(단원 파일 emd/{코드}.topo.json 의 emd 층, id 이름 'id')에서 온다.
 * far = 경도 FAR_LON 서쪽 덩어리를 '먼 섬' 상자로 따로 그리는가(지역 지도만 — 동 단원은 과·화면의 insets 로 섬마다 상자를 둔다, 계획서 N8·E5)
 */
export interface LayerSpec {
  layer: string; idKey: string; ids: string[]; far?: boolean;
  /** 먼 섬 경도(덩어리 바깥 고리 평균 경도가 이보다 작으면 먼 섬 상자로). 없으면 FAR_LON — specOf 가 지역 표에서 채운다(E16) */
  farLon?: number;
  /**
   * 층의 나머지 칸(ids 밖)을 이웃 땅으로 그린다(일반구 단원 — 경기 -sgg 의 sgg 층에서 일반구 24곳만 칸이고 다른 시·군은 맥락, 계획서 N5 · E7).
   * 이름(sggName)과 이름표 점(labels)이 있으면 맥락 이름으로도 싣는다
   */
  rest?: boolean;
}

// 시·도 층(전국 시·도 지도 sido.topo.json — 지역 고르기·시·도 단원 korea, 계획서 N23 · E8): 칸 id 는 'id'(kr:sido:{코드}), 먼 섬 상자 없음(독도·마라도도 본 지도에)
// 과 없는 지역(세종·제주 — layer 'emd' 인데 unit 이 없음, 계획서 N4)의 지역 지도는 지역 -sgg 파일의 시·군·구 층(칸 = 단원)
export const specOf = (region: Pick<Region, 'layer' | 'items'> & { unit?: Region['unit']; key?: string }): LayerSpec => (region.layer === 'emd' && region.unit) || region.layer === 'sido'
  ? { layer: region.layer, idKey: 'id', ids: region.items.map((it) => it.id), far: false }
  : region.layer === 'emd'
    ? { layer: 'sgg', idKey: 'sggId', ids: region.items.map((it) => it.id), farLon: farLonOf(region.key) }
    : { layer: region.layer, idKey: region.layer === 'si' ? 'siId' : 'sggId', ids: region.items.map((it) => it.id), farLon: farLonOf(region.key), ...(region.unit?.gu ? { rest: true } : {}) };

/** 네모 [x0, y0, x1, y1] 의 path d(1m 로 반올림) */
export const rectD = ([x0, y0, x1, y1]: Box) =>
  `M${Math.round(x0)} ${Math.round(y0)} ${Math.round(x1)} ${Math.round(y0)} ${Math.round(x1)} ${Math.round(y1)} ${Math.round(x0)} ${Math.round(y1)}Z`;
/**
 * 이웃 땅은 지역 둘레만 잘라 담았다(파이프라인 CTX_MARGIN). 화면이 그보다 넓으면(세로 휴대폰에 지역 전체 등) 잘린 변이 직선으로 보이므로,
 * 잘린 변에 땅이 닿은 구간만 바깥으로 길게 늘여 그린다. 바다가 닿은 구간은 그대로 바다다.
 * rings = 이웃 땅 고리, box = 그 상자(이웃 땅을 자른 상자). 잘린 자리는 고리가 그 변을 따라 닫히므로, 변 위에 놓인 선분(두 끝이 모두 변 위)을 모아 구간으로 삼는다.
 * 늘린 땅을 네모들(지도 단위)로 돌려준다 — 그리기는 rectD, 바다 판정(map/sea.ts)·섬 상자·위치 지도도 같은 네모를 쓴다.
 * 2026-11-17(바다 표현) 전에는 칸까지 넣은 상자의 변 안쪽에서 고리와 만나는 점으로 구간을 찾았다. 바탕이 이웃 땅과 같은 색일 때는 보이지 않던 두 가지가 드러나 바꿨다:
 *  · 칸이 상자 끝을 정하는 지도(전국 지도의 독도·백령도, 먼 섬이 있는 지역)는 그 끝 섬에서 가는 땅 띠가 변 밖으로 뻗었다(끝에 닿은 한 점도 구간으로 잡혔다)
 *  · 그런 지도는 이웃 땅의 잘린 변이 상자 안쪽에 있어 늘려지지 않았다
 */
export function extendRects(rings: Float64Array[], box: Box): Box[] {
  if (!rings.length || !isFinite(box[0])) return [];
  const W = box[2] - box[0], H = box[3] - box[1];
  const eps = Math.max(W, H) * 1e-4, far = Math.max(W, H) * 5;
  // 변마다 그 위에 놓인 선분 [시작, 끝](변을 따라 잰 좌표)
  const on: Record<'t' | 'b' | 'l' | 'r', [number, number][]> = { t: [], b: [], l: [], r: [] };
  const near = (v: number, at: number) => Math.abs(v - at) <= eps;
  for (const r of rings) {
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const x1 = r[j], y1 = r[j + 1], x2 = r[i], y2 = r[i + 1];
      if (near(y1, box[1]) && near(y2, box[1])) on.t.push([Math.min(x1, x2), Math.max(x1, x2)]);
      if (near(y1, box[3]) && near(y2, box[3])) on.b.push([Math.min(x1, x2), Math.max(x1, x2)]);
      if (near(x1, box[0]) && near(x2, box[0])) on.l.push([Math.min(y1, y2), Math.max(y1, y2)]);
      if (near(x1, box[2]) && near(x2, box[2])) on.r.push([Math.min(y1, y2), Math.max(y1, y2)]);
    }
  }
  // 이어진 선분을 한 구간으로(이웃 땅 덩어리끼리 맞닿은 곳도 이어진다). 점처럼 짧은 것은 뺀다
  const spans = (list: [number, number][]): [number, number][] => {
    list.sort((a, b) => a[0] - b[0]);
    const out: [number, number][] = [];
    for (const s of list) {
      const last = out[out.length - 1];
      if (last && s[0] <= last[1] + eps) last[1] = Math.max(last[1], s[1]);
      else out.push([s[0], s[1]]);
    }
    return out.filter(([a, b]) => b - a > eps);
  };
  const top = spans(on.t), bottom = spans(on.b), left = spans(on.l), right = spans(on.r);
  const out: Box[] = [];
  const rect = (x0: number, y0: number, x1: number, y1: number) => { out.push([x0, y0, x1, y1]); };
  for (const [a, b] of top) rect(a, box[1] - far, b, box[1] + eps);
  for (const [a, b] of bottom) rect(a, box[3] - eps, b, box[3] + far);
  for (const [a, b] of left) rect(box[0] - far, a, box[0] + eps, b);
  for (const [a, b] of right) rect(box[2] - eps, a, box[2] + far, b);
  // 두 변이 모두 땅으로 끝나는 모서리는 바깥 사분면도 땅
  const has = (sp: [number, number][], v: number) => sp.some(([a, b]) => a <= v + eps * 2 && b >= v - eps * 2);
  if (has(top, box[0]) && has(left, box[1])) rect(box[0] - far, box[1] - far, box[0] + eps, box[1] + eps);
  if (has(top, box[2]) && has(right, box[1])) rect(box[2] - eps, box[1] - far, box[2] + far, box[1] + eps);
  if (has(bottom, box[0]) && has(left, box[3])) rect(box[0] - far, box[3] - eps, box[0] + eps, box[3] + far);
  if (has(bottom, box[2]) && has(right, box[3])) rect(box[2] - eps, box[3] - eps, box[2] + far, box[3] + far);
  return out;
}

export function buildShapes(topo: Topology, spec: LayerSpec, labels: LabelsFile): Shapes {
  const layer = topo.objects[spec.layer];
  if (!layer) throw new Error(`경계 파일에 ${spec.layer} 층이 없음`);
  const idKey = spec.idKey;
  const tag = (gs: TopoGeom[] | undefined, k: string) => (gs ?? []).map((g): TopoGeom => ({ ...g, properties: { ...g.properties, k } }));
  // 나머지 칸을 이웃 땅으로(spec.rest): 칸 층에서 ids 밖 칸을 떼어 이웃 땅에 넣는다
  const wanted = new Set(spec.ids);
  const restG = spec.rest ? layer.geometries.filter((g) => !wanted.has(g.properties?.[idKey] ?? '')) : [];
  const cellsT = tag(spec.rest ? layer.geometries.filter((g) => wanted.has(g.properties?.[idKey] ?? '')) : layer.geometries, 'c');
  const waterT = tag(topo.objects.water?.geometries, 'w');
  const restT = tag(restG, 'o');
  const outT = [...tag(topo.objects.out?.geometries, 'o'), ...restT];
  const all = { type: 'GeometryCollection', geometries: [...cellsT, ...waterT, ...outT] };
  const cellsObj = { type: 'GeometryCollection', geometries: cellsT };
  const outObj = { type: 'GeometryCollection', geometries: outT };
  const waterObj = { type: 'GeometryCollection', geometries: waterT };
  const k = (g: TopoGeom) => g.properties?.k;
  const idOf = (g: TopoGeom) => g.properties?.[idKey] ?? '';

  const want = new Set(spec.ids);
  const farLon = spec.farLon ?? FAR_LON;
  const cells = new Map<string, Cell>();
  const farParts: FarPart[] = [];
  for (const f of feature(topo, cellsObj).features as { properties: Record<string, string>; geometry: Geo }[]) {
    const id = f.properties[idKey];
    if (!want.has(id)) continue;
    const rings = ringsOf(f.geometry);
    const far = spec.far === false ? [] : polysOf(f.geometry).filter((p) => p[0].reduce((a, c) => a + c[0], 0) / p[0].length < farLon);
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
  // 먼 이웃 땅(far 층): 판 .2 를 2026-11-17 뒤에 다시 만든 것부터 있다(옛 캐시에는 없다 — 그때는 이웃 땅과 늘린 땅만)
  const farGeoms = topo.objects.far ? feature(topo, topo.objects.far).features.map((f: { geometry: Geo }) => f.geometry) : [];
  const farRings = farGeoms.flatMap(ringsOf);
  const landRings = [...outRings, ...farRings];
  const outBox = landRings.length ? boxOfRings(landRings) : null;
  const outExt = outBox ? extendRects(landRings, outBox) : [];
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
    outD: outGeoms.map(polyD).join('') + outExt.map(rectD).join(''),
    farD: farGeoms.map(polyD).join(''),
    outRings,
    farRings,
    outExt,
    outBox,
    waterD: water.map(polyD).join(''),
    water: water.flatMap(ringsOf),
    edgeD: meshD(mesh(topo, cellsObj, (a, b) => a !== b)),
    bankD: meshD(mesh(topo, all, (a, b) => (k(a) === 'c' && k(b) === 'w') || (k(a) === 'w' && k(b) === 'c'))),
    rimD: meshD(mesh(topo, all, (a, b) => (a === b ? k(a) === 'c' : (k(a) === 'c' && k(b) === 'o') || (k(a) === 'o' && k(b) === 'c')))),
    far: farParts.length ? { box: boxOfRings(farParts.flatMap((p) => p.rings)), parts: farParts } : null,
    names: [...outT.map((g) => ({ g, kind: 'out' as const, sido: g.properties?.sido ?? '', text: ctxSido(g.properties?.name ?? '', g.properties?.sido) })),
      ...waterT.map((g) => ({ g, kind: 'water' as const, sido: 'water', text: g.properties?.name ?? '한강' }))]
      .filter(({ g, text }) => text && Array.isArray((g.properties as { lp?: unknown } | undefined)?.lp))
      .map(({ g, kind, sido, text }) => {
        const [lon, lat] = (g.properties as unknown as { lp: [number, number] }).lp;
        const [x, y] = project(lon, lat);
        // 동 단원 지도의 이웃 땅(emd/{코드}.topo.json out): 시·군·구 id 와 영어 이름(판 .2 — 옛 캐시에는 en 이 없다)
        const id = kind === 'out' ? g.properties?.id : undefined, en = kind === 'out' ? g.properties?.en : undefined;
        const land = kind === 'out' ? ringsOf((feature(topo, g) as { geometry: Geo }).geometry) : [];
        return { text, x, y, kind, sido, ...(typeof id === 'string' ? { id } : {}), ...(typeof en === 'string' ? { en } : {}), ...(land.length ? { land } : {}) };
      })
      // 이웃 땅으로 돌린 나머지 칸(spec.rest)의 이름: 칸 이름(sggName)을 그 칸의 이름표 점에('의왕시'). id = 칸 id(영어 화면은 그 곳의 레지스트리 이름 — text/ui.ts ctxNamer)
      .concat(restT.flatMap((g) => {
        const id = g.properties?.[idKey] ?? '', l = labels[id], text = g.properties?.sggName ?? '';
        if (!l || !text) return [];
        const [x, y] = project(l[0], l[1]);
        const land = ringsOf((feature(topo, g) as { geometry: Geo }).geometry);
        return [{ text, x, y, kind: 'out' as const, sido: g.properties?.sido ?? '', id, rest: true, ...(land.length ? { land } : {}) }];
      })),
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
  // 강은 그린 강만(칸과 맞닿은 강 — bankD 있음). 칸과 맞닿지 않아 그리지 않는 강 띠(인천 지도 구석의 한강 등)는 화면에서 이웃 땅색으로 메워져 있어
  // (2026-11-17 바다 표현 — svgmap) 이웃 땅·바다와 같은 'sea'(판정 outside '밝은 칸 중에서 골라 주세요')로 넘긴다. 전에는 '땅을 눌러 주세요'(river)가 나왔다
  return { hit, depth, near, water: hit ? null : s.bankD !== '' && inside(s.water, x, y) ? 'river' : 'sea' };
}
