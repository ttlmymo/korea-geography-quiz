// 쪽 화면(설계서 4.1): 홈 · 지역 고르기 · 단원 · 구 고르기(동 단원, 계획서 E5) · 과 시작 카드 · 과 요약 · 시험 결과 · 복습 없음 · 랭킹(준비 중).
// 단원 쪽·과 시작·요약·시험 결과는 지역과 동 단원(region = '{지역}/{단원 slug}', 계획서 N30)을 같은 함수로 그린다.
// 문자열로 그리고, 지도 자리(data-map)는 main.ts 가 붙인다. 누르는 동작은 data-act, 화면 이동은 해시 링크. 글은 text/ui.ts(한·영)
// 모양(합본 디자인 3.2·3.3): 모든 쪽이 홈과 같은 말 — 라벨 → 큰 제목 → 이름 줄·설명 → 먹색 주 단추 + 먹 테두리 보조 단추 →
// 선으로 나눈 구역(윗선 2px 먹), 숫자는 36px. 넓은 화면(1100 이상)은 2단(글 | 틀 있는 지도), 좁은 화면은 홈 폰 순서(제목 → 지도 → 단추 → 글)
import { homeCard, todayReview, nextLesson, dailyFor, regionDone, homeUnitOf, mainIds, unitMain, isEmd, DAILY_CAP, NEW_SLACK, type HomeCard } from '../core/next.ts';
import { GROUPS, SIDOS, byOpenOrder, sidoOf } from '../sidos.ts';
import { get, isDue, INTERVAL } from '../core/mastery.ts';
import { progress } from '../core/deck.ts';
import { cellStates, tally, tomorrowCount, unfilled } from '../core/tally.ts';
import { boxOf } from '../map/project.ts';
import { L, placeName } from '../text/ui.ts';
import type { Route } from '../router.ts';
import { toHash } from '../router.ts';
import type { Registry, UnitRef } from '../registry.ts';
import type { BBox, Region } from '../types.ts';
import { fillOf, fillsOf, type Ctx } from './ctx.ts';
import { backRow, esc } from './dom.ts';
import { KOREA_MAP, viewSpec, wholeView, type MapSpec, type MapView } from './maps.ts';
import { COMPACT_PX, type MapLabel } from '../map/svgmap.ts';
import { ISLE_GAP, ISLE_H, ISLE_NOTE_H, ISLE_W } from '../map/isles.ts';

export interface Page { html: string; maps?: Record<string, MapSpec>; title?: string }

const link = (r: Route) => toHash(r) || '#';
const nm = (ctx: Ctx, id: string) => placeName(ctx.reg, id);
const rk = (r: Region) => esc(L.region(r));
/** '서울 2과' / 'Seoul lesson 2' */
const lessonLabel = (r: Region, no: number) => `${L.region(r)} ${L.lessonNo(no)}`;
// 이름 사이 ' · ': 가운뎃점 앞은 줄을 바꾸지 않는다(줄이 '·' 로 시작하지 않게)
const SEP = ' · ';

/** 저장 못 하는 창 · 앱 안 브라우저 경고(설계서 3.8): 먹색 ! 기호 + 글 */
function warnNotes(ctx: Ctx): string {
  return [!ctx.storageOk ? L.notes.noStore : '', ctx.inApp ? L.notes.inApp : ''].filter(Boolean)
    .map((s) => `<p class="h-note warn"><b aria-hidden="true">!</b><span>${esc(s)}</span></p>`).join('');
}

/** 이 브라우저에만 저장 · 저장 못 하는 창 · 앱 안 브라우저 안내(14px) */
const storageNotes = (ctx: Ctx) => `<p class="h-note">${esc(L.notes.saved)}</p>${warnNotes(ctx)}`;

/* ---------- 함께 쓰는 조각(홈과 같은 모양) ---------- */

/** 범례에 한강 견본을 두는 지역(지도에 한강이 칸과 맞닿아 그려진다 — 인천 지도에는 강이 없다). 지역 표 river(계획서 E8) */
const riverOn = (key: string) => !!sidoOf(key)?.river;

/** 칸 상태 견본(16px 네모, 복습은 먹색 점). 장식이라 읽히지 않는다 — 뜻은 옆 글이 맡는다 */
const sw = (s: string) => `<i class="sw s-${s}" aria-hidden="true"></i>`;

/** 범위의 가로:세로(지도 칸 높이를 지역·과 모양에 맞춘다) */
function aspectOf(fit: BBox): number {
  const [x0, y0, x1, y1] = boxOf(fit);
  return Math.round(((x1 - x0) / (y1 - y0)) * 1000) / 1000;
}

/**
 * 동 단원 지도 칸의 가로:세로. 밝은 칸이 모두 섬 상자면(섬만 든 과·옹진군) 상자 격자(세 줄까지)에 맞춘 비율 — 범위 비율(먼 섬까지 넓다)로 두면
 * 폰에서 지도 칸이 낮아져 상자가 섬 상자 크기(ISLE_W×ISLE_H)보다 작아진다. 그 밖은 범위 비율
 */
function viewAspect(v: MapView, ids: string[]): number {
  if (!v.isles.length || !ids.every((id) => v.isles.includes(id))) return aspectOf(v.fit);
  const n = v.isles.length, c = Math.min(n, 3), rows = Math.ceil(n / c);
  return Math.round(((c * ISLE_W + (c - 1) * ISLE_GAP) / (rows * ISLE_H + (rows - 1) * ISLE_GAP + ISLE_NOTE_H)) * 1000) / 1000;
}

/**
 * 과 시작·과 요약 지도(2026-11-15 사용자 결정 '서울 전체가 나오게'): 과만 확대하지 않고 홈 과 지도·단원 쪽 지도와 같은 지역(동 단원은 그 시·군·구,
 * 시·도 단원은 전국) 전체 범위·섬 상자(wholeView → viewSpec)와 지도 칸 비율(viewAspect — 지역 칸 모두로)에 이번 과를 칠한다.
 * whole = 이번 과만 밝아도 먼 섬 상자를 보이고 섬 상자·축척 막대 자리를 지역 칸 모두로 정한다(maps.ts mountMap — 홈 지도와 같은 자리).
 * 위치 지도는 넘기지 않는다 — 과 확대 + 위치 지도는 문제 화면만(play.ts)
 */
function lessonWhole(r: Region): { ar: number; spec: Pick<MapSpec, 'home' | 'isles' | 'whole'> } {
  const v = wholeView(r);
  return { ar: viewAspect(v, r.items.map((it) => it.id)), spec: { ...viewSpec(r, v), whole: true } };
}
/** 과 시작·요약 범례의 '이번 과 아님': 과가 하나뿐인 단원(대전·울산·울릉군 등)은 지역 칸 모두가 이번 과라 그 색 칸이 지도에 없어 뺀다 */
const otherKey = (r: Region, items: string[]): KeyItem[] => (r.items.some((it) => !items.includes(it.id)) ? [{ s: 'ctx', label: L.playKey.ctxLesson }] : []);

/** 동 단원이 지역 지도에서 차지하는 칸: 일반구 단원은 시 칸(경기 시 층), 그 밖은 그 시·군·구 칸 */
export const unitCellOf = (u: UnitRef) => u.index.si ?? `kr:sgg:${u.code}`;
/** 단원 키(등록 전이면 동 색인) → 지역 지도 칸 */
function cellOfUnitKey(reg: Registry, key: string): string | null {
  const ref = reg.unit(key);
  if (ref) return unitCellOf(ref);
  const u = reg.region(key)?.unit;
  return u ? u.si ?? `kr:sgg:${u.code}` : null;
}

/** 경계 데이터 판(kr-20261001.1)에서 '경계 2026년 10월 기준' */
function asOfText(ver: string): string {
  const m = /(\d{4})(\d{2})\d{2}/.exec(ver);
  return m ? L.asOf(Number(m[1]), Number(m[2])) : '';
}

/** 큰 제목: '\n' 은 줄바꿈, mark 는 형광펜(배경 장식일 뿐 글은 그대로 읽힌다). mark 를 못 찾으면 형광펜 없이 */
function headHtml(text: string, mark: string, tone: 'hl' | 'ok'): string {
  const br = (s: string) => esc(s).replace(/\n/g, '<br>');
  const i = mark ? text.indexOf(mark) : -1;
  if (i < 0) return br(text);
  return `${br(text.slice(0, i))}<span class="h-hl ${tone}">${esc(mark)}</span>${br(text.slice(i + mark.length))}`;
}

/** '3과' / 'Lesson 3' */
const lessonNoText = (no: number) => L.lessonNo(no).replace(/^lesson/, 'Lesson');

/** 쪽 머리: 라벨 줄(견본 + 글) → 큰 제목 h1(title 은 HTML). extra 는 제목 아래에 붙는다 */
const headBlock = (label: string, swatch: string | null, title: string, extra = '') =>
  `<div class="h-head"><p class="h-label">${swatch ? sw(swatch) : ''}<span>${esc(label)}</span></p><h1 class="h-title">${title}</h1>${extra}</div>`;

/** 범례 한 칸: 견본 + 글(+ 폰에서만 보이는 수). wide 는 넓은 화면에만 */
type KeyItem = { s: string; label: string; n?: number; wide?: boolean };
const keyHtml = (items: KeyItem[]) =>
  items.map((k) => `<span class="lg${k.wide ? ' wide-only' : ''}">${sw(k.s)}${esc(k.label)}${k.n !== undefined ? `<b class="n num">${k.n}</b>` : ''}</span>`).join('');
// 일반구 단원은 부모 지역 경계(한강 띠 포함)를 그대로 그린다
const riverKey = (r: Region): KeyItem[] => (riverOn(r.unit?.gu ? r.unit.parent : r.key) ? [{ s: 'water', label: L.legendRiver, wide: true }] : []);
/** 지역의 일반구 단원(계획서 N5 · E7 — 등록돼 있을 때만: 일반구를 끈 창·지역 표 gu off 이면 없음) */
const guOf = (reg: Registry, region: string): Region | null => reg.region(`${region}/gu`) ?? null;
/** 일반구 단원 링크(지역 쪽·홈·구 고르기) */
const guLink = (g: Region) => lk(link({ name: 'unit', region: g.key }), L.guGo(g.items.length));

/**
 * 지도 묶음(홈과 같은 모양): 캡션 줄(윗선 2px 먹, 넓은 화면만) → 틀 있는 지도(범위 비율 --ar, 화면 높이로 상한) → 범례 줄.
 * --ar 은 묶음에 둔다: 한 단 화면에서는 캡션·지도·범례가 함께 그 비율의 폭으로 줄어든다(app.css)
 */
function mapColumn(o: { key: string; label: string; aria: string; ar: number; cap: string; note?: string; keys: KeyItem[]; desc?: string; tools?: string }): string {
  return `<section class="h-mapcol" aria-label="${esc(o.label)}" style="--ar:${o.ar}">
      <div class="h-cap wide-only"><span class="h-ct">${esc(o.cap)}</span>${o.note ? `<span class="h-cs">${esc(o.note)}</span>` : ''}</div>${o.tools ?? ''}
      <div class="map-box h-map" data-map="${o.key}" role="img" aria-label="${esc(o.aria)}"></div>
      <div class="h-legend"><div class="h-lg" role="group" aria-label="${esc(L.legendAria)}">${keyHtml(o.keys)}</div>
        ${o.desc ? `<p class="h-rd wide-only">${esc(o.desc)}</p>` : ''}</div>
    </section>`;
}

/** 숫자 칸(36px 700 + 견본·이름). 선으로 나눈 칸 */
const statsHtml = (cells: { s?: string; label: string; n: string | number }[], cls = '') =>
  `<div class="h-stats${cls ? ` ${cls}` : ''}" style="--n:${cells.length}">${cells.map((c) => `<div><b class="num">${esc(c.n)}</b><span>${c.s ? sw(c.s) : ''}${esc(c.label)}</span></div>`).join('')}</div>`;

/** 이렇게 공부해요 세 걸음 */
const howSteps = () => `<ol class="h-steps">${L.howSteps.map(([a, b], i) => `<li><span class="h-st"><i class="h-sn" aria-hidden="true">${i + 1}</i><b>${esc(a.replace(/^[①-⑩]\s*/, ''))}</b></span><span class="h-sd">${esc(b)}</span></li>`).join('')}</ol>`;

/** 밑줄 글자 링크(폰은 54px 줄) */
const lk = (href: string, text: string) => `<a class="h-link" href="${href}"><span>${esc(text)}</span> <i aria-hidden="true">→</i></a>`;

/**
 * 과 카드 줄의 칸들(홈·단원 쪽): 칸 전체가 그 과의 시작 카드로 가는 링크. 꼬리표(✓ 끝 · 추천 · n/t 이어서) · 이름 · 짧은 곳 이름 · 네모 줄 · 상태 한 줄.
 * focusNo = 지금 배울 과(네모 노랑), recNo = 추천 칸(옅은 노랑 바탕), thin = 복습 날(노랑 네모의 테두리를 가늘게).
 * card = 홈 측정 값(data-card="lesson")을 다는가 — 홈에서만
 */
