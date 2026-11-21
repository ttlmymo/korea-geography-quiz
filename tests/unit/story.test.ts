// 이름 이야기 한 줄(lib/story.ts, 11-21 평가 3번): 새 글을 쓰지 않고 원문 확인한 소개 글의 문장을 그대로 고른다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildStories, pickEn, pickKo, sentencesEn, sentencesKo, STORY_MAX_EN, STORY_MAX_KO } from '../../src/lib/story.ts';

const root = path.join(import.meta.dirname, '../..');
const read = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));

test('한국어: 유래 문장 > 이름 문장 > 시대 문장, 혼자서 아무것도 말하지 않는 문장과 긴 문장은 건너뜀', () => {
  assert.equal(pickKo(['1914년에 군이 되었어요. 이 땅은 1600년에 처음 이름이 붙었어요. 가나라는 이름은 큰 강에서 왔어요.']), '가나라는 이름은 큰 강에서 왔어요.');
  assert.equal(pickKo(['1914년에 군이 되었어요. 이 땅은 1600년에 처음 이름이 붙었어요.']), '이 땅은 1600년에 처음 이름이 붙었어요.');
  assert.equal(pickKo(['이름이 어디서 왔는지는 두 가지 이야기가 있어요. 조선 때 읍성이 있었어요.']), '조선 때 읍성이 있었어요.');
  assert.equal(pickKo(['가'.repeat(STORY_MAX_KO) + ' 이름에서 왔어요.']), null);
  assert.equal(pickKo(['바다가 보여요. 산이 높아요.']), null);
});

test('영어: 한국어 문장의 숫자를 모두 품은 문장(또는 이어진 두 문장), 숫자가 없으면 이름 문장', () => {
  const en = ['It was a port. In 1897 it opened its harbor. In 1910 it was renamed Mokpo-bu. The name means neck.'];
  assert.equal(pickEn(en, '1897년에 항구를 열었고, 1910년에 이름이 바뀌었어요.'), 'In 1897 it opened its harbor. In 1910 it was renamed Mokpo-bu.');
  assert.equal(pickEn(en, '1910년에 목포부로 이름이 바뀌었어요.'), 'In 1910 it was renamed Mokpo-bu.');
  assert.equal(pickEn(en, '이름은 목에서 왔어요.'), 'The name means neck.');
  assert.equal(pickEn(en, '2001년에 시가 되었어요.'), null);   // 숫자가 없는 영어 글 → 고르지 않음
});

test('두 말 중 하나라도 못 고르면 싣지 않는다', () => {
  const s = buildStories([
    { id: 'a', ko: ['가나라는 이름은 큰 강에서 왔어요.'], en: ['The name Gana comes from a big river.'], page: 'x/a/' },
    { id: 'b', ko: ['가나라는 이름은 큰 강에서 왔어요.'], en: null },
    { id: 'c', ko: ['바다가 보여요.'], en: ['You can see the sea.'] },
  ]);
  assert.deepEqual(Object.keys(s), ['a']);
  assert.equal(s.a.page, 'x/a/');
});

test('실제 소개 글: 200곳 넘게 고르고, 고른 문장은 원문 문장 그대로(새로 쓴 글이 없다), 길이 상한 안', () => {
  const kr = (read('src/data/intro-kr.json') as { id: string; paras: string[]; reviewed: string | null }[]).filter((x) => x.reviewed);
  const en = new Map((read('src/data/intro-en.json') as { id: string; paras: string[] }[]).map((x) => [x.id, x.paras]));
  const st = buildStories(kr.map((x) => ({ id: x.id, ko: x.paras, en: en.get(x.id) ?? null })));
  const n = Object.keys(st).length;
  assert.ok(n >= 200, `고른 곳 ${n}`);
  for (const x of kr) {
    const s = st[x.id];
    if (!s) continue;
    assert.ok(x.paras.flatMap(sentencesKo).includes(s.ko), `${x.id}: 한국어 문장이 원문에 없음 — ${s.ko}`);
    const enSents = (en.get(x.id) ?? []).flatMap(sentencesEn);
    for (const part of sentencesEn(s.en)) assert.ok(enSents.includes(part), `${x.id}: 영어 문장이 원문에 없음 — ${part}`);
    assert.ok(s.ko.length <= STORY_MAX_KO && s.en.length <= STORY_MAX_EN, x.id);
  }
});
