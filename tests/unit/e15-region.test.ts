// 경남(계획서 NATIONWIDE_PLAN E15 — 새 시·도, E14 충남·경북과 함께 진행): 지역 표 → 파이프라인 → 판 units.json → 앱이 경남에서 도는지 본다.
// 이 단계에서 따로 볼 것(계획서 E11~E16 단계별 추가 사항 E15 줄): 18곳 + 창원 일반구 단원 5, 305동, 거제·남해 '다리로 이어짐'(바다 건너 이웃),
// 대마도(Natural Earth 일본)를 이웃 땅에(그 자리가 빈 바다가 아님), 40m 시험(경남 -sgg 크기 — N20 고리 점 3만), 창원 5구 단원.
// 동 단원 전수(파일·등록·16px·1곳 과·40KB·3곳 이하 화면)는 emd-units.test 가 본다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import * as topo from 'topojson-client';
import { DATA_VER } from '../../src/consts.ts';
import { lessonQuestions } from '../../src/app/core/questions.ts';
import { rngFrom } from '../../src/app/core/rng.ts';
import type { Mastery, Rec } from '../../src/app/core/mastery.ts';
import { homeCard, todayReview } from '../../src/app/core/next.ts';
import { usableDeck } from '../../src/app/core/session.ts';
import { tomorrowCount } from '../../src/app/core/tally.ts';
import { gaArgs, gaUnit, registerUnits } from '../../src/app/core/units.ts';
import { createRegistry, type Registry } from '../../src/app/registry.ts';
import { parseRoute, type Known } from '../../src/app/router.ts';
import { checkDeck, checkLast, checkMastery, keys, openStore, type KV } from '../../src/app/store.ts';
import { UI_EN, UI_KO, setLang } from '../../src/app/text/ui.ts';
import type { EmdUnitFile } from '../../src/app/types.ts';
import type { Ctx } from '../../src/app/ui/ctx.ts';
import { homePage, pickPage, regionsPage, unitPage } from '../../src/app/ui/pages.ts';
import { LIVE, scopeEn, scopeKo } from '../../src/lib/regions.ts';
import { E15_KEYS, geo, geoNoE15, reg, idOf } from './fixtures.ts';

