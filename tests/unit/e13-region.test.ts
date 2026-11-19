// 강원·충북·전북·제주(계획서 NATIONWIDE_PLAN E13 — 새 시·도 셋째 묶음): 지역 표 → 파이프라인 → 판 units.json → 앱이 네 지역에서 도는지 본다.
// 이 단계에서 따로 볼 것(계획서 E11~E16 단계별 추가 사항 E13 줄): 강원 휴전선 띠를 동해안까지(고성 북쪽 해안 틈), '강원 고성군' 표기(경남에도 고성군),
// 충북 청주 일반구 단원(경기 밖 첫 일반구 단원)과 증평 2동 단원, 전북 전주(일반구 둘 — 단원 없이 구 고르기 목록), 제주 홈(과 없는 지역에 단원 둘),
// 제주시 시험 화면 수, 마라도·추자·우도. 동 단원 전수(파일·등록·16px·1곳 과·40KB·3곳 이하 화면)는 emd-units.test 가 본다
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
import { homeCard, mainUnitOf, todayReview } from '../../src/app/core/next.ts';
import { usableDeck } from '../../src/app/core/session.ts';
import { tomorrowCount } from '../../src/app/core/tally.ts';
import { gaArgs, gaUnit, registerUnits } from '../../src/app/core/units.ts';
import { createRegistry, type Registry } from '../../src/app/registry.ts';
import { parseRoute, type Known } from '../../src/app/router.ts';
import { SIDOS as SIDOS_ALL, sidoOf } from '../../src/app/sidos.ts';
import { checkDaily, checkDeck, checkLast, checkMastery, keys, openStore, type KV } from '../../src/app/store.ts';
import { koCount } from '../../src/app/text/ko.ts';
import { UI_EN, UI_KO, setLang } from '../../src/app/text/ui.ts';
import type { EmdUnitFile } from '../../src/app/types.ts';
import type { Ctx } from '../../src/app/ui/ctx.ts';
import { homePage, pickPage, regionsPage, resultPage, startPage, summaryPage, unitPage } from '../../src/app/ui/pages.ts';
import { viewSpec, wholeView } from '../../src/app/ui/maps.ts';
import { EN_OFF, EN_ON, E13_KEYS, OFF_KEY, OPENED_SINCE, geo, geoEn, geoNoE13, reg, idOf } from './fixtures.ts';

const T = 20000;
const root = path.join(import.meta.dirname, '../..');
const dir = path.join(root, 'public/data/geo', DATA_VER);
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const SIDO = (k: string) => read('src/data/sido.json').sidos.find((s: { key: string }) => s.key === k);
const SRC = (k: string) => read('src/data/units.json').regions.find((r: { key: string }) => r.key === k);
const LINES = read('src/data/place-lines.json');
const HARD: string[] = read('src/data/hard-words.json').words;
const unitFile = (code: string): EmdUnitFile => JSON.parse(fs.readFileSync(path.join(dir, 'emd', `${code}.json`), 'utf8'));
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
const CODE: Record<string, string> = { gangwon: '51', chungbuk: '43', jeonbuk: '52', jeju: '50' };
const polys = (g: { type: string; coordinates: unknown } | null) => (!g ? [] : g.type === 'Polygon' ? [g.coordinates as number[][][]] : g.type === 'MultiPolygon' ? g.coordinates as number[][][][] : []);

test('지역 표·판: 네 지역 공개(status·emd live, 충북 gu live), 판 units.json 은 원고와 같은 곳·과·넓은 화면 — 강원 18곳 5과 화면 2 · 충북 11곳 3과 · 전북 14곳 4과 · 제주는 과 없는 지역', () => {
  for (const [k, order] of [['gangwon', 9], ['chungbuk', 10], ['jeonbuk', 11], ['jeju', 12]] as const) {
    const s = SIDO(k);
    assert.deepEqual([s.status, s.emd, s.gu, s.enChecked, s.hub, s.openOrder, s.gunFirst], ['live', 'live', k === 'chungbuk' ? 'live' : 'off', true, null, order, false], k);
    assert.equal(s.lineRequired, k !== 'jeju', `${k} 위치 한 줄 필수(제주는 시·군·구 과가 없어 쓰지 않음)`);
  }
  assert.deepEqual(E13_KEYS.map((k) => SIDO(k).en), ['Gangwon', 'Chungbuk', 'Jeonbuk', 'Jeju']);
  // 지역 표 차례(코드 차례): 충북(43)·제주(50)·강원(51)·전북(52) — 그 사이에 뒤에 연 지역(E14 충남 44·경북 47, E15 경남 48)이 낄 수 있어 E13 지역끼리의 차례만 본다
  assert.deepEqual(reg.regions.map((r) => r.key).filter((k) => E13_KEYS.includes(k)), ['chungbuk', 'jeju', 'gangwon', 'jeonbuk']);
  const shape = (k: string) => { const r = reg.region(k)!; return [r.layer, r.items.length, r.lessons.length, r.screens.length]; };
  assert.deepEqual(E13_KEYS.map(shape), [['sgg', 18, 5, 2], ['si', 11, 3, 1], ['si', 14, 4, 1], ['emd', 2, 0, 0]]);
  for (const k of ['gangwon', 'chungbuk', 'jeonbuk']) {
    const r = reg.region(k)!, src = SRC(k);
    assert.deepEqual(r.lessons.map((l) => [l.no, l.title, l.en, l.items.map((id) => reg.place(id)!.item.ko)]),
      src.lessons.map((l: { no: number; title: string; en: string; items: string[] }) => [l.no, l.title, l.en, l.items]), k);
    for (const it of r.items) { assert.equal(it.slug, src.slugs[it.ko], it.ko); assert.match(it.slug, /^[a-z][a-z0-9-]{2,}$/); }
    assert.equal(new Set(r.items.map((it) => it.slug)).size, r.items.length);
    for (const l of r.lessons) {
      assert.ok(l.minTapPx >= 16, `${k} ${l.no}과 ${l.minTapPx}px`);
      assert.ok(l.items.length >= 3 && l.items.length <= 6, `${k} ${l.no}과 ${l.items.length}곳`);
      assert.ok(l.title.length <= 12 && !/권역|도심/.test(l.title), l.title);
    }
    assert.equal(new Set(r.lessons.map((l) => l.title)).size, r.lessons.length);
    for (const s of r.screens) assert.ok(s.minTapPx >= 16, `${k} ${s.ko} ${s.minTapPx}px`);
    // 시 층(충북·전북)은 일반구를 시로 합친 칸(청주 43110·전주 52110), 강원은 시·군·구 층
    for (const it of r.items) assert.match(it.id, new RegExp(`^kr:sgg:${CODE[k]}\\d{3}$`));
  }
  assert.equal(idOf('청주시'), 'kr:sgg:43110');
  assert.equal(idOf('전주시'), 'kr:sgg:52110');
  // 과 이름(쉬운 말 — 방위·대표 지명·강·바다): 원고 그대로
  assert.deepEqual(['gangwon', 'chungbuk', 'jeonbuk'].map((k) => reg.region(k)!.lessons.map((l) => l.title)),
    [['북서쪽', '설악산 둘레', '가운데', '남쪽', '남동쪽 바닷가'], ['청주 둘레', '충주호 둘레', '남쪽'], ['전주 둘레', '서해 바닷가', '동쪽', '남쪽']]);
  // 강원 넓은 화면: 서쪽(1·3·4과) · 동쪽(2·5과 — 바닷가 여섯과 인제) — 한 화면이면 동해시가 12px(16px 미만)
  assert.deepEqual(reg.region('gangwon')!.screens.map((s) => [s.key, s.ko, s.items.length]), [['west', '서쪽', 11], ['east', '동쪽', 7]]);
  // 충북·전북은 지역 한 화면(가장 작은 칸 증평군 17px·전주시 24px)
  assert.deepEqual(['chungbuk', 'jeonbuk'].map((k) => reg.region(k)!.screens.map((s) => [s.key, s.minTapPx])), [[['all', 17]], [['all', 24]]]);
  // 제주: 칸은 제주시·서귀포시 둘(지역 지도·동 단원 slug), 곳으로 등록하지 않는다(공부는 동 단원 — N4)
  const jj = reg.region('jeju')!;
  assert.deepEqual(jj.items.map((it) => [it.id, it.ko, it.slug]), [['kr:sgg:50130', '서귀포시', 'seogwipo-si'], ['kr:sgg:50110', '제주시', 'jeju-si']]);
  for (const it of jj.items) assert.equal(reg.place(it.id), undefined);
  assert.deepEqual(SRC('jeju').lessons, []);
});

