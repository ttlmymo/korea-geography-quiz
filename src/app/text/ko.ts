// 한국어 조사·방위 이름·판정 문장. 받침은 이름의 마지막 한글 글자로 본다
import type { Registry, Dir8 } from '../registry.ts';
import type { Tap, Wrong } from '../core/judge.ts';
import type { Question } from '../core/questions.ts';
import type { Region } from '../types.ts';
import { SIDOS, sidoOf } from '../sidos.ts';

/** 마지막 글자의 받침: 없으면 0, ㄹ 이면 8, 한글이 아니면 -1 */
function jong(word: string): number {
  const w = word.trim();
  const c = w.charCodeAt(w.length - 1) - 0xac00;
  if (!(c >= 0 && c < 11172)) return -1;
  return c % 28;
}
const has = (w: string) => jong(w) > 0;

/**
 * 과 수를 세는 한글 수사(서울 '다섯 과' · 제주 '열한 과'). 1~99 를 고유어로('한'·'두'·'세'·'네'·'스무'), 0 이나 100 이상은 숫자 그대로.
 * E13: 제주(과 없는 지역)는 두 단원 과를 합쳐 11과가 되어 '11 과'로 나왔다(전에는 열까지만)
 */
export function koCount(n: number): string {
  const ONE = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉'];
  const TEN = ['', '열', '스물', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔'];
  if (!Number.isInteger(n) || n < 1 || n > 99) return String(n);
  if (n === 20) return '스무';
  return TEN[Math.floor(n / 10)] + ONE[n % 10];
}

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

/**
 * 지역의 단위 이름: 곳 이름 끝 글자로 모은다(서울 '구', 인천 '군·구', 경기 '시·군', 동 단원 '동'·'읍·면·동').
 * 시·도 단원(korea, layer 'sido')은 '시·도' — 곳 이름이 짧은 이름이라 끝 글자로 모으면 '대구'의 '구'만 잡힌다(E10)
 */
export function unitKo(r: Pick<Region, 'items'> & { layer?: Region['layer']; key?: string }): string {
  if (r.layer === 'sido') return '시·도';
  return unitWordKo(r.items.map((it) => it.ko), r.key);
}
/** region = 지역 키(또는 단원 키 'daegu/jung-gu') — 구·군 차례를 지역 표에서 고른다(guFirst) */
export function unitWordKo(names: string[], region?: string): string {
  const ends = new Set(names.map((n) => n.slice(-1)));
  const order = guFirst(names, region) ? ['시', '구', '군', '읍', '면', '동'] : ['시', '군', '구', '읍', '면', '동'];
  return order.filter((e) => ends.has(e)).join('·');
}
/**
 * 구와 군만 있는 지역은 그 지역이 스스로 쓰는 차례로 쓴다: 구를 먼저('구·군' — 부산 '15구 1군'·대구 '7구 2군'·울산 '4구 1군', E11 · E12),
 * 지역 표(src/data/sido.json) gunFirst 인 지역만 군을 먼저('군·구' — 인천 '2군 9구'). E11 까지는 '군이 하나뿐이면 구 먼저'였는데,
 * 대구(군 둘)가 '구·군'을 써서 이름만으로는 가를 수 없어 지역 표 칸으로 옮겼다(E12). region 은 지역 키 또는 단원 키('daegu/jung-gu')
 */
export function guFirst(names: string[], region?: string): boolean {
  const n = (e: string) => names.filter((x) => x.endsWith(e)).length;
  if (!(n('군') > 0 && n('구') > 0 && n('시') === 0)) return false;
  return !(region && sidoOf(region.split('/')[0])?.gunFirst);
}

/** 시·도 짧은 이름(동 만나기 근거의 다른 시·도 이웃: '경기 부천시'). 지역 표(src/data/sido.json)의 ko 를 읽는다(계획서 E8 — 지역 목록을 코드에 박지 않음) */
export const SIDO_KO: Record<string, string> = Object.fromEntries(SIDOS.map((s) => [s.code, s.ko]));

/**
 * 동 만나기 카드의 위치 한 줄(계획서 N13 — 손으로 쓰지 않고 파이프라인이 만든 근거만): 단원 안 자리 + 맞닿은 단원 밖 시·군·구.
 * '노원구 북쪽 끝, 도봉구와 맞닿은 곳'(끝 edge 가 있으면 '…끝', 없으면 9칸 방위 dir), 이웃이 셋 이상이면 둘 + '등'.
 * 다른 시·도 이웃은 시·도 이름을 붙인다('경기 의정부시'). 동 단원 곳이 아니면 ''
 */
export function meetKo(reg: Registry, id: string): string {
  const p = reg.place(id);
  const u = p?.region.unit;
  const m = u?.meet[id];
  if (!p || !u || !m) return '';
  const where = m.edge ? `${p.region.ko} ${DIR_KO[m.edge]} 끝` : m.dir === 'C' ? `${p.region.ko} 가운데` : `${p.region.ko} ${DIR_KO[m.dir]}`;
  const names = (m.touch ?? []).map((t) => u.outside[t]).filter(Boolean)
    .map((o) => (o.sido !== p.region.sido && SIDO_KO[o.sido] ? `${SIDO_KO[o.sido]} ${o.ko}` : o.ko));
  if (!names.length) return where;
  return `${where}, ${gwaWa(names.slice(0, 2).join('·') + (names.length > 2 ? ' 등' : ''))} 맞닿은 곳`;
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
