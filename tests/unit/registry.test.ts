import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry } from '../../src/app/registry.ts';
import { geo, reg, idOf } from './fixtures.ts';

test('지역 3곳, 곳 67개가 모두 한 과에 든다', () => {
  assert.deepEqual(reg.regions.map((r) => [r.key, r.items.length, r.lessons.length]), [['seoul', 25, 5], ['incheon', 11, 3], ['gyeonggi', 31, 7]]);
  for (const r of reg.regions) for (const it of r.items) assert.equal(reg.place(it.id)?.region.key, r.key);
});

test('slug·과 찾기', () => {
  assert.equal(reg.bySlug('seoul', 'mapo-gu')?.lesson.no, 1);
  assert.equal(reg.bySlug('incheon', 'jemulpo-gu')?.lesson.no, 2);
  assert.equal(reg.bySlug('gyeonggi', 'osan-si')?.lesson.no, 3);
  assert.equal(reg.bySlug('seoul', 'nope'), undefined);
  assert.equal(reg.lesson('seoul', 6), undefined);
});

test('맞닿음은 층대로: 경기는 시 층', () => {
  assert.equal(reg.adjacent(idOf('종로구'), idOf('중구', 'seoul')), true);
  assert.equal(reg.adjacent(idOf('오산시'), idOf('용인시')), false);   // S3 에서 확인: 사이에 화성시
  assert.equal(reg.adjacent(idOf('오산시'), idOf('화성시')), true);
  assert.equal(reg.adjacent(idOf('강서구', 'seoul'), idOf('김포시')), true); // 지역을 넘는 이웃
});

test('방위: 이름표 점 기준 8방위', () => {
  assert.equal(reg.dir8(idOf('도봉구'), idOf('강남구')), 'S');
  assert.equal(reg.dir8(idOf('강서구', 'seoul'), idOf('강동구')), 'E');
  assert.equal(reg.dir8(idOf('평택시'), idOf('연천군')), 'N');
  assert.ok(reg.dist(idOf('평택시'), idOf('연천군')) > 100);
});

test('과에 없는 곳이 있으면 색인을 만들지 않는다', () => {
  const bad = structuredClone(geo);
  bad.units.regions[0].lessons[0].items.push('kr:sgg:99999');
  assert.throws(() => createRegistry(bad), /과에 없는 곳/);
});

test('넓은 화면: 지역의 모든 곳이 한 화면에 한 번씩, 경기 4·인천 2·서울 1', () => {
  assert.deepEqual(reg.regions.map((r) => r.screens.length), [1, 2, 4]);
  for (const r of reg.regions) {
    const all = r.screens.flatMap((s) => s.items);
    assert.equal(all.length, r.items.length);
    assert.equal(new Set(all).size, r.items.length);
    for (const it of r.items) assert.ok(reg.screenOf(it.id)?.items.includes(it.id));
  }
  assert.equal(reg.screenOf(idOf('구리시'))?.key, 'ne');
  assert.equal(reg.screenOf(idOf('옹진군'))?.key, 'sea');
});

test('과 화면 검사(설계서 3.2): 과·넓은 화면마다 가장 작은 칸 지름이 16px 이상', () => {
  for (const r of reg.regions) {
    for (const l of r.lessons) assert.ok(l.minTapPx >= 16, `${r.ko} ${l.no}과 ${l.minTapPx}px`);
    for (const s of r.screens) assert.ok(s.minTapPx >= 16, `${r.ko} ${s.ko} ${s.minTapPx}px`);
  }
});
