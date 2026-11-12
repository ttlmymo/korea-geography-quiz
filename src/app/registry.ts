// 지역·과·곳을 찾는 색인과, 두 곳 사이의 방위·거리·맞닿음
import type { GeoData, Item, Lesson, Region, Screen } from './types.ts';

export type Dir8 = 'E' | 'NE' | 'N' | 'NW' | 'W' | 'SW' | 'S' | 'SE';
const DIRS: Dir8[] = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];

export interface Place { item: Item; region: Region; lesson: Lesson }

export interface Registry {
  regions: Region[];
  region(key: string): Region | undefined;
  place(id: string): Place | undefined;
  bySlug(region: string, slug: string): Place | undefined;
  lesson(region: string, no: number): Lesson | undefined;
  /** 지역 전체를 묻는 판에서 그곳이 보이는 화면(경기 북서부 등) */
  screenOf(id: string): Screen | undefined;
  /** 공유 경계로 맞닿았나(다리로 이어진 바다 건너는 아님) */
  adjacent(a: string, b: string): boolean;
  /** 같은 층에서 맞닿은 곳 */
  neighborsOf(id: string): string[];
  /** from 에서 본 to 의 방위(이름표 점 기준) */
  dir8(from: string, to: string): Dir8;
  /** 이름표 점 사이 거리(km, 가까운 값) */
  dist(a: string, b: string): number;
}

export function createRegistry(geo: GeoData): Registry {
  const regions = geo.units.regions;
  const regionByKey = new Map(regions.map((r) => [r.key, r]));
  const places = new Map<string, Place>();
  for (const region of regions) {
    const items = new Map(region.items.map((it) => [it.id, it]));
    for (const lesson of region.lessons) {
      for (const id of lesson.items) {
        const item = items.get(id);
        if (!item) throw new Error(`과에 없는 곳: ${region.key} ${lesson.no}과 ${id}`);
        places.set(id, { item, region, lesson });
      }
    }
    for (const it of region.items) if (!places.has(it.id)) throw new Error(`과에 들지 않은 곳: ${it.id}`);
  }
  const layerOf = (id: string) => places.get(id)?.region.layer ?? 'sgg';
  const nb = (id: string) => geo.neighbors[layerOf(id)][id] ?? [];
  const pt = (id: string) => {
    const l = geo.labels[id];
    if (!l) throw new Error(`이름표 점 없음: ${id}`);
    return l;
  };
  const xy = (a: string, b: string) => {
    const [x0, y0] = pt(a), [x1, y1] = pt(b);
    const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180);
    return [(x1 - x0) * k * 111.32, (y1 - y0) * 110.57];
  };
  return {
    regions,
    region: (key) => regionByKey.get(key),
    place: (id) => places.get(id),
    bySlug: (region, slug) => {
      const it = regionByKey.get(region)?.items.find((v) => v.slug === slug);
      return it && places.get(it.id);
    },
    lesson: (region, no) => regionByKey.get(region)?.lessons.find((l) => l.no === no),
    screenOf: (id) => places.get(id)?.region.screens?.find((s) => s.items.includes(id)),
    adjacent: (a, b) => nb(a).includes(b),
    neighborsOf: nb,
    dir8: (from, to) => {
      const [dx, dy] = xy(from, to);
      const deg = Math.atan2(dy, dx) * 180 / Math.PI;
      return DIRS[(Math.round(deg / 45) + 8) % 8];
    },
    dist: (a, b) => Math.hypot(...xy(a, b)),
  };
}
