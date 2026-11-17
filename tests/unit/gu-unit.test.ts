// 일반구 단원(계획서 NATIONWIDE_PLAN E7 · N5 · N30 · N34): 경기 일반구 24곳을 한 단원('gyeonggi/gu', 층 sgg)으로.
//  ① 판 폴더 units.json guUnits 가 지역 표(gu live)와 맞고 규격을 지킨다(과 = 시, 2곳짜리 시는 이웃 시와 합침, 16px, 위치 한 줄)
//  ② 앱이 부팅 때 등록하고(영어 앱은 안 함), 주소·GA·홈 카드·복습·지도(나머지 칸은 맥락 땅)·쪽이 일반구 단원을 다룬다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_VER } from '../../src/consts.ts';
import { createRegistry, unitOptions, type Registry } from '../../src/app/registry.ts';
import { gaUnit, lessonCompleteParams, onMissingUnit, studyKeys, unitsToLoad } from '../../src/app/core/units.ts';
import { createDeck } from '../../src/app/core/deck.ts';
import { usableDeck } from '../../src/app/core/session.ts';
import { DAILY_CAP, homeCard, todayReview, type HomeInput } from '../../src/app/core/next.ts';
import type { Mastery } from '../../src/app/core/mastery.ts';
import { L } from '../../src/app/text/ui.ts';
import { buildShapes, specOf, type Topology } from '../../src/app/map/shapes.ts';
import type { Ctx } from '../../src/app/ui/ctx.ts';
import type { GeoData, GuUnitFile } from '../../src/app/types.ts';
import { TAP_FAIL } from '../../pipeline/emd-lib.mjs';
import { EN_OFF, LIVE_BY_OPEN, geo, geoNoEmd } from './fixtures.ts';

const root = path.join(import.meta.dirname, '../..');
const dir = path.join(root, 'public/data/geo', DATA_VER);
const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
const sidos: { key: string; code: string; status: string; layer: string; gu: string; expect: { sgg: number; si: number } }[] = read(path.join(root, 'src/data/sido.json')).sidos;
const T = 20000;
const rec = (box: number, due: number | null, hi = 1) => ({ box, due, hi, streak: 0, grad: false, front: false });
const base = (reg: Registry, more: Partial<HomeInput> = {}): HomeInput => ({ reg, mastery: {}, deck: null, daily: null, last: null, today: T, ...more });
const gu = (): GuUnitFile => geo.units.guUnits!.gyeonggi;
const ctxOf = (reg: Registry, o: Partial<Ctx> = {}): Ctx => ({
  reg, geo, base: '/', ver: DATA_VER, storageOk: true, inApp: false,
  mastery: {}, lessonDeck: null, otherDeck: null, checkDeck: null, checkStart: 0,
  daily: null, dailyEmd: null, last: null, lastUnit: null, settings: { autoNext: false }, homeRegion: null, bests: {}, bestUnits: {},
  today: () => T, save() {}, go() {}, back() {}, render() {}, toast() {},
  ...o,
}) as Ctx;

test('units.json guUnits = 지역 표 gu live 지역(경기 · E13 충북 · E15 경남)만, 그 지역은 공개·시 층', () => {
  const live = sidos.filter((s) => s.gu === 'live');
  // 일반구가 3곳 이상인 시·도(N5 — 경기 24·충북 4·경남 5)만. 지역 표 차례(경남 48 이 충북 43 뒤). 일반구 둘뿐인 충남 천안·경북 포항(E14)은 단원이 없다
  assert.deepEqual(live.map((s) => s.key), ['gyeonggi', 'chungbuk', 'gyeongnam']);
  for (const s of live) assert.deepEqual([s.status, s.layer], ['live', 'si'], s.key);
  assert.deepEqual(Object.keys(geo.units.guUnits ?? {}), live.map((s) => s.key));
  for (const s of sidos) assert.ok(['live', 'off'].includes(s.gu), `${s.key}.gu`);
});

