// 동 core(계획서 NATIONWIDE_PLAN E4 · N9 · N16 · N17 · N26 · N30 · N32 · N34): 단원 모델·지연 등록·단원 격리·저장 키·홈 카드·복습 몫·GA 값.
// 동 색인(units.json emdUnits)은 시험용 단원 파일(tests/fixtures/emd)에서 만든다. 운영 판 폴더에는 E6 부터 서울 동 색인(25단원)만 있다 —
// '동 색인 없음'(동 공개 전·옛 캐시)은 운영 판에서 emdUnits 를 뺀 geoNoEmd 로 흉내 낸다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createDeck, current, isDone, type Deck } from '../../src/app/core/deck.ts';
import { afterLesson, get, type Mastery, type Rec } from '../../src/app/core/mastery.ts';
import { DAILY_CAP, EMD_DAILY_CAP, EMD_SEPARATE, EMD_UNIT_NEXT, homeCard, REVIEW_RULE, todayReview, type HomeInput, type ReviewRule } from '../../src/app/core/next.ts';
import { lessonQuestions, reviewQuestions } from '../../src/app/core/questions.ts';
import { rngFrom } from '../../src/app/core/rng.ts';
import { step, usableDeck } from '../../src/app/core/session.ts';
import { tomorrowCount } from '../../src/app/core/tally.ts';
import { BOOT_UNITS_MAX, gaUnit, onMissingUnit, registerUnits, studyKeys, unitsToLoad } from '../../src/app/core/units.ts';
import { createRegistry, unitOptions, type Registry } from '../../src/app/registry.ts';
import { checkBests, checkBestUnits, checkDaily, checkDeck, checkLast, checkLastUnit, checkMastery, keys, openStore, type KV } from '../../src/app/store.ts';
import type { EmdIndex, EmdUnitFile, GeoData } from '../../src/app/types.ts';
import type { Ctx } from '../../src/app/ui/ctx.ts';
import { homePage } from '../../src/app/ui/pages.ts';
import { EN_OFF, LIVE_BY_OPEN, geo, geoNoEmd } from './fixtures.ts';

const T = 20000;
const FIX = path.join(import.meta.dirname, '../fixtures/emd');
const unitFile = (code: string): EmdUnitFile => JSON.parse(fs.readFileSync(path.join(FIX, `${code}.json`), 'utf8'));
const indexOf = (j: EmdUnitFile): EmdIndex => ({ code: j.code, ko: j.ko, slug: j.key.split('/')[1], n: j.items.length, lessons: j.lessons.length, ids: j.items.map((it) => it.slug) });
// 서울 3단원(종로·중랑·노원)·인천 2단원(검단·옹진). 증평(충북 — E13 부터 공개 지역)은 이 판 색인에 넣지 않는다(증평 시험은 운영 판 geo 로 등록).
// 세종(E12)·제주(E13) — 과 없는 지역, 동 색인이 있어야 실림 — 는 운영 판 색인 그대로 둔다(운영 판과 지역 목록이 같게 — 홈 탭 '다른 지역' 수)
const EMD_UNITS = { seoul: ['11110', '11260', '11350'].map((c) => indexOf(unitFile(c))), incheon: ['28290', '28720'].map((c) => indexOf(unitFile(c))), sejong: geo.units.emdUnits!.sejong, jeju: geo.units.emdUnits!.jeju };
const geoE: GeoData = { ...geo, units: { ...geo.units, emdUnits: EMD_UNITS } };
/** 동 색인이 있는 레지스트리(단원 등록은 시험마다 따로 — addUnit 은 레지스트리를 바꾼다) */
const regE = (opt = {}) => createRegistry(geoE, opt);
/** 등록된 동 단원(일반구 단원 gyeonggi/gu 는 운영 판 units.json guUnits 로 부팅 때 등록돼 reg.units 에 함께 있다 — E7) */
const emdOf = (reg: Registry) => reg.units.filter((u) => u.layer === 'emd');
const fetchFix = async (code: string) => unitFile(code);
const ids = (code: string) => unitFile(code).items.map((it) => it.id);
const lessonOf = (code: string, no: number) => unitFile(code).lessons[no - 1].items;
const rec = (box: number, due: number | null, more: Partial<Rec> = {}): Rec => ({ box, due, hi: box >= 5 ? 3 : box >= 3 ? 2 : box >= 1 ? 1 : 0, streak: 0, grad: false, front: false, ...more });
const sggIds = (region: string) => geo.units.regions.find((r) => r.key === region)!.items.map((it) => it.id);
const sggLesson = (region: string, no: number) => geo.units.regions.find((r) => r.key === region)!.lessons[no - 1].items;
const base = (reg: Registry, more: Partial<HomeInput> = {}): HomeInput => ({ reg, mastery: {}, deck: null, daily: null, last: null, today: T, ...more });
const SEP: ReviewRule = { separate: true, emdCap: EMD_DAILY_CAP };
const SHARED: ReviewRule = { separate: false, emdCap: EMD_DAILY_CAP };

function memKV(): KV & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: (k) => { data.delete(k); } };
}
const ctxOf = (reg: Registry, o: Partial<Ctx>): Ctx => ({
  reg, geo, base: '/', ver: 'kr-20261001.2', storageOk: true, inApp: false,
  mastery: {}, lessonDeck: null, otherDeck: null, checkDeck: null, checkStart: 0,
  daily: null, dailyEmd: null, last: null, lastUnit: null, settings: { autoNext: false }, homeRegion: null, bests: {}, bestUnits: {},
  today: () => T, save() {}, go() {}, back() {}, render() {}, toast() {},
  ...o,
}) as Ctx;
const pressed = (html: string) => /data-arg="([a-z-]+)" aria-pressed="true"/.exec(html)?.[1];
const label = (html: string) => /<p class="h-label">.*?<span>([^<]*)<\/span>/.exec(html)?.[1];
/** 판을 끝까지(모두 맞힘) — 앱이 문제마다 부르는 step 그대로 */
function finish(reg: Registry, deck: Deck, m: Mastery, today = T) {
  let s = step(reg, deck, m, null, { result: 'correct' }, today);
  while (!s.finished) s = step(reg, s.deck, s.mastery, s.daily, { result: 'correct' }, today, s.dailyEmd);
  return s;
}

/* ---------- 운영 형식 옛 저장값(동 기록 없음): E3 숫자 그대로 ---------- */

