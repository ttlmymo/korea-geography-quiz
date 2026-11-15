// 화면의 지도 자리(data-map)에 SVG 지도를 붙인다. 지역 경계는 한 번 받아 칸으로 만들어 두고 다시 쓴다.
// 동 단원(계획서 E5 · N11)은 단원 파일 emd/{코드}.topo.json(동 5m + 같은 위상의 이웃 땅)으로 그리고, 일반구 단원(E7)은 부모 지역 -sgg 의 sgg 층을 쓴다.
// 캐시 키는 지역 키 또는 단원 키(seoul/jongno-gu)
import { loadSidoTopo, loadTopo, loadUnitTopo } from '../data.ts';
import { buildShapes, inside, specOf, type Cell, type Shapes, type Topology } from '../map/shapes.ts';
import { perf } from '../perf.ts';
import { createSvgMap, type MapLabel, type Marks, type SvgMap } from '../map/svgmap.ts';
import type { LabelMode } from '../map/labelfit.ts';
import { boxOf, type Box } from '../map/project.ts';
import { fitView, toMap, type Pad } from '../map/view.ts';
import type { Tap } from '../core/judge.ts';
import type { BBox, LabelsFile, Lesson, Region } from '../types.ts';
import type { Ctx } from './ctx.ts';
import { L, ctxNamer } from '../text/ui.ts';
import { track } from '../analytics.ts';

const cache = new Map<string, Promise<Shapes>>();

/** 지도 엔진이 전국 시·도 지도(지역 고르기, 계획서 N23)로 알아보는 키. 지역 키가 아니다('#' 은 지역 키 모양 /^[a-z-]+$/ 에 들지 않는다) */
export const KOREA_MAP = '#kr';

/** 전국 시·도 지도의 이름표 점: 파이프라인이 칸마다 l: [경도, 위도, 내접원 m] 로 싣는다(labels.json 에 시·도 층을 더하지 않으려고) */
const sidoLabels = (t: Topology): LabelsFile => Object.fromEntries((t.objects.sido?.geometries ?? []).map((g) => [g.properties?.id ?? '', (g.properties as unknown as { l: [number, number, number] }).l]));

export function shapesOf(ctx: Ctx, region: string): Promise<Shapes> {
  let p = cache.get(region);
  if (!p) {
    // 지역 고르기의 전국 시·도 지도(계획서 N23 · E8): 칸은 16 시·도 전부(열지 않은 지역은 쪽이 바탕색으로 둔다)
    if (region === KOREA_MAP) {
      p = timed(region, loadSidoTopo(ctx.base, ctx.ver), (t) => buildShapes(t, { layer: 'sido', idKey: 'id', ids: (t.objects.sido?.geometries ?? []).map((g) => g.properties?.id ?? ''), far: false }, sidoLabels(t)));
      p.catch(() => cache.delete(region));
      cache.set(region, p);
      return p;
    }
    const r = ctx.reg.region(region);
    if (!r) return Promise.reject(new Error(`없는 지역: ${region}`));
    if (r.layer === 'sido') {
      // 시·도 단원(korea): 같은 전국 시·도 지도, 이름표 점은 units.json korea(레지스트리)
      const labels: LabelsFile = Object.fromEntries(r.items.map((it) => [it.id, ctx.reg.point(it.id)!]));
      p = timed(region, loadSidoTopo(ctx.base, ctx.ver), (t) => buildShapes(t, specOf(r), labels));
    } else if (r.layer === 'emd' && r.unit) {
      // 동 단원: 이름표 점은 단원 파일(레지스트리에 등록된 것)에서
      const labels: LabelsFile = Object.fromEntries(r.items.map((it) => [it.id, ctx.reg.point(it.id)!]));
      p = timed(region, loadUnitTopo(ctx.base, ctx.ver, r.unit.code), (t) => buildShapes(t, specOf(r), labels));
    } else {
      // 지역, 또는 일반구 단원(부모 지역 경계 파일의 sgg 층)
      p = timed(region, loadTopo(ctx.base, ctx.ver, r.unit?.parent ?? region), (t) => buildShapes(t, specOf(r), ctx.geo.labels));
    }
    p.catch(() => cache.delete(region));
    cache.set(region, p);
  }
  return p;
}

