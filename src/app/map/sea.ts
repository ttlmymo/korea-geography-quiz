// 바다(2026-11-17 사용자 결정 '모든 지도에 바다를 표현, 바다 색은 강보다 조금 더 파란색, 바다 이름을 넣는다' — docs/SEA_PLAN_2026-11-16.md):
// 지도 바탕을 바다색(--map-sea)으로 칠하고, 바다 이름(서해·남해·동해)을 바다 위 빈자리에 둔다. 여기는 계산만(그리기·DOM 은 svgmap).
//  · 어느 바다인가(seaOf): 경도·위도로 가른다. 경계 둘레 띠에는 이름을 두지 않는다
//  · 땅 판정(landMask): 지도마다 한 번, 칸·이웃 땅·강을 거친 격자에 칠해 둔다(바다 이름 자리를 고를 때마다 다각형을 훑지 않게)
//  · 자리(seaSpots): 보이는 범위를 화면 px 격자로 훑어, 땅·강·이름표·맥락 이름·화면에 붙은 것에서 가장 먼 빈 바다에 글자 상자를 둔다.
//    자리가 없으면 그리지 않는다(바다가 거의 안 보이는 지도 — 서울 등)
import type { Box } from './project.ts';
import { unproject } from './project.ts';
import { rectD, type Shapes } from './shapes.ts';

export type SeaKey = 'w' | 's' | 'e';
/**
 * 바다 이름(한국어). 영어는 text/ui.ts UI_EN.ctxName('Yellow Sea'·'South Sea'·'East Sea').
 * 서쪽 바다는 '황해'(2026-11-17 사용자 결정 '황해가 맞는 표현이면 그걸로' — 처음에는 '서해'로 두었다). 근거: 정부 자료는 서쪽 바다를 '황해'로 쓴다 —
 *  · 국토지리정보원 '대한민국 국가지도집' 국문 2권(2020) '해양 현황'(nationalatlas.ngii.go.kr/pages/page_2235.php): 세 바다를 '황해'·'남해'·'동해'로 쓰고, '서해'는 '서해안'처럼 바닷가를 가리킬 때만 쓴다
 *  · 국립해양조사원 관계자 설명(헤럴드경제 2026-01-20 보도): 1961년 국무원 고시로 공식화한 지명은 '서해'가 아니라 '황해'(고시 원문은 직접 확인하지 못함)
 * 과 이름의 '서해 바닷가'(전북·전남광주)는 바닷가를 가리키는 말이라 그대로다(국가지도집도 '서해안'). 아래 주석·코드의 '서해'는 서쪽 바다(열쇠 w)를 가리키는 말.
 * 영어는 같은 국가지도집 영문판 'Ocean'(pages/page_745.php)의 'Yellow Sea'·'East Sea'(정부가 나라 밖에 쓰는 이름), 남쪽 바다는 그 쪽이 'South Sea' 와 'Korea Strait' 를 함께 쓴다 — 한국어 '남해'의 짝 'South Sea'
 */
export const SEA_KO: Record<SeaKey, string> = { w: '황해', s: '남해', e: '동해' };
/** 맥락 이름 함수(svgmap opt.ctxName)에 넘기는 열쇠: CtxCell.sido = 'sea:w' 등 */
export const seaCode = (k: SeaKey) => `sea:${k}`;