test('운영 형식 옛 저장값(동 기록 없음): 이어 하기·오늘 복습·내일 수·홈 카드가 E3 와 같고, 동 색인이 있어도(운영 판 서울 동 색인 포함) 같다', () => {
  // 저장소에 있는 그대로의 JSON 글(kgq_mastery_v1·kgq_deck_v1·kgq_deck2_v1·kgq_daily_v1·kgq_last_v1)을 앱의 검사로 읽는다
  const m: Record<string, Rec> = {};
  sggLesson('seoul', 1).forEach((id) => { m[id] = rec(2, T); });
  sggLesson('seoul', 2).forEach((id, i) => { m[id] = rec(5, null, { grad: i < 2, streak: i < 2 ? 2 : 0 }); });
  sggLesson('incheon', 1).forEach((id) => { m[id] = rec(3, T + 1); });
  sggLesson('gyeonggi', 1).forEach((id, i) => { m[id] = rec(1, i % 2 ? T : T - 3); });
  sggLesson('gyeonggi', 3).forEach((id) => { m[id] = rec(4, T + 4); });
  const q3 = sggLesson('seoul', 3);
  const deck = { v: 1, kind: 'lesson', region: 'seoul', lesson: 3, seed: 7, queue: Array.from({ length: 23 }, (_, i) => ({ mode: i < q3.length ? 'meet' : 'find', id: q3[i % q3.length] })), pos: 7, log: [], retries: {}, missed: [], toLearn: [], placed: [], right: {} };
  const deck2 = { v: 1, kind: 'review', region: null, lesson: null, seed: 9, queue: sggLesson('gyeonggi', 1).slice(0, 4).map((id) => ({ mode: 'find', id, scope: 'lesson' })), pos: 1, log: [], retries: {}, missed: [], toLearn: [], placed: [], right: {} };
  const kv = memKV();
  const K = keys();
  kv.data.set(K.mastery, JSON.stringify(m));
  kv.data.set(K.deck, JSON.stringify(deck));
  kv.data.set(K.deck2, JSON.stringify(deck2));
  kv.data.set(K.daily, JSON.stringify({ day: T, n: 3 }));
  kv.data.set(K.last, JSON.stringify('seoul'));
  const s = openStore(kv);
  const mastery = s.read(K.mastery, checkMastery)!, daily = s.read(K.daily, checkDaily), last = s.read(K.last, checkLast);
  // 새 키는 없다(동을 공부한 적 없음)
  assert.equal(s.read(K.lastUnit, checkLastUnit), null);
  assert.equal(s.read(K.dailyEmd, checkDaily), null);
  for (const reg of [createRegistry(geoNoEmd), createRegistry(geo), regE()]) {
    // 부팅 때 받을 단원 0(동 기록이 없으면 지금과 같이 아무것도 받지 않는다)
    assert.deepEqual(unitsToLoad(reg, { mastery, deck: s.read(K.deck, checkDeck), deck2: s.read(K.deck2, checkDeck), lastUnit: null, daily, dailyEmd: null, today: T }), []);
    const d1 = usableDeck(reg, s.read(K.deck, checkDeck)), d2 = usableDeck(reg, s.read(K.deck2, checkDeck));
    assert.ok(d1 && d2, '이어 할 판 둘 다 살아 있음');
    // E3 코드로 뜬 기준값(E4 작업 때 E3 코드로 잰 mixAll·mixReview·mixDeck2Only)
    assert.deepEqual(homeCard({ reg, mastery, deck: d1, daily, last, today: T }), { type: 'resume', kind: 'lesson', region: 'seoul', lesson: 3, n: 8, total: 23, review: 10 });
    assert.deepEqual(homeCard({ reg, mastery, deck: d2, daily, last: 'gyeonggi', today: T }), { type: 'resume', kind: 'review', region: null, lesson: null, n: 2, total: 4, review: 10 });
    assert.deepEqual(homeCard({ reg, mastery, deck: null, daily, last, today: T }),
      { type: 'review', count: 10, byRegion: [{ region: 'gyeonggi', n: 5 }, { region: 'seoul', n: 5 }], next: { region: 'seoul', lesson: 3 } });
    const plan = todayReview(reg, mastery, T, 3);
    assert.deepEqual([plan.due, plan.available, plan.round.length], [11, 11, 10]);
    assert.equal(tomorrowCount(reg, mastery, T), 15);
    assert.deepEqual(homeCard({ reg, mastery, deck: null, daily: { day: T, n: 25 }, last: 'gyeonggi', today: T }),
      { type: 'review', count: 5, byRegion: [{ region: 'gyeonggi', n: 5 }], next: { region: 'gyeonggi', lesson: 2 } });
  }
  // 서울 1·2과 칠함(복습은 모레) → 다음 과 · 여유가 없으면 추천 없음 · 서울을 다 칠하면 다 채움
  const nx: Mastery = Object.fromEntries([...sggLesson('seoul', 1), ...sggLesson('seoul', 2)].map((id) => [id, rec(2, T + 2)]));
  nx['kr:sgg:11110'] = rec(5, null, { grad: true, streak: 2 });
  const all: Mastery = Object.fromEntries(sggIds('seoul').map((id, i) => [id, i % 3 === 0 ? rec(5, null, { grad: true }) : rec(3, T + 4)]));
  for (const reg of [createRegistry(geoNoEmd), createRegistry(geo), regE()]) {
    assert.deepEqual(homeCard(base(reg, { mastery: nx, daily: { day: T, n: 6 }, last: 'seoul' })), { type: 'next', region: 'seoul', lesson: 3, recommend: true, tomorrow: 0 });
    assert.deepEqual(homeCard(base(reg, { mastery: nx, daily: { day: T, n: 28 }, last: 'seoul' })), { type: 'next', region: 'seoul', lesson: 3, recommend: false, tomorrow: 0 });
    // E11 부터 부산이, E12 부터 대구·대전·울산·세종이 열려 '남은 지역'에 든다(공개 차례 — 지역 표 openOrder, E12 검수). 세종(과 없는 지역)은 동 색인이 있어야 싣는다(geo 만)
    // E13 부터 강원·충북·전북·제주도 든다(제주도 과 없는 지역 — 동 색인이 있어야 싣는다). E14 부터는 지역 표 공개 차례에서 센다(새 지역은 끝에 붙음)
    const more = LIVE_BY_OPEN.filter((k) => k !== 'seoul' && reg.region(k));
    assert.deepEqual(homeCard(base(reg, { mastery: all, daily: { day: T, n: 0 }, last: 'seoul' })), { type: 'done', region: 'seoul', more });
  }
  // 홈 화면 글도 동 색인 유무와 상관없이 같다 — 다른 것은 '동까지 공부하기' 한 줄뿐(동 색인이 있으면 구 고르기 링크, 없으면 '준비 중', E5).
  // 운영 판(E6)은 서울 동 색인이 있어 링크다
  const html = (reg: Registry) => homePage(ctxOf(reg, { mastery, daily, last, lessonDeck: usableDeck(reg, s.read(K.deck, checkDeck)), otherDeck: usableDeck(reg, s.read(K.deck2, checkDeck)) })).html;
  const off = '<span class="h-link off"><span>동까지 공부하기</span> <em>준비 중</em></span>';
  const on = '<a class="h-link" href="#/kr/seoul/emd"><span>동까지 공부하기</span> <i aria-hidden="true">→</i></a>';
  assert.ok(html(createRegistry(geoNoEmd)).includes(off) && !html(createRegistry(geoNoEmd)).includes(on));
  assert.ok(html(regE()).includes(on));
  // E12 부터: 과 없는 지역(세종 · E13 제주)은 동 색인이 있어야 실려서 '다른 지역' 수도 둘 다르다(E13 색인 있음 +10 · 없음 +8 — E14 부터 지금 판에서 셈)
  const nMore = regE().regions.length + (geo.units.korea ? 1 : 0) - 3, nLess = nMore - (regE().regions.length - createRegistry(geoNoEmd).regions.length);
  const noSejong = (h: string) => h.replace(`+${nMore}</span><span class="visually-hidden">(${nMore}곳 더)`, `+${nLess}</span><span class="visually-hidden">(${nLess}곳 더)`);
  assert.equal(noSejong(html(regE()).replace(on, off)), html(createRegistry(geoNoEmd)));
  assert.equal(html(createRegistry(geo)), html(regE()), '운영 판(E6, 서울 동 색인)도 링크 한 줄 말고 같다');
});

/* ---------- 단원 모델(N30): 지연 등록 ---------- */

