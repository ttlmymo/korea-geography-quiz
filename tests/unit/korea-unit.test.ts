// 시·도 단원(계획서 NATIONWIDE_PLAN E10 · N7 · N26 · N27 · N29 · N30): 운영 판 units.json korea — 지역 표 korea 스위치·원고와 같음, 16곳 구성·칸 크기·위치 한 줄·범위,
// 레지스트리 등록(한국어 · 관문이 열린 영어 앱 — 2026-11-16 전 영어 앱은 싣지 않았다), 운영 형식 옛 저장값의 홈·복습 숫자가 korea 가 있어도 같음, 정적 쪽 설명(studyKo), 문제 문장, 전국 지도 이름표
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { get, type Mastery, type Rec } from '../../src/app/core/mastery.ts';
import { DAILY_CAP, EMD_DAILY_CAP, homeCard, NEW_SLACK, REVIEW_RULE, todayReview, type HomeCard, type ReviewRule } from '../../src/app/core/next.ts';
import { createDeck } from '../../src/app/core/deck.ts';
import { lessonQuestions } from '../../src/app/core/questions.ts';
import { rngFrom } from '../../src/app/core/rng.ts';
import { step } from '../../src/app/core/session.ts';
import { inside } from '../../src/app/map/poly.ts';
import { tomorrowCount } from '../../src/app/core/tally.ts';
import { gaUnit } from '../../src/app/core/units.ts';
import { createRegistry, unitOptions } from '../../src/app/registry.ts';
import { SIDOS } from '../../src/app/sidos.ts';
import type { Ctx } from '../../src/app/ui/ctx.ts';
import { homePage, regionsPage } from '../../src/app/ui/pages.ts';
import { setLang, UI_EN, UI_KO } from '../../src/app/text/ui.ts';
import { promptKo } from '../../src/app/text/ko.ts';
import type { Question } from '../../src/app/core/questions.ts';
import { LIVE, scopeEn, studyKo } from '../../src/lib/regions.ts';
import { DATA_VER } from '../../src/consts.ts';
import { buildShapes, specOf, type Topology } from '../../src/app/map/shapes.ts';
import { boxOf } from '../../src/app/map/project.ts';
import { fitView, viewBox } from '../../src/app/map/view.ts';
import { labelBox, placeLabels } from '../../src/app/map/labelfit.ts';
import { EN_OFF, LIVE_BY_OPEN, geo, geoNoKorea, reg } from './fixtures.ts';

const root = path.join(import.meta.dirname, '../..');
const read = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const TABLE = read('src/data/sido.json');
const SRC = read('src/data/units.json');
const LINES = read('src/data/place-lines.json');
const HARD: string[] = read('src/data/hard-words.json').words;
const K = geo.units.korea!;
const idOfKo = Object.fromEntries(SIDOS.map((s) => [s.ko, `kr:sido:${s.code}`]));
const T = 20000;
const rec = (box: number, due: number | null): Rec => ({ box, due, hi: box >= 5 ? 3 : box >= 3 ? 2 : box >= 1 ? 1 : 0, streak: 0, grad: false, front: false });
const ctxOf = (r = reg, o: Partial<Ctx> = {}): Ctx => ({
  reg: r, geo, base: '/', ver: DATA_VER, storageOk: true, inApp: false,
  mastery: {}, lessonDeck: null, otherDeck: null, checkDeck: null, checkStart: 0,
  daily: null, dailyEmd: null, last: null, lastUnit: null, settings: { autoNext: false }, homeRegion: null, bests: {}, bestUnits: {},
  today: () => T, save() {}, go() {}, back() {}, render() {}, toast() {},
  ...o,
}) as Ctx;

test('지역 표 korea 스위치 = 판 units.json korea(켜면 원고가 있고, 꺼져 있으면 판에 없음 — 미리보기 판은 이 시험 밖)', () => {
  assert.ok(['live', 'off'].includes(TABLE.korea.status));
  const manifest = read(`public/data/geo/${DATA_VER}/manifest.json`);
  if (manifest.preview) return;
  assert.equal(!!geo.units.korea, TABLE.korea.status === 'live');
  if (TABLE.korea.status === 'live') assert.ok(Array.isArray(SRC.korea?.lessons) && Array.isArray(SRC.korea?.screens));
});

