// 키보드로 지도 칸 고르기(2026-11-21 평가 4번 — 전에는 키보드로 만나기·찾기를 풀 수 없었다: 지도에 초점이 가지 않았다).
// 지도에 초점을 두면 '커서 칸'이 생기고, 화살표로 그 방향의 가까운 칸으로 옮겨 Enter·Space 로 누른다. 그리기를 모른다(ui/play.ts 가 지도에 그린다)
import type { Registry, Dir8 } from '../registry.ts';

export type Arrow = 'up' | 'down' | 'left' | 'right';

/** 화살표마다 받아 주는 방위(정방향 + 양옆 대각). 정방향이 아니면 거리를 1.5배로 쳐서 정방향 칸이 먼저 */
const SETS: Record<Arrow, [Dir8, Dir8, Dir8]> = { up: ['N', 'NE', 'NW'], down: ['S', 'SE', 'SW'], left: ['W', 'NW', 'SW'], right: ['E', 'NE', 'SE'] };

export const arrowOf = (key: string): Arrow | null =>
  key === 'ArrowUp' ? 'up' : key === 'ArrowDown' ? 'down' : key === 'ArrowLeft' ? 'left' : key === 'ArrowRight' ? 'right' : null;

/** from 에서 arrow 쪽의 가장 가까운 칸(범위 안). 그쪽에 칸이 없으면 from 그대로 */
export function moveCursor(reg: Registry, from: string, scope: readonly string[], arrow: Arrow): string {
  const [main, a, b] = SETS[arrow];
  let best = from, score = Infinity;
  for (const id of scope) {
    if (id === from) continue;
    const d = reg.dir8(from, id);
    if (d !== main && d !== a && d !== b) continue;
    const s = reg.dist(from, id) * (d === main ? 1 : 1.5);
    if (s < score || (s === score && id < best)) { best = id; score = s; }
  }
  return best;
}

/** 처음 커서 칸: 범위 가운데쯤(다른 칸들까지 거리 합이 가장 작은 칸) — 어느 쪽으로든 화살표가 먹게 */
export function startCursor(reg: Registry, scope: readonly string[]): string | null {
  let best: string | null = null, sum = Infinity;
  for (const id of scope) {
    const s = scope.reduce((t, o) => t + (o === id ? 0 : reg.dist(id, o)), 0);
    if (s < sum || (s === sum && best !== null && id < best)) { best = id; sum = s; }
  }
  return best;
}
