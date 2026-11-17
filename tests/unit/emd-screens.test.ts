// 동 화면(계획서 NATIONWIDE_PLAN E5 · N9 · N12 · N13 · N34): 동 단원 주소, 구 고르기·단원 쪽·과 시작, 만나기 근거 한 줄, 섬 상자 배치, GA 값.
// 동 색인은 시험용 단원 파일(tests/fixtures/emd)에서 만든다. 운영 판 폴더에는 E6 부터 서울 동 색인(25단원)만 있다 —
// '동 색인 없음'(동 공개 전·옛 캐시)은 운영 판에서 emdUnits·guUnits 를 뺀 geoNoEmd 로 흉내 낸다. E7 부터 운영 판에는 세 지역 동 색인(83단원)과 경기 일반구 단원이 있다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRegistry, unitOptions, type Registry } from '../../src/app/registry.ts';
import { parseRoute, toHash, type Known, type Route } from '../../src/app/router.ts';
import { gaArgs, lessonCompleteParams } from '../../src/app/core/units.ts';
import { meetKo } from '../../src/app/text/ko.ts';
import { L } from '../../src/app/text/ui.ts';
import { buildShapes, specOf, type Topology } from '../../src/app/map/shapes.ts';
import { ISLE_H, ISLE_W, OWN_W, STRIP_MAX, cornerCover, fitK, insetScale, isleView, layoutIsles, pickCorner, scaleChip } from '../../src/app/map/isles.ts';
import { DATA_VER } from '../../src/consts.ts';
import { textWidth } from '../../src/app/map/labelfit.ts';
import { lessonView, wholeView } from '../../src/app/ui/maps.ts';
import type { Ctx } from '../../src/app/ui/ctx.ts';
import type { EmdIndex, EmdUnitFile, GeoData } from '../../src/app/types.ts';
import { EN_OFF, geo, geoNoEmd } from './fixtures.ts';

const T = 20000;
const FIX = path.join(import.meta.dirname, '../fixtures/emd');
const unitFile = (code: string): EmdUnitFile => JSON.parse(fs.readFileSync(path.join(FIX, `${code}.json`), 'utf8'));
const unitTopo = (code: string): Topology => JSON.parse(fs.readFileSync(path.join(FIX, `${code}.topo.json`), 'utf8'));
const indexOf = (j: EmdUnitFile): EmdIndex => ({ code: j.code, ko: j.ko, slug: j.key.split('/')[1], n: j.items.length, lessons: j.lessons.length, ids: j.items.map((it) => it.slug) });
const geoE: GeoData = { ...geo, units: { ...geo.units, emdUnits: { seoul: ['11110', '11260', '11350'].map((c) => indexOf(unitFile(c))), incheon: ['28290', '28720'].map((c) => indexOf(unitFile(c))) } } };
const regE = (opt = {}) => createRegistry(geoE, opt);
/** main.ts 와 같은 판정(단원 파일 전에는 동 색인으로) */
const knownOf = (reg: Registry): Known => {
  const idx = (k: string) => (reg.region(k) ? undefined : reg.unit(k)?.index);
  return {
    region: (k) => !!reg.region(k),
    lesson: (r, n) => !!reg.lesson(r, n) || (n >= 1 && n <= (idx(r)?.lessons ?? 0)),
    slug: (r, s) => !!reg.bySlug(r, s) || !!idx(r)?.ids.includes(s),
    emd: (r) => reg.emdUnits(r).length > 0,
    unit: (k) => !!reg.unit(k) || !!reg.region(k)?.unit,
  };
};
const ctxOf = (reg: Registry, o: Partial<Ctx> = {}): Ctx => ({
  reg, geo, base: '/', ver: 'kr-20261001.2', storageOk: true, inApp: false,
  mastery: {}, lessonDeck: null, otherDeck: null, checkDeck: null, checkStart: 0,
  daily: null, dailyEmd: null, last: null, lastUnit: null, settings: { autoNext: false }, homeRegion: null, bests: {}, bestUnits: {},
  today: () => T, save() {}, go() {}, back() {}, render() {}, toast() {},
  ...o,
}) as Ctx;

