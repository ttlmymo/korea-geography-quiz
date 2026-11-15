// 오늘 복습 고르기와 홈 '오늘 공부' 주 카드(설계서 3.7·4.3). 동 단원은 계획서 N9(마지막 동 단원의 다음 과)·N17(동 색인으로 판정)·N32(복습 몫)
import type { Registry } from '../registry.ts';
import type { Deck, Kind } from './deck.ts';
import { isDone, progress } from './deck.ts';
import { colored, get, isDue, type Mastery } from './mastery.ts';
import { tomorrowCount } from './tally.ts';
import { byOpenOrder } from '../sidos.ts';

/** 하루 상한(복습 첫 시도 + 과에서 익힌 곳) */
export const DAILY_CAP = 30;
/** 복습 한 번에 내는 곳 수 */
export const ROUND = 10;
/** 새 과를 추천하는 남은 여유 */
export const NEW_SLACK = 6;

/**
 * 동 복습 몫(계획서 N32, Q7 확정 — 사용자 11-14 "하루 30개로 해줘"): 동은 시·군·구 하루 상한과 따로 센다
 * (동 몫 하루 EMD_DAILY_CAP = 30, 새 키 kgq_dailyemd_v1). 시·군·구(일반구·시·도 포함) 상한 30 과 새 과 추천 여유는
 * 시·군·구 몫만 본다. 홈 차례: 이어 하기 → 시·군·구 복습 → 시·군·구 다음 과(여유가 있을 때) → 동 복습 →
 * 마지막 동 단원의 다음 과. false 면 상한 30 을 함께 쓴다(견줌용). '배우는 방식 그대로'의 예외로 사용자가 정했다.
 * 흉내표: tools/sim-review.mjs
 */
export const EMD_SEPARATE = true;
/** 동 몫 하루 상한(Q7 확정 — 시·군·구 하루 상한 DAILY_CAP 과 같은 30) */
export const EMD_DAILY_CAP = 30;

/**
 * 따로 셀 때 마지막 동 단원의 다음 과(N9)와 시·군·구 다음 과(N32) 가운데 무엇을 먼저 내는가.
 *  'yield'(기본) = 단원 과를 동 몫 여유(EMD_DAILY_CAP − 오늘 푼 동 ≥ NEW_SLACK)로 추천할 수 있으면 단원 과(동 복습 → 단원 과),
 *                  동 몫을 다 써서 추천할 수 없으면 시·군·구 몫이 남았을 때 시·군·구 다음 과를 추천한다(동이 본 경로를 막지 않게)
 *  'unit' = 단원에 남은 과가 있으면 늘 단원 과(E4 첫 구현 — 동 몫을 다 쓰면 시·군·구 몫이 남아도 추천이 멈춘다)
 *  'sgg'  = 시·군·구 다음 과(여유가 있을 때)가 늘 먼저(N32 차례 글자 그대로 — 단원 과는 시·군·구 추천이 없을 때만)
 * 'unit'·'sgg' 는 흉내표(tools/sim-review.mjs)가 견주려고 둔다. Q7 답(동 몫 30)은 몫만 정했고 차례 규칙은 기본값 'yield' 로
 * 공개한다(E6) — 바꿀지는 마지막 보고에서 사용자에게 묻는다
 */
export type UnitNext = 'yield' | 'unit' | 'sgg';
export const EMD_UNIT_NEXT: UnitNext = 'yield';

export interface ReviewRule { separate: boolean; emdCap: number; unitNext?: UnitNext }
export const REVIEW_RULE: ReviewRule = { separate: EMD_SEPARATE, emdCap: EMD_DAILY_CAP, unitNext: EMD_UNIT_NEXT };

/** 동(읍·면·동) 곳인가 */
export const isEmd = (id: string) => id.startsWith('kr:emd:');

/** 오늘 푼 곳 수 */
export interface Daily { day: number; n: number }
export const dailyFor = (d: Daily | null | undefined, today: number): Daily => (d && d.day === today ? d : { day: today, n: 0 });

