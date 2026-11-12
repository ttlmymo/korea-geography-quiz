import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allQuestions, chooseOptions, learnQuestions, lessonQuestions, quickQuestions, reviewQuestions, type Question } from '../../src/app/core/questions.ts';
import { rngFrom } from '../../src/app/core/rng.ts';
import { reg, idOf } from './fixtures.ts';

const box0 = () => 0;
const count = (q: Question[], mode: string) => q.filter((v) => v.mode === mode).length;

function noRepeat(q: Question[]) {
  for (let i = 1; i < q.length; i++) assert.notEqual(q[i].id, q[i - 1].id, `${i}번째에 같은 곳이 이어짐`);
}

test('과 문제 수: 6곳 23 · 5곳 19 · 4곳 15 · 3곳 11, 모든 지역·과·씨앗에서 규칙을 지킨다', () => {
  const want: Record<number, number> = { 6: 23, 5: 19, 4: 15, 3: 11 };
  for (const r of reg.regions) for (const l of r.lessons) for (const seed of [1, 2, 3, 42, 777]) {
    const q = lessonQuestions(reg, r.key, l.no, box0, rngFrom(seed));
    const n = l.items.length;
    assert.equal(q.length, want[n], `${r.key} ${l.no}과`);
    assert.equal(count(q, 'meet'), n);
    assert.equal(count(q, 'choose'), Math.floor(n / 2));
    noRepeat(q);
    // 어느 곳이든 만나기 전에 찾기·고르기로 나오지 않는다
    const met = new Set<string>();
    for (const v of q) {
      if (v.mode === 'meet') met.add(v.id);
      else assert.ok(met.has(v.id), `${r.key} ${l.no}과: 만나기 전에 ${v.mode}`);
    }
    // 마무리는 모든 곳을 한 번씩
    assert.deepEqual(q.filter((v) => v.final).map((v) => v.id).sort(), [...l.items].sort());
  }
});

test('같은 씨앗이면 같은 차례', () => {
  assert.deepEqual(lessonQuestions(reg, 'seoul', 1, box0, rngFrom(9)), lessonQuestions(reg, 'seoul', 1, box0, rngFrom(9)));
});

test('고르기 보기: 처음에는 다른 과의 먼 곳', () => {
  const id = idOf('마포구');
  const lesson = reg.place(id)!.lesson.items;
  for (const seed of [1, 2, 3, 4, 5]) {
    const o = chooseOptions(reg, id, 0, rngFrom(seed));
    assert.equal(o.length, 4);
    assert.equal(new Set(o).size, 4);
    assert.ok(o.includes(id));
    for (const v of o.filter((v) => v !== id)) {
      assert.ok(!lesson.includes(v), '같은 과가 보기로 나옴');
      assert.equal(reg.place(v)!.region.key, 'seoul');
      assert.ok(reg.dist(id, v) > 8, `${v} 가 가까움`);
    }
  }
});

test('고르기 보기: 상자 3 이상이면 이웃', () => {
  const id = idOf('마포구');
  const o = chooseOptions(reg, id, 3, rngFrom(1)).filter((v) => v !== id);
  for (const v of o) assert.ok(reg.adjacent(id, v), `${v} 는 이웃이 아님`);
});

test('고르기 보기: 곳이 적은 인천 섬 과도 4개를 채운다', () => {
  for (const name of ['영종구', '강화군', '옹진군']) {
    const o = chooseOptions(reg, idOf(name), 0, rngFrom(3));
    assert.equal(new Set(o).size, 4);
    assert.ok(o.every((v) => reg.place(v)!.region.key === 'incheon'));
  }
});

test('바로 찾기·배우기·전체·복습 차례', () => {
  const quick = quickQuestions(reg, 'seoul', 1, rngFrom(1));
  assert.equal(quick.length, 6);
  assert.ok(quick.every((v) => v.mode === 'find' && v.pass === 1));

  const learn = learnQuestions(['a', 'b'], rngFrom(1));
  assert.deepEqual(learn.slice(0, 2).map((v) => v.mode + v.id), ['meeta', 'meetb']);
  assert.deepEqual(learn.slice(2, 4).map((v) => v.mode + v.id).sort(), ['finda', 'findb']);
  assert.equal(learn.length, 6);
  noRepeat(learn);
  assert.equal(learnQuestions(['a'], rngFrom(1)).length, 2);

  const all = allQuestions(reg, 'gyeonggi', rngFrom(5));
  assert.equal(all.length, 31);
  assert.equal(new Set(all.map((v) => v.id)).size, 31);
  noRepeat(all);
  const ids = reg.region('gyeonggi')!.items.map((it) => it.id);
  const grouped = allQuestions(reg, 'gyeonggi', rngFrom(5), [ids.slice(0, 15), ids.slice(15)]);
  assert.deepEqual(grouped.slice(0, 15).map((v) => v.id).sort(), ids.slice(0, 15).sort());

  assert.deepEqual(reviewQuestions(['a', 'b'], (id) => (id === 'a' ? 2 : 3)).map((v) => v.scope), ['lesson', 'wide']);
});

test('전체 연습·시험은 화면 차례대로(경기 북서부 → 북동부 → 남서부 → 남동부)', () => {
  const q = allQuestions(reg, 'gyeonggi', rngFrom(11));
  const keys = q.map((v) => reg.screenOf(v.id)!.key);
  assert.deepEqual([...new Set(keys)], ['nw', 'ne', 'sw', 'se']);
  for (let i = 1; i < keys.length; i++) assert.ok(['nw', 'ne', 'sw', 'se'].indexOf(keys[i]) >= ['nw', 'ne', 'sw', 'se'].indexOf(keys[i - 1]));
  const inc = allQuestions(reg, 'incheon', rngFrom(2)).map((v) => reg.screenOf(v.id)!.key);
  assert.deepEqual(inc, [...Array(8).fill('land'), ...Array(3).fill('sea')]);
});
