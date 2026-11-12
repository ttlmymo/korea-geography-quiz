// 문제 화면(설계서 3.4·3.5·4.2): 위 줄(✕·진행 막대·n/전체) · 문제 줄 · 지도 · 아래 시트.
// 답 하나는 core/session 의 step() 으로 판·숙달·오늘 푼 수에 함께 반영하고 곧바로 저장한다(문제마다 저장).
// 지도는 같은 지역이면 그대로 두고 상태만 바꾼다
import { current, manualNext, progress, type Answer, type Deck, type Summary } from '../core/deck.ts';
import { get } from '../core/mastery.ts';
import type { Question } from '../core/questions.ts';
import { step } from '../core/session.ts';
import { wrongInfo, type Tap } from '../core/judge.ts';
import { boxOf } from '../map/project.ts';
import { createSvgMap, type SvgMap } from '../map/svgmap.ts';
import type { Pad } from '../map/view.ts';
import { L, placeName } from '../text/ui.ts';
import { fillsOf, type Ctx } from './ctx.ts';
import { track } from '../analytics.ts';
import { devLog } from '../devlog.ts';
import { ICON, esc } from './dom.ts';
import { shapesOf } from './maps.ts';

export type Slot = 'lesson' | 'other' | 'check';
export interface PlayEnd { deck: Deck; finished: Summary; newly: string[] }
type Phase = 'ask' | 'met' | 'ok' | 'wrong' | 'dk' | 'fixed' | 'cok' | 'cno' | 'tok' | 'tno';

const AUTO_MS = 900, CHECK_MS = 600, MEET_MS = 700;