test('단원 등록: 지역 목록과 따로(reg.units), 찾기는 두 목록을 다 본다 · 같은 단원은 한 번만 · 모양이 틀리면 아무것도 바꾸지 않는다', () => {
  const reg = regE();
  assert.equal(emdOf(reg).length, 0);
  const j = unitFile('11110');
  // 공개 지역 전부(세종·제주는 과 없는 지역 — 이 시험 판에도 운영 판 세종·제주 동 색인을 둬서 실린다. E13 판 12곳)
  const n0 = reg.regions.length;
  assert.equal(n0, LIVE_BY_OPEN.length);   // E13 열둘 · E14 열넷 · E14·E15 합친 판 열다섯(지역 표 공개 지역 수)
  const u = reg.addUnit(j);
  assert.equal(reg.addUnit(unitFile('11110')), u, '이미 등록된 단원은 그대로');
  assert.deepEqual([reg.regions.length, emdOf(reg).length], [n0, 1], '지역 목록(홈 탭·지역 고르기·다 채움)은 그대로');
  assert.equal(reg.region('seoul/jongno-gu'), u);
  assert.equal(reg.areaOf('seoul/jongno-gu'), 'seoul');
  assert.equal(reg.areaOf('seoul'), 'seoul');
  const a = j.items[0];
  assert.equal(reg.bySlug('seoul/jongno-gu', a.slug)?.item.id, a.id);
  assert.equal(reg.place(a.id)?.region, u);
  assert.equal(reg.place(a.id)?.item.line, '', '동은 위치 한 줄이 없다(만나기 카드는 근거 meet, N13)');
  assert.equal(reg.screenOf(a.id)?.key, 'all');
  const nbId = j.neighbors[a.id][0];
  assert.ok(reg.adjacent(a.id, nbId) && reg.neighborsOf(a.id).every((o) => o.startsWith('kr:emd:11110')));
  assert.ok(reg.dist(a.id, nbId) > 0);
  assert.ok(reg.order(a.id) > reg.order(sggIds('gyeonggi').at(-1)!), '복습 차례: 동은 시·군·구 다음');
  // 모양이 틀린 파일: 과에 없는 곳 · 색인과 다른 곳 목록 → throw, 등록된 것 없음
  const bad = unitFile('11260');
  bad.lessons[0].items = [...bad.lessons[0].items, 'kr:emd:1126099999'];
  assert.throws(() => reg.addUnit(bad), /과에 없는 곳/);
  assert.equal(reg.place(bad.items[0].id), undefined);
  const odd = unitFile('11350');
  odd.items = odd.items.slice(1);
  assert.throws(() => reg.addUnit(odd), /동 색인과 다름/);
  assert.equal(emdOf(reg).length, 1);
});

/* ---------- 부팅(N17)과 단원 격리(N30) ---------- */

test('동 과 도중 새로고침 → 단원 파일을 받아 등록한 뒤 이어 하기(홈 탭은 그 단원의 지역)', async () => {
  const reg = regE();
  reg.addUnit(unitFile('11110'));
  // 지난 창: 종로구 1과를 5문제까지(문제마다 저장)
  let d = createDeck('lesson', lessonQuestions(reg, 'seoul/jongno-gu', 1, () => 0, rngFrom(1)), { region: 'seoul/jongno-gu', lesson: 1, seed: 1 });
  for (let i = 0; i < 5; i++) d = step(reg, d, {}, null, { result: 'correct' }, T).deck;
  const kv = memKV(), K = keys(), s = openStore(kv);
  const k = studyKeys(reg, 'seoul/jongno-gu');
  assert.deepEqual(k, { last: 'seoul', lastUnit: 'seoul/jongno-gu' }, 'kgq_last_v1 에는 지역 키(N16)');
  s.write(K.deck, d);
  s.write(K.last, k.last);
  s.write(K.lastUnit, k.lastUnit);
  // 새로고침: 새 레지스트리에는 단원이 없다 → 받기 전에는 판을 이어 할 수 없으므로 받고 등록한 뒤에 고른다
  const reg2 = regE();
  const saved = { mastery: {}, deck: s.read(K.deck, checkDeck), deck2: null, lastUnit: s.read(K.lastUnit, checkLastUnit), daily: null, dailyEmd: null, today: T };
  assert.equal(usableDeck(reg2, saved.deck), null);
  const need = unitsToLoad(reg2, saved);
  assert.deepEqual(need, ['seoul/jongno-gu']);
  const failed = await registerUnits(reg2, need, fetchFix, () => assert.fail('실패 없음'));
  assert.deepEqual(failed, []);
  const back = usableDeck(reg2, saved.deck);
  assert.equal(back?.pos, 5);
  const card = homeCard({ reg: reg2, mastery: {}, deck: back, daily: null, last: s.read(K.last, checkLast), lastUnit: saved.lastUnit, today: T });
  assert.deepEqual(card, { type: 'resume', kind: 'lesson', region: 'seoul/jongno-gu', lesson: 1, n: 6, total: back!.queue.length, review: 0 });
  const html = homePage(ctxOf(reg2, { lessonDeck: back, last: 'seoul', lastUnit: 'seoul/jongno-gu' })).html;
  assert.equal(pressed(html), 'seoul');
  // E5: 주 구역이 '이어서 하기 · 종로구 1과'(곳 수는 '6개 동'), '먼저 할 일' 줄은 없다. 지역 지도에서는 종로구 칸이 굵은 테두리(칸 색은 채움 단계 그대로 — 노랑으로 덮지 않음)
  assert.equal(label(html), '이어서 하기 · 종로구 1과');
  assert.ok(!html.includes('class="h-pend"'));
  assert.match(html, /<span class="h-hl hl">\d+개 동<\/span>/);
  const spec = homePage(ctxOf(reg2, { lessonDeck: back, last: 'seoul', lastUnit: 'seoul/jongno-gu' })).maps!.main;
  assert.deepEqual([spec.highlight, spec.bold], [[], ['kr:sgg:11110']]);
});

test('deck2 동 복습 판 복원: 판의 단원을 모두 받아 되살린다 · 한 단원이라도 받기에 실패하면 이 창에서는 판을 이어 하지 않고(저장소의 판은 지킴) 앱은 계속', async () => {
  const q = [ids('11110')[0], ids('11350')[1], sggIds('seoul')[0], ids('11110')[2]];
  const deck2 = createDeck('review', q.map((id) => ({ mode: 'find' as const, id, scope: 'lesson' as const })), { seed: 3 });
  const m: Mastery = Object.fromEntries(q.map((id) => [id, rec(1, T)]));
  const kv = memKV(), K = keys(), s = openStore(kv);
  s.write(K.deck2, { ...deck2, pos: 1 });
  s.write(K.mastery, m);
  const saved = () => ({ mastery: s.read(K.mastery, checkMastery)!, deck: null, deck2: s.read(K.deck2, checkDeck), lastUnit: null, daily: null, dailyEmd: null, today: T });

  const reg = regE();
  assert.deepEqual(unitsToLoad(reg, saved()), ['seoul/jongno-gu', 'seoul/nowon-gu']);
  await registerUnits(reg, unitsToLoad(reg, saved()), fetchFix, () => assert.fail('실패 없음'));
  const d = usableDeck(reg, saved().deck2);
  assert.equal(d?.kind, 'review');
  assert.deepEqual(homeCard({ ...base(reg, { mastery: saved().mastery, deck: d }) }).type, 'resume');

  // 노원 단원 받기 실패: 그 단원만 빠진다(geo_load_fail 로 알림) — 판은 버리고, 남은 복습은 그대로 센다
  const reg2 = regE();
  const fails: string[] = [];
  const failed = await registerUnits(reg2, unitsToLoad(reg2, saved()), (c) => (c === '11350' ? Promise.reject(new Error('404')) : fetchFix(c)), (k) => fails.push(k));
  assert.deepEqual([failed, fails], [['seoul/nowon-gu'], ['seoul/nowon-gu']]);
  assert.equal(usableDeck(reg2, saved().deck2), null);
  assert.equal(onMissingUnit(reg2, saved().deck2), true, '저장소의 kgq_deck2_v1 은 save() 가 지우지 않는다 — 다음 창에서 받기에 성공하면 되살아난다');
  assert.equal(reg2.known(ids('11350')[1]), false, '실패한 단원은 이 창에서 모른다');
  const plan = todayReview(reg2, saved().mastery, T, 0);
  assert.equal(plan.due, 3, '노원 1곳은 빠짐');
  assert.equal(homeCard(base(reg2, { mastery: saved().mastery })).type, 'review');
  assert.deepEqual(unitsToLoad(reg2, saved()), [], '실패한 단원은 다시 받지 않는다');
});