test('동 단원 주소: 구 고르기·단원 쪽·과·곳·전체 연습·시험·둘러보기를 읽고 되돌려 만들면 같은 주소(단원 파일을 받기 전에도 동 색인으로)', () => {
  const k = knownOf(regE());
  const cases: [string, Route][] = [
    ['#/kr/seoul/emd', { name: 'emd', region: 'seoul' }],
    ['#/kr/seoul/emd/jongno-gu', { name: 'unit', region: 'seoul/jongno-gu' }],
    ['#/kr/seoul/emd/jongno-gu/p2', { name: 'lesson', region: 'seoul/jongno-gu', no: 2 }],
    ['#/kr/seoul/emd/jongno-gu/@51500', { name: 'place', region: 'seoul/jongno-gu', slug: '51500' }],
    ['#/kr/seoul/emd/jongno-gu/mix', { name: 'mix', region: 'seoul/jongno-gu' }],
    ['#/kr/seoul/emd/jongno-gu/check', { name: 'check', region: 'seoul/jongno-gu' }],
    ['#/kr/seoul/emd/jongno-gu/explore', { name: 'explore', region: 'seoul/jongno-gu', slug: null }],
    ['#/kr/seoul/emd/jongno-gu/explore/51500', { name: 'explore', region: 'seoul/jongno-gu', slug: '51500' }],
    ['#/kr/incheon/emd/ongjin-gun/p1', { name: 'lesson', region: 'incheon/ongjin-gun', no: 1 }],
  ];
  for (const [hash, route] of cases) {
    assert.deepEqual(parseRoute(hash, '', k), { route, fix: null }, hash);
    assert.equal(toHash(route), hash);
  }
  // 지역 주소는 그대로(옛 주소·과 주소)
  assert.equal(toHash({ name: 'lesson', region: 'seoul', no: 3 }), '#/kr/seoul/sgg/p3');
  assert.equal(toHash({ name: 'unit', region: 'seoul' }), '#/kr/seoul');
  // 없는 과·동·단원, 동 단원이 없는 지역(경기 — 이 색인에 없음)은 홈으로
  for (const h of ['#/kr/seoul/emd/jongno-gu/p4', '#/kr/seoul/emd/jongno-gu/@99999', '#/kr/seoul/emd/gangnam-gu', '#/kr/gyeonggi/emd', '#/kr/seoul/emd/jongno-gu/sgg/p1', '#/kr/seoul/emd/jongno-gu/p1/x']) {
    assert.deepEqual(parseRoute(h, '', k), { route: { name: 'home' }, fix: '' }, h);
  }
  // 두 자리 과 번호(지역 과 주소와 같은 정규식): 과가 12개인 단원이면 p10·p12 가 열리고, 숫자가 아닌 꼬리·0 으로 시작하는 번호는 홈으로
  const k12: Known = { ...k, lesson: (r, n) => (r === 'seoul/jongno-gu' ? n >= 1 && n <= 12 : k.lesson(r, n)) };
  for (const no of [10, 12]) {
    const hash = `#/kr/seoul/emd/jongno-gu/p${no}`;
    assert.deepEqual(parseRoute(hash, '', k12), { route: { name: 'lesson', region: 'seoul/jongno-gu', no }, fix: null }, hash);
    assert.equal(toHash({ name: 'lesson', region: 'seoul/jongno-gu', no }), hash);
  }
  for (const h of ['#/kr/seoul/emd/jongno-gu/p1d', '#/kr/seoul/emd/jongno-gu/p01', '#/kr/seoul/emd/jongno-gu/p13']) {
    assert.deepEqual(parseRoute(h, '', k12), { route: { name: 'home' }, fix: '' }, h);
  }
});