interface CellOpt { focusNo: number | null; recNo: number | null; due: Set<string>; thin: boolean; nextLabel: string; stFocus(n: number): string; card: boolean }
function lessonCells(ctx: Ctx, r: Region, f: Record<string, number>, o: CellOpt): string {
  const { reg } = ctx;
  return r.lessons.map((l) => {
    const st = lessonTag(ctx, r, l.no);
    const tag = st.cls === 'rec' && l.no !== o.recNo ? '' : st.tag;
    const inFocus = o.focusNo === l.no ? l.items : [];
    const lt = tally(l.items, f, inFocus);
    const due = l.items.filter((id) => o.due.has(id)).length;
    const line = inFocus.length && lt.next ? o.stFocus(lt.next) : lt.filled ? L.stFilled(lt.total, lt.filled, lt.mastered, due) : L.stNotYet(lt.total);
    const parts = ([[L.legend[3], lt.mastered], [L.legend[1], lt.learning], [o.nextLabel, lt.next], [L.legend[0], lt.none]] as [string, number][]).filter((p) => p[1] > 0);
    const dots = cellStates(l.items, f, inFocus).map((s) => sw(s === 'next' && o.thin ? 'next thin' : s)).join('');
    return `<li class="h-lc${l.no === o.recNo ? ' rec' : ''}"><a href="${link({ name: 'lesson', region: r.key, no: l.no })}"${o.card ? ' data-card="lesson"' : ''}>
      <span class="no">${esc(lessonNoText(l.no))}</span>${tag ? `<span class="tag">${esc(tag)}</span>` : ''}<span class="nm">${esc(L.lesson(l))}</span>
      <span class="pl">${l.items.map((id) => esc(L.short(reg.place(id)!.item))).join(SEP)}</span>
      <span class="ft"><span class="dots" role="img" aria-label="${esc(L.dotsAria(lt.total, parts))}">${dots}</span>
      <span class="st">${esc(line)}</span></span><span class="ar" aria-hidden="true">→</span></a></li>`;
  }).join('');
}

/* ---------- 홈 '오늘 공부'(설계서 4.3, 합본 디자인 3.2) ---------- */

/**
 * 홈 지도에 넘기는 값(합본 디자인 3.1): 지역 전체 한 장에 축척 막대.
 * 이름표는 다 익힌 칸(흰 글자)과 지금 배울 과의 칸(먹 글자)에만 — 자리가 없으면 빼고, 좁은 지도(휴대폰)에는 그리지 않는다.
 * 노랑은 지금 배울 과에서 아직 칠하지 않은 칸(일부만 칠한 과는 칠한 칸이 제 색을 지킨다 — 진도 숫자 '다음 과'와 같은 칸).
 * 굵은 테두리는 그 과, 복습 날은 복습할 칸. 복습할 칸에는 늘 먹색 점. 단원 쪽 지도도 같은 값을 쓴다
 */
function homeMap(ctx: Ctx, r: Region, f: Record<string, number>, o: { focus: string[]; review: string[]; reviewDay: boolean; unit?: string[] | null }): MapSpec {
  const { focus, review, reviewDay } = o;
  // 주 카드가 동 단원 일(그 단원의 다음 과·이어서 하기)이면 지역 지도에서는 그 단원의 칸을 굵은 테두리 + 이름으로만 보인다(일반구 단원은 그 과의 시 칸들).
  // 칸 색은 그 칸의 채움 단계 그대로(노랑으로 덮으면 범례·숫자 칸의 '다 익힘·익히는 중' 수와 지도가 어긋난다 — E5 검수)
  const mark = o.unit?.length ? o.unit : focus;
  // 복습 점이 놓이는 칸에는 이름을 두지 않는다(같은 자리)
  const named = [...r.items.filter((it) => f[it.id] === 3).map((it) => it.id), ...(reviewDay ? [] : mark)].filter((id, i, a) => a.indexOf(id) === i && !review.includes(id));
  return {
    region: r.key, home: r.fit, scaleBar: true, fills: f,
    highlight: o.unit?.length ? [] : unfilled(focus, f), bold: reviewDay ? review : mark, badges: review,
    labels: named.map((id) => ({ id, text: mapName(ctx, id) })),
    // 이름표가 6곳 이하(처음 온 날의 첫 과 등)면 빠진 한 곳이 눈에 띄어 꼭 보이게(자리가 없으면 흰 판). 그보다 많으면 자리가 있을 때만.
    // 시·도 단원(korea, E10)은 16칸뿐이라 늘 꼭 보이게(fit 이면 다 익힌 서울·세종·대전·대구 같은 안쪽 작은 칸의 이름이 빠진다).
    // 어느 쪽이든 휴대폰 지도(칸 폭 560 미만)에는 이름표가 없다(계획서 3.1)
    labelMode: named.length <= 6 || r.layer === 'sido' ? 'must' : 'fit', labelMinWidth: COMPACT_PX,
  };
}

/** 쪽 지도 이름표 글: 영어는 짧은 이름('Jongno' — 과 카드와 같은 L.short. 긴 '-gu' 이름은 칸에 덜 들어 다 익힌 곳 이름이 빠진다), 한국어는 그대로 */
const mapName = (ctx: Ctx, id: string) => (L.lang === 'en' ? L.short(ctx.reg.place(id)!.item) : nm(ctx, id));
/**
 * 과 시작·요약 지도 이름표 글(꼭 보이는 must): 영어 동은 짧은 이름('Hupyeong 3' · 'Bon-dong' · 'Jinan-eup' — L.short, 쪽 지도·둘러보기와 같음).
 * 영어 동 전체 이름은 한글보다 훨씬 길어(가운데값 12자) 폰·확대 상자에서 판이 서로 덮이고 상자 밖으로 잘렸다(EN_EMD 점검 A, 2026-11-16 고치기).
 * 위 이름 줄·문제 큰 글자·결과 목록은 전체 이름 그대로. 한국어와 영어 시·군·구·일반구·시·도 과는 전과 같이 전체 이름
 */
const lessonMapName = (ctx: Ctx, id: string) => (L.lang === 'en' && isEmd(id) ? L.short(ctx.reg.place(id)!.item) : nm(ctx, id));
/**
 * 과 시작·요약 지도 이름표 하나: 영어 동은 한국어 이름도 함께(fitText — 확대 상자 범위 좁히기를 한국어 이름 판 크기로도 잰다. 판이 긴 영어는 몰림으로 덜 잡혀
 * 한국어는 좁히는 상자를 영어는 넓은 채 두었다 — 결정표 D110, svgmap MapLabel.fitText · zoombox.ts zoomFit alt). 한국어 앱 이름표는 전과 같다
 */
const lessonMapLabel = (ctx: Ctx, id: string): MapLabel => (L.lang === 'en' && isEmd(id) ? { id, text: lessonMapName(ctx, id), fitText: ctx.reg.place(id)!.item.ko } : { id, text: lessonMapName(ctx, id) });
/**
 * 이름 줄(과 시작 .h-places)의 이름 하나: 영어는 이름 안에서 줄을 바꾸지 않는다(.nw — 'Muak-/dong' 처럼 붙임표에서 갈라지지 않게.
 * 가장 긴 영어 동 이름도 30자라 폰 한 줄에 든다). 한국어는 전과 같은 글(이스케이프만)
 */
const nameRun = (s: string) => (L.lang === 'en' ? `<span class="nw">${esc(s)}</span>` : esc(s));

/**
 * 동 쪽(구 고르기·동 단원 쪽)의 [오늘 복습] 단추를 둘지: 지금 #/review 가 열 판(todayReview 기본 — 시·군·구 몫이 먼저, N32)이
 * 시·군·구 몫이 아니고 이 쪽의 동(ids)을 담을 때만. 시·군·구 몫이 남은 날 누르면 시·군·구 판이 열려 단추 수(이 쪽 동)와 어긋난다(E5 검수).
 * 지역 단원 쪽의 단추는 전과 같다(운영 그대로)
 */
function emdReviewOpens(ctx: Ctx, ids: string[]): boolean {
  if (!ids.length) return false;
  const today = ctx.today();
  const plan = todayReview(ctx.reg, ctx.mastery, today, dailyFor(ctx.daily, today).n, dailyFor(ctx.dailyEmd, today).n);
  const set = new Set(ids);
  return plan.part !== 'sgg' && plan.round.some((id) => set.has(id));
}

/** 탭·지역 고르기 칸의 수 글: 과 없는 지역(세종·제주)은 그 지역의 동 수('25곳'), 그 밖은 '25개 구' */
const areaCount = (reg: Registry, x: Region) => (unitMain(reg, x.key) ? L.places(mainIds(reg, x.key).length) : L.count(x));

/**
 * 홈 지역 탭(계획서 N22). 탭 칸은 넷까지(폰 한 줄 — E8). 탭이 될 곳(지역 + 시·도 단원 korea)이 4곳 이하면 모두(E10 의 세 지역 + 전국).
 * N22 '공개 지역이 4개 이하면 모두 보입니다': 지역(시·도 단원은 지역이 아니다)이 넷 이하이면 지역은 모두 탭으로 둔다 — E11 운영(서울·부산·인천·경기)은
 * 네 지역 탭이고, 시·도 단원은 지역 고르기의 '시·도 한눈에'로 간다('다른 지역' 칸을 더하면 다섯 칸이라 폰 한 줄에 들지 않는다).
 * 처음엔 E8 이 korea 까지 세어 E11 에서 접기가 켜졌고, 처음 온 사람의 탭에서 개설 때부터 있던 경기가 빠졌다(E11 검수).
 * 다만 시·도 단원을 공부한 사람(마지막 지역이 korea 이거나 칠한 시·도가 있음)과 지금 탭이 시·도 단원이면 korea 도 탭이 될 곳으로 세어 아래 접기 규칙을 쓴다
 * (지금 탭으로만 세면 '전국' 탭에서 '서울'을 누를 때 탭 줄이 네 지역으로 바뀌며 전국 탭이 사라진다).
 * 접기: 공부한 지역 최근 순 3곳 + '다른 지역'(more = 탭에 없는 곳 수). 최근 순은 저장값을 늘리지 않고 고른다(계획서 N16 — 새 키 없이):
 * 마지막으로 공부한 지역(kgq_last_v1)이 맨 앞, 그다음은 그 지역에서 칠한 곳의 마지막 공부 날이 늦은 차례.
 * 마지막 공부 날은 '다음 복습일 − 그 상자의 간격'으로 되살린다 — 과를 마친 날·복습을 맞힌 날은 정확히 그날이다(afterLesson·afterReview).
 * 복습일을 그대로 견주면 상자가 높은(오래 익힌) 지역의 복습일이 멀어 오늘 처음 공부한 지역보다 앞에 선다(E8 검수).
 * 틀린 복습은 내일로 당겨져 며칠 이르게 잡히고, 졸업한 곳(복습일 없음)은 공부한 지역으로만 친다(맨 뒤).
 * 공부한 지역이 셋보다 적으면 공개 차례(지역 표 openOrder — 서울·인천·경기·부산·대구 …, E12)로 채우고, 지금 탭이 그 셋에 없으면 셋째 자리에 넣는다
 * — 지역이 다섯 이상이면(E12 부터 여덟) 처음 온 사람은 서울·인천·경기 + 다른 지역. 지역 표 차례(코드 차례)로 채우면 '서울·부산·대구'가 되어
 * 개설 때부터 있던 인천·경기가 처음 온 사람의 탭에서 빠졌다(E11 검수가 E12 로 넘긴 일). 표에 없는 곳(시·도 단원 korea)은 맨 뒤
 */
export function homeTabs(ctx: Ctx, current: string, areaOfId: (id: string) => string | undefined): { keys: string[]; more: number } {
  const { reg, mastery: m } = ctx;
  const regs = reg.regions.map((x) => x.key);
  const korea = reg.region('korea') ? 'korea' : null;
  const all = [...regs, ...(korea ? [korea] : [])];
  if (!all.includes(current)) all.push(current);
  if (all.length <= 4) return { keys: all, more: 0 };
  const GRAD = Number.MIN_SAFE_INTEGER;
  const latest = new Map<string, number>();
  for (const id of Object.keys(m)) {
    if (fillOf(m, id) < 1) continue;
    const a = areaOfId(id);
    if (!a || !all.includes(a)) continue;
    const r = get(m, id);
    const day = r.due === null ? GRAD : r.due - (INTERVAL[r.box] ?? 0);
    latest.set(a, Math.max(latest.get(a) ?? GRAD, day));
  }
  const last = ctx.last ? reg.areaOf(ctx.last) : undefined;
  const koreaOn = !!korea && (current === korea || last === korea || latest.has(korea));
  if (regs.length <= 4 && regs.includes(current) && !koreaOn) return { keys: regs, more: 0 };
  // 빈자리를 채우는 차례(E12): 지역 표 openOrder(공개 차례 — 서울·인천·경기·부산·대구…) → 표에 없는 곳(시·도 단원 korea)은 맨 뒤.
  // 지역 표 차례(코드 차례)로 채우면 처음 온 사람의 탭이 '서울·부산·대구'가 되어 먼저 연 인천·경기가 빠진다(E11 검수 남은 일).
  // 다 채움 카드의 '남은 지역' 단추(core/next.ts)도 같은 차례다(sidos.ts byOpenOrder)
  const fill = byOpenOrder(all, (k) => k);
  const studied = [...latest.keys()].sort((a, b) => Number(b === last) - Number(a === last) || latest.get(b)! - latest.get(a)! || fill.indexOf(a) - fill.indexOf(b));
  let keys = studied.slice(0, 3);
  // 셋을 먼저 채우고 지금 탭이 없을 때만 셋째 자리에 넣는다 — 보이는 탭을 누를 때 탭 차례가 바뀌지 않게
  // (E11: 처음 온 사람이 '부산'을 누르면 부산이 맨 앞으로 옮겨 가 누른 자리 밑에서 탭이 바뀌었다)
  for (const k of fill) { if (keys.length >= 3) break; if (!keys.includes(k)) keys.push(k); }
  if (!keys.includes(current)) keys = [...keys.slice(0, 2), current];
  return { keys, more: all.length - keys.length };
}

