// 부산(계획서 NATIONWIDE_PLAN E11 — 새 시·도 첫 번째): 지역 표 → 파이프라인 → 판 units.json → 앱(레지스트리·홈·지역 쪽·지역 고르기·주소·GA·문구)이
// 실제 새 지역에서 도는지 본다. 동 단원 전수(파일·등록·16px·1곳 과·40KB)는 emd-units.test 가 동 공개 지역 전부로 본다.
// 같은 이름(중구·동구·서구·남구·북구·강서구)은 지역이 섞이는 화면에서 '부산 중구'처럼 지역 이름을 붙인다(N12)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_VER } from '../../src/consts.ts';
import { lessonQuestions, chooseOptions } from '../../src/app/core/questions.ts';
import { rngFrom } from '../../src/app/core/rng.ts';
import type { Mastery, Rec } from '../../src/app/core/mastery.ts';
import { homeCard, todayReview } from '../../src/app/core/next.ts';
import { usableDeck } from '../../src/app/core/session.ts';
import { tomorrowCount } from '../../src/app/core/tally.ts';
import { gaArgs, gaUnit, lessonCompleteParams, registerUnits } from '../../src/app/core/units.ts';
import { createRegistry, type Registry } from '../../src/app/registry.ts';
import { parseRoute, type Known } from '../../src/app/router.ts';
import { checkDaily, checkDeck, checkLast, checkMastery, keys, openStore, type KV } from '../../src/app/store.ts';
import { UI_EN, UI_KO, setLang } from '../../src/app/text/ui.ts';
import type { EmdUnitFile } from '../../src/app/types.ts';
import type { Ctx } from '../../src/app/ui/ctx.ts';
import { homePage, pickPage, regionsPage, unitPage } from '../../src/app/ui/pages.ts';
import { EN_OFF, EN_ON, OPENED_SINCE, geo, geoNoBusan, geoNoE12, reg, idOf } from './fixtures.ts';

