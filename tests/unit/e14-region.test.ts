// 충남·경북(계획서 NATIONWIDE_PLAN E14 — 새 시·도 넷째 묶음): 지역 표 → 파이프라인 → 판 units.json → 앱이 두 지역에서 도는지 본다.
// 이 단계에서 따로 볼 것(계획서 E11~E16 단계별 추가 사항 E14 줄): 충남 넓은 화면 둘, 경북 울릉군은 통째로 먼 섬이라 지역 과·넓은 화면의 섬 상자(insets)·
// '이웃 없음 허용'(지역 표 lonelyOk), 경북 지역 경계 파일 40m(N20 — 20m 면 고리 점이 3만을 넘음), 독도 덩어리, 울릉 3동 단원, 계룡 4동 단원,
// 천안·포항(일반구 둘 — 단원 없이 구 고르기 목록, N5), 충남 먼 섬 규칙(지역 표 far lonLt 125.9 — 앱 먼 섬 상자 FAR_LON 과 같게).
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
import { sidoOf } from '../../src/app/sidos.ts';
import { checkDaily, checkDeck, checkLast, checkMastery, keys, openStore, type KV } from '../../src/app/store.ts';
import { unitKo } from '../../src/app/text/ko.ts';
import { UI_EN, UI_KO, setLang } from '../../src/app/text/ui.ts';
import type { EmdUnitFile } from '../../src/app/types.ts';
import type { Ctx } from '../../src/app/ui/ctx.ts';
import { homePage, pickPage, regionsPage, unitPage } from '../../src/app/ui/pages.ts';
import { lessonView, viewSpec, wholeView } from '../../src/app/ui/maps.ts';
import { ISLE_W, isleEast, layoutIsles } from '../../src/app/map/isles.ts';
import { boxOf } from '../../src/app/map/project.ts';
import { E14_KEYS, OPENED_SINCE, geo, geoNoE14, reg, idOf } from './fixtures.ts';

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
const sp = (h: string) => h.replace(/ /g, ' ');
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
const polys = (g: { type: string; coordinates: unknown } | null) => (!g ? [] : g.type === 'Polygon' ? [g.coordinates as number[][][]] : g.type === 'MultiPolygon' ? g.coordinates as number[][][][] : []);
const meanLon = (p: number[][][]) => p[0].reduce((t, c) => t + c[0], 0) / p[0].length;
const ULLEUNG = 'kr:sgg:47940';