test('경기 일반구 단원 규격: 24곳(= 일반구 단위 47 − 시 층 31 + 일반구 있는 시 8) · 과 = 시(2곳짜리 안양·안산은 합침) · 16px · 곳마다 한 과·한 화면', () => {
  const g = gu(), s = sidos.find((x) => x.key === 'gyeonggi')!;
  const ids = g.items.map((it) => it.id);
  assert.equal(g.key, 'gyeonggi/gu');
  assert.equal(g.layer, 'sgg');
  assert.equal(ids.length, 24);
  assert.equal(new Set(ids).size, 24);
  // 일반구는 시 층 지역의 곳이 아니다(시 층 id 는 10 단위로 내림) — 숙달 키가 겹치지 않는다
  const regionIds = new Set(geo.units.regions.find((r) => r.key === 'gyeonggi')!.items.map((it) => it.id));
  assert.equal(s.expect.sgg - s.expect.si + new Set(g.items.map((it) => it.si)).size, 24);
  for (const it of g.items) {
    assert.match(it.id, /^kr:sgg:41\d{3}$/);
    assert.ok(!regionIds.has(it.id), `${it.full}: 경기 시 층 곳과 겹침`);
    assert.ok(regionIds.has(it.si), `${it.full}: 시 칸 ${it.si} 가 경기 지역에 없음`);
    assert.equal(geo.labels[it.id]?.length, 3, `${it.full} 이름표 점`);
    assert.ok((geo.neighbors.sgg[it.id] ?? []).length > 0, `${it.full} 이웃`);
    assert.ok(it.full.endsWith(` ${it.ko}`) && it.ko.endsWith('구'), it.full);
    assert.match(it.slug, /^[a-z]+-si-[a-z]+-gu$/);
    assert.ok(it.line.startsWith(it.full.split(' ')[0]) && it.line.length <= 30, `${it.full} 위치 한 줄 '${it.line}'`);
  }
  // slug 는 일반구 동 단원과 같다
  const emd = new Map((geo.units.emdUnits?.gyeonggi ?? []).map((u) => [`kr:sgg:${u.code}`, u.slug]));
  for (const it of g.items) assert.equal(it.slug, emd.get(it.id), `${it.full} slug = 동 단원 slug`);
  for (const [what, list] of [['과', g.lessons], ['넓은 화면', g.screens]] as const) {
    assert.deepEqual(list.flatMap((l) => l.items).sort(), [...ids].sort(), `곳마다 정확히 한 ${what}`);
    for (const l of list) assert.ok(l.minTapPx >= TAP_FAIL, `${what} ${'title' in l ? l.title : l.ko}: ${l.minTapPx}px`);
  }
  assert.deepEqual(g.lessons.map((l) => l.title), ['부천시', '안산시·안양시', '성남시', '수원시', '화성시', '용인시', '고양시']);
  for (const l of g.lessons) {
    const sis = new Set(l.items.map((id) => g.items.find((it) => it.id === id)!.si));
    assert.ok(l.items.length >= 3, `${l.title}: 3곳 이상(2곳짜리 시는 합침)`);
    assert.equal(sis.size, l.title.split('·').length, `${l.title}: 과 = 시`);
  }
  assert.equal(g.items.find((it) => it.ko === '팔달구')!.line, '수원시 가운데', '같은 시 일반구에만 둘러싸인 곳');
  // 위치 한 줄 방위(E7 검수): 9칸(동 만나기와 같은 기준) + 지도 검사. 이름표 점 평균에서 재면 효행구가 '북서쪽'(실제 북서쪽은 만세구), 원미구가 '서쪽'이었다
  const dirOf = (ko: string) => g.items.find((it) => it.ko === ko)!.line.split(',')[0];
  assert.equal(dirOf('효행구'), '화성시 북쪽');
  assert.equal(dirOf('만세구'), '화성시 남서쪽');
  assert.equal(dirOf('원미구'), '부천시 가운데');
  // 같은 시 안에서 방위가 겹치지 않는다(용인시 기흥구·수지구는 9칸으로는 모두 북서쪽 — 겹침을 고쳐 기흥구 서쪽)
  const bySi = new Map<string, string[]>();
  for (const it of g.items) bySi.set(it.si, [...(bySi.get(it.si) ?? []), it.line.split(',')[0]]);
  for (const [si, dirs] of bySi) assert.equal(new Set(dirs).size, dirs.length, `${si}: ${dirs.join(' / ')}`);
  assert.equal(dirOf('기흥구'), '용인시 서쪽');
});

