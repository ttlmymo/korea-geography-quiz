// 단위 시험이 쓰는 실제 경계 데이터(커밋된 산출물)
import fs from 'node:fs';
import path from 'node:path';
import { DATA_VER } from '../../src/consts.ts';
import { createRegistry } from '../../src/app/registry.ts';
import { SIDOS, shownIn } from '../../src/app/sidos.ts';
import type { GeoData } from '../../src/app/types.ts';

const dir = path.join(import.meta.dirname, '../../public/data/geo', DATA_VER);
const load = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

export const geo: GeoData = { units: load('units.json'), neighbors: load('neighbors.json'), labels: load('labels.json') };
export const reg = createRegistry(geo);
/**
 * 동 색인(units.json emdUnits)과 일반구 단원(guUnits)을 뺀 판 — 동 공개 전·옛 캐시 units.json 을 흉내 낸다(동·일반구 입구 숨김 시험용.
 * E6 부터 운영 판에는 서울 동 색인이, E7 부터 인천·경기 동 색인과 경기 일반구 단원이 있다)
 */
const { emdUnits: _emdUnits, guUnits: _guUnits, ...unitsNoEmd } = geo.units;
export const geoNoEmd: GeoData = { ...geo, units: unitsNoEmd };
/**
 * 영어 앱이 받는 판(E16): main.ts 처럼 영어 이름을 확인하지 않은 지역(지역 표 enChecked false)을 뺀다. 영어 레지스트리는 createRegistry(geoEn, { emd: false }).
 * E16 에는 전남광주(Q5)가 빠졌고, 2026-11-15 사용자 지시로 전남광주 영문을 켠 뒤에는 운영 지역 표에 enChecked false 행이 없어 판 그대로와 같다.
 * 이 값은 불러올 때 한 번 만든다 — 지역 표를 바꿔 보는 시험(withEnHidden)은 geoEnNow() 를 쓴다
 */
export const geoEn: GeoData = { ...geo, units: { ...geo.units, regions: geo.units.regions.filter((r) => shownIn('en', r.key)) } };
/** 영어 앱이 받는 판을 부를 때의 지역 표로 만든다(main.ts 와 같은 거르기) — withEnHidden 안에서 쓴다 */
export const geoEnNow = (): GeoData => ({ ...geo, units: { ...geo.units, regions: geo.units.regions.filter((r) => shownIn('en', r.key)) } });
/**
 * '영어 이름을 확인하지 않은 지역은 영어 화면에서 숨김' 규칙(지역 표 enChecked false — Q5 · 계획서 N26)을 가짜 지역 표로 본다:
 * fn 동안만 그 지역 행의 enChecked 를 false 로 두고 끝나면(예외여도) 되돌린다. 2026-11-15 전남광주를 영어로 연 뒤 운영 지역 표에는 그런 행이 없지만
 * 규칙(앱의 shownIn·ctxName·regionsPage·scopeEn)은 남아 있어 이렇게 지킨다. 지역 표 행은 앱 모듈(app/sidos.ts SIDOS·sidoOf·sidoByCode,
 * lib/regions.ts LIVE)이 함께 쓰는 같은 객체라 모두 바뀐 값을 읽는다. 불러올 때 한 번 만든 표(정적 쪽 lib/geo.ts SIDO_EN, 위 geoEn)는 바뀌지 않는다
 */
export function withEnHidden<T>(key: string, fn: () => T): T {
  const row = SIDOS.find((s) => s.key === key);
  if (!row) throw new Error(`지역 표에 없는 키: ${key}`);
  const was = row.enChecked;
  row.enChecked = false;
  try { return fn(); } finally { row.enChecked = was; }
}
/** 시·도 단원(units.json korea)을 뺀 판 — E9 까지의 운영 판·지역 표 korea.status off 로 되돌린 판을 흉내 낸다(E10 부터 운영 판에는 korea 가 있다) */
const { korea: _korea, ...unitsNoKorea } = geo.units;
export const geoNoKorea: GeoData = { ...geo, units: unitsNoKorea };

