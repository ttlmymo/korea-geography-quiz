// 동 단원(계획서 NATIONWIDE_PLAN E3 · N10 · N11 · N17 · N30 · N31)
//  ① 판 폴더에 미리보기(--preview) 출력이 남지 않았는가(커밋·배포 금지 — 남아 있으면 여기서 막힌다)
//  ② 동 공개 지역(지역 표 emd live)의 모든 단원 파일이 있고 앱 레지스트리에 등록되는가(전수 시험)
//  ③ 시험용 단원 파일(tests/fixtures/emd: 종로·중랑·노원·옹진·증평·검단·광주 동구·울릉)과 묶기 규칙(pipeline/emd-lib.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { DATA_VER } from '../../src/consts.ts';
import { createRegistry } from '../../src/app/registry.ts';
import type { EmdIndex, EmdUnitFile } from '../../src/app/types.ts';
import { DIR_KO as APP_DIR_KO } from '../../src/app/text/ko.ts';
import { ISLE_H, ISLE_MIN_PX, ISLE_PAD, ISLE_W, farInset, isleRange as appIsleRange } from '../../src/app/map/isles.ts';
import { buildUnit, familyOf, famParts, checkTitle, dirIn, isleRange, seenBox, TAP_FAIL, INSET, DIR_KO, DIRS, PHONE, VIEW_WIDE, EDGE_KEEP } from '../../pipeline/emd-lib.mjs';

const root = path.join(import.meta.dirname, '../..');
const dir = path.join(root, 'public/data/geo', DATA_VER);
const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
const sidos: { key: string; code: string; status: string; emd: string; expect: { sgg: number; si: number; emd: number } }[] = read(path.join(root, 'src/data/sido.json')).sidos;
const units = read(path.join(dir, 'units.json'));
const manifest = read(path.join(dir, 'manifest.json'));
const emdLive = sidos.filter((s) => s.status === 'live' && s.emd === 'live').map((s) => s.key);
const zlibGz = (b: Buffer) => zlib.gzipSync(b).length;
const AGAIN = '판 폴더에 미리보기(--preview) 출력이 남았으면 node pipeline/build-geo.mjs 를 다시 돌려 되돌리세요(미리보기 출력은 커밋·배포 금지)';

// 단원 색인·단원 파일 모양은 앱 타입 하나(src/app/types.ts)를 함께 쓴다(E4)
type UnitIndex = EmdIndex;
type UnitFile = EmdUnitFile;

test('판 폴더에 미리보기 출력이 없다(manifest.preview 없음)', () => {
  assert.equal(manifest.preview, undefined, `manifest.json 에 preview 가 있음 — ${AGAIN}`);
});

test('units.json emdUnits 는 동 공개 지역(지역 표 emd live)만 담는다', () => {
  const keys = Object.keys(units.emdUnits ?? {}).sort();
  assert.deepEqual(keys, [...emdLive].sort(), `emdUnits 지역 ${keys.join(',') || '없음'} / emd live ${emdLive.join(',') || '없음'} — ${AGAIN}`);
  if (!emdLive.length) assert.ok(!('emdUnits' in units), 'emd live 지역이 없으면 emdUnits 필드를 쓰지 않는다(계획서 N17)');
});

test('판 폴더 emd/ 의 단원 파일 = 동 공개 지역 단원의 .json·.topo.json 쌍(그 밖의 파일 없음)', () => {
  // 기대 목록은 지역 표(emd live)에서 만든다(units.json 도 미리보기 출력이면 함께 늘어나므로 그것을 기준으로 삼지 않는다)
  const want = emdLive.flatMap((k) => ((units.emdUnits ?? {})[k] ?? []) as UnitIndex[]).flatMap((u) => [`${u.code}.json`, `${u.code}.topo.json`]).sort();
  const p = path.join(dir, 'emd');
  const have = fs.existsSync(p) ? fs.readdirSync(p).sort() : [];
  assert.deepEqual(have, want, `판 폴더 emd/ 파일 ${have.length}개 / 기대 ${want.length}개 — ${AGAIN}`);
  assert.ok(!Object.keys(manifest.files).some((n) => n.startsWith('emd/') && !want.includes(n.slice(4))), `manifest.files 에 동 공개 지역 밖 단원 파일이 있음 — ${AGAIN}`);
});