/**
 * 경도·위도의 바다(땅 판정은 따로 — 땅 위 점에도 답한다). null = 경계 둘레(이름을 두지 않는 띠).
 * 가르는 곳은 나라 안에서 널리 쓰는 구분 — 서해·남해는 전남 해남 땅끝, 남해·동해는 부산 오륙도. 기관마다 선이 조금씩 달라
 * (남해·동해는 국립해양조사원이 오륙도 둘레, 해양수산부가 울산 태화강 하구를 쓴 적이 있다) 그 둘레는 띠로 비운다:
 *  · 북위 35.25도 위: 한반도 서쪽 = 서해, 동쪽 = 동해(그 사이는 땅 — 동경 128도로 가른다)
 *  · 북위 34.85~35.25도(남해안 동쪽·부산): 동경 126.9~129.08도 = 남해, 129.08~129.20도는 띠(오륙도·해운대 앞), 그 동쪽 = 동해. 126.9도 서쪽 = 서해(목포·신안)
 *  · 북위 34.3~34.85도: 해남 반도(동경 126.5~126.65도)가 띠 — 그 서쪽 = 서해(목포·진도 북쪽), 동쪽 = 남해(강진만·완도·고흥·여수·거제 남쪽)
 *  · 북위 34.3도 아래: 땅끝(동경 126.53도 · 북위 34.30도)에서 제주 서쪽 끝 차귀도(126.15도 · 33.31도)로 그은 선(SEA_WS)이 가른다 — 선 둘레 0.1도는 띠,
 *    서쪽 = 서해(진도 남서쪽 — 북위 33.85도 아래는 띠: 제주 지도의 북서쪽 바다에 '서해'를 두지 않는다), 동쪽 = 남해(제주해협·제주)
 *  · 나라 밖 쪽 한계(지도를 줄이거나 끌면 보이는 먼바다 — 2026-11-17 흉내에서 전국 지도를 1.6배로 키우면 '남해'가 대마도 동쪽 일본 야마구치 앞바다에 놓였다):
 *    서해는 동경 123도 동쪽만(그 서쪽 중국 연안·발해는 띠), 남해는 동경 129.3도 서쪽(대마도 동쪽은 띠) · 북위 32.8도 위(제주 남쪽 먼바다 — 동중국해 — 는 띠)만.
 *    동해는 한계를 두지 않는다(부산 기장 앞에서 동쪽·북쪽 모두)
 * 2026-11-17: 처음에는 부산 앞 띠를 129.05~129.35도, 진도 둘레 띠를 126.0~126.65도로 넓게 두고 북위 34도에서 서해·남해를 잘랐더니,
 * 휴대폰 부산·전남 지도는 보이는 바다가 거의 띠이거나 잘려서 이름을 둘 자리가 없었다
 */
const SEA_WS = (lat: number) => 126.53 - (34.3 - Math.max(lat, 33.31)) * 0.384;
/** 나라 밖 쪽 한계: 서해의 서쪽 끝(동경) · 남해의 동쪽 끝(동경) · 남해의 남쪽 끝(북위) */
const SEA_W_WEST = 123, SEA_S_EAST = 129.3, SEA_S_SOUTH = 32.8;
export function seaOf(lon: number, lat: number): SeaKey | null {
  const w: SeaKey | null = lon >= SEA_W_WEST ? 'w' : null;
  if (lat >= 35.25) return lon >= 128 ? 'e' : w;
  if (lat >= 34.85) return lon >= 129.2 ? 'e' : lon >= 129.08 ? null : lon >= 126.9 ? 's' : w;
  if (lat >= 34.3) return lon >= SEA_S_EAST ? null : lon >= 126.65 ? 's' : lon < 126.5 ? w : null;
  const x = SEA_WS(lat);
  if (lon >= x + 0.1) return lon >= SEA_S_EAST || lat < SEA_S_SOUTH ? null : 's';
  return lon < x - 0.1 && lat >= 33.85 ? w : null;
}

/* ---------- 이웃 땅 조각(섬 상자·먼 섬 상자) ---------- */

const ringBoxes = new WeakMap<Float64Array[], Float64Array>();
/**
 * 상자 b(지도 단위)와 겹치는 이웃 땅의 path d 들: [먼 이웃 땅, 이웃 땅 + 잘린 변 밖으로 늘린 땅 네모(outExt)] — 고리마다 1m 로 반올림(shapes.ts 의 칸·이웃 땅 path 와 같은 꼴).
 * 섬 상자·먼 섬 상자는 본 지도와 다른 범위를 그려, 본 지도의 이웃 땅 path(수십 KB)를 통째로 다시 넣지 않고 범위에 드는 고리만 고른다.
 * 먼 이웃 땅과 이웃 땅은 겹치고 고리 방향이 다를 수 있어 path 를 따로 둔다(한 path 에 넣으면 겹친 곳이 뚫릴 수 있다). 빈 것은 ''
 */