test('앱 등록: 부팅 때 reg.units 에(지역 목록은 그대로) · 찾기·이웃·방위 · 일반구를 끈 창(관문이 닫힌 영어 앱)과 옛 캐시는 등록하지 않음(관문이 열린 영어 앱은 등록 — EN_EMD 1.2) · 모양이 틀리면 그 단원만 빠진다', () => {
  const reg = createRegistry(geo);
  const u = reg.region('gyeonggi/gu')!;
  assert.ok(u && u.unit?.gu);
  assert.equal(reg.regions.length, LIVE_BY_OPEN.length);   // 지역 표 공개 지역(E13 열둘 · E14 충남·경북 더해 열넷 · E15 경남까지 합친 판 열다섯) — 일반구 단원은 지역 목록에 들지 않는다
  assert.ok(!reg.regions.some((r) => r.key.endsWith('/gu')));
  assert.ok(reg.units.includes(u));
  assert.equal(reg.areaOf('gyeonggi/gu'), 'gyeonggi');
  const jangan = 'kr:sgg:41111', gwonseon = 'kr:sgg:41113';
  assert.equal(reg.place(jangan)?.region, u);
  assert.equal(reg.place(jangan)?.lesson.title, '수원시');
  assert.equal(reg.bySlug('gyeonggi/gu', 'suwon-si-jangan-gu')?.item.id, jangan);
  assert.ok(reg.known(jangan));
  assert.ok(reg.adjacent(jangan, gwonseon), '이웃은 neighbors.json sgg');
  assert.equal(reg.dir8(gwonseon, jangan), 'N');
  assert.equal(reg.unit('gyeonggi/gu'), undefined, '동 색인에는 없다(받을 단원 파일이 없음)');
  assert.deepEqual(unitsToLoad(reg, { mastery: {}, deck: null, deck2: null, lastUnit: 'gyeonggi/gu', daily: null, dailyEmd: null, today: T }), []);
  // 일반구를 끈 창(관문이 닫힌 영어 앱 — 2026-11-16 전 영어 앱, N26) · 옛 캐시(guUnits 없음). 관문이 열린 영어 앱은 한국어처럼 등록한다
  const en = createRegistry(geo, unitOptions('en', geo.units));
  assert.deepEqual(en.region('gyeonggi/gu')?.items.map((it) => it.id), u.items.map((it) => it.id));
  assert.equal(en.known(jangan), true);
  // 한국어 앱의 오늘 복습 판(kgq_deck2_v1)에 일반구 곳이 섞였으면, 이어 할 수는 없어도 저장소에서 지우지 않는다(E7 검수 — 동 판과 같은 N26 '기록은 남음')
  const guReview = createDeck('review', [{ mode: 'find' as const, id: 'kr:sgg:41110' }, { mode: 'find' as const, id: jangan }], { seed: 5 });
  const sggReview = createDeck('review', [{ mode: 'find' as const, id: 'kr:sgg:41110' }, { mode: 'find' as const, id: 'kr:sgg:11305' }], { seed: 6 });
  const goneReview = createDeck('review', [{ mode: 'find' as const, id: 'kr:sgg:41110' }, { mode: 'find' as const, id: 'kr:sgg:28115' }], { seed: 7 });
  assert.equal(onMissingUnit(reg, guReview), false, '등록된 한국어 창에서는 쓸 수 있다');
  for (const r of [createRegistry(geo, EN_OFF), createRegistry(geoNoEmd)]) {
    assert.equal(r.region('gyeonggi/gu'), undefined);
    assert.equal(r.known(jangan), false);
    assert.deepEqual([usableDeck(r, guReview), onMissingUnit(r, guReview)], [null, true], '일반구가 섞인 판은 남긴다');
    assert.ok(usableDeck(r, sggReview), '시·군·구만 든 판은 이어 할 수 있다(강북구 11305 는 일반구가 아님)');
    assert.equal(onMissingUnit(r, sggReview), false);
    assert.deepEqual([usableDeck(r, goneReview), onMissingUnit(r, goneReview)], [null, false], '시 층이 아닌 지역에서 사라진 곳은 지금처럼 지운다');
  }
  // 과에 들지 않은 곳이 있는 깨진 단원: 그 단원만 빠지고 지역은 그대로(throw 하지 않음)
  const bad = structuredClone(gu());
  bad.lessons[0].items = bad.lessons[0].items.slice(1);
  const broken: GeoData = { ...geo, units: { ...geo.units, guUnits: { gyeonggi: bad } } };
  const rb = createRegistry(broken);
  assert.equal(rb.region('gyeonggi/gu'), undefined);
  assert.equal(rb.regions.length, LIVE_BY_OPEN.length);   // 공개 지역은 그대로
  assert.equal(rb.place(jangan), undefined, '반쯤 등록된 곳이 없다');
});

