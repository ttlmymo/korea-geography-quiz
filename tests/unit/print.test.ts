// 인쇄용 백지도(R1 — docs/LEARNING_PLAN_DETAIL_2026-11-21.md 2절): 번호·인쇄 크기·번호 글자·전국 시·도 지도·어긋남 검사.
// 진짜 경계 데이터(src/data/svg · 판 sido.topo.json)로 16개 지역과 전국이 모두 번호가 겹치지 않고 칸에 드는지 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildPrintMap, clipToData, koreaSvg, mmPerUnit, numberPt, MAP_H_MM, MAP_W_MM, NUM_MIN_PT, NUM_PT, type SidoTopo } from '../../src/lib/print-core.ts';

const root = path.join(import.meta.dirname, '../..');
const read = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const consts = fs.readFileSync(path.join(root, 'src/consts.ts'), 'utf8');
const VER = (consts.match(/DATA_VER\s*=\s*'([^']+)'/) ?? [])[1];
const units: { regions: { key: string; items: { id: string; ko: string }[] }[] } = read(`public/data/geo/${VER}/units.json`);
const sidoRows: { code: string; key: string; ko: string; en: string; full: string; hub: unknown }[] = read('src/data/sido.json').sidos;

test('인쇄 크기: 폭·높이 중 먼저 차는 쪽에 맞춘다', () => {
  assert.equal(mmPerUnit(1000, 100), MAP_W_MM / 1000);       // 납작한 지도는 폭에 맞춤
  assert.equal(mmPerUnit(1000, 2000), MAP_H_MM / 2000);      // 길쭉한 지도는 높이에 맞춤
  assert.ok(1000 * mmPerUnit(1000, 1640) <= MAP_W_MM + 1e-9 && 1640 * mmPerUnit(1000, 1640) <= MAP_H_MM + 1e-9);
});

test('번호 글자: 넉넉하면 8pt, 좁으면 줄이고, 너무 좁으면 null', () => {
  assert.equal(numberPt(10, 2), NUM_PT);
  const small = numberPt(1.9, 2);
  assert.ok(small !== null && small < NUM_PT && small >= NUM_MIN_PT, String(small));
  assert.equal(numberPt(0.8, 2), null);
  assert.equal(numberPt(0, 1), null);
  // 자릿수가 많을수록 같은 칸에서 글자가 작다
  assert.ok(numberPt(2.2, 1)! > numberPt(2.2, 2)!);
});

test('경계 밖 조각 빼기: 데이터 범위 밖 시작점의 조각은 버린다', () => {
  assert.equal(clipToData('M10 10L20 20ZM2000 5L2010 5Z', 1000, 1000), 'M10 10L20 20Z');
  assert.equal(clipToData('', 1000, 1000), '');
});

const grid = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `kr:t:${i}`, d: `M${i} 0L${i + 1} 0L${i} 1Z`, lx: 10 + i, ly: 10, ir: 20 }));
const names = (ids: string[], ko: string[]) => ids.map((id, i) => ({ id, ko: ko[i], en: `e${i}` }));

test('번호는 한국어 가나다 차례로 1부터, 영어도 같은 번호', () => {
  const items = grid(3);
  const m = buildPrintMap('t', { w: 1000, h: 800 }, items, names(items.map((x) => x.id), ['다', '가', '나']), '', '');
  assert.deepEqual(m.cells.map((c) => [c.no, c.ko]), [[1, '가'], [2, '나'], [3, '다']]);
  assert.deepEqual(m.cells.map((c) => c.en), ['e1', 'e2', 'e0']);   // 가→e1, 나→e2, 다→e0: 영어 이름은 곳을 따라간다
});

test('이름과 칸이 어긋나면 멈춘다(조용히 빠뜨리지 않음)', () => {
  const items = grid(3);
  const ids = items.map((x) => x.id);
  assert.throws(() => buildPrintMap('t', { w: 1000, h: 800 }, items, names(ids.slice(0, 2), ['가', '나']), '', ''), /어긋남/);          // 이름 없는 칸
  assert.throws(() => buildPrintMap('t', { w: 1000, h: 800 }, items.slice(0, 2), names(ids, ['가', '나', '다']), '', ''), /어긋남/);    // 칸 없는 이름
  assert.throws(() => buildPrintMap('t', { w: 1000, h: 800 }, [...items, items[0]], names(ids, ['가', '나', '다']), '', ''), /겹침/);   // 같은 칸 둘
  const off = grid(2); off[1].lx = 5000;
  assert.throws(() => buildPrintMap('t', { w: 1000, h: 800 }, off, names(off.map((x) => x.id), ['가', '나']), '', ''), /지도 밖/);       // 번호 점이 밖
});

