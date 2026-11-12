// 쪽 화면(설계서 4.1): 홈 · 지역 고르기 · 단원 · 과 시작 카드 · 과 요약 · 시험 결과 · 복습 없음 · 랭킹(준비 중).
// 문자열로 그리고, 지도 자리(data-map)는 main.ts 가 붙인다. 누르는 동작은 data-act, 화면 이동은 해시 링크. 글은 text/ui.ts(한·영)
import { homeCard, todayReview, nextLesson, dailyFor } from '../core/next.ts';
import { get, isDue } from '../core/mastery.ts';
import { progress } from '../core/deck.ts';
import { L, placeName } from '../text/ui.ts';
import type { Route } from '../router.ts';
import { toHash } from '../router.ts';
import type { BBox, Region } from '../types.ts';
import { fillsOf, type Ctx } from './ctx.ts';
import { esc, legend, mapBox, topbar } from './dom.ts';
import type { MapSpec } from './maps.ts';

export interface Page { html: string; maps?: Record<string, MapSpec>; title?: string }

const link = (r: Route) => toHash(r) || '#';
const nm = (ctx: Ctx, id: string) => placeName(ctx.reg, id);
const rk = (r: Region) => esc(L.region(r));
/** '서울 2과' / 'Seoul lesson 2' */
const lessonLabel = (r: Region, no: number) => `${L.region(r)} ${L.lessonNo(no)}`;

/** 이 브라우저에만 저장 · 앱 안 브라우저 · 저장 못 하는 창 안내(설계서 3.8) */
function storageNotes(ctx: Ctx): string {
  const out = [`<p class="t13">${esc(L.notes.saved)}</p>`];
  if (!ctx.storageOk) out.push(`<p class="t13 warn">${esc(L.notes.noStore)}</p>`);
  if (ctx.inApp) out.push(`<p class="t13 warn">${esc(L.notes.inApp)}</p>`);
  return out.join('');
}

function regionChips(ctx: Ctx, on: string | null, act: 'unit' | 'homeRegion') {
  return ctx.reg.regions.map((r) => act === 'unit'
    ? `<a class="chip${r.key === on ? ' on' : ''}" href="${link({ name: 'unit', region: r.key })}">${rk(r)}</a>`
    : `<button class="chip${r.key === on ? ' on' : ''}" type="button" data-act="homeRegion" data-arg="${r.key}" aria-pressed="${r.key === on}">${rk(r)}</button>`).join('');
}

const unionFit = (fits: BBox[]): BBox => fits.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);

/* ---------- 홈 '오늘 공부'(설계서 4.3) ---------- */

