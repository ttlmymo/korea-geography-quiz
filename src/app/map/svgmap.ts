// SVG 백지도: 그리기·확대·이동·판정 표시(설계서 5.2·5.3·3.5·3.6, 모양은 합본 디자인 — docs/REDESIGN_PLAN 3.1).
// 판정 규칙은 core/judge 가 정하고 여기서는 재서 넘긴다.
// 제스처·움직임 중에는 <svg> 에 CSS transform 만 걸고, 끝나면 viewBox 를 새로 넣어 선명하게 다시 그린다.
// 선 굵기는 non-scaling-stroke 로 화면 px 고정, 기호·이름표는 'px 묶음'(translate + scale(u))으로 화면 px 크기를 지킨다.
// 선은 칸마다 그리지 않는다: 칸 경계·외곽선·과 안 경계·묶음 둘레·굵은 테두리가 저마다 메쉬 path 하나다(동 단위 수백 칸에서도 가볍게)
import { AMBIGUOUS_ZOOM, classifyTap, type Tap } from '../core/judge.ts';
import { devLog } from '../devlog.ts';
import { fitBox, labelBox, placeInside, placeOutside, scaleStep, textWidth, type InsideResult, type LabelMode, type Obstacle, type Placed } from './labelfit.ts';
import { boxHits } from './poly.ts';
import { unionBox, type Box } from './project.ts';
import { edgeDist, inside, probeAt, type Shapes } from './shapes.ts';
import { clampView, contains, cssBetween, fitView, toMap, viewBox, zoomAround, NO_PAD, type Pad, type Size, type View } from './view.ts';

const NS = 'http://www.w3.org/2000/svg';
/** 이만큼 넘게 움직여야 끌기로 본다(그 안이면 누름) */
export const DRAG_PX = 8;
const ZOOM_MS = 250;    // 모호 확대
const REVEAL_MS = 300;  // 판정 뒤 두 칸 보이게 다시 맞춤
const WHEEL_IDLE_MS = 160;
/** 지도 칸이 이보다 좁으면(휴대폰) 축척 막대와 'fit' 이름표(홈 지도)를 그리지 않는다 */
export const COMPACT_PX = 560;
/** 복습 점: 반지름 4~7px(칸 크기에 맞춤). 내접원 지름이 이보다 작은 칸은 달지 않고 그 목록을 돌려준다 */
const BADGE_MIN_PX = 12, BADGE_R = 7;
/** 칸 안에 글자가 안 드는 길잡이 이름을 이름표 점에 둘 수 있는 가장 작은 칸(내접원 지름 px). main 때와 같은 값 */
const DIM_LABEL_PX = 36;
/**
 * 강 띠가 화면에서 이보다 좁게 그려지면 강가를 가는 선으로 낮춘다(굵은 선 두 줄이 강을 덮어 검은 줄이 되지 않게 — 경기 전체 보기 등).
 * 굵은 선 두 줄(4.4px)을 빼고도 물색이 8px 넘게 남는 폭
 */
const BANK_MIN_PX = 13;
/** 화면을 가리는 것(시트)이 있다고 보는 아래 여백: 이보다 크면 축척 막대를 그 위로 올린다(scaleLift 일 때만) */
const COVER_PX = 28;
/** 기호(○ ✕)의 흰 바탕 반지름 */
const SYM_R = 13;
/** 맥락 이름 글자 크기 · 강 이름의 자간(em, map.css 와 같게) · 강 이름을 강 따라 옮기는 가장 먼 거리(px) */
const CTX_PX = 14, WATER_SPACING = 0.3, WATER_REACH_PX = 160;
/** 강이 지역 밖으로 흐르는 물가로 보는 거리(m): 칸 경계에서 이만큼 넘게 떨어진 강 띠 꼭짓점 */
const SHORE_M = 300;
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
  /**
   * 축척 막대(오른쪽 아래). 길이는 100m~100km 의 1·2·5 단계 가운데 막대가 60~120px 가 되는 값(서울 1과 2km · 서울 전체 5km · 경기 전체 20km · 크게 키우면 500m 등).
   * 지도 칸이 scaleMinWidth(기본 COMPACT_PX)보다 좁으면 숨는다
   */
  scaleBar?: boolean;
  /** 축척 막대를 그리는 가장 좁은 지도 칸 폭(px). 기본 COMPACT_PX. 문제 화면·둘러보기는 1024 폭(지도 칸 약 540)에서도 막대를 두려고 낮춘다 */
  scaleMinWidth?: number;
  /**
   * 아래 여백이 COVER_PX 보다 크면 그만큼 지도를 덮는 것(시트)이 있다고 보고 축척 막대를 그 위로 올린다(실험실 /lab/map 의 시트).
   * 앱 화면에는 지도를 덮는 시트가 없어 끈다 — 섬 상자를 왼쪽 아래에 두려고 아래 여백을 넓혀도 막대는 오른쪽 아래에 있다
   */
  scaleLift?: boolean;
}

export interface Marks {
  ok?: string;          // 정답 칸: 맞혔으면 초록 + 굵은 테두리 + ○, 알려 주는 자리(tell)면 노랑 + 굵은 테두리 + ○
  no?: string;          // 잘못 누른 칸(옅은 산호 + ✕)
  arrow?: boolean;      // 오답 → 정답 화살표(먹색)
  blink?: boolean;      // 모르겠어요: 정답 칸 두 번 깜빡
  pencil?: boolean;     // 정답 칸 색연필 칠 효과
  /**
   * 정답 칸이 '맞힌 칸'(초록)이 아니라 '정답 자리 알려 주기'(노랑)인가. 안 주면 no 나 blink 가 있을 때 그렇게 본다.
   * no·blink 없이 알려 줄 때(고르기에서 과 밖 보기를 골라 틀렸을 때 등)는 꼭 tell: true 를 준다 — 안 주면 맞힌 칸으로 그린다
   */
  tell?: boolean;
}

