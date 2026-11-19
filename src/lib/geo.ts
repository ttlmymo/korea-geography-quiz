// 빌드 때 정적 쪽이 읽는 경계 데이터(앱과 같은 판). 지역·과·곳(units), 이웃, 이름(src/data/search-sgg.json, 빌드 전용), 정적 쪽 SVG(src/data/svg)
import fs from 'node:fs';
import path from 'node:path';
import { DATA_VER } from '../consts';
import type { EmdUnitFile, Region, UnitsFile, NeighborsFile } from '../app/types';
import { SIDOS, sidoOf } from '../app/sidos';
import { slugMapOf, enOfSlug, listEn, type Named } from './regions';

const read = (...p: string[]) => JSON.parse(fs.readFileSync(path.join(process.cwd(), ...p), 'utf8'));

export const UNITS: UnitsFile = read('public/data/geo', DATA_VER, 'units.json');
export const NEIGHBORS: NeighborsFile = read('public/data/geo', DATA_VER, 'neighbors.json');
const SEARCH: Named[] = read('src/data', 'search-sgg.json').items;   // 시·군·구·시 이름(파이프라인이 씀, 앱은 받지 않음)

export interface SvgItem { id: string; d: string; lx: number; ly: number; ir: number; dongs: string[]; gu: string[]; name?: string }   // name: 데이터에 없는 곳(개편 전 옛 구)
export interface SvgData { w: number; h: number; items: SvgItem[]; water: string; out: string }
const svgCache = new Map<string, SvgData>();
export function svgOf(region: string): SvgData {
  if (!svgCache.has(region)) svgCache.set(region, read('src/data/svg', `${region}.json`));
  return svgCache.get(region)!;
}

export const region = (key: string): Region => UNITS.regions.find((r) => r.key === key)!;
/** 동 단원 파일(판 폴더 emd/{코드}.json) — 과 없는 지역(세종, N4 · E12)의 소개 쪽 범위 말·과 수를 만들 때 */
export const emdUnitFile = (code: string): EmdUnitFile => read('public/data/geo', DATA_VER, 'emd', `${code}.json`);
const names = new Map(SEARCH.filter((s) => s.kind !== 'emd').map((s) => [s.id, s.ko]));
const regionOfId = new Map(SEARCH.filter((s) => s.kind !== 'emd').map((s) => [s.id, s.region]));
/** 시 id → 그 시의 일반구들(검색 자료의 si 가 시 id 인 곳). 일반구를 시로 합친 층의 시 쪽이 일반구 소개를 절로 싣는다 */
export const ilbanGuOf = (cityId: string): { id: string; ko: string }[] =>
  (SEARCH as (Named & { si?: string })[]).filter((s) => s.kind !== 'emd' && s.si === cityId && s.id !== cityId).map((s) => ({ id: s.id, ko: s.ko }));
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

/** 같은 층(서울·인천 시군구, 경기 시)에서 맞닿은 곳. 지역 밖 이웃은 이름 앞에 시도(지역 표 짧은 이름)를 붙인다 */
export function neighborsOf(r: Region, id: string): { id: string; name: string; inRegion: boolean }[] {
  const list = (r.layer === 'si' ? NEIGHBORS.si : NEIGHBORS.sgg)[id] ?? [];
  return list.map((n) => {
    const inRegion = r.items.some((it) => it.id === n);
    const rk = regionKeyOf(n);
    return { id: n, inRegion, name: inRegion ? nameOf(n) : `${sidoOf(rk)?.ko ?? ''} ${nameOf(n)}`.trim() };
  });
}

/* ---------- 영어 이름: 주소 이름(slug)에서. 'mapo-gu' → 'Mapo-gu', 'goyang-si-deogyang-gu' → 'Goyang-si Deogyang-gu' ----------
 * 곳 id 기준(계획서 E9): 원고의 이름 → slug 를 그 지역 안 이름으로 id 에 잇는다(중구·동구처럼 겹치는 이름이 덮어쓰지 않게) */
