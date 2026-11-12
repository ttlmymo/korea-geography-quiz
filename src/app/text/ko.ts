// 한국어 조사·방위 이름·판정 문장. 받침은 이름의 마지막 한글 글자로 본다
import type { Registry, Dir8 } from '../registry.ts';
import type { Tap, Wrong } from '../core/judge.ts';
import type { Question } from '../core/questions.ts';
import type { Region } from '../types.ts';

/** 마지막 글자의 받침: 없으면 0, ㄹ 이면 8, 한글이 아니면 -1 */
function jong(word: string): number {
  const w = word.trim();
  const c = w.charCodeAt(w.length - 1) - 0xac00;
  if (!(c >= 0 && c < 11172)) return -1;
  return c % 28;
}
const has = (w: string) => jong(w) > 0;

export const eunNeun = (w: string) => w + (has(w) ? '은' : '는');
export const eulReul = (w: string) => w + (has(w) ? '을' : '를');
export const iGa = (w: string) => w + (has(w) ? '이' : '가');
export const gwaWa = (w: string) => w + (has(w) ? '과' : '와');
/** 받침이 있으면 '이에요', 없으면 '예요' */
export const ieyo = (w: string) => w + (has(w) ? '이에요' : '예요');
/** 받침이 있고 ㄹ 이 아니면 '으로' */
export const euro = (w: string) => w + (has(w) && jong(w) !== 8 ? '으로' : '로');

export const DIR_KO: Record<Dir8, string> = {
  E: '동쪽', NE: '북동쪽', N: '북쪽', NW: '북서쪽', W: '서쪽', SW: '남서쪽', S: '남쪽', SE: '남동쪽',
};

/* ---------- 문제·판정 문장(설계서 3.4·3.5). 이름은 지도 위가 아니라 시트에 쓴다 ---------- */

const nm = (reg: Registry, id: string) => reg.place(id)?.item.ko ?? id;

/** 지역의 단위 이름: 곳 이름 끝 글자로 모은다(서울 '구', 인천 '군·구', 경기 '시·군') */
export function unitKo(r: Region): string {
  const ends = new Set(r.items.map((it) => it.ko.slice(-1)));
  return ['시', '군', '구', '동', '읍', '면'].filter((e) => ends.has(e)).join('·');
}

/** 문제 띠와 시트 문장. 고르기에는 색 이름을 쓰지 않는다 */
export function promptKo(reg: Registry, q: Question): { band: string; line?: string; act?: string } {
  const p = reg.place(q.id);
  const name = nm(reg, q.id);
  if (q.mode === 'meet') return { band: `이곳은 ${name}`, line: p?.item.line ?? '', act: '테두리 친 칸을 눌러 보세요' };
  if (q.mode === 'choose') return { band: `테두리 친 칸은 무슨 ${p ? unitKo(p.region) : '곳'}일까요?` };
  return { band: `${eulReul(name)} 찾아 누르세요` };
}

export const TAP_KO: Record<Exclude<Tap['type'], 'cell'>, string> = {
  ambiguous: '가까이서 다시 눌러 주세요',
  outside: '밝은 칸 중에서 골라 주세요',
  river: '땅을 눌러 주세요',
};

export function rightKo(reg: Registry, id: string, first: boolean): { title: string; line: string } {
  return { title: first ? `맞아요! ${nm(reg, id)}` : nm(reg, id), line: reg.place(id)?.item.line ?? '' };
}

/** chose = 고르기에서 보기를 고름(찾기는 칸을 누름) */
export function wrongKo(reg: Registry, w: Wrong, chose = false): { title: string; where: string; act: string } {
  const t = nm(reg, w.target), p = nm(reg, w.picked);
  return {
    title: chose ? `${eulReul(p)} 골랐어요` : `${eulReul(p)} 눌렀어요`,
    where: w.adjacent ? `${eunNeun(t)} ${p}의 ${DIR_KO[w.dir]} 옆이에요` : `${eunNeun(t)} ${p}에서 ${DIR_KO[w.dir]} 방향이에요`,
    act: chose ? `테두리 친 곳은 ${ieyo(t)}` : `표시한 ${eulReul(t)} 한 번 눌러 보세요`,
  };
}

export function dontKnowKo(reg: Registry, id: string): { title: string; act: string } {
  return { title: `여기가 ${ieyo(nm(reg, id))}`, act: '한 번 눌러 보세요' };
}