const T = 20000;
const root = path.join(import.meta.dirname, '../..');
const dir = path.join(root, 'public/data/geo', DATA_VER);
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const SIDO = read('src/data/sido.json').sidos.find((s: { key: string }) => s.key === 'busan');
const SRC = read('src/data/units.json').regions.find((r: { key: string }) => r.key === 'busan');
const LINES = read('src/data/place-lines.json').busan;
const HARD: string[] = read('src/data/hard-words.json').words;
const busanFile = (code: string): EmdUnitFile => JSON.parse(fs.readFileSync(path.join(dir, 'emd', `${code}.json`), 'utf8'));
const BAD = /undefined|NaN|kr:(sgg|emd|sido):|\[object/;
const ctxOf = (r: Registry, o: Partial<Ctx> = {}): Ctx => ({
  reg: r, geo, base: '/', ver: DATA_VER, storageOk: true, inApp: false,
  mastery: {}, lessonDeck: null, otherDeck: null, checkDeck: null, checkStart: 0,
  daily: null, dailyEmd: null, last: null, lastUnit: null, settings: { autoNext: false }, homeRegion: null, bests: {}, bestUnits: {},
  today: () => T, save() {}, go() {}, back() {}, render() {}, toast() {},
  ...o,
}) as Ctx;
const knownOf = (r: Registry): Known => {
  const idx = (k: string) => (r.region(k) ? undefined : r.unit(k)?.index);
  return {
    region: (k) => !!r.region(k),
    lesson: (rg, n) => !!r.lesson(rg, n) || (n >= 1 && n <= (idx(rg)?.lessons ?? 0)),
    slug: (rg, s) => !!r.bySlug(rg, s) || !!idx(rg)?.ids.includes(s),
    emd: (k) => r.emdUnits(k).length > 0,
    unit: (k) => !!r.unit(k) || !!r.region(k)?.unit,
  };
};

test('지역 표·판: 부산은 공개(status live)·동 단원 live·일반구 없음, 판 units.json 은 원고와 같은 16곳·4과·넓은 화면 2개', () => {
  assert.deepEqual([SIDO.status, SIDO.emd, SIDO.gu, SIDO.layer, SIDO.lineRequired, SIDO.enChecked, SIDO.en], ['live', 'live', 'off', 'sgg', true, true, 'Busan']);
  assert.ok(SIDO.hub, '정적 허브 쪽이 있다(2026-11-19 시·도 허브 13곳)');
  const b = reg.region('busan')!;
  assert.deepEqual([b.items.length, b.lessons.length, b.screens.length, b.layer], [16, 4, 2, 'sgg']);
  // 원고와 같은 과 구성·이름·곳 차례(만나기 차례)
  assert.deepEqual(b.lessons.map((l) => [l.no, l.title, l.en, l.items.map((id) => reg.place(id)!.item.ko)]),
    SRC.lessons.map((l: { no: number; title: string; en: string; items: string[] }) => [l.no, l.title, l.en, l.items]));
  assert.deepEqual(b.screens.map((s) => [s.key, s.ko, s.items.map((id) => reg.place(id)!.item.ko)]),
    SRC.screens.map((s: { key: string; ko: string; items: string[] }) => [s.key, s.ko, s.items]));
  // slug: 원고 그대로, 세 글자 이상·지역 안에서 겹치지 않음(확인 목록 4)
  for (const it of b.items) {
    assert.equal(it.slug, SRC.slugs[it.ko], it.ko);
    assert.match(it.slug, /^[a-z][a-z0-9-]{2,}$/);
  }
  assert.equal(new Set(b.items.map((it) => it.slug)).size, 16);
  // 16px(과 화면·넓은 화면), 1곳 과 없음, 과 이름 12자 이하·지역 안에서 겹치지 않음·행정 용어 없음(N7)
  for (const l of b.lessons) {
    assert.ok(l.minTapPx >= 16, `${l.no}과 ${l.minTapPx}px`);
    assert.ok(l.items.length >= 3 && l.items.length <= 6, `${l.no}과 ${l.items.length}곳`);
    assert.ok(l.title.length <= 12 && !/권역|도심/.test(l.title), l.title);
  }
  assert.equal(new Set(b.lessons.map((l) => l.title)).size, 4);
  for (const s of b.screens) assert.ok(s.minTapPx >= 16, `${s.ko} ${s.minTapPx}px`);
  // 곳 id 는 부산 시·도 코드(26)의 시·군·구 코드
  for (const it of b.items) assert.match(it.id, /^kr:sgg:26\d{3}$/);
});

test('위치 한 줄(N27): 16곳 모두 원고 그대로, 30자 이하·금지 낱말 없음, 지도로 잴 수 있는 근거만(명소 없음)', () => {
  const b = reg.region('busan')!;
  for (const it of b.items) {
    const e = LINES[it.ko];
    assert.ok(e, `${it.ko} 원고`);
    assert.equal(it.line, e.line, it.ko);
    assert.ok(e.line.length <= 30, `${it.ko} ${e.line.length}자`);
    for (const w of HARD) assert.ok(!e.line.includes(w), `${it.ko} 금지 낱말 ${w}`);
    assert.equal(e.at, undefined, `${it.ko}: 명소(at)는 OSM 대조 허락 뒤에만`);
    assert.equal(e.manual, undefined, `${it.ko}: 근거 없는 말(manual) 없음`);
    assert.ok(['touch', 'dir', 'side', 'size', 'coast'].some((k) => k in e), `${it.ko} 근거`);
    assert.equal(UI_KO.line(reg, it.id), e.line);
  }
  assert.doesNotMatch(UI_EN.line(reg, b.items[0].id), /[가-힣]/, '영어 위치 한 줄에는 한글이 없다(place-lines-en.json 이 비어 있으면 빈 줄)');
});

test('같은 이름(N12 · E11): 지역이 섞이는 화면(오늘 복습·복습 목록)에서 \'부산 중구\'·\'서울 중구\', 한 지역 화면은 이름만', () => {
  const bj = idOf('중구', 'busan'), sj = idOf('중구', 'seoul'), bg = idOf('강서구', 'busan'), sg = idOf('강서구', 'seoul');
  assert.deepEqual([bj, sj].map((id) => UI_KO.fullName(reg, id)), ['부산 중구', '서울 중구']);
  assert.deepEqual([bg, sg].map((id) => UI_KO.fullName(reg, id)), ['부산 강서구', '서울 강서구']);
  for (const n of ['동구', '서구', '남구', '북구']) assert.equal(UI_KO.fullName(reg, idOf(n, 'busan')), `부산 ${n}`);
  // 이름이 하나뿐인 곳은 그대로
  assert.equal(UI_KO.fullName(reg, idOf('해운대구')), '해운대구');
  assert.equal(UI_KO.fullName(reg, idOf('종로구')), '종로구');
  // 오늘 복습 문제의 앞 이름('부산 · 중구를 찾아 누르세요')
  assert.deepEqual([UI_KO.fullPre(reg, bj), UI_KO.fullPre(reg, sj), UI_KO.fullPre(reg, idOf('해운대구'))], ['부산', '서울', undefined]);
  // 한 지역 화면(과·만나기·찾기)은 이름만 — 곳 이름(item.ko)은 그대로
  assert.equal(reg.place(bj)!.item.ko, '중구');
  assert.equal(UI_KO.prompt(reg, 'find', bj, (s) => s), '중구를 찾아 누르세요');
  // 영어: 'Jung-gu, Busan' · 앞 이름 'Busan'(관문이 열린 영어 앱 — 시·군·구 이름은 끈 창과 같다)
  const en = createRegistry(geo, EN_ON);
  assert.deepEqual([UI_EN.fullName(createRegistry(geo, EN_OFF), bj), UI_EN.fullPre(createRegistry(geo, EN_OFF), bj)], ['Jung-gu, Busan', 'Busan']);
  assert.deepEqual([UI_EN.fullName(en, bj), UI_EN.fullName(en, sj), UI_EN.fullName(en, idOf('해운대구'))], ['Jung-gu, Busan', 'Jung-gu, Seoul', 'Haeundae-gu']);
  assert.equal(UI_EN.fullPre(en, bj), 'Busan');
  // 부산이 없는 판(E10 까지)에는 붙지 않는다 — 운영 화면이 부산을 열기 전과 같다
  const r0 = createRegistry(geoNoBusan);
  assert.equal(UI_KO.fullName(r0, sj), '중구');
  assert.equal(r0.place(sj)!.item.full, undefined);
  // 원래 데이터는 고치지 않는다(같은 데이터로 여러 레지스트리를 만들어도 섞이지 않음)
  assert.equal(geo.units.regions.find((r) => r.key === 'seoul')!.items.find((it) => it.id === sj)!.full, undefined);
  // 홈 오늘 복습 줄: '서울 중구'
  const m = { [sj]: { box: 1, due: T, hi: 1, streak: 0, grad: false, front: false }, [bj]: { box: 1, due: T, hi: 1, streak: 0, grad: false, front: false } };
  const h = homePage(ctxOf(reg, { mastery: m, last: 'seoul' })).html.replace(/ /g, ' ');
  assert.match(h, /<p class="h-places">서울 중구 · 부산 중구<\/p>/);
});

test('문구: 부산은 \'15구 1군\'·\'구·군\'(군이 하나뿐), 설명 한 줄, 과 카드 수', () => {
  const b = reg.region('busan')!;
  assert.equal(UI_KO.count(b), '15구 1군');
  assert.equal(UI_EN.count(b), '15 districts, 1 county');
  assert.equal(UI_KO.prompt(reg, 'choose', idOf('기장군'), (s) => s), '테두리 친 칸은 무슨 구·군일까요?');
  assert.equal(UI_EN.prompt(reg, 'choose', idOf('기장군'), (s) => s), 'Which county or district is outlined?');
  assert.deepEqual(b.lessons.map((l) => UI_KO.lessonCount(b, l.items)), ['4개 구', '4개 구', '4개 구·군', '4개 구']);
  assert.deepEqual(UI_KO.regionDesc.busan, ['바다에 닿은 곳 10, 닿지 않은 곳 6', '']);
});

test('홈·지역 쪽·지역 고르기·구 고르기: 부산 탭과 쪽에 코드·undefined 없음, 허브 대신 지역 고르기, 동까지 공부하기 링크', async () => {
  const h = homePage(ctxOf(reg, { homeRegion: 'busan' })).html.replace(/ /g, ' ');
  assert.match(h, /data-arg="busan" aria-pressed="true">부산 <span class="u">15구 1군<\/span>/);
  assert.match(h, /<span>첫 과 · 부산 1과<\/span><\/p><h1 class="h-title">부산항 둘레<br><span class="h-hl hl">4개 구<\/span>/);
  assert.match(h, /부산항 둘레/);
  assert.match(h, /href="#\/kr\/busan\/emd"><span>동까지 공부하기<\/span>/);
  assert.match(h, /<a class="h-xl" href="[^"]*busan\/"><span class="h-xt">부산 16개 구·군<\/span>/, '허브 쪽이 있으면 그 허브로');
  assert.doesNotMatch(h, BAD);
  // 탭: E11 은 네 지역 모두(N22 — 지역 4곳 이하)였다. E12 부터 지역이 여덟이라 접힌다 — 처음 온 사람의 탭은 공개 차례(서울·인천·경기, 지역 표 openOrder)이고,
  // 부산을 고르면(지역 고르기·'다른 지역') 셋째 자리에 들어간다(앞 두 탭은 그대로 — 누른 자리 밑에서 탭이 바뀌지 않게, E11)
  assert.deepEqual([...h.matchAll(/data-act="homeRegion" data-arg="([a-z-]+)"/g)].map((x) => x[1]), ['seoul', 'incheon', 'busan']);
  assert.match(h, /h-tab go/);
  // E11 판(네 지역 — E12 의 네 지역을 뺀 판)이면 그때처럼 네 지역 모두
  const h11 = homePage(ctxOf(createRegistry(geoNoE12), { homeRegion: 'busan' })).html;
  assert.deepEqual([...h11.matchAll(/data-act="homeRegion" data-arg="([a-z-]+)"/g)].map((x) => x[1]), ['seoul', 'busan', 'incheon', 'gyeonggi']);
  assert.doesNotMatch(h11, /h-tab go/);
  // 과 카드 짧은 이름: 한 글자가 되는 이름(중구·서구·동구)은 줄이지 않는다
  assert.match(h, /<span class="pl">중구 · 서구 · 동구 · 영도<\/span>/);
  const u = unitPage(ctxOf(reg), 'busan').html;
  for (const t of ['부산항 둘레', '가운데와 북쪽', '동쪽 바닷가', '낙동강 둘레']) assert.match(u, new RegExp(t));
  assert.doesNotMatch(u, BAD);
  assert.doesNotMatch(regionsPage(ctxOf(reg)).html, BAD);
  const p = pickPage(ctxOf(reg), 'busan');
  assert.equal(p.maps!.pick.labels!.length, 16);
  assert.doesNotMatch(p.html, BAD);
  // 영어 화면도(관문이 열린 영어 앱 — EN_EMD)
  setLang('en');
  try {
    const en = createRegistry(geo, EN_ON);
    const e = homePage(ctxOf(en, { homeRegion: 'busan' })).html;
    assert.match(e, /data-arg="busan" aria-pressed="true">Busan <span class="u">15 districts, 1 county<\/span>/);
    assert.match(e, /Around Busan Port/);
    assert.doesNotMatch(e, BAD);
    assert.doesNotMatch(e, /[가-힣]{2,}구/, '영어 홈에 한글 곳 이름이 없음');
    assert.doesNotMatch(unitPage(ctxOf(en), 'busan').html, BAD);
  } finally { setLang('ko'); }
});

test('주소·GA·고르기 보기: #/kr/busan 과 동 단원 주소가 열리고, GA region 은 busan, 고르기 보기는 부산 안에서만', async () => {
  const k = knownOf(reg);
  assert.deepEqual(parseRoute('#/kr/busan', '', k).route, { name: 'unit', region: 'busan' });
  assert.deepEqual(parseRoute('#/kr/busan/sgg/p4', '', k).route, { name: 'lesson', region: 'busan', no: 4 });
  assert.deepEqual(parseRoute('#/kr/busan/sgg/@haeundae-gu', '', k).route, { name: 'place', region: 'busan', slug: 'haeundae-gu' });
  assert.deepEqual(parseRoute('#/kr/busan/emd', '', k).route, { name: 'emd', region: 'busan' });
  assert.deepEqual(parseRoute('#/kr/busan/emd/haeundae-gu/p1', '', k).route, { name: 'lesson', region: 'busan/haeundae-gu', no: 1 });
  assert.equal(parseRoute('#/kr/busan/sgg/p5', '', k).route.name, 'home');
  assert.deepEqual(gaUnit(reg, 'busan'), { unit: 'sgg', region: 'busan' });
  // 동 단원(해운대구 26350)을 받아 등록하면 GA unit emd · unit_id 26350 · region busan
  const r = createRegistry(geo);
  const failed = await registerUnits(r, ['busan/haeundae-gu'], async (code) => busanFile(code), () => {});
  assert.deepEqual(failed, []);
  assert.equal(r.region('busan/haeundae-gu')?.items.length, 18);
  assert.deepEqual(gaArgs(r, 'busan/haeundae-gu'), { unit: 'emd', region: 'busan', unit_id: '26350' });
  assert.deepEqual(lessonCompleteParams(r, 'busan', 1, 3, 4), { unit: 'sgg', region: 'busan', lesson: 1, first_try: 3, total: 4 });
  // 고르기 보기: 같은 지역(부산) 안에서만 — 서울 중구가 섞이지 않는다
  const b = reg.region('busan')!;
  for (let seed = 1; seed <= 20; seed++) for (const l of b.lessons) for (const q of lessonQuestions(reg, 'busan', l.no, () => 0, rngFrom(seed))) {
    for (const o of q.options ?? []) assert.equal(reg.place(o)!.region.key, 'busan');
  }
  assert.equal(chooseOptions(reg, idOf('중구', 'busan'), 3, rngFrom(3)).every((o) => o.startsWith('kr:sgg:26')), true);
});

test('동 단원(부산 16단원 206동): 색인 = 판 폴더 파일, 2곳 과는 연제구 하나(연산 숫자 가족 8곳을 6+2 로 나눔) · 섞인 화면의 단원 이름은 \'부산 중구\'', async () => {
  const idx = geo.units.emdUnits!.busan;
  assert.equal(idx.length, 16);
  assert.equal(idx.reduce((t, u) => t + u.n, 0), 206);
  const small: string[] = [];
  for (const u of idx) {
    const j = busanFile(u.code);
    assert.equal(j.key, `busan/${u.slug}`);
    assert.equal(u.slug, SRC.slugs[u.ko], `${u.ko} 단원 slug = 지역 slug`);
    for (const l of j.lessons) if (l.items.length < 3) small.push(`${j.ko} ${l.no}과 ${l.items.length}곳`);
  }
  assert.deepEqual(small, ['연제구 3과 2곳']);
  // 같은 이름 단원(중구·동구·서구·남구·북구·강서구)은 오늘 복습·복습 목록에서 '부산 중구'(단원 파일을 받기 전에도 동 색인으로)
  const r = createRegistry(geo);
  assert.deepEqual([r.mixName('busan/jung-gu'), r.mixName('busan/haeundae-gu'), r.mixName('seoul/jung-gu'), r.mixName('seoul/jongno-gu'), r.mixName('busan')],
    ['부산 중구', '해운대구', '서울 중구', '종로구', '부산']);
  await registerUnits(r, ['busan/jung-gu'], async (code) => busanFile(code), () => {});
  const dong = r.region('busan/jung-gu')!.items[0];
  assert.equal(UI_KO.fullName(r, dong.id), `부산 중구 ${dong.ko}`);
  assert.equal(r.region('busan/jung-gu')!.ko, '중구', '단원 쪽(한 단원 화면) 이름은 그대로');
});

test('운영 형식 저장값(세 지역 기록만 — 부산 기록 없음): 이어 하기·홈 카드·오늘 복습·내일 수가 부산이 없는 판(E10)과 같다 — 다른 것은 다 채움의 남은 지역뿐(공통 조건 3)', () => {
  // 저장소에 있는 그대로의 JSON 글(kgq_mastery_v1·kgq_deck_v1·kgq_deck2_v1·kgq_daily_v1·kgq_last_v1)을 앱의 검사로 읽는다
  const L = (key: string, no: number) => geo.units.regions.find((r) => r.key === key)!.lessons[no - 1].items;
  const rec = (box: number, due: number | null, o: Partial<Rec> = {}): Rec => ({ box, due, hi: box >= 5 ? 3 : box >= 3 ? 2 : box >= 1 ? 1 : 0, streak: 0, grad: false, front: false, ...o });
  const m: Mastery = {};
  L('seoul', 1).forEach((id) => { m[id] = rec(2, T); });
  L('seoul', 2).forEach((id, i) => { m[id] = rec(5, null, { grad: i < 2, streak: i < 2 ? 2 : 0 }); });
  L('incheon', 1).forEach((id) => { m[id] = rec(3, T + 1); });
  L('gyeonggi', 1).forEach((id, i) => { m[id] = rec(1, i % 2 ? T : T - 3); });
  L('gyeonggi', 3).forEach((id) => { m[id] = rec(4, T + 4); });
  const q3 = L('seoul', 3);
  const deck = { v: 1, kind: 'lesson', region: 'seoul', lesson: 3, seed: 7, queue: Array.from({ length: 23 }, (_, i) => ({ mode: i < q3.length ? 'meet' : 'find', id: q3[i % q3.length] })), pos: 7, log: [], retries: {}, missed: [], toLearn: [], placed: [], right: {} };
  const deck2 = { v: 1, kind: 'review', region: null, lesson: null, seed: 9, queue: L('gyeonggi', 1).slice(0, 4).map((id) => ({ mode: 'find', id, scope: 'lesson' })), pos: 1, log: [], retries: {}, missed: [], toLearn: [], placed: [], right: {} };
  const data = new Map<string, string>();
  const kv: KV = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: (k) => { data.delete(k); } };
  const K = keys();
  data.set(K.mastery, JSON.stringify(m));
  data.set(K.deck, JSON.stringify(deck));
  data.set(K.deck2, JSON.stringify(deck2));
  data.set(K.daily, JSON.stringify({ day: T, n: 3 }));
  data.set(K.last, JSON.stringify('seoul'));
  const s = openStore(kv);
  const mastery = s.read(K.mastery, checkMastery)!, daily = s.read(K.daily, checkDaily), last = s.read(K.last, checkLast);
  const d1raw = s.read(K.deck, checkDeck), d2raw = s.read(K.deck2, checkDeck);
  const r0 = createRegistry(geoNoBusan);
  const both = [reg, r0];
  // 이어 할 판 둘 다 산다(부산이 생겨도 옛 판을 버리지 않는다)
  for (const r of both) assert.ok(usableDeck(r, d1raw) && usableDeck(r, d2raw), '이어 할 판');
  assert.deepEqual(usableDeck(reg, d1raw), usableDeck(r0, d1raw));
  assert.deepEqual(usableDeck(reg, d2raw), usableDeck(r0, d2raw));
  // 홈 카드(이어 하기·복습·다음 과)·오늘 복습·내일 수: 상태 여럿에서 두 판이 같다
  const all: Mastery = Object.fromEntries(['seoul', 'incheon', 'gyeonggi'].flatMap((k) => geo.units.regions.find((r) => r.key === k)!.items.map((it) => [it.id, rec(3, T + 4)])));
  const states: [Mastery, typeof d1raw, string | null, number][] = [
    [mastery, usableDeck(reg, d1raw), last, 3], [mastery, usableDeck(reg, d2raw), 'gyeonggi', 3], [mastery, null, last, 3],
    [mastery, null, 'gyeonggi', 25], [mastery, null, 'incheon', 0], [{}, null, null, 0], [all, null, 'seoul', 0],
    [Object.fromEntries(L('incheon', 1).map((id) => [id, rec(2, T + 2)])), null, 'incheon', 0],
  ];
  const types: string[] = [];
  for (const [mm, d, lst, n] of states) {
    const dl = { day: T, n };
    const a = homeCard({ reg, mastery: mm, deck: d, daily: dl, last: lst, today: T }), b = homeCard({ reg: r0, mastery: mm, deck: d, daily: dl, last: lst, today: T });
    if (a.type === 'done' && b.type === 'done') {
      // 다 채움 카드의 '남은 지역'에만 부산(과 그 뒤에 연 지역 — 공개 차례 4 이상, 비교 판 geoNoBusan 은 E10 판)이 든다(의도 — 다 칠한 사람에게 새 지역을 권함)
      assert.deepEqual([a.region, a.more.filter((k) => !OPENED_SINCE(4).includes(k))], [b.region, b.more]);
      assert.ok(a.more.includes('busan'));
    } else assert.deepEqual(a, b, `${a.type} ${lst} ${n}`);
    types.push(a.type);
    assert.deepEqual(todayReview(reg, mm, T, n), todayReview(r0, mm, T, n));
    assert.equal(tomorrowCount(reg, mm, T), tomorrowCount(r0, mm, T));
  }
  // 상태들이 카드 종류를 고루 지난다(처음·이어 하기·복습·다음 과·다 채움)
  assert.deepEqual([...new Set(types)].sort(), ['done', 'new', 'next', 'resume', 'review']);
  // 저장된 값의 숫자(E3 이후 같은 기준값 — emd-core 시험과 같은 상태)
  assert.deepEqual(homeCard({ reg, mastery, deck: usableDeck(reg, d1raw), daily, last, today: T }), { type: 'resume', kind: 'lesson', region: 'seoul', lesson: 3, n: 8, total: 23, review: 10 });
  assert.equal(tomorrowCount(reg, mastery, T), 15);
});
