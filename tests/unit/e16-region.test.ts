// 전남광주(계획서 NATIONWIDE_PLAN E16 — 마지막 새 시·도): 지역 표 → 파이프라인 → 판 units.json → 앱이 전남광주에서 도는지 본다.
// 이 단계에서 따로 볼 것(계획서 E11~E16 단계별 추가 사항 E16 줄 · N3 · N8 · N20): 27곳 393동, 넓은 화면 '광주'와 전남(자동 셋), 60m(지역 경계 고리 점 3만),
// 신안·완도·여수·고흥 섬 과, 흑산·가거도 먼 섬(지역 표 far lonLt 125.7 — 앱 먼 섬 상자도 같은 경도), 진도·완도 다리(바다 건너 이웃),
// 신안 단원 크기(이웃 범위를 맞닿은 시·군·구로 줄임), '광주특별시 동구'(섞인 화면 — 지역 표 parts, 2026-11-15 법정 약칭 — E16 에는 '광주 동구'), 영어(E16 은 숨김 — 2026-11-15 사용자 지시로 짧은 이름 'Jeonnam-Gwangju' 로 엶, 숨김 규칙은 가짜 지역 표로), 4과 카드 줄(E16 고침), 부팅 데이터 예산.
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
import { FAR_LON, buildShapes, farLonOf, specOf, type Topology } from '../../src/app/map/shapes.ts';
import { createRegistry, type Registry } from '../../src/app/registry.ts';
import { parseRoute, type Known } from '../../src/app/router.ts';
import { SIDOS, partOf, sidoOf } from '../../src/app/sidos.ts';
import { checkDeck, checkLast, checkMastery, keys, openStore, type KV } from '../../src/app/store.ts';
import { UI_EN, UI_KO, setLang } from '../../src/app/text/ui.ts';
import type { EmdUnitFile } from '../../src/app/types.ts';
import type { Ctx } from '../../src/app/ui/ctx.ts';
import { homePage, pickPage, regionsPage, unitPage } from '../../src/app/ui/pages.ts';
import { LIVE, scopeEn, scopeKo, studyKo } from '../../src/lib/regions.ts';
import { EN_OFF, EN_ON, E16_KEYS, geo, geoEn, geoEnNow, geoNoE16, reg, idOf, withEnHidden } from './fixtures.ts';

const T = 20000;
const KEY = 'jeonnam-gwangju';
const root = path.join(import.meta.dirname, '../..');
const dir = path.join(root, 'public/data/geo', DATA_VER);
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const SIDO = read('src/data/sido.json').sidos.find((s: { key: string }) => s.key === KEY);
const SRC = read('src/data/units.json').regions.find((r: { key: string }) => r.key === KEY);
const LINES = read('src/data/place-lines.json')[KEY];
const HARD: string[] = read('src/data/hard-words.json').words;
const MANIFEST = read(`public/data/geo/${DATA_VER}/manifest.json`);
const unitFile = (code: string): EmdUnitFile => JSON.parse(fs.readFileSync(path.join(dir, 'emd', `${code}.json`), 'utf8'));
const topoOf = (name: string) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const gz9 = (name: string) => zlib.gzipSync(fs.readFileSync(path.join(dir, name)), { level: 9 }).length;
const BAD = /undefined|NaN|kr:(sgg|emd|sido):|\[object/;
const tabKeys = (h: string) => [...h.matchAll(/data-act="homeRegion" data-arg="([a-z-]+)"/g)].map((x) => x[1]);
const pressed = (h: string) => /data-arg="([a-z-]+)" aria-pressed="true"/.exec(h)?.[1];
const sp = (h: string) => h.replace(/ /g, ' ');   // 이름 사이 ' · ' 의 붙임 빈칸(NBSP)을 보통 빈칸으로
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
const ringPts = (t: { objects: Record<string, unknown> }, name: string) => (t.objects[name] ? topo.feature(t as never, t.objects[name] as never).features
  .reduce((s: number, f: { geometry: G }) => s + polys(f.geometry).reduce((u, p) => u + p.reduce((v, q) => v + q.length, 0), 0), 0) : 0);
const sgg = (code: string) => `kr:sgg:${code}`;
// CSS 선택자 목록을 맨 위 쉼표로 나눈다(괄호 안 쉼표는 그대로)
const splitTop = (s: string) => { const out: string[] = []; let d = 0, st = 0; for (let i = 0; i < s.length; i++) { if (s[i] === '(') d++; else if (s[i] === ')') d--; else if (s[i] === ',' && !d) { out.push(s.slice(st, i).trim()); st = i + 1; } } out.push(s.slice(st).trim()); return out.filter(Boolean); };
// 선택자 하나의 특이도 [id, 클래스·속성·의사 클래스, 형·의사 요소]. :not·:is·:has 는 인자 가운데 가장 높은 것, :where 는 0, :nth-child(…) 는 의사 클래스 하나
function spec(sel: string): number[] {
  const n = [0, 0, 0];
  const word = (i: number) => { while (i < sel.length && /[\w-]/.test(sel[i])) i++; return i; };
  for (let i = 0; i < sel.length;) {
    const ch = sel[i];
    if (ch === '#') { n[0]++; i = word(i + 1); }
    else if (ch === '.') { n[1]++; i = word(i + 1); }
    else if (ch === '[') { n[1]++; i = sel.indexOf(']', i) + 1; }
    else if (ch === ':' && sel[i + 1] === ':') { n[2]++; i = word(i + 2); }
    else if (ch === ':') {
      const e = word(i + 1), name = sel.slice(i + 1, e);
      let arg: string | null = null;
      i = e;
      if (sel[i] === '(') { let d = 0, j = i; for (; j < sel.length; j++) { if (sel[j] === '(') d++; else if (sel[j] === ')' && --d === 0) break; } arg = sel.slice(i + 1, j); i = j + 1; }
      if (name === 'where') continue;
      if (['not', 'is', 'has'].includes(name) && arg !== null) {
        const top = splitTop(arg).map(spec).sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2])[0] ?? [0, 0, 0];
        n[0] += top[0]; n[1] += top[1]; n[2] += top[2];
      } else n[1]++;
    } else if (/[a-zA-Z]/.test(ch)) { n[2]++; i = word(i); }
    else i++;
  }
  return n;
}

