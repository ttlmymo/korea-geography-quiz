// 쪽 화면(설계서 4.1): 홈 · 지역 고르기 · 단원 · 과 시작 카드 · 과 요약 · 시험 결과 · 복습 없음 · 랭킹(준비 중).
// 문자열로 그리고, 지도 자리(data-map)는 main.ts 가 붙인다. 누르는 동작은 data-act, 화면 이동은 해시 링크. 글은 text/ui.ts(한·영)
// 모양(합본 디자인 3.2·3.3): 모든 쪽이 홈과 같은 말 — 라벨 → 큰 제목 → 이름 줄·설명 → 먹색 주 단추 + 먹 테두리 보조 단추 →
// 선으로 나눈 구역(윗선 2px 먹), 숫자는 36px. 넓은 화면(1100 이상)은 2단(글 | 틀 있는 지도), 좁은 화면은 홈 폰 순서(제목 → 지도 → 단추 → 글)
import { homeCard, todayReview, nextLesson, dailyFor, regionDone, DAILY_CAP, NEW_SLACK, type HomeCard } from '../core/next.ts';
import { get, isDue } from '../core/mastery.ts';
import { progress } from '../core/deck.ts';
import { cellStates, tally, tomorrowCount, unfilled } from '../core/tally.ts';
import { boxOf } from '../map/project.ts';
import { L, placeName } from '../text/ui.ts';
import type { Route } from '../router.ts';
import { toHash } from '../router.ts';
import type { BBox, Region } from '../types.ts';
import { fillsOf, type Ctx } from './ctx.ts';
import { backRow, esc } from './dom.ts';
import type { MapSpec } from './maps.ts';
import { COMPACT_PX } from '../map/svgmap.ts';

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

/** 지역 탭에 한강 견본을 두는 지역(지도에 한강이 칸과 맞닿아 그려진다 — 인천 지도에는 강이 없다) */
const RIVER_REGIONS = new Set(['seoul', 'gyeonggi']);

/** 칸 상태 견본(16px 네모, 복습은 먹색 점). 장식이라 읽히지 않는다 — 뜻은 옆 글이 맡는다 */
const sw = (s: string) => `<i class="sw s-${s}" aria-hidden="true"></i>`;

