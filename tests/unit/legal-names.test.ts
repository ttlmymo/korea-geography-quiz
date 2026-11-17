// 법정 명칭(2026-11-15 사용자 결정 '모든 명칭은 법이 정한 명칭으로'): 전남광주통합특별시의 한국어 짧은 이름은 법정 약칭 '광주특별시'
// (「전남광주통합특별시 설치를 위한 특별법」 법률 제21446호 — 현행 제21620호 — 제7조 제1항 '약칭은 광주특별시로 한다').
// 정식 이름(지역 표 full = 원자료 sidonm)·지역 키 jeonnam-gwangju(주소·저장값·GA)·영어 짧은 이름 Jeonnam-Gwangju(법정 영문 없음)는 그대로다.
// 같은 이름 구분(여러 시·도에 있는 동구·서구·남구·북구)도 법정 약칭으로 '광주특별시 동구', 영어는 지역 영어 이름과 맞춰 'Dong-gu, Jeonnam-Gwangju'.
// 과 이름 '광주'·'광주 둘레'·넓은 화면 '광주'는 지역 안 땅 이름(행정 이름이 아님)이라 11-15 에는 그대로 두었고(docs/review/jeonnam-gwangju.md 17번),
// 2026-11-16 사용자 결정(결정표 D42)으로 1과·넓은 화면 '광주' → '광주 시내'(영어 'Central Gwangju'·'central Gwangju'), 5과 '남쪽 바닷가' → '보성·고흥 바닷가'('Boseong–Goheung coast').
// 같은 날 결정: 섞인 화면의 경기 '광주시'는 '경기 광주시'(D97). 지도 이웃 시·도 이름표를 모두 법정 정식 이름으로 하는 결정(D96)은 폰 지도에서 이름이 겹쳐
// 멈췄다(결정표 D96 — 이웃 이름표 규칙은 11-15 그대로: 시 꼴 짧은 이름·도 꼴 정식 이름).
// 커밋되는 파일만 읽는다(지역 표·원고·판·src 코드·공유 그림 글) — dist·docs·.cache 는 읽지 않는다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_VER } from '../../src/consts.ts';
import type { Mastery, Rec } from '../../src/app/core/mastery.ts';
import { registerUnits } from '../../src/app/core/units.ts';
import { buildShapes, ctxSido, shortSido, specOf, type Topology } from '../../src/app/map/shapes.ts';
import { createRegistry, type Registry } from '../../src/app/registry.ts';
import type { EmdUnitFile } from '../../src/app/types.ts';
import { SIDOS, nearSidoName, partOf } from '../../src/app/sidos.ts';
import { mixPre } from '../../src/app/text/ui.ts';
import { UI_EN, UI_KO, setLang } from '../../src/app/text/ui.ts';
import type { Ctx } from '../../src/app/ui/ctx.ts';
import { homePage, pickPage, regionsPage, unitPage } from '../../src/app/ui/pages.ts';
import { EN_OFF, EN_ON, geo, geoEn, reg } from './fixtures.ts';