test('동 색인이 없으면(동 공개 전 · 동을 끈 창 — 관문이 닫힌 영어 앱) 동·일반구 주소는 지금처럼 홈으로 · 운영 판(E7)은 서울·인천·경기 동 주소와 경기 일반구 주소가 열린다(관문이 열린 영어 앱도 — EN_EMD 8절 5)', () => {
  for (const reg of [createRegistry(geoNoEmd), regE(EN_OFF)]) {
    const k = knownOf(reg);
    for (const h of ['#/kr/seoul/emd', '#/kr/seoul/emd/jongno-gu', '#/kr/seoul/emd/jongno-gu/p1', '#/kr/incheon/emd/ongjin-gun/explore', '#/kr/gyeonggi/gu', '#/kr/gyeonggi/gu/p1']) {
      assert.deepEqual(parseRoute(h, '', k), { route: { name: 'home' }, fix: '' }, h);
    }
    // 운영 주소는 그대로
    assert.deepEqual(parseRoute('#/kr/seoul/sgg/p2', '', k).route, { name: 'lesson', region: 'seoul', no: 2 });
  }
  // 운영 판(E7): 세 지역 동 주소가 열린다
  const kp = knownOf(createRegistry(geo));
  assert.deepEqual(parseRoute('#/kr/seoul/emd', '', kp).route, { name: 'emd', region: 'seoul' });
  assert.equal(parseRoute('#/kr/seoul/emd/jongno-gu/p1', '', kp).route.name, 'lesson');
  assert.deepEqual(parseRoute('#/kr/incheon/emd', '', kp).route, { name: 'emd', region: 'incheon' });
  assert.deepEqual(parseRoute('#/kr/incheon/emd/ongjin-gun/explore', '', kp).route, { name: 'explore', region: 'incheon/ongjin-gun', slug: null });
  assert.deepEqual(parseRoute('#/kr/gyeonggi/emd/suwon-si-jangan-gu/p2', '', kp).route, { name: 'lesson', region: 'gyeonggi/suwon-si-jangan-gu', no: 2 });
  // 관문이 열린 영어 앱(운영 판 enNames)도 같은 주소가 열린다 — 저장된 /en/#/kr/sejong·…/emd/… 가 홈으로 가지 않는다
  const ke = knownOf(createRegistry(geo, unitOptions('en', geo.units)));
  for (const h of ['#/kr/seoul/emd', '#/kr/seoul/emd/jongno-gu/p1', '#/kr/gyeonggi/gu/p1', '#/kr/sejong', '#/kr/jeju']) assert.deepEqual(parseRoute(h, '', ke), parseRoute(h, '', kp), h);
  // 인천 2026-07 새 구 이름이 단원 주소에 들어간다(제물포구·영종구·서해구·검단구)
  for (const s of ['jemulpo-gu', 'yeongjong-gu', 'seohae-gu', 'geomdan-gu']) assert.deepEqual(parseRoute(`#/kr/incheon/emd/${s}`, '', kp).route, { name: 'unit', region: `incheon/${s}` }, s);
  // 일반구 단원(E7): #/kr/gyeonggi/gu 로만. 동 주소 꼴(/emd/gu)이나 일반구 단원이 없는 지역은 홈으로
  assert.deepEqual(parseRoute('#/kr/gyeonggi/gu', '', kp).route, { name: 'unit', region: 'gyeonggi/gu' });
  assert.deepEqual(parseRoute('#/kr/gyeonggi/gu/p3', '', kp).route, { name: 'lesson', region: 'gyeonggi/gu', no: 3 });
  assert.deepEqual(parseRoute('#/kr/gyeonggi/gu/@suwon-si-jangan-gu', '', kp).route, { name: 'place', region: 'gyeonggi/gu', slug: 'suwon-si-jangan-gu' });
  assert.deepEqual(parseRoute('#/kr/gyeonggi/gu/explore/suwon-si-paldal-gu', '', kp).route, { name: 'explore', region: 'gyeonggi/gu', slug: 'suwon-si-paldal-gu' });
  for (const h of ['#/kr/gyeonggi/emd/gu', '#/kr/seoul/gu', '#/kr/incheon/gu', '#/kr/gyeonggi/gu/p99']) assert.deepEqual(parseRoute(h, '', kp), { route: { name: 'home' }, fix: '' }, h);
  for (const r of [{ name: 'unit', region: 'gyeonggi/gu' }, { name: 'lesson', region: 'gyeonggi/gu', no: 2 }, { name: 'mix', region: 'gyeonggi/gu' }] as const) {
    assert.deepEqual(parseRoute(toHash(r), '', kp).route, r, toHash(r));
  }
  assert.equal(toHash({ name: 'lesson', region: 'gyeonggi/gu', no: 2 }), '#/kr/gyeonggi/gu/p2');
  assert.deepEqual(parseRoute('#/kr/seoul/sgg/p2', '', kp).route, { name: 'lesson', region: 'seoul', no: 2 });
});

test('GA 값(N34): 동 단원 lesson_complete 는 unit emd · unit_id 5자리 · region 지역 키, 시·군·구는 전과 같은 모양', () => {
  const reg = regE();
  reg.addUnit(unitFile('11110'));
  assert.deepEqual(lessonCompleteParams(reg, 'seoul/jongno-gu', 1, 5, 6), { unit: 'emd', region: 'seoul', unit_id: '11110', lesson: 1, first_try: 5, total: 6 });
  // 시·군·구: 전과 같은 키·차례({ unit: 'sgg', region, lesson, first_try, total })
  const sgg = lessonCompleteParams(reg, 'seoul', 2, 4, 5);
  assert.deepEqual(Object.entries(sgg), [['unit', 'sgg'], ['region', 'seoul'], ['lesson', 2], ['first_try', 4], ['total', 5]]);
  // unit 을 보내지 않던 이벤트(route_open·game_start 등)는 지역이면 region 하나만, 동 단원이면 unit·unit_id 를 붙인다
  assert.deepEqual(gaArgs(reg, 'seoul'), { region: 'seoul' });
  assert.deepEqual(gaArgs(reg, 'incheon/ongjin-gun'), { unit: 'emd', region: 'incheon', unit_id: '28720' });
});