export function homePage(ctx: Ctx): Page {
  const { reg, mastery: m } = ctx;
  const today = ctx.today();
  // 지역 키는 그대로, 동 단원 키(seoul/jongno-gu)는 그 지역 키(홈 탭은 단원의 지역으로 연다 — 계획서 N9)
  const known = (k: string | null | undefined) => (k && reg.areaOf(k)) || null;
  const deck = ctx.lessonDeck ?? ctx.otherDeck;
  const daily = dailyFor(ctx.daily, today);
  const plan = todayReview(reg, m, today, daily.n, dailyFor(ctx.dailyEmd, today).n);
  // 곳의 지역: 동은 그 단원의 지역(단원 파일을 받기 전에도 동 색인으로 — 홈 탭·'먼저 할 일'은 지역 단위, N9)
  const regionOf = (id: string) => { const k = reg.place(id)?.region.key; return (k && reg.areaOf(k)) || reg.unitOf(id)?.region; };
  // 카드 차례(처음 → 이어서 → 복습 → 다 채움 → 다음 과)는 그대로. '마지막 지역' 자리에 탭 지역을 넘겨 다음 과·다 채움을 그 지역에서 고른다
  // (마지막 동 단원은 그 지역 탭에서만 다음 과 자리에 온다 — core/next.ts homeCard)
  const cardFor = (key: string) => homeCard({ reg, mastery: m, deck, daily: ctx.daily, dailyEmd: ctx.dailyEmd, last: key, lastUnit: ctx.lastUnit, today });
  // 지역 탭: 고른 탭 → 마지막으로 공부한 지역 → 첫 지역(서울). 탭이 제목·지도·진도·과 줄을 함께 바꾼다
  // 과 없는 지역(세종·제주, 계획서 N4 · E8)은 홈을 그 지역의 주 단원(동 단원)으로 그린다. 주 단원을 아직 받지 못했으면(받기 실패) 그 탭은 열지 않는다
  const shownOf = (k: string): Region | null => {
    if (!unitMain(reg, k)) return reg.region(k) ?? null;
    const u = homeUnitOf(reg, m, k, ctx.lastUnit);
    return u ? reg.region(u) ?? null : null;
  };
  const usable = (k: string | null) => (k && shownOf(k) ? k : null);
  const picked = usable(known(ctx.homeRegion));
  // 첫 지역은 공개 차례 첫째(byOpenOrder — 처음 온 사람의 첫 과 core/next.ts homeCard 와 같은 차례, E16 검수: 서울이 격리로 빠지면 인천)
  let key = picked ?? usable(known(ctx.last)) ?? byOpenOrder(reg.regions, (x) => x.key).find((x) => shownOf(x.key))!.key;
  let card = cardFor(key);
  if (!picked) {
    // 탭을 고르지 않았으면 처음 탭을 주 카드에 맞춘다: 이어서 할 판의 지역, 이 지역에 복습할 곳이 없으면 복습할 곳이 있는 첫 지역
    const want = card.type === 'resume' ? usable(known(card.region))
      : card.type === 'review' && !plan.round.some((id) => regionOf(id) === key) ? usable(known(card.byRegion[0]?.region)) : null;
    if (want && want !== key) { key = want; card = cardFor(key); }
  }
  // area = 탭 지역(지역 또는 시·도 단원 korea), r = 주 구역·지도·과 카드 줄이 그리는 것(과 없는 지역이면 그 주 단원, 그 밖은 area 그대로)
  const area = reg.region(key)!;
  const main = unitMain(reg, key);
  const r = shownOf(key)!;
  const f = fillsOf(m, r);
  const ids = r.items.map((it) => it.id);
  const inShown = new Set(ids);
  const reviewHere = plan.round.filter((id) => regionOf(id) === key && (!main || inShown.has(id)));
  // 고른 탭이 주 카드의 지역이 아니면(다른 지역에서 하던 판 · 이 지역에 없는 복습) 그 일은 맨 위 '먼저 할 일' 한 줄로 줄이고,
  // 주 구역은 탭 지역의 다음(첫) 과 또는 다 채움을 보여 준다. 이때 주 구역 단추는 보조 모양이고 판을 바로 시작하지 않는다(하던 판을 덮지 않게 과 시작 카드로)
  const away = (card.type === 'resume' && !!card.region && known(card.region) !== key) || (card.type === 'review' && !reviewHere.length);
  const tabNext = nextLesson(reg, m, r.key);
  // 먼저 할 일 모드의 주 구역용 다음 과 카드: recommend 는 core/next.ts homeCard 의 추천 식과 같아야 한다(DAILY_CAP − 오늘 수 ≥ NEW_SLACK).
  // tomorrow 는 여기서 읽지 않는다(진도 머리 오른쪽 글은 진짜 card 를 본다).
  // 다 채움의 남은 지역은 core/next.ts homeCard 와 같은 공개 차례(byOpenOrder — E16 검수: 지역 표 코드 차례로 두면 서울 다음에 마지막으로 연 전남광주가 왔다)
  const view: HomeCard = !away ? card
    : tabNext === null ? { type: 'done', region: r.key, more: byOpenOrder(reg.regions.filter((x) => !regionDone(reg, m, x.key)).map((x) => x.key), (k) => k) }
    : { type: 'next', region: r.key, lesson: tabNext, recommend: DAILY_CAP - daily.n >= NEW_SLACK, tomorrow: 0 };
  // 복습 날 지도: 이 지역에 복습할 곳이 있으면 굵은 테두리가 그 칸으로 간다(다음 과는 노랑만, 이름 없이). 다른 지역에만 있으면 여느 날과 같다
  const reviewDay = view.type === 'review';
  const first = view.type === 'new';
  const lessonOf = (no: number | null | undefined) => (no ? reg.lesson(r.key, no) ?? null : null);
  // 마지막 동 단원의 다음 과(N9): 주 구역(라벨·제목·이름 줄·단추)은 그 단원의 과로 그린다. 지도·과 카드 줄은 탭 지역 그대로 두고,
  // 지역 지도에서 그 단원의 칸을 굵은 테두리·이름으로 보인다(E5, 칸 색은 채움 단계 그대로). 동 과를 이어서 할 때도 같다
  // 과 없는 지역은 그 단원이 곧 주 구역(r)이라 '다른 단원의 다음 과'가 아니다
  const unitR = view.type === 'next' && view.unit && view.unit !== r.key ? reg.region(view.unit) ?? null : null;
  const unitL = unitR && view.type === 'next' ? reg.lesson(unitR.key, view.lesson) ?? null : null;
  const cardUnit = unitR ? unitR.key : view.type === 'resume' && view.region && view.region !== r.key && known(view.region) === key ? view.region : null;
  // 지역 지도에서 그 단원 일이 보이는 칸: 동 단원은 그 시·군·구 칸, 일반구 단원(E7)은 그 과(다음 과·이어서 하는 과)의 일반구가 든 시 칸들
  const cardLesson = unitL ?? (view.type === 'resume' && cardUnit && view.lesson ? reg.lesson(cardUnit, view.lesson) ?? null : null);
  const unitCells = !cardUnit ? [] : reg.region(cardUnit)?.unit?.gu ? [...new Set((cardLesson?.items ?? []).map((id) => reg.place(id)?.item.si ?? ''))] : [cellOfUnitKey(reg, cardUnit) ?? ''];
  // 지금 배울 과(지도 노랑·숫자 '다음 과'): 처음 = 탭 지역 1과, 이어서 = 하던 과(탭 지역일 때), 그 밖 = 탭 지역의 아직 다 칠하지 않은 첫 과.
  // 주 카드가 동 단원 일이면 없음(지도는 그 단원의 칸)
  const focus = first ? r.lessons[0]
    : cardUnit ? null
    : view.type === 'next' ? lessonOf(view.lesson)
    : view.type === 'resume' && view.region === r.key && view.lesson ? lessonOf(view.lesson)
    : view.type === 'done' ? null
    : lessonOf(tabNext);
  const focusIds = focus?.items ?? [];
  const t = tally(ids, f, focusIds);
  const fresh = t.filled === 0;   // 이 지역에서 칠한 곳이 없다 → '첫 과'
  const region = L.region(r);
  const names = (list: string[]) => list.map((id) => nm(ctx, id)).join(SEP);
  // 복습 줄은 단원이 섞이므로 동은 '종로구 청운효자동'(N12)
  const fullNames = (list: string[]) => list.map((id) => L.fullName(reg, id)).join(SEP);
  // 곳 차례: 지역 → 과 차례(복습할 곳을 지도에서 찾기 쉽게). 동은 그 뒤에 동 색인 차례(단원끼리 모인다). 그 밖(옛 값)은 전처럼 0
  const order = new Map(reg.regions.flatMap((x) => x.lessons.flatMap((l) => l.items)).map((id, i) => [id, i]));
  const rank = (id: string) => order.get(id) ?? (reg.place(id)?.region.unit || reg.unitOf(id) ? order.size + reg.order(id) : 0);
  const inOrder = (list: string[]) => [...list].sort((a, b) => rank(a) - rank(b));

  /* 주 구역: 라벨 → 큰 제목(형광펜) → 이름 줄 → 설명 → 단추. 주 단추 data-card(new·resume·review·next·done)는 측정 값 그대로.
     홈에서 바로 시작하는 '바로 찾기'는 quick, 과 시작 카드로 가는 링크는 lesson(새 값 — 옛 값과 섞이지 않게) */
  // 복습 라벨의 묶음 이름: 동 단원 묶음은 단원 이름('서울 6 · 종로구 4')
  // 동 단원 묶음 이름은 같은 이름이 여러 시·도에 있으면 지역 이름을 붙인다('부산 중구 3' — registry.mixName, N12 · E11). 영어는 'Jongno-gu 4'(L.unitName, EN_EMD 7.1)
  const byName = (b: { region: string; unit?: string }) => (b.unit ? L.unitName(reg, b.unit) : null) ?? L.region(reg.region(b.region)!);
  const whereText = (by: { region: string; n: number; unit?: string }[]) => L.reviewWhere(by.map((b): [string, number] => [byName(b), b.n]));
  const startBtns = (no: number, cardName: string, primary: boolean, key = r.key) => away
    ? `<a class="btn2 h-go" href="${link({ name: 'lesson', region: r.key, no })}" data-card="lesson">${esc(L.start)} <span aria-hidden="true">→</span></a>`
    : `<button class="${primary ? 'btn' : 'btn2'} h-go" type="button" data-act="learn" data-arg="${key}:${no}" data-card="${cardName}">${esc(L.start)} <span aria-hidden="true">→</span></button>
      <button class="btn2 h-go2" type="button" data-act="quick" data-arg="${key}:${no}" data-card="quick">${esc(L.quick)}</button>`;
  let label = '', swatch = 'next', head = '', placeLine = '', desc = '', acts = '';
  if (view.type === 'new' || view.type === 'next') {
    const l = unitL ?? focus!;
    const lr = unitR ?? r;
    const cnt = L.lessonCount(lr, l.items);
    const rec = view.type === 'new' || view.recommend;
    label = `${!rec ? L.nextEyebrow(false) : fresh && !unitR ? L.firstLesson : L.nextEyebrow(true)} · ${lessonLabel(lr, l.no)}`;
    head = headHtml(L.lessonHead(L.lesson(l), cnt), cnt, 'hl');
    placeLine = names(l.items);
    desc = L.newSub;
    acts = startBtns(l.no, view.type, rec, lr.key);
  } else if (view.type === 'review') {
    swatch = 'due';
    label = `${L.kind.review} · ${whereText(view.byRegion)}`;
    const cnt = L.places(view.count);
    head = headHtml(L.reviewHead(cnt), cnt, 'ok');
    placeLine = fullNames(inOrder(plan.round));
    desc = L.reviewSub;
    const nx = view.next ? lessonLabel(reg.region(view.next.unit ?? view.next.region)!, view.next.lesson) : null;
    acts = `<a class="btn h-go" href="${link({ name: 'review' })}" data-card="review">${esc(L.reviewStart)} <span aria-hidden="true">→</span></a>
      ${nx ? `<p class="h-after">${esc(L.nextAfterReview(nx))}</p>` : ''}`;
  } else if (view.type === 'resume') {
    const rr = view.region ? reg.region(view.region) ?? null : null;
    const rl = rr && view.lesson ? reg.lesson(rr.key, view.lesson) ?? null : null;
    swatch = view.kind === 'review' ? 'due' : 'next';
    label = `${L.resume} · ${rl ? lessonLabel(rr!, rl.no) : rr ? L.mixGo(L.region(rr)) : L.kind[view.kind] ?? ''}`;
    if (rl) {
      const cnt = L.lessonCount(rr!, rl.items);
      head = headHtml(L.lessonHead(L.lesson(rl), cnt), cnt, 'hl');
      placeLine = names(rl.items);
    } else head = rr ? headHtml(L.mixGo(L.region(rr)), L.kind.mix, 'hl') : headHtml(L.kind.review, L.kind.review, 'ok');
    // 복습 판을 이어서 할 때는 '복습은 끝나고 해요'라고 하지 않는다
    desc = view.kind !== 'review' && view.review ? L.reviewAfter(view.review) : L.startSub(true);
    // 진행 막대(학습 화면 3.3 과 같은 모양): 틀 1px, 지난 문제 = 옅은 초록, 지금 문제 = 먹색
    const done = Math.max(0, view.n - 1) / view.total, now = 1 / view.total;
    acts = `<button class="btn h-go" type="button" data-act="resume" data-card="resume">${esc(L.resume)} <span aria-hidden="true">→</span></button>
      <div class="h-run"><span class="h-bar" aria-hidden="true"><i style="width:${(done * 100).toFixed(1)}%"></i><b style="left:${(done * 100).toFixed(1)}%;width:${(now * 100).toFixed(1)}%"></b></span><span class="num">${esc(L.questions(view.n, view.total))}</span></div>`;
  } else {
    swatch = 'mastered';
    // 과 없는 지역은 지역 이름과 그 지역 동 전체 수('세종 25곳을 모두 칠했어요')
    const dn = main ? L.region(area) : region;
    label = L.doneLabel(dn);
    const cnt = main ? L.places(mainIds(reg, key).length) : L.count(r);
    head = headHtml(L.doneTitle(dn, cnt), cnt, 'ok');
    desc = view.more.length ? L.doneSub : '';
    // 남은 지역은 그 탭으로(그 지역의 첫 과가 보인다), 시험 입구는 그대로. 먼저 할 일이 따로 있으면 보조 모양·측정 값 없음
    const dc = away ? '' : ' data-card="done"';
    const cls = (lead: boolean) => `${lead && !away ? 'btn' : 'btn2'} ${lead ? 'h-go' : 'h-go2'}`;
    const go = (k: string, lead: boolean) => `<button class="${cls(lead)}" type="button" data-act="homeRegion" data-arg="${k}"${dc}>${esc(L.regionStart(L.region(reg.region(k)!)))} <span aria-hidden="true">→</span></button>`;
    const test = (lead: boolean) => `<a class="${cls(lead)}" href="${link({ name: 'check', region: r.key })}"${dc}>${esc(L.checkGo(region))}</a>`;
    acts = view.more.length ? go(view.more[0], true) + (view.more[1] ? go(view.more[1], false) : test(false)) : test(true);
  }
  // 먼저 할 일(다른 지역의 이어서 하기·복습): 주 카드의 단추와 측정 값을 그대로 단 한 줄
  let pend = '';
  if (away && card.type === 'resume') {
    const rr = reg.region(card.region!)!;
    const rl = card.lesson ? reg.lesson(rr.key, card.lesson) ?? null : null;
    pend = `<button class="h-pend" type="button" data-act="resume" data-card="resume">${sw('next')}<span class="h-pw">${esc(`${L.resume} · ${rl ? lessonLabel(rr, rl.no) : L.mixGo(L.region(rr))}`)}</span><span class="h-pg num">${esc(L.questions(card.n, card.total))} <span aria-hidden="true">→</span></span></button>`;
  } else if (away && card.type === 'review') {
    pend = `<a class="h-pend" href="${link({ name: 'review' })}" data-card="review">${sw('due')}<span class="h-pw">${esc(`${L.kind.review} · ${whereText(card.byRegion)}`)}</span><span class="h-pg">${esc(L.reviewStart)} <span aria-hidden="true">→</span></span></a>`;
  }
  const hero = `<div class="h-head${pend ? ' pend' : ''}">${pend}<p class="h-label">${sw(swatch)}<span>${esc(label)}</span></p><h1 class="h-title">${head}</h1></div>
    ${placeLine || desc ? `<div class="h-names">${placeLine ? `<p class="h-places">${esc(placeLine)}</p>` : ''}${desc ? `<p class="h-desc">${esc(desc)}</p>` : ''}</div>` : ''}
    <div class="h-acts">${acts}</div>`;

  /* 범례·숫자: 다 익힘 / 익히는 중 / 다음(첫) 과 / 아직 (+ 오늘 복습 점, 한강). 폰에서는 범례가 숫자를 겸한다 */
  const nextLabel = fresh ? L.firstLesson : L.legendNext;
  const stats: { s: string; label: string; n: number }[] = [];
  if (!first) stats.push({ s: 'mastered', label: L.legend[3], n: t.mastered }, { s: 'learning', label: L.legend[1], n: t.learning });
  if (focus && t.next) stats.push({ s: reviewDay ? 'next thin' : 'next', label: nextLabel, n: t.next });
  stats.push({ s: 'none', label: L.legend[0], n: t.none });
  const keyItems: KeyItem[] = [
    ...(reviewHere.length ? [{ s: 'due', label: L.kind.review, n: reviewHere.length }] : []),
    ...stats,
    ...riverKey(r),
  ];
  const full = L.regionFull(r), asOf = asOfText(ctx.ver);
  const mapAria = `${L.fillMap(region)}: ${keyItems.filter((k) => k.n !== undefined).map((k) => `${k.label} ${k.n}`).join(', ')}`;
  // 지도 범위·섬 상자는 단원 쪽·지역 쪽과 같다(wholeView — 과 없는 지역은 주 단원, 지역은 화면 insets 가 있을 때만 섬 상자, E13 검수)
  const mv = wholeView(r);
  const mapCol = mapColumn({ key: 'main', label: L.fillMap(region), aria: mapAria, ar: viewAspect(mv, ids), cap: `${full} · ${L.count(r)}`, note: asOf, keys: keyItems, desc: L.regionDesc[key]?.[0] });

  /* 진도 블록(처음 온 사람은 그 자리에 '이렇게 공부해요' 세 걸음). 저장 안내·저장 못 하는 창·앱 안 브라우저 경고를 함께 */
  const warn = warnNotes(ctx);
  const capNarrow = `<p class="h-note narrow-only">${esc(full)}${asOf ? ` · ${esc(asOf)}` : ''}</p>`;
  const steps = howSteps();
  // 진도 머리 오른쪽: 이 지역의 오늘 복습 수(다른 지역 복습을 이 지역 진도에 붙이지 않는다). 복습이 없는 날은 '오늘 복습 끝 · 내일 N곳'
  const right = card.type === 'resume' && card.kind === 'review' ? ''
    : reviewHere.length ? L.reviewTitle(reviewHere.length)
    : card.type === 'next' ? L.reviewDone(card.tomorrow)
    : card.type === 'done' ? L.reviewDone(tomorrowCount(reg, m, today)) : '';
  const prog = first
    ? `<section class="h-prog" aria-labelledby="h-how">
        <div class="h-ph"><h2 class="h-pt" id="h-how">${esc(L.how)}</h2><span class="h-pr">${esc(L.noLogin)}</span></div>
        ${steps}
        <p class="h-note">${esc(L.filledNone)} · ${esc(L.notes.saved)}</p>${capNarrow}${warn}</section>`
    : `<section class="h-prog" aria-label="${esc(L.progAria(region, ids.length))}">
        <div class="h-ph"><span class="h-pt num">${esc(t.filled ? L.filled(ids.length, t.filled, t.mastered) : L.filledZero(ids.length))}</span>${right ? `<span class="h-pr">${esc(right)}</span>` : ''}</div>
        <div class="h-stats wide-only" style="--n:${stats.length}">${stats.map((s) => `<div><b class="num">${s.n}</b><span>${sw(s.s)}${esc(s.label)}</span></div>`).join('')}</div>
        <p class="h-note"><span class="wide-only">${esc(L.masteredNote)} · </span>${esc(L.notes.saved)}</p>${capNarrow}${warn}</section>`;

  /* 과 카드 줄: 칸 전체가 그 과의 시작 카드로 가는 링크. 추천 칸(지금 할 과)은 옅은 노랑 */
  // 먼저 할 일이 따로 있으면(away) 추천 칸을 두지 않는다(복습 날과 같다)
  const recNo = view.type === 'new' ? focus!.no
    : view.type === 'next' && view.recommend && !away && !unitR ? view.lesson
    : view.type === 'resume' && focus && view.region === r.key && view.lesson === focus.no ? focus.no : null;
  const cells = lessonCells(ctx, r, f, {
    focusNo: focus?.no ?? null, recNo, due: new Set(reviewHere), thin: reviewDay, nextLabel, card: true,
    stFocus: (n) => (card.type === 'review' ? L.stAfterReview(n) : fresh ? L.stFirst(n) : L.stNext(n)),
  });
  const links = [
    lk(link({ name: 'explore', region: r.key, slug: null }), L.namedMap(region)),
    lk(link({ name: 'check', region: r.key }), fresh ? L.knowIt(region) : L.checkGo(region)),
    ...(fresh ? [] : [lk(link({ name: 'mix', region: r.key }), L.mixGo(region))]),
    // 일반구 공부하기(E7, 일반구 단원이 있는 지역 — 동보다 먼저, 계획서 N5)
    ...(guOf(reg, r.key) ? [guLink(guOf(reg, r.key)!)] : []),
    // 동까지 공부하기: 동 색인이 있는 지역은 구 고르기로, 없으면(동 공개 전) 서울에만 '준비 중'
    ...(reg.emdUnits(r.key).length ? [lk(link({ name: 'emd', region: r.key }), L.dong[0])]
      : r.key === 'seoul' ? [`<span class="h-link off"><span>${esc(L.dong[0])}</span> <em>${esc(L.soon)}</em></span>`] : []),
    // 과 없는 지역에 단원이 둘 이상이면(제주시·서귀포시) 다른 단원 고르기
    ...(main && reg.emdUnits(key).length > 1 ? [lk(link({ name: 'unit', region: key }), L.otherUnits(L.unitWord(reg.emdUnits(key).map((u) => u.index.ko), key, '시')))] : []),
  ].join('');
  const path = `<section class="h-path" aria-labelledby="h-path">
      <div class="h-lhead"><h2 id="h-path">${esc(L.lessonsHead(region, r.lessons.length))}</h2><span class="h-lhelp wide-only">${esc(L.lessonsHelp)}</span></div>
      <ol class="h-lcs g${r.lessons.length}">${cells}</ol>
      <nav class="h-links" aria-label="${esc(L.more)}">${links}</nav></section>`;

  /* 아래 구역(선으로 나눔): 이렇게 공부해요(처음 온 사람은 위에 있다) · 지역 알아보기(탭 지역의 허브) · 설정 */
  // 허브 쪽은 지역 표 hub(계획서 E8). 그 말의 허브가 없는 탭: 정적 허브가 있는 지역(영어 화면의 인천·경기 — 영어 허브는 서울만)은 전처럼 서울 허브,
  // 허브가 아예 없는 지역(새 시·도 · 전국 korea)은 지역 고르기(#/kr) — 부산 탭에 '서울 25개 구'가 뜨지 않게(E8 검수)
  const hubKey = L.hubs[key] ? key : sidoOf(key)?.hub ? 'seoul' : null;
  const hub = hubKey ? L.hubs[hubKey] ?? ['', ''] : L.pickerLink;
  const hubHref = hubKey ? `${ctx.base}${L.path(`${hubKey}/`)}` : link({ name: 'regions' });
  const more = `<div class="h-more${first ? ' two' : ''}">
      ${first ? '' : `<section class="h-mo" aria-labelledby="h-how"><div class="h-ph"><h2 class="h-pt" id="h-how">${esc(L.how)}</h2><span class="h-pr">${esc(L.tagline)}</span></div>${steps}</section>`}
      <section class="h-mo" aria-labelledby="h-exp"><h2 class="h-pt" id="h-exp">${esc(L.explore)}</h2>
        <a class="h-xl" href="${hubHref}"><span class="h-xt">${esc(hub[0])}</span><span class="h-xs">${esc(hub[1])}</span></a></section>
      <section class="h-mo" aria-labelledby="h-set"><h2 class="h-pt" id="h-set">${esc(L.settings)}</h2>
        <label class="h-toggle"><input type="checkbox" data-set="autoNext"${ctx.settings.autoNext ? ' checked' : ''}><span>${esc(L.autoNext[0])}<small>${esc(L.autoNext[1])}</small></span></label></section>
    </div>`;

  // 지역 탭(계획서 N22 — homeTabs): 지역이 넷 이하면 지역은 모두(E11 은 네 지역, 시·도 단원을 공부한 사람은 접기), 넘으면(E12 부터 여덟) 공부한 지역(최근 순) 3곳 + '다른 지역'(지역 고르기).
  // 폰에서 칸이 넷이면(네 지역, 세 지역 + 전국, 또는 세 곳 + 다른 지역) 한 칸이 약 97px 라 단위 글을 감춘다(n4 — E8 검수). 세 칸(E9 까지의 세 지역)은 그대로
  const tabList = homeTabs(ctx, key, regionOf);
  const four = tabList.keys.length + (tabList.more ? 1 : 0) >= 4;
  const tabs = `<div class="h-tabs${four ? ' n4' : ''}" role="group" aria-label="${esc(L.homeTabs)}">${tabList.keys.map((k) => {
    const x = reg.region(k)!;
    const on = k === key;
    // 다른 지역에 오늘 복습이 있으면 탭에 먹색 점(지금 탭은 지도에 점이 보인다)
    const dot = !on && plan.byRegion.some((b) => b.region === x.key) ? `<i class="h-dot" aria-hidden="true"></i><span class="visually-hidden">(${esc(L.tabDue)})</span>` : '';
    return `<button class="h-tab" type="button" data-act="homeRegion" data-arg="${x.key}" aria-pressed="${on}">${rk(x)} <span class="u">${esc(areaCount(reg, x))}</span>${dot}</button>`;
  }).join('')}${tabList.more ? `<a class="h-tab go" href="${link({ name: 'regions' })}">${esc(L.otherTab)} <span class="u" aria-hidden="true">+${tabList.more}</span><span class="visually-hidden">${esc(L.otherTabMore(tabList.more))}</span></a>` : ''}</div>`;

  // 지역 지도의 복습 칸: 동은 그 단원의 칸(지역 지도에는 동 칸이 없다 — 점·굵은 테두리를 단원 칸에)
  const inRegion = inShown;
  // 일반구(E7)는 그 일반구가 든 시 칸
  const reviewCells = [...new Set(reviewHere.map((id) => (inRegion.has(id) ? id : reg.place(id)?.item.si ?? cellOfUnitKey(reg, reg.unitOf(id)?.key ?? reg.place(id)?.region.key ?? '') ?? id)))].filter((id) => inRegion.has(id));
  const maps: Record<string, MapSpec> = { main: { ...homeMap(ctx, r, f, { focus: focusIds, review: reviewCells, reviewDay, unit: unitCells.filter((id) => inRegion.has(id)) }), ...viewSpec(r, mv) } };
  const html = `<div class="page home">${tabs}
    <div class="h-main">${hero}${prog}${mapCol}</div>
    ${path}${more}</div>`;
  return { html, maps };
}