const KEY = 'jeonnam-gwangju';
const LEGAL_SHORT = '광주특별시';
const LEGAL_FULL = '전남광주통합특별시';
/** 바뀌기 전 짧은 이름 '전남광주'(정식 이름 '전남광주통합특별시' 속 글자는 빼고) */
const OLD_SHORT = /전남광주(?!통합특별시)/;
const root = path.join(import.meta.dirname, '../..');
const read = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const TABLE = read('src/data/sido.json');
const ROW = TABLE.sidos.find((s: { key: string }) => s.key === KEY);
const SRC = read('src/data/units.json');
const LINES = read('src/data/place-lines.json');
const BAN = read(`public/data/geo/${DATA_VER}/units.json`);
const KR = read('src/data/kr-summary.json');
const T = 20000;
const sgg = (c: string) => `kr:sgg:${c}`;
const sp = (h: string) => h.replace(/ /g, ' ');   // 이름 사이 ' · ' 의 붙임 빈칸(NBSP)을 보통 빈칸으로
const rec = (box: number, due: number | null): Rec => ({ box, due, hi: box >= 1 ? 1 : 0, streak: 0, grad: false, front: false });
const ctxOf = (r: Registry, o: Partial<Ctx> = {}): Ctx => ({
  reg: r, geo, base: '/', ver: DATA_VER, storageOk: true, inApp: false,
  mastery: {}, lessonDeck: null, otherDeck: null, checkDeck: null, checkStart: 0,
  daily: null, dailyEmd: null, last: null, lastUnit: null, settings: { autoNext: false }, homeRegion: null, bests: {}, bestUnits: {},
  today: () => T, save() {}, go() {}, back() {}, render() {}, toast() {},
  ...o,
}) as Ctx;

/** 글 모으기: 객체의 모든 문자열 값과 키(메모 칸 '_' 로 시작하는 키와 그 값은 뺌) */
function strings(x: unknown, out: string[] = []): string[] {
  if (typeof x === 'string') out.push(x);
  else if (Array.isArray(x)) for (const v of x) strings(v, out);
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { if (k.startsWith('_')) continue; out.push(k); strings(v, out); }
  return out;
}
// 코드에서 주석을 걷는다(여러 줄 주석·JSDoc·HTML 주석·줄 주석 — 'https:' 뒤의 두 빗금은 남김). 화면 글은 문자열·틀 속에만 남는다
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const filesUnder = (dir: string, re: RegExp): string[] => fs.readdirSync(path.join(root, dir), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? filesUnder(`${dir}/${e.name}`, re) : re.test(e.name) ? [`${dir}/${e.name}`] : []));

test('지역 표·원고·판: 전남광주 행 ko = 법정 약칭 광주특별시, full = 정식 이름 전남광주통합특별시(원자료·전국 요약과 같음) · 키·영어 짧은 이름은 그대로', () => {
  assert.deepEqual([ROW.code, ROW.key, ROW.ko, ROW.full, ROW.en], ['12', KEY, LEGAL_SHORT, LEGAL_FULL, 'Jeonnam-Gwangju']);
  // 앱 모듈이 읽는 지역 표 행도 같다
  const row = SIDOS.find((s) => s.key === KEY)!;
  assert.deepEqual([row.ko, row.full], [LEGAL_SHORT, LEGAL_FULL]);
  // 원고(units.json regions — 파이프라인이 지역 표와 같은지 검사)와 판
  const src = SRC.regions.find((r: { key: string }) => r.key === KEY);
  assert.deepEqual([src.ko, src.full], [LEGAL_SHORT, LEGAL_FULL]);
  const ban = BAN.regions.find((r: { key: string }) => r.key === KEY);
  assert.deepEqual([ban.ko, ban.full, ban.en], [LEGAL_SHORT, LEGAL_FULL, 'Jeonnam-Gwangju']);
  assert.equal(reg.region(KEY)!.ko, LEGAL_SHORT);
  // 정식 이름은 원자료 시·도 이름(전국 요약 — 파이프라인이 원자료에서 셈)과 같다
  assert.equal(KR.sidos.find((s: { code: string }) => s.code === '12').name, LEGAL_FULL);
  // 시·도 단원(전국 16 시·도)의 곳 이름도 법정 약칭(원고 과·화면 이름 → 판)
  const k = BAN.korea.items.find((it: { id: string }) => it.id === 'kr:sido:12');
  assert.deepEqual([k.ko, k.slug], [LEGAL_SHORT, KEY]);
  assert.ok(SRC.korea.lessons.some((l: { items: string[] }) => l.items.includes(LEGAL_SHORT)));
  assert.ok(LINES.korea[LEGAL_SHORT], '시·도 단원 위치 한 줄의 이름 칸');
});