/** 단원 파일 하나의 규격. live = 공개 단원이면 1곳 과·16px 미만을 허용하지 않는다 */
function checkUnit(j: UnitFile, idx: UnitIndex | null, topo: { objects: Record<string, { geometries: { properties: { id: string } }[] }> } | null) {
  const where = `${j.ko}(${j.code})`;
  assert.equal(j.version, DATA_VER, `${where} 판`);
  assert.equal(j.layer, 'emd', where);
  assert.match(j.key, /^[a-z-]{2,20}\/[a-z0-9-]{2,40}$/, `${where} 단원 키(N16 lastunit 정규식)`);
  const ids = j.items.map((it) => it.id);
  assert.equal(new Set(ids).size, ids.length, `${where} 곳 id 겹침`);
  for (const it of j.items) {
    assert.match(it.id, new RegExp(`^kr:emd:${j.code}\\d{5}$`), `${where} ${it.ko} id(앞 5자리 = 단원 코드)`);
    assert.equal(it.slug, it.id.slice(-5), `${where} ${it.ko} slug = adm_cd2 뒤 5자리(N31)`);
    assert.ok(['동', '읍', '면'].includes(it.kind), `${where} ${it.ko} kind`);
    assert.ok(j.labels[it.id]?.length === 3, `${where} ${it.ko} 이름표 점`);
    assert.ok(j.meet[it.id]?.dir, `${where} ${it.ko} 만나기 근거`);
    for (const o of j.neighbors[it.id] ?? []) assert.ok(ids.includes(o) && j.neighbors[o].includes(it.id), `${where} ${it.ko} 단원 안 이웃이 대칭이 아님`);
    for (const o of j.meet[it.id].touch ?? []) assert.ok(j.outside[o]?.ko, `${where} ${it.ko} 맞닿은 시·군·구 ${o} 이름`);
    // 만나기 '끝'(N13): 9칸 방위가 그쪽 성분을 가질 때만('가운데'인 곳에는 없음)
    const m = j.meet[it.id];
    if (m.edge) assert.ok(m.dir !== 'C' && m.dir.includes(m.edge), `${where} ${it.ko} '끝' ${m.edge} 이 방위 ${m.dir} 와 어긋남`);
  }
  // 곳마다 정확히 한 과·한 넓은 화면에
  for (const [what, list] of [['과', j.lessons], ['넓은 화면', j.screens]] as const) {
    const inAll = list.flatMap((l) => l.items);
    assert.equal(inAll.length, ids.length, `${where} ${what}에 든 곳 수`);
    assert.deepEqual([...inAll].sort(), [...ids].sort(), `${where} 곳마다 정확히 한 ${what}`);
    for (const l of list) {
      assert.equal(l.fit.length, 4, `${where} ${what} fit`);
      assert.ok(l.minTapPx >= TAP_FAIL, `${where} ${what} ${'title' in l ? l.title : l.ko}: 가장 작은 칸 ${l.minTapPx}px (<${TAP_FAIL})`);
      for (const id of l.insets ?? []) assert.ok(l.items.includes(id), `${where} 섬 상자 ${id} 가 ${what}에 없음`);
    }
  }
  assert.deepEqual(j.lessons.map((l) => l.no), j.lessons.map((_, i) => i + 1), `${where} 과 번호`);
  assert.equal(new Set(j.lessons.map((l) => l.title)).size, j.lessons.length, `${where} 과 이름 겹침`);
  if (j.items.length > 1) assert.ok(j.lessons.every((l) => l.items.length > 1), `${where} 1곳 과(N10 6단계)`);
  if (idx) {
    assert.deepEqual([idx.code, idx.ko, idx.n, idx.lessons], [j.code, j.ko, j.items.length, j.lessons.length], `${where} 색인`);
    assert.deepEqual(idx.ids, j.items.map((it) => it.slug), `${where} 색인 ids`);
    assert.equal(`${j.region}/${idx.slug}`, j.key, `${where} 색인 slug`);
  }
  if (topo) {
    const cells = topo.objects.emd.geometries.map((g) => g.properties.id).sort();
    assert.deepEqual(cells, [...ids].sort(), `${where} 단원 지도의 칸 = 곳`);
  }
  // 등록(계획서 N30: Region 모양 그대로, reg.units 에 지연 등록 — 앱과 같은 길 addUnit): 앱 레지스트리가 과·곳을 찾고, 단원 안 이웃·방위를 계산한다
  const reg = createRegistry({ units: { version: j.version, regions: [] }, neighbors: { sgg: {}, si: {}, sea: {} }, labels: {} });
  const u = reg.addUnit(j);
  assert.equal(reg.region(j.key), u, `${where} 단원 키로 찾기`);
  assert.equal(u.layer, 'emd');
  assert.equal(u.unit?.parent, j.region, `${where} 단원의 지역`);
  assert.equal(reg.areaOf(j.key), j.region);
  for (const l of j.lessons) for (const id of l.items) assert.equal(reg.place(id)?.lesson.no, l.no, `${where} 등록: ${id}`);
  for (const l of j.lessons) assert.equal(reg.lesson(j.key, l.no), l, `${where} 과 찾기`);
  for (const it of j.items) assert.equal(reg.bySlug(j.key, it.slug)?.item.id, it.id, `${where} slug 로 찾기`);
  const a = ids.find((id) => (j.neighbors[id] ?? []).length);
  if (a) assert.ok(reg.adjacent(a, j.neighbors[a][0]), `${where} 등록: 단원 안 맞닿음`);
}

// emd live 지역은 반드시 있어야 하고, emdUnits 에 든 지역(미리보기 출력이면 공개 지역 전부)도 같은 규격으로 본다
test('동 공개 지역의 모든 단원 파일이 있고 등록된다(전수, 계획서 N33)', () => {
  for (const key of [...new Set([...emdLive, ...Object.keys(units.emdUnits ?? {})])]) {
    const list: UnitIndex[] = (units.emdUnits ?? {})[key];
    const s = sidos.find((x) => x.key === key)!;
    assert.ok(list?.length, `${key}: units.json emdUnits 에 이 지역 단원 색인이 없음 — node pipeline/build-geo.mjs 를 다시 돌릴 것`);
    // 빠진 단원이 없다(E6): 단원 수 = 일반구 단위 시·군·구 수, 동 수 합 = 원자료 읍·면·동 수(지역 표 expect)
    assert.deepEqual([list.length, list.reduce((t, u) => t + u.n, 0)], [s.expect.sgg, s.expect.emd], `${key}: 단원 수·동 수가 지역 표 expect 와 다름`);
    assert.equal(new Set(list.map((u) => u.code)).size, list.length, `${key}: 단원 코드 겹침`);
    for (const u of list) {
      const j: UnitFile = read(path.join(dir, 'emd', `${u.code}.json`));
      assert.equal(j.sido, s.code, `${key} ${u.ko} 시·도`);
      checkUnit(j, u, read(path.join(dir, 'emd', `${u.code}.topo.json`)));
    }
  }
});