test('만나기 근거 한 줄(N13): 단원 안 자리 + 맞닿은 단원 밖 시·군·구(다른 시·도는 시·도 이름), 셋 이상이면 둘 + 등', () => {
  const reg = regE();
  const f = unitFile('11350');
  reg.addUnit(f);
  const id = (ko: string) => f.items.find((it) => it.ko === ko)!.id;
  assert.equal(meetKo(reg, id('상계1동')), '노원구 북쪽 끝, 도봉구·경기 의정부시 등과 맞닿은 곳');
  assert.equal(meetKo(reg, id('상계2동')), '노원구 가운데');
  assert.equal(meetKo(reg, id('상계10동')), '노원구 서쪽, 도봉구와 맞닿은 곳');
  assert.equal(L.line(reg, id('상계2동')), '노원구 가운데', '화면 글(L.line)도 동은 근거 한 줄');
  assert.equal(meetKo(reg, 'kr:sgg:11110'), '', '시·군·구는 원고 한 줄을 쓴다');
  // 단원이 섞이는 화면의 이름(N12)
  assert.equal(L.fullName(reg, id('상계1동')), '노원구 상계1동');
  assert.equal(L.fullName(reg, 'kr:sgg:11110'), '종로구');
});

test('곳 수 글: 동 단원은 동·읍·면으로 센다(시·군·구 글은 그대로)', () => {
  const reg = regE();
  for (const c of ['11110', '28720']) reg.addUnit(unitFile(c));
  const reg2 = createRegistry({ ...geo, units: { ...geo.units } });
  const jz = unitFile('43745');
  reg2.addUnit(jz);
  assert.equal(L.count(reg.region('seoul/jongno-gu')!), '17개 동');
  assert.equal(L.count(reg.region('incheon/ongjin-gun')!), '7개 면');
  assert.equal(L.count(reg2.region('chungbuk/jeungpyeong-gun') ?? reg2.units.find((u) => u.layer === 'emd')!), '2개 읍·면');
  const l1 = reg.lesson('seoul/jongno-gu', 1)!;
  assert.equal(L.lessonCount(reg.region('seoul/jongno-gu')!, l1.items), `${l1.items.length}개 동`);
  assert.deepEqual(['seoul', 'incheon', 'gyeonggi'].map((k) => L.count(reg.region(k)!)), ['25개 구', '2군 9구', '31개 시·군']);
});

test('구 고르기·단원 쪽: 동 색인으로 목록·진도를 그리고, 단원 쪽은 지역 쪽과 같은 틀(동 정보)로', async () => {
  const { pickPage, unitPage, startPage } = await import('../../src/app/ui/pages.ts');
  const reg = regE();
  reg.addUnit(unitFile('11110'));
  const l1 = unitFile('11110').lessons[0].items;
  const mastery = Object.fromEntries(l1.map((id) => [id, { box: 1, due: T, hi: 1, streak: 0, grad: false, front: false }]));
  const ctx = ctxOf(reg, { mastery, lastUnit: 'seoul/jongno-gu', last: 'seoul' });
  const pick = pickPage(ctx, 'seoul');
  assert.ok(!pick.html.includes('undefined'));
  assert.match(pick.html, /어느 구의 동을<br>배울까요\?/);
  for (const ko of ['종로구', '중랑구', '노원구']) assert.ok(pick.html.includes(`<span class="nm">${ko}</span>`), ko);
  assert.match(pick.html, /href="#\/kr\/seoul\/emd\/jongno-gu"[^>]*>[\s\S]*?6\/17 채움/);
  assert.match(pick.html, /종로구 이어서 배우기/);
  // 지도 칸 = 단원: 종로구 칸은 익히는 중(1), 오늘 복습할 동이 있으면 점
  const spec = pick.maps!.pick;
  assert.equal(spec.fills!['kr:sgg:11110'], 1);
  assert.equal(spec.fills!['kr:sgg:11350'], 0);
  assert.deepEqual(spec.badges, ['kr:sgg:11110']);
  // 단원 쪽: 머리·링크(다른 구 고르기 · 지역 과로)·단원 시험 최고 기록
  const u = unitPage(ctxOf(reg, { bestUnits: { 'seoul/jongno-gu': { score: 15, total: 17, seconds: 61, day: T } } }), 'seoul/jongno-gu');
  assert.ok(!u.html.includes('undefined'));
  assert.match(u.html, /서울 · 동까지 공부하기/);
  assert.match(u.html, /종로구 17개 동/);
  assert.match(u.html, /href="#\/kr\/seoul\/emd"><span>다른 구 고르기/);
  assert.match(u.html, /href="#\/kr\/seoul"><span>서울 과로 돌아가기/);
  assert.match(u.html, /최고 15\/17/);
  assert.match(u.html, /href="#\/kr\/seoul\/emd\/jongno-gu\/p1"/);
  assert.deepEqual(u.maps!.unit.isles, []);
  // 과 시작
  const s = startPage(ctx, 'seoul/jongno-gu', 1);
  assert.match(s.html, /data-act="learn" data-arg="seoul\/jongno-gu:1"/);
  assert.match(s.html, new RegExp(`${l1.length}개 동`));
});

