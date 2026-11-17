// 영어 앱의 동·일반구·시·도 단원(영어 동 공부 설계안 docs/EN_EMD_PLAN_2026-11-16.md 5절 · 7.1 · 10.2 의 3~8):
//  ③ 영어 레지스트리 전수: 모든 곳의 이름·짧은 이름·섞인 화면 이름·문제·판정 글에 한글·숫자 slug·undefined 가 없고 단원 안 짧은 이름이 겹치지 않는다
//  ④ 낱말: 동·시·도 단원의 문제(unitEn)·수 글(count·lessonCount), 고르기 낱말(unitWord) 홑·겹 꼴
//  ⑤ 맥락 이름: 동 지도 이웃 땅은 시·도 이름이 아니라 그 시·군·구 영어 이름, 일반구 단원 나머지 칸은 그 시·군 영어 이름
//  ⑥ 영어 쪽 HTML(지역 고르기·홈·구 고르기·단원·과 시작·요약·시험 결과)에 한글·숫자 slug·undefined 가 없다(legal-names 방식)
//  ⑦ 관문: enNames 없는 판 → 영어는 2026-11-16 전과 같다(끈 창). en 없는 옛 캐시 단원 파일 → 한글 대체, 숫자 slug 없음
//  ⑧ 한국어 불변: 새 함수(unitName·pickName·unitWord·guTitle·ctxName)의 한국어 출력이 옛 식과 같다(전수)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_VER } from '../../src/consts.ts';
import { wrongInfo } from '../../src/app/core/judge.ts';
import { createRegistry, unitKeyReads, unitOptions, EN_EMD, EN_GU, EN_KOREA, type Registry } from '../../src/app/registry.ts';
import { SIDOS, sidoByCode } from '../../src/app/sidos.ts';
import { buildShapes, shortSido, specOf, type Topology } from '../../src/app/map/shapes.ts';
import { unitWordKo } from '../../src/app/text/ko.ts';
import { UI_EN, UI_KO, ctxNamer, emdShortEn, enOfSlug, mixPre, setLang } from '../../src/app/text/ui.ts';
import type { EmdUnitFile, GeoData, Region } from '../../src/app/types.ts';
import type { Ctx } from '../../src/app/ui/ctx.ts';
import { homePage, pickPage, regionsPage, resultPage, startPage, summaryPage, unitPage, type Page } from '../../src/app/ui/pages.ts';
import { enOfSlug as enOfSlugLib } from '../../src/lib/regions.ts';
import { emdShort } from '../../tools/roma.mjs';
import { EN_OFF, EN_ON, geo, geoEn } from './fixtures.ts';

