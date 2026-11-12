// SVG 백지도: 그리기·확대·이동·판정 표시(설계서 5.2·5.3·3.5·3.6). 판정 규칙은 core/judge 가 정하고 여기서는 재서 넘긴다.
// 제스처·움직임 중에는 <svg> 에 CSS transform 만 걸고, 끝나면 viewBox 를 새로 넣어 선명하게 다시 그린다.
// 선 굵기는 non-scaling-stroke 로 화면 px 고정, 기호·이름표는 'px 묶음'(translate + scale(u))으로 화면 px 크기를 지킨다
import { AMBIGUOUS_ZOOM, classifyTap, type Tap } from '../core/judge.ts';
import { devLog } from '../devlog.ts';
import { unionBox, type Box } from './project.ts';
import { edgeDist, inside, probeAt, type Shapes } from './shapes.ts';
import { clampView, contains, cssBetween, fitView, toMap, viewBox, zoomAround, NO_PAD, type Pad, type Size, type View } from './view.ts';

const NS = 'http://www.w3.org/2000/svg';
/** 이만큼 넘게 움직여야 끌기로 본다(그 안이면 누름) */
export const DRAG_PX = 8;
const ZOOM_MS = 250;    // 모호 확대
const REVEAL_MS = 300;  // 판정 뒤 두 칸 보이게 다시 맞춤
const WHEEL_IDLE_MS = 160;
/** 내접원 지름이 이보다 크면 이름표를 칸 안에 넣는다(설계서 3.5) */
const LABEL_INSIDE_PX = 60;
/** 흐린 이름은 칸 지름이 이만큼 될 때만 */
const DIM_LABEL_PX = 36;
/** ↻ 복습 배지는 내접원 지름이 이만큼 되는 칸에만(설계서 3.7). 더 작은 칸은 지도 아래 목록으로 */
const BADGE_MIN_PX = 32;
/** 섬 상자(먼 섬) 최대 크기. 그 안을 누르면 이만큼 안의 가장 가까운 섬으로 본다 */
const INSET_MAX_W = 128, INSET_MAX_H = 112, INSET_SNAP_PX = 24;

export interface MapOptions {
  shapes: Shapes;
  /**
   * full = 누르기·끌기·집기·휠(문제·둘러보기), tap = 누르기만(쪽 스크롤을 막지 않음, 단원 채움 지도),
   * none = 그림만(홈 카드). 기본 full
   */
  interaction?: 'full' | 'tap' | 'none';
  /** 누름 판정 결과. 모호하면 지도가 스스로 2.5배 키운 뒤 알린다 */
  onTap?(tap: Tap, at: { px: number; py: number }): void;
  /** 확대·이동했는지('⤢ 전체 보기' 보이기) */
  onZoomed?(zoomed: boolean): void;
  /** 그리기가 끝날 때마다(성능 재기) */
  onCommit?(ms: number): void;
  /** 섬 상자 아래 글(축척이 다르다는 표시) */
  insetNote?: string;
  /** 이웃 땅·한강 이름을 흐리게 그린다(문제·둘러보기). 홈 카드처럼 작은 지도는 끈다 */
  contextNames?: boolean;
  /** 맥락 이름 바꾸기(영어 화면). sido 는 시도 코드, 한강은 'water' */
  ctxName?(sido: string, text: string): string;
}

export interface Marks {
  ok?: string;          // 정답 칸(파랑 채움·실선·○)
  no?: string;          // 누른 오답 칸(주홍 빗금·점선·✕)
  arrow?: boolean;      // 오답 → 정답 화살표
  blink?: boolean;      // 모르겠어요: 정답 칸 두 번 깜빡
  pencil?: boolean;     // 정답 칸 색연필 칠 효과
}

