import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answer, createDeck } from '../../src/app/core/deck.ts';
import { afterLesson } from '../../src/app/core/mastery.ts';
import { better, checkBests, checkDaily, checkDeck, checkLast, checkMastery, checkSettings, keys, openStore, type KV } from '../../src/app/store.ts';

function memKV(): KV & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: (k) => { data.delete(k); } };
}

test('키는 모두 kgq_ 로 시작하고, 숙달·진행은 프로필 단위', () => {
  const k = keys();
  for (const v of Object.values(k)) assert.match(v, /^kgq_/);
  assert.equal(k.mastery, 'kgq_mastery_v1:p1');
  assert.equal(keys('p2').deck, 'kgq_deck_v1:p2');
});

test('쓰고 읽기, 시험용 키는 남기지 않는다', () => {
  const kv = memKV();
  const s = openStore(kv);
  assert.equal(s.ok, true);
  const m = afterLesson({}, ['kr:sgg:11110'], 20000);
  assert.equal(s.write(keys().mastery, m), true);
  assert.deepEqual(s.read(keys().mastery, checkMastery), m);
  assert.deepEqual([...kv.data.keys()], ['kgq_mastery_v1:p1']);
  s.remove(keys().mastery);
  assert.equal(s.read(keys().mastery, checkMastery), null);
});

test('저장이 막힌 창: ok=false, 이 창을 닫을 때까지는 메모리로 돈다', () => {
  const blocked: KV = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
  for (const kv of [blocked, null]) {
    const s = openStore(kv);
    assert.equal(s.ok, false);
    assert.equal(s.write('kgq_last_v1:p1', 'seoul'), true);
    assert.equal(s.read('kgq_last_v1:p1', checkLast), 'seoul');
  }
});

test('쓰는 중 용량이 차면 false', () => {
  const kv = memKV();
  const s = openStore(kv);
  kv.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.equal(s.write('kgq_daily_v1:p1', { day: 1, n: 1 }), false);
});

test('깨진 값·모양이 틀린 값은 버린다', () => {
  const kv = memKV();
  const s = openStore(kv);
  kv.data.set('kgq_mastery_v1:p1', '{not json');
  assert.equal(s.read('kgq_mastery_v1:p1', checkMastery), null);
  assert.deepEqual(checkMastery({ 'kr:sgg:1': { box: 9 }, 'kr:sgg:2': { box: 2, due: 'x', hi: 7 }, other: { box: 1 } }),
    { 'kr:sgg:2': { box: 2, due: null, hi: 0, streak: 0, grad: false, front: false } });
  assert.equal(checkMastery([]), null);
  assert.equal(checkDaily({ day: 1.5, n: 2 }), null);
  assert.deepEqual(checkDaily({ day: 20000, n: 3, extra: 1 }), { day: 20000, n: 3 });
  assert.equal(checkLast('<script>'), null);
  assert.deepEqual(checkSettings({ autoNext: false }), { autoNext: false });
  assert.deepEqual(checkSettings({}), { autoNext: true });
});

test('진행 중인 판은 문제마다 저장하고 되살린다', () => {
  const s = openStore(memKV());
  let d = createDeck('lesson', [{ mode: 'meet', id: 'a' }, { mode: 'find', id: 'a' }], { region: 'seoul', lesson: 1, seed: 5 });
  d = answer(d, { result: 'correct' });
  s.write(keys().deck, d);
  assert.deepEqual(s.read(keys().deck, checkDeck), d);
});

test('시험 최고 기록: 정답 수가 많을수록, 같으면 빠를수록', () => {
  const b = { score: 22, total: 25, seconds: 200, day: 1 };
  assert.equal(better({ ...b, score: 23, seconds: 300 }, b), true);
  assert.equal(better({ ...b, seconds: 150 }, b), true);
  assert.equal(better({ ...b, seconds: 250 }, b), false);
  assert.equal(better({ ...b, score: 21, seconds: 10 }, b), false);
  assert.equal(better(b, undefined), true);
  assert.deepEqual(checkBests({ seoul: b, '<x>': b, incheon: { ...b, score: 1.5 } }), { seoul: b });
});

test('측정: 공통 매개변수, 참·거짓은 1·0, 빈 값은 뺀다', async () => {
  const { initAnalytics, track } = await import('../../src/app/analytics.ts');
  const sent: unknown[][] = [];
  (globalThis as unknown as { window: unknown }).window = { gtag: (...a: unknown[]) => sent.push(a) };
  initAnalytics('en', 'kr-20261001.1');
  track('practice_answer', { mode: 'find', correct: true, hint: false, box: 0, region: 'seoul', lesson: undefined });
  assert.deepEqual(sent[0], ['event', 'practice_answer', { country: 'kr', lang: 'en', data_ver: 'kr-20261001.1', mode: 'find', correct: 1, hint: 0, box: 0, region: 'seoul' }]);
  delete (globalThis as unknown as { window?: unknown }).window;
});