const T = 20000;
const dir = path.join(import.meta.dirname, '../../public/data/geo', DATA_VER);
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const unitFile = (code: string): EmdUnitFile => read(`emd/${code}.json`);
const CODES = Object.values(geo.units.emdUnits ?? {}).flatMap((l) => l.map((u) => u.code));
const HANGUL = /[ㄱ-ㆎ가-힣]/;
const BAD = /undefined|NaN|kr:(sgg|emd|sido):|\[object/;
/** 숫자 slug(동 주소 이름 '60000' — 2026-11-16 전 스위치만 켜면 동 이름이 이렇게 나왔다, 설계안 2.3) */
const SLUG5 = /(^|[^\d])\d{5}([^\d]|$)/;
const MODES = ['meet', 'choose', 'find'] as const;
/** 판의 동 단원 256개를 모두 등록한 레지스트리 */
function full(g: GeoData, opts: Parameters<typeof createRegistry>[1]): Registry {
  const r = createRegistry(g, opts);
  for (const c of CODES) r.addUnit(unitFile(c));
  return r;
}
const en = full(geoEn, EN_ON);
const ko = full(geo, {});
const ctxOf = (r: Registry, o: Partial<Ctx> = {}): Ctx => ({
  reg: r, geo, base: '/', ver: DATA_VER, storageOk: true, inApp: false,
  mastery: {}, lessonDeck: null, otherDeck: null, checkDeck: null, checkStart: 0,
  daily: null, dailyEmd: null, last: null, lastUnit: null, settings: { autoNext: false }, homeRegion: null, bests: {}, bestUnits: {},
  today: () => T, save() {}, go() {}, back() {}, render() {}, toast() {},
  ...o,
}) as Ctx;
/** 쪽에서 사람이 보는 글: HTML 전체(aria-label 포함)와 지도 이름표 */
const pageText = (p: Page) => `${p.title ?? ''}\n${p.html}\n${Object.values(p.maps ?? {}).flatMap((m) => (m.labels ?? []).map((l) => l.text)).join('\n')}`;
/** 숫자 slug 는 보이는 글에서만 본다(주소·data-arg 의 동 slug 는 그대로다) */
const visible = (p: Page) => `${p.title ?? ''}\n${p.html.replace(/<[^>]*>/g, ' ')}\n${Object.values(p.maps ?? {}).flatMap((m) => (m.labels ?? []).map((l) => l.text)).join('\n')}`;
function clean(p: Page, what: string) {
  assert.doesNotMatch(pageText(p), HANGUL, `${what}: 한글`);
  assert.doesNotMatch(pageText(p), BAD, `${what}: undefined 등`);
  assert.doesNotMatch(visible(p), SLUG5, `${what}: 숫자 slug`);
}
const inEn = <X>(fn: () => X): X => { setLang('en'); try { return fn(); } finally { setLang('ko'); } };
const units = (r: Registry) => r.units.filter((u) => u.unit && !u.unit.gu);

/* ---------- ③ 영어 레지스트리 전수 ---------- */

test('관문(설계안 5.1): 운영 판은 enNames 가 있어 영어 앱이 동·일반구·시·도 단원을 모두 켠다 · 스위치 셋은 켜져 있다', () => {
  assert.deepEqual([EN_EMD, EN_GU, EN_KOREA], [true, true, true]);
  assert.equal(geo.units.enNames, true);
  assert.deepEqual(EN_ON, { emd: true, gu: true, korea: true });
  assert.deepEqual(unitOptions('ko', {}), { emd: true, gu: true, korea: true }, '한국어는 관문과 상관없이 모두 켬');
  assert.deepEqual(unitOptions('en', {}), EN_OFF, 'enNames 없는 판(옛 캐시)이면 셋 다 끔');
  assert.deepEqual(unitOptions('en', { enNames: true }, { emd: false, gu: true, korea: true }), { emd: false, gu: true, korea: true }, '스위치를 따로 끈다');
  assert.deepEqual([en.regions.length, en.failed, units(en).length, !!en.region('korea'), ['gyeonggi', 'chungbuk', 'gyeongnam'].every((k) => en.region(`${k}/gu`))],
    [SIDOS.length, [], CODES.length, true, true]);
});

test('영어 레지스트리 전수(10.2-3): 모든 곳(동 3,559 · 일반구 33 · 시·도 16 · 시·군·구)의 이름·짧은 이름·섞인 화면 이름·문제 세 꼴·판정 글에 한글·숫자 slug·undefined 가 없다 · 단원 안 짧은 이름이 겹치지 않는다', () => {
  const count = { emd: 0, gu: 0, sido: 0, sgg: 0 };
  for (const r of [...en.regions, ...en.units]) {
    const shorts = new Map<string, string>();
    for (const it of r.items) {
      const p = en.place(it.id);
      if (!p) continue;   // 과 없는 지역(세종·제주)의 지역 칸은 공부하는 곳이 아니다
      count[it.id.startsWith('kr:emd:') ? 'emd' : it.id.startsWith('kr:sido:') ? 'sido' : r.unit?.gu ? 'gu' : 'sgg']++;
      const other = p.lesson.items.find((x) => x !== it.id);
      const texts = [UI_EN.name(it), UI_EN.short(it), UI_EN.fullName(en, it.id), UI_EN.fullPre(en, it.id) ?? '',
        ...MODES.map((m) => UI_EN.prompt(en, m, it.id, (s) => s)), ...MODES.flatMap((m) => Object.values(UI_EN.promptParts(en, m, it.id))),
        UI_EN.right(en, it.id, true), UI_EN.isleWhere(en, it.id, true), UI_EN.fixed(en, it.id), ...Object.values(UI_EN.dontKnow(en, it.id)),
        ...(other ? [...Object.values(UI_EN.wrong(en, wrongInfo(en, it.id, other), true)), ...Object.values(UI_EN.wrong(en, wrongInfo(en, it.id, other), false))] : [])];
      for (const t of texts) {
        assert.doesNotMatch(t, HANGUL, `${it.id} ${t}`);
        assert.doesNotMatch(t, BAD, `${it.id} ${t}`);
        assert.doesNotMatch(t, SLUG5, `${it.id} ${t}`);
      }
      assert.ok(UI_EN.name(it).trim() && UI_EN.short(it).trim(), `${it.id} 빈 이름`);
      if (it.id.startsWith('kr:emd:')) assert.equal(UI_EN.name(it), it.en, `${it.id} 동 이름은 판의 en`);
      const s = UI_EN.short(it);
      assert.ok(!shorts.has(s), `${r.key} 짧은 이름 겹침: ${s} (${shorts.get(s)} · ${it.ko})`);
      shorts.set(s, it.ko);
    }
  }
  assert.deepEqual([count.emd, count.gu, count.sido], [3559, 33, 16]);
  assert.ok(count.sgg > 200, `시·군·구 ${count.sgg}`);
});

test('이름 규칙 표본(설계안 5.2): 동·일반구·시·도 단원의 name·short·fullName·fullPre·unitName', () => {
  const id = (key: string, ko: string) => en.region(key)!.items.find((it) => it.ko === ko)!.id;
  const row = (key: string, ko: string) => { const i = id(key, ko), it = en.place(i)!.item; return [UI_EN.name(it), UI_EN.short(it), UI_EN.fullName(en, i), UI_EN.fullPre(en, i) ?? null]; };
  assert.deepEqual(row('seoul/jongno-gu', '청운효자동'), ['Cheongunhyoja-dong', 'Cheongunhyoja', 'Cheongunhyoja-dong, Jongno-gu', null]);
  assert.deepEqual(row('busan/jung-gu', '중앙동'), ['Jungang-dong', 'Jungang', 'Jungang-dong, Jung-gu, Busan', null], '같은 이름 시·군·구는 지역을 붙인다');
  assert.deepEqual(row('gyeonggi/gu', '장안구'), ['Jangan-gu', 'Jangan', 'Suwon-si Jangan-gu', 'Suwon-si'], '일반구');
  assert.deepEqual(row('korea', '광주특별시'), ['Jeonnam-Gwangju', 'Jeonnam-Gwangju', 'Jeonnam-Gwangju', null], '시·도 단원 곳(주소 이름 Jeonnam-gwangju 가 아님)');
  assert.deepEqual(row('gyeonggi/suwon-si-jangan-gu', '파장동'), ['Pajang-dong', 'Pajang', 'Pajang-dong, Suwon-si Jangan-gu', null], '일반구 동 단원');
  // 짧은 이름: '-dong' 만 뗌, 남는 글이 4자 미만이면 그대로, -eup·-myeon 은 남김(D101)
  const sh = (key: string, ko: string) => UI_EN.short(en.place(id(key, ko))!.item);
  assert.deepEqual([sh('seoul/gangnam-gu', '개포1동'), sh('incheon/ongjin-gun', '백령면')], ['Gaepo 1', 'Baengnyeong-myeon']);
  // 단원 이름(섞인 화면 — 오늘 복습 라벨·문제 앞)
  assert.deepEqual(['seoul/jongno-gu', 'busan/jung-gu', 'jeonnam-gwangju/dong-gu', 'gyeonggi/gu', 'korea', 'seoul', 'gyeonggi/suwon-si-jangan-gu'].map((k) => UI_EN.unitName(en, k)),
    ['Jongno-gu', 'Jung-gu, Busan', 'Dong-gu, Jeonnam-Gwangju', 'Gyeonggi city districts', 'Korea', 'Seoul', 'Suwon-si Jangan-gu']);
  // 단원 파일을 받기 전(동 색인만)에도 같은 이름
  const idx = createRegistry(geoEn, EN_ON);
  for (const u of units(en)) assert.equal(UI_EN.unitName(idx, u.key), UI_EN.unitName(en, u.key), u.key);
});

test('짧은 이름 = tools/roma.mjs emdShort(3,559곳), 단원 이름 = enOfSlug(256 단원 — 정적 쪽 lib/regions.ts 와 같은 셈, 단원 파일 en 과 같음)', () => {
  let n = 0;
  for (const u of units(en)) for (const it of u.items) { n++; assert.equal(emdShortEn(it.en!), emdShort(it.en)); assert.equal(UI_EN.short(it), emdShort(it.en)); }
  assert.equal(n, 3559);
  for (const [, list] of Object.entries(geo.units.emdUnits ?? {})) for (const u of list) {
    assert.equal(enOfSlug(u.slug), enOfSlugLib(u.slug));
    assert.equal(enOfSlug(u.slug), unitFile(u.code).en, u.code);
    assert.equal(UI_EN.pickName({ key: '', region: '', code: u.code, index: u }), unitFile(u.code).en);
  }
});

/* ---------- ④ 낱말 ---------- */

test('낱말(10.2-4 · 7.1): 동 단원 문제 \'Which town, township or neighborhood is outlined?\' · 수 글 \'25 towns, townships and neighborhoods\' · 시·도 단원 \'province or city\'', () => {
  const kindWords = (ids: string[], r: Region) => {
    const k = new Set(ids.map((i) => r.items.find((it) => it.id === i)!.ko.slice(-1)));
    return { town: k.has('읍'), township: k.has('면'), neighborhood: k.has('동') };
  };
  const has = (s: string, w: string) => new RegExp(`\\b${w}s?\\b`).test(s);
  for (const r of units(en)) {
    const all = kindWords(r.items.map((it) => it.id), r);
    const q = UI_EN.prompt(en, 'choose', r.items[0].id, (s) => s);
    assert.match(q, /^Which [a-z, ]+ is outlined\?$/, q);
    const c = UI_EN.count(r);
    assert.ok(c.startsWith(`${r.items.length} `), `${r.key} ${c}`);
    for (const [w, on] of Object.entries(all)) {
      assert.equal(has(q, w), on, `${r.key} 문제 ${q} — ${w}`);
      assert.equal(has(c, w), on, `${r.key} 수 글 ${c} — ${w}`);
    }
    for (const l of r.lessons) {
      const lc = UI_EN.lessonCount(r, l.items), lk = kindWords(l.items, r);
      assert.ok(lc.startsWith(`${l.items.length} `), `${r.key} ${l.no} ${lc}`);
      for (const [w, on] of Object.entries(lk)) assert.equal(has(lc, w), on, `${r.key} ${l.no}과 ${lc} — ${w}`);
      assert.doesNotMatch(lc, /places/);
    }
  }
  const R = (k: string) => en.region(k)!;
  assert.deepEqual([UI_EN.count(R('seoul/jongno-gu')), UI_EN.count(R('incheon/ongjin-gun')), UI_EN.count(R('sejong/sejong-si'))], ['17 neighborhoods', '7 townships', '25 towns, townships and neighborhoods']);
  assert.equal(UI_EN.prompt(en, 'choose', R('sejong/sejong-si').items[0].id, (s) => s), 'Which town, township or neighborhood is outlined?');
  assert.equal(UI_EN.prompt(en, 'choose', R('seoul/jongno-gu').items[0].id, (s) => s), 'Which neighborhood is outlined?');
  assert.deepEqual([UI_EN.count(R('korea')), UI_EN.lessonCount(R('korea'), R('korea').lessons[0].items)], ['16 provinces and cities', `${R('korea').lessons[0].items.length} provinces and cities`]);
  assert.equal(UI_EN.prompt(en, 'choose', 'kr:sido:11', (s) => s), 'Which province or city is outlined?');
  // 일반구 단원: 'Which district?'(곳이 모두 구), 제목 'Gyeonggi · 24 city districts'(한국어 '경기 일반구 24곳')
  assert.equal(UI_EN.prompt(en, 'choose', R('gyeonggi/gu').items[0].id, (s) => s), 'Which district is outlined?');
  assert.deepEqual([UI_EN.guTitle('Gyeonggi city districts', 'Gyeonggi', 24), UI_KO.guTitle('경기 일반구', '경기', 24)], ['Gyeonggi · 24 city districts', '경기 일반구 24곳']);
});

test('고르기 낱말(5.3 L.unitWord): 홑 꼴(제목·다른 단원)과 겹 꼴(목록 머리) — 구 먼저 쓰는 지역은 구 먼저(한국어 unitWordKo 와 같은 차례)', () => {
  const W = (k: string, fb = '구') => UI_EN.unitWord(en.emdUnits(k).map((u) => u.index.ko), k, fb);
  assert.deepEqual(W('seoul'), { one: 'district', many: 'districts' });
  assert.deepEqual(W('gyeonggi'), { one: 'city, county or district', many: 'cities, counties and districts' });
  assert.deepEqual(W('gangwon'), { one: 'city or county', many: 'cities and counties' });
  assert.deepEqual(W('busan'), { one: 'district or county', many: 'districts and counties' });
  assert.deepEqual(W('incheon'), { one: 'county or district', many: 'counties and districts' });
  assert.deepEqual(W('jeju', '시'), { one: 'city', many: 'cities' });
  assert.deepEqual(UI_EN.unitWord([], 'seoul', '시'), { one: 'city', many: 'cities' }, '시·군·구가 없으면 fallback');
  assert.deepEqual([UI_EN.pickTitle(W('gyeonggi')), UI_EN.pickSub(W('seoul')), UI_EN.pickHead('Seoul', 25, W('seoul')), UI_EN.otherUnits(W('jeju', '시'))],
    ['Which city, county or district?', 'Pick a district to learn its neighborhoods', 'Seoul: 25 districts', 'Pick another city']);
  assert.equal(UI_EN.pickerCap(16, 16), 'All 16 provinces and cities');
  assert.equal(UI_EN.pickerCap(14, 16), '14 of 16 regions open');
});

/* ---------- ⑤ 맥락 이름 ---------- */

test('맥락 이름(10.2-5): 동 단원 지도의 이웃 땅은 그 시·군·구 영어 이름(시·도 이름이 아님) — 256 단원 전수, 지도 칸(shapes)도', () => {
  const sidoEn = new Set(SIDOS.map((s) => s.en));
  let n = 0;
  for (const c of CODES) {
    const t = read(`emd/${c}.topo.json`) as Topology;
    for (const g of t.objects.out?.geometries ?? []) {
      const p = g.properties ?? {};
      const cell = { sido: p.sido ?? '', text: shortSido(p.name ?? '', p.sido), id: p.id, en: p.en };
      const name = UI_EN.ctxName(cell);
      assert.equal(name, p.en, `${c} ${p.id}`);
      assert.ok(name && !HANGUL.test(name), `${c} ${p.id} ${name}`);
      if (p.sido !== 'kp') assert.ok(!sidoEn.has(name), `${c} 이웃 ${p.id} 가 시·도 이름 ${name}`);
      assert.equal(UI_KO.ctxName(cell), cell.text, '한국어는 글 그대로');
      n++;
    }
  }
  assert.ok(n > 2000, `이웃 땅 조각 ${n}`);
  // 지도 칸: 종로구 단원 지도의 이웃 이름(전에는 모두 'Seoul')
  const r = en.region('seoul/jongno-gu')!;
  const s = buildShapes(read('emd/11110.topo.json'), specOf(r), Object.fromEntries(r.items.map((it) => [it.id, en.point(it.id)!])));
  const names = inEn(() => s.names.filter((x) => x.kind === 'out').map(ctxNamer(en)));
  assert.ok(names.includes('Jung-gu') && names.includes('Seongbuk-gu'), names.join(', '));
  assert.ok(!names.includes('Seoul'));
});

test('맥락 이름(10.2-5): 일반구 단원 지도의 나머지 칸은 그 시·군 영어 이름(레지스트리 곳 이름) — 경기·충북·경남, 한국어는 칸 이름 그대로', () => {
  for (const k of ['gyeonggi', 'chungbuk', 'gyeongnam']) {
    const r = en.region(`${k}/gu`)!;
    const s = buildShapes(read(`${k}-sgg.topo.json`), specOf(r), geo.labels);
    const rest = s.names.filter((x) => x.rest);
    assert.ok(rest.length >= 5, `${k} 나머지 칸 ${rest.length}`);
    const e = inEn(() => rest.map(ctxNamer(en)));
    rest.forEach((x, i) => {
      assert.equal(e[i], UI_EN.name(en.place(x.id!)!.item), `${k} ${x.text}`);
      assert.doesNotMatch(e[i], HANGUL);
      assert.ok(e[i]);
    });
    assert.deepEqual(rest.map(ctxNamer(ko)), rest.map((x) => x.text), '한국어(L = UI_KO)는 칸 이름 그대로');
  }
});

/* ---------- ⑥ 영어 쪽 HTML ---------- */

test('영어 쪽 HTML(10.2-6): 지역 고르기·홈(지역마다)·구 고르기·단원 쪽·과 시작·과 요약·시험 결과에 한글·숫자 slug·undefined 가 없다 — \'Coming soon\'(D20·D23)도 없다', () => {
  inEn(() => {
    const c = ctxOf(en);
    const rp = regionsPage(c);
    clean(rp, '지역 고르기');
    assert.doesNotMatch(rp.html, /Coming soon/);
    assert.match(rp.html, /All 16 provinces and cities/);
    for (const r of en.regions) {
      const h = homePage(ctxOf(en, { last: r.key }));
      clean(h, `홈 ${r.key}`);
      assert.doesNotMatch(h.html, /Coming soon/, `홈 ${r.key}`);
      clean(unitPage(c, r.key), `지역 쪽 ${r.key}`);
      if (en.emdUnits(r.key).length) clean(pickPage(c, r.key), `구 고르기 ${r.key}`);
    }
    clean(homePage(ctxOf(en, { last: 'korea' })), '홈 korea');
    let pages = 0;
    for (const u of en.units) {
      clean(unitPage(c, u.key), `단원 쪽 ${u.key}`);
      for (const l of u.lessons) {
        clean(startPage(c, u.key, l.no), `과 시작 ${u.key} ${l.no}`);
        clean(summaryPage(c, { region: u.key, no: l.no, newly: l.items, firstTry: 1, total: l.items.length, confused: l.items.slice(0, 2) }), `과 요약 ${u.key} ${l.no}`);
        pages += 2;
      }
      const w = u.items.slice(0, 2).map((it, i): [string, string | null] => [it.id, i ? u.items[2]?.id ?? null : null]);
      clean(resultPage(c, { region: u.key, score: 1, total: 3, seconds: 70, wrong: w }), `시험 결과 ${u.key}`);
    }
    assert.ok(pages > 1300, `과 시작·요약 ${pages}쪽`);
  });
});

test('영어 구 고르기(7.1): 낱말 제목·목록 머리, 단원 이름은 영어 알파벳 차례(D103), 시 묶음 머리 \'Suwon-si\' 아래 \'Jangan-gu\', 최근 단추 \'Continue Jongno-gu\'', () => {
  inEn(() => {
    const s = pickPage(ctxOf(en, { lastUnit: 'seoul/jongno-gu' }), 'seoul').html.replace(/ /g, ' ');
    assert.match(s, /<h1 class="h-title">Which district\?<\/h1>/);
    assert.match(s, /<h2 id="e-path">Seoul: 25 districts<\/h2>/);
    assert.match(s, /Continue Jongno-gu/);
    const names = [...s.matchAll(/<span class="nm">([^<]*)<\/span>/g)].map((x) => x[1]);
    assert.equal(names.length, 25);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'en')), '알파벳 차례');
    const g = pickPage(ctxOf(en), 'gyeonggi').html.replace(/ /g, ' ');
    assert.match(g, /<h1 class="h-title">Which city, county or district\?<\/h1>/);
    assert.match(g, /<h3 class="e-gh">Suwon-si <span>4 districts<\/span><\/h3>\s*<ol class="e-list e-sub">[\s\S]*?<span class="nm">Gwonseon-gu<\/span>[\s\S]*?<span class="nm">Jangan-gu<\/span>/);
    assert.match(g, /Pick another|Learn 24 city districts/);
  });
});