/**
 * 받기·칸 만들기 시간을 재며(계획서 N35 '단원 열기' — perf.ts, 확인 도구가 켤 때만 남는다) 경계를 칸으로.
 * 동 단원 경계는 main.ts 가 단원 파일과 함께 미리 받기 시작할 수 있다(prefetchTopo) — 그때 fetch 값은 여기서부터 남은 받기 시간이다
 */
function timed(key: string, load: Promise<Topology>, build: (t: Topology) => Shapes): Promise<Shapes> {
  const t0 = performance.now();
  return load.then((t) => {
    const t1 = performance.now();
    const s = build(t);
    perf('fetch', t1 - t0, key);
    perf('build', performance.now() - t1, key);
    return s;
  });
}

/** 지도 기본 범위와 섬 상자(동 단원의 섬, map/isles.ts) */
export interface MapView { fit: BBox; isles: string[] }

/** 과 범위(파이프라인이 섬 상자 곳을 뺀 범위로 낸다)와 그 과의 섬 상자 곳 — 문제 화면의 과 확대 보기(play.ts 는 같은 값을 바로 읽는다). 과 시작·요약은 지역 전체(wholeView) */
export const lessonView = (l: Lesson): MapView => ({ fit: l.fit, isles: l.insets ?? [] });

/**
 * 단원·지역 전체 지도(홈·단원 쪽·지역 쪽·둘러보기·시험 결과): 섬 상자 = 화면들의 insets 를 모두 합친 것, 기본 범위 = 본 땅이 든 화면들의 범위를 합친 것
 * (섬만 든 화면의 범위는 먼 섬까지 들어 넓다). 본 땅 화면이 없으면(모든 곳이 섬 — 옹진군) 단원 범위. 섬 상자가 없으면 단원·지역 범위 그대로.
 * 지역도 같은 규칙이다(E13 검수): 지금 판의 지역 화면에는 insets 가 없어 지역 범위 그대로이고, 통째로 먼 섬인 곳(경북 울릉군 — 파이프라인이 지역 상자 near 에서
 * 뺀다)을 파이프라인이 지역 과·화면 insets 로 넣으면 앱 코드를 바꾸지 않고 홈·지역 쪽·둘러보기·시험 결과·과 지도·문제 화면에 섬 상자로 보인다
 */
export function wholeView(r: Region): MapView {
  const isles = [...new Set(r.screens.flatMap((s) => s.insets ?? []))];
  if (!isles.length) return { fit: r.fit, isles };
  const land = r.screens.filter((s) => s.items.some((id) => !(s.insets ?? []).includes(id)));
  if (!land.length) return { fit: r.fit, isles };
  const b = land.map((s) => s.fit).reduce((a, c): BBox => [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[2]), Math.max(a[3], c[3])]);
  return { fit: b, isles };
}

/**
 * 지도 자리에 넘길 범위·섬 상자(wholeView 의 v): 동 단원은 늘(전과 같음), 지역은 섬 상자가 있을 때만
 * (없으면 mountMap 이 지역 범위 r.fit 을 쓴다 — v.fit 과 같은 범위라 지금 판의 지역 지도는 그대로다)
 */
export const viewSpec = (r: Region, v: MapView): Pick<MapSpec, 'home' | 'isles'> => (r.unit || v.isles.length ? { home: v.fit, isles: v.isles } : {});