test('지역 표·판: 전남광주 공개(status·emd live, 일반구 없음, 공개 차례 16, 단순화 60m, 먼 섬 경도 125.7, 자치구 묶음), 판 units.json 은 원고와 같은 곳·과·넓은 화면 — 27곳 6과 · 넓은 화면 광주·북서쪽·남서쪽·동쪽', () => {
  assert.deepEqual(E16_KEYS, [KEY]);
  assert.deepEqual([SIDO.status, SIDO.emd, SIDO.gu, SIDO.layer, SIDO.enChecked, SIDO.hub, SIDO.openOrder, SIDO.gunFirst, SIDO.simplifySggM, SIDO.lineRequired, SIDO.far, SIDO.lonelyOk],
    ['live', 'live', 'off', 'sgg', true, null, 16, false, 60, true, { lonLt: 125.7 }, []]);
  // 영어 이름: 다른 시·도처럼 짧은 이름(정식 영문 'Jeonnam-Gwangju Special Metropolitan City' 는 docs/review/sido-en.md — 화면에는 쓰지 않음)
  assert.equal(SIDO.en, 'Jeonnam-Gwangju');
  // 지역 한 줄은 법적 구분(자치구·시·군 — 2026-11-15, 전에는 '광주 5개 구와 전남 22개 시·군'). 수가 판과 맞는지는 legal-names 시험이 센다
  assert.deepEqual(SIDO.desc, { ko: ['자치구 5개와 시 5개·군 17개', ''], en: ['5 districts, 5 cities and 17 counties', ''] });
  // 같은 이름 구분 묶음: E16 의 '광주'/'Gwangju' 는 법정 이름이 아니라 법정 약칭·지역 영어 이름으로(2026-11-15)
  assert.deepEqual(SIDO.parts, [{ ko: '광주특별시', en: 'Jeonnam-Gwangju', codes: ['12210', '12240', '12270', '12300', '12330'] }]);
  assert.deepEqual(UI_KO.regionDesc[KEY], ['자치구 5개와 시 5개·군 17개', '']);
  // 열여섯 시·도를 모두 열었다(E16 이 마지막 새 지역 — 공개 차례 1~16 빈틈 없음은 sido-table)
  assert.equal(read('src/data/sido.json').sidos.filter((s: { status: string }) => s.status !== 'live').length, 0);
  const r = reg.region(KEY)!;
  assert.deepEqual([r.layer, r.items.length, r.lessons.length, r.screens.length], ['sgg', 27, 6, 4]);
  // 지역 표 차례(코드 차례): 서울(11) 다음, 부산(26) 앞
  const ks = reg.regions.map((x) => x.key);
  assert.deepEqual([ks.indexOf(KEY), ks[ks.indexOf(KEY) - 1], ks[ks.indexOf(KEY) + 1]], [1, 'seoul', 'busan']);
  assert.deepEqual(r.lessons.map((l) => [l.no, l.title, l.en, l.items.map((id) => reg.place(id)!.item.ko)]),
    SRC.lessons.map((l: { no: number; title: string; en: string; items: string[] }) => [l.no, l.title, l.en, l.items]));
  // 과 이름(쉬운 말 — 대표 지명·바다·방위): 1과는 광주 5구(계획서 N3)
  assert.deepEqual(r.lessons.map((l) => [l.title, l.items.length]), [['광주', 5], ['광주 둘레', 5], ['서해 바닷가', 4], ['남서쪽 끝', 4], ['남쪽 바닷가', 4], ['순천 둘레', 5]]);
  for (const l of r.lessons) {
    assert.ok(l.minTapPx >= 16, `${l.no}과 ${l.minTapPx}px`);
    assert.ok(l.items.length >= 3 && l.items.length <= 6, `${l.no}과 ${l.items.length}곳`);
    assert.ok(l.title.length <= 12 && !/권역|도심/.test(l.title), l.title);
  }
  // 넓은 화면: '광주'(5구) + 전남 셋. 전남 22곳 한 화면은 남구 8px, 서쪽·동쪽 둘로는 목포시 14px(파이프라인 --dry-all 로 잼 — 검수 표 jeonnam-gwangju.md 2번) — 셋으로 나눠 19px
  assert.deepEqual(r.screens.map((s) => [s.key, s.ko, s.items.length]), [['gwangju', '광주', 5], ['nw', '북서쪽', 7], ['sw', '남서쪽', 6], ['east', '동쪽', 9]]);
  assert.deepEqual(r.screens[0].items, r.lessons[0].items, "넓은 화면 '광주' = 1과");
  for (const s of r.screens) assert.ok(s.minTapPx >= 16, `${s.ko} ${s.minTapPx}px`);
  assert.equal(new Set(r.screens.flatMap((s) => s.items)).size, 27, '27곳이 한 화면씩');
  for (const it of r.items) { assert.equal(it.slug, SRC.slugs[it.ko], it.ko); assert.match(it.slug, /^[a-z][a-z0-9-]{2,}$/); assert.match(it.id, /^kr:sgg:12\d{3}$/); }
  assert.equal(new Set(r.items.map((it) => it.slug)).size, 27);
  assert.deepEqual(['동구', '서구', '남구', '북구', '광산구'].map((k) => idOf(k, KEY)), ['12210', '12240', '12270', '12300', '12330'].map(sgg));
});

test('위치 한 줄(N27): 전남광주 27곳 — 원고 그대로, 30자 이하·금지 낱말 없음, 지도 근거만(명소 없음) · 신안·진도·완도는 \'바다로 둘러싸인 섬\'(진도·완도는 맞닿음 없음)', () => {
  let n = 0;
  for (const it of reg.region(KEY)!.items) {
    const e = LINES[it.ko];
    assert.ok(e, `${it.ko} 원고`);
    assert.equal(it.line, e.line, it.ko);
    assert.ok([...e.line].length <= 30, `${it.ko} ${e.line.length}자`);
    for (const w of HARD) assert.ok(!e.line.includes(w), `${it.ko} 금지 낱말 ${w}`);
    assert.equal(e.at, undefined, `${it.ko}: 명소(at)는 OSM 대조 허락 뒤에만`);
    assert.equal(e.manual, undefined, `${it.ko}: 근거 없는 말(manual) 없음`);
    assert.ok(['touch', 'dir', 'side', 'size', 'coast'].some((x) => x in e), `${it.ko} 근거`);
    assert.equal(UI_KO.line(reg, it.id), e.line);
    n++;
  }
  assert.equal(n, 27);
  for (const k of ['신안군', '진도군', '완도군']) assert.equal(LINES[k].coast, 'all', k);
  for (const k of ['진도군', '완도군']) assert.equal(LINES[k].touch, undefined, `${k}: 땅으로 맞닿은 곳이 없음`);
  // 다른 시·도와의 맞닿음은 시·도 이름
  assert.deepEqual(LINES['구례군'].touch, ['전북특별자치도', '경상남도']);
  assert.deepEqual(LINES['광양시'].touch, ['경상남도']);
  // 자치구 이름은 같은 지역 먼저 — 문장에도 지역 이름을 붙이지 않는다(서구 '광주특별시에서 가장 작은 구' — 2026-11-15 법정 약칭, 전에는 '전남광주에서')
  assert.equal(LINES['서구'].line, '광주특별시에서 가장 작은 구, 광산구와 맞닿은 곳');
  assert.equal(LINES['서구'].size, 'smallest');
  assert.equal(UI_EN.line(reg, idOf('목포시')), '', '위치 한 줄은 한국어만');
});