test('같은 이름 구분: 묶음 이름(지역 표 parts)은 지역의 법정 약칭·영어 이름과 같다 — 섞인 화면 \'광주특별시 동구\' · \'Dong-gu, Jeonnam-Gwangju\'', () => {
  assert.ok(Array.isArray(ROW.parts) && ROW.parts.length > 0);
  for (const p of ROW.parts) assert.deepEqual([p.ko, p.en], [ROW.ko, ROW.en], '묶음 이름이 지역 이름과 따로 놀지 않게');
  const want: [string, string, string][] = [['12210', '동구', 'Dong-gu'], ['12240', '서구', 'Seo-gu'], ['12270', '남구', 'Nam-gu'], ['12300', '북구', 'Buk-gu']];
  for (const [c] of want) assert.equal(partOf(KEY, sgg(c))?.ko, LEGAL_SHORT, c);
  for (const [c, ko] of want) assert.equal(UI_KO.fullName(reg, sgg(c)), `${LEGAL_SHORT} ${ko}`, c);
  const en = createRegistry(geoEn, EN_ON);
  for (const [c, , e] of want) assert.equal(UI_EN.fullName(en, sgg(c)), `${e}, Jeonnam-Gwangju`, c);
  // 동 단원 이름(섞인 화면 — EN_EMD unitName)도 같은 묶음 이름
  for (const [c, , e] of want) assert.equal(UI_EN.unitName(en, `${KEY}/${e.toLowerCase()}`), `${e}, Jeonnam-Gwangju`, c);
});

test('지역 한 줄: 옛 이름(광주·전남) 대신 법적 구분 — 자치구·시·군 수가 원자료 전국 요약·판의 곳 수와 같다', () => {
  const s = KR.sidos.find((x: { code: string }) => x.code === '12');
  // 전국 요약의 gu 는 자치구(통합특별시의 구 — 지방자치법 제2조 ②), 일반구는 없다
  assert.equal(s.ilban, 0);
  const items: { ko: string }[] = BAN.regions.find((r: { key: string }) => r.key === KEY).items;
  const end = (k: string) => items.filter((it) => it.ko.endsWith(k)).length;
  assert.deepEqual([end('구'), end('시'), end('군'), items.length], [s.gu, s.si, s.gun, s.gu + s.si + s.gun], '판 곳 이름 끝 글자로 센 수');
  assert.deepEqual(ROW.desc.ko, [`자치구 ${s.gu}개와 시 ${s.si}개·군 ${s.gun}개`, '']);
  assert.deepEqual(ROW.desc.en, [`${s.gu} districts, ${s.si} cities and ${s.gun} counties`, '']);
  assert.deepEqual([s.gu, s.si, s.gun], [5, 5, 17]);
  assert.doesNotMatch(ROW.desc.ko[0], /광주|전남/);
  assert.doesNotMatch(ROW.desc.en[0], /Gwangju|Jeonnam/);
  assert.deepEqual(UI_KO.regionDesc[KEY], ROW.desc.ko);
});