test('지역 단원 쪽: 동 색인이 있으면(운영 판 E6 서울) \'동까지 공부하기\'가 구 고르기 링크, 없으면(동 공개 전) 전과 같은 \'준비 중\'', async () => {
  const { unitPage } = await import('../../src/app/ui/pages.ts');
  const on = unitPage(ctxOf(regE()), 'seoul').html, off = unitPage(ctxOf(createRegistry(geoNoEmd)), 'seoul').html;
  assert.equal(unitPage(ctxOf(createRegistry(geo)), 'seoul').html, on, '운영 판(E6)은 링크');
  assert.match(on, /<a class="h-link" href="#\/kr\/seoul\/emd"><span>동까지 공부하기<\/span>/);
  assert.match(off, /<span class="h-link off"><span>동까지 공부하기<\/span> <em>준비 중<\/em><\/span>/);
  assert.ok(!off.includes('#/kr/seoul/emd'));
  // 일반구 단원 링크(E7)와 동 링크 한 줄씩. 동 색인·일반구 단원이 없으면(동 공개 전·옛 캐시) 둘 다 없다(그 밖은 바이트까지 같음)
  const guLk = '<a class="h-link" href="#/kr/gyeonggi/gu"><span>일반구 24곳 공부하기</span> <i aria-hidden="true">→</i></a>';
  const emdLk = (r: string) => `<a class="h-link" href="#/kr/${r}/emd"><span>동까지 공부하기</span> <i aria-hidden="true">→</i></a>`;
  const ggOff = unitPage(ctxOf(createRegistry(geoNoEmd)), 'gyeonggi').html;
  assert.ok(!ggOff.includes('#/kr/gyeonggi/gu') && !ggOff.includes('#/kr/gyeonggi/emd'));
  // 경기(이 시험 색인에 동 단원 없음): 일반구 단원 링크만
  assert.equal(unitPage(ctxOf(regE()), 'gyeonggi').html.replace(guLk, ''), ggOff);
  // 운영 판(E7): 경기는 일반구 단원 → 동 차례(계획서 N5 — 일반구를 동보다 먼저), 인천은 동 링크
  const ggOn = unitPage(ctxOf(createRegistry(geo)), 'gyeonggi').html;
  assert.ok(ggOn.includes(guLk + emdLk('gyeonggi')), '일반구 링크 바로 뒤에 동 링크');
  assert.equal(ggOn.replace(guLk + emdLk('gyeonggi'), ''), ggOff);
  assert.equal(unitPage(ctxOf(createRegistry(geo)), 'incheon').html.replace(emdLk('incheon'), ''), unitPage(ctxOf(createRegistry(geoNoEmd)), 'incheon').html);
  // 일반구를 끈 창(관문이 닫힌 영어 앱 — 2026-11-16 전 영어 앱, N26)은 일반구 단원을 등록하지 않아 링크가 없다. 관문이 열린 영어 앱은 등록한다(EN_EMD 1.2)
  assert.equal(createRegistry(geo, EN_OFF).region('gyeonggi/gu'), undefined);
  assert.ok(createRegistry(geo, unitOptions('en', geo.units)).region('gyeonggi/gu'));
});

test('섬 상자(E5 결정): 옹진군처럼 고를 칸이 모두 섬이면 격자 — 폰 문제 화면에서 상자 축척이 파이프라인 섬 상자(128×112)보다 작지 않다', async () => {
  const { unitPage, startPage } = await import('../../src/app/ui/pages.ts');
  const reg = regE();
  const f = unitFile('28720');
  const r = reg.addUnit(f);
  const S = buildShapes(unitTopo('28720'), specOf(r), f.labels);
  assert.equal(S.far, null, 'FAR_LON 먼 섬 상자는 끈다');
  // 2026-11-17(D2 사용자 결정 '과를 셋으로'): 1과 덕적·자월·2과 북도·영흥은 본 지도 한 장(상자 없음), 3과 먼 섬 셋(백령·대청·연평)만 상자. 단원 전체 화면은 일곱 섬 상자 그대로
  assert.deepEqual(r.lessons.map((l) => lessonView(l).isles.length), [0, 0, 3]);
  assert.equal(wholeView(r).isles.length, 7);
  const views = wholeView(r).isles.map((id) => isleView(S.cells.get(id)!.rings, S.cells.get(id)!.r));
  const inset = Math.min(...views.map((v) => fitK(v, ISLE_W, ISLE_H)));
  // 폰 문제 화면의 지도 칸(390×844 에서 약 366×470, 여백 12)
  const g = layoutIsles(views, { x: 12, y: 12, w: 366, h: 470 }, true);
  assert.equal(g.mode, 'grid');
  assert.equal(g.boxes.length, 7);
  assert.ok(g.minK >= inset, `격자 축척 ${g.minK} ≥ 섬 상자 축척 ${inset}`);
  // 상자끼리 겹치지 않고 지도 칸 안
  for (const [i, a] of g.boxes.entries()) {
    assert.ok(a.x >= 12 && a.y >= 12 && a.x + a.w <= 378 + 1e-9 && a.y + a.h <= 482 + 1e-9);
    for (const b of g.boxes.slice(i + 1)) assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  }
  // 쪽 지도에도 섬 상자
  assert.equal(unitPage(ctxOf(reg), 'incheon/ongjin-gun').maps!.unit.isles!.length, 7);
  // 과 시작 화면의 지도는 단원 전체(이번 과만 밝게)라 일곱 섬 상자 그대로
  assert.equal(startPage(ctxOf(reg), 'incheon/ongjin-gun', 1).maps!.start.isles!.length, 7);
});