export function outDIn(S: Pick<Shapes, 'outRings' | 'farRings' | 'outExt'>, b: Box): [string, string] {
  let ext = '';
  for (const e of S.outExt) if (e[0] < b[2] && e[2] > b[0] && e[1] < b[3] && e[3] > b[1]) ext += rectD(e);
  return [ringsDIn(S.farRings, b), ringsDIn(S.outRings, b) + ext];
}
function ringsDIn(R: Float64Array[], b: Box): string {
  let bx = ringBoxes.get(R);
  if (!bx) {
    bx = new Float64Array(R.length * 4);
    R.forEach((r, k) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < r.length; i += 2) {
        if (r[i] < x0) x0 = r[i];
        if (r[i] > x1) x1 = r[i];
        if (r[i + 1] < y0) y0 = r[i + 1];
        if (r[i + 1] > y1) y1 = r[i + 1];
      }
      bx!.set([x0, y0, x1, y1], 4 * k);
    });
    ringBoxes.set(R, bx);
  }
  let d = '';
  for (let k = 0; k < R.length; k++) {
    if (bx[4 * k] >= b[2] || bx[4 * k + 2] <= b[0] || bx[4 * k + 1] >= b[3] || bx[4 * k + 3] <= b[1]) continue;
    const r = R[k];
    // 닫는 점(= 첫 점)은 Z 로
    const n = r.length >= 4 && r[0] === r[r.length - 2] && r[1] === r[r.length - 1] ? r.length - 2 : r.length;
    for (let i = 0; i < n; i += 2) d += `${i ? ' ' : 'M'}${Math.round(r[i])} ${Math.round(r[i + 1])}`;
    d += 'Z';
  }
  return d;
}

/* ---------- 땅 판정 격자 ---------- */

/** 격자 한 칸의 값: 0 = 바다, 1 = 땅(칸·이웃 땅·늘린 땅), 2 = 강 띠. ext = 격자 밖까지 뻗는 늘린 땅 네모(shapes.ts outExt) */
export interface LandMask { x0: number; y0: number; cell: number; nx: number; ny: number; data: Uint8Array; ext: Box[] }
/** 격자 긴 변의 칸 수(지역 지도 긴 변 200km 면 한 칸 약 0.8km — 자리는 이 격자로 고르고, 고른 상자는 다각형으로 한 번 더 확인한다) */
export const MASK_N = 256;

/**
 * 고리들을 짝홀 규칙으로 칠한다(칸 가운데 점이 안이면 v). 고리의 변이 지나는 칸도 v 로 칠한다 — 격자 칸보다 작은 섬·가는 곶이 빠지지 않게
 * (가운데 점만 보면 전남 바다의 작은 섬들이 바다로 남아, 고른 자리마다 다각형 확인에서 떨어졌다)
 */
function fillRings(m: LandMask, rings: Iterable<Float64Array>, v: number, rows: number[][]) {
  for (const xs of rows) xs.length = 0;
  const mark = (x: number, y: number) => {
    const c = Math.floor((x - m.x0) / m.cell), k = Math.floor((y - m.y0) / m.cell);
    if (c >= 0 && k >= 0 && c < m.nx && k < m.ny) m.data[k * m.nx + c] = v;
  };
  for (const r of rings) {
    const n = r.length;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const x1 = r[j], y1 = r[j + 1], x2 = r[i], y2 = r[i + 1];
      // 변을 격자 반 칸 간격으로 따라가며 칠한다
      const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (m.cell / 2)));
      for (let s = 0; s <= steps; s++) mark(x1 + ((x2 - x1) * s) / steps, y1 + ((y2 - y1) * s) / steps);
      if (y1 === y2) continue;
      const ya = Math.min(y1, y2), yb = Math.max(y1, y2);
      // 줄 k 의 가운데 y = y0 + (k + 0.5)·cell 이 [ya, yb) 안인 k
      let k0 = Math.ceil((ya - m.y0) / m.cell - 0.5), k1 = Math.ceil((yb - m.y0) / m.cell - 0.5) - 1;
      if (k0 < 0) k0 = 0;
      if (k1 >= m.ny) k1 = m.ny - 1;
      for (let k = k0; k <= k1; k++) rows[k].push(x1 + ((m.y0 + (k + 0.5) * m.cell - y1) * (x2 - x1)) / (y2 - y1));
    }
  }
  for (let k = 0; k < m.ny; k++) {
    const xs = rows[k];
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let t = 0; t + 1 < xs.length; t += 2) {
      let c0 = Math.ceil((xs[t] - m.x0) / m.cell - 0.5), c1 = Math.ceil((xs[t + 1] - m.x0) / m.cell - 0.5) - 1;
      if (c0 < 0) c0 = 0;
      if (c1 >= m.nx) c1 = m.nx - 1;
      for (let c = c0; c <= c1; c++) m.data[k * m.nx + c] = v;
    }
  }
}