test('영어 일반구 단원 쪽·오늘 복습 라벨(7.1): \'Gyeonggi · 24 city districts\', 동 복습 라벨 \'Jongno-gu 2\'·곳 이름 \'Gahoe-dong, Jongno-gu\'(전에는 한글 \'종로구\')', () => {
  inEn(() => {
    const u = unitPage(ctxOf(en), 'gyeonggi/gu');
    assert.match(u.html, /<h1 class="h-title">Gyeonggi · 24 city districts<\/h1>/);
    assert.equal(u.title, 'Gyeonggi · 24 city districts');
    // 오늘 복습(시·군·구 과를 오늘 몫만큼 한 날 — 동 몫 판, N32): 라벨의 묶음 이름은 단원 영어 이름(L.unitName), 곳 줄은 '곳, 단원'
    const jongno = en.region('seoul/jongno-gu')!.items.slice(0, 2).map((it) => it.id);
    const seoul1 = en.region('seoul')!.lessons[0].items;
    const m = Object.fromEntries([...seoul1.map((id) => [id, T + 2] as const), ...jongno.map((id) => [id, T] as const)].map(([id, due]) => [id, { box: 1, due, hi: 1, streak: 0, grad: false, front: false }]));
    const h = homePage(ctxOf(en, { mastery: m as Ctx['mastery'], last: 'seoul', daily: { day: T, n: 99 } })).html.replace(/ /g, ' ');
    assert.match(h, /Today&#39;s review · Jongno-gu 2/);
    assert.match(h, /Gahoe-dong, Jongno-gu/);
    assert.doesNotMatch(h, HANGUL);
  });
});

/* ---------- ⑦ 관문·옛 캐시 ---------- */

test('관문(10.2-7): enNames 없는 판이면 영어 앱은 끈 창과 같은 화면이다(2026-11-16 전 영어 앱)', () => {
  const { enNames: _e, ...old } = geoEn.units;
  const gOld: GeoData = { ...geoEn, units: old };
  const closed = createRegistry(gOld, unitOptions('en', gOld.units));
  const off = createRegistry(geoEn, EN_OFF);
  assert.deepEqual([closed.regions.map((r) => r.key), closed.units.map((u) => u.key)], [off.regions.map((r) => r.key), off.units.map((u) => u.key)]);
  assert.deepEqual(closed.units, [], '동·일반구·시·도 단원 없음');
  assert.equal(closed.region('sejong'), undefined);
  inEn(() => {
    assert.equal(regionsPage(ctxOf(closed)).html, regionsPage(ctxOf(off)).html);
    for (const k of ['seoul', 'gyeonggi', 'busan']) assert.equal(homePage(ctxOf(closed, { last: k })).html, homePage(ctxOf(off, { last: k })).html, k);
  });
});

test('옛 캐시 단원 파일(10.2-7 · 5.4): en 이 없는 단원 파일을 받아도 곳은 한글 이름, 과·화면은 한글 이름 — 숫자 slug·undefined·빈 이름 없음, 이웃 땅 이름은 그리지 않음', () => {
  const strip = (f: EmdUnitFile): EmdUnitFile => ({ ...f, items: f.items.map(({ en: _x, ...it }) => it), lessons: f.lessons.map(({ en: _x, ...l }) => l), screens: f.screens.map((s) => ({ ...s, en: '' })) });
  const r = createRegistry(geoEn, EN_ON);
  for (const code of ['11110', '41111', '47940']) {
    const f = strip(unitFile(code));
    const u = r.addUnit(f);
    for (const it of u.items) {
      assert.equal(it.en, undefined);
      assert.deepEqual([UI_EN.name(it), UI_EN.short(it)], [it.ko, it.ko], `${code} 한글 대체`);
      const t = [UI_EN.fullName(r, it.id), ...MODES.map((m) => UI_EN.prompt(r, m, it.id, (s) => s))];
      for (const x of t) { assert.doesNotMatch(x, SLUG5, x); assert.doesNotMatch(x, BAD, x); }
    }
    for (const l of u.lessons) assert.equal(UI_EN.lesson(l), l.title);
    for (const s of u.screens) assert.equal(UI_EN.screenName(UI_EN.region(u), s), `${u.en}, ${s.ko}`);
    inEn(() => {
      for (const p of [unitPage(ctxOf(r), u.key), startPage(ctxOf(r), u.key, 1), summaryPage(ctxOf(r), { region: u.key, no: 1, newly: [], firstTry: 0, total: 1, confused: u.lessons[0].items.slice(0, 1) })]) {
        assert.doesNotMatch(visible(p), SLUG5, `${code} 숫자 slug`);
        assert.doesNotMatch(pageText(p), BAD, `${code} undefined`);
      }
    });
  }
  // 이웃 땅: en 이 없으면 이름을 두지 않는다(한글을 영어 지도에 섞지 않음 — 지도는 빈 글을 건너뛴다, svgmap drawContext)
  assert.equal(UI_EN.ctxName({ sido: '11', text: '중구', id: 'kr:sgg:11140' }), '');
  assert.equal(UI_EN.ctxName({ sido: '11', text: '서울', }), 'Seoul', '지역 지도의 이웃 시·도(id 없음)는 전과 같다');
});

/* ---------- ⑧ 한국어 불변 ---------- */

test('한국어 불변(10.2-8): unitName = mixName · pickName = 색인 한글 · unitWord = unitWordKo || 대체 글자 · guTitle · ctxName = 글 그대로 · 고르기 글 — 전수', () => {
  for (const k of [...ko.regions.map((r) => r.key), ...ko.units.map((u) => u.key)]) assert.equal(UI_KO.unitName(ko, k), ko.mixName(k), k);
  const idx = createRegistry(geo);
  for (const r of idx.regions) for (const u of idx.emdUnits(r.key)) { assert.equal(UI_KO.unitName(idx, u.key), idx.mixName(u.key), u.key); assert.equal(UI_KO.pickName(u), u.index.ko); }
  for (const r of ko.regions) {
    const names = ko.emdUnits(r.key).map((u) => u.index.ko);
    for (const fb of ['구', '시']) {
      const w = unitWordKo(names, r.key) || fb;
      const W = UI_KO.unitWord(names, r.key, fb);
      assert.deepEqual(W, { one: w, many: w }, `${r.key} ${fb}`);
      // 옛 글(2026-11-16 전 ui.ts — 낱말 글자를 바로 받음)과 같다
      assert.equal(UI_KO.pickTitle(W), `어느 ${w}의 동을\n배울까요?`);
      assert.equal(UI_KO.pickHead('서울', 25, W), `서울 25개 ${w}`);
      assert.equal(UI_KO.otherUnits(W), `다른 ${w} 고르기`);
      assert.ok(UI_KO.pickSub(W).startsWith(w));
    }
  }
  for (const k of ['gyeonggi', 'chungbuk', 'gyeongnam']) {
    const g = ko.region(`${k}/gu`)!;
    assert.equal(UI_KO.guTitle(g.ko, ko.region(k)!.ko, g.items.length), `${g.ko} ${UI_KO.places(g.items.length)}`);
  }
  // 맥락 이름: 이웃 땅 en 이 있어도 한국어는 글 그대로
  for (const c of CODES.slice(0, 40)) for (const g of (read(`emd/${c}.topo.json`) as Topology).objects.out?.geometries ?? []) {
    const p = g.properties ?? {};
    assert.equal(UI_KO.ctxName({ sido: p.sido ?? '', text: p.name ?? '', id: p.id, en: p.en }), p.name);
  }
  // 한국어 이름은 en 을 보지 않는다(동 곳에 en 이 실려도 한글 그대로)
  for (const u of units(ko).slice(0, 30)) for (const it of u.items) { assert.equal(UI_KO.name(it), it.ko); assert.ok(it.en); }
});

/* ---------- 고치기(EN_EMD 점검 A·B, 2026-11-16) ---------- */

const src = (f: string) => fs.readFileSync(path.join(import.meta.dirname, '../../src/app', f), 'utf8');

test('스위치를 따로 끈다(16절 되돌리기 · 점검 B): 동만 끄면 일반구·시·도 단원은 남고 세종·제주·동 색인은 빠진다, 일반구·시·도 단원만 끄면 동은 남는다 · 저장 키 읽기(8조합)', () => {
  const what = (o: { emd: boolean; gu: boolean; korea: boolean }) => {
    const r = createRegistry(geoEn, o);
    return {
      gu: ['gyeonggi', 'chungbuk', 'gyeongnam'].every((k) => !!r.region(`${k}/gu`)),
      korea: !!r.region('korea'),
      emd: r.emdUnits('seoul').length > 0 && !!r.region('sejong') && !!r.region('jeju'),
      noGu: ['gyeonggi', 'chungbuk', 'gyeongnam'].every((k) => !r.region(`${k}/gu`)),
      noEmd: r.emdUnits('seoul').length === 0 && !r.region('sejong') && !r.region('jeju'),
      failed: r.failed.length,
    };
  };
  for (const emd of [false, true]) for (const gu of [false, true]) for (const korea of [false, true]) {
    const o = { emd, gu, korea };
    assert.deepEqual(what(o), { gu, korea, emd, noGu: !gu, noEmd: !emd, failed: 0 }, JSON.stringify(o));
    assert.deepEqual(unitKeyReads(o), { dailyEmd: emd, unitKeys: emd || gu }, JSON.stringify(o));
  }
  // main.ts 는 이 셈으로 키를 읽는다(끈 단원의 키는 읽지 않고 지우지도 않는다)
  const m = src('main.ts');
  assert.match(m, /const keyReads = unitKeyReads\(opts\);/);
  assert.match(m, /const unitKeys = keyReads\.unitKeys;/);
  assert.match(m, /dailyEmd: keyReads\.dailyEmd \? store\.read\(K\.dailyEmd, checkDaily\) : null/);
  assert.match(m, /lastUnit: unitKeys \? store\.read\(K\.lastUnit, checkLastUnit\) : null/);
  assert.match(m, /bestUnits: unitKeys \? store\.read\(K\.bestUnit, checkBestUnits\) \?\? \{\} : \{\}/);
});

test('오늘 복습 문제 앞 이름(mixPre — play.ts band, 점검 B): 영어 동은 단원 영어 이름(\'Jongno-gu\' · \'Jung-gu, Busan\'), 한국어는 옛 식(mixName) 그대로 — 전수', () => {
  let n = 0;
  for (const u of [...en.regions, ...en.units]) for (const it of u.items) {
    const e = mixPre(en, it.id, UI_EN), k = mixPre(ko, it.id, UI_KO);
    if (it.id.startsWith('kr:emd:')) {
      assert.equal(e, UI_EN.unitName(en, u.key), it.id);
      assert.doesNotMatch(e ?? '', HANGUL, it.id);
      assert.ok(e, it.id);
      // 옛 식(2026-11-16 전 play.ts): (qp && L.unitName(reg, 단원)) ?? L.region(단원) — 한국어 unitName = reg.mixName
      assert.equal(k, ko.mixName(u.key), it.id);
      n++;
    } else {
      assert.equal(e, UI_EN.fullPre(en, it.id), it.id);
      assert.equal(k, UI_KO.fullPre(ko, it.id), it.id);
    }
  }
  assert.equal(n, CODES.reduce((s, c) => s + unitFile(c).items.length, 0));
  const first = (r: Registry, key: string) => r.region(key)!.items[0].id;
  assert.deepEqual([mixPre(en, first(en, 'seoul/jongno-gu'), UI_EN), mixPre(ko, first(ko, 'seoul/jongno-gu'), UI_KO)], ['Jongno-gu', '종로구']);
  assert.deepEqual([mixPre(en, first(en, 'busan/jung-gu'), UI_EN), mixPre(ko, first(ko, 'busan/jung-gu'), UI_KO)], ['Jung-gu, Busan', ko.mixName('busan/jung-gu')]);
  assert.match(src('ui/play.ts'), /const unitName = deckOf\(\)\?\.kind !== 'review' \? undefined : mixPre\(ctx\.reg, q\.id\);/);
});

test('영어 동 과 시작·요약 지도 이름표는 짧은 이름(점검 A medium — 판이 서로 덮임) · 위 이름 줄은 전체 이름(이름마다 줄을 바꾸지 않음) — 한국어·영어 시·군·구·일반구·시·도 과는 전과 같다', () => {
  const labels = (p: Page, k: string) => p.maps![k].labels!.map((l) => l.text);
  for (const key of ['seoul/jongno-gu', 'gangwon/chuncheon-si', 'jeju/jeju-si', 'gyeonggi/suwon-si-jangan-gu', 'sejong/sejong-si']) {
    const u = en.region(key)!;
    assert.ok(u?.lessons.length, key);
    for (const l of u.lessons) {
      const want = l.items.map((id) => UI_EN.short(en.place(id)!.item));
      inEn(() => {
        const sp = startPage(ctxOf(en), key, l.no);
        assert.deepEqual(labels(sp, 'start'), want, `${key} ${l.no} 시작`);
        const sum = summaryPage(ctxOf(en), { region: key, no: l.no, newly: [], firstTry: 0, total: 1, confused: [] });
        assert.deepEqual(labels(sum, 'sum'), want, `${key} ${l.no} 요약`);
        // 확대 상자 좁히기를 한국어 이름 판으로도 잰다(fitText = item.ko — 결정표 D110 ②, pages.ts lessonMapLabel. 끊기면 영어 좁히기가 꺼진다 — 점검 2 변이 M17·M18)
        const ko = l.items.map((id) => en.place(id)!.item.ko);
        assert.deepEqual(sp.maps!.start.labels!.map((x) => x.fitText), ko, `${key} ${l.no} 시작 fitText`);
        assert.deepEqual(sum.maps!.sum.labels!.map((x) => x.fitText), ko, `${key} ${l.no} 요약 fitText`);
        for (const id of l.items) assert.ok(sp.html.includes(`<span class="nw">${UI_EN.name(en.place(id)!.item)}</span>`), `${key} ${l.no} 이름 줄 ${id}`);
      });
      const kp = startPage(ctxOf(ko), key, l.no);
      assert.deepEqual(labels(kp, 'start'), l.items.map((id) => ko.place(id)!.item.ko), `${key} ${l.no} 한국어`);
      // 한국어 앱 이름표에는 fitText 가 없다(한국어 상자는 전과 같다)
      assert.ok(kp.maps!.start.labels!.every((x) => x.fitText === undefined), `${key} ${l.no} 한국어 fitText`);
      // 한국어 이름 줄은 전과 같은 글(이름을 pages.ts SEP — 줄바꿈 없는 빈칸 + '· ' — 로 이음)
      assert.ok(kp.html.includes(`<p class="h-places">${l.items.map((id) => ko.place(id)!.item.ko).join(' · ')}</p>`), `${key} ${l.no} 한국어 이름 줄`);
    }
  }
  inEn(() => {
    for (const key of ['seoul', 'gyeonggi/gu', 'korea', 'busan']) {
      const l = en.region(key)!.lessons[0];
      const sp = startPage(ctxOf(en), key, l.no);
      assert.deepEqual(labels(sp, 'start'), l.items.map((id) => UI_EN.name(en.place(id)!.item)), key);
      // 시·군·구·일반구·시·도 과는 fitText 가 없다(동 과만 — lessonMapLabel isEmd)
      assert.ok(sp.maps!.start.labels!.every((x) => x.fitText === undefined), `${key} fitText`);
    }
  });
});

test('영어 구 고르기 다듬기(점검 A low): 화면 단추 첫 글자 대문자, 지도 캡션에 지역 이름을 되풀이하지 않음, 시 묶음 머리 \'4 districts\' — 한국어는 전과 같다 · 출처 줄 덧말은 동 단원 둘러보기에만', () => {
  const tabsOf = (h: string) => [...h.matchAll(/data-act="pickScreen"[^>]*>([^<]*)</g)].map((x) => x[1]);
  inEn(() => {
    const g = pickPage(ctxOf(en), 'gyeonggi').html;
    assert.deepEqual(tabsOf(g), ['All', 'Northwest', 'Northeast', 'Southwest', 'Southeast']);
    assert.deepEqual(tabsOf(pickPage(ctxOf(en), 'incheon').html), ['All', 'Mainland', 'Islands']);
    assert.doesNotMatch(g, /Gyeonggi · Gyeonggi/);
    assert.match(g, />Gyeonggi: 47 cities, counties and districts</);
    for (const r of en.regions) if (en.emdUnits(r.key).length) assert.ok(!pickPage(ctxOf(en), r.key).html.includes(`${r.en} · ${r.en}`), r.key);
    // 토스트는 문장 속 꼴 그대로('Gyeonggi, northwest')
    assert.equal(UI_EN.screenName('Gyeonggi', en.region('gyeonggi')!.screens[0]), 'Gyeonggi, northwest');
  });
  const k = pickPage(ctxOf(ko), 'gyeonggi').html;
  assert.match(k, /경기도 · 경기 47개 시·군·구/);
  assert.deepEqual(tabsOf(k), ['전체', '북서부', '북동부', '남서부', '남동부']);
  assert.match(k, /<h3 class="e-gh">수원시 <span>4개 구<\/span><\/h3>/);
  // 지도 보기 아래의 출처 줄과 영어 동 단원의 이름 표기 안내는 2026-11-18 사용자 결정으로 뺌(출처는 /sources/ 에만)
  assert.ok(!('source' in UI_EN) && !('source' in UI_KO) && !('sourceEmd' in UI_EN) && !('sourceEmd' in UI_KO), '출처 줄·이름 표기 안내 글은 없다');
  const x = src('ui/explore.ts');
  assert.ok(!x.includes('L.source') && !x.includes('x-src'), '출처 줄·이름 표기 안내 줄은 그리지 않는다');
  // 둘러보기 이름표(점검 A medium): 영어 동·일반구 단원은 짧은 이름, 그 밖은 전과 같이 L.name
  assert.ok(x.includes("text: L.lang === 'en' && r.unit ? L.short(it) : L.name(it)"), '둘러보기 이름표');
});

test('영어 문제 큰 이름·보기 단추(점검 A low): 가운뎃점 뒤 줄바꿈 자리(<wbr>), 끊을 수 없는 긴 조각은 좁은 화면에서 글자를 줄임 — 한국어는 이스케이프만', () => {
  const p = src('ui/play.ts');
  assert.ok(p.includes("const nameHtml = (s: string) => (L.lang === 'en' ? esc(s).replace(/·/g, '·<wbr>') : esc(s));"));
  assert.ok(p.includes('<span class="pq-big" style="--n:${n.toFixed(1)}">${nameHtml(p.big)}</span>'));
  assert.ok(p.includes(`<button class="opt\${optLong(nm(o)) ? ' long' : ''}"`));
  assert.ok(p.includes('${nameHtml(nm(o))}</button>'));
  assert.ok(p.includes("const optLong = (s: string) => L.lang === 'en' &&"));
  assert.match(fs.readFileSync(path.join(import.meta.dirname, '../../src/app/ui/app.css'), 'utf8'), /@media \(max-width: 1023px\) \{ \.opt\.long \{ font-size: 14px; line-height: 19px; \} \}/);
});

test('영어 보기 단추 — 가로로 돌린 폰(결정표 D113, 사용자 결정 11-16 \'함께 고치기\'): 왼쪽 열 두 칸 보기만 14px · 오른쪽 안쪽 여백 8(왼쪽 24 는 번호 자리), 한국어·세로 폰은 그대로', () => {
  const css = fs.readFileSync(path.join(import.meta.dirname, '../../src/app/ui/app.css'), 'utf8');
  const land = '@media (max-width: 1023px) and (max-height: 500px) and (orientation: landscape) {';
  const i = css.indexOf(land), blk = css.slice(i, css.indexOf('\n}\n', i));
  assert.ok(i > 0);
  assert.match(blk, /\n  html\[lang="en"\] \.opt \{ font-size: 14px; line-height: 19px; padding: 0 8px 0 24px; \}/);
  // 이 규칙은 가로 폰 블록에만 있다(세로 폰·넓은 화면·한국어 보기는 전과 같다)
  assert.equal(css.split('html[lang="en"] .opt {').length - 1, 1);
  // 번호(.k)는 왼쪽 위 10px — 왼쪽 안쪽 여백 24 가 번호를 비킨다(보기 기본 padding 0 24px)
  assert.match(css, /\.opt \{\n  position: relative; min-height: 52px; padding: 0 24px;/);
  assert.match(css, /\.opt \.k \{ position: absolute; left: 10px; top: 6px;/);
});

test('영어 폰 화면 탭(결정표 D42 — 넓은 화면 영어 이름 \'Central Gwangju\'): 낱말 사이에서만 두 줄로 꺾음, 홈 지역 탭 규칙은 화면 탭을 뺀다 · 한국어 탭은 그대로', () => {
  const css = fs.readFileSync(path.join(import.meta.dirname, '../../src/app/ui/app.css'), 'utf8');
  assert.equal(css.split('@media (max-width: 599px) { html[lang="en"] .e-scr .h-tab { white-space: normal; text-align: center; line-height: 18px; } }').length - 1, 1);
  assert.equal(css.split('@media (max-width: 599px) { html[lang="en"] .h-tabs:not(.e-scr) .h-tab { white-space: normal; text-align: center; } }').length - 1, 1);
  // 한국어 화면 탭에 줄바꿈 규칙이 없다(화면 탭 규칙은 모두 영어에만)
  assert.doesNotMatch(css, /\n[^\n]*(?<!lang="en"\] )\.e-scr \.h-tab \{[^}]*white-space/);
  // 영어 화면 탭 이름 가운데 두 낱말은 'Central Gwangju' 뿐(나머지는 한 낱말이라 전과 같은 한 줄)
  const two = new Set<string>();
  for (const r of en.regions) for (const s of r.screens ?? []) if (s.en && / /.test(s.en)) two.add(s.en);
  assert.deepEqual([...two], ['central Gwangju']);
});
