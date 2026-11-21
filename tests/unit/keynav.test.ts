// 키보드로 지도 칸 고르기(core/keynav.ts, 11-21 평가 4번)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reg } from './fixtures.ts';
import { arrowOf, moveCursor, startCursor } from '../../src/app/core/keynav.ts';

const seoul = reg.region('seoul')!;
const idOf = (ko: string) => seoul.items.find((it) => it.ko === ko)!.id;
const all = seoul.items.map((it) => it.id);

test('화살표 키 이름', () => {
  assert.equal(arrowOf('ArrowUp'), 'up');
  assert.equal(arrowOf('ArrowRight'), 'right');
  assert.equal(arrowOf('Enter'), null);
});

test('그 방향의 가까운 칸으로 옮긴다: 용산구에서 위 → 한강 북쪽, 아래 → 한강 남쪽', () => {
  const ys = idOf('용산구');
  const up = moveCursor(reg, ys, all, 'up'), down = moveCursor(reg, ys, all, 'down');
  assert.ok(['N', 'NE', 'NW'].includes(reg.dir8(ys, up)), reg.place(up)!.item.ko);
  assert.ok(['S', 'SE', 'SW'].includes(reg.dir8(ys, down)), reg.place(down)!.item.ko);
});

test('그쪽에 칸이 없으면 제자리, 범위 밖 칸으로는 가지 않는다', () => {
  // 서울 가장 북쪽 끝(도봉구)에서 위로
  const db = idOf('도봉구');
  assert.equal(moveCursor(reg, db, all, 'up'), db);
  const l1 = reg.lesson('seoul', 1)!.items;
  for (const a of ['up', 'down', 'left', 'right'] as const) for (const id of l1) assert.ok(l1.includes(moveCursor(reg, id, l1, a)));
});

test('네 방향으로 다니면 1과 여섯 곳에 모두 닿는다', () => {
  const l1 = reg.lesson('seoul', 1)!.items;
  const seen = new Set<string>([startCursor(reg, l1)!]);
  let frontier = [...seen];
  while (frontier.length) {
    const nx: string[] = [];
    for (const id of frontier) for (const a of ['up', 'down', 'left', 'right'] as const) { const m = moveCursor(reg, id, l1, a); if (!seen.has(m)) { seen.add(m); nx.push(m); } }
    frontier = nx;
  }
  assert.equal(seen.size, l1.length);
});

test('처음 커서는 범위 안, 범위가 비면 null', () => {
  const l1 = reg.lesson('seoul', 1)!.items;
  assert.ok(l1.includes(startCursor(reg, l1)!));
  assert.equal(startCursor(reg, []), null);
});

import { geo } from './fixtures.ts';
test('모든 지역의 모든 과·화면에서 화살표로 모든 칸에 닿는다(키보드로 못 고르는 칸이 없다)', () => {
  const reach = (scope: string[]) => {
    const seen = new Set<string>([startCursor(reg, scope)!]);
    let frontier = [...seen];
    while (frontier.length) {
      const nx: string[] = [];
      for (const id of frontier) for (const a of ['up', 'down', 'left', 'right'] as const) { const m = moveCursor(reg, id, scope, a); if (!seen.has(m)) { seen.add(m); nx.push(m); } }
      frontier = nx;
    }
    return seen;
  };
  const stuck: string[] = [];
  for (const r of geo.units.regions) {
    for (const l of r.lessons) { const s = reach(l.items); if (s.size !== l.items.length) stuck.push(`${r.key} ${l.no}과: ${l.items.filter((x) => !s.has(x)).join(',')}`); }
    for (const sc of r.screens) { const s = reach(sc.items); if (s.size !== sc.items.length) stuck.push(`${r.key} ${sc.key}: ${sc.items.filter((x) => !s.has(x)).join(',')}`); }
  }
  assert.deepEqual(stuck, []);
});
