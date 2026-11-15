// 경계 데이터 받기: public/data/geo/{판}/ 의 JSON. 앱과 경계가 같은 배포에 실리므로 HTTP 캐시로 충분하다(설계서 8.3)
import type { EmdUnitFile, GeoData, LabelsFile, NeighborsFile, UnitsFile } from './types.ts';
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

/** 지역 경계(시·군·구 층, 이웃 땅·한강 포함). 동은 지역 파일이 아니라 단원 파일(loadUnitTopo)로 받는다(E5) */
export const loadTopo = (base: string, ver: string, region: string) =>
  loadJSON<Topology>(geoUrl(base, ver, `${region}-sgg.topo.json`));

/** 전국 시·도 지도(계획서 N23 · E8): 지역 고르기와 시·도 단원(korea)이 함께 쓴다. 처음 그릴 때 받는다(부팅 때는 받지 않음) */
export const loadSidoTopo = (base: string, ver: string) =>
  loadJSON<Topology>(geoUrl(base, ver, 'sido.topo.json'));

/** 동 단원 파일(계획서 N11·N17): 처음 열 때(부팅 때는 필요한 것만) 받는다 */
export const loadUnitFile = (base: string, ver: string, code: string) =>
  loadJSON<EmdUnitFile>(geoUrl(base, ver, `emd/${code}.json`));

/** 동 단원 지도 경계(동 5m + 같은 위상의 이웃 땅·강 띠, N11): 단원 지도를 처음 그릴 때 받는다 */
export const loadUnitTopo = (base: string, ver: string, code: string) =>
  loadJSON<Topology>(geoUrl(base, ver, `emd/${code}.topo.json`));