test('화면 문구에 바뀌기 전 짧은 이름 \'전남광주\'가 남지 않는다 — 지역 표·원고·판·공유 그림 글(메모 칸 빼고), src 코드(주석 빼고), 그린 화면', () => {
  const bad = (where: string, xs: string[]) => { for (const x of xs) assert.doesNotMatch(x, OLD_SHORT, `${where}: ${x.slice(0, 80)}`); };
  bad('지역 표', strings(TABLE));
  bad('원고 units.json', strings(SRC));
  bad('원고 place-lines.json', strings(LINES));
  bad('판 units.json', strings(BAN));
  // 동 단원 파일(전남광주 27단원): full 은 정식 이름('전남광주통합특별시 동구')이라 지난다
  const emd = filesUnder(`public/data/geo/${DATA_VER}/emd`, /^12\d{3}\.json$/);
  assert.equal(emd.length, 27);
  for (const f of emd) bad(f, strings(read(f)));
  bad('공유 그림 글', strings(read('tools/og-image.text.json')));
  // src 코드: 주석 밖(문자열·틀)에 '전남광주'가 없다(옛 이름을 적은 주석은 기록이라 둔다)
  const srcFiles = filesUnder('src', /\.(ts|astro|mjs|js)$/);
  assert.ok(srcFiles.length > 50, `src 코드 ${srcFiles.length}개`);
  for (const f of srcFiles) {
    const left = code(fs.readFileSync(path.join(root, f), 'utf8'));
    const m = OLD_SHORT.exec(left);
    assert.equal(m, null, `${f}: ${m ? left.slice(Math.max(0, m.index - 40), m.index + 40) : ''}`);
  }
  // 그린 화면(한국어): 지역 탭·지역 쪽 머리·지역 고르기 칸과 지도 이름표·구 고르기·섞인 복습 줄
  const m: Mastery = Object.fromEntries(['12210', '26170', '27140', '12330'].map((c) => [sgg(c), rec(1, T)]));
  const pages = [homePage(ctxOf(reg, { last: KEY })), homePage(ctxOf(reg, { mastery: m, last: KEY })), unitPage(ctxOf(reg), KEY), regionsPage(ctxOf(reg)), pickPage(ctxOf(reg), KEY), unitPage(ctxOf(reg), 'korea')];
  for (const p of pages) {
    const h = sp(p.html);
    assert.doesNotMatch(h, OLD_SHORT);
    for (const mp of Object.values(p.maps ?? {})) for (const l of mp?.labels ?? []) assert.doesNotMatch(l.text, OLD_SHORT, l.id);
  }
  assert.match(sp(pages[0].html), new RegExp(`aria-pressed="true">${LEGAL_SHORT} <span class="u">27개 시·군·구</span>`));
  assert.match(sp(pages[1].html), new RegExp(`<p class="h-places">${LEGAL_SHORT} 동구 · 광산구 · 부산 동구 · 대구 동구</p>`));
  assert.match(sp(pages[2].html), new RegExp(`<h1 class="h-title">${LEGAL_SHORT} 27개 시·군·구</h1>`));
  assert.ok(pages[3].maps!.kr.labels!.some((l) => l.id === 'kr:sido:12' && l.text === LEGAL_SHORT), '지역 고르기 지도 이름표');
  // 영어 화면은 영어 짧은 이름 그대로(법정 영문 없음). 관문이 열린 영어 앱(EN_EMD)
  setLang('en');
  try {
    const en = createRegistry(geoEn, EN_ON);
    const ep = regionsPage(ctxOf(en));
    assert.ok(ep.maps!.kr.labels!.some((l) => l.id === 'kr:sido:12' && l.text === 'Jeonnam-Gwangju'));
    assert.doesNotMatch(sp(ep.html), /[가-힣]/, '영어 지역 고르기에 한글 없음');
  } finally { setLang('ko'); }
});

