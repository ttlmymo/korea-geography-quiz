// 빌드 때 정적 쪽이 읽는 경계 데이터(앱과 같은 판). 지역·과·곳(units), 이웃, 이름(search), 정적 쪽 SVG(src/data/svg)
import fs from 'node:fs';
import path from 'node:path';
import { DATA_VER } from '../consts';
import type { Region, UnitsFile, NeighborsFile } from '../app/types';

const read = (...p: string[]) => JSON.parse(fs.readFileSync(path.join(process.cwd(), ...p), 'utf8'));

export const UNITS: UnitsFile = read('public/data/geo', DATA_VER, 'units.json');
export const NEIGHBORS: NeighborsFile = read('public/data/geo', DATA_VER, 'neighbors.json');
const SEARCH: { id: string; ko: string; kind: string; region: string }[] = read('public/data/geo', DATA_VER, 'search.json');

export interface SvgItem { id: string; d: string; lx: number; ly: number; ir: number; dongs: string[]; gu: string[]; name?: string }   // name: 데이터에 없는 곳(개편 전 옛 구)
export interface SvgData { w: number; h: number; items: SvgItem[]; water: string; out: string }
const svgCache = new Map<string, SvgData>();
export function svgOf(region: string): SvgData {
  if (!svgCache.has(region)) svgCache.set(region, read('src/data/svg', `${region}.json`));
  return svgCache.get(region)!;
}

export const region = (key: string): Region => UNITS.regions.find((r) => r.key === key)!;
const names = new Map(SEARCH.filter((s) => s.kind !== 'emd').map((s) => [s.id, s.ko]));
const regionOfId = new Map(SEARCH.filter((s) => s.kind !== 'emd').map((s) => [s.id, s.region]));
/** 시군구·시 id → 이름('고양시 덕양구'처럼 일반구는 시 이름과 함께) */
export const nameOf = (id: string) => names.get(id) ?? id;
export const regionKeyOf = (id: string) => regionOfId.get(id) ?? '';

/** 읍·면·동 수 */
export function countKinds(dongs: string[]) {
  return { 읍: dongs.filter((n) => n.endsWith('읍')).length, 면: dongs.filter((n) => n.endsWith('면')).length, 동: dongs.filter((n) => n.endsWith('동')).length };
}
export function kindsText(dongs: string[]) {
  const k = countKinds(dongs);
  if (!k.읍 && !k.면) return `행정동 ${k.동}개`;
  return [k.읍 && `${k.읍}읍`, k.면 && `${k.면}면`, k.동 && `${k.동}동`].filter(Boolean).join(' ');
}

/** 같은 층(서울·인천 시군구, 경기 시)에서 맞닿은 곳. 지역 밖 이웃은 이름 앞에 시도를 붙인다 */
export function neighborsOf(r: Region, id: string): { id: string; name: string; inRegion: boolean }[] {
  const list = (r.layer === 'si' ? NEIGHBORS.si : NEIGHBORS.sgg)[id] ?? [];
  const SIDO: Record<string, string> = { seoul: '서울', incheon: '인천', gyeonggi: '경기' };
  return list.map((n) => {
    const inRegion = r.items.some((it) => it.id === n);
    const rk = regionKeyOf(n);
    return { id: n, inRegion, name: inRegion ? nameOf(n) : `${SIDO[rk] ?? ''} ${nameOf(n)}`.trim() };
  });
}

/* ---------- 영어 이름: 주소 이름(slug)에서. 'mapo-gu' → 'Mapo-gu', 'goyang-si-deogyang-gu' → 'Goyang-si Deogyang-gu' ---------- */
const UNITS_SRC: { regions: { slugs: Record<string, string> }[]; generalGu: Record<string, string> } = read('src/data/units.json');
const slugByKo = new Map<string, string>();
for (const r of UNITS_SRC.regions) for (const [ko, sl] of Object.entries(r.slugs)) slugByKo.set(ko, sl);
for (const [ko, sl] of Object.entries(UNITS_SRC.generalGu)) if (ko !== '_note') slugByKo.set(ko, sl);
const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
export function enNameOf(id: string): string {
  const ko = nameOf(id);
  const sl = slugByKo.get(ko);
  if (!sl) return ko;
  const m = /^(.+?-si)-(.+)$/.exec(sl);
  return m ? `${cap(m[1])} ${cap(m[2])}` : cap(sl);
}
const SIDO_EN: Record<string, string> = { seoul: 'Seoul', incheon: 'Incheon', gyeonggi: 'Gyeonggi' };
/** 영어 쪽의 맞닿은 곳: 지역 밖이면 시도를 앞에 */
export function neighborsEn(r: Region, id: string) {
  return neighborsOf(r, id).map((n) => (n.inRegion ? enNameOf(n.id) : `${enNameOf(n.id)} (${SIDO_EN[regionKeyOf(n.id)] ?? ''})`));
}
export const listEn = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** 서울 한강 북쪽 14개 구(파이프라인 NORTH 와 같은 목록, 한강 띠를 만들 때 쓴 것) */
/** 정적 지도 묶음 칠(RegionMap 의 t-a~t-e 와 같은 색 — 표의 색 견본용) */
export type Tone = 'a' | 'b' | 'c' | 'd' | 'e';
export const TONE_FILL: Record<Tone, string> = { a: 'var(--grp-1)', b: 'var(--m0)', c: 'var(--grp-2)', d: 'var(--grp-3)', e: 'var(--grp-4)' };

export const SEOUL_NORTH = new Set(['11110', '11140', '11170', '11200', '11215', '11230', '11260', '11290', '11305', '11320', '11350', '11380', '11410', '11440'].map((c) => `kr:sgg:${c}`));
