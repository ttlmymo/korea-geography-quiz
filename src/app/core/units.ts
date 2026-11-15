// 동 단원 core(계획서 E4 · N9 · N16 · N17 · N30 · N34): 부팅 때 받을 단원 고르기, 받아 등록하기(단원 격리),
// 공부를 시작할 때 적는 '마지막 지역·단원', GA 값. 화면은 E5 에서 붙인다
import type { Registry } from '../registry.ts';
import { sidoByCode, sidoOf } from '../sidos.ts';
import type { EmdUnitFile } from '../types.ts';
import { isDone, type Deck } from './deck.ts';
import type { Mastery } from './mastery.ts';
import { dailyFor, homeUnitOf, isEmd, todayReview, unitMain, type Daily, type ReviewRule } from './next.ts';

/** 부팅 때 받는 단원 파일 수의 상한(계획서 N17·7절 '약 12개'): 판 2개(과 1 + 복습 10) + 마지막 단원 1, 또는 복습 판 10 + 마지막 단원 1 */
export const BOOT_UNITS_MAX = 12;

export interface UnitNeed {
  mastery: Mastery;
  deck: Deck | null;       // kgq_deck_v1(과·바로 찾기)
  deck2: Deck | null;      // kgq_deck2_v1(오늘 복습·전체 연습)
  lastUnit: string | null; // kgq_lastunit_v1
  daily: Daily | null;
  dailyEmd: Daily | null;
  today: number;
  rule?: ReviewRule;
}

/**
 * 지금 받아 등록해야 할 동 단원(아직 등록되지 않은 것만, 차례대로 최대 BOOT_UNITS_MAX):
 *  ② 저장된 판(deck·deck2)의 region·queue·options 단원 → ③ 마지막 단원 → ① 이번 복습 판(최대 10곳)의 단원.
 * 부팅·홈에서는 ①을 이어 할 판이 없을 때만 본다(있으면 홈 주 카드가 '이어서 하기'라 복습 판의 곳 이름을 그리지 않는다 — 복습 수는 동 색인으로 센다).
 * opt.review(오늘 복습 화면에서 새 복습 판을 만들 때)면 판이 있어도 ①을 **맨 앞에** 넣는다 — 새 판의 곳은 모두 등록돼 있어야 문제 화면이 그린다
 * (판의 단원은 부팅 때 이미 받았거나 받기에 실패해 색인에서 빠졌다). ①은 단원 10개를 넘지 않아 상한에 잘리지 않는다.
 * 동 색인에 없는 단원(영어 앱·동 공개 전·받기 실패로 뺀 단원)은 고르지 않는다
 */
export function unitsToLoad(reg: Registry, x: UnitNeed, opt: { review?: boolean; areas?: (string | null)[] } = {}): string[] {
  const out: string[] = [];
  // 홈이 그릴 과 없는 지역(세종·제주, 계획서 N4 · E8)의 주 단원: 홈 탭이 될 지역(고른 탭·마지막 지역)마다 하나(많아야 둘 — 상한 12 안)
  for (const a of opt.areas ?? []) if (a && unitMain(reg, a)) { const k = homeUnitOf(reg, x.mastery, a, x.lastUnit); if (k && reg.unit(k) && !reg.region(k) && !out.includes(k)) out.push(k); }
  const add = (key: string | null | undefined) => { if (key && reg.unit(key) && !reg.region(key) && !out.includes(key)) out.push(key); };
  const ofId = (id: string) => add(reg.unitOf(id)?.key);
  const round = () => {
    const plan = todayReview(reg, x.mastery, x.today, dailyFor(x.daily, x.today).n, dailyFor(x.dailyEmd, x.today).n, { rule: x.rule });
    for (const id of plan.round) ofId(id);
  };
  if (opt.review) round();
  const decks = [x.deck, x.deck2].filter((d): d is Deck => !!d && !isDone(d) && d.kind !== 'check');
  for (const d of decks) {
    add(d.region);
    for (const q of d.queue) {
      ofId(q.id);
      for (const o of q.options ?? []) ofId(o);
    }
  }
  add(x.lastUnit);
  if (!decks.length && !opt.review) round();
  return out.slice(0, BOOT_UNITS_MAX);
}