export interface ReviewPlan {
  due: number;        // 오늘이거나 지난 곳 전체(시·군·구 + 동)
  available: number;  // 상한 안에서 오늘 낼 수 있는 곳(따로 셀 때는 두 몫의 합)
  round: string[];    // 이번에 낼 곳(최대 10, 지역·단원별로 모음)
  /** 모은 묶음: region 은 지역 키(홈 탭), 동 단원 묶음이면 unit 에 단원 키 */
  byRegion: { region: string; n: number; unit?: string }[];
  /** 이번 판이 어느 몫인가: 따로 셀 때 시·군·구('sgg')가 먼저, 다 끝나면 동('emd'). 함께 셀 때는 'all' */
  part: 'all' | 'sgg' | 'emd';
}

/** 오늘 복습할 곳(아는 곳만): 과에서 끝내 틀린 곳 → 오래 밀린 곳 → 낮은 상자 → 곳 차례 */
function dueSorted(reg: Registry, m: Mastery, today: number): string[] {
  const ids = Object.keys(m).filter((id) => reg.known(id) && isDue(get(m, id), today));
  return ids.sort((a, b) => {
    const A = get(m, a), B = get(m, b);
    return (+B.front - +A.front) || ((A.due ?? 0) - (B.due ?? 0)) || (A.box - B.box) || (reg.order(a) - reg.order(b));
  });
}

/** 한 번에 10곳을 지역(동은 단원)별로 모아 낸다. 단원 묶음은 단원 파일 없이 동 색인으로 가른다 */
function planOf(reg: Registry, pool: string[], due: number, available: number, part: ReviewPlan['part']): ReviewPlan {
  const first = pool.slice(0, ROUND);
  const groupOf = (id: string) => reg.place(id)?.region.key ?? reg.unitOf(id)?.key ?? '';
  const groups: string[] = [];
  for (const id of first) if (!groups.includes(groupOf(id))) groups.push(groupOf(id));
  const round = groups.flatMap((g) => first.filter((id) => groupOf(id) === g));
  const byRegion = groups.map((g) => {
    const n = round.filter((id) => groupOf(id) === g).length;
    const area = reg.areaOf(g) ?? g;
    return area === g ? { region: g, n } : { region: area, n, unit: g };
  });
  return { due, available, round, byRegion, part };
}

/**
 * 오늘 복습. doneToday = 오늘 푼 시·군·구 수(함께 셀 때는 전부), doneEmd = 오늘 푼 동 수(따로 셀 때만 씀).
 * part 를 주지 않으면 시·군·구 몫이 남았을 때 시·군·구, 아니면 동 몫으로 판을 만든다
 */
export function todayReview(reg: Registry, m: Mastery, today: number, doneToday: number, doneEmd = 0, opt: { part?: 'sgg' | 'emd'; rule?: ReviewRule } = {}): ReviewPlan {
  const rule = opt.rule ?? REVIEW_RULE;
  const ids = dueSorted(reg, m, today);
  if (!rule.separate) {
    const pool = ids.slice(0, Math.max(0, DAILY_CAP - doneToday));
    return planOf(reg, pool, ids.length, pool.length, 'all');
  }
  const sgg = ids.filter((id) => !isEmd(id)).slice(0, Math.max(0, DAILY_CAP - doneToday));
  const emd = ids.filter(isEmd).slice(0, Math.max(0, rule.emdCap - doneEmd));
  const part = opt.part ?? (sgg.length ? 'sgg' : 'emd');
  return planOf(reg, part === 'sgg' ? sgg : emd, ids.length, sgg.length + emd.length, part);
}

/** 지역(또는 동 단원)에서 아직 다 칠하지 않은 첫 과 */
export function nextLesson(reg: Registry, m: Mastery, region: string): number | null {
  const r = reg.region(region);
  return r?.lessons.find((l) => l.items.some((id) => !colored(m, id)))?.no ?? null;
}