/** 이름표 하나. tone 을 안 주면 칸 색으로 정한다(다 익힌 칸 위 = white, 그 밖 = ink) */
export interface MapLabel { id: string; text: string; tone?: 'ink' | 'white' }

export interface LabelOpt {
  /**
   * must(기본) = 꼭 보인다: 칸 안 → 칸 밖 빈 바탕 + 지시선 → 칸 옆 흰 판 + 지시선(만나기·과 시작·요약·시험 결과·둘러보기에서 이름 가리기 중 누른 칸).
   * fit = 자리가 있을 때만: 칸 안 → 칸 밖 빈 바탕 + 지시선 → 뺀다(홈·단원 지도, 둘러보기).
   * inside = 칸 안에 드는 것만(지금 화면에서는 쓰지 않는다).
   * 어느 방식이든 지도 칸이 minWidth 보다 좁으면 모두 뺀다
   */
  mode?: LabelMode;
  /** 이름표를 그리는 가장 좁은 지도 칸 폭(px). 기본은 fit 이면 COMPACT_PX(휴대폰 홈 지도에는 이름표 없음), 그 밖은 0(늘 그린다) */
  minWidth?: number;
}

export interface SvgMap {
  el: HTMLElement;
  /** 지금 고를 수 있는 밝은 칸. null 이면 모든 칸. 일부만 밝으면(과 판) 나머지는 바탕색·옅은 선으로 낮추고 밝은 묶음 둘레를 굵게 긋는다 */
  setActive(ids: Iterable<string> | null): void;
  /** 묶음 둘레 굵은 선(강가 포함). 모든 칸이 밝은 지도에서 과 하나를 두를 때 쓴다 — 과 판의 밝은 묶음 둘레는 저절로 굵다 */
  setRim(ids: Iterable<string> | null): void;
  /** 칸마다 굵은 테두리(다음 과·복습할 칸). 칸끼리 경계도 굵어진다. null 이면 풂 */
  setBold(ids: Iterable<string> | null): void;
  /** 채움 지도: 곳 → 단계(0 아직 · 1~2 익히는 중 · 3 다 익힘). 값이 없는 칸과 null 은 공부 화면(흰 칸·바탕색 칸) */
  setFills(levels: Record<string, number> | null): void;
  /** 문제 칸: 노랑 + 굵은 먹 테두리. breathe = 처음 두 번 숨 쉬듯 */
  setQuestion(id: string | null, opt?: { breathe?: boolean }): void;
  /** 이름표. 14px 이상·후광 없음. 글자 상자가 칸 안에 드는 자리를 찾고, 안 들어갈 때는 mode 에 따라 칸 밖(지시선)에 두거나 뺀다 */
  setLabels(labels: MapLabel[], opt?: LabelOpt): void;
  /** 노랑으로 칠할 칸(홈·과 시작에서 다음 과·이번 과). null 이면 풂. 테두리는 setBold 로 따로 */
  setHighlight(ids: Iterable<string> | null): void;
  /** 힌트: 이 칸들만 남기고 흐리게. null 이면 풂 */
  setHint(ids: Iterable<string> | null): void;
  /** 흐린 이름(이번 과 밖의 이미 칠한 곳). 글자가 칸 안에 들 때만 그린다 */
  setDimLabels(labels: { id: string; text: string }[]): void;
  /** 복습할 곳의 먹색 점(흰 테두리). 칸이 너무 작아 달지 못한 곳을 돌려준다 */
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

/** 이름표 글자 크기(px): 지도 칸이 넓으면 조금 크게. 14px 아래로는 내려가지 않는다 */
export const labelPx = (w: number) => (w >= 900 ? 16 : w >= 640 ? 15 : 14);
/** 글자 가운데를 점에 맞추는 기준선 내림(px): 한글은 글자 상자를 꽉 채우고, 라틴 글자는 아래로 내려 쓰는 획(g·p)이 있어 덜 내린다 */
const baseline = (text: string, px: number) => Math.round(px * ([...text].some((ch) => ch.codePointAt(0)! >= 0x1100) ? 0.36 : 0.28));

export function createSvgMap(host: HTMLElement, opt: MapOptions): SvgMap {
  const S = opt.shapes;
  host.classList.add('cmap');
  const svg = el('svg', { class: 'cmap-svg', 'aria-hidden': 'true', focusable: 'false' });
  host.appendChild(svg);

  // 층(아래→위): 이웃 땅 → 칸 채움 → 한강 → 칸 경계 → 강가·외곽선 → (과 판) 과 안 경계·밝은 묶음 둘레 → 묶음 둘레 → 굵은 테두리
  //             → 맥락 이름 → 문제 칸·판정 겹층 → 화살표 머리 → 기호 → 이름표 → 복습 점
  // 묶음의 둘레·굵은 테두리는 강가(-bank)를 따로 긋는다: 강이 좁게 보이는 보기(.thin-bank)에서 강가만 가는 선으로 낮추려고
  // 이웃 땅은 바탕과 같은 면색으로만 깐다(이웃끼리 경계는 그리지 않는다 — 색은 지도 칸에만)
  const gOut = el('g', { class: 'cm-out' }, svg);
  el('path', { d: S.outD, class: 'cm-out-fill' }, gOut);
  const gCells = el('g', { class: 'cm-cells' }, svg);
  const cellEl = new Map<string, SVGPathElement>();
  for (const cid of S.ids) {
    const p = el('path', { d: S.cells.get(cid)!.d, class: 'cm-cell' }, gCells);
    cellEl.set(cid, p);
  }
  // 물색은 지역 안의 물에만: 칸과 맞닿지 않는 강(인천 지도 구석의 한강)은 그리지 않는다(바탕색 그대로)
  const river = S.bankD !== '';
  if (river) el('path', { d: S.waterD, class: 'cm-water' }, svg);
  el('path', { d: S.edgeD, class: 'cm-edge' }, svg);
  el('path', { d: S.bankD, class: 'cm-bank' }, svg);
  el('path', { d: S.rimD, class: 'cm-rim' }, svg);
  const innerEl = el('path', { d: '', class: 'cm-inner' }, svg);
  const partRim = el('path', { d: '', class: 'cm-part-rim' }, svg);
  const partBank = el('path', { d: '', class: 'cm-part-rim cm-set-bank' }, svg);
  const lessonRim = el('path', { d: '', class: 'cm-lesson-rim' }, svg);
  const lessonBank = el('path', { d: '', class: 'cm-lesson-rim cm-set-bank' }, svg);
  const boldEl = el('path', { d: '', class: 'cm-bold' }, svg);
  const boldBank = el('path', { d: '', class: 'cm-bold cm-set-bank' }, svg);
  const gCtx = el('g', { class: 'cm-ctx' }, svg);
  const gState = el('g', { class: 'cm-state' }, svg);
  const gPx = el('g', { class: 'cm-px' }, svg);
  const gSym = el('g', { class: 'cm-px cm-syms' }, svg);
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
    box.setAttribute('aria-hidden', 'true');   // 그림의 일부: 보조 기술에는 지도 칸의 설명(aria-label)만 읽힌다
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

  // 축척 막대: 지도 위에 얹는 글 + 막대(길이는 그릴 때마다 맞춘다)
  const scale = opt.scaleBar ? (() => {
    const box = document.createElement('div');
    box.className = 'cm-scale';
    box.setAttribute('aria-hidden', 'true');
    box.hidden = true;
    const text = document.createElement('span');
    const bar = document.createElement('i');
    box.append(text, bar);
    host.appendChild(box);
    return { box, text, bar };
  })() : null;

  let active: Set<string> = new Set(S.ids);
  let fills: Record<string, number> | null = null;
  let hint: Set<string> | null = null;
  let highlight: Set<string> | null = null;
  let bold: Set<string> | null = null;
  let size: Size = { w: 1, h: 1 };
  let homeBox: Box = S.box;
  let pad: Pad = NO_PAD;
  let home: View = { cx: 0, cy: 0, u: 1 };
  let rendered: View = home;   // viewBox 에 들어 있는 보기
  let shown: View = home;      // 눈에 보이는 보기(rendered + CSS transform)
  let anim: { timer: number; to: View } | null = null;
  let zoomedFlag = false;
  // px 묶음: 지도 점에 화면 px 크기로 붙는 것들(○·✕·화살표 머리·이름표·복습 점)
  let pxItems: { g: SVGGElement; x: number; y: number }[] = [];
  let question: string | null = null;
  let breathe = false;
  let marks: Marks = {};
  let labels: MapLabel[] = [];
  let labelMode: LabelMode = 'must';
  let labelMinW = COMPACT_PX;
  let badges: string[] = [];
  let dimLabels: { id: string; text: string }[] = [];
  let litKey = '';             // 밝은 칸 묶음이 바뀔 때만 과 판 선을 다시 만든다
  let noCell: string | null = null;   // 잘못 누른 칸(칸 채움을 산호로)
  // 이름표 자리: 칸 안 자리는 배율·목록이 같으면 다시 재지 않는다(지도를 옮겨도 그대로).
  // 칸 밖 자리는 보이는 범위에도 달려 있어, 옮긴 뒤에도 쓸 수 있는지 보고(stillGood) 안 되면 칸 밖 것만 다시 잰다
  let inKey = '';
  let inRes: InsideResult = { placed: [], pending: [] };
  let outKey = '';
  let outRes: { placed: Placed[]; clipped: boolean } = { placed: [], clipped: false };
  let outAt = '';              // 칸 밖 자리를 잰 보기 가운데
  let placed: Placed[] = [];
  let dimKey = '';
  let dimPlaced: Placed[] = [];
  let dimPending: string[] = [];   // 칸 안에 못 넣은 길잡이(그릴 때마다 이름표 점 자리를 다시 본다 — 이번 과 칸·강 이름 자리에 달려 있다)
  let waterKey = '';           // 강 이름 자리(강 띠 안)도 배율이 같으면 다시 재지 않는다
  let waterAt = new Map<string, [number, number] | null>();
  let shoreKey = '';           // 강 이름을 물가 옆 바탕에 둘 때의 자리(배율과 보이는 범위가 같으면 다시 재지 않는다)
  let shoreAt = new Map<string, [number, number] | null>();

  // 이름표가 피할 것: 모든 칸과 물. 지역 가운데는 칸 밖 자리를 바깥쪽부터 찾는 데 쓴다
  const obstacles: Obstacle[] = S.ids.map((cid) => { const c = S.cells.get(cid)!; return { rings: c.rings, box: c.box }; });
  const waterBox: Box = [Infinity, Infinity, -Infinity, -Infinity];
  if (river && S.water.length) {
    const wb = waterBox;
    for (const r of S.water) for (let i = 0; i < r.length; i += 2) {
      wb[0] = Math.min(wb[0], r[i]); wb[2] = Math.max(wb[2], r[i]); wb[1] = Math.min(wb[1], r[i + 1]); wb[3] = Math.max(wb[3], r[i + 1]);
    }
    obstacles.push({ rings: S.water, box: wb });
  }
  const center: [number, number] = [(S.box[0] + S.box[2]) / 2, (S.box[1] + S.box[3]) / 2];
  // 강 띠의 평균 폭(m): 긴 띠는 넓이 ≈ 길이 × 폭, 둘레 ≈ 2 × 길이
  const riverW = (() => {
    let area = 0, peri = 0;
    for (const r of S.water) {
      let a = 0;
      for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
        a += r[j] * r[i + 1] - r[i] * r[j + 1];
        peri += Math.hypot(r[i] - r[j], r[i + 1] - r[j + 1]);
      }
      area += Math.abs(a) / 2;
    }
    return peri ? (2 * area) / peri : 0;
  })();