test('지역 표·판: 충남·경북 공개(status·emd live, 일반구 단원 없음 — 천안·포항은 일반구 둘, N5), 판 units.json 은 원고와 같은 곳·과·넓은 화면 — 충남 15곳 4과 화면 2 · 경북 22곳 5과 한 화면', () => {
  assert.deepEqual(E14_KEYS, ['chungnam', 'gyeongbuk']);
  for (const [k, order] of [['chungnam', 13], ['gyeongbuk', 14]] as const) {
    const s = SIDO(k);
    assert.deepEqual([s.status, s.emd, s.gu, s.enChecked, s.hub, s.openOrder, s.gunFirst, s.lineRequired, s.layer], ['live', 'live', 'off', true, null, order, false, true, 'si'], k);
  }
  assert.deepEqual(E14_KEYS.map((k) => SIDO(k).en), ['Chungnam', 'Gyeongbuk']);
  // 충남 먼 섬은 경도 125.9 서쪽 덩어리(태안 근흥면 격렬비열도 쪽 — 앱 먼 섬 상자 FAR_LON 과 같은 규칙), 경북은 기본 규칙(울릉군 통째로 먼 섬)
  assert.deepEqual([SIDO('chungnam').far, SIDO('gyeongbuk').far], [{ lonLt: 125.9 }, null]);
  // 경북 지역 경계 파일만 40m(N20 — 20m 면 넓은 화면 고리 점 3만 넘음), 울릉군은 땅으로 맞닿은 이웃이 없어도 된다
  assert.deepEqual([SIDO('chungnam').simplifySggM, SIDO('gyeongbuk').simplifySggM, SIDO('chungnam').lonelyOk, SIDO('gyeongbuk').lonelyOk], [20, 40, [], ['울릉군']]);
  // 지역 표 차례(코드 차례): 충북(43) 다음 충남(44)·경북(47)
  const order = reg.regions.map((r) => r.key);
  assert.equal(order.indexOf('chungnam'), order.indexOf('chungbuk') + 1);
  assert.ok(order.indexOf('gyeongbuk') > order.indexOf('chungnam'));
  const shape = (k: string) => { const r = reg.region(k)!; return [r.layer, r.items.length, r.lessons.length, r.screens.length]; };
  assert.deepEqual(E14_KEYS.map(shape), [['si', 15, 4, 2], ['si', 22, 5, 1]]);
  for (const k of E14_KEYS) {
    const r = reg.region(k)!, src = SRC(k);
    assert.deepEqual(r.lessons.map((l) => [l.no, l.title, l.en, l.items.map((id) => reg.place(id)!.item.ko)]),
      src.lessons.map((l: { no: number; title: string; en: string; items: string[] }) => [l.no, l.title, l.en, l.items]), k);
    for (const it of r.items) { assert.equal(it.slug, src.slugs[it.ko], it.ko); assert.match(it.slug, /^[a-z][a-z0-9-]{2,}$/); assert.match(it.id, new RegExp(`^kr:sgg:${SIDO(k).code}\\d{3}$`)); }
    assert.equal(new Set(r.items.map((it) => it.slug)).size, r.items.length);
    for (const l of r.lessons) {
      assert.ok(l.minTapPx >= 16, `${k} ${l.no}과 ${l.minTapPx}px`);
      assert.ok(l.items.length >= 3 && l.items.length <= 6, `${k} ${l.no}과 ${l.items.length}곳`);
      assert.ok(l.title.length <= 12 && !/권역|도심/.test(l.title), l.title);
    }
    assert.equal(new Set(r.lessons.map((l) => l.title)).size, r.lessons.length);
    for (const s of r.screens) assert.ok(s.minTapPx >= 16, `${k} ${s.ko} ${s.minTapPx}px`);
  }
  // 시 층: 천안시 = 동남구·서북구를 합친 칸(44130), 포항시 = 남구·북구(47110)
  assert.equal(idOf('천안시'), 'kr:sgg:44130');
  assert.equal(idOf('포항시'), 'kr:sgg:47110');
  // 과 이름(쉬운 말 — 방위·대표 지명·바다)
  assert.deepEqual(E14_KEYS.map((k) => reg.region(k)!.lessons.map((l) => l.title)),
    [['북쪽', '서쪽 바닷가', '남쪽', '대전 둘레'], ['북쪽', '안동 둘레', '동해 바닷가', '대구 둘레', '서쪽']]);
  // 충남 3과(부여·청양·서천)는 지도 검사 각도 -95°(거의 정남)라 '남서쪽'이 아니라 '남쪽'(E14 검수) — 남동쪽은 4과 '대전 둘레'
  assert.equal(reg.region('chungnam')!.lessons[2].en, 'South');
  // 충남 넓은 화면: 서쪽 8 · 동쪽 7(한 화면이면 계룡시가 11px) — 가장 작은 칸 동쪽 계룡시 19px
  assert.deepEqual(reg.region('chungnam')!.screens.map((s) => [s.key, s.ko, s.items.length]), [['west', '서쪽', 8], ['east', '동쪽', 7]]);
  assert.equal(reg.region('chungnam')!.lessons[3].minTapPx, 19, '대전 둘레 계룡시(모호 확대 범위)');
  // 경북은 한 화면(울릉군을 섬 상자로 빼면 가장 작은 칸 31px)
  assert.deepEqual(reg.region('gyeongbuk')!.screens.map((s) => [s.key, s.items.length, s.minTapPx]), [['all', 22, 31]]);
  // 일반구 단원 없음(N5 — 일반구 둘): 판 guUnits 에도 등록부에도 없다
  for (const k of E14_KEYS) { assert.equal(geo.units.guUnits?.[k], undefined); assert.equal(reg.region(`${k}/gu`), undefined); }
  // 문구: '15개 시·군'·'22개 시·군', 문제 단위 '시·군'(한), '15 cities and counties'(영)
  assert.deepEqual(E14_KEYS.map((k) => [UI_KO.count(reg.region(k)!), UI_EN.count(reg.region(k)!), unitKo(reg.region(k)!)]),
    [['15개 시·군', '15 cities and counties', '시·군'], ['22개 시·군', '22 cities and counties', '시·군']]);
});