const FIX = path.join(root, 'tests/fixtures/emd');
const fixture = (code: string): UnitFile => read(path.join(FIX, `${code}.json`));
const nameIn = (j: UnitFile) => Object.fromEntries(j.items.map((it) => [it.id, it.ko]));

test('시험용 단원 파일 8개(종로·중랑·노원·옹진·증평·검단·광주 동구·울릉)가 이 판에서 나왔고 규격을 지킨다 · 공개하지 않은 시·도의 단원 키는 slug 대신 코드', () => {
  const codes = ['11110', '11260', '11350', '28290', '28720', '43745', '12210', '47940'];
  assert.deepEqual(fs.readdirSync(FIX).sort(), codes.flatMap((c) => [`${c}.json`, `${c}.topo.json`]).sort(), '시험용 단원 파일 목록 — node pipeline/build-geo.mjs 가 다시 쓴다');
  for (const c of codes) checkUnit(fixture(c), null, read(path.join(FIX, `${c}.topo.json`)));
  assert.equal(fixture('11110').key, 'seoul/jongno-gu');
  assert.equal(fixture('28720').key, 'incheon/ongjin-gun');
  assert.equal(fixture('28290').key, 'incheon/geomdan-gu');
  assert.ok(fixture('28290').lessons.length >= 2, '검단: 인천 동 단원의 다음 과 시험(emd-core)에 과가 둘 이상 필요');
  // 단원 키(파이프라인 unitJson): 공개 지역(지역 표 status live)은 '{지역}/{slug}', 공개하지 않은 시·도는 slug 가 없어 '{지역}/{코드}'.
  // 증평은 E13 부터 공개(충북)라 slug. 광주 동구(전남광주 — E16)·울릉군(경북 — E14)은 그 지역을 열기 전까지 코드 키로 이 규칙을 지킨다(E13 검수 — 증평이 공개되어 규칙 시험이 없어졌다)
  const live = (k: string) => sidos.find((s) => s.key === k)!.status === 'live';
  const keyRule = (code: string, region: string, slug: string | null) => {
    const k = fixture(code).key;
    if (live(region)) assert.match(k, new RegExp(`^${region}/${slug ?? '[a-z][a-z0-9-]+'}$`), `${code} 공개 지역은 slug 키`);
    else assert.equal(k, `${region}/${code}`, `${code} 공개하지 않은 시·도는 코드 키`);
    assert.equal(fixture(code).region, region);
  };
  keyRule('43745', 'chungbuk', 'jeungpyeong-gun');
  keyRule('12210', 'jeonnam-gwangju', null);
  keyRule('47940', 'gyeongbuk', null);
  assert.ok(['12210', '47940'].some((c) => !live(fixture(c).region)) || sidos.every((s) => s.status === 'live'), '코드 키 규칙을 실제로 보는 시험용 단원이 하나는 있어야 한다(16곳을 다 열기 전까지)');
  // 울릉군(E14 준비): 3곳 한 과, 섬 상자 없이(단원 안에서는 본 땅) — 지역 지도에서는 통째로 먼 섬(파이프라인 near 없음)
  assert.equal(fixture('47940').items.length, 3);
  assert.equal(fixture('47940').lessons.length, 1);
});

test('숫자 가족(Q8 기본값): 노원구 상계 8곳은 번호가 이어지게 두 과로, 중계 4곳·중랑구 면목 6곳은 한 과에', () => {
  const j = fixture('11350'), nm = nameIn(j);
  const lessonsOf = (root: string) => j.lessons.filter((l) => l.items.some((id) => familyOf(nm[id])?.root === root));
  const sang = lessonsOf('상계');
  assert.equal(sang.length, 2, '상계 가족이 든 과 수');
  const nos = sang.map((l) => l.items.filter((id) => familyOf(nm[id])?.root === '상계').map((id) => familyOf(nm[id])!.no).sort((a, b) => a - b));
  assert.deepEqual(nos.map((v) => v.length).sort(), [4, 4], '상계 8곳을 4·4로');
  const [lo, hi] = nos.sort((a, b) => a[0] - b[0]);
  assert.ok(lo[lo.length - 1] < hi[0], `상계 번호가 이어지게 나뉨(${lo.join(',')} / ${hi.join(',')})`);
  const noOf = (l: UnitFile['lessons'][number]) => Math.min(...l.items.filter((id) => familyOf(nm[id])?.root === '상계').map((id) => familyOf(nm[id])!.no));
  const [a, b] = sang;
  assert.ok((a.no < b.no) === (noOf(a) < noOf(b)), `상계 작은 번호가 든 과가 앞(${a.no}과 상계${noOf(a)}~ / ${b.no}과 상계${noOf(b)}~)`);
  assert.equal(lessonsOf('중계').length, 1, '중계 가족 한 과');
  const m = fixture('11260'), mn = nameIn(m);
  assert.equal(m.lessons.filter((l) => l.items.some((id) => familyOf(mn[id])?.root === '면목')).length, 1, '면목 가족 한 과');
});