test('진도·완도(땅으로 맞닿은 시·군·구가 없는 섬, 계획서 N8): 다리로 이어진 바다 건너 이웃(pipeline/data/sea-links.json) — 판 neighbors.sea, 땅 이웃은 0 · 신안은 무안과 땅으로 맞닿음', () => {
  const sea = geo.neighbors.sea;
  const pairs = (id: string) => (sea[id] ?? []).map((x) => [reg.place(x.id)?.item.ko ?? x.id, x.via]).sort();
  assert.deepEqual(pairs(idOf('진도군')), [['해남군', '진도대교']]);
  assert.deepEqual(pairs(idOf('완도군')), [['강진군', '고금대교'], ['해남군', '남창교·완도대교']]);
  assert.deepEqual(pairs(idOf('해남군')), [['완도군', '남창교·완도대교'], ['진도군', '진도대교']]);
  assert.deepEqual(pairs(idOf('강진군')), [['완도군', '고금대교']]);
  for (const k of ['진도군', '완도군']) { assert.deepEqual(geo.neighbors.si[idOf(k)] ?? [], [], k); assert.deepEqual(geo.neighbors.sgg[idOf(k)] ?? [], [], k); }
  assert.deepEqual(geo.neighbors.sgg[idOf('신안군')], [idOf('무안군')], '신안군은 무안군과 땅으로 맞닿음(지도읍) — 다리 손 표가 필요 없음');
  const links = read('pipeline/data/sea-links.json').links.filter((l: { a: string }) => l.a.startsWith('kr:sgg:12'));
  assert.equal(links.length, 3);
  for (const l of links) assert.ok(l.via && l.ko, JSON.stringify(l));
});

test('60m 시험(계획서 N20 · E16): 전남광주 지역 경계 파일만 60m — gz 100KB 이하, 고리 점(칸 + 이웃 땅 + 강) 3만 이하 · manifest simplify_m.sggBy', () => {
  const live: { key: string; simplifySggM: number }[] = read('src/data/sido.json').sidos.filter((x: { status: string }) => x.status === 'live');
  assert.equal(live[0].key, 'seoul');
  assert.equal(MANIFEST.simplify_m.sgg, live[0].simplifySggM, '첫 공개 지역(서울) 값');
  assert.deepEqual(MANIFEST.simplify_m.sggBy, Object.fromEntries(live.filter((s) => s.simplifySggM !== MANIFEST.simplify_m.sgg).map((s) => [s.key, s.simplifySggM])));
  assert.deepEqual(MANIFEST.simplify_m.sggBy, { [KEY]: 60, gyeongbuk: 40, gyeongnam: 40 });
  assert.ok(gz9(`${KEY}-sgg.topo.json`) <= 100 * 1024, `gz ${gz9(`${KEY}-sgg.topo.json`)}B`);
  const t = topoOf(`${KEY}-sgg.topo.json`);
  const total = ringPts(t, 'sgg') + ringPts(t, 'out') + ringPts(t, 'water');
  // 20m 48,462 · 40m 36,556 · 50m 32,558 → 60m(검수 표 jeonnam-gwangju.md 6번 — E16 에서 잼)
  assert.ok(total <= 30000 && total > 25000, `고리 점 ${total}`);
});

test('먼 섬(N8 · E16): 지역 표 far lonLt 125.7 — 흑산면(흑산도·홍도·가거도 등)만 먼 섬 상자, 신안·진도의 가까운 섬(우이도 125.83~ 등)은 본 지도 · 앱 먼 섬 상자도 같은 경도', () => {
  const r = reg.region(KEY)!;
  // 파이프라인 범위(fit): 흑산면을 빼고 도초면 우이도(125.80 무렵)까지
  assert.ok(r.fit[0] > 125.7 && r.fit[0] < 125.85, `서쪽 끝 ${r.fit[0]}`);
  // 앱: 지역 표 far.lonLt 를 읽는다(전남광주 125.7). 다른 지역은 전과 같은 125.9(far 기본 규칙인 지역도)
  assert.equal(farLonOf(KEY), 125.7);
  assert.equal(specOf(r).farLon, 125.7);
  for (const k of ['seoul', 'incheon', 'gyeonggi', 'chungnam', 'gyeongbuk', 'jeonbuk', 'jeju']) assert.equal(farLonOf(k), FAR_LON, k);
  const t = topoOf(`${KEY}-sgg.topo.json`) as Topology;
  const S = buildShapes(t, specOf(r), geo.labels);
  assert.ok(S.far, '먼 섬 상자');
  assert.deepEqual([...new Set(S.far!.parts.map((p) => p.id))], [idOf('신안군')]);
  // 상자에 든 덩어리는 모두 흑산면 쪽(바깥 고리 평균 경도 125.5 서쪽)
  const sinan = topo.feature(t as never, (t as unknown as { objects: { sgg: { geometries: { properties: { sggId: string } }[] } } }).objects.sgg as never).features
    .find((f: { properties: { sggId: string } }) => f.properties.sggId === idOf('신안군'));
  const lons = polys(sinan.geometry).map((p) => p[0].reduce((s, c) => s + c[0], 0) / p[0].length);
  assert.ok(lons.filter((x) => x < 125.7).every((x) => x < 125.5), '125.5~125.7 사이 덩어리 없음');
  assert.ok(lons.some((x) => x >= 125.8 && x < 125.9), '우이도 무리(125.8~125.9)는 본 지도');
  // 125.9 였다면 진도 조도면·신안 비금·도초 섬까지 먼 섬 상자로 갔다(바꾼 까닭)
  const S9 = buildShapes(t, { ...specOf(r), farLon: 125.9 }, geo.labels);
  assert.deepEqual([...new Set(S9.far!.parts.map((p) => reg.place(p.id)!.item.ko))].sort(), ['신안군', '진도군']);
  // 동 단원: 흑산면은 신안 2과 섬 상자(섬 과)에, 가거도 점검 좌표(흑산면 가장 남쪽 덩어리)는 판 manifest 점검에 든다
  const sn = unitFile('12870');
  const hs = sn.items.find((it) => it.ko === '흑산면')!.id;
  assert.ok(sn.lessons.some((l) => l.insets?.includes(hs)));
  assert.ok(read('pipeline/data/probes.json').probes.some((p: { name: string; rule?: { emd: string; pick: string } }) => p.name === '가거도' && p.rule?.emd === '흑산면' && p.rule.pick === 'south'));
});