test('위치 한 줄(N27): 충남 15·경북 22곳 — 원고 그대로, 30자 이하·금지 낱말 없음, 지도 근거만(명소 없음) · 울릉군은 맞닿음 근거 없이 바다·방향', () => {
  let n = 0;
  for (const k of E14_KEYS) {
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
  assert.equal(n, 37);
  assert.deepEqual(LINES.gyeongbuk['울릉군'], { line: '울진 동쪽, 바다로 둘러싸인 섬', dir: ['울진군', 'E'], coast: 'all' });
  // 다른 시·도와의 맞닿음은 시·도 이름으로 잰다(대구는 지금 원자료에서 대구에 든 군위군 경계까지 — 의성군)
  assert.deepEqual(LINES.gyeongbuk['의성군'].touch, ['대구광역시']);
  assert.deepEqual(LINES.chungnam['금산군'].touch, ['대전광역시', '충청북도', '전북특별자치도']);
  assert.equal(UI_EN.line(reg, idOf('천안시')), '', '위치 한 줄은 한국어만');
});

test('울릉군 섬 상자(N8 · E14): 경북 3과·넓은 화면의 insets — 지역·과·화면 범위(fit)에서 빠지고, 홈·지역 쪽·둘러보기·시험(viewSpec·wholeView·lessonView)이 섬 상자로 그린다 · 맞닿은 곳 없음', () => {
  const gb = reg.region('gyeongbuk')!;
  assert.deepEqual(gb.lessons.map((l) => l.insets ?? []), [[], [], [ULLEUNG], [], []]);
  assert.deepEqual(gb.screens.map((s) => s.insets ?? []), [[ULLEUNG]]);
  // 범위는 본 땅만(울릉도 동경 130.8 · 독도 131.87 은 빠짐 — 본 땅 동쪽 끝 호미곶 129.6)
  for (const f of [gb.fit, gb.lessons[2].fit, gb.screens[0].fit]) assert.ok(f[2] < 129.7, `fit ${f}`);
  assert.deepEqual(wholeView(gb).isles, [ULLEUNG]);
  assert.deepEqual(viewSpec(gb, wholeView(gb)).isles, [ULLEUNG]);
  assert.deepEqual(lessonView(gb.lessons[2]).isles, [ULLEUNG]);
  assert.deepEqual(lessonView(gb.lessons[0]).isles, []);
  // 다른 지역(충남 포함)은 지역 insets 가 없다(전과 같음)
  for (const r of reg.regions) if (r.key !== 'gyeongbuk') assert.ok(r.lessons.every((l) => !l.insets) && r.screens.every((s) => !s.insets), r.key);
  // 홈 지도(경북 탭)·지역 쪽·구 고르기 지도에 섬 상자
  assert.deepEqual(homePage(ctxOf(reg, { last: 'gyeongbuk' })).maps!.main.isles, [ULLEUNG]);
  // 이웃 없음(lonelyOk): 맞닿은 곳·바다 건너 이웃 없음
  assert.deepEqual([geo.neighbors.si[ULLEUNG] ?? [], geo.neighbors.sgg[ULLEUNG] ?? [], geo.neighbors.sea[ULLEUNG] ?? []], [[], [], []]);
  // 지역 경계 파일(40m): 울릉군 칸에 울릉도와 독도 덩어리가 남는다(독도 = 바깥 고리 평균 경도 131.8 동쪽 — 원자료 울릉읍 덩어리로 확인)
  const t = read(`public/data/geo/${DATA_VER}/gyeongbuk-sgg.topo.json`);
  const ul = topo.feature(t, t.objects.si).features.find((f: { properties: { siId: string } }) => f.properties.siId === ULLEUNG)!;
  const ps = polys(ul.geometry);
  assert.ok(ps.some((p) => meanLon(p) > 131.8), '독도 덩어리');
  assert.ok(ps.some((p) => meanLon(p) > 130.8 && meanLon(p) < 131), '울릉도 덩어리');
  // 판 manifest: 경북은 40m, 나머지는 sgg 숫자(20m — 지역 표 차례 첫 공개 지역 서울의 값, 파이프라인 SGG_SIMPLIFY_M). sggBy 는 지금 판의 공개 지역 가운데 지역 표 simplifySggM 이 sgg 와 다른 지역에서 셈한다
  // (뒤 단계가 다른 지역을 40m 로 열어도 이 단언은 그대로 — E14 검수)
  const ms = read(`public/data/geo/${DATA_VER}/manifest.json`).simplify_m;
  assert.deepEqual([ms.emd, ms.sgg, ms.sggBy?.gyeongbuk], [5, 20, 40]);
  assert.deepEqual(ms.sggBy, Object.fromEntries(geo.units.regions.map((r) => r.key).filter((k) => SIDO(k).simplifySggM !== ms.sgg).map((k) => [k, SIDO(k).simplifySggM])));
});

test('울릉군 섬 상자 자리(E14 검수): 섬이 본 지도 범위 동쪽이면 세로 줄은 오른쪽·가로 줄은 오른쪽 끝 — 서·남·북쪽 섬은 전과 같이 왼쪽', () => {
  const gb = reg.region('gyeongbuk')!;
  // 경북 지역 범위·3과·화면 범위의 동쪽 끝(호미곶 129.6)보다 울릉도(130.8)가 동쪽: 상자 가운데로 잰다(앱과 같은 지도 단위 — boxOf).
  // 울릉 섬 상자 범위 = 울릉 동 단원 fit(아래 시험 — 세 곳 모두 섬 상자 범위)
  const ul = boxOf(unitFile('47940').fit);
  for (const f of [gb.fit, gb.lessons[2].fit, gb.screens[0].fit]) assert.ok(isleEast([ul], boxOf(f)), `fit ${f}`);
  // 넓은 칸: 오른쪽 세로 줄 — 상자 오른쪽 끝 = 지도 칸 안쪽 오른쪽 끝, 본 지도 여백은 오른쪽(r)으로
  const area = { x: 24, y: 24, w: 900, h: 600 };
  const col = layoutIsles([ul], area, false, true);
  assert.deepEqual([col.mode, col.side, col.boxes[0].x + col.boxes[0].w, col.shift.l, col.shift.r], ['col', 'r', area.x + area.w, 0, ISLE_W + 16]);
  assert.equal(col.note.x + col.note.w, area.x + area.w, "'축척 다름' 칸도 오른쪽 끝");
  // 세로로 긴 칸(폰): 아래 가로 줄을 오른쪽 끝에
  const pa = { x: 12, y: 12, w: 366, h: 470 };
  const row = layoutIsles([ul], pa, false, true);
  assert.deepEqual([row.mode, row.side, row.boxes[0].x + row.boxes[0].w, row.boxes[0].y + row.boxes[0].h, row.shift.r], ['row', 'r', pa.x + pa.w, pa.y + pa.h, 0]);
  // east 를 주지 않으면(기본) 전과 같은 왼쪽 배치 — 지금 판의 다른 섬 상자(옹진·단원구·제주시·부안)는 모두 본 지도 범위 서·남·북쪽이라 east 가 아니다
  const left = layoutIsles([ul], area, false);
  assert.deepEqual([left.side, left.boxes[0].x, left.shift.l, left.shift.r], ['l', area.x, ISLE_W + 16, 0]);
  // 판의 다른 섬 상자: 옹진(격자 — east 를 쓰지 않음)·안산 단원구·제주시·부안 섬은 본 지도 범위 동쪽이 아니다
  for (const [code, no] of [['41273', 2], ['50110', 7], ['52800', 1]] as const) {
    const u = unitFile(code), l = u.lessons[no - 1];
    assert.ok(l.insets?.length, `${u.ko} ${no}과 섬 상자`);
    const t = read(`public/data/geo/${DATA_VER}/emd/${code}.topo.json`);
    for (const id of l.insets!) {
      const f = topo.feature(t, t.objects.emd).features.find((x: { properties: { id: string } }) => x.properties.id === id)!;
      const ps = polys(f.geometry);
      const lon = ps.flatMap((p) => p[0].map((c) => c[0])), lat = ps.flatMap((p) => p[0].map((c) => c[1]));
      assert.equal(isleEast([boxOf([Math.min(...lon), Math.min(...lat), Math.max(...lon), Math.max(...lat)])], boxOf(l.fit)), false, `${u.ko} ${id}`);
    }
  }
});

test('울릉 동 단원 범위(E14 검수): 세 곳이 모두 통째로 먼 섬이라 단원·과·화면 fit 이 섬 상자 범위 — 죽도(울릉읍)·관음도(북면)가 들고, 독도는 빠진다', () => {
  const j = unitFile('47940');
  const ut = read(`public/data/geo/${DATA_VER}/emd/47940.topo.json`);
  const fs2 = topo.feature(ut, ut.objects.emd).features as { properties: { id: string }; geometry: { type: string; coordinates: unknown } }[];
  // 덩어리의 경도 범위를 1e-4 만큼 줄여 견준다(fit 은 경위도 소수 넷째 자리 반올림 — 죽도 동쪽 끝 130.94195 가 fit 130.9419 로 0.4m 안쪽)
  const lonBox = (p: number[][][]) => [Math.min(...p[0].map((c) => c[0])) + 1e-4, Math.max(...p[0].map((c) => c[0])) - 1e-4];
  // 울릉읍의 울릉도 동쪽 작은 덩어리(죽도 — 경도 130.93~130.95)가 단원·과·화면 범위 안
  const eup = fs2.find((f) => f.properties.id === j.items.find((it) => it.ko === '울릉읍')!.id)!;
  const jukdo = polys(eup.geometry).filter((p) => meanLon(p) > 130.925 && meanLon(p) < 131);
  assert.ok(jukdo.length >= 1, '죽도 덩어리');
  for (const f of [j.fit, j.lessons[0].fit, j.screens[0].fit]) {
    for (const p of jukdo) { const [w, e] = lonBox(p); assert.ok(w >= f[0] && e <= f[2], `죽도 ${w}~${e} / fit ${f}`); }
    assert.ok(f[2] < 131.5, `독도(131.87)는 범위 밖 ${f}`);
  }
  // 북면의 모든 덩어리(관음도 포함)가 범위 안
  const buk = fs2.find((f) => f.properties.id === j.items.find((it) => it.ko === '북면')!.id)!;
  for (const p of polys(buk.geometry)) { const [w, e] = lonBox(p); assert.ok(w >= j.fit[0] && e <= j.fit[2], `북면 ${w}~${e}`); }
  // 과 하나·화면 하나·16px 그대로
  assert.deepEqual([j.lessons.length, j.screens.length, j.lessons[0].minTapPx >= 16], [1, 1, true]);
});

test('충남 먼 섬(지역 표 far lonLt 125.9): 지역 범위는 125.9 동쪽 본 땅 · 태안군 칸에 125.9 서쪽 덩어리가 있어 앱이 먼 섬 상자로 옮긴다(파이프라인 범위와 같은 규칙)', () => {
  const cn = reg.region('chungnam')!;
  assert.ok(cn.fit[0] >= 125.9, `fit ${cn.fit}`);
  const t = read(`public/data/geo/${DATA_VER}/chungnam-sgg.topo.json`);
  const ta = topo.feature(t, t.objects.si).features.find((f: { properties: { siId: string } }) => f.properties.siId === idOf('태안군'))!;
  assert.ok(polys(ta.geometry).filter((p) => meanLon(p) < 125.9).length >= 1, '125.9 서쪽 덩어리');
  // 다른 칸에는 125.9 서쪽 덩어리가 없다
  for (const f of topo.feature(t, t.objects.si).features) if (f.properties.siId !== idOf('태안군')) assert.ok(polys(f.geometry).every((p) => meanLon(p) >= 125.9), f.properties.siName);
});

test('지역 경계 파일 예산(N20 · 7절): gz 100KB 이하 · 넓은 화면 고리 점(칸 + 이웃 땅 + 강) 3만 이하 — 충남 20m · 경북 40m', () => {
  const ring = (g: { type: string; coordinates: unknown } | null) => polys(g).reduce((t, p) => t + p.reduce((u, r) => u + r.length, 0), 0);
  for (const k of E14_KEYS) {
    const raw = fs.readFileSync(path.join(dir, `${k}-sgg.topo.json`));
    const gz = zlib.gzipSync(raw, { level: 9 }).length;
    assert.ok(gz <= 100 * 1024, `${k} ${gz}B`);
    const t = JSON.parse(raw.toString('utf8'));
    const pts = ['si', 'out', 'water'].filter((o) => t.objects[o]).reduce((s, o) => s + topo.feature(t, t.objects[o]).features.reduce((u: number, f: { geometry: { type: string; coordinates: unknown } | null }) => u + ring(f.geometry), 0), 0);
    assert.ok(pts <= 30000, `${k} 고리 점 ${pts}`);
  }
});

test('동 단원(충남 16·경북 23단원): 색인 = 판 폴더 파일 · 2곳 과 목록 · 단원 파일 gz 40KB 이하 · 울릉 3동·계룡 4동 단원(과 하나, 보기는 단원 안에서만) · 천안·포항 구는 구 고르기 목록에서 시 아래', async () => {
  const want: Record<string, [number, number]> = { chungnam: [16, 208], gyeongbuk: [23, 321] };
  const small: string[] = [];
  for (const key of E14_KEYS) {
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
  assert.deepEqual(small, ['태안군 2과'], '안면읍·고남면(안면도)');
  // 일반구 동 단원 slug = '{시 slug}-{구 slug}'(pipeline/data/gu-slugs.json)
  assert.deepEqual(geo.units.emdUnits!.chungnam.filter((u) => u.si).map((u) => u.slug), ['cheonan-si-dongnam-gu', 'cheonan-si-seobuk-gu']);
  assert.deepEqual(geo.units.emdUnits!.gyeongbuk.filter((u) => u.si).map((u) => u.slug), ['pohang-si-nam-gu', 'pohang-si-buk-gu']);
  // 울릉 3동·계룡 4동: 과 하나(N10 — 4곳 미만 단원은 과 하나, 이웃 단원에서 보기를 빌리지 않음 — 울릉은 보기 셋(정답 포함)), 화면 하나
  const r = createRegistry(geo);
  for (const [code, key, n, opts] of [['47940', 'gyeongbuk/ulleung-gun', 3, 3], ['44250', 'chungnam/gyeryong-si', 4, 4]] as const) {
    const j = unitFile(code);
    assert.deepEqual([j.key, j.items.length, j.lessons.length, j.lessons[0].items.length, j.screens.length], [key, n, 1, n, 1]);
    await registerUnits(r, [key], async (c) => unitFile(c), () => {});
    for (let seed = 1; seed <= 6; seed++) for (const q of lessonQuestions(r, key, 1, () => 0, rngFrom(seed))) if (q.mode === 'choose') assert.equal(q.options!.length, opts, key);
  }
  // 울릉 단원 지도 파일에도 독도 덩어리(울릉읍)가 남는다
  const ut = read(`public/data/geo/${DATA_VER}/emd/47940.topo.json`);
  assert.ok(topo.feature(ut, ut.objects.emd).features.some((f: { geometry: { type: string; coordinates: unknown } }) => polys(f.geometry).some((p) => meanLon(p) > 131.8)), '독도');
  // 구 고르기: 천안시 2개 구 · 포항시 2개 구(일반구 단원 링크 없음), 울릉군은 섬 상자
  const pc = sp(pickPage(ctxOf(reg), 'chungnam').html), pg = pickPage(ctxOf(reg), 'gyeongbuk');
  assert.match(pc, /천안시 <span[^>]*>2개 구/);
  assert.match(sp(pg.html), /포항시 <span[^>]*>2개 구/);
  assert.deepEqual(pg.maps!.pick.isles, [ULLEUNG]);
  assert.equal(pg.maps!.pick.labels!.length, 22);
  for (const k of E14_KEYS) assert.doesNotMatch(sp(unitPage(ctxOf(reg), k).html), /\/gu"/);
  for (const h of [pc, pg.html]) assert.doesNotMatch(h, BAD);
});

test('홈·지역 고르기: 충남·경북 탭(공부한 지역이 앞) · 과 카드 · 지역 고르기 칸 · 영어 화면(한글 곳 이름 없음)', () => {
  for (const [k, cnt, title, head] of [['chungnam', '15개 시·군', '북쪽', '충남 네 과'], ['gyeongbuk', '22개 시·군', '북쪽', '경북 다섯 과']] as const) {
    const hk = sp(homePage(ctxOf(reg, { last: k })).html);
    assert.deepEqual([tabKeys(hk), pressed(hk)], [['seoul', 'incheon', k], k]);
    assert.match(hk, new RegExp(`data-arg="${k}" aria-pressed="true">${sidoOf(k)!.ko} <span class="u">${cnt}</span>`));
    assert.match(hk, new RegExp(`<h1 class="h-title">${title}<br>`));
    assert.match(hk, new RegExp(`<h2 id="h-path">${head}</h2>`));
    assert.match(hk, new RegExp(`href="#/kr/${k}/emd"><span>동까지 공부하기</span>`));
    assert.match(hk, new RegExp(SIDO(k).desc.ko[0]));
    assert.doesNotMatch(hk, BAD);
  }
  // 다 채움 단추(공개 차례): 서울을 다 칠하면 남은 지역 끝에 충남·경북(그 뒤에 연 지역도 그 뒤에)
  const sm: Mastery = Object.fromEntries(reg.region('seoul')!.items.map((it) => [it.id, rec(3, T + 4)]));
  const done = homeCard({ reg, mastery: sm, deck: null, daily: null, last: 'seoul', today: T });
  assert.ok(done.type === 'done');
  assert.deepEqual(done.type === 'done' && done.more.filter((k) => OPENED_SINCE(13).includes(k)), OPENED_SINCE(13));
  assert.deepEqual(done.type === 'done' && done.more.slice(-OPENED_SINCE(13).length).slice(0, 2), ['chungnam', 'gyeongbuk']);
  // 지역 고르기: 충청 묶음에 충남 칸, 영남 묶음에 경북 칸
  const p = sp(regionsPage(ctxOf(reg)).html);
  assert.match(p, /<span class="nm">충남<\/span><span class="no">15개 시·군 · 4과<\/span>\s*<span class="pl">바다에 닿은 곳 7, 닿지 않은 곳 8<\/span>/);
  assert.match(p, /<span class="nm">경북<\/span><span class="no">22개 시·군 · 5과<\/span>\s*<span class="pl">바다에 닿은 곳 5, 닿지 않은 곳 17<\/span>/);
  for (const k of E14_KEYS) assert.match(p, new RegExp(`href="#/kr/${k}"`));
  assert.doesNotMatch(p, BAD);
  setLang('en');
  try {
    const en = createRegistry(geo, { emd: false });
    const e = sp(regionsPage(ctxOf(en)).html);
    for (const k of E14_KEYS) assert.match(e, new RegExp(`href="#/kr/${k}"`));
    for (const [k, cnt, l1] of [['chungnam', '15 cities and counties', 'West coast'], ['gyeongbuk', '22 cities and counties', 'Around Andong']] as const) {
      const eh = homePage(ctxOf(en, { last: k })).html;
      assert.match(eh, new RegExp(`data-arg="${k}" aria-pressed="true">${sidoOf(k)!.en} <span class="u">${cnt}</span>`));
      assert.match(eh, new RegExp(l1));
      assert.doesNotMatch(eh, /[가-힣]{2,}[시군구]/, `${k} 영어 홈에 한글 곳 이름이 없음`);
      assert.doesNotMatch(eh, BAD);
      assert.doesNotMatch(unitPage(ctxOf(en), k).html, BAD);
    }
    // 영어 앱도 울릉군 섬 상자(지역 insets — 단원이 아니라 지역이라 영어 앱에도 실림)
    assert.deepEqual(wholeView(en.region('gyeongbuk')!).isles, [ULLEUNG]);
    assert.equal(en.region('gyeongbuk/ulleung-gun'), undefined, '영어 앱은 동 단원을 싣지 않는다(N26)');
  } finally { setLang('ko'); }
});

test('주소·GA·고르기 보기: 새 지역 주소와 동 단원 주소, GA region·unit_id, 고르기 보기는 그 지역 안에서만', async () => {
  const k = knownOf(reg);
  assert.deepEqual(parseRoute('#/kr/chungnam', '', k).route, { name: 'unit', region: 'chungnam' });
  assert.deepEqual(parseRoute('#/kr/gyeongbuk/sgg/p5', '', k).route, { name: 'lesson', region: 'gyeongbuk', no: 5 });
  assert.equal(parseRoute('#/kr/gyeongbuk/sgg/p6', '', k).route.name, 'home');
  assert.deepEqual(parseRoute('#/kr/gyeongbuk/sgg/@ulleung-gun', '', k).route, { name: 'place', region: 'gyeongbuk', slug: 'ulleung-gun' });
  assert.deepEqual(parseRoute('#/kr/chungnam/emd/cheonan-si-dongnam-gu/p4', '', k).route, { name: 'lesson', region: 'chungnam/cheonan-si-dongnam-gu', no: 4 });
  assert.equal(parseRoute('#/kr/chungnam/gu', '', k).route.name, 'home', '충남은 일반구 단원 없음(천안 2구 — N5)');
  assert.deepEqual(E14_KEYS.map((x) => gaUnit(reg, x)), E14_KEYS.map((x) => ({ unit: 'sgg', region: x })));
  const r = createRegistry(geo);
  assert.deepEqual(await registerUnits(r, ['gyeongbuk/ulleung-gun', 'chungnam/cheonan-si-seobuk-gu'], async (code) => unitFile(code), () => {}), []);
  assert.deepEqual(gaArgs(r, 'gyeongbuk/ulleung-gun'), { unit: 'emd', region: 'gyeongbuk', unit_id: '47940' });
  assert.deepEqual(gaArgs(r, 'chungnam/cheonan-si-seobuk-gu'), { unit: 'emd', region: 'chungnam', unit_id: '44133' });
  // 고르기 보기: 같은 지역 안에서만, 보기 넷(3곳 과 — 충남 3과 — 도 같은 지역의 다른 곳에서 채워 넷)
  for (const key of E14_KEYS) {
    const R = reg.region(key)!;
    for (let seed = 1; seed <= 12; seed++) for (const l of R.lessons) for (const q of lessonQuestions(reg, key, l.no, () => 0, rngFrom(seed))) {
      for (const o of q.options ?? []) assert.equal(reg.place(o)!.region.key, key);
      if (q.mode === 'choose') assert.equal(q.options!.length, 4);
    }
  }
  // 섞인 화면 이름: 같은 이름 없는 곳이라 시·도 이름을 붙이지 않는다
  assert.deepEqual([UI_KO.fullName(reg, idOf('계룡시')), UI_KO.fullName(reg, ULLEUNG)], ['계룡시', '울릉군']);
});

test('운영 형식 저장값(지금 사용자 기록 모양 — 서울·인천·경기·부산·대구 기록만): 이어 하기·홈 카드·오늘 복습·내일 수가 충남·경북과 그 뒤 지역(E15 경남)이 없는 판(E13)과 같다 — 다른 것은 다 채움의 남은 지역뿐(공통 조건 3)', () => {
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
  const r0 = createRegistry(geoNoE14);
  // geoNoE14 = 공개 차례 13 이상(E14 충남·경북 + 함께 진행해 합친 E15 경남)을 뺀 판 = E13 판
  assert.deepEqual(r0.regions.map((r) => r.key).filter((k) => OPENED_SINCE(13).includes(k)), [], 'E13 판에는 충남·경북·경남이 없다');
  assert.equal(r0.regions.length, reg.regions.length - OPENED_SINCE(13).length);
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
      // 다 채움 카드의 '남은 지역'에만 두 지역(과 그 뒤에 연 지역)이 끝에 붙는다(의도 — 다 칠한 사람에게 새 지역을 권함). 앞 차례는 그대로
      assert.deepEqual([a.region, a.more.filter((k) => !OPENED_SINCE(13).includes(k))], [b.region, b.more]);
      assert.deepEqual(a.more.filter((k) => E14_KEYS.includes(k)), ['chungnam', 'gyeongbuk']);
      assert.deepEqual(a.more.slice(-OPENED_SINCE(13).length), OPENED_SINCE(13));   // 남은 지역 끝에 공개 차례로(충남·경북·경남)
    } else assert.deepEqual(a, b, `${a.type} ${lst} ${n}`);
    types.push(a.type);
    assert.deepEqual(todayReview(reg, mm, T, n), todayReview(r0, mm, T, n));
    assert.equal(tomorrowCount(reg, mm, T), tomorrowCount(r0, mm, T));
  }
  assert.deepEqual([...new Set(types)].sort(), ['done', 'new', 'next', 'resume', 'review']);
});