test('위치 한 줄(N27): 강원 18·충북 11·전북 14곳 — 원고 그대로, 30자 이하·금지 낱말 없음, 지도 근거만(명소 없음) · 제주는 없음', () => {
  let n = 0;
  for (const k of ['gangwon', 'chungbuk', 'jeonbuk']) {
    for (const it of reg.region(k)!.items) {
      const e = LINES[k][it.ko];
      assert.ok(e, `${k} ${it.ko} 원고`);
      assert.equal(it.line, e.line, it.ko);
      assert.ok(e.line.length <= 30, `${it.ko} ${e.line.length}자`);
      for (const w of HARD) assert.ok(!e.line.includes(w), `${it.ko} 금지 낱말 ${w}`);
      assert.equal(e.at, undefined, `${it.ko}: 명소(at)는 OSM 대조 허락 뒤에만`);
      assert.equal(e.manual, undefined, `${it.ko}: 근거 없는 말(manual) 없음`);
      assert.ok(['touch', 'dir', 'side', 'size', 'coast'].some((x) => x in e), `${it.ko} 근거`);
      assert.equal(UI_KO.line(reg, it.id), e.line);
      n++;
    }
  }
  assert.equal(n, 43);
  assert.equal(LINES.jeju, undefined);
  // 휴전선(북한과 맞닿음)은 잴 수 있는 근거가 아니라 쓰지 않는다 · 다른 시·도와의 맞닿음은 시·도 이름(아직 열지 않은 전남광주도 시·도 이름으로 잰다)
  for (const k of ['gangwon', 'chungbuk', 'jeonbuk']) for (const [n2, e] of Object.entries(LINES[k] as Record<string, { line: string }>)) if (n2 !== '_note') assert.doesNotMatch(e.line, /휴전선|북한/, n2);
  assert.deepEqual(LINES.jeonbuk['순창군'].touch, ['전남광주통합특별시']);
  assert.deepEqual(LINES.chungbuk['청주시'].touch, ['세종특별자치시', '대전광역시']);
  assert.doesNotMatch(UI_EN.line(reg, idOf('춘천시')), /[가-힣]/, '영어 위치 한 줄에는 한글이 없다(place-lines-en.json 이 비어 있으면 빈 줄)');
});

