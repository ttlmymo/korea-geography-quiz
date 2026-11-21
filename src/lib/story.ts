// 공부 카드의 '이름 이야기' 한 줄(2026-11-21 평가 3번 — 학습 기능 계획 R2·R5 를 '새 조사' 대신 '있는 글에서 한 줄'로 다시 정의).
// 새 사실을 쓰지 않는다: 원문 확인을 마친 소개 글(시·군·구 seoul-intro·intro-kr, 시·도 region-hub-intro)의 문장 하나를 그대로 고른다.
// 영어는 같은 곳의 영어 소개 글(intro-en, 허브 en)에서 같은 뜻의 문장을 고른다(숫자가 겹치는 문장 → 이름 문장). 두 말 중 하나라도 못 고르면 둘 다 비운다.
// Astro 를 모른다 — 단위 시험(tests/unit/story.test.ts)이 그대로 읽는다

/** 카드에 싣는 한 문장의 최대 길이(한국어 글자). 휴대폰 카드에서 네 줄 안 */
export const STORY_MAX_KO = 90;
export const STORY_MAX_EN = 200;

/** 이름의 뜻·유래를 말하는 문장(먼저) */
const STRONG_KO = /에서 왔|유래|뜻|따서|따온|따 왔|[이]?라는 이름은|이름은 .*에서/;
/** 이름이 붙거나 바뀐 문장(다음) */
const NAME_KO = /이름|불렀|불렸|부르|붙었|붙여/;
/** '두 가지 이야기가 있어요'처럼 혼자서는 아무것도 말하지 않는 문장 */
const TEASE_KO = /(두|세|여러) 가지|이야기가 있어요\.?$|알려져 있지 않/;
/** 이름 문장이 없으면 옛 시대·연도가 있는 첫 문장 */
const ERA_KO = /\d{3,4}년|조선|고려|신라|백제|삼국|가야|일제|삼한|마한|진한|변한|고구려/;
const NAME_EN = /\bname|\bnamed\b|comes? from|came from|means\b|meaning|\bcalled\b/i;

export const sentencesKo = (t: string): string[] => t.split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter(Boolean);
export const sentencesEn = (t: string): string[] => t.split(/(?<=[.?!]["”]?)\s+(?=["“A-Z0-9])/).map((s) => s.trim()).filter(Boolean);
const digits = (s: string) => new Set((s.match(/\d{2,4}/g) ?? []));

/** 한국어 한 문장 고르기: 첫 두 문단에서 ① 유래 문장 ② 이름 문장 ③ 시대·연도가 있는 첫 문장. 길이 상한을 넘으면 건너뛴다 */
export function pickKo(paras: readonly string[]): string | null {
  const pool = paras.slice(0, 2).flatMap((p) => sentencesKo(p)).filter((s) => s.length <= STORY_MAX_KO && !TEASE_KO.test(s));
  return pool.find((s) => STRONG_KO.test(s)) ?? pool.find((s) => NAME_KO.test(s)) ?? pool.find((s) => ERA_KO.test(s)) ?? null;
}

/**
 * 영어 문장 고르기: 같은 곳의 영어 글(한국어 글을 옮긴 것)에서 한국어 문장과 같은 뜻의 문장. 영어는 한 문장을 둘로 나눈 곳이 많아
 * 후보는 한 문장과 '이어진 두 문장'이다. ① 한국어 문장에 숫자(연도)가 있으면 그 숫자를 모두 품은 후보 ② 없으면 이름 문장(숫자 없는 것).
 * 그 가운데 길이가 한국어의 약 2.2배에 가장 가까운 것(옮긴 글의 보통 비율 — 한쪽만 옮긴 짧은 문장이나 딴 내용까지 붙은 긴 문장을 피함).
 * 맞는 후보가 없으면 null(11-21: 224곳 중 문장 수가 같은 곳은 18곳뿐이라 순서로는 맞출 수 없다)
 */
export function pickEn(paras: readonly string[], ko: string): string | null {
  const sents = paras.slice(0, 2).flatMap((p) => sentencesEn(p));
  const pairs = sents.slice(0, -1).map((x, i) => `${x} ${sents[i + 1]}`);
  const kd = digits(ko);
  const match = (c: string) => c.length <= STORY_MAX_EN && (kd.size
    ? [...kd].every((d) => digits(c).has(d))
    : NAME_EN.test(c) && digits(c).size === 0);
  // 한 문장으로 맞으면 한 문장(두 문장을 붙이면 다른 내용이 따라붙기 쉽다), 아니면 이어진 두 문장
  const ok = sents.filter(match).length ? sents.filter(match) : pairs.filter(match);
  if (!ok.length) return null;
  const want = ko.length * 2.2;
  return ok.reduce((a, b) => (Math.abs(b.length - want) < Math.abs(a.length - want) ? b : a));
}

export interface StoryIn { id: string; ko: readonly string[]; en: readonly string[] | null; page?: string }
export interface Story { ko: string; en: string; page?: string }

/** 곳마다 한국어·영어 한 문장. 둘 다 고른 곳만 싣는다 */
export function buildStories(list: readonly StoryIn[]): Record<string, Story> {
  const out: Record<string, Story> = {};
  for (const x of list) {
    if (!x.en) continue;
    const ko = pickKo(x.ko);
    if (!ko) continue;
    const en = pickEn(x.en, ko);
    if (!en) continue;
    out[x.id] = { ko, en, ...(x.page ? { page: x.page } : {}) };
  }
  return out;
}