export function homePage(ctx: Ctx): Page {
  const { reg, mastery: m } = ctx;
  const today = ctx.today();
  const deck = ctx.lessonDeck ?? ctx.otherDeck;
  const card = homeCard({ reg, mastery: m, deck, daily: ctx.daily, last: ctx.last, today });
  const maps: Record<string, MapSpec> = {};
  let main = '';

  if (card.type === 'new') {
    const r = reg.region(card.region)!, l = reg.lesson(card.region, card.lesson)!;
    maps.main = { region: r.key, highlight: l.items, rim: l.items, home: r.fit };
    main = `<section class="card" aria-labelledby="hc">${mapBox('main', '', L.rangeMap(L.region(r), L.lessonNo(l.no)))}
      <h2 class="title-22" id="hc">${esc(lessonLabel(r, l.no))} · ${esc(L.lesson(l))} ${esc(L.lessonCount(r, l.items))}</h2>
      <p class="t15">${esc(L.newSub)}</p>
      <button class="btn" type="button" data-act="startFirst" data-card="new">${esc(L.start)}</button></section>`;
  } else if (card.type === 'resume') {
    const r = card.region ? reg.region(card.region)! : null;
    const l = r && card.lesson ? reg.lesson(r.key, card.lesson)! : null;
    const title = l ? `${lessonLabel(r!, l.no)} · ${L.lesson(l)}` : `${r ? `${L.region(r)} ` : ''}${L.kind[card.kind] ?? ''}`;
    if (r) maps.main = { region: r.key, fills: fillsOf(m, r), active: l ? l.items : null, rim: l ? l.items : null, home: l ? l.fit : r.fit };
    main = `<section class="card"><p class="eyebrow">${esc(L.resume)}</p><h2 class="title-22">${esc(title)}</h2>
      <div class="row"><div class="bar"><i style="width:${Math.round(((card.n - 1) / card.total) * 100)}%"></i></div><span class="t14 num">${esc(L.questions(card.n, card.total))}</span></div>
      ${r ? mapBox('main') : ''}<button class="btn" type="button" data-act="resume" data-card="resume">${esc(L.resume)}</button>
      ${card.review ? `<p class="t15">${esc(L.reviewAfter(card.review))}</p>` : ''}</section>`;
  } else if (card.type === 'review') {
    const plan = todayReview(reg, m, today, dailyFor(ctx.daily, today).n);
    const r0 = reg.region(card.byRegion[0].region)!;
    const ids = plan.round.filter((id) => reg.place(id)?.region.key === r0.key);
    // 복습할 곳이 든 과 범위로 맞춰야 ↻ 배지(칸 지름 32px 이상)가 보인다
    maps.main = { region: r0.key, fills: fillsOf(m, r0), badges: ids, home: unionFit([...new Set(ids.map((id) => reg.place(id)!.lesson))].map((l) => l.fit)) };
    const nx = card.next ? lessonLabel(reg.region(card.next.region)!, card.next.lesson) : null;
    main = `<section class="card due"><p class="eyebrow due">${esc(L.kind.review)}</p><h2 class="title-22">${esc(L.reviewTitle(card.count))}</h2>
      <p class="t15">${card.byRegion.map((b) => `${rk(reg.region(b.region)!)} ${b.n}`).join(' · ')}</p>
      ${mapBox('main')}<a class="btn" href="${link({ name: 'review' })}" data-card="review">${esc(L.reviewStart)}</a>
      ${nx ? `<p class="t15">${esc(L.nextAfterReview(nx))}</p>` : ''}</section>`;
  } else if (card.type === 'done') {
    const r = reg.region(card.region)!;
    maps.main = { region: r.key, fills: fillsOf(m, r) };
    main = `<section class="card"><div class="row" style="gap:14px"><div class="stamp">${L.doneStamp(rk(r))}</div>
      <div class="stack" style="gap:4px;min-width:0"><h2 class="title-22">${esc(L.doneTitle(L.region(r), L.count(r)))}</h2><p class="t15">${esc(L.doneSub)}</p></div></div>
      ${mapBox('main')}<div class="row wrap">${card.more.map((k) => `<a class="chip" href="${link({ name: 'unit', region: k })}" data-card="done">${esc(L.regionStart(L.region(reg.region(k)!)))}</a>`).join('')}</div>
      <a class="btn2" href="${link({ name: 'check', region: r.key })}" data-card="done">${esc(L.checkGo(L.region(r)))}</a></section>`;
  } else {
    const r = reg.region(card.region)!, l = reg.lesson(r.key, card.lesson)!;
    maps.main = { region: r.key, fills: fillsOf(m, r), highlight: l.items, rim: l.items, home: r.fit };
    main = `<section class="card"><p class="eyebrow">${esc(L.nextEyebrow(card.recommend))}</p>
      <h2 class="title-22">${esc(L.nextTitle(`${lessonLabel(r, l.no)} · ${L.lesson(l)} ${L.lessonCount(r, l.items)}`))}</h2>
      ${mapBox('main')}<a class="${card.recommend ? 'btn' : 'btn2'}" href="${link({ name: 'lesson', region: r.key, no: l.no })}" data-card="next">${esc(L.start)}</a>
      <p class="t15">${esc(L.reviewDone(card.tomorrow))}</p></section>`;
  }

  // 나의 채움 지도
  const mineKey = ctx.homeRegion && reg.region(ctx.homeRegion) ? ctx.homeRegion : (ctx.last && reg.region(ctx.last) ? ctx.last : reg.regions[0].key);
  const mr = reg.region(mineKey)!;
  const f = fillsOf(m, mr);
  const filled = mr.items.filter((it) => f[it.id] > 0).length, done = mr.items.filter((it) => f[it.id] === 3).length;
  const due = mr.items.filter((it) => isDue(get(m, it.id), today)).map((it) => it.id);
  maps.mine = { region: mr.key, fills: f, badges: due };
  const mine = `<section class="card"><h2 class="title-18">${esc(L.mine)}</h2>
    <div class="row wrap">${regionChips(ctx, mr.key, 'homeRegion')}</div>
    ${mapBox('mine', 'tall', L.fillMap(L.region(mr)))}${legend()}
    <p class="t15 num">${esc(L.filled(mr.items.length, filled, done))}</p>
    ${storageNotes(ctx)}</section>`;

  const seoul = reg.regions[0];
  const html = `<div class="page">
    <p class="sub">${esc(L.tagline)}</p>
    ${main}
    ${card.type === 'new'
      ? `<div class="stack" style="gap:8px"><p class="t14">${esc(L.whereFirst)}</p><div class="row wrap">${regionChips(ctx, seoul.key, 'unit')}</div>
        <div><a class="linkrow" href="${link({ name: 'explore', region: seoul.key, slug: null })}">${esc(L.namedMap(L.region(seoul)))} <span aria-hidden="true">→</span></a>
        <a class="linkrow" href="${link({ name: 'check', region: seoul.key })}">${esc(L.knowIt(L.region(seoul)))} <span aria-hidden="true">→</span></a></div></div>`
      : `<div class="row wrap"><span class="t14">${esc(L.otherRegions)}</span>${regionChips(ctx, ctx.last, 'unit')}</div>`}
    ${mine}
    <section class="stack"><h2 class="title-22">${esc(L.how)}</h2>
      <div class="steps3">${L.howSteps.map(([a, b]) => `<div><b>${esc(a)}</b><span class="t14">${esc(b)}</span></div>`).join('')}</div></section>
    <section class="stack"><h2 class="title-22">${esc(L.explore)}</h2><div class="card list">
      <a class="linkrow" href="${ctx.base}${L.path('seoul/')}">${esc(L.seoulHub[0])} <span class="t14">${esc(L.seoulHub[1])}</span></a></div></section>
    <section class="stack"><h2 class="title-18">${esc(L.settings)}</h2>
      <label class="toggle"><input type="checkbox" data-set="autoNext"${ctx.settings.autoNext ? ' checked' : ''}><span>${esc(L.autoNext[0])}<span class="t13">${esc(L.autoNext[1])}</span></span></label></section>
  </div>`;
  return { html, maps };
}