test('GA(N34) · 마지막 단원 키: unit gu · unit_id 시·도 코드, kgq_last_v1 은 지역 키', () => {
  const reg = createRegistry(geo);
  assert.deepEqual(gaUnit(reg, 'gyeonggi/gu'), { unit: 'gu', region: 'gyeonggi', unit_id: '41' });
  assert.deepEqual(lessonCompleteParams(reg, 'gyeonggi/gu', 2, 3, 4), { unit: 'gu', region: 'gyeonggi', unit_id: '41', lesson: 2, first_try: 3, total: 4 });
  assert.deepEqual(studyKeys(reg, 'gyeonggi/gu'), { last: 'gyeonggi', lastUnit: 'gyeonggi/gu' });
});

test('홈·복습: 일반구는 시·군·구 몫 · 마지막 일반구 단원의 다음 과가 경기 탭 주 카드에 · 섞인 화면 이름은 \'수원시 장안구\'', () => {
  const reg = createRegistry(geo);
  const g = gu();
  // 1과(부천시)를 칠함(복습 모레) → 마지막 단원이 일반구 단원이면 그 단원 2과
  const m: Mastery = Object.fromEntries(g.lessons[0].items.map((id) => [id, rec(2, T + 2)]));
  const card = homeCard(base(reg, { mastery: m, last: 'gyeonggi', lastUnit: 'gyeonggi/gu' }));
  assert.deepEqual(card, { type: 'next', region: 'gyeonggi', lesson: 2, recommend: true, tomorrow: 0, unit: 'gyeonggi/gu' });
  // 시·군·구 몫을 다 쓴 날: 단원 과도 추천하지 않는다(일반구는 시·군·구 상한을 함께 쓴다, N32)
  const tight = homeCard(base(reg, { mastery: m, last: 'gyeonggi', lastUnit: 'gyeonggi/gu', daily: { day: T, n: DAILY_CAP - 2 } }));
  assert.equal(tight.type === 'next' && tight.recommend, false);
  // 마지막 단원 기록이 없으면 지역 차례 그대로(경기 1과)
  assert.deepEqual(homeCard(base(reg, { mastery: m, last: 'gyeonggi' })), { type: 'next', region: 'gyeonggi', lesson: 1, recommend: true, tomorrow: 0 });
  // 동 복습이 있는 날(E7 검수): 일반구 과는 시·군·구 과라 '시·군·구 다음 과' 자리 — 동 복습보다 먼저(N32 홈 차례)
  const jong = geo.units.emdUnits!.seoul.find((u) => u.slug === 'jongno-gu')!;
  const withEmd: Mastery = { ...m, ...Object.fromEntries(reg.region('gyeonggi')!.lessons[0].items.map((id) => [id, rec(2, T + 2)])),
    ...Object.fromEntries(jong.ids.slice(0, 6).map((s) => [`kr:emd:${jong.code}${s}`, rec(1, T)])) };
  const gNext = homeCard(base(reg, { mastery: withEmd, last: 'gyeonggi', lastUnit: 'gyeonggi/gu' }));
  assert.equal(gNext.type, 'next');
  assert.deepEqual(gNext.type === 'next' && [gNext.lesson, gNext.unit, gNext.recommend], [2, 'gyeonggi/gu', true]);
  // 마지막 단원이 없어도 같은 자리(시·군·구 다음 과 = 경기 2과)
  const sNext = homeCard(base(reg, { mastery: withEmd, last: 'gyeonggi' }));
  assert.deepEqual(sNext.type === 'next' && [sNext.lesson, sNext.unit], [2, undefined]);
  // 시·군·구 몫을 다 쓴 날은 둘 다 동 복습이 먼저
  for (const lastUnit of ['gyeonggi/gu', null]) {
    const c = homeCard(base(reg, { mastery: withEmd, last: 'gyeonggi', lastUnit, daily: { day: T, n: DAILY_CAP - 2 } }));
    assert.deepEqual(c.type === 'review' && c.byRegion.map((b) => [b.region, b.n, b.unit]), [['seoul', 6, 'seoul/jongno-gu']], `lastUnit ${lastUnit}`);
  }
  // 오늘 복습: 시·군·구 몫 판, 묶음은 지역 경기 · 단원 gyeonggi/gu
  const due: Mastery = Object.fromEntries(g.lessons[3].items.map((id) => [id, rec(1, T)]));
  const plan = todayReview(reg, due, T, 0, 0);
  assert.equal(plan.part, 'sgg');
  assert.deepEqual(plan.byRegion, [{ region: 'gyeonggi', n: 4, unit: 'gyeonggi/gu' }]);
  assert.equal(L.fullName(reg, 'kr:sgg:41111'), '수원시 장안구');
  assert.equal(L.line(reg, 'kr:sgg:41111'), g.items.find((it) => it.id === 'kr:sgg:41111')!.line, '위치 한 줄은 파이프라인 근거 한 줄');
  assert.equal(L.count(reg.region('gyeonggi/gu')!), '24개 구');
});