test('시·도 단원 판: 16곳(지역 표 차례의 코드 전부), 곳 이름·slug 는 지역 표, 원고의 과·화면과 같은 구성·차례', () => {
  assert.deepEqual([K.key, K.layer, K.sido, K.ko], ['korea', 'sido', '00', '전국']);
  assert.deepEqual(K.items.map((it) => it.id).sort(), SIDOS.map((s) => `kr:sido:${s.code}`).sort());
  for (const it of K.items) {
    const s = SIDOS.find((x) => `kr:sido:${x.code}` === it.id)!;
    assert.deepEqual([it.ko, it.slug], [s.ko, s.key]);
  }
  assert.deepEqual(K.lessons.map((l) => [l.no, l.title, l.en, l.items]), SRC.korea.lessons.map((l: { no: number; title: string; en: string; items: string[] }) => [l.no, l.title, l.en, l.items.map((n) => idOfKo[n])]));
  assert.deepEqual(K.screens.map((s) => [s.key, s.ko, s.items]), SRC.korea.screens.map((s: { key: string; ko: string; items: string[] }) => [s.key, s.ko, s.items.map((n) => idOfKo[n])]));
  for (const list of [K.lessons, K.screens]) {
    const all = list.flatMap((x) => x.items);
    assert.equal(all.length, 16);
    assert.equal(new Set(all).size, 16);
  }
});

test('시·도 단원 판: 과·넓은 화면 16px 이상, 1곳 과 없음, 과 이름 12자 안·겹침 없음(N7)', () => {
  for (const l of K.lessons) {
    assert.ok(l.minTapPx >= 16, `${l.no}과 ${l.minTapPx}px`);
    assert.ok(l.items.length >= 2, `${l.no}과 ${l.items.length}곳`);
    assert.ok(l.title.length <= 12 && !/권역|도심/.test(l.title), l.title);
  }
  for (const s of K.screens) assert.ok(s.minTapPx >= 16, `${s.ko} ${s.minTapPx}px`);
  assert.equal(new Set(K.lessons.map((l) => l.title)).size, K.lessons.length);
  assert.ok(K.lessons.length >= 3 && K.lessons.length <= 6, `과 ${K.lessons.length}개(4개 안팎)`);
});

test('시·도 단원 판: 위치 한 줄 16곳 = 원고, 30자 안·금지 낱말 없음·명소 근거 없음(N27 — 지도 근거만)', () => {
  for (const it of K.items) {
    const e = LINES.korea[it.ko];
    assert.ok(e, it.ko);
    assert.equal(it.line, e.line);
    assert.ok(it.line.length > 0 && it.line.length <= 30, it.line);
    for (const w of HARD) assert.ok(!it.line.includes(w), `${it.ko}: ${w}`);
    assert.equal(e.at, undefined, `${it.ko}: 명소(at)는 OSM 대조 허락 뒤에만`);
    assert.ok(['touch', 'dir', 'side', 'size', 'coast', 'onlyDo', 'around', 'island', 'isles'].some((k) => k in e), `${it.ko}: 근거 없음`);
  }
});

test('시·도 단원 위치 한 줄: 섬 이름(isles)을 쓰면 그 섬이 그 곳이 든 과 지도에 보여야 한다 — 지금 원고는 과 범위 밖 섬(울릉도·독도·마라도)을 쓰지 않는다(E10 검수)', () => {
  // 3과(북동쪽) 범위의 동쪽 끝은 울릉도(130.8)·독도(131.87)보다 서쪽, 5과 범위의 남쪽 끝은 마라도(33.11)보다 북쪽이다. 파이프라인 koreaLive 가 점검 점으로 막는다
  const l3 = K.lessons.find((l) => l.items.includes('kr:sido:47'))!, l5 = K.lessons.find((l) => l.items.includes('kr:sido:50'))!;
  assert.ok(l3.fit[2] < 130.8 && l5.fit[1] > 33.12, `${JSON.stringify(l3.fit)} ${JSON.stringify(l5.fit)}`);
  for (const [ko, e] of Object.entries(LINES.korea) as [string, { line: string; isles?: string[] }][]) {
    if (ko.startsWith('_')) continue;
    assert.equal(e.isles, undefined, `${ko}: 섬 이름 근거`);
    assert.doesNotMatch(e.line, /울릉|독도|마라도|백령/, ko);
  }
  // 세종은 대전의 북서쪽(이름표 점 121° — 앱 방위 낱말 8칸으로 북서), 경북은 강원의 남쪽
  assert.equal(LINES.korea['세종'].line, '대전 북서쪽, 가장 작은 시·도');
  assert.equal(LINES.korea['경북'].line, '강원 남쪽, 가장 넓은 시·도');
});