export interface SvgMap {
  el: HTMLElement;
  /** 지금 고를 수 있는 밝은 칸. null 이면 모든 칸 */
  setActive(ids: Iterable<string> | null): void;
  /** 과 바깥 굵은 선 */
  setRim(ids: Iterable<string> | null): void;
  /** 채움 지도: 곳 → 단계(0 아직 · 1 연두 · 2 초록 · 3 진초록). 값이 없는 칸과 null 은 공부 화면(빈 종이·흐린 칸) */
  setFills(levels: Record<string, number> | null): void;
  /** 문제 칸: 형광펜 노랑 + 먹 테두리. breathe = 처음 두 번 숨 쉬듯 */
  setQuestion(id: string | null, opt?: { breathe?: boolean }): void;
  /** 이름표(만나기·둘러보기). 칸이 작으면 짧은 지시선을 달아 위에. inside 면 모두 칸 안에(작은 칸은 작은 글자) */
  setLabels(labels: { id: string; text: string }[], opt?: { inside?: boolean }): void;
  /** 형광펜으로 칠할 칸(홈 카드·과 시작 카드에서 이번 과 곳). null 이면 풂 */
  setHighlight(ids: Iterable<string> | null): void;
  /** 힌트: 이 칸들만 남기고 흐리게. null 이면 풂 */
  setHint(ids: Iterable<string> | null): void;
  /** 흐린 이름(이번 과 밖의 이미 칠한 곳). 칸 지름이 작으면 빼고 그린다 */
  setDimLabels(labels: { id: string; text: string }[]): void;
  /** ↻ 복습 배지. 칸이 작아 달지 못한 곳을 돌려준다(지도 아래 '복습할 곳' 목록용) */
  setBadges(ids: string[]): string[];
  mark(m: Marks): void;
  clearMarks(): void;
  /** 기본 보기(과 범위)와 여백. 확대 한계·이동 범위도 이것 기준 */
  setHome(box: Box, pad?: Pad, animate?: boolean): void;
  /** 여백만 바꿈(시트 높이). 확대하지 않았으면 다시 맞춘다 */
  setPad(pad: Pad, animate?: boolean): void;
  /** 이 칸들이 여백 안에 다 보이게(더 키우지는 않음) */
  reveal(ids: string[], pad?: Pad): void;
  resetView(animate?: boolean): void;
  isZoomed(): boolean;
  /** 화면 px → 지도 단위 */
  unitsPerPx(): number;
  destroy(): void;
}

const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, parent?: Element): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  parent?.appendChild(e);
  return e;
};

let uid = 0;

