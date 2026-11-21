// 찾기 힌트 두 단계(core/hint.ts — HINT_PLAN 2026-11-16, 11-21 구현): 기준 칸 고르는 차례, 정답을 기준으로 쓰지 않음, 후보 수
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reg } from './fixtures.ts';
import { narrowCandidates, pickHintRef, seenInRound, KNOWN_BOX } from '../../src/app/core/hint.ts';

const seoul = reg.region('seoul')!;
const idOf = (ko: string) => seoul.items.find((it) => it.ko === ko)!.id;
const L1 = reg.lesson('seoul', 1)!.items;   // 종로·중구·용산·은평·서대문·마포
const jongno = idOf('종로구'), jung = idOf('중구'), yongsan = idOf('용산구'), eunpyeong = idOf('은평구'), seodaemun = idOf('서대문구'), mapo = idOf('마포구');
const none = () => 0;

test('기준 칸은 정답이 아니고 범위 안에 있다', () => {
  for (const t of L1) {
    const h = pickHintRef(reg, t, L1, new Set(), none);
    assert.ok(h, t);
    assert.notEqual(h!.ref, t);
    assert.ok(L1.includes(h!.ref));
  }
});

test('① 이번 판에서 본 곳 가운데 맞닿은 곳이 먼저', () => {
  // 중구와 맞닿은 1과 곳: 종로구·용산구·서대문구. 서대문구만 '본 곳'이면 서대문구
  const h = pickHintRef(reg, jung, L1, new Set([seodaemun, eunpyeong]), none)!;
  assert.equal(h.ref, seodaemun);
  assert.equal(h.why, 'round');
  assert.equal(h.adjacent, true);
  assert.equal(h.dir, reg.dir8(seodaemun, jung));   // 기준에서 본 정답 쪽(오답 문장과 같은 방향 규칙)
});

test('② 본 곳이 없으면 잘 아는 곳(상자 3 이상) 가운데 맞닿은 곳', () => {
  const box = (id: string) => (id === yongsan ? KNOWN_BOX : 0);
  const h = pickHintRef(reg, jung, L1, new Set(), box)!;
  assert.equal(h.ref, yongsan);
  assert.equal(h.why, 'known');
});

test('③ 둘 다 없으면 범위 안의 맞닿은 곳, ④ 맞닿은 곳이 없으면 가장 가까운 곳 + 방향', () => {
  const h = pickHintRef(reg, jung, L1, new Set(), none)!;
  assert.equal(h.why, 'scope');
  assert.ok(reg.adjacent(h.ref, jung));
  // 맞닿은 곳을 모두 빼면(skip) 가까운 곳으로
  const adj = L1.filter((id) => id !== jung && reg.adjacent(id, jung));
  const far = pickHintRef(reg, jung, L1, new Set(), none, new Set(adj))!;
  assert.equal(far.why, 'near');
  assert.equal(far.adjacent, false);
  assert.ok(!adj.includes(far.ref));
});

test('섬 상자 안 칸(skip)은 기준으로 쓰지 않고, 고를 곳이 정답뿐이면 null', () => {
  const h = pickHintRef(reg, jung, L1, new Set(L1), none, new Set(L1.filter((id) => id !== mapo)))!;
  assert.equal(h.ref, mapo);
  assert.equal(pickHintRef(reg, jung, [jung], new Set(), none), null);
});

test('같은 입력이면 늘 같은 기준(가까운 차례, 같으면 id 차례)', () => {
  const a = pickHintRef(reg, jung, L1, new Set(), none), b = pickHintRef(reg, jung, [...L1].reverse(), new Set(), none);
  assert.deepEqual(a, b);
});

test('2단계 후보: 4곳 이상이면 정답 + 2, 3곳이면 + 1, 2곳 이하면 정답만', () => {
  assert.equal(narrowCandidates(reg, jung, L1).length, 3);
  assert.equal(narrowCandidates(reg, jung, L1)[0], jung);
  assert.equal(narrowCandidates(reg, jung, [jung, jongno, yongsan]).length, 2);
  assert.deepEqual(narrowCandidates(reg, jung, [jung, jongno]), [jung]);
  // 남기는 곳은 정답과 가까운 곳
  const two = narrowCandidates(reg, jung, L1).slice(1);
  const rest = L1.filter((id) => id !== jung && !two.includes(id));
  for (const r of rest) for (const t of two) assert.ok(reg.dist(jung, t) <= reg.dist(jung, r));
});

test('이번 판에서 본 곳 = 앞의 만나기 + 맞힌 답(틀린 답·모르겠어요는 아님)', () => {
  const s = seenInRound([{ mode: 'meet', id: jongno }, { mode: 'choose', id: jung }, { mode: 'find', id: mapo }], [{ id: jung, result: 'correct' }, { id: mapo, result: 'wrong' }, { id: eunpyeong, result: 'dontknow' }]);
  assert.deepEqual([...s].sort(), [jongno, jung].sort());
});