test('섬 상자 축척 칸(2026-11-15 — 먼 섬 · 축척 다름 대신): 옹진 상자마다 그 상자의 실제 축척 막대, 고른 귀퉁이는 그 섬을 덮지 않는다(폰 격자 · 넓은 격자 · 128×112 줄, 이름 칸 있을 때·없을 때)', () => {
  const reg = regE();
  const f = unitFile('28720');
  const r = reg.addUnit(f);
  const S = buildShapes(unitTopo('28720'), specOf(r), f.labels);
  const ids = wholeView(r).isles;   // 일곱 섬 상자는 단원 전체 화면에(과는 2026-11-17 부터 셋으로 나뉘어 3과만 상자 셋)
  assert.equal(ids.length, 7);
  const views = ids.map((id) => isleView(S.cells.get(id)!.rings, S.cells.get(id)!.r));
  const layouts = [
    layoutIsles(views, { x: 12, y: 12, w: 366, h: 470 }, true),    // 폰 문제 화면
    layoutIsles(views, { x: 24, y: 24, w: 900, h: 600 }, true),    // 넓은 화면
    layoutIsles(views, { x: 24, y: 24, w: 900, h: 600 }, false),   // 줄(128×112 — 파이프라인 섬 상자 크기)
  ];
  for (const g of layouts) ids.forEach((id, i) => {
    // svgmap fitIsleScale 과 같이: 상자 안쪽(테두리 1px 씩 뺀 곳)에 범위를 meet 으로 맞춘 배율
    const b = g.boxes[i], w = b.w - 2, h = b.h - 2, k = fitK(views[i], w, h);
    const s = insetScale(k, w);
    assert.ok(Math.abs(s.px - s.m * k) < 1e-9, '막대 길이 = 그 상자의 실제 축척');
    const c = scaleChip(s), v = views[i];
    const cells = S.ids.filter((cid) => { const bb = S.cells.get(cid)!.box; return bb[0] < v[2] && bb[2] > v[0] && bb[1] < v[3] && bb[3] > v[1]; })
      .map((cid) => ({ rings: S.cells.get(cid)!.rings, box: S.cells.get(cid)!.box, own: cid === id }));
    const cov = cornerCover(v, w, h, c.w, c.h, cells);
    const name = reg.place(id)!.item.ko;
    // 옹진 상자는 격자(옹진 화면은 늘 격자)·줄 모두 그 섬을 덮지 않는 귀퉁이가 있다(처음 '━ 2km' 한 줄 칸은 128×112 줄에서 덕적면·자월면을 덮었다 — 그래서 세로 꼴로 바꿈)
    for (const nameW of [0, Math.ceil(textWidth(name, 14)) + 13]) {
      const at = pickCorner(cov, w, c.w, nameW);
      assert.ok(cov[at] < OWN_W, `${g.mode} ${Math.round(b.w)}×${Math.round(b.h)} ${name} ${s.text} ${at} ${JSON.stringify(cov)}`);
    }
  });
});

test('섬 상자 줄: 본 땅과 섞인 과는 128×112 상자를 넓은 칸은 왼쪽 세로 줄, 세로로 긴 칸은 아래 가로 줄에 두고 본 지도를 비킨다', () => {
  const v: [number, number, number, number][] = [[0, 0, 1000, 800], [0, 0, 500, 900]];
  const col = layoutIsles(v, { x: 24, y: 24, w: 900, h: 600 }, false);
  assert.equal(col.mode, 'col');
  assert.deepEqual(col.boxes.map((b) => [b.x, b.w, b.h]), [[24, ISLE_W, ISLE_H], [24, ISLE_W, ISLE_H]]);
  assert.equal(col.shift.l, ISLE_W + 16);
  const row = layoutIsles(v, { x: 12, y: 12, w: 366, h: 470 }, false);
  assert.equal(row.mode, 'row');
  assert.equal(row.boxes[0].y + ISLE_H, 482, '아래에 붙는다');
  assert.ok(row.shift.b >= ISLE_H && row.shift.l === 0);
});

