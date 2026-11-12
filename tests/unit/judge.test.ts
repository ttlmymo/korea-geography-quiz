import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyTap, isRight, type TapProbe } from '../../src/app/core/judge.ts';

const active = new Set(['A', 'B', 'C']);
const probe = (p: Partial<TapProbe>): TapProbe => ({ hit: null, depth: 0, near: [], water: null, ...p });

test('밝은 칸 안쪽 깊이 누르면 그 칸', () => {
  assert.deepEqual(classifyTap(probe({ hit: 'A', depth: 20, near: ['A'] }), active), { type: 'cell', id: 'A' });
  // 후보가 둘이어도 6px 이상 들어가 있으면 모호하지 않다
  assert.deepEqual(classifyTap(probe({ hit: 'A', depth: 6, near: ['A', 'B'] }), active), { type: 'cell', id: 'A' });
});

test('손가락 반경 안에 후보가 둘 이상이고 경계 가까이면 모호(시도로 세지 않음)', () => {
  assert.deepEqual(classifyTap(probe({ hit: 'A', depth: 5.9, near: ['A', 'B'] }), active), { type: 'ambiguous' });
  // 한강 띠 위인데 양쪽 칸이 다 가까우면 모호
  assert.deepEqual(classifyTap(probe({ water: 'river', near: ['A', 'B'] }), active), { type: 'ambiguous' });
  // 흐린 칸 안이지만 밝은 칸 둘이 가까우면 모호
  assert.deepEqual(classifyTap(probe({ hit: 'X', depth: 3, near: ['A', 'C'] }), active), { type: 'ambiguous' });
});

test('후보가 하나뿐이면 경계 가까이도 그 칸', () => {
  assert.deepEqual(classifyTap(probe({ hit: 'B', depth: 1, near: ['B', 'X'] }), active), { type: 'cell', id: 'B' });
});

test('흐린 칸·바다는 밖, 한강 띠는 강', () => {
  assert.deepEqual(classifyTap(probe({ hit: 'X', depth: 30, near: ['A'] }), active), { type: 'outside' });
  assert.deepEqual(classifyTap(probe({ water: 'sea', near: ['A'] }), active), { type: 'outside' });
  assert.deepEqual(classifyTap(probe({ water: 'river', near: ['A'] }), active), { type: 'river' });
  assert.deepEqual(classifyTap(probe({}), active), { type: 'outside' });
});

test('정답 판정', () => {
  assert.equal(isRight('A', { type: 'cell', id: 'A' }), true);
  assert.equal(isRight('A', { type: 'cell', id: 'B' }), false);
  assert.equal(isRight('A', { type: 'ambiguous' }), false);
});