/* ---------- 지역 고르기(계획서 N23): 전국 시·도 지도 + 권역별 목록. 아직 열지 않은 지역은 흐리게 '준비 중' ---------- */

/**
 * 전국 시·도 지도(판 폴더 sido.topo.json — 파이프라인이 쓴다)의 범위 [서, 남, 동, 북]. 지도 칸 비율을 지도를 받기 전에 정하려고 둔다.
 * 파이프라인이 manifest 에 적는 범위와 같아야 한다(단위 시험 nationwide.test.ts 가 견준다)
 */
export const KOREA_FIT: BBox = [124.6098, 33.1119, 131.8713, 38.6169];
/** 지역 표의 시·도 → 전국 지도의 칸 id(시·도 단원 korea 의 곳 id 와 같다) */
export const sidoCell = (code: string) => `kr:sido:${code}`;

/** 지역 고르기의 열린 지역 칸(홈 탭과 같은 말): 이름 · 꼬리표 / 곳 수 · 과 수 / 한 줄 / 네모 줄 / 채움 */
function regionCard(ctx: Ctx, x: Region): { html: string; t: ReturnType<typeof tally> } {
  const { reg, mastery: m } = ctx;
  const main = unitMain(reg, x.key);
  // 과 없는 지역(세종·제주)은 그 지역의 동(동 색인)으로 센다(계획서 N4)
  const ids = main ? mainIds(reg, x.key) : x.items.map((it) => it.id);
  const f = Object.fromEntries(ids.map((id) => [id, fillOf(m, id)]));
  const t = tally(ids, f);
  const [desc, tag] = L.regionDesc[x.key] ?? ['', ''];
  // '25개 구 · 5과' · 과 없는 지역은 '25곳 · 4과'
  const meta = main ? L.mainMeta(ids.length, reg.emdUnits(x.key).reduce((s, u) => s + u.index.lessons, 0)) : L.regionMeta(L.count(x), x.lessons.length);
  const parts = ([[L.legend[3], t.mastered], [L.legend[1], t.learning], [L.legend[0], t.none]] as [string, number][]).filter((p) => p[1] > 0);
  const dots = cellStates(ids, f).map((s) => sw(s)).join('');
  return {
    t,
    html: `<li class="h-lc"><a href="${link({ name: 'unit', region: x.key })}">
      <span class="nm">${rk(x)}</span>${tag ? `<span class="tag">${esc(tag)}</span>` : ''}<span class="no">${esc(meta)}</span>
      <span class="pl">${esc(desc)}</span>
      <span class="ft"><span class="dots" role="img" aria-label="${esc(L.dotsAria(t.total, parts))}">${dots}</span>
      <span class="st num">${esc(t.filled ? L.filledTag(t.filled, ids.length) : L.notYet)}</span></span><span class="ar" aria-hidden="true">→</span></a></li>`,
  };
}

