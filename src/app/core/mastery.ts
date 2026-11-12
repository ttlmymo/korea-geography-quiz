// 숙달 상자와 복습일(설계서 3.7). 날짜는 '날 번호'(1970-01-01 = 0, 그 브라우저의 현지 날짜)로 센다

/** 상자별 다음 복습까지 날 수: 0 은 복습 없음 */
export const INTERVAL = [0, 1, 2, 4, 6, 6] as const;
export const MAX_BOX = 5;
/** 상자 5 에서 연속으로 맞히면 졸업하는 횟수 */
export const GRAD_STREAK = 2;
/** 졸업한 곳을 시험·전체 연습에서 틀리면 돌아가는 상자 */
export const UNGRAD_BOX = 3;

export interface Rec {
  box: number;          // 0~5
  due: number | null;   // 다음 복습 날 번호(졸업·상자 0 이면 null)
  hi: number;           // 지금까지 닿은 가장 높은 단계(0 아직 · 1 연두 · 2 초록 · 3 진초록) — 지도 색
  streak: number;       // 상자 5 에서 연속으로 맞힌 횟수
  grad: boolean;        // 졸업(정기 복습 없음)
  front: boolean;       // 과에서 끝내 틀려 내일 복습 맨 앞
}
export type Mastery = Record<string, Rec>;

export const EMPTY: Rec = { box: 0, due: null, hi: 0, streak: 0, grad: false, front: false };

/** 현지 날짜의 날 번호 */
export function dayOf(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

/** 상자 → 지도 색 단계. 화면 이름은 0 아직 · 1~2 익히는 중 · 3 다 익힘 */
export function levelOf(box: number, grad: boolean): number {
  if (grad || box >= MAX_BOX) return 3;
  if (box >= 3) return 2;
  return box >= 1 ? 1 : 0;
}

export function stageOf(rec: Rec): 'new' | 'learning' | 'mastered' {
  const lv = levelOf(rec.box, rec.grad);
  return lv === 0 ? 'new' : lv === 3 ? 'mastered' : 'learning';
}

export const get = (m: Mastery, id: string): Rec => m[id] ?? EMPTY;

function put(m: Mastery, id: string, rec: Rec): Mastery {
  rec.hi = Math.max(rec.hi, levelOf(rec.box, rec.grad));
  return { ...m, [id]: rec };
}

const at = (box: number, today: number) => today + INTERVAL[box];

/** 오늘 복습할 곳인가(↻ 배지) */
export const isDue = (rec: Rec, today: number) => !rec.grad && rec.box >= 1 && rec.due !== null && rec.due <= today;

/**
 * 과를 마침: 그 과의 곳이 모두 상자 1(바로 찾기로 맞힌 곳은 2). 이미 더 높은 곳은 그대로 둔다.
 * missed = 3문제 뒤 다시를 두 번 하고도 틀린 곳 → 내일 복습 맨 앞
 */
export function afterLesson(m: Mastery, ids: string[], today: number, placed: string[] = [], missed: string[] = []): Mastery {
  let out = m;
  for (const id of ids) {
    const rec = { ...get(out, id) };
    const want = placed.includes(id) && !missed.includes(id) ? 2 : 1;
    if (!rec.grad && rec.box < want) {
      rec.box = want;
      rec.due = at(want, today);
      rec.streak = 0;
    }
    if (missed.includes(id) && !rec.grad) {
      rec.front = true;
      rec.due = today + 1;
    }
    out = put(out, id, rec);
  }
  return out;
}

/**
 * 정해진 날의 복습: 힌트 없이 처음에 맞히면 상자 +1(상자 5 에서는 연속 횟수 +1, 2번이면 졸업).
 * 틀리거나 힌트·모르겠어요 → 2칸만 내리고(최소 1) 내일 다시
 */
export function afterReview(m: Mastery, id: string, ok: boolean, today: number): Mastery {
  const rec = { ...get(m, id), front: false };
  if (rec.box === 0) return m;
  if (ok) {
    if (rec.box < MAX_BOX) {
      rec.box += 1;
      rec.streak = 0;
    } else {
      rec.streak += 1;
      if (rec.streak >= GRAD_STREAK) rec.grad = true;
    }
    rec.due = rec.grad ? null : at(rec.box, today);
  } else {
    rec.box = Math.max(1, rec.box - 2);
    rec.streak = 0;
    rec.due = today + 1;
  }
  return put(m, id, rec);
}

/**
 * 정해진 날이 아닌 연습(시험·전체 연습·바로 찾기의 첫 시도).
 * 맞힘: 상자 0 이고 배치가 되는 연습이면 상자 2(배치), 그 밖에는 그대로.
 * 틀림: 졸업한 곳은 상자 3 으로 돌아오고, 익히는 곳은 다음 복습일만 내일로 당긴다
 */
export function afterPractice(m: Mastery, id: string, ok: boolean, today: number, placement: boolean): Mastery {
  const cur = get(m, id);
  if (ok) {
    if (!placement || cur.box !== 0 || cur.grad) return m;
    return put(m, id, { ...cur, box: 2, due: at(2, today), streak: 0 });
  }
  if (cur.grad) return put(m, id, { ...cur, grad: false, box: UNGRAD_BOX, streak: 0, due: today + 1 });
  if (cur.box === 0) return m;
  if (cur.due !== null && cur.due <= today + 1) return m;
  return put(m, id, { ...cur, due: today + 1 });
}

/** 한 번이라도 칠한 곳(과를 마쳤거나 배치로 맞힌 곳) */
export const colored = (m: Mastery, id: string) => get(m, id).hi >= 1;

/** 다시 두 번에도 틀린 곳: 내일 복습 맨 앞(익히기 시작한 곳만) */
export function markFront(m: Mastery, ids: string[], today: number): Mastery {
  let out = m;
  for (const id of ids) {
    const rec = get(out, id);
    if (rec.box >= 1 && !rec.grad) out = put(out, id, { ...rec, front: true, due: today + 1 });
  }
  return out;
}
