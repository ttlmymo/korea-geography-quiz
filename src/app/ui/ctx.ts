// 화면들이 함께 쓰는 앱 상태와 동작(main.ts 가 만든다)
import type { Registry } from '../registry.ts';
import type { GeoData, Region } from '../types.ts';
import type { Deck } from '../core/deck.ts';
import { get, levelOf, type Mastery } from '../core/mastery.ts';
import type { Daily } from '../core/next.ts';
import type { Route } from '../router.ts';
import type { Bests, Settings } from '../store.ts';

export interface Ctx {
  reg: Registry;
  geo: GeoData;
  base: string;
  ver: string;
  /** 저장소에 쓸 수 있나(아니면 이 창을 닫을 때까지 메모리에만) */
  storageOk: boolean;
  inApp: boolean;
  mastery: Mastery;
  /** 과·바로 찾기 판(홈 '이어서 하기') */
  lessonDeck: Deck | null;
  /** 오늘 복습·전체 연습 판 */
  otherDeck: Deck | null;
  /** 시험 판(시간을 재므로 저장하지 않음) */
  checkDeck: Deck | null;
  checkStart: number;
  daily: Daily | null;
  last: string | null;
  settings: Settings;
  /** 지역별 시험 최고 기록(이 브라우저) */
  bests: Bests;
  /** 홈 지역 탭에서 고른 지역(메모리에만 — 새로 고치거나 공부 판을 열면 잊고, 마지막으로 공부한 지역·주 카드의 지역으로 돌아간다) */
  homeRegion: string | null;
  today(): number;
  save(): void;
  go(route: Route, opt?: { replace?: boolean; state?: unknown }): void;
  back(fallback: Route): void;
  render(): void;
  toast(msg: string): void;
}

/** 지도 색 단계(도달한 가장 높은 단계 — 상자가 내려가도 칠한 색은 지우지 않는다) */
export function fillsOf(m: Mastery, region: Region): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of region.items) {
    const r = get(m, it.id);
    out[it.id] = Math.max(r.hi, levelOf(r.box, r.grad));
  }
  return out;
}