const maskMemo = new WeakMap<Shapes, LandMask>();
/**
 * 지도 하나의 땅 판정 격자(Shapes 마다 한 번). 범위는 칸 전체와 이웃 땅을 모두 품는 상자. 그 밖은 늘린 땅 네모(outExt) 안이면 땅, 아니면 바다
 */
export function landMask(S: Shapes): LandMask {
  let m = maskMemo.get(S);
  if (m) return m;
  const o = S.outBox, b: Box = o ? [Math.min(S.box[0], o[0]), Math.min(S.box[1], o[1]), Math.max(S.box[2], o[2]), Math.max(S.box[3], o[3])] : S.box;
  const W = Math.max(1, b[2] - b[0]), H = Math.max(1, b[3] - b[1]);
  const cell = Math.max(W, H) / MASK_N;
  const nx = Math.max(1, Math.ceil(W / cell)), ny = Math.max(1, Math.ceil(H / cell));
  m = { x0: b[0], y0: b[1], cell, nx, ny, data: new Uint8Array(nx * ny), ext: S.outExt };
  const rows: number[][] = Array.from({ length: ny }, () => []);
  // 칸끼리·이웃 땅끼리는 겹치지 않아 묶음마다 한 번에 칠한다(함께 쓰는 경계는 짝홀로 맞아떨어진다). 칸과 이웃 땅은 따로(나라 밖 땅은 다른 자료라 조금 겹칠 수 있다)
  fillRings(m, (function* () { for (const id of S.ids) yield* S.cells.get(id)!.rings; })(), 1, rows);
  const land = m.data.slice();
  m.data.fill(0);
  // 이웃 땅과 먼 이웃 땅도 따로 칠해 합친다(둘은 겹친다 — 한 번에 짝홀로 칠하면 겹친 곳이 바다가 된다)
  for (const rings of [S.outRings, S.farRings]) {
    if (!rings.length) continue;
    fillRings(m, rings, 1, rows);
    for (let i = 0; i < land.length; i++) { if (m.data[i]) land[i] = 1; m.data[i] = 0; }
  }
  m.data.set(land);
  // 늘린 땅 네모가 격자와 겹치는 곳(이웃 땅 상자가 칸 상자보다 안쪽인 변 — 먼 섬 쪽)
  for (const e of S.outExt) {
    const c0 = Math.max(0, Math.ceil((e[0] - b[0]) / cell - 0.5)), c1 = Math.min(nx - 1, Math.ceil((e[2] - b[0]) / cell - 0.5) - 1);
    const k0 = Math.max(0, Math.ceil((e[1] - b[1]) / cell - 0.5)), k1 = Math.min(ny - 1, Math.ceil((e[3] - b[1]) / cell - 0.5) - 1);
    for (let k = k0; k <= k1; k++) for (let c = c0; c <= c1; c++) m.data[k * nx + c] = 1;
  }
  if (S.water.length) {
    const river = m.data.slice();
    m.data.fill(0);
    fillRings(m, S.water, 2, rows);
    for (let i = 0; i < river.length; i++) if (river[i] && !m.data[i]) m.data[i] = 1;
  }
  maskMemo.set(S, m);
  return m;
}

/** 점 (x, y — 지도 단위)의 값. 격자 밖은 늘린 땅 네모 안이면 땅, 아니면 바다 */
export function maskAt(m: LandMask, x: number, y: number): number {
  const c = Math.floor((x - m.x0) / m.cell), k = Math.floor((y - m.y0) / m.cell);
  if (c < 0 || k < 0 || c >= m.nx || k >= m.ny) return m.ext.some((e) => x >= e[0] && x <= e[2] && y >= e[1] && y <= e[3]) ? 1 : 0;
  return m.data[k * m.nx + c];
}

