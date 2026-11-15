// 채움지도 앱: 홈 문서 안의 해시 경로(설계서 7.3). 경계 데이터와 기록을 읽고 화면을 그린다.
// 화면이 바뀔 때만 기록(history)을 쌓고 문제마다 쌓지 않는다. 과 요약·시험 결과는 replaceState
import { loadGeo, loadUnitFile, loadUnitTopo } from './data.ts';
import { createRegistry, unitKeyReads, unitOptions } from './registry.ts';
import { parseRoute, toHash, type Known, type Route } from './router.ts';
import { better, browserKV, checkBests, checkBestUnits, checkDaily, checkDeck, checkLast, checkLastUnit, checkMastery, checkSettings, DEFAULT_SETTINGS, keys, openStore } from './store.ts';
import { createDeck, isDone, type Deck } from './core/deck.ts';
import { dayOf, get } from './core/mastery.ts';
import { dailyFor, todayReview, unitMain } from './core/next.ts';
import { allQuestions, lessonQuestions, quickQuestions, reviewQuestions } from './core/questions.ts';
import { rngFrom } from './core/rng.ts';
import { usableDeck } from './core/session.ts';
import { gaArgs, lessonCompleteParams, onMissingUnit, registerUnits, studyKeys, unitsToLoad } from './core/units.ts';
import type { Ctx } from './ui/ctx.ts';
import { inAppBrowser } from './ui/dom.ts';
import { mountExplore } from './ui/explore.ts';
import { mountMaps } from './ui/maps.ts';
import { homePage, noReviewPage, pickPage, rankPage, regionsPage, resultPage, startPage, summaryPage, unitPage, type Page, type ResultState, type SummaryState } from './ui/pages.ts';
import { mountPlay, type PlayEnd, type Slot } from './ui/play.ts';
import { L, setLang } from './text/ui.ts';
import { initAnalytics, track } from './analytics.ts';
import { shownIn } from './sidos.ts';

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
  // 동·일반구·시·도 단원(설계안 EN_EMD 5.1): 한국어 앱은 모두 싣는다. 영어 앱은 판이 영어 이름을 실었을 때만(units.json enNames — 관문) 스위치
  // EN_EMD·EN_GU·EN_KOREA(registry.ts) 대로 싣는다. 2026-11-16 전에는(계획서 N26) 영어 앱이 셋을 모두 싣지 않았고 동 키도 읽지 않았다.
  // 끈 단원의 키는 읽지 않는다: 동을 끄면 오늘 푼 동 수(kgq_dailyemd_v1), 동·일반구를 모두 끄면 마지막 단원·단원 시험 기록(kgq_lastunit_v1·kgq_bestunit_v1)
  const opts = unitOptions(L.lang, geo.units);
  const keyReads = unitKeyReads(opts);
  const unitKeys = keyReads.unitKeys;
  // 영어 화면은 영어 이름을 확인하지 않은 지역(지역 표 enChecked false — Q5. E16 의 전남광주가 그랬고 2026-11-15 영문을 켠 뒤로는 없음)을 싣지 않는다(E8). 기록은 그대로 남는다
  geo = { ...geo, units: { ...geo.units, regions: geo.units.regions.filter((r) => shownIn(L.lang, r.key)) } };
  const reg = createRegistry(geo, opts);
  // 지역별 격리(계획서 E8): 결함이 있어 뺀 지역·단원은 알리고 나머지로 돈다. 쓸 수 있는 지역이 하나도 없을 때만 불러오기 실패 화면
  for (const f of reg.failed) track('geo_load_fail', { msg: `${f.key} ${f.why}`.slice(0, 100) });
  if (!reg.regions.some((x) => x.lessons.length)) {
    root.innerHTML = `<div class="page"><div class="pg-one"><h1 class="pg-title">${L.loadFail[0]}</h1><p class="h-desc">${L.loadFail[1]}</p></div></div>`;
    return;
  }
  const store = openStore(browserKV());
  const K = keys();
  // 동 단원 주소(계획서 E5)는 단원 파일을 받기 전에도 동 색인으로 판정한다(과 수·동 slug). 동 색인이 없는 지역(동 공개 전·동을 끈 창 — 관문이 닫힌 영어 앱)은 emd 가 false → 홈으로
  const idx = (k: string) => (reg.region(k) ? undefined : reg.unit(k)?.index);
  const known: Known = {
    region: (k) => !!reg.region(k),
    lesson: (r, n) => !!reg.lesson(r, n) || (n >= 1 && n <= (idx(r)?.lessons ?? 0)),
    slug: (r, s) => !!reg.bySlug(r, s) || !!idx(r)?.ids.includes(s),
    emd: (r) => reg.emdUnits(r).length > 0,
    // 동 색인의 단원이거나 등록된 단원(동 단원·일반구 단원 — 일반구 단원은 부팅 때 등록, 계획서 N5 · E7)
    unit: (k) => !!reg.unit(k) || !!reg.region(k)?.unit,
    main: (k) => unitMain(reg, k),
  };
  const pending = (d: Deck | null) => (d && !isDone(d) ? d : null);
  const saved = {
    mastery: store.read(K.mastery, checkMastery) ?? {},
    deck: store.read(K.deck, checkDeck),
    deck2: store.read(K.deck2, checkDeck),
    daily: store.read(K.daily, checkDaily),
    dailyEmd: keyReads.dailyEmd ? store.read(K.dailyEmd, checkDaily) : null,
    lastUnit: unitKeys ? store.read(K.lastUnit, checkLastUnit) : null,
  };
  // 동 단원(계획서 N17): 저장된 판·마지막 단원·이번 복습 판의 단원 파일만 받아 등록한 **뒤에** 판을 되살리고 홈 카드를 고른다.
  // 받기·등록에 실패한 단원만 빠지고 앱은 계속 돈다(N30 단원 격리). 동 색인이 없으면(동 공개 전) 받을 것이 없어 지금과 같다
  const fetchUnit = (code: string) => loadUnitFile(BASE, VER, code);
  const unitFail = (key: string, why: string) => track('geo_load_fail', { msg: `${key} ${why}`.slice(0, 100) });
  // 동 단원 지도 경계(emd/{코드}.topo.json)를 미리 받는다(E6 검수): 지도를 그릴 shapesOf 가 같은 약속(data.ts loadJSON 캐시 — 같은 주소는 한 번만 받는다)을
  // 다시 써서, 단원 파일 → 지도 경계 두 번 왕복이 한 번이 되고, 단원이 바뀌는 복습 문제 넘김에 받기 왕복이 더해지지 않는다.
  // 실패한 받기는 캐시에서 빠지므로 지도를 그릴 때 지금처럼 다시 받는다. 동 색인에 없는 키(지역 키·시·군·구 곳·동을 끈 창)는 건너뛴다.
  // 지도를 곧 그릴 때(단원 주소를 처음 열 때·오늘 복습 새 판·문제 판을 열 때)만 부른다 — 홈은 동 지도를 그리지 않는다
  const prefetchTopo = (keys: Iterable<string>) => {
    for (const k of new Set(keys)) { const u = reg.unit(k); if (u) void loadUnitTopo(BASE, VER, u.code).catch(() => {}); }
  };
  // 과 없는 지역(세종·제주)이 마지막 지역이면 홈이 그 주 단원을 그리므로 함께 받는다(E8)
  const lastArea = store.read(K.last, checkLast);
  const bootUnits = unitsToLoad(reg, { ...saved, today: dayOf(new Date()) }, { areas: [lastArea && reg.areaOf(lastArea) ? reg.areaOf(lastArea)! : null] });
  if (bootUnits.length) await registerUnits(reg, bootUnits, fetchUnit, unitFail);
  let lastUnitStored = saved.lastUnit !== null;
  // 이 창에 등록되지 않은 동 단원 판(동을 끈 창 — 관문이 닫힌 영어 앱, 받기 실패)은 이어 할 수 없을 뿐 — 저장소에서 지우지 않고 새 판이 덮을 때까지 둔다
  const held = { deck: onMissingUnit(reg, saved.deck), deck2: onMissingUnit(reg, saved.deck2) };

  const ctx: Ctx = {
    reg, geo, base: BASE, ver: VER, storageOk: store.ok, inApp: inAppBrowser(),
    mastery: saved.mastery,
    lessonDeck: pending(usableDeck(reg, saved.deck)),
    otherDeck: pending(usableDeck(reg, saved.deck2)),
    checkDeck: null,
    checkStart: 0,
    daily: saved.daily,
    dailyEmd: saved.dailyEmd,
    last: store.read(K.last, checkLast),
    lastUnit: saved.lastUnit,
    settings: store.read(K.settings, checkSettings) ?? DEFAULT_SETTINGS,
    homeRegion: null,
    bests: store.read(K.best, checkBests) ?? {},
    bestUnits: unitKeys ? store.read(K.bestUnit, checkBestUnits) ?? {} : {},
    today: () => dayOf(new Date()),
    save() {
      store.write(K.mastery, ctx.mastery);
      const l = pending(ctx.lessonDeck), o = pending(ctx.otherDeck);
      if (l) { store.write(K.deck, l); held.deck = false; } else if (!held.deck) store.remove(K.deck);
      if (o) { store.write(K.deck2, o); held.deck2 = false; } else if (!held.deck2) store.remove(K.deck2);
      if (ctx.daily) store.write(K.daily, dailyFor(ctx.daily, ctx.today()));
      if (ctx.last) store.write(K.last, ctx.last);
      // 동 키(N16)는 동 단원을 공부했을 때만 쓴다: 마지막 단원은 지역 공부로 바뀌면 지우고, 오늘 푼 동 수는 1 이상일 때만
      if (ctx.lastUnit) { store.write(K.lastUnit, ctx.lastUnit); lastUnitStored = true; }
      else if (lastUnitStored) { store.remove(K.lastUnit); lastUnitStored = false; }
      if (ctx.dailyEmd && dailyFor(ctx.dailyEmd, ctx.today()).n > 0) store.write(K.dailyEmd, ctx.dailyEmd);
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
  /** 공부를 시작하면 마지막 지역(kgq_last_v1, 늘 지역 키)과 마지막 동 단원(kgq_lastunit_v1)을 적는다(N9·N16) */
  const setLast = (key: string) => { const k = studyKeys(reg, key); ctx.last = k.last; ctx.lastUnit = k.lastUnit; };
  function startLesson(region: string, no: number, quick: boolean) {
    const s = seed();
    const q = quick ? quickQuestions(reg, region, no, rngFrom(s)) : lessonQuestions(reg, region, no, boxOf, rngFrom(s));
    ctx.lessonDeck = createDeck(quick ? 'quick' : 'lesson', q, { region, lesson: no, seed: s });
    setLast(region);
    ctx.save();
    ctx.go({ name: 'lesson', region, no }, { state: { s: 'play' } });
  }
  function newMix(region: string) {
    const s = seed();
    ctx.otherDeck = createDeck('mix', allQuestions(reg, region, rngFrom(s)), { region, seed: s });
    setLast(region);
    ctx.save();
  }
  function newCheck(region: string) {
    const s = seed();
    ctx.checkDeck = createDeck('check', allQuestions(reg, region, rngFrom(s)), { region, seed: s });
    ctx.checkStart = Date.now();
    setLast(region);
    ctx.save();
    track('game_start', { mode: 'check', ...gaArgs(reg, region) });
  }
  function newReview(): boolean {
    const today = ctx.today();
    const plan = todayReview(reg, ctx.mastery, today, dailyFor(ctx.daily, today).n, dailyFor(ctx.dailyEmd, today).n);
    // 문제 화면은 등록된 곳만 그린다: 동 단원은 render 가 needUnits(복습)로 먼저 받는다. 그래도 아직 없는 곳은 이번 판에서 뺀다(지키는 줄)
    const round = plan.round.filter((id) => reg.place(id));
    if (!round.length) return false;
    ctx.otherDeck = createDeck('review', reviewQuestions(round, boxOf), { seed: seed() });
    ctx.save();
    // due = 오늘이거나 지난 곳 전체(시·군·구 + 동, 전과 같은 뜻). 동 몫 판이면 unit 'emd' 를 붙인다(N34·N32)
    track('review_start', { due: plan.due, ...(plan.part === 'emd' ? { unit: 'emd' } : {}) });
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
      track('lesson_complete', lessonCompleteParams(reg, d.region!, d.lesson!, firstOk, items.length));
      ctx.lessonDeck = null;
      ctx.save();
      history.replaceState(keepRoot({ s: 'summary', sum }), '', location.href);
      render(true);
    } else if (d.kind === 'check') {
      const first = d.log.filter((x) => x.retry === 0);
      const seconds = Math.round((Date.now() - ctx.checkStart) / 1000);
      const now = { score: e.finished.firstTry, total: first.length, seconds, day: ctx.today() };
      // 동·일반구 단원 시험은 단원별 기록 키에(kgq_bestunit_v1 — 지역 기록 키의 모양은 넓히지 않는다, N16)
      const unitBest = !!reg.region(d.region!)?.unit;
      const prev = (unitBest ? ctx.bestUnits : ctx.bests)[d.region!];
      // 내 최고 기록(랭킹은 출시 뒤 — 결정 5). 처음 본 시험도 최고 기록으로 남긴다
      const isNew = better(now, prev);
      if (isNew && unitBest) {
        ctx.bestUnits = { ...ctx.bestUnits, [d.region!]: now };
        store.write(K.bestUnit, ctx.bestUnits);
      } else if (isNew) {
        ctx.bests = { ...ctx.bests, [d.region!]: now };
        store.write(K.best, ctx.bests);
      }
      const res: ResultState = {
        region: d.region!, score: now.score, total: now.total, seconds,
        wrong: first.filter((x) => x.result !== 'correct').map((x) => [x.id, x.tapped ?? null]),
        best: isNew ? null : prev ? { score: prev.score, total: prev.total, seconds: prev.seconds } : null, isNew: isNew && !!prev,
      };
      ctx.checkDeck = null;
      track('game_complete', { mode: 'check', ...gaArgs(reg, d.region!), score: res.score, total: res.total, seconds });
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
    // 판에 든 동 단원(판 단원·문제 곳의 단원)의 지도 경계를 미리 받는다(prefetchTopo)
    const d = slot === 'lesson' ? ctx.lessonDeck : slot === 'other' ? ctx.otherDeck : ctx.checkDeck;
    if (d) prefetchTopo([d.region ?? '', ...d.queue.map((q) => reg.unitOf(q.id)?.key ?? '')]);
    current = mountPlay(root, ctx, slot, onEnd, () => ctx.go({ name: 'home' }));
  }

  /**
   * 동 단원(N17): 홈·오늘 복습이 쓸 단원 파일(이번 복습 판·판·마지막 단원)이 아직 없으면 받아 등록한 뒤 다시 그린다.
   * review = 오늘 복습 화면에서 새 복습 판을 만들 때: 하던 과·전체 연습 판이 있어도 이번 복습 판의 단원을 받는다(unitsToLoad opt.review).
   * 받는 동안은 지금 화면을 그대로 둔다. 받기에 실패한 단원은 색인에서 빠지므로 다시 받지 않는다.
   * 받는 사이에 다른 화면(과 문제 등)으로 옮겨 갔으면 그 화면을 다시 그리지 않는다
   */
  let unitLoad: Promise<unknown> | null = null;
  const unitRoute = () => { const n = parseRoute(location.hash, location.search, known).route.name; return n === 'home' || n === 'review'; };
  function needUnits(review: boolean): boolean {
    if (unitLoad) return true;
    // 홈 탭이 될 과 없는 지역(고른 탭·마지막 지역)의 주 단원도(E8 — 홈이 그 단원을 그린다)
    const areas = [ctx.homeRegion, ctx.last ? reg.areaOf(ctx.last) ?? null : null];
    const miss = unitsToLoad(reg, { mastery: ctx.mastery, deck: ctx.lessonDeck, deck2: ctx.otherDeck, lastUnit: ctx.lastUnit, daily: ctx.daily, dailyEmd: ctx.dailyEmd, today: ctx.today() }, { review, areas });
    if (!miss.length) return false;
    if (review) prefetchTopo(miss);
    unitLoad = registerUnits(reg, miss, fetchUnit, unitFail).finally(() => { unitLoad = null; if (unitRoute()) render(true); });
    return true;
  }

  /**
   * 동 단원 주소(계획서 E5)인데 그 단원 파일을 아직 받지 않았으면 받아 등록한 뒤 다시 그린다. 받는 동안은 지금 화면을 그대로 두고,
   * 첫 화면이면 '불러오는 중' 한 줄. 받기·등록에 실패하면(단원은 색인에서 빠진다 — N30 단원 격리) 알리고 홈으로
   */
  let routeLoad: string | null = null;
  function loadRouteUnit(key: string) {
    if (!root.firstElementChild) root.innerHTML = `<div class="page"><div class="pg-one"><p class="h-desc">${L.loading}</p></div></div>`;
    if (routeLoad === key) return;
    if (!reg.unit(key)) { ctx.go({ name: 'home' }, { replace: true }); return; }
    routeLoad = key;
    prefetchTopo([key]);
    void registerUnits(reg, [key], fetchUnit, unitFail).then((failed) => {
      routeLoad = null;
      if (failed.length) { toast(L.mapFail); ctx.go({ name: 'home' }, { replace: true }); return; }
      render(true);
    });
  }

  function render(force = false) {
    const parsed = parseRoute(location.hash, location.search, known);
    if (parsed.fix !== null) history.replaceState(history.state, '', location.pathname + parsed.fix);
    const route = parsed.route;
    const unitKey = route.name !== 'emd' && 'region' in route && route.region.includes('/') ? route.region : null;
    if (unitKey && !reg.region(unitKey)) return loadRouteUnit(unitKey);
    // 오늘 복습 주소인데 이어 할 복습 판이 없으면 새 복습 판을 만든다 → 그 판의 단원을 먼저 받는다
    const o = ctx.otherDeck;
    const newRound = route.name === 'review' && !(o && !isDone(o) && o.kind === 'review');
    if ((route.name === 'home' || route.name === 'review') && needUnits(newRound)) return;
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
      // 화면 이동(설계서 9 route_open): 경로 틀 + 화면 상태(문제·요약·결과). 동 단원(N34): 구 고르기 emd_pick, 단원 쪽 emd_unit,
      // 그 밖의 동 단원 화면은 경로 틀 그대로 + unit 'emd'·unit_id. 지역 화면은 전과 같은 모양(region 만)
      const rr = 'region' in route ? route.region : undefined;
      // 과 없는 지역(세종·제주, E8)의 지역 주소는 단원이 하나면 그 단원 쪽, 둘 이상이면 구 고르기를 그린다 — 같은 화면을 단원 주소로 연 것과
      // 같은 값(emd_unit + 그 단원의 unit·unit_id / emd_pick + region)으로 남긴다(N34, E8 검수)
      const mainUs = route.name === 'unit' && unitMain(reg, route.region) ? reg.emdUnits(route.region) : null;
      const one = mainUs?.length === 1 ? mainUs[0].key : null;
      // 일반구 단원 쪽은 gu_unit(E7, unit 'gu' · unit_id 시·도 코드)
      const rname = mainUs ? (one ? 'emd_unit' : 'emd_pick')
        : route.name === 'emd' ? 'emd_pick' : route.name === 'unit' && unitKey ? (reg.region(unitKey)?.unit?.gu ? 'gu_unit' : 'emd_unit') : route.name;
      const where = one ? gaArgs(reg, one) : rr ? (route.name === 'emd' || mainUs ? { region: rr } : gaArgs(reg, rr)) : { region: undefined };
      track('route_open', { route: rname + (st.s ? `:${st.s}` : ''), ...where });
    }

    switch (route.name) {
      case 'home': return showPage(homePage(ctx));
      case 'regions': return showPage(regionsPage(ctx));
      case 'unit': {
        // 과 없는 지역(세종·제주, 계획서 N4 · E8): 지역 주소는 단원이 하나면 그 단원 쪽(세종시), 둘 이상이면 구 고르기(제주시·서귀포시)
        if (unitMain(reg, route.region)) {
          const us = reg.emdUnits(route.region);
          if (us.length !== 1) return showPage(pickPage(ctx, route.region));
          if (!reg.region(us[0].key)) return loadRouteUnit(us[0].key);
          return showPage(unitPage(ctx, us[0].key));
        }
        return showPage(unitPage(ctx, route.region));
      }
      case 'emd': return showPage(pickPage(ctx, route.region));
      case 'rank': return showPage(rankPage());
      case 'explore':
        // 둘러보기도 문제 화면처럼 화면 전체 지도(머리글·바닥글 없이, 스크롤 없음 — 합본 디자인 3.3)
        setFull(true);
        document.title = titled(L.exploreTitle(L.region(reg.region(route.region)!)));
        current = mountExplore(root, ctx, route.region, route.slug);
        if (moved) track('learn_explore', { source: st.src ?? 'link', ...gaArgs(reg, route.region) });
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
        // 동 단원 화면 → 단원 쪽 → 구 고르기 → 지역 단원 쪽. 일반구 단원 쪽 → 지역 단원 쪽
        const area = 'region' in r ? reg.areaOf(r.region) : undefined;
        // 과 없는 지역의 단원 쪽 → 그 지역 주소(단원이 둘 이상이면 구 고르기), 단원이 하나면 지역 고르기. 그 지역의 구 고르기 → 지역 고르기
        const mainArea = !!area && unitMain(reg, area);
        const up: Route = r.name === 'lesson' || r.name === 'place' || r.name === 'explore' || r.name === 'mix' || r.name === 'check' ? { name: 'unit', region: r.region }
          : r.name === 'unit' && mainArea ? (area !== r.region && reg.emdUnits(area!).length > 1 ? { name: 'unit', region: area! } : { name: 'regions' })
          : r.name === 'unit' ? (area && area !== r.region ? (reg.region(r.region)?.unit?.gu ? { name: 'unit', region: area } : { name: 'emd', region: area }) : { name: 'regions' })
          : r.name === 'emd' ? (mainArea ? { name: 'regions' } : { name: 'unit', region: r.region }) : { name: 'home' };
        return ctx.back(up);
      }
      case 'pickScreen': {
        // 구 고르기 지도의 넓은 화면(E7): 고른 범위로 다시 그리고 그 단추로 포커스를 되돌린다
        const [rg, sk] = arg.split(':');
        ctx.pickScreen = { ...ctx.pickScreen, [rg]: sk };
        render(true);
        root.querySelector<HTMLElement>(`[data-act="pickScreen"][data-arg="${arg}"]`)?.focus({ preventScroll: true });
        return;
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