// 휴전선 쪽 꼭짓점은 북위 38.585 북쪽(고성 북쪽 해안 틈 — E13 이 메운 곳)만 본다. 고성군의 서쪽 휴전선 쪽 선(동경 128.28~128.32, 북위 38.43~38.58)에는
// 다른 칸·이웃 땅과 함께 쓰지 않는 꼭짓점 20개가 북한 땅에서 37~1,434m 남아 있다(둘째 상자의 2km 띠가 닿지 않은 곳 — 같은 색이라 보이지 않음, E17 거리. E13 검수)
test('휴전선 띠(N19 — E13 에서 동해안까지): 강원 고성군 북쪽 끝(북위 38.585 북쪽)의 휴전선 쪽 꼭짓점이 북한 땅에 닿는다(고성 북쪽 해안 틈 0) · 휴전선 상자 안은 바닷가로 세지 않음', () => {
  const ctx = read('pipeline/data/context.json');
  assert.ok(Array.isArray(ctx.nkCorridor[0]) && ctx.nkCorridor.length === 2, '상자 둘(한강 하구 동쪽 ~ 128.3 · 동해안 끝)');
  assert.ok(ctx.nkCorridor[1][2] >= 128.365 && ctx.nkCorridor[1][3] <= 38.65, '둘째 상자: 휴전선이 바다에 닿는 곳(고성 현내면 북쪽)까지, 그 북쪽 북한 해안은 넣지 않음');
  const KX = 111320 * Math.cos(38.6 * Math.PI / 180), KY = 110570;
  const inside = (x: number, y: number, rings: number[][][]) => { let c = false; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const segD = (px: number, py: number, a: number[], b: number[]) => { const dx = (b[0] - a[0]) * KX, dy = (b[1] - a[1]) * KY, l2 = dx * dx + dy * dy || 1e-9; let t = (((px - a[0]) * KX) * dx + ((py - a[1]) * KY) * dy) / l2; t = Math.max(0, Math.min(1, t)); return Math.hypot((px - a[0]) * KX - t * dx, (py - a[1]) * KY - t * dy); };
  const goseong = idOf('고성군', 'gangwon');
  for (const [file, layer, pick] of [['gangwon-sgg.topo.json', 'sgg', (p: Record<string, unknown>) => p.sggId === goseong], [`emd/${goseong.slice(7)}.topo.json`, 'emd', () => true]] as const) {
    const t = read(`public/data/geo/${DATA_VER}/${file}`);
    const cells = topo.feature(t, t.objects[layer]).features.filter((f: { properties: Record<string, unknown> }) => pick(f.properties));
    const nk = topo.feature(t, t.objects.out).features.filter((f: { properties: Record<string, unknown> }) => f.properties.sido === 'kp' || f.properties.id === 'kp').flatMap((f: { geometry: { type: string; coordinates: unknown } }) => polys(f.geometry));
    assert.ok(nk.length, `${file}: 북한 땅`);
    const dist = (x: number, y: number) => (nk.some((p) => inside(x, y, p)) ? 0 : Math.min(...nk.flatMap((p) => p.flatMap((r) => r.slice(1).map((q, i) => segD(x, y, r[i], q))))));
    // 휴전선 쪽: 고성군 꼭짓점 가운데 북위 38.585 북쪽이고 휴전선이 바다에 닿는 곳(128.365)보다 서쪽
    const pts = cells.flatMap((f: { geometry: { type: string; coordinates: unknown } }) => polys(f.geometry).flatMap((p) => p[0])).filter(([x, y]: number[]) => y > 38.585 && x < 128.365);
    assert.ok(pts.length >= 10, `${file}: 휴전선 쪽 꼭짓점 ${pts.length}`);
    const far = pts.map(([x, y]: number[]) => [x, y, Math.round(dist(x, y))]).filter((p: number[]) => p[2] > 30);
    assert.deepEqual(far, [], `${file}: 북한 땅까지 30m 넘는 꼭짓점`);
  }
});

test('같은 이름(N12): 강원 고성군은 지역이 섞이는 화면에서 \'강원 고성군\'(경남에도 고성군 — 판 sameNames 는 전국 기준), 동 단원도 \'강원 고성군 거진읍\'', async () => {
  assert.ok(geo.units.sameNames!.includes('고성군'));
  const g = idOf('고성군', 'gangwon');
  assert.equal(UI_KO.fullName(reg, g), '강원 고성군');
  assert.equal(UI_KO.fullPre(reg, g), '강원');
  assert.equal(UI_KO.prompt(reg, 'find', g, (s) => s), '고성군을 찾아 누르세요', '한 지역 화면은 이름만');
  // 홈 오늘 복습 줄: '강원 고성군'(서울 중구 옆에서도 시·도 이름이 붙는다)
  const m: Mastery = Object.fromEntries([idOf('중구', 'seoul'), g, idOf('속초시')].map((id) => [id, rec(1, T)]));
  const h = sp(homePage(ctxOf(reg, { mastery: m, last: 'seoul' })).html);
  // (지역 차례 → 과의 곳 차례 — 강원 2과는 속초시·고성군 차례)
  assert.match(h, /<p class="h-places">서울 중구 · 속초시 · 강원 고성군<\/p>/);
  // 영어: 'Goseong-gun, Gangwon'(관문이 열린 영어 앱 — 시·군·구 이름은 끈 창과 같다)
  const en = createRegistry(geo, EN_ON);
  assert.equal(UI_EN.fullName(en, g), 'Goseong-gun, Gangwon');
  // 동 단원 이름(섞인 화면): 단원 파일을 받기 전에도 색인으로
  const r = createRegistry(geo);
  assert.deepEqual(['gangwon/goseong-gun', 'gangwon/sokcho-si', 'jeju/jeju-si', 'chungbuk/cheongju-si-sangdang-gu'].map((k) => r.mixName(k)), ['강원 고성군', '속초시', '제주시', '청주시 상당구']);
  await registerUnits(r, ['gangwon/goseong-gun'], async (code) => unitFile(code), () => {});
  const dong = r.region('gangwon/goseong-gun')!.items[0];
  assert.equal(UI_KO.fullName(r, dong.id), `강원 고성군 ${dong.ko}`);
  assert.equal(r.region('gangwon/goseong-gun')!.ko, '고성군', '단원 쪽 이름은 그대로');
});

test('충북 일반구 단원(N5 — 경기 밖 첫 일반구 단원): 청주 4구 한 과, 주소·GA·홈 링크 · 증평 2동 단원 · 전북 전주(일반구 둘)는 단원 없이 구 고르기 목록에서 시 아래', async () => {
  const u = reg.region('chungbuk/gu')!;
  assert.ok(u && u.unit?.gu && u.unit.parent === 'chungbuk');
  assert.deepEqual([u.ko, u.lessons.map((l) => [l.title, l.items.length]), u.screens.map((s) => s.key)], ['충북 일반구', [['청주시', 4]], ['all']]);
  assert.deepEqual(u.items.map((it) => [it.ko, it.full, it.slug, it.si]), [
    ['상당구', '청주시 상당구', 'cheongju-si-sangdang-gu', 'kr:sgg:43110'], ['서원구', '청주시 서원구', 'cheongju-si-seowon-gu', 'kr:sgg:43110'],
    ['청원구', '청주시 청원구', 'cheongju-si-cheongwon-gu', 'kr:sgg:43110'], ['흥덕구', '청주시 흥덕구', 'cheongju-si-heungdeok-gu', 'kr:sgg:43110']]);
  // 위치 한 줄(파이프라인이 지도 근거로 만듦): 다른 시·도 이름이 이미 시·도 이름으로 시작하면 붙이지 않는다('세종 세종시' → '세종시')
  for (const it of u.items) { assert.ok(it.line.startsWith('청주시 ') && it.line.length <= 30, it.line); assert.doesNotMatch(it.line, /세종 세종시/); }
  assert.equal(u.items.find((it) => it.ko === '흥덕구')!.line, '청주시 서쪽, 세종시·충남 천안시 동남구와 맞닿은 곳');
  assert.equal(UI_KO.fullName(reg, u.items[0].id), '청주시 상당구');
  assert.deepEqual(gaArgs(reg, 'chungbuk/gu'), { unit: 'gu', region: 'chungbuk', unit_id: '43' });
  const k = knownOf(reg);
  assert.deepEqual(parseRoute('#/kr/chungbuk/gu', '', k).route, { name: 'unit', region: 'chungbuk/gu' });
  assert.deepEqual(parseRoute('#/kr/chungbuk/gu/p1', '', k).route, { name: 'lesson', region: 'chungbuk/gu', no: 1 });
  assert.equal(parseRoute('#/kr/jeonbuk/gu', '', k).route.name, 'home', '전북은 일반구 단원 없음(전주 2구 — N5)');
  assert.equal(reg.region('jeonbuk/gu'), undefined);
  // 일반구를 끈 창(관문이 닫힌 영어 앱 — 2026-11-16 전 영어 앱, N26)은 일반구 단원을 등록하지 않는다. 관문이 열린 영어 앱은 등록한다(EN_EMD 1.2)
  assert.equal(createRegistry(geo, EN_OFF).region('chungbuk/gu'), undefined);
  const enGu = createRegistry(geo, EN_ON).region('chungbuk/gu')!;
  assert.deepEqual([enGu.en, enGu.lessons.map((l) => UI_EN.lesson(l)), enGu.items.map((it) => UI_EN.name(it)).sort()], ['Chungbuk city districts', ['Cheongju-si'], ['Cheongwon-gu', 'Heungdeok-gu', 'Sangdang-gu', 'Seowon-gu']]);
  // 지역 쪽·구 고르기: 충북은 '일반구 4곳 공부하기', 전북은 없음. 구 고르기 목록에서 일반구 동 단원은 시 아래(청주시 4개 구 · 전주시 2개 구)
  const uc = sp(unitPage(ctxOf(reg), 'chungbuk').html);
  assert.match(uc, /href="#\/kr\/chungbuk\/gu"/);
  assert.doesNotMatch(sp(unitPage(ctxOf(reg), 'jeonbuk').html), /\/gu"/);
  const pc = sp(pickPage(ctxOf(reg), 'chungbuk').html), pj = sp(pickPage(ctxOf(reg), 'jeonbuk').html);
  assert.match(pc, /청주시 <span[^>]*>4개 구/);
  assert.match(pj, /전주시 <span[^>]*>2개 구/);
  for (const h of [uc, pc, pj]) assert.doesNotMatch(h, BAD);
  // 증평(2곳 단원, N10): 과 하나·보기 둘(이웃 단원에서 빌리지 않음 — emd-core 시험), 단원 키는 slug
  const z = unitFile('43745');
  assert.deepEqual([z.key, z.items.length, z.lessons.length, z.lessons[0].items.length, z.screens.length], ['chungbuk/jeungpyeong-gun', 2, 1, 2, 1]);
  const r = createRegistry(geo);
  await registerUnits(r, [z.key], async (code) => unitFile(code), () => {});
  const qs = lessonQuestions(r, z.key, 1, () => 0, rngFrom(3)).filter((q) => q.mode === 'choose');
  for (const q of qs) assert.equal(q.options!.length, 2);
});

test('제주 홈(N4 — 과 없는 지역에 단원 둘): 탭 \'제주 43곳\', 주 단원은 동 색인 차례 첫 단원(서귀포시)부터, 다 칠하면 제주시 · 지역 주소는 구 고르기', async () => {
  const r = createRegistry(geo);
  assert.deepEqual(r.emdUnits('jeju').map((u) => [u.key, u.index.n, u.index.lessons]), [['jeju/seogwipo-si', 17, 4], ['jeju/jeju-si', 26, 7]]);
  assert.deepEqual(await registerUnits(r, ['jeju/seogwipo-si', 'jeju/jeju-si'], async (code) => unitFile(code), () => {}), []);
  const h = sp(homePage(ctxOf(r, { last: 'jeju' })).html);
  assert.deepEqual([tabKeys(h), pressed(h)], [['seoul', 'incheon', 'jeju'], 'jeju']);
  assert.match(h, /data-arg="jeju" aria-pressed="true">제주 <span class="u">43곳<\/span>/);
  assert.match(h, /<span>첫 과 · 서귀포시 1과<\/span>/);
  assert.match(h, /<h2 id="h-path">서귀포시 네 과<\/h2>/);
  assert.match(h, /제주시·서귀포시 두 시, 7읍 5면 31동/);
  assert.doesNotMatch(h, BAD);
  // 서귀포시를 다 칠하면 주 단원은 제주시(1과), 홈 탭은 그대로 제주
  const sg = r.region('jeju/seogwipo-si')!;
  const m: Mastery = Object.fromEntries(sg.items.map((it) => [it.id, rec(1, T + 1)]));
  assert.equal(mainUnitOf(r, m, 'jeju', 'jeju/seogwipo-si'), 'jeju/jeju-si');
  const c = homeCard({ reg: r, mastery: m, deck: null, daily: null, last: 'jeju', lastUnit: 'jeju/seogwipo-si', today: T });
  assert.deepEqual([c.type, c.type === 'next' && c.region, c.type === 'next' && c.lesson, c.type === 'next' && c.unit], ['next', 'jeju', 1, 'jeju/jeju-si']);
  assert.match(sp(homePage(ctxOf(r, { mastery: m, last: 'jeju', lastUnit: 'jeju/seogwipo-si' })).html), /<span>첫 과 · 제주시 1과<\/span>/);
  // 제주시 한 과를 해 둔 사람은 마지막 단원(제주시)을 이어 간다
  const m2: Mastery = Object.fromEntries(r.region('jeju/jeju-si')!.lessons[0].items.map((id) => [id, rec(1, T + 1)]));
  assert.equal(mainUnitOf(r, m2, 'jeju', 'jeju/jeju-si'), 'jeju/jeju-si');
  // 지역 주소 #/kr/jeju 는 지역 경로(main.ts 가 단원이 둘이라 구 고르기를 그린다), 지역 과 주소는 홈으로, 동 단원 주소는 열림
  const k = knownOf(r);
  assert.deepEqual(parseRoute('#/kr/jeju', '', k).route, { name: 'unit', region: 'jeju' });
  assert.equal(parseRoute('#/kr/jeju/sgg/p1', '', k).route.name, 'home');
  assert.deepEqual(parseRoute('#/kr/jeju/emd/jeju-si/p7', '', k).route, { name: 'lesson', region: 'jeju/jeju-si', no: 7 });
  assert.deepEqual(gaArgs(r, 'jeju/jeju-si'), { unit: 'emd', region: 'jeju', unit_id: '50110' });
  const pk = sp(pickPage(ctxOf(r), 'jeju').html);
  assert.match(pk, /제주 · 공부 순서/);
  assert.match(pk, /<h1 class="h-title">어느 시의 동을/);
  assert.equal(pickPage(ctxOf(r), 'jeju').maps!.pick.labels!.length, 2);
  assert.doesNotMatch(pk, BAD);
  // 동을 끈 창(관문이 닫힌 영어 앱 — 2026-11-16 전 영어 앱, N26)은 제주를 싣지 않는다(동만 있는 지역). 관문이 열린 영어 앱은 싣는다(EN_EMD 1.2)
  assert.equal(createRegistry(geo, EN_OFF).region('jeju'), undefined);
  setLang('en');
  try {
    const pe = sp(pickPage(ctxOf(createRegistry(geo, EN_ON)), 'jeju').html);
    assert.match(pe, /Jeju · Study path/);
    assert.match(pe, /<h1 class="h-title">Which city\?<\/h1>/);
    // 과 없는 지역의 단원 차례는 공부 순서 그대로(D103 — 알파벳 차례로 바꾸지 않음): 서귀포시 → 제주시
    assert.deepEqual([...pe.matchAll(/<span class="nm">([^<]*)<\/span>/g)].map((x) => x[1]), ['Seogwipo-si', 'Jeju-si']);
    assert.doesNotMatch(pe, /[가-힣]/);
    assert.doesNotMatch(pe, BAD);
  } finally { setLang('ko'); }
});

test('제주시·서귀포시 동 단원: 시험 화면 5·4(3곳 이하 화면 없음 — 읍·면이 3곳씩이던 화면은 맞닿은 동을 넘겨받음), 마라도·추자·우도가 단원 지도에 남음, 섬 과', () => {
  const js = unitFile('50110'), sg = unitFile('50130');
  assert.deepEqual([js.screens.length, sg.screens.length], [5, 4]);
  for (const j of [js, sg]) for (const s of j.screens) { assert.ok(s.items.length >= 4, `${j.ko} ${s.ko} ${s.items.length}곳`); assert.ok(s.minTapPx >= 16, `${j.ko} ${s.ko} ${s.minTapPx}px`); }
  // 넘겨받은 단원(제주시)은 화면 이름에 무리 말('시내'·'읍·면')을 붙이지 않는다(동이 든 '읍·면' 화면이 되지 않게)
  assert.ok(js.screens.every((s) => !/시내|읍·면/.test(s.ko)), js.screens.map((s) => s.ko).join(','));
  assert.ok(sg.screens.some((s) => /시내/.test(s.ko)), '넘겨받지 않은 단원(서귀포시)은 그대로');
  const nameOf = (j: EmdUnitFile, id: string) => j.items.find((it) => it.id === id)!.ko;
  // 추자면은 먼 섬(섬 과의 섬 상자), 우도면은 맞닿은 동이 없는 섬 — 둘이 '섬' 과
  const isl = js.lessons.at(-1)!;
  assert.deepEqual([isl.title, isl.items.map((id) => nameOf(js, id)).sort(), (isl.insets ?? []).map((id) => nameOf(js, id))], ['섬', ['우도면', '추자면'], ['추자면']]);
  // 단원 지도 파일에 섬 덩어리가 남는다: 마라도(대정읍 가장 남쪽 — 북위 33.13 남쪽), 추자도(북위 33.9 북쪽), 우도(동경 126.94 동쪽)
  const geomOf = (code: string, ko: string) => {
    const t = read(`public/data/geo/${DATA_VER}/emd/${code}.topo.json`), j = unitFile(code);
    const id = j.items.find((it) => it.ko === ko)!.id;
    return topo.feature(t, t.objects.emd).features.find((f: { properties: { id: string } }) => f.properties.id === id)!.geometry;
  };
  const pts = (g: { type: string; coordinates: unknown }) => polys(g).flatMap((p) => p[0]);
  assert.ok(Math.min(...pts(geomOf('50130', '대정읍')).map((p) => p[1])) < 33.13, '마라도');
  assert.ok(Math.max(...pts(geomOf('50110', '추자면')).map((p) => p[1])) > 33.9, '추자도');
  assert.ok(Math.max(...pts(geomOf('50110', '우도면')).map((p) => p[0])) > 126.94, '우도');
  // 점검 좌표(파이프라인 probes — 원자료 덩어리 규칙): 마라도·추자도·우도
  assert.deepEqual(read('pipeline/data/probes.json').probes.filter((p: { sido: string }) => p.sido === '50').map((p: { name: string }) => p.name), ['마라도', '추자도', '우도']);
});

// 이름의 숫자는 지금 판에서 센 것(E13 열두 지역: +10·12곳 열림·영어 10곳 · E14 열네 지역: +12·14곳·영어 12곳)
test('홈·지역 고르기(E13 지역 포함): 처음 온 사람 탭은 서울·인천·경기 + 다른 지역 +n(공개 지역 + 시·도 단원 − 3), 강원을 고르면 서울·인천·강원 · 지역 고르기는 공개 지역 수만큼 열림(영어는 영문 확인 지역만)', () => {
  const h = sp(homePage(ctxOf(reg)).html);
  assert.deepEqual(tabKeys(h), ['seoul', 'incheon', 'gyeonggi']);
  // '다른 지역 +n' = 공개 지역 + 시·도 단원(korea) − 보이는 탭 셋(E13 열두 지역이면 +10 — E14 부터는 지금 판에서 셈)
  assert.match(h, new RegExp(`<a class="h-tab go" href="#/kr">다른 지역 <span class="u" aria-hidden="true">\\+${reg.regions.length + (geo.units.korea ? 1 : 0) - 3}</span>`));
  for (const [k, cnt, title, head] of [['gangwon', '18개 시·군', '북서쪽', '강원 다섯 과'], ['chungbuk', '11개 시·군', '청주 둘레', '충북 세 과'], ['jeonbuk', '14개 시·군', '전주 둘레', '전북 네 과']] as const) {
    const hk = sp(homePage(ctxOf(reg, { last: k })).html);
    assert.deepEqual([tabKeys(hk), pressed(hk)], [['seoul', 'incheon', k], k]);
    assert.match(hk, new RegExp(`data-arg="${k}" aria-pressed="true">${sidoOf(k)!.ko} <span class="u">${cnt}</span>`));
    assert.match(hk, new RegExp(`<h1 class="h-title">${title}<br>`));
    assert.match(hk, new RegExp(`<h2 id="h-path">${head}</h2>`));
    assert.match(hk, new RegExp(`href="#/kr/${k}/emd"><span>동까지 공부하기</span>`));
    assert.doesNotMatch(hk, BAD);
  }
  // 다 채움 단추(공개 차례): 서울을 다 칠하면 남은 지역에 강원·충북·전북·제주가 이 차례로(그 뒤에 연 지역 — 공개 차례 13~ — 은 그 뒤에)
  const sm: Mastery = Object.fromEntries(reg.region('seoul')!.items.map((it) => [it.id, rec(3, T + 4)]));
  assert.deepEqual(homeCard({ reg, mastery: sm, deck: null, daily: null, last: 'seoul', today: T }),
    { type: 'done', region: 'seoul', more: [...['incheon', 'gyeonggi', 'busan', 'daegu', 'daejeon', 'ulsan', 'sejong', 'gangwon', 'chungbuk', 'jeonbuk', 'jeju'], ...OPENED_SINCE(13)] });   // E14 부터 뒤에 연 지역이 끝에
  // 지역 고르기: 강원·제주는 권역에 지역 하나(머리만), 충청은 대전·세종·충북 + '충남' 준비 중, 호남은 전북 + '전남광주' 준비 중
  const p0 = regionsPage(ctxOf(reg));
  const p = sp(p0.html);
  // E13 12곳 · E14 14곳 — 열여섯을 모두 열면(E16) '전국 시·도 16곳'(E17: '16곳 중 16곳 열림' 대신)
  assert.match(p, new RegExp(reg.regions.length === 16 ? '전국 시·도 16곳' : `시·도 16곳 중 ${reg.regions.length}곳 열림`));
  assert.equal((p.match(/<li class="h-lc">/g) ?? []).length, reg.regions.length + 1);   // 공개 지역 + 시·도 단원
  for (const k of [...E13_KEYS, 'korea']) assert.match(p, new RegExp(`href="#/kr/${k}"`));
  // 권역마다 아직 열지 않은 지역(지역 표 차례)이 '준비 중' 한 줄 — E13 충남 / 전남광주 / 경북 · 경남, E14 부터는 지금 지역 표에서
  for (const g of new Set(SIDOS_ALL.map((s) => s.group))) {
    const off = SIDOS_ALL.filter((s) => s.group === g && s.status !== 'live').map((s) => s.ko);
    if (off.length && SIDOS_ALL.some((s) => s.group === g && s.status === 'live')) assert.match(p, new RegExp(`<p class="rg-soon"><span>${off.join(' · ')}</span><em>준비 중</em></p>`), g);
  }
  assert.match(p, /<span class="nm">제주<\/span><span class="no">43곳 · 11과<\/span>\s*<span class="pl">제주시·서귀포시 두 시, 7읍 5면 31동<\/span>/);
  assert.match(p, /<span class="nm">충북<\/span><span class="no">11개 시·군 · 3과<\/span>\s*<span class="pl">바다에 닿지 않은 하나뿐인 도<\/span>/);
  assert.deepEqual(p0.maps!.kr.active, SIDOS_ALL.filter((s) => s.status === 'live').map((s) => `kr:sido:${s.code}`));   // E13 열두 곳(11·26·27·28·30·31·36·41·43·50·51·52) · E14 44·47 · E15 48 더함(합친 판 열다섯)
  // 준비 중 줄(권역마다 ' · ' 로 이음)에는 지역 표에서 아직 열지 않은 지역만, 빠짐없이(E15)
  const soon = [...p.matchAll(/<p class="rg-soon"><span>([^<]*)<\/span><em>준비 중<\/em><\/p>/g)].flatMap((x) => x[1].split(' · '));
  assert.deepEqual(soon.sort(), read('src/data/sido.json').sidos.filter((x: { status: string }) => x.status !== 'live').map((x: { ko: string }) => x.ko).sort());
  for (const c of ['43', '50', '51', '52']) assert.ok(p0.maps!.kr.active!.includes(`kr:sido:${c}`), c);
  assert.doesNotMatch(p, BAD);
  setLang('en');
  try {
    // 관문이 닫힌 영어 앱(2026-11-16 전 영어 앱 — 동·일반구·시·도 단원을 끈 창): 과 없는 지역(세종·제주)·영문 확인 전 지역 뺌
    // (분모는 지도 칸 16 — E17 검수: E13 10 · E14 12 · E14·E15 합친 판 13 · 전남광주 영문을 켠 판 14)
    const off = createRegistry(geoEn, EN_OFF);
    const eOff = sp(regionsPage(ctxOf(off)).html);
    assert.match(eOff, new RegExp(`${SIDOS_ALL.filter((s) => s.status === 'live' && s.layer !== 'emd' && s.enChecked).length} of 16 regions open`));
    assert.equal(off.regions.length, SIDOS_ALL.filter((s) => s.status === 'live' && s.layer !== 'emd' && s.enChecked).length);
    assert.doesNotMatch(eOff, /href="#\/kr\/(jeju|sejong)"/);
    // 관문이 열린 영어 앱(EN_EMD): 세종·제주도 열려 영문 확인 지역 모두(16곳 모두면 캡션은 수만 — 'All 16 provinces and cities')
    const en = createRegistry(geoEn, EN_ON);   // E16: 영어 앱이 받는 판(main.ts 처럼 영문 확인 전 지역을 뺌 — E16 의 전남광주, 2026-11-15 켬)
    const e = sp(regionsPage(ctxOf(en)).html);
    const nEn = SIDOS_ALL.filter((s) => s.status === 'live' && s.enChecked).length;
    assert.match(e, nEn === 16 ? /All 16 provinces and cities/ : new RegExp(`${nEn} of 16 regions open`));
    assert.equal(en.regions.length, nEn);
    assert.ok(['gangwon', 'chungbuk', 'jeonbuk', 'jeju'].every((k) => en.region(k)));
    assert.match(e, /href="#\/kr\/jeju"/);
    assert.match(e, /href="#\/kr\/sejong"/);
    assert.doesNotMatch(e, /[가-힣]/, '영어 지역 고르기에 한글 없음');
    for (const k of ['gangwon', 'chungbuk', 'jeonbuk']) assert.match(e, new RegExp(`href="#/kr/${k}"`));
    assert.doesNotMatch(e, BAD);
    for (const [k, cnt, l1] of [['gangwon', '18 cities and counties', 'Northwest'], ['chungbuk', '11 cities and counties', 'Around Cheongju'], ['jeonbuk', '14 cities and counties', 'Around Jeonju']] as const) {
      const eh = homePage(ctxOf(en, { last: k })).html;
      assert.match(eh, new RegExp(`data-arg="${k}" aria-pressed="true">${sidoOf(k)!.en} <span class="u">${cnt}</span>`));
      assert.match(eh, new RegExp(l1));
      assert.doesNotMatch(eh, /[가-힣]{2,}[시군구]/, `${k} 영어 홈에 한글 곳 이름이 없음`);
      assert.doesNotMatch(eh, BAD);
      assert.doesNotMatch(unitPage(ctxOf(en), k).html, BAD);
    }
    assert.deepEqual(['gangwon', 'chungbuk', 'jeonbuk'].map((k) => UI_EN.count(en.region(k)!)), ['18 cities and counties', '11 cities and counties', '14 cities and counties']);
  } finally { setLang('ko'); }
  // 과 수 한글 수사: 제주 두 단원을 합친 11과도 고유어(소개 쪽 '제주는 열한 과')
  assert.deepEqual([1, 5, 10, 11, 12, 20, 21, 99, 0, 100].map(koCount), ['한', '다섯', '열', '열한', '열두', '스무', '스물한', '아흔아홉', '0', '100']);
});

test('주소·GA·고르기 보기: 새 지역 주소와 동 단원 주소, GA region·unit_id, 고르기 보기는 그 지역 안에서만', async () => {
  const k = knownOf(reg);
  assert.deepEqual(parseRoute('#/kr/gangwon', '', k).route, { name: 'unit', region: 'gangwon' });
  assert.deepEqual(parseRoute('#/kr/gangwon/sgg/p5', '', k).route, { name: 'lesson', region: 'gangwon', no: 5 });
  assert.equal(parseRoute('#/kr/gangwon/sgg/p6', '', k).route.name, 'home');
  assert.deepEqual(parseRoute('#/kr/chungbuk/sgg/@jeungpyeong-gun', '', k).route, { name: 'place', region: 'chungbuk', slug: 'jeungpyeong-gun' });
  assert.deepEqual(parseRoute('#/kr/jeonbuk/emd/jeonju-si-wansan-gu/p2', '', k).route, { name: 'lesson', region: 'jeonbuk/jeonju-si-wansan-gu', no: 2 });
  if (OFF_KEY) assert.equal(parseRoute(`#/kr/${OFF_KEY}`, '', k).route.name, 'home', '열지 않은 지역(지역 표 차례 첫째)');
  assert.deepEqual(['gangwon', 'chungbuk', 'jeonbuk'].map((x) => gaUnit(reg, x)), ['gangwon', 'chungbuk', 'jeonbuk'].map((x) => ({ unit: 'sgg', region: x })));
  const r = createRegistry(geo);
  assert.deepEqual(await registerUnits(r, ['gangwon/goseong-gun', 'jeonbuk/jeonju-si-wansan-gu'], async (code) => unitFile(code), () => {}), []);
  assert.deepEqual(gaArgs(r, 'gangwon/goseong-gun'), { unit: 'emd', region: 'gangwon', unit_id: '51820' });
  assert.deepEqual(gaArgs(r, 'jeonbuk/jeonju-si-wansan-gu'), { unit: 'emd', region: 'jeonbuk', unit_id: '52111' });
  // 고르기 보기: 같은 지역 안에서만(강원 고성군 문제에 다른 지역이 섞이지 않음), 네 곳 이상 과는 보기 넷
  for (const key of ['gangwon', 'chungbuk', 'jeonbuk']) {
    const R = reg.region(key)!;
    for (let seed = 1; seed <= 12; seed++) for (const l of R.lessons) for (const q of lessonQuestions(reg, key, l.no, () => 0, rngFrom(seed))) {
      for (const o of q.options ?? []) assert.equal(reg.place(o)!.region.key, key);
      if (q.mode === 'choose') assert.equal(q.options!.length, 4);
    }
  }
  // 구 고르기(강원 18단원): 이름표 18
  assert.equal(pickPage(ctxOf(reg), 'gangwon').maps!.pick.labels!.length, 18);
});

test('동 단원(강원 18·충북 14·전북 15·제주 2단원): 색인 = 판 폴더 파일 · 1곳 과 0 · 2곳 과 목록 · 단원 파일 gz 40KB 이하 · 지역 경계 파일 예산(N20)', () => {
  const want: Record<string, [number, number]> = { gangwon: [18, 188], chungbuk: [14, 153], jeonbuk: [15, 243], jeju: [2, 43] };
  const small: string[] = [];
  for (const key of E13_KEYS) {
    const idx = geo.units.emdUnits![key];
    assert.deepEqual([idx.length, idx.reduce((t, u) => t + u.n, 0)], want[key], key);
    for (const u of idx) {
      const j = unitFile(u.code);
      assert.equal(j.key, `${key}/${u.slug}`);
      assert.deepEqual(j.items.map((it) => it.slug), u.ids);
      for (const l of j.lessons) {
        assert.ok(l.items.length >= 2, `${j.ko} ${l.no}과 ${l.items.length}곳`);
        if (l.items.length < 3) small.push(`${j.ko} ${l.no}과`);
        assert.ok(l.minTapPx >= 16, `${j.ko} ${l.no}과 ${l.minTapPx}px`);
      }
      const gz = zlib.gzipSync(fs.readFileSync(path.join(dir, 'emd', `${u.code}.topo.json`)), { level: 9 }).length;
      assert.ok(gz <= 40 * 1024, `${j.ko} ${gz}B`);
    }
  }
  assert.deepEqual(small.sort(), ['군산시 4과', '서귀포시 3과', '익산시 5과', '제주시 6과', '제주시 7과', '증평군 1과'].sort());
  // 일반구 동 단원 slug = '{시 slug}-{구 slug}'(pipeline/data/gu-slugs.json)
  assert.deepEqual(geo.units.emdUnits!.jeonbuk.filter((u) => u.si).map((u) => u.slug).sort(), ['jeonju-si-deokjin-gu', 'jeonju-si-wansan-gu']);
  assert.equal(geo.units.emdUnits!.chungbuk.filter((u) => u.si).length, 4);
  // 지역 경계 파일(N20): gz 100KB 이하
  for (const key of E13_KEYS) {
    const gz = zlib.gzipSync(fs.readFileSync(path.join(dir, `${key}-sgg.topo.json`)), { level: 9 }).length;
    assert.ok(gz <= 100 * 1024, `${key} ${gz}B`);
  }
});

test('운영 형식 저장값(지금 사용자 기록 모양 — 서울·인천·경기·부산·대구 기록만): 이어 하기·홈 카드·오늘 복습·내일 수가 네 지역이 없는 판(E12)과 같다 — 다른 것은 다 채움의 남은 지역뿐(공통 조건 3)', () => {
  const L = (key: string, no: number) => geo.units.regions.find((r) => r.key === key)!.lessons[no - 1].items;
  const m: Mastery = {};
  L('seoul', 1).forEach((id) => { m[id] = rec(2, T); });
  L('seoul', 2).forEach((id, i) => { m[id] = rec(5, null, { grad: i < 2, streak: i < 2 ? 2 : 0 }); });
  L('daegu', 1).forEach((id) => { m[id] = rec(1, T); });
  L('incheon', 1).forEach((id) => { m[id] = rec(3, T + 1); });
  L('gyeonggi', 1).forEach((id, i) => { m[id] = rec(1, i % 2 ? T : T - 3); });
  L('gyeonggi', 3).forEach((id) => { m[id] = rec(4, T + 4); });
  const q3 = L('seoul', 3);
  const deck = { v: 1, kind: 'lesson', region: 'seoul', lesson: 3, seed: 7, queue: Array.from({ length: 23 }, (_, i) => ({ mode: i < q3.length ? 'meet' : 'find', id: q3[i % q3.length] })), pos: 7, log: [], retries: {}, missed: [], toLearn: [], placed: [], right: {} };
  const deck2 = { v: 1, kind: 'review', region: null, lesson: null, seed: 9, queue: L('daegu', 1).map((id) => ({ mode: 'find', id, scope: 'lesson' })), pos: 1, log: [], retries: {}, missed: [], toLearn: [], placed: [], right: {} };
  const data = new Map<string, string>();
  const kv: KV = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: (k) => { data.delete(k); } };
  const K = keys();
  data.set(K.mastery, JSON.stringify(m));
  data.set(K.deck, JSON.stringify(deck));
  data.set(K.deck2, JSON.stringify(deck2));
  data.set(K.daily, JSON.stringify({ day: T, n: 3 }));
  data.set(K.last, JSON.stringify('daegu'));
  const s = openStore(kv);
  const mastery = s.read(K.mastery, checkMastery)!, last = s.read(K.last, checkLast);
  assert.equal(s.read(K.daily, checkDaily)?.n, 3);
  const d1raw = s.read(K.deck, checkDeck), d2raw = s.read(K.deck2, checkDeck);
  const r0 = createRegistry(geoNoE13);
  for (const r of [reg, r0]) assert.ok(usableDeck(r, d1raw) && usableDeck(r, d2raw), '이어 할 판');
  assert.deepEqual(usableDeck(reg, d1raw), usableDeck(r0, d1raw));
  assert.deepEqual(usableDeck(reg, d2raw), usableDeck(r0, d2raw));
  const all: Mastery = Object.fromEntries(['seoul', 'busan', 'daegu', 'incheon', 'daejeon', 'ulsan', 'gyeonggi'].flatMap((k) => geo.units.regions.find((r) => r.key === k)!.items.map((it) => [it.id, rec(3, T + 4)])));
  const states: [Mastery, typeof d1raw, string | null, number][] = [
    [mastery, usableDeck(reg, d1raw), last, 3], [mastery, usableDeck(reg, d2raw), 'gyeonggi', 3], [mastery, null, last, 3],
    [mastery, null, 'gyeonggi', 25], [mastery, null, 'incheon', 0], [{}, null, null, 0], [all, null, 'seoul', 0], [all, null, 'daegu', 0],
    [Object.fromEntries(L('daegu', 1).map((id) => [id, rec(2, T + 2)])), null, 'daegu', 0],
  ];
  const types: string[] = [];
  for (const [mm, d, lst, n] of states) {
    const dl = { day: T, n };
    const a = homeCard({ reg, mastery: mm, deck: d, daily: dl, last: lst, today: T }), b = homeCard({ reg: r0, mastery: mm, deck: d, daily: dl, last: lst, today: T });
    if (a.type === 'done' && b.type === 'done') {
      // 다 채움 카드의 '남은 지역'에만 네 지역이 든다(의도 — 다 칠한 사람에게 새 지역을 권함). 앞 차례는 그대로
      assert.deepEqual([a.region, a.more.filter((k) => !OPENED_SINCE(9).includes(k))], [b.region, b.more]);
      assert.deepEqual(a.more.filter((k) => E13_KEYS.includes(k)), ['gangwon', 'chungbuk', 'jeonbuk', 'jeju']);
    } else assert.deepEqual(a, b, `${a.type} ${lst} ${n}`);
    types.push(a.type);
    assert.deepEqual(todayReview(reg, mm, T, n), todayReview(r0, mm, T, n));
    assert.equal(tomorrowCount(reg, mm, T), tomorrowCount(r0, mm, T));
  }
  assert.deepEqual([...new Set(types)].sort(), ['done', 'new', 'next', 'resume', 'review']);
});

test('지역 섬 상자(E13 검수 — E14 울릉 대비): 지역 화면·과에 insets 가 있으면 홈·지역 쪽·구 고르기·시험 결과·과 시작 지도와 둘러보기(viewSpec)가 섬 상자를 쓴다 · 지금 판(지역 insets 없음)은 전과 같다', () => {
  // 가짜 판: 운영 판 인천의 '섬과 바다' 화면과 3과에 옹진군을 섬 상자로 넣는다(통째로 먼 섬인 곳 — 경북 울릉군 — 을 파이프라인이 지역 insets 로 넣을 때의 모양)
  const ong = 'kr:sgg:28720';
  const U = structuredClone(geo.units);
  const inc = U.regions.find((x) => x.key === 'incheon')!;
  const sea = inc.screens.find((s) => s.items.includes(ong))!, l3 = inc.lessons.find((l) => l.items.includes(ong))!;
  sea.insets = [ong];
  l3.insets = [ong];
  const rX = createRegistry({ ...geo, units: U });
  const R = rX.region('incheon')!;
  const v = wholeView(R);
  assert.deepEqual(v.isles, [ong]);
  // 기본 범위 = 본 땅이 든 화면들(두 화면 모두 본 땅이 있다)의 범위 합
  const fits = inc.screens.map((s) => s.fit);
  assert.deepEqual(v.fit, [Math.min(...fits.map((b) => b[0])), Math.min(...fits.map((b) => b[1])), Math.max(...fits.map((b) => b[2])), Math.max(...fits.map((b) => b[3]))]);
  assert.deepEqual(viewSpec(R, v), { home: v.fit, isles: [ong] }, '둘러보기(explore.ts)가 넘기는 값');
  const ctx = ctxOf(rX, { homeRegion: 'incheon' });
  const res = { region: 'incheon', score: 10, total: 11, seconds: 60, wrong: [[ong, null]] as [string, string | null][] };
  // 과 시작·과 요약도 지역 전체 지도(2026-11-15 사용자 결정 — pages.ts lessonWhole)라 같은 범위·섬 상자. 1과(옹진 없음)도 섬 상자를 그대로 둔다
  const sum = (no: number) => ({ region: 'incheon', no, newly: [], firstTry: 0, total: 1, confused: [] });
  const lessonSpecs = (c: typeof ctx) => ({
    start3: startPage(c, 'incheon', l3.no).maps!.start, start1: startPage(c, 'incheon', 1).maps!.start,
    sum3: summaryPage(c, sum(l3.no)).maps!.sum, sum1: summaryPage(c, sum(1)).maps!.sum,
  });
  const specs = { home: homePage(ctx).maps!.main, unit: unitPage(ctx, 'incheon').maps!.unit, pick: pickPage(ctx, 'incheon').maps!.pick, res: resultPage(ctx, res).maps!.res, ...lessonSpecs(ctx) };
  for (const [k, s] of Object.entries(specs)) { assert.deepEqual(s.isles, [ong], k); assert.deepEqual(s.home, v.fit, k); }
  // 지금 판: 지역 지도에는 섬 상자가 없고 범위는 지역 범위 그대로(홈·지역 쪽은 homeMap 의 r.fit, 결과·과 시작·과 요약은 넘기지 않아 mountMap 이 지역 범위 — 전과 같은 spec)
  const c0 = ctxOf(createRegistry(geo), { homeRegion: 'incheon' });
  const R0 = c0.reg.region('incheon')!;
  assert.deepEqual(viewSpec(R0, wholeView(R0)), {});
  const s0 = { home: homePage(c0).maps!.main, unit: unitPage(c0, 'incheon').maps!.unit, pick: pickPage(c0, 'incheon').maps!.pick, res: resultPage(c0, res).maps!.res, ...lessonSpecs(c0) };
  for (const [k, s] of Object.entries(s0)) { assert.ok(!('isles' in s), k); assert.deepEqual(s.home ?? R0.fit, R0.fit, k); }
  for (const k of ['res', 'start3', 'start1', 'sum3', 'sum1'] as const) assert.ok(!('home' in s0[k]), k);
});
