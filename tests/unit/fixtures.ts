// 단위 시험이 쓰는 실제 경계 데이터(커밋된 산출물)
import fs from 'node:fs';
import path from 'node:path';
import { DATA_VER } from '../../src/consts.ts';
import { createRegistry } from '../../src/app/registry.ts';
import type { GeoData } from '../../src/app/types.ts';

const dir = path.join(import.meta.dirname, '../../public/data/geo', DATA_VER);
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

export const geo: GeoData = { units: load('units.json'), neighbors: load('neighbors.json'), labels: load('labels.json') };
export const reg = createRegistry(geo);

/** 이름 → id (같은 이름이 여러 지역에 있으면 region 으로 고른다) */
export function idOf(name: string, region?: string): string {
  const hits = geo.units.regions.filter((r) => !region || r.key === region).flatMap((r) => r.items).filter((it) => it.ko === name);
  if (hits.length !== 1) throw new Error(`이름 ${name}: ${hits.length}곳`);
  return hits[0].id;
}
export const nameOf = (id: string) => reg.place(id)?.item.ko;
