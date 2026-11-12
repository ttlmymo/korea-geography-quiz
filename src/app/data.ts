// 경계 데이터 받기: public/data/geo/{판}/ 의 JSON. 앱과 경계가 같은 배포에 실리므로 HTTP 캐시로 충분하다(설계서 8.3)
import type { GeoData, LabelsFile, NeighborsFile, UnitsFile } from './types.ts';
import type { Topology } from './map/shapes.ts';

const cache = new Map<string, Promise<unknown>>();

export const geoUrl = (base: string, ver: string, file: string) => `${base.replace(/\/$/, '')}/data/geo/${ver}/${file}`;

export function loadJSON<T>(url: string): Promise<T> {
  let p = cache.get(url) as Promise<T> | undefined;
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return r.json() as Promise<T>;
    });
    p.catch(() => cache.delete(url));   // 실패는 다음에 다시 받게
    cache.set(url, p);
  }
  return p;
}

export async function loadGeo(base: string, ver: string): Promise<GeoData> {
  const [units, neighbors, labels] = await Promise.all([
    loadJSON<UnitsFile>(geoUrl(base, ver, 'units.json')),
    loadJSON<NeighborsFile>(geoUrl(base, ver, 'neighbors.json')),
    loadJSON<LabelsFile>(geoUrl(base, ver, 'labels.json')),
  ]);
  return { units, neighbors, labels };
}

/** 지역 경계: 'sgg'(시·군·구 층, 이웃 땅·한강 포함) 또는 'emd'(동 층) */
export const loadTopo = (base: string, ver: string, region: string, level: 'sgg' | 'emd' = 'sgg') =>
  loadJSON<Topology>(geoUrl(base, ver, `${region}-${level}.topo.json`));