test('단원 파일 받기·등록 실패 → 그 단원만 빠지고 나머지는 등록, 앱 계산은 계속', async () => {
  const reg = regE();
  const m: Mastery = Object.fromEntries([...ids('11110'), ...ids('11260'), ...ids('11350')].map((id) => [id, rec(1, T + 1)]));
  const broken = (c: string) => {
    if (c === '11350') return Promise.reject(new TypeError('Failed to fetch'));
    if (c === '11260') { const f = unitFile(c); f.lessons[1].items = []; return Promise.resolve(f); }   // 과에 들지 않은 곳
    return fetchFix(c);
  };
  const why: Record<string, string> = {};
  const failed = await registerUnits(reg, ['seoul/jongno-gu', 'seoul/jungnang-gu', 'seoul/nowon-gu'], broken, (k, w) => { why[k] = w; });
  assert.deepEqual(failed.sort(), ['seoul/jungnang-gu', 'seoul/nowon-gu']);
  assert.match(why['seoul/nowon-gu'], /Failed to fetch/);
  assert.match(why['seoul/jungnang-gu'], /과에 들지 않은 곳/);
  assert.deepEqual(emdOf(reg).map((u) => u.key), ['seoul/jongno-gu']);
  assert.equal(reg.place(ids('11260')[0]), undefined, '반쯤 등록된 곳이 없다');
  assert.deepEqual(reg.emdUnits('seoul').map((u) => u.key), ['seoul/jongno-gu']);
  assert.equal(tomorrowCount(reg, m, T), ids('11110').length, '내일 복습 수에서도 빠진다');
  assert.equal(homeCard(base(reg, { mastery: m })).type, 'next');
});

test('부팅 때 받는 단원 파일 수의 상한(약 12개): 판 → 마지막 단원 → 이번 복습 판 차례, 이어 할 판이 있으면 복습 판 단원은 받지 않는다', () => {
  // 단원 30개(곳 3씩)짜리 가짜 색인
  const many: EmdIndex[] = Array.from({ length: 30 }, (_, i) => ({ code: String(11001 + i), ko: `가${i}구`, slug: `ga${i}-gu`, n: 3, lessons: 1, ids: ['51000', '52000', '53000'] }));
  const reg = createRegistry({ ...geo, units: { ...geo.units, emdUnits: { seoul: many } } });
  const id = (i: number, k = 0) => `kr:emd:${11001 + i}${['51000', '52000', '53000'][k]}`;
  const key = (i: number) => `seoul/ga${i}-gu`;
  // 단원 20곳에 오늘 복습(동 몫 30 안)
  const m: Mastery = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [id(i + 5), rec(1, T)]));
  const need = (deck: Deck | null, deck2: Deck | null, lastUnit: string | null) => unitsToLoad(reg, { mastery: m, deck, deck2, lastUnit, daily: null, dailyEmd: null, today: T });
  // 판 없음: 이번 복습 판 10곳 → 단원 10 + 마지막 단원 1
  const a = need(null, null, key(29));
  assert.equal(a.length, 11);
  assert.equal(a[0], key(29), '마지막 단원이 복습 판보다 먼저');
  // 과 판(단원 0) + 복습 판(10곳이 단원 10개) + 마지막 단원 → 12, 이번 복습 판 단원은 받지 않음
  const lessonDeck = createDeck('lesson', [{ mode: 'meet', id: id(0) }, { mode: 'choose', id: id(0), options: [id(0), id(0, 1), id(0, 2)] }], { region: key(0), lesson: 1, seed: 1 });
  const reviewDeck = createDeck('review', Array.from({ length: 10 }, (_, i) => ({ mode: 'find' as const, id: id(i + 1) })), { seed: 2 });
  const b = need(lessonDeck, reviewDeck, key(28));
  assert.equal(b.length, 12);
  assert.ok(b.length <= BOOT_UNITS_MAX);
  assert.deepEqual(b.slice(0, 11), [key(0), ...Array.from({ length: 10 }, (_, i) => key(i + 1))], '판의 단원을 먼저');
  assert.equal(b[11], key(28));
  // 과 판 + 전체 연습 판 + 마지막 단원 → 3
  const mixDeck = createDeck('mix', [{ mode: 'find', id: id(3) }], { region: key(3), seed: 3 });
  assert.deepEqual(need(lessonDeck, mixDeck, key(0)), [key(0), key(3)]);
  // 끝난 판·시험 판은 받지 않는다. 이미 등록된 단원도 다시 받지 않는다
  assert.deepEqual(need({ ...lessonDeck, pos: lessonDeck.queue.length }, null, null).length, 10);
  // 어떤 모양이든 상한을 넘지 않는다
  const huge = createDeck('review', Array.from({ length: 25 }, (_, i) => ({ mode: 'find' as const, id: id(i) })), { seed: 4 });
  assert.equal(need(lessonDeck, huge, key(29)).length, BOOT_UNITS_MAX);
  // 오늘 복습 화면에서 새 복습 판을 만들 때(opt.review): 판이 있어도 이번 복습 판 단원 10개를 맨 앞에 → 상한에 잘리지 않는다
  const r = unitsToLoad(reg, { mastery: m, deck: lessonDeck, deck2: mixDeck, lastUnit: key(29), daily: null, dailyEmd: null, today: T }, { review: true });
  assert.ok(r.length <= BOOT_UNITS_MAX);
  assert.deepEqual(r.slice(0, 10), Array.from({ length: 10 }, (_, i) => key(i + 5)));
});

test('과·전체 연습 판이 진행 중일 때 오늘 복습(동만) → 복습 경로는 그 단원을 받은 뒤 판을 만들고, 판의 모든 곳이 등록돼 있다', async () => {
  // 서울 3과(시·군·구) 판 진행 중 · 종로 동 6곳 오늘 복습 · 시·군·구 복습 없음 · 마지막 공부는 시·군·구 과(검수 재현과 같은 상태)
  const reg = regE();
  const m: Mastery = Object.fromEntries(ids('11110').slice(0, 6).map((id) => [id, rec(1, T)]));
  const lessonDeck = createDeck('lesson', lessonQuestions(reg, 'seoul', 3, () => 0, rngFrom(1)), { region: 'seoul', lesson: 3, seed: 1 });
  const mixDeck = createDeck('mix', [{ mode: 'find', id: sggIds('incheon')[0] }], { region: 'incheon', seed: 2 });
  for (const [deck, deck2] of [[lessonDeck, null], [null, mixDeck], [lessonDeck, mixDeck]] as const) {
    const r = regE();
    const x = { mastery: m, deck, deck2, lastUnit: null, daily: null, dailyEmd: null, today: T };
    // 홈·부팅 경로는 그대로(이어 하기 카드라 복습 판 이름을 그리지 않는다 — 상한 정책)
    assert.deepEqual(unitsToLoad(r, x), []);
    // 오늘 복습 경로(main.ts render → needUnits(새 복습 판))
    const need = unitsToLoad(r, x, { review: true });
    assert.deepEqual(need, ['seoul/jongno-gu']);
    await registerUnits(r, need, fetchFix, () => assert.fail('실패 없음'));
    // main.ts newReview 와 같은 길: todayReview → 등록된 곳으로 판 → 문제 화면(play.ts)이 reg.place(q.id)! 로 꺼낸다
    const plan = todayReview(r, m, T, 0, 0);
    assert.deepEqual([plan.part, plan.round.length], ['emd', 6]);
    const rd = createDeck('review', reviewQuestions(plan.round.filter((id) => r.place(id)), () => 1), { seed: 3 });
    assert.equal(rd.queue.length >= 6, true);
    for (const q of rd.queue) {
      assert.ok(r.place(q.id)?.region, `문제 곳 ${q.id} 가 등록됨`);
      for (const o of q.options ?? []) assert.ok(r.place(o), `보기 ${o}`);
    }
    assert.equal(unitsToLoad(r, x, { review: true }).length, 0, '받은 뒤에는 받을 것이 없다(다시 그리면 판을 만든다)');
  }
  // 받기에 실패하면 그 단원은 색인에서 빠져 복습 판에 들지 않는다(빈 판이면 '복습 없음' 쪽)
  const r2 = regE();
  await registerUnits(r2, unitsToLoad(r2, { mastery: m, deck: lessonDeck, deck2: null, lastUnit: null, daily: null, dailyEmd: null, today: T }, { review: true }), () => Promise.reject(new Error('offline')), () => {});
  assert.equal(todayReview(r2, m, T, 0, 0).round.length, 0);
});