test('같은 이름(N3 · N12): 전남광주 동구·서구·남구·북구는 지역이 섞이는 화면에서 \'광주특별시 동구\'(법정 약칭 — 2026-11-15, E16 의 \'광주 동구\'는 법정 이름이 아님), 광산구는 이름만 · 부산·대구·대전·울산 동구는 전처럼', async () => {
  assert.equal(partOf(KEY, '12210')?.ko, '광주특별시');
  assert.equal(partOf(KEY, sgg('12330'))?.ko, '광주특별시');
  assert.equal(partOf(KEY, sgg('12110')), undefined, '목포시는 묶음 밖');
  assert.equal(partOf('busan', sgg('26170')), undefined);
  for (const [c, want] of [['12210', '광주특별시 동구'], ['12240', '광주특별시 서구'], ['12270', '광주특별시 남구'], ['12300', '광주특별시 북구'], ['26170', '부산 동구'], ['27140', '대구 동구'], ['30110', '대전 동구'], ['31170', '울산 동구']] as const) {
    assert.equal(UI_KO.fullName(reg, sgg(c)), want, c);
  }
  assert.equal(UI_KO.fullName(reg, sgg('12330')), '광산구', '전국에 하나뿐인 이름은 그대로');
  assert.equal(UI_KO.fullPre(reg, sgg('12210')), '광주특별시', '오늘 복습 문제의 이름 위 작은 글');
  assert.equal(UI_KO.prompt(reg, 'find', sgg('12210'), (s) => s), '동구를 찾아 누르세요', '한 지역 화면은 이름만');
  // 섞인 오늘 복습(홈 카드 곳 줄)
  const m: Mastery = Object.fromEntries(['12210', '26170', '27140', '12330'].map((c) => [sgg(c), rec(1, T)]));
  assert.match(sp(homePage(ctxOf(reg, { mastery: m, last: KEY })).html), /<p class="h-places">광주특별시 동구 · 광산구 · 부산 동구 · 대구 동구<\/p>/);
  // 동 단원: 단원 이름·동 이름
  const r = createRegistry(geo);
  await registerUnits(r, [`${KEY}/dong-gu`, 'busan/dong-gu', `${KEY}/gwangsan-gu`], async (code) => unitFile(code), () => {});
  assert.deepEqual([r.mixName(`${KEY}/dong-gu`), r.mixName('busan/dong-gu'), r.mixName(`${KEY}/gwangsan-gu`)], ['광주특별시 동구', '부산 동구', '광산구']);
  const d = r.region(`${KEY}/dong-gu`)!.items[0];
  assert.equal(UI_KO.fullName(r, d.id), `광주특별시 동구 ${d.ko}`);
  // 영어(11-15 전남광주를 켬 — 영어 앱이 받는 판): 법정 영문이 없어 지역 영어 이름과 맞춘 'Dong-gu, Jeonnam-Gwangju'(전에는 'Dong-gu, Gwangju')
  const en = createRegistry(geoEn, EN_ON);
  assert.deepEqual([UI_EN.fullName(en, sgg('12210')), UI_EN.fullPre(en, sgg('12210')), UI_EN.fullName(en, sgg('26170'))], ['Dong-gu, Jeonnam-Gwangju', 'Jeonnam-Gwangju', 'Dong-gu, Busan']);
  // 동 단원 이름(섞인 화면 — EN_EMD 5.2 unitName): 한국어 '광주특별시 동구'·'부산 동구'·'광산구'와 같은 규칙
  assert.deepEqual([UI_EN.unitName(en, `${KEY}/dong-gu`), UI_EN.unitName(en, 'busan/dong-gu'), UI_EN.unitName(en, `${KEY}/gwangsan-gu`)], ['Dong-gu, Jeonnam-Gwangju', 'Dong-gu, Busan', 'Gwangsan-gu']);
});

