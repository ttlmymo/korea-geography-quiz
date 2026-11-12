import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answer, createDeck, current, isDone, manualNext, progress, restoreDeck, summary, MAX_RETRY, RETRY_GAP, type Answer, type Deck } from '../../src/app/core/deck.ts';
import type { Question } from '../../src/app/core/questions.ts';

const finds = (...ids: string[]): Question[] => ids.map((id) => ({ mode: 'find', id }));
const ok: Answer = { result: 'correct' };
const bad = (tapped = 'x'): Answer => ({ result: 'wrong', tapped });

function run(d: Deck, plan: (q: Question) => Answer): Deck {
  let n = 0;
  while (!isDone(d)) {
    d = answer(d, plan(current(d)!));
    assert.ok(++n < 200);
  }
  return d;
}

test('모두 맞히면 끝, 요약은 첫 시도 전부', () => {
  const d = run(createDeck('lesson', [{ mode: 'meet', id: 'a' }, ...finds('a', 'b')], { region: 'seoul', lesson: 1, seed: 1 }), () => ok);
  assert.deepEqual(summary(d), { total: 2, firstTry: 2, confused: [], missed: [], placed: [] });
  assert.equal(current(d), null);
});

test('틀린 곳은 3문제 뒤 다시, 두 번까지, 그래도 틀리면 missed', () => {
  let d = createDeck('lesson', finds('a', 'b', 'c', 'd', 'e', 'f', 'g'), { seed: 1 });
  d = answer(d, bad('b'));
  assert.equal(d.queue.length, 8);
  assert.deepEqual(d.queue[1 + RETRY_GAP], { mode: 'find', id: 'a', retry: 1 });
  assert.deepEqual(d.log[0], { id: 'a', mode: 'find', result: 'wrong', hint: false, retry: 0, tapped: 'b' });
  d = run(d, (q) => (q.id === 'a' ? bad() : ok));
  assert.equal(d.queue.length, 7 + MAX_RETRY);
  assert.deepEqual(d.missed, ['a']);
  const s = summary(d);
  assert.equal(s.total, 7);
  assert.equal(s.firstTry, 6);
  assert.deepEqual(s.confused, ['a']);
});

test('끝 무렵에 틀리면 바로 뒤에 다시', () => {
  let d = createDeck('lesson', finds('a', 'b'), { seed: 1 });
  d = answer(d, ok);
  d = answer(d, { result: 'dontknow' });
  assert.deepEqual(current(d), { mode: 'find', id: 'b', retry: 1 });
});

test('시험은 다시 내지 않는다', () => {
  const d = run(createDeck('check', finds('a', 'b', 'c'), { region: 'seoul', seed: 1 }), (q) => (q.id === 'b' ? bad() : ok));
  assert.equal(d.queue.length, 3);
  assert.deepEqual(d.missed, []);
  assert.equal(summary(d).firstTry, 2);
});

test('힌트를 쓰고 맞히면 다시 내지 않지만 첫 시도 맞힘으로 세지 않는다', () => {
  const d = run(createDeck('lesson', finds('a', 'b'), { seed: 1 }), (q) => (q.id === 'a' ? { result: 'correct', hint: true } : ok));
  assert.equal(d.queue.length, 2);
  assert.equal(summary(d).firstTry, 1);
  assert.deepEqual(summary(d).confused, ['a']);
});

test('복습의 다시 낸 문제도 지도 범위를 지킨다', () => {
  const d = answer(createDeck('review', [{ mode: 'find', id: 'a', scope: 'wide' }], { seed: 1 }), bad());
  assert.equal(current(d)?.scope, 'wide');
});

test('바로 찾기: 첫 바퀴에서 틀린 곳만 만나기 → 찾기로 배운다', () => {
  const pass = (...ids: string[]): Question[] => ids.map((id) => ({ mode: 'find', id, pass: 1 }));
  let d = createDeck('quick', pass('a', 'b', 'c', 'd'), { region: 'seoul', lesson: 1, seed: 7 });
  d = answer(d, ok);
  d = answer(d, bad());
  d = answer(d, ok);
  assert.equal(d.queue.length, 4);
  d = answer(d, bad());
  assert.deepEqual(d.placed, ['a', 'c']);
  assert.deepEqual(d.toLearn, ['b', 'd']);
  assert.deepEqual(d.queue.slice(4, 6).map((q) => q.mode + q.id), ['meetb', 'meetd']);
  assert.deepEqual(d.queue.slice(6, 8).map((q) => q.mode + q.id).sort(), ['findb', 'findd']);
  assert.equal(d.queue.length, 10);
  d = run(d, () => ok);
  assert.deepEqual(summary(d).placed, ['a', 'c']);
});

test('바로 찾기를 다 맞히면 배울 것 없이 끝', () => {
  const d = run(createDeck('quick', [{ mode: 'find', id: 'a', pass: 1 }], { seed: 1 }), () => ok);
  assert.equal(d.queue.length, 1);
});

test('그곳을 처음 맞힌 두 번은 [다음]을 눌러 넘긴다', () => {
  let d = createDeck('lesson', finds('a', 'b', 'a', 'a'), { seed: 1 });
  d = answer(d, ok);
  assert.equal(manualNext(d, 'a'), true);
  d = answer(answer(d, ok), ok);
  assert.equal(manualNext(d, 'a'), true);
  d = answer(d, ok);
  assert.equal(manualNext(d, 'a'), false);
});

test('진행 표시와 저장·되살리기', () => {
  let d = createDeck('lesson', finds('a', 'b', 'c'), { region: 'seoul', lesson: 2, seed: 3 });
  d = answer(d, bad());
  assert.deepEqual(progress(d), { n: 2, total: 4 });
  const back = restoreDeck(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(back, d);
  assert.equal(restoreDeck(null), null);
  assert.equal(restoreDeck({ v: 2 }), null);
  assert.equal(restoreDeck({ ...d, pos: 99 }), null);
  assert.equal(restoreDeck({ ...d, queue: [{ mode: 'fly', id: 'a' }] }), null);
  assert.equal(restoreDeck({ ...d, kind: 'game' }), null);
});