  const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const measure = () => {
    const r = host.getBoundingClientRect();
    size = { w: Math.max(1, r.width), h: Math.max(1, r.height) };
  };
  const clamp = (v: View) => clampView(v, home, homeBox);
  /** 정답 칸이 '알려 주는 자리'(노랑)인가 */
  const telling = () => marks.tell ?? !!(marks.no || marks.blink);
  /** 바탕색(이번 과 아님)이 아닌 칸: 고를 수 있거나 채움 값이 있는 칸 */
  const lit = (cid: string) => active.has(cid) || (!!fills && cid in fills);

  /** 섬 상자: 공부할 칸에 먼 섬이 있거나 채움 지도일 때만 보이고, 칸 상태(문제·정답·오답·채움·강조)를 본 지도와 같게 */
  function paintInset() {
    if (!inset) return;
    inset.box.hidden = !(fills || inset.paths.some((p) => active.has(p.id)));
    for (const p of inset.paths) {
      const cls = [fills && p.id in fills ? `cm-cell lv${fills[p.id]}` : active.has(p.id) ? 'cm-cell' : 'cm-cell ctx'];
      if (highlight?.has(p.id)) cls.push('hl');
      if (bold?.has(p.id)) cls.push('cm-bolded');
      if (marks.no === p.id) cls.push('cm-no');
      else if (marks.ok === p.id) cls.push(telling() ? 'cm-ok tell' : 'cm-ok');
      else if (question === p.id) cls.push('cm-q');
      p.el.setAttribute('class', cls.join(' '));
    }
  }