test('홈·지역 쪽·지역 고르기: 전남광주 탭 \'27개 시·군·구\', 1과 광주, 여섯 과, 동까지 공부하기 · 지역 고르기 16곳 모두 열림(준비 중 없음) · 영어 앱에도 전남광주(11-15 — 숨김 규칙은 가짜 지역 표로)', () => {
  const h = sp(homePage(ctxOf(reg, { last: KEY })).html);
  assert.deepEqual([tabKeys(h), pressed(h)], [['seoul', 'incheon', KEY], KEY]);
  assert.match(h, /data-arg="jeonnam-gwangju" aria-pressed="true">광주특별시 <span class="u">27개 시·군·구<\/span>/);
  assert.match(h, /<h1 class="h-title">광주<br><span class="h-hl hl">5개 구<\/span>를 채워요<\/h1>/);
  assert.match(h, /<p class="h-places">서구 · 동구 · 남구 · 북구 · 광산구<\/p>/);
  assert.match(h, /<h2 id="h-path">광주특별시 여섯 과<\/h2>/);
  assert.match(h, /<ol class="h-lcs g6">/);
  assert.match(h, /href="#\/kr\/jeonnam-gwangju\/emd"><span>동까지 공부하기<\/span>/);
  assert.doesNotMatch(h, BAD);
  const u = sp(unitPage(ctxOf(reg), KEY).html);
  assert.match(u, /<h1 class="h-title">광주특별시 27개 시·군·구<\/h1>/);
  assert.match(u, /자치구 5개와 시 5개·군 17개/);
  assert.doesNotMatch(u, BAD);
  const p = sp(regionsPage(ctxOf(reg)).html);
  // 모두 열려 '16곳 중 16곳 열림' 대신 '전국 시·도 16곳'(E17 — 여는 동안의 말을 남기지 않음). 전남광주를 뺀 판은 전처럼 '16곳 중 15곳 열림'
  assert.match(p, /전국 시·도 16곳/);
  assert.doesNotMatch(p, /곳 열림/);
  assert.match(sp(regionsPage(ctxOf(createRegistry(geoNoE16))).html), /시·도 16곳 중 15곳 열림/);
  assert.match(p, /<span class="nm">광주특별시<\/span><span class="no">27개 시·군·구 · 6과<\/span>\s*<span class="pl">자치구 5개와 시 5개·군 17개<\/span>/);
  assert.doesNotMatch(p, /<p class="rg-soon/, '준비 중 줄 없음(다 열림)');
  // 흐린 지역이 없으니 지도 범례의 '준비 중' 견본과 안내 뒷말('흐리게 보여요')도 없다(E16 검수). 전남광주를 뺀 판(15곳 열림)은 전처럼 있다
  assert.doesNotMatch(p, /준비 중|흐리게/);
  assert.match(p, /<p class="h-desc">지도나 목록에서 지역을 고르세요<\/p>/);
  const p0 = sp(regionsPage(ctxOf(createRegistry(geoNoE16))).html);
  assert.match(p0, /<p class="h-desc">지도나 목록에서 지역을 고르세요\. 아직 열지 않은 지역은 흐리게 보여요<\/p>/);
  const legend = (h: string) => /<div class="h-lg"[^>]*>([\s\S]*?)<\/div>/.exec(h)?.[1] ?? '';
  assert.deepEqual([(legend(p).match(/class="lg"/g) ?? []).length, (legend(p0).match(/class="lg"/g) ?? []).length], [3, 4], '범례 칸 수');
  assert.deepEqual([legend(p).includes('준비 중'), legend(p0).includes('준비 중')], [false, true], '범례 준비 중 견본');
  assert.doesNotMatch(p, BAD);
  assert.equal(pickPage(ctxOf(reg), KEY).maps!.pick.labels!.length, 27);
  setLang('en');
  try {
    // 영어 앱이 받는 판(main.ts — 지역 표 enChecked 로 거름). 2026-11-15 사용자 지시로 전남광주 영문을 켜(짧은 이름 'Jeonnam-Gwangju') 영어 앱에도 실린다.
    // 아래 en 은 관문이 닫힌 영어 앱(동·일반구·시·도 단원을 끈 창 — 2026-11-16 전 영어 앱): 세종·제주가 흐린 칸. 관문이 열린 영어 앱(on)은 뒤에서 본다
    const en = createRegistry(geoEn, EN_OFF);
    assert.ok(en.region(KEY), '영어 앱에 전남광주');
    const epg = regionsPage(ctxOf(en));
    const ep = sp(epg.html);
    // 캡션 분모는 지도 칸 수 16(E17 검수). 열린 칸 14 + 흐린 칸 2(과 없는 세종·제주 — 'Coming soon') = 16
    assert.match(ep, /14 of 16 regions open/);
    assert.doesNotMatch(ep, /of 15 regions/);
    assert.equal(epg.maps!.kr.active!.length, 14, '영어 지도 열린 칸');
    assert.ok(epg.maps!.kr.active!.includes('kr:sido:12'), '영어 지도에 전남광주 칸 열림');
    assert.equal(SIDOS.length - epg.maps!.kr.active!.length, 2, '영어 지도 흐린 칸(지역 표 16칸 − 열린 14)');
    assert.ok(epg.maps!.kr.labels!.some((l) => l.id === 'kr:sido:12' && l.text === 'Jeonnam-Gwangju'), '영어 지도 이름표');
    // 호남 묶음: 전북·전남광주 두 칸(영어 이름·곳 수·과 수·지역 한 줄)
    assert.match(ep, /<h2 id="rg-g\d+">Honam<\/h2><span class="h-lhelp">2 regions<\/span>/);
    assert.match(ep, /<span class="nm">Jeonnam-Gwangju<\/span><span class="no">27 cities, counties and districts · 6 lessons<\/span>\s*<span class="pl">5 districts, 5 cities and 17 counties<\/span>/);
    // 흐린 지역은 세종(충청 묶음의 흐린 줄)·제주(혼자인 권역 — 머리 이름 + 'Coming soon') 둘뿐
    assert.match(ep, /<p class="rg-soon"><span>Sejong<\/span><em>Coming soon<\/em><\/p>/);
    assert.match(ep, /<h2 id="rg-g\d+">Jeju<\/h2><span class="h-lhelp">Coming soon<\/span>/);
    assert.match(ep, /Regions not open yet are grayed out/, '영어는 과 없는 세종·제주가 아직 흐려 안내 그대로');
    assert.doesNotMatch(ep, BAD);
    assert.equal(UI_EN.ctxName({ sido: '12', text: '전남광주통합특별시' }), 'Jeonnam-Gwangju', '영어 지도 맥락 이름(이웃 땅)');
    // 관문이 열린 영어 앱(EN_EMD — D23 닫힘): 세종·제주도 열려 16칸 모두 열림 — 'Coming soon'·흐린 칸 안내가 없고 캡션은 수만(한국어 '전국 시·도 16곳'과 같게)
    const on = createRegistry(geoEn, EN_ON);
    const opg = regionsPage(ctxOf(on));
    const op = sp(opg.html);
    assert.match(op, /All 16 provinces and cities/);
    assert.doesNotMatch(op, /Coming soon|regions open|grayed out/);
    assert.equal(opg.maps!.kr.active!.length, 16, '영어 지도 열린 칸 16');
    assert.match(op, /<p class="h-desc">Pick a region on the map or in the list<\/p>/);
    assert.match(op, /href="#\/kr\/sejong"/);
    assert.match(op, /href="#\/kr\/jeju"/);
    assert.doesNotMatch(op, /[가-힣]/, '영어 지역 고르기에 한글 없음');
    assert.doesNotMatch(op, BAD);
    // 영어 홈의 '동까지' 링크(D20 'Down to neighborhoods · Coming soon' 이 사라짐)
    const oh = sp(homePage(ctxOf(on, { last: KEY })).html);
    assert.match(oh, /href="#\/kr\/jeonnam-gwangju\/emd"><span>Down to neighborhoods<\/span>/);
    assert.doesNotMatch(oh, /Coming soon/);
    assert.doesNotMatch(oh, /[가-힣]/, '영어 홈에 한글 없음');
    // 영어 홈(전남광주를 고른 사람): 한글 곳 이름·undefined 없이 그린다
    const eh = sp(homePage(ctxOf(en, { last: KEY })).html);
    assert.match(eh, /data-arg="jeonnam-gwangju" aria-pressed="true">Jeonnam-Gwangju <span class="u">27 cities, counties and districts<\/span>/);
    assert.match(eh, /Seo-gu · Dong-gu · Nam-gu · Buk-gu · Gwangsan-gu/);
    assert.doesNotMatch(eh, /[가-힣]{2,}[시군구]/);
    assert.doesNotMatch(eh, BAD);
    assert.deepEqual(en.region(KEY)!.lessons.map((l) => l.en), ['Gwangju', 'Around Gwangju', 'West coast', 'Southwest tip', 'South coast', 'Around Suncheon']);
    // 영어 곳 이름 27곳(slug 를 대문자로 시작한 꼴 — 계획서 N26): 검수 표 jeonnam-gwangju.md '영문 이름' 표와 같다(광주 5구 + 전남 5시 17군)
    const EN_27 = ['Dong-gu', 'Seo-gu', 'Nam-gu', 'Buk-gu', 'Gwangsan-gu', 'Mokpo-si', 'Yeosu-si', 'Suncheon-si', 'Naju-si', 'Gwangyang-si', 'Damyang-gun', 'Gokseong-gun',
      'Gurye-gun', 'Goheung-gun', 'Boseong-gun', 'Hwasun-gun', 'Jangheung-gun', 'Gangjin-gun', 'Haenam-gun', 'Yeongam-gun', 'Muan-gun', 'Hampyeong-gun', 'Yeonggwang-gun',
      'Jangseong-gun', 'Wando-gun', 'Jindo-gun', 'Sinan-gun'];
    assert.deepEqual(en.region(KEY)!.items.map((it) => UI_EN.name(it)).sort(), [...EN_27].sort());
    // '영어 이름을 확인하지 않은 지역은 숨김' 규칙(Q5 · N26)은 남아 있다 — 운영 지역 표에는 이제 그런 행이 없어 가짜 지역 표(전남광주 enChecked false)로 본다:
    // 영어 앱에 없고 이름·지도 맥락 이름도 없지만, 지도에는 흐린 칸으로 있어 분모는 16(E17 검수 — '13 of 15'는 시·도가 15곳인 것처럼 읽혔다)
    withEnHidden(KEY, () => {
      const hid = createRegistry(geoEnNow(), EN_OFF);
      assert.equal(hid.region(KEY), undefined);
      const hpg = regionsPage(ctxOf(hid));
      const hp = sp(hpg.html);
      assert.match(hp, /13 of 16 regions open/);
      assert.doesNotMatch(hp, /of 15 regions/);
      assert.equal(SIDOS.length - hpg.maps!.kr.active!.length, 3, '흐린 칸(세종·제주 + 이름 없는 전남광주)');
      assert.doesNotMatch(hp, /jeonnam|Jeonnam/);
      assert.doesNotMatch(sp(homePage(ctxOf(hid)).html), /jeonnam|Jeonnam/);
      assert.equal(UI_EN.ctxName({ sido: '12', text: '전남광주통합특별시' }), '', '영어 지도 맥락 이름도 숨김');
    });
    assert.equal(UI_EN.ctxName({ sido: '12', text: '전남광주통합특별시' }), 'Jeonnam-Gwangju', '가짜 지역 표를 되돌림');
  } finally { setLang('ko'); }
});

test('주소·GA·고르기 보기: 전남광주 주소와 동 단원 주소, GA region·unit_id, 고르기 보기는 전남광주 안에서만', async () => {
  const k = knownOf(reg);
  assert.deepEqual(parseRoute('#/kr/jeonnam-gwangju', '', k).route, { name: 'unit', region: KEY });
  assert.deepEqual(parseRoute('#/kr/jeonnam-gwangju/sgg/p6', '', k).route, { name: 'lesson', region: KEY, no: 6 });
  assert.equal(parseRoute('#/kr/jeonnam-gwangju/sgg/p7', '', k).route.name, 'home');
  assert.deepEqual(parseRoute('#/kr/jeonnam-gwangju/sgg/@sinan-gun', '', k).route, { name: 'place', region: KEY, slug: 'sinan-gun' });
  assert.deepEqual(parseRoute('#/kr/jeonnam-gwangju/emd/sinan-gun/p2', '', k).route, { name: 'lesson', region: `${KEY}/sinan-gun`, no: 2 });
  assert.deepEqual(gaUnit(reg, KEY), { unit: 'sgg', region: KEY });
  const r = createRegistry(geo);
  assert.deepEqual(await registerUnits(r, [`${KEY}/sinan-gun`, `${KEY}/dong-gu`], async (code) => unitFile(code), () => {}), []);
  assert.deepEqual(gaArgs(r, `${KEY}/sinan-gun`), { unit: 'emd', region: KEY, unit_id: '12870' });
  assert.deepEqual(gaArgs(r, `${KEY}/dong-gu`), { unit: 'emd', region: KEY, unit_id: '12210' });
  const R = reg.region(KEY)!;
  for (let seed = 1; seed <= 12; seed++) for (const l of R.lessons) for (const q of lessonQuestions(reg, KEY, l.no, () => 0, rngFrom(seed))) {
    for (const o of q.options ?? []) assert.equal(reg.place(o)!.region.key, KEY);
    if (q.mode === 'choose') assert.equal(q.options!.length, 4);
  }
});

test('동 단원(전남광주 27단원 393동): 색인 = 판 폴더 파일 · 1곳 과 0 · 2곳 과 둘(완도 1과·광양 3과) · 16px · 단원 파일 gz 40KB 이하(신안은 맞닿은 시·군·구로 줄임) · 섬 과(신안·완도·여수·고흥)', () => {
  const idx = geo.units.emdUnits![KEY];
  assert.deepEqual([idx.length, idx.reduce((t, u) => t + u.n, 0)], [27, 393]);
  const two: string[] = [];
  for (const u of idx) {
    const j = unitFile(u.code);
    assert.equal(j.key, `${KEY}/${u.slug}`);
    assert.deepEqual(j.items.map((it) => it.slug), u.ids);
    for (const l of j.lessons) {
      assert.ok(l.items.length >= 2, `${j.ko} ${l.no}과 ${l.items.length}곳`);
      if (l.items.length === 2) two.push(`${j.ko} ${l.no}과`);
      assert.ok(l.minTapPx >= 16, `${j.ko} ${l.no}과 ${l.minTapPx}px`);
    }
    for (const s of j.screens) assert.ok(s.minTapPx >= 16, `${j.ko} ${s.ko} ${s.minTapPx}px`);
    assert.ok(gz9(`emd/${u.code}.topo.json`) <= 40 * 1024, `${j.ko} ${gz9(`emd/${u.code}.topo.json`)}B`);
  }
  assert.deepEqual(two.sort(), ['광양시 3과', '완도군 1과']);
  const nm = (j: EmdUnitFile) => (id: string) => j.items.find((it) => it.id === id)!.ko;
  // 신안군: 14곳이 모두 섬(단원 안 맞닿은 동 없음) — 두 섬 과, 섬마다 상자. 이웃 땅은 맞닿은 시·군·구(무안)로 줄여 40KB 안(계획서 2.2 의 62.8KB 는 상자 15% 범위)
  const sn = unitFile('12870');
  assert.deepEqual(sn.lessons.map((l) => [l.title, l.items.length, l.insets?.length]), [['북동쪽 섬', 7, 7], ['남서쪽 섬', 7, 7]]);
  assert.ok(gz9('emd/12870.topo.json') < 34 * 1024);
  const snOut = topoOf('emd/12870.topo.json').objects.out.geometries.map((g: { properties: { name: string } }) => g.properties.name);
  assert.deepEqual(snOut, ['무안군'], '맞닿은 시·군·구만');
  // 완도·여수·고흥 섬 과
  const wd = unitFile('12850'), ys = unitFile('12130'), gh = unitFile('12740');
  assert.deepEqual(wd.lessons.map((l) => l.title), ['가운데', '북동쪽 섬', '남서쪽 섬']);
  assert.deepEqual(wd.lessons[2].insets!.map(nm(wd)).sort(), ['금당면', '청산면']);
  assert.equal(ys.lessons.find((l) => l.title === '섬')!.items.map(nm(ys)).sort().join(','), '남면,돌산읍,묘도동,삼산면,화정면');
  assert.deepEqual(ys.lessons.find((l) => l.title === '섬')!.insets!.map(nm(ys)), ['삼산면']);
  assert.deepEqual(gh.lessons.find((l) => l.title === '섬')!.items.map(nm(gh)).sort(), ['금산면', '동일면', '봉래면']);
  // 진도군: 조도면(섬)은 진도 본섬과 한 과(가까운 섬 — 본 지도에 보임), 단원 밖 맞닿은 곳 없음(다리 이웃은 만나기 근거로 쓰지 않음)
  const jd = unitFile('12860');
  assert.deepEqual(jd.lessons.map((l) => [l.title, l.items.length]), [['전체', 7]]);
  assert.deepEqual(jd.outside, {});
  // 지역 경계 파일(N20): gz 100KB 이하(60m)
  assert.ok(gz9(`${KEY}-sgg.topo.json`) <= 100 * 1024);
});

test('과 카드 줄(E16 고침): 4과는 600~1099 에서 2 + 2, 1100 이상 한 줄 4칸 — 다른 과 수(1·2·3·5·6·7)의 규칙은 그대로, 권역 칸 넷(.rg.g4)도 같은 규칙', () => {
  // 줄끝은 LF 로 맞춘다(윈도에서 core.autocrlf 로 받으면 CRLF — 아래 찾는 글이 '\n' 을 쓴다)
  const css = fs.readFileSync(path.join(root, 'src/app/ui/app.css'), 'utf8').replace(/\r\n/g, '\n');
  const block = (q: string) => { const i = css.indexOf(q); assert.ok(i >= 0, q); let d = 0, j = css.indexOf('{', i); const s = j; for (; j < css.length; j++) { if (css[j] === '{') d++; else if (css[j] === '}' && --d === 0) break; } return css.slice(s, j); };
  const mid = block('@media (min-width: 600px) {\n  .h-head {');
  assert.match(mid, /\.h-lcs \{ --cols: 3;/);
  assert.match(mid, /\.h-lcs\.g7 \{ --cols: 4; \}/);
  assert.match(mid, /\.h-lcs\.g4 \{ --cols: 2; \}/);
  assert.match(mid, /\.h-lcs:not\(\.g7\) \.h-lc:nth-child\(3n\+1\)/, '3칸 줄 규칙은 E15 그대로');
  assert.match(mid, /\.h-lcs\.g4 \.h-lc:nth-child\(n\+3\) \{ border-top/);
  const wide = block('@media (min-width: 1100px) {\n  .h-main {');
  assert.match(wide, /\.h-lcs\.g5 \{ --cols: 5; \}/);
  assert.match(wide, /\.h-lcs\.g4 \{ --cols: 4; \}/);
  assert.doesNotMatch(css, /\.h-lcs\.rg\.g4/, '권역 칸 넷의 따로 규칙은 .h-lcs.g4 로 합침');
  // 특이도(E16 검수): 600 이상 카드 줄 규칙(3칸·4칸·2칸 줄의 선·여백)이 1100 이상의 한 줄 규칙(g5·g4)보다 특이도가 높으면 순서와 상관없이 이겨
  // 넓은 화면의 5과 한 줄이 깨진다(:not(.g7):not(.g4) 0,5,0 이 g5 0,4,0 을 이겼다). 1100 이상 규칙은 뒤에 있으니 같거나 높아야 한다
  const rulesOf = (b: string) => [...b.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap((x) => splitTop(x[1].trim())).filter((s) => /\.h-lcs/.test(s) && /\.h-lc\b/.test(s));
  const midSel = rulesOf(mid), wideSel = rulesOf(wide).filter((s) => /\.h-lcs\.g[45] /.test(s));
  assert.ok(midSel.length >= 9 && wideSel.length === 6, `${midSel.length} ${wideSel.length}`);
  const cmp = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  const hiMid = midSel.map(spec).sort(cmp).at(-1)!, loWide = wideSel.map(spec).sort(cmp)[0];
  assert.ok(cmp(loWide, hiMid) >= 0, `600 이상 최고 ${hiMid} > 1100 이상 최저 ${loWide}: ${midSel.filter((s) => cmp(spec(s), loWide) > 0).join(' | ')}`);
  assert.deepEqual([spec('.h-lcs:not(.g7):not(.g4) .h-lc:nth-child(3n+1)'), spec('.h-lcs.g5 .h-lc:nth-child(n)'), spec('.h-lcs:where(.a) .h-lc')], [[0, 5, 0], [0, 4, 0], [0, 2, 0]], '특이도 계산');
  // 4과 지역(충남·전북·경남)의 홈·지역 쪽은 g4 를 쓴다
  for (const k of ['chungnam', 'jeonbuk', 'gyeongnam']) {
    assert.equal(reg.region(k)!.lessons.length, 4, k);
    assert.match(homePage(ctxOf(reg, { last: k })).html, /<ol class="h-lcs g4">/, k);
    assert.match(unitPage(ctxOf(reg), k).html, /<ol class="h-lcs g4">/, k);
  }
});

test('부팅 데이터(계획서 7절 \'지금 6.4KB + 25KB 이하\' = 31,400B): 판 units·labels·neighbors 의 gzip(9) 합이 예산 안', () => {
  const total = ['units.json', 'labels.json', 'neighbors.json'].reduce((t, n) => t + gz9(n), 0);
  // E14·E15 합친 판 27,533B → E16 30,277B(검수 표 jeonnam-gwangju.md). 넘으면 위치 한 줄을 지역 단위 파일로 옮기는 안(다음 단계)
  assert.ok(total <= 31400, `부팅 gzip9 ${total}B`);
});

// 지역 수 글: 전남광주를 뺀 값과 견준다. 열여섯을 모두 열면 정적 쪽 설명은 '전국 16개 시·도'(regions.ts). 영어는 E16 에 전남광주를 세지 않았고(enChecked false),
// 2026-11-15 사용자 지시로 영문을 켜 하나 늘었다('… and 11 more regions' · '14 of 16 regions open'). 2026-11-16 영어 동 공부(EN_EMD)로 세종·제주도 세어
// 모두 열려 'all 16 provinces and cities of Korea'(빼면 '… and 12 more regions'). 영문을 끈 가짜 지역 표에서는 전처럼 그대로다
test('지역 수 글(정적 쪽 설명·홈 \'+n\'·지역 고르기 \'n곳 열림\', 한·영): 전남광주를 뺀 판보다 한국어·영어 모두 하나 는다(설명은 \'전국 16개 시·도\' · \'all 16 provinces and cities of Korea\') — 영문을 끈 지역 표면 영어는 그대로', () => {
  const num = (s: string, re: RegExp) => Number(re.exec(s)?.[1]);
  const noJg = LIVE.filter((s) => s.key !== KEY);
  assert.equal(noJg.length, LIVE.length - 1);
  assert.deepEqual([scopeKo(), scopeKo(noJg)], ['전국 16개 시·도', '서울·인천·경기 등 15개 시·도']);
  assert.deepEqual([studyKo(true), studyKo(true, noJg)], ['전국 16개 시·도와 시·군·구', '서울·인천·경기 등 15개 시·도의 시·군·구와 전국 16개 시·도']);
  assert.deepEqual([scopeEn(), scopeEn(noJg)], ['all 16 provinces and cities of Korea', 'Seoul, Incheon, Gyeonggi and 12 more regions']);
  assert.equal(scopeEn(LIVE.map((s) => (s.key === KEY ? { ...s, enChecked: false } : s))), scopeEn(noJg), '영문을 끈 지역 표: 영어는 전남광주를 세지 않음');
  const plus = /<a class="h-tab go" href="#\/kr">[^<]* <span class="u" aria-hidden="true">\+(\d+)<\/span>/;
  const r0 = createRegistry(geoNoE16);
  assert.equal(num(homePage(ctxOf(reg)).html, plus) - num(homePage(ctxOf(r0)).html, plus), 1, '홈 다른 지역 +n');
  // 열린 수: '시·도 16곳 중 n곳 열림', 모두 열면 '전국 시·도 16곳'(E17)
  const open = (s: string) => (/전국 시·도 16곳/.test(s) ? 16 : num(s, /시·도 16곳 중 (\d+)곳 열림/));
  assert.equal(open(sp(regionsPage(ctxOf(reg)).html)) - open(sp(regionsPage(ctxOf(r0)).html)), 1, '지역 고르기 열림');
  setLang('en');
  try {
    // 관문이 닫힌 영어 앱(2026-11-16 전 — 세종·제주 없음)
    const en = createRegistry(geoEn, EN_OFF), en0 = createRegistry(geoNoE16, EN_OFF);
    const enOpen = (r: Registry) => { const s = sp(regionsPage(ctxOf(r)).html); return /All 16 provinces and cities/.test(s) ? 16 : num(s, /(\d+) of 16 regions open/); };
    assert.equal(num(homePage(ctxOf(en)).html, plus) - num(homePage(ctxOf(en0)).html, plus), 1, '영어 홈 More +n');
    assert.deepEqual([enOpen(en), enOpen(en0)], [14, 13], '영어 지역 고르기 열림');
    // 관문이 열린 영어 앱(EN_EMD): 한국어와 같은 수
    const on = createRegistry(geoEn, EN_ON), on0 = createRegistry(geoNoE16, EN_ON);
    assert.equal(num(homePage(ctxOf(on)).html, plus) - num(homePage(ctxOf(on0)).html, plus), 1, '영어 홈 More +n(관문 열림)');
    assert.deepEqual([enOpen(on), enOpen(on0)], [16, 15], '영어 지역 고르기 열림(관문 열림)');
    // 영문을 끈 가짜 지역 표(숨김 규칙): 영어 앱은 전남광주를 싣지 않아 전남광주를 뺀 판과 같은 수
    withEnHidden(KEY, () => {
      const hid = createRegistry(geoEnNow(), EN_OFF);
      assert.equal(num(homePage(ctxOf(hid)).html, plus), num(homePage(ctxOf(en0)).html, plus), '숨김: 영어 홈 More +n 그대로');
      assert.equal(enOpen(hid), enOpen(en0), '숨김: 영어 지역 고르기 그대로');
    });
  } finally { setLang('ko'); }
});

test('운영 형식 저장값(지금 사용자 기록 모양 — 서울·인천·경기·부산·강원 기록만): 이어 하기·홈 카드·오늘 복습·내일 수가 전남광주만 뺀 판(E14·E15 합친 판)과 같다 — 다른 것은 다 채움의 남은 지역뿐(공통 조건 3)', () => {
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
  const r0 = createRegistry(geoNoE16);
  assert.equal(r0.region(KEY), undefined);
  assert.equal(r0.regions.length, reg.regions.length - 1);
  assert.ok(r0.region('gyeongnam') && r0.region('chungnam') && r0.region('gyeongbuk'), '전남광주만 뺀 판 = E14·E15 합친 판');
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
      // 다 채움 카드의 '남은 지역'에만 전남광주가 든다(공개 차례 16 — 맨 끝). 앞 차례는 그대로
      assert.deepEqual([a.region, a.more.filter((k) => !E16_KEYS.includes(k))], [b.region, b.more]);
      assert.deepEqual(a.more.filter((k) => E16_KEYS.includes(k)), [KEY]);
      assert.equal(a.more[a.more.length - 1], KEY);
    } else assert.deepEqual(a, b, `${a.type} ${lst} ${n}`);
    types.push(a.type);
    assert.deepEqual(todayReview(reg, mm, T, n), todayReview(r0, mm, T, n));
    assert.equal(tomorrowCount(reg, mm, T), tomorrowCount(r0, mm, T));
  }
  assert.deepEqual([...new Set(types)].sort(), ['done', 'new', 'next', 'resume', 'review']);
  // 홈 화면 글: 전남광주를 고른 적 없는 사람은 탭·과 카드가 같다(다른 것은 '다른 지역 +n' 수 하나)
  const h = (r: Registry) => homePage(ctxOf(r, { mastery, last })).html.replace(/\+\d+<\/span><span class="visually-hidden">\(\d+곳 더\)/, '');
  assert.equal(h(reg), h(r0));
  // 운영 판에서 전남광주를 뺀 판의 지역 키는 그 앞 판(E14·E15 합친 판)과 같다
  assert.deepEqual(r0.regions.map((r) => r.key), reg.regions.map((r) => r.key).filter((k) => k !== KEY));
  assert.equal(sidoOf(KEY)!.openOrder, Math.max(...reg.regions.map((r) => sidoOf(r.key)?.openOrder ?? 0)));
});

test('홈 먼저 할 일 + 탭 지역 다 채움(E16 검수): 서울을 다 채우고 부산 복습만 있는 날 서울 탭의 다 채움 단추도 공개 차례(인천·경기 …, 전남광주 맨 끝) — 복습 없는 날(core/next.ts)과 같다', () => {
  const RGx = (key: string) => geo.units.regions.find((r) => r.key === key)!;
  const m: Mastery = {};
  RGx('seoul').items.forEach((it) => { m[it.id] = rec(3, T + 4); });
  RGx('busan').lessons[0].items.forEach((id) => { m[id] = rec(1, T); });
  // 다 채움 단추(지역 탭 단추 h-tab 은 빼고)
  const btns = (h: string) => [...h.matchAll(/class="btn2? h-go2?" type="button" data-act="homeRegion" data-arg="([a-z-]+)"/g)].map((x) => x[1]);
  for (const r of [reg, createRegistry(geoNoE16)]) {
    assert.equal(homeCard({ reg: r, mastery: m, deck: null, daily: null, last: 'seoul', today: T }).type, 'review', '주 카드는 부산 복습');
    const h = sp(homePage(ctxOf(r, { mastery: m, last: 'seoul', homeRegion: 'seoul' })).html);
    assert.equal(pressed(h), 'seoul');
    assert.match(h, /class="h-pend"/, '먼저 할 일 줄(부산 복습)');
    assert.deepEqual(btns(h), ['incheon', 'gyeonggi']);
    assert.doesNotMatch(h, BAD);
  }
  // 같은 사람이 복습 없는 날(부산 기록 없음): 주 카드가 다 채움 — 남은 지역 앞 둘이 같고 전남광주는 맨 끝
  const m2: Mastery = Object.fromEntries(Object.entries(m).filter(([id]) => !id.startsWith('kr:sgg:26')));
  const d = homeCard({ reg, mastery: m2, deck: null, daily: null, last: 'seoul', today: T });
  assert.ok(d.type === 'done');
  assert.deepEqual([d.more.slice(0, 2), d.more.at(-1)], [['incheon', 'gyeonggi'], KEY]);
  assert.deepEqual(btns(sp(homePage(ctxOf(reg, { mastery: m2, last: 'seoul' })).html)), ['incheon', 'gyeonggi']);
});