test('이 창에서 못 쓰는 동 단원 판은 저장소에서 지우지 않는다(onMissingUnit — main.ts save 가 그 칸을 건드리지 않음)', async () => {
  const reg = regE();
  reg.addUnit(unitFile('11110'));
  const emdDeck = createDeck('lesson', lessonQuestions(reg, 'seoul/jongno-gu', 1, () => 0, rngFrom(1)), { region: 'seoul/jongno-gu', lesson: 1, seed: 1 });
  const mixedReview = createDeck('review', [sggIds('seoul')[0], ids('11110')[1]].map((id) => ({ mode: 'find' as const, id })), { seed: 2 });
  const sggDeck = createDeck('lesson', lessonQuestions(reg, 'seoul', 1, () => 0, rngFrom(3)), { region: 'seoul', lesson: 1, seed: 3 });
  // 등록된 창에서는 쓸 수 있으니 지킬 것도 없다
  assert.deepEqual([onMissingUnit(reg, emdDeck), onMissingUnit(reg, mixedReview), onMissingUnit(reg, sggDeck)], [false, false, false]);
  // 받기에 실패한 창(dropUnit) · 동을 끈 창(색인 없음 — 관문이 닫힌 영어 앱, EN_EMD 5.1) · 동 공개 전 판 폴더: 동 판은 지키고(이어 할 수 없을 뿐), 시·군·구 판은 그대로 쓸 수 있다
  const failed = regE();
  await registerUnits(failed, ['seoul/jongno-gu'], () => Promise.reject(new Error('offline')), () => {});
  for (const r of [failed, regE(EN_OFF), createRegistry(geoNoEmd)]) {
    assert.equal(usableDeck(r, emdDeck), null);
    assert.deepEqual([onMissingUnit(r, emdDeck), onMissingUnit(r, mixedReview)], [true, true]);
    assert.equal(onMissingUnit(r, sggDeck), false);
    assert.ok(usableDeck(r, sggDeck));
  }
  // 동이 없는 판을 못 쓰게 된 때(데이터 판이 바뀜)는 지금처럼 지운다 · 끝난 판도 지키지 않는다
  const gone = { ...sggDeck, queue: [{ mode: 'find' as const, id: 'kr:sgg:99999' }] };
  assert.deepEqual([usableDeck(reg, gone), onMissingUnit(reg, gone)], [null, false]);
  assert.equal(onMissingUnit(failed, { ...emdDeck, pos: emdDeck.queue.length }), false);
  // 운영 형식 저장값 그대로: 지금 기록에는 동 판이 없으니 지키는 판이 없다(save 는 E3 와 같이 쓰고 지운다)
  assert.equal(onMissingUnit(createRegistry(geo), null), false);
});

/* ---------- 홈 카드(N9·N17) ---------- */

test('동만 공부하고 복습 0인 날 → 홈이 처음 화면이 아님(동 색인으로 판정, 단원 파일 없이)', () => {
  const reg = regE();
  const m: Mastery = afterLesson({}, lessonOf('11110', 1), T - 1);   // 오늘 복습 날짜 아님(어제 끝 → 상자 1, 오늘이 복습 날) → 하루 더 미룸
  for (const k of Object.keys(m)) m[k] = { ...m[k], due: T + 2 };
  assert.equal(emdOf(reg).length, 0);
  const card = homeCard(base(reg, { mastery: m, last: 'seoul' }));
  assert.notEqual(card.type, 'new');
  assert.deepEqual(card, { type: 'next', region: 'seoul', lesson: 1, recommend: true, tomorrow: 0 });
  // 동 색인이 없는(동 공개 전) 레지스트리에서는 모르는 곳이라 처음 화면
  assert.equal(homeCard(base(createRegistry(geoNoEmd), { mastery: m })).type, 'new');
  // 운영 판(E6, 서울 동 색인)에서는 아는 곳
  assert.equal(homeCard(base(createRegistry(geo), { mastery: m, last: 'seoul' })).type, 'next');
});

test('내일 복습 수에 동이 들어간다(단원 파일 없이 동 색인으로)', () => {
  const reg = regE();
  const m: Mastery = {};
  for (const id of sggLesson('seoul', 1).slice(0, 3)) m[id] = rec(1, T + 1);
  for (const id of ids('11350').slice(0, 4)) m[id] = rec(2, T + 1);
  for (const id of ids('28720').slice(0, 2)) m[id] = rec(2, T + 3);
  assert.equal(tomorrowCount(reg, m, T), 7);
  const card = homeCard(base(reg, { mastery: m, last: 'seoul' }));
  assert.equal(card.type === 'next' && card.tomorrow, 7);
  assert.equal(tomorrowCount(regE(EN_OFF), m, T), 3, '동을 끈 창(관문이 닫힌 영어 앱)은 동을 세지 않는다');
  assert.equal(tomorrowCount(regE(unitOptions('en', { enNames: true })), m, T), 7, '관문이 열린 영어 앱(EN_EMD)은 한국어처럼 동도 센다');
});

test('인천 동 공부 뒤 → 홈 탭은 인천, 주 카드는 그 단원의 다음 과(다 칠하면 지역 차례로)', () => {
  const reg = regE();
  reg.addUnit(unitFile('28290'));
  // 서울 1과를 전에 배웠고, 오늘 검단구 1과를 배움
  let m: Mastery = afterLesson({}, sggLesson('seoul', 1), T - 3);
  for (const id of sggLesson('seoul', 1)) m[id] = { ...m[id], due: T + 3 };
  const k = studyKeys(reg, 'incheon/geomdan-gu');
  assert.deepEqual(k, { last: 'incheon', lastUnit: 'incheon/geomdan-gu' });
  assert.equal(checkLast(k.last), 'incheon', '옛 검사(kgq_last_v1)를 그대로 통과');
  const deck = createDeck('lesson', lessonQuestions(reg, 'incheon/geomdan-gu', 1, () => 0, rngFrom(5)), { region: 'incheon/geomdan-gu', lesson: 1, seed: 5 });
  const s = finish(reg, deck, m);
  m = s.mastery;
  const n1 = lessonOf('28290', 1).length;
  assert.deepEqual([s.daily.n, s.dailyEmd.n], EMD_SEPARATE ? [0, n1] : [n1, 0], '동 과는 동 몫으로 센다(N32)');
  for (const id of lessonOf('28290', 1)) assert.equal(get(m, id).box, 1);
  const card = homeCard(base(reg, { mastery: m, daily: s.daily, dailyEmd: s.dailyEmd, last: k.last, lastUnit: k.lastUnit }));
  assert.deepEqual(card, { type: 'next', region: 'incheon', lesson: 2, recommend: true, tomorrow: n1, unit: 'incheon/geomdan-gu' });
  // 홈 화면: 탭은 인천, 주 구역은 검단구 2과(단추는 단원 키로 시작)
  const html = homePage(ctxOf(reg, { mastery: m, daily: s.daily, dailyEmd: s.dailyEmd, last: k.last, lastUnit: k.lastUnit })).html;
  assert.equal(pressed(html), 'incheon');
  assert.equal(label(html), '다음 과 · 검단구 2과');
  assert.match(html, /data-act="learn" data-arg="incheon\/geomdan-gu:2" data-card="next"/);
  // 다른 지역 탭을 고르면 그 지역 차례(마지막 단원은 그 지역 탭에서만)
  const seoulCard = homeCard(base(reg, { mastery: m, last: 'seoul', lastUnit: k.lastUnit }));
  assert.equal(seoulCard.type === 'next' && seoulCard.unit, undefined);
  // 단원을 다 칠하면 지역 차례: 인천 시·군·구 1과
  m = afterLesson(m, lessonOf('28290', 2), T);
  assert.deepEqual(homeCard(base(reg, { mastery: m, last: k.last, lastUnit: k.lastUnit })), { type: 'next', region: 'incheon', lesson: 1, recommend: true, tomorrow: ids('28290').length });
  // 단원 파일이 등록되지 않았으면(받기 실패) 마지막 단원을 건너뛴다
  assert.equal((homeCard(base(regE(), { mastery: m, last: k.last, lastUnit: k.lastUnit })) as { unit?: string }).unit, undefined);
});