  function paintCells() {
    const litIds: string[] = [];
    for (const [cid, p] of cellEl) {
      const lv = fills && cid in fills ? fills[cid] : null;   // 채움 값이 없는 칸은 공부 화면처럼(흰 칸·바탕색 칸)
      const cls = ['cm-cell'];
      if (lv !== null) cls.push(`lv${lv}`);
      else if (!active.has(cid)) cls.push('ctx');
      if (highlight?.has(cid)) cls.push('hl');
      if (hint && !hint.has(cid)) cls.push('dim');
      if (noCell === cid) cls.push('no');
      p.setAttribute('class', cls.join(' '));
      if (lit(cid)) litIds.push(cid);
    }
    // 과 판: 밝은 칸이 일부뿐이면 나머지 선을 옅게 낮추고(.part), 밝은 묶음의 안쪽 경계와 둘레만 먹선으로 다시 긋는다
    const part = litIds.length > 0 && litIds.length < S.ids.length;
    const key = part ? litIds.join(',') : '';
    if (key !== litKey) {
      litKey = key;
      host.classList.toggle('part', part);
      const set = new Set(litIds);
      innerEl.setAttribute('d', part ? S.innerOf(set) : '');
      partRim.setAttribute('d', part ? S.rimOf(set) : '');
      partBank.setAttribute('d', part ? S.bankOf(set) : '');
    }
    paintInset();
    if (labels.length) drawLabels();   // 이름표 색(흰·먹)이 칸 색을 따른다
  }

  /* ---------- 보기 ---------- */

  function show(v: View) {
    shown = v;
    const { k, tx, ty } = cssBetween(rendered, v, size);
    svg.style.transform = Math.abs(k - 1) < 1e-9 && Math.abs(tx) < 0.01 && Math.abs(ty) < 0.01 ? '' : `translate(${tx}px, ${ty}px) scale(${k})`;
  }

  function paintScale() {
    if (!scale) return;
    const hide = size.w < (opt.scaleMinWidth ?? COMPACT_PX);
    scale.box.hidden = hide;
    if (hide) return;
    const s = scaleStep(rendered.u);
    scale.text.textContent = s.text;
    scale.bar.style.width = `${Math.round(s.px)}px`;
    // 아래를 가리는 것(실험실의 시트)이 있으면 그 위로 올린다(scaleLift 일 때만)
    scale.box.style.bottom = opt.scaleLift && pad.b > COVER_PX ? `${Math.round(pad.b + 8)}px` : '';
  }

  /** 화면에 붙어 있는 것(섬 상자·축척 막대)의 자리를 지도 단위 상자로: 칸 밖 이름표가 그 밑에 깔리지 않게 */
  function screenBoxes(): Box[] {
    const out: Box[] = [];
    for (const e of [inset?.box, scale?.box]) {
      if (!e || e.hidden || !e.offsetWidth) continue;
      const [x0, y0] = toMap(rendered, size, e.offsetLeft, e.offsetTop);
      const [x1, y1] = toMap(rendered, size, e.offsetLeft + e.offsetWidth, e.offsetTop + e.offsetHeight);
      out.push([x0, y0, x1, y1]);
    }
    return out;
  }

