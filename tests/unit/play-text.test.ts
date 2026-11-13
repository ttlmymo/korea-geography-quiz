// 문제 화면(합본 디자인 3.3)의 문구: 문제를 큰 이름 + 작은 글로 나눠 쓰는 promptParts 가 기존 문장(prompt)과 같은 말인지.
// 화면 모양은 바뀌어도 묻는 말은 그대로여야 한다(배우는 방식은 그대로)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UI_EN, UI_KO } from '../../src/app/text/ui.ts';
import { idOf, reg } from './fixtures.ts';

const MODES = ['meet', 'choose', 'find'] as const;
const join = (p: { pre: string; big: string; post: string }) => [p.pre, p.big, p.post].filter(Boolean).join(' ');

test('promptParts 를 이어 붙이면 prompt 와 같은 문장(한·영, 모든 곳·모든 문제 종류)', () => {
  for (const L of [UI_KO, UI_EN]) {
    for (const r of reg.regions) for (const it of r.items) for (const mode of MODES) {
      assert.equal(join(L.promptParts(reg, mode, it.id)), L.prompt(reg, mode, it.id, (s) => s), `${L.lang} ${mode} ${it.ko}`);
    }
  }
});

test('큰 글씨는 곳 이름(찾기는 조사까지), 고르기는 이름 없이 한 문장', () => {
  const id = idOf('강남구');
  assert.deepEqual(UI_KO.promptParts(reg, 'find', id), { pre: '', big: '강남구를', post: '찾아 누르세요' });
  assert.deepEqual(UI_KO.promptParts(reg, 'meet', id), { pre: '이곳은', big: '강남구', post: '' });
  assert.deepEqual(UI_KO.promptParts(reg, 'choose', idOf('연천군')), { pre: '', big: '', post: '테두리 친 칸은 무슨 시·군일까요?' });
  assert.deepEqual(UI_EN.promptParts(reg, 'find', id), { pre: 'Find and tap', big: 'Gangnam-gu', post: '' });
  assert.deepEqual(UI_EN.promptParts(reg, 'meet', id), { pre: 'This is', big: 'Gangnam-gu', post: '' });
});

test('문제 화면 새 문구는 한·영 같은 모양', () => {
  assert.deepEqual(Object.keys(UI_EN.modeLabel).sort(), Object.keys(UI_KO.modeLabel).sort());
  assert.deepEqual(Object.keys(UI_EN.playKey).sort(), Object.keys(UI_KO.playKey).sort());
  assert.equal(UI_KO.mapHelp.length, UI_EN.mapHelp.length);
  for (const m of MODES) { assert.ok(UI_KO.mapCap(m)); assert.ok(UI_EN.mapCap(m)); }
});
