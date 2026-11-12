import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answer, createDeck } from '../../src/app/core/deck.ts';
import { afterLesson, type Mastery, type Rec } from '../../src/app/core/mastery.ts';
import { homeCard, nextLesson, regionDone, todayReview, DAILY_CAP, ROUND, type HomeInput } from '../../src/app/core/next.ts';
import { reg } from './fixtures.ts';

const T = 20000;
const ids = (region: string) => reg.region(region)!.items.map((it) => it.id);
const lessonIds = (region: string, no: number) => reg.lesson(region, no)!.items;
const rec = (box: number, due: number | null, more: Partial<Rec> = {}): Rec => ({ box, due, hi: box >= 3 ? 2 : 1, streak: 0, grad: false, front: false, ...more });
const base = (more: Partial<HomeInput> = {}): HomeInput => ({ reg, mastery: {}, deck: null, daily: null, last: null, today: T, ...more });

test('처음 온 사람(기록을 못 읽을 때도): 서울 1과', () => {
  assert.deepEqual(homeCard(base()), { type: 'new', region: 'seoul', lesson: 1 });
  // 지금 데이터에 없는 곳의 기록만 있으면 처음과 같다
  assert.equal(homeCard(base({ mastery: { 'kr:sgg:99999': rec(2, T) } })).type, 'new');
});

test('진행 중인 과가 있으면 이어서 하기(오늘 복습 수를 함께)', () => {
  let d = createDeck('lesson', [{ mode: 'find', id: 'a' }, { mode: 'find', id: 'b' }], { region: 'seoul', lesson: 2, seed: 1 });
  d = answer(d, { result: 'correct' });
  const m = afterLesson({}, lessonIds('seoul', 1), T - 1);
  assert.deepEqual(homeCard(base({ deck: d, mastery: m })), { type: 'resume', kind: 'lesson', region: 'seoul', lesson: 2, n: 2, total: 2, review: 6 });
  // 처음 과를 하다 멈춰도 이어서 하기
  assert.equal(homeCard(base({ deck: d })).type, 'resume');
  // 시험은 이어서 하지 않는다(시간을 잼)
  const c = createDeck('check', [{ mode: 'find', id: 'a' }], { region: 'seoul', seed: 1 });
  assert.equal(homeCard(base({ deck: c, mastery: m })).type, 'review');
});

test('오늘 복습: 최대 10곳, 지역별로 모으고, 다음 과를 함께 알린다', () => {
  let m: Mastery = afterLesson({}, lessonIds('seoul', 1), T - 1);
  m = afterLesson(m, lessonIds('gyeonggi', 1), T - 1);
  const card = homeCard(base({ mastery: m, last: 'gyeonggi' }));
  assert.equal(card.type, 'review');
  if (card.type !== 'review') return;
  assert.equal(card.count, ROUND);
  assert.deepEqual(card.byRegion, [{ region: 'seoul', n: 6 }, { region: 'gyeonggi', n: 4 }]);
  assert.deepEqual(card.next, { region: 'gyeonggi', lesson: 2 });
});

test('복습 차례: 끝내 틀린 곳 → 오래 밀린 곳 → 낮은 상자, 그다음 지역별로 모음', () => {
  const [s1, s2, s3] = ids('seoul');
  const [g1, g2] = ids('gyeonggi');
  const m: Mastery = {
    [s1]: rec(4, T),
    [g1]: rec(2, T - 3),
    [s2]: rec(1, T),
    [g2]: rec(3, T, { front: true }),
    [s3]: rec(2, T + 1),           // 내일 → 오늘은 아님
  };
  const plan = todayReview(reg, m, T, 0);
  assert.equal(plan.due, 4);
  // 우선순위: g2(front) → g1(3일 밀림) → s2(상자 1) → s1(상자 4); 지역은 처음 나온 차례(경기 → 서울)로 모은다
  assert.deepEqual(plan.round, [g2, g1, s2, s1]);
});

test('하루 상한 30: 오늘 이미 푼 만큼 줄고, 다 차면 복습 카드가 나오지 않는다', () => {
  const m: Mastery = {};
  for (const id of [...ids('seoul'), ...ids('gyeonggi')].slice(0, 40)) m[id] = rec(1, T);
  assert.equal(todayReview(reg, m, T, 0).available, DAILY_CAP);
  assert.equal(todayReview(reg, m, T, 25).available, 5);
  assert.equal(todayReview(reg, m, T, 25).round.length, 5);
  // 서울 25곳은 다 칠했으니 경기에서 이어 간다
  const card = homeCard(base({ mastery: m, last: 'gyeonggi', daily: { day: T, n: DAILY_CAP } }));
  assert.equal(card.type, 'next');
  if (card.type === 'next') assert.equal(card.recommend, false);
  assert.equal(homeCard(base({ mastery: m, last: 'seoul', daily: { day: T, n: DAILY_CAP } })).type, 'done');
  // 어제 푼 수는 오늘 상한에 들지 않는다
  assert.equal(homeCard(base({ mastery: m, daily: { day: T - 1, n: DAILY_CAP } })).type, 'review');
});

test('다음 과: 복습이 끝났고 여유가 6 이상이면 추천, 내일 복습 수', () => {
  const m = afterLesson({}, lessonIds('seoul', 1), T);   // 오늘 마침 → 내일 복습
  assert.deepEqual(homeCard(base({ mastery: m, daily: { day: T, n: 6 } })), { type: 'next', region: 'seoul', lesson: 2, recommend: true, tomorrow: 6 });
  const tight = homeCard(base({ mastery: m, daily: { day: T, n: 25 } }));
  assert.equal(tight.type === 'next' && tight.recommend, false);
});

test('지역을 다 칠하면 도장 카드, 남은 지역을 알린다', () => {
  let m: Mastery = {};
  for (const l of reg.region('seoul')!.lessons) m = afterLesson(m, l.items, T);
  assert.equal(regionDone(reg, m, 'seoul'), true);
  assert.equal(nextLesson(reg, m, 'seoul'), null);
  assert.deepEqual(homeCard(base({ mastery: m, last: 'seoul', daily: { day: T, n: 25 } })), { type: 'done', region: 'seoul', more: ['incheon', 'gyeonggi'] });
  // 다른 지역을 시작하면 그 지역의 다음 과
  const m2 = afterLesson(m, lessonIds('incheon', 1), T);
  const card = homeCard(base({ mastery: m2, last: 'incheon' }));
  assert.equal(card.type === 'next' && card.lesson, 2);
});

test('배치로 칠한 과는 건너뛴다', () => {
  let m: Mastery = afterLesson({}, lessonIds('seoul', 1), T);
  m = afterLesson(m, lessonIds('seoul', 2), T, lessonIds('seoul', 2));
  assert.equal(nextLesson(reg, m, 'seoul'), 3);
});
