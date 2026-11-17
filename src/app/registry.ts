// 지역·과·곳을 찾는 색인과, 두 곳 사이의 방위·거리·맞닿음.
// 동 단원(계획서 N30)은 지역 목록(regions)과 따로 units 에 지연 등록한다(addUnit). 지역 목록을 도는 곳(홈 탭·지역 고르기·다 채움)은 그대로이고,
// place·region·lesson·bySlug·screenOf 는 두 목록을 다 찾는다. 단원 파일을 받기 전에도 동 색인(units.json emdUnits)으로
// '아는 곳'·복습 차례·단원을 판정한다(N17).
// 일반구 단원(units.json guUnits, E7 · N5)은 받을 파일이 없어 부팅 때 units 에 바로 등록한다.
// 전국 앱 틀(E8): 지역마다 따로 검사해 결함 있는 지역만 빼고(failed — main.ts 가 geo_load_fail 로 알린다) 나머지로 앱이 돈다.
// 과 없는 지역(세종·제주 — layer 'emd', lessons [], 계획서 N4)은 동 색인이 있을 때만 싣는다.
// 시·도 단원(units.json korea, key 'korea', layer 'sido')은 일반구 단원처럼 부팅 때 units 에 등록한다 — unit 이 없어 지역처럼 다룬다(areaOf('korea') = 'korea')
// 스위치 셋(설계안 EN_EMD 5.1): 동(emd — 동 색인·과 없는 지역)·일반구(gu)·시·도 단원(korea)을 따로 끈다. 한국어 앱은 모두 켬, 영어 앱은 판에 영어 이름(units.json
// enNames)이 있을 때만 EN_EMD·EN_GU·EN_KOREA 대로 켬(unitOptions). 전에는(N26) 영어 앱이 셋을 함께 껐다 — createRegistry(geo, { emd: false }) 하나가 셋을 막았다
import type { EmdIndex, EmdUnitFile, GeoData, GuUnitFile, Item, KoreaFile, Lesson, Region, Screen, UnitsFile } from './types.ts';
import { nearSidoName, partOf } from './sidos.ts';

export type Dir8 = 'E' | 'NE' | 'N' | 'NW' | 'W' | 'SW' | 'S' | 'SE';
const DIRS: Dir8[] = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];

export interface Place { item: Item; region: Region; lesson: Lesson }

/** 동 색인의 단원 하나(단원 파일 없이 아는 것). key = '{지역}/{단원 slug}' */
export interface UnitRef { key: string; region: string; code: string; index: EmdIndex }

/** 단원 키 모양(kgq_lastunit_v1 검사와 같은 식, 계획서 N16) */
export const UNIT_KEY = /^[a-z-]{2,20}\/[a-z0-9-]{2,40}$/;

export interface RegistryOptions {
  /** units.json emdUnits(동 색인)를 읽는가 — 동 단원과 과 없는 지역(세종·제주). 기본 true. false 면 동 단원을 등록하지 않고 색인도 읽지 않는다 */
  emd?: boolean;
  /** units.json guUnits(일반구 단원)를 등록하는가. 기본 true */
  gu?: boolean;
  /** units.json korea(시·도 단원)를 등록하는가. 기본 true */
  korea?: boolean;
}

/**
 * 영어 앱 스위치(설계안 EN_EMD 5.1 · 16절 되돌리기): 끄면 영어 앱은 그 단원을 지금 판에서도 싣지 않는다(2026-11-16 전 영어 앱처럼).
 * 기록은 지워지지 않는다(main.ts held · 키 분리 N16). 한국어 앱에는 닿지 않는다
 */
export const EN_EMD = true;
export const EN_GU = true;
export const EN_KOREA = true;

/**
 * 그 말 앱의 레지스트리 옵션: 한국어는 셋 다 켬. 영어는 판(units.json)에 영어 이름 표시(enNames — 파이프라인이 곳·과·화면·이웃 땅 en 을 모두 실었을 때만 씀)가 있을 때만
 * 스위치대로 켠다. 배포 직후 캐시(max-age 600)에 남은 옛 units.json 을 새 JS 가 받으면 셋을 꺼 지금 영어 앱과 같다(관문)
 */