/* ---------- 복습 몫(N32, Q7 확정 — 동 몫 하루 30) ---------- */

test('동 복습은 따로 센다(Q7 확정 — 동 몫 하루 30): 시·군·구 상한·새 과 추천은 시·군·구 몫만 본다', () => {
  assert.equal(EMD_SEPARATE, true, 'Q7 확정(사용자 11-14): 동은 따로 센다');
  assert.equal(EMD_DAILY_CAP, 30, 'Q7 확정(사용자 11-14 "하루 30개로")');
  const reg = regE();
  for (const c of ['11110', '11260', '11350']) reg.addUnit(unitFile(c));
  const sgg = [...sggIds('seoul'), ...sggIds('gyeonggi')].slice(0, 35);
  const emd = [...ids('11110'), ...ids('11260'), ...ids('11350')].slice(0, 35);   // 동 몫(30)보다 많게
  const m: Mastery = Object.fromEntries([...sgg, ...emd].map((id) => [id, rec(1, T)]));
  const p0 = todayReview(reg, m, T, 0, 0, { rule: SEP });
  assert.deepEqual([p0.part, p0.due, p0.available, p0.round.length], ['sgg', 70, DAILY_CAP + EMD_DAILY_CAP, 10]);
  assert.ok(p0.round.every((id) => id.startsWith('kr:sgg:')));
  // 시·군·구 몫을 다 쓰면 동 판, 동 판은 단원별로 모으고 묶음에 단원 키
  const p1 = todayReview(reg, m, T, DAILY_CAP, 0, { rule: SEP });
  assert.equal(p1.part, 'emd');
  assert.deepEqual(p1.byRegion, [{ region: 'seoul', n: 10, unit: 'seoul/jongno-gu' }]);
  assert.equal(todayReview(reg, m, T, DAILY_CAP, EMD_DAILY_CAP, { rule: SEP }).round.length, 0, '동 몫도 다 씀');
  // 함께 셀 때(지금 규칙): 한 몫 30 에 섞인다
  const ps = todayReview(reg, m, T, 0, 0, { rule: SHARED });
  assert.deepEqual([ps.part, ps.available], ['all', DAILY_CAP]);
  // 복습 답: 동은 동 몫에, 시·군·구는 시·군·구 몫에
  const rd = createDeck('review', [{ mode: 'find', id: emd[0] }, { mode: 'find', id: sgg[0] }], { seed: 1 });
  const s1 = step(reg, rd, m, null, { result: 'correct' }, T, null, SEP);
  const s2 = step(reg, s1.deck, s1.mastery, s1.daily, { result: 'correct' }, T, s1.dailyEmd, SEP);
  assert.deepEqual([s2.daily.n, s2.dailyEmd.n], [1, 1]);
  const t2 = step(reg, step(reg, rd, m, null, { result: 'correct' }, T, null, SHARED).deck, m, { day: T, n: 1 }, { result: 'correct' }, T, null, SHARED);
  assert.deepEqual([t2.daily.n, t2.dailyEmd.n], [2, 0], '함께 셀 때는 모두 daily');
});

test('홈 차례(N32): 시·군·구 복습 → 시·군·구 다음 과(여유가 있을 때) → 동 복습 → 마지막 동 단원의 다음 과', () => {
  const reg = regE();
  reg.addUnit(unitFile('11110'));
  const emdDue: Mastery = Object.fromEntries(lessonOf('11110', 1).map((id) => [id, rec(1, T)]));
  const sggDue: Mastery = Object.fromEntries(sggLesson('seoul', 1).map((id) => [id, rec(1, T)]));
  const at = (more: Partial<HomeInput>) => homeCard(base(reg, { rule: SEP, last: 'seoul', ...more }));
  // ① 시·군·구 복습이 먼저
  assert.equal((at({ mastery: { ...sggDue, ...emdDue } }) as { byRegion: { unit?: string }[] }).byRegion[0].unit, undefined);
  // ② 시·군·구 복습이 없고 여유가 있으면 시·군·구 다음 과(동 복습이 막지 않는다 — 동을 많이 해도 추천은 시·군·구 몫만 본다)
  assert.deepEqual(at({ mastery: emdDue, dailyEmd: { day: T, n: EMD_DAILY_CAP } }), { type: 'next', region: 'seoul', lesson: 1, recommend: true, tomorrow: 6 });
  // ③ 여유가 없으면 동 복습
  const c3 = at({ mastery: emdDue, daily: { day: T, n: 25 } });
  assert.equal(c3.type, 'review');
  if (c3.type === 'review') assert.deepEqual([c3.count, c3.byRegion], [6, [{ region: 'seoul', n: 6, unit: 'seoul/jongno-gu' }]]);
  // ④ 마지막 공부가 동 단원이면: 시·군·구 복습 → 동 복습 → 그 단원의 다음 과
  const c4 = at({ mastery: emdDue, lastUnit: 'seoul/jongno-gu' });
  assert.equal(c4.type, 'review');
  if (c4.type === 'review') assert.deepEqual(c4.next, { region: 'seoul', lesson: 2, unit: 'seoul/jongno-gu' });
  const done = Object.fromEntries(lessonOf('11110', 1).map((id) => [id, rec(2, T + 2)]));
  assert.deepEqual(at({ mastery: done, lastUnit: 'seoul/jongno-gu', dailyEmd: { day: T, n: 24 } }), { type: 'next', region: 'seoul', lesson: 2, recommend: true, tomorrow: 0, unit: 'seoul/jongno-gu' });
  // ⑤ 동 몫을 다 써서 단원 과를 추천할 수 없으면(30 − 25 < 6) 시·군·구 몫이 남았을 때 시·군·구 다음 과를 추천한다(기본 'yield' — 동이 본 경로를 막지 않게)
  assert.deepEqual(at({ mastery: done, lastUnit: 'seoul/jongno-gu', dailyEmd: { day: T, n: 25 } }), { type: 'next', region: 'seoul', lesson: 1, recommend: true, tomorrow: 0 });
  // 시·군·구 몫도 없으면 N9 대로 단원 과(추천 없음)
  assert.deepEqual(at({ mastery: done, lastUnit: 'seoul/jongno-gu', daily: { day: T, n: 25 }, dailyEmd: { day: T, n: 25 } }), { type: 'next', region: 'seoul', lesson: 2, recommend: false, tomorrow: 0, unit: 'seoul/jongno-gu' });
  // 함께 셀 때(지금 규칙): 복습 판은 섞이고, 추천은 상한 30 하나로
  const shared = homeCard(base(reg, { rule: SHARED, last: 'seoul', mastery: { ...sggDue, ...emdDue } }));
  assert.equal(shared.type === 'review' && shared.count, 10);
});

