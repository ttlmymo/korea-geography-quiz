// 전국 앱 틀(계획서 NATIONWIDE_PLAN E8): 지역 표를 읽는 앱, 지역별 격리, 과 없는 지역(세종·제주 — N4), 시·도 단원(korea — N30), 홈 탭(N22),
// 지역 고르기(N23)·전국 시·도 지도, 문구(count · SIDO_EN · regionDesc·hubs·river 를 지역 표로).
// 운영 판 폴더에는 세 지역만 있으므로 과 없는 지역은 서울을 과 없는 지역으로 바꾼 판(종로·노원 두 단원 — 제주처럼 단원 둘)으로,
// 시·도 단원은 전국 시·도 지도(sido.topo.json)의 이름표 점으로 만든 판으로 흉내 낸다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import * as topo from 'topojson-client';
import { DATA_VER } from '../../src/consts.ts';
import type { Mastery, Rec } from '../../src/app/core/mastery.ts';
import { homeCard, homeUnitOf, mainIds, mainUnitOf, regionDone, unitMain, type HomeInput } from '../../src/app/core/next.ts';
import { gaUnit, onMissingUnit, registerUnits, studyKeys, unitsToLoad } from '../../src/app/core/units.ts';
import { createDeck } from '../../src/app/core/deck.ts';
import { createRegistry, unitOptions, type Registry } from '../../src/app/registry.ts';
import { parseRoute, toHash, type Known } from '../../src/app/router.ts';
import { GROUPS, SIDOS, shownIn, sidoByCode, sidoOf } from '../../src/app/sidos.ts';
import { SIDO_KO } from '../../src/app/text/ko.ts';
import { UI_EN, UI_KO, setLang } from '../../src/app/text/ui.ts';
import type { EmdIndex, EmdUnitFile, GeoData, KoreaFile, Region } from '../../src/app/types.ts';
import type { Ctx } from '../../src/app/ui/ctx.ts';
import { KOREA_MAP } from '../../src/app/ui/maps.ts';
import { KOREA_FIT, homePage, homeTabs, pickPage, regionsPage, unitPage } from '../../src/app/ui/pages.ts';
import { EN_OFF, geo, geoEn, geoEnNow, geoNoBusan, geoNoE12, geoNoKorea, reg, withEnHidden } from './fixtures.ts';