/**
 * 과 없는 지역(계획서 N4 — 지역 표 layer 'emd' 인 세종·제주): 시·군·구 과 없이 동 단원이 주 단원이다.
 * 홈·지역 쪽의 다음 과·진도·'다 채움'은 그 지역의 동 단원 과로 센다
 */
export const unitMain = (reg: Registry, key: string) => { const r = reg.region(key); return !!r && r.layer === 'emd' && !r.unit; };

/** 과 없는 지역의 모든 동(동 색인 — 단원 파일을 받기 전에도) */
export const mainIds = (reg: Registry, region: string) => reg.emdUnits(region).flatMap((u) => u.index.ids.map((s) => `kr:emd:${u.code}${s}`));

/**
 * 과 없는 지역의 주 단원 키: 마지막으로 공부한 그 지역 단원이 아직 다 칠하지 않았으면 그 단원, 아니면 아직 다 칠하지 않은 첫 단원(동 색인 차례).
 * 모두 칠했으면 null. 단원 파일을 받기 전에도 동 색인으로 고른다(과 번호는 단원을 등록한 뒤에 nextLesson 으로)
 */
export function mainUnitOf(reg: Registry, m: Mastery, region: string, lastUnit: string | null = null): string | null {
  const units = reg.emdUnits(region);
  const open = (key: string) => { const u = reg.unit(key); return !!u && u.index.ids.some((s) => !colored(m, `kr:emd:${u.code}${s}`)); };
  if (lastUnit && units.some((u) => u.key === lastUnit) && open(lastUnit)) return lastUnit;
  return units.find((u) => open(u.key))?.key ?? null;
}

/**
 * 과 없는 지역의 홈이 그리는 단원: 주 단원(mainUnitOf), 다 칠했으면 마지막으로 공부한 그 지역 단원, 그것도 없으면 마지막 단원('다 채움' 화면).
 * main.ts 가 홈을 그리기 전에 이 단원을 받아 등록한다(core/units.ts unitsToLoad areas)
 */
export function homeUnitOf(reg: Registry, m: Mastery, region: string, lastUnit: string | null = null): string | null {
  const units = reg.emdUnits(region);
  return mainUnitOf(reg, m, region, lastUnit) ?? (lastUnit && units.some((u) => u.key === lastUnit) ? lastUnit : units.at(-1)?.key ?? null);
}

export const regionDone = (reg: Registry, m: Mastery, region: string) => {
  if (unitMain(reg, region)) { const ids = mainIds(reg, region); return ids.length > 0 && ids.every((id) => colored(m, id)); }
  return !!reg.region(region)?.items.every((it) => colored(m, it.id));
};

/** 다음 과. unit 이 있으면 그 동 단원의 과(region 은 그 단원의 지역 키 — 홈 탭) */
export interface NextRef { region: string; lesson: number; unit?: string }

export type HomeCard =
  | { type: 'new'; region: string; lesson: number }
  | { type: 'resume'; kind: Kind; region: string | null; lesson: number | null; n: number; total: number; review: number }
  | { type: 'review'; count: number; byRegion: ReviewPlan['byRegion']; next: NextRef | null }
  | { type: 'done'; region: string; more: string[] }   // more: 다 칠하지 않은 지역, 공개 차례(sidos.ts byOpenOrder)
  | { type: 'next'; region: string; lesson: number; recommend: boolean; tomorrow: number; unit?: string };

export interface HomeInput {
  reg: Registry;
  mastery: Mastery;
  deck: Deck | null;     // 저장된 진행 중인 판
  daily: Daily | null;
  last: string | null;   // 마지막으로 공부한 지역(동 단원을 공부했어도 지역 키, N16)
  today: number;
  /** 오늘 푼 동 수(kgq_dailyemd_v1, 따로 셀 때) */
  dailyEmd?: Daily | null;
  /** 마지막으로 공부한 동 단원(kgq_lastunit_v1). 그 지역이 last 와 같고 단원이 등록돼 있을 때만 쓴다 */
  lastUnit?: string | null;
  rule?: ReviewRule;
}