test('섬 상자 줄은 지도 칸 밖으로 넘치지 않는다(2026-11-15 점검 — 폰 완도군 동 단원 쪽: 섬 7곳 세로 줄이 4열 536px 로 지도 칸 362px 를 넘어 본 지도가 사라졌다)', () => {
  // 커밋된 판(public/data/geo/<판>/emd)의 단원 파일을 읽는다(.cache·docs·dist 에 기대지 않는다)
  const DIR = path.join(import.meta.dirname, '../../public/data/geo', DATA_VER, 'emd');
  const unitAt = (code: string) => {
    const u = JSON.parse(fs.readFileSync(path.join(DIR, `${code}.json`), 'utf8'));
    const S = buildShapes(JSON.parse(fs.readFileSync(path.join(DIR, `${code}.topo.json`), 'utf8')) as Topology, { layer: 'emd', idKey: 'id', ids: u.items.map((it: { id: string }) => it.id), far: false }, u.labels);
    return { u, S };
  };
  const inArea = (L: ReturnType<typeof layoutIsles>, a: { x: number; y: number; w: number; h: number }, what: string) => {
    for (const [i, b] of L.boxes.entries()) {
      assert.ok(b.x >= a.x - 1e-9 && b.y >= a.y - 1e-9 && b.x + b.w <= a.x + a.w + 1e-9 && b.y + b.h <= a.y + a.h + 1e-9, `${what} 상자 ${i} 지도 칸 안`);
      for (const c of L.boxes.slice(i + 1)) assert.ok(b.x + b.w <= c.x || c.x + c.w <= b.x || b.y + b.h <= c.y || c.y + c.h <= b.y, `${what} 상자끼리 겹치지 않음`);
    }
    const span = L.mode === 'col' ? L.shift.l + L.shift.r : L.shift.b;
    assert.ok(span <= STRIP_MAX * (L.mode === 'col' ? a.w : a.h) + 1e-9, `${what} 줄이 지도 칸의 절반 안(${span})`);
  };
  // 완도군 전체 보기(단원 쪽·둘러보기·시험 결과): 섬 7곳 + 본 땅. 2026-11-16(D2 — 가까운 섬은 본 지도)부터 완도군에는 섬 상자가 없다 —
  // 줄 넘침 규칙(stripFit)은 그 섬 7곳('섬' 화면의 곳)을 상자로 두었을 때의 범위로 계속 지킨다
  const { u, S } = unitAt('12850');
  assert.equal(wholeView(u).isles.length, 0, '완도군: 섬 상자 없음(D2)');
  const seven: string[] = u.screens.find((s: { key: string }) => s.key === 'islands').items;
  assert.equal(seven.length, 7);
  const views = seven.map((id) => isleView(S.cells.get(id)!.rings, S.cells.get(id)!.r));
  const phone = { x: 12, y: 12, w: 362, h: 347 }, tall = { x: 12, y: 12, w: 366, h: 470 }, wide = { x: 24, y: 24, w: 900, h: 600 };
  for (const [a, what] of [[phone, '폰 단원 쪽'], [tall, '폰 세로로 긴 칸'], [wide, '넓은 칸']] as const) inArea(layoutIsles(views, a, false), a, `완도 ${what}`);
  // 폰은 상자를 줄이고(본 지도가 보이게), 넓은 칸은 전과 같은 128×112 세로 두 줄
  const ph = layoutIsles(views, phone, false), wd = layoutIsles(views, wide, false);
  assert.ok(ph.boxes[0].w < ISLE_W && ph.boxes[0].w / ph.boxes[0].h > 1.1, `폰 상자 ${ph.boxes[0].w}×${ph.boxes[0].h}`);
  assert.deepEqual([wd.mode, wd.boxes[0].w, wd.boxes[0].h, wd.shift.l], ['col', ISLE_W, ISLE_H, 2 * ISLE_W + 3 * 8]);
  // 지금 판의 다른 줄(섬 1~2곳 — 여수·영광·안산 단원구·제주시·부안 등)은 같은 칸에서 전과 같이 128×112
  for (const code of fs.readdirSync(DIR).filter((f) => /^\d{5}\.json$/.test(f)).map((f) => f.slice(0, 5))) {
    const j = JSON.parse(fs.readFileSync(path.join(DIR, `${code}.json`), 'utf8'));
    const lists = [wholeView(j).isles, ...j.lessons.filter((l: { items: string[]; insets?: string[] }) => l.insets?.length && !l.items.every((id) => l.insets!.includes(id))).map((l: { insets: string[] }) => l.insets)];
    for (const ids of lists) {
      if (!ids.length || ids.length > 2) continue;
      const vs = ids.map((): [number, number, number, number] => [0, 0, 1000, 900]);
      for (const a of [phone, tall, wide]) {
        const L = layoutIsles(vs, a, false);
        assert.deepEqual([L.boxes[0].w, L.boxes[0].h], [ISLE_W, ISLE_H], `${j.ko} 섬 ${ids.length}곳 ${a.w}×${a.h}`);
      }
    }
  }
});