export function regionsPage(ctx: Ctx): Page {
  const { reg } = ctx;
  const open = new Set(reg.regions.map((r) => r.key));
  // 영어 앱은 영어 이름을 확인한 지역만 보인다(Q5 — 지역 표 enChecked)
  const named = SIDOS.filter((s) => L.lang !== 'en' || s.enChecked);
  const cards = new Map(reg.regions.map((x) => [x.key, regionCard(ctx, x)]));
  const korea = reg.region('korea');
  const kc = korea ? regionCard(ctx, korea) : null;
  const nameOf = (s: (typeof named)[number]) => (L.lang === 'en' ? s.en : s.ko);
  // 권역마다(계획서 N2): 열린 지역은 칸, 아직 열지 않은 지역은 흐린 이름 한 줄. 지역 표에 없는 열린 지역(옛 데이터)은 맨 끝 묶음
  const rows = [...GROUPS.map((g) => [g, named.filter((s) => s.group === g)] as const), ['', [] as typeof named] as const].map(([g, list], i) => ({
    i, g, name: g ? L.groupName(g) : L.regionsTitle,
    live: g ? list.filter((s) => open.has(s.key)).map((s) => s.key) : reg.regions.filter((x) => !SIDOS.some((s) => s.key === x.key)).map((x) => x.key),
    soon: list.filter((s) => !open.has(s.key)),
  }));
  // 열린 지역이 적으면(4곳 이하 — E11 운영은 네 지역) '준비 중' 지역은 권역별 한 줄씩 접는 구역 하나에 모은다(E8 검수: 폰에서 준비 중 줄 13개가
  // 열린 칸 아래로 펼쳐져 쪽이 두 배로 길어졌다). 그보다 많으면 권역마다 열린 칸 아래에 흐린 이름 한 줄
  const few = reg.regions.length <= 4;
  // 권역에 지역이 하나뿐이고 이름이 권역과 같으면(강원·제주) 이름을 따로 두지 않는다('강원 / 강원 준비 중' 되풀이 없이)
  const solo = (r: (typeof rows)[number]) => !r.live.length && r.soon.length === 1 && nameOf(r.soon[0]) === r.name;
  const sec = (id: string, name: string, help: string, body: string, cls = '') => `<section class="rg-g${cls}" aria-labelledby="${id}">
      <div class="h-lhead"><h2 id="${id}">${esc(name)}</h2>${help ? `<span class="h-lhelp">${esc(help)}</span>` : ''}</div>${body}</section>`;
  const cardsOf = (keys: string[]) => `<ol class="h-lcs g${keys.length} rg">${keys.map((k) => cards.get(k)!.html).join('')}</ol>`;
  const groups = rows.map((r) => {
    if (few ? !r.live.length : !r.live.length && !r.soon.length) return '';
    const soonLine = !few && r.soon.length && !solo(r)
      ? `<p class="rg-soon${r.live.length ? '' : ' only'}"><span>${r.soon.map((s) => esc(nameOf(s))).join(SEP)}</span>${r.live.length ? `<em>${esc(L.soon)}</em>` : ''}</p>` : '';
    return sec(`rg-g${r.i}`, r.name, r.live.length ? L.regionsCount(r.live.length) : L.soon, `${r.live.length ? cardsOf(r.live) : ''}${soonLine}`, solo(r) ? ' solo' : '');
  }).join('');
  const later = rows.filter((r) => r.soon.length);
  const nSoon = later.reduce((s, r) => s + r.soon.length, 0);
  const fold = few && nSoon ? `<details class="rg-more"><summary>${esc(L.othersSoon(nSoon))}</summary>
      <ul class="rg-later">${later.map((r) => `<li><b>${esc(r.name)}</b>${solo(r) ? '' : `<span>${r.soon.map((s) => esc(nameOf(s))).join(SEP)}</span>`}</li>`).join('')}</ul></details>` : '';
  const koreaSec = kc ? sec('rg-kr', L.koreaHead, '', `<ol class="h-lcs g3 rg">${kc.html}</ol>`) : '';

  /* 전국 지도: 열린 지역 칸은 채움 단계(구 고르기 지도와 같은 말 — 아직 · 익히는 중 · 다 익힘), 열지 않은 지역은 바탕색(누를 수 없음) */
  const fills: Record<string, number> = {};
  const active: string[] = [];
  const keyOfCell = new Map<string, string>();
  for (const x of reg.regions) {
    const s = SIDOS.find((y) => y.key === x.key);
    if (!s) continue;
    const c = sidoCell(s.code), t = cards.get(x.key)!.t;
    active.push(c);
    keyOfCell.set(c, x.key);
    fills[c] = t.total && t.mastered === t.total ? 3 : t.filled ? 1 : 0;
  }
  // 열린 수와 분모는 지도 칸(지역 표 16행) 기준이다(E17 검수): 영어는 이름을 숨긴 지역(enChecked false — E17 때 전남광주, 2026-11-15 켬)도 지도에는 흐린 칸으로
  // 그려지는데, 분모를 이름 보인 수(named 15)로 쓰면 '13 of 15 regions open'이 되어 시·도가 15곳인 것처럼 읽혔다. 이제 '13 of 16'(흐린 칸 셋과 맞음)
  const nOpen = SIDOS.filter((s) => open.has(s.key)).length;
  // 지도의 칸이 모두 열렸으면(한국어 E16 — 열여섯 곳) 흐린 칸이 없으니 범례의 '준비 중' 견본과 안내 뒷말('흐리게 보여요')을 뺀다(E16 검수).
  // 영어는 아직 싣지 않은 곳(과 없는 세종·제주)과 이름을 숨긴 곳(enChecked false — 지금은 없음)이 흐린 칸으로 남아 그대로
  const allOpen = nOpen === SIDOS.length;
  const keyItems: KeyItem[] = [{ s: 'none', label: L.pickKey[0] }, { s: 'learning', label: L.legend[1] }, { s: 'mastered', label: L.legend[3] }, ...(allOpen ? [] : [{ s: 'ctx', label: L.soon } as KeyItem])];
  // 라벨은 '지역 고르기'(열린 수는 지도 캡션에 — 넓은 화면에서 같은 줄이 두 번 보이지 않게)
  const head = headBlock(L.homeTabs, null, esc(L.regionsTitle));
  const mapCol = mapColumn({ key: 'kr', label: L.pickerMap, aria: L.pickerMap, ar: aspectOf(KOREA_FIT), cap: L.pickerCap(nOpen, SIDOS.length), note: asOfText(ctx.ver), keys: keyItems });
  return {
    title: L.regionsTitle,
    maps: {
      kr: {
        region: KOREA_MAP, home: KOREA_FIT, scaleBar: true, active, fills,
        // 열린 지역 이름은 늘 꼭 보이게(must — 칸에 안 들면 칸 밖 빈 바탕, 그것도 없으면 흰 판). 전국 지도는 16칸뿐이라 이름표 수가 16을 넘지 않는다.
        // E10 결정(E8 이 넘긴 일): fit 이면 16곳을 다 열었을 때 안쪽 작은 칸(서울·대구·대전·세종)의 이름이 빠져, 시·도 단원 둘러보기·홈 지도와 같은 규칙으로 맞춘다
        labels: active.map((c) => ({ id: c, text: L.region(reg.region(keyOfCell.get(c)!)!) })), labelMode: 'must', labelMinWidth: 0,
        interaction: 'tap',
        onTap: (tp) => { if (tp.type === 'cell' && keyOfCell.has(tp.id)) ctx.go({ name: 'unit', region: keyOfCell.get(tp.id)! }); },
      },
    },
    // 열린 지역이 적으면 폰(599 이하)에서는 열린 칸을 지도보다 먼저 둔다(app.css .rg-page.few — 지도가 거의 비어 첫 화면을 차지하고
    // 열린 칸이 한참 아래로 밀렸다, E8 검수). 읽는 차례(DOM)는 넓은 화면과 같다
    html: `<div class="page rg-page${few ? ' few' : ''}">${backRow()}
      <div class="h-main rg-main">${head}<div class="h-names"><p class="h-desc">${esc(allOpen ? L.pickerSubAll : L.pickerSub)}</p></div>${mapCol}</div>
      <div class="rg-list">${koreaSec}${groups}</div>${fold ? `<div class="rg-rest">${fold}</div>` : ''}
    </div>`,
  };
}