export function mountPlay(root: HTMLElement, ctx: Ctx, slot: Slot, onEnd: (e: PlayEnd) => void, onExit: () => void) {
  root.innerHTML = `<div class="play">
    <div class="play-top"><button class="icon-btn" type="button" data-pact="exit" aria-label="${esc(L.exitAria)}">${ICON.close}</button>
      <div class="bar"><i></i></div><span class="t15 num pn"></span></div>
    <div class="play-body"><div class="play-main">
      <div class="play-q" aria-live="polite"></div>
      <div class="play-stage"><div class="play-map"></div>
        <button class="map-reset" type="button" data-pact="reset" hidden>${esc(L.resetView)}</button>
        <div class="play-toast" role="status" hidden></div>
        <section class="sheet" aria-live="polite"></section></div></div>
      <aside class="play-side" aria-label="${esc(L.sideAria)}"></aside></div>
    <div class="scrim" hidden><div class="panel" role="dialog" aria-modal="true" aria-labelledby="pq">
      <h2 class="title-22" id="pq">${esc(L.exitQ)}</h2><p class="t15 pq-t"></p>
      <div class="row"><button class="btn2 half" type="button" data-pact="stay">${esc(L.stay)}</button><button class="btn half" type="button" data-pact="leave">${esc(L.leave)}</button></div></div></div>
  </div>`;
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const ui = {
    bar: $<HTMLElement>('.bar i'), pn: $<HTMLElement>('.pn'), band: $<HTMLElement>('.play-q'), mapHost: $<HTMLElement>('.play-map'),
    reset: $<HTMLButtonElement>('.map-reset'), toast: $<HTMLElement>('.play-toast'), sheet: $<HTMLElement>('.sheet'), scrim: $<HTMLElement>('.scrim'),
    side: $<HTMLElement>('.play-side'),
  };

  const deckOf = (): Deck | null => (slot === 'lesson' ? ctx.lessonDeck : slot === 'other' ? ctx.otherDeck : ctx.checkDeck);
  const setDeck = (d: Deck | null) => {
    if (slot === 'lesson') ctx.lessonDeck = d;
    else if (slot === 'other') ctx.otherDeck = d;
    else ctx.checkDeck = d;
  };
  const nm = (id: string) => placeName(ctx.reg, id);

  let map: SvgMap | null = null;
  let mapRegion: string | null = null;
  let q: Question | null = null;
  let qPos = 0, qTotal = 0;
  let phase: Phase = 'ask';
  let picked: string | null = null;
  let hintUsed = false;
  let scope: string[] = [];
  let screenKey: string | null = null;   // 지역 전체를 묻는 판에서 지금 보이는 화면
  let ended: PlayEnd | null = null;
  let timer = 0, toastTimer = 0, token = 0;
  let alive = true;

  function toast(msg: string) {
    ui.toast.textContent = msg;
    ui.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { ui.toast.hidden = true; }, 1800);
  }

  const pad = (): Pad => ({ t: 12, r: 16, l: 16, b: ui.sheet.offsetHeight + 12 });

  async function ensureMap(region: string) {
    if (map && mapRegion === region) return;
    const shapes = await shapesOf(ctx, region);
    if (!alive) return;
    map?.destroy();
    ui.mapHost.replaceChildren();
    mapRegion = region;
    map = createSvgMap(ui.mapHost, { shapes, interaction: 'full', contextNames: true, ctxName: L.ctxName, insetNote: L.inset, onTap, onZoomed: (z) => { ui.reset.hidden = !z; } });
  }

  /* ---------- 시트·문제 줄 ---------- */

  function setSheet(html: string) {
    ui.sheet.innerHTML = html;
    map?.setPad(pad());
    paintSide();
  }

  /** 문제 줄: 이름만 굵게(형광펜). 문장은 text/ui.ts */
  const band = () => (q ? `<span>${L.prompt(ctx.reg, q.mode, q.id, (s) => `<b>${esc(s)}</b>`)}</span>` : '');

  const nextBtn = () => `<button class="btn" type="button" data-pact="next">${esc(L.next)}</button>`;

  function sheetHtml(): string {
    if (!q) return '';
    const d = deckOf()!;
    const id = q.id, name = esc(nm(id));
    // 위치 한 줄(영어 화면에는 없음)
    const lineText = L.line(ctx.reg, id);
    const line = lineText ? `<p class="fb-line">${esc(lineText)}</p>` : '';
    if (q.mode === 'meet') {
      if (phase === 'ask') return `${line}<p class="fb-hint">${esc(L.meetAct)}</p>`;
      return `<p class="fb-title ok-c">○ ${name}</p>${line}`;
    }
    if (q.mode === 'choose') {
      const opts = (q.options ?? []).map((o, i) => {
        let c = '';
        if (phase !== 'ask') c = o === id ? 'ok' : o === picked ? 'no' : '';
        return `<button class="opt ${c}" type="button" data-pact="choose" data-arg="${o}" ${phase !== 'ask' ? 'disabled' : ''}><span class="k" aria-hidden="true">${i + 1}</span>${c === 'ok' ? '○ ' : c === 'no' ? '✕ ' : ''}${esc(nm(o))}</button>`;
      }).join('');
      const grid = `<div class="opts">${opts}</div>`;
      if (phase === 'ask') return grid;
      if (phase === 'cok') return `<p class="fb-title ok-c">○ ${esc(L.right(ctx.reg, id, true))}</p>${line}${nextBtn()}`;
      const t = L.wrong(ctx.reg, wrongInfo(ctx.reg, id, picked!), true);
      return `<p class="fb-title no-c">✕ ${esc(t.title)}</p><p class="fb-line">${esc(t.where)}</p><p class="fb-hint">${esc(t.act)}</p>${nextBtn()}`;
    }
    if (phase === 'ask') {
      if (d.kind === 'check') return `<p class="fb-hint">${esc(L.checkNote)}</p>`;
      if (q.pass) return `<p class="fb-hint">${esc(L.quickNote)}</p>`;
      return `<div class="row"><button class="btn2 half" type="button" data-pact="hint" ${hintUsed ? 'disabled' : ''}>${esc(hintUsed ? L.hintUsed : L.hint)}</button><button class="btn2 half" type="button" data-pact="dk">${esc(L.dontKnowBtn)}</button></div>`;
    }
    if (phase === 'tok') return `<p class="fb-title ok-c">○ ${name}</p>`;
    if (phase === 'tno') return '<p class="fb-title no-c">✕</p>';
    if (phase === 'ok') {
      if (manualNext(d, id)) return `<p class="fb-title ok-c">○ ${esc(L.right(ctx.reg, id, true))}</p>${line}${nextBtn()}`;
      return `<p class="fb-title ok-c">○ ${name}</p>${ctx.settings.autoNext ? `<p class="t13">${esc(L.autoNote)}</p>` : nextBtn()}`;
    }
    if (phase === 'wrong') {
      const t = L.wrong(ctx.reg, wrongInfo(ctx.reg, id, picked!), false);
      return `<p class="fb-title no-c">✕ ${esc(t.title)}</p><p class="fb-line">${esc(t.where)}</p><p class="fb-hint">○ ${esc(t.act)}</p>`;
    }
    if (phase === 'dk') { const t = L.dontKnow(ctx.reg, id); return `<p class="fb-title">${esc(t.title)}</p>${line}<p class="fb-hint">${esc(t.act)}</p>`; }
    if (phase === 'fixed') return `<p class="fb-title ok-c">○ ${esc(L.fixed(ctx.reg, id))}</p>${line}${nextBtn()}`;
    return '';
  }

  function paintTop() {
    ui.bar.style.width = `${qTotal ? Math.round((qPos / qTotal) * 100) : 0}%`;
    ui.pn.textContent = `${qPos + 1}/${qTotal}`;
    paintSide();
  }

  /** 데스크톱 오른쪽 패널(설계서 4.4): 이번 판의 곳과 상태, 헷갈린 곳. 휴대폰에서는 숨는다 */
  function paintSide() {
    const d = deckOf();
    if (!d || !matchMedia('(min-width: 1024px)').matches) return;
    const ids: string[] = [];
    for (const v of d.queue) if (!ids.includes(v.id)) ids.push(v.id);
    const met = new Set(d.queue.slice(0, d.pos).filter((v) => v.mode === 'meet').map((v) => v.id));
    const st = (id: string) => {
      const logs = d.log.filter((x) => x.id === id);
      if (logs.some((x) => x.result !== 'correct' || x.hint)) return ['no', L.st.no];
      if (logs.length) return ['ok', L.st.ok];
      return met.has(id) ? ['met', L.st.met] : ['', L.st.new];
    };
    const r = d.region ? ctx.reg.region(d.region) : null;
    const l = r && d.lesson !== null ? ctx.reg.lesson(r.key, d.lesson) : null;
    const title = l ? `${L.region(r!)} ${L.lessonNo(l.no)} · ${L.lesson(l)}` : `${r ? `${L.region(r)} ` : ''}${L.kind[d.kind] ?? ''}`;
    const pairs: string[] = [];
    for (const x of d.log) if (x.result === 'wrong' && x.tapped) { const k = `${nm(x.id)} ↔ ${nm(x.tapped)}`; if (!pairs.includes(k)) pairs.push(k); }
    ui.side.innerHTML = `<h2 class="title-18">${esc(title)}</h2>
      <ul class="side-list">${ids.map((id) => { const [c, t] = st(id); return `<li class="${c}${q?.id === id ? ' now' : ''}"><span>${esc(nm(id))}</span><span class="t13">${esc(t)}</span></li>`; }).join('')}</ul>
      ${pairs.length ? `<h3 class="title-18">${esc(L.confused)}</h3><div class="row wrap">${pairs.map((p) => `<span class="chip static">${esc(p)}</span>`).join('')}</div>` : ''}`;
  }

  /* ---------- 문제 보이기 ---------- */

  async function show() {
    clearTimeout(timer);
    const d = deckOf();
    if (!d) return;
    q = current(d);
    if (!q) return finish();
    const my = ++token;
    const p = progress(d);
    qPos = p.n - 1;
    qTotal = p.total;
    phase = 'ask';
    picked = null;
    hintUsed = false;
    const place = ctx.reg.place(q.id)!;
    const wide = d.kind === 'mix' || d.kind === 'check' || (d.kind === 'review' && q.scope === 'wide');
    // 넓은 판은 그곳이 든 화면(경기 북서부 등)만 밝게, 과 판은 그 과만
    const scr = wide ? ctx.reg.screenOf(q.id) : undefined;
    scope = scr ? scr.items : wide ? place.region.items.map((it) => it.id) : place.lesson.items;
    const fit = scr ? scr.fit : wide ? place.region.fit : place.lesson.fit;
    const newScreen = wide && place.region.screens.length > 1 && screenKey !== `${place.region.key}:${scr?.key}`;
    screenKey = wide ? `${place.region.key}:${scr?.key}` : null;
    await ensureMap(place.region.key);
    if (!alive || my !== token || !map) return;
    ui.band.innerHTML = band();
    paintTop();
    setSheet(sheetHtml());
    map.clearMarks();
    map.setHint(null);
    map.setActive(scope);
    map.setRim(wide ? null : scope);
    // 이번 과 밖에서 이미 칠한 곳은 흐린 이름으로(길잡이). 지역 전체를 묻는 판에는 과 밖이 없다
    const f = fillsOf(ctx.mastery, place.region);
    map.setDimLabels(wide ? [] : place.region.items.filter((it) => !scope.includes(it.id) && f[it.id] > 0).map((it) => ({ id: it.id, text: L.name(it) })));
    map.setHome(boxOf(fit), pad(), map.isZoomed());
    if (newScreen && scr) toast(L.screenName(L.region(place.region), scr));
    if (q.mode === 'meet') {
      map.setQuestion(q.id, { breathe: d.pos < 2 });
      map.setLabels([{ id: q.id, text: nm(q.id) }]);
    } else {
      map.setQuestion(q.mode === 'choose' ? q.id : null);
      map.setLabels([]);
    }
  }

  /* ---------- 답 ---------- */

  function apply(a: Answer) {
    const d = deckOf();
    if (!d) return;
    const before = ctx.mastery;
    const q0 = current(d);
    // 과·복습·전체 연습의 답(설계서 9 practice_answer). 시험은 game_complete 로 몰아서
    if (q0 && d.kind !== 'check') {
      track('practice_answer', {
        mode: q0.mode, unit: 'sgg', region: ctx.reg.place(q0.id)?.region.key, lesson: d.lesson ?? d.kind,
        correct: a.result === 'correct', hint: !!a.hint, box: get(before, q0.id).box,
      });
    }
    const r = step(ctx.reg, d, ctx.mastery, ctx.daily, a, ctx.today());
    setDeck(r.deck);
    ctx.mastery = r.mastery;
    ctx.daily = r.daily;
    if (r.finished) {
      const ids = d.region && d.lesson !== null ? ctx.reg.lesson(d.region, d.lesson)?.items ?? [] : [];
      ended = { deck: r.deck, finished: r.finished, newly: ids.filter((id) => get(before, id).hi === 0 && get(r.mastery, id).hi > 0) };
    }
    ctx.save();
  }

  function after(ms: number) {
    clearTimeout(timer);
    timer = window.setTimeout(next, ms);
  }

  function next() {
    clearTimeout(timer);
    if (ended) return finish();
    show();
  }

  function finish() {
    clearTimeout(timer);
    const e = ended;
    if (!e) return;
    ended = null;
    onEnd(e);
  }

  function onTap(tap: Tap) {
    if (!q || !map || !ui.scrim.hidden) return;
    devLog('ans', { q: q.id, mode: q.mode, phase, tap: tap.type === 'cell' ? tap.id : tap.type });
    if (tap.type !== 'cell') return toast(L.tap(tap.type));
    const id = tap.id;
    const d = deckOf()!;
    if (phase === 'wrong' || phase === 'dk') {
      if (id === q.id) {
        phase = 'fixed';
        setSheet(sheetHtml());
      } else toast(L.tapMarked);
      return;
    }
    if (phase !== 'ask') return;
    if (q.mode === 'meet') {
      if (id !== q.id) return toast(L.tapOutlined);
      apply({ result: 'correct' });
      phase = 'met';
      map.setQuestion(null);
      map.mark({ ok: q.id, pencil: true });
      setSheet(sheetHtml());
      return after(MEET_MS);
    }
    if (q.mode === 'choose') return toast(L.useOptions);
    const isCheck = d.kind === 'check';
    if (id === q.id) {
      apply({ result: 'correct', hint: hintUsed });
      map.setHint(null);
      map.mark({ ok: q.id, pencil: !isCheck });
      if (isCheck) { phase = 'tok'; setSheet(sheetHtml()); return after(CHECK_MS); }
      phase = 'ok';
      const manual = manualNext(deckOf()!, q.id);
      setSheet(sheetHtml());
      map.reveal([q.id], pad());
      if (!manual && ctx.settings.autoNext) after(AUTO_MS);
      return;
    }
    picked = id;
    apply({ result: 'wrong', tapped: id, hint: hintUsed });
    map.setHint(null);
    if (isCheck) { phase = 'tno'; map.mark({ no: id }); setSheet(sheetHtml()); return after(CHECK_MS); }
    phase = 'wrong';
    map.mark({ ok: q.id, no: id, arrow: true });
    setSheet(sheetHtml());
    map.reveal([id, q.id], pad());
  }

  function choose(opt: string) {
    if (!q || q.mode !== 'choose' || phase !== 'ask' || !map) return;
    if (opt === q.id) {
      apply({ result: 'correct' });
      phase = 'cok';
      map.setQuestion(null);
      map.mark({ ok: q.id, pencil: true });
    } else {
      picked = opt;
      apply({ result: 'wrong', tapped: opt });
      phase = 'cno';
      map.setQuestion(null);
      map.mark(scope.includes(opt) ? { ok: q.id, no: opt, arrow: true } : { ok: q.id });
    }
    setSheet(sheetHtml());
    map.reveal(phase === 'cno' && scope.includes(opt) ? [opt, q.id] : [q.id], pad());
  }

  function hint() {
    if (!q || !map || hintUsed || phase !== 'ask') return;
    hintUsed = true;
    const t = q.id;
    const near = scope.filter((v) => v !== t).sort((a, b) => ctx.reg.dist(t, a) - ctx.reg.dist(t, b)).slice(0, 2);
    map.setHint([t, ...near]);
    setSheet(sheetHtml());
  }

  function dontKnow() {
    if (!q || !map || phase !== 'ask') return;
    apply({ result: 'dontknow' });
    phase = 'dk';
    map.setHint(null);
    map.mark({ ok: q.id, blink: true });
    setSheet(sheetHtml());
    map.reveal([q.id], pad());
  }

  function askExit() {
    const d = deckOf();
    root.querySelector('.pq-t')!.textContent = d?.kind === 'check' ? L.exitCheck : L.exitSaved;
    ui.scrim.hidden = false;
    (root.querySelector('[data-pact="stay"]') as HTMLElement).focus();
  }

  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-pact]');
    if (!b) return;
    const a = b.dataset.pact;
    if (a === 'exit') askExit();
    else if (a === 'stay') ui.scrim.hidden = true;
    else if (a === 'leave') { ui.scrim.hidden = true; if (slot === 'check') setDeck(null); onExit(); }
    else if (a === 'next') next();
    else if (a === 'hint') hint();
    else if (a === 'dk') dontKnow();
    else if (a === 'choose') choose(b.dataset.arg!);
    else if (a === 'reset') map?.resetView();
  });

  show();

  return {
    /** 키보드(설계서 4.4): Enter·Space 다음, 1~4 보기, H 힌트, Esc 그만하기 */
    key(e: KeyboardEvent): boolean {
      if (e.key === 'Escape') { if (ui.scrim.hidden) askExit(); else ui.scrim.hidden = true; return true; }
      if (!ui.scrim.hidden) return false;
      const nb = root.querySelector<HTMLButtonElement>('[data-pact="next"]');
      if ((e.key === 'Enter' || e.key === ' ') && nb && !(e.target as HTMLElement)?.closest?.('button')) { next(); return true; }
      if (/^[1-4]$/.test(e.key) && q?.mode === 'choose' && phase === 'ask') { const o = q.options?.[Number(e.key) - 1]; if (o) choose(o); return true; }
      if ((e.key === 'h' || e.key === 'H') && q?.mode === 'find') { hint(); return true; }
      return false;
    },
    destroy() {
      alive = false;
      clearTimeout(timer);
      clearTimeout(toastTimer);
      map?.destroy();
    },
  };
}