const T = 20000;
const root = path.join(import.meta.dirname, '../..');
const FIX = path.join(root, 'tests/fixtures/emd');
const unitFile = (code: string): EmdUnitFile => JSON.parse(fs.readFileSync(path.join(FIX, `${code}.json`), 'utf8'));
const indexOf = (j: EmdUnitFile): EmdIndex => ({ code: j.code, ko: j.ko, slug: j.key.split('/')[1], n: j.items.length, lessons: j.lessons.length, ids: j.items.map((it) => it.slug) });
const rec = (box: number, due: number | null): Rec => ({ box, due, hi: box >= 5 ? 3 : box >= 3 ? 2 : box >= 1 ? 1 : 0, streak: 0, grad: false, front: false });
const fill = (ids: string[], box = 2, due: number | null = T + 2): Mastery => Object.fromEntries(ids.map((id) => [id, rec(box, due)]));
const ctxOf = (r: Registry, o: Partial<Ctx> = {}): Ctx => ({
  reg: r, geo, base: '/', ver: DATA_VER, storageOk: true, inApp: false,
  mastery: {}, lessonDeck: null, otherDeck: null, checkDeck: null, checkStart: 0,
  daily: null, dailyEmd: null, last: null, lastUnit: null, settings: { autoNext: false }, homeRegion: null, bests: {}, bestUnits: {},
  today: () => T, save() {}, go() {}, back() {}, render() {}, toast() {},
  ...o,
}) as Ctx;
const base = (r: Registry, more: Partial<HomeInput> = {}): HomeInput => ({ reg: r, mastery: {}, deck: null, daily: null, last: null, today: T, ...more });
const pressed = (html: string) => /data-arg="([a-z-]+)" aria-pressed="true"/.exec(html)?.[1];
const label = (html: string) => /<p class="h-label">.*?<span>([^<]*)<\/span>/.exec(html)?.[1];
const BAD = /undefined|NaN|kr:(sgg|emd|sido):|\[object/;
/** 이름 사이 ' · ' 의 앞 칸은 줄을 바꾸지 않는 빈칸(pages.ts SEP) — 견주기 쉽게 보통 빈칸으로 */
const sp = (html: string) => html.replace(/\u00a0/g, ' ');

/** 지역 키로 원고 지역 찾기(E11 부터 운영 판 차례는 서울·부산·인천·경기 — 차례 번호로 찾지 않는다) */
const RG = (key: string) => geo.units.regions.find((r) => r.key === key)!;
const at = (key: string) => geo.units.regions.findIndex((r) => r.key === key);

/* ---------- 과 없는 지역을 흉내 낸 판: 서울을 layer 'emd'·과 없음, 동 단원 종로·노원(제주처럼 둘) ---------- */
const JONGNO = unitFile('11110'), NOWON = unitFile('11350');
const seoulMain: Region = { ...geo.units.regions[0], layer: 'emd', items: [{ id: 'kr:sgg:11110', ko: '종로구', slug: 'jongno-gu', line: '' }, { id: 'kr:sgg:11350', ko: '노원구', slug: 'nowon-gu', line: '' }], lessons: [], screens: [] };
const geoMain = (units: EmdUnitFile[] = [JONGNO, NOWON]): GeoData => ({ ...geo, units: { ...geo.units, regions: [RG('incheon'), RG('gyeonggi'), seoulMain], emdUnits: { seoul: units.map(indexOf) } } });
const mainReg = (units?: EmdUnitFile[], opt = {}) => {
  const r = createRegistry(geoMain(units), opt);
  for (const f of units ?? [JONGNO, NOWON]) if (r.unit(f.key)) r.addUnit(f);
  return r;
};

/* ---------- 시·도 단원(korea)을 흉내 낸 판: 전국 시·도 지도의 이름표 점, 권역으로 묶은 과 ---------- */
const sidoTopo = JSON.parse(fs.readFileSync(path.join(root, 'public/data/geo', DATA_VER, 'sido.topo.json'), 'utf8'));
const sidoLabels = Object.fromEntries(sidoTopo.objects.sido.geometries.map((g: { properties: { id: string; l: [number, number, number] } }) => [g.properties.id, g.properties.l]));
const KOREA: KoreaFile = {
  key: 'korea', sido: '00', ko: '전국', full: '대한민국', en: 'Korea', layer: 'sido', fit: KOREA_FIT,
  items: SIDOS.map((s) => ({ id: `kr:sido:${s.code}`, ko: s.ko, slug: s.key })),
  lessons: GROUPS.map((g, i) => ({ no: i + 1, title: g, items: SIDOS.filter((s) => s.group === g).map((s) => `kr:sido:${s.code}`), fit: KOREA_FIT, minTapPx: 20, ambiguous: [] })),
  screens: [{ key: 'all', ko: '전국', en: 'Korea', items: SIDOS.map((s) => `kr:sido:${s.code}`), fit: KOREA_FIT, minTapPx: 16, ambiguous: [] }],
  labels: sidoLabels, neighbors: { 'kr:sido:11': ['kr:sido:28', 'kr:sido:41'], 'kr:sido:41': ['kr:sido:11', 'kr:sido:28'], 'kr:sido:28': ['kr:sido:11', 'kr:sido:41'] },
};
// 세 지역(부산을 뺀 E10 판) + 흉내 korea — 탭이 될 곳이 넷(세 지역 + 전국)인 판
const geoKorea: GeoData = { ...geoNoBusan, units: { ...geoNoBusan.units, korea: KOREA } };

test('지역 표(E8): 앱이 지역 표를 읽는다 — 16 시·도, 시·도 짧은 이름·허브·한 줄·한강 칸이 전과 같은 값', () => {
  assert.equal(SIDOS.length, 16);
  assert.deepEqual(Object.keys(SIDO_KO).sort(), SIDOS.map((s) => s.code).sort());
  assert.equal(SIDO_KO['41'], '경기');
  assert.deepEqual(SIDOS.filter((s) => s.river).map((s) => s.key), ['seoul', 'gyeonggi']);
  // 전에 코드에 박혀 있던 글(ui.ts regionDesc·hubs·seoulHub)과 같은 값
  { const { seoul, incheon, gyeonggi } = UI_KO.hubs; assert.deepEqual({ seoul, incheon, gyeonggi }, { seoul: ['서울 25개 구', '구마다 위치와 행정동 →'], incheon: ['인천 2군 9구', '2026년 7월 개편과 군·구마다 위치 →'], gyeonggi: ['경기 31개 시·군', '시·군마다 위치와 읍·면·동 수 →'] }); assert.equal(Object.keys(UI_KO.hubs).length, 16); }
  { const { seoul, incheon, gyeonggi } = UI_EN.hubs; assert.deepEqual({ seoul, incheon, gyeonggi }, { seoul: ["Seoul's 25 districts", 'Where each one is →'], incheon: ['Incheon: 2 counties and 9 districts', 'The July 2026 reform and where each one is →'], gyeonggi: ['Gyeonggi: 31 cities and counties', 'Where each one is and how many neighborhoods →'] }); assert.equal(Object.keys(UI_EN.hubs).length, 16); }
  // E11: 부산 한 줄(바닷가 근거 — 파이프라인 바닷가 길이로 10곳이 1km 이상, 6곳이 0)
  // E12: 대구(중구의 이웃은 여섯 구뿐이고 바닷가 0)·대전(맞닿은 시·도 셋)·울산(바닷가 근거)·세종(읍·면·동 수) 한 줄
  // E13: 충북(시·도 단원 onlyDo 검사)·제주(읍·면·동 수)·강원·전북(바닷가 근거 — 파이프라인 바닷가 길이로 6곳·4곳이 2km 이상, 나머지 0) 한 줄
  // E14 부터: 앞 단계 지역의 한 줄은 그대로인지 키로 고르고, 목록 전체는 지역 표에서(새 지역 한 줄은 그 단계 지역 시험)
  assert.deepEqual(Object.keys(UI_KO.regionDesc), SIDOS.filter((s) => s.desc).map((s) => s.key));
  for (const s of SIDOS.filter((x) => x.desc)) assert.deepEqual(UI_KO.regionDesc[s.key], s.desc!.ko, s.key);
  assert.deepEqual(Object.fromEntries(['seoul', 'busan', 'daegu', 'incheon', 'daejeon', 'ulsan', 'sejong', 'gyeonggi', 'chungbuk', 'jeju', 'gangwon', 'jeonbuk'].map((k) => [k, UI_KO.regionDesc[k]])), { seoul: ['한강을 사이에 두고 북쪽 14, 남쪽 11', ''], busan: ['바다에 닿은 곳 10, 닿지 않은 곳 6', ''], daegu: ['중구를 북구·서구·남구·수성구가 둘러쌈', ''], incheon: ['2026년 7월 새 구 이름(제물포·영종·서해·검단)', '새 이름'], daejeon: ['세종·충북·충남에 둘러싸인 곳', ''], ulsan: ['바다에 닿은 곳 4, 닿지 않은 곳 1', ''], sejong: ['구·군 없이 1읍 9면 15동', ''], gyeonggi: ['서울을 둘러싼 고리', ''],
    chungbuk: ['바다에 닿지 않은 하나뿐인 도', ''], jeju: ['제주시·서귀포시 두 시, 7읍 5면 31동', ''], gangwon: ['바다에 닿은 곳 6, 닿지 않은 곳 12', ''], jeonbuk: ['바다에 닿은 곳 4, 닿지 않은 곳 10', ''] });
  assert.equal(UI_EN.regionDesc.busan[0], '10 on the sea, 6 inland');
  assert.equal(UI_EN.regionDesc.gyeonggi[0], 'The ring around Seoul');
  for (const s of SIDOS) assert.ok((GROUPS as readonly string[]).includes(s.group), s.key);
});

test('영문 표기(SIDO_EN 16, Q5): 확인한 시·도만 영어 지도 맥락 이름 — 16곳 모두 확인(전남광주 2026-11-15), 확인하지 않은 지역은 숨김(가짜 지역 표)', () => {
  assert.equal(UI_EN.ctxName({ sido: '41', text: '경기도' }), 'Gyeonggi');
  assert.equal(UI_EN.ctxName({ sido: '51', text: '강원특별자치도' }), 'Gangwon');
  assert.equal(UI_EN.ctxName({ sido: '26', text: '부산광역시' }), 'Busan');
  assert.equal(UI_EN.ctxName({ sido: 'kp', text: '북한' }), 'North Korea');
  assert.equal(UI_EN.ctxName({ sido: 'water', text: '한강' }), 'Hangang River');
  // 전남광주: 사용자 지시(11-15)로 짧은 이름 'Jeonnam-Gwangju' 를 켬(정식 영문은 docs/review/sido-en.md — 화면에는 다른 시·도처럼 짧은 이름)
  assert.equal(sidoByCode('12')?.enChecked, true);
  assert.equal(UI_EN.ctxName({ sido: '12', text: '전남광주통합특별시' }), 'Jeonnam-Gwangju');
  assert.equal(SIDOS.filter((s) => s.enChecked).length, 16);
  assert.equal(shownIn('en', 'jeonnam-gwangju'), true);
  assert.equal(shownIn('ko', 'jeonnam-gwangju'), true);
  assert.equal(shownIn('en', 'seoul'), true);
  assert.equal(shownIn('en', 'korea'), true);
  // 규칙: 영어 이름을 확인하지 않은 지역(enChecked false)은 영어 화면에 없고 지도 맥락 이름도 비운다 — 운영 지역 표에는 이제 그런 행이 없어 가짜 지역 표로 본다
  withEnHidden('jeonnam-gwangju', () => {
    assert.equal(UI_EN.ctxName({ sido: '12', text: '전남광주통합특별시' }), '');
    assert.equal(shownIn('en', 'jeonnam-gwangju'), false);
    assert.equal(shownIn('ko', 'jeonnam-gwangju'), true);
    assert.equal(createRegistry(geoEnNow(), EN_OFF).region('jeonnam-gwangju'), undefined);
  });
  assert.equal(shownIn('en', 'jeonnam-gwangju'), true, '가짜 지역 표를 되돌림');
});

test('count(): 구·시·군이 섞인 지역과 시·도 층 — 세 지역은 전과 같은 글', () => {
  const R = (names: string[], layer: Region['layer'] = 'sgg'): Region => ({ key: 'x', sido: '00', ko: 'x', full: 'x', en: 'x', layer, fit: [0, 0, 1, 1], items: names.map((ko, i) => ({ id: `kr:sgg:${i}`, ko, slug: `s${i}`, line: '' })), lessons: [], screens: [] });
  // 구와 군이 섞인 지역은 그 지역이 스스로 쓰는 차례: 부산(E11)·대구·울산(E12)은 구를 먼저('15구 1군'·'7구 2군'·'4구 1군'), 지역 표 gunFirst 인 인천만 '2군 9구'.
  // 세종(과 없는 지역)은 칸이 세종시 하나라 '1개 시' — 화면의 탭·지역 고르기는 주 단원 곳 수(25곳, pages areaCount)를 쓴다
  // E13: 충북 11·강원 18·전북 14 '개 시·군', 제주(과 없는 지역)는 칸 둘 '2개 시'(탭은 주 단원 곳 수 43곳)
  const cnt = (f: (r: Region) => string) => { const o = Object.fromEntries(reg.regions.map((r) => [r.key, f(r)])); return ['seoul', 'busan', 'daegu', 'incheon', 'daejeon', 'ulsan', 'sejong', 'gyeonggi', 'chungbuk', 'jeju', 'gangwon', 'jeonbuk'].map((k) => o[k]); };   // E14 충남·경북은 e14-region.test
  assert.deepEqual(cnt((r) => UI_KO.count(r)), ['25개 구', '15구 1군', '7구 2군', '2군 9구', '5개 구', '4구 1군', '1개 시', '31개 시·군', '11개 시·군', '2개 시', '18개 시·군', '14개 시·군']);
  assert.deepEqual(cnt((r) => UI_EN.count(r)), ['25 districts', '15 districts, 1 county', '7 districts, 2 counties', '2 counties, 9 districts', '5 districts', '4 districts, 1 county', '1 city', '31 cities and counties',
    '11 cities and counties', '2 cities', '18 cities and counties', '14 cities and counties']);
  const bs = reg.region('busan')!;
  assert.equal(UI_KO.lessonCount(bs, bs.lessons[2].items), '4개 구·군');
  assert.equal(UI_KO.lessonCount(reg.region('incheon')!, reg.region('incheon')!.lessons[2].items), '3개 군·구');
  // 전남광주(광주 5구 + 전남 5시 17군)
  const jg = R([...Array(5)].map((_, i) => `${i}구`).concat([...Array(5)].map((_, i) => `${i}시`), [...Array(17)].map((_, i) => `${i}군`)));
  assert.equal(UI_KO.count(jg), '27개 시·군·구');
  assert.equal(UI_EN.count(jg), '27 cities, counties and districts');
  assert.equal(UI_KO.count(R(['기장군', ...[...Array(15)].map((_, i) => `${i}구`)])), '15구 1군');
  assert.equal(UI_KO.count(R(['세종시'])), '1개 시');
  const ko = R(SIDOS.map((s) => s.ko), 'sido');
  assert.equal(UI_KO.count(ko), '16개 시·도');
  assert.equal(UI_KO.lessonCount(ko, ko.items.slice(0, 5).map((it) => it.id)), '5개 시·도');
  assert.equal(UI_EN.count(ko), '16 provinces and cities');
  assert.equal(UI_KO.short({ id: 'kr:sido:27', ko: '대구', slug: 'daegu', line: '' }), '대구');
  assert.equal(UI_KO.short({ id: 'kr:sgg:11110', ko: '종로구', slug: 'jongno-gu', line: '' }), '종로');
});

test('지역별 격리(E8): 한 지역 데이터를 깨뜨려도 다른 지역은 돈다 — 홈·지역 고르기·과 시작', () => {
  for (const breakIt of [
    (r: Region) => { r.lessons[0].items.push('kr:sgg:99999'); },                 // 과에 없는 곳
    (r: Region) => { r.lessons[0].items = r.lessons[0].items.slice(1); },        // 과에 들지 않은 곳
    (r: Region) => { (r as { layer: string }).layer = 'zzz'; },                  // 모르는 층
    (r: Region) => { (r as { items: unknown }).items = null; },                  // 모양이 틀림
  ]) {
    const bad: GeoData = structuredClone(geo);
    breakIt(bad.units.regions[at('incheon')]);   // 인천을 깨뜨림
    const r2 = createRegistry(bad);
    assert.deepEqual(r2.regions.map((r) => r.key), reg.regions.map((r) => r.key).filter((k) => k !== 'incheon'));
    assert.deepEqual(r2.failed.map((f) => f.key), ['incheon']);
    assert.equal(r2.emdUnits('incheon').length, 0);
    assert.equal(r2.emdUnits('seoul').length, 25);
    assert.ok(r2.region('gyeonggi/gu'));
    const ctx = ctxOf(r2);
    const h = homePage(ctx).html;
    assert.equal(pressed(h), 'seoul');
    assert.doesNotMatch(h, /data-arg="incheon"/);
    assert.doesNotMatch(regionsPage(ctx).html, /href="#\/kr\/incheon"/);
    assert.equal(homeCard(base(r2)).type, 'new');
  }
  // 서울을 깨뜨리면 처음 온 사람의 첫 과·첫 탭은 공개 차례(지역 표 openOrder) 다음 지역 — 인천 1과(E16 검수: 지역 표 코드 차례로 고르면
  // E11~E15 는 부산, E16 부터는 가장 늦게 연 전남광주가 첫 과가 되고 탭과도 어긋났다)
  const bad: GeoData = structuredClone(geo);
  bad.units.regions[at('seoul')].lessons[0].items.push('kr:sgg:99999');
  const r3 = createRegistry(bad);
  assert.deepEqual(homeCard(base(r3)), { type: 'new', region: 'incheon', lesson: 1 });
  const h3 = homePage(ctxOf(r3)).html;
  assert.equal(label(h3), '첫 과 · 인천 1과');
  assert.equal(pressed(h3), 'incheon');
  // 같은 이름 곳(sameNames — 섞인 화면에 지역·묶음 이름을 붙임)의 id·지역 키 모양이 틀려도 그 지역만 빠진다(E16 검수: 이름 붙이기가 격리 밖에서 예외를 내
  // 레지스트리 전체가 멈췄다 — 부산 중구 id 를 숫자로 · 지역 키 없음 · 키 숫자 · 광주 동구 id 를 숫자로)
  for (const [k, breakIt] of [
    ['busan', (r: Region) => { (r.items.find((it) => it.ko === '중구') as { id: unknown }).id = 26110; }],
    ['busan', (r: Region) => { delete (r.items.find((it) => it.ko === '중구') as { id?: unknown }).id; }],
    ['busan', (r: Region) => { delete (r as { key?: unknown }).key; }],
    ['busan', (r: Region) => { (r as { key: unknown }).key = 26; }],
    ['jeonnam-gwangju', (r: Region) => { (r.items.find((it) => it.ko === '동구') as { id: unknown }).id = 12210; }],
  ] as const) {
    const g: GeoData = structuredClone(geo);
    breakIt(g.units.regions[at(k)]);
    const rb = createRegistry(g);
    assert.deepEqual(rb.regions.map((r) => r.key), reg.regions.map((r) => r.key).filter((x) => x !== k), k);
    assert.equal(rb.failed.length, 1, k);
    assert.ok(rb.region('seoul') && rb.place('kr:sgg:27140')?.item.full, '다른 지역의 같은 이름(대구 동구)은 그대로 붙음');
  }
  // 같은 키가 둘이면 뒤엣것만 빠진다
  const dup: GeoData = structuredClone(geo);
  dup.units.regions.push(structuredClone(dup.units.regions[0]));
  const r4 = createRegistry(dup);
  assert.deepEqual([r4.regions.length, r4.failed.map((f) => f.why)], [reg.regions.length, ['지역 키가 겹침']]);
  // 이름표 점(labels.json)이 빠진 지역도 그것만 뺀다 — 싣고 나서 과 문제를 만들 때 깨지지 않게(E8 검수)
  const noPt: GeoData = structuredClone(geo);
  delete noPt.labels[RG('incheon').items[0].id];
  const r5 = createRegistry(noPt);
  assert.deepEqual([r5.regions.map((r) => r.key), r5.failed.map((f) => f.key)], [reg.regions.map((r) => r.key).filter((k) => k !== 'incheon'), ['incheon']]);
  assert.match(r5.failed[0].why, /이름표 점 없음/);
});

test('지역별 격리·영어 숨김(E8 검수): 이 창에 실리지 않은 지역의 저장된 판은 지우지 않는다(N26·N30 기록은 남음)', () => {
  const q = (id: string) => ({ mode: 'find' as const, id });
  const inc = RG('incheon'), seo = RG('seoul');
  // 인천이 격리로 빠진 날: 인천 과 판, 인천 곳이 섞인 오늘 복습 판은 이어 할 수 없을 뿐 — 지키고(true), 서울 판은 지금처럼 쓴다
  const bad: GeoData = structuredClone(geo);
  bad.units.regions[at('incheon')].lessons[0].items.push('kr:sgg:99999');
  const r = createRegistry(bad);
  assert.equal(onMissingUnit(r, createDeck('lesson', inc.lessons[0].items.map(q), { region: 'incheon', lesson: 1, seed: 1 })), true);
  assert.equal(onMissingUnit(r, createDeck('review', [q(seo.items[0].id), q(inc.items[0].id)], { seed: 1 })), true);
  // 실린 지역의 판은 그대로(쓸 수 있으면 false, 데이터 판에서 사라진 곳이면 전처럼 지운다)
  assert.equal(onMissingUnit(r, createDeck('lesson', seo.lessons[0].items.map(q), { region: 'seoul', lesson: 1, seed: 1 })), false);
  assert.equal(onMissingUnit(r, createDeck('review', [q('kr:sgg:11999')], { seed: 1 })), false);
  // 영어 화면이 숨기는 지역(enChecked false — main.ts 가 싣지 않음): 그 지역 판·그 지역 곳(시·도 코드)이 든 복습 판을 지킨다.
  // E16 의 전남광주가 그랬고 2026-11-15 영문을 켠 뒤로 운영 지역 표에는 그런 지역이 없어, 가짜 지역 표(전남광주 enChecked false)로 본다
  withEnHidden('jeonnam-gwangju', () => {
    const hid = createRegistry(geoEnNow(), EN_OFF);   // 영어 앱이 받는 판(main.ts — 숨긴 지역을 뺌)
    assert.equal(hid.region('jeonnam-gwangju'), undefined);
    assert.equal(onMissingUnit(hid, createDeck('lesson', [q('kr:sgg:12110')], { region: 'jeonnam-gwangju', lesson: 1, seed: 1 })), true);
    assert.equal(onMissingUnit(hid, createDeck('review', [q(seo.items[0].id), q('kr:sgg:12110'), q('kr:emd:1211051000')], { seed: 1 })), true);
    // 지역 표에 없는 키는 지키지 않는다(옛 값)
    assert.equal(onMissingUnit(hid, createDeck('lesson', [q('kr:sgg:99110')], { region: 'atlantis', lesson: 1, seed: 1 })), false);
  });
  // 관문이 닫힌 영어 앱(전남광주를 실음 — 동·일반구·시·도 단원을 끈 창, EN_EMD 5.1): 전남광주 과 판은 실린 지역의 판이라 쓸 수 있다(지키는 판이 아님 — false),
  // 동 곳은 끈 창이 동을 싣지 않아 지킨다(N26)
  const en = createRegistry(geoEn, EN_OFF);
  assert.ok(en.region('jeonnam-gwangju'));
  assert.equal(onMissingUnit(en, createDeck('lesson', en.region('jeonnam-gwangju')!.lessons[0].items.map(q), { region: 'jeonnam-gwangju', lesson: 1, seed: 1 })), false);
  assert.equal(onMissingUnit(en, createDeck('review', [q(seo.items[0].id), q('kr:sgg:12110'), q('kr:emd:1211051000')], { seed: 1 })), true);
});

test('과 없는 지역(N4): 동 색인이 있으면 싣고(곳 없음), 없거나 동을 끈 창(관문이 닫힌 영어 앱)이면 싣지 않는다 — 관문이 열린 영어 앱은 싣는다(EN_EMD 1.2)', () => {
  const r = createRegistry(geoMain());
  assert.deepEqual(r.regions.map((x) => x.key), ['incheon', 'gyeonggi', 'seoul']);
  assert.equal(unitMain(r, 'seoul'), true);
  assert.equal(unitMain(r, 'incheon'), false);
  assert.equal(r.place('kr:sgg:11110'), undefined);
  assert.deepEqual(r.failed, []);
  // 동 색인이 없으면 결함으로 빼고 알린다
  const noIdx = createRegistry({ ...geoMain(), units: { ...geoMain().units, emdUnits: {} } });
  assert.deepEqual([noIdx.regions.map((x) => x.key), noIdx.failed.map((f) => f.key)], [['incheon', 'gyeonggi'], ['seoul']]);
  // 동을 끈 창은 동을 읽지 않으므로 과 없는 지역을 싣지 않는다(결함 아님)
  const en = createRegistry(geoMain(), EN_OFF);
  assert.deepEqual([en.regions.map((x) => x.key), en.failed], [['incheon', 'gyeonggi'], []]);
  // 관문이 열린 영어 앱(판 enNames)은 한국어처럼 싣는다
  const enOn = createRegistry(geoMain(), unitOptions('en', { enNames: true }));
  assert.deepEqual([enOn.regions.map((x) => x.key), enOn.failed], [['incheon', 'gyeonggi', 'seoul'], []]);
  // 과가 있는 과 없는 지역은 결함
  const withL: GeoData = { ...geoMain(), units: { ...geoMain().units, regions: [RG('incheon'), { ...seoulMain, lessons: [RG('seoul').lessons[0]] }] } };
  assert.deepEqual(createRegistry(withL).failed.map((f) => f.why), ['과 없는 지역에 과가 있음']);
});

test('과 없는 지역(N4): 다음 과·진도·다 채움은 동 단원 과로 — 홈 카드', () => {
  const ids = [...JONGNO.items, ...NOWON.items].map((it) => it.id);
  const r = mainReg();
  assert.deepEqual(mainIds(r, 'seoul').sort(), [...ids].sort());
  // 아무것도 안 했으면 첫 단원(동 색인 차례 — 종로구)
  assert.equal(mainUnitOf(r, {}, 'seoul'), 'seoul/jongno-gu');
  // 종로구 1과를 칠함 → 그 단원 2과
  const m1 = fill(JONGNO.lessons[0].items);
  const c1 = homeCard(base(r, { mastery: m1, last: 'seoul', lastUnit: 'seoul/jongno-gu' }));
  assert.deepEqual([c1.type, c1.type === 'next' && c1.unit, c1.type === 'next' && c1.lesson], ['next', 'seoul/jongno-gu', 2]);
  // 마지막 단원이 없어도(다른 지역에서 공부) 지역이 과 없는 지역이면 주 단원의 다음 과
  const c1b = homeCard(base(r, { mastery: m1, last: 'seoul', lastUnit: null }));
  assert.deepEqual([c1b.type, c1b.type === 'next' && c1b.unit], ['next', 'seoul/jongno-gu']);
  // 종로구를 다 칠함 → 노원구 1과(마지막 단원이 종로구여도)
  const m2 = fill(JONGNO.items.map((it) => it.id));
  assert.equal(mainUnitOf(r, m2, 'seoul', 'seoul/jongno-gu'), 'seoul/nowon-gu');
  const c2 = homeCard(base(r, { mastery: m2, last: 'seoul', lastUnit: 'seoul/jongno-gu' }));
  assert.deepEqual([c2.type, c2.type === 'next' && c2.unit, c2.type === 'next' && c2.lesson], ['next', 'seoul/nowon-gu', 1]);
  assert.equal(regionDone(r, m2, 'seoul'), false);
  // 모두 칠함 → 다 채움, 다음 지역 목록에는 빠짐
  const m3 = fill(ids);
  assert.equal(regionDone(r, m3, 'seoul'), true);
  const c3 = homeCard(base(r, { mastery: m3, last: 'seoul', lastUnit: 'seoul/nowon-gu' }));
  assert.deepEqual([c3.type, c3.type === 'done' && c3.more], ['done', ['incheon', 'gyeonggi']]);
  // 빈 지역에 every 를 써 '다 채움'이 되는 일이 없다(계획서 N4)
  assert.equal(regionDone(r, {}, 'seoul'), false);
  // 홈이 그리는 단원: 다 칠했으면 마지막 단원
  assert.equal(homeUnitOf(r, m3, 'seoul', 'seoul/jongno-gu'), 'seoul/jongno-gu');
  assert.equal(homeUnitOf(r, m3, 'seoul', null), 'seoul/nowon-gu');
});

test('과 없는 지역(N4): 홈 화면(처음·공부 중·다 채움) — 탭은 지역, 주 구역·지도는 주 단원', () => {
  const r = mainReg();
  // 처음(탭을 고름)
  const h0 = homePage(ctxOf(r, { homeRegion: 'seoul' })).html;
  assert.equal(pressed(h0), 'seoul');
  assert.equal(label(h0), '첫 과 · 종로구 1과');
  assert.match(h0, /data-act="learn" data-arg="seoul\/jongno-gu:1"/);
  assert.match(h0, /서울 <span class="u">\d+곳<\/span>/);
  assert.match(h0, /다른 구 고르기/);
  // 공부 중
  const m1 = fill(JONGNO.lessons[0].items);
  const h1 = homePage(ctxOf(r, { mastery: m1, last: 'seoul', lastUnit: 'seoul/jongno-gu' })).html;
  assert.equal(pressed(h1), 'seoul');
  assert.equal(label(h1), '다음 과 · 종로구 2과');
  // 다 채움: 지역 이름과 그 지역 동 전체 수
  const all = fill([...JONGNO.items, ...NOWON.items].map((it) => it.id), 5, null);
  const h2 = homePage(ctxOf(r, { mastery: all, last: 'seoul', lastUnit: 'seoul/nowon-gu' })).html;
  assert.equal(label(h2), '서울 · 다 채움');
  assert.match(h2, new RegExp(`${JONGNO.items.length + NOWON.items.length}곳`));
  for (const h of [h0, h1, h2]) assert.doesNotMatch(h, BAD);
  // 주 단원을 아직 받지 못했으면(받기 실패 등) 그 탭은 열지 않고 다른 지역으로
  const r0 = createRegistry(geoMain());
  assert.equal(pressed(homePage(ctxOf(r0, { homeRegion: 'seoul' })).html), 'incheon');
});

test('과 없는 지역(N4): 받을 단원 · 지역 주소 · 구 고르기 · 단원 쪽', async () => {
  const r = createRegistry(geoMain());
  assert.deepEqual(unitsToLoad(r, { mastery: {}, deck: null, deck2: null, lastUnit: null, daily: null, dailyEmd: null, today: T }, { areas: ['seoul', 'incheon', null] }), ['seoul/jongno-gu']);
  await registerUnits(r, ['seoul/jongno-gu'], async () => JONGNO, () => {});
  assert.ok(r.region('seoul/jongno-gu'));
  assert.deepEqual(unitsToLoad(r, { mastery: {}, deck: null, deck2: null, lastUnit: null, daily: null, dailyEmd: null, today: T }, { areas: ['seoul'] }), []);
  // 주소: 지역 주소와 /emd 는 열고, 지역 과·전체 연습·시험·둘러보기는 홈으로
  const known: Known = { region: (k) => !!r.region(k), lesson: (rg, n) => !!r.lesson(rg, n), slug: (rg, s) => !!r.bySlug(rg, s), emd: (k) => r.emdUnits(k).length > 0, unit: (k) => !!r.unit(k), main: (k) => unitMain(r, k) };
  assert.deepEqual(parseRoute('#/kr/seoul', '', known).route, { name: 'unit', region: 'seoul' });
  assert.deepEqual(parseRoute('#/kr/seoul/emd', '', known).route, { name: 'emd', region: 'seoul' });
  assert.deepEqual(parseRoute('#/kr/seoul/emd/jongno-gu/p1', '', known).route, { name: 'lesson', region: 'seoul/jongno-gu', no: 1 });
  for (const h of ['#/kr/seoul/mix', '#/kr/seoul/check', '#/kr/seoul/explore', '#/kr/seoul/sgg/p1']) assert.equal(parseRoute(h, '', known).route.name, 'home', h);
  // 구 고르기: 라벨은 공부 순서, 지역 과로 돌아가기·지역 이름 지도 링크 없음, 지도 이름표에 코드가 없음
  const p = pickPage(ctxOf(r), 'seoul');
  assert.equal(label(p.html), '서울 · 공부 순서');
  assert.doesNotMatch(p.html, /서울 과로 돌아가기|이름이 붙은 서울 지도/);
  assert.deepEqual(p.maps!.pick.labels!.map((l) => l.text), ['종로구', '노원구']);
  // 단원 쪽: 라벨은 공부 순서, 다른 단원 고르기(지역 주소), 지역 과로 돌아가기 없음
  const u = unitPage(ctxOf(r), 'seoul/jongno-gu').html;
  assert.match(u, /서울 · 공부 순서/);
  assert.match(u, /href="#\/kr\/seoul"><span>다른 구 고르기/);
  assert.doesNotMatch(u, /서울 과로 돌아가기/);
  // 단원이 하나뿐(세종처럼)이면 다른 단원 고르기도 없다
  const one = mainReg([JONGNO]);
  assert.doesNotMatch(unitPage(ctxOf(one), 'seoul/jongno-gu').html, /다른 구 고르기|서울 과로 돌아가기/);
});

test('시·도 단원(N30 · E8 모델): korea 는 지역처럼 — 등록·찾기·이웃·방위·GA·주소·홈·쪽, 시·도 단원을 끈 창(관문이 닫힌 영어 앱)은 등록하지 않음', () => {
  const r = createRegistry(geoKorea);
  const k = r.region('korea')!;
  assert.deepEqual([k.layer, k.items.length, k.unit], ['sido', 16, undefined]);
  assert.equal(r.regions.some((x) => x.key === 'korea'), false);   // 지역 목록에는 들지 않는다(N30)
  assert.ok(r.units.includes(k));
  assert.equal(r.areaOf('korea'), 'korea');
  assert.equal(r.place('kr:sido:11')?.region.key, 'korea');
  assert.equal(r.adjacent('kr:sido:11', 'kr:sido:41'), true);
  assert.equal(r.dir8('kr:sido:11', 'kr:sido:26'), 'SE');
  assert.equal(r.dir8('kr:sido:26', 'kr:sido:50'), 'SW');
  assert.deepEqual(studyKeys(r, 'korea'), { last: 'korea', lastUnit: null });
  assert.deepEqual(gaUnit(r, 'korea'), { unit: 'sido', region: 'korea' });
  // 주소 #/kr/korea · 과 #/kr/korea/sido/p1
  const known: Known = { region: (x) => !!r.region(x), lesson: (rg, n) => !!r.lesson(rg, n), slug: (rg, s) => !!r.bySlug(rg, s) };
  assert.equal(toHash({ name: 'lesson', region: 'korea', no: 2 }), '#/kr/korea/sido/p2');
  assert.deepEqual(parseRoute('#/kr/korea/sido/p2', '', known).route, { name: 'lesson', region: 'korea', no: 2 });
  assert.deepEqual(parseRoute('#/kr/korea/sido/@busan', '', known).route, { name: 'place', region: 'korea', slug: 'busan' });
  assert.equal(parseRoute('#/kr/korea/sgg/p2', '', known).route.name, 'home');
  assert.deepEqual(parseRoute('#/kr/korea', '', known).route, { name: 'unit', region: 'korea' });
  // 마지막 공부가 korea → 홈 탭 korea('전국'), 다음 과는 korea 의 과
  const m = fill(KOREA.lessons[0].items);
  const c = homeCard(base(r, { mastery: m, last: 'korea' }));
  assert.deepEqual([c.type, c.type === 'next' && c.region, c.type === 'next' && c.lesson], ['next', 'korea', 2]);
  const h = homePage(ctxOf(r, { mastery: m, last: 'korea' })).html;
  assert.equal(pressed(h), 'korea');
  assert.match(h, /전국 <span class="u">16개 시·도<\/span>/);
  assert.equal(label(h), '다음 과 · 전국 2과');
  assert.doesNotMatch(h, BAD);
  const u = unitPage(ctxOf(r), 'korea').html;
  assert.match(u, /전국 16개 시·도/);
  assert.doesNotMatch(u, BAD);
  // 탭이 될 곳이 4곳(세 지역 + korea)이라 모두 보인다(N22)
  assert.equal((h.match(/class="h-tab"/g) ?? []).length, 4);
  // 지역 고르기에 시·도 단원 칸
  assert.match(regionsPage(ctxOf(r)).html, /href="#\/kr\/korea"/);
  // 시·도 단원을 끈 창(관문이 닫힌 영어 앱)은 등록하지 않고, korea 판은 지킨다(이 창에서 이어 할 수 없을 뿐). 관문이 열린 영어 앱은 등록한다
  assert.ok(createRegistry(geoKorea, unitOptions('en', { enNames: true })).region('korea'));
  const en = createRegistry(geoKorea, EN_OFF);
  assert.equal(en.region('korea'), undefined);
  const d = createDeck('lesson', [{ mode: 'meet', id: 'kr:sido:11' }], { region: 'korea', lesson: 1, seed: 1 });
  assert.equal(onMissingUnit(en, d), true);
  // 모양이 틀린 korea 는 그것만 빠진다
  const broken = createRegistry({ ...geoKorea, units: { ...geoKorea.units, korea: { ...KOREA, lessons: [{ ...KOREA.lessons[0], items: ['kr:sido:99'] }] } } });
  assert.deepEqual([broken.region('korea'), broken.failed.map((f) => f.key), broken.regions.length], [undefined, ['korea'], 3]);
});

test('홈 지역 탭(N22): 지역 4곳 이하는 지역 모두(운영 네 지역), 넘으면 공부한 지역 최근 순 3 + 다른 지역', () => {
  const tabKeys = (h: string) => [...h.matchAll(/data-act="homeRegion" data-arg="([a-z-]+)"/g)].map((x) => x[1]);
  // 운영 판(E12 부터 여덟 지역 + 시·도 단원 korea = 아홉 곳): 넷을 넘어 접는다 — 처음 온 사람은 공개 차례(지역 표 openOrder) 셋 서울·인천·경기 + '다른 지역 +6'
  // (E11 검수 남은 일: 지역 표 차례로 채우면 '서울·부산·대구'가 되어 개설 때부터 있던 인천·경기가 빠졌다 — E12 에서 공개 차례로 채운다)
  const h = homePage(ctxOf(reg)).html;
  assert.deepEqual(tabKeys(h), ['seoul', 'incheon', 'gyeonggi']);
  assert.match(h, new RegExp(`<a class="h-tab go" href="#/kr">다른 지역 <span class="u" aria-hidden="true">\\+${(reg.regions.length + (geo.units.korea ? 1 : 0) - 3)}</span>`));   // E13 열두 지역 + korea = +10 · E14 +12
  assert.match(h, /<div class="h-tabs n4"/);
  // 서울만 공부한 사람도 서울·인천·경기(빈자리는 공개 차례)
  assert.deepEqual(tabKeys(homePage(ctxOf(reg, { mastery: fill(RG('seoul').lessons[0].items), last: 'seoul' })).html), ['seoul', 'incheon', 'gyeonggi']);
  // 경기를 공부한 사람(마지막 지역 경기)은 경기가 앞(N22 공부한 지역 최근 순), 빈자리는 공개 차례 — 경기 탭이 눌림
  const hg = homePage(ctxOf(reg, { mastery: fill(RG('gyeonggi').lessons[0].items), last: 'gyeonggi' })).html;
  assert.deepEqual(tabKeys(hg), ['gyeonggi', 'seoul', 'incheon']);
  assert.equal(pressed(hg), 'gyeonggi');
  // 처음 온 사람이 보이는 '경기' 탭을 눌러도 탭 줄은 그대로(누른 자리 밑에서 탭이 바뀌지 않게, E11)
  const hgt = homePage(ctxOf(reg, { homeRegion: 'gyeonggi' })).html;
  assert.deepEqual([tabKeys(hgt), pressed(hgt)], [['seoul', 'incheon', 'gyeonggi'], 'gyeonggi']);
  // 대구를 공부한 사람: 대구가 앞, 빈자리는 서울·인천
  const hd = homePage(ctxOf(reg, { mastery: fill(RG('daegu').lessons[0].items), last: 'daegu' })).html;
  assert.deepEqual([tabKeys(hd), pressed(hd)], [['daegu', 'seoul', 'incheon'], 'daegu']);
  // 시·도 단원을 공부한 사람(마지막 지역 korea): 공부한 곳 korea 가 앞 + 공개 차례 둘 + 다른 지역 +6
  const km = fill(geo.units.korea!.lessons[0].items);
  const hk = homePage(ctxOf(reg, { mastery: km, last: 'korea' })).html;
  assert.deepEqual(tabKeys(hk), ['korea', 'seoul', 'incheon']);
  assert.equal(pressed(hk), 'korea');
  assert.match(hk, new RegExp(`<a class="h-tab go" href="#/kr">다른 지역 <span class="u" aria-hidden="true">\\+${(reg.regions.length + (geo.units.korea ? 1 : 0) - 3)}</span>`));
  // 거기서 보이는 '서울' 탭을 눌러도 탭 줄은 그대로(전국 탭이 사라지지 않는다)
  const hks = homePage(ctxOf(reg, { mastery: km, last: 'korea', homeRegion: 'seoul' })).html;
  assert.deepEqual([tabKeys(hks), pressed(hks)], [['korea', 'seoul', 'incheon'], 'seoul']);
  // 시·도를 칠한 기록이 있으면 마지막 지역이 서울이어도 korea 를 공부한 사람이다(칠한 곳이 있는 korea 가 앞, 서울 탭이 눌림)
  const hk2 = homePage(ctxOf(reg, { mastery: km, last: 'seoul' })).html;
  assert.deepEqual([tabKeys(hk2), pressed(hk2)], [['korea', 'seoul', 'incheon'], 'seoul']);
  // E11 판(네 지역 + korea — E12 의 네 지역을 뺀 판): 그때처럼 처음 온 사람은 네 지역 탭, '다른 지역' 칸 없음
  // (시·도 단원은 지역이 아니라 지역 고르기의 '시·도 한눈에'로 간다. E11 검수: korea 까지 세어 접으면 개설 때부터 있던 경기가 탭에서 빠졌다)
  const h11 = homePage(ctxOf(createRegistry(geoNoE12))).html;
  assert.deepEqual(tabKeys(h11), ['seoul', 'busan', 'incheon', 'gyeonggi']);
  assert.doesNotMatch(h11, /h-tab go/);
  assert.deepEqual(tabKeys(homePage(ctxOf(createRegistry(geoNoE12), { mastery: km, last: 'korea' })).html), ['korea', 'seoul', 'incheon']);
  // 부산을 뺀 판(E10 — 세 지역 + korea): 네 칸 모두, '다른 지역' 없음
  const h4 = homePage(ctxOf(createRegistry(geoNoBusan))).html;
  assert.equal((h4.match(/class="h-tab"/g) ?? []).length, 4);
  assert.match(h4, /data-arg="korea" aria-pressed="false">전국 <span class="u">16개 시·도<\/span>/);
  assert.doesNotMatch(h4, /h-tab go/);
  // korea 도 뺀 판(E9 까지): 세 지역 그대로
  const { korea: _k, ...u9 } = geoNoBusan.units;
  const h3 = homePage(ctxOf(createRegistry({ ...geoNoBusan, units: u9 }))).html;
  assert.equal((h3.match(/class="h-tab"/g) ?? []).length, 3);
  assert.doesNotMatch(h3, /h-tab go|n4/);
  // 지역 표 korea 만 끈 판: E11 의 네 지역이면 네 칸 모두, 운영 판(E12 여덟 지역 · E13 열두 지역 · E14·E15 열다섯)이면 접기(세 칸 + 다른 지역 +5 · E13 +9 · E14·E15 +12)
  const { korea: _k11, ...u11 } = geoNoE12.units;
  assert.equal((homePage(ctxOf(createRegistry({ ...geoNoE12, units: u11 }))).html.match(/class="h-tab"/g) ?? []).length, 4);
  assert.match(homePage(ctxOf(createRegistry(geoNoKorea))).html, new RegExp(`다른 지역 <span class="u" aria-hidden="true">\\+${reg.regions.length - 3}</span>`));   // E13 +9 · E14 +11
  // 지역 16곳 흉내(homeTabs 는 reg.regions·region·areaOf·mastery 만 본다)
  const keys = SIDOS.map((s) => s.key);
  const fake = { regions: keys.map((key) => ({ key })), region: (k: string) => (keys.includes(k) ? { key: k } : undefined), areaOf: (k: string) => k.split('/')[0] } as unknown as Registry;
  const areaOfId = (id: string) => id.split(':')[2];
  const tabs = (m: Mastery, current: string, last: string | null) => homeTabs(ctxOf(fake, { mastery: m, last }), current, areaOfId);
  // 처음 온 사람: 공개 차례 셋(지역 표 openOrder — 서울·인천·경기, E12) + 다른 지역 13
  const FIRST3 = ['seoul', 'incheon', 'gyeonggi'];
  assert.deepEqual(tabs({}, keys[0], null), { keys: FIRST3, more: 13 });
  const m: Mastery = { 'x:y:busan': rec(2, T + 4), 'x:y:jeju': rec(2, T + 5), 'x:y:daegu': rec(2, T + 3), 'x:y:gangwon': rec(2, T + 2), 'x:y:seoul': rec(2, T + 1) };
  // 마지막 지역이 맨 앞, 그다음 늦은 복습일 차례
  assert.deepEqual(tabs(m, 'busan', 'busan'), { keys: ['busan', 'jeju', 'daegu'], more: 13 });
  // 지금 탭이 셋 밖이면 셋째 자리에
  assert.deepEqual(tabs(m, 'ulsan', 'busan'), { keys: ['busan', 'jeju', 'ulsan'], more: 13 });
  // 칠하지 않은 기록은 공부한 지역으로 치지 않는다
  assert.deepEqual(tabs({ 'x:y:jeju': rec(0, null) }, keys[0], null).keys, FIRST3);
  // 최근 순은 '복습일 − 상자 간격'(마지막 공부 날)으로 — 복습일을 그대로 견주면 오래 익힌 지역(상자가 높아 복습일이 멀다)이 앞선다(E8 검수 반례).
  // 서울: 상자 5, 3일 전 복습(복습일 T+3) · 인천: 상자 4, 2일 전(T+4) · 부산: 오늘 1과를 마침(상자 1, T+1) · 대구: 마지막 지역
  const m2: Mastery = { 'x:y:seoul': rec(5, T + 3), 'x:y:incheon': rec(4, T + 4), 'x:y:busan': rec(1, T + 1), 'x:y:daegu': rec(1, T + 1) };
  assert.deepEqual(tabs(m2, 'daegu', 'daegu').keys, ['daegu', 'busan', 'incheon']);
  // 졸업한 곳(복습일 없음)만 남은 지역도 공부한 지역이다(맨 뒤)
  const g: Rec = { ...rec(5, null), grad: true };
  assert.deepEqual(tabs({ 'x:y:ulsan': g, 'x:y:busan': rec(1, T + 1) }, 'busan', 'busan').keys, ['busan', 'ulsan', 'seoul']);
});

test('홈 지역 탭(N22): 폰에서 칸이 넷이면(세 지역 + 전국) 단위 글을 감추는 n4, 다른 지역 수는 화면 읽기용 글', () => {
  const h = homePage(ctxOf(createRegistry(geoKorea))).html;
  assert.equal((h.match(/class="h-tab"/g) ?? []).length, 4);
  assert.match(h, /<div class="h-tabs n4"/);
  // 네 지역(E11 판) + 대구·울산(흉내) + 전국(korea) = 일곱 곳 → 탭 셋 + 다른 지역 4
  const many = homePage(ctxOf(createRegistry(geoWith(['daegu', 'ulsan'])))).html;
  assert.match(many, /<a class="h-tab go" href="#\/kr">다른 지역 <span class="u" aria-hidden="true">\+4<\/span><span class="visually-hidden">\(4곳 더\)<\/span><\/a>/);
});

test('지역 고르기(N23): 권역별 목록 + 전국 시·도 지도, 열지 않은 지역은 흐린 준비 중(E11 판 — 열린 지역 넷)', () => {
  // E12 부터 운영 판은 여덟 지역이라 '많음' 모양이다(e12-region.test). 여기서는 열린 지역이 넷 이하인 모양을 E11 판(E12 의 네 지역을 뺀 판)으로 본다
  const r11 = createRegistry(geoNoE12);
  const p0 = regionsPage(ctxOf(r11));
  const p = { ...p0, html: sp(p0.html) };
  // 열린 네 지역은 칸(E11 — 수도권 묶음과 영남 묶음의 부산). 열린 지역이 4곳 이하라 나머지 12곳은 접은 구역 하나에 권역마다 한 줄(E8 검수 — 폰에서 쪽이 두 배로 길어졌다).
  // E10 부터 운영 판에는 시·도 단원 칸(전국 16개 시·도)이 '시·도 한눈에' 묶음으로 하나 더 있다(korea 를 뺀 판은 네 칸)
  assert.equal((p.html.match(/<li class="h-lc">/g) ?? []).length, 5);
  assert.match(p.html, /<h2 id="rg-kr">시·도 한눈에<\/h2>/);
  assert.match(p.html, /href="#\/kr\/korea"/);
  assert.match(p.html, /href="#\/kr\/busan"/);
  const { korea: _k, ...u11 } = geoNoE12.units;
  assert.equal((regionsPage(ctxOf(createRegistry({ ...geoNoE12, units: u11 }))).html.match(/<li class="h-lc">/g) ?? []).length, 4);
  assert.match(p.html, /class="page rg-page few"/);
  assert.deepEqual([...p.html.matchAll(/<h2 id="rg-g\d">([^<]*)<\/h2>/g)].map((x) => x[1]), ['수도권', '영남']);
  assert.match(p.html, /<details class="rg-more"><summary>다른 지역 12곳 · 준비 중<\/summary>/);
  const later = [...p.html.matchAll(/<li><b>([^<]*)<\/b>(?:<span>([^<]*)<\/span>)?<\/li>/g)].map((x) => [x[1], x[2] ?? '']);
  // 강원·제주는 권역과 이름이 같아 이름을 되풀이하지 않는다
  assert.deepEqual(later, [['강원', ''], ['충청', '대전 · 세종 · 충북 · 충남'], ['호남', '광주특별시 · 전북'], ['영남', '대구 · 울산 · 경북 · 경남'], ['제주', '']]);
  // '준비 중'은 지도 범례와 접은 구역 머리에 한 번씩만(전에는 18번)
  assert.equal((p.html.match(/준비 중/g) ?? []).length, 2);
  assert.match(p.html, /시·도 16곳 중 4곳 열림/);
  const spec = p.maps!.kr;
  assert.equal(spec.region, KOREA_MAP);
  assert.deepEqual(spec.active, ['kr:sido:11', 'kr:sido:26', 'kr:sido:28', 'kr:sido:41']);
  assert.deepEqual(spec.labels!.map((l) => l.text), ['서울', '부산', '인천', '경기']);
  assert.doesNotMatch(p.html, BAD);
  // 영어: 영어 이름을 확인한 지역만 목록에 — 전남광주는 2026-11-15 영문을 켜 접은 구역 호남 줄에 있다(한국어와 같은 12곳).
  // 영어 이름을 확인하지 않은 지역은 목록에 없다(가짜 지역 표 — 전남광주 enChecked false, E16 까지의 모양 '11 other regions')
  setLang('en');
  try {
    const page = () => sp(regionsPage(ctxOf(createRegistry(geoNoE12, EN_OFF))).html);
    const e = page();
    assert.match(e, /<li><b>Honam<\/b><span>Jeonnam-Gwangju · Jeonbuk<\/span><\/li>/);
    assert.match(e, /Busan/);
    assert.match(e, /4 of 16 regions open/);
    assert.match(e, /<summary>12 other regions · coming soon<\/summary>/);
    assert.doesNotMatch(e, BAD);
    withEnHidden('jeonnam-gwangju', () => {
      const h = page();
      assert.doesNotMatch(h, /Jeonnam/);
      assert.match(h, /<li><b>Honam<\/b><span>Jeonbuk<\/span><\/li>/);
      assert.match(h, /4 of 16 regions open/);
      assert.match(h, /<summary>11 other regions · coming soon<\/summary>/);
    });
  } finally { setLang('ko'); }
});

/** 열린 지역을 늘린 판: E11 판(네 지역 + korea)에 인천 칸을 본떠 다른 시·도 코드로 옮긴 지역(곳 id·이름표 점을 함께 옮김). E12 부터 운영 판에 대구·울산이 있어 E11 판에서 시작한다 */
function geoWith(keys: string[]): GeoData {
  const g: GeoData = structuredClone(geoNoE12);
  const inc = RG('incheon');
  for (const key of keys) {
    const s = sidoOf(key)!;
    const mv = (id: string) => id.replace(/^kr:sgg:28/, `kr:sgg:${s.code}`);
    for (const it of inc.items) g.labels[mv(it.id)] = geo.labels[it.id];
    g.units.regions.push({ ...structuredClone(inc), key, sido: s.code, ko: s.ko, full: s.full, en: s.en,
      items: inc.items.map((it) => ({ ...it, id: mv(it.id) })), lessons: inc.lessons.map((l) => ({ ...l, items: l.items.map(mv) })), screens: [] });
  }
  return g;
}

test('지역 고르기(N23): 열린 지역이 많으면 권역마다 칸 + 흐린 이름 한 줄, 혼자인 권역은 머리만', () => {
  // E11 부터 부산은 운영 판에 열려 있다 — 흉내로 대구·강원을 더 연다
  const r = createRegistry(geoWith(['daegu', 'gangwon']));
  assert.equal(r.regions.length, 6);
  const h = sp(regionsPage(ctxOf(r)).html);
  assert.match(h, /class="page rg-page"/);
  assert.doesNotMatch(h, /rg-more/);
  // 영남: 열린 두 칸 + '울산 · 경북 · 경남 준비 중' 한 줄
  assert.match(h, /<ol class="h-lcs g2 rg">/);
  assert.match(h, /<p class="rg-soon"><span>울산 · 경북 · 경남<\/span><em>준비 중<\/em><\/p>/);
  // 충청(모두 준비 중): 이름 한 줄이 목록 자리, 꼬리표는 머리에
  assert.match(h, /<p class="rg-soon only"><span>대전 · 세종 · 충북 · 충남<\/span><\/p>/);
  // 제주(혼자·이름이 같음): 머리만, 이름 줄 없음
  assert.match(h, /<section class="rg-g solo" aria-labelledby="rg-g5">/);
  assert.doesNotMatch(h, /<span>제주<\/span>/);
  assert.doesNotMatch(h, BAD);
  // 허브가 없는 지역 탭(부산)의 '지역 알아보기'는 서울 허브가 아니라 지역 고르기(E8 검수)
  const hb = homePage(ctxOf(r, { homeRegion: 'busan' })).html;
  assert.equal(pressed(hb), 'busan');
  assert.match(hb, /<a class="h-xl" href="[^"]*busan\/"><span class="h-xt">부산 16개 구·군<\/span>/);
  assert.doesNotMatch(hb, /서울 25개 구/);
  // 허브가 있는 지역 탭은 전과 같다
  assert.match(homePage(ctxOf(r, { homeRegion: 'incheon' })).html, /<a class="h-xl" href="\/incheon\/"><span class="h-xt">인천 2군 9구<\/span>/);
});

test('전국 시·도 지도(sido.topo.json): 16칸·이름표 점, 범위 = KOREA_FIT, 독도·마라도 덩어리, gz 35KB 이하(7절)', () => {
  const file = path.join(root, 'public/data/geo', DATA_VER, 'sido.topo.json');
  const text = fs.readFileSync(file);
  assert.ok(zlib.gzipSync(text).length <= 35 * 1024);
  const gs = sidoTopo.objects.sido.geometries;
  assert.deepEqual(gs.map((g: { properties: { id: string } }) => g.properties.id).sort(), SIDOS.map((s) => `kr:sido:${s.code}`).sort());
  for (const g of gs) assert.equal(g.properties.l.length, 3);
  const fc = topo.feature(sidoTopo, sidoTopo.objects.sido) as unknown as { features: { properties: { sido: string }; geometry: { type: string; coordinates: number[][][][] } }[] };
  let bb = [Infinity, Infinity, -Infinity, -Infinity];
  const polys = (g: { type: string; coordinates: unknown }) => (g.type === 'Polygon' ? [g.coordinates as number[][][]] : g.coordinates as number[][][][]);
  for (const f of fc.features) for (const p of polys(f.geometry)) for (const [x, y] of p[0]) bb = [Math.min(bb[0], x), Math.min(bb[1], y), Math.max(bb[2], x), Math.max(bb[3], y)];
  bb.forEach((v, i) => assert.ok(Math.abs(v - KOREA_FIT[i]) < 1e-3, `범위 ${i}: ${v} / ${KOREA_FIT[i]}`));
  const mean = (p: number[][][], k: number) => p[0].reduce((s, c) => s + c[k], 0) / p[0].length;
  const gb = fc.features.find((f) => f.properties.sido === '47')!, jj = fc.features.find((f) => f.properties.sido === '50')!;
  assert.ok(polys(gb.geometry).filter((p) => mean(p, 0) > 131.8).length >= 2, '독도 두 덩어리');
  assert.ok(polys(jj.geometry).some((p) => mean(p, 1) < 33.13), '마라도');
  // 지역 표의 시·도 키와 전국 지도 칸이 1:1(지역 고르기 지도에서 칸 → 지역)
  for (const s of SIDOS) assert.ok(sidoOf(s.key) && gs.some((g: { properties: { sido: string } }) => g.properties.sido === s.code), s.key);
});