test('시·도 단원 판: 단원 범위에 독도·백령도·마라도가 들고, 이름표 점·이웃은 16곳 모두(제주만 이웃 없음)', () => {
  const [w, s, e, n] = K.fit;
  assert.ok(e > 131.86 && w < 124.62 && s < 33.12 && n > 38.6, JSON.stringify(K.fit));
  for (const it of K.items) assert.equal(K.labels[it.id]?.length, 3, it.ko);
  const lonely = K.items.filter((it) => !(K.neighbors[it.id] ?? []).length).map((it) => it.ko);
  assert.deepEqual(lonely, ['제주']);
  assert.ok(K.neighbors['kr:sido:43'].includes('kr:sido:52'), '충북은 전북과도 맞닿는다(영동·무주)');
});

test('레지스트리: 운영 판은 시·도 단원을 등록(한국어) — 시·도 단원을 끈 창(관문이 닫힌 영어 앱 — 2026-11-16 전 영어 앱, Q5 · N26)은 싣지 않고 홈 탭·지역 고르기에도 없음 · 관문이 열린 영어 앱은 싣는다(EN_EMD 1.2)', () => {
  const k = reg.region('korea')!;
  assert.deepEqual([k.layer, k.items.length, reg.failed.length], ['sido', 16, 0]);
  assert.match(reg.place('kr:sido:47')!.item.line, /가장 넓은/);
  assert.deepEqual(gaUnit(reg, 'korea'), { unit: 'sido', region: 'korea' });
  const en = createRegistry(geo, EN_OFF);
  assert.equal(en.region('korea'), undefined);
  setLang('en');
  try {
    const h = homePage(ctxOf(en)).html;
    // 끈 창은 과 없는 지역(세종·제주)을 싣지 않고(N26, E12) 지역이 넷을 넘어 접힌다: 공개 차례 서울·인천·경기 + More. 전국 탭은 없다
    assert.deepEqual([...h.matchAll(/data-act="homeRegion" data-arg="([a-z-]+)"/g)].map((x) => x[1]), ['seoul', 'incheon', 'gyeonggi']);
    assert.match(h, /h-tab go/);
    assert.doesNotMatch(h, /korea|Korea<\/span>/);
    assert.doesNotMatch(regionsPage(ctxOf(en)).html, /rg-kr|#\/kr\/korea/);
    // 관문이 열린 영어 앱: 시·도 단원이 지역 고르기 '시·도 한눈에'에 있고, 곳 이름은 지역 표 영어 이름('Jeonnam-Gwangju' — 주소 이름 'Jeonnam-gwangju' 가 아님)
    const on = createRegistry(geo, unitOptions('en', geo.units));
    const ko = on.region('korea')!;
    assert.equal(ko.items.length, 16);
    assert.match(regionsPage(ctxOf(on)).html, /rg-kr[\s\S]*#\/kr\/korea/);
    assert.deepEqual(ko.items.map((it) => UI_EN.name(it)).sort(), SIDOS.map((s) => s.en).sort());
    assert.deepEqual(ko.items.map((it) => UI_EN.short(it)).sort(), SIDOS.map((s) => s.en).sort(), '짧은 이름도 줄이지 않는다');
    assert.equal(UI_EN.prompt(on, 'choose', 'kr:sido:11', (s) => s), 'Which province or city is outlined?');
    assert.deepEqual(ko.lessons.map((l) => UI_EN.lessonCount(ko, l.items)), ko.lessons.map((l) => `${l.items.length} ${l.items.length === 1 ? 'province or city' : 'provinces and cities'}`));
    assert.equal(UI_EN.unitName(on, 'korea'), 'Korea');
  } finally { setLang('ko'); }
});

test('문제 문장: 시·도 단원의 고르기는 \'무슨 시·도일까요?\'(곳 이름 끝 글자로 모으면 대구의 \'구\'가 잡힌다), 만나기는 위치 한 줄', () => {
  assert.equal(UI_KO.promptParts(reg, 'choose', 'kr:sido:27').post, '테두리 친 칸은 무슨 시·도일까요?');
  assert.equal(UI_KO.prompt(reg, 'choose', 'kr:sido:11', (x) => x), '테두리 친 칸은 무슨 시·도일까요?');
  assert.equal(promptKo(reg, { mode: 'choose', id: 'kr:sido:50' } as Question).band, '테두리 친 칸은 무슨 시·도일까요?');
  assert.equal(UI_KO.line(reg, 'kr:sido:50'), '우리나라 남쪽 끝 섬');
  // 지역 과는 그대로(서울 '구')
  assert.equal(UI_KO.promptParts(reg, 'choose', reg.regions[0].items[0].id).post, '테두리 친 칸은 무슨 구일까요?');
});

test('운영 형식 옛 저장값(시·도 기록 없음): 홈 카드·오늘 복습·내일 수가 korea 가 있어도 E9 판과 같다(공통 조건 3)', () => {
  const r0 = createRegistry(geoNoKorea);
  const L = (key: string, i: number) => geo.units.regions.find((x) => x.key === key)!.lessons[i].items;
  const mix: Mastery = {};
  L('seoul', 0).forEach((id) => { mix[id] = rec(2, T); });
  L('seoul', 1).forEach((id) => { mix[id] = rec(5, null); });
  L('incheon', 0).forEach((id) => { mix[id] = rec(3, T + 1); });
  L('gyeonggi', 0).forEach((id, i) => { mix[id] = rec(1, i % 2 ? T : T - 3); });
  const states: [Mastery, string | null][] = [[{}, null], [mix, 'seoul'], [mix, 'gyeonggi'], [Object.fromEntries(L('seoul', 0).map((id) => [id, rec(2, T + 2)])), 'seoul']];
  for (const [m, last] of states) {
    for (const r of [reg, r0]) assert.ok(r.regions.length === LIVE_BY_OPEN.length);   // E11 부터 부산, E12 부터 대구·대전·울산·세종, E13 부터 충북·제주·강원·전북, E14·E15(합친 판)부터 충남·경북·경남이 든다
    const a = homeCard({ reg, mastery: m, deck: null, daily: null, last, today: T }), b = homeCard({ reg: r0, mastery: m, deck: null, daily: null, last, today: T });
    assert.deepEqual(a, b);
    assert.deepEqual(todayReview(reg, m, T, 0), todayReview(r0, m, T, 0));
    assert.equal(tomorrowCount(reg, m, T), tomorrowCount(r0, m, T));
  }
});

test('정적 쪽 설명(E10 완료 조건 6): 시·도 단원이 열리면 홈·소개 설명에 전국 16개 시·도 — 영어는 그대로', () => {
  // E12 부터 공개 지역은 여덟 곳, E13 부터 열두 곳(서울·부산·대구·인천·대전·울산·세종·경기·충북·제주·강원·전북 — 지역 표 차례). 넷을 넘으면 공개 차례(openOrder) 앞 셋 + '등 12개 시·도'(E12 검수)
  // E14 부터 수는 지역 표 공개 지역에서 센다(E13 12 · E14 14)
  // E16 에 열여섯 곳을 모두 열면 '전국 16개 시·도의 시·군·구'·'전국 16개 시·도와 시·군·구'
  const allOpen = LIVE.length === SIDOS.length;
  assert.equal(studyKo(false), allOpen ? '전국 16개 시·도의 시·군·구' : `서울·인천·경기 등 ${LIVE.length}개 시·도의 시·군·구`);
  assert.equal(studyKo(true), allOpen ? '전국 16개 시·도와 시·군·구' : `서울·인천·경기 등 ${LIVE.length}개 시·도의 시·군·구와 전국 16개 시·도`);
  assert.equal(studyKo(true, SIDOS), '전국 16개 시·도와 시·군·구');
  assert.equal(studyKo(false, SIDOS), '전국 16개 시·도의 시·군·구');
  assert.deepEqual(LIVE.map((s) => s.key).sort(), [...LIVE_BY_OPEN].sort());
  assert.equal(LIVE.length, geo.units.regions.length);
  // 영어는 영문 확인 전 지역만 빼고 센다. 2026-11-16 부터 세종·제주(과 없는 지역)도 센다 — 영어 앱에도 동 단원이 열림(EN_EMD 7.1). 전에는 빼서 E15 까지 10 · E16 11
  const enLive = LIVE.filter((s) => s.enChecked).length;
  assert.equal(scopeEn(), enLive === SIDOS.length ? `all ${SIDOS.length} provinces and cities of Korea` : `Seoul, Incheon, Gyeonggi and ${enLive - 3} more regions`);
});

test('전국 시·도 지도 이름표(E10 — E8 이 넘긴 이름표 방식): 16곳을 꼭 보이게(must) 놓으면 휴대폰 칸에서도 하나도 빠지지 않고, 흰 판끼리 겹치지 않으며, 판은 되도록 제 칸 위(plateHome)', () => {
  // 둘러보기·지역 고르기·전국 홈 지도는 시·도 이름을 must 로 놓는다(fit 이면 안쪽 작은 칸 서울·세종·대전·대구가 빠진다).
  // 네 쪽이 모두 막힌 이름표는 가리는 넓이가 가장 작은 쪽에 둔다(전에는 늘 위 — 휴대폰에서 충북 판이 '경기'를 덮었다).
  // 전국 시·도 지도는 판을 되도록 제 칸 위에 둔다(E10 검수 — 둘러보기 390 에서 '충북' 판이 경기·충남 경계 위, '충남' 판이 전북 바로 위에 놓였다).
  // 판 가운데가 남의 시·도 칸 위인 이름은 칸이 판보다 작은 곳(내접원 지름이 판 높이보다 작음 — 서울·세종·대전 등)뿐이어야 한다
  const topo = read(`public/data/geo/${DATA_VER}/sido.topo.json`) as Topology;
  const s = buildShapes(topo, specOf(reg.region('korea')!), K.labels);
  const ids = K.items.map((it) => it.id);
  // [폭, 높이, 여백, 글자] — 358 은 과 화면 검사 칸, 390×787·375×760 은 휴대폰 둘러보기 지도 칸(여백 12, 글자 14)
  const cases: [number, number, number, number][] = [[358, 440, 14, 15], [358, 560, 14, 15], [390, 787, 12, 14], [375, 760, 12, 14], [760, 760, 14, 15]];
  const strayOf = (res: ReturnType<typeof placeLabels>) => res.filter((p) => p.out?.plate && ids.some((o) => o !== p.id && inside(s.cells.get(o)!.rings, p.x, p.y))).map((p) => p.id);
  let caughtBefore = 0;
  for (const [w, h, pad, px] of cases) {
    const v = fitView(boxOf(K.fit), { w, h }, { t: pad, r: pad, b: pad, l: pad });
    const [x, y, vw, vh] = viewBox(v, { w, h });
    const asks = K.items.map((it) => ({ id: it.id, ...labelBox(it.ko, px) }));
    const opt = {
      mode: 'must' as const, u: v.u, obstacles: s.ids.map((id) => ({ rings: s.cells.get(id)!.rings, box: s.cells.get(id)!.box })),
      within: [x + 4 * v.u, y + 4 * v.u, x + vw - 4 * v.u, y + vh - 4 * v.u] as [number, number, number, number], center: [(s.box[0] + s.box[2]) / 2, (s.box[1] + s.box[3]) / 2] as [number, number],
    };
    const res = placeLabels((id) => s.cells.get(id), asks, { ...opt, plateHome: true });
    assert.equal(res.length, 16, `${w}x${h}`);
    const bx = res.map((p) => { const a = asks.find((q) => q.id === p.id)!; return [p.x - (a.w * v.u) / 2, p.y - (a.h * v.u) / 2, p.x + (a.w * v.u) / 2, p.y + (a.h * v.u) / 2]; });
    let over = 0;
    for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++) {
      const ow = Math.min(bx[i][2], bx[j][2]) - Math.max(bx[i][0], bx[j][0]), oh = Math.min(bx[i][3], bx[j][3]) - Math.max(bx[i][1], bx[j][1]);
      if (ow > 0 && oh > 0) over += (ow * oh) / (v.u * v.u);
    }
    // E9(늘 위)는 358 폭에서 831px², E10 구현(가장 덜 겹치는 쪽)은 142px², 판을 제 칸·점 가까이 두는 지금은 0
    assert.ok(over < 1, `${w}x${h}: 이름표끼리 겹친 넓이 ${over.toFixed(0)}px²`);
    const plateH = asks[0].h;
    for (const id of strayOf(res)) assert.ok((2 * s.cells.get(id)!.r) / v.u < plateH, `${w}x${h}: ${reg.place(id)!.item.ko} 판이 남의 칸 위(칸 지름 ${((2 * s.cells.get(id)!.r) / v.u).toFixed(0)}px)`);
    // 이 시험이 잡는 것: plateHome 을 끄면(E10 구현의 차례) 큰 칸(충북 등)의 판이 남의 칸 위에 간다
    caughtBefore += strayOf(placeLabels((id) => s.cells.get(id), asks, opt)).filter((id) => (2 * s.cells.get(id)!.r) / v.u >= plateH).length;
  }
  assert.ok(caughtBefore > 0, 'plateHome 없이는 큰 칸 판이 남의 칸 위에 가는 경우가 있어야 이 시험이 뜻이 있다');
});

test('하루 몫(N32 — 시·도 단원은 시·군·구 몫): 과를 끝내면 daily 만 늘고, 시·도 복습은 시·군·구 판(지역 korea), 몫이 모자라면 korea 다음 과를 추천하지 않는다', () => {
  const SEP: ReviewRule = { separate: true, emdCap: EMD_DAILY_CAP };
  const k1 = reg.lesson('korea', 1)!.items;
  for (const rule of [SEP, REVIEW_RULE]) {
    const deck = createDeck('lesson', lessonQuestions(reg, 'korea', 1, () => 0, rngFrom(1)), { region: 'korea', lesson: 1, seed: 1 });
    let s = step(reg, deck, {}, null, { result: 'correct' }, T, null, rule);
    let n = 0;
    while (!s.finished) { s = step(reg, s.deck, s.mastery, s.daily, { result: 'correct' }, T, s.dailyEmd, rule); assert.ok(++n < 300); }
    assert.deepEqual([s.daily.n, s.dailyEmd.n], [k1.length, 0]);
    for (const id of k1) assert.equal(get(s.mastery, id).box, 1);
  }
  // 복습 기한이 된 시·도 기록은 시·군·구 판(동 몫으로 넘어가지 않는다)
  const due: Mastery = Object.fromEntries(k1.map((id) => [id, rec(1, T)]));
  const p = todayReview(reg, due, T, 0, 0, { rule: SEP });
  assert.equal(p.part, 'sgg');
  assert.deepEqual([...p.round].sort(), [...k1].sort());
  assert.deepEqual(p.byRegion.map((b) => [b.region, b.unit]), [['korea', undefined]]);
  assert.equal(todayReview(reg, due, T, DAILY_CAP, 0, { rule: SEP }).round.length, 0, '시·군·구 몫을 다 쓰면 시·도 복습도 없다');
  // korea 탭(마지막 지역 korea)의 다음 과: 시·군·구 몫 여유(DAILY_CAP − 오늘 수)가 NEW_SLACK 아래면 추천하지 않고, 동 몫은 상관없다
  const after: Mastery = Object.fromEntries(k1.map((id) => [id, rec(1, T + 1)]));
  const pick = (c: HomeCard) => (c.type === 'next' ? [c.type, c.region, c.lesson, c.recommend] : [c.type]);
  const at = (n: number, emd = 0) => pick(homeCard({ reg, mastery: after, deck: null, daily: { day: T, n }, dailyEmd: { day: T, n: emd }, last: 'korea', today: T, rule: SEP }));
  assert.deepEqual(at(0), ['next', 'korea', 2, true]);
  assert.deepEqual(at(DAILY_CAP - NEW_SLACK), ['next', 'korea', 2, true]);
  assert.deepEqual(at(DAILY_CAP - NEW_SLACK + 1), ['next', 'korea', 2, false]);
  assert.deepEqual(at(0, EMD_DAILY_CAP), ['next', 'korea', 2, true]);
});
