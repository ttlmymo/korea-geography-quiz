// 대구·대전·울산·세종(계획서 NATIONWIDE_PLAN E12 — 새 시·도 둘째 묶음): 지역 표 → 파이프라인 → 판 units.json → 앱이 네 지역에서 도는지 본다.
// 이 단계에서 따로 볼 것(계획서 E11~E16 단계별 추가 사항 E12 줄): 과가 하나뿐인 지역(대전·울산)의 홈 과 카드 줄, 과 없는 지역 세종(N4)의 홈,
// 중구·동구·서구·남구·북구가 여러 도시에 섞인 복습 표기('대구 중구'). 그 밖에 E12 에서 정한 것: 구·군 차례(지역 표 gunFirst — 대구 '7구 2군'),
// 홈 탭이 넘칠 때 빈자리를 채우는 공개 차례(지역 표 openOrder — 서울·인천·경기). 동 단원 전수(파일·등록·16px·1곳 과·40KB)는 emd-units.test 가 본다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { DATA_VER } from '../../src/consts.ts';
import { lessonQuestions } from '../../src/app/core/questions.ts';
import { rngFrom } from '../../src/app/core/rng.ts';
import type { Mastery, Rec } from '../../src/app/core/mastery.ts';
import { homeCard, todayReview } from '../../src/app/core/next.ts';
import { usableDeck } from '../../src/app/core/session.ts';
import { tomorrowCount } from '../../src/app/core/tally.ts';
import { gaArgs, gaUnit, registerUnits } from '../../src/app/core/units.ts';
import { createRegistry, type Registry } from '../../src/app/registry.ts';
import { parseRoute, type Known } from '../../src/app/router.ts';
import { sidoOf } from '../../src/app/sidos.ts';
import { checkDaily, checkDeck, checkLast, checkMastery, keys, openStore, type KV } from '../../src/app/store.ts';
import { guFirst, unitWordKo } from '../../src/app/text/ko.ts';
import { UI_EN, UI_KO, setLang } from '../../src/app/text/ui.ts';
import type { EmdUnitFile, Region } from '../../src/app/types.ts';
import type { Ctx } from '../../src/app/ui/ctx.ts';
import { homePage, pickPage, regionsPage, unitPage } from '../../src/app/ui/pages.ts';
import { EN_OFF, EN_ON, E12_KEYS, OFF_KEY, OPENED_SINCE, geo, geoNoE12, geoNoE13, reg, idOf } from './fixtures.ts';

const T = 20000;
const root = path.join(import.meta.dirname, '../..');
const dir = path.join(root, 'public/data/geo', DATA_VER);
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const SIDO = (k: string) => read('src/data/sido.json').sidos.find((s: { key: string }) => s.key === k);
const SRC = (k: string) => read('src/data/units.json').regions.find((r: { key: string }) => r.key === k);
const LINES = read('src/data/place-lines.json');
const HARD: string[] = read('src/data/hard-words.json').words;
const unitFile = (code: string): EmdUnitFile => JSON.parse(fs.readFileSync(path.join(dir, 'emd', `${code}.json`), 'utf8'));
const BAD = /undefined|NaN|kr:(sgg|emd|sido):|\[object/;
const tabKeys = (h: string) => [...h.matchAll(/data-act="homeRegion" data-arg="([a-z-]+)"/g)].map((x) => x[1]);
const pressed = (h: string) => /data-arg="([a-z-]+)" aria-pressed="true"/.exec(h)?.[1];
const sp = (h: string) => h.replace(/\u00a0/g, ' ');   // 붙임 빈칸(NBSP)을 보통 빈칸으로
const rec = (box: number, due: number | null, o: Partial<Rec> = {}): Rec => ({ box, due, hi: box >= 5 ? 3 : box >= 3 ? 2 : box >= 1 ? 1 : 0, streak: 0, grad: false, front: false, ...o });
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
    main: (k) => r.region(k)?.layer === 'emd',
  };
};
const CODE: Record<string, string> = { daegu: '27', daejeon: '30', ulsan: '31', sejong: '36' };