test('칸이 아주 좁으면 tight 에 올라간다', () => {
  const items = grid(2); items[1].ir = 0.5;
  const m = buildPrintMap('t', { w: 1000, h: 800 }, items, names(items.map((x) => x.id), ['가', '나']), '', '');
  assert.deepEqual(m.tight, [items[1].id]);
});

/** 실제 자료: 지역마다 이름과 칸이 일치하고 번호 점이 지도 안, 번호가 모두 칸에 든다 */
const svgKeys = fs.readdirSync(path.join(root, 'src/data/svg')).map((f) => f.replace(/\.json$/, '')).filter((k) => k !== 'incheon-before');
test('지역 16곳 모두: 칸 수 = 이름 수, 번호 1..N 이 겹치지 않음', () => {
  assert.equal(svgKeys.length, 16);
  for (const k of svgKeys) {
    const svg = read(`src/data/svg/${k}.json`);
    const r = units.regions.find((x) => x.key === k);
    assert.ok(r, `${k}: 판에 지역이 없음`);
    const m = buildPrintMap(k, svg, svg.items, r!.items.map((it) => ({ id: it.id, ko: it.ko, en: it.id })), svg.out, svg.water);
    assert.equal(m.cells.length, r!.items.length, k);
    assert.deepEqual(m.cells.map((c) => c.no), r!.items.map((_, i) => i + 1), `${k}: 번호가 1..N 이 아님`);
    assert.equal(new Set(m.cells.map((c) => c.id)).size, m.cells.length, k);
  }
});

test('지역 지도: 번호가 안 드는 칸은 없다(있으면 쪽에 안내 문장이 나가므로 일부러 올린 값만 허용)', () => {
  // 11-21 측정: 전남광주 12270 이 가장 좁다(작은 글자로 든다). 5pt 에도 못 드는 칸이 생기면 이 시험이 알린다
  for (const k of svgKeys) {
    const svg = read(`src/data/svg/${k}.json`);
    const r = units.regions.find((x) => x.key === k)!;
    const m = buildPrintMap(k, svg, svg.items, r.items.map((it) => ({ id: it.id, ko: it.ko, en: it.id })), svg.out, svg.water);
    assert.deepEqual(m.tight, [], `${k}: 번호가 안 드는 칸 ${m.tight.join(', ')}`);
  }
});

test('지역 지도: 번호 둘이 서로 겹치지 않는다(글자 상자 기준)', () => {
  for (const k of svgKeys) {
    const svg = read(`src/data/svg/${k}.json`);
    const r = units.regions.find((x) => x.key === k)!;
    const m = buildPrintMap(k, svg, svg.items, r.items.map((it) => ({ id: it.id, ko: it.ko, en: it.id })), svg.out, svg.water);
    // 종이 mm 에서 글자 상자(폭 0.58·크기·자릿수, 높이 0.72·크기)가 서로 겹치는지
    const box = m.cells.map((c) => {
      const fs = c.pt! * (25.4 / 72);
      const w = 0.58 * fs * String(c.no).length, h = 0.72 * fs;
      return { id: c.id, x: c.lx * m.mm, y: c.ly * m.mm, w, h };
    });
    for (let i = 0; i < box.length; i++) for (let j = i + 1; j < box.length; j++) {
      const a = box[i], b = box[j];
      const hit = Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
      assert.ok(!hit, `${k}: 번호 ${a.id} 와 ${b.id} 가 겹침`);
    }
  }
});

test('전국 시·도 지도: 16곳, 경로가 있고 번호 점이 지도 안, 번호가 칸에 든다', () => {
  const topo: SidoTopo = read(`public/data/geo/${VER}/sido.topo.json`);
  const sv = koreaSvg(topo);
  assert.equal(sv.w, 1000);
  assert.ok(sv.h > 800 && sv.h < 1200, `높이 ${sv.h}`);
  assert.equal(sv.items.length, 16);
  assert.ok(sv.out.length > 0, '북한 땅이 비어 있음');
  const nm = sv.items.map((it) => {
    const row = sidoRows.find((s) => s.code === it.code);
    assert.ok(row, `${it.code}: 지역 표에 없음`);
    return { id: it.id, ko: row!.ko, en: row!.en };
  });
  const m = buildPrintMap('korea', sv, sv.items, nm, sv.out, '', false);
  assert.equal(m.cells.length, 16);
  assert.deepEqual(m.tight, [], `번호가 안 드는 시·도 ${m.tight.join(', ')}`);
  for (const c of m.cells) {
    assert.ok(c.d.startsWith('M') && c.d.length > 20, `${c.ko}: 경로가 비어 있음`);
    assert.ok(c.lx > 0 && c.lx < sv.w && c.ly > 0 && c.ly < sv.h, `${c.ko}: 번호 점이 지도 밖`);
  }
  // 정답표에 정식 이름을 덧붙이는 곳은 짧은 이름과 다른 곳뿐(광주특별시 = 전남광주통합특별시)
  const withFull = m.cells.filter((c) => c.full).map((c) => c.ko);
  for (const c of m.cells) assert.equal(!!c.full, false, `${c.ko}: 이 시험은 buildPrintMap 입력에 full 을 안 넣었다`);
  assert.deepEqual(withFull, []);
});