/**
 * 저장된 판이 이 창에 등록되지 않은 동 단원을 쓰는가(단원 키 region 이나 동 곳 — 영어 앱·동 공개 전처럼 색인에 없거나, 받기에 실패한 단원).
 * 그런 판은 이 창에서 이어 할 수 없을 뿐이므로 save() 가 저장소(kgq_deck_v1·kgq_deck2_v1)에서 지우지 않는다 —
 * 새 판이 그 칸을 덮을 때만 바뀐다(N26 '기록은 남음' · N30 단원 격리). 동이 없는 판은 지금처럼 못 쓰면 지운다(데이터 판이 바뀐 때).
 * 일반구 곳(E7 검수)도 같다: 영어 앱·guUnits 가 없는 옛 캐시는 일반구 단원을 등록하지 않으므로, 한국어 앱의 오늘 복습 판에 섞인 일반구 곳 때문에 지우지 않는다.
 * 지역 표에는 있는데 이 창에 실리지 않은 지역(E8 검수)도 같다: 지역별 격리로 뺀 지역(reg.failed), 영어 화면이 숨기는 지역(enChecked false — E16 의 전남광주, 2026-11-15 켬),
 * 이 데이터 판에 아직 없는 지역. 그 지역(region 키)이나 그 지역의 곳(곳 id 의 시·도 코드)이 든 판은 다른 창·다른 날에 이어 할 수 있다
 */
export function onMissingUnit(reg: Registry, d: Deck | null): boolean {
  if (!d || isDone(d)) return false;
  // 시·도 단원(korea, E8 모델)도 영어 앱·옛 캐시에는 없으니 같은 뜻으로 지킨다
  if (d.region !== null && (d.region.includes('/') || d.region === 'korea' || awayRegion(reg, d.region)) && !reg.region(d.region)) return true;
  return d.queue.some((q) => [q.id, ...(q.options ?? [])].some((id) => !reg.place(id) && (isEmd(id) || id.startsWith('kr:sido:') || unregisteredGu(reg, id) || awayPlace(reg, id))));
}

/** 지역 표에 있는 지역인데 이 창에 실리지 않았나(격리로 뺐거나, 이 말 화면이 숨기거나, 이 데이터 판에 없음) */
const awayRegion = (reg: Registry, key: string | undefined): boolean => !!key && !!sidoOf(key) && !reg.region(key);

/** 곳(kr:sgg:{시·군·구 코드} · kr:emd:{시·군·구 코드}{동}) 의 시·도가 이 창에 실리지 않은 지역인가. 시·도 코드는 행정 코드 앞 두 자리 */
function awayPlace(reg: Registry, id: string): boolean {
  const m = /^kr:(?:sgg|emd):(\d{2})/.exec(id);
  return !!m && awayRegion(reg, sidoByCode(m[1])?.key);
}

/**
 * 이 창에 등록되지 않은 일반구 곳인가. 일반구 코드는 그 시 코드 + 1~9 라(행정 코드 규칙 — 수원시 41110 → 장안구 41111, pipeline sggToSi 와 같음)
 * 끝자리를 0 으로 내린 곳이 이 창의 시 층 지역(layer 'si' — 경기) 칸이면 그 시의 일반구다. 시·군·구 층 지역(서울·인천)의 곳(강북구 11305 등)과
 * 데이터 판에서 사라진 시·군·구는 여기에 들지 않아 지금처럼 지운다. 영어 앱에서도 판 폴더 units.json 을 따로 읽지 않고 가를 수 있다
 */
function unregisteredGu(reg: Registry, id: string): boolean {
  if (!/^kr:sgg:\d{4}[1-9]$/.test(id) || reg.place(id)) return false;
  return reg.place(`${id.slice(0, -1)}0`)?.region.layer === 'si';
}