test('지역 표·판: 네 지역 공개(status·emd live), 판 units.json 은 원고와 같은 곳·과·넓은 화면 — 대구 9곳 3과 화면 2 · 대전·울산 5곳 1과 · 세종은 과 없는 지역', () => {
  for (const [k, order] of [['daegu', 5], ['daejeon', 6], ['ulsan', 7], ['sejong', 8]] as const) {
    const s = SIDO(k);
    assert.deepEqual([s.status, s.emd, s.gu, s.enChecked, Boolean(s.hub), s.openOrder, s.gunFirst], ['live', 'live', 'off', true, true, order, false], k);
    assert.equal(s.lineRequired, k !== 'sejong', `${k} 위치 한 줄 필수(세종은 시·군·구 과가 없어 쓰지 않음)`);
  }
  assert.deepEqual(['daegu', 'daejeon', 'ulsan', 'sejong'].map((k) => SIDO(k).en), ['Daegu', 'Daejeon', 'Ulsan', 'Sejong']);
  const shape = (k: string) => { const r = reg.region(k)!; return [r.layer, r.items.length, r.lessons.length, r.screens.length]; };
  assert.deepEqual(['daegu', 'daejeon', 'ulsan', 'sejong'].map(shape), [['sgg', 9, 3, 2], ['sgg', 5, 1, 1], ['sgg', 5, 1, 1], ['emd', 1, 0, 0]]);
  for (const k of ['daegu', 'daejeon', 'ulsan']) {
    const r = reg.region(k)!, src = SRC(k);
    // 원고와 같은 과 구성·이름·곳 차례(만나기 차례)
    assert.deepEqual(r.lessons.map((l) => [l.no, l.title, l.en, l.items.map((id) => reg.place(id)!.item.ko)]),
      src.lessons.map((l: { no: number; title: string; en: string; items: string[] }) => [l.no, l.title, l.en, l.items]), k);
    // slug: 원고 그대로, 세 글자 이상·지역 안에서 겹치지 않음(확인 목록 4)
    for (const it of r.items) { assert.equal(it.slug, src.slugs[it.ko], it.ko); assert.match(it.slug, /^[a-z][a-z0-9-]{2,}$/); }
    assert.equal(new Set(r.items.map((it) => it.slug)).size, r.items.length);
    // 16px(과 화면·넓은 화면), 과는 3~6곳, 과 이름 12자 이하·행정 용어 없음·지역 안에서 겹치지 않음(N7)
    for (const l of r.lessons) {
      assert.ok(l.minTapPx >= 16, `${k} ${l.no}과 ${l.minTapPx}px`);
      assert.ok(l.items.length >= 3 && l.items.length <= 6, `${k} ${l.no}과 ${l.items.length}곳`);
      assert.ok(l.title.length <= 12 && !/권역|도심/.test(l.title), l.title);
    }
    assert.equal(new Set(r.lessons.map((l) => l.title)).size, r.lessons.length);
    for (const s of r.screens) assert.ok(s.minTapPx >= 16, `${k} ${s.ko} ${s.minTapPx}px`);
    for (const it of r.items) assert.match(it.id, new RegExp(`^kr:sgg:${CODE[k]}\\d{3}$`));
  }
  // 대구 넓은 화면: 북쪽(2과와 같은 곳)·남쪽 — 한 화면이면 중구가 12px(16px 미만)
  assert.deepEqual(reg.region('daegu')!.screens.map((s) => [s.key, s.ko, s.items.map((id) => reg.place(id)!.item.ko)]),
    SRC('daegu').screens.map((s: { key: string; ko: string; items: string[] }) => [s.key, s.ko, s.items]));
  // 과 이름: 대전·울산은 한 과('…한눈에' — '전체'를 쓰면 지역 쪽 '2과 대전 전체 연습'과 헷갈린다), 대구는 '중구 둘레'·'북쪽'·'남쪽'
  assert.deepEqual(['daegu', 'daejeon', 'ulsan'].map((k) => reg.region(k)!.lessons.map((l) => l.title)), [['중구 둘레', '북쪽', '남쪽'], ['대전 한눈에'], ['울산 한눈에']]);
  // 세종: 칸은 세종시 하나(지역 지도·동 단원 slug), 곳으로 등록하지 않는다(공부는 동 단원 — N4)
  const sj = reg.region('sejong')!;
  assert.deepEqual(sj.items.map((it) => [it.id, it.ko, it.slug]), [['kr:sgg:36110', '세종시', 'sejong-si']]);
  assert.equal(reg.place('kr:sgg:36110'), undefined);
  assert.deepEqual(SRC('sejong').lessons, []);
});

test('위치 한 줄(N27): 대구 9·대전 5·울산 5곳 — 원고 그대로, 30자 이하·금지 낱말 없음, 지도 근거만(명소 없음) · 세종은 없음', () => {
  let n = 0;
  for (const k of ['daegu', 'daejeon', 'ulsan']) {
    for (const it of reg.region(k)!.items) {
      const e = LINES[k][it.ko];
      assert.ok(e, `${k} ${it.ko} 원고`);
      assert.equal(it.line, e.line, it.ko);
      assert.ok(e.line.length <= 30, `${it.ko} ${e.line.length}자`);
      for (const w of HARD) assert.ok(!e.line.includes(w), `${it.ko} 금지 낱말 ${w}`);
      assert.equal(e.at, undefined, `${it.ko}: 명소(at)는 OSM 대조 허락 뒤에만`);
      assert.equal(e.manual, undefined, `${it.ko}: 근거 없는 말(manual) 없음`);
      assert.ok(['touch', 'dir', 'side', 'size', 'coast'].some((x) => x in e), `${it.ko} 근거`);
      assert.equal(UI_KO.line(reg, it.id), e.line);
      n++;
    }
  }
  assert.equal(n, 19);
  assert.equal(LINES.sejong, undefined);
  assert.doesNotMatch(UI_EN.line(reg, idOf('군위군')), /[가-힣]/, '영어 위치 한 줄에는 한글이 없다(place-lines-en.json 이 비어 있으면 빈 줄)');
  // 다른 시·도와 맞닿은 근거는 시·도 이름으로(세종과 맞닿은 대전 유성구 — 세종도 이번에 연 공개 지역)
  assert.deepEqual(LINES.daejeon['유성구'].touch, ['세종특별자치시']);
  assert.deepEqual(LINES.ulsan['울주군'].touch, ['부산광역시']);
});