/* ---------- 단원(지역 한 곳: 채움 지도 · 과 카드 줄 · 전체 연습·시험) ---------- */

function lessonTag(ctx: Ctx, r: Region, no: number): { tag: string; cls: string; done: boolean } {
  const d = ctx.lessonDeck;
  if (d && d.region === r.key && d.lesson === no) {
    const p = progress(d);
    return { tag: L.tagResume(p.n, p.total), cls: '', done: false };
  }
  const l = ctx.reg.lesson(r.key, no)!;
  const f = fillsOf(ctx.mastery, r);
  if (l.items.every((id) => f[id] > 0)) return { tag: L.tagDone, cls: 'ok', done: true };
  if (nextLesson(ctx.reg, ctx.mastery, r.key) === no) return { tag: L.tagRec, cls: 'rec', done: false };
  return { tag: '', cls: '', done: false };
}

export function unitPage(ctx: Ctx, regionKey: string): Page {
  const { reg, mastery: m } = ctx;
  const r = reg.region(regionKey)!;
  // 동 단원(계획서 E5): 머리는 '서울 · 동까지 공부하기', 지도는 단원 지도(섬 상자 포함), 아래 링크는 구 고르기·지역 과로
  const parent = r.unit ? reg.region(r.unit.parent) ?? null : null;
  const today = ctx.today();
  const f = fillsOf(m, r);
  const ids = r.items.map((it) => it.id);
  const region = L.region(r);
  // 복습할 곳: 이 지역에서 오늘 복습 때가 된 곳 전부(지금 쪽과 같은 셈)
  const due = r.items.filter((it) => isDue(get(m, it.id), today)).map((it) => it.id);
  const reviewDay = due.length > 0;
  // 지금 배울 과 = 아직 다 칠하지 않은 첫 과(카드의 '추천'과 같은 과). 지도 노랑·숫자 '다음 과'
  const nextNo = nextLesson(reg, m, r.key);
  const focus = nextNo ? reg.lesson(r.key, nextNo) ?? null : null;
  const focusIds = focus?.items ?? [];
  const t = tally(ids, f, focusIds);
  const fresh = t.filled === 0;
  const nextLabel = fresh ? L.firstLesson : L.legendNext;

  // 일반구 단원(계획서 N5 · E7): 머리 '경기 · 일반구 공부하기', 복습 단추는 지역 쪽과 같다(일반구는 시·군·구 몫이라 #/review 가 먼저 연다)
  const gu = !!r.unit?.gu;
  // 일반구 단원 제목은 '경기 일반구 24곳'('경기 일반구 24개 구'처럼 '구'가 겹치지 않게), 영어 'Gyeonggi · 24 city districts'(L.guTitle, EN_EMD 7.1)
  const title = gu ? L.guTitle(region, parent ? L.region(parent) : region, r.items.length) : `${region} · ${L.count(r)}`;
  // 과 없는 지역(세종·제주)의 단원은 '동까지'가 아니라 그 지역의 공부 순서(주 단원, 계획서 N4)
  const mainParent = !!parent && unitMain(reg, parent.key);
  const head = headBlock(parent ? (gu ? L.guLabel(L.region(parent)) : mainParent ? `${L.region(parent)} · ${L.order}` : L.emdLabel(L.region(parent))) : L.order, null, esc(gu ? title : `${region} ${L.count(r)}`));
  const desc = parent ? (gu ? L.guDesc : L.emdDesc(r.lessons.length)) : L.regionDesc[r.key]?.[0] ?? '';
  const names = desc ? `<div class="h-names"><p class="h-desc">${esc(desc)}</p></div>` : '';
  // 동 단원 쪽은 열릴 판이 이 단원의 동을 담을 때만(emdReviewOpens)
  const acts = reviewDay && (!parent || gu || emdReviewOpens(ctx, due)) ? `<div class="h-acts"><a class="btn2 h-go" href="${link({ name: 'review' })}">${esc(L.reviewChip(due.length))}</a></div>` : '';

  /* 진도(홈 진도 블록과 같은 모양): 머리 줄 · 숫자 칸(넓은 화면) · 안내. 폰에서는 범례가 숫자를 겸한다 */
  const stats: { s: string; label: string; n: number }[] = [];
  if (!fresh) stats.push({ s: 'mastered', label: L.legend[3], n: t.mastered }, { s: 'learning', label: L.legend[1], n: t.learning });
  if (focus && t.next) stats.push({ s: reviewDay ? 'next thin' : 'next', label: nextLabel, n: t.next });
  stats.push({ s: 'none', label: L.legend[0], n: t.none });
  const full = L.regionFull(r), asOf = asOfText(ctx.ver);
  const prog = `<section class="h-prog" aria-label="${esc(L.progAria(region, ids.length))}">
      <div class="h-ph"><span class="h-pt num">${esc(t.filled ? L.filled(ids.length, t.filled, t.mastered) : L.filledZero(ids.length))}</span>${reviewDay ? `<span class="h-pr">${esc(L.reviewTitle(due.length))}</span>` : ''}</div>
      ${statsHtml(stats, 'wide-only')}
      <p class="h-note"><span class="wide-only">${esc(L.masteredNote)} · </span>${esc(L.notes.saved)}</p>
      <p class="h-note narrow-only">${esc(full)}${asOf ? ` · ${esc(asOf)}` : ''}</p>${warnNotes(ctx)}</section>`;
  const keyItems: KeyItem[] = [...(reviewDay ? [{ s: 'due', label: L.kind.review, n: due.length }] : []), ...stats, ...riverKey(r)];
  const view = wholeView(r);
  const mapCol = mapColumn({ key: 'unit', label: L.fillMap(region), aria: L.unitMapLabel(region), ar: viewAspect(view, ids), cap: `${full} · ${L.count(r)}`, note: asOf, keys: keyItems });

  /* 과 카드 줄(홈과 같은 칸) → 전체 연습 · 시험 → 글자 링크 */
  const cells = lessonCells(ctx, r, f, {
    focusNo: focus?.no ?? null, recNo: nextNo, due: new Set(due), thin: reviewDay, nextLabel, card: false,
    stFocus: (n) => (reviewDay ? L.stAfterReview(n) : fresh ? L.stFirst(n) : L.stNext(n)),
  });
  const mixNo = r.lessons.length + 1;
  const best = (parent ? ctx.bestUnits : ctx.bests)[r.key];
  const ends = `<ul class="u-ends">
      <li><a href="${link({ name: 'mix', region: r.key })}"><span class="nm">${esc(L.mixName(mixNo, region))}</span><span class="pl">${esc(L.mixSub(r.items.length))}</span><span class="ar" aria-hidden="true">→</span></a></li>
      <li><a href="${link({ name: 'check', region: r.key })}"><span class="nm">${esc(L.checkName(region))}</span><span class="pl num">${esc(L.checkSub(r.items.length))}${best ? ` · ${esc(L.bestTag(best.score, best.total, L.time(best.seconds)))}` : ''}</span><span class="ar" aria-hidden="true">→</span></a></li></ul>`;
  const pickWord = parent ? L.unitWord(reg.emdUnits(parent.key).map((u) => u.index.ko), parent.key, '구') : { one: '', many: '' };
  const guR = !parent ? guOf(reg, r.key) : null;
  const links = [
    lk(link({ name: 'explore', region: r.key, slug: null }), L.namedMap(region)),
    // 일반구 단원: 지역 과로 돌아가기 · 동까지 공부하기(동 색인이 있으면)
    ...(parent && gu ? [lk(link({ name: 'unit', region: parent.key }), L.toRegion(L.region(parent))), ...(reg.emdUnits(parent.key).length ? [lk(link({ name: 'emd', region: parent.key }), L.dong[0])] : [])] : []),
    // 동 단원: 다른 구 고르기 · 지역 과로 돌아가기. 과 없는 지역의 단원은 지역 과가 없어 다른 단원 고르기만(단원이 둘 이상일 때 — 지역 주소가 구 고르기다)
    ...(parent && !gu && !mainParent ? [lk(link({ name: 'emd', region: parent.key }), L.otherUnits(pickWord)), lk(link({ name: 'unit', region: parent.key }), L.toRegion(L.region(parent)))] : []),
    ...(mainParent && reg.emdUnits(parent!.key).length > 1 ? [lk(link({ name: 'unit', region: parent!.key }), L.otherUnits(pickWord))] : []),
    // 일반구 공부하기(E7, 동보다 먼저 — 계획서 N5)
    ...(guR ? [guLink(guR)] : []),
    // 동까지 공부하기: 동 색인이 있으면 구 고르기로. 없으면(동 공개 전) 서울에만 '준비 중'(홈과 같이 맨 끝 — 누를 수 있는 링크 사이에 끼지 않게)
    ...(!parent && reg.emdUnits(r.key).length ? [...(r.key === 'seoul' ? [lk(`${ctx.base}${L.path('seoul/')}`, L.seoulMore)] : []), lk(link({ name: 'emd', region: r.key }), L.dong[0])]
      : r.key === 'seoul' ? [lk(`${ctx.base}${L.path('seoul/')}`, L.seoulMore), `<span class="h-link off"><span>${esc(L.dong[0])}</span> <em>${esc(L.soon)}</em></span>`] : []),
  ].join('');
  const path = `<section class="h-path" aria-labelledby="u-path">
      <div class="h-lhead"><h2 id="u-path">${esc(L.lessonsHead(region, r.lessons.length))}</h2><span class="h-lhelp wide-only">${esc(L.lessonsHelp)}</span></div>
      <ol class="h-lcs g${r.lessons.length}">${cells}</ol>${ends}
      <nav class="h-links" aria-label="${esc(L.more)}">${links}</nav></section>`;

  return {
    title,
    maps: {
      unit: {
        ...homeMap(ctx, r, f, { focus: focusIds, review: due, reviewDay }),
        // 본 땅 화면의 범위와 섬 상자(map/isles.ts — 동 단원, 지역은 화면 insets 가 있을 때만)
        ...viewSpec(r, view),
        interaction: 'tap',
        onTap: (tp) => { if (tp.type === 'cell') ctx.go({ name: 'explore', region: r.key, slug: reg.place(tp.id)!.item.slug }, { state: { src: 'unit_map' } }); },
      },
    },
    html: `<div class="page">${backRow()}
      <div class="h-main">${head}${names}${acts}${prog}${mapCol}</div>
      ${path}</div>`,
  };
}

/* ---------- 과 시작 카드 ---------- */