export function unitOptions(lang: string, units: Pick<UnitsFile, 'enNames'>, sw: { emd: boolean; gu: boolean; korea: boolean } = { emd: EN_EMD, gu: EN_GU, korea: EN_KOREA }): Required<RegistryOptions> {
  if (lang !== 'en') return { emd: true, gu: true, korea: true };
  const ok = units?.enNames === true;
  return { emd: ok && sw.emd, gu: ok && sw.gu, korea: ok && sw.korea };
}

/**
 * 켠 단원에 따라 읽는 저장 키(main.ts 부팅): 오늘 푼 동 수(kgq_dailyemd_v1)는 동을 켰을 때, 마지막 단원·단원 시험 기록(kgq_lastunit_v1·kgq_bestunit_v1)은
 * 동이나 일반구를 켰을 때. 끈 단원의 키는 읽지 않고 지우지도 않는다(되돌리기 — EN_EMD 8절 6)
 */
export const unitKeyReads = (o: Required<RegistryOptions>) => ({ dailyEmd: o.emd, unitKeys: o.emd || o.gu });

export interface Registry {
  /** 쓸 수 있는 지역(데이터 차례). 결함 있는 지역은 빠진다(failed) */
  regions: Region[];
  /** 부팅 때 결함이 있어 뺀 지역·단원(지역별 격리 — 계획서 E8). why 는 짧은 이유 */
  failed: { key: string; why: string }[];
  /** 등록된 단원: 동 단원(지연 등록 — 부팅 때는 필요한 것만, 그 밖에는 처음 열 때)과 일반구 단원(부팅 때, 계획서 N5 · E7) */
  units: Region[];
  /** 지역 키(seoul) 또는 등록된 단원 키(seoul/jongno-gu) */
  region(key: string): Region | undefined;
  place(id: string): Place | undefined;
  bySlug(region: string, slug: string): Place | undefined;
  lesson(region: string, no: number): Lesson | undefined;
  /** 지역 전체를 묻는 판에서 그곳이 보이는 화면(경기 북서부 등) */
  screenOf(id: string): Screen | undefined;
  /** 공유 경계로 맞닿았나(다리로 이어진 바다 건너는 아님) */
  adjacent(a: string, b: string): boolean;
  /** 같은 층에서 맞닿은 곳(동은 단원 안 이웃) */
  neighborsOf(id: string): string[];
  /** from 에서 본 to 의 방위(이름표 점 기준) */
  dir8(from: string, to: string): Dir8;
  /** 이름표 점 사이 거리(km, 가까운 값) */
  dist(a: string, b: string): number;
  /** 이름표 점 [경도, 위도, 내접원 반지름 m](지역 곳은 labels.json, 동은 단원 파일). 모르는 곳은 undefined — 지도 엔진이 단원 지도를 만들 때 쓴다 */
  point(id: string): [number, number, number] | undefined;
  /** 지역 키는 그대로, 단원 키는 그 단원의 지역 키(홈 탭·kgq_last_v1, N9·N16). 모르는 키는 undefined */
  areaOf(key: string): string | undefined;
  /** 동 색인: 그 지역의 동 단원(색인 차례). 색인이 없으면(동 공개 전·옛 캐시·동을 끈 창 — 관문이 닫힌 영어 앱) [] — 동 입구를 숨긴다 */
  emdUnits(region: string): UnitRef[];
  /** 동 색인: 단원 키 → 단원 */
  unit(key: string): UnitRef | undefined;
  /** 동 색인: 동 id → 그 단원 */
  unitOf(id: string): UnitRef | undefined;
  /** 지금 데이터가 아는 곳인가: 지역의 곳이거나 동 색인의 곳(단원 파일을 아직 받지 않았어도) */
  known(id: string): boolean;
  /** 복습 차례를 가를 때 쓰는 곳 차례: 지역의 곳(지역 차례 · 곳 차례) 다음에 동 색인 차례 */
  order(id: string): number;
  /**
   * 단원이 섞이는 화면(오늘 복습·복습 목록)의 단원 이름(N12 · E11): 여러 시·도에 같은 이름이 있는 시·군·구의 동 단원은 지역 이름을 붙인다('부산 중구').
   * 그 밖은 단원 이름 그대로('종로구'), 지역 키면 지역 이름. 모르는 키는 undefined
   */
  mixName(key: string): string | undefined;
  /** 동 단원 파일을 등록한다. 모양이 틀리거나 색인과 어긋나면 throw 하고 아무것도 바꾸지 않는다. 이미 등록된 단원이면 그것을 돌려준다 */
  addUnit(file: EmdUnitFile): Region;
  /** 받기·등록에 실패한 단원을 이 창에서 뺀다(색인에서 지움 → 복습·홈 계산에서 빠지고 앱은 계속 돈다, N30 단원 격리) */
  dropUnit(key: string): void;
}

