// 홈 화면 조립(homePage): 지역 탭과 주 카드가 어긋나지 않는지(합본 디자인 3.2 '지역 탭이 화면 전체를 바꾼다').
// 카드 차례(처음 → 이어서 → 복습 → 다 채움 → 다음 과)는 core/next.ts 그대로 — 여기서는 어느 탭에 무엇이 보이는지만 본다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../../src/app/core/deck.ts';
import type { Mastery, Rec } from '../../src/app/core/mastery.ts';
import type { Ctx } from '../../src/app/ui/ctx.ts';
import { homePage } from '../../src/app/ui/pages.ts';
import { geo, reg } from './fixtures.ts';

const T = 20000;
const rec = (box: number, due: number | null): Rec => ({ box, due, hi: box >= 5 ? 3 : box >= 3 ? 2 : box >= 1 ? 1 : 0, streak: 0, grad: false, front: false });
const lessonIds = (region: string, no: number) => reg.lesson(region, no)!.items;
/** 서울 1·2과를 칠함(복습은 모레) */
const seoul12 = (): Mastery => Object.fromEntries([...lessonIds('seoul', 1), ...lessonIds('seoul', 2)].map((id) => [id, rec(2, T + 2)]));
/** 서울 3과를 하다 만 판(8/23) */
const seoul3Deck = () => {
  const items = lessonIds('seoul', 3);
  const d = createDeck('lesson', Array.from({ length: 23 }, (_, i) => ({ mode: i < items.length ? 'meet' : 'find', id: items[i % items.length] }) as never), { region: 'seoul', lesson: 3, seed: 7 });
  return { ...d, pos: 7 };
};
const ctxOf = (o: Partial<Ctx>): Ctx => ({
  reg, geo, base: '/', ver: 'kr-20261001.1', storageOk: true, inApp: false,
  mastery: {}, lessonDeck: null, otherDeck: null, checkDeck: null, checkStart: 0,
  daily: null, last: null, settings: { autoNext: false }, homeRegion: null, bests: {},
  today: () => T, save() {}, go() {}, back() {}, render() {}, toast() {},
  ...o,
}) as Ctx;
const pressed = (html: string) => /data-arg="([a-z]+)" aria-pressed="true"/.exec(html)?.[1];
const label = (html: string) => /<p class="h-label">.*?<span>([^<]*)<\/span>/.exec(html)?.[1];
/** 진도 머리(…곳 중 …곳 채움) 오른쪽 글 */
const right = (html: string) => /<span class="h-pt num">[^<]*<\/span>(?:<span class="h-pr">([^<]*)<\/span>)?/.exec(html)?.[1] ?? '';

test('다른 지역에만 복습이 있는 날: 처음 탭은 그 지역, 진도 오른쪽은 그 지역 수', () => {
  // 마지막으로 공부한 곳은 서울인데 오늘 복습은 경기 1과 5곳뿐
  const m = { ...seoul12(), ...Object.fromEntries(lessonIds('gyeonggi', 1).map((id) => [id, rec(1, T)])) };
  const html = homePage(ctxOf({ mastery: m, last: 'seoul' })).html;
  assert.equal(pressed(html), 'gyeonggi');
  assert.equal(label(html), '오늘 복습 · 경기 5곳');
  assert.equal(right(html), '오늘 복습 5곳');
  assert.ok(!html.includes('h-pend'));
  assert.match(html, /class="btn h-go" href="#\/review" data-card="review"/);
});

test('고른 탭에 복습이 없으면: 복습은 맨 위 한 줄, 주 구역은 그 탭의 다음 과(바로 시작하지 않음)', () => {
  const m = { ...seoul12(), ...Object.fromEntries(lessonIds('gyeonggi', 1).map((id) => [id, rec(1, T)])) };
  const html = homePage(ctxOf({ mastery: m, last: 'seoul', homeRegion: 'seoul' })).html;
  assert.equal(pressed(html), 'seoul');
  assert.match(html, /<a class="h-pend" href="#\/review" data-card="review">.*오늘 복습 · 경기 5곳/);
  assert.equal(label(html), '다음 과 · 서울 3과');
  // 서울 진도 줄에 경기 복습 수를 붙이지 않는다
  assert.equal(right(html), '');
  // 주 구역 단추는 보조 모양으로 과 시작 카드에 간다. 측정 값 review 는 한 줄 쪽에만
  assert.match(html, /<a class="btn2 h-go" href="#\/kr\/seoul\/sgg\/p3" data-card="lesson">시작하기/);
  assert.ok(!html.includes('data-act="learn"'));
  assert.equal(html.match(/data-card="review"/g)?.length, 1);
  assert.ok(!html.includes('h-lc rec'));
});

test('하던 판이 다른 지역: 처음 탭은 그 판의 지역, 다른 탭을 고르면 이어서 하기는 한 줄', () => {
  const ctx = { mastery: seoul12(), lessonDeck: seoul3Deck(), last: 'gyeonggi' };
  const a = homePage(ctxOf(ctx)).html;
  assert.equal(pressed(a), 'seoul');
  assert.equal(label(a), '이어서 하기 · 서울 3과');
  assert.ok(!a.includes('h-pend'));

  const b = homePage(ctxOf({ ...ctx, homeRegion: 'incheon' })).html;
  assert.equal(pressed(b), 'incheon');
  assert.match(b, /<button class="h-pend" type="button" data-act="resume" data-card="resume">.*이어서 하기 · 서울 3과.*8\/23 문제/);
  assert.equal(label(b), '첫 과 · 인천 1과');
  // 하던 서울 3과를 덮지 않게 바로 시작하지 않는다
  assert.ok(!b.includes('data-act="learn"') && !b.includes('data-act="quick"'));
  assert.match(b, /href="#\/kr\/incheon\/sgg\/p1" data-card="lesson">시작하기/);
  // 칠한 곳이 없는 탭의 진도 머리는 수로, 지역 알아보기는 그 지역 허브
  assert.ok(b.includes('11곳 중 0곳 채움'));
  assert.match(b, /class="h-xl" href="\/incheon\/"><span class="h-xt">인천 2군 9구/);
});

test('처음 온 사람: 안내는 지도를 가리킨다, 바로 찾기·과 카드에는 새 측정 값', () => {
  const html = homePage(ctxOf({})).html;
  assert.equal(pressed(html), 'seoul');
  assert.ok(html.includes('공부한 곳이 지도에 칠해져요') && !html.includes('여기에'));
  assert.match(html, /data-act="learn" data-arg="seoul:1" data-card="new"/);
  assert.match(html, /data-act="quick" data-arg="seoul:1" data-card="quick"/);
  assert.equal(html.match(/data-card="lesson"/g)?.length, reg.region('seoul')!.lessons.length);
});
