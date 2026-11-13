// 홈 화면 숫자(합본 디자인 3.2): 지역·과의 채움 집계. 지도 색 단계(0 아직 · 1~2 익히는 중 · 3 다 익힘)만 보고 센다.
// 배우는 방식(상자·복습 간격)은 건드리지 않고, 이미 있는 값(fills·isDue)을 화면용으로 묶기만 한다
import type { Registry } from '../registry.ts';
import { get, isDue, type Mastery } from './mastery.ts';

/** 칸 하나의 홈 상태. 'next' = 아직인 곳 가운데 지금 배울 과(다음·첫 과)에 든 곳(지도 노랑) */
export type CellState = 'mastered' | 'learning' | 'next' | 'none';

export function cellState(level: number, inFocus: boolean): CellState {
  if (level >= 3) return 'mastered';
  if (level >= 1) return 'learning';
  return inFocus ? 'next' : 'none';
}

export interface Tally {
  mastered: number;
  learning: number;
  /** 지금 배울 과의 곳 가운데 아직인 곳 */
  next: number;
  /** 그 밖의 아직인 곳 */
  none: number;
  /** 칠한 곳(= 다 익힘 + 익히는 중) */
  filled: number;
  total: number;
}

/** ids 의 곳을 네 칸으로 센다. 네 칸의 합은 언제나 ids 의 수 */
export function tally(ids: string[], fills: Record<string, number>, focus: Iterable<string> = []): Tally {
  const f = new Set(focus);
  const t: Tally = { mastered: 0, learning: 0, next: 0, none: 0, filled: 0, total: ids.length };
  for (const id of ids) t[cellState(fills[id] ?? 0, f.has(id))] += 1;
  t.filled = t.mastered + t.learning;
  return t;
}

/** 곳마다 상태(과 카드의 네모 줄, 곳 차례 그대로) */
export const cellStates = (ids: string[], fills: Record<string, number>, focus: Iterable<string> = []): CellState[] => {
  const f = new Set(focus);
  return ids.map((id) => cellState(fills[id] ?? 0, f.has(id)));
};

/** 아직 칠하지 않은 곳(지도에서 노랑으로 칠할 곳). 일부만 칠한 과는 칠한 곳이 제 색을 지킨다 */
export const unfilled = (ids: string[], fills: Record<string, number>) => ids.filter((id) => !((fills[id] ?? 0) >= 1));

/** 내일 복습할 곳 수(모든 지역). homeCard 의 'next' 카드 tomorrow 와 같은 식 — 'done' 화면에도 같은 숫자를 쓰려고 뺐다 */
export const tomorrowCount = (reg: Registry, m: Mastery, today: number) =>
  Object.keys(m).filter((id) => reg.place(id) && isDue(get(m, id), today + 1)).length;