export function startPage(ctx: Ctx, regionKey: string, no: number): Page {
  const { reg } = ctx;
  const r = reg.region(regionKey)!, l = reg.lesson(regionKey, no)!;
  const d = ctx.lessonDeck;
  const mine = d && d.region === r.key && d.lesson === no ? progress(d) : null;
  const dr = d && !mine && d.region ? reg.region(d.region) : null;
  const other = d && dr && d.lesson !== null ? `${lessonLabel(dr, d.lesson)}(${progress(d).n}/${progress(d).total})` : null;
  const title = lessonLabel(r, l.no);
  const f = fillsOf(ctx.mastery, r);
  const t = tally(l.items, f);
  const cnt = L.lessonCount(r, l.items);
  const arg = `${r.key}:${no}`;

  const head = headBlock(title, 'next', headHtml(L.lessonHead(L.lesson(l), cnt), cnt, 'hl'));
  const names = `<div class="h-names"><p class="h-places">${l.items.map((id) => nameRun(nm(ctx, id))).join(esc(SEP))}</p>
      ${r.key === 'incheon' && no === 1 ? `<p class="h-desc">${esc(L.newNames)}</p>` : ''}<p class="h-desc">${esc(L.startSub(!!mine))}</p></div>`;
  // 주 단추 = 배우기 시작(하던 판이 있으면 이어서 하기), 보조 = 바로 찾기, 처음부터 다시는 밑줄 글자 단추
  const acts = mine
    ? `<button class="btn h-go" type="button" data-act="resume">${esc(L.resumeAt(mine.n, mine.total))} <span aria-hidden="true">→</span></button>
      <button class="btn2 h-go2" type="button" data-act="quick" data-arg="${arg}">${esc(L.quick)}</button>
      <button class="btn-text h-go3" type="button" data-act="learn" data-arg="${arg}">${esc(L.restart)}</button>`
    : `<button class="btn h-go" type="button" data-act="learn" data-arg="${arg}">${esc(L.learn)} <span aria-hidden="true">→</span></button>
      <button class="btn2 h-go2" type="button" data-act="quick" data-arg="${arg}">${esc(L.quick)}</button>`;
  // 아래 구역: 처음 배우는 과는 '이렇게 공부해요' 세 걸음, 칠한 곳이 있으면 이 과의 숫자 칸. 바로 찾기 안내는 함께
  const prog = t.filled === 0
    ? `<section class="h-prog" aria-labelledby="pg-how"><div class="h-ph"><h2 class="h-pt" id="pg-how">${esc(L.how)}</h2></div>
        ${howSteps()}<p class="h-note">${esc(L.quickNoteStart(other))}</p></section>`
    : `<section class="h-prog" aria-label="${esc(L.progAria(title, l.items.length))}">
        <div class="h-ph"><span class="h-pt num">${esc(L.filled(l.items.length, t.filled, t.mastered))}</span></div>
        ${statsHtml([{ s: 'mastered', label: L.legend[3], n: t.mastered }, { s: 'learning', label: L.legend[1], n: t.learning }, { s: 'none', label: L.legend[0], n: t.none }])}
        <p class="h-note">${esc(L.quickNoteStart(other))}</p></section>`;
  // 지역(단원) 전체 지도에 이번 과를 칠한다(lessonWhole — 홈 과 지도와 같은 범위, 위치 지도 없음)
  const lw = lessonWhole(r);
  const mapCol = mapColumn({
    key: 'start', label: L.rangeMap(L.region(r), L.lessonNo(l.no)), aria: L.rangeMap(L.region(r), L.lessonNo(l.no)), ar: lw.ar,
    cap: `${L.regionFull(r)} · ${lessonNoText(l.no)}`, note: asOfText(ctx.ver),
    keys: [{ s: 'next', label: L.thisLesson }, ...otherKey(r, l.items), ...riverKey(r)],
  });
  return {
    title,
    // 이 과의 곳 이름은 꼭 보이게(must — 칸에 안 들면 칸 밖 지시선, 그래도 없으면 흰 판). 한 과는 3~8곳이라 흰 판이 덮을 칸이 적다
    // 이번 과가 지역 전체 지도에 너무 작게 그려지면 과 범위(l.fit)를 확대한 상자를 덧붙인다(zoom — maps.ts · map/zoombox.ts, D95 ㉣)
    // 영어 동은 지도에 짧은 이름(lessonMapName — 위 이름 줄은 전체 이름)
    maps: { start: { region: r.key, active: l.items, highlight: l.items, bold: l.items, ...lw.spec, zoom: l.fit, scaleBar: true, labels: l.items.map((id) => lessonMapLabel(ctx, id)), labelMode: 'must' } },
    html: `<div class="page">${backRow()}
      <div class="h-main">${head}${names}<div class="h-acts">${acts}</div>${prog}${mapCol}</div></div>`,
  };
}

/* ---------- 과 요약 ---------- */

export interface SummaryState { region: string; no: number; newly: string[]; firstTry: number; total: number; confused: string[] }

export function summaryPage(ctx: Ctx, s: SummaryState): Page {
  const { reg } = ctx;
  const r = reg.region(s.region)!, l = reg.lesson(s.region, s.no)!;
  const nl = reg.lesson(r.key, s.no + 1);
  const f = fillsOf(ctx.mastery, r);
  const lf = Object.fromEntries(l.items.map((id) => [id, f[id]]));
  const t = tally(l.items, f);
  const no = L.lessonNo(s.no);
  // '2과 끝!' — 과 번호에 옅은 초록 형광펜(홈 '다 채움'과 같은 뜻: 칠했다). 초록 도장은 없앴다(색은 지도에만)
  const full = L.sumTitle(no);
  const head = headBlock(`${L.region(r)} · ${L.lesson(l)}`, 'learning', headHtml(full, full.includes(no) ? no : lessonNoText(s.no), 'ok'));
  const names = `<div class="h-names">${statsHtml([{ label: L.sumStatNames[0], n: s.newly.length }, { label: L.sumStatNames[1], n: `${s.firstTry}/${s.total}` }])}</div>`;
  const go = nl
    ? `<a class="btn h-go" href="${link({ name: 'lesson', region: r.key, no: nl.no })}">${esc(L.nextLesson(`${lessonNoText(nl.no)} ${L.lesson(nl)}`))} <span aria-hidden="true">→</span></a>`
    : `<a class="btn h-go" href="${link({ name: 'mix', region: r.key })}">${esc(L.nextMix(L.region(r)))} <span aria-hidden="true">→</span></a>`;
  const acts = `<div class="h-acts">${go}<button class="btn2 h-go2" type="button" data-act="home">${esc(L.home)}</button></div>`;
  // 헷갈린 곳: 기호 + 글(색 글자 없음)
  const conf = s.confused.length
    ? `<div class="h-ph"><h2 class="h-pt" id="pg-conf">${esc(L.confused)} <span class="num">${s.confused.length}</span></h2></div>
      <ul class="pg-list">${s.confused.map((id) => `<li><span><span class="sym" aria-hidden="true">✕</span>${esc(nm(ctx, id))}</span></li>`).join('')}</ul>`
    : '';
  // 내일 복습: 이 과의 곳 가운데 내일 복습일이 되는 곳만 센다(바로 찾기로 맞힌 곳은 모레, 다시 배운 과는 0일 수 있다). 0 이면 줄을 뺀다
  const tomorrow = l.items.filter((id) => isDue(get(ctx.mastery, id), ctx.today() + 1)).length;
  const prog = `<section class="h-prog"${conf ? ' aria-labelledby="pg-conf"' : ''}>${conf}
      ${tomorrow ? `<p class="h-pr">${esc(L.tomorrowReview(tomorrow))}</p>` : ''}${storageNotes(ctx)}</section>`;
  const keys: KeyItem[] = [
    ...(t.mastered ? [{ s: 'mastered', label: L.legend[3] }] : []),
    ...(t.learning ? [{ s: 'learning', label: L.legend[1] }] : []),
    ...(t.none ? [{ s: 'none', label: L.legend[0] }] : []),
    ...otherKey(r, l.items), ...riverKey(r),
  ];
  // 과 시작과 같이 지역(단원) 전체 지도에 이번 과를 익힌 정도 색으로(lessonWhole)
  const lw = lessonWhole(r);
  const mapCol = mapColumn({ key: 'sum', label: L.sumMap, aria: L.sumMap, ar: lw.ar, cap: L.sumMap, note: lessonLabel(r, s.no), keys });
  return {
    title: L.sumTitle(`${L.region(r)} ${no}`),
    // 과 시작과 같이 이 과의 곳 이름은 꼭 보이게(must)
    maps: { sum: { region: r.key, active: l.items, fills: lf, ...lw.spec, zoom: l.fit, scaleBar: true, labels: l.items.map((id) => lessonMapLabel(ctx, id)), labelMode: 'must' } },
    html: `<div class="page">${backRow()}
      <div class="h-main">${head}${names}${acts}${prog}${mapCol}</div></div>`,
  };
}

/* ---------- 시험 결과(랭킹은 S8) ---------- */

export interface ResultState {
  region: string; score: number; total: number; seconds: number; wrong: [string, string | null][];
  best?: { score: number; total: number; seconds: number } | null;   // 이번보다 나은 지난 기록
  isNew?: boolean;                                                    // 지난 기록을 넘음
}

export function resultPage(ctx: Ctx, s: ResultState): Page {
  const r = ctx.reg.region(s.region)!;
  const region = L.region(r);
  const wrongIds = s.wrong.map((w) => w[0]);
  const fills = Object.fromEntries(r.items.map((it) => [it.id, wrongIds.includes(it.id) ? 0 : 2]));
  // 점수가 큰 제목(맞힌 수 700 · '/ 전체' 400). 읽을 때는 '서울 시험 결과 23 / 25'
  const score = `<span class="visually-hidden">${esc(L.resultTitle(region))} </span>${s.score}<span class="h-of"> / ${s.total}</span>`;
  const head = headBlock(L.checkName(region), null, score, `<p class="h-places num">${esc(L.time(s.seconds))}</p>`);
  // 내 최고 기록: 새 기록은 굵게(색 없이), 아니면 지난 최고 기록 한 줄
  const best = s.isNew ? `<p class="h-places"><b>${esc(L.bestNew)}</b></p>`
    : s.best ? `<p class="h-desc num">${esc(L.bestLine(s.best.score, s.best.total, L.time(s.best.seconds)))}</p>` : '';
  const names = best ? `<div class="h-names">${best}</div>` : '';
  const acts = `<div class="h-acts"><button class="btn h-go" type="button" data-act="checkAgain" data-arg="${r.key}">${esc(L.again)}</button><button class="btn2 h-go2" type="button" data-act="home">${esc(L.home)}</button></div>`;
  // 틀린 곳: ✕ 정답 이름 | 내 답(기호 + 글). 다 맞혔으면 ○ 한 줄
  const list = s.wrong.length
    ? `<ul class="pg-list">${s.wrong.map(([a, b]) => `<li><span><span class="sym" aria-hidden="true">✕</span>${L.answer(esc(nm(ctx, a)))}</span><span class="pr">${esc(L.mine2(b ? nm(ctx, b) : '—'))}</span></li>`).join('')}</ul>`
    : `<p class="pg-all"><span class="sym" aria-hidden="true">○</span>${esc(L.allRight)}</p>`;
  // 이름 줄(최고 기록)이 없으면 좁은 화면에서 단추 바로 아래에 구역이 온다 → .gap 으로 띄운다
  const prog = `<section class="h-prog${names ? '' : ' gap'}" aria-labelledby="pg-wrong"><div class="h-ph"><h2 class="h-pt" id="pg-wrong">${esc(L.wrongList)}${s.wrong.length ? ` <span class="num">${s.wrong.length}</span>` : ''}</h2></div>${list}</section>`;
  const view = wholeView(r);
  const mapCol = mapColumn({
    key: 'res', label: L.resultTitle(region), aria: L.resultMap, ar: viewAspect(view, r.items.map((it) => it.id)), cap: `${L.regionFull(r)} · ${L.count(r)}`, note: asOfText(ctx.ver),
    keys: [{ s: 'learning', label: L.resultKey }, { s: 'pick', label: L.wrongList }, ...riverKey(r)],
  });
  return {
    title: L.resultTitle(region),
    maps: { res: { region: r.key, fills, bold: wrongIds, scaleBar: true, labels: s.wrong.map(([id]) => ({ id, text: nm(ctx, id) })), ...viewSpec(r, view) } },
    html: `<div class="page">${backRow()}
      <div class="h-main">${head}${names}${acts}${prog}${mapCol}</div></div>`,
  };
}

/* ---------- 구 고르기(계획서 E5 · N9): 그 지역의 동 단원 — 지역 지도(칸 = 단원의 동 진도) · 이름 목록 · 단원 진도 ---------- */

/**
 * 동 단원 파일 없이 동 색인으로 그린다(단원 진도·복습 수 = 동 색인의 곳 id). 지도 칸은 단원(일반구 단원은 시 칸에 모은다):
 * 동을 하나도 칠하지 않음 = 아직(흰 칸), 칠한 동이 있음 = 익히는 중, 모두 다 익힘 = 다 익힘. 오늘 복습할 동이 있는 칸에는 먹색 점.
 * 칸을 누르면 그 단원 쪽으로(한 칸에 단원이 여럿이면 — 경기 시 칸의 일반구 — 목록의 그 단원으로 옮겨 간다)
 */