  function commit(v: View) {
    const t0 = performance.now();
    rendered = shown = v;
    const [x, y, w, h] = viewBox(v, size);
    svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
    svg.style.transition = '';
    svg.style.transform = '';
    for (const it of pxItems) it.g.setAttribute('transform', `translate(${it.x} ${it.y}) scale(${v.u})`);
    host.classList.toggle('thin-bank', river && riverW / v.u < BANK_MIN_PX);
    paintScale();                      // 이름표가 축척 막대를 피하려면 막대가 먼저 자리를 잡아야 한다
    if (opt.contextNames || dimLabels.length) drawContext();
    if (labels.length) drawLabels();   // 칸 안·칸 밖·빼기는 배율에 따라 달라진다
    if (marks.ok || marks.no) drawSymbols();   // 기호는 이름표를 비켜 놓는다
    if (badges.length) drawBadges();
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
    // 잘못 누른 칸은 겹층이 아니라 칸 채움을 산호로 바꾼다: 선 층 아래라 과 둘레·강가의 굵은 선을 깎지 않는다
    const no = marks.no ?? null;
    if (no !== noCell) {
      if (noCell) cellEl.get(noCell)?.classList.remove('no');
      noCell = no;
      if (noCell) cellEl.get(noCell)?.classList.add('no');
    }
    if (question) cellPath(question, `cm-q${breathe && !(marks.ok || marks.no) ? ' breathe' : ''}`);
    if (marks.ok) cellPath(marks.ok, `cm-ok${telling() ? ' tell' : ''}${marks.pencil ? ' pencil' : ''}${marks.blink ? ' blink' : ''}`);
    if (marks.no && marks.ok && marks.arrow) drawArrow(marks.no, marks.ok);
    paintInset();
    if (labels.length) drawLabels();
    drawSymbols();
  }

  /**
   * 지금 보이는 지도 범위에서 가장자리를 뺀 상자(칸 밖 이름표·맥락 이름이 있을 곳).
   * 변마다 m px 와 여백(pad) 가운데 큰 쪽을 뺀다 — 시트가 덮는 아래쪽에는 이름을 두지 않는다
   */
  const viewRect = (m: number): Box => {
    const [x, y, w, h] = viewBox(rendered, size), u = rendered.u;
    return [x + Math.max(m, pad.l) * u, y + Math.max(m, pad.t) * u, x + w - Math.max(m, pad.r) * u, y + h - Math.max(m, pad.b) * u];
  };
  const cellOf = (cid: string) => S.cells.get(cid);
  const boxIn = (r: Box, x: number, y: number, w: number, h: number) => x - w / 2 >= r[0] && x + w / 2 <= r[2] && y - h / 2 >= r[1] && y + h / 2 <= r[3];

  /** 맥락 이름의 글(영어 화면은 바꿔서)과 글자 상자(px). 강 이름은 한글일 때만 자간이 넓다('한 강' — 영어 'Han River' 는 보통 자간) */
  const ctxText = (n: Shapes['names'][number]) => (opt.ctxName ? opt.ctxName(n.sido, n.text) : n.text);
  const waterSp = (t: string) => (/[가-힣]/.test(t) ? WATER_SPACING : 0);
  const ctxSize = (t: string, kind: 'out' | 'water') =>
    ({ w: Math.ceil(textWidth(t, CTX_PX) + (kind === 'water' ? [...t].length * waterSp(t) * CTX_PX : 0)) + 4, h: CTX_PX + 4 });

  /** 강이 지역을 벗어나 바탕 위로 흐르는 곳의 물가 점(칸 경계에서 SHORE_M 넘게 떨어진 강 띠 꼭짓점). 처음 쓸 때 한 번 잰다 */
  let shore: [number, number][] | null = null;
  const shoreOf = (): [number, number][] => {
    if (shore) return shore;
    const cells = obstacles.slice(0, S.ids.length);
    shore = [];
    for (const r of S.water) for (let i = 0; i < r.length; i += 2) {
      const x = r[i], y = r[i + 1];
      const near = cells.filter((c) => x >= c.box[0] - SHORE_M && x <= c.box[2] + SHORE_M && y >= c.box[1] - SHORE_M && y <= c.box[3] + SHORE_M);
      if (!near.some((c) => inside(c.rings, x, y) || edgeDist(c.rings, x, y) < SHORE_M)) shore.push([x, y]);
    }
    return shore;
  };