test('동 쪽 [오늘 복습] 단추(E5 검수): 지금 #/review 가 열 판이 시·군·구 몫이면 숨기고, 동 몫 판이 이 쪽 동을 담으면 보인다', async () => {
  const { pickPage, unitPage } = await import('../../src/app/ui/pages.ts');
  const reg = regE();
  reg.addUnit(unitFile('11110'));
  const due = (id: string) => [id, { box: 1, due: T, hi: 1, streak: 0, grad: false, front: false }];
  const emd = unitFile('11110').lessons[0].items.slice(0, 3);
  const btn = (html: string) => /<a class="btn2 h-go2?" href="#\/review">/.test(html);
  // 시·군·구 복습이 남은 날: 열릴 판은 시·군·구 몫(N32) → 동 쪽 단추 없음. 진도 머리의 '오늘 복습 3곳'은 그대로
  const mixed = ctxOf(reg, { mastery: Object.fromEntries([...emd.map(due), due('kr:sgg:11680')]) });
  assert.ok(!btn(pickPage(mixed, 'seoul').html), '구 고르기');
  assert.ok(!btn(unitPage(mixed, 'seoul/jongno-gu').html), '동 단원 쪽');
  assert.match(pickPage(mixed, 'seoul').html, /오늘 복습 3곳/);
  // 지역 단원 쪽은 전과 같이 그 지역 복습 수로 단추(운영 그대로)
  assert.ok(btn(unitPage(mixed, 'seoul').html), '지역 단원 쪽');
  // 시·군·구 복습이 없는 날: 동 몫 판이 이 단원의 동을 담는다 → 단추
  const emdOnly = ctxOf(reg, { mastery: Object.fromEntries(emd.map(due)) });
  assert.ok(btn(pickPage(emdOnly, 'seoul').html));
  assert.ok(btn(unitPage(emdOnly, 'seoul/jongno-gu').html));
  // 동 몫을 오늘 다 쓴 날: 열릴 판이 비어 있으니 단추 없음
  const full = ctxOf(reg, { mastery: Object.fromEntries(emd.map(due)), dailyEmd: { day: T, n: 999 } });
  assert.ok(!btn(pickPage(full, 'seoul').html));
});

test('섬 상자 지리 차례·오답 문구(E5 검수): 격자는 북쪽 섬부터 줄을 채우고 줄 안은 서쪽부터, 섬 상자가 낀 오답은 방위 대신 그려진 자리', () => {
  // 지도 단위는 y 가 아래로: 북쪽 섬 = y 가 작은 쪽. 넷을 2열로 놓으면 위 줄 = 북쪽 둘(서→동), 아래 줄 = 남쪽 둘
  const v = (x: number, y: number): [number, number, number, number] => [x, y, x + 1000, y + 900];
  const views = [v(9000, 9000), v(0, 0), v(0, 9000), v(9000, 500)];   // 남동 · 북서 · 남서 · 북동
  const g = layoutIsles(views, { x: 0, y: 0, w: 400, h: 400 }, true);
  const at = g.boxes.map((b) => [b.x > 100 ? 'E' : 'W', b.y > 100 ? 'S' : 'N'].join(''));
  assert.deepEqual(at, ['ES', 'WN', 'WS', 'EN']);
  // 세로 줄은 북→남, 가로 줄은 서→동
  const col = layoutIsles([v(0, 5000), v(0, 0)], { x: 0, y: 0, w: 900, h: 600 }, false);
  assert.ok(col.boxes[1].y < col.boxes[0].y);
  const row = layoutIsles([v(5000, 0), v(0, 0)], { x: 0, y: 0, w: 366, h: 470 }, false);
  assert.ok(row.boxes[1].x < row.boxes[0].x);
  // 오답 문구: 정답이 섬 상자면 '따로 그린 섬 상자', 정답이 본 지도면 '본 지도'
  const reg = regE();
  const r = reg.addUnit(unitFile('28720'));
  const [a] = r.items;
  assert.equal(L.isleWhere(reg, a.id, true), `${a.ko}${/[가-힣]/.test(a.ko) && ((a.ko.charCodeAt(a.ko.length - 1) - 0xac00) % 28 ? '은' : '는')} 따로 그린 섬 상자에 있어요`);
  assert.match(L.isleWhere(reg, a.id, false), /본 지도에 있어요$/);
});