export function pickPage(ctx: Ctx, regionKey: string): Page {
  const { reg, mastery: m } = ctx;
  const r = reg.region(regionKey)!;
  const today = ctx.today();
  const region = L.region(r);
  const units = reg.emdUnits(r.key);
  // 고르기 낱말: 한국어 '구' · '시·군' · '시·군·구', 영어 'district' · 'city or county' …(L.unitWord, EN_EMD 5.3)
  const word = L.unitWord(units.map((u) => u.index.ko), r.key, '구');
  const rows = units.map((u) => {
    const ids = u.index.ids.map((s) => `kr:emd:${u.code}${s}`);
    const f = Object.fromEntries(ids.map((id) => [id, fillOf(m, id)]));
    return { u, ids, f, t: tally(ids, f), due: ids.filter((id) => isDue(get(m, id), today)).length };
  });
  const allIds = rows.flatMap((x) => x.ids);
  const t = tally(allIds, Object.assign({}, ...rows.map((x) => x.f)));
  const dueAll = rows.reduce((s, x) => s + x.due, 0);
  // [오늘 복습] 단추는 열릴 판이 이 지역의 동을 담을 때만(emdReviewOpens). 진도 머리의 '오늘 복습 n곳'·지도 점은 그대로
  const reviewBtn = dueAll > 0 && emdReviewOpens(ctx, rows.flatMap((x) => x.ids.filter((id) => isDue(get(m, id), today))));
  const last = ctx.lastUnit && reg.areaOf(ctx.lastUnit) === r.key ? rows.find((x) => x.u.key === ctx.lastUnit) ?? null : null;

  // 과 없는 지역(세종·제주, 계획서 N4)은 지역 주소가 곧 이 쪽이다: 라벨은 공부 순서, 지역 과·지역 이름 지도 링크는 없다(지역 과가 없음)
  const main = unitMain(reg, r.key);
  const head = headBlock(`${region} · ${main ? L.order : L.dong[0]}`, null, headHtml(L.pickTitle(word), '', 'hl'));
  // 일반구 단원이 있는 지역(경기, E7): 동보다 먼저 일반구를 익히는 길(계획서 N5)
  const guR = guOf(reg, r.key);
  const names = `<div class="h-names"><p class="h-desc">${esc(L.pickSub(word))}</p>${guR ? `<p class="h-desc">${guLink(guR)}</p>` : ''}</div>`;
  const acts = last || reviewBtn
    ? `<div class="h-acts">${last ? `<a class="btn h-go" href="${link({ name: 'unit', region: last.u.key })}">${esc(L.pickLast(L.pickName(last.u)))} <span aria-hidden="true">→</span></a>` : ''}
      ${reviewBtn ? `<a class="${last ? 'btn2 h-go2' : 'btn2 h-go'}" href="${link({ name: 'review' })}">${esc(L.reviewChip(dueAll))}</a>` : ''}</div>`
    : '';
  const stats: { s: string; label: string; n: number }[] = t.filled ? [{ s: 'mastered', label: L.legend[3], n: t.mastered }, { s: 'learning', label: L.legend[1], n: t.learning }, { s: 'none', label: L.legend[0], n: t.none }] : [];
  const full = L.regionFull(r), asOf = asOfText(ctx.ver);
  const prog = `<section class="h-prog" aria-label="${esc(L.progAria(region, allIds.length))}">
      <div class="h-ph"><span class="h-pt num">${esc(t.filled ? L.filled(allIds.length, t.filled, t.mastered) : L.filledZero(allIds.length))}</span>${dueAll ? `<span class="h-pr">${esc(L.reviewTitle(dueAll))}</span>` : ''}</div>
      ${stats.length ? statsHtml(stats, 'wide-only') : ''}
      <p class="h-note">${esc(L.notes.saved)}</p>
      <p class="h-note narrow-only">${esc(full)}${asOf ? ` · ${esc(asOf)}` : ''}</p>${warnNotes(ctx)}</section>`;

  // 지도 칸마다 단원 진도(한 칸에 일반구 단원이 여럿이면 모두 합쳐서)
  const cellOf = new Map<string, typeof rows>();
  for (const x of rows) { const c = unitCellOf(x.u); cellOf.set(c, [...(cellOf.get(c) ?? []), x]); }
  const fills: Record<string, number> = {};
  const badges: string[] = [];
  for (const it of r.items) {
    const list = cellOf.get(it.id) ?? [];
    const tt = list.reduce((a, x) => ({ filled: a.filled + x.t.filled, mastered: a.mastered + x.t.mastered, total: a.total + x.t.total }), { filled: 0, mastered: 0, total: 0 });
    fills[it.id] = tt.total && tt.mastered === tt.total ? 3 : tt.filled ? 1 : 0;
    if (list.some((x) => x.due)) badges.push(it.id);
  }
  const lastCell = last ? unitCellOf(last.u) : null;
  const keyItems: KeyItem[] = [...(dueAll ? [{ s: 'due', label: L.kind.review }] : []), { s: 'none', label: L.pickKey[0] }, { s: 'learning', label: L.pickKey[1] }, { s: 'mastered', label: L.pickKey[2] }, ...riverKey(r)];
  // 넓은 화면이 여럿인 지역(경기 북서부·북동부·남서부·남동부, 인천 내륙·섬과 바다 — E7): 지도 범위를 고른다(메모리에만, 기본 '전체').
  // 화면을 고르면 그 범위로 맞추고 폰에서도 이름표를 단다(전체는 홈 지도처럼 넓은 화면에서만)
  const scr = r.screens.length > 1 ? r.screens.find((s) => s.key === ctx.pickScreen?.[r.key]) ?? null : null;
  const tools = r.screens.length > 1
    ? `<div class="h-tabs e-scr" role="group" aria-label="${esc(L.pickScreens)}">${[{ key: '', ko: L.pickAll }, ...r.screens.map((s) => ({ key: s.key, ko: L.screenTab(s) }))].map((s) =>
      `<button class="h-tab" type="button" data-act="pickScreen" data-arg="${r.key}:${s.key}" aria-pressed="${s.key === (scr?.key ?? '')}">${esc(s.ko)}</button>`).join('')}</div>`
    : '';
  // 지도 범위·섬 상자: 고른 화면(그 화면의 insets) 또는 지역 전체(wholeView — 지역 화면 insets 가 있을 때만 섬 상자, E13 검수). 지금 판은 지역 화면에 insets 가 없어 전과 같다
  const pv: MapView = scr ? { fit: scr.fit, isles: scr.insets ?? [] } : wholeView(r);
  // 캡션: '경기도 · 경기 47개 시·군·구'. 정식 이름이 짧은 이름과 같으면(영어 — regionFull = en) 되풀이하지 않는다('Gyeonggi: 47 cities, counties and districts')
  const pickCap = L.pickHead(region, units.length, word);
  const mapCol = mapColumn({ key: 'pick', label: L.pickMap(region), aria: L.pickMap(region), ar: viewAspect(pv, r.items.map((it) => it.id)), cap: full === region ? pickCap : `${full} · ${pickCap}`, note: asOf, keys: keyItems, tools });

  /* 단원 목록: 이름 · 곳 수·과 수 · 채움(지도 차례 = 동 색인 차례). 일반구 동 단원(경기 수원시 장안구 등, E7)은 시마다 따로 묶어 시 이름 아래에 구 이름으로 */
  const row = (x: typeof rows[number], name: string) => {
    const st = x.t.filled ? L.filledTag(x.t.filled, x.t.total) : L.notYet;
    const isLast = last?.u.key === x.u.key;
    return `<li${isLast ? ' class="last"' : ''}><a href="${link({ name: 'unit', region: x.u.key })}" data-unit="${esc(x.u.key)}">
      <span class="nm">${esc(name)}</span>${isLast ? `<span class="tag">${esc(L.pickLastTag)}</span>` : ''}
      <span class="pl">${esc(L.unitMeta(x.u.index.n, x.u.index.lessons))}${x.due ? ` · ${esc(L.reviewTitle(x.due))}` : ''}</span>
      <span class="st num">${esc(st)}</span><span class="ar" aria-hidden="true">→</span></a></li>`;
  };
  // 이름(EN_EMD 7.1): 단원은 L.pickName(한국어 '종로구' · 영어 'Jongno-gu' — 동 색인으로, 단원 파일을 받기 전에도), 시 묶음 머리는 그 시의 곳 이름(L.name — '수원시' · 'Suwon-si')
  const siName = (id: string) => { const it = reg.place(id)?.item; return it ? L.name(it) : ''; };
  const unitNm = (x: typeof rows[number]) => L.pickName(x.u);
  // 영어 목록은 영어 알파벳 차례(D103 — 동 색인은 가나다 차례라 영어로 읽으면 뒤섞여 보인다). 과 없는 지역(세종·제주)의 단원 차례는 공부 순서라 그대로
  const plain = rows.filter((x) => !x.u.index.si);
  if (L.lang === 'en' && !main) plain.sort((a, b) => unitNm(a).localeCompare(unitNm(b), 'en'));
  const bySi = [...new Set(rows.filter((x) => x.u.index.si).map((x) => x.u.index.si!))].sort((a, b) => siName(a).localeCompare(siName(b), L.lang));
  const groupOf = (si: string) => {
    const xs = rows.filter((x) => x.u.index.si === si), sn = siName(si);
    if (L.lang === 'en') xs.sort((a, b) => unitNm(a).localeCompare(unitNm(b), 'en'));
    return `<h3 class="e-gh">${esc(sn)} <span>${esc(L.siGu(xs.length))}</span></h3>
      <ol class="e-list e-sub">${xs.map((x) => row(x, unitNm(x).startsWith(`${sn} `) ? unitNm(x).slice(sn.length + 1) : unitNm(x))).join('')}</ol>`;
  };
  // 차례(E7 검수): 일반구가 있는 시 묶음을 시·군 목록의 가나다 자리에 끼운다(고양시 묶음이 가평군 다음). 묶음을 목록 뒤에 모으면 폰 '전체' 지도에는
  // 이름표가 없어 ㄱ 자리의 고양시를 찾으려 목록 끝까지 내려야 했다. 시·군 줄끼리의 차례(동 색인 차례)는 그대로이고, 묶음이 없는 지역(서울·인천)은 전과 같다
  const blocks: string[] = [], left = [...bySi];
  let run = '';
  const flush = () => { if (run) blocks.push(`<ol class="e-list">${run}</ol>`); run = ''; };
  for (const x of plain) {
    while (left.length && siName(left[0]).localeCompare(unitNm(x), L.lang) < 0) { flush(); blocks.push(groupOf(left.shift()!)); }
    run += row(x, unitNm(x));
  }
  flush();
  for (const si of left) blocks.push(groupOf(si));
  const links = [...(guR ? [guLink(guR)] : []), ...(main ? [] : [lk(link({ name: 'unit', region: r.key }), L.toRegion(region)), lk(link({ name: 'explore', region: r.key, slug: null }), L.namedMap(region))])].join('');
  const path = `<section class="h-path" aria-labelledby="e-path">
      <div class="h-lhead"><h2 id="e-path">${esc(L.pickHead(region, units.length, word))}</h2><span class="h-lhelp wide-only">${esc(L.pickHelp)}</span></div>
      ${blocks.join('')}
      <nav class="h-links" aria-label="${esc(L.more)}">${links}</nav></section>`;

  return {
    title: main ? region : `${region} · ${L.dong[0]}`,
    maps: {
      pick: {
        region: r.key, home: pv.fit, ...(pv.isles.length ? { isles: pv.isles } : {}), scaleBar: true, fills, badges, bold: lastCell ? [lastCell] : null,
        // 복습 점이 놓이는 칸에는 이름을 두지 않는다(홈 지도와 같은 규칙 — 같은 자리). 넓은 화면을 고르면 그 화면의 곳 이름을 폰에서도
        // 이름은 지역 곳 그대로(과 없는 지역의 칸 — 제주시·서귀포시 — 은 공부하는 곳이 아니라 레지스트리 곳이 없다)
        labels: r.items.filter((it) => !badges.includes(it.id) && (!scr || scr.items.includes(it.id))).map((it) => ({ id: it.id, text: L.lang === 'en' ? L.short(it) : L.name(it) })), labelMode: 'fit', labelMinWidth: scr ? 0 : COMPACT_PX,
        interaction: 'tap',
        onTap: (tp) => {
          if (tp.type !== 'cell') return;
          const hits = cellOf.get(tp.id) ?? [];
          if (hits.length === 1) return ctx.go({ name: 'unit', region: hits[0].u.key });
          // 한 칸에 단원이 여럿(경기 시 칸의 일반구): 목록의 첫 단원으로 옮겨 간다
          const a = hits.length ? document.querySelector<HTMLElement>(`.e-list [data-unit="${hits[0].u.key}"]`) : null;
          a?.scrollIntoView({ block: 'center' });
          a?.focus({ preventScroll: true });
        },
      },
    },
    html: `<div class="page">${backRow()}
      <div class="h-main">${head}${names}${acts}${prog}${mapCol}</div>
      ${path}</div>`,
  };
}

/* ---------- 오늘 복습이 없을 때 · 랭킹(준비 중): 같은 말의 짧은 쪽(한 단, 최대 720) ---------- */

const shortPage = (label: string, swatch: string | null, title: string, sub: string) =>
  `<div class="page">${backRow()}<div class="pg-one">
      ${label ? `<p class="h-label">${swatch ? sw(swatch) : ''}<span>${esc(label)}</span></p>` : ''}<h1 class="pg-title">${esc(title)}</h1>
      <p class="h-desc">${esc(sub)}</p>
      <div class="h-acts"><button class="btn h-go" type="button" data-act="home">${esc(L.home)}</button></div></div></div>`;

export function noReviewPage(ctx: Ctx): Page {
  const tomorrow = tomorrowCount(ctx.reg, ctx.mastery, ctx.today());
  return { title: L.kind.review, html: shortPage(L.kind.review, 'due', L.noReview, L.noReviewSub(tomorrow)) };
}

export function rankPage(): Page {
  return { title: L.rank, html: shortPage(L.rank, null, L.rankTitle, L.rankSub) };
}