export function createRegistry(geo: GeoData, opts: RegistryOptions = {}): Registry {
  const emdOn = opts.emd !== false;
  const guOn = opts.gu !== false;
  const koreaOn = opts.korea !== false;
  const regions: Region[] = [];
  const failed: { key: string; why: string }[] = [];
  const regionByKey = new Map<string, Region>();
  const places = new Map<string, Place>();
  const order = new Map<string, number>();
  const emd = emdOn ? geo.units.emdUnits ?? {} : {};
  /**
   * 지역 하나를 검사해 그 지역의 곳(과 → 곳)을 돌려준다. 결함이 있으면 throw — 부르는 쪽이 그 지역만 뺀다(지역별 격리, 계획서 E8).
   * 과 없는 지역(layer 'emd' — 세종·제주)은 곳이 없다(공부는 동 단원으로). null = 이 창에서 싣지 않는 지역(동을 끈 창의 과 없는 지역 — 결함 아님)
   */
  function checkRegion(region: Region): Map<string, Place> | null {
    if (!region || typeof region.key !== 'string' || !/^[a-z-]{2,20}$/.test(region.key)) throw new Error('지역 모양이 아님');
    if (regionByKey.has(region.key)) throw new Error('지역 키가 겹침');
    if (!Array.isArray(region.items) || !Array.isArray(region.lessons) || !Array.isArray(region.fit) || region.fit.length !== 4) throw new Error('지역 모양이 아님');
    const items = new Map(region.items.map((it) => [it?.id, it]));
    if (items.size !== region.items.length || !region.items.every((it) => typeof it?.id === 'string' && typeof it.ko === 'string' && typeof it.slug === 'string')) throw new Error('곳 모양이 틀리거나 id 가 겹침');
    if (region.layer === 'emd') {
      if (region.lessons.length) throw new Error('과 없는 지역에 과가 있음');
      if (!emdOn) return null;
      if (!(emd[region.key] ?? []).length) throw new Error('과 없는 지역인데 동 색인이 없음');
      return new Map();
    }
    if (!['sgg', 'si'].includes(region.layer)) throw new Error(`모르는 층 ${region.layer}`);
    const add = new Map<string, Place>();
    for (const lesson of region.lessons) {
      for (const id of lesson?.items ?? []) {
        const item = items.get(id);
        if (!item) throw new Error(`과에 없는 곳: ${lesson.no}과 ${id}`);
        if (add.has(id)) throw new Error(`두 과에 든 곳: ${id}`);
        add.set(id, { item, region, lesson });
      }
    }
    for (const it of region.items) {
      if (!add.has(it.id)) throw new Error(`과에 들지 않은 곳: ${it.id}`);
      if (places.has(it.id)) throw new Error(`다른 지역과 겹치는 곳: ${it.id}`);
      // 이름표 점(labels.json)이 없으면 과 문제를 만들 때(방위·거리) 깨진다 — 그 지역만 뺀다(addGu·addKorea·addUnit 과 같은 검사, E8 검수)
      if (geo.labels?.[it.id]?.length !== 3) throw new Error(`이름표 점 없음: ${it.id}`);
    }
    for (const s of region.screens ?? []) for (const id of s.items) if (!add.has(id)) throw new Error(`화면에 없는 곳: ${id}`);
    return add;
  }
  // 여러 시·도에 같은 이름이 있는 시·군·구(중구·동구·서구·남구·북구·강서구·고성군 — 계획서 2.3 · N12 · E11): 지역이 섞이는 화면(오늘 복습·복습 목록)에서
  // 시·도 이름을 붙여 쓴다('부산 중구'·'서울 중구'). 이름 목록은 판 units.json sameNames(전국 기준 — 다른 지역을 열 때마다 이름이 바뀌지 않게)이고,
  // 그것이 없는 판(옛 캐시)이면 이 창에 싣는 지역 사이에서 겹치는 이름만 센다.
  // 원래 데이터는 고치지 않고 그 곳만 full 을 붙인 사본을 쓴다(같은 데이터로 여러 레지스트리를 만들어도 섞이지 않게).
  // 지역 안 묶음(지역 표 parts — 전남광주의 자치구 5곳, 계획서 N3 · E16)에 든 곳은 지역 이름 대신 묶음 이름을 붙인다. 2026-11-15 부터 그 묶음 이름이
  // 법정 약칭 '광주특별시'라 지역 이름과 같다('광주특별시 동구' — E16 의 '광주 동구'는 법정 이름이 아니어서 바꿈).
  // 이름 앞부분이 다른 시·도 짧은 이름과 겹치는 곳(경기 '광주시' — sidos.ts nearSidoName, 결정표 D97 2026-11-16)도 같은 방법으로 '경기 광주시'
  const same = new Set<string>(Array.isArray(geo.units.sameNames) ? geo.units.sameNames.filter((n) => typeof n === 'string') : []);
  {
    const nameCount = new Map<string, number>();
    for (const r of geo.units.regions ?? []) if ((r?.layer === 'sgg' || r?.layer === 'si') && Array.isArray(r.items)) for (const it of r.items) if (typeof it?.ko === 'string') nameCount.set(it.ko, (nameCount.get(it.ko) ?? 0) + 1);
    for (const [n, c] of nameCount) if (c > 1) same.add(n);
  }
  /** 섞인 화면에서 지역 이름을 붙일 곳: 같은 이름 곳 또는 이름 앞부분이 다른 시·도 이름과 겹치는 곳. code = 시·군·구 코드(곳 id 끝 또는 단원 코드) */
  const tagged = (ko: unknown, code: unknown) => typeof ko === 'string' && (same.has(ko) || (typeof code === 'string' && nearSidoName(ko, code.slice(0, 2))));
  const codeOfId = (id: unknown) => (typeof id === 'string' ? id.replace(/^kr:sgg:/, '') : '');
  const withFull = (r: Region): Region => (r?.layer === 'sgg' || r?.layer === 'si') && Array.isArray(r.items) && r.items.some((it) => tagged(it?.ko, codeOfId(it?.id)) && !it.full)
    ? { ...r, items: r.items.map((it) => (tagged(it.ko, codeOfId(it.id)) && !it.full ? { ...it, full: `${partOf(r.key, it.id)?.ko ?? r.ko} ${it.ko}` } : it)) }
    : r;
  for (const region0 of geo.units.regions ?? []) {
    let add: Map<string, Place> | null;
    let region = region0;
    try {
      // 이름 붙이기도 격리 안에서(E16 검수: 키·곳 id 모양이 틀린 지역 하나가 try 밖에서 예외를 내 레지스트리 전체가 멈췄다)
      region = withFull(region0);
      add = checkRegion(region);
    } catch (e) {
      failed.push({ key: String(region?.key ?? '?'), why: String((e as Error)?.message ?? e).slice(0, 80) });
      continue;
    }
    if (!add) continue;
    regions.push(region);
    regionByKey.set(region.key, region);
    for (const [id, p] of add) places.set(id, p);
    for (const it of region.items) order.set(it.id, order.size);
  }

  /* 동 색인: 지역 차례 → 색인 차례 → 곳 차례. 모양이 틀린 줄은 건너뛴다(부팅을 깨지 않게) */
  const unitByKey = new Map<string, UnitRef>();
  const unitOfId = new Map<string, UnitRef>();
  const unitsOf = new Map<string, UnitRef[]>();
  for (const r of regions) {
    const list: UnitRef[] = [];
    for (const u of emd[r.key] ?? []) {
      const key = `${r.key}/${u?.slug}`;
      if (!u || !/^\d{5}$/.test(u.code) || !UNIT_KEY.test(key) || !Array.isArray(u.ids) || unitByKey.has(key)) continue;
      const ref: UnitRef = { key, region: r.key, code: u.code, index: u };
      unitByKey.set(key, ref);
      list.push(ref);
      for (const s of u.ids) {
        const id = `kr:emd:${u.code}${s}`;
        unitOfId.set(id, ref);
        order.set(id, order.size);
      }
    }
    if (list.length) unitsOf.set(r.key, list);
  }
  // 과 없는 지역은 쓸 수 있는 동 단원이 하나라도 있어야 싣는다(색인 줄이 모두 틀렸으면 그 지역만 뺀다)
  for (const r of [...regions]) {
    if (r.layer !== 'emd' || unitsOf.has(r.key)) continue;
    regions.splice(regions.indexOf(r), 1);
    regionByKey.delete(r.key);
    failed.push({ key: r.key, why: '과 없는 지역인데 쓸 수 있는 동 단원이 없음' });
  }

  /* 등록된 동 단원 */
  const units: Region[] = [];
  const unitRegion = new Map<string, Region>();
  const unitNb = new Map<string, string[]>();
  const unitPt = new Map<string, [number, number, number]>();

  const nb = (id: string): string[] => {
    const layer = places.get(id)?.region.layer ?? 'sgg';
    // 동 단원은 단원 안 이웃, 시·도 단원은 korea 파일의 이웃(neighbors.json 에는 시·도 층이 없다)
    if (layer === 'emd' || layer === 'sido') return unitNb.get(id) ?? [];
    return geo.neighbors[layer][id] ?? [];
  };
  const pt = (id: string) => {
    const l = geo.labels[id] ?? unitPt.get(id);
    if (!l) throw new Error(`이름표 점 없음: ${id}`);
    return l;
  };
  const xy = (a: string, b: string) => {
    const [x0, y0] = pt(a), [x1, y1] = pt(b);
    const k = Math.cos(((y0 + y1) / 2) * Math.PI / 180);
    return [(x1 - x0) * k * 111.32, (y1 - y0) * 110.57];
  };
  const regionOf = (key: string) => regionByKey.get(key) ?? unitRegion.get(key);

  function addUnit(f: EmdUnitFile): Region {
    const have = unitRegion.get(f?.key);
    if (have) return have;
    const where = `단원 ${f?.key}`;
    if (!f || f.layer !== 'emd' || !UNIT_KEY.test(f.key) || !/^\d{5}$/.test(f.code)) throw new Error(`${where}: 단원 파일 모양이 아님`);
    if (regionByKey.has(f.key)) throw new Error(`${where}: 지역 키와 겹침`);
    const ref = unitByKey.get(f.key);
    if (ref && (ref.code !== f.code || ref.index.ids.join() !== f.items.map((it) => it.slug).join())) throw new Error(`${where}: 동 색인과 다름(판이 어긋남)`);
    // 검사를 다 통과한 뒤에만 색인에 넣는다(실패하면 아무것도 바꾸지 않는다).
    // 영어 이름(판 .2 items[].en, EN_EMD 3절)은 빈 글이 아닐 때만 옮긴다 — 옛 캐시 파일이면 없고, 영어 화면은 한글 이름을 쓴다(EN_EMD 5.4)
    const items: Item[] = f.items.map((it) => ({ id: it.id, ko: it.ko, slug: it.slug, kind: it.kind, line: '', ...(typeof it.en === 'string' && it.en ? { en: it.en } : {}) }));
    const byId = new Map(items.map((it) => [it.id, it]));
    if (byId.size !== items.length) throw new Error(`${where}: 곳 id 겹침`);
    const add = new Map<string, Place>();
    const region: Region = {
      key: f.key, sido: f.sido, ko: f.ko, full: f.full, en: f.en, layer: 'emd', fit: f.fit, items,
      lessons: f.lessons, screens: f.screens ?? [],
      unit: { parent: f.region, code: f.code, ...(f.si ? { si: f.si } : {}), meet: f.meet ?? {}, outside: f.outside ?? {}, ...(Array.isArray(f.far) ? { far: f.far } : {}) },
    };
    for (const it of items) {
      if (!it.id.startsWith(`kr:emd:${f.code}`)) throw new Error(`${where}: 곳 id ${it.id} 가 단원 코드와 다름`);
      if (places.has(it.id)) throw new Error(`${where}: 이미 있는 곳 ${it.id}`);
      if (f.labels?.[it.id]?.length !== 3) throw new Error(`${where}: 이름표 점 없음 ${it.id}`);
    }
    for (const lesson of region.lessons) {
      for (const id of lesson.items) {
        const item = byId.get(id);
        if (!item) throw new Error(`${where}: 과에 없는 곳 ${lesson.no}과 ${id}`);
        if (add.has(id)) throw new Error(`${where}: 두 과에 든 곳 ${id}`);
        add.set(id, { item, region, lesson });
      }
    }
    for (const it of items) if (!add.has(it.id)) throw new Error(`${where}: 과에 들지 않은 곳 ${it.id}`);
    for (const s of region.screens) for (const id of s.items) if (!byId.has(id)) throw new Error(`${where}: 화면에 없는 곳 ${id}`);
    for (const [id, p] of add) {
      places.set(id, p);
      unitNb.set(id, (f.neighbors?.[id] ?? []).filter((o) => byId.has(o)));
      unitPt.set(id, f.labels[id]);
      if (!order.has(id)) order.set(id, order.size);
    }
    units.push(region);
    unitRegion.set(region.key, region);
    return region;
  }

  /**
   * 일반구 단원(units.json guUnits, 계획서 N5 · E7): 부팅 때 바로 등록한다(받을 파일 없음 — 경계는 부모 지역 -sgg 의 sgg 층, 이름표 점·이웃은 labels·neighbors).
   * opts.gu 가 false 면 등록하지 않는다(EN_EMD 5.1). 모양이 틀리면 그 단원만 빼고 앱은 계속 돈다(N30 단원 격리 — 지역 과와 달리 throw 하지 않음)
   */
  function addGu(f: GuUnitFile): void {
    const parent = regionByKey.get(f?.region);
    if (!parent || f.key !== `${parent.key}/gu` || f.layer !== 'sgg' || unitRegion.has(f.key)) return;
    const items: Item[] = (f.items ?? []).map((it) => ({ id: it.id, ko: it.ko, slug: it.slug, line: it.line ?? '', full: it.full, si: it.si }));
    const byId = new Map(items.map((it) => [it.id, it]));
    const add = new Map<string, Place>();
    const region: Region = {
      key: f.key, sido: f.sido, ko: f.ko, full: f.full, en: f.en, layer: 'sgg', fit: f.fit, items, lessons: f.lessons ?? [], screens: f.screens ?? [],
      unit: { parent: parent.key, code: parent.sido, gu: true, meet: {}, outside: {} },
    };
    if (byId.size !== items.length || !items.length) return;
    for (const it of items) if (places.has(it.id) || !/^kr:sgg:\d{5}$/.test(it.id) || geo.labels[it.id]?.length !== 3) return;
    for (const lesson of region.lessons) for (const id of lesson.items) {
      const item = byId.get(id);
      if (!item || add.has(id)) return;
      add.set(id, { item, region, lesson });
    }
    if (add.size !== items.length || region.screens.some((s) => s.items.some((id) => !byId.has(id)))) return;
    for (const [id, p] of add) { places.set(id, p); order.set(id, order.size); }
    units.push(region);
    unitRegion.set(region.key, region);
  }
  if (guOn) for (const r of regions) { const g = geo.units.guUnits?.[r.key]; if (g) addGu(g); }

  /**
   * 시·도 단원(units.json korea, 계획서 N30 · E8 모델): 곳 id kr:sido:{코드}, 이름표 점·이웃은 이 파일에서. unit 이 없어 지역처럼 다룬다
   * (kgq_last_v1 = 'korea', 시험 최고 기록은 kgq_best_v1 — 둘 다 지역 키 모양). opts.korea 가 false 면 등록하지 않는다(EN_EMD 5.1).
   * 모양이 틀리면 이 단원만 빼고(failed) 앱은 계속 돈다
   */
  function addKorea(f: KoreaFile) {
    if (!f || f.key !== 'korea' || f.layer !== 'sido' || regionByKey.has('korea')) throw new Error('시·도 단원 모양이 아님');
    const items: Item[] = (f.items ?? []).map((it) => ({ id: it.id, ko: it.ko, slug: it.slug, line: it.line ?? '' }));
    const byId = new Map(items.map((it) => [it.id, it]));
    if (!items.length || byId.size !== items.length) throw new Error('곳이 없거나 겹침');
    for (const it of items) if (!/^kr:sido:\d{2}$/.test(it.id) || f.labels?.[it.id]?.length !== 3 || places.has(it.id)) throw new Error(`곳 ${it.id} 이 틀림`);
    const region: Region = { key: 'korea', sido: f.sido, ko: f.ko, full: f.full, en: f.en, layer: 'sido', fit: f.fit, items, lessons: f.lessons ?? [], screens: f.screens ?? [] };
    const add = new Map<string, Place>();
    for (const lesson of region.lessons) for (const id of lesson.items) {
      const item = byId.get(id);
      if (!item || add.has(id)) throw new Error(`과 ${lesson.no} 의 곳 ${id} 이 틀림`);
      add.set(id, { item, region, lesson });
    }
    if (add.size !== items.length || region.screens.some((s) => s.items.some((id) => !byId.has(id)))) throw new Error('과·화면 구성이 곳과 맞지 않음');
    for (const [id, p] of add) {
      places.set(id, p);
      unitNb.set(id, (f.neighbors?.[id] ?? []).filter((o) => byId.has(o)));
      unitPt.set(id, f.labels[id]);
      order.set(id, order.size);
    }
    units.push(region);
    unitRegion.set('korea', region);
  }
  if (koreaOn && geo.units.korea) {
    try { addKorea(geo.units.korea); } catch (e) { failed.push({ key: 'korea', why: String((e as Error)?.message ?? e).slice(0, 80) }); }
  }

  function dropUnit(key: string) {
    const ref = unitByKey.get(key);
    if (ref) {
      unitByKey.delete(key);
      for (const [id, r] of unitOfId) if (r === ref) unitOfId.delete(id);
      const list = unitsOf.get(ref.region);
      if (list) unitsOf.set(ref.region, list.filter((r) => r !== ref));
    }
    const region = unitRegion.get(key);
    if (region) {
      unitRegion.delete(key);
      units.splice(units.indexOf(region), 1);
      for (const it of region.items) { places.delete(it.id); unitNb.delete(it.id); unitPt.delete(it.id); }
    }
  }

  return {
    regions,
    failed,
    units,
    region: regionOf,
    place: (id) => places.get(id),
    bySlug: (region, slug) => {
      const it = regionOf(region)?.items.find((v) => v.slug === slug);
      return it && places.get(it.id);
    },
    lesson: (region, no) => regionOf(region)?.lessons.find((l) => l.no === no),
    screenOf: (id) => places.get(id)?.region.screens?.find((s) => s.items.includes(id)),
    adjacent: (a, b) => nb(a).includes(b),
    neighborsOf: nb,
    dir8: (from, to) => {
      const [dx, dy] = xy(from, to);
      const deg = Math.atan2(dy, dx) * 180 / Math.PI;
      return DIRS[(Math.round(deg / 45) + 8) % 8];
    },
    dist: (a, b) => Math.hypot(...xy(a, b)),
    point: (id) => geo.labels[id] ?? unitPt.get(id),
    // 단원 정보가 없는 등록 단원(시·도 단원 korea)은 지역처럼 자기 키
    areaOf: (key) => (regionByKey.has(key) ? key : unitByKey.get(key)?.region ?? (unitRegion.has(key) ? unitRegion.get(key)!.unit?.parent ?? key : undefined)),
    emdUnits: (region) => unitsOf.get(region) ?? [],
    unit: (key) => unitByKey.get(key),
    unitOf: (id) => unitOfId.get(id),
    // 등록된 동 단원의 곳은 색인에 없어도(시험·미리보기에서 파일만 등록) 안다. 받기에 실패한 단원(dropUnit)은 모른다
    known: (id) => places.has(id) || unitOfId.has(id),
    order: (id) => order.get(id) ?? Number.MAX_SAFE_INTEGER,
    mixName: (key) => {
      const ko = unitRegion.get(key)?.ko ?? unitByKey.get(key)?.index.ko;
      if (ko === undefined) return regionByKey.get(key)?.ko;
      const area = regionByKey.get(unitByKey.get(key)?.region ?? unitRegion.get(key)?.unit?.parent ?? '');
      // 지역 안 묶음(parts, E16)에 든 단원은 묶음 이름('광주특별시 동구' — 2026-11-15 법정 약칭)
      const code = unitByKey.get(key)?.code ?? unitRegion.get(key)?.unit?.code ?? '';
      return tagged(ko, code) && area ? `${partOf(area.key, code)?.ko ?? area.ko} ${ko}` : ko;
    },
    addUnit,
    dropUnit,
  };
}
