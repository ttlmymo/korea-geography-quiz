// 서울 밖 시·군·구 소개 글(2026-11-19 사용자 지시 '서울뿐 아니라 전국으로 확대'). 모양과 규칙은 seoul-intro.ts 와 같다.
// 글은 구청·시청·군청 누리집 같은 1차 자료로 쓰고(초안은 docs/intro-drafts/ — 쓰는 에이전트와 대조하는 에이전트를 따로 둠), 사람이 원문과 대조한 뒤
// reviewed 에 날짜를 넣는다. reviewed 가 없으면 개발 서버에서만 '검수 전 초안' 띠와 함께 보이고, 배포 빌드에는 쪽이 만들어지지 않는다(서울 구·가이드와 같은 규칙).
// intro-kr.json 은 docs/tools/merge_intros.py 가 docs/intro-drafts/*.json 을 합쳐 쓴다(손으로 고칠 때는 이 파일을 직접 고쳐도 된다).
import RAW from './intro-kr.json';
import HARD from './hard-words.json';
import EN_RAW from './intro-en.json';
import { introOf as seoulIntroOf, type Intro } from './seoul-intro';

export const INTROS_KR: Intro[] = RAW as Intro[];

// 어려운 한자말이 나오면 빌드를 멈춘다(서울 글과 같은 규칙)
for (const x of INTROS_KR) for (const w of HARD.words) if (x.paras.some((p) => p.includes(w))) throw new Error(`시·군·구 소개 글(${x.id})에 어려운 말 '${w}'`);
// 한 곳에 글이 둘이면 빌드를 멈춘다(쪽은 id 로 하나만 찾는다)
const seen = new Set<string>();
for (const x of INTROS_KR) {
  if (seen.has(x.id)) throw new Error(`시·군·구 소개 글이 같은 곳(${x.id})에 둘`);
  seen.add(x.id);
  if (x.paras.length < 1 || !x.sources.length) throw new Error(`시·군·구 소개 글(${x.id})에 글 또는 출처가 없음`);
}

// 영어판(2026-11-19 사용자 지시 '한국어가 있는 쪽은 영어도 전부'): 한국어 글을 영어로 옮긴 것(docs/intro-en-drafts → src/data/intro-en.json).
// 한국어 글이 이 빌드에 보일 때만 영어 글도 보인다(서울 구 소개 글 포함)
export interface IntroEn { id: string; paras: string[]; sources: { t: string; url: string }[] }
export const INTROS_EN: IntroEn[] = EN_RAW as IntroEn[];

/** 이 빌드에 보일 소개 글(검수한 글, 개발 서버에서는 초안도). 곳 id 로 찾는다 */
export const regionIntroOf = (id: string): Intro | null => INTROS_KR.find((x) => x.id === id && (x.reviewed || import.meta.env.DEV)) ?? null;

/** 영어 소개 글: 한국어 글이 이 빌드에 보이는 곳만(서울 구는 seoul-intro 의 글이 보일 때). 곳 id 로 찾는다 */
export const introEnOf = (id: string): IntroEn | null => {
  if (!(regionIntroOf(id) ?? seoulIntroOf(id))) return null;
  return INTROS_EN.find((x) => x.id === id) ?? null;
};
