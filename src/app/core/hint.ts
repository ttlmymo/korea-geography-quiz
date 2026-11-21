// 찾기 힌트 두 단계(docs/HINT_PLAN_2026-11-16.md, 2026-11-21 사용자 지시 '5가지 전부 실행' 2번).
// 1단계 = 말로 된 단서: 이미 아는 곳(기준 칸)을 점선으로 두르고 '정답은 그곳의 ○쪽 옆이에요'. 정답 이름은 문제에 이미 있으니 숨길 것이 없다.
// 2단계 = 후보 좁히기: 정답과 가까운 곳만 밝게 남긴다(전의 힌트). 그리기를 모른다 — 지도·글은 ui/play.ts 가 맡는다
import type { Registry, Dir8 } from '../registry.ts';

/** 기준 칸을 고른 까닭: 이번 판에서 본 곳 · 잘 아는 곳(상자 3 이상) · 이번 과의 다른 곳 · 맞닿은 곳이 없어 가장 가까운 곳 */
export type RefWhy = 'round' | 'known' | 'scope' | 'near';

export interface HintRef {
  ref: string;
  dir: Dir8;          // 기준 칸에서 본 정답 쪽
  adjacent: boolean;  // 맞닿았으면 '옆', 아니면 '방향'
  why: RefWhy;
}

/** 잘 아는 곳으로 보는 상자 */
export const KNOWN_BOX = 3;

/**
 * 기준 칸 고르기. 차례(앞에서 찾으면 멈춤, 정답은 늘 뺀다):
 * ① 이번 판에서 본 곳(만난 곳·맞힌 곳) 가운데 정답과 맞닿은 곳 ② 상자 3 이상(잘 아는 곳) 가운데 맞닿은 곳
 * ③ 이번 범위(과·화면)의 곳 가운데 맞닿은 곳 ④ 맞닿은 곳이 없으면 범위 안에서 가장 가까운 곳(방향만).
 * 기준으로 쓰지 않을 곳(섬 상자 안 — 상자 자리는 실제 방위와 달라 방향 문장이 틀린다)은 skip 으로 뺀다.
 * 같은 무리 안에서는 가까운 곳, 거리가 같으면 id 차례 — 같은 입력이면 늘 같은 답
 */
export function pickHintRef(reg: Registry, target: string, scope: readonly string[], seen: ReadonlySet<string>, boxOf: (id: string) => number, skip: ReadonlySet<string> = new Set()): HintRef | null {
  const cands = scope.filter((id) => id !== target && !skip.has(id));
  if (!cands.length) return null;
  const order = (a: string, b: string) => reg.dist(target, a) - reg.dist(target, b) || (a < b ? -1 : a > b ? 1 : 0);
  const adj = cands.filter((id) => reg.adjacent(id, target)).sort(order);
  const tiers: [RefWhy, string[]][] = [
    ['round', adj.filter((id) => seen.has(id))],
    ['known', adj.filter((id) => boxOf(id) >= KNOWN_BOX)],
    ['scope', adj],
  ];
  for (const [why, list] of tiers) if (list.length) return { ref: list[0], dir: reg.dir8(list[0], target), adjacent: true, why };
  const near = [...cands].sort(order)[0];
  return { ref: near, dir: reg.dir8(near, target), adjacent: false, why: 'near' };
}

/**
 * 2단계 후보: 정답 + 정답과 가까운 곳. 남기는 다른 곳은 범위가 4곳 이상이면 2곳, 3곳이면 1곳, 2곳 이하면 0곳
 * (전에는 늘 2곳이라 3곳짜리 과에서는 아무것도 줄지 않았다 — HINT_PLAN 1절)
 */
export function narrowCandidates(reg: Registry, target: string, scope: readonly string[]): string[] {
  const others = scope.filter((id) => id !== target);
  const keep = Math.min(2, Math.max(0, scope.length - 2));
  const near = [...others].sort((a, b) => reg.dist(target, a) - reg.dist(target, b) || (a < b ? -1 : 1)).slice(0, keep);
  return [target, ...near];
}

/** 이번 판에서 본 곳: 지금 문제 앞의 만나기 + 이미 맞힌 답(힌트 없이든 있든). 기준 칸 ①의 재료 */
export function seenInRound(queueBefore: readonly { mode: string; id: string }[], log: readonly { id: string; result: string }[]): Set<string> {
  const s = new Set<string>();
  for (const q of queueBefore) if (q.mode === 'meet') s.add(q.id);
  for (const a of log) if (a.result === 'correct') s.add(a.id);
  return s;
}