test('지도 이웃 시·도 이름표(맥락 이름 — 결정표 D96 사용자 결정 11-17): 판의 모든 이웃 땅 이름이 법정 정식 이름 그대로, 전남광주만 법정 약칭 광주특별시', () => {
  const byFull = new Map(SIDOS.map((s) => [s.full, s]));
  const dir = path.join(root, `public/data/geo/${DATA_VER}`);
  const topos = fs.readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith('.topo.json'));
  assert.ok(topos.length > 100, `판의 경계 파일 ${topos.length}개`);
  const seen = new Map<string, string>();
  for (const f of topos) {
    const t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Topology;
    for (const o of Object.values(t.objects)) for (const g of (o as { geometries?: { properties?: { name?: string; sido?: string; lp?: unknown } }[] }).geometries ?? []) {
      const p = g.properties;
      if (!p?.lp || typeof p.name !== 'string') continue;
      const row = byFull.get(p.name);
      if (!row) continue;   // 시·도 이름이 아닌 이웃 땅(동 단원의 이웃 구·북한·일본)
      assert.equal(p.sido, row.code, `${f}: ${p.name} 의 시·도 코드`);
      const text = ctxSido(p.name, p.sido);
      // 시 꼴(특별시·광역시·특별자치시)도 도 꼴(도·특별자치도)도 법정 이름 그대로, 통합특별시만 법정 약칭(지역 표 짧은 이름)
      assert.equal(text, p.name === LEGAL_FULL ? row.ko : row.full, `${f}: ${p.name}`);
      // 앱이 그 시·도를 부르는 짧은 이름(shortSido — 지역 표 ko)은 그대로 남아 있다
      assert.equal(shortSido(p.name, p.sido), /(특별시|광역시|특별자치시)$/.test(p.name) ? row.ko : row.full, `${f}: ${p.name} 짧은 이름`);
      seen.set(p.name, text);
    }
  }
  // 이웃으로 실리는 시·도 16곳(제주도 전남광주 지도의 이웃) — 바뀐 넷과 그대로인 몇을 못 박는다
  assert.equal(seen.size, 16);
  assert.equal(seen.get(LEGAL_FULL), LEGAL_SHORT, '전남광주통합특별시 → 법정 약칭(전에는 꼬리만 떼어 \'전남광주통합\')');
  for (const n of ['강원특별자치도', '전북특별자치도', '제주특별자치도']) assert.equal(seen.get(n), n, `${n} 은 정식 이름(전에는 '강원도'·'전북도'·'제주도')`);
  assert.deepEqual(['서울특별시', '세종특별자치시', '경기도', '충청북도'].map((n) => seen.get(n)), ['서울특별시', '세종특별자치시', '경기도', '충청북도']);
  assert.deepEqual([ctxSido('부산광역시', '26'), ctxSido('서울특별시'), ctxSido(LEGAL_FULL, '12'), ctxSido('경기도', '41')], ['부산광역시', '서울특별시', LEGAL_SHORT, '경기도']);
  // 실제 지도 모양: 충남 지도(광주특별시·강원·전북이 이웃)와 광주특별시 지도(제주가 이웃)의 맥락 이름 — 한국어는 그대로, 영어는 지역 표 영어 이름
  const outNames = (key: string) => {
    const s = buildShapes(JSON.parse(fs.readFileSync(path.join(dir, `${key}-sgg.topo.json`), 'utf8')) as Topology, specOf(reg.region(key)!), geo.labels);
    return s.names.filter((n) => n.kind === 'out');
  };
  const cn = outNames('chungnam');
  for (const n of [LEGAL_SHORT, '강원특별자치도', '전북특별자치도', '경기도', '충청북도', '세종특별자치시', '대전광역시']) assert.ok(cn.some((x) => x.text === n), `충남 지도 이웃 ${n}`);
  for (const x of cn) {
    assert.doesNotMatch(x.text, /^(강원도|전북도|제주도|전남광주통합|서울|인천|세종|대전)$/, x.text);
    assert.equal(UI_KO.ctxName(x), x.text);
  }
  assert.equal(UI_EN.ctxName({ sido: '12', text: cn.find((x) => x.text === LEGAL_SHORT)!.text }), 'Jeonnam-Gwangju');
  assert.ok(outNames(KEY).some((x) => x.text === '제주특별자치도' && x.sido === '50'), '광주특별시 지도 남쪽 이웃 제주');
});