  /**
   * 강 띠에 안 드는 강 이름의 자리: 강이 지역 밖 바탕으로 흐르는 곳의 물가 바로 옆 바탕(칸·물에 닿지 않고 보이는 범위 안).
   * 데이터 자리에서 가까운 물가부터 본다. 없으면 null
   */
  function shoreSpot(n: Shapes['names'][number], w: number, h: number, view: Box): [number, number] | null {
    const u = rendered.u, g = 6 * u;
    const pts = shoreOf().filter(([x, y]) => x >= view[0] && x <= view[2] && y >= view[1] && y <= view[3])
      .sort((a, b) => Math.hypot(a[0] - n.x, a[1] - n.y) - Math.hypot(b[0] - n.x, b[1] - n.y));
    const stride = Math.max(1, Math.floor(pts.length / 60));
    const hit = (k: Box, b: Box) => k[0] < b[2] && k[2] > b[0] && k[1] < b[3] && k[3] > b[1];
    // 이웃 땅 이름(경기 지도의 '서울' 등)과도 겹치지 않게
    const names = S.names.filter((m) => m.kind !== 'water').map((m): Box => {
      const s = ctxSize(ctxText(m), 'out');
      return [m.x - (s.w / 2) * u, m.y - (s.h / 2) * u, m.x + (s.w / 2) * u, m.y + (s.h / 2) * u];
    });
    // 물가에서 글자까지 6 → 14 → 24px 로 조금씩 멀리(물가 바로 옆이 막힌 강 하구 등)
    for (const k of [1, 7 / 3, 4]) for (let i = 0; i < pts.length; i += stride) {
      const [x, y] = pts[i], gk = g * k;
      for (const [cx, cy] of [[x, y - h / 2 - gk], [x, y + h / 2 + gk], [x + w / 2 + gk, y], [x - w / 2 - gk, y]]) {
        if (!boxIn(view, cx, cy, w, h)) continue;
        const b: Box = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
        if (names.some((k) => hit(k, b))) continue;
        if (obstacles.some((ob) => hit(ob.box, b) && boxHits(ob.rings, cx, cy, w, h))) continue;
        return [cx, cy];
      }
    }
    return null;
  }

  /**
   * 맥락 이름이 놓일 자리(지도 단위). 이웃 땅 이름은 데이터 자리 그대로.
   * 강 이름은 강가 굵은 선에 걸치지 않게: 글자가 강 띠 안에 온전히 드는 곳(데이터 자리 → 강을 따라 가까운 넓은 곳) →
   * 강이 지역 밖으로 흐르는 곳의 물가 옆 바탕(이름이 계속 보이게 — 좁은 지도에서는 띠가 글자보다 가늘다) → 없으면 null(뺀다)
   */
  function ctxSpot(n: Shapes['names'][number], t: string): [number, number] | null {
    if (n.kind !== 'water') return [n.x, n.y];
    const u = rendered.u, view = viewRect(4), b = ctxSize(t, 'water'), w = b.w * u, h = b.h * u;
    const id = `${n.x},${n.y},${t}`;
    // 띠 안 자리(무거운 계산)는 배율에만 달려 있다: 지도를 옮기기만 했으면 그대로 쓴다
    const key = u.toPrecision(6);
    if (key !== waterKey) { waterKey = key; waterAt = new Map(); }
    let at = waterAt.get(id);
    if (at === undefined) {
      // 글자 위아래에 2px 씩 더 띄운다: 강가 굵은 선(가운데 정렬 2.2px)의 안쪽 절반에 글자 끝이 닿지 않게(후광이 없다)
      at = fitBox(S.water, waterBox, [n.x, n.y], w, h + 4 * u, 3 * u, WATER_REACH_PX * u);
      waterAt.set(id, at);
    }
    if (at && boxIn(view, at[0], at[1], w, h)) return at;
    // 물가 옆 바탕 자리는 보이는 범위에도 달려 있다
    const sKey = `${key}|${view.map((v) => Math.round(v / u)).join(',')}`;
    if (sKey !== shoreKey) { shoreKey = sKey; shoreAt = new Map(); }
    let s = shoreAt.get(id);
    if (s === undefined) {
      s = shoreSpot(n, w, h, view);
      shoreAt.set(id, s);
    }
    return s;
  }

