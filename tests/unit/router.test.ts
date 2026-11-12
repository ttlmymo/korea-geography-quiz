import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, toHash, type Known, type Route } from '../../src/app/router.ts';
import { reg } from './fixtures.ts';

const known: Known = {
  region: (k) => !!reg.region(k),
  lesson: (r, no) => !!reg.lesson(r, no),
  slug: (r, s) => !!reg.bySlug(r, s),
};
const parse = (hash: string, search = '') => parseRoute(hash, search, known);

test('설계서 7.3 경로를 모두 읽고, 되돌려 만들면 같은 주소', () => {
  const cases: [string, Route][] = [
    ['#/kr', { name: 'regions' }],
    ['#/kr/seoul', { name: 'unit', region: 'seoul' }],
    ['#/kr/seoul/sgg/p3', { name: 'lesson', region: 'seoul', no: 3 }],
    ['#/kr/gyeonggi/sgg/p7', { name: 'lesson', region: 'gyeonggi', no: 7 }],
    ['#/kr/seoul/sgg/@mapo-gu', { name: 'place', region: 'seoul', slug: 'mapo-gu' }],
    ['#/kr/incheon/mix', { name: 'mix', region: 'incheon' }],
    ['#/kr/incheon/check', { name: 'check', region: 'incheon' }],
    ['#/kr/seoul/explore', { name: 'explore', region: 'seoul', slug: null }],
    ['#/kr/seoul/explore/jongno-gu', { name: 'explore', region: 'seoul', slug: 'jongno-gu' }],
    ['#/review', { name: 'review' }],
    ['#/rank', { name: 'rank' }],
  ];
  for (const [hash, route] of cases) {
    assert.deepEqual(parse(hash), { route, fix: null }, hash);
    assert.equal(toHash(route), hash);
  }
  assert.equal(toHash({ name: 'home' }), '');
});

test('해시가 없거나 #/ 로 시작하지 않으면 홈, 로그인 토큰 조각은 건드리지 않는다', () => {
  assert.deepEqual(parse(''), { route: { name: 'home' }, fix: null });
  assert.deepEqual(parse('#/'), { route: { name: 'home' }, fix: null });
  assert.deepEqual(parse('#access_token=abc&type=bearer'), { route: { name: 'home' }, fix: null });
  assert.deepEqual(parse('#top'), { route: { name: 'home' }, fix: null });
});

test('끝 빗금은 봐준다', () => {
  assert.deepEqual(parse('#/kr/seoul/').route, { name: 'unit', region: 'seoul' });
});

test('모르는 경로는 홈으로 보내고 주소를 고친다(검색 문자열은 남김)', () => {
  for (const h of ['#/kr/busan', '#/kr/seoul/sgg/p6', '#/kr/seoul/sgg/p0', '#/kr/seoul/sgg/p01', '#/kr/seoul/sgg/@nope',
    '#/kr/seoul/explore/nope', '#/kr/seoul/emd/p1', '#/kr/seoul/mix/1', '#/what', '#/review/x', '#/kr/seoul/sgg/%E0%A4%A']) {
    assert.deepEqual(parse(h), { route: { name: 'home' }, fix: '' }, h);
  }
  assert.deepEqual(parse('#/nope', '?utm_source=x'), { route: { name: 'home' }, fix: '?utm_source=x' });
});

test('옛 ?region=seoul 은 #/kr/seoul 로', () => {
  assert.deepEqual(parse('', '?region=seoul'), { route: { name: 'unit', region: 'seoul' }, fix: '#/kr/seoul' });
  assert.deepEqual(parse('', '?region=incheon&utm_source=x'), { route: { name: 'unit', region: 'incheon' }, fix: '?utm_source=x#/kr/incheon' });
  assert.deepEqual(parse('', '?region=busan'), { route: { name: 'home' }, fix: '' });
  // 해시 경로가 있으면 그쪽이 먼저
  assert.deepEqual(parse('#/kr/gyeonggi', '?region=seoul').route, { name: 'unit', region: 'gyeonggi' });
});