test('작은 단원·섬 단원: 증평군(2곳)은 한 과, 옹진군(맞닿은 동이 없는 섬 7곳)은 섬 과 셋 — 가까운 섬은 본 지도 한 장씩, 먼 섬 셋만 섬 상자(D2 사용자 결정 11-17)', () => {
  const z = fixture('43745');
  assert.equal(z.lessons.length, 1);
  assert.equal(z.lessons[0].items.length, 2, '증평: 보기를 이웃 단원에서 빌리지 않으므로 2곳 과(N10)');
  const o = fixture('28720');
  const on = Object.fromEntries(o.items.map((it: { id: string; ko: string }) => [it.id, it.ko]));
  // 넷을 한 장에 두면 자월면 10px 라 전에는 일곱 곳 모두 섬 상자였다 → 가까운 섬끼리 둘로(17px · 23px), 지역 표 먼 섬 셋은 상자. 먼 섬 과가 맨 뒤
  assert.deepEqual(o.lessons.map((l) => [l.title, l.items.map((id) => on[id]).sort().join('·'), (l.insets ?? []).length]),
    [['남동쪽 섬', '덕적면·자월면', 0], ['동쪽 섬', '북도면·영흥면', 0], ['북서쪽 섬', '대청면·백령면·연평면', 3]]);
  assert.ok(o.lessons.every((l) => l.minTapPx >= TAP_FAIL), '옹진: 과마다 16px');
  assert.equal(o.lessons.flatMap((l) => l.items).length, 7);
});

test('만나기 근거(N13): 단원 밖 맞닿음과 끝 방위', () => {
  const j = fixture('11110'), nm = nameIn(j), byKo = Object.fromEntries(j.items.map((it) => [it.ko, it.id]));
  assert.ok(j.meet[byKo['부암동']].touch?.some((o) => j.outside[o].ko === '서대문구'), '부암동은 서대문구와 맞닿음');
  for (const [id, m] of Object.entries(j.meet)) if (m.edge) assert.ok(['N', 'E', 'S', 'W'].includes(m.edge), `${nm[id]} edge`);
});

test('familyOf: 숫자 가족 뿌리와 번호', () => {
  assert.deepEqual(familyOf('상계3·4동'), { root: '상계', no: 3 });
  assert.deepEqual(familyOf('종로1·2·3·4가동'), { root: '종로', no: 1 });
  assert.deepEqual(familyOf('상일제1동'), { root: '상일', no: 1 });
  assert.deepEqual(familyOf('면목본동'), { root: '면목', no: 0 });
  assert.equal(familyOf('본동'), null);
  assert.equal(familyOf('청운효자동'), null);
  assert.equal(familyOf('도안면'), null);
});

test('famParts(Q8 기본값): 8곳 이상 가족은 번호 차례를 지키며 두 조각이 각각 이어지는 자리에서 자른다', () => {
  // 이웃(맞닿음)만 쓴다. 번호 1~8, 지리 차례는 1-2-3-5-4-6-8-7(부산 연제구 연산처럼 번호와 자리가 엇갈림)
  const graph = (edges: [number, number][]) => {
    const D: Record<string, { nb: string[] }> = {};
    for (let i = 1; i <= 8; i++) D[`d${i}`] = { nb: [] };
    for (const [a, b] of edges) { D[`d${a}`].nb.push(`d${b}`); D[`d${b}`].nb.push(`d${a}`); }
    return D;
  };
  const list = Array.from({ length: 8 }, (_, i) => `d${i + 1}`);
  const zig = famParts(list, graph([[1, 2], [2, 3], [3, 5], [5, 4], [4, 6], [6, 8], [8, 7]]));
  assert.equal(zig.mode, 'split');
  assert.deepEqual(zig.parts, [list.slice(0, 5), list.slice(5)], '앞 절반(1~4)은 4가 떨어지므로 1~5 / 6~8 에서 자름');
  const line = famParts(list, graph([[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8]]));
  assert.deepEqual(line.parts.map((p: string[]) => p.length), [4, 4], '이어진 줄이면 가운데에서');
  const star = famParts(list, graph([[1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7], [1, 8]]));
  assert.equal(star.mode, 'split-gap', '이어지게 자를 자리가 없으면 따로 보고(번호가 끊김)');
});

test('과 이름 지도 검사(N7): 이름을 짓는 계산과 다른 기준(실제 넓이 중심 · 나머지 곳들에서 본 방향)으로 잰다', () => {
  // ctx: at = 과의 넓이 중심, rest = 무리의 나머지 곳들 넓이 중심, base = 무리 넓이 중심, r = 무리 등가 반지름(m)
  const ctx = (at: number[], rest: number[], base = rest, allOuter = true) => ({ at, rest, base, r: 1000, allOuter });
  assert.deepEqual(checkTitle('북쪽', ctx([0, 2000], [0, 0])), []);
  assert.deepEqual(checkTitle('북동쪽', ctx([0, 2000], [0, 0])), [], '±60도 안');
  assert.equal(checkTitle('남쪽', ctx([0, 2000], [0, 0])).length, 1);
  assert.equal(checkTitle('동쪽', ctx([0, 2000], [0, 0])).length, 1, '90도 어긋남');
  assert.equal(checkTitle('북쪽', ctx([0, 50], [0, 0])).length, 1, '나머지와 무게중심이 겹치면(등가 반지름의 0.1배 미만) 방향이 서지 않음');
  assert.deepEqual(checkTitle('시내 북동쪽 · 상계1동 둘레', ctx([1500, 1500], [0, 0])), [], "' · ' 뒤 동 이름은 보지 않는다");
  assert.deepEqual(checkTitle('가운데', ctx([100, 100], [0, 2000], [0, 0])), [], '가운데: 무리 넓이 중심에서 등가 반지름의 0.35배 안');
  assert.equal(checkTitle('가운데', ctx([0, 500], [0, -500], [0, 0])).length, 1, '0.5배 떨어지면 걸림');
  assert.equal(checkTitle('남쪽 끝', ctx([0, -2000], [0, 0], [0, 0], false)).length, 1, '끝: 바깥 경계에 닿지 않는 곳이 있으면 걸림');
  assert.deepEqual(checkTitle('동북 아래쪽', ctx([1500, 1500], [0, 0])), [], "원고 꼴 '동북'");
  // 9칸 방위(이름 짓기 쪽): 상자가 길쭉해도 위쪽 가운데 칸은 북쪽
  const ref = { box: [0, 0, 300, 90] };
  assert.equal(dirIn([150, 80], ref), 'N');
  assert.equal(dirIn([20, 10], ref), 'SW');
  assert.equal(dirIn([160, 50], ref), 'C');
});

