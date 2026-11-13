// 한 판(과·바로 찾기·전체 연습·시험·복습)의 진행. 문제마다 통째로 저장할 수 있게 JSON 으로만 이룬다
import type { Mode, Question } from './questions.ts';
import { learnQuestions } from './questions.ts';
import { rngFrom } from './rng.ts';

export type Kind = 'lesson' | 'quick' | 'mix' | 'check' | 'review';
export type Result = 'correct' | 'wrong' | 'dontknow';

export interface Answer {
  result: Result;
  hint?: boolean;   // 힌트를 쓰고 맞힘(상자를 올리지 않음)
  tapped?: string;  // 틀렸을 때 누른 곳·고른 보기
}

export interface LogEntry { id: string; mode: Mode; result: Result; hint: boolean; retry: number; tapped?: string }

export interface Deck {
  v: 1;
  kind: Kind;
  region: string | null;    // 복습은 여러 지역이라 null
  lesson: number | null;
  seed: number;
  queue: Question[];
  pos: number;              // 지금 문제 번호(0부터)
  log: LogEntry[];          // 만나기를 뺀 답
  retries: Record<string, number>;
  missed: string[];         // 다시 두 번에도 틀린 곳 → 내일 복습 맨 앞
  toLearn: string[];        // 바로 찾기 첫 바퀴에서 틀린 곳
  placed: string[];         // 바로 찾기 첫 바퀴에서 맞힌 곳
  right: Record<string, number>; // 이 판에서 그곳을 맞힌 횟수
}

/** 틀린 곳은 이만큼 문제 뒤에 다시 */
export const RETRY_GAP = 3;
/** 다시 내는 최대 횟수. 그래도 틀리면 내일 복습 맨 앞 */
export const MAX_RETRY = 2;
/** 그곳을 처음 맞힌 몇 번은 [다음]을 눌러 넘긴다(위치 한 줄 읽을 시간) */
export const MANUAL_NEXT = 2;

export function createDeck(kind: Kind, queue: Question[], opt: { region?: string; lesson?: number; seed: number }): Deck {
  return {
    v: 1, kind, region: opt.region ?? null, lesson: opt.lesson ?? null, seed: opt.seed,
    queue, pos: 0, log: [], retries: {}, missed: [], toLearn: [], placed: [], right: {},
  };
}

export const current = (d: Deck): Question | null => d.queue[d.pos] ?? null;
export const isDone = (d: Deck) => d.pos >= d.queue.length;
/** 진행 표시 '8/23' */
export const progress = (d: Deck) => ({ n: Math.min(d.pos + 1, d.queue.length), total: d.queue.length });

/** 이 문제가 그곳의 첫 시도인가(복습 상자·배치는 첫 시도만 센다) */
export const isFirstTry = (q: Question) => q.mode !== 'meet' && !q.retry;

function reinsert(queue: Question[], pos: number, q: Question): Question[] {
  let at = Math.min(pos + 1 + RETRY_GAP, queue.length);
  if ((queue[at - 1]?.id === q.id || queue[at]?.id === q.id) && at < queue.length) at += 1;
  return [...queue.slice(0, at), q, ...queue.slice(at)];
}

/** 지금 문제에 답하고 다음으로. 만나기는 테두리 친 칸을 누르면 result 'correct' 로 부른다 */
export function answer(d: Deck, a: Answer): Deck {
  const q = current(d);
  if (!q) return d;
  const next: Deck = { ...d, pos: d.pos + 1 };
  if (q.mode === 'meet') return next;

  next.log = [...d.log, { id: q.id, mode: q.mode, result: a.result, hint: !!a.hint, retry: q.retry ?? 0, ...(a.tapped ? { tapped: a.tapped } : {}) }];
  const ok = a.result === 'correct';
  if (ok) next.right = { ...d.right, [q.id]: (d.right[q.id] ?? 0) + 1 };

  if (q.pass) {
    // 바로 찾기 첫 바퀴: 다시 내지 않고, 끝나면 틀린 곳만 배운다
    if (ok && !a.hint) next.placed = [...d.placed, q.id];
    else next.toLearn = [...d.toLearn, q.id];
    if (!next.queue[next.pos]?.pass && next.toLearn.length) {
      next.queue = [...next.queue.slice(0, next.pos), ...learnQuestions(next.toLearn, rngFrom(d.seed + 1)), ...next.queue.slice(next.pos)];
    }
    return next;
  }

  if (!ok && d.kind !== 'check') {
    const n = d.retries[q.id] ?? 0;
    if (n < MAX_RETRY) {
      next.retries = { ...d.retries, [q.id]: n + 1 };
      next.queue = reinsert(d.queue, d.pos, { mode: 'find', id: q.id, retry: n + 1, ...(q.scope ? { scope: q.scope } : {}) });
    } else if (!d.missed.includes(q.id)) {
      next.missed = [...d.missed, q.id];
    }
  }
  return next;
}

/** 방금 맞힌 곳이 [다음]을 눌러 넘길 차례인가(그곳을 처음 맞힌 두 번) */
export const manualNext = (d: Deck, id: string) => (d.right[id] ?? 0) <= MANUAL_NEXT;

export interface Summary {
  total: number;        // 첫 시도 문제 수(만나기·다시 낸 문제 빼고)
  firstTry: number;     // 그중 힌트 없이 맞힌 수
  confused: string[];   // 한 번이라도 틀리거나 힌트·모르겠어요를 쓴 곳(헷갈린 곳)
  missed: string[];
  placed: string[];
}

export function summary(d: Deck): Summary {
  const first = d.log.filter((e) => e.retry === 0);
  const confused: string[] = [];
  for (const e of d.log) if ((e.result !== 'correct' || e.hint) && !confused.includes(e.id)) confused.push(e.id);
  return {
    total: first.length,
    firstTry: first.filter((e) => e.result === 'correct' && !e.hint).length,
    confused, missed: d.missed, placed: d.placed,
  };
}

/** 저장된 판을 되살린다. 모양이 틀리면 null(새로 시작) */
export function restoreDeck(raw: unknown): Deck | null {
  const d = raw as Deck;
  if (!d || d.v !== 1 || !Array.isArray(d.queue) || typeof d.pos !== 'number' || !Array.isArray(d.log)) return null;
  if (!['lesson', 'quick', 'mix', 'check', 'review'].includes(d.kind)) return null;
  if (d.pos < 0 || d.pos > d.queue.length) return null;
  if (d.queue.some((q) => !q || typeof q.id !== 'string' || !['meet', 'choose', 'find'].includes(q.mode))) return null;
  // 옛 저장값에는 뒤에 생긴 칸이 없을 수 있어 빈 값을 먼저 깐다(타입상 d 에 늘 있어도 실제 저장값은 다를 수 있다)
  const fill: Pick<Deck, 'retries' | 'missed' | 'toLearn' | 'placed' | 'right'> = { retries: {}, missed: [], toLearn: [], placed: [], right: {} };
  return { ...fill, ...d };
}
