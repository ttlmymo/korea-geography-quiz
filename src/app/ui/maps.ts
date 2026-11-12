// 화면의 지도 자리(data-map)에 SVG 지도를 붙인다. 지역 경계는 한 번 받아 칸으로 만들어 두고 다시 쓴다
import { loadTopo } from '../data.ts';
import { buildShapes, specOf, type Shapes } from '../map/shapes.ts';
import { createSvgMap, type Marks, type SvgMap } from '../map/svgmap.ts';
import { boxOf } from '../map/project.ts';
import type { Pad } from '../map/view.ts';
import type { Tap } from '../core/judge.ts';
import type { BBox } from '../types.ts';
import type { Ctx } from './ctx.ts';
import { L } from '../text/ui.ts';
import { track } from '../analytics.ts';

const cache = new Map<string, Promise<Shapes>>();

export function shapesOf(ctx: Ctx, region: string): Promise<Shapes> {
  let p = cache.get(region);
  if (!p) {
    const r = ctx.reg.region(region);
    if (!r) return Promise.reject(new Error(`없는 지역: ${region}`));
    p = loadTopo(ctx.base, ctx.ver, region).then((t) => buildShapes(t, specOf(r), ctx.geo.labels));
    p.catch(() => cache.delete(region));
    cache.set(region, p);
  }
  return p;
}

export interface MapSpec {
  region: string;
  /** 기본 보기 범위(경도·위도). 없으면 지역 전체 */
  home?: BBox;
  pad?: Pad;
  interaction?: 'full' | 'tap' | 'none';
  contextNames?: boolean;
  active?: string[] | null;
  rim?: string[] | null;
  fills?: Record<string, number> | null;
  question?: string | null;
  highlight?: string[];
  labels?: { id: string; text: string }[];
  labelsInside?: boolean;
  badges?: string[];
  marks?: Marks;
  onTap?(tap: Tap): void;
  onZoomed?(z: boolean): void;
}

export const CARD_PAD: Pad = { t: 12, r: 12, b: 12, l: 12 };

export async function mountMap(ctx: Ctx, host: HTMLElement, spec: MapSpec): Promise<SvgMap> {
  const shapes = await shapesOf(ctx, spec.region);
  const region = ctx.reg.region(spec.region)!;
  const map = createSvgMap(host, { shapes, interaction: spec.interaction ?? 'none', contextNames: spec.contextNames, ctxName: L.ctxName, insetNote: L.inset, onTap: spec.onTap, onZoomed: spec.onZoomed });
  if (spec.active !== undefined) map.setActive(spec.active);
  if (spec.rim) map.setRim(spec.rim);
  if (spec.fills) map.setFills(spec.fills);
  if (spec.question) map.setQuestion(spec.question);
  if (spec.highlight) map.setHighlight(spec.highlight);
  if (spec.labels) map.setLabels(spec.labels, { inside: spec.labelsInside });
  if (spec.badges?.length) map.setBadges(spec.badges);
  if (spec.marks) map.mark(spec.marks);
  map.setHome(boxOf(spec.home ?? region.fit), spec.pad ?? CARD_PAD);
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