export interface MapSpec {
  region: string;
  /** 섬 상자로 따로 보일 곳(동 단원의 섬 — lessonView·wholeView) */
  isles?: string[];
  /** 기본 보기 범위(경도·위도). 없으면 지역 전체 */
  home?: BBox;
  pad?: Pad;
  interaction?: 'full' | 'tap' | 'none';
  contextNames?: boolean;
  /** 축척 막대(지도 칸이 좁으면 저절로 숨는다) */
  scaleBar?: boolean;
  /** 축척 막대를 그리는 가장 좁은 지도 칸 폭(px, 기본 svgmap COMPACT_PX) */
  scaleMinWidth?: number;
  /** 고를 수 있는 밝은 칸. 일부만 주면 과 판(나머지는 바탕색·옅은 선, 밝은 묶음 둘레는 굵게) */
  active?: string[] | null;
  /** 칸마다 굵은 테두리(다음 과·복습할 칸) */
  bold?: string[] | null;
  fills?: Record<string, number> | null;
  question?: string | null;
  /** 노랑으로 칠할 칸 */
  highlight?: string[];
  labels?: MapLabel[];
  /** 이름표 놓는 방식: must(기본, 꼭 보임) · fit(자리가 있을 때만, 좁은 지도에서는 뺌 — 홈) · inside(칸 안에 드는 것만) */
  labelMode?: LabelMode;
  /** 이름표를 그리는 가장 좁은 지도 칸 폭(px). fit 의 기본은 560(휴대폰 홈 지도에는 이름표 없음), must 의 기본은 0(늘 그린다) */
  labelMinWidth?: number;
  /** 복습할 곳(먹색 점) */
  badges?: string[];
  /**
   * 지역(단원) 전체 지도인가(과 시작·과 요약 — 2026-11-15 사용자 결정, pages.ts lessonWhole): 밝은 칸(active)이 이번 과뿐이어도
   * 먼 섬 상자를 늘 보이고(svgmap insetAlways), 섬 상자·축척 막대 자리는 지역 칸 모두를 피해 정한다 — 홈 지도(모든 칸이 밝은 채움 지도)와 같은 자리.
   * 위치 지도(map/locator.ts)는 쪽 지도에 두지 않는다 — 과 확대 + 위치 지도는 문제 화면만(play.ts 가 svgmap 에 바로 넘긴다)
   */
  whole?: boolean;
  /**
   * 확대 상자로 보일 과 범위(과 시작·과 요약 — 이번 과의 l.fit, 문제 화면과 같은 범위. map/zoombox.ts — D95 ㉣, 2026-11-15 사용자 결정 '확대 상자 덧붙임'):
   * 이번 과가 지역 전체 지도에 너무 작게 그려질 때만 상자가 보인다(svgmap setZoom — 판정·자리는 지도가 실제 크기로 정한다)
   */
  zoom?: BBox;
  marks?: Marks;
  onTap?(tap: Tap): void;
  onZoomed?(z: boolean): void;
}

/** 지도 칸 가장자리 여백(시안: 지도 폭의 2% 남짓) */
export const CARD_PAD: Pad = { t: 14, r: 14, b: 14, l: 14 };

/**
 * 화면 전체 지도(문제 화면·둘러보기)의 축척 막대 문턱(px). 1024 폭의 지도 칸(약 540)에서도 막대를 두려고 svgmap 기본(560)보다 낮춘다.
 * 폰(390)에는 여전히 없다
 */
export const STAGE_SCALE_MIN = 480;

/**
 * 섬 상자(인천 먼 섬)가 보이는 지도의 여백과 상자 자리. 상자 밑에 칸 조각(ids — 고를 칸·칠한 칸)이 깔리지 않게 여섯 가지 가운데 고른다:
 * 상자를 왼쪽 위 또는 왼쪽 아래에 두고 × 여백을 그대로 두거나 / 그 옆(왼쪽)을 상자 너머까지 비우거나 / 위(아래)를 상자 너머까지 비운다.
 * 과 범위(fit) 밖으로 나온 섬(강화 서쪽 섬 등)도 있어 상자 밑에 깔리는 정도를 재서 가장 적은 쪽을 고르고,
 * 같으면 지도가 덜 작아지는 쪽(그래서 가리는 것이 없으면 여백 그대로). 깔리는 정도 = 상자 안 칸 점(10×10 표본, 큰 칸) +
 * 상자와 겹치는 고리(섬 하나하나 — 표본 점 사이로 빠지는 작은 섬). 고른 자리는 host 의 inset-bl(왼쪽 아래, map.css)로 둔다.
 * 섬 상자가 없거나 숨었으면 base 그대로
 */
