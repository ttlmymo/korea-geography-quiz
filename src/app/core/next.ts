// 오늘 복습 고르기와 홈 '오늘 공부' 주 카드(설계서 3.7·4.3)
import type { Registry } from '../registry.ts';
import type { Deck, Kind } from './deck.ts';
import { isDone, progress } from './deck.ts';
import { colored, get, isDue, type Mastery } from './mastery.ts';

/** 하루 상한(복습 첫 시도 + 과에서 익힌 곳) */
export const DAILY_CAP = 30;
/** 복습 한 번에 내는 곳 수 */
export const ROUND = 10;
/** 새 과를 추천하는 남은 여유 */
export const NEW_SLACK = 6;

/** 오늘 푼 곳 수 */
export interface Daily { day: number; n: number }
export const dailyFor = (d: Daily | null | undefined, today: number): Daily => (d && d.day === today ? d : { day: today, n: 0 });

export interface ReviewPlan {
  due: number;        // 오늘이거나 지난 곳 전체
  available: number;  // 상한 안에서 오늘 낼 수 있는 곳
  round: string[];    // 이번에 낼 곳(최대 10, 지역별로 모음)
  byRegion: { region: string; n: number }[];
}

/** 순서: 과에서 끝내 틀린 곳 → 오래 밀린 곳 → 낮은 상자. 한 번에 10곳을 지역별로 모아 낸다 */
export function todayReview(reg: Registry, m: Mastery, today: number, doneToday: number): ReviewPlan {
  const order = new Map(reg.regions.flatMap((r) => r.items.map((it) => it.id)).map((id, i) => [id, i]));
  const ids = Object.keys(m).filter((id) => order.has(id) && isDue(get(m, id), today));
  ids.sort((a, b) => {
    const A = get(m, a), B = get(m, b);
    return (+B.front - +A.front) || ((A.due ?? 0) - (B.due ?? 0)) || (A.box - B.box) || ((order.get(a) ?? 0) - (order.get(b) ?? 0));
  });
  const pool = ids.slice(0, Math.max(0, DAILY_CAP - doneToday));
  const first = pool.slice(0, ROUND);
  const regionOf = (id: string) => reg.place(id)?.region.key ?? '';
  const regions: string[] = [];
  for (const id of first) if (!regions.includes(regionOf(id))) regions.push(regionOf(id));
  const round = regions.flatMap((r) => first.filter((id) => regionOf(id) === r));
  return { due: ids.length, available: pool.length, round, byRegion: regions.map((r) => ({ region: r, n: round.filter((id) => regionOf(id) === r).length })) };
}

/** 지역에서 아직 다 칠하지 않은 첫 과 */
export function nextLesson(reg: Registry, m: Mastery, region: string): number | null {
  const r = reg.region(region);
  return r?.lessons.find((l) => l.items.some((id) => !colored(m, id)))?.no ?? null;
}

export const regionDone = (reg: Registry, m: Mastery, region: string) =>
  !!reg.region(region)?.items.every((it) => colored(m, it.id));

export type HomeCard =
  | { type: 'new'; region: string; lesson: number }
  | { type: 'resume'; kind: Kind; region: string | null; lesson: number | null; n: number; total: number; review: number }
  | { type: 'review'; count: number; byRegion: { region: string; n: number }[]; next: { region: string; lesson: number } | null }
  | { type: 'done'; region: string; more: string[] }
  | { type: 'next'; region: string; lesson: number; recommend: boolean; tomorrow: number };

export interface HomeInput {
  reg: Registry;
  mastery: Mastery;
  deck: Deck | null;     // 저장된 진행 중인 판
  daily: Daily | null;
  last: string | null;   // 마지막으로 공부한 지역
  today: number;
}

/**
 * 처음 → 진행 중 → 오늘 복습 → 지역 다 칠함 → 다음 과 순서로 하나를 고른다.
 * 저장이 막힌 창도 그 창 안에서 한 공부로 고른다('이 창에서는 기록이 저장되지 않아요'는 화면이 따로 띄움)
 */
export function homeCard(x: HomeInput): HomeCard {
  const { reg, mastery: m, today } = x;
  const first = reg.regions[0];
  const resumable = x.deck && !isDone(x.deck) && x.deck.kind !== 'check' ? x.deck : null;
  const any = Object.keys(m).some((id) => reg.place(id) && colored(m, id));
  if (!any && !resumable) return { type: 'new', region: first.key, lesson: first.lessons[0].no };

  const done = dailyFor(x.daily, today).n;
  const plan = todayReview(reg, m, today, done);
  if (resumable) {
    const p = progress(resumable);
    return { type: 'resume', kind: resumable.kind, region: resumable.region, lesson: resumable.lesson, n: p.n, total: p.total, review: plan.round.length };
  }
  const region = x.last && reg.region(x.last) ? x.last : first.key;
  const lesson = nextLesson(reg, m, region);
  if (plan.round.length) return { type: 'review', count: plan.round.length, byRegion: plan.byRegion, next: lesson ? { region, lesson } : null };
  if (lesson === null) return { type: 'done', region, more: reg.regions.filter((r) => !regionDone(reg, m, r.key)).map((r) => r.key) };
  const tomorrow = Object.keys(m).filter((id) => reg.place(id) && isDue(get(m, id), today + 1)).length;
  return { type: 'next', region, lesson, recommend: DAILY_CAP - done >= NEW_SLACK, tomorrow };
}