test('파이프라인 상수가 앱 값과 같다(섬 상자 크기·여백, 방위 이름·차례)', () => {
  // 지역 지도 먼 섬 상자: 2026-11-15 부터 svgmap.ts 가 isles.ts farInset 으로 크기·여백을 정한다(전에는 svgmap.ts 의 INSET_MAX_W·H 와 여백 0.12 를 소스에서 찾았다)
  const svgmap = fs.readFileSync(path.join(root, 'src/app/map/svgmap.ts'), 'utf8');
  assert.match(svgmap, /= farInset\(F\.box\)/, 'svgmap.ts 의 먼 섬 상자가 farInset 을 쓴다');
  const wide = farInset([0, 0, 1000, 500]), tall = farInset([0, 0, 500, 1000]);
  assert.deepEqual([wide.w, tall.h], [INSET.w, INSET.h], '먼 섬 상자 크기(pipeline/emd-lib.mjs INSET)');
  assert.ok(wide.h < INSET.h && tall.w < INSET.w);
  assert.equal(-wide.vb[0], INSET.pad * 1000, '먼 섬 상자 여백(긴 변 × INSET.pad)');
  // 동 단원 섬 상자(E5, src/app/map/isles.ts)도 같은 크기·여백 — 파이프라인이 이 크기로 16px 검사를 했다
  assert.deepEqual([ISLE_W, ISLE_H, ISLE_PAD], [INSET.w, INSET.h, INSET.pad], '동 섬 상자 크기·여백(isles.ts)');
  assert.equal(ISLE_MIN_PX, TAP_FAIL, '섬 상자 범위가 지킬 칸 크기');
  assert.deepEqual(DIR_KO, APP_DIR_KO, '방위 이름(src/app/text/ko.ts DIR_KO)');
  assert.deepEqual(Object.keys(APP_DIR_KO).sort(), [...DIRS].sort());
});