  /**
   * 맥락 이름(이웃 땅·한강)과 길잡이 이름(이번 과 밖의 이미 칠한 곳). 보이는 범위에 온전히 들 때만 그린다(가장자리에서 잘린 글자 조각이 남지 않게).
   * 길잡이는 글자가 칸 안에 드는 자리가 먼저고, 안 들면 main 때처럼 칸 지름이 DIM_LABEL_PX 이상인 칸의 이름표 점에 둔다 —
   * 이웃도 바탕색 칸이라 글자가 그 칸에 걸쳐도 읽힌다. 다만 이번 과 칸(밝은 칸)·강·다른 이름과 겹치면 뺀다
   */
  function drawContext() {
    dropPx(gCtx);
    const u = rendered.u, view = viewRect(4);
    const taken: Box[] = [];   // 그린 이름의 글자 상자(길잡이가 피한다)
    const boxAt = (x: number, y: number, w: number, h: number): Box => [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
    if (opt.contextNames) for (const n of S.names) {
      if (n.kind === 'water' && !river) continue;   // 그리지 않은 강에는 이름도 없다
      const t = ctxText(n), b = ctxSize(t, n.kind), at = ctxSpot(n, t);
      if (!at || !boxIn(view, at[0], at[1], b.w * u, b.h * u)) continue;
      // 자간은 글자 뒤에 붙으므로 넓은 자간의 강 이름(한글)은 자간 반만큼 오른쪽으로 옮겨야 가운데에 온다
      const sp = n.kind === 'water' ? waterSp(t) : 0;
      el('text', { x: (sp * CTX_PX) / 2, y: baseline(t, CTX_PX), 'text-anchor': 'middle' }, pxGroup(at[0], at[1], `cm-ctxname ${n.kind}${sp ? ' ko' : ''}`, gCtx)).textContent = t;
      taken.push(boxAt(at[0], at[1], b.w * u, b.h * u));
    }
    if (!dimLabels.length) return;
    const key = `${u.toPrecision(6)}|${dimLabels.map((l) => `${l.id}:${l.text}`).join(',')}`;
    if (key !== dimKey) {
      dimKey = key;
      const res = placeInside(cellOf, dimLabels.map((l) => ({ id: l.id, ...labelBox(l.text, CTX_PX) })), u);
      dimPlaced = res.placed;
      dimPending = res.pending.map((a) => a.id);
    }
    const text = new Map(dimLabels.map((l) => [l.id, l.text]));
    const draw = (id: string, x: number, y: number) => {
      const t = text.get(id) ?? '';
      el('text', { x: 0, y: baseline(t, CTX_PX), 'text-anchor': 'middle' }, pxGroup(x, y, 'cm-ctxname cell', gCtx)).textContent = t;
    };
    for (const p of dimPlaced) {
      const b = labelBox(text.get(p.id) ?? '', CTX_PX);
      if (!boxIn(view, p.x, p.y, b.w * u, b.h * u)) continue;
      draw(p.id, p.x, p.y);
      taken.push(boxAt(p.x, p.y, b.w * u, b.h * u));
    }
    if (!dimPending.length) return;
    const hit = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
    const litCells = S.ids.filter(lit).map((cid) => S.cells.get(cid)!);
    for (const id of dimPending) {
      const c = S.cells.get(id);
      if (!c || (2 * c.r) / u < DIM_LABEL_PX) continue;
      const b = labelBox(text.get(id) ?? '', CTX_PX), w = b.w * u, h = b.h * u, [x, y] = c.label;
      if (!boxIn(view, x, y, w, h)) continue;
      const bx = boxAt(x, y, w, h);
      if (taken.some((k) => hit(k, bx))) continue;
      if (litCells.some((lc) => hit(lc.box, bx) && boxHits(lc.rings, x, y, w, h))) continue;
      if (river && S.water.length && hit(waterBox, bx) && boxHits(S.water, x, y, w, h)) continue;
      draw(id, x, y);
      taken.push(bx);
    }
  }

  /** 복습할 곳의 점: 이름표 점에. 아주 작은 칸은 빼고 그 목록을 돌려준다 */
  function drawBadges(): string[] {
    dropPx(gBadge);
    const skipped: string[] = [];
    for (const bid of badges) {
      const c = S.cells.get(bid);
      if (!c) continue;
      const dPx = (2 * c.r) / rendered.u;
      if (dPx < BADGE_MIN_PX) { skipped.push(bid); continue; }
      const g = pxGroup(c.label[0], c.label[1], 'cm-badge', gBadge);
      el('circle', { cx: 0, cy: 0, r: Math.max(4, Math.min(BADGE_R, dPx / 2 - 3)) }, g);
    }
    return skipped;
  }

  /** 이름표의 색: 다 익힌 칸(진초록) 위에서만 흰 글자. 노랑·초록·산호가 덮인 칸(강조·문제·판정)과 흐려진 칸은 먹 글자 */
  const toneOf = (l: MapLabel): 'ink' | 'white' => {
    if (l.tone) return l.tone;
    const id = l.id;
    if (!fills || fills[id] !== 3) return 'ink';
    if (highlight?.has(id) || question === id || marks.ok === id || marks.no === id || (hint && !hint.has(id))) return 'ink';
    return 'white';
  };

  /** 이름표: 글자 상자가 칸 안에 드는 자리 → (mode 에 따라) 칸 밖 빈 바탕 + 지시선 → 칸 위쪽 흰 판 */
  function drawLabels() {
    dropPx(gLab);
    placed = [];
    if (!labels.length) return;
    if (size.w < labelMinW) return;
    const u = rendered.u, fs = labelPx(size.w);
    host.style.setProperty('--cm-label', `${fs}px`);
    const asks = labels.map((l) => ({ id: l.id, ...labelBox(l.text, fs) }));
    // 칸 안 자리(가장 무거운 계산)는 배율과 목록에만 달려 있다: 끌어서 옮기기만 했으면 그대로 쓴다
    const kIn = `${fs}|${u.toPrecision(6)}|${labels.map((l) => `${l.id}:${l.text}`).join(',')}`;
    if (kIn !== inKey) {
      inKey = kIn;
      inRes = placeInside(cellOf, asks, u);
      outKey = '';
    }
    placed = inRes.placed;
    if (labelMode !== 'inside' && inRes.pending.length) {
      // 칸 밖 자리는 보이는 범위와 화면에 붙은 것(섬 상자·축척 막대)에도 달려 있다
      const within = viewRect(4), screen = screenBoxes();
      const at = `${Math.round(rendered.cx)},${Math.round(rendered.cy)}`;
      const kOut = `${labelMode}|${kIn}|${Math.round(size.w)}x${Math.round(size.h)}|${pad.t},${pad.r},${pad.b},${pad.l}|${screen.length}`;
      const size0 = new Map(asks.map((a) => [a.id, a]));
      // 칸 밖 이름표와 그 지시선은 맥락 이름(이웃 시도·한강) 자리도 피한다. 한강 이름은 보이는 범위에 따라 옮겨 다닌다(물가 옆 바탕)
      const avoid = !opt.contextNames ? [] : S.names.filter((n) => n.kind !== 'water' || river).flatMap((n): Box[] => {
        const t = ctxText(n), b = ctxSize(t, n.kind), p = ctxSpot(n, t);
        return p ? [[p[0] - (b.w / 2) * u, p[1] - (b.h / 2) * u, p[0] + (b.w / 2) * u, p[1] + (b.h / 2) * u]] : [];
      });
      const hitAny = (ks: Box[], x: number, y: number, w: number, h: number) => ks.some((k) => x - w / 2 < k[2] && x + w / 2 > k[0] && y - h / 2 < k[3] && y + h / 2 > k[1]);
      // 지도를 옮긴 뒤에도 쓸 수 있나: 지난번에 범위 때문에 밀려난 이름이 없었고, 놓았던 이름표가 아직 보이는 범위 안에 있으며
      // 화면에 붙은 것 밑에 깔리지 않고 맥락 이름과 겹치지 않는다
      const stillGood = () => !outRes.clipped && outRes.placed.every((p) => {
        const a = size0.get(p.id);
        if (!a) return false;
        const w = a.w * u, h = a.h * u;
        return boxIn(within, p.x, p.y, w, h) && !hitAny(screen, p.x, p.y, w, h) && !hitAny(avoid, p.x, p.y, w, h);
      });
      if (kOut !== outKey || (at !== outAt && !stillGood())) {
        outKey = kOut;
        outAt = at;
        outRes = placeOutside(cellOf, asks, inRes, { mode: labelMode, u, obstacles, within, center, avoid, screen });
      }
      placed = [...inRes.placed, ...outRes.placed];
    }
    const byId = new Map(labels.map((l, i) => [l.id, { l, box: asks[i] }]));
    for (const p of placed) {
      const it = byId.get(p.id), c = S.cells.get(p.id);
      if (!it || !c) continue;
      const base = baseline(it.l.text, fs);
      if (!p.out) {
        const g = pxGroup(p.x, p.y, `cm-label${toneOf(it.l) === 'white' ? ' white' : ''}`, gLab);
        el('text', { x: 0, y: base, 'text-anchor': 'middle' }, g).textContent = it.l.text;
        continue;
      }
      // 칸 밖: 칸 안 이름표 점에 묶음을 두고(점), 이름표까지 지시선
      const g = pxGroup(c.label[0], c.label[1], 'cm-label out', gLab);
      const tx = (p.x - c.label[0]) / u, ty = (p.y - c.label[1]) / u;
      el('path', { d: `M0 0L${((p.out.ax - c.label[0]) / u).toFixed(1)} ${((p.out.ay - c.label[1]) / u).toFixed(1)}`, class: 'cm-leader' }, g);
      el('circle', { r: 3, class: 'cm-leader-dot' }, g);
      if (p.out.plate) el('rect', { x: (tx - it.box.w / 2).toFixed(1), y: (ty - it.box.h / 2).toFixed(1), width: it.box.w, height: it.box.h, class: 'cm-plate' }, g);
      el('text', { x: tx.toFixed(1), y: (ty + base).toFixed(1), 'text-anchor': 'middle' }, g).textContent = it.l.text;
    }
  }

  /** 기호(○ ✕)만 다시 그린다. 이름표 자리가 바뀌면(배율) 기호 자리도 따라가야 해서 판정 겹층(칠 효과가 처음부터 도는)과 따로 둔다 */
  function drawSymbols() {
    dropPx(gSym);
    if (marks.no) symbol(marks.no, 'no');
    if (marks.ok) symbol(marks.ok, 'ok');
  }

  /**
   * 기호는 이름표 점에. 그 칸에 칸 안 이름표가 있으면(만나기에서 칸을 누른 직후) 글자를 덮지 않게 이름표 위나 아래 가운데 칸이 넓은 쪽으로 비킨다 —
   * 후광 없는 글자는 기호와 겹치면 읽히지 않는다
   */
  function symbol(cid: string, kind: 'ok' | 'no') {
    const c = S.cells.get(cid)!;
    let x = c.label[0], y = c.label[1];
    const p = placed.find((q) => q.id === cid && !q.out), l = p && labels.find((q) => q.id === cid);
    if (p && l) {
      const u = rendered.u, b = labelBox(l.text, labelPx(size.w));
      if (Math.abs(x - p.x) < (b.w / 2 + SYM_R) * u && Math.abs(y - p.y) < (b.h / 2 + SYM_R) * u) {
        const d = (b.h / 2 + SYM_R + 2) * u;
        const room = (yy: number) => (inside(c.rings, p.x, yy) ? edgeDist(c.rings, p.x, yy) : -1);
        x = p.x;
        y = room(p.y - d) >= room(p.y + d) ? p.y - d : p.y + d;
      }
    }
    const g = pxGroup(x, y, `cm-sym ${kind}`, gSym);
    el('circle', { r: SYM_R, class: 'cm-sym-bg' }, g);
    if (kind === 'ok') el('circle', { r: 7.5, class: 'cm-sym-ok' }, g);
    else el('path', { d: 'M-5.5 -5.5L5.5 5.5M5.5 -5.5L-5.5 5.5', class: 'cm-sym-no' }, g);
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
      const set = ids ? new Set(ids) : null;
      lessonRim.setAttribute('d', set ? S.rimOf(set) : '');
      lessonBank.setAttribute('d', set ? S.bankOf(set) : '');
    },
    setBold(ids) {
      bold = ids ? new Set(ids) : null;
      boldEl.setAttribute('d', bold ? S.outlineOf(bold, { bank: false }) : '');
      boldBank.setAttribute('d', bold ? S.bankOf(bold) : '');
      paintInset();
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
      labelMode = o?.mode ?? 'must';
      labelMinW = o?.minWidth ?? (labelMode === 'fit' ? COMPACT_PX : 0);
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
      else paintScale();   // 확대한 채로는 다시 그리지 않으므로 축척 막대 자리만 맞춘다
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
      host.classList.remove('cmap', 'part', 'thin-bank', 'tap-only', 'static');
      host.style.removeProperty('--cm-label');
    },
  };
}