test('단원 과와 시·군·구 다음 과가 겹칠 때(rule.unitNext): 동 몫을 다 써도 시·군·구 추천이 멈추지 않는다(기본 yield) · 견줌용 unit·sgg', () => {
  assert.equal(EMD_UNIT_NEXT, 'yield');
  assert.equal(REVIEW_RULE.unitNext, 'yield');
  const reg = regE();
  reg.addUnit(unitFile('11110'));
  // 서울 1과를 전에 칠함(복습은 모레) · 오늘 종로 1과를 배움(동 몫 30 을 다 씀) · 오늘 시·군·구 0
  const m: Mastery = Object.fromEntries([...sggLesson('seoul', 1).map((id) => [id, rec(2, T + 2)]), ...lessonOf('11110', 1).map((id) => [id, rec(1, T + 1)])]);
  const at = (unitNext: ReviewRule['unitNext'], more: Partial<HomeInput> = {}) =>
    homeCard(base(reg, { mastery: m, last: 'seoul', lastUnit: 'seoul/jongno-gu', dailyEmd: { day: T, n: EMD_DAILY_CAP }, rule: { ...SEP, unitNext }, ...more }));
  const tomorrow = lessonOf('11110', 1).length;
  // 기본(yield): 시·군·구 몫 30 이 남았으니 서울 2과를 추천(E4 첫 구현은 여기서 '오늘은 충분히'로 멈췄다)
  assert.deepEqual(at('yield'), { type: 'next', region: 'seoul', lesson: 2, recommend: true, tomorrow });
  assert.deepEqual(at(undefined), at('yield'), '기본값');
  assert.deepEqual(at('unit'), { type: 'next', region: 'seoul', lesson: 2, recommend: false, tomorrow, unit: 'seoul/jongno-gu' });
  assert.deepEqual(at('sgg'), at('yield'));
  // 동 몫이 남았으면 yield·unit 은 단원 과(N9), sgg 는 시·군·구 다음 과(N32 글자 그대로)
  const fresh = { dailyEmd: { day: T, n: 6 } };
  assert.deepEqual(at('yield', fresh), { type: 'next', region: 'seoul', lesson: 2, recommend: true, tomorrow, unit: 'seoul/jongno-gu' });
  assert.deepEqual(at('unit', fresh), at('yield', fresh));
  assert.deepEqual(at('sgg', fresh), { type: 'next', region: 'seoul', lesson: 2, recommend: true, tomorrow });
  // 복습 카드의 '복습 뒤 다음 과'도 같은 차례(시·군·구 복습이 있는 날)
  const withDue: Mastery = { ...m, [sggIds('seoul').at(-1)!]: rec(1, T) };
  const nx = (unitNext: ReviewRule['unitNext'], more: Partial<HomeInput> = {}) => { const c = at(unitNext, { mastery: withDue, ...more }); return c.type === 'review' ? c.next : c.type; };
  assert.deepEqual(nx('yield'), { region: 'seoul', lesson: 2 });
  assert.deepEqual(nx('unit'), { region: 'seoul', lesson: 2, unit: 'seoul/jongno-gu' });
  assert.deepEqual(nx('yield', fresh), { region: 'seoul', lesson: 2, unit: 'seoul/jongno-gu' });
  // 운영 형식(마지막 단원 없음)에서는 세 규칙이 같다
  for (const u of ['yield', 'unit', 'sgg'] as const) {
    assert.deepEqual(homeCard(base(reg, { mastery: m, last: 'seoul', rule: { ...SEP, unitNext: u } })), { type: 'next', region: 'seoul', lesson: 2, recommend: true, tomorrow });
  }
});

/* ---------- 저장 키(N16) ---------- */

test('새 저장 키: 기존 키의 모양·정규식은 그대로, 단원 키는 새 키에만', () => {
  const k = keys();
  assert.equal(k.lastUnit, 'kgq_lastunit_v1:p1');
  assert.equal(k.bestUnit, 'kgq_bestunit_v1:p1');
  assert.equal(k.dailyEmd, 'kgq_dailyemd_v1:p1');
  assert.equal(keys('p2').lastUnit, 'kgq_lastunit_v1:p2');
  for (const v of ['seoul/jongno-gu', 'gyeonggi/suwon-si-jangan-gu', 'chungbuk/43745', 'jeonnam-gwangju/gwangju-dong-gu']) assert.equal(checkLastUnit(v), v);
  for (const v of ['seoul', 'Seoul/jongno-gu', 'seoul/종로구', 'seoul/jongno-gu/x', '<s>/x', 'seoul/' + 'a'.repeat(41), 5, null]) assert.equal(checkLastUnit(v), null, String(v));
  // 옛 키 검사는 넓히지 않았다: 단원 키는 kgq_last_v1·kgq_best_v1 에서 버린다(되돌린 옛 앱과 같은 판정)
  assert.equal(checkLast('seoul/jongno-gu'), null);
  const b = { score: 10, total: 17, seconds: 60, day: T };
  assert.deepEqual(checkBests({ seoul: b, 'seoul/jongno-gu': b }), { seoul: b });
  assert.deepEqual(checkBestUnits({ seoul: b, 'seoul/jongno-gu': b, 'incheon/x-gu': { ...b, total: 0 } }), { 'seoul/jongno-gu': b });
  assert.deepEqual(checkDaily({ day: T, n: 4 }), { day: T, n: 4 }, 'kgq_dailyemd_v1 은 kgq_daily_v1 과 같은 모양');
});

/* ---------- 입구·영어 앱(N17·N26) ---------- */

test('units.json 에 emdUnits 가 없으면(동 공개 전·옛 캐시) 동 입구를 숨긴다: 지역의 동 단원이 없고 받을 것도 없다', async () => {
  const reg = createRegistry(geoNoEmd);
  assert.equal('emdUnits' in geoNoEmd.units, false);
  for (const r of ['seoul', 'incheon', 'gyeonggi']) assert.deepEqual(reg.emdUnits(r), []);
  assert.equal(reg.unit('seoul/jongno-gu'), undefined);
  const deck = createDeck('lesson', [{ mode: 'find', id: ids('11110')[0] }], { region: 'seoul/jongno-gu', lesson: 1, seed: 1 });
  assert.deepEqual(unitsToLoad(reg, { mastery: {}, deck, deck2: null, lastUnit: 'seoul/jongno-gu', daily: null, dailyEmd: null, today: T }), []);
  let called = 0;
  assert.deepEqual(await registerUnits(reg, ['seoul/jongno-gu'], async (c) => { called++; return unitFile(c); }, () => {}), []);
  assert.equal(called, 0);
  assert.equal(usableDeck(reg, deck), null, '동 판은 버린다(동 입구가 없으니 이어 할 곳도 없다)');
  // 색인이 있으면 지역마다 단원 목록
  const regI = regE();
  assert.deepEqual(['seoul', 'incheon', 'gyeonggi'].map((r) => regI.emdUnits(r).length), [3, 2, 0]);
  assert.deepEqual(regI.emdUnits('incheon').map((u) => [u.key, u.code]), [['incheon/geomdan-gu', '28290'], ['incheon/ongjin-gun', '28720']]);
});