test('구·군 차례(E12 — 지역 표 gunFirst): 대구 7구 2군·울산 4구 1군·부산 15구 1군은 구를 먼저, 인천만 2군 9구 · 대전 5개 구 · 설명 한 줄', () => {
  const R = (k: string) => reg.region(k)!;
  assert.deepEqual(['daegu', 'daejeon', 'ulsan', 'busan', 'incheon'].map((k) => UI_KO.count(R(k))), ['7구 2군', '5개 구', '4구 1군', '15구 1군', '2군 9구']);
  assert.deepEqual(['daegu', 'daejeon', 'ulsan'].map((k) => UI_EN.count(R(k))), ['7 districts, 2 counties', '5 districts', '4 districts, 1 county']);
  assert.equal(UI_KO.prompt(reg, 'choose', idOf('군위군'), (s) => s), '테두리 친 칸은 무슨 구·군일까요?');
  assert.equal(UI_KO.prompt(reg, 'choose', idOf('유성구'), (s) => s), '테두리 친 칸은 무슨 구일까요?');
  assert.equal(UI_KO.prompt(reg, 'choose', idOf('울주군'), (s) => s), '테두리 친 칸은 무슨 구·군일까요?');
  assert.equal(UI_KO.prompt(reg, 'choose', idOf('옹진군'), (s) => s), '테두리 친 칸은 무슨 군·구일까요?');
  assert.deepEqual(R('daegu').lessons.map((l) => UI_KO.lessonCount(R('daegu'), l.items)), ['3개 구', '3개 구·군', '3개 구·군']);
  assert.deepEqual([UI_KO.lessonCount(R('daejeon'), R('daejeon').lessons[0].items), UI_KO.lessonCount(R('ulsan'), R('ulsan').lessons[0].items)], ['5개 구', '5개 구·군']);
  // 이름만으로는 대구(군 둘, '구·군')와 인천(군 둘, '군·구')을 가를 수 없어 지역 표 칸으로 정한다
  const names = ['중구', '동구', '군위군', '달성군'];
  assert.deepEqual([guFirst(names, 'daegu'), guFirst(names, 'incheon'), guFirst(names, 'incheon/ongjin-gun'), guFirst(['수원시', '가평군', '장안구'], 'gyeonggi')], [true, false, false, false]);
  assert.equal(sidoOf('incheon')!.gunFirst, true);
  // 구 고르기 단위 말: 대구 동 단원(9) '구·군', 인천 '군·구'
  assert.equal(unitWordKo(reg.emdUnits('daegu').map((u) => u.index.ko), 'daegu'), '구·군');
  assert.equal(unitWordKo(reg.emdUnits('incheon').map((u) => u.index.ko), 'incheon'), '군·구');
  // 지역 고르기·홈 지도 아래 한 줄(지도로 확인한 사실 — 검수 표 docs/review/<지역>.md)
  assert.deepEqual(['daegu', 'daejeon', 'ulsan', 'sejong'].map((k) => UI_KO.regionDesc[k][0]), ['중구를 북구·서구·남구·수성구가 둘러쌈', '세종·충북·충남에 둘러싸인 곳', '바다에 닿은 곳 4, 닿지 않은 곳 1', '구·군 없이 1읍 9면 15동']);
  // 대구 중구의 이웃은 대구의 여섯 구뿐(군·다른 시·도 없음)
  assert.deepEqual(reg.neighborsOf(idOf('중구', 'daegu')).map((id) => reg.place(id)!.item.ko).sort(), ['남구', '달서구', '동구', '북구', '서구', '수성구']);
  // 대전의 바깥 이웃은 세종·충북·충남(판 이웃은 공개 지역 곳만 — 다른 시·도 칸은 이웃 땅이라 세종 칸만 보인다)
  assert.ok(reg.neighborsOf(idOf('유성구')).includes('kr:sgg:36110'));
});

test('같은 이름(N12): 지역이 섞이는 화면(오늘 복습·복습 목록)에서 대구 중구·대전 중구·울산 중구, 한 지역 화면은 이름만', async () => {
  const j = (k: string) => idOf('중구', k);
  assert.deepEqual(['seoul', 'busan', 'daegu', 'daejeon', 'ulsan'].map((k) => UI_KO.fullName(reg, j(k))), ['서울 중구', '부산 중구', '대구 중구', '대전 중구', '울산 중구']);
  for (const [n, k] of [['동구', 'daegu'], ['서구', 'daegu'], ['남구', 'daegu'], ['북구', 'daegu'], ['동구', 'daejeon'], ['서구', 'daejeon'], ['남구', 'ulsan'], ['동구', 'ulsan'], ['북구', 'ulsan']] as const)
    assert.equal(UI_KO.fullName(reg, idOf(n, k)), `${sidoOf(k)!.ko} ${n}`);
  // 이름이 하나뿐인 곳은 그대로
  for (const n of ['수성구', '달서구', '달성군', '군위군', '유성구', '대덕구', '울주군']) assert.equal(UI_KO.fullName(reg, idOf(n)), n);
  assert.deepEqual([UI_KO.fullPre(reg, j('daegu')), UI_KO.fullPre(reg, j('ulsan')), UI_KO.fullPre(reg, idOf('수성구'))], ['대구', '울산', undefined]);
  // 한 지역 화면(과·만나기·찾기)은 이름만
  assert.equal(UI_KO.prompt(reg, 'find', j('daegu'), (s) => s), '중구를 찾아 누르세요');
  // 홈 오늘 복습 줄(지역 차례 → 곳 차례)
  const m: Mastery = Object.fromEntries([j('seoul'), j('daegu'), j('daejeon'), idOf('남구', 'ulsan'), idOf('수성구')].map((id) => [id, rec(1, T)]));
  const h = sp(homePage(ctxOf(reg, { mastery: m, last: 'seoul' })).html);
  assert.match(h, /<p class="h-places">서울 중구 · 대구 중구 · 수성구 · 대전 중구 · 울산 남구<\/p>/);
  // 영어: 'Jung-gu, Daegu'(관문이 열린 영어 앱 — 시·군·구 이름은 끈 창과 같다)
  const en = createRegistry(geo, EN_ON);
  assert.deepEqual([UI_EN.fullName(en, j('daegu')), UI_EN.fullName(en, j('daejeon')), UI_EN.fullName(en, idOf('수성구'))], ['Jung-gu, Daegu', 'Jung-gu, Daejeon', 'Suseong-gu']);
  // 동 단원 이름(섞인 화면): '대구 중구 삼덕동' — 단원 파일을 받기 전에도 동 색인으로
  const r = createRegistry(geo);
  assert.deepEqual(['daegu/jung-gu', 'daejeon/jung-gu', 'ulsan/buk-gu', 'daegu/suseong-gu', 'sejong/sejong-si'].map((k) => r.mixName(k)), ['대구 중구', '대전 중구', '울산 북구', '수성구', '세종시']);
  await registerUnits(r, ['daegu/jung-gu'], async (code) => unitFile(code), () => {});
  const dong = r.region('daegu/jung-gu')!.items[0];
  assert.equal(UI_KO.fullName(r, dong.id), `대구 중구 ${dong.ko}`);
  assert.equal(r.region('daegu/jung-gu')!.ko, '중구', '단원 쪽(한 단원 화면) 이름은 그대로');
});

