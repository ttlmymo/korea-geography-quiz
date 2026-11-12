// 판정(설계서 3.5·3.6). 그리기를 모른다: 지도 층이 누른 점을 재서 TapProbe 로 넘기면 여기서 정한다
import type { Registry, Dir8 } from '../registry.ts';

/** 손가락 반경(px): 이 안에 후보 칸이 둘 이상이면 모호할 수 있다 */
export const FINGER_PX = 12;
/** 누른 점이 한 칸 안쪽으로 이만큼 들어가 있으면 모호하지 않다 */
export const INSET_PX = 6;
/** 모호할 때 누른 곳을 중심으로 키우는 배율 */
export const AMBIGUOUS_ZOOM = 2.5;

export interface TapProbe {
  hit: string | null;      // 누른 점을 품은 칸(밝은 칸·흐린 칸 모두), 없으면 null
  depth: number;           // hit 경계에서 안쪽으로 들어간 거리(px)
  near: string[];          // 누른 점에서 FINGER_PX 안에 걸리는 밝은 칸(hit 포함)
  water: 'river' | 'sea' | null;
}

export type Tap =
  | { type: 'cell'; id: string }
  | { type: 'ambiguous' }   // 키워서 다시 누르게 함 — 시도로 세지 않음
  | { type: 'outside' }     // 이번에 고를 수 없는 칸·바다 — 세지 않음
  | { type: 'river' };      // 한강 띠 — 세지 않음

/** active = 지금 고를 수 있는 밝은 칸 */
export function classifyTap(p: TapProbe, active: ReadonlySet<string>): Tap {
  const inActive = p.hit !== null && active.has(p.hit);
  const near = p.near.filter((id) => active.has(id));
  if (near.length >= 2 && !(inActive && p.depth >= INSET_PX)) return { type: 'ambiguous' };
  if (inActive) return { type: 'cell', id: p.hit as string };
  if (p.hit === null && p.water === 'river') return { type: 'river' };
  return { type: 'outside' };
}

/** 틀렸을 때 정답 기준 방향: 맞닿았으면 '옆', 아니면 '방향'. 방위는 오답에서 본 정답 쪽 */
export interface Wrong { target: string; picked: string; dir: Dir8; adjacent: boolean }

export function wrongInfo(reg: Registry, target: string, picked: string): Wrong {
  return { target, picked, dir: reg.dir8(picked, target), adjacent: reg.adjacent(picked, target) };
}

/** 찾기: 누른 칸이 정답인가. 만나기는 테두리 친 칸만 넘어가고 다른 칸은 안내만 한다(벌점 없음) */
export const isRight = (target: string, tap: Tap) => tap.type === 'cell' && tap.id === target;