/* ---------- 지역 고르기 ---------- */

export function regionsPage(ctx: Ctx): Page {
  const { reg, mastery: m } = ctx;
  const steps = reg.regions.map((r) => {
    const f = fillsOf(m, r), filled = r.items.filter((it) => f[it.id] > 0).length;
    const [desc, tag] = L.regionDesc[r.key] ?? ['', ''];
    return `<a class="step" href="${link({ name: 'unit', region: r.key })}"><div class="body"><div class="name">${esc(L.regionStep(L.region(r), L.count(r), r.lessons.length))}</div><div class="t14">${esc(desc)}</div></div>
      <span class="tag ${filled ? 'ok' : tag ? 'rec' : ''} num">${esc(filled ? L.filledTag(filled, r.items.length) : tag || L.notYet)}</span></a>`;
  }).join('');
  return {
    title: L.regionsTitle,
    html: `<div class="page">${topbar(L.regionsTitle)}
      <div class="stack">${steps}</div>
      <details class="fold"><summary>${esc(L.others)}</summary><div class="stack" style="gap:6px">${L.otherList.map((o) => `<div class="row" style="justify-content:space-between"><span class="t15">${esc(o)}</span><span class="t13">${esc(L.soon)}</span></div>`).join('')}</div></details>
    </div>`,
  };
}