const T = 20000;
const root = path.join(import.meta.dirname, '../..');
const dir = path.join(root, 'public/data/geo', DATA_VER);
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const SIDO = read('src/data/sido.json').sidos.find((s: { key: string }) => s.key === 'gyeongnam');
const SRC = read('src/data/units.json').regions.find((r: { key: string }) => r.key === 'gyeongnam');
const LINES = read('src/data/place-lines.json').gyeongnam;
const HARD: string[] = read('src/data/hard-words.json').words;
const MANIFEST = read(`public/data/geo/${DATA_VER}/manifest.json`);
const unitFile = (code: string): EmdUnitFile => JSON.parse(fs.readFileSync(path.join(dir, 'emd', `${code}.json`), 'utf8'));
const topoOf = (name: string) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const gz9 = (name: string) => zlib.gzipSync(fs.readFileSync(path.join(dir, name)), { level: 9 }).length;
const BAD = /undefined|NaN|kr:(sgg|emd|sido):|\[object/;
const tabKeys = (h: string) => [...h.matchAll(/data-act="homeRegion" data-arg="([a-z-]+)"/g)].map((x) => x[1]);
const pressed = (h: string) => /data-arg="([a-z-]+)" aria-pressed="true"/.exec(h)?.[1];
const sp = (h: string) => h.replace(/ /g, ' ');
const rec = (box: number, due: number | null, o: Partial<Rec> = {}): Rec => ({ box, due, hi: box >= 5 ? 3 : box >= 3 ? 2 : box >= 1 ? 1 : 0, streak: 0, grad: false, front: false, ...o });
const ctxOf = (r: Registry, o: Partial<Ctx> = {}): Ctx => ({
  reg: r, geo, base: '/', ver: DATA_VER, storageOk: true, inApp: false,
  mastery: {}, lessonDeck: null, otherDeck: null, checkDeck: null, checkStart: 0,
  daily: null, dailyEmd: null, last: null, lastUnit: null, settings: { autoNext: false }, homeRegion: null, bests: {}, bestUnits: {},
  today: () => T, save() {}, go() {}, back() {}, render() {}, toast() {},
  ...o,
}) as Ctx;
const knownOf = (r: Registry): Known => {
  const idx = (k: string) => (r.region(k) ? undefined : r.unit(k)?.index);
  return {
    region: (k) => !!r.region(k),
    lesson: (rg, n) => !!r.lesson(rg, n) || (n >= 1 && n <= (idx(rg)?.lessons ?? 0)),
    slug: (rg, s) => !!r.bySlug(rg, s) || !!idx(rg)?.ids.includes(s),
    emd: (k) => r.emdUnits(k).length > 0,
    unit: (k) => !!r.unit(k) || !!r.region(k)?.unit,
    main: (k) => r.region(k)?.layer === 'emd',
  };
};
type G = { type: string; coordinates: unknown } | null;
const polys = (g: G) => (!g ? [] : g.type === 'Polygon' ? [g.coordinates as number[][][]] : g.type === 'MultiPolygon' ? g.coordinates as number[][][][] : []);

test('지역 표·판: 경남 공개(status·emd·gu live, 공개 차례 15, 단순화 40m), 판 units.json 은 원고와 같은 곳·과·넓은 화면 — 18곳(시 층) 4과 · 넓은 화면 동쪽·서쪽', () => {
  assert.deepEqual(E15_KEYS, ['gyeongnam']);
  assert.deepEqual([SIDO.status, SIDO.emd, SIDO.gu, SIDO.layer, SIDO.enChecked, SIDO.hub, SIDO.openOrder, SIDO.gunFirst, SIDO.simplifySggM, SIDO.lineRequired],
    ['live', 'live', 'live', 'si', true, null, 15, false, 40, true]);
  assert.deepEqual(SIDO.desc, { ko: ['바다에 닿은 곳 7, 닿지 않은 곳 11', ''], en: ['7 on the sea, 11 inland', ''] });
  assert.deepEqual(UI_KO.regionDesc.gyeongnam, ['바다에 닿은 곳 7, 닿지 않은 곳 11', '']);
  const r = reg.region('gyeongnam')!;
  assert.deepEqual([r.layer, r.items.length, r.lessons.length, r.screens.length], ['si', 18, 4, 2]);
  // 지역 표 차례(코드 차례): 경북(47, E14) 다음, 제주(50) 앞
  const ks = reg.regions.map((x) => x.key);
  assert.equal(ks.indexOf('gyeongnam'), ks.indexOf('jeju') - 1);
  assert.equal(ks.indexOf('gyeongnam'), ks.indexOf('gyeongbuk') + 1);
  assert.deepEqual(r.lessons.map((l) => [l.no, l.title, l.en, l.items.map((id) => reg.place(id)!.item.ko)]),
    SRC.lessons.map((l: { no: number; title: string; en: string; items: string[] }) => [l.no, l.title, l.en, l.items]));
  // 과 이름(쉬운 말 — 방위·바다): 1과는 도청이 있는 창원이 든 남쪽 바닷가
  assert.deepEqual(r.lessons.map((l) => [l.title, l.items.length]), [['남쪽 바닷가', 4], ['동쪽', 5], ['남서쪽', 4], ['북서쪽', 5]]);
  for (const l of r.lessons) {
    assert.ok(l.minTapPx >= 16, `${l.no}과 ${l.minTapPx}px`);
    assert.ok(l.items.length >= 3 && l.items.length <= 6, `${l.no}과 ${l.items.length}곳`);
    assert.ok(l.title.length <= 12 && !/권역|도심/.test(l.title), l.title);
  }
  // 넓은 화면: 동쪽(1·2과)·서쪽(3·4과) 아홉 곳씩. 한 화면이면 통영시 16px(기준 통과지만 '모호' — 둘로 나눠 22px)
  assert.deepEqual(r.screens.map((s) => [s.key, s.ko, s.items.length]), [['east', '동쪽', 9], ['west', '서쪽', 9]]);
  for (const s of r.screens) assert.ok(s.minTapPx >= 16, `${s.ko} ${s.minTapPx}px`);
  for (const it of r.items) { assert.equal(it.slug, SRC.slugs[it.ko], it.ko); assert.match(it.slug, /^[a-z][a-z0-9-]{2,}$/); assert.match(it.id, /^kr:sgg:48\d{3}$/); }
  assert.equal(new Set(r.items.map((it) => it.slug)).size, 18);
  // 시 층: 창원시 = 일반구 다섯(48121~48129)을 10 단위로 내린 칸
  assert.equal(idOf('창원시'), 'kr:sgg:48120');
  assert.equal(idOf('고성군', 'gyeongnam'), 'kr:sgg:48820');
});

test('위치 한 줄(N27): 경남 18곳 — 원고 그대로, 30자 이하·금지 낱말 없음, 지도 근거만(명소 없음) · 거제·남해는 맞닿음 없이 \'바다로 둘러싸인 섬\'', () => {
  let n = 0;
  for (const it of reg.region('gyeongnam')!.items) {
    const e = LINES[it.ko];
    assert.ok(e, `${it.ko} 원고`);
    assert.equal(it.line, e.line, it.ko);
    assert.ok(e.line.length <= 30, `${it.ko} ${e.line.length}자`);
    for (const w of HARD) assert.ok(!e.line.includes(w), `${it.ko} 금지 낱말 ${w}`);
    assert.equal(e.at, undefined, `${it.ko}: 명소(at)는 OSM 대조 허락 뒤에만`);
    assert.equal(e.manual, undefined, `${it.ko}: 근거 없는 말(manual) 없음`);
    assert.ok(['touch', 'dir', 'side', 'size', 'coast'].some((x) => x in e), `${it.ko} 근거`);
    assert.equal(UI_KO.line(reg, it.id), e.line);
    n++;
  }
  assert.equal(n, 18);
  for (const k of ['거제시', '남해군']) { assert.equal(LINES[k].coast, 'all', k); assert.equal(LINES[k].touch, undefined, `${k}: 땅으로 맞닿은 곳이 없음`); }
  // 다른 시·도와의 맞닿음은 시·도 이름(아직 열지 않은 전남광주도 시·도 이름으로 잰다)
  assert.deepEqual(LINES['하동군'].touch, ['전남광주통합특별시']);
  assert.deepEqual(LINES['거창군'].touch, ['경상북도', '전북특별자치도']);
  assert.equal(UI_EN.line(reg, idOf('창원시')), '', '위치 한 줄은 한국어만');
});

test('거제·남해(땅으로 맞닿은 시·군·구가 없는 섬, 계획서 N8): 다리로 이어진 바다 건너 이웃(pipeline/data/sea-links.json) — 판 neighbors.sea, 땅 이웃은 0', () => {
  const sea = geo.neighbors.sea;
  const pairs = (id: string) => (sea[id] ?? []).map((x) => [reg.place(x.id)?.item.ko ?? x.id, x.via]).sort();
  assert.deepEqual(pairs(idOf('거제시')), [['강서구', '거가대교'], ['통영시', '거제대교·신거제대교']]);
  assert.deepEqual(pairs(idOf('남해군')), [['사천시', '창선·삼천포대교'], ['하동군', '남해대교·노량대교']]);
  // 거가대교 건너편 부산 강서구(26440)는 부산 지역 곳(시·군·구 층 열쇠) — 시 층 이웃과 같은 열쇠
  assert.equal(reg.place('kr:sgg:26440')?.region.key, 'busan');
  assert.deepEqual(sea['kr:sgg:26440'], [{ id: idOf('거제시'), via: '거가대교' }]);
  // 땅으로 맞닿은 이웃은 없다(시 층·시·군·구 층 모두)
  for (const k of ['거제시', '남해군']) { assert.deepEqual(geo.neighbors.si[idOf(k)] ?? [], [], k); assert.deepEqual(geo.neighbors.sgg[idOf(k)] ?? [], [], k); }
  // 손 표: 다리 이름(via)이 있고, 두 곳 모두 원자료에 있는 시·군·구(파이프라인이 검사)
  const links = read('pipeline/data/sea-links.json').links.filter((l: { a: string }) => l.a.startsWith('kr:sgg:48'));
  assert.equal(links.length, 4);
  for (const l of links) assert.ok(l.via && l.ko, JSON.stringify(l));
});

test('대마도(계획서 N19 · E15): Natural Earth 일본 덩어리가 경남 지역 경계 파일의 이웃 땅 층에 \'일본\'으로 실린다 — 다른 지역 파일·전국 시·도 지도에는 없음', () => {
  const t = topoOf('gyeongnam-sgg.topo.json');
  const jp = topo.feature(t, t.objects.out).features.filter((f: { properties: { sido: string } }) => f.properties.sido === 'jp');
  assert.equal(jp.length, 1);
  assert.equal(jp[0].properties.name, '일본');
  // 대마도 남섬·북섬(지역 상자를 30% 넓힌 범위로 잘림): 북위 34.0~34.75, 동경 129.1~129.55
  const ps = polys(jp[0].geometry);
  assert.ok(ps.length >= 1);
  const pts = ps.flatMap((p) => p[0]);
  assert.ok(pts.every(([x, y]) => x > 129.1 && x < 129.55 && y > 34.0 && y < 34.75), '대마도 범위');
  assert.ok(Math.max(...pts.map((p) => p[1])) > 34.65, '대마도 북쪽 끝(북위 34.7 무렵)까지');
  // 이름 자리(lp)는 덩어리 안
  const [lx, ly] = jp[0].properties.lp as [number, number];
  assert.ok(lx > 129.2 && lx < 129.5 && ly > 34.3 && ly < 34.7, `lp ${lx},${ly}`);
  // 영어 화면 이름(맥락 이름): 'Japan' · 한국어는 '일본' 그대로
  assert.equal(UI_EN.ctxName('jp', '일본'), 'Japan');
  assert.equal(UI_KO.ctxName('jp', '일본'), '일본');
  // 다른 공개 지역의 경계 파일과 전국 시·도 지도에는 일본 땅이 없다(전국 지도의 맥락 땅은 북한만)
  for (const R of geo.units.regions.filter((x) => x.key !== 'gyeongnam')) {
    const o = topoOf(`${R.key}-sgg.topo.json`).objects.out;
    assert.ok(!(o?.geometries ?? []).some((g: { properties: { sido: string } }) => g.properties.sido === 'jp'), R.key);
  }
  const k = topoOf('sido.topo.json');
  assert.deepEqual([...new Set(k.objects.out.geometries.map((g: { properties: { sido: string } }) => g.properties.sido))], ['kp']);
  // 출처 쪽이 읽는 기록
  assert.deepEqual(MANIFEST.context_jp, ['gyeongnam']);
  assert.deepEqual(read('pipeline/data/context.json').japan.a3, 'JPN');
});

test('40m 시험(계획서 N20 · E15): 경남 지역 경계 파일만 40m — gz 100KB 이하, 고리 점(칸 + 이웃 땅 + 강) 3만 이하 · manifest simplify_m.sggBy', () => {
  // 판 값은 지역 표에서 계산한다(E14 경북 40m 와 합쳐도 그대로 맞게): simplify_m.sgg = 지역 표 차례 첫 공개 지역(서울)의 값,
  // sggBy = 그 값과 다른 공개 지역 { key: m }(파이프라인 SGG_SIMPLIFY_M·SGG_SIMPLIFY_BY 와 같은 규칙 — E14·E15 를 합칠 때 E14 구현을 남김)
  const live: { key: string; simplifySggM: number }[] = read('src/data/sido.json').sidos.filter((x: { status: string }) => x.status === 'live');
  assert.equal(live[0].key, 'seoul');
  assert.equal(MANIFEST.simplify_m.sgg, live[0].simplifySggM, `simplify_m.sgg ${MANIFEST.simplify_m.sgg} = 첫 공개 지역(서울) 값`);
  assert.deepEqual(MANIFEST.simplify_m.sggBy ?? {}, Object.fromEntries(live.filter((s) => s.simplifySggM !== MANIFEST.simplify_m.sgg).map((s) => [s.key, s.simplifySggM])));
  assert.equal(MANIFEST.simplify_m.sggBy.gyeongnam, 40);
  assert.ok(gz9('gyeongnam-sgg.topo.json') <= 100 * 1024, `gz ${gz9('gyeongnam-sgg.topo.json')}B`);
  const t = topoOf('gyeongnam-sgg.topo.json');
  const ring = (name: string) => (t.objects[name] ? topo.feature(t, t.objects[name]).features.reduce((s: number, f: { geometry: G }) => s + polys(f.geometry).reduce((u, p) => u + p.reduce((v, q) => v + q.length, 0), 0), 0) : 0);
  const total = ring('si') + ring('out') + ring('water');
  assert.ok(total <= 30000, `고리 점 ${total}`);
  assert.ok(total > 20000, `고리 점 ${total} — 20m 이면 3만 넘음(37,285 · --dry-all)`);
});

test('창원 일반구 단원(N5 — 경남 5): 창원 5구 한 과, 주소·GA·위치 한 줄 · 영어 앱은 싣지 않음', () => {
  const u = reg.region('gyeongnam/gu')!;
  assert.ok(u && u.unit?.gu && u.unit.parent === 'gyeongnam');
  assert.deepEqual([u.ko, u.lessons.map((l) => [l.title, l.items.length]), u.screens.map((s) => s.key)], ['경남 일반구', [['창원시', 5]], ['all']]);
  assert.deepEqual(u.items.map((it) => [it.ko, it.full, it.slug, it.si]), [
    ['마산합포구', '창원시 마산합포구', 'changwon-si-masanhappo-gu', 'kr:sgg:48120'], ['마산회원구', '창원시 마산회원구', 'changwon-si-masanhoewon-gu', 'kr:sgg:48120'],
    ['성산구', '창원시 성산구', 'changwon-si-seongsan-gu', 'kr:sgg:48120'], ['의창구', '창원시 의창구', 'changwon-si-uichang-gu', 'kr:sgg:48120'],
    ['진해구', '창원시 진해구', 'changwon-si-jinhae-gu', 'kr:sgg:48120']]);
  for (const it of u.items) assert.ok(it.line.startsWith('창원시 ') && it.line.length <= 30, it.line);
  // 다른 시·도의 곳은 시·도 짧은 이름을 붙인다('부산 강서구')
  assert.equal(u.items.find((it) => it.ko === '진해구')!.line, '창원시 남동쪽, 부산 강서구·김해시와 맞닿은 곳');
  for (const l of u.lessons) assert.ok(l.minTapPx >= 16);
  assert.deepEqual(gaArgs(reg, 'gyeongnam/gu'), { unit: 'gu', region: 'gyeongnam', unit_id: '48' });
  const k = knownOf(reg);
  assert.deepEqual(parseRoute('#/kr/gyeongnam/gu', '', k).route, { name: 'unit', region: 'gyeongnam/gu' });
  assert.deepEqual(parseRoute('#/kr/gyeongnam/gu/p1', '', k).route, { name: 'lesson', region: 'gyeongnam/gu', no: 1 });
  assert.equal(createRegistry(geo, { emd: false }).region('gyeongnam/gu'), undefined);
  // 지역 쪽 '일반구 5곳 공부하기', 구 고르기 목록에서 창원 5구는 시 아래
  assert.match(sp(unitPage(ctxOf(reg), 'gyeongnam').html), /href="#\/kr\/gyeongnam\/gu"/);
  assert.match(sp(pickPage(ctxOf(reg), 'gyeongnam').html), /창원시 <span[^>]*>5개 구/);
  // 일반구 slug 손 표(gu-slugs.json)와 정적 쪽 주소 이름(units.json generalGu)이 같은 값
  const gs = read('pipeline/data/gu-slugs.json').slugs, gg = read('src/data/units.json').generalGu;
  for (const it of u.items) { assert.equal(`changwon-si-${gs[it.full]}`, it.slug); assert.equal(gg[it.full], it.slug); }
});

test('같은 이름(N12): 경남 고성군은 지역이 섞이는 화면에서 \'경남 고성군\'(강원에도 고성군), 영어 \'Goseong-gun, Gyeongnam\'', async () => {
  const g = idOf('고성군', 'gyeongnam');
  assert.equal(UI_KO.fullName(reg, g), '경남 고성군');
  assert.equal(UI_KO.fullName(reg, idOf('고성군', 'gangwon')), '강원 고성군');
  assert.equal(UI_KO.prompt(reg, 'find', g, (s) => s), '고성군을 찾아 누르세요', '한 지역 화면은 이름만');
  const en = createRegistry(geo, { emd: false });
  assert.equal(UI_EN.fullName(en, g), 'Goseong-gun, Gyeongnam');
  const r = createRegistry(geo);
  assert.equal(r.mixName('gyeongnam/goseong-gun'), '경남 고성군');
  await registerUnits(r, ['gyeongnam/goseong-gun'], async (code) => unitFile(code), () => {});
  const dong = r.region('gyeongnam/goseong-gun')!.items[0];
  assert.equal(UI_KO.fullName(r, dong.id), `경남 고성군 ${dong.ko}`);
});

test('홈·지역 쪽·지역 고르기(한·영): 경남 탭 \'18개 시·군\', 1과 남쪽 바닷가, 동까지 공부하기 · 지역 고르기 영남 묶음에 경남 칸(경남은 준비 중 아님)', () => {
  const h = sp(homePage(ctxOf(reg, { last: 'gyeongnam' })).html);
  assert.deepEqual([tabKeys(h), pressed(h)], [['seoul', 'incheon', 'gyeongnam'], 'gyeongnam']);
  assert.match(h, /data-arg="gyeongnam" aria-pressed="true">경남 <span class="u">18개 시·군<\/span>/);
  assert.match(h, /<h1 class="h-title">남쪽 바닷가<br><span class="h-hl hl">4개 시·군<\/span>을 채워요<\/h1>/);
  assert.match(h, /<p class="h-places">창원시 · 고성군 · 통영시 · 거제시<\/p>/);
  assert.match(h, /<h2 id="h-path">경남 네 과<\/h2>/);
  assert.match(h, /href="#\/kr\/gyeongnam\/emd"><span>동까지 공부하기<\/span>/);
  assert.doesNotMatch(h, BAD);
  const u = sp(unitPage(ctxOf(reg), 'gyeongnam').html);
  assert.match(u, /<h1 class="h-title">경남 18개 시·군<\/h1>/);
  assert.match(u, /바다에 닿은 곳 7, 닿지 않은 곳 11/);
  assert.doesNotMatch(u, BAD);
  const p = sp(regionsPage(ctxOf(reg)).html);
  assert.match(p, /<span class="nm">경남<\/span><span class="no">18개 시·군 · 4과<\/span>\s*<span class="pl">바다에 닿은 곳 7, 닿지 않은 곳 11<\/span>/);
  // 준비 중 줄 전체(아직 열지 않은 지역만, 빠짐없이)는 e13-region 이 지역 표에서 계산해 본다 — 여기서는 경남이 빠졌는지만(E14 가 경북을 열어도 맞게)
  assert.doesNotMatch(p, /<span>[^<]*경남[^<]*<\/span><em>준비 중/);
  assert.doesNotMatch(p, BAD);
  assert.equal(pickPage(ctxOf(reg), 'gyeongnam').maps!.pick.labels!.length, 18, '구 고르기 지도 이름표 18(지역 지도는 시 층 — 창원 다섯 구는 목록에서 시 아래)');
  setLang('en');
  try {
    const en = createRegistry(geo, { emd: false });
    const eh = sp(homePage(ctxOf(en, { last: 'gyeongnam' })).html);
    assert.match(eh, /data-arg="gyeongnam" aria-pressed="true">Gyeongnam <span class="u">18 cities and counties<\/span>/);
    assert.match(eh, /South coast/);
    assert.match(eh, /Changwon-si · Goseong-gun · Tongyeong-si · Geoje-si/);
    assert.doesNotMatch(eh, /[가-힣]{2,}[시군구]/, '영어 홈에 한글 곳 이름이 없음');
    assert.doesNotMatch(eh, BAD);
    assert.doesNotMatch(unitPage(ctxOf(en), 'gyeongnam').html, BAD);
    assert.equal(UI_EN.regionDesc.gyeongnam[0], '7 on the sea, 11 inland');
    assert.deepEqual(en.region('gyeongnam')!.lessons.map((l) => l.en), ['South coast', 'East', 'Southwest', 'Northwest']);
  } finally { setLang('ko'); }
});

test('주소·GA·고르기 보기: 경남 주소와 동 단원 주소, GA region·unit_id, 고르기 보기는 경남 안에서만', async () => {
  const k = knownOf(reg);
  assert.deepEqual(parseRoute('#/kr/gyeongnam', '', k).route, { name: 'unit', region: 'gyeongnam' });
  assert.deepEqual(parseRoute('#/kr/gyeongnam/sgg/p4', '', k).route, { name: 'lesson', region: 'gyeongnam', no: 4 });
  assert.equal(parseRoute('#/kr/gyeongnam/sgg/p5', '', k).route.name, 'home');
  assert.deepEqual(parseRoute('#/kr/gyeongnam/sgg/@geoje-si', '', k).route, { name: 'place', region: 'gyeongnam', slug: 'geoje-si' });
  assert.deepEqual(parseRoute('#/kr/gyeongnam/emd/changwon-si-jinhae-gu/p2', '', k).route, { name: 'lesson', region: 'gyeongnam/changwon-si-jinhae-gu', no: 2 });
  assert.deepEqual(gaUnit(reg, 'gyeongnam'), { unit: 'sgg', region: 'gyeongnam' });
  const r = createRegistry(geo);
  assert.deepEqual(await registerUnits(r, ['gyeongnam/tongyeong-si', 'gyeongnam/changwon-si-jinhae-gu'], async (code) => unitFile(code), () => {}), []);
  assert.deepEqual(gaArgs(r, 'gyeongnam/tongyeong-si'), { unit: 'emd', region: 'gyeongnam', unit_id: '48220' });
  assert.deepEqual(gaArgs(r, 'gyeongnam/changwon-si-jinhae-gu'), { unit: 'emd', region: 'gyeongnam', unit_id: '48129' });
  const R = reg.region('gyeongnam')!;
  for (let seed = 1; seed <= 12; seed++) for (const l of R.lessons) for (const q of lessonQuestions(reg, 'gyeongnam', l.no, () => 0, rngFrom(seed))) {
    for (const o of q.options ?? []) assert.equal(reg.place(o)!.region.key, 'gyeongnam');
    if (q.mode === 'choose') assert.equal(q.options!.length, 4);
  }
});

test('동 단원(경남 22단원 305동): 색인 = 판 폴더 파일 · 1·2곳 과 0 · 16px · 단원 파일 gz 40KB 이하 · 통영 섬 과 · 거제·남해 섬 단원', () => {
  const idx = geo.units.emdUnits!.gyeongnam;
  assert.deepEqual([idx.length, idx.reduce((t, u) => t + u.n, 0)], [22, 305]);
  let three = 0;
  for (const u of idx) {
    const j = unitFile(u.code);
    assert.equal(j.key, `gyeongnam/${u.slug}`);
    assert.deepEqual(j.items.map((it) => it.slug), u.ids);
    for (const l of j.lessons) {
      assert.ok(l.items.length >= 3, `${j.ko} ${l.no}과 ${l.items.length}곳`);
      if (l.items.length === 3) three++;
      assert.ok(l.minTapPx >= 16, `${j.ko} ${l.no}과 ${l.minTapPx}px`);
    }
    for (const s of j.screens) assert.ok(s.minTapPx >= 16, `${j.ko} ${s.ko} ${s.minTapPx}px`);
    assert.ok(gz9(`emd/${u.code}.topo.json`) <= 40 * 1024, `${j.ko} ${gz9(`emd/${u.code}.topo.json`)}B`);
  }
  assert.equal(three, 4, '3곳 과 넷(거제 읍·면 북동쪽, 의창구 읍·면, 통영 읍·면·섬)');
  // 일반구 동 단원 slug = '{시 slug}-{구 slug}'
  assert.deepEqual(idx.filter((u) => u.si).map((u) => u.slug).sort(), ['changwon-si-jinhae-gu', 'changwon-si-masanhappo-gu', 'changwon-si-masanhoewon-gu', 'changwon-si-seongsan-gu', 'changwon-si-uichang-gu']);
  // 통영시: 맞닿은 동이 없는 섬 면(사량·욕지·한산)이 '섬' 과
  const ty = unitFile('48220');
  const nm = (id: string) => ty.items.find((it) => it.id === id)!.ko;
  const isl = ty.lessons.find((l) => l.title === '섬')!;
  assert.deepEqual(isl.items.map(nm).sort(), ['사량면', '욕지면', '한산면']);
  // 거제·남해 단원: 섬이라 단원 밖과 맞닿은 동이 없다(만나기 근거에 맞닿은 시·군·구 없음)
  for (const c of ['48310', '48840']) { const j = unitFile(c); assert.ok(Object.values(j.meet).every((m) => !m.touch?.length), j.ko); assert.deepEqual(j.outside, {}); }
  // 지역 경계 파일(N20): gz 100KB 이하(40m)
  assert.ok(gz9('gyeongnam-sgg.topo.json') <= 100 * 1024);
});

// 지역 수 글은 다른 시험이 판 값으로 계산해 본다(합치면 수가 바뀌므로). 그 셈과 구현이 같은 식이라 셈이 겹치거나 빠지는 결함은 거기서 못 잡는다 —
// 그래서 경남을 뺀 값과 견주어 경남 하나만큼(정확히 1) 늘었는지 본다. E14 와 합쳐도 깨지지 않는 차이 단언이다
test('지역 수 글(정적 쪽 설명·홈 \'+n\'·지역 고르기 \'n곳 열림\', 한·영)이 경남을 뺀 판보다 정확히 1 늘었다', () => {
  const num = (s: string, re: RegExp) => Number(re.exec(s)?.[1]);
  const noGn = LIVE.filter((s) => s.key !== 'gyeongnam');
  assert.equal(noGn.length, LIVE.length - 1);
  const ko = /(?:등|전국) (\d+)개 시·도/, en = /and (\d+) more regions/;   // E16 에 모두 열면 '전국 16개 시·도'
  assert.equal(num(scopeKo(), ko) - num(scopeKo(noGn), ko), 1, `${scopeKo()} · ${scopeKo(noGn)}`);
  assert.equal(num(scopeEn(), en) - num(scopeEn(noGn), en), 1, `${scopeEn()} · ${scopeEn(noGn)}`);
  const plus = /<a class="h-tab go" href="#\/kr">[^<]* <span class="u" aria-hidden="true">\+(\d+)<\/span>/;
  const r0 = createRegistry(geoNoE15);
  assert.equal(num(homePage(ctxOf(reg)).html, plus) - num(homePage(ctxOf(r0)).html, plus), 1, '홈 다른 지역 +n');
  // 열린 수: '시·도 16곳 중 n곳 열림', 모두 열면(E16 — 지금 판) '전국 시·도 16곳'(E17)
  const open = (s: string) => (/전국 시·도 16곳/.test(s) ? 16 : num(s, /시·도 16곳 중 (\d+)곳 열림/));
  assert.equal(open(sp(regionsPage(ctxOf(reg)).html)) - open(sp(regionsPage(ctxOf(r0)).html)), 1, '지역 고르기 열림');
  setLang('en');
  try {
    const en = createRegistry(geo, { emd: false }), en0 = createRegistry(geoNoE15, { emd: false });
    assert.equal(num(homePage(ctxOf(en)).html, plus) - num(homePage(ctxOf(en0)).html, plus), 1, '영어 홈 More +n');
    assert.equal(num(sp(regionsPage(ctxOf(en)).html), /(\d+) of 16 regions open/) - num(sp(regionsPage(ctxOf(en0)).html), /(\d+) of 16 regions open/), 1, '영어 지역 고르기');
  } finally { setLang('ko'); }
});

test('운영 형식 저장값(지금 사용자 기록 모양 — 서울·인천·경기·부산·강원 기록만): 이어 하기·홈 카드·오늘 복습·내일 수가 경남만 뺀 판(E14 판 — 충남·경북까지)과 같다 — 다른 것은 다 채움의 남은 지역뿐(공통 조건 3)', () => {
  const L = (key: string, no: number) => geo.units.regions.find((r) => r.key === key)!.lessons[no - 1].items;
  const m: Mastery = {};
  L('seoul', 1).forEach((id) => { m[id] = rec(2, T); });
  L('seoul', 2).forEach((id, i) => { m[id] = rec(5, null, { grad: i < 2, streak: i < 2 ? 2 : 0 }); });
  L('gangwon', 1).forEach((id) => { m[id] = rec(1, T); });
  L('incheon', 1).forEach((id) => { m[id] = rec(3, T + 1); });
  L('gyeonggi', 1).forEach((id, i) => { m[id] = rec(1, i % 2 ? T : T - 3); });
  L('busan', 2).forEach((id) => { m[id] = rec(4, T + 4); });
  const q3 = L('seoul', 3);
  const deck = { v: 1, kind: 'lesson', region: 'seoul', lesson: 3, seed: 7, queue: Array.from({ length: 23 }, (_, i) => ({ mode: i < q3.length ? 'meet' : 'find', id: q3[i % q3.length] })), pos: 7, log: [], retries: {}, missed: [], toLearn: [], placed: [], right: {} };
  const deck2 = { v: 1, kind: 'review', region: null, lesson: null, seed: 9, queue: L('gangwon', 1).map((id) => ({ mode: 'find', id, scope: 'lesson' })), pos: 1, log: [], retries: {}, missed: [], toLearn: [], placed: [], right: {} };
  const data = new Map<string, string>();
  const kv: KV = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: (k) => { data.delete(k); } };
  const K = keys();
  data.set(K.mastery, JSON.stringify(m));
  data.set(K.deck, JSON.stringify(deck));
  data.set(K.deck2, JSON.stringify(deck2));
  data.set(K.last, JSON.stringify('gangwon'));
  const s = openStore(kv);
  const mastery = s.read(K.mastery, checkMastery)!, last = s.read(K.last, checkLast);
  const d1raw = s.read(K.deck, checkDeck), d2raw = s.read(K.deck2, checkDeck);
  const r0 = createRegistry(geoNoE15);
  assert.equal(r0.region('gyeongnam'), undefined);
  assert.equal(r0.regions.length, reg.regions.length - 1);
  assert.ok(r0.region('chungnam') && r0.region('gyeongbuk'), '경남만 뺀 판 = E14 판(충남·경북은 있음)');
  for (const r of [reg, r0]) assert.ok(usableDeck(r, d1raw) && usableDeck(r, d2raw), '이어 할 판');
  assert.deepEqual(usableDeck(reg, d1raw), usableDeck(r0, d1raw));
  assert.deepEqual(usableDeck(reg, d2raw), usableDeck(r0, d2raw));
  const all: Mastery = Object.fromEntries(['seoul', 'busan', 'incheon', 'gyeonggi', 'gangwon'].flatMap((k) => geo.units.regions.find((r) => r.key === k)!.items.map((it) => [it.id, rec(3, T + 4)])));
  const states: [Mastery, typeof d1raw, string | null, number][] = [
    [mastery, usableDeck(reg, d1raw), last, 3], [mastery, usableDeck(reg, d2raw), 'gyeonggi', 3], [mastery, null, last, 3],
    [mastery, null, 'gyeonggi', 25], [mastery, null, 'incheon', 0], [{}, null, null, 0], [all, null, 'seoul', 0], [all, null, 'gangwon', 0],
    [Object.fromEntries(L('gangwon', 1).map((id) => [id, rec(2, T + 2)])), null, 'gangwon', 0],
  ];
  const types: string[] = [];
  for (const [mm, d, lst, n] of states) {
    const dl = { day: T, n };
    const a = homeCard({ reg, mastery: mm, deck: d, daily: dl, last: lst, today: T }), b = homeCard({ reg: r0, mastery: mm, deck: d, daily: dl, last: lst, today: T });
    if (a.type === 'done' && b.type === 'done') {
      // 다 채움 카드의 '남은 지역'에만 경남이 든다(의도 — 다 칠한 사람에게 새 지역을 권함). 앞 차례는 그대로
      assert.deepEqual([a.region, a.more.filter((k) => !E15_KEYS.includes(k))], [b.region, b.more]);
      assert.deepEqual(a.more.filter((k) => E15_KEYS.includes(k)), ['gyeongnam']);
    } else assert.deepEqual(a, b, `${a.type} ${lst} ${n}`);
    types.push(a.type);
    assert.deepEqual(todayReview(reg, mm, T, n), todayReview(r0, mm, T, n));
    assert.equal(tomorrowCount(reg, mm, T), tomorrowCount(r0, mm, T));
  }
  assert.deepEqual([...new Set(types)].sort(), ['done', 'new', 'next', 'resume', 'review']);
  // 홈 화면 글: 경남을 고른 적 없는 사람은 탭·과 카드가 같다(다른 것은 '다른 지역 +n' 수 하나)
  const h = (r: Registry) => homePage(ctxOf(r, { mastery, last })).html.replace(/\+\d+<\/span><span class="visually-hidden">\(\d+곳 더\)/, '');
  assert.equal(h(reg), h(r0));
});