/* ---------- 이 지도가 닿는 바다 ---------- */

/** 칸 전체 상자를 훑는 표본 수(한 변) · 그 바다로 치는 표본 수(상자 표본의 0.5%쯤 — 상자 끝에 살짝 걸친 바다는 닿은 것으로 치지 않는다) */
export const COAST_N = 48, COAST_MIN = 12;
const coastMemo = new WeakMap<Shapes, SeaKey[]>();
/**
 * 이 지도의 공부 칸이 닿는 바다(Shapes 마다 한 번): 칸 전체 상자(먼 섬까지) 안에서 바다인 표본을 seaOf 로 갈라, 표본이 COAST_MIN 개 이상인 바다.
 * 바다 이름은 닿는 바다가 있는 지도면 그 바다만 낸다(svgmap drawSea) — 화면이 넓어 멀리 보이는 다른 바다(가로로 돌린 휴대폰의 강원 지도 왼쪽 끝 경기만 '서해',
 * 경남 지도 오른쪽 끝 부산 기장 앞 '동해', 319km 폭으로 그려지는 여수시 3과 시작 지도 왼쪽 끝 '서해')에 이름을 두면 그 지역의 바다로 읽힌다(2026-11-17 그림 확인).
 * 닿는 바다가 없는 지도(충북·대구 등 내륙)는 빈 목록 — 그때는 보이는 바다 이름을 그대로 낸다(방향을 알려 준다)
 */
export function coastSeas(S: Shapes): SeaKey[] {
  let got = coastMemo.get(S);
  if (got) return got;
  const m = landMask(S), [x0, y0, x1, y1] = S.box;
  const n: Record<SeaKey, number> = { w: 0, s: 0, e: 0 };
  for (let j = 0; j < COAST_N; j++) {
    const y = y0 + ((j + 0.5) * (y1 - y0)) / COAST_N;
    for (let i = 0; i < COAST_N; i++) {
      const x = x0 + ((i + 0.5) * (x1 - x0)) / COAST_N;
      if (maskAt(m, x, y)) continue;
      const k = seaOf(...unproject(x, y));
      if (k) n[k]++;
    }
  }
  got = (['w', 's', 'e'] as const).filter((k) => n[k] >= COAST_MIN);
  coastMemo.set(S, got);
  return got;
}

/* ---------- 바다 이름 자리 ---------- */

/** 훑는 격자(px) · 글자 상자 둘레에 비울 바다(px — 좌우 · 위아래) · 다른 이름·상자와 띄울 틈(px) */
export const SEA_GRID_PX = 8, SEA_PAD_X = 10, SEA_PAD_Y = 8, SEA_GAP_PX = 6;
/** 그 바다가 화면에서 이만큼(글자 상자 넓이의 배)은 보여야 이름을 둔다(좁은 물길에 끼워 넣지 않게) */
export const SEA_MIN_ROOM = 5;
/** 격자로 고른 자리를 다각형으로 확인할 때 한 바다에서 써 보는 후보 수 */
const SEA_TRIES = 24;

/** alt = 두 줄로 나눈 글자 상자(영어 — 한 줄이 들 자리가 없으면 이쪽으로) */
export interface SeaAsk { key: SeaKey; w: number; h: number; alt?: { w: number; h: number } }
export interface SeaSpot { key: SeaKey; x: number; y: number; two?: boolean }
export interface SeaOpt {
  mask: LandMask;
  /** 이름을 둘 수 있는 범위(지도 단위 [x0, y0, x1, y1] — 보이는 범위에서 가장자리를 뺀 곳) */
  view: Box;
  /** 화면 1px 의 지도 단위 */
  u: number;
  /** 바다마다 글자 상자(px). 여기 든 바다만 찾는다 */
  asks: SeaAsk[];
  /** 피할 상자(지도 단위): 칸 밖 이름표·맥락 이름·화면에 붙은 것 */
  blocked: Box[];
  /** 피할 선(지도 단위 [x1, y1, x2, y2]): 지시선 */
  lines?: [number, number, number, number][];
  /** 고른 자리의 상자(가운데 x·y, 크기 w×h — 지도 단위, 둘레 틈 포함)가 땅·강에 닿지 않나(다각형으로 확인) */
  ok(x: number, y: number, w: number, h: number): boolean;
  /** 전에 둔 자리: 아직 쓸 수 있으면 그대로 둔다(지도를 끌 때 이름이 옮겨 다니지 않게) */
  prev?: SeaSpot[];
}

