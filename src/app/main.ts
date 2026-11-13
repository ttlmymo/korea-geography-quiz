// 채움지도 앱: 홈 문서 안의 해시 경로(설계서 7.3). 경계 데이터와 기록을 읽고 화면을 그린다.
// 화면이 바뀔 때만 기록(history)을 쌓고 문제마다 쌓지 않는다. 과 요약·시험 결과는 replaceState
import { loadGeo } from './data.ts';
import { createRegistry } from './registry.ts';
import { parseRoute, toHash, type Known, type Route } from './router.ts';
import { better, browserKV, checkBests, checkDaily, checkDeck, checkLast, checkMastery, checkSettings, DEFAULT_SETTINGS, keys, openStore } from './store.ts';
import { createDeck, isDone, type Deck } from './core/deck.ts';
import { dayOf, get } from './core/mastery.ts';
import { dailyFor, todayReview } from './core/next.ts';
import { allQuestions, lessonQuestions, quickQuestions, reviewQuestions } from './core/questions.ts';
import { rngFrom } from './core/rng.ts';
import { usableDeck } from './core/session.ts';
import type { Ctx } from './ui/ctx.ts';
import { inAppBrowser } from './ui/dom.ts';
import { mountExplore } from './ui/explore.ts';
import { mountMaps } from './ui/maps.ts';
import { homePage, noReviewPage, rankPage, regionsPage, resultPage, startPage, summaryPage, unitPage, type Page, type ResultState, type SummaryState } from './ui/pages.ts';
import { mountPlay, type PlayEnd, type Slot } from './ui/play.ts';
import { L, setLang } from './text/ui.ts';
import { initAnalytics, track } from './analytics.ts';

interface NavState { s?: 'play' | 'summary' | 'result'; sum?: SummaryState; res?: ResultState; root?: true; src?: string }

const root = document.getElementById('app') as HTMLElement;
const BASE = (root.dataset.base ?? '').replace(/\/?$/, '/');   // 도메인 바로 아래면 '/'
const VER = root.dataset.ver ?? '';
const SITE_TITLE = document.title;
// 화면 글: 홈 문서의 lang(/ 은 ko, /en/ 은 en)
setLang(document.documentElement.lang);
initAnalytics(document.documentElement.lang, VER);
const titled = (t: string) => `${t} – ${L.site}`;

