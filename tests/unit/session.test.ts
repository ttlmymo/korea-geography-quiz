import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, current, type Answer, type Deck } from '../../src/app/core/deck.ts';
import { get, type Mastery } from '../../src/app/core/mastery.ts';
import { lessonQuestions, quickQuestions, reviewQuestions, type Question } from '../../src/app/core/questions.ts';
import { rngFrom } from '../../src/app/core/rng.ts';
import { step, usableDeck, type Step } from '../../src/app/core/session.ts';
import { reg } from './fixtures.ts';

const T = 20000;
const L1 = reg.lesson('seoul', 1)!.items;

/** 판을 끝까지: plan 이 답을 정한다. 문제마다 저장하는 것처럼 Step 을 이어 받는다 */
function play(deck: Deck, mastery: Mastery, plan: (q: Question) => Answer, today = T): Step {
  let s: Step = { deck, mastery, daily: { day: today, n: 0 }, finished: null };
  let n = 0;
  while (!s.finished) {
    const q = current(s.deck)!;
    s = step(reg, s.deck, s.mastery, s.daily, plan(q), today);
    assert.ok(++n < 300);
  }
  return s;
}

test('과: 답마다 숙달은 그대로, 끝나면 모두 상자 1 · 오늘 푼 수 +6', () => {
  const deck = createDeck('lesson', lessonQuestions(reg, 'seoul', 1, () => 0, rngFrom(1)), { region: 'seoul', lesson: 1, seed: 1 });
  let s = step(reg, deck, {}, null, { result: 'correct' }, T);
  assert.deepEqual(s.mastery, {});
  s = play(s.deck, s.mastery, () => ({ result: 'correct' }));
  for (const id of L1) assert.equal(get(s.mastery, id).box, 1);
  assert.equal(s.daily.n, 6);
  assert.equal(s.finished?.total, 17);   // 23 - 만나기 6
  assert.equal(s.finished?.firstTry, 17);
});

test('과: 끝내 틀린 곳은 내일 복습 맨 앞', () => {
  const target = L1[2];
  const deck = createDeck('lesson', lessonQuestions(reg, 'seoul', 1, () => 0, rngFrom(2)), { region: 'seoul', lesson: 1, seed: 2 });
  const s = play(deck, {}, (q) => (q.id === target && q.mode !== 'meet' ? { result: 'wrong', tapped: L1[0] } : { result: 'correct' }));
  assert.deepEqual(s.finished?.missed, [target]);
  assert.equal(get(s.mastery, target).front, true);
  assert.equal(get(s.mastery, L1[0]).front, false);
});

test('바로 찾기: 첫 바퀴에서 맞힌 곳은 바로 상자 2, 틀린 곳은 배운 뒤 상자 1', () => {
  const deck = createDeck('quick', quickQuestions(reg, 'seoul', 1, rngFrom(3)), { region: 'seoul', lesson: 1, seed: 3 });
  const wrong = new Set([L1[0], L1[3]]);
  // 첫 바퀴에서만 wrong 의 곳을 틀리고, 배우는 동안에는 맞힌다
  const plan = (q: Question): Answer => (q.pass && wrong.has(q.id) ? { result: 'wrong' } : { result: 'correct' });
  const firstId = current(deck)!.id;
  const s1 = step(reg, deck, {}, null, plan(current(deck)!), T);
  assert.equal(get(s1.mastery, firstId).box, wrong.has(firstId) ? 0 : 2);   // 첫 바퀴는 답마다 숙달에 반영
  const s = play(s1.deck, s1.mastery, plan);
  assert.equal(s.deck.queue.length, 6 + 6);   // 첫 바퀴 6 + 배우기(만나기 2·찾기 2·섞어 찾기 2)
  for (const id of L1) assert.equal(get(s.mastery, id).box, wrong.has(id) ? 1 : 2, id);
  assert.deepEqual(s.finished?.placed.slice().sort(), L1.filter((id) => !wrong.has(id)).sort());
});

test('복습: 첫 시도만 상자를 바꾸고, 다시 낸 문제는 세지 않는다', () => {
  const [a, b] = L1;
  const m: Mastery = { [a]: { box: 2, due: T, hi: 1, streak: 0, grad: false, front: false }, [b]: { box: 4, due: T, hi: 2, streak: 0, grad: false, front: false } };
  const deck = createDeck('review', reviewQuestions([a, b], (id) => get(m, id).box), { seed: 1 });
  let tries = 0;
  const s = play(deck, m, (q) => (q.id === b && tries++ < 3 ? { result: 'wrong' } : { result: 'correct' }));
  assert.equal(get(s.mastery, a).box, 3);
  assert.equal(get(s.mastery, a).due, T + 4);
  assert.equal(get(s.mastery, b).box, 2);         // 4 → 2, 다시 낸 문제를 맞혀도 그대로
  assert.equal(get(s.mastery, b).due, T + 1);
  assert.equal(get(s.mastery, b).front, true);    // 다시 두 번에도 틀림
  assert.equal(s.daily.n, 2);                     // 첫 시도만 센다
});

test('전체 연습·시험: 처음 보는 곳을 맞히면 배치(상자 2), 졸업한 곳을 틀리면 상자 3', () => {
  const [a, b, c] = L1;
  const m: Mastery = { [c]: { box: 5, due: null, hi: 3, streak: 2, grad: true, front: false } };
  const deck = createDeck('check', [a, b, c].map((id) => ({ mode: 'find' as const, id })), { region: 'seoul', seed: 1 });
  const s = play(deck, m, (q) => (q.id === a ? { result: 'correct' } : { result: 'wrong' }));
  assert.equal(get(s.mastery, a).box, 2);
  assert.equal(get(s.mastery, b).box, 0);
  assert.deepEqual(get(s.mastery, c), { box: 3, due: T + 1, hi: 3, streak: 0, grad: false, front: false });
  assert.equal(s.finished?.firstTry, 1);
  assert.equal(s.deck.queue.length, 3);
});

test('저장된 판이 지금 데이터에 맞지 않으면 버린다', () => {
  const d = createDeck('lesson', lessonQuestions(reg, 'seoul', 1, () => 0, rngFrom(1)), { region: 'seoul', lesson: 1, seed: 1 });
  assert.equal(usableDeck(reg, d), d);
  assert.equal(usableDeck(reg, null), null);
  assert.equal(usableDeck(reg, { ...d, lesson: 9 }), null);
  assert.equal(usableDeck(reg, { ...d, region: 'busan' }), null);
  assert.equal(usableDeck(reg, { ...d, queue: [...d.queue, { mode: 'find', id: 'kr:sgg:28110' }] }), null);   // 인천 옛 중구
  const choose = d.queue.find((q) => q.mode === 'choose')!;
  assert.equal(usableDeck(reg, { ...d, queue: [{ ...choose, options: ['kr:sgg:28110', ...choose.options!.slice(1)] }] }), null);
  const review = createDeck('review', reviewQuestions([L1[0]], () => 1), { seed: 1 });
  assert.equal(usableDeck(reg, review), review);
});