/* ---------- 단원(경로·채움 지도) ---------- */

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
  const filled = r.items.filter((it) => f[it.id] > 0).length, done = r.items.filter((it) => f[it.id] === 3).length;
  const due = r.items.filter((it) => isDue(get(m, it.id), today)).map((it) => it.id);
  const steps = r.lessons.map((l) => {
    const st = lessonTag(ctx, r, l.no);
    return `<a class="step" href="${link({ name: 'lesson', region: r.key, no: l.no })}"><span class="no ${st.done ? 'done' : ''}">${l.no}</span>
      <div class="body"><div class="name">${esc(`${L.lessonNo(l.no)} ${L.lesson(l)}`.replace(/^lesson/, 'Lesson'))}</div><div class="t14">${l.items.map((id) => esc(nm(ctx, id))).join(esc(L.sep))}</div></div>${st.tag ? `<span class="tag ${st.cls}">${esc(st.tag)}</span>` : ''}</a>`;
  }).join('');
  const mixNo = r.lessons.length + 1;
  const title = `${L.region(r)} · ${L.count(r)}`;
  return {
    title,
    maps: { unit: { region: r.key, fills: f, badges: due, interaction: 'tap', onTap: (t) => { if (t.type === 'cell') ctx.go({ name: 'explore', region: r.key, slug: reg.place(t.id)!.item.slug }, { state: { src: 'unit_map' } }); } } },
    html: `<div class="page">${topbar(title)}
      ${mapBox('unit', 'tall', L.unitMapLabel(L.region(r)))}${legend()}
      <div class="row wrap" style="justify-content:space-between"><span class="t15 num">${esc(L.unitFilled(filled, r.items.length, done))}</span>
        ${due.length ? `<a class="chip due" href="${link({ name: 'review' })}">${esc(L.reviewChip(due.length))}</a>` : ''}</div>
      <section class="stack"><h2 class="title-22">${esc(L.order)}</h2><div class="path">${steps}
        <a class="step" href="${link({ name: 'mix', region: r.key })}"><span class="no">${mixNo}</span><div class="body"><div class="name">${esc(L.mixName(mixNo, L.region(r)))}</div><div class="t14">${esc(L.mixSub(r.items.length))}</div></div></a>
        <a class="step" href="${link({ name: 'check', region: r.key })}"><span class="no">✎</span><div class="body"><div class="name">${esc(L.checkName(L.region(r)))}</div><div class="t14">${esc(L.checkSub(r.items.length))}${ctx.bests[r.key] ? ' · ' + esc(L.bestTag(ctx.bests[r.key].score, ctx.bests[r.key].total, L.time(ctx.bests[r.key].seconds))) : ''}</div></div></a></div>
        <a class="linkrow" href="${link({ name: 'explore', region: r.key, slug: null })}">${esc(L.namedMap(L.region(r)))} <span aria-hidden="true">→</span></a>
        ${r.key === 'seoul' ? `<div class="step off"><span class="no">동</span><div class="body"><div class="name">${esc(L.dong[0])}</div><div class="t14">${esc(L.dong[1])}</div></div><span class="tag">${esc(L.soon)}</span></div>` : ''}</section>
      ${r.key === 'seoul' ? `<section class="stack"><h2 class="title-18">${esc(L.more)}</h2><div class="card list"><a class="linkrow" href="${ctx.base}${L.path('seoul/')}">${esc(L.seoulMore)} <span aria-hidden="true">→</span></a></div></section>` : ''}
    </div>`,
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
  return {
    title,
    maps: { start: { region: r.key, active: l.items, rim: l.items, highlight: l.items, home: l.fit, labels: l.items.map((id) => ({ id, text: nm(ctx, id) })), labelsInside: true } },
    html: `<div class="page">${topbar(title)}
      ${mapBox('start', 'tall', L.rangeMap(L.region(r), L.lessonNo(l.no)))}
      <div class="stack" style="gap:6px"><h2 class="title-22">${esc(L.lesson(l))} · ${esc(L.lessonCount(r, l.items))}</h2>
        <p class="t15">${l.items.map((id) => esc(nm(ctx, id))).join(' · ')}</p>
        ${r.key === 'incheon' && no === 1 ? `<p class="t15">${esc(L.newNames)}</p>` : ''}
        <p class="t15">${esc(L.startSub(!!mine))}</p></div>
      <div class="stack">
        ${mine ? `<button class="btn" type="button" data-act="resume">${esc(L.resumeAt(mine.n, mine.total))}</button><button class="btn2" type="button" data-act="learn" data-arg="${r.key}:${no}">${esc(L.restart)}</button>`
          : `<button class="btn" type="button" data-act="learn" data-arg="${r.key}:${no}">${esc(L.learn)}</button>`}
        <button class="btn2" type="button" data-act="quick" data-arg="${r.key}:${no}">${esc(L.quick)}</button>
        <p class="t13">${esc(L.quickNoteStart(other))}</p></div>
    </div>`,
  };
}

/* ---------- 과 요약 ---------- */

export interface SummaryState { region: string; no: number; newly: string[]; firstTry: number; total: number; confused: string[] }