/**
 * 지역 몇을 뺀 판: 그 지역의 지역 칸·동 색인·이름표 점·이웃(열쇠와 목록 모두)을 뺀다 — 그 지역을 열기 전의 운영 판을 흉내 낸다.
 * 파이프라인은 공개 지역 곳만 이웃 목록에 넣으므로 목록에서도 뺀다(E12: 부산 기장군의 이웃에 울산 울주군이 들었다). sameNames 를 빼면 E10 까지의 판.
 * 그 지역의 일반구 단원(guUnits — E13 충북 청주)도 뺀다
 */
function without(keys: string[], dropSame: boolean): GeoData {
  const codes = geo.units.regions.filter((r) => keys.includes(r.key)).map((r) => r.sido);
  const keep = (id: string) => !codes.some((c) => id.startsWith(`kr:sgg:${c}`) || id.startsWith(`kr:emd:${c}`));
  const { sameNames: _same, ...unitsNoSame } = geo.units;   // 같은 이름 목록(sameNames)은 E11 에 생겼다
  const nb = geo.neighbors as unknown as Record<string, Record<string, (string | { id: string })[]>>;
  return {
    units: { ...(dropSame ? unitsNoSame : geo.units), regions: geo.units.regions.filter((r) => !keys.includes(r.key)),
      emdUnits: Object.fromEntries(Object.entries(geo.units.emdUnits ?? {}).filter(([k]) => !keys.includes(k))),
      ...(geo.units.guUnits ? { guUnits: Object.fromEntries(Object.entries(geo.units.guUnits).filter(([k]) => !keys.includes(k))) } : {}) },
    labels: Object.fromEntries(Object.entries(geo.labels).filter(([id]) => keep(id))),
    neighbors: Object.fromEntries(Object.entries(nb).map(([layer, map]) => [layer, Object.fromEntries(Object.entries(map).filter(([id]) => keep(id))
      .map(([id, list]) => [id, list.filter((x) => keep(typeof x === 'string' ? x : x.id))]).filter(([, list]) => layer !== 'sea' || list.length))])) as unknown as GeoData['neighbors'],
  };
}
/**
 * 지역 표 공개 차례(openOrder)가 from 이상인(그 단계와 그 뒤에 연) 지역 키, 공개 차례로. 단계마다 키를 손으로 더하지 않는다(E13 검수 — E14·E15 를 함께 돌리면
 * 두 단계가 같은 줄에 서로 다른 키를 더해 합칠 때 부딪힌다). 새 지역은 지역 표에 openOrder 만 주면 아래 판들에서 저절로 빠진다.
 * 이 파일 안 도우미다 — 시험은 아래 export(E1x_KEYS·geoNo*·LIVE_BY_OPEN·OPENED_SINCE)를 쓴다(E14·E15 합칠 때 export 를 다시 감춤)
 */
const openedFrom = (from: number, to = Infinity) => SIDOS.filter((s) => s.openOrder != null && s.openOrder >= from && s.openOrder <= to)
  .sort((a, b) => a.openOrder! - b.openOrder!).map((s) => s.key);
/** E12 에 연 지역(대구·대전·울산·세종 — 공개 차례 5~8) */
export const E12_KEYS = openedFrom(5, 8);
/** E13 에 연 지역(강원·충북·전북·제주 — 공개 차례 9~12) */
export const E13_KEYS = openedFrom(9, 12);
/** E15 에 연 지역(경남 — 공개 차례 15. 13·14 는 함께 진행한 E14 충남·경북 몫) */
export const E15_KEYS = openedFrom(15, 15);
/**
 * 부산(E11, 공개 차례 4)과 그 뒤에 연 지역(E12~)을 뺀 판 — E10 까지의 운영 판(지역 표 busan.status off)을 흉내 낸다.
 * '운영 형식 옛 저장값의 숫자가 부산이 열려도 같다'를 견줄 때 쓴다
 */
export const geoNoBusan: GeoData = without(openedFrom(4), true);
/**
 * E12 에 연 네 지역(공개 차례 5~)과 그 뒤 지역을 뺀 판 — E11 운영 판(부산까지)을 흉내 낸다(sameNames 는 그대로 — E11 에 생겼다).
 * '운영 형식 옛 저장값의 숫자가 네 지역이 열려도 같다'를 견줄 때 쓴다
 */
