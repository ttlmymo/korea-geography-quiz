// 문제 화면(합본 디자인 — docs/REDESIGN_PLAN_2026-11-13.md 3.3): 머리(그만하기 · 과 이름 · n / 전체 · 진행 막대) + 본문.
// 넓은 화면(1024px 이상)은 왼쪽 열(문제 · 단추·판정 · 이번 판의 곳) | 오른쪽 틀 있는 큰 지도(캡션·범례 · 조작 안내),
// 좁은 화면은 문제 줄 → 지도(남은 높이) → 범례 한 줄 → 단추 띠. 판정 글과 [다음]은 단추 자리에 나오고 지도를 덮지 않는다
// (좁은 화면은 단추 띠가 위로 늘어나고 지도 칸이 줄어든다). 같은 DOM 을 CSS 가 두 배치로 놓는다(app.css).
// 답 하나는 core/session 의 step() 으로 판·숙달·오늘 푼 수에 함께 반영하고 곧바로 저장한다(문제마다 저장).
// 지도는 같은 지역이면 그대로 두고 상태만 바꾼다
import { current, manualNext, progress, type Answer, type Deck, type Summary } from '../core/deck.ts';
import { get } from '../core/mastery.ts';
import type { Question } from '../core/questions.ts';
import { step } from '../core/session.ts';
import { wrongInfo, type Tap } from '../core/judge.ts';
import { boxOf, type Box } from '../map/project.ts';
import type { Shapes } from '../map/shapes.ts';
import { createSvgMap, type SvgMap } from '../map/svgmap.ts';
import type { Pad } from '../map/view.ts';
import { L, placeName } from '../text/ui.ts';
import { fillsOf, type Ctx } from './ctx.ts';
import { track } from '../analytics.ts';
import { devLog } from '../devlog.ts';
import { ICON, esc } from './dom.ts';
import { STAGE_SCALE_MIN, insetPad, shapesOf } from './maps.ts';

export type Slot = 'lesson' | 'other' | 'check';
export interface PlayEnd { deck: Deck; finished: Summary; newly: string[] }
type Phase = 'ask' | 'met' | 'ok' | 'wrong' | 'dk' | 'fixed' | 'cok' | 'cno' | 'tok' | 'tno';

const AUTO_MS = 900, CHECK_MS = 600, MEET_MS = 700;
/** 넓은 화면 배치(왼쪽 열 | 지도)가 시작되는 폭 — app.css 의 분기와 같다 */
const WIDE_MQ = '(min-width: 1024px)';