/** 범위의 가로:세로(지도 칸 높이를 지역·과 모양에 맞춘다) */
function aspectOf(fit: BBox): number {
  const [x0, y0, x1, y1] = boxOf(fit);
  return Math.round(((x1 - x0) / (y1 - y0)) * 1000) / 1000;
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
const riverKey = (r: Region): KeyItem[] => (RIVER_REGIONS.has(r.key) ? [{ s: 'water', label: L.legendRiver, wide: true }] : []);

/**
 * 지도 묶음(홈과 같은 모양): 캡션 줄(윗선 2px 먹, 넓은 화면만) → 틀 있는 지도(범위 비율 --ar, 화면 높이로 상한) → 범례 줄.
 * --ar 은 묶음에 둔다: 한 단 화면에서는 캡션·지도·범례가 함께 그 비율의 폭으로 줄어든다(app.css)
 */
function mapColumn(o: { key: string; label: string; aria: string; ar: number; cap: string; note?: string; keys: KeyItem[]; desc?: string }): string {
  return `<section class="h-mapcol" aria-label="${esc(o.label)}" style="--ar:${o.ar}">
      <div class="h-cap wide-only"><span class="h-ct">${esc(o.cap)}</span>${o.note ? `<span class="h-cs">${esc(o.note)}</span>` : ''}</div>
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
function homeMap(ctx: Ctx, r: Region, f: Record<string, number>, o: { focus: string[]; review: string[]; reviewDay: boolean }): MapSpec {
  const { focus, review, reviewDay } = o;
  // 복습 점이 놓이는 칸에는 이름을 두지 않는다(같은 자리)
  const named = [...r.items.filter((it) => f[it.id] === 3).map((it) => it.id), ...(reviewDay ? [] : focus)].filter((id, i, a) => a.indexOf(id) === i && !review.includes(id));
  return {
    region: r.key, home: r.fit, scaleBar: true, fills: f,
    highlight: unfilled(focus, f), bold: reviewDay ? review : focus, badges: review,
    labels: named.map((id) => ({ id, text: mapName(ctx, id) })),
    // 이름표가 6곳 이하(처음 온 날의 첫 과 등)면 빠진 한 곳이 눈에 띄어 꼭 보이게(자리가 없으면 흰 판). 그보다 많으면 자리가 있을 때만.
    // 어느 쪽이든 휴대폰 지도(칸 폭 560 미만)에는 이름표가 없다(계획서 3.1)
    labelMode: named.length <= 6 ? 'must' : 'fit', labelMinWidth: COMPACT_PX,
  };
}

/** 쪽 지도 이름표 글: 영어는 짧은 이름('Jongno' — 과 카드와 같은 L.short. 긴 '-gu' 이름은 칸에 덜 들어 다 익힌 곳 이름이 빠진다), 한국어는 그대로 */
const mapName = (ctx: Ctx, id: string) => (L.lang === 'en' ? L.short(ctx.reg.place(id)!.item) : nm(ctx, id));

export function homePage(ctx: Ctx): Page {
  const { reg, mastery: m } = ctx;
  const today = ctx.today();
  const known = (k: string | null | undefined) => (k && reg.region(k) ? k : null);
  const deck = ctx.lessonDeck ?? ctx.otherDeck;
  const daily = dailyFor(ctx.daily, today);
  const plan = todayReview(reg, m, today, daily.n);
  const regionOf = (id: string) => reg.place(id)?.region.key;
  // 카드 차례(처음 → 이어서 → 복습 → 다 채움 → 다음 과)는 그대로. '마지막 지역' 자리에 탭 지역을 넘겨 다음 과·다 채움을 그 지역에서 고른다
  const cardFor = (key: string) => homeCard({ reg, mastery: m, deck, daily: ctx.daily, last: key, today });
  // 지역 탭: 고른 탭 → 마지막으로 공부한 지역 → 첫 지역(서울). 탭이 제목·지도·진도·과 줄을 함께 바꾼다
  const picked = known(ctx.homeRegion);
  let key = picked ?? known(ctx.last) ?? reg.regions[0].key;
  let card = cardFor(key);
  if (!picked) {
    // 탭을 고르지 않았으면 처음 탭을 주 카드에 맞춘다: 이어서 할 판의 지역, 이 지역에 복습할 곳이 없으면 복습할 곳이 있는 첫 지역
    const want = card.type === 'resume' ? known(card.region)
      : card.type === 'review' && !plan.round.some((id) => regionOf(id) === key) ? known(card.byRegion[0]?.region) : null;
    if (want && want !== key) { key = want; card = cardFor(key); }
  }
  const r = reg.region(key)!;
  const f = fillsOf(m, r);
  const ids = r.items.map((it) => it.id);
  const reviewHere = plan.round.filter((id) => regionOf(id) === r.key);
  // 고른 탭이 주 카드의 지역이 아니면(다른 지역에서 하던 판 · 이 지역에 없는 복습) 그 일은 맨 위 '먼저 할 일' 한 줄로 줄이고,
  // 주 구역은 탭 지역의 다음(첫) 과 또는 다 채움을 보여 준다. 이때 주 구역 단추는 보조 모양이고 판을 바로 시작하지 않는다(하던 판을 덮지 않게 과 시작 카드로)
  const away = (card.type === 'resume' && !!card.region && card.region !== r.key) || (card.type === 'review' && !reviewHere.length);
  const tabNext = nextLesson(reg, m, r.key);
  // 먼저 할 일 모드의 주 구역용 다음 과 카드: recommend 는 core/next.ts homeCard 의 추천 식과 같아야 한다(DAILY_CAP − 오늘 수 ≥ NEW_SLACK).
  // tomorrow 는 여기서 읽지 않는다(진도 머리 오른쪽 글은 진짜 card 를 본다)
  const view: HomeCard = !away ? card
    : tabNext === null ? { type: 'done', region: r.key, more: reg.regions.filter((x) => !regionDone(reg, m, x.key)).map((x) => x.key) }
    : { type: 'next', region: r.key, lesson: tabNext, recommend: DAILY_CAP - daily.n >= NEW_SLACK, tomorrow: 0 };
  // 복습 날 지도: 이 지역에 복습할 곳이 있으면 굵은 테두리가 그 칸으로 간다(다음 과는 노랑만, 이름 없이). 다른 지역에만 있으면 여느 날과 같다
  const reviewDay = view.type === 'review';
  const first = view.type === 'new';
  const lessonOf = (no: number | null | undefined) => (no ? reg.lesson(r.key, no) ?? null : null);
  // 지금 배울 과(지도 노랑·숫자 '다음 과'): 처음 = 탭 지역 1과, 이어서 = 하던 과(탭 지역일 때), 그 밖 = 탭 지역의 아직 다 칠하지 않은 첫 과
  const focus = first ? r.lessons[0]
    : view.type === 'next' ? lessonOf(view.lesson)
    : view.type === 'resume' && view.region === r.key && view.lesson ? lessonOf(view.lesson)
    : view.type === 'done' ? null
    : lessonOf(tabNext);
  const focusIds = focus?.items ?? [];
  const t = tally(ids, f, focusIds);
  const fresh = t.filled === 0;   // 이 지역에서 칠한 곳이 없다 → '첫 과'
  const region = L.region(r);
  const names = (list: string[]) => list.map((id) => nm(ctx, id)).join(SEP);
  // 곳 차례: 지역 → 과 차례(복습할 곳을 지도에서 찾기 쉽게)
  const order = new Map(reg.regions.flatMap((x) => x.lessons.flatMap((l) => l.items)).map((id, i) => [id, i]));
  const inOrder = (list: string[]) => [...list].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));

  /* 주 구역: 라벨 → 큰 제목(형광펜) → 이름 줄 → 설명 → 단추. 주 단추 data-card(new·resume·review·next·done)는 측정 값 그대로.
     홈에서 바로 시작하는 '바로 찾기'는 quick, 과 시작 카드로 가는 링크는 lesson(새 값 — 옛 값과 섞이지 않게) */
  const whereText = (by: { region: string; n: number }[]) => L.reviewWhere(by.map((b): [string, number] => [L.region(reg.region(b.region)!), b.n]));
  const startBtns = (no: number, cardName: string, primary: boolean) => away
    ? `<a class="btn2 h-go" href="${link({ name: 'lesson', region: r.key, no })}" data-card="lesson">${esc(L.start)} <span aria-hidden="true">→</span></a>`
    : `<button class="${primary ? 'btn' : 'btn2'} h-go" type="button" data-act="learn" data-arg="${r.key}:${no}" data-card="${cardName}">${esc(L.start)} <span aria-hidden="true">→</span></button>
      <button class="btn2 h-go2" type="button" data-act="quick" data-arg="${r.key}:${no}" data-card="quick">${esc(L.quick)}</button>`;
  let label = '', swatch = 'next', head = '', placeLine = '', desc = '', acts = '';
  if (view.type === 'new' || view.type === 'next') {
    const l = focus!;
    const cnt = L.lessonCount(r, l.items);
    const rec = view.type === 'new' || view.recommend;
    label = `${!rec ? L.nextEyebrow(false) : fresh ? L.firstLesson : L.nextEyebrow(true)} · ${lessonLabel(r, l.no)}`;
    head = headHtml(L.lessonHead(L.lesson(l), cnt), cnt, 'hl');
    placeLine = names(l.items);
    desc = L.newSub;
    acts = startBtns(l.no, view.type, rec);
  } else if (view.type === 'review') {
    swatch = 'due';
    label = `${L.kind.review} · ${whereText(view.byRegion)}`;
    const cnt = L.places(view.count);
    head = headHtml(L.reviewHead(cnt), cnt, 'ok');
    placeLine = names(inOrder(plan.round));
    desc = L.reviewSub;
    const nx = view.next ? lessonLabel(reg.region(view.next.region)!, view.next.lesson) : null;
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
    label = L.doneLabel(region);
    const cnt = L.count(r);
    head = headHtml(L.doneTitle(region, cnt), cnt, 'ok');
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
  const mapCol = mapColumn({ key: 'main', label: L.fillMap(region), aria: mapAria, ar: aspectOf(r.fit), cap: `${full} · ${L.count(r)}`, note: asOf, keys: keyItems, desc: L.regionDesc[r.key]?.[0] });

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
    : view.type === 'next' && view.recommend && !away ? view.lesson
    : view.type === 'resume' && focus && view.region === r.key && view.lesson === focus.no ? focus.no : null;
  const cells = lessonCells(ctx, r, f, {
    focusNo: focus?.no ?? null, recNo, due: new Set(reviewHere), thin: reviewDay, nextLabel, card: true,
    stFocus: (n) => (card.type === 'review' ? L.stAfterReview(n) : fresh ? L.stFirst(n) : L.stNext(n)),
  });
  const links = [
    lk(link({ name: 'explore', region: r.key, slug: null }), L.namedMap(region)),
    lk(link({ name: 'check', region: r.key }), fresh ? L.knowIt(region) : L.checkGo(region)),
    ...(fresh ? [] : [lk(link({ name: 'mix', region: r.key }), L.mixGo(region))]),
    // 동 단원은 아직 없다(단원 쪽과 같이 '준비 중')
    ...(r.key === 'seoul' ? [`<span class="h-link off"><span>${esc(L.dong[0])}</span> <em>${esc(L.soon)}</em></span>`] : []),
  ].join('');
  const path = `<section class="h-path" aria-labelledby="h-path">
      <div class="h-lhead"><h2 id="h-path">${esc(L.lessonsHead(region, r.lessons.length))}</h2><span class="h-lhelp wide-only">${esc(L.lessonsHelp)}</span></div>
      <ol class="h-lcs g${r.lessons.length}">${cells}</ol>
      <nav class="h-links" aria-label="${esc(L.more)}">${links}</nav></section>`;

  /* 아래 구역(선으로 나눔): 이렇게 공부해요(처음 온 사람은 위에 있다) · 지역 알아보기(탭 지역의 허브, 없으면 서울) · 설정 */
  const hubKey = r.key !== 'seoul' && L.hubs[r.key] ? r.key : 'seoul';
  const hub = hubKey === 'seoul' ? L.seoulHub : L.hubs[hubKey];
  const more = `<div class="h-more${first ? ' two' : ''}">
      ${first ? '' : `<section class="h-mo" aria-labelledby="h-how"><div class="h-ph"><h2 class="h-pt" id="h-how">${esc(L.how)}</h2><span class="h-pr">${esc(L.tagline)}</span></div>${steps}</section>`}
      <section class="h-mo" aria-labelledby="h-exp"><h2 class="h-pt" id="h-exp">${esc(L.explore)}</h2>
        <a class="h-xl" href="${ctx.base}${L.path(`${hubKey}/`)}"><span class="h-xt">${esc(hub[0])}</span><span class="h-xs">${esc(hub[1])}</span></a></section>
      <section class="h-mo" aria-labelledby="h-set"><h2 class="h-pt" id="h-set">${esc(L.settings)}</h2>
        <label class="h-toggle"><input type="checkbox" data-set="autoNext"${ctx.settings.autoNext ? ' checked' : ''}><span>${esc(L.autoNext[0])}<small>${esc(L.autoNext[1])}</small></span></label></section>
    </div>`;

  const tabs = `<div class="h-tabs" role="group" aria-label="${esc(L.homeTabs)}">${reg.regions.map((x) => {
    const on = x.key === r.key;
    // 다른 지역에 오늘 복습이 있으면 탭에 먹색 점(지금 탭은 지도에 점이 보인다)
    const dot = !on && plan.byRegion.some((b) => b.region === x.key) ? `<i class="h-dot" aria-hidden="true"></i><span class="visually-hidden">(${esc(L.tabDue)})</span>` : '';
    return `<button class="h-tab" type="button" data-act="homeRegion" data-arg="${x.key}" aria-pressed="${on}">${rk(x)} <span class="u">${esc(L.count(x))}</span>${dot}</button>`;
  }).join('')}</div>`;

  const maps: Record<string, MapSpec> = { main: homeMap(ctx, r, f, { focus: focusIds, review: reviewHere, reviewDay }) };
  const html = `<div class="page home">${tabs}
    <div class="h-main">${hero}${prog}${mapCol}</div>
    ${path}${more}</div>`;
  return { html, maps };
}

/* ---------- 지역 고르기: 지역 세 칸(홈 지역 탭과 같은 말) ---------- */

export function regionsPage(ctx: Ctx): Page {
  const { reg, mastery: m } = ctx;
  const cells = reg.regions.map((r) => {
    const f = fillsOf(m, r);
    const ids = r.items.map((it) => it.id);
    const t = tally(ids, f);
    const [desc, tag] = L.regionDesc[r.key] ?? ['', ''];
    // '25개 구 · 5과'
    const meta = L.regionMeta(L.count(r), r.lessons.length);
    const parts = ([[L.legend[3], t.mastered], [L.legend[1], t.learning], [L.legend[0], t.none]] as [string, number][]).filter((p) => p[1] > 0);
    const dots = cellStates(ids, f).map((s) => sw(s)).join('');
    return `<li class="h-lc"><a href="${link({ name: 'unit', region: r.key })}">
      <span class="nm">${rk(r)}</span>${tag ? `<span class="tag">${esc(tag)}</span>` : ''}<span class="no">${esc(meta)}</span>
      <span class="pl">${esc(desc)}</span>
      <span class="ft"><span class="dots" role="img" aria-label="${esc(L.dotsAria(t.total, parts))}">${dots}</span>
      <span class="st num">${esc(t.filled ? L.filledTag(t.filled, ids.length) : L.notYet)}</span></span><span class="ar" aria-hidden="true">→</span></a></li>`;
  }).join('');
  return {
    title: L.regionsTitle,
    html: `<div class="page">${backRow()}
      <div class="pg-head"><h1 class="pg-title">${esc(L.regionsTitle)}</h1></div>
      <ol class="h-lcs g3 rg">${cells}</ol>
      <details class="rg-more"><summary>${esc(L.others)}</summary>
        <ul class="rg-other">${L.otherList.map((o) => `<li><span>${esc(o)}</span><em>${esc(L.soon)}</em></li>`).join('')}</ul></details>
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

  const head = headBlock(L.order, null, esc(`${region} ${L.count(r)}`));
  const desc = L.regionDesc[r.key]?.[0] ?? '';
  const names = desc ? `<div class="h-names"><p class="h-desc">${esc(desc)}</p></div>` : '';
  const acts = reviewDay ? `<div class="h-acts"><a class="btn2 h-go" href="${link({ name: 'review' })}">${esc(L.reviewChip(due.length))}</a></div>` : '';

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
  const mapCol = mapColumn({ key: 'unit', label: L.fillMap(region), aria: L.unitMapLabel(region), ar: aspectOf(r.fit), cap: `${full} · ${L.count(r)}`, note: asOf, keys: keyItems });

  /* 과 카드 줄(홈과 같은 칸) → 전체 연습 · 시험 → 글자 링크 */
  const cells = lessonCells(ctx, r, f, {
    focusNo: focus?.no ?? null, recNo: nextNo, due: new Set(due), thin: reviewDay, nextLabel, card: false,
    stFocus: (n) => (reviewDay ? L.stAfterReview(n) : fresh ? L.stFirst(n) : L.stNext(n)),
  });
  const mixNo = r.lessons.length + 1;
  const best = ctx.bests[r.key];
  const ends = `<ul class="u-ends">
      <li><a href="${link({ name: 'mix', region: r.key })}"><span class="nm">${esc(L.mixName(mixNo, region))}</span><span class="pl">${esc(L.mixSub(r.items.length))}</span><span class="ar" aria-hidden="true">→</span></a></li>
      <li><a href="${link({ name: 'check', region: r.key })}"><span class="nm">${esc(L.checkName(region))}</span><span class="pl num">${esc(L.checkSub(r.items.length))}${best ? ` · ${esc(L.bestTag(best.score, best.total, L.time(best.seconds)))}` : ''}</span><span class="ar" aria-hidden="true">→</span></a></li></ul>`;
  const links = [
    lk(link({ name: 'explore', region: r.key, slug: null }), L.namedMap(region)),
    // 동 단원은 아직 없다
    // '준비 중' 표시는 홈과 같이 맨 끝(누를 수 있는 링크 사이에 끼지 않게)
    ...(r.key === 'seoul' ? [lk(`${ctx.base}${L.path('seoul/')}`, L.seoulMore), `<span class="h-link off"><span>${esc(L.dong[0])}</span> <em>${esc(L.soon)}</em></span>`] : []),
  ].join('');
  const path = `<section class="h-path" aria-labelledby="u-path">
      <div class="h-lhead"><h2 id="u-path">${esc(L.lessonsHead(region, r.lessons.length))}</h2><span class="h-lhelp wide-only">${esc(L.lessonsHelp)}</span></div>
      <ol class="h-lcs g${r.lessons.length}">${cells}</ol>${ends}
      <nav class="h-links" aria-label="${esc(L.more)}">${links}</nav></section>`;

  const title = `${region} · ${L.count(r)}`;
  return {
    title,
    maps: {
      unit: {
        ...homeMap(ctx, r, f, { focus: focusIds, review: due, reviewDay }),
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
  const names = `<div class="h-names"><p class="h-places">${esc(l.items.map((id) => nm(ctx, id)).join(SEP))}</p>
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
  const mapCol = mapColumn({
    key: 'start', label: L.rangeMap(L.region(r), L.lessonNo(l.no)), aria: L.rangeMap(L.region(r), L.lessonNo(l.no)), ar: aspectOf(l.fit),
    cap: `${L.regionFull(r)} · ${lessonNoText(l.no)}`, note: asOfText(ctx.ver),
    keys: [{ s: 'next', label: L.thisLesson }, { s: 'ctx', label: L.playKey.ctxLesson }, ...riverKey(r)],
  });
  return {
    title,
    // 이 과의 곳 이름은 꼭 보이게(must — 칸에 안 들면 칸 밖 지시선, 그래도 없으면 흰 판). 한 과는 3~8곳이라 흰 판이 덮을 칸이 적다
    maps: { start: { region: r.key, active: l.items, highlight: l.items, bold: l.items, home: l.fit, scaleBar: true, labels: l.items.map((id) => ({ id, text: nm(ctx, id) })), labelMode: 'must' } },
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
    { s: 'ctx', label: L.playKey.ctxLesson }, ...riverKey(r),
  ];
  const mapCol = mapColumn({ key: 'sum', label: L.sumMap, aria: L.sumMap, ar: aspectOf(l.fit), cap: L.sumMap, note: lessonLabel(r, s.no), keys });
  return {
    title: L.sumTitle(`${L.region(r)} ${no}`),
    // 과 시작과 같이 이 과의 곳 이름은 꼭 보이게(must)
    maps: { sum: { region: r.key, active: l.items, fills: lf, home: l.fit, scaleBar: true, labels: l.items.map((id) => ({ id, text: nm(ctx, id) })), labelMode: 'must' } },
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
  const mapCol = mapColumn({
    key: 'res', label: L.resultTitle(region), aria: L.resultMap, ar: aspectOf(r.fit), cap: `${L.regionFull(r)} · ${L.count(r)}`, note: asOfText(ctx.ver),
    keys: [{ s: 'learning', label: L.resultKey }, { s: 'pick', label: L.wrongList }, ...riverKey(r)],
  });
  return {
    title: L.resultTitle(region),
    maps: { res: { region: r.key, fills, bold: wrongIds, scaleBar: true, labels: s.wrong.map(([id]) => ({ id, text: nm(ctx, id) })) } },
    html: `<div class="page">${backRow()}
      <div class="h-main">${head}${names}${acts}${prog}${mapCol}</div></div>`,
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
