import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry } from '../../src/app/registry.ts';
import { LIVE_BY_OPEN, geo, reg, idOf } from './fixtures.ts';
import { SIDOS } from '../../src/app/sidos.ts';

test('공개 지역 모두(E11 부산, E12 대구·대전·울산·세종, E13 충북·제주·강원·전북, E14 충남·경북 — 지역 표 차례), 곳이 모두 한 과에 든다 · 세종·제주(과 없는 지역)의 칸은 곳이 아니다', () => {
  // 지역 목록 = 지역 표 공개 지역(지역 표 차례). E13 까지 연 열두 지역의 곳 수·과 수는 그대로(E14 충남·경북은 e14-region.test)
  assert.deepEqual(reg.regions.map((r) => r.key), SIDOS.filter((s) => s.status === 'live').map((s) => s.key));
  assert.deepEqual(reg.regions.filter((r) => (SIDOS.find((s) => s.key === r.key)!.openOrder ?? 99) <= 12).map((r) => [r.key, r.items.length, r.lessons.length]), [['seoul', 25, 5], ['busan', 16, 4], ['daegu', 9, 3], ['incheon', 11, 3], ['daejeon', 5, 1], ['ulsan', 5, 1], ['sejong', 1, 0], ['gyeonggi', 31, 7],
    ['chungbuk', 11, 3], ['jeju', 2, 0], ['gangwon', 18, 5], ['jeonbuk', 14, 4]]);
  let n = 0;
  for (const r of reg.regions) for (const it of r.items) {
    // 과 없는 지역(layer emd — 세종, N4)의 칸(세종시)은 지역 지도에만 쓰고 곳으로 등록하지 않는다(공부는 동 단원)
    if (r.layer === 'emd') { assert.equal(reg.place(it.id), undefined); continue; }
    assert.equal(reg.place(it.id)?.region.key, r.key);
    n++;
  }
  assert.equal(n, reg.regions.filter((r) => r.layer !== 'emd').reduce((t, r) => t + r.items.length, 0));   // E13 145 · E14 182 · E14·E15 합친 판 200
  assert.equal(LIVE_BY_OPEN.length, reg.regions.length);
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

test('과에 없는 곳이 있으면 그 지역만 빼고 나머지 지역으로 색인을 만든다(지역별 격리, 계획서 E8)', () => {
  const bad = structuredClone(geo);
  bad.units.regions[0].lessons[0].items.push('kr:sgg:99999');
  const r2 = createRegistry(bad);
  assert.deepEqual(r2.regions.map((r) => r.key), reg.regions.map((r) => r.key).filter((k) => k !== 'seoul'));
  assert.deepEqual(r2.failed.map((f) => f.key), ['seoul']);
  assert.match(r2.failed[0].why, /과에 없는 곳/);
  assert.equal(r2.place(idOf('종로구')), undefined);
  assert.equal(r2.place(idOf('부평구'))?.region.key, 'incheon');
});

test('넓은 화면: 지역의 모든 곳이 한 화면에 한 번씩, 경기 4·인천 2·부산 2·대구 2·강원 2·서울 1·대전 1·울산 1·충북 1·전북 1(세종·제주는 과 없는 지역이라 0)', () => {
  const scr = Object.fromEntries(reg.regions.map((r) => [r.key, r.screens.length]));
  assert.deepEqual(['seoul', 'busan', 'daegu', 'incheon', 'daejeon', 'ulsan', 'sejong', 'gyeonggi', 'chungbuk', 'jeju', 'gangwon', 'jeonbuk'].map((k) => scr[k]), [1, 2, 2, 2, 1, 1, 0, 4, 1, 0, 2, 1]);
  for (const r of reg.regions.filter((x) => x.layer !== 'emd')) {
    const all = r.screens.flatMap((s) => s.items);
    assert.equal(all.length, r.items.length);
    assert.equal(new Set(all).size, r.items.length);
    for (const it of r.items) assert.ok(reg.screenOf(it.id)?.items.includes(it.id));
  }
  assert.equal(reg.screenOf(idOf('구리시'))?.key, 'ne');
  assert.equal(reg.screenOf(idOf('옹진군'))?.key, 'sea');
  assert.equal(reg.screenOf(idOf('기장군'))?.key, 'east');
  assert.equal(reg.screenOf(idOf('중구', 'busan'))?.key, 'west');
  assert.equal(reg.screenOf(idOf('군위군'))?.key, 'north');
  assert.equal(reg.screenOf(idOf('중구', 'daegu'))?.key, 'south');
});

test('과 화면 검사(설계서 3.2): 과·넓은 화면마다 가장 작은 칸 지름이 16px 이상', () => {
  for (const r of reg.regions) {
    for (const l of r.lessons) assert.ok(l.minTapPx >= 16, `${r.ko} ${l.no}과 ${l.minTapPx}px`);
    for (const s of r.screens) assert.ok(s.minTapPx >= 16, `${r.ko} ${s.ko} ${s.minTapPx}px`);
  }
});