export function insetPad(host: HTMLElement, shapes: Shapes, box: Box, ids: Iterable<string>, base: Pad): Pad {
  host.classList.remove('inset-bl');
  const ins = host.querySelector<HTMLElement>('.cm-inset:not([hidden])');
  if (!ins) return base;
  const size = { w: Math.max(1, host.clientWidth), h: Math.max(1, host.clientHeight) };
  const gap = ins.offsetLeft, iw = ins.offsetWidth, ih = ins.offsetHeight;
  const cells = [...ids].map((id) => shapes.cells.get(id)).filter((c): c is Cell => !!c);
  // 고리마다 상자(먼 섬 고리는 본 지도에 없으니 뺀다)
  const far = shapes.far?.box;
  const ringBoxes: Box[] = [];
  for (const c of cells) for (const r of c.rings) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < r.length; i += 2) {
      if (r[i] < x0) x0 = r[i];
      if (r[i] > x1) x1 = r[i];
      if (r[i + 1] < y0) y0 = r[i + 1];
      if (r[i + 1] > y1) y1 = r[i + 1];
    }
    if (far && x0 >= far[0] && x1 <= far[2] && y0 >= far[1] && y1 <= far[3]) continue;
    ringBoxes.push([x0, y0, x1, y1]);
  }
  let best: { p: Pad; bl: boolean; cover: number; u: number } | null = null;
  for (const bl of [false, true]) {
    const top = bl ? size.h - gap - ih : gap;
    const side: Pad = { ...base, l: gap + iw + base.l };
    const end: Pad = bl ? { ...base, b: gap + ih + base.b } : { ...base, t: gap + ih + base.t };
    for (const p of [base, side, end]) {
      const v = fitView(box, size, p);
      let cover = 0;
      for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
        const [x, y] = toMap(v, size, gap + ((i + 0.5) * iw) / 10, top + ((j + 0.5) * ih) / 10);
        if (cells.some((c) => x >= c.box[0] && x <= c.box[2] && y >= c.box[1] && y <= c.box[3] && inside(c.rings, x, y))) cover++;
      }
      // 상자 둘레 12px 까지 겹침으로 본다(틀에 붙은 섬은 상자 밑으로 이어진 것처럼 보인다)
      const E = 12;
      const [ax, ay] = toMap(v, size, gap - E, top - E), [bx, by] = toMap(v, size, gap + iw + E, top + ih + E);
      for (const b of ringBoxes) if (b[0] < bx && b[2] > ax && b[1] < by && b[3] > ay) cover++;
      if (!best || cover < best.cover || (cover === best.cover && v.u < best.u - 1e-12)) best = { p, bl, cover, u: v.u };
    }
  }
  host.classList.toggle('inset-bl', best!.bl);
  return best!.p;
}

/**
 * 쪽 지도의 축척 막대(오른쪽 아래, 지도 바탕색 상자)가 밝은 칸(ids)을 가리면 아래 여백을 막대 위까지 늘린다.
 * 칸이 지도 칸 오른쪽 아래 구석까지 차는 지도(처음에는 과 범위로 확대한 과 시작·요약)는 막대 상자가 칸과 굵은 테두리를 네모나게 잘라 먹는다.
 * 가리는지는 막대 상자(둘레 4px 포함 — 굵은 테두리) 안 표본 점 12×4 가 칸 안에 드는지로 본다. 막대가 없거나 안 가리면 base 그대로
 */
export function scalePad(host: HTMLElement, shapes: Shapes, box: Box, ids: Iterable<string>, base: Pad): Pad {
  const sc = host.querySelector<HTMLElement>('.cm-scale:not([hidden])');
  if (!sc) return base;
  const size = { w: Math.max(1, host.clientWidth), h: Math.max(1, host.clientHeight) };
  const E = 4;
  const x0 = sc.offsetLeft - E, y0 = sc.offsetTop - E, w = sc.offsetWidth + 2 * E, h = sc.offsetHeight + 2 * E;
  const cells = [...ids].map((id) => shapes.cells.get(id)).filter((c): c is Cell => !!c);
  const v = fitView(box, size, base);
  let hit = false;
  for (let i = 0; i < 12 && !hit; i++) for (let j = 0; j < 4 && !hit; j++) {
    const [x, y] = toMap(v, size, x0 + ((i + 0.5) * w) / 12, y0 + ((j + 0.5) * h) / 4);
    hit = cells.some((c) => x >= c.box[0] && x <= c.box[2] && y >= c.box[1] && y <= c.box[3] && inside(c.rings, x, y));
  }
  // 칸 묶음의 아래끝이 막대 상자 위 6px 에 오게(막대는 그 자리에 그대로 — scaleLift 는 꺼져 있다)
  return hit ? { ...base, b: Math.max(base.b, size.h - sc.offsetTop + 6) } : base;
}