test('섞인 화면 \'경기 광주시\'(결정표 D97 사용자 결정 11-16): 이름 앞부분이 다른 시·도 이름과 겹치는 곳은 섞인 화면에서 지역 이름을 붙이고, 경기 화면 안은 \'광주시\' 그대로', async () => {
  // 규칙(sidos.ts nearSidoName): 전국 원자료 시·군·구 이름 가운데 걸리는 곳은 경기 광주시 하나
  const all = BAN.regions.flatMap((r: { items: { id: string; ko: string }[] }) => r.items).filter((it: { id: string }) => it.id.startsWith('kr:sgg:'));
  assert.ok(all.length > 200, `판 곳 ${all.length}`);
  assert.deepEqual(all.filter((it: { id: string; ko: string }) => nearSidoName(it.ko, it.id.slice('kr:sgg:'.length, 'kr:sgg:'.length + 2))).map((it: { ko: string }) => it.ko), ['광주시']);
  // 제 시·도 이름과 같은 줄기(세종시·제주시)는 붙이지 않는다
  assert.deepEqual([nearSidoName('세종시', '36'), nearSidoName('제주시', '50')], [false, false]);
  // 동 단원 이름(판 동 색인 — 일반구 단위 단원 이름 '수원시 장안구' 등 포함)도 걸리는 것은 광주시 하나
  const units = Object.values(BAN.emdUnits as Record<string, { code: string; ko: string }[]>).flat();
  assert.deepEqual(units.filter((u) => nearSidoName(u.ko, u.code.slice(0, 2))).map((u) => u.ko), ['광주시']);
  assert.equal(nearSidoName('광주시', '12'), false, '같은 시·도 안의 이름은 붙이지 않는다(가짜)');
  assert.equal(nearSidoName('서구', '26'), false, '줄기 한 글자(서구 — \'서울\')는 보지 않는다');
  const GJ = 'kr:sgg:41610';
  // 섞인 화면: 곳 이름 · 문제 앞 이름 · 동 단원 이름(한·영)
  assert.equal(UI_KO.fullName(reg, GJ), '경기 광주시');
  assert.equal(UI_KO.fullPre(reg, GJ), '경기');
  assert.equal(mixPre(reg, GJ, UI_KO), '경기');
  assert.equal(reg.mixName('gyeonggi/gwangju-si'), '경기 광주시');
  const en = createRegistry(geoEn, EN_ON);
  assert.deepEqual([UI_EN.fullName(en, GJ), UI_EN.fullPre(en, GJ), UI_EN.unitName(en, 'gyeonggi/gwangju-si')], ['Gwangju-si, Gyeonggi', 'Gyeonggi', 'Gwangju-si, Gyeonggi']);
  // 이웃 곳(하남시)·같은 이름 곳(부산 동구)은 전과 같다
  assert.deepEqual([UI_KO.fullName(reg, 'kr:sgg:41450'), UI_KO.fullName(reg, 'kr:sgg:26170')], ['하남시', '부산 동구']);
  // 경기 화면 안(과 이름 목록·둘러보기 이름)은 '광주시' 그대로 — 곳 이름은 ko
  assert.equal(reg.place(GJ)!.item.ko, '광주시');
  // 그린 화면: 홈 복습 줄(광주특별시 동구 옆) — '경기 광주시', 경기 단원 쪽은 '광주시'
  const m: Mastery = Object.fromEntries(['12210', '41610', '26170'].map((c) => [sgg(c), rec(1, T)]));
  const home = sp(homePage(ctxOf(reg, { mastery: m, last: KEY })).html);
  assert.match(home, /<p class="h-places">[^<]*광주특별시 동구[^<]*경기 광주시[^<]*<\/p>/);
  const gu = sp(unitPage(ctxOf(reg), 'gyeonggi').html);
  assert.doesNotMatch(gu, /경기 광주시/);
});