/**
 * 단원 파일을 받아 등록한다(fetchUnit 은 시·군·구 코드로 emd/{코드}.json 을 받는다). 하나가 실패해도 나머지는 등록하고,
 * 실패한 단원은 이 창에서 뺀다(reg.dropUnit — 복습·홈 계산에서 빠지고 앱은 계속 돈다, N30 단원 격리). 실패한 단원 키를 돌려준다
 */
export async function registerUnits(reg: Registry, keys: string[], fetchUnit: (code: string) => Promise<EmdUnitFile>, onFail: (key: string, why: string) => void): Promise<string[]> {
  const todo = keys.filter((k, i) => keys.indexOf(k) === i && !reg.region(k) && reg.unit(k));
  const got = await Promise.allSettled(todo.map((k) => fetchUnit(reg.unit(k)!.code)));
  const failed: string[] = [];
  got.forEach((g, i) => {
    const key = todo[i];
    try {
      if (g.status === 'rejected') throw g.reason;
      if (g.value?.key !== key) throw new Error(`단원 키가 다름: ${g.value?.key}`);
      reg.addUnit(g.value);
    } catch (e) {
      reg.dropUnit(key);
      failed.push(key);
      onFail(key, String((e as Error)?.message ?? e).slice(0, 100));
    }
  });
  return failed;
}

/**
 * 공부를 시작할 때 적는 값(N9·N16): kgq_last_v1 에는 늘 지역 키(동 단원이면 그 지역), kgq_lastunit_v1 에는 동 단원 키(지역 공부면 null — 지움)
 */
export function studyKeys(reg: Registry, key: string): { last: string; lastUnit: string | null } {
  const area = reg.areaOf(key) ?? key;
  return { last: area, lastUnit: area !== key ? key : null };
}

export type GaUnit = { unit: 'sgg' | 'emd' | 'gu' | 'sido'; region: string; unit_id?: string };

/**
 * GA 값(N34): region 은 지역 키 그대로. unit 은 시·군·구 'sgg' · 동 단원 'emd'(unit_id = 시·군·구 코드 5자리) ·
 * 일반구 단원 'gu'(키 '{지역}/gu', unit_id = 시·도 코드) · 시·도 단원 'sido'(키 korea). 보내는 곳은 E5
 */
export function gaUnit(reg: Registry, key: string): GaUnit {
  if (key === 'korea') return { unit: 'sido', region: 'korea' };
  const gu = /^([a-z-]{2,20})\/gu$/.exec(key);
  if (gu) {
    const sido = reg.region(gu[1])?.sido;
    return sido ? { unit: 'gu', region: gu[1], unit_id: sido } : { unit: 'gu', region: gu[1] };
  }
  const area = reg.areaOf(key);
  if (!area || area === key) return { unit: 'sgg', region: key };
  const code = reg.unit(key)?.code ?? reg.region(key)?.unit?.code;
  return code ? { unit: 'emd', region: area, unit_id: code } : { unit: 'emd', region: area };
}

/**
 * 이벤트에 붙이는 지역·단원 값(N34, E5 에서 보냄). 시·군·구(지역) 판은 운영 이벤트 모양을 그대로 두려고 region 하나만 —
 * 전부터 unit 을 보내던 이벤트(lesson_complete·practice_answer)만 always 로 unit 'sgg' 를 붙인다. 동·일반구·시·도 단원은 늘 unit·unit_id 를 붙인다
 */
export function gaArgs(reg: Registry, key: string, always = false): Partial<GaUnit> & { region: string } {
  const g = gaUnit(reg, key);
  return g.unit === 'sgg' && !always ? { region: g.region } : g;
}

/** lesson_complete 값(main.ts onEnd): { unit, region, [unit_id], lesson, first_try, total } — 시·군·구는 전과 같은 모양 */
export function lessonCompleteParams(reg: Registry, key: string, lesson: number, firstTry: number, total: number) {
  return { ...gaArgs(reg, key, true), lesson, first_try: firstTry, total };
}