test('동을 끈 창(관문이 닫힌 영어 앱 — EN_EMD 5.1, 2026-11-16 전 영어 앱)은 동 단원을 등록하지 않는다: 동 색인을 읽지 않고, 동 기록은 복습·홈 계산에서 빠진다(기록은 남음) · 관문이 열린 영어 앱은 한국어와 같다', async () => {
  const reg = regE(EN_OFF);
  assert.deepEqual(reg.emdUnits('seoul'), []);
  const m: Mastery = Object.fromEntries(ids('11110').map((id) => [id, rec(1, T)]));
  assert.equal(reg.known(ids('11110')[0]), false);
  assert.deepEqual(homeCard(base(reg, { mastery: m })), { type: 'new', region: 'seoul', lesson: 1 });
  assert.equal(todayReview(reg, m, T, 0).due, 0);
  const deck = createDeck('lesson', [{ mode: 'find', id: ids('11110')[0] }], { region: 'seoul/jongno-gu', lesson: 1, seed: 1 });
  assert.deepEqual(unitsToLoad(reg, { mastery: m, deck, deck2: null, lastUnit: 'seoul/jongno-gu', daily: null, dailyEmd: null, today: T }), []);
  assert.deepEqual(await registerUnits(reg, ['seoul/jongno-gu'], fetchFix, () => {}), []);
  assert.equal(emdOf(reg).length, 0);
  assert.equal(onMissingUnit(reg, deck), true, '한국어 앱에서 하던 동 판은 동을 끈 창이 지우지 않는다');
  // 같은 기록을 한국어 앱은 센다(처음 화면이 아니고, 오늘 복습 17곳)
  assert.notEqual(homeCard(base(regE(), { mastery: m })).type, 'new');
  assert.equal(todayReview(regE(), m, T, 0).due, ids('11110').length);
  // 관문이 열린 영어 앱(판 units.json enNames — EN_EMD 5.1)도 한국어와 같이 센다: 하던 동 판을 이어 할 수 있다(영어로 이어 하기, 8절 3)
  const en = regE(unitOptions('en', { enNames: true }));
  assert.deepEqual(en.emdUnits('seoul').map((u) => u.key), regE().emdUnits('seoul').map((u) => u.key));
  assert.notEqual(homeCard(base(en, { mastery: m })).type, 'new');
  assert.equal(todayReview(en, m, T, 0).due, ids('11110').length);
  assert.deepEqual(await registerUnits(en, ['seoul/jongno-gu'], fetchFix, () => {}), []);
  assert.equal(onMissingUnit(en, deck), false, '영어 앱도 동 판을 이어 한다');
  // 판에 enNames 가 없으면(배포 직후 옛 캐시 units.json) 영어 앱은 끈 창과 같다
  assert.deepEqual(unitOptions('en', {}), EN_OFF);
  assert.deepEqual(regE(unitOptions('en', {})).emdUnits('seoul'), []);
});

/* ---------- 작은 단원(N10) ---------- */

test('증평형(2곳) 단원: 고르기 보기는 단원 안에서만 나와 2개(이웃 단원에서 빌리지 않음)', () => {
  const reg = createRegistry(geo);
  const z = reg.addUnit(unitFile('43745'));
  // E13 부터 충북이 공개 지역이라 단원 키가 slug(chungbuk/jeungpyeong-gun — 전에는 코드 chungbuk/43745)
  assert.equal(z.key, 'chungbuk/jeungpyeong-gun');
  const both = z.items.map((it) => it.id).sort();
  for (const box of [0, 3]) {
    const q = lessonQuestions(reg, z.key, 1, () => box, rngFrom(7));
    const ch = q.filter((x) => x.mode === 'choose');
    assert.equal(ch.length, 1);
    assert.deepEqual([...ch[0].options!].sort(), both, `상자 ${box}: 보기 2개 = 단원의 두 곳`);
  }
  // 한 판을 끝까지(동 몫으로 셈)
  const d = createDeck('lesson', lessonQuestions(reg, z.key, 1, () => 0, rngFrom(8)), { region: z.key, lesson: 1, seed: 8 });
  const s = finish(reg, d, {});
  assert.ok(isDone(s.deck) && !current(s.deck));
  assert.equal(s.dailyEmd.n + s.daily.n, 2);
});

/* ---------- GA 값(N34, 보내는 곳은 E5) ---------- */

test('GA 값: unit sgg·emd·gu·sido, 동·일반구 단원은 unit_id', () => {
  const reg = regE();
  assert.deepEqual(gaUnit(reg, 'seoul'), { unit: 'sgg', region: 'seoul' });
  assert.deepEqual(gaUnit(reg, 'gyeonggi'), { unit: 'sgg', region: 'gyeonggi' });
  assert.deepEqual(gaUnit(reg, 'seoul/jongno-gu'), { unit: 'emd', region: 'seoul', unit_id: '11110' }, '등록 전(색인)');
  reg.addUnit(unitFile('11110'));
  assert.deepEqual(gaUnit(reg, 'seoul/jongno-gu'), { unit: 'emd', region: 'seoul', unit_id: '11110' }, '등록 뒤');
  assert.deepEqual(gaUnit(reg, 'gyeonggi/gu'), { unit: 'gu', region: 'gyeonggi', unit_id: '41' });
  assert.deepEqual(gaUnit(reg, 'korea'), { unit: 'sido', region: 'korea' });
});

/* ---------- 화면은 E5 — 지금 화면이 동 기록에 깨지지 않는가 ---------- */

test('동 기록·동 판·마지막 단원이 섞인 상태에서도 홈·지역 쪽·복습 없음 쪽이 그려진다(탭은 늘 지역)', async () => {
  const { unitPage, noReviewPage, regionsPage } = await import('../../src/app/ui/pages.ts');
  const reg = regE();
  for (const c of ['11110', '28290']) reg.addUnit(unitFile(c));
  const emdToday: Mastery = Object.fromEntries(lessonOf('11110', 1).map((id) => [id, rec(1, T)]));
  const sggToday: Mastery = Object.fromEntries(sggLesson('incheon', 1).map((id) => [id, rec(1, T)]));
  const learned: Mastery = Object.fromEntries(lessonOf('28290', 1).map((id) => [id, rec(2, T + 2)]));
  const lessonDeck = createDeck('lesson', lessonQuestions(reg, 'seoul/jongno-gu', 2, () => 0, rngFrom(2)), { region: 'seoul/jongno-gu', lesson: 2, seed: 2 });
  const states: Partial<Ctx>[] = [
    { mastery: emdToday, daily: { day: T, n: 25 }, last: 'seoul' },                                     // 동 복습 카드
    { mastery: { ...emdToday, ...sggToday }, last: 'incheon', lastUnit: 'incheon/geomdan-gu' },           // 시·군·구 복습 + 동 복습 기다림
    { mastery: learned, last: 'incheon', lastUnit: 'incheon/geomdan-gu' },                               // 단원 다음 과
    { mastery: learned, last: 'incheon', lastUnit: 'incheon/geomdan-gu', homeRegion: 'seoul' },          // 다른 탭
    { mastery: emdToday, lessonDeck: { ...lessonDeck, pos: 3 }, last: 'seoul', lastUnit: 'seoul/jongno-gu' },   // 동 과 이어서 하기
  ];
  for (const st of states) {
    const ctx = ctxOf(reg, st);
    const html = homePage(ctx).html;
    assert.ok(['seoul', 'incheon', 'gyeonggi'].includes(pressed(html)!), `탭은 지역: ${pressed(html)}`);
    assert.ok(!html.includes('undefined'));
    for (const r of ['seoul', 'incheon', 'gyeonggi']) assert.ok(!unitPage(ctx, r).html.includes('undefined'));
    assert.ok(noReviewPage(ctx).html.length > 0 && regionsPage(ctx).html.length > 0);
  }
});