/**
 * 처음 → 진행 중 → 오늘 복습 → 지역 다 칠함 → 다음 과 순서로 하나를 고른다.
 * 마지막 공부가 그 지역의 동 단원이면 '다 칠함'·'다음 과' 자리에 그 단원의 다음 과를 놓는다(N9, 단원을 다 칠했으면 지역 차례로 돌아감).
 * 동 복습을 따로 세면(N32) 시·군·구 복습 → 시·군·구 다음 과(여유가 있을 때) → 동 복습 → 마지막 동 단원의 다음 과.
 * 일반구 단원의 다음 과는 시·군·구 과라, 앞서고 시·군·구 몫 여유가 있으면 '시·군·구 다음 과' 자리(동 복습 앞)에 온다.
 * 두 규칙이 겹치면(마지막 단원에 남은 과가 있고 시·군·구 다음 과도 추천할 수 있음) rule.unitNext 로 가른다 — 기본 'yield':
 * 단원 과를 동 몫 여유로 추천할 수 있으면 단원 쪽(동 복습 → 단원 과), 없으면 시·군·구 다음 과.
 * '아는 곳'·복습 수는 동 색인으로 센다(N17). 저장이 막힌 창도 그 창 안에서 한 공부로 고른다('이 창에서는 기록이 저장되지 않아요'는 화면이 따로 띄움)
 */