test('지도: 경기 경계 파일의 sgg 층에서 일반구 24곳만 칸, 나머지 시·군은 이웃 땅(이름은 맥락 이름으로)', () => {
  const reg = createRegistry(geo);
  const u = reg.region('gyeonggi/gu')!;
  const spec = specOf(u);
  assert.deepEqual([spec.layer, spec.idKey, spec.rest], ['sgg', 'sggId', true]);
  assert.equal(specOf(reg.region('gyeonggi')!).rest, undefined, '지역 지도는 그대로');
  const topo: Topology = read(path.join(dir, 'gyeonggi-sgg.topo.json'));
  const s = buildShapes(topo, spec, geo.labels);
  assert.equal(s.ids.length, 24);
  const names = s.names.filter((n) => n.kind === 'out').map((n) => n.text);
  for (const n of ['의왕시', '군포시', '과천시', '서울특별시']) assert.ok(names.includes(n), `맥락 이름 ${n}`);   // 이웃 시·도는 정식 이름(D96 — 2026-11-17)
  assert.ok(!names.includes('수원시 장안구'), '공부 칸은 맥락 이름이 아님');
  assert.ok(s.rimD.length > 0 && s.outD.length > 0);
});

test('쪽: 일반구 단원 쪽 · 구 고르기(시 아래 일반구 · 넓은 화면 고르기 · 일반구 링크) · 서울 구 고르기는 그대로', async () => {
  const { unitPage, pickPage, startPage } = await import('../../src/app/ui/pages.ts');
  const reg = createRegistry(geo);
  const up = unitPage(ctxOf(reg), 'gyeonggi/gu');
  assert.match(up.html, /경기 · 일반구 공부하기/);
  assert.match(up.html, /<h1 class="h-title">경기 일반구 24곳<\/h1>/);
  assert.equal(up.title, '경기 일반구 24곳');
  for (let no = 1; no <= 7; no++) assert.ok(up.html.includes(`href="#/kr/gyeonggi/gu/p${no}"`), `${no}과 링크`);
  assert.ok(up.html.includes('href="#/kr/gyeonggi"'), '경기 과로 돌아가기');
  assert.ok(up.html.includes('href="#/kr/gyeonggi/emd"'), '동까지 공부하기');
  assert.ok(!up.html.includes('다른 구 고르기'));
  assert.match(up.html, /s-water/, '한강 범례(경기 경계를 그대로 그린다)');
  const sp = startPage(ctxOf(reg), 'gyeonggi/gu', 4);
  assert.match(sp.html, /data-act="learn" data-arg="gyeonggi\/gu:4"/);
  assert.match(sp.html, /4개 구<\/span>를 채워요/);
  const pk = pickPage(ctxOf(reg), 'gyeonggi').html;
  assert.ok(pk.includes('href="#/kr/gyeonggi/gu"'), '구 고르기의 일반구 링크');
  assert.match(pk, /<h3 class="e-gh">수원시 <span>4개 구<\/span><\/h3>/);
  assert.match(pk, /data-unit="gyeonggi\/suwon-si-jangan-gu">\s*<span class="nm">장안구<\/span>/);
  // 차례(E7 검수): 시·군 목록과 일반구 시 묶음이 한 줄로 가나다 차례(고양시 묶음은 가평군 다음, 화성시 묶음은 맨 끝)
  const names = [...pk.matchAll(/<h3 class="e-gh">(\S+) |data-unit="gyeonggi\/[^"]+">\s*<span class="nm">([^<]+)</g)].map((x) => x[1] ?? (x[2].endsWith('구') ? null : x[2])).filter(Boolean) as string[];
  assert.equal(names.length, 23 + 8, '일반구 없는 시·군 23 + 일반구 시 8');
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'ko')));
  assert.deepEqual(names.slice(0, 3), ['가평군', '고양시', '과천시']);
  assert.equal(names.at(-1), '화성시');
  assert.equal((pk.match(/data-act="pickScreen"/g) ?? []).length, 5, '전체 + 넓은 화면 4개');
  assert.match(pk, /data-arg="gyeonggi:" aria-pressed="true">전체/);
  const pk2 = pickPage(ctxOf(reg, { pickScreen: { gyeonggi: 'sw' } }), 'gyeonggi');
  assert.match(pk2.html, /data-arg="gyeonggi:sw" aria-pressed="true">남서부/);
  const sw = geo.units.regions.find((r) => r.key === 'gyeonggi')!.screens.find((x) => x.key === 'sw')!;
  assert.deepEqual(pk2.maps!.pick.home, sw.fit);
  assert.equal(pk2.maps!.pick.labels!.length, sw.items.length);
  // 서울(넓은 화면 하나·일반구 없음): 고르기 단추·묶음 없음
  const ps = pickPage(ctxOf(reg), 'seoul').html;
  assert.ok(!ps.includes('pickScreen') && !ps.includes('e-gh') && !ps.includes('/gu"'));
});