/**
 * 바다 이름 자리. 바다마다 많아야 하나: 글자 상자와 둘레(SEA_PAD)가 모두 그 바다의 빈 칸인 자리 가운데 막힌 곳(땅·가장자리·다른 것)에서 가장 먼 곳.
 * 같은 거리면 그 바다 빈 칸들의 가운데에 가까운 쪽. 먼저 둔 이름은 다음 이름이 피한다
 */
export function seaSpots(o: SeaOpt): SeaSpot[] {
  const { mask, view, u } = o;
  const g = SEA_GRID_PX * u;
  const cols = Math.floor((view[2] - view[0]) / g), rows = Math.floor((view[3] - view[1]) / g);
  if (cols < 3 || rows < 2 || !o.asks.length) return [];
  // 격자를 범위 가운데에 맞춘다
  const gx = view[0] + ((view[2] - view[0]) - cols * g) / 2, gy = view[1] + ((view[3] - view[1]) - rows * g) / 2;
  const N = cols * rows;
  const ZONE: Record<SeaKey, number> = { w: 1, s: 2, e: 3 };
  const want = new Set(o.asks.map((a) => ZONE[a.key]));
  // zone[i] = 그 칸의 바다(1·2·3), 땅·강·띠·찾지 않는 바다는 0
  const zone = new Uint8Array(N);
  for (let r = 0; r < rows; r++) {
    const y = gy + (r + 0.5) * g;
    for (let c = 0; c < cols; c++) {
      const x = gx + (c + 0.5) * g;
      if (maskAt(mask, x, y)) continue;
      const [lon, lat] = unproject(x, y);
      const k = seaOf(lon, lat);
      if (k && want.has(ZONE[k])) zone[r * cols + c] = ZONE[k];
    }
  }
  const gap = SEA_GAP_PX * u;
  const block = (b: Box) => {
    const c0 = Math.max(0, Math.floor((b[0] - gap - gx) / g)), c1 = Math.min(cols - 1, Math.floor((b[2] + gap - gx) / g));
    const r0 = Math.max(0, Math.floor((b[1] - gap - gy) / g)), r1 = Math.min(rows - 1, Math.floor((b[3] + gap - gy) / g));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) zone[r * cols + c] = 0;
  };
  for (const b of o.blocked) block(b);
  for (const [x1, y1, x2, y2] of o.lines ?? []) {
    const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (g / 2)));
    for (let t = 0; t <= n; t++) { const x = x1 + ((x2 - x1) * t) / n, y = y1 + ((y2 - y1) * t) / n; block([x, y, x, y]); }
  }
  const out: SeaSpot[] = [];
  const dist = new Int16Array(N);
  const sum = new Int32Array((cols + 1) * (rows + 1));
  const tryAsk = (ask: SeaAsk, two: boolean, tight = false): SeaSpot | null => {
    const z = ZONE[ask.key];
    // 그 바다의 빈 칸 수와 가운데
    let n = 0, mx = 0, my = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (zone[r * cols + c] === z) { n++; mx += c; my += r; }
    // tight(영어만 — 한 줄·두 줄이 넉넉한 자리에 안 들 때 마지막으로): 둘레 비움과 필요한 바다 넓이를 줄여 좁은 바다 모퉁이에도 둔다
    const padX = tight ? SEA_PAD_X / 2 : SEA_PAD_X, padY = tight ? SEA_PAD_Y / 2 : SEA_PAD_Y;
    const hx = Math.ceil((ask.w / 2 + padX) / SEA_GRID_PX), hy = Math.ceil((ask.h / 2 + padY) / SEA_GRID_PX);
    if (n * SEA_GRID_PX * SEA_GRID_PX < ask.w * ask.h * (tight ? SEA_MIN_ROOM / 2 : SEA_MIN_ROOM) || cols < 2 * hx + 1 || rows < 2 * hy + 1) return null;
    mx /= n; my /= n;
    // 막힌 곳(그 바다가 아닌 칸·격자 밖)까지 거리(칸 수, 여덟 방향)
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      dist[i] = zone[i] !== z ? 0 : Math.min(c ? dist[i - 1] : 0, r ? dist[i - cols] : 0, r && c ? dist[i - cols - 1] : 0, r && c < cols - 1 ? dist[i - cols + 1] : 0) + 1;
    }
    for (let r = rows - 1; r >= 0; r--) for (let c = cols - 1; c >= 0; c--) {
      const i = r * cols + c;
      if (!dist[i]) continue;
      const d = Math.min(c < cols - 1 ? dist[i + 1] : 0, r < rows - 1 ? dist[i + cols] : 0, r < rows - 1 && c < cols - 1 ? dist[i + cols + 1] : 0, r < rows - 1 && c ? dist[i + cols - 1] : 0) + 1;
      if (d < dist[i]) dist[i] = d;
    }
    // 창(2hx+1 × 2hy+1) 안이 모두 그 바다인가: 누적 합으로
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      sum[(r + 1) * (cols + 1) + c + 1] = (zone[r * cols + c] === z ? 1 : 0) + sum[r * (cols + 1) + c + 1] + sum[(r + 1) * (cols + 1) + c] - sum[r * (cols + 1) + c];
    }
    const full = (2 * hx + 1) * (2 * hy + 1);
    const fits = (c: number, r: number) => {
      if (c - hx < 0 || r - hy < 0 || c + hx >= cols || r + hy >= rows) return false;
      const a = (r - hy) * (cols + 1) + (c - hx), b = (r + hy + 1) * (cols + 1) + (c - hx);
      return sum[b + 2 * hx + 1] - sum[b] - sum[a + 2 * hx + 1] + sum[a] === full;
    };
    const W = (ask.w + 2 * SEA_GAP_PX) * u, H = (ask.h + 2 * SEA_GAP_PX) * u;
    const at = (c: number, r: number): [number, number] => [gx + (c + 0.5) * g, gy + (r + 0.5) * g];
    let got: [number, number] | null = null;
    // 전에 둔 자리가 아직 빈 바다면 그대로
    const p = o.prev?.find((q) => q.key === ask.key && !!q.two === two);
    if (p) {
      const c = Math.floor((p.x - gx) / g), r = Math.floor((p.y - gy) / g);
      if (c >= 0 && r >= 0 && c < cols && r < rows && fits(c, r) && o.ok(p.x, p.y, W, H)) got = [p.x, p.y];
    }
    if (!got) {
      const cand: { c: number; r: number; d: number; m: number }[] = [];
      for (let r = hy; r < rows - hy; r++) for (let c = hx; c < cols - hx; c++) if (fits(c, r)) cand.push({ c, r, d: dist[r * cols + c], m: (c - mx) ** 2 + (r - my) ** 2 });
      cand.sort((a, b) => b.d - a.d || a.m - b.m || a.r - b.r || a.c - b.c);
      for (const k of cand.slice(0, SEA_TRIES)) {
        const [x, y] = at(k.c, k.r);
        if (o.ok(x, y, W, H)) { got = [x, y]; break; }
      }
    }
    if (!got) return null;
    return { key: ask.key, x: got[0], y: got[1], ...(two ? { two: true } : {}) };
  };
  for (const ask of o.asks) {
    const two = ask.alt ? { ...ask, ...ask.alt } : null;
    const spot = tryAsk(ask, false) ?? (two ? tryAsk(two, true) ?? tryAsk(ask, false, true) ?? tryAsk(two, true, true) : null);
    if (!spot) continue;
    out.push(spot);
    const k = spot.two && ask.alt ? ask.alt : ask;
    block([spot.x - (k.w / 2) * u, spot.y - (k.h / 2) * u, spot.x + (k.w / 2) * u, spot.y + (k.h / 2) * u]);
  }
  return out;
}