export async function mountMap(ctx: Ctx, host: HTMLElement, spec: MapSpec): Promise<SvgMap> {
  const shapes = await shapesOf(ctx, spec.region);
  const region = ctx.reg.region(spec.region);
  // 전국 시·도 지도(지역 고르기·시·도 단원)는 흰 판 이름표를 남의 시·도 칸 위에 두지 않는다(E10 검수 — 휴대폰에서 '충북' 판이 경기·충남 경계 위에 놓였다)
  const plateHome = spec.region === KOREA_MAP || region?.layer === 'sido';
  const map = createSvgMap(host, {
    shapes, interaction: spec.interaction ?? 'none', contextNames: spec.contextNames, scaleBar: spec.scaleBar, scaleMinWidth: spec.scaleMinWidth, ctxName: ctxNamer(ctx.reg), insetNote: L.inset, onTap: spec.onTap, onZoomed: spec.onZoomed, plateHome,
    ...(spec.whole ? { insetAlways: true } : {}),
  });
  // 보기를 먼저 맞춘다(이름표 자리는 배율에 달려 있다)
  // 지역이 아닌 지도(전국 시·도 지도 KOREA_MAP)는 spec.home, 없으면 칸 전체
  const home = spec.home ? boxOf(spec.home) : region ? boxOf(region.fit) : shapes.box;
  let pad = spec.pad ?? CARD_PAD;
  map.setHome(home, pad);
  if (spec.active !== undefined) map.setActive(spec.active);
  if (spec.fills) map.setFills(spec.fills);
  // 섬 상자·축척 막대가 피할 칸: 밝은 칸(고를 칸·칠한 칸). 지역 전체 지도(whole)는 이번 과만 밝아도 지역 칸 모두(홈 지도와 같은 자리)
  const lit = new Set(spec.whole ? shapes.ids : [...(spec.active ?? shapes.ids), ...Object.keys(spec.fills ?? {})]);
  // 섬 상자가 보이면(칸 상태가 정해진 뒤에 안다) 상자 밑에 칠한·고를 칸이 깔리지 않게 여백과 상자 자리를 다시 정한다
  if (shapes.far) {
    const p = insetPad(host, shapes, home, lit, pad);
    if (p !== pad) map.setHome(home, pad = p);
  }
  // 축척 막대 상자 밑에 칸이 깔리면 아래 여백을 늘린다(막대 자리는 그대로)
  if (spec.scaleBar) {
    const p = scalePad(host, shapes, home, lit, pad);
    if (p !== pad) map.setHome(home, pad = p);
  }
  if (spec.isles?.length) map.setIsles(spec.isles);
  if (spec.question) map.setQuestion(spec.question);
  if (spec.highlight) map.setHighlight(spec.highlight);
  if (spec.bold?.length) map.setBold(spec.bold);
  if (spec.labels) map.setLabels(spec.labels, { mode: spec.labelMode ?? 'must', minWidth: spec.labelMinWidth });
  if (spec.badges?.length) map.setBadges(spec.badges);
  if (spec.marks) map.mark(spec.marks);
  // 확대 상자는 맨 끝에: 먼 섬 상자·축척 막대 자리(insetPad·scalePad)와 섬 상자·칠·이름표가 다 정해진 지도로 판정하고 자리를 고른다
  if (spec.zoom) map.setZoom({ fit: boxOf(spec.zoom), note: L.zoom });
  return map;
}

/** 쪽 안의 모든 지도 자리를 채운다. 받기에 실패한 자리는 글로 알린다 */
export async function mountMaps(ctx: Ctx, root: HTMLElement, specs: Record<string, MapSpec>): Promise<SvgMap[]> {
  const out: SvgMap[] = [];
  await Promise.all(Object.entries(specs).map(async ([key, spec]) => {
    const host = root.querySelector<HTMLElement>(`[data-map="${key}"]`);
    if (!host) return;
    try {
      out.push(await mountMap(ctx, host, spec));
    } catch (e) {
      track('geo_load_fail', { msg: `${spec.region}: ${String((e as Error)?.message ?? e).slice(0, 80)}` });
      host.textContent = L.mapFail;
      host.classList.add('map-fail');
    }
  }));
  return out;
}