const UNITS_SRC: { regions: { key: string; slugs: Record<string, string> }[]; generalGu: Record<string, string> } = read('src/data/units.json');
const slugById = slugMapOf(UNITS_SRC, SEARCH);
// 앱이 받는 판(units.json 의 곳·일반구 단원 곳)과 원고가 어긋나면 멈춘다. 판에만 있는 곳(미리보기의 임시 지역)은 판의 slug 를 쓴다
for (const it of [...UNITS.regions.flatMap((r) => r.items), ...Object.values(UNITS.guUnits ?? {}).flatMap((u) => u.items)]) {
  const sl = slugById.get(it.id);
  if (sl === undefined) slugById.set(it.id, it.slug);
  else if (sl !== it.slug) throw new Error(`곳 ${it.id}: 원고 slug ${sl} 와 판 slug ${it.slug} 가 다름(파이프라인을 다시 돌릴 것)`);
}
export function enNameOf(id: string): string {
  const sl = slugById.get(id);
  return sl ? enOfSlug(sl) : nameOf(id);
}
// 지역 키 → 영어 이름(지역 표 en, 계획서 E8 · N26). 영어 이름을 확인하지 않은 지역(enChecked false)은 넣지 않는다
const SIDO_EN: Record<string, string> = Object.fromEntries(SIDOS.filter((s) => s.enChecked).map((s) => [s.key, s.en]));
/** 영어 쪽의 맞닿은 곳: 지역 밖이면 시도를 앞에 */
export function neighborsEn(r: Region, id: string) {
  return neighborsOf(r, id).map((n) => (n.inRegion ? enNameOf(n.id) : `${enNameOf(n.id)} (${SIDO_EN[regionKeyOf(n.id)] ?? ''})`));
}
export { listEn };
import EMD_EN_BY_PLACE from '../data/emd-en-by-place.json';
/** 곳 id → 그 곳의 읍·면·동 영어 이름(국어의 로마자 표기법, pipeline/data/emd-en.json 손 표). 경계 데이터 svg 의 dongs 와 같은 차례 */
export const enDongs = (placeId: string): string[] => ((EMD_EN_BY_PLACE as unknown as Record<string, string[][]>)[placeId] ?? []).map((p) => p[1]);
/** 영어 지도의 이름표: 시·군·구 영어 이름('Suwon-si Jangan-gu' 는 일반구만 'Jangan-gu'). 옛 인천 구(old:)는 'Jung-gu' 꼴로 */
const OLD_INCHEON_EN: Record<string, string> = { '중구': 'Jung-gu', '동구': 'Dong-gu', '미추홀구': 'Michuhol-gu', '연수구': 'Yeonsu-gu', '남동구': 'Namdong-gu', '부평구': 'Bupyeong-gu', '계양구': 'Gyeyang-gu', '서구': 'Seo-gu', '강화군': 'Ganghwa-gun', '옹진군': 'Ongjin-gun' };
export const enShortOf = (id: string): string => (id.startsWith('old:') ? (OLD_INCHEON_EN[id.slice(4)] ?? id.slice(4)) : enNameOf(id).replace(/^[^ ]+-si /, ''));


/** 서울 한강 북쪽 14개 구(파이프라인 NORTH 와 같은 목록, 한강 띠를 만들 때 쓴 것) */
/** 정적 지도 묶음 칠(RegionMap 의 t-a~t-e 와 같은 색 — 표의 색 견본용) */
export type Tone = 'a' | 'b' | 'c' | 'd' | 'e';
export const TONE_FILL: Record<Tone, string> = { a: 'var(--grp-1)', b: 'var(--m0)', c: 'var(--grp-2)', d: 'var(--grp-3)', e: 'var(--grp-4)' };

export const SEOUL_NORTH = new Set(['11110', '11140', '11170', '11200', '11215', '11230', '11260', '11290', '11305', '11320', '11350', '11380', '11410', '11440'].map((c) => `kr:sgg:${c}`));
