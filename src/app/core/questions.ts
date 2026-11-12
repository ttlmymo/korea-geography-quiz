// 문제 차례 만들기(설계서 3.4): 과 · 바로 찾기 · 전체 연습 · 시험 · 복습
import type { Registry } from '../registry.ts';
import { pick, shuffle, type Rng } from './rng.ts';

export type Mode = 'meet' | 'choose' | 'find';

export interface Question {
  mode: Mode;
  id: string;
  options?: string[];        // 고르기 보기 4개(정답 포함)
  retry?: number;            // '3문제 뒤 다시'로 몇 번째 다시 낸 것
  pass?: 1;                  // 바로 찾기 첫 바퀴
  final?: true;              // 과 마무리(섞어 찾기)
  scope?: 'lesson' | 'wide'; // 복습 지도 범위: 상자 1~2 는 과 범위, 3 이상은 넓은 화면
}

/** 블록 크기: 두 곳씩 만나고 찾는다. 곳이 홀수면 마지막 블록은 한 곳(고르기 없음) */
export const BLOCK = 2;
/** 고르기 보기에 이웃을 쓰기 시작하는 상자 */
export const NEAR_OPTIONS_BOX = 3;

function chunk<T>(list: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

/** 바로 앞 문제와 같은 곳이 이어지지 않게, 첫 곳만 뒤와 바꾼다 */
function avoidRepeat(list: string[], prev: string | undefined): string[] {
  if (list.length > 1 && list[0] === prev) [list[0], list[1]] = [list[1], list[0]];
  return list;
}

/**
 * 고르기 보기 4개: 처음에는 다른 과의 먼 곳, 익힐수록(상자 3 이상) 이웃.
 * 보기는 같은 지역 안에서만 고른다
 */
export function chooseOptions(reg: Registry, id: string, box: number, rng: Rng): string[] {
  const p = reg.place(id);
  if (!p) throw new Error(`없는 곳: ${id}`);
  const others = p.region.items.map((it) => it.id).filter((v) => v !== id);
  const byDist = (a: string, b: string) => reg.dist(id, a) - reg.dist(id, b);
  let picked: string[];
  if (box >= NEAR_OPTIONS_BOX) {
    const near = shuffle(reg.neighborsOf(id).filter((v) => others.includes(v)), rng).slice(0, 3);
    const fill = others.filter((v) => !near.includes(v)).sort(byDist);
    picked = [...near, ...fill].slice(0, 3);
  } else {
    const away = others.filter((v) => !p.lesson.items.includes(v)).sort(byDist).reverse();
    const pool = away.slice(0, Math.max(3, Math.ceil(away.length / 2)));
    picked = shuffle(pool, rng).slice(0, 3);
    if (picked.length < 3) picked.push(...shuffle(others.filter((v) => !picked.includes(v)), rng).slice(0, 3 - picked.length));
  }
  return shuffle([id, ...picked], rng);
}

/**
 * 과 하나: 블록마다 만나기 → 고르기 1 → 찾기 → (둘째 블록부터) 앞 블록에서 1곳 찾기,
 * 마무리로 모든 곳을 섞어 찾기. 같은 곳이 연달아 나오지 않는다. 6곳이면 23문제, 4곳이면 15문제
 */
export function lessonQuestions(reg: Registry, region: string, no: number, boxOf: (id: string) => number, rng: Rng): Question[] {
  const lesson = reg.lesson(region, no);
  if (!lesson) throw new Error(`없는 과: ${region} ${no}`);
  const q: Question[] = [];
  const last = () => q[q.length - 1]?.id;
  const seen: string[] = [];
  for (const block of chunk(lesson.items, BLOCK)) {
    for (const id of block) q.push({ mode: 'meet', id });
    // 고르기는 먼저 만난 곳으로(방금 본 곳이 바로 이어지지 않게)
    if (block.length > 1) q.push({ mode: 'choose', id: block[0], options: chooseOptions(reg, block[0], boxOf(block[0]), rng) });
    const earlier = seen.length ? pick(seen, rng) : null;
    // 한 곳 블록은 앞 블록 찾기를 먼저 내서, 만난 곳을 바로 찾지 않게 한다
    if (earlier && block.length === 1) q.push({ mode: 'find', id: earlier });
    for (const id of avoidRepeat(shuffle(block, rng), last())) q.push({ mode: 'find', id });
    if (earlier && block.length > 1) q.push({ mode: 'find', id: earlier });
    seen.push(...block);
  }
  for (const id of avoidRepeat(shuffle(lesson.items, rng), last())) q.push({ mode: 'find', id, final: true });
  return q;
}

/** 바로 찾기 첫 바퀴: 과의 곳을 힌트 없이 한 번씩 */
export function quickQuestions(reg: Registry, region: string, no: number, rng: Rng): Question[] {
  const lesson = reg.lesson(region, no);
  if (!lesson) throw new Error(`없는 과: ${region} ${no}`);
  return shuffle(lesson.items, rng).map((id) => ({ mode: 'find', id, pass: 1 }));
}

/** 바로 찾기에서 틀린 곳만 배우기: 두 곳씩 만나기 → 찾기, 두 곳 이상이면 섞어 찾기 */
export function learnQuestions(ids: string[], rng: Rng): Question[] {
  const q: Question[] = [];
  const last = () => q[q.length - 1]?.id;
  for (const block of chunk(ids, BLOCK)) {
    for (const id of block) q.push({ mode: 'meet', id });
    for (const id of avoidRepeat(shuffle(block, rng), last())) q.push({ mode: 'find', id });
  }
  if (ids.length > 1) for (const id of avoidRepeat(shuffle(ids, rng), last())) q.push({ mode: 'find', id, final: true });
  return q;
}

/**
 * 전체 연습·시험: 지역의 모든 곳을 한 번씩. 화면(screens) 안에서만 섞고 화면 차례는 지킨다
 * (경기 31곳은 네 화면, 인천은 내륙·섬 두 화면 — 한 화면에 넣으면 16px 보다 작은 칸이 생긴다)
 */
export function allQuestions(reg: Registry, region: string, rng: Rng, groups?: string[][]): Question[] {
  const r = reg.region(region);
  if (!r) throw new Error(`없는 지역: ${region}`);
  const sets = groups ?? (r.screens?.length ? r.screens.map((s) => s.items) : [r.items.map((it) => it.id)]);
  const out: Question[] = [];
  for (const g of sets) for (const id of avoidRepeat(shuffle(g, rng), out[out.length - 1]?.id)) out.push({ mode: 'find', id });
  return out;
}

/** 복습: 고른 곳을 찾기로. 상자 1~2 는 과 범위, 3 이상은 넓은 화면 */
export function reviewQuestions(ids: string[], boxOf: (id: string) => number): Question[] {
  return ids.map((id) => ({ mode: 'find', id, scope: boxOf(id) >= 3 ? 'wide' : 'lesson' }));
}