export function homeCard(x: HomeInput): HomeCard {
  const { reg, mastery: m, today } = x;
  const rule = x.rule ?? REVIEW_RULE;
  // 처음 온 사람의 첫 과: 과가 있는 지역 가운데 공개 차례(byOpenOrder) 첫째(서울). 지역별 격리로 서울이 빠지면 그다음 공개 지역(인천) —
  // 지역 표 코드 차례로 고르면 가장 늦게 연 전남광주가 둘째라 첫 과가 되고, 홈 탭(공개 차례)과도 어긋났다(E16 검수). 과 없는 지역만 남으면 첫 지역
  const first = byOpenOrder(reg.regions.filter((r) => r.lessons.length), (r) => r.key)[0] ?? reg.regions[0];
  const resumable = x.deck && !isDone(x.deck) && x.deck.kind !== 'check' ? x.deck : null;
  const any = Object.keys(m).some((id) => reg.known(id) && colored(m, id));
  if (!any && !resumable) return { type: 'new', region: first.key, lesson: first.lessons[0].no };

  const done = dailyFor(x.daily, today).n;
  const doneEmd = dailyFor(x.dailyEmd, today).n;
  const plan = todayReview(reg, m, today, done, doneEmd, { rule });
  if (resumable) {
    const p = progress(resumable);
    return { type: 'resume', kind: resumable.kind, region: resumable.region, lesson: resumable.lesson, n: p.n, total: p.total, review: plan.round.length };
  }
  const region = (x.last && reg.areaOf(x.last)) || first.key;
  // 마지막 단원: 동 단원, 또는 일반구 단원(E7 — 계획서 N9 를 일반구 단원에도: 그 단원의 다음 과를 주 카드에).
  // 과 없는 지역(N4 · E8)은 주 단원(mainUnitOf — 마지막 단원이 그 지역이면 그 단원, 아니면 아직 다 칠하지 않은 첫 단원)이 그 자리에 오고,
  // 지역 과가 없으므로 시·군·구 다음 과는 없다. 주 단원은 등록돼 있어야 과 번호를 안다(main.ts 가 홈을 그리기 전에 받는다)
  const main = unitMain(reg, region);
  const mainKey = main ? mainUnitOf(reg, m, region, x.lastUnit ?? null) : null;
  const unit = main ? (mainKey && reg.region(mainKey) ? mainKey : null)
    : x.lastUnit && reg.areaOf(x.lastUnit) === region && reg.region(x.lastUnit)?.unit ? x.lastUnit : null;
  const unitLesson = unit ? nextLesson(reg, m, unit) : null;
  const lesson = main ? null : nextLesson(reg, m, region);
  const tomorrow = tomorrowCount(reg, m, today);
  const sggRecommend = DAILY_CAP - done >= NEW_SLACK;
  // 단원 과를 추천할 여유: 일반구 단원은 시·군·구 몫(N32 — 일반구는 시·군·구 하루 상한을 함께 쓴다), 동 단원은 따로 셀 때 동 몫, 함께 셀 때는 하나뿐인 몫
  const unitGu = !!(unit && reg.region(unit)?.unit?.gu);
  const unitLeft = unitGu ? DAILY_CAP - done : rule.separate ? rule.emdCap - doneEmd : DAILY_CAP - done;
  const sggOpen = lesson !== null && sggRecommend;
  // 마지막 동 단원의 다음 과가 시·군·구 다음 과보다 앞서는가(N9 · N32 · rule.unitNext). 함께 셀 때는 몫이 하나라 늘 단원 쪽(N9)
  const order = rule.unitNext ?? EMD_UNIT_NEXT;
  const unitAhead = unitLesson !== null && (!rule.separate || order === 'unit'
    || (order === 'yield' && (unitLeft >= NEW_SLACK || !sggOpen))
    || (order === 'sgg' && !sggOpen));
  // 복습 카드의 '복습 뒤 다음 과'도 같은 차례로 고른다
  const next: NextRef | null = unitAhead ? { region, lesson: unitLesson!, unit: unit! } : lesson !== null ? { region, lesson } : unitLesson !== null ? { region, lesson: unitLesson, unit: unit! } : null;
  const review = (p: ReviewPlan): HomeCard => ({ type: 'review', count: p.round.length, byRegion: p.byRegion, next });
  if (plan.round.length && plan.part !== 'emd') return review(plan);
  if (rule.separate) {
    // 시·군·구 다음 과(여유가 있을 때)는 동 복습보다 먼저 — 마지막 단원 과가 앞서는 때(unitAhead)만 빼고
    if (!unitAhead && sggOpen) return { type: 'next', region, lesson: lesson!, recommend: true, tomorrow };
    // 마지막 단원이 일반구 단원이면 그 다음 과도 시·군·구 과다(N32 — 시·군·구 몫). 앞서고 시·군·구 몫 여유가 있으면 '시·군·구 다음 과' 자리,
    // 곧 동 복습보다 먼저 낸다(E7 검수: 동 복습 뒤로 밀려 일반구 단원을 공부한 사람만 시·군·구 과가 늦어졌다)
    if (unitAhead && unitGu && unitLeft >= NEW_SLACK) return { type: 'next', region, lesson: unitLesson!, recommend: true, tomorrow, unit: unit! };
    const emdPlan = plan.part === 'emd' ? plan : todayReview(reg, m, today, done, doneEmd, { rule, part: 'emd' });
    if (emdPlan.round.length) return review(emdPlan);
  }
  if (unit && unitLesson !== null) return { type: 'next', region, lesson: unitLesson, recommend: unitLeft >= NEW_SLACK, tomorrow, unit };
  // 남은 지역(다 채움 카드의 '○○ 시작' 단추 둘 — 앞 두 곳)은 공개 차례(지역 표 openOrder — 홈 탭 빈자리와 같은 차례, E12 검수).
  // 지역 표 차례로 두면 서울을 다 칠한 사람의 단추가 배포판 '인천·경기'에서 '부산·대구'로 바뀌고, 탭(서울·인천·경기)과도 어긋났다
  if (lesson === null) return { type: 'done', region, more: byOpenOrder(reg.regions.filter((r) => !regionDone(reg, m, r.key)).map((r) => r.key), (k) => k) };
  return { type: 'next', region, lesson, recommend: sggRecommend, tomorrow };
}