test('보이는 범위(E7 검수, seenBox): fit 상자를 지도 칸에 여백 없이 맞출 때 폰 비율과 넓은 화면 비율 두 가지로 더 보이는 쪽까지 합친다', () => {
  // 정사각 상자: 폰(세로로 긴 칸)에서는 위아래가, 넓은 화면에서는 좌우가 더 보인다
  const b = seenBox([0, 0, 100, 100]);
  assert.deepEqual(b.map((v) => Math.round(v)), [Math.round(50 - 50 * VIEW_WIDE), Math.round(50 - 50 * PHONE.h / PHONE.w), Math.round(50 + 50 * VIEW_WIDE), Math.round(50 + 50 * PHONE.h / PHONE.w)]);
  // 1440 학습 화면 지도 칸(약 912×680 = 1.34)보다 넓은 비율까지 본다
  assert.ok(VIEW_WIDE >= 912 / 680);
  // 앱 맞춤은 여백 없이(fitView 의 기본 pad 0) — 그래서 보이는 범위가 상자 그대로에서 짧은 축 쪽만 늘어난다
  assert.match(fs.readFileSync(path.join(root, 'src/app/map/view.ts'), 'utf8'), /export function fitView\(box: Box, size: Size, pad: Pad = NO_PAD/);
});

test('섬 상자 범위(E5 검수): 파이프라인 isleRange 와 앱 isleRange 가 같은 상자 — 16px 를 지키는 한 가까운 덩어리부터, 지키지 못하는 덩어리는 건너뛴다', () => {
  // 덩어리 셋: 큰 섬(0,0~4000,3000) · 가까운 작은 섬(동쪽 1km) · 먼 작은 섬(동쪽 40km)
  const parts = [{ box: [0, 0, 4000, 3000], a: 9e6 }, { box: [5000, 0, 6000, 800], a: 5e5 }, { box: [44000, 0, 45000, 900], a: 6e5 }];
  for (const r of [300, 600, 1200, 3000, 4000]) {
    const a = isleRange(parts, r), b = appIsleRange(parts as never, r);
    assert.deepEqual(a, b, `r ${r}`);
    const w = a[2] - a[0], h = a[3] - a[1], m = Math.max(w, h) * INSET.pad;
    const px = Math.round(2 * r * Math.min(INSET.w / (w + 2 * m), INSET.h / (h + 2 * m)));
    // 가장 큰 덩어리만으로 16px 이상이면 결과도 16px 이상
    if (Math.round(2 * r * Math.min(INSET.w / 4960, INSET.h / 4960)) >= TAP_FAIL) assert.ok(px >= TAP_FAIL, `r ${r}: ${px}px`);
  }
  // r 600: 가까운 섬은 들고(16px 이상) 먼 섬은 빠진다(r 3000 도 먼 섬까지 넣으면 13.8px 라 빠짐). r 4000: 먼 섬까지(18.4px)
  assert.deepEqual(isleRange(parts, 600), [0, 0, 6000, 3000]);
  assert.deepEqual(isleRange(parts, 3000), [0, 0, 6000, 3000]);
  assert.deepEqual(isleRange(parts, 4000), [0, 0, 45000, 3000]);
  // 차례: 가운데가 가까운 덩어리부터(먼 섬을 먼저 넣어 가까운 섬이 빠지지 않게)
  assert.deepEqual(isleRange([parts[2], parts[1], parts[0]], 600), [0, 0, 6000, 3000]);
});

/* ---------- E7: 인천·경기 동 공개 기준(decisions — 계획서 E7 완료 조건 1·2·3) ---------- */
const unitOf = (key: string, code: string): UnitFile => read(path.join(dir, 'emd', `${code}.json`));
const comps = (ids: string[], nb: Record<string, string[]>) => {
  const set = new Set(ids), seen = new Set<string>();
  let c = 0;
  for (const s of ids) {
    if (seen.has(s)) continue;
    c++;
    const st = [s];
    seen.add(s);
    while (st.length) { const v = st.pop()!; for (const w of nb[v] ?? []) if (set.has(w) && !seen.has(w)) { seen.add(w); st.push(w); } }
  }
  return c;
};

test('E7 공개 기준: 동 공개 지역의 모든 과는 맞닿아 이어진다(섬 상자·땅으로 맞닿은 곳이 없는 섬만 예외) · 8곳 과는 숫자 가족을 지키다 생긴 안양시 만안구 2과 하나 · 단원 파일 40KB 이하', () => {
  const big: string[] = [];
  for (const key of emdLive) for (const u of (units.emdUnits ?? {})[key] as UnitIndex[]) {
    const j = unitOf(key, u.code), nm = nameIn(j);
    for (const l of j.lessons) {
      // 섬 상자 곳과, 단원 안에서 맞닿은 동이 하나도 없는 곳(섬·다른 단원에 둘러싸인 곳)은 빼고 잰다
      const main = l.items.filter((id) => !(l.insets ?? []).includes(id) && (j.neighbors[id] ?? []).length);
      assert.ok(!main.length || comps(main, j.neighbors) === 1, `${j.ko} ${l.no}과 ${l.title}: 맞닿지 않은 곳이 섞임(${l.items.map((id) => nm[id]).join(',')})`);
      assert.ok(l.items.length <= 8, `${j.ko} ${l.no}과 ${l.items.length}곳`);
      if (l.items.length === 8) big.push(`${j.ko} ${l.no}과`);
    }
    const gz = zlibGz(fs.readFileSync(path.join(dir, 'emd', `${u.code}.topo.json`)));
    assert.ok(gz <= 40 * 1024, `${j.ko} 단원 지도 gz ${(gz / 1024).toFixed(1)}KB > 40KB(계획서 7절)`);
  }
  assert.deepEqual(big, ['안양시 만안구 2과']);
  const manan = unitOf('gyeonggi', '41171'), nmM = nameIn(manan);
  assert.deepEqual(manan.lessons[1].items.map((id) => nmM[id]), ['안양1동', '안양2동', '안양3동', '안양4동', '안양5동', '안양6동', '안양7동', '명학동']);
});

test('E7 섬 과: 강화군 교동·삼산·서도는 섬 과 하나(서도면은 먼 섬이지만 과·화면에 보이는 범위 안이라 본 지도) · 옹진군 7곳 섬 과 · 안산 단원구 대부동은 가까운 과의 섬 상자', () => {
  const gh = unitOf('incheon', '28710'), nmG = nameIn(gh);
  const isle = gh.lessons.find((l) => l.title === '섬')!;
  assert.deepEqual(isle.items.map((id) => nmG[id]).sort(), ['교동면', '삼산면', '서도면']);
  // E7 검수: 서도면을 섬 상자에 두면 제자리가 본 지도에 '이번 과 아님' 색으로 또 그려지고 눌러도 정답이 되지 않았다 → 본 지도(16px 는 지킴)
  assert.deepEqual([isle.insets ?? [], gh.screens.map((s) => s.insets ?? [])], [[], [[]]]);
  assert.ok(isle.minTapPx >= TAP_FAIL && gh.screens[0].minTapPx >= TAP_FAIL);
  const seodo = isle.items.find((id) => nmG[id] === '서도면')!, [lon, lat] = gh.labels[seodo];
  assert.ok(lon >= isle.fit[0] && lon <= isle.fit[2] && lat >= isle.fit[1] && lat <= isle.fit[3], '서도면 이름표 점이 3과 범위 안');
  assert.ok(lon >= gh.fit[0] && lon <= gh.fit[2] && lat >= gh.fit[1] && lat <= gh.fit[3], '단원 전체 지도(단원 쪽·둘러보기) 범위에도 서도면 — 폰에서 잘리지 않게');
  assert.equal(gh.lessons.length, 3);
  const oj = unitOf('incheon', '28720');
  assert.deepEqual([oj.lessons.length, oj.lessons.map((l) => l.items.length), oj.lessons.map((l) => l.insets?.length ?? 0)], [3, [2, 2, 3], [0, 0, 3]]);
  const dw = unitOf('gyeonggi', '41273'), nmD = nameIn(dw);
  const withDaebu = dw.lessons.find((l) => l.items.some((id) => nmD[id] === '대부동'))!;
  assert.deepEqual((withDaebu.insets ?? []).map((id) => nmD[id]), ['대부동']);
  assert.ok(withDaebu.items.length > 1, '대부동은 혼자 과가 아니다');
});

test('E7 과 이름: 과가 2~3개라 둘러싸일 수 없는 단원의 가운데 띠는 \'가운데\' 검사를 지날 때만 \'가운데\'(시흥시 2과) · 화성시 만세구는 끊긴 과 없이 3과', () => {
  const sh = unitOf('gyeonggi', '41390'), nm = nameIn(sh);
  assert.deepEqual(sh.lessons.map((l) => l.title), ['북동쪽', '가운데', '남서쪽']);
  assert.ok(['배곧1동', '월곶동', '군자동'].every((n) => sh.lessons[1].items.some((id) => nm[id] === n)));
  const ms = unitOf('gyeonggi', '41591'), nmS = nameIn(ms);
  const together = (a: string, b: string) => ms.lessons.some((l) => [a, b].every((n) => l.items.some((id) => nmS[id] === n)));
  assert.ok(!together('송산면', '새솔동'), '맞닿지 않은 송산면·새솔동이 한 과에 있지 않다');
  assert.ok(together('새솔동', '남양읍'), '새솔동은 맞닿은 남양읍과');
  // 넓은 화면(E7 검수): 다시 합친 뒤 '북서쪽'이 송산면·새솔동 2곳뿐이던 것을 맞닿은 화면에서 넘겨받아 5·5(전체 연습 문제가 둘 중 하나 고르기가 되지 않게)
  assert.deepEqual(ms.screens.map((s) => s.items.length), [5, 5]);
  assert.ok(ms.screens.every((s) => s.minTapPx >= TAP_FAIL));
});

test('E7 넓은 화면·섞인 과 이름: 동 공개 지역에 3곳 이하 넓은 화면이 없다(단원 전체가 한 화면이거나 섬 화면만 예외) · 섞인 과는 곳이 많은 무리 이름으로 짝 지음(김포·남양주)', () => {
  const small: string[] = [];
  for (const key of emdLive) for (const u of (units.emdUnits ?? {})[key] as UnitIndex[]) {
    const j = unitOf(key, u.code);
    for (const s of j.screens) if (j.screens.length > 1 && s.key !== 'islands' && s.items.length <= 3) small.push(`${j.ko} ${s.ko} ${s.items.length}곳`);
  }
  assert.deepEqual(small, []);
  // 김포 3과(장기·김포본·사우·풍무동 + 고촌읍)는 동이 많아 '시내'의 짝 — 1과에 '시내'만 붙이면 동 8곳 전부로 읽혔다
  assert.deepEqual(unitOf('gyeonggi', '41570').lessons.map((l) => l.title), ['시내 북서쪽', '읍·면', '시내 남동쪽']);
  // 남양주 3과(별내동 + 별내면·퇴계원·진건·오남·진접)는 읍·면이 많아 '읍·면'의 짝
  assert.deepEqual(unitOf('gyeonggi', '41360').lessons.map((l) => l.title), ['시내', '읍·면 남동쪽', '읍·면 북서쪽']);
});

/* ---------- D2 섬 상자(2026-11-16 사용자 결정 '가까운 섬 무리는 본 지도 한 장으로(칸 크기 다시 잼), 정말 먼 섬(흑산면 등)만 상자') ---------- */

// 가짜 동(북쪽이 위인 미터): 가운데 (x, y), 상자 반폭 h, 내접원 r. far 면 지역 표 far 규칙으로 덩어리가 모두 먼 섬(near 없음)
const fakeDong = (id: string, ko: string, x: number, y: number, h: number, r: number, o: { far?: boolean; near?: number[]; nb?: string[] } = {}) => {
  const main = [x - h, y - h, x + h, y + h];
  return { id, ko, kind: ko.endsWith('면') ? '면' : '동', x, y, r, area: (2 * h) ** 2, c: [x, y], box: { main, near: o.far ? null : (o.near ?? main), isle: main }, nb: o.nb ?? [], out: [], outer: true };
};
type Built = { lessons: { ids: string[]; insets: string[]; box: number[]; minTapPx: number }[]; screens: { insets: string[]; minTapPx: number }[]; view: number[]; stats: { far: number; kept: number } };
const build = (U: unknown) => buildUnit(U) as Built;

test('D2 섬 상자 규칙(emd-lib nearToMain): 먼 섬(지역 표 far 규칙 — near 없음)만 상자, 가까운 섬은 본 지도 한 장 · 본 지도에서 16px 를 못 지키면 가까운 섬도 상자에 남는다', () => {
  // 서로 맞닿지 않은 가까운 섬 넷(1km 사이) + 45km 서쪽 먼 섬 하나 — 모두 섬이라 섬 과 하나·섬 화면 하나
  const isl = (r: number) => ({ code: '99999', ko: '시험군', dongs: [
    fakeDong('a', '가면', 0, 0, 2000, r), fakeDong('b', '나면', 5000, 0, 2000, r), fakeDong('c', '다면', 0, 5000, 2000, r), fakeDong('d', '라면', 5000, 5000, 2000, r),
    fakeDong('f', '마면', -45000, 2500, 2000, 1500, { far: true }),
  ] });
  const ok = build(isl(1000));
  assert.deepEqual([ok.lessons.map((l) => l.insets), ok.screens.map((s) => s.insets)], [[['f']], [['f']]], '먼 섬만 상자');
  assert.ok(ok.lessons[0].minTapPx >= TAP_FAIL && ok.screens[0].minTapPx >= TAP_FAIL);
  assert.deepEqual(ok.view, [-2000, -2000, 7000, 7000], '단원 범위는 상자에 남은 먼 섬을 뺀다');
  assert.deepEqual([ok.stats.far, ok.stats.kept], [1, 0]);
  // 섬이 작아(내접원 120m) 본 지도 한 장에서 16px 를 못 지키면 그대로 섬마다 상자(옹진 꼴 — 일부만 옮기지 않는다)
  const small = build(isl(120));
  assert.deepEqual(small.lessons.map((l) => [...l.insets].sort()), [['a', 'b', 'c', 'd', 'f']]);
  assert.deepEqual([small.stats.far, small.stats.kept], [1, 4]);
  // 땅 과에 붙은 가까운 섬 하나: 본 지도로 옮겨 16px 를 지키면 옮기고(전에는 섬 상자), 못 지키면 상자에 남는다(영광 낙월면·부안 위도면 꼴)
  const withIsle = (gap: number, r: number) => ({ code: '99997', ko: '시험시', dongs: [
    fakeDong('p', '가동', 0, 0, 1500, 900, { nb: ['q'] }), fakeDong('q', '나동', 3000, 0, 1500, 900, { nb: ['p', 'r'] }), fakeDong('r', '다동', 6000, 0, 1500, 900, { nb: ['q'] }),
    fakeDong('s', '라면', 6000, -1500 - gap - 1500, 1500, r),
  ] });
  const near = build(withIsle(16000, 900)), far = build(withIsle(16000, 200));
  assert.deepEqual([near.lessons.flatMap((l) => l.insets), near.stats.kept], [[], 0], '옮겨도 16px — 본 지도');
  assert.deepEqual([far.lessons.flatMap((l) => l.insets), far.stats.kept], [['s'], 1], '옮기면 16px 미만 — 상자에 남음');
});

test('과 범위 끝 덩어리(emd-lib edgeFit — 서귀포시 2과): 보이는 범위 안의 같은 곳 덩어리는 칸 축척이 거의 그대로일 때만 과 범위에 넣는다', () => {
  // 가로로 긴 세 동(맞닿음), 나동의 섬 조각이 남쪽 범위 밖 dy 에
  const land = (dy: number, wide: boolean) => ({ code: '99998', ko: '시험시', dongs: [
    fakeDong('p', '가동', 0, 0, 1500, 700, { nb: ['q'] }), fakeDong('q', '나동', 3000, 0, 1500, 700, { nb: ['p', 'r'], near: [1500, -1500 - dy, 4500, 1500] }),
    fakeDong('r', '다동', wide ? 6000 : 3000, wide ? 0 : 3000, 1500, 700, { nb: ['q'] }),
  ] });
  // 짧은 변의 20%: 폰 축척 그대로(가로가 긴 변)·넓은 칸(4:3) 축척도 0.85배 안 → 넣는다
  assert.deepEqual(build(land(600, true)).lessons[0].box, [-1500, -2100, 7500, 1500]);
  // 네모난 범위면 세로가 늘어 폰 축척이 준다 → 넣지 않는다(main 상자 합 그대로)
  assert.deepEqual(build(land(600, false)).lessons[0].box, [-1500, -1500, 4500, 4500]);
  // 멀리 나간 덩어리(5km): 폰 축척은 그대로지만 넓은 칸 축척이 0.85배 밑 → 넣지 않는다
  assert.deepEqual(build(land(5000, true)).lessons[0].box, [-1500, -1500, 7500, 1500]);
  assert.deepEqual(EDGE_KEEP, { phone: 0.99, wide: 0.85 });
  // 지금 판: 서귀포시 2과 범위의 남쪽 끝이 송산동 섶섬까지(전에는 33.2354 — 섬 조각이 범위 밖 칸 끝에서 반쯤 잘려 보였다)
  const j = read(path.join(dir, 'emd', '50130.json'));
  const l2 = j.lessons.find((l: { no: number }) => l.no === 2);
  assert.ok(l2.fit[1] < 33.23 && l2.minTapPx >= TAP_FAIL, `서귀포시 2과 남쪽 끝 ${l2.fit[1]}`);
});

test('D2 지금 판: 섬 상자에 남은 곳은 먼 섬(신안 흑산면·옹진 백령·대청·연평면·제주시 추자면 — 지역 지도 먼 섬 상자와 같은 규칙)과 16px 때문에 남은 가까운 섬뿐 · 완도군은 상자 없음', () => {
  const got: Record<string, string[]> = {};
  for (const key of emdLive) for (const u of units.emdUnits[key] as UnitIndex[]) {
    const j: UnitFile = read(path.join(dir, 'emd', `${u.code}.json`));
    const ins = new Set([...j.lessons, ...j.screens].flatMap((x) => x.insets ?? []));
    if (ins.size) got[j.ko] = [...ins].map((id) => j.items.find((it) => it.id === id)!.ko).sort();
  }
  assert.deepEqual(got, {
    신안군: ['흑산면'], 제주시: ['추자면'],
    // 16px 때문에 남은 가까운 섬: 옹진 넷(본 지도 한 장이면 자월면 10px — 결정표 D2 멈춤), 여수 '섬' 화면(남면·삼산면 — 본 지도 13px), 삼산면·낙월면·대부동·위도면(땅 과에 붙인 섬)
    옹진군: ['대청면', '덕적면', '백령면', '북도면', '연평면', '영흥면', '자월면'],
    여수시: ['남면', '삼산면'], 영광군: ['낙월면'], '안산시 단원구': ['대부동'], 부안군: ['위도면'],
  });
});