export function mountPlay(root: HTMLElement, ctx: Ctx, slot: Slot, onEnd: (e: PlayEnd) => void, onExit: () => void) {
  root.innerHTML = `<div class="play">
    <header class="play-top"><div class="pt-in">
      <button class="pt-exit" type="button" data-pact="exit" aria-label="${esc(L.exitAria)}"><span class="pt-x">${ICON.close}</span><span class="pt-xt" aria-hidden="true">← ${esc(L.exitAria)}</span></button>
      <span class="pt-title"></span><span class="pn num"></span>
      <span class="h-bar pt-bar" aria-hidden="true"><i></i><b></b></span></div></header>
    <div class="play-body">
      <div class="play-left">
        <div class="pl-q"><p class="pl-eye"><span class="pl-mode"></span><span class="pl-title"></span></p><h1 class="play-q" aria-live="polite"></h1><p class="pl-note"></p></div>
        <div class="pl-opts" hidden></div>
        <div class="pl-act" aria-live="polite"></div>
        <section class="pl-list" aria-labelledby="pl-lh"><h2 class="pl-lh" id="pl-lh">${esc(L.sideAria)}</h2><div class="pl-scroll"><ul class="side-list"></ul><div class="pl-conf"></div></div></section>
      </div>
      <div class="play-right">
        <div class="pr-cap"><span class="pr-ct"></span><span class="legend pr-key" role="group" aria-label="${esc(L.legendAria)}"></span></div>
        <div class="play-stage"><div class="play-map"></div>
          <button class="map-reset" type="button" data-pact="reset" hidden>${esc(L.resetView)}</button>
          <div class="play-toast" role="status" hidden></div></div>
        <p class="pr-help"><span class="hm">${esc(L.mapHelp[0])}</span><span class="ht">${esc(L.mapHelp[1])}</span></p>
      </div>
    </div>
    <div class="scrim" hidden><div class="panel" role="dialog" aria-modal="true" aria-labelledby="pq">
      <h2 id="pq">${esc(L.exitQ)}</h2><p class="pq-t"></p>
      <div class="row"><button class="btn2 half" type="button" data-pact="stay">${esc(L.stay)}</button><button class="btn half" type="button" data-pact="leave">${esc(L.leave)}</button></div></div></div>
  </div>`;
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const ui = {
    play: $<HTMLElement>('.play'), left: $<HTMLElement>('.play-left'),
    barDone: $<HTMLElement>('.pt-bar i'), barNow: $<HTMLElement>('.pt-bar b'), pn: $<HTMLElement>('.pn'), title: $<HTMLElement>('.pt-title'),
    mode: $<HTMLElement>('.pl-mode'), eyeTitle: $<HTMLElement>('.pl-title'), band: $<HTMLElement>('.play-q'), note: $<HTMLElement>('.pl-note'),
    opts: $<HTMLElement>('.pl-opts'), act: $<HTMLElement>('.pl-act'),
    list: $<HTMLElement>('.side-list'), conf: $<HTMLElement>('.pl-conf'), scroll: $<HTMLElement>('.pl-scroll'),
    capTitle: $<HTMLElement>('.pr-ct'), key: $<HTMLElement>('.pr-key'), mapHost: $<HTMLElement>('.play-map'),
    reset: $<HTMLButtonElement>('.map-reset'), toast: $<HTMLElement>('.play-toast'), scrim: $<HTMLElement>('.scrim'),
  };

  const deckOf = (): Deck | null => (slot === 'lesson' ? ctx.lessonDeck : slot === 'other' ? ctx.otherDeck : ctx.checkDeck);
  const setDeck = (d: Deck | null) => {
    if (slot === 'lesson') ctx.lessonDeck = d;
    else if (slot === 'other') ctx.otherDeck = d;
    else ctx.checkDeck = d;
  };
  const nm = (id: string) => placeName(ctx.reg, id);

  let map: SvgMap | null = null;
  let shapes: Shapes | null = null;      // 지금 지도의 칸 모양(섬 상자 자리 고르기에 쓴다)
  let mapRegion: string | null = null;
  let q: Question | null = null;
  let qPos = 0, qTotal = 0;
  let phase: Phase = 'ask';
  let picked: string | null = null;
  let hintUsed = false;
  let scope: string[] = [];
  let fitBox: Box | null = null;          // 지금 문제의 기본 보기(과·화면 범위)
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

  /** 지금 문제의 지도 여백(show 가 문제마다 정한다). 판정 뒤 칸 보이기도 같은 여백을 쓴다 */
  let curPad: Pad = { t: 12, r: 12, b: 12, l: 12 };
  const pad = () => curPad;

  /**
   * 지도 여백과 섬 상자 자리. 판정 글은 지도 밖(왼쪽 열·아래 띠)에 있으니 네 변이 같다(넓은 화면 24, 좁은 화면 12).
   * 섬 상자(인천 먼 섬)가 보이면 고를 칸이 상자 밑에 깔리지 않게 상자 자리와 여백을 고른다(maps.ts insetPad — 둘러보기·쪽 지도와 같은 규칙)
   */
  function placeMap(): Pad {
    const m = matchMedia(WIDE_MQ).matches ? 24 : 12;
    const base: Pad = { t: m, r: m, b: m, l: m };
    return fitBox && shapes ? insetPad(ui.mapHost, shapes, fitBox, scope, base) : base;
  }

  /** 단추 띠가 바뀐 뒤(좁은 화면은 지도 칸 높이가 바뀌고 지도가 스스로 다시 맞춘다) 그 크기로 할 일 */
  function afterLayout(f: () => void) {
    const my = token;
    requestAnimationFrame(() => requestAnimationFrame(() => { if (alive && my === token) f(); }));
  }

  async function ensureMap(region: string) {
    if (map && mapRegion === region) return;
    const s = await shapesOf(ctx, region);
    if (!alive) return;
    map?.destroy();
    ui.mapHost.replaceChildren();
    mapRegion = region;
    shapes = s;
    map = createSvgMap(ui.mapHost, { shapes: s, interaction: 'full', contextNames: true, scaleBar: true, scaleMinWidth: STAGE_SCALE_MIN, ctxName: L.ctxName, insetNote: L.inset, onTap, onZoomed: (z) => { ui.reset.hidden = !z; } });
  }

  /* ---------- 문제 · 단추·판정 자리 ---------- */

  /** 판 제목: '서울 2과 · 한강 남쪽 동부' · '서울 전체 연습' · '서울 시험' · '오늘 복습' */
  function boardTitle(d: Deck): string {
    const r = d.region ? ctx.reg.region(d.region) : null;
    const l = r && d.lesson !== null ? ctx.reg.lesson(r.key, d.lesson) : null;
    return l ? `${L.region(r!)} ${L.lessonNo(l.no)} · ${L.lesson(l)}` : `${r ? `${L.region(r)} ` : ''}${L.kind[d.kind] ?? ''}`;
  }

  /**
   * 문제: 이름은 큰 글씨, 나머지는 작은 글씨(고르기는 이름 없이 한 문장). 문장은 text/ui.ts 의 promptParts(이어 붙이면 prompt).
   * 큰 이름이 길면(영어) 왼쪽 열 폭에 맞춰 줄인다: --n = 글자 폭 어림(한글 1, 그 밖 0.6 글자)
   */
  function band(): string {
    if (!q) return '';
    const p = L.promptParts(ctx.reg, q.mode, q.id);
    if (!p.big) return `<span class="pq-mid">${esc(p.post)}</span>`;
    const n = [...p.big].reduce((s, ch) => s + (ch.codePointAt(0)! >= 0x1100 ? 1 : 0.6), 0);
    return [p.pre && `<span class="pq-s">${esc(p.pre)}</span>`, `<span class="pq-big" style="--n:${n.toFixed(1)}">${esc(p.big)}</span>`, p.post && `<span class="pq-s">${esc(p.post)}</span>`].filter(Boolean).join(' ');
  }

  const nextBtn = () => `<button class="btn pl-next" type="button" data-pact="next">${esc(L.next)}</button>`;
  const title = (t: string) => `<p class="fb-title">${t}</p>`;
  const hintP = (t: string) => `<p class="fb-hint">${esc(t)}</p>`;

  /** 단추·판정 자리: 묻는 동안은 안내 + 단추, 답한 뒤는 판정 글 + [다음] */
  function actHtml(): string {
    if (!q) return '';
    const d = deckOf()!;
    const id = q.id, name = esc(nm(id));
    // 위치 한 줄(영어 화면에는 없음)
    const lineText = L.line(ctx.reg, id);
    const line = lineText ? `<p class="fb-line">${esc(lineText)}</p>` : '';
    if (q.mode === 'meet') {
      if (phase === 'ask') return `${line}${hintP(L.meetAct)}`;
      return `${title(`○ ${name}`)}${line}`;
    }
    if (q.mode === 'choose') {
      // 보기는 읽기 자리(aria-live) 밖의 .pl-opts 에 있다(paintOpts·markOpts). 여기에는 판정 글과 [다음]만
      if (phase === 'ask') return '';
      if (phase === 'cok') return `${title(`○ ${esc(L.right(ctx.reg, id, true))}`)}${line}${nextBtn()}`;
      const t = L.wrong(ctx.reg, wrongInfo(ctx.reg, id, picked!), true);
      return `${title(`✕ ${esc(t.title)}`)}<p class="fb-line">${esc(t.where)}</p>${hintP(t.act)}${nextBtn()}`;
    }
    if (phase === 'ask') {
      if (d.kind === 'check') return hintP(L.checkNote);
      if (q.pass) return hintP(L.quickNote);
      // 힌트 = 보조 단추(먹 테두리), 모르겠어요 = 밑줄 글자 단추(시안)
      return `<div class="pl-btns"><button class="btn2 pl-hint" type="button" data-pact="hint" ${hintUsed ? 'disabled' : ''}>${esc(hintUsed ? L.hintUsed : L.hint)}</button><button class="btn-text pl-dk" type="button" data-pact="dk">${esc(L.dontKnowBtn)}</button></div>`;
    }
    if (phase === 'tok') return title(`○ ${name}`);
    if (phase === 'tno') return title('✕');
    if (phase === 'ok') {
      if (manualNext(d, id)) return `${title(`○ ${esc(L.right(ctx.reg, id, true))}`)}${line}${nextBtn()}`;
      return `${title(`○ ${name}`)}${ctx.settings.autoNext ? `<p class="fb-note">${esc(L.autoNote)}</p>` : nextBtn()}`;
    }
    if (phase === 'wrong') {
      const t = L.wrong(ctx.reg, wrongInfo(ctx.reg, id, picked!), false);
      return `${title(`✕ ${esc(t.title)}`)}<p class="fb-line">${esc(t.where)}</p>${hintP(`○ ${t.act}`)}`;
    }
    if (phase === 'dk') { const t = L.dontKnow(ctx.reg, id); return `${title(esc(t.title))}${line}${hintP(t.act)}`; }
    if (phase === 'fixed') return `${title(`○ ${esc(L.fixed(ctx.reg, id))}`)}${line}${nextBtn()}`;
    return '';
  }

  /**
   * 고르기 보기: 읽기 자리(.pl-act, aria-live) 밖에 문제마다 한 번 그리고, 답한 뒤에는 다시 그리지 않고 상태만 바꾼다(markOpts).
   * 화면 읽기 프로그램이 보기 넷을 다시 읽지 않고 판정 글만 읽게 한다. data-pact='choose'·1~4 키는 그대로
   */
  function paintOpts() {
    const on = q?.mode === 'choose';
    ui.opts.hidden = !on;
    ui.opts.innerHTML = on
      ? `<div class="opts">${(q!.options ?? []).map((o, i) => `<button class="opt" type="button" data-pact="choose" data-arg="${o}"><span class="k" aria-hidden="true">${i + 1}</span><span class="sym"></span>${esc(nm(o))}</button>`).join('')}</div>`
      : '';
  }

  /** 답한 뒤 보기: 정답 = ○ + 굵은 테두리, 고른 오답 = ✕ + 점선, 나머지 = 흐리게(넓은 화면은 숨김, app.css) — 색 글자 없음 */
  function markOpts() {
    if (!q || q.mode !== 'choose') return;
    for (const b of ui.opts.querySelectorAll<HTMLButtonElement>('.opt')) {
      const o = b.dataset.arg!;
      const c = phase === 'ask' ? '' : o === q.id ? 'ok' : o === picked ? 'no' : 'off';
      b.className = c ? `opt ${c}` : 'opt';
      b.disabled = phase !== 'ask';
      b.querySelector('.sym')!.textContent = c === 'ok' ? '○ ' : c === 'no' ? '✕ ' : '';
    }
  }

  /** 단추·판정 자리의 단추(보기 포함)를 눌러 바뀐 것이면 그 단추의 data-pact. 바뀐 뒤 초점을 둘 곳을 정한다(setAct) */
  let focusFrom: string | null = null;

  function setAct(html: string) {
    ui.act.innerHTML = html;
    // 판정 글이 머무는 상태(.judged): 좁은 화면은 고르기 보기를 접고 낮은 폰은 범례 줄을 접는다.
    // 저절로 곧 넘어가는 상태 — 만나기 직후(0.7초)·시험 판정(0.6초)·자동 넘김을 켠 찾기 정답(0.9초) — 는 빼서 그 사이 배치가 출렁이지 않게
    const autoOk = phase === 'ok' && !!q && ctx.settings.autoNext && !manualNext(deckOf()!, q.id);
    ui.play.classList.toggle('judged', !['ask', 'met', 'tok', 'tno'].includes(phase) && !autoOk);
    paintSide();
    // 단추로 답했으면(키보드 Enter·마우스) 초점을 [다음]으로 — 눌렀던 단추가 지워지거나 막혀 초점이 몸통으로 사라지지 않게.
    // 힌트를 켜면 힌트 단추가 막히므로 '모르겠어요'로. 지도를 눌러 답한 경우는 옮기지 않는다
    if (focusFrom) {
      const to = phase !== 'ask' ? ui.act.querySelector<HTMLElement>('[data-pact="next"]') : focusFrom === 'hint' ? ui.act.querySelector<HTMLElement>('[data-pact="dk"]') : null;
      to?.focus({ preventScroll: true });
      focusFrom = null;
    }
    // 넓은 화면에서 왼쪽 열이 창보다 길면(낮은 창의 고르기 판정 등) 열만 스크롤해 [다음]이 보이게. 새 문제는 맨 위부터
    const col = ui.left;
    if (phase === 'ask') col.scrollTop = 0;
    else if (col.scrollHeight > col.clientHeight) {
      const nb = ui.act.querySelector<HTMLElement>('[data-pact="next"]') ?? ui.act.lastElementChild as HTMLElement | null;
      const r = nb?.getBoundingClientRect(), c = col.getBoundingClientRect();
      if (r && r.bottom > c.bottom) col.scrollTop += r.bottom - c.bottom + 8;
    }
  }

  /** 머리: 진행 막대(지난 문제 = 옅은 초록, 지금 문제 = 먹색) · '17 / 19 문제' · 판 제목 */
  function paintTop() {
    const d = deckOf();
    const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
    const done = qTotal ? qPos / qTotal : 0, now = qTotal ? 1 / qTotal : 0;
    ui.barDone.style.width = pct(done);
    ui.barNow.style.left = pct(done);
    ui.barNow.style.width = pct(now);
    ui.pn.innerHTML = `<b>${qPos + 1}</b> / ${qTotal}<span class="pn-u"> ${esc(L.qUnit)}</span>`;
    const t = d ? boardTitle(d) : '';
    ui.title.textContent = t;
    ui.eyeTitle.textContent = t;
    // 이번 판의 곳은 setAct 가 그린다(show 는 paintTop 다음에 setAct 를 부른다)
  }

  /**
   * 이번 판의 곳(넓은 화면 왼쪽 열 아래): 곳마다 ○ 맞힘 / ✕ 헷갈림 / 만남 / 아직 — 기호와 글(색 글자 없음). 지금 묻는 곳은 옅은 노랑 띠 + '지금 문제'.
   * 그리기는 폭과 상관없이 늘 하고 보이기만 CSS 가 정한다(창을 넓히거나 태블릿을 돌려도 비어 보이지 않게).
   * 긴 판(전체 연습·시험 25~31곳)은 목록만 스크롤하고 지금 문제 줄을 따라간다
   */
  function paintSide() {
    const d = deckOf();
    if (!d) return;
    const ids: string[] = [];
    for (const v of d.queue) if (!ids.includes(v.id)) ids.push(v.id);
    const met = new Set(d.queue.slice(0, d.pos).filter((v) => v.mode === 'meet').map((v) => v.id));
    const st = (id: string) => {
      const logs = d.log.filter((x) => x.id === id);
      if (logs.some((x) => x.result !== 'correct' || x.hint)) return ['no', L.st.no];
      if (logs.length) return ['ok', L.st.ok];
      return met.has(id) ? ['met', L.st.met] : ['', L.st.new];
    };
    const pairs: string[] = [];
    for (const x of d.log) if (x.result === 'wrong' && x.tapped) { const k = `${nm(x.id)} ↔ ${nm(x.tapped)}`; if (!pairs.includes(k)) pairs.push(k); }
    ui.list.innerHTML = ids.map((id) => {
      const [c, t] = st(id);
      const now = q?.id === id;
      return `<li class="${c}${now ? ' now' : ''}"${now ? ' aria-current="true"' : ''}><span>${esc(nm(id))}</span><span class="ls">${esc(now && phase === 'ask' ? L.stNow : t)}</span></li>`;
    }).join('');
    ui.conf.innerHTML = pairs.length ? `<h3 class="pl-lh">${esc(L.confused)}</h3><ul class="pl-pairs">${pairs.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '';
    const li = ui.list.querySelector<HTMLElement>('li.now');
    const u = ui.scroll;
    if (li && u.clientHeight) {
      if (li.offsetTop < u.scrollTop) u.scrollTop = li.offsetTop;
      else if (li.offsetTop + li.offsetHeight > u.scrollTop + u.clientHeight) u.scrollTop = li.offsetTop + li.offsetHeight - u.clientHeight;
    }
    fadeSide();
  }

  /** 목록 칸 아래에 더 있으면(.more) 바닥을 흐리게(app.css) — 마지막 줄이 반쯤 잘린 채 멈춘 것처럼 보이지 않게 */
  function fadeSide() {
    const u = ui.scroll;
    u.classList.toggle('more', u.clientHeight > 0 && u.scrollTop + u.clientHeight < u.scrollHeight - 2);
  }
  ui.scroll.addEventListener('scroll', fadeSide, { passive: true });
  const sideRo = typeof ResizeObserver === 'function' ? new ResizeObserver(fadeSide) : null;
  sideRo?.observe(ui.scroll);

  /**
   * 지도 캡션과 범례: 찾기 = 고를 칸, 만나기·고르기 = 테두리 친 칸. 과 판 = 이번 과 아님(오늘 복습 판은 '다른 과' — 머리가 '오늘 복습'이라),
   * 화면을 나눈 넓은 판 = 이번 화면 아님. 물이 있으면 한강
   */
  function paintKey(wide: boolean, split: boolean, review: boolean) {
    if (!q) return;
    ui.capTitle.textContent = L.mapCap(q.mode);
    const items: [string, string][] = [q.mode === 'find' ? ['pick', L.playKey.pick] : ['next', L.playKey.outlined]];
    if (!wide) items.push(['ctx', review ? L.playKey.ctxOther : L.playKey.ctxLesson]);
    else if (split) items.push(['ctx', L.playKey.ctxScreen]);
    if (ui.mapHost.querySelector('.cm-water')) items.push(['water', L.legendRiver]);
    ui.key.innerHTML = items.map(([s, t]) => `<span><i class="sw s-${s}" aria-hidden="true"></i>${esc(t)}</span>`).join('');
  }

  /* ---------- 문제 보이기 ---------- */

  async function show() {
    clearTimeout(timer);
    if (!alive) return;
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
    const split = wide && place.region.screens.length > 1;
    const newScreen = split && screenKey !== `${place.region.key}:${scr?.key}`;
    screenKey = wide ? `${place.region.key}:${scr?.key}` : null;
    await ensureMap(place.region.key);
    if (!alive || my !== token || !map) return;
    ui.band.innerHTML = band();
    ui.mode.textContent = L.modeLabel[q.mode] ?? '';
    // 찾기 안내 한 줄(넓은 화면, 묻는 동안만): 소리 내 읽는 자리(aria-live) 밖이라 문제마다 되풀이해 읽히지 않는다
    ui.note.textContent = q.mode === 'find' && d.kind !== 'check' && !q.pass ? L.findNote : '';
    paintTop();
    paintOpts();
    setAct(actHtml());
    map.clearMarks();
    map.setHint(null);
    // 고를 칸 묶음(과·화면)만 밝고 둘레가 굵다. 나머지는 바탕색·옅은 선(지도가 알아서 그린다)
    map.setActive(scope);
    // 이번 과 밖에서 이미 칠한 곳은 흐린 이름으로(길잡이). 지역 전체를 묻는 판에는 과 밖이 없다.
    // 길잡이는 칸 안에 들 때만 그린다: 영어는 짧은 이름('Jongno' — 과 카드와 같은 L.short)이라야 휴대폰 칸에 든다(한국어는 그대로)
    const f = fillsOf(ctx.mastery, place.region);
    const guide = L.lang === 'en' ? L.short : L.name;
    map.setDimLabels(wide ? [] : place.region.items.filter((it) => !scope.includes(it.id) && f[it.id] > 0).map((it) => ({ id: it.id, text: guide(it) })));
    paintKey(wide, split, d.kind === 'review');
    fitBox = boxOf(fit);
    curPad = placeMap();
    map.setHome(fitBox, curPad, map.isZoomed());
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
    if (!alive) return;
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

  /** 판정 뒤 이 칸들이 보이게(좁은 화면은 단추 띠가 늘어 지도 칸이 줄어든 뒤에 잰다) */
  const reveal = (ids: string[]) => afterLayout(() => map?.reveal(ids, pad()));

  function onTap(tap: Tap) {
    if (!q || !map || !ui.scrim.hidden) return;
    devLog('ans', { q: q.id, mode: q.mode, phase, tap: tap.type === 'cell' ? tap.id : tap.type });
    if (tap.type !== 'cell') return toast(L.tap(tap.type));
    const id = tap.id;
    const d = deckOf()!;
    if (phase === 'wrong' || phase === 'dk') {
      if (id === q.id) {
        phase = 'fixed';
        setAct(actHtml());
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
      setAct(actHtml());
      return after(MEET_MS);
    }
    if (q.mode === 'choose') return toast(L.useOptions);
    const isCheck = d.kind === 'check';
    if (id === q.id) {
      apply({ result: 'correct', hint: hintUsed });
      map.setHint(null);
      map.mark({ ok: q.id, pencil: !isCheck });
      if (isCheck) { phase = 'tok'; setAct(actHtml()); return after(CHECK_MS); }
      phase = 'ok';
      const manual = manualNext(deckOf()!, q.id);
      setAct(actHtml());
      reveal([q.id]);
      if (!manual && ctx.settings.autoNext) after(AUTO_MS);
      return;
    }
    picked = id;
    apply({ result: 'wrong', tapped: id, hint: hintUsed });
    map.setHint(null);
    if (isCheck) { phase = 'tno'; map.mark({ no: id }); setAct(actHtml()); return after(CHECK_MS); }
    phase = 'wrong';
    map.mark({ ok: q.id, no: id, arrow: true });
    setAct(actHtml());
    reveal([id, q.id]);
  }

  function choose(opt: string) {
    if (!alive || !q || q.mode !== 'choose' || phase !== 'ask' || !map) return;
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
      // 고른 보기가 이번 과 밖이면 지도에 ✕ 칸이 없다: 정답 칸은 '알려 주기'(노랑)로 — 안 주면 맞힌 칸(초록)으로 그린다
      map.mark(scope.includes(opt) ? { ok: q.id, no: opt, arrow: true } : { ok: q.id, tell: true });
    }
    markOpts();
    setAct(actHtml());
    reveal(phase === 'cno' && scope.includes(opt) ? [opt, q.id] : [q.id]);
  }

  function hint() {
    if (!alive || !q || !map || hintUsed || phase !== 'ask') return;
    // 시험과 바로 찾기(q.pass)에는 힌트 단추가 없다. H 키로도 켜지지 않게 같은 조건을 여기서 막는다
    if (deckOf()?.kind === 'check' || q.pass) return;
    hintUsed = true;
    const t = q.id;
    const near = scope.filter((v) => v !== t).sort((a, b) => ctx.reg.dist(t, a) - ctx.reg.dist(t, b)).slice(0, 2);
    map.setHint([t, ...near]);
    setAct(actHtml());
  }

  function dontKnow() {
    if (!alive || !q || !map || phase !== 'ask') return;
    apply({ result: 'dontknow' });
    phase = 'dk';
    map.setHint(null);
    map.mark({ ok: q.id, blink: true });
    setAct(actHtml());
    reveal([q.id]);
  }

  function askExit() {
    const d = deckOf();
    root.querySelector('.pq-t')!.textContent = d?.kind === 'check' ? L.exitCheck : L.exitSaved;
    ui.scrim.hidden = false;
    (root.querySelector('[data-pact="stay"]') as HTMLElement).focus();
  }

  // 수신기는 공용 #app 에 붙으므로 destroy 에서 꼭 뗀다(안 떼면 끝난 판의 수신기가 다음 판의 누름에 다시 답을 넣는다 — main 때부터 있던 결함)
  const onClick = (e: MouseEvent) => {
    if (!alive) return;
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-pact]');
    if (!b) return;
    const a = b.dataset.pact;
    // 단추·판정 자리(보기 포함)의 단추로 바뀌는 것이면 바뀐 뒤 초점을 옮긴다(setAct)
    focusFrom = (ui.act.contains(b) || ui.opts.contains(b)) && a !== 'next' ? a ?? null : null;
    if (a === 'exit') askExit();
    else if (a === 'stay') ui.scrim.hidden = true;
    else if (a === 'leave') { ui.scrim.hidden = true; if (slot === 'check') setDeck(null); onExit(); }
    else if (a === 'next') next();
    else if (a === 'hint') hint();
    else if (a === 'dk') dontKnow();
    else if (a === 'choose') choose(b.dataset.arg!);
    else if (a === 'reset') map?.resetView();
  };
  root.addEventListener('click', onClick);

  // 지도 칸의 폭이 바뀌면(창 크기·태블릿 회전 — 넓은·좁은 화면 경계를 넘는 것도) 지도 여백(24/12)과 섬 상자 자리를 바로 다시 정한다(다음 문제까지 기다리지 않게).
  // 높이만 바뀌는 것(좁은 화면에서 판정 띠가 늘고 줄 때)은 지도가 스스로 다시 맞추고 상자 자리는 그대로 둔다 — 한 문제 안에서 상자가 옮겨 다니지 않게
  let hostW = 0;
  const hostRo = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    const w = ui.mapHost.clientWidth;
    if (w === hostW) return;
    hostW = w;
    if (!map || !fitBox) return;
    curPad = placeMap();
    map.setPad(curPad, false);
  }) : null;
  hostRo?.observe(ui.mapHost);

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
      root.removeEventListener('click', onClick);
      clearTimeout(timer);
      clearTimeout(toastTimer);
      hostRo?.disconnect();
      sideRo?.disconnect();
      map?.destroy();
    },
  };
}
