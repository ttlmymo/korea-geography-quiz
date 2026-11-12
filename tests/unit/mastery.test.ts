import { test } from 'node:test';
import assert from 'node:assert/strict';
import { afterLesson, afterPractice, afterReview, dayOf, get, isDue, levelOf, markFront, stageOf, type Mastery } from '../../src/app/core/mastery.ts';

const T = 20000;   // 아무 날 번호

test('날 번호는 현지 날짜', () => {
  assert.equal(dayOf(new Date(2026, 10, 6, 0, 1)), dayOf(new Date(2026, 10, 6, 23, 59)));
  assert.equal(dayOf(new Date(2026, 10, 7)) - dayOf(new Date(2026, 10, 6)), 1);
  assert.equal(dayOf(new Date(2027, 0, 1)) - dayOf(new Date(2026, 11, 31)), 1);
});

test('과를 마치면 상자 1, 바로 찾기로 맞힌 곳 2', () => {
  const m = afterLesson({}, ['a', 'b', 'c'], T, ['b']);
  assert.deepEqual([get(m, 'a').box, get(m, 'b').box, get(m, 'c').box], [1, 2, 1]);
  assert.equal(get(m, 'a').due, T + 1);
  assert.equal(get(m, 'b').due, T + 2);
  assert.equal(stageOf(get(m, 'a')), 'learning');
});

test('과를 다시 해도 높은 상자는 내려가지 않는다', () => {
  let m: Mastery = { a: { box: 4, due: T + 5, hi: 2, streak: 0, grad: false, front: false } };
  m = afterLesson(m, ['a'], T);
  assert.deepEqual(get(m, 'a'), { box: 4, due: T + 5, hi: 2, streak: 0, grad: false, front: false });
});

test('과에서 끝내 틀린 곳은 내일 복습 맨 앞', () => {
  const m = afterLesson({}, ['a', 'b'], T, ['a'], ['a']);
  assert.equal(get(m, 'a').box, 1);   // 바로 찾기로 맞혔어도 끝내 틀리면 1
  assert.equal(get(m, 'a').front, true);
  assert.equal(get(m, 'a').due, T + 1);
});

test('복습을 매번 맞히면 약 25일 만에 졸업(1·2·4·6·6·6일 간격)', () => {
  let m = afterLesson({}, ['a'], 0);
  let day = 0;
  const days: number[] = [];
  while (!get(m, 'a').grad) {
    day = get(m, 'a').due as number;
    days.push(day);
    m = afterReview(m, 'a', true, day);
    assert.ok(days.length < 10);
  }
  assert.deepEqual(days, [1, 3, 7, 13, 19, 25]);
  assert.equal(get(m, 'a').due, null);
  assert.equal(get(m, 'a').hi, 3);
  assert.equal(isDue(get(m, 'a'), 999), false);
});

test('복습에서 틀리면 2칸만 내리고(최소 1) 내일, 상자 5 연속은 끊긴다', () => {
  let m: Mastery = { a: { box: 5, due: T, hi: 3, streak: 1, grad: false, front: false } };
  m = afterReview(m, 'a', false, T);
  assert.deepEqual(get(m, 'a'), { box: 3, due: T + 1, hi: 3, streak: 0, grad: false, front: false });   // 칠한 색(hi)은 그대로
  m = afterReview(m, 'a', false, T + 1);
  assert.equal(get(m, 'a').box, 1);
  m = afterReview(m, 'a', false, T + 2);
  assert.equal(get(m, 'a').box, 1);
});

test('배치: 시험·전체 연습에서 상자 0 을 처음에 맞히면 상자 2, 그 밖의 맞힘은 그대로', () => {
  let m = afterPractice({}, 'a', true, T, true);
  assert.equal(get(m, 'a').box, 2);
  assert.equal(get(m, 'a').due, T + 2);
  assert.equal(get(m, 'a').hi, 1);
  m = afterPractice(m, 'a', true, T, true);
  assert.equal(get(m, 'a').box, 2);
  assert.equal(afterPractice({}, 'b', true, T, false).b, undefined);
});

test('정해진 날이 아닌 연습에서 틀리면 복습일만 내일로 당기고, 졸업한 곳은 상자 3', () => {
  let m: Mastery = { a: { box: 4, due: T + 6, hi: 2, streak: 0, grad: false, front: false }, g: { box: 5, due: null, hi: 3, streak: 2, grad: true, front: false } };
  m = afterPractice(m, 'a', false, T, true);
  assert.equal(get(m, 'a').box, 4);
  assert.equal(get(m, 'a').due, T + 1);
  m = afterPractice(m, 'g', false, T, true);
  assert.deepEqual(get(m, 'g'), { box: 3, due: T + 1, hi: 3, streak: 0, grad: false, front: false });
  assert.equal(afterPractice({}, 'z', false, T, true).z, undefined);   // 상자 0 은 그대로
});

test('지도 색 단계', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((b) => levelOf(b, false)), [0, 1, 1, 2, 2, 3]);
  assert.equal(levelOf(3, true), 3);
});

test('markFront 는 익히기 시작한 곳만', () => {
  const m = markFront({ a: { box: 2, due: T + 2, hi: 1, streak: 0, grad: false, front: false } }, ['a', 'b'], T);
  assert.equal(get(m, 'a').front, true);
  assert.equal(get(m, 'a').due, T + 1);
  assert.equal(m.b, undefined);
});