export function createSvgMap(host: HTMLElement, opt: MapOptions): SvgMap {
  const S = opt.shapes;
  const id = `cm${++uid}`;
  host.classList.add('cmap');
  const svg = el('svg', { class: 'cmap-svg', 'aria-hidden': 'true', focusable: 'false' });
  host.appendChild(svg);

  const defs = el('defs', {}, svg);
  const hatch = el('pattern', { id: `${id}-hatch`, patternUnits: 'userSpaceOnUse', width: 6, height: 6 }, defs);
  el('path', { d: 'M-1 1L1 -1M0 6L6 0M5 7L7 5', class: 'cm-hatch-line' }, hatch);

  const gOut = el('g', { class: 'cm-out' }, svg);
  el('path', { d: S.outD, class: 'cm-out-fill' }, gOut);
  el('path', { d: S.outEdgeD, class: 'cm-out-edge' }, gOut);
  const gCells = el('g', { class: 'cm-cells' }, svg);
  const cellEl = new Map<string, SVGPathElement>();
  for (const cid of S.ids) {
    const p = el('path', { d: S.cells.get(cid)!.d, class: 'cm-cell' }, gCells);
    cellEl.set(cid, p);
  }
  el('path', { d: S.waterD, class: 'cm-water' }, svg);
  const edge = el('path', { d: S.edgeD, class: 'cm-edge' }, svg);
  el('path', { d: S.bankD, class: 'cm-bank' }, svg);
  el('path', { d: S.rimD, class: 'cm-rim' }, svg);
  const lessonRim = el('path', { d: '', class: 'cm-lesson-rim' }, svg);
  const gCtx = el('g', { class: 'cm-ctx' }, svg);
  const gState = el('g', { class: 'cm-state' }, svg);
  const gPx = el('g', { class: 'cm-px' }, svg);
  const gLab = el('g', { class: 'cm-labels' }, svg);
  const gBadge = el('g', { class: 'cm-badges' }, svg);

  // 섬 상자: 먼 섬(옹진 백령·대청·연평)을 귀퉁이에 따로 그린다(설계서 3.3). 축척이 본 지도와 다르다
  const inset = S.far ? (() => {
    const F = S.far;
    const m = Math.max(F.box[2] - F.box[0], F.box[3] - F.box[1]) * 0.12;
    const vb = [F.box[0] - m, F.box[1] - m, F.box[2] - F.box[0] + 2 * m, F.box[3] - F.box[1] + 2 * m];
    const k = Math.min(INSET_MAX_W / vb[2], INSET_MAX_H / vb[3]);   // 상자 px / 지도 단위
    const box = document.createElement('div');
    box.className = 'cm-inset';
    const isvg = el('svg', { class: 'cm-inset-svg', viewBox: vb.join(' '), width: Math.round(vb[2] * k), height: Math.round(vb[3] * k), 'aria-hidden': 'true' });
    box.appendChild(isvg);
    const paths = F.parts.map((p) => ({ id: p.id, rings: p.rings, el: el('path', { d: p.d, class: 'cm-cell' }, isvg) }));
    const note = document.createElement('span');
    note.className = 'cm-inset-note';
    note.textContent = opt.insetNote ?? '먼 섬 · 축척 다름';
    box.appendChild(note);
    host.appendChild(box);
    const stop = (e: Event) => e.stopPropagation();
    box.addEventListener('pointerdown', stop);
    box.addEventListener('wheel', stop);
    box.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      const r = isvg.getBoundingClientRect();
      const x = vb[0] + (e.clientX - r.left) / k, y = vb[1] + (e.clientY - r.top) / k;
      let best: string | null = null, bestD = INSET_SNAP_PX / k;
      for (const p of paths) {
        const d = inside(p.rings, x, y) ? 0 : edgeDist(p.rings, x, y);
        if (d <= bestD) { best = p.id; bestD = d; }
      }
      const h = host.getBoundingClientRect();
      opt.onTap?.(best && active.has(best) ? { type: 'cell', id: best } : { type: 'outside' }, { px: e.clientX - h.left, py: e.clientY - h.top });
    });
    return { box, paths };
  })() : null;

  /** 섬 상자: 공부할 칸에 먼 섬이 있거나 채움 지도일 때만 보이고, 칸 상태(문제·정답·오답·채움)를 본 지도와 같게 */
  function paintInset() {
    if (!inset) return;
    inset.box.hidden = !(fills || inset.paths.some((p) => active.has(p.id)));
    for (const p of inset.paths) {
      const cls = [fills ? `cm-cell lv${fills[p.id] ?? 0}` : active.has(p.id) ? 'cm-cell' : 'cm-cell ctx'];
      if (marks.no === p.id) cls.push('cm-no');
      else if (marks.ok === p.id) cls.push('cm-ok');
      else if (question === p.id) cls.push('cm-q');
      p.el.setAttribute('class', cls.join(' '));
    }
  }

  let active: Set<string> = new Set(S.ids);
  let fills: Record<string, number> | null = null;
  let hint: Set<string> | null = null;
  let highlight: Set<string> | null = null;
  let size: Size = { w: 1, h: 1 };
  let homeBox: Box = S.box;
  let pad: Pad = NO_PAD;
  let home: View = { cx: 0, cy: 0, u: 1 };
  let rendered: View = home;   // viewBox 에 들어 있는 보기
  let shown: View = home;      // 눈에 보이는 보기(rendered + CSS transform)
  let anim: { timer: number; to: View } | null = null;
  let zoomedFlag = false;
  // px 묶음: 지도 점에 화면 px 크기로 붙는 것들(○·✕·화살표 머리·이름표)
  let pxItems: { g: SVGGElement; x: number; y: number }[] = [];
  let question: string | null = null;
  let breathe = false;
  let marks: Marks = {};
  let labels: { id: string; text: string }[] = [];
  let labelsInside = false;
  let badges: string[] = [];
  let dimLabels: { id: string; text: string }[] = [];

  const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const measure = () => {
    const r = host.getBoundingClientRect();
    size = { w: Math.max(1, r.width), h: Math.max(1, r.height) };
  };
  const clamp = (v: View) => clampView(v, home, homeBox);

  function paintCells() {
    for (const [cid, p] of cellEl) {
      const lv = fills && cid in fills ? fills[cid] : null;   // 채움 값이 없는 칸은 공부 화면처럼(밝은 칸·흐린 칸)
      const cls = ['cm-cell'];
      if (lv !== null) cls.push(`lv${lv}`);
      else if (!active.has(cid)) cls.push('ctx');
      if (highlight?.has(cid)) cls.push('hl');
      if (hint && !hint.has(cid)) cls.push('dim');
      p.setAttribute('class', cls.join(' '));
    }
    edge.setAttribute('class', fills ? 'cm-edge gap' : 'cm-edge');
    paintInset();
  }

  /* ---------- 보기 ---------- */

  function show(v: View) {
    shown = v;
    const { k, tx, ty } = cssBetween(rendered, v, size);
    svg.style.transform = Math.abs(k - 1) < 1e-9 && Math.abs(tx) < 0.01 && Math.abs(ty) < 0.01 ? '' : `translate(${tx}px, ${ty}px) scale(${k})`;
  }

  function commit(v: View) {
    const t0 = performance.now();
    rendered = shown = v;
    const [x, y, w, h] = viewBox(v, size);
    svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
    svg.style.transition = '';
    svg.style.transform = '';
    hatch.setAttribute('patternTransform', `rotate(0) scale(${v.u})`);
    for (const it of pxItems) it.g.setAttribute('transform', `translate(${it.x} ${it.y}) scale(${v.u})`);
    if (labels.length) drawLabels();   // 칸 안·지시선 중 고르기는 배율에 따라 달라진다
    if (badges.length) drawBadges();
    if (opt.contextNames || dimLabels.length) drawContext();
    const z = Math.abs(v.u / home.u - 1) > 0.03 || Math.hypot(v.cx - home.cx, v.cy - home.cy) / v.u > 12;
    if (z !== zoomedFlag) {
      zoomedFlag = z;
      opt.onZoomed?.(z);
    }
    opt.onCommit?.(performance.now() - t0);
  }

  function finishAnim() {
    if (!anim) return;
    clearTimeout(anim.timer);
    const to = anim.to;
    anim = null;
    commit(to);
  }

  function animateTo(v: View, ms: number) {
    finishAnim();
    if (ms <= 0 || reduced()) return commit(v);
    svg.style.transition = `transform ${ms}ms cubic-bezier(.2,.7,.3,1)`;
    show(v);
    anim = { to: v, timer: window.setTimeout(() => { anim = null; commit(v); }, ms + 30) };
  }

  /* ---------- 상태 겹층·기호 ---------- */

  const cellPath = (cid: string, cls: string) => el('path', { d: S.cells.get(cid)!.d, class: cls }, gState);

  function pxGroup(x: number, y: number, cls: string, parent: SVGGElement = gPx) {
    const g = el('g', { class: cls, transform: `translate(${x} ${y}) scale(${rendered.u})` }, parent);
    pxItems.push({ g, x, y });
    return g;
  }
  const dropPx = (parent: SVGGElement) => {
    pxItems = pxItems.filter((it) => it.g.parentNode !== parent);
    parent.replaceChildren();
  };

  /** 문제 칸·정답·오답·기호·화살표. 다시 그리면 칠 효과·깜빡임이 처음부터 돈다 */
  function redrawState() {
    gState.replaceChildren();
    dropPx(gPx);
    if (question) cellPath(question, `cm-q${breathe && !(marks.ok || marks.no) ? ' breathe' : ''}`);
    if (marks.no) {
      cellPath(marks.no, 'cm-no');
      cellPath(marks.no, 'cm-no-hatch').setAttribute('fill', `url(#${id}-hatch)`);
    }
    if (marks.ok) cellPath(marks.ok, `cm-ok${marks.pencil ? ' pencil' : ''}${marks.blink ? ' blink' : ''}`);
    if (marks.no && marks.ok && marks.arrow) drawArrow(marks.no, marks.ok);
    if (marks.no) symbol(marks.no, 'no');
    if (marks.ok) symbol(marks.ok, 'ok');
    paintInset();
  }

  /** 맥락 이름(이웃 땅·한강)과 흐린 이름(이미 칠한 곳) */
  function drawContext() {
    dropPx(gCtx);
    if (opt.contextNames) for (const n of S.names) el('text', { x: 0, y: 4, 'text-anchor': 'middle' }, pxGroup(n.x, n.y, `cm-ctxname ${n.kind}`, gCtx)).textContent = opt.ctxName ? opt.ctxName(n.sido, n.text) : n.text;
    for (const l of dimLabels) {
      const c = S.cells.get(l.id);
      if (!c || (2 * c.r) / rendered.u < DIM_LABEL_PX) continue;
      el('text', { x: 0, y: 4, 'text-anchor': 'middle' }, pxGroup(c.label[0], c.label[1], 'cm-ctxname cell', gCtx)).textContent = l.text;
    }
  }

  /** ↻ 배지: 이름표 점 오른쪽 위. 작은 칸은 빼고 그 목록을 돌려준다 */
  function drawBadges(): string[] {
    dropPx(gBadge);
    const skipped: string[] = [];
    for (const bid of badges) {
      const c = S.cells.get(bid);
      if (!c) continue;
      if ((2 * c.r) / rendered.u < BADGE_MIN_PX) { skipped.push(bid); continue; }
      const g = pxGroup(c.label[0], c.label[1], 'cm-badge', gBadge);
      el('circle', { cx: 0, cy: 0, r: 10 }, g);
      el('path', { d: 'M4.2 -1.6A4.6 4.6 0 1 0 3.2 3.3M4.6 -5.2L4.4 -1.4L0.7 -2', class: 'cm-badge-arrow' }, g);
    }
    return skipped;
  }

  /** 이름표: 칸이 크면 칸 안, 작으면 짧은 지시선 위 */
  function drawLabels() {
    dropPx(gLab);
    for (const l of labels) {
      const c = S.cells.get(l.id);
      if (!c) continue;
      const dPx = (2 * c.r) / rendered.u;
      if (labelsInside) {
        // 모든 이름(둘러보기): 칸 크기에 따라 글자 크기만 바꾼다. 너무 작은 칸은 확대하면 나온다
        if (dPx < 14) continue;
        const g = pxGroup(c.label[0], c.label[1], `cm-label ${dPx >= LABEL_INSIDE_PX ? '' : 'sm'}`, gLab);
        el('text', { x: 0, y: dPx >= LABEL_INSIDE_PX ? 5 : 4, 'text-anchor': 'middle' }, g).textContent = l.text;
        continue;
      }
      const g = pxGroup(c.label[0], c.label[1], 'cm-label', gLab);
      if (dPx >= LABEL_INSIDE_PX) {
        el('text', { x: 0, y: 5, 'text-anchor': 'middle' }, g).textContent = l.text;
      } else {
        el('path', { d: 'M0 0L0 -22', class: 'cm-leader' }, g);
        el('circle', { r: 2.5, class: 'cm-leader-dot' }, g);
        el('text', { x: 0, y: -28, 'text-anchor': 'middle' }, g).textContent = l.text;
      }
    }
  }

  function symbol(cid: string, kind: 'ok' | 'no') {
    const c = S.cells.get(cid)!;
    const g = pxGroup(c.label[0], c.label[1], `cm-sym ${kind}`);
    el('circle', { r: 13, class: 'cm-sym-bg' }, g);
    if (kind === 'ok') el('circle', { r: 8.5, class: 'cm-sym-ok' }, g);
    else el('path', { d: 'M-6.5 -6.5L6.5 6.5M6.5 -6.5L-6.5 6.5', class: 'cm-sym-no' }, g);
  }

  /** 오답 → 정답: 몸통은 지도 단위(굵기는 화면 고정), 머리는 px 묶음. 양 끝은 기호에 걸리지 않게 18px 줄인다 */
  function drawArrow(from: string, to: string) {
    const a = S.cells.get(from)!.label, b = S.cells.get(to)!.label;
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    const cut = 18 * rendered.u;
    if (len < cut * 2.5) return;
    const ux = dx / len, uy = dy / len;
    const s = [a[0] + ux * cut, a[1] + uy * cut], e = [b[0] - ux * cut, b[1] - uy * cut];
    el('path', { d: `M${s[0]} ${s[1]}L${e[0]} ${e[1]}`, class: 'cm-arrow' }, gState);
    const g = pxGroup(e[0], e[1], 'cm-arrow-head');
    const deg = Math.atan2(uy, ux) * 180 / Math.PI;
    el('path', { d: 'M0 0L-11 -6L-11 6Z', transform: `rotate(${deg})` }, g);
  }

  /* ---------- 누름·끌기·집기 ---------- */

  const pointers = new Map<number, { x: number; y: number }>();
  let g: null | { kind: 'tap' | 'drag' | 'pinch'; start: View; p0: { x: number; y: number }; d0: number } = null;
  const local = (e: PointerEvent | WheelEvent) => {
    const r = host.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const two = () => {
    const [p, q] = [...pointers.values()];
    return { mid: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, d: Math.max(1, Math.hypot(p.x - q.x, p.y - q.y)) };
  };

  function onDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (anim) finishAnim();
    try { host.setPointerCapture(e.pointerId); } catch { /* 이미 끝난 포인터 등 — 붙잡지 못해도 판정은 돈다 */ }
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 1) g = { kind: 'tap', start: shown, p0: local(e), d0: 0 };
    else if (pointers.size === 2) {
      const t = two();
      g = { kind: 'pinch', start: shown, p0: t.mid, d0: t.d };
    }
  }

  function onMove(e: PointerEvent) {
    if (!pointers.has(e.pointerId) || !g) return;
    pointers.set(e.pointerId, local(e));
    if (g.kind === 'pinch' && pointers.size >= 2) {
      const t = two();
      const z = zoomAround(g.start, size, g.p0.x, g.p0.y, t.d / g.d0);
      show(clamp({ cx: z.cx - (t.mid.x - g.p0.x) * z.u, cy: z.cy - (t.mid.y - g.p0.y) * z.u, u: z.u }));
      return;
    }
    const p = local(e);
    if (g.kind === 'tap' && Math.hypot(p.x - g.p0.x, p.y - g.p0.y) > DRAG_PX) g.kind = 'drag';
    if (g.kind === 'drag') show(clamp({ cx: g.start.cx - (p.x - g.p0.x) * g.start.u, cy: g.start.cy - (p.y - g.p0.y) * g.start.u, u: g.start.u }));
  }

  function onUp(e: PointerEvent, cancel = false) {
    if (!pointers.has(e.pointerId)) return;
    const p = local(e);
    pointers.delete(e.pointerId);
    if (!g) return;
    if (g.kind === 'tap') {
      g = null;
      if (!cancel) tapAt(p.x, p.y);
      return;
    }
    if (g.kind === 'pinch' && pointers.size === 1) {
      // 한 손가락이 남으면 끌기로 이어 간다
      const [rest] = [...pointers.values()];
      g = { kind: 'drag', start: shown, p0: rest, d0: 0 };
      return;
    }
    if (pointers.size === 0) {
      g = null;
      commit(shown);
    }
  }

  let wheelTimer = 0;
  function onWheel(e: WheelEvent) {
    e.preventDefault();
    if (anim) finishAnim();
    const p = local(e);
    const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
    show(clamp(zoomAround(shown, size, p.x, p.y, factor)));
    clearTimeout(wheelTimer);
    wheelTimer = window.setTimeout(() => commit(shown), WHEEL_IDLE_MS);
  }

  function tapAt(px: number, py: number) {
    const [x, y] = toMap(shown, size, px, py);
    const probe = probeAt(S, x, y, shown.u, active);
    const tap = classifyTap(probe, active);
    devLog('tap', { type: tap.type, hit: probe.hit, depth: Math.round(probe.depth), near: probe.near, w: size.w, h: size.h });
    if (tap.type === 'ambiguous') animateTo(clamp(zoomAround(shown, size, px, py, AMBIGUOUS_ZOOM)), ZOOM_MS);
    opt.onTap?.(tap, { px, py });
  }

  const interaction = opt.interaction ?? 'full';
  if (interaction === 'full') {
    host.addEventListener('pointerdown', onDown);
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerup', (e) => onUp(e));
    host.addEventListener('pointercancel', (e) => onUp(e, true));
    host.addEventListener('wheel', onWheel, { passive: false });
  } else {
    host.classList.add(interaction === 'tap' ? 'tap-only' : 'static');
    // 누르기만: 쪽 스크롤은 브라우저에 맡기고, 끝난 누름(click)만 칸으로 본다. 모호해도 확대하지 않고 품은 칸으로
    if (interaction === 'tap') host.addEventListener('click', (e) => {
      const p = local(e as unknown as PointerEvent);
      const [x, y] = toMap(shown, size, p.x, p.y);
      const pr = probeAt(S, x, y, shown.u, active);
      opt.onTap?.(pr.hit && active.has(pr.hit) ? { type: 'cell', id: pr.hit } : { type: 'outside' }, { px: p.x, py: p.y });
    });
  }

  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    const before = size;
    measure();
    if (before.w === size.w && before.h === size.h) return;
    const z = zoomedFlag;
    home = fitView(homeBox, size, pad);
    commit(z ? clamp(shown) : home);
  }) : null;
  ro?.observe(host);

  measure();
  home = fitView(homeBox, size, pad);
  commit(home);
  paintCells();

  /* ---------- 바깥에 여는 것 ---------- */

  return {
    el: host,
    setActive(ids) {
      active = new Set(ids ?? S.ids);
      paintCells();
    },
    setRim(ids) {
      lessonRim.setAttribute('d', ids ? S.rimOf(new Set(ids)) : '');
    },
    setFills(levels) {
      fills = levels;
      paintCells();
    },
    setQuestion(qid, o) {
      question = qid;
      breathe = !!o?.breathe && !reduced();
      redrawState();
    },
    setLabels(list, o) {
      labels = list;
      labelsInside = !!o?.inside;
      drawLabels();
    },
    setHint(ids) {
      hint = ids ? new Set(ids) : null;
      paintCells();
    },
    setHighlight(ids) {
      highlight = ids ? new Set(ids) : null;
      paintCells();
    },
    setBadges(ids) {
      badges = ids;
      return drawBadges();
    },
    setDimLabels(list) {
      dimLabels = list;
      drawContext();
    },
    mark(m) {
      marks = m;
      redrawState();
    },
    clearMarks() {
      marks = {};
      redrawState();
    },
    setHome(box, p = pad, animate = false) {
      homeBox = box;
      pad = p;
      home = fitView(box, size, pad);
      if (animate) animateTo(home, REVEAL_MS);
      else {
        finishAnim();
        commit(home);
      }
    },
    setPad(p, animate = true) {
      pad = p;
      const was = zoomedFlag;
      home = fitView(homeBox, size, pad);
      if (!was) animateTo(home, animate ? REVEAL_MS : 0);
    },
    reveal(ids, p = pad) {
      const boxes = ids.map((cid) => S.cells.get(cid)).filter(Boolean).map((c): Box => [c!.label[0] - c!.r, c!.label[1] - c!.r, c!.label[0] + c!.r, c!.label[1] + c!.r]);
      if (!boxes.length) return;
      const box = boxes.reduce(unionBox);
      if (contains(shown, size, box, p)) return;
      animateTo(clamp(fitView(box, size, p, shown.u)), REVEAL_MS);
    },
    resetView(animate = true) {
      animateTo(home, animate ? REVEAL_MS : 0);
    },
    isZoomed: () => zoomedFlag,
    unitsPerPx: () => shown.u,
    destroy() {
      finishAnim();
      ro?.disconnect();
      clearTimeout(wheelTimer);
      host.replaceChildren();
      host.classList.remove('cmap');
    },
  };
}