export const geoNoE12: GeoData = without(openedFrom(5), false);
/**
 * E13 에 연 네 지역(강원·충북·전북·제주, 공개 차례 9~)과 그 뒤 지역을 뺀 판 — E12 운영 판(여덟 지역)을 흉내 낸다(units·labels·neighbors 가 E12 스냅숏과 같다).
 * '운영 형식 옛 저장값의 숫자가 네 지역이 열려도 같다'를 견줄 때 쓴다
 */
export const geoNoE13: GeoData = without(openedFrom(9), false);
/** E14 에 연 지역(충남·경북 — 공개 차례 13~14) */
export const E14_KEYS = openedFrom(13, 14);
/**
 * E14 에 연 두 지역(충남·경북, 공개 차례 13~)과 그 뒤 지역(E15 경남 — 공개 차례 15)을 뺀 판 — E13 운영 판(열두 지역)을 흉내 낸다
 * (units·labels·neighbors 가 E13 판과 같다 — 단 korea 1번 넓은 화면의 fit·minTapPx 는 충남 먼 섬 규칙(far lonLt 125.9)이 바뀌어 다르다).
 * '운영 형식 옛 저장값의 숫자가 충남·경북·경남이 열려도 같다'를 견줄 때 쓴다
 */
export const geoNoE14: GeoData = without(openedFrom(13), false);
/**
 * 경남(E15, 공개 차례 15)만 뺀 판 — E14 판(충남·경북까지 열네 지역)을 흉내 낸다(E14·E15 는 함께 진행해 합쳤다). 거제·남해의 바다 건너 이웃인
 * 부산 강서구의 sea 목록, 경남과 맞닿은 부산·대구·울산·전북·경북 곳의 이웃 목록에서도 경남 곳이 빠진다 — without.
 * '운영 형식 옛 저장값의 숫자가 경남이 열려도 같다'를 견줄 때 쓴다
 */
export const geoNoE15: GeoData = without(E15_KEYS, false);
/** E16 에 연 지역(전남광주 — 공개 차례 16, 마지막 새 지역) */
export const E16_KEYS = openedFrom(16, 16);
/**
 * 전남광주(E16)만 뺀 판 — E14·E15 합친 판(열다섯 지역)을 흉내 낸다. 전남광주와 맞닿은 전북·경남 곳(고창·정읍·순창·남원·하동)의 이웃 목록과
 * 바다 건너 이웃(진도·완도 ↔ 해남·강진)은 두 쪽이 모두 전남광주 곳이라 sea 목록에서 통째로 빠진다 — without. '운영 형식 옛 저장값의 숫자가 전남광주가 열려도 같다'를 견줄 때 쓴다
 */
export const geoNoE16: GeoData = without(E16_KEYS, false);
/**
 * 지금 판 기준 값(E14 — 지역이 늘 때마다 단언 숫자를 손으로 고치지 않게, 동시 진행한 단계를 합칠 때 같은 줄을 서로 다르게 고치지 않게):
 * LIVE_BY_OPEN = 공개 지역 키를 공개 차례(openOrder)로 · OPENED_SINCE(n) = 공개 차례 n 이상(그 단계와 뒤에 연) 지역 · OFF_KEY = 아직 열지 않은 지역 하나(지역 표 차례 첫째, 다 열면 undefined)
 */
export const LIVE_BY_OPEN = openedFrom(1);
export const OPENED_SINCE = (n: number) => openedFrom(n);
export const OFF_KEY: string | undefined = SIDOS.find((s) => s.status !== 'live')?.key;

/** 이름 → id (같은 이름이 여러 지역에 있으면 region 으로 고른다) */
export function idOf(name: string, region?: string): string {
  const hits = geo.units.regions.filter((r) => !region || r.key === region).flatMap((r) => r.items).filter((it) => it.ko === name);
  if (hits.length !== 1) throw new Error(`이름 ${name}: ${hits.length}곳`);
  return hits[0].id;
}
export const nameOf = (id: string) => reg.place(id)?.item.ko;