test('전국 시·도 지도: 먼 섬 조각을 줄여도 경로 크기가 한 쪽에 싣기에 적당하다', () => {
  const topo: SidoTopo = read(`public/data/geo/${VER}/sido.topo.json`);
  const sv = koreaSvg(topo);
  const bytes = sv.items.reduce((s, it) => s + it.d.length, 0) + sv.out.length;
  assert.ok(bytes < 150_000, `경로 ${bytes} 글자 — 한 쪽에 너무 큼`);
});

test('먼 섬(경북 울릉군)은 점선 상자로 옮겨 그리고, 다른 지역에는 상자가 없다', () => {
  for (const k of svgKeys) {
    const svg = read(`src/data/svg/${k}.json`);
    const r = units.regions.find((x) => x.key === k)!;
    const m = buildPrintMap(k, svg, svg.items, r.items.map((it) => ({ id: it.id, ko: it.ko, en: it.id })), svg.out, svg.water);
    assert.equal(m.insets.length, k === 'gyeongbuk' ? 1 : 0, k);
    const moved = m.cells.filter((c) => c.inset);
    assert.equal(moved.length, m.insets.length, k);
    for (const c of moved) {
      const b = m.insets[0];
      assert.ok(c.lx > b.x && c.lx < b.x + b.w && c.ly > b.y && c.ly < b.y + b.h, `${c.ko}: 번호 점이 상자 밖`);
      // 옮긴 그림 전체가 상자 안
      for (const [, x, y] of c.d.matchAll(/(-?\d+) (-?\d+)/g).map((m2) => [0, +m2[1], +m2[2]])) assert.ok(x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h, `${c.ko}: 그림이 상자 밖`);
      // 상자가 지도 칸의 점과 겹치지 않는다
      const own = svg.items.filter((it: { id: string }) => it.id !== c.id).flatMap((it: { d: string }) => [...it.d.matchAll(/(-?\d+) (-?\d+)/g)].map((q) => [+q[1], +q[2]]));
      assert.ok(!own.some(([x, y]: number[]) => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h), `${k}: 상자가 다른 칸을 덮음`);
    }
  }
});

test('과 백지도(11-21): 모든 지역의 모든 과 — 그 과 곳만 번호, 보이는 범위는 그 과 둘레, 번호가 칸에 들고 겹치지 않음', () => {
  const lessonsOf = (k: string) => (read(`public/data/geo/${VER}/units.json`).regions.find((x: { key: string }) => x.key === k)?.lessons ?? []) as { no: number; items: string[] }[];
  let n = 0;
  const problems: string[] = [];
  for (const k of svgKeys) {
    const svg = read(`src/data/svg/${k}.json`);
    const r = units.regions.find((x) => x.key === k)!;
    for (const l of lessonsOf(k)) {
      n++;
      const m = buildPrintMap(`${k}/${l.no}`, svg, svg.items, r.items.map((it) => ({ id: it.id, ko: it.ko, en: it.id })), svg.out, svg.water, { focus: l.items, maxH: 150 });
      assert.deepEqual(m.cells.map((c) => c.id).sort(), [...l.items].sort(), `${k} ${l.no}과`);
      assert.ok(m.ctx.every((c) => !l.items.includes(c.id)), `${k} ${l.no}과: 맥락 칸에 과 곳이 섞임`);
      assert.ok(m.w * m.mm <= 180 + 1e-6 && m.h * m.mm <= 150 + 1e-6, `${k} ${l.no}과: 종이 크기 넘음`);
      if (m.tight.length) problems.push(`${k} ${l.no}과 번호 안 듦 ${m.tight.join(',')}`);
      const [vx, vy, vw, vh] = m.vb;
      for (const c of m.cells) if (!(c.lx >= vx && c.lx <= vx + vw && c.ly >= vy && c.ly <= vy + vh)) problems.push(`${k} ${l.no}과 ${c.id} 번호 점이 범위 밖`);
      const box = m.cells.map((c) => { const fs = (c.pt ?? 5) * (25.4 / 72); return { id: c.id, x: c.lx * m.mm, y: c.ly * m.mm, w: 0.58 * fs * String(c.no).length, h: 0.72 * fs }; });
      for (let i = 0; i < box.length; i++) for (let j = i + 1; j < box.length; j++) {
        const a = box[i], b = box[j];
        if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2) problems.push(`${k} ${l.no}과 번호 겹침 ${a.id}·${b.id}`);
      }
    }
  }
  assert.ok(n >= 50, `과 ${n}개`);
  assert.deepEqual(problems, []);
});