test('전남광주 과 이름(결정표 D42 사용자 결정 11-16): 1과·넓은 화면 \'광주 시내\', 5과 \'보성·고흥 바닷가\' — 원고·판·영어 이름, 홈 카드·과 시작 큰 제목', () => {
  const titles = ['광주 시내', '광주 둘레', '서해 바닷가', '남서쪽 끝', '보성·고흥 바닷가', '순천 둘레'];
  const ens = ['Central Gwangju', 'Around Gwangju', 'West coast', 'Southwest tip', 'Boseong–Goheung coast', 'Around Suncheon'];
  for (const r of [SRC.regions.find((x: { key: string }) => x.key === KEY), BAN.regions.find((x: { key: string }) => x.key === KEY)]) {
    assert.deepEqual(r.lessons.map((l: { title: string }) => l.title), titles);
    assert.deepEqual(r.lessons.map((l: { en: string }) => l.en), ens);
    assert.deepEqual(r.screens.map((s: { ko: string; en: string }) => [s.ko, s.en]), [['광주 시내', 'central Gwangju'], ['북서쪽', 'northwest'], ['남서쪽', 'southwest'], ['동쪽', 'east']]);
    assert.deepEqual(r.screens[0].items, r.lessons[0].items, "넓은 화면 '광주 시내' = 1과 다섯 구");
  }
  // 화면 탭·화면이 바뀔 때 알림(한·영)
  const scr = reg.region(KEY)!.screens[0];
  assert.deepEqual([UI_KO.screenTab(scr), UI_KO.screenName(LEGAL_SHORT, scr), UI_EN.screenTab(scr), UI_EN.screenName('Jeonnam-Gwangju', scr)], ['광주 시내', '광주특별시 광주 시내', 'Central Gwangju', 'Jeonnam-Gwangju, central Gwangju']);
  // 홈 첫 과 카드·과 시작 큰 제목
  const h = sp(homePage(ctxOf(reg, { last: KEY })).html);
  assert.match(h, /<h1 class="h-title">광주 시내<br><span class="h-hl hl">5개 구<\/span>를 채워요<\/h1>/);
  assert.doesNotMatch(h, /남쪽 바닷가/);
  assert.match(sp(unitPage(ctxOf(reg), KEY).html), /보성·고흥 바닷가/);
});

test('지역 안 묶음 장치(지역 표 parts): 묶음 이름이 지역 이름과 달라도 섞인 화면은 묶음 이름을 쓴다 — 가짜 지역 표로', async () => {
  // 지금 운영 지역 표는 묶음 이름 = 지역 이름(광주특별시)이라 장치가 망가져도 글이 같다. 묶음 이름을 잠깐 바꿔 장치(partOf → fullName·fullPre·mixName)를 본다
  const row = SIDOS.find((s) => s.key === KEY)!;
  const was = row.parts;
  assert.ok(was && was.length > 0);
  row.parts = was.map((p) => ({ ...p, ko: '시험묶음', en: 'Testpart' }));
  try {
    const r = createRegistry(geo);
    assert.equal(UI_KO.fullName(r, sgg('12210')), '시험묶음 동구');
    assert.equal(UI_KO.fullPre(r, sgg('12210')), '시험묶음');
    assert.equal(UI_KO.fullName(r, sgg('26170')), '부산 동구', '묶음 없는 지역은 지역 이름');
    const unit = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/emd/12210.json'), 'utf8')) as EmdUnitFile;
    await registerUnits(r, [`${KEY}/dong-gu`], async () => unit, () => {});
    assert.equal(r.mixName(`${KEY}/dong-gu`), '시험묶음 동구');
    const en = createRegistry(geoEn, EN_ON);
    assert.deepEqual([UI_EN.fullName(en, sgg('12210')), UI_EN.fullPre(en, sgg('12210')), UI_EN.unitName(en, `${KEY}/dong-gu`)], ['Dong-gu, Testpart', 'Testpart', 'Dong-gu, Testpart']);
  } finally { row.parts = was; }
  assert.equal(UI_KO.fullName(createRegistry(geo), sgg('12210')), `${LEGAL_SHORT} 동구`, '가짜 지역 표를 되돌림');
});