export function summaryPage(ctx: Ctx, s: SummaryState): Page {
  const { reg } = ctx;
  const r = reg.region(s.region)!, l = reg.lesson(s.region, s.no)!;
  const nl = reg.lesson(r.key, s.no + 1);
  const f = fillsOf(ctx.mastery, r);
  const no = L.lessonNo(s.no);
  return {
    title: L.sumTitle(`${L.region(r)} ${no}`),
    maps: { sum: { region: r.key, active: l.items, rim: l.items, fills: Object.fromEntries(l.items.map((id) => [id, f[id]])), home: l.fit, labels: l.items.map((id) => ({ id, text: nm(ctx, id) })), labelsInside: true } },
    html: `<div class="page" style="padding-top:12px">
      <div class="row" style="gap:16px"><div class="stamp">${L.sumStamp(esc(no))}</div><div class="stack" style="gap:4px"><h1 class="title-26">${esc(L.sumTitle(no))}</h1><p class="t15">${rk(r)} · ${esc(L.lesson(l))}</p></div></div>
      ${mapBox('sum', 'tall', L.sumMap)}
      <p class="fb-line num">${esc(L.sumStats(s.newly.length, s.firstTry, s.total))}</p>
      ${s.confused.length ? `<div class="stack" style="gap:6px"><p class="t14">${esc(L.confused)}</p><div class="row wrap">${s.confused.map((id) => `<span class="chip static">${esc(nm(ctx, id))}</span>`).join('')}</div></div>` : ''}
      <div class="stack">${nl ? `<a class="btn" href="${link({ name: 'lesson', region: r.key, no: nl.no })}">${esc(L.nextLesson(`${L.lessonNo(nl.no)} ${L.lesson(nl)}`))}</a>` : `<a class="btn" href="${link({ name: 'mix', region: r.key })}">${esc(L.nextMix(L.region(r)))}</a>`}
        <button class="btn2" type="button" data-act="home">${esc(L.home)}</button></div>
      <p class="t15">${esc(L.tomorrowReview(l.items.length))}</p>
      ${storageNotes(ctx)}
    </div>`,
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
  const wrongIds = s.wrong.map((w) => w[0]);
  const fills = Object.fromEntries(r.items.map((it) => [it.id, wrongIds.includes(it.id) ? 0 : 2]));
  return {
    title: L.resultTitle(L.region(r)),
    maps: { res: { region: r.key, fills, labels: s.wrong.map(([id]) => ({ id, text: nm(ctx, id) })) } },
    html: `<div class="page">${topbar(L.checkName(L.region(r)))}
      <div class="row" style="align-items:baseline;gap:12px"><span class="num score">${s.score}/${s.total}</span><span class="fb-line num">${esc(L.time(s.seconds))}</span></div>
      ${s.isNew ? `<p class="t15 ok-c">${esc(L.bestNew)}</p>` : s.best ? `<p class="t15 num">${esc(L.bestLine(s.best.score, s.best.total, L.time(s.best.seconds)))}</p>` : ''}
      ${mapBox('res', 'tall', L.resultMap)}
      <section class="stack"><h2 class="title-18">${esc(L.wrongList)}</h2>${s.wrong.length
        ? `<div class="card list">${s.wrong.map(([a, b]) => `<div class="linkrow"><span>${L.answer(esc(nm(ctx, a)))}</span><span class="t14">${esc(L.mine2(b ? nm(ctx, b) : '—'))}</span></div>`).join('')}</div>`
        : `<p class="t15">${esc(L.allRight)}</p>`}</section>
      <div class="stack"><button class="btn" type="button" data-act="checkAgain" data-arg="${r.key}">${esc(L.again)}</button><button class="btn2" type="button" data-act="home">${esc(L.home)}</button></div>
    </div>`,
  };
}

/* ---------- 오늘 복습이 없을 때 · 랭킹(준비 중) ---------- */

export function noReviewPage(ctx: Ctx): Page {
  const today = ctx.today();
  const tomorrow = Object.keys(ctx.mastery).filter((id) => ctx.reg.place(id) && isDue(get(ctx.mastery, id), today + 1)).length;
  return {
    title: L.kind.review,
    html: `<div class="page">${topbar(L.kind.review)}
      <section class="card"><h2 class="title-22">${esc(L.noReview)}</h2>
        <p class="t15">${esc(L.noReviewSub(tomorrow))}</p>
        <button class="btn" type="button" data-act="home">${esc(L.home)}</button></section></div>`,
  };
}

export function rankPage(): Page {
  return {
    title: L.rank,
    html: `<div class="page">${topbar(L.rank)}<section class="card"><h2 class="title-22">${esc(L.rankTitle)}</h2>
      <p class="t15">${esc(L.rankSub)}</p><button class="btn" type="button" data-act="home">${esc(L.home)}</button></section></div>`,
  };
}