test('홈: 처음 온 사람 탭은 공개 차례(서울·인천·경기 + 다른 지역 +6) · 과가 하나뿐인 대전·울산의 과 카드 줄 · 대전을 다 칠하면 다 채움', () => {
  // E12 운영 판(여덟 지역 — geoNoE13). E13 부터 운영 판은 열두 지역이라 탭 '다른 지역' 수와 남은 지역이 다르다(e13-region 시험)
  const reg = createRegistry(geoNoE13);
  const h = sp(homePage(ctxOf(reg)).html);
  assert.deepEqual(tabKeys(h), ['seoul', 'incheon', 'gyeonggi']);
  assert.match(h, /<a class="h-tab go" href="#\/kr">다른 지역 <span class="u" aria-hidden="true">\+6<\/span>/);
  for (const [k, cnt, title] of [['daejeon', '5개 구', '대전 한눈에'], ['ulsan', '4구 1군', '울산 한눈에']] as const) {
    const hk = sp(homePage(ctxOf(reg, { last: k })).html);
    // 마지막 지역(탭)이 셋 밖이면 셋째 자리에 — 서울·인천 + 그 지역
    assert.deepEqual([tabKeys(hk), pressed(hk)], [['seoul', 'incheon', k], k]);
    assert.match(hk, new RegExp(`data-arg="${k}" aria-pressed="true">${sidoOf(k)!.ko} <span class="u">${cnt}</span>`));
    assert.match(hk, new RegExp(`<span>첫 과 · ${sidoOf(k)!.ko} 1과</span>`));
    assert.match(hk, new RegExp(`<h1 class="h-title">${title}<br>`));
    // 과 카드 줄: 카드 하나(g1), 제목 '대전 한 과'
    assert.match(hk, /<ol class="h-lcs g1">/);
    assert.equal((hk.match(/<li class="h-lc/g) ?? []).length, 1);
    assert.match(hk, new RegExp(`<h2 id="h-path">${sidoOf(k)!.ko} 한 과</h2>`));
    assert.match(hk, new RegExp(`href="#/kr/${k}/emd"><span>동까지 공부하기</span>`));
    assert.doesNotMatch(hk, BAD);
  }
  // 대전 1과를 마치면 대전 전체를 칠한 것 — 다 채움 카드(남은 지역 권함)
  const dm: Mastery = Object.fromEntries(reg.region('daejeon')!.items.map((it) => [it.id, rec(1, T + 1)]));
  const card = homeCard({ reg, mastery: dm, deck: null, daily: null, last: 'daejeon', today: T });
  assert.equal(card.type, 'done');
  assert.ok(card.type === 'done' && card.region === 'daejeon' && card.more.includes('seoul') && !card.more.includes('daejeon'));
  const hd = sp(homePage(ctxOf(reg, { mastery: dm, last: 'daejeon' })).html);
  assert.match(hd, /<h1 class="h-title">대전 <span class="h-hl ok">5개 구<\/span>를 모두 칠했어요<\/h1>/);
  assert.doesNotMatch(hd, BAD);
  // 다 채움 단추 둘(남은 지역 앞 두 곳)은 공개 차례(지역 표 openOrder — 홈 탭과 같은 차례): 대전을 다 칠하면 서울·인천
  const goes = (h: string) => [...h.matchAll(/data-act="homeRegion" data-arg="([a-z-]+)" data-card="done">([^<]+) <span/g)].map((x) => [x[1], x[2]]);
  assert.deepEqual(card.type === 'done' && card.more, ['seoul', 'incheon', 'gyeonggi', 'busan', 'daegu', 'ulsan', 'sejong']);
  assert.deepEqual(goes(hd), [['seoul', '서울 시작'], ['incheon', '인천 시작']]);
  // 서울만 다 칠한 사람(지금 배포판 사용자): 배포판(세 지역)과 같은 '인천 시작 · 경기 시작'(E12 검수 — 지역 표 차례면 '부산 · 대구'로 바뀌었다)
  const sm: Mastery = Object.fromEntries(reg.region('seoul')!.items.map((it) => [it.id, rec(3, T + 4)]));
  const sc = homeCard({ reg, mastery: sm, deck: null, daily: null, last: 'seoul', today: T });
  assert.deepEqual(sc, { type: 'done', region: 'seoul', more: ['incheon', 'gyeonggi', 'busan', 'daegu', 'daejeon', 'ulsan', 'sejong'] });
  const hs = sp(homePage(ctxOf(reg, { mastery: sm, last: 'seoul' })).html);
  assert.deepEqual(goes(hs), [['incheon', '인천 시작'], ['gyeonggi', '경기 시작']]);
  assert.deepEqual([...hs.matchAll(/data-arg="([a-z-]+)" aria-pressed/g)].map((x) => x[1]), ['seoul', 'incheon', 'gyeonggi'], '탭(다 채움 단추 빼고)');
  // 같은 상태를 네 지역이 없는 판(E11)에서 돌려도 단추는 인천·경기(E11 코드는 지역 표 차례라 '부산·인천'이었다 — 검수 표 daegu.md '운영에서 바뀌는 것')
  assert.deepEqual(goes(sp(homePage(ctxOf(createRegistry(geoNoE12), { mastery: sm, last: 'seoul' })).html)), [['incheon', '인천 시작'], ['gyeonggi', '경기 시작']]);
  // 대구 탭: 7구 2군, 1과 '중구 둘레'(3개 구), 과 카드 셋
  const hg = sp(homePage(ctxOf(reg, { last: 'daegu' })).html);
  assert.match(hg, /data-arg="daegu" aria-pressed="true">대구 <span class="u">7구 2군<\/span>/);
  assert.match(hg, /<h1 class="h-title">중구 둘레<br><span class="h-hl hl">3개 구<\/span>/);
  assert.match(hg, /<ol class="h-lcs g3">/);
  // 과 카드 짧은 이름: 한 글자가 되는 이름(중구·서구·남구)은 줄이지 않는다(E11 규칙)
  assert.match(hg, /<span class="pl">중구 · 서구 · 남구<\/span>/);
  assert.doesNotMatch(hg, BAD);
});

test('세종 홈(N4 — 과 없는 지역): 탭은 \'세종 25곳\', 주 구역·지도·과 카드는 주 단원(세종시 다섯 과), 지역 주소는 단원 쪽', async () => {
  const r = createRegistry(geo);
  assert.deepEqual(await registerUnits(r, ['sejong/sejong-si'], async (code) => unitFile(code), () => {}), []);
  const h = sp(homePage(ctxOf(r, { last: 'sejong' })).html);
  assert.deepEqual([tabKeys(h), pressed(h)], [['seoul', 'incheon', 'sejong'], 'sejong']);
  assert.match(h, /data-arg="sejong" aria-pressed="true">세종 <span class="u">25곳<\/span>/);
  assert.match(h, /<span>첫 과 · 세종시 1과<\/span>/);
  assert.match(h, /<h2 id="h-path">세종시 다섯 과<\/h2>/);
  assert.match(h, /구·군 없이 1읍 9면 15동/);
  assert.doesNotMatch(h, BAD);
  // 1과를 칠하면 다음 과(주 단원 세종시의 2과), 홈 탭은 그대로 세종
  const u = r.region('sejong/sejong-si')!;
  const m: Mastery = Object.fromEntries(u.lessons[0].items.map((id) => [id, rec(1, T + 1)]));
  const c = homeCard({ reg: r, mastery: m, deck: null, daily: null, last: 'sejong', lastUnit: 'sejong/sejong-si', today: T });
  assert.deepEqual([c.type, c.type === 'next' && c.region, c.type === 'next' && c.lesson], ['next', 'sejong', 2]);   // 과 없는 지역의 다음 과는 지역 키로(E8 homeCard)
  // 소개 쪽 범위 말(about — 동 단원 파일에서): '25개 읍·면·동'
  assert.equal(UI_KO.count(unitFile('36110') as unknown as Region), '25개 읍·면·동');
  // 단원 쪽(세종시)·지역 고르기 칸
  const up = sp(unitPage(ctxOf(r), 'sejong/sejong-si').html);
  for (const t of ['시내 북서쪽', '읍·면 남쪽']) assert.match(up, new RegExp(t));
  assert.doesNotMatch(up, BAD);
  // 주소: #/kr/sejong 은 지역 주소(main.ts 가 단원 하나면 그 단원 쪽으로), 지역 과·전체 연습 주소는 홈으로, 동 단원 주소는 열림
  const k = knownOf(r);
  assert.deepEqual(parseRoute('#/kr/sejong', '', k).route, { name: 'unit', region: 'sejong' });
  assert.equal(parseRoute('#/kr/sejong/sgg/p1', '', k).route.name, 'home');
  assert.deepEqual(parseRoute('#/kr/sejong/emd/sejong-si/p3', '', k).route, { name: 'lesson', region: 'sejong/sejong-si', no: 3 });
  assert.deepEqual(gaArgs(r, 'sejong/sejong-si'), { unit: 'emd', region: 'sejong', unit_id: '36110' });
  // 동을 끈 창(관문이 닫힌 영어 앱 — 2026-11-16 전 영어 앱, N26)은 세종을 싣지 않는다(동만 있는 지역)
  assert.equal(createRegistry(geo, EN_OFF).region('sejong'), undefined);
  // 관문이 열린 영어 앱은 세종을 싣는다(EN_EMD 1.2): 지역 주소가 그 단원 쪽, 단원 이름 'Sejong-si', 한글·숫자 slug 없음
  const en = createRegistry(geo, EN_ON);
  assert.ok(en.region('sejong'));
  assert.deepEqual(parseRoute('#/kr/sejong', '', knownOf(en)).route, { name: 'unit', region: 'sejong' });
  await registerUnits(en, ['sejong/sejong-si'], async (code) => unitFile(code), () => {});
  setLang('en');
  try {
    const u = unitPage(ctxOf(en), 'sejong/sejong-si').html;
    assert.match(u, /Sejong · Study path/);
    assert.match(u, /<h1 class="h-title">Sejong-si 25 towns, townships and neighborhoods<\/h1>/);
    assert.doesNotMatch(u, /[가-힣]/);
    assert.doesNotMatch(u, BAD);
    assert.equal(UI_EN.unitName(en, 'sejong/sejong-si'), 'Sejong-si');
  } finally { setLang('ko'); }
});

test('지역 고르기(N23, 운영 판 여덟 지역): 권역마다 열린 칸 + 흐린 이름 한 줄 — 충청 대전·세종, 영남 부산·대구·울산', () => {
  // E12 운영 판(여덟 지역 — geoNoE13). 열두 지역 판은 e13-region 시험
  const reg = createRegistry(geoNoE13);
  const p0 = regionsPage(ctxOf(reg));
  const p = { ...p0, html: sp(p0.html) };
  assert.match(p.html, /class="page rg-page"/);
  assert.doesNotMatch(p.html, /rg-more/);
  assert.match(p.html, /시·도 16곳 중 8곳 열림/);
  assert.equal((p.html.match(/<li class="h-lc">/g) ?? []).length, 9);   // 여덟 지역 + 시·도 단원
  assert.deepEqual([...p.html.matchAll(/<h2 id="rg-g\d">([^<]*)<\/h2>/g)].map((x) => x[1]), ['수도권', '강원', '충청', '호남', '영남', '제주']);
  for (const k of ['seoul', 'incheon', 'gyeonggi', 'daejeon', 'sejong', 'busan', 'daegu', 'ulsan', 'korea']) assert.match(p.html, new RegExp(`href="#/kr/${k}"`));
  assert.match(p.html, /<p class="rg-soon"><span>충북 · 충남<\/span><em>준비 중<\/em><\/p>/);
  assert.match(p.html, /<p class="rg-soon"><span>경북 · 경남<\/span><em>준비 중<\/em><\/p>/);
  assert.match(p.html, /<p class="rg-soon only"><span>광주특별시 · 전북<\/span><\/p>/);   // 짧은 이름은 법정 약칭(2026-11-15 — 전에는 '전남광주')
  // 세종 칸: 주 단원 곳 수와 과 수, 한 줄
  assert.match(p.html, /<span class="nm">세종<\/span><span class="no">25곳 · 5과<\/span>\s*<span class="pl">구·군 없이 1읍 9면 15동<\/span>/);
  assert.deepEqual(p.maps!.kr.active, ['11', '26', '27', '28', '30', '31', '36', '41'].map((c) => `kr:sido:${c}`));
  assert.doesNotMatch(p.html, BAD);
  // 영어(관문이 닫힌 영어 앱 — 2026-11-16 전): 세종(동만 있는 지역)과 전남광주(영문 미확인)는 칸이 없다 — 일곱 곳 열림.
  // 관문이 열린 영어 앱은 세종도 연다(여덟 곳 — 한국어와 같음, EN_EMD 1.1 의 D23)
  setLang('en');
  try {
    const e = sp(regionsPage(ctxOf(createRegistry(geoNoE13, EN_OFF))).html);
    assert.match(e, /7 of 16 regions open/);
    assert.doesNotMatch(e, /href="#\/kr\/sejong"/);
    assert.match(e, /href="#\/kr\/daegu"/);
    assert.doesNotMatch(e, BAD);
    const eo = sp(regionsPage(ctxOf(createRegistry(geoNoE13, EN_ON))).html);
    assert.match(eo, /8 of 16 regions open/);
    assert.match(eo, /href="#\/kr\/sejong"/);
    assert.doesNotMatch(eo, /[가-힣]/);
    assert.doesNotMatch(eo, BAD);
    const eh = homePage(ctxOf(createRegistry(geo, EN_ON), { last: 'daegu' })).html;
    assert.match(eh, /data-arg="daegu" aria-pressed="true">Daegu <span class="u">7 districts, 2 counties<\/span>/);
    assert.match(eh, /Around Jung-gu/);
    assert.doesNotMatch(eh, /[가-힣]{2,}구/, '영어 홈에 한글 곳 이름이 없음');
    assert.doesNotMatch(eh, BAD);
    assert.doesNotMatch(unitPage(ctxOf(createRegistry(geo, EN_ON)), 'ulsan').html, BAD);
    // 과 수 머리: 과가 하나인 대전·울산은 단수 'in 1 lesson'(홈 탭·지역 쪽 — E12 검수: 'Daejeon in 1 lessons'), 대구는 복수
    const enReg = createRegistry(geo, EN_ON);
    for (const [k, head] of [['daejeon', 'Daejeon in 1 lesson'], ['ulsan', 'Ulsan in 1 lesson'], ['daegu', 'Daegu in 3 lessons']] as const) {
      assert.match(homePage(ctxOf(enReg, { last: k })).html, new RegExp(`<h2 id="h-path">${head}</h2>`), `${k} 홈`);
      assert.match(unitPage(ctxOf(enReg), k).html, new RegExp(`<h2 id="u-path">${head}</h2>`), `${k} 지역 쪽`);
    }
    assert.equal(UI_EN.lessonsHead('Seoul', 6), 'Seoul in 6 lessons');
  } finally { setLang('ko'); }
});

test('주소·GA·고르기 보기: 새 지역 주소와 동 단원 주소, GA region·unit_id, 고르기 보기는 그 지역 안에서만(대전·울산 한 과 다섯 곳은 보기 넷)', async () => {
  const k = knownOf(reg);
  assert.deepEqual(parseRoute('#/kr/daegu', '', k).route, { name: 'unit', region: 'daegu' });
  assert.deepEqual(parseRoute('#/kr/daegu/sgg/p3', '', k).route, { name: 'lesson', region: 'daegu', no: 3 });
  assert.equal(parseRoute('#/kr/daegu/sgg/p4', '', k).route.name, 'home');
  assert.deepEqual(parseRoute('#/kr/daejeon/sgg/p1', '', k).route, { name: 'lesson', region: 'daejeon', no: 1 });
  assert.equal(parseRoute('#/kr/daejeon/sgg/p2', '', k).route.name, 'home');
  assert.deepEqual(parseRoute('#/kr/ulsan/sgg/@ulju-gun', '', k).route, { name: 'place', region: 'ulsan', slug: 'ulju-gun' });
  assert.deepEqual(parseRoute('#/kr/daegu/emd', '', k).route, { name: 'emd', region: 'daegu' });
  assert.deepEqual(parseRoute('#/kr/daegu/emd/gunwi-gun/p2', '', k).route, { name: 'lesson', region: 'daegu/gunwi-gun', no: 2 });
  if (OFF_KEY) assert.equal(parseRoute(`#/kr/${OFF_KEY}`, '', k).route.name, 'home', '열지 않은 지역(지역 표 차례 첫째 — E13 부터 강원, E14 부터 충남은 열림)');
  assert.deepEqual(['daegu', 'daejeon', 'ulsan'].map((x) => gaUnit(reg, x)), ['daegu', 'daejeon', 'ulsan'].map((x) => ({ unit: 'sgg', region: x })));
  const r = createRegistry(geo);
  assert.deepEqual(await registerUnits(r, ['daegu/gunwi-gun', 'ulsan/ulju-gun'], async (code) => unitFile(code), () => {}), []);
  assert.deepEqual(gaArgs(r, 'daegu/gunwi-gun'), { unit: 'emd', region: 'daegu', unit_id: '27720' });
  assert.deepEqual(gaArgs(r, 'ulsan/ulju-gun'), { unit: 'emd', region: 'ulsan', unit_id: '31710' });
  // 고르기 보기: 같은 지역 안에서만(대구 중구 문제에 서울·부산·대전·울산 중구가 섞이지 않음), 다섯 곳 과는 보기 넷
  for (const key of ['daegu', 'daejeon', 'ulsan']) {
    const R = reg.region(key)!;
    for (let seed = 1; seed <= 20; seed++) for (const l of R.lessons) for (const q of lessonQuestions(reg, key, l.no, () => 0, rngFrom(seed))) {
      for (const o of q.options ?? []) assert.equal(reg.place(o)!.region.key, key);
      if (q.mode === 'choose' && R.items.length >= 4) assert.equal(q.options!.length, 4);
    }
  }
  // 구 고르기(대구 9단원): 코드·undefined 없음, 이름표 9
  const pk = pickPage(ctxOf(reg), 'daegu');
  assert.equal(pk.maps!.pick.labels!.length, 9);
  assert.doesNotMatch(pk.html, BAD);
});

test('동 단원(대구 9·대전 5·울산 5·세종 1단원): 색인 = 판 폴더 파일 · 1곳 과 0 · 2곳 과는 달성군 1과 하나 · 단원 파일 gz 40KB 이하', () => {
  const want: Record<string, [number, number]> = { daegu: [9, 150], daejeon: [5, 82], ulsan: [5, 55], sejong: [1, 25] };
  const small: string[] = [];
  for (const key of E12_KEYS) {
    const idx = geo.units.emdUnits![key];
    assert.deepEqual([idx.length, idx.reduce((t, u) => t + u.n, 0)], want[key], key);
    for (const u of idx) {
      const j = unitFile(u.code);
      assert.equal(j.key, `${key}/${u.slug}`);
      assert.equal(u.slug, SRC(key).slugs[u.ko], `${u.ko} 단원 slug = 지역 slug`);
      assert.deepEqual(j.items.map((it) => it.slug), u.ids);
      for (const l of j.lessons) {
        assert.ok(l.items.length >= 2, `${j.ko} ${l.no}과 ${l.items.length}곳`);
        if (l.items.length < 3) small.push(`${j.ko} ${l.no}과 ${l.items.length}곳`);
        assert.ok(l.minTapPx >= 16, `${j.ko} ${l.no}과 ${l.minTapPx}px`);
      }
      const gz = zlib.gzipSync(fs.readFileSync(path.join(dir, 'emd', `${u.code}.topo.json`)), { level: 9 }).length;
      assert.ok(gz <= 40 * 1024, `${j.ko} ${gz}B`);
    }
  }
  assert.deepEqual(small, ['달성군 1과 2곳']);
  // 세종: 단원 하나(세종시 25곳 = 1읍 9면 15동), 과 다섯
  const sj = unitFile('36110');
  const kinds = sj.items.reduce((m, it) => ({ ...m, [it.kind]: (m[it.kind] ?? 0) + 1 }), {} as Record<string, number>);
  assert.deepEqual([sj.key, sj.lessons.length, kinds], ['sejong/sejong-si', 5, { 읍: 1, 면: 9, 동: 15 }]);
});

test('운영 형식 저장값(서울·부산·인천·경기 기록만): 이어 하기·홈 카드·오늘 복습·내일 수가 네 지역이 없는 판(E11)과 같다 — 다른 것은 다 채움의 남은 지역뿐(공통 조건 3)', () => {
  const L = (key: string, no: number) => geo.units.regions.find((r) => r.key === key)!.lessons[no - 1].items;
  const m: Mastery = {};
  L('seoul', 1).forEach((id) => { m[id] = rec(2, T); });
  L('seoul', 2).forEach((id, i) => { m[id] = rec(5, null, { grad: i < 2, streak: i < 2 ? 2 : 0 }); });
  L('busan', 1).forEach((id) => { m[id] = rec(1, T); });
  L('incheon', 1).forEach((id) => { m[id] = rec(3, T + 1); });
  L('gyeonggi', 1).forEach((id, i) => { m[id] = rec(1, i % 2 ? T : T - 3); });
  L('gyeonggi', 3).forEach((id) => { m[id] = rec(4, T + 4); });
  const q3 = L('seoul', 3);
  const deck = { v: 1, kind: 'lesson', region: 'seoul', lesson: 3, seed: 7, queue: Array.from({ length: 23 }, (_, i) => ({ mode: i < q3.length ? 'meet' : 'find', id: q3[i % q3.length] })), pos: 7, log: [], retries: {}, missed: [], toLearn: [], placed: [], right: {} };
  const deck2 = { v: 1, kind: 'review', region: null, lesson: null, seed: 9, queue: L('busan', 1).slice(0, 4).map((id) => ({ mode: 'find', id, scope: 'lesson' })), pos: 1, log: [], retries: {}, missed: [], toLearn: [], placed: [], right: {} };
  const data = new Map<string, string>();
  const kv: KV = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: (k) => { data.delete(k); } };
  const K = keys();
  data.set(K.mastery, JSON.stringify(m));
  data.set(K.deck, JSON.stringify(deck));
  data.set(K.deck2, JSON.stringify(deck2));
  data.set(K.daily, JSON.stringify({ day: T, n: 3 }));
  data.set(K.last, JSON.stringify('busan'));
  const s = openStore(kv);
  const mastery = s.read(K.mastery, checkMastery)!, last = s.read(K.last, checkLast);
  assert.equal(s.read(K.daily, checkDaily)?.n, 3);
  const d1raw = s.read(K.deck, checkDeck), d2raw = s.read(K.deck2, checkDeck);
  const r0 = createRegistry(geoNoE12);
  for (const r of [reg, r0]) assert.ok(usableDeck(r, d1raw) && usableDeck(r, d2raw), '이어 할 판');
  assert.deepEqual(usableDeck(reg, d1raw), usableDeck(r0, d1raw));
  assert.deepEqual(usableDeck(reg, d2raw), usableDeck(r0, d2raw));
  const all: Mastery = Object.fromEntries(['seoul', 'busan', 'incheon', 'gyeonggi'].flatMap((k) => geo.units.regions.find((r) => r.key === k)!.items.map((it) => [it.id, rec(3, T + 4)])));
  const states: [Mastery, typeof d1raw, string | null, number][] = [
    [mastery, usableDeck(reg, d1raw), last, 3], [mastery, usableDeck(reg, d2raw), 'gyeonggi', 3], [mastery, null, last, 3],
    [mastery, null, 'gyeonggi', 25], [mastery, null, 'incheon', 0], [{}, null, null, 0], [all, null, 'seoul', 0], [all, null, 'busan', 0],
    [Object.fromEntries(L('busan', 1).map((id) => [id, rec(2, T + 2)])), null, 'busan', 0],
  ];
  const types: string[] = [];
  for (const [mm, d, lst, n] of states) {
    const dl = { day: T, n };
    const a = homeCard({ reg, mastery: mm, deck: d, daily: dl, last: lst, today: T }), b = homeCard({ reg: r0, mastery: mm, deck: d, daily: dl, last: lst, today: T });
    if (a.type === 'done' && b.type === 'done') {
      // 다 채움 카드의 '남은 지역'에만 네 지역(과 E13 에 연 네 지역 — 비교 판 geoNoE12 는 E11 판)이 든다(의도 — 다 칠한 사람에게 새 지역을 권함)
      assert.deepEqual([a.region, a.more.filter((k) => !OPENED_SINCE(5).includes(k))], [b.region, b.more]);
      assert.deepEqual(a.more.filter((k) => E12_KEYS.includes(k)), E12_KEYS);
    } else assert.deepEqual(a, b, `${a.type} ${lst} ${n}`);
    types.push(a.type);
    assert.deepEqual(todayReview(reg, mm, T, n), todayReview(r0, mm, T, n));
    assert.equal(tomorrowCount(reg, mm, T), tomorrowCount(r0, mm, T));
  }
  assert.deepEqual([...new Set(types)].sort(), ['done', 'new', 'next', 'resume', 'review']);
});