const seed = () => (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
const url = (r: Route) => location.pathname + location.search + toHash(r);

async function boot() {
  let geo;
  try {
    geo = await loadGeo(BASE, VER);
  } catch (e) {
    track('geo_load_fail', { msg: String((e as Error)?.message ?? e).slice(0, 100) });
    root.innerHTML = `<div class="page"><div class="pg-one"><h1 class="pg-title">${L.loadFail[0]}</h1><p class="h-desc">${L.loadFail[1]}</p></div></div>`;
    return;
  }
  const reg = createRegistry(geo);
  const store = openStore(browserKV());
  const K = keys();
  const known: Known = { region: (k) => !!reg.region(k), lesson: (r, n) => !!reg.lesson(r, n), slug: (r, s) => !!reg.bySlug(r, s) };
  const pending = (d: Deck | null) => (d && !isDone(d) ? d : null);

  const ctx: Ctx = {
    reg, geo, base: BASE, ver: VER, storageOk: store.ok, inApp: inAppBrowser(),
    mastery: store.read(K.mastery, checkMastery) ?? {},
    lessonDeck: pending(usableDeck(reg, store.read(K.deck, checkDeck))),
    otherDeck: pending(usableDeck(reg, store.read(K.deck2, checkDeck))),
    checkDeck: null,
    checkStart: 0,
    daily: store.read(K.daily, checkDaily),
    last: store.read(K.last, checkLast),
    settings: store.read(K.settings, checkSettings) ?? DEFAULT_SETTINGS,
    homeRegion: null,
    bests: store.read(K.best, checkBests) ?? {},
    today: () => dayOf(new Date()),
    save() {
      store.write(K.mastery, ctx.mastery);
      const l = pending(ctx.lessonDeck), o = pending(ctx.otherDeck);
      if (l) store.write(K.deck, l); else store.remove(K.deck);
      if (o) store.write(K.deck2, o); else store.remove(K.deck2);
      if (ctx.daily) store.write(K.daily, dailyFor(ctx.daily, ctx.today()));
      if (ctx.last) store.write(K.last, ctx.last);
    },
    go(route, opt = {}) {
      const st = (opt.state ?? null) as NavState | null;
      if (opt.replace) history.replaceState(keepRoot(st), '', url(route));
      else history.pushState(st, '', url(route));
      render();
    },
    back(fallback) {
      if ((history.state as NavState | null)?.root) ctx.go(fallback, { replace: true });
      else history.back();
    },
    render: () => render(true),
    toast,
  };

  /** 처음 연 기록 칸에는 root 표시: 거기서 '뒤로'를 누르면 사이트를 떠나지 않고 위 화면으로 */
  const keepRoot = (st: NavState | null): NavState | null => ((history.state as NavState | null)?.root ? { ...(st ?? {}), root: true } : st);
  history.replaceState({ ...((history.state as NavState | null) ?? {}), root: true }, '');

  /* ---------- 판 만들기 ---------- */

  const boxOf = (id: string) => get(ctx.mastery, id).box;
  function startLesson(region: string, no: number, quick: boolean) {
    const s = seed();
    const q = quick ? quickQuestions(reg, region, no, rngFrom(s)) : lessonQuestions(reg, region, no, boxOf, rngFrom(s));
    ctx.lessonDeck = createDeck(quick ? 'quick' : 'lesson', q, { region, lesson: no, seed: s });
    ctx.last = region;
    ctx.save();
    ctx.go({ name: 'lesson', region, no }, { state: { s: 'play' } });
  }
  function newMix(region: string) {
    const s = seed();
    ctx.otherDeck = createDeck('mix', allQuestions(reg, region, rngFrom(s)), { region, seed: s });
    ctx.last = region;
    ctx.save();
  }
  function newCheck(region: string) {
    const s = seed();
    ctx.checkDeck = createDeck('check', allQuestions(reg, region, rngFrom(s)), { region, seed: s });
    ctx.checkStart = Date.now();
    ctx.last = region;
    ctx.save();
    track('game_start', { mode: 'check', region });
  }
  function newReview(): boolean {
    const today = ctx.today();
    const plan = todayReview(reg, ctx.mastery, today, dailyFor(ctx.daily, today).n);
    if (!plan.round.length) return false;
    ctx.otherDeck = createDeck('review', reviewQuestions(plan.round, boxOf), { seed: seed() });
    ctx.save();
    track('review_start', { due: plan.due });
    return true;
  }
  const resumeRoute = (d: Deck): Route | null =>
    d.kind === 'review' ? { name: 'review' }
      : d.kind === 'mix' && d.region ? { name: 'mix', region: d.region }
        : d.region && d.lesson !== null ? { name: 'lesson', region: d.region, no: d.lesson } : null;

  /* ---------- 판이 끝났을 때 ---------- */

  function onEnd(e: PlayEnd) {
    const d = e.deck;
    if (d.kind === 'lesson' || d.kind === 'quick') {
      // '한 번에 맞힌 곳'은 곳 기준: 그곳을 처음 찾은 답(고르기는 빼고)을 힌트 없이 맞혔나
      const items = reg.lesson(d.region!, d.lesson!)?.items ?? [];
      const firstOk = items.filter((id) => { const f = d.log.find((x) => x.id === id && x.mode === 'find'); return f && f.result === 'correct' && !f.hint; }).length;
      const sum: SummaryState = { region: d.region!, no: d.lesson!, newly: e.newly, firstTry: firstOk, total: items.length, confused: e.finished.confused };
      track('lesson_complete', { unit: 'sgg', region: d.region, lesson: d.lesson, first_try: firstOk, total: items.length });
      ctx.lessonDeck = null;
      ctx.save();
      history.replaceState(keepRoot({ s: 'summary', sum }), '', location.href);
      render(true);
    } else if (d.kind === 'check') {
      const first = d.log.filter((x) => x.retry === 0);
      const seconds = Math.round((Date.now() - ctx.checkStart) / 1000);
      const now = { score: e.finished.firstTry, total: first.length, seconds, day: ctx.today() };
      const prev = ctx.bests[d.region!];
      // 내 최고 기록(랭킹은 출시 뒤 — 결정 5). 처음 본 시험도 최고 기록으로 남긴다
      const isNew = better(now, prev);
      if (isNew) {
        ctx.bests = { ...ctx.bests, [d.region!]: now };
        store.write(K.best, ctx.bests);
      }
      const res: ResultState = {
        region: d.region!, score: now.score, total: now.total, seconds,
        wrong: first.filter((x) => x.result !== 'correct').map((x) => [x.id, x.tapped ?? null]),
        best: isNew ? null : prev ? { score: prev.score, total: prev.total, seconds: prev.seconds } : null, isNew: isNew && !!prev,
      };
      ctx.checkDeck = null;
      track('game_complete', { mode: 'check', region: d.region, score: res.score, total: res.total, seconds });
      history.replaceState(keepRoot({ s: 'result', res }), '', location.href);
      render(true);
    } else if (d.kind === 'review') {
      ctx.otherDeck = null;
      ctx.save();
      ctx.go({ name: 'home' }, { replace: true });
      toast(L.reviewEnd);
    } else {
      ctx.otherDeck = null;
      ctx.save();
      ctx.go({ name: 'unit', region: d.region! }, { replace: true });
      toast(L.mixEnd(L.region(reg.region(d.region!)!)));
    }
  }

  /* ---------- 그리기 ---------- */

  let current: { destroy?(): void; key?(e: KeyboardEvent): boolean } | null = null;
  let lastKey = '';
  let gen = 0;   // 화면이 바뀌면 늘어난다. 늦게 붙은 지도는 버린다
  /** 화면 키: 경로 + 화면 상태(문제·요약·결과). 같은 키면 다시 그리지 않는다. 기록을 고친 분기(play 넣기·지우기)도 이 식으로 맞춘다 */
  const keyOf = (route: Route, st: NavState) => JSON.stringify([toHash(route), st.s ?? '', st.sum?.no ?? '', st.res?.score ?? '']);

  function setFull(on: boolean) {
    document.documentElement.classList.toggle('app-full', on);
  }

  function showPage(p: Page) {
    setFull(false);
    root.innerHTML = p.html;
    document.title = p.title ? titled(p.title) : SITE_TITLE;
    const my = gen;
    if (p.maps) mountMaps(ctx, root, p.maps).then((maps) => {
      if (my !== gen) return maps.forEach((m) => m.destroy());
      const prev = current;
      current = { destroy() { prev?.destroy?.(); maps.forEach((m) => m.destroy()); } };
    });
  }

  function play(slot: Slot) {
    // 공부를 시작하면 홈에서 고른 탭은 잊는다: 돌아온 홈은 방금 공부한 지역(ctx.last)이나 주 카드의 지역으로 열린다
    ctx.homeRegion = null;
    setFull(true);
    document.title = titled(L.studying);
    current = mountPlay(root, ctx, slot, onEnd, () => ctx.go({ name: 'home' }));
  }

  function render(force = false) {
    const parsed = parseRoute(location.hash, location.search, known);
    if (parsed.fix !== null) history.replaceState(history.state, '', location.pathname + parsed.fix);
    const route = parsed.route;
    const st = (history.state ?? {}) as NavState;
    const key = keyOf(route, st);
    if (!force && key === lastKey) return;
    const moved = key !== lastKey;
    lastKey = key;
    current?.destroy?.();
    current = null;
    gen++;
    if (moved) {
      window.scrollTo(0, 0);
      // 화면 이동(설계서 9 route_open): 경로 틀 + 화면 상태(문제·요약·결과)
      track('route_open', { route: route.name + (st.s ? `:${st.s}` : ''), region: 'region' in route ? route.region : undefined });
    }

    switch (route.name) {
      case 'home': return showPage(homePage(ctx));
      case 'regions': return showPage(regionsPage(ctx));
      case 'unit': return showPage(unitPage(ctx, route.region));
      case 'rank': return showPage(rankPage());
      case 'explore':
        // 둘러보기도 문제 화면처럼 화면 전체 지도(머리글·바닥글 없이, 스크롤 없음 — 합본 디자인 3.3)
        setFull(true);
        document.title = titled(L.exploreTitle(L.region(reg.region(route.region)!)));
        current = mountExplore(root, ctx, route.region, route.slug);
        if (moved) track('learn_explore', { source: st.src ?? 'link', region: route.region });
        return;
      case 'lesson':
      case 'place': {
        const no = route.name === 'lesson' ? route.no : reg.bySlug(route.region, route.slug)!.lesson.no;
        const d = ctx.lessonDeck;
        if (st.s === 'play' && d && !isDone(d) && d.region === route.region && d.lesson === no) return play('lesson');
        if (st.s === 'summary' && st.sum) return showPage(summaryPage(ctx, st.sum));
        if (st.s === 'play') {
          // 문제 판 주소인데 판이 없다(새로 고치기 전에 저장값을 지웠거나 다른 탭에서 끝냄): 과 시작 카드로 두고 기록의 'play' 를 지운다.
          // 안 지우면 [배우기 시작]이 같은 화면 키(lastKey)에 걸려 아무 일도 일어나지 않는다
          const { s: _drop, ...rest } = st;
          history.replaceState(rest, '', location.href);
          lastKey = keyOf(route, rest);
        }
        return showPage(startPage(ctx, route.region, no));
      }
      case 'mix': {
        const d = ctx.otherDeck;
        if (!(d && !isDone(d) && d.kind === 'mix' && d.region === route.region)) newMix(route.region);
        if (st.s !== 'play') history.replaceState(keepRoot({ s: 'play' }), '', location.href);
        lastKey = keyOf(route, { s: 'play' });
        return play('other');
      }
      case 'review': {
        const d = ctx.otherDeck;
        if (!(d && !isDone(d) && d.kind === 'review') && !newReview()) return showPage(noReviewPage(ctx));
        if (st.s !== 'play') history.replaceState(keepRoot({ s: 'play' }), '', location.href);
        lastKey = keyOf(route, { s: 'play' });
        return play('other');
      }
      case 'check': {
        if (st.s === 'result' && st.res) return showPage(resultPage(ctx, st.res));
        const d = ctx.checkDeck;
        if (!(st.s === 'play' && d && !isDone(d) && d.region === route.region)) newCheck(route.region);
        if (st.s !== 'play') history.replaceState(keepRoot({ s: 'play' }), '', location.href);
        lastKey = keyOf(route, { s: 'play' });
        return play('check');
      }
    }
  }

  /* ---------- 누르는 동작(data-act) ---------- */

  root.addEventListener('click', (e) => {
    // 홈 주 카드(설계서 9 home_card_click): new · resume · review · next · done. 합본 홈(D3)에서 더한 값: quick(홈의 바로 찾기) · lesson(과 카드·과 시작 카드 링크)
    const card = (e.target as HTMLElement).closest<HTMLElement>('[data-card]');
    if (card) track('home_card_click', { card: card.dataset.card });
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!b) return;
    const arg = b.dataset.arg ?? '';
    switch (b.dataset.act) {
      case 'learn':
      case 'quick': {
        const [region, no] = arg.split(':');
        return startLesson(region, Number(no), b.dataset.act === 'quick');
      }
      case 'resume': {
        const d = pending(ctx.lessonDeck) ?? pending(ctx.otherDeck);
        const r = d && resumeRoute(d);
        if (r) ctx.go(r, { state: { s: 'play' } });
        return;
      }
      case 'checkAgain':
        newCheck(arg);
        return ctx.go({ name: 'check', region: arg }, { replace: true, state: { s: 'play' } });
      case 'home':
        return ctx.go({ name: 'home' });
      case 'back': {
        const r = parseRoute(location.hash, location.search, known).route;
        const up: Route = r.name === 'lesson' || r.name === 'place' || r.name === 'explore' || r.name === 'mix' || r.name === 'check' ? { name: 'unit', region: r.region }
          : r.name === 'unit' ? { name: 'regions' } : { name: 'home' };
        return ctx.back(up);
      }
      case 'homeRegion':
        // 홈 지역 탭(또는 '다 채움'의 다음 지역): 화면을 통째로 다시 그리므로 누른 지역의 탭으로 포커스를 되돌린다
        ctx.homeRegion = arg;
        render(true);
        root.querySelector<HTMLElement>(`.h-tab[data-arg="${arg}"]`)?.focus({ preventScroll: true });
        return;
    }
  });

  // 설정(이 브라우저에 저장)
  root.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.set === 'autoNext') {
      ctx.settings = { ...ctx.settings, autoNext: t.checked };
      store.write(K.settings, ctx.settings);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (current?.key?.(e)) e.preventDefault();
  });
  window.addEventListener('popstate', () => render());
  window.addEventListener('hashchange', () => render());
  // 다른 날로 넘어가 돌아오면 홈 카드(오늘 복습 등)를 새로 고른다
  let shownDay = ctx.today();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    const d = ctx.today();
    if (d !== shownDay) { shownDay = d; if (!document.documentElement.classList.contains('app-full')) render(true); }
  });

  render(true);
}

let toastTimer = 0;
function toast(msg: string) {
  let t = document.querySelector<HTMLElement>('.app-toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'app-toast';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { t!.hidden = true; }, 2200);
}

boot();
