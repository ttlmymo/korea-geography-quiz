// 답 하나를 판·숙달·오늘 푼 수에 함께 반영한다. 화면은 이 함수 하나만 부르고 결과를 문제마다 저장한다
import type { Registry } from '../registry.ts';
import { answer, current, isDone, isFirstTry, summary, type Answer, type Deck, type Summary } from './deck.ts';
import { afterLesson, afterPractice, afterReview, markFront, type Mastery } from './mastery.ts';
import { dailyFor, isEmd, REVIEW_RULE, type Daily, type ReviewRule } from './next.ts';

/** daily = 오늘 푼 시·군·구 수(함께 셀 때는 전부), dailyEmd = 오늘 푼 동 수(동 복습을 따로 셀 때, 계획서 N32) */
export interface Step { deck: Deck; mastery: Mastery; daily: Daily; dailyEmd: Daily; finished: Summary | null }

/**
 * 과: 답마다 숙달을 바꾸지 않고, 끝나면 그 과의 곳을 모두 상자 1(바로 찾기로 맞힌 곳 2)로.
 * 복습: 첫 시도마다 상자를 올리거나 내림. 전체 연습·시험·바로 찾기 첫 바퀴: 첫 시도마다 배치·당기기.
 * 오늘 푼 수: 동 복습을 따로 세면(rule.separate) 동은 dailyEmd 에, 그 밖은 daily 에 더한다
 */
export function step(reg: Registry, deck: Deck, mastery: Mastery, daily: Daily | null, a: Answer, today: number, dailyEmd: Daily | null = null, rule: ReviewRule = REVIEW_RULE): Step {
  let m = mastery;
  let dl = dailyFor(daily, today);
  let de = dailyFor(dailyEmd, today);
  const own = (id: string) => rule.separate && isEmd(id);
  const q = current(deck);
  if (!q) return { deck, mastery: m, daily: dl, dailyEmd: de, finished: null };
  const ok = a.result === 'correct' && !a.hint;
  if (isFirstTry(q)) {
    if (deck.kind === 'review') {
      m = afterReview(m, q.id, ok, today);
      if (own(q.id)) de = { ...de, n: de.n + 1 };
      else dl = { ...dl, n: dl.n + 1 };
    } else if (deck.kind === 'mix' || deck.kind === 'check' || (deck.kind === 'quick' && q.pass)) {
      m = afterPractice(m, q.id, ok, today, true);
    }
  }
  const d = answer(deck, a);
  if (!isDone(d)) return { deck: d, mastery: m, daily: dl, dailyEmd: de, finished: null };

  if ((d.kind === 'lesson' || d.kind === 'quick') && d.region && d.lesson !== null) {
    const ids = reg.lesson(d.region, d.lesson)?.items ?? [];
    m = afterLesson(m, ids, today, d.placed, d.missed);
    const emd = ids.filter(own).length;
    if (ids.length - emd) dl = { ...dl, n: dl.n + ids.length - emd };
    if (emd) de = { ...de, n: de.n + emd };
  } else if (d.kind !== 'check') {
    m = markFront(m, d.missed, today);
  }
  return { deck: d, mastery: m, daily: dl, dailyEmd: de, finished: summary(d) };
}

/**
 * 저장된 판이 지금 데이터로 이어 할 수 있나(데이터 판이 바뀌어 없는 곳·과가 생기면 버린다).
 * 동 단원 판은 그 단원 파일을 받아 등록한 뒤에 부른다(계획서 N17 — 받기에 실패한 단원의 판은 버린다)
 */
export function usableDeck(reg: Registry, d: Deck | null): Deck | null {
  if (!d) return null;
  if (d.region !== null && !reg.region(d.region)) return null;
  if (d.lesson !== null && (!d.region || !reg.lesson(d.region, d.lesson))) return null;
  for (const q of d.queue) {
    if (!reg.place(q.id)) return null;
    for (const o of q.options ?? []) if (!reg.place(o)) return null;
  }
  return d;
}
