// SVG 백지도: 그리기·확대·이동·판정 표시(설계서 5.2·5.3·3.5·3.6, 모양은 합본 디자인 — docs/REDESIGN_PLAN 3.1).
// 판정 규칙은 core/judge 가 정하고 여기서는 재서 넘긴다.
// 제스처·움직임 중에는 <svg> 에 CSS transform 만 걸고, 끝나면 viewBox 를 새로 넣어 선명하게 다시 그린다.
// 선 굵기는 non-scaling-stroke 로 화면 px 고정, 기호·이름표는 'px 묶음'(translate + scale(u))으로 화면 px 크기를 지킨다.
// 선은 칸마다 그리지 않는다: 칸 경계·외곽선·과 안 경계·묶음 둘레·굵은 테두리가 저마다 메쉬 path 하나다(동 단위 수백 칸에서도 가볍게)
import { AMBIGUOUS_ZOOM, classifyTap, type Tap } from '../core/judge.ts';
import { devLog } from '../devlog.ts';
import { fitBox, labelBox, leadToCenter, placeInside, placeOutside, scaleStep, splitTwo, textWidth, type InsideResult, type LabelMode, type Obstacle, type Placed } from './labelfit.ts';
import { boxHits } from './poly.ts';
import { unionBox, type Box } from './project.ts';
import { cornerCover, farInset, fitK, insetScale, isleEast, isleView, layoutIsles, pickCorner, scaleChip, ISLE_NOTE_H, ISLE_W, OWN_W, type Corner, type IsleCell, type IsleLayout } from './isles.ts';
import { LOC_MARGIN, LOC_MIN, locBase, locCorners, locCover, locFrame, locLit, locRect, locShow, locSide, pickLoc, viewCover, type LocFrame } from './locator.ts';
import { ZB_DOT_PX, ZB_PAD, ZB_WIDE_CAP, ZB_W_WIDE, ZOOM_ROW, zoomFit, zoomNeed, zoomPlace, zoomSize, zoomWide, type Rect, type ZoomCell, type ZoomLayout, type ZoomPlace } from './zoombox.ts';
import { perf } from '../perf.ts';
import { edgeDist, inside, probeAt, type Shapes } from './shapes.ts';
import { SEA_KO, coastSeas, landMask, outDIn, seaCode, seaSpots, type SeaKey, type SeaSpot } from './sea.ts';
import { clampView, contains, cssBetween, fitView, toMap, viewBox, zoomAround, NO_PAD, type Pad, type Size, type View } from './view.ts';
import type { CtxCell } from '../types.ts';

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
/** 이웃 땅 이름이 다른 맥락 이름·화면에 붙은 것과 겹칠 때 옮겨 볼 가장 먼 거리(px — 옆으로 벗어나는 데 더 들면 이름 글자 폭까지)와, 옮긴 뒤 겹쳤던 것과 띄울 틈(px — drawContext ctxPlaced) */
const NUDGE_PX = 48, NUDGE_GAP_PX = 3;
/** 이웃 땅에 들지 않는 이웃 이름의 지시선: 점에서 이름 상자까지 가장 긴 선·가장 짧은 선(px), 자리를 찾는 격자(px), 점 반지름 */
const LEAD_REACH_PX = 200, LEAD_MIN_PX = 6, LEAD_GRID_PX = 6, LEAD_DOT_R = 2.5;
/** 이웃 땅 이름을 그 땅 안에 둘 때 땅 안에 들어야 하는 글자 폭의 비율(나머지는 경계에 걸쳐도 둔다) */
const LAND_FIT = 0.85;
/** 바다 이름이 피하는 '⤢ 전체 보기' 단추 자리(지도 칸 오른쪽 위에서 잰 폭·높이 px — 단추 + 둘레) */
const SEA_RESET_W = 160, SEA_RESET_H = 62;
/** 강이 지역 밖으로 흐르는 물가로 보는 거리(m): 칸 경계에서 이만큼 넘게 떨어진 강 띠 꼭짓점 */
const SHORE_M = 300;
/** 섬 상자(먼 섬) 안을 누르면 이만큼 안의 가장 가까운 섬으로 본다(상자 최대 크기는 isles.ts ISLE_W×ISLE_H — farInset) */
const INSET_SNAP_PX = 24;

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
  /** 섬 상자 글('먼 섬'). 먼 섬 상자는 이 글 옆에, 동 단원 섬 상자는 상자마다 그 상자의 축척 막대를 둔다(2026-11-15 — 전에는 '먼 섬 · 축척 다름') */
  insetNote?: string;
  /**
   * 섬 상자 묶음에 정말 먼 섬이 하나도 없을 때의 글('섬' — 결정표 D2 ⓑ 사용자 결정 2026-11-17: 16px 때문에 상자에 남은 가까운 섬은 '먼 섬'이 아니다).
   * farIsles = 이 단원의 정말 먼 섬(단원 파일 far). 주지 않으면(지역 지도·옛 캐시 파일) 전처럼 insetNote
   */
  isleNote?: string;
  farIsles?: readonly string[];
  /**
   * 먼 섬 상자를 밝은 칸과 상관없이 늘 보인다(지역 전체 지도 — 과 시작: 이번 과에 먼 섬이 없어도 홈 지도처럼 지역 모양 그대로, 2026-11-15).
   * 끄면(기본) 공부할 칸에 먼 섬이 있거나 채움 지도일 때만(paintInset)
   */
  insetAlways?: boolean;
  /** 칸 밖 흰 판 이름표의 가운데를 남의 칸 위에 두지 않는다(전국 시·도 지도 — labelfit PlaceOpt.plateHome, E10 검수) */
  plateHome?: boolean;
  /** 지시선이 남의 지시선 끝 점 곁(px)을 지나지 않게 한다(확대 상자 안 작은 지도 — labelfit PlaceOpt.dotPx · zoombox.ts ZB_DOT_PX) */
  labelDotPx?: number;
  /** 이웃 땅·한강 이름을 흐리게 그린다(문제·둘러보기). 홈 카드처럼 작은 지도는 끈다 */
  contextNames?: boolean;
  /**
   * 바다 이름(map/sea.ts — 2026-11-17 사용자 결정 '바다 이름을 넣는다'): 보이는 바다의 빈자리에 '황해'·'남해'·'동해'. 기본 켬.
   * 이름표·맥락 이름·화면에 붙은 것을 모두 놓은 뒤 남는 바다에만 두고(다른 것의 자리를 바꾸지 않는다), 자리가 없으면 그리지 않는다.
   * 확대 상자 안 작은 지도는 끈다(본 지도에 있다). 글은 ctxName 이 바꾼다(CtxCell.sido 'sea:w'·'sea:s'·'sea:e')
   */
  seaNames?: boolean;
  /** 맥락 이름 바꾸기(영어 화면 — text/ui.ts ctxNamer). 이름 칸: sido 는 시도 코드(한강은 'water'), 동 단원 지도의 이웃 땅은 id·en, 일반구 단원의 나머지 칸은 id·rest */
  ctxName?(n: CtxCell): string;
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
  /**
   * 위치 지도(map/locator.ts — 2026-11-15 사용자 지시, 같은 날 사용자 결정으로 문제 화면만 — 과 시작·요약은 지역 전체 지도라 쓰지 않는다):
   * whole = 지역(단원) 전체 상자(지도 단위 — ui/maps.ts wholeView 범위).
   * 밝은 칸이 일부(과 판)이고 기본 보기(setHome)가 whole 의 LOC_MAX_COVER 미만을 보이면 귀퉁이에 지역 전체 모양 + 이번 과(흰 칸 + 먹 둘레) + 보이는 범위(네모)를 얹는다.
   * avoid = 쓰지 않을 귀퉁이(문제 화면·둘러보기의 오른쪽 위 '⤢ 전체 보기' — 지도 칸 밖 요소라 지도가 모른다). 누르기는 막지 않는다(map.css pointer-events: none)
   */
  locator?: { whole: Box; avoid?: Corner[] };
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
/**
 * 이름표 하나. tone 을 안 주면 칸 색으로 정한다(다 익힌 칸 위 = white, 그 밖 = ink).
 * fitText = 확대 상자 범위 좁히기(zoombox.ts zoomFit alt)를 다른 말 이름 판 크기로도 잴 때 그 이름(영어 동 과 시작·요약 — 한국어 이름, ui/pages.ts)
 */
export interface MapLabel { id: string; text: string; tone?: 'ink' | 'white'; fitText?: string }

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
  /** fit 에서도 깨끗한 자리(남의 칸을 덮지 않고 지시선이 아무것도 지나지 않음)에만 흰 판을 쓴다(labelfit PlaceOpt.cleanPlates — 영어 동·일반구 단원 둘러보기) */
  cleanPlates?: boolean;
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
  /**
   * 섬 상자(동 단원의 섬 과·섬 화면 insets, 계획서 N8): 이 칸들을 섬마다 작은 상자에 따로 그린다(map/isles.ts).
   * 밝은 칸이 모두 섬이면 상자들이 지도 칸 전체를 격자로 나눠 쓰고 본 지도는 숨긴다. 일부만 섬이면 가장자리에 줄로 두고 본 지도는 비켜 맞춘다.
   * 상자 안의 그 섬은 본 지도와 같은 상태(밝음·채움·문제·정답·오답)로 칠하고, 이름표는 상자 왼쪽 위 이름으로 보인다.
   * 상자 범위에 함께 드는 다른 칸은 늘 맥락색이고 누를 수 없다. 섬 상자 칸은 본 지도에서도 맥락색이고 누를 수 없다(한 곳이 두 번 밝게 보이지 않게). null·[] 이면 없앤다
   */
  setIsles(ids: string[] | null): void;
  /** 섬 상자가 격자인가(밝은 칸이 모두 섬 — 본 지도를 숨기고 끌기·확대가 없다) */
  isIsleGrid(): boolean;
  /**
   * 확대 상자(map/zoombox.ts — D95 ㉣, 과 시작·과 요약의 지역 전체 지도만 — ui/maps.ts mountMap 이 맨 끝에 부른다): 이번 과(밝은 칸 가운데 섬 상자 밖 칸)가
   * 본 지도에 너무 작게 그려지면(zoomNeed) fit(과 범위, 지도 단위)을 확대한 작은 지도를 귀퉁이나 지도 칸 아래에 늘린 줄에 두고,
   * 본 지도에는 상자가 보이는 범위를 네모로 긋고 이번 과 이름표를 상자로 옮긴다. 붙일지·자리는 지도 칸 크기가 바뀌면 다시 정한다.
   * note = 상자 아래 칸 글('확대'). null 이면 없앤다
   */
  setZoom(z: { fit: Box; note: string } | null): void;
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

/**
 * 섬 상자 축척 칸(막대 + 길이 글 — map.css .cm-sbar, 본 지도 .cm-scale 과 같은 막대). 먼 섬 상자 아래 칸·묶음 글 옆은 한 줄 '━ 10km',
 * 상자 안 귀퉁이 칸(.cm-isle-scale)은 본 지도 막대처럼 글 위·막대 아래. 길이를 바꿀 때는 setScaleChip
 */
function scaleChipEl(s: { px: number; text: string }): HTMLElement {
  const chip = document.createElement('span');
  chip.className = 'cm-sbar';
  chip.append(document.createElement('i'), document.createElement('span'));
  setScaleChip(chip, s);
  return chip;
}
function setScaleChip(chip: HTMLElement, s: { px: number; text: string }) {
  (chip.firstChild as HTMLElement).style.width = `${Math.round(s.px)}px`;
  chip.lastChild!.textContent = s.text;
}

/** 이름표 글자 크기(px): 지도 칸이 넓으면 조금 크게. 14px 아래로는 내려가지 않는다 */
export const labelPx = (w: number) => (w >= 900 ? 16 : w >= 640 ? 15 : 14);
/** 글자 가운데를 점에 맞추는 기준선 내림(px): 한글은 글자 상자를 꽉 채우고, 라틴 글자는 아래로 내려 쓰는 획(g·p)이 있어 덜 내린다 */
/** 이름표 글자 상자(한 줄 → 두 줄이면 'a-\nb' 로 나눈 상자) · 두 줄 글을 줄마다 tspan 으로 쓴다(한 줄이면 그냥 글) */
const twoOf = (t: string, two?: boolean) => (two ? splitTwo(t) ?? t : t);
function putText(node: Element, text: string, base: number, px: number) {
  const ls = text.split('\n');
  if (ls.length < 2) { node.textContent = text; return; }
  const lh = Math.ceil(px * 1.4), x = node.getAttribute('x') ?? '0', y0 = base - ((ls.length - 1) * lh) / 2;
  ls.forEach((l, i) => { const ts = node.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'tspan'); ts.setAttribute('x', x); ts.setAttribute('y', String(+(y0 + i * lh).toFixed(1))); ts.textContent = l; node.appendChild(ts); });
}
const baseline = (text: string, px: number) => Math.round(px * ([...text].some((ch) => ch.codePointAt(0)! >= 0x1100) ? 0.36 : 0.28));

export function createSvgMap(host: HTMLElement, opt: MapOptions): SvgMap {
  const S = opt.shapes;
  host.classList.add('cmap');
  const svg = el('svg', { class: 'cmap-svg', 'aria-hidden': 'true', focusable: 'false' });
  host.appendChild(svg);

  // 층(아래→위): 이웃 땅 → 칸 채움 → 한강 → 칸 경계 → 강가·외곽선 → (과 판) 과 안 경계·밝은 묶음 둘레 → 묶음 둘레 → 굵은 테두리
  //             → 맥락 이름 → 바다 이름 → 문제 칸·판정 겹층 → 화살표 머리 → 기호 → 이름표 → 복습 점
  // 묶음의 둘레·굵은 테두리는 강가(-bank)를 따로 긋는다: 강이 좁게 보이는 보기(.thin-bank)에서 강가만 가는 선으로 낮추려고
  // 이웃 땅은 바탕과 같은 면색으로만 깐다(이웃끼리 경계는 그리지 않는다 — 색은 지도 칸에만)
  const gOut = el('g', { class: 'cm-out' }, svg);
  // 먼 이웃 땅(far 층 — 2026-11-17 바다 표현)을 이웃 땅 밑에 같은 면색으로(둘은 겹치고 고리 방향이 다를 수 있어 path 를 따로 둔다). 없는 지도는 path 를 두지 않는다
  if (S.farD) el('path', { d: S.farD, class: 'cm-out-fill' }, gOut);
  el('path', { d: S.outD, class: 'cm-out-fill' }, gOut);
  const gCells = el('g', { class: 'cm-cells' }, svg);
  const cellEl = new Map<string, SVGPathElement>();
  for (const cid of S.ids) {
    const p = el('path', { d: S.cells.get(cid)!.d, class: 'cm-cell' }, gCells);
    cellEl.set(cid, p);
  }
  // 물색은 지역 안의 물에만: 칸과 맞닿지 않는 강(충남 지도 구석의 한강 등)은 그리지 않는다 — 이웃 땅은 강 띠를 뺀 모양이라 그 자리를 이웃 땅색으로 메운다
  // (2026-11-17 바다 표현 — 전에는 바탕이 이웃 땅과 같은 색이라 비워 두면 됐다. 이제 비우면 바다색 띠가 된다)
  const river = S.bankD !== '';
  if (river) el('path', { d: S.waterD, class: 'cm-water' }, svg);
  else if (S.waterD) el('path', { d: S.waterD, class: 'cm-out-fill' }, gOut);
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
  const gLead = el('g', { class: 'cm-ctx cm-lead' }, svg);
  const gSea = el('g', { class: 'cm-ctx cm-sea' }, svg);
  const gState = el('g', { class: 'cm-state' }, svg);
  const gPx = el('g', { class: 'cm-px' }, svg);
  const gSym = el('g', { class: 'cm-px cm-syms' }, svg);
  const gLab = el('g', { class: 'cm-labels' }, svg);
  const gBadge = el('g', { class: 'cm-badges' }, svg);

  // 섬 상자: 먼 섬(옹진 백령·대청·연평)을 귀퉁이에 따로 그린다(설계서 3.3). 축척이 본 지도와 달라 아래 칸에 '먼 섬'과 이 상자의 축척 막대를 둔다
  // (2026-11-15 사용자 지시 — 전에는 '먼 섬 · 축척 다름'). 상자 크기가 늘 같아(isles.ts farInset) 막대는 만들 때 한 번만 정한다
  const inset = S.far ? (() => {
    const F = S.far;
    const { vb, w: iw, h: ih, k } = farInset(F.box);   // iw·ih = 그림 크기(px), k = 상자 px / 지도 단위
    const box = document.createElement('div');
    box.className = 'cm-inset';
    box.setAttribute('aria-hidden', 'true');   // 그림의 일부: 보조 기술에는 지도 칸의 설명(aria-label)만 읽힌다
    const isvg = el('svg', { class: 'cm-inset-svg', viewBox: vb.join(' '), width: iw, height: ih, 'aria-hidden': 'true' });
    box.appendChild(isvg);
    // 바탕은 바다색(map.css), 상자 범위에 드는 이웃 땅(백령·연평 둘레의 북한 땅 등)은 본 지도처럼 땅색으로 깐다(2026-11-17 바다 표현 — 전에는 흰 바탕에 섬만)
    for (const d of outDIn(S, [vb[0], vb[1], vb[0] + vb[2], vb[1] + vb[3]])) if (d) el('path', { d, class: 'cm-out-fill' }, isvg);
    const paths = F.parts.map((p) => ({ id: p.id, rings: p.rings, el: el('path', { d: p.d, class: 'cm-cell' }, isvg) }));
    // 아래 칸: '먼 섬' + 막대 + 길이 글. 한 줄에 안 들면 막대가 다음 줄로 꺾인다(map.css — 상자 폭은 그림 폭과 가장 긴 조각 가운데 큰 쪽)
    const note = document.createElement('span');
    note.className = 'cm-inset-note';
    const label = document.createElement('span');
    label.textContent = opt.insetNote ?? '먼 섬';
    note.append(label, scaleChipEl(insetScale(k, ISLE_W)));   // 막대 범위는 상자 최대 폭 기준(그림이 좁은 세로 상자 — 전남광주 62px — 도 막대가 너무 짧지 않게)
    box.appendChild(note);
    host.appendChild(box);
    const stop = (e: Event) => e.stopPropagation();
    box.addEventListener('pointerdown', stop);
    box.addEventListener('wheel', stop);
    box.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      const r = isvg.getBoundingClientRect();
      const x = vb[0] + (e.clientX - r.left - (iw - vb[2] * k) / 2) / k, y = vb[1] + (e.clientY - r.top - (ih - vb[3] * k) / 2) / k;
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

  // 위치 지도(map/locator.ts): 귀퉁이에 얹는 작은 지도. 바다색 바탕 → 이웃 땅 → 바탕 모양 → 강 → 지역 외곽선 → 이번 과 칠 → 이번 과 둘레 → 보이는 범위 네모.
  // 그림의 일부라 보조 기술에는 읽히지 않고(aria-hidden), 누름은 밑의 본 지도로 간다(map.css). 보일지·귀퉁이는 syncLoc 이 정한다
  const loc = opt.locator ? (() => {
    const box = document.createElement('div');
    box.className = 'cm-loc';
    box.setAttribute('aria-hidden', 'true');
    box.hidden = true;
    const lsvg = el('svg', { class: 'cm-loc-svg', 'aria-hidden': 'true', focusable: 'false' });
    const p = (cls: string) => el('path', { d: '', class: cls }, lsvg);
    const parts = { far: p('cm-loc-out'), out: p('cm-loc-out'), land: p('cm-loc-land'), water: p('cm-loc-water'), rim: p('cm-loc-rim'), lit: p('cm-loc-lit'), litRim: p('cm-loc-lit-rim') };
    const view = el('rect', { class: 'cm-loc-view' }, lsvg);
    box.appendChild(lsvg);
    host.appendChild(box);
    return {
      box, svg: lsvg, ...parts, view, whole: opt.locator!.whole, avoid: opt.locator!.avoid ?? [],
      frame: null as LocFrame | null, key: '', litKey: '', baseKey: '',
      usedH: -1,   // 마지막으로 귀퉁이를 정한 지도 칸 높이(setHome 이 견준다 — syncLoc 머리 주석)
    };
  })() : null;

  let active: Set<string> = new Set(S.ids);
  let fills: Record<string, number> | null = null;
  let hint: Set<string> | null = null;
  let highlight: Set<string> | null = null;
  let bold: Set<string> | null = null;
  let rim: Set<string> | null = null;   // setRim 의 묶음(섬 상자가 바뀌면 본 지도 몫을 다시 긋는다)
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
  let labelClean = false;
  let badges: string[] = [];
  let dimLabels: { id: string; text: string }[] = [];
  let litKey = '';             // 밝은 칸 묶음이 바뀔 때만 과 판 선을 다시 만든다
  let locLitIds: string[] = []; // 위치 지도에 칠할 밝은 칸(섬 상자 칸 포함) — paintCells 가 정한다
  let locMain: string[] = [];   // 그 가운데 본 지도 칸(귀퉁이가 덜 가릴 칸)
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

  /*
   * 섬 상자(동 단원, setIsles): 섬마다 상자 하나. 상자 안에는 그 범위에 드는 칸을 모두 그리고, 바탕은 바다색·범위에 드는 이웃 땅은 땅색(2026-11-17 — 전에는 흰 바탕에 칸만).
   * 상자마다 배율이 달라(범위를 상자에 meet 으로 맞춤) 상자 안 귀퉁이에 그 상자의 축척 칸(막대 + 길이 글)을 둔다(2026-11-15 — 전에는 묶음 글 '먼 섬 · 축척 다름' 하나).
   * 상자가 하나뿐이면(경북 울릉·여수 삼산면 등) 막대를 묶음 글 '먼 섬' 옆에 둔다 — 먼 섬 상자와 같은 꼴이고 섬 그림을 덮지 않는다(작은 정사각 상자는 어느 귀퉁이든 섬에 닿았다).
   * fit = 상자 안쪽 크기(key)가 바뀔 때만 다시 재는 막대·칸 폭·귀퉁이별 덮는 정도(그리기마다 재지 않는다 — 성능 기준)
   */
  interface Isle {
    id: string; view: Box; box: HTMLElement; svg: SVGSVGElement; name: HTMLElement; scale: HTMLElement; paths: { id: string; el: SVGPathElement; rings: Float64Array[] }[];
    fit: { key: string; w: number; cw: number; cover: Record<Corner, number> | null } | null;
  }
  let isles: Isle[] = [];
  let isleSet = new Set<string>();
  let isleKey = '';
  let isleL: IsleLayout | null = null;
  let isleTray: HTMLElement | null = null;
  let isleNote: HTMLElement | null = null;
  let isleNoteBar: HTMLElement | null = null;   // 상자가 하나일 때 묶음 글 옆 막대(여럿이면 없음)

  /*
   * 확대 상자(setZoom — map/zoombox.ts): 상자(.cm-zoom = 작은 지도 .cm-zoom-map + 아래 칸 '확대 · 축척')와 본 지도의 범위 네모(.cm-zoom-frame).
   * 작은 지도는 같은 칸 모양으로 만든 svgmap 하나이고 이번 과 칠·이름표는 본 지도를 따른다(mirrorZoom). 처음 붙일 때 만든다 — 상자가 필요 없는 지도는 DOM 이 전과 같다.
   * zAt = 고른 자리(zoombox.ts zoomPlace — 귀퉁이·아래 줄·옆 줄), zGrow = 상자를 두려고 지도 칸을 아래로 늘린 높이(map.css .cmap.zoom-below).
   * 줄에 두면 본 지도 여백에 그 몫(zAt.add — 아래 줄은 늘린 높이, 옆 줄은 상자 폭)을 더한다.
   * zIds = 이번 과 본 지도 칸(상자에 칠), zLab = 그 가운데 상자에 이름표를 둘 칸(상자 범위를 좁혀(zoomFit) 이름표 점이 상자 밖으로 나간 큰 칸은 빼고 본 지도에 —
   * 이름은 어느 동이든 한 곳에 한 번)
   */
  let zoom: { fit: Box; note: string } | null = null;
  let zb: { box: HTMLElement; mapEl: HTMLElement; label: HTMLElement; chip: HTMLElement; frame: SVGRectElement; map: SvgMap | null } | null = null;
  let zOn = false, zKey = '', zDKey = '', zGrow = 0;
  let zAt: ZoomPlace | null = null;
  let zIds = new Set<string>(), zLab = new Set<string>();
  /** 작은 지도 칠·이름표가 맞춰져 있는지 견주는 서명(이번 과 칸 · 상자 이름표 칸) */
  const zSig = () => (zOn ? `${[...zIds].join(',')}|${[...zLab].join(',')}` : '');

  /** 섬 상자 줄 배치면 본 지도 여백을 그만큼 늘린다(격자면 본 지도를 숨겨 그대로) */
  const isleShift = (p: Pad): Pad => (isleL && isleL.mode !== 'grid' ? { ...p, l: p.l + isleL.shift.l, r: p.r + isleL.shift.r, b: p.b + isleL.shift.b } : p);
  /** 본 지도 여백: 섬 상자 줄 몫 + 확대 상자를 줄에 두었으면 그 몫(아래 줄 높이 · 옆 줄 폭) */
  const shifted = (p: Pad): Pad => {
    const q = isleShift(p), a = zAt?.add;
    return a && (a.l || a.r || a.b) ? { ...q, l: q.l + a.l, r: q.r + a.r, b: q.b + a.b } : q;
  };
  const effPad = () => shifted(pad);

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
  /** 숨은 지도(display:none 따위 — 0×0)로 잰 뒤인가: 다시 보이면 ResizeObserver 가 크기가 같아도 다시 그린다 */
  let ghost = false;
  const measure = () => {
    const r = host.getBoundingClientRect();
    ghost = !r.width && !r.height;
    size = { w: Math.max(1, r.width), h: Math.max(1, r.height) };
  };
  const clamp = (v: View) => clampView(v, home, homeBox);
  /** 정답 칸이 '알려 주는 자리'(노랑)인가 */
  const telling = () => marks.tell ?? !!(marks.no || marks.blink);
  /** 바탕색(이번 과 아님)이 아닌 칸: 고를 수 있거나 채움 값이 있는 칸 */
  const lit = (cid: string) => active.has(cid) || (!!fills && cid in fills);

  /** 섬 상자: 공부할 칸에 먼 섬이 있거나 채움 지도일 때만(insetAlways 면 늘) 보이고, 칸 상태(문제·정답·오답·채움·강조)를 본 지도와 같게 */
  function paintInset() {
    paintIsles();
    if (!inset) return;
    inset.box.hidden = !(opt.insetAlways || fills || inset.paths.some((p) => active.has(p.id)));
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

  /* ---------- 섬 상자(동 단원) ---------- */

  /**
   * 칸 상태 글(섬 상자 안 칸): 먼 섬 상자(paintInset)와 같은 규칙에 힌트 흐림을 더한다. 상태는 그 상자의 섬(own)에만 —
   * 상자 범위에 함께 드는 다른 칸(다른 섬 조각·본 땅 동)은 늘 맥락색(그 곳은 제 상자나 본 지도에 있다. 문제 노랑이 두 상자에 보이지 않게)
   */
  const isleCls = (id: string, own: string) => {
    if (id !== own) return 'cm-cell ctx';
    const cls = [fills && id in fills ? `cm-cell lv${fills[id]}` : active.has(id) ? 'cm-cell' : 'cm-cell ctx'];
    // 밝은 칸(고를 칸·채움 칸)이면 둘레를 굵게: 상자 안의 섬 하나가 곧 밝은 묶음이라 본 지도의 묶음 둘레(partRim·rimD)와 같다 — 범례 '고를 칸'(굵은 네모)과도 맞다
    if (lit(id)) cls.push('pick');
    if (highlight?.has(id)) cls.push('hl');
    if (hint && !hint.has(id)) cls.push('dim');
    if (bold?.has(id)) cls.push('cm-bolded');
    if (marks.no === id) cls.push('cm-no');
    else if (marks.ok === id) cls.push(telling() ? 'cm-ok tell' : 'cm-ok');
    else if (question === id) cls.push('cm-q');
    return cls.join(' ');
  };

  /** 밝은 칸이 모두 섬 상자에 드는가(격자 — 본 지도를 숨긴다) */
  const isleGrid = () => {
    if (!isles.length) return false;
    const on = S.ids.filter(lit);
    return on.length > 0 && on.every((cid) => isleSet.has(cid));
  };

  /** 섬 상자 자리: 지도 칸 크기·여백·격자 여부가 바뀔 때마다. 격자면 본 지도·축척 막대를 숨긴다 */
  function layoutIsle() {
    if (!isles.length || !isleTray) { isleL = null; svg.style.visibility = ''; return; }
    const grid = isleGrid();
    // 확대 상자 아래 줄(zGrow)은 섬 상자 자리에서 뺀다(늘리기 전 지도 칸에 둔다)
    const area = { x: pad.l, y: pad.t, w: Math.max(1, size.w - pad.l - pad.r), h: Math.max(1, size.h - pad.t - pad.b - zGrow) };
    // 섬이 모두 본 지도 범위 동쪽이면(경북 울릉군) 줄을 오른쪽에(isles.ts 머리 주석 — E14 검수)
    const views = isles.map((it) => it.view);
    const lay = (noteH: number) => {
      const L = isleL = layoutIsles(views, area, grid, !grid && isleEast(views, homeBox), noteH);
      isleTray!.className = `cm-isles ${L.mode}`;
      isles.forEach((it, i) => {
        const b = L.boxes[i];
        Object.assign(it.box.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
        fitIsleScale(it, b.w - 2, b.h - 2);   // 상자 안쪽(테두리 1px 씩 뺀 곳)이 그림(svg)과 축척 칸의 틀
        placeIsleScale(it);
      });
      return L;
    };
    let L = lay(ISLE_NOTE_H);
    // 글과 막대가 한 줄로는 상자 묶음보다 넓으면(영어 'Far islands ━ 2km' — 상자 하나 128px) 막대를 글 아래 줄로 내리고 글 칸을 두 줄 높이로(결정표 D111 사용자 결정 2026-11-17:
    // 전에는 글 칸이 옆으로 늘어나 낮은 폰에서 확대 상자가 그 끝 '2km' 를 덮었다). 한국어 '먼 섬 ━ 2km' 는 상자 안에 들어 그대로다
    const noteEl = isleNote!;
    noteEl.classList.remove('wrap');
    Object.assign(noteEl.style, { minWidth: '', width: '', height: '' });
    if (isleNoteBar && noteEl.offsetWidth > L.note.w + 1) { noteEl.classList.add('wrap'); L = lay(2 * ISLE_NOTE_H - 2); }
    const n = L.note;
    // 폭은 상자 묶음 폭 이상(minWidth) — 글이 더 길면 오른쪽으로 늘어난다(E14: 영어 앱이 지역 섬 상자 — 경북 울릉 — 를 처음 그려
    // 그때 글 'Far islands · not to scale' 이 128px 칸에서 잘렸다. 2026-11-15 부터 글은 '먼 섬'·'Far islands' 뿐이라 칸 안에 든다).
    // 오른쪽 줄(side 'r')이면 칸 오른쪽 끝을 지도 칸 안쪽 끝에 맞춰 왼쪽으로 늘어나게 한다(지도 칸 밖으로 나가지 않게)
    // 두 줄로 꺾은 칸은 폭을 상자 묶음 폭에 못 박는다(세로로 쌓으면 칸이 지도 칸 끝까지 늘어나 글이 확대 상자 밑으로 들어갔다)
    Object.assign(isleNote!.style, { left: `${n.x}px`, top: `${n.y}px`, minWidth: `${n.w}px`, width: noteEl.classList.contains('wrap') ? `${n.w}px` : '', height: `${n.h}px` });
    if (L.side === 'r') { const w = isleNote!.offsetWidth; if (w > n.w) isleNote!.style.left = `${n.x + n.w - w}px`; }
    svg.style.visibility = grid ? 'hidden' : '';
    host.classList.toggle('isle-grid', grid);
  }

  /** 섬 상자 칸을 본 지도와 같은 상태로 칠하고, 이름표가 있는 섬은 상자 왼쪽 위에 이름(이름표를 그리지 않는 좁은 지도에서는 뺀다) */
  function paintIsles() {
    if (!isles.length) return;
    const text = new Map(size.w >= labelMinW ? labels.map((l) => [l.id, l.text]) : []);
    for (const it of isles) {
      for (const p of it.paths) p.el.setAttribute('class', isleCls(p.id, it.id));
      const t = text.get(it.id) ?? '';
      it.name.textContent = t;
      it.name.hidden = !t;
      placeIsleScale(it);   // 이름 칸이 생기거나 없어지면 축척 칸 귀퉁이도 다시 고른다(덮는 정도는 fit 에 재 둔 값)
    }
  }

  /** 상자 안쪽 크기(w×h px)에 맞춘 축척 막대와 귀퉁이별 덮는 정도: 크기가 전과 같으면 그대로 둔다. 상자가 하나면 막대는 묶음 글 옆(귀퉁이는 재지 않는다) */
  function fitIsleScale(it: Isle, w: number, h: number) {
    const key = `${w.toFixed(1)}x${h.toFixed(1)}`;
    if (it.fit?.key === key) return;
    const s = insetScale(fitK(it.view, w, h), w);
    if (isleNoteBar) {
      setScaleChip(isleNoteBar, s);
      it.fit = { key, w, cw: 0, cover: null };
      return;
    }
    setScaleChip(it.scale, s);
    const c = scaleChip(s);
    const cells = it.paths.map((p) => ({ rings: p.rings, box: S.cells.get(p.id)!.box, own: p.id === it.id }));
    it.fit = { key, w, cw: c.w, cover: cornerCover(it.view, w, h, c.w, c.h, cells) };
  }

  /** 축척 칸 귀퉁이: 땅을 가장 적게 덮는 곳(섬 이름 칸 — 왼쪽 위 — 이 보이면 그 자리와 겹치는 귀퉁이는 뺀다. 이름 칸 폭은 글 폭 어림 + 여백 12 + 선 1) */
  function placeIsleScale(it: Isle) {
    if (!it.fit?.cover) return;
    const t = it.name.hidden ? '' : it.name.textContent ?? '';
    const nameW = t ? Math.ceil(textWidth(t, 14)) + 13 : 0;
    it.scale.className = `cm-sbar cm-isle-scale ${pickCorner(it.fit.cover, it.fit.w, it.fit.cw, nameW)}`;
  }

  /** 상자 안을 누름: 그 상자의 섬이 고를 칸이고 누른 자리가 섬 안이거나 INSET_SNAP_PX 안이면 그 섬(함께 그린 다른 칸은 맥락이라 고르지 않는다) */
  function isleTap(it: Isle, e: PointerEvent | MouseEvent) {
    const ctm = it.svg.getScreenCTM();
    if (!ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    let best: string | null = null, bestD = INSET_SNAP_PX / Math.max(1e-9, ctm.a);
    for (const p of it.paths) {
      if (p.id !== it.id || !active.has(p.id)) continue;
      const d = inside(p.rings, pt.x, pt.y) ? 0 : edgeDist(p.rings, pt.x, pt.y);
      if (d <= bestD) { best = p.id; bestD = d; }
    }
    const h = host.getBoundingClientRect();
    opt.onTap?.(best ? { type: 'cell', id: best } : { type: 'outside' }, { px: e.clientX - h.left, py: e.clientY - h.top });
  }

  /** 섬 상자를 새로 만든다(ids 가 바뀔 때만) */
  function buildIsles(ids: string[]) {
    isles = [];
    isleSet = new Set(ids);
    isleTray?.remove();
    isleTray = isleNote = isleNoteBar = null;
    if (!ids.length) return;
    const solo = ids.length === 1;
    const tray = document.createElement('div');
    tray.className = 'cm-isles';
    tray.setAttribute('aria-hidden', 'true');   // 그림의 일부(지도 칸의 설명이 읽힌다)
    const interactive = (opt.interaction ?? 'full') !== 'none';
    if (interactive) {
      const stop = (e: Event) => e.stopPropagation();
      // 상자 밖 빈 곳(격자의 틈)을 누르면 본 지도로 내려가지 않게: 본 지도는 숨었거나 상자 밑이다
      for (const ev of ['pointerdown', 'pointermove', 'wheel', 'click']) tray.addEventListener(ev, stop);
      tray.addEventListener('pointerup', (e) => {
        e.stopPropagation();
        if (!(e.target as HTMLElement).closest('.cm-isle') && isleL?.mode === 'grid') {
          const h = host.getBoundingClientRect();
          opt.onTap?.({ type: 'outside' }, { px: e.clientX - h.left, py: e.clientY - h.top });
        }
      });
    }
    for (const id of ids) {
      const view = isleView(S.cells.get(id)!.rings, S.cells.get(id)!.r);
      const box = document.createElement('div');
      box.className = 'cm-isle';
      box.dataset.id = id;
      const isvg = el('svg', { class: 'cm-inset-svg cm-isle-svg', viewBox: `${view[0]} ${view[1]} ${view[2] - view[0]} ${view[3] - view[1]}`, preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true' });
      box.appendChild(isvg);
      // 상자 범위에 드는 이웃 땅(다른 시·군·구 — 안산 대부동 상자의 화성시 등)을 칸 밑에(바탕은 바다색 — 2026-11-17)
      for (const d of outDIn(S, view)) if (d) el('path', { d, class: 'cm-out-fill' }, isvg);
      // 상자 범위에 드는 칸(섬 자신 + 가까운 다른 동). 섬 자신을 맨 위에
      const inView = S.ids.filter((cid) => { const b = S.cells.get(cid)!.box; return cid !== id && b[0] < view[2] && b[2] > view[0] && b[1] < view[3] && b[3] > view[1]; });
      const paths = [...inView, id].map((cid) => ({ id: cid, rings: S.cells.get(cid)!.rings, el: el('path', { d: S.cells.get(cid)!.d, class: 'cm-cell' }, isvg) }));
      const name = document.createElement('span');
      name.className = 'cm-isle-name';
      name.hidden = true;
      // 축척 칸: 길이·귀퉁이는 상자 자리가 정해질 때(layoutIsle). 상자가 하나면 쓰지 않는다(막대는 묶음 글 옆)
      const scale = scaleChipEl({ px: 0, text: '' });
      scale.className = 'cm-sbar cm-isle-scale br';
      scale.hidden = solo;
      box.append(name, scale);
      tray.appendChild(box);
      const it: Isle = { id, view, box, svg: isvg, name, scale, paths, fit: null };
      if (interactive) box.addEventListener('pointerup', (e) => { e.stopPropagation(); isleTap(it, e); });
      isles.push(it);
    }
    // 묶음 글: '먼 섬'(축척은 상자마다 칸에, 상자가 하나면 이 글 옆에 — 2026-11-15 전에는 '먼 섬 · 축척 다름')
    const note = document.createElement('span');
    note.className = 'cm-isles-note';
    const label = document.createElement('span');
    const far = opt.farIsles;
    label.textContent = far && !ids.some((id) => far.includes(id)) ? (opt.isleNote ?? '섬') : (opt.insetNote ?? '먼 섬');
    note.appendChild(label);
    if (solo) note.appendChild((isleNoteBar = scaleChipEl({ px: 0, text: '' })));
    tray.appendChild(note);
    host.appendChild(tray);
    isleTray = tray;
    isleNote = note;
  }

  /** 굵은 선(과 둘레 setRim · 칸 테두리 setBold)의 본 지도 몫: 섬 상자 칸은 빼고(상자 안에서 굵게) */
  function drawRims() {
    const main = (s: Set<string> | null) => (s && isleSet.size ? new Set([...s].filter((cid) => !isleSet.has(cid))) : s);
    const r = main(rim), b = main(bold);
    lessonRim.setAttribute('d', r?.size ? S.rimOf(r) : '');
    lessonBank.setAttribute('d', r?.size ? S.bankOf(r) : '');
    boldEl.setAttribute('d', b?.size ? S.outlineOf(b, { bank: false }) : '');
    boldBank.setAttribute('d', b?.size ? S.bankOf(b) : '');
  }

  function paintCells() {
    const litIds: string[] = [];
    for (const [cid, p] of cellEl) {
      // 섬 상자 칸은 본 지도에서 맥락색(상자에만 밝게 — 줄 배치에서 같은 섬이 본 지도와 상자에 두 번 밝게 보이지 않게, E5 검수)
      if (isleSet.has(cid)) { p.setAttribute('class', 'cm-cell ctx'); continue; }
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
    // 과 판: 밝은 칸이 일부뿐이면 나머지 선을 옅게 낮추고(.part), 밝은 묶음의 안쪽 경계와 둘레만 먹선으로 다시 긋는다(섬 상자 칸은 뺀 본 지도 몫)
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
    if (loc) {
      locMain = litIds;
      locLitIds = isleSet.size ? S.ids.filter(lit) : litIds;
    }
    // 밝은 칸이 바뀌어 섬 상자가 격자 ↔ 줄로 바뀌면 자리와 본 지도 맞춤을 다시
    if (isles.length && isleGrid() !== (isleL?.mode === 'grid')) {
      layoutIsle();
      home = fitView(homeBox, size, effPad());
      if (!zoomedFlag) commit(home);
    }
    paintInset();
    // 이번 과가 바뀌면 확대 상자를 붙일지·자리(아래 줄 높이가 바뀌면 본 지도를 다시 맞춘다 — 이름표가 상자로 옮겨 가려면 먼저)
    if (syncZoom()) { home = fitView(homeBox, size, effPad()); if (!zoomedFlag) commit(home); }
    syncLoc();                         // 이번 과가 바뀌면 위치 지도 칠·귀퉁이(이름표가 위치 지도를 피하려면 먼저)
    if (labels.length) drawLabels();   // 이름표 색(흰·먹)이 칸 색을 따른다
    else drawSea();                    // 위치 지도·섬 상자 자리가 바뀌었으면 바다 이름도 비킨다
    mirrorZoom();
  }

  /* ---------- 확대 상자(map/zoombox.ts) ---------- */

  /**
   * 확대 상자를 붙일지와 자리: key(과 범위·본 지도 범위·여백·늘리기 전 지도 칸 크기·이번 과·섬 상자·먼 섬 상자·축척 막대)가 바뀔 때만 다시 정한다.
   * 판정은 늘리기 전 지도 칸의 본 지도 기본 보기로 한다.
   * 줄에 두어 지도 칸을 늘리면 지도 칸 높이 상한에서 그 높이를 빼므로(app.css #app .h-map.zoom-below — 첫 화면 규칙) 늘리기 전 지도 칸이 낮아질 수 있다.
   * 그 높이로 다시 고르면 귀퉁이 ↔ 줄이 오갈 수 있어, 높이 말고 바뀐 것이 없으면(dKey 가 같으면) 고른 줄(아래·옆)과 상자 크기를 그대로 둔다.
   * 새로 고를 때는 늘린 줄을 먼저 걷고 지도 칸을 다시 잰다(늘리기 전 지도 칸과 원래 높이 상한으로 고른다).
   * 지도 칸 높이(zGrow)나 본 지도 여백 몫(zAt.add)이 바뀌면 true — 부르는 쪽이 본 지도를 새 크기·여백으로 다시 맞춘다
   */
  function syncZoom(): boolean {
    if (!zoom && !zOn && !zGrow) return false;
    const keys = () => {
      const grid = isleL?.mode === 'grid';
      const ids = S.ids.filter((cid) => lit(cid) && !isleSet.has(cid));
      const base: Size = { w: size.w, h: size.h - zGrow };
      const p = isleShift(pad);
      const scaleOn = !!scale && size.w >= (opt.scaleMinWidth ?? COMPACT_PX) && !grid;
      const insetAt = inset && !inset.box.hidden ? (host.classList.contains('inset-bl') ? 'bl' : 'tl') : '';
      const isleK = isleL && !grid ? [...isleL.boxes, isleL.note].map((b) => `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)},${Math.round(b.h)}`).join(';') : '';
      // 지도 칸 높이 상한(app.css #app .h-map max-height — 늘린 줄까지 합쳐 이 안. 늘려 두었으면 그만큼 빼 둔 상한이라 되돌려 읽는다). 화면 높이가 바뀌어 상한이 바뀌면 다시 고른다
      const mh = zoom ? parseFloat(getComputedStyle(host).maxHeight) : NaN;
      const cap = Number.isFinite(mh) ? mh + zGrow : Infinity;
      const dKey = zoom ? `${zoom.fit.map((v) => v.toFixed(0)).join(',')}|${homeBox.map((v) => v.toFixed(0)).join(',')}|${pad.t},${pad.r},${pad.b},${pad.l}|${Math.round(base.w)}|${Math.round(cap)}|${ids.join(',')}|${grid}` : '';
      const key = `${dKey}|${Math.round(base.h)}|${p.t},${p.r},${p.b},${p.l}|${insetAt}|${scaleOn}|${isleK}`;
      return { grid, ids, base, p, scaleOn, cap, dKey, key };
    };
    let k = keys();
    if (k.key === zKey) return false;
    zKey = k.key;
    const stay = !!zAt && ZOOM_ROW.includes(zAt.mode) && k.dKey === zDKey;
    zDKey = k.dKey;
    const addKey = () => (zAt ? `${zAt.add.l},${zAt.add.r},${zAt.add.b}` : '');
    const grow0 = zGrow, add0 = addKey(), was = zSig();
    // 늘린 줄을 걷고 다시 고르면 그때의 key(늘리기 전 칸)를 zKey 로 두고 true 를 돌린다: 부르는 쪽이 다시 그리며 이 함수가 늘린 칸으로 자리만 다시 잰다(keep) —
    // 처음 열 때와 같은 차례. 늘린 높이가 전과 같다고 false 를 돌리면 그 단계가 빠져, 상자 가로 자리가 늘리기 전 칸의 섬 상자·범위 네모로 정한 채 남았다
    // (2026-11-15 실제 시계 CDP — 제주시 1과를 390×664 에서 844×390 으로 바꾸면 상자 x 148, 새로 열면 286)
    const reset = !stay && zGrow > 0;
    if (reset) { setGrow(0); measure(); layoutIsle(); k = keys(); zKey = k.key; }
    const v = fitView(homeBox, k.base, k.p);
    const on = !!zoom && !k.grid && k.ids.length > 0 && k.ids.length < S.ids.length && zoomNeed(k.ids.map((id) => S.cells.get(id)!.box), v.u);
    zOn = on;
    zIds = new Set(on ? k.ids : []);
    zAt = on ? layoutZoom(k.ids, k.base, v, k.p, k.cap, k.scaleOn, stay ? zAt : null) : null;   // 상자 이름표 칸(zLab)도 정한다
    if (!on) zLab = new Set();
    if (!on && zb) { zb.box.hidden = true; zb.frame.setAttribute('display', 'none'); }
    // 처음 붙거나(창 크기가 바뀌어 처음 붙을 때도 — ResizeObserver → commit 길) 이번 과·상자 이름표 칸이 바뀌면 작은 지도의 칠·이름표를 본 지도에 맞춘다
    // (2026-11-15 점검: 이 길에서 맞추지 않아 상자가 빈 채로 그려지고, 본 지도는 이번 과 이름표를 상자로 넘겨 이름이 어디에도 없었다)
    if (on && zSig() !== was) mirrorZoom();
    const grow = zAt?.grow ?? 0;
    // 창 크기가 바뀌어 이 줄 높이가 바뀌면 ResizeObserver 콜백(→ commit → 여기) 안에서 관찰 중인 지도 칸 높이를 바꾸게 되어, 브라우저가 window 에
    // 'ResizeObserver loop completed with undelivered notifications.' 오류 이벤트를 한 번 낸다(2026-11-15 점검 — 화면·칠·이름표는 맞고 고리는 돌지 않는다,
    // 다음 알림에서 같은 key 라 바로 끝난다). 앱에는 전역 오류 처리기가 없어 보이지 않는다 — 나중에 오류 수집을 붙이면 이 글을 걸러야 한다(D95 ㉣)
    if (grow !== zGrow) { setGrow(grow); measure(); layoutIsle(); }
    return zGrow !== grow0 || addKey() !== add0 || reset;
  }

  /** 상자를 두려고 지도 칸을 아래로 늘린다(map.css .cmap.zoom-below — 늘린 몫은 아래 안쪽 여백 --zb-h, 0 이면 걷는다) */
  function setGrow(g: number) {
    zGrow = g;
    host.classList.toggle('zoom-below', g > 0);
    if (g) host.style.setProperty('--zb-h', `${g}px`);
    else host.style.removeProperty('--zb-h');
    // 왼쪽 아래 먼 섬 상자(insetPad 가 고른 자리)는 늘리기 전 지도 칸의 왼쪽 아래 그대로(map.css bottom 12px)
    if (inset) inset.box.style.bottom = g && host.classList.contains('inset-bl') ? `${g + 12}px` : '';
  }

  /** 상자를 만든다(처음 붙일 때 한 번): 상자 → 작은 지도 자리 + 아래 칸('확대' + 축척 칸 — 먼 섬 상자 아래 칸과 같은 꼴), 본 지도의 범위 네모(이름표·기호 층 아래) */
  function buildZoom(): NonNullable<typeof zb> {
    const box = document.createElement('div');
    box.className = 'cm-zoom';
    box.setAttribute('aria-hidden', 'true');   // 그림의 일부: 이번 과 이름은 쪽 위 글 줄에 있다
    const mapEl = document.createElement('div');
    mapEl.className = 'cm-zoom-map';
    const note = document.createElement('span');
    note.className = 'cm-inset-note';
    const label = document.createElement('span');
    const chip = scaleChipEl({ px: 0, text: '' });
    note.append(label, chip);
    box.append(mapEl, note);
    host.appendChild(box);
    const frame = el('rect', { class: 'cm-zoom-frame' });
    svg.insertBefore(frame, gCtx);
    return { box, mapEl, label, chip, frame, map: null };
  }

  /**
   * 상자를 그리고 자리를 정한다(zoombox.ts zoomSize · zoomPlace). 작은 지도는 과 범위(zoomFit — 몰리면 작은 칸 묶음으로 좁힌다)를 ZB_PAD 안쪽에 맞추고,
   * 본 지도에는 그 작은 지도가 보이는 범위를 네모로.
   * 자리를 피할 것은 위치 지도(layoutLoc)와 같다: 먼 섬 상자, 축척 막대(가장 긴 막대 + 여백), 섬 상자 줄과 그 글 칸 — 그리고 범위 네모.
   * base = 늘리기 전 지도 칸, v = 그 칸의 본 지도 기본 보기, p = 본 지도 여백(섬 상자 줄 몫까지), cap = 지도 칸 높이 상한(px — 늘린 줄까지 이 안),
   * keep = 고르지 않고 그 줄·그 상자 크기 그대로(syncZoom)
   */
  function layoutZoom(ids: string[], base: Size, v: View, p: Pad, cap: number, scaleOn: boolean, keep: ZoomPlace | null): ZoomPlace {
    const z = zb ?? (zb = buildZoom());
    const fit = zoom!.fit;
    // 상자 그림은 가장 넓은 이번 과 이름표 판이 들 폭 이상(zoomWide — 상자 글자는 폰·넓은 상자 모두 labelPx 14)
    const plate = Math.max(0, ...ids.map((id) => { const t = labels.find((l) => l.id === id)?.text; return t ? labelBox(t, labelPx(ZB_W_WIDE)).w : 0; }));
    const wide = base.w >= COMPACT_PX, full = zoomWide(zoomSize(wide), plate);
    const zpad: Pad = { t: ZB_PAD, r: ZB_PAD, b: ZB_PAD, l: ZB_PAD };
    // 작은 지도: 크기를 먼저 준 뒤(지도가 자기 칸을 잰다) 과 범위로 맞춘다. 상자 틀 몫(테두리·아래 칸)은 이 크기로 잰다
    const sizeMap = (s: Size) => Object.assign(z.mapEl.style, { width: `${s.w}px`, height: `${s.h}px` });
    let pic = keep?.pic ?? full;
    sizeMap(pic);
    z.box.hidden = false;
    z.label.textContent = zoom!.note;
    if (!z.map) z.map = createSvgMap(z.mapEl, { shapes: { ...S, far: null }, interaction: 'none', labelDotPx: ZB_DOT_PX, seaNames: false });
    const chrome: Size = { w: z.box.offsetWidth - pic.w, h: z.box.offsetHeight - pic.h };
    // 상자 범위(zoombox.ts zoomFit — 큰 칸이 과 범위를 넓혀 상자 그림 s 에서도 작은 동이 몰리면 작은 칸 묶음으로 좁힌다. 이름표 판은 상자 그림 폭의 글자 크기)
    const text = new Map(labels.map((l) => [l.id, l.text])), alt = new Map(labels.filter((l) => l.fitText).map((l) => [l.id, l.fitText!]));
    const cellsOf = (s: Size, tx: Map<string, string>) => ids.map((id): ZoomCell => {
      const c = S.cells.get(id)!, t = tx.get(id);
      return { box: c.box, pt: c.label, lb: t ? labelBox(t, labelPx(s.w)) : { w: 0, h: 0 } };
    });
    // 영어 동 과는 한국어 이름 판 크기로도 잰다(fitText — zoomFit alt, 결정표 D110)
    const fitOf = (s: Size) => zoomFit(fit, cellsOf(s, text), s, alt.size ? cellsOf(s, alt) : null);
    // 상자 그림 s 가 보이는 범위(지도 단위)와, 본 지도를 cell 크기·여백 add 로 맞췄을 때 그 범위의 자리(px)
    const range = (s: Size) => viewBox(fitView(fitOf(s), s, zpad), s);
    const layout: ZoomLayout = (cell, add, s) => {
      const vv = add.l || add.r ? fitView(homeBox, cell, { ...p, l: p.l + (add.l ?? 0), r: p.r + (add.r ?? 0) }) : fitView(homeBox, cell, p);
      const [rx, ry, rw, rh] = range(s), [vx, vy] = viewBox(vv, cell);
      return { u: vv.u, frame: { x: (rx - vx) / vv.u, y: (ry - vy) / vv.u, w: rw / vv.u, h: rh / vv.u } };
    };
    const [vx, vy] = viewBox(v, base);
    // 귀퉁이를 쓰는 것(위치 지도 layoutLoc 과 같은 몫)
    const blocks: Rect[] = [];
    if (inset && !inset.box.hidden) blocks.push({ x: inset.box.offsetLeft, y: inset.box.offsetTop, w: inset.box.offsetWidth, h: inset.box.offsetHeight });
    if (scaleOn) blocks.push(locRect('br', base, 136, 40, 6));
    if (isleL && isleL.mode !== 'grid') blocks.push(...isleL.boxes, isleL.note);
    const view: Box = [vx, vy, vx + base.w * v.u, vy + base.h * v.u];
    const own = new Set(ids);
    const cells: IsleCell[] = [];
    for (const id of S.ids) {
      const c = S.cells.get(id)!;
      if (isleSet.has(id) || c.box[2] < view[0] || c.box[0] > view[2] || c.box[3] < view[1] || c.box[1] > view[3]) continue;
      cells.push({ rings: c.rings, box: c.box, own: own.has(id) });
    }
    // 넓어도 낮은 칸(가로로 돌린 폰 — ZB_WIDE_CAP)에서 넓은 상자가 귀퉁이에 들지 않으면 폰 상자로(alt)
    const small = wide && cap < ZB_WIDE_CAP ? zoomWide(zoomSize(false), plate) : null;
    const at = zoomPlace({ size: base, cap, pic: full, chrome, blocks, view, cells, layout, keep: keep && { mode: keep.mode, pic: keep.pic }, alt: small });
    // 고른 상자 크기로 작은 지도를 맞추고(아래 줄에서 낮출 수 있다), 축척 칸과 본 지도의 범위 네모(지도 단위)를 그린다
    if (at.pic.w !== pic.w || at.pic.h !== pic.h) sizeMap((pic = at.pic));
    // 범위 네모 = 작은 지도가 실제로 보이는 범위(같은 fitZ · 같은 그림 크기 · 같은 여백)
    const fitZ = fitOf(pic);
    z.map.setHome(fitZ, zpad);
    const zv = fitView(fitZ, pic, zpad);
    setScaleChip(z.chip, insetScale(1 / zv.u, pic.w));
    const [rx, ry, rw, rh] = viewBox(zv, pic);
    // 상자 이름표 칸: 좁히지 않았으면 이번 과 본 지도 칸 모두(전과 같다). 좁혔으면 이름표 점이 작은 지도가 보이는 범위(= 본 지도 범위 네모) 안인 칸만,
    // 나머지(점까지 잘린 큰 칸)는 본 지도에 이름표를 단다(drawLabels). 점이 상자 가장자리 여백 띠에 든 칸도 상자에 둔다 — 처음에는 여백 안(viewRect)만 세어
    // 390×844 제주시 1과 연동이 상자에 이름 없이 칠해지고 본 지도 지시선이 범위 네모 안을 가리켰다(2026-11-15 점검)
    zLab = new Set(fitZ === fit ? ids : ids.filter((id) => {
      const [x, y] = S.cells.get(id)!.label;
      return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
    }));
    z.frame.setAttribute('x', rx.toFixed(1));
    z.frame.setAttribute('y', ry.toFixed(1));
    z.frame.setAttribute('width', rw.toFixed(1));
    z.frame.setAttribute('height', rh.toFixed(1));
    z.frame.removeAttribute('display');
    Object.assign(z.box.style, { left: `${Math.round(at.x)}px`, top: `${Math.round(at.y)}px` });
    return at;
  }

  /** 작은 지도의 칠·이름표를 본 지도와 같게(이번 과 본 지도 칸만 밝게 — 섬 상자 칸은 섬 상자에 있다) */
  function mirrorZoom() {
    const m = zb?.map;
    if (!m || !zOn) return;
    m.setActive([...zIds]);
    m.setFills(fills ? Object.fromEntries(Object.entries(fills).filter(([id]) => !isleSet.has(id))) : null);
    m.setHighlight(highlight ? [...highlight].filter((id) => zIds.has(id)) : null);
    m.setBold(bold ? [...bold].filter((id) => zIds.has(id)) : null);
    m.setLabels(labels.filter((l) => zLab.has(l.id)), { mode: labelMode });
  }

  /* ---------- 위치 지도(map/locator.ts) ---------- */

  /**
   * 보일지·귀퉁이·이번 과 칠은 key(과 범위 homeBox·여백·지도 칸 폭·밝은 칸·섬 상자 격자·먼 섬 상자 자리·축척 막대·섬 상자 자리)가 바뀔 때만 다시 정한다.
   * 지도 칸 높이는 key 에 넣지 않는다 — 한 문제 안에서 판정 띠가 늘고 줄어 높이만 바뀔 때(ResizeObserver) 위치 지도가 옮겨 다니거나 나타났다 사라지지 않게.
   * 대신 setHome(문제·쪽 보기를 정할 때)이 지도 칸을 다시 재고, 마지막으로 정한 높이(loc.usedH)와 다르면 다시 정하게 한다:
   * 폰 문제 화면은 문제마다(만나기·고르기·찾기) 단추 띠가 달라 지도 칸 높이가 다르다(2026-11-15 점검 — 전에는 첫 문제 전, 지도를 만들 때의 더 높은 칸으로 정한 귀퉁이를
   * 그 과 내내 써서 부산 1과 폰 찾기 화면에서 영도구 남쪽 끝을 덮었다).
   * 그 밖(그리기마다)에는 보이는 범위 네모만 맞춘다
   */
  function syncLoc() {
    if (!loc) return;
    const grid = isleL?.mode === 'grid';
    const insetAt = inset && !inset.box.hidden ? (host.classList.contains('inset-bl') ? 'bl' : 'tl') : '';
    const scaleOn = !!scale && size.w >= (opt.scaleMinWidth ?? COMPACT_PX) && !grid;
    const isleK = isleL && !grid ? [...isleL.boxes, isleL.note].map((b) => `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)},${Math.round(b.h)}`).join(';') : '';
    const p = effPad();
    // 이번 과 칠은 늘 흰 칸 + 먹 둘레(문제 화면 범례 '고를 칸'). 문제 화면의 노랑은 '테두리 친 칸'(문제 칸)이라 위치 지도의 과까지 노랑이면 문제 칸으로 읽힐 수 있다.
    // (과 시작에 위치 지도가 있던 때는 본 지도를 따라 노랑으로 칠했다 — 2026-11-15 부터 위치 지도는 문제 화면에만 있어 그 갈래를 지웠다)
    const key = `${homeBox.map((v) => v.toFixed(0)).join(',')}|${p.t},${p.r},${p.b},${p.l}|${Math.round(size.w)}|${locLitIds.join(',')}|${grid}|${insetAt}|${scaleOn}|${isleK}`;
    if (key !== loc.key) {
      loc.key = key;
      layoutLoc(grid, scaleOn);
    }
    if (!loc.box.hidden) drawLocView();
  }

  function layoutLoc(grid: boolean, scaleOn: boolean) {
    const L = loc!;
    L.usedH = size.h;
    const cover = viewCover(fitView(homeBox, size, effPad()), size, L.whole);
    if (!locShow({ cover, lit: locLitIds.length, total: S.ids.length, grid })) { L.box.hidden = true; return; }
    // 귀퉁이를 쓰는 것: 먼 섬 상자(크기 그대로), 축척 막대(오른쪽 아래 — 막대 길이가 배율마다 달라 가장 긴 막대 120 + 여백으로 잡는다), 섬 상자 줄과 그 글 칸
    const blocks: { x: number; y: number; w: number; h: number }[] = [];
    if (inset && !inset.box.hidden) blocks.push({ x: inset.box.offsetLeft, y: inset.box.offsetTop, w: inset.box.offsetWidth, h: inset.box.offsetHeight });
    if (scaleOn) blocks.push(locRect('br', size, 136, 40, 6));
    if (isleL && !grid) blocks.push(...isleL.boxes, isleL.note);
    // 귀퉁이마다 덮는 정도: 과 기본 보기에서 위치 지도(+ 가장자리 여백) 밑에 깔리는 칸. 이번 과의 본 지도 칸은 OWN_W 배(isles.ts — 사실상 먼저 피한다)
    const vb = viewBox(fitView(homeBox, size, effPad()), size);
    const view: Box = [vb[0], vb[1], vb[0] + vb[2], vb[1] + vb[3]];
    const own = new Set(locMain);
    const cells: IsleCell[] = [];
    for (const id of S.ids) {
      const c = S.cells.get(id)!;
      if (isleSet.has(id) || c.box[2] < view[0] || c.box[0] > view[2] || c.box[3] < view[1] || c.box[1] > view[3]) continue;
      cells.push({ rings: c.rings, box: c.box, own: own.has(id) });
    }
    const fitAt = (side: number) => {
      const fr = locFrame(L.whole, side), W = fr.w + 2, H = fr.h + 2;   // 틀 1px 씩
      const free = locCorners(size, W, H, blocks, L.avoid);
      if (!free.length) return null;
      const cv = locCover(view, size, W + LOC_MARGIN, H + LOC_MARGIN, cells);
      const at = pickLoc(cv, free)!;
      return { f: fr, at, cover: cv[at] };
    };
    // 어느 귀퉁이든 이번 과 칸에 걸리면 가장 작은 크기(LOC_MIN)로 다시 잰다(2026-11-15 흉내 — 여러 과 단원 703과 가운데 폰 문제 7과·PC 문제 5과가 걸렸고,
    // 작게 하면 390×570 에서 폰 경기 1과 하나만 조금 걸린다. 점검 흉내로는 고르기 화면 높이 510 에서 부산 1과도 조금 걸린다 — D95 ㉢).
    // 그래도 걸리면 덜 걸리는 쪽을 그대로 보인다(누름은 밑의 지도로 간다)
    const side = locSide(size, COMPACT_PX);
    let got = fitAt(side);
    if (got && got.cover >= OWN_W && side > LOC_MIN) {
      const small = fitAt(LOC_MIN);
      if (small && small.cover < got.cover) got = small;
    }
    if (!got) { L.box.hidden = true; return; }
    const { f, at: corner } = got;
    // 모양: 바탕은 지역·틀마다 한 번(locBase 가 기억), 이번 과 칠은 밝은 칸이 바뀔 때만
    const baseKey = `${f.w},${f.h},${f.k}`;
    if (baseKey !== L.baseKey) {
      L.baseKey = baseKey;
      L.litKey = '';
      const b = locBase(S, f);
      Object.assign(L.svg.style, { width: `${f.w}px`, height: `${f.h}px` });
      L.svg.setAttribute('viewBox', `0 0 ${f.w} ${f.h}`);
      L.far.setAttribute('d', b.far);
      L.out.setAttribute('d', b.out);
      L.land.setAttribute('d', b.land);
      L.water.setAttribute('d', b.water);
      L.rim.setAttribute('d', b.rim);
    }
    L.frame = f;
    const litKey = locLitIds.join(',');
    if (litKey !== L.litKey) {
      L.litKey = litKey;
      const lt = locLit(S, locBase(S, f), f, locLitIds);
      L.lit.setAttribute('d', lt.fill);
      L.litRim.setAttribute('d', lt.rim);
    }
    L.box.className = `cm-loc ${corner}`;
    L.box.hidden = false;
  }

  /**
   * 보이는 범위 네모(그리기마다 — 좌표 넷만). 위치 지도 틀 밖으로 나가는 변은 틀 안쪽(선 반 폭)에 맞춰 네 변이 늘 보이게 한다
   * (자르면 변이 없는 쪽이 '더 이어진다'처럼 보였다 — 경기 3과 폰 문제 화면)
   */
  function drawLocView() {
    const f = loc!.frame;
    if (!f) return;
    const [x, y, w, h] = viewBox(rendered, size);
    const e = 0.75;
    const x0 = Math.max(e, (x - f.x0) * f.k + f.ox), y0 = Math.max(e, (y - f.y0) * f.k + f.oy);
    const x1 = Math.min(f.w - e, (x + w - f.x0) * f.k + f.ox), y1 = Math.min(f.h - e, (y + h - f.y0) * f.k + f.oy);
    const r = loc!.view;
    r.setAttribute('x', x0.toFixed(1));
    r.setAttribute('y', y0.toFixed(1));
    r.setAttribute('width', Math.max(0, x1 - x0).toFixed(1));
    r.setAttribute('height', Math.max(0, y1 - y0).toFixed(1));
  }

  /* ---------- 보기 ---------- */

  function show(v: View) {
    shown = v;
    const { k, tx, ty } = cssBetween(rendered, v, size);
    svg.style.transform = Math.abs(k - 1) < 1e-9 && Math.abs(tx) < 0.01 && Math.abs(ty) < 0.01 ? '' : `translate(${tx}px, ${ty}px) scale(${k})`;
  }

  function paintScale() {
    if (!scale) return;
    const hide = size.w < (opt.scaleMinWidth ?? COMPACT_PX) || isleL?.mode === 'grid';
    scale.box.hidden = hide;
    if (hide) return;
    const s = scaleStep(rendered.u);
    scale.text.textContent = s.text;
    scale.bar.style.width = `${Math.round(s.px)}px`;
    // 아래를 가리는 것(실험실의 시트)이 있으면 그 위로 올린다(scaleLift 일 때만). 섬 상자 가로 줄이 오른쪽 끝에 붙었으면(동쪽 섬) 줄 위로
    const rowR = isleL?.mode === 'row' && isleL.side === 'r';
    // 확대 상자 아래 줄(zGrow)이 있으면 막대는 늘리기 전 지도 칸의 오른쪽 아래에 그대로(map.css .cm-scale bottom 8px)
    scale.box.style.bottom = rowR ? `${Math.round(pad.b + isleL!.shift.b + zGrow)}px` : opt.scaleLift && pad.b > COVER_PX ? `${Math.round(pad.b + 8)}px` : zGrow ? `${zGrow + 8}px` : '';
  }

  /** 화면에 붙어 있는 것(섬 상자·축척 막대·위치 지도)의 자리를 지도 단위 상자로: 칸 밖 이름표가 그 밑에 깔리지 않게 */
  function screenBoxes(): Box[] {
    const out: Box[] = [];
    for (const e of [inset?.box, scale?.box, loc?.box, ...(zOn ? [zb?.box] : []), ...(isleL && isleL.mode !== 'grid' ? [...isles.map((it) => it.box), isleNote] : [])]) {
      if (!e || e.hidden || !e.offsetWidth) continue;
      const [x0, y0] = toMap(rendered, size, e.offsetLeft, e.offsetTop);
      const [x1, y1] = toMap(rendered, size, e.offsetLeft + e.offsetWidth, e.offsetTop + e.offsetHeight);
      out.push([x0, y0, x1, y1]);
    }
    return out;
  }

  /** 기본 보기에서 확대·이동했나(3% 넘게 키우거나 줄였거나 12px 넘게 옮김) */
  const movedFrom = (v: View) => Math.abs(v.u / home.u - 1) > 0.03 || Math.hypot(v.cx - home.cx, v.cy - home.cy) / v.u > 12;

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
    // 확대 상자(지도 칸 크기가 바뀌면 다시 정한다). 아래 줄 높이가 바뀌면 늘린 지도 칸으로 본 지도를 다시 맞춰 그린다(배율·자리는 늘리기 전과 같다)
    if (syncZoom()) { home = fitView(homeBox, size, effPad()); return commit(home); }
    syncLoc();                         // 위치 지도도(귀퉁이는 바뀔 때만 다시 정하고, 그리기마다는 보이는 범위 네모만)
    if (opt.contextNames || dimLabels.length) drawContext();
    if (labels.length) drawLabels();   // 칸 안·칸 밖·빼기는 배율에 따라 달라진다
    else drawSea();                    // 이름표가 없는 지도도 바다 이름은 둔다(drawLabels 는 끝에 바다 이름을 놓는다)
    if (marks.ok || marks.no) drawSymbols();   // 기호는 이름표를 비켜 놓는다
    if (badges.length) drawBadges();
    const z = movedFrom(v);
    if (z !== zoomedFlag) {
      zoomedFlag = z;
      opt.onZoomed?.(z);
    }
    const ms = performance.now() - t0;
    opt.onCommit?.(ms);
    perf('commit', ms);
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

  // 문제·정답 칸 겹층. 섬 상자 칸은 상자 안에서만 칠한다(paintIsles — 본 지도에는 맥락색 그대로)
  const cellPath = (cid: string, cls: string) => (isleSet.has(cid) ? null : el('path', { d: S.cells.get(cid)!.d, class: cls }, gState));

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
      if (noCell && !isleSet.has(noCell)) cellEl.get(noCell)?.classList.add('no');   // 섬 상자 칸은 상자 안 .cm-no 로만
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
    const [x, y, w, h] = viewBox(rendered, size), u = rendered.u, p = effPad();
    return [x + Math.max(m, p.l) * u, y + Math.max(m, p.t) * u, x + w - Math.max(m, p.r) * u, y + h - Math.max(m, p.b) * u];
  };
  const cellOf = (cid: string) => S.cells.get(cid);
  const boxIn = (r: Box, x: number, y: number, w: number, h: number) => x - w / 2 >= r[0] && x + w / 2 <= r[2] && y - h / 2 >= r[1] && y + h / 2 <= r[3];

  /** 맥락 이름의 글(영어 화면은 바꿔서)과 글자 상자(px). 강 이름은 한글일 때만 자간이 넓다('한 강' — 영어 'Han River' 는 보통 자간) */
  const ctxText = (n: Shapes['names'][number]) => (opt.ctxName ? opt.ctxName(n) : n.text);
  const waterSp = (t: string) => (/[가-힣]/.test(t) ? WATER_SPACING : 0);
  const ctxSize = (t: string, kind: 'out' | 'water') => {
    const ls = t.split('\n');   // 영어 바다 이름 두 줄('East' / 'Sea')
    return { w: Math.ceil(Math.max(...ls.map((l) => textWidth(l, CTX_PX) + (kind === 'water' ? [...l].length * waterSp(l) * CTX_PX : 0)))) + 4, h: CTX_PX + 4 + (ls.length - 1) * Math.ceil(CTX_PX * 1.4) };
  };

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
  /**
   * 맥락 이름(이웃 땅·한강)의 자리 한 벌: 그리기(drawContext)와 칸 밖 이름표가 피할 자리(drawLabels avoid)가 같은 자리를 쓴다.
   * 이웃 땅 이름은 데이터 자리, 강 이름은 ctxSpot. show = 보이는 범위에 온전히 들어 그린다.
   * 이웃 땅 이름(out — 일반구 단원의 나머지 칸 이름 포함)이 먼저 그린 맥락 이름이나 화면에 붙은 것(위치 지도·확대 상자·섬 상자·축척 막대 — screenBoxes)과
   * 겹치면, 겹친 것에서 NUDGE_GAP_PX 떨어지는 자리 가운데 가장 가까운 곳(화면 3px 격자, NUDGE_PX 안 — 옆으로 벗어나는 데 더 들면 이름 글자 폭까지)으로 옮긴다 — 보이는 범위 안이고 지역 칸·그린 강·
   * 다른 맥락 이름·화면에 붙은 것과 겹치지 않는 곳. 그런 자리가 없으면 전처럼 데이터 자리(이름을 빼지는 않는다 — 이웃 시·도 이름 꼴은 D96 결정 거리).
   * 2026-11-16 점검: 완도군 둘러보기 폰에서 '강진군'·'장흥군'이 붙어 '강진군장흥군'으로 읽혔고(영어 'Gangjin-gun'·'Jangheung-gun'은 거의 포갬),
   * 완도 3과·고흥 1과 문제 화면에서 이웃 이름이 위치 지도 밑에 깔렸다
   */
  type CtxPut = {
    n: Shapes['names'][number]; t: string; w: number; h: number; at: [number, number] | null; show: boolean;
    /** 이웃 땅에 들지 않아 지시선으로 둘 이름(layCtxLead 가 이름표를 놓은 뒤 자리를 찾는다): home = 이웃 땅의 점, fb = 지시선 자리가 없을 때 쓸 전 방식 자리(없으면 그리지 않는다) */
    lead?: { home: [number, number]; fb: [number, number] | null };
  };
  /**
   * 이웃 땅 이름의 자리(2026-11-17 사용자 결정 D96 '정식 이름 + 완주군처럼 점을 찍고 선을 이어서'):
   *  ① 데이터 자리(이웃 땅에서 경계와 가장 먼 점)에 글자가 든다 — 보이는 범위 안이고, 이 지역 칸에 걸치지 않고, 먼저 놓은 맥락 이름·화면에 붙은 것과 겹치지 않으면 그대로
   *  ② 점을 덮은 채로 조금 옮겨 풀리면 그 자리(선 없이 — 이름이 여전히 그 땅 점 위에 있다)
   *  ③ 아니면 지시선 대상(lead): 이름표를 다 놓은 뒤 layCtxLead 가 빈자리를 찾아 점·선·이름을 그린다. 칸 밖 이름표가 피할 자리(avoid)에서는 빠진다 — 공부할 칸의 이름표가 먼저다
   *  점이 보이는 범위 밖이면 이름을 두지 않는다. 점이 화면에 붙은 것(위치 지도 등) 밑이면 선을 그을 수 없어 전 방식(가장 가까운 빈자리로 옮김 — 2026-11-16)으로 둔다.
   * 전 방식은 지시선 자리가 없을 때의 예비(fb)로도 남는다: 그때는 전처럼 그린다(이름을 빼지는 않는다)
   */
  function ctxPlaced(): CtxPut[] {
    const u = rendered.u, view = viewRect(4), g = NUDGE_GAP_PX * u;
    const hit = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
    const boxAt = (x: number, y: number, w: number, h: number): Box => [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
    const grow = (k: Box): Box => [k[0] - g, k[1] - g, k[2] + g, k[3] + g];
    const out: CtxPut[] = [];
    const drawn: Box[] = [];
    let screen: Box[] | null = null;
    // 이웃 땅 이름을 먼저, 강 이름은 그 뒤에: 좁은 지도에서 서울 땅에 '서울특별시'와 '한 강'이 함께 들지 않으면 강 이름을 뺀다(땅 이름이 먼저다)
    for (const n of [...S.names.filter((m) => m.kind !== 'water'), ...S.names.filter((m) => m.kind === 'water')]) {
      if (n.kind === 'water' && !river) continue;   // 그리지 않은 강에는 이름도 없다
      const t = ctxText(n);
      if (!t) continue;   // 영어 이름을 확인하지 않은 시·도(지역 표 enChecked false)는 영어 지도에 이름을 두지 않는다
      const b = ctxSize(t, n.kind), w = b.w * u, h = b.h * u;
      const spot = ctxSpot(n, t);
      if (n.kind === 'water' || !spot) {
        // 강 이름: 먼저 놓은 이웃 땅 이름과 겹치면 뺀다
        const show = !!spot && boxIn(view, spot[0], spot[1], w, h) && !drawn.some((k) => hit(grow(k), boxAt(spot[0], spot[1], w, h)));
        if (show && spot) drawn.push(boxAt(spot[0], spot[1], w, h));
        out.push({ n, t, w, h, at: spot, show });
        continue;
      }
      const [hx, hy] = spot;
      // 그 땅의 점이 안 보이면 이름도 두지 않는다
      if (hx < view[0] || hx > view[2] || hy < view[1] || hy > view[3]) { out.push({ n, t, w, h, at: spot, show: false }); continue; }
      const sc = screen ??= screenBoxes();
      const onCell = (x: number, y: number, nb: Box) => obstacles.some((ob) => hit(ob.box, nb) && boxHits(ob.rings, x, y, w, h));
      const homeIn = boxIn(view, hx, hy, w, h), hb = boxAt(hx, hy, w, h);
      const block = [...drawn, ...sc].filter((k) => hit(k, hb));
      // ① 데이터 자리 그대로
      if (homeIn && !block.length && !onCell(hx, hy, hb)) { drawn.push(hb); out.push({ n, t, w, h, at: spot, show: true }); continue; }
      // 겹친 것·화면에 붙은 것과 NUDGE_GAP_PX 떨어지고 지역 칸·그린 강·보이는 범위 밖에 걸치지 않는 자리
      const ok = (x: number, y: number, overRiver: boolean) => {
        if (!boxIn(view, x, y, w, h)) return false;
        const nb = boxAt(x, y, w, h);
        if (drawn.some((k) => hit(grow(k), nb)) || sc.some((k) => hit(grow(k), nb))) return false;
        if (onCell(x, y, nb)) return false;
        return overRiver || !(river && S.water.length && hit(waterBox, nb) && boxHits(S.water, x, y, w, h));
      };
      const st = 3 * u;
      const nearest = (rx: number, ry: number, round: boolean, overRiver: boolean): [number, number] | null => {
        const ni = Math.floor(rx / st), nj = Math.floor(ry / st);
        const offs: [number, number, number][] = [];
        for (let i = -ni; i <= ni; i++) for (let j = -nj; j <= nj; j++) { const d = Math.hypot(i, j) * st; if (d > 0 && (!round || d <= rx)) offs.push([i * st, j * st, d]); }
        offs.sort((p, q) => p[2] - q[2]);
        const mv = offs.find(([dx, dy]) => ok(hx + dx, hy + dy, overRiver));
        return mv ? [hx + mv[0], hy + mv[1]] : null;
      };
      // ② 그 땅 안에서 글자가 드는 가장 가까운 자리(선 없이). 글자 자체(상자 여유 2px 씩을 뺀 것)가 땅 안에 들면 된다. 제 땅 안이라 강 띠에 걸치는 것은 둔다 —
      //    2026-11-17 사용자 '한강을 지우고 서울을 넣으면 될 것 같다'(경기 지도: 한강이 서울 가운데를 지난다. 강 이름은 땅 이름 뒤에 놓고 겹치면 뺀다).
      //    땅 도형이 없으면(옛 캐시) 점을 덮은 채로 조금 옮기는 것까지만
      let near: [number, number] | null = null;
      if (n.land?.length) {
        const m = 2 * u, tw = Math.max(u, w - 2 * m), th = Math.max(u, h - 2 * m);
        let lb = landBoxes.get(n.land);
        if (!lb) {
          lb = [Infinity, Infinity, -Infinity, -Infinity];
          for (const r of n.land) for (let i = 0; i < r.length; i += 2) { lb[0] = Math.min(lb[0], r[i]); lb[1] = Math.min(lb[1], r[i + 1]); lb[2] = Math.max(lb[2], r[i]); lb[3] = Math.max(lb[3], r[i + 1]); }
          landBoxes.set(n.land, lb);
        }
        // 글자가 다 들지 않으면 글자 폭의 LAND_FIT(85%)만 들어도 둔다 — 양끝이 5px 쯤 경계에 걸친다(폰 경기 지도의 서울: 땅 폭이 글자 폭과 거의 같다)
        for (const f of [1, LAND_FIT]) {
          const fw = tw * f, e = m + (tw - fw) / 2;   // e = 땅 안에 들어야 하는 폭 밖으로 나가는 글자 상자의 한쪽 몫
          // 가운데가 올 범위: 땅 상자와 보이는 범위(글자 상자 전체가 들게 e 만큼 안쪽)가 겹치는 곳
          const vb: Box = [Math.max(lb[0], view[0] + e), Math.max(lb[1], view[1] + m), Math.min(lb[2], view[2] - e), Math.min(lb[3], view[3] - m)];
          if (vb[2] - vb[0] < fw || vb[3] - vb[1] < th) continue;
          const av = [...drawn, ...sc].map((k): Box => [k[0] - g - e, k[1] - g - m, k[2] + g + e, k[3] + g + m]);
          // 찾기는 범위 안으로 당긴 점에서 시작하고, 고른 자리의 글자 상자가 보이는 범위 안인지 다시 본다(fitBox 는 시작점이 땅 안이면 범위를 보지 않고 그 점을 돌려준다 —
          // 2026-11-17 탐침: 동 단원 지도 30곳쯤에서 이웃 이름이 지도 가장자리 밖으로 잘렸다)
          const from: [number, number] = [Math.min(Math.max(hx, vb[0] + fw / 2), vb[2] - fw / 2), Math.min(Math.max(hy, vb[1] + th / 2), vb[3] - th / 2)];
          near = fitBox(n.land, vb, from, fw, th, st, Math.hypot(lb[2] - lb[0], lb[3] - lb[1]), av);
          if (near && !boxIn(view, near[0], near[1], w, h)) near = null;
          if (near) break;
          // 강이 그 땅을 가르면(경기 지도의 서울 — 한강이 강북·강남 두 조각으로 나눈다) 땅과 강을 합친 곳 안에 드는 자리. 글자가 강 위에 걸친다
          if (!river || !S.water.length) continue;
          const key = `${u.toPrecision(6)}|${n.x},${n.y},${t}|${f}`;
          let c = landAt.get(key);
          if (c === undefined) {
            if (landAt.size > 200) landAt.clear();
            landAt.set(key, c = landSpan(n.land, lb, hx, hy, fw, th, st));
          }
          if (!c || !boxIn(view, c[0], c[1], w, h)) continue;
          const nb = boxAt(c[0], c[1], w, h);
          if (drawn.some((k) => hit(grow(k), nb)) || sc.some((k) => hit(grow(k), nb))) continue;
          near = c;
          break;
        }
      } else near = nearest(Math.max(0, w / 2 - 3 * u), Math.max(0, h / 2 - 2 * u), false, true);
      if (near) { drawn.push(boxAt(near[0], near[1], w, h)); out.push({ n, t, w, h, at: near, show: true }); continue; }
      // 전 방식 자리(예비): 글자가 보이는 범위에 들 때 데이터 자리, 겹친 것이 있으면 가장 가까운 빈자리(화면 3px 격자, NUDGE_PX 안 — 겹친 것을 옆으로 벗어나는 데 더 들면 이름 글자 폭까지)
      let fb: [number, number] | null = homeIn ? [hx, hy] : null;
      if (homeIn && block.length) {
        const side = Math.max(...block.map((k) => Math.min(hb[2] - k[0], k[2] - hb[0]) + g + 2 * st));
        const reach = Math.max(NUDGE_PX * u, Math.min(w, side));
        fb = nearest(reach, reach, true, false) ?? fb;
      }
      // 점이 화면에 붙은 것 밑이면 선을 그을 수 없다 — 전 방식으로
      if (sc.some((k) => hx >= k[0] && hx <= k[2] && hy >= k[1] && hy <= k[3])) {
        if (fb) drawn.push(boxAt(fb[0], fb[1], w, h));
        out.push({ n, t, w, h, at: fb, show: !!fb });
        continue;
      }
      // ③ 지시선 대상
      out.push({ n, t, w, h, at: null, show: false, lead: { home: [hx, hy], fb } });
    }
    return out;
  }

  /** 이웃 땅 도형의 상자(지도 단위 — 한 번만 잰다) */
  const landBoxes = new WeakMap<Float64Array[], Box>();
  /** 땅과 강을 합친 곳 안의 자리(배율·이름·비율마다 한 번 — landSpan) */
  const landAt = new Map<string, [number, number] | null>();
  /**
   * 그 땅과 그린 강을 합친 곳 안에 글자(폭 fw · 높이 th)가 드는, 이름 점에서 가장 가까운 자리(격자 st). 겹침·보이는 범위는 보지 않는다(부르는 쪽이 본다).
   * 글자 상자의 위·가운데·아래 줄을 st 간격으로 찍어 모든 점이 땅이나 강 안이면 든 것으로 친다. 없으면 null
   */
  function landSpan(land: Float64Array[], lb: Box, hx: number, hy: number, fw: number, th: number, st: number): [number, number] | null {
    const nx = Math.max(2, Math.ceil(fw / st) + 1);
    const fits = (x: number, y: number) => {
      for (const yy of [y - th / 2, y, y + th / 2]) for (let i = 0; i < nx; i++) {
        const xx = x - fw / 2 + (fw * i) / (nx - 1);
        if (!inside(land, xx, yy) && !inside(S.water, xx, yy)) return false;
      }
      return true;
    };
    const offs: [number, number, number][] = [];
    for (let x = hx - Math.floor((hx - lb[0]) / st) * st; x <= lb[2]; x += st) for (let y = hy - Math.floor((hy - lb[1]) / st) * st; y <= lb[3]; y += st) offs.push([x, y, Math.hypot(x - hx, y - hy)]);
    offs.sort((p, q) => p[2] - q[2]);
    const at = offs.find(([x, y]) => fits(x, y));
    return at ? [at[0], at[1]] : null;
  }
  /** 지시선으로 둔 이웃 이름의 글자 상자와 선(지도 단위 — 바다 이름이 피한다) · 자리를 정한 조건(같으면 다시 재지 않는다) */
  let leadTaken: Box[] = [];
  let leadLines: [number, number, number, number][] = [];
  let leadSig = '';
  let leadPrev = new Map<string, { u: number; at: [number, number, number, number] }>();   // 이름@점 → 이름 가운데·선 끝(지도 단위)
  /**
   * 이웃 땅에 들지 않는 이웃 이름(ctxPlaced ③)을 빈자리에: 그 땅의 점에서 가까운 순으로(화면 LEAD_GRID_PX 격자, 선 길이 LEAD_MIN_PX ~ LEAD_REACH_PX) 글자 상자가
   * 보이는 범위 안이고 지역 칸·그린 강·맥락 이름·길잡이 이름·칸 밖 이름표·화면에 붙은 것과 NUDGE_GAP_PX 넘게 떨어진 곳. 선은 이름표·다른 이름 위로 지나지 않고 다른 지시선과 엇갈리지 않는다.
   * 선이 이 지역 칸 위를 지나는 것은 둔다 — 칸에 둘러싸인 땅(경기 지도의 서울, 충남 지도의 세종)은 그래야 빈자리에 닿는다(칸 밖 이름표 '완주군'의 지시선과 같다. 색으로 나뉜다 — 이쪽은 회색).
   * 이름표를 놓은 뒤에 부른다(drawSea 맨 앞 — 이름표가 있든 없든 모든 그리기 길의 끝). 지도를 끌기만 했으면(배율 같음) 전에 둔 자리가 아직 쓸 만할 때 그대로 둔다(이름이 옮겨 다니지 않게).
   * 자리가 없으면 전 방식 자리(fb) — 이름표·지시선·먼저 놓은 지시선 이름과 겹치면 뺀다(겹쳐서 못 읽는 것보다 없는 편이 낫다 — 공부할 칸의 이름표가 먼저다).
   */
  function layCtxLead() {
    const asks = opt.contextNames ? ctxPlaced().filter((p) => p.lead) : [];
    if (!asks.length) {
      if (leadSig) { leadSig = ''; dropPx(gLead); leadTaken = []; leadLines = []; leadPrev = new Map(); }
      return;
    }
    const u = rendered.u, view = viewRect(4), g = NUDGE_GAP_PX * u;
    const hit = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
    const boxAt = (x: number, y: number, w: number, h: number): Box => [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
    const grow = (k: Box): Box => [k[0] - g, k[1] - g, k[2] + g, k[3] + g];
    const blocked: Box[] = [...screenBoxes(), ...ctxTaken];
    const outLab: Box[] = [], inLab: Box[] = [];   // 칸 밖 이름표 · 칸 안 이름표의 글자 상자
    const lines: [number, number, number, number][] = [];
    const list = new Map(labels.map((l) => [l.id, l.text]));
    const fs = labelPx(size.w);
    for (const p of placed) {
      const c = S.cells.get(p.id), b = labelBox(twoOf(list.get(p.id) ?? '', p.two), fs);
      const bx: Box = [p.x - (b.w / 2) * u, p.y - (b.h / 2) * u, p.x + (b.w / 2) * u, p.y + (b.h / 2) * u];
      if (!p.out) { inLab.push(bx); continue; }
      outLab.push(bx);
      if (c) lines.push([c.label[0], c.label[1], p.out.ax, p.out.ay]);
    }
    blocked.push(...outLab);
    if (zOn && zb) {
      const f = zb.frame, a = (k: string) => +(f.getAttribute(k) ?? 0);
      blocked.push([a('x'), a('y'), a('x') + a('width'), a('y') + a('height')]);
    }
    if (interaction === 'full' && movedFrom(rendered)) blocked.push([...toMap(rendered, size, size.w - SEA_RESET_W, 0), ...toMap(rendered, size, size.w, SEA_RESET_H)] as Box);
    const r1 = (v: number) => Math.round(v / u);
    const sig = `${u.toPrecision(6)}|${view.map(r1).join(',')}|${asks.map((a) => `${a.t}@${r1(a.lead!.home[0])},${r1(a.lead!.home[1])}`).join(';')}|${blocked.map((b) => b.map(r1).join(',')).join(';')}|${lines.map((l) => l.map(r1).join(',')).join(';')}`;
    if (sig === leadSig) return;
    leadSig = sig;
    dropPx(gLead);
    leadTaken = [];
    leadLines = [];
    // 선분이 상자에 닿나(Liang–Barsky) · 선분끼리 엇갈리나
    const segBox = (l: readonly number[], k: Box) => {
      let t0 = 0, t1 = 1;
      const dx = l[2] - l[0], dy = l[3] - l[1];
      for (const [p, q] of [[-dx, l[0] - k[0]], [dx, k[2] - l[0]], [-dy, l[1] - k[1]], [dy, k[3] - l[1]]]) {
        if (p === 0) { if (q < 0) return false; continue; }
        const r = q / p;
        if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
      }
      return true;
    };
    const side = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
    const segSeg = (a: readonly number[], b: readonly number[]) =>
      side(a[0], a[1], a[2], a[3], b[0], b[1]) !== side(a[0], a[1], a[2], a[3], b[2], b[3]) && side(b[0], b[1], b[2], b[3], a[0], a[1]) !== side(b[0], b[1], b[2], b[3], a[2], a[3]);
    const st = LEAD_GRID_PX * u, reach = LEAD_REACH_PX * u, min = LEAD_MIN_PX * u;
    const keep: typeof leadPrev = new Map();
    for (const a of asks) {
      const [hx, hy] = a.lead!.home, { w, h, t } = a;
      const all = [...blocked, ...leadTaken], allLines = [...lines, ...leadLines];
      const ni = Math.ceil((reach + w / 2) / st), nj = Math.ceil((reach + h / 2) / st);
      const cands: [number, number, number, number, number, number][] = [];
      for (let i = -ni; i <= ni; i++) for (let j = -nj; j <= nj; j++) {
        const cx = hx + i * st, cy = hy + j * st;
        // 선 끝은 점에서 글자 가운데로 긋는 선이 글자 상자와 만나는 곳(판 없는 칸 밖 이름표의 지시선과 같다 — labelfit leadToCenter)
        const [ex, ey] = leadToCenter([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], [hx, hy]);
        const d = Math.hypot(ex - hx, ey - hy);
        if (d >= min && d <= reach) cands.push([cx, cy, ex, ey, d, Math.hypot(cx - hx, cy - hy)]);
      }
      cands.sort((p, q) => p[4] - q[4] || p[5] - q[5]);
      const fits = ([cx, cy, ex, ey]: readonly number[]) => {
        if (!boxIn(view, cx, cy, w, h)) return false;
        const nb = boxAt(cx, cy, w, h), gb = grow(nb);
        if (all.some((k) => hit(k, gb))) return false;
        if (obstacles.some((ob) => hit(ob.box, nb) && boxHits(ob.rings, cx, cy, w, h))) return false;
        if (river && S.water.length && hit(waterBox, nb) && boxHits(S.water, cx, cy, w, h)) return false;
        if (allLines.some((l) => segBox(l, gb))) return false;         // 이름이 다른 지시선 위에 놓이지 않게
        const seg = [hx, hy, ex, ey];
        if (all.some((k) => segBox(seg, k)) || inLab.some((k) => segBox(seg, k))) return false;   // 선이 이름표·다른 이름·화면에 붙은 것 위로 지나지 않게
        return !allLines.some((l) => segSeg(seg, l));                  // 지시선끼리 엇갈리지 않게
      };
      // 전에 둔 자리(같은 배율)가 아직 쓸 만하면 그대로
      const pk = `${t}@${r1(hx)},${r1(hy)}`, was = leadPrev.get(pk);
      const found = (was && was.u === u && fits(was.at) ? was.at : undefined) ?? cands.find(fits);
      if (found) keep.set(pk, { u, at: [found[0], found[1], found[2], found[3]] });
      let at: [number, number] | null = found ? [found[0], found[1]] : null;
      if (!at) {
        // 지시선 자리가 없다: 전 방식 자리에(이름표·지시선·먼저 놓은 지시선 이름과 겹치면 뺀다)
        const fb = a.lead!.fb;
        if (!fb) continue;
        const nb = boxAt(fb[0], fb[1], w, h);
        if (outLab.some((k) => hit(k, nb)) || inLab.some((k) => hit(k, nb)) || leadTaken.some((k) => hit(k, nb)) || allLines.some((l) => segBox(l, nb))) continue;
        at = fb;
      }
      if (found) {
        const gl = pxGroup(hx, hy, 'cm-ctxlead', gLead);
        el('path', { d: `M0 0L${((found[2] - hx) / u).toFixed(1)} ${((found[3] - hy) / u).toFixed(1)}` }, gl);
        el('circle', { r: LEAD_DOT_R }, gl);
        leadLines.push([hx, hy, found[2], found[3]]);
      }
      el('text', { x: 0, y: baseline(t, CTX_PX), 'text-anchor': 'middle' }, pxGroup(at[0], at[1], `cm-ctxname out${found ? ' lead' : ''}`, gLead)).textContent = t;
      leadTaken.push(boxAt(at[0], at[1], w, h));
    }
    leadPrev = keep;
  }

  /** 그린 맥락 이름·길잡이 이름의 글자 상자(지도 단위 — drawContext 가 채운다. 바다 이름이 피한다) */
  let ctxTaken: Box[] = [];
  function drawContext() {
    dropPx(gCtx);
    const u = rendered.u, view = viewRect(4);
    const taken: Box[] = ctxTaken = [];   // 그린 이름의 글자 상자(길잡이가 피한다)
    const boxAt = (x: number, y: number, w: number, h: number): Box => [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
    if (opt.contextNames) for (const { n, t, w, h, at, show } of ctxPlaced()) {
      if (!show || !at) continue;
      // 자간은 글자 뒤에 붙으므로 넓은 자간의 강 이름(한글)은 자간 반만큼 오른쪽으로 옮겨야 가운데에 온다
      const sp = n.kind === 'water' ? waterSp(t) : 0;
      el('text', { x: (sp * CTX_PX) / 2, y: baseline(t, CTX_PX), 'text-anchor': 'middle' }, pxGroup(at[0], at[1], `cm-ctxname ${n.kind}${sp ? ' ko' : ''}`, gCtx)).textContent = t;
      taken.push(boxAt(at[0], at[1], w, h));
    }
    if (!dimLabels.length) return;
    const key = `${u.toPrecision(6)}|${dimLabels.map((l) => `${l.id}:${l.text}`).join(',')}`;
    if (key !== dimKey) {
      dimKey = key;
      const res = placeInside(cellOf, dimLabels.filter((l) => !isleSet.has(l.id)).map((l) => ({ id: l.id, ...labelBox(l.text, CTX_PX) })), u);
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
      if (isleSet.has(bid)) { skipped.push(bid); continue; }   // 섬 상자의 칸에는 점을 달지 않는다
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

  /* ---------- 바다 이름(map/sea.ts) ---------- */

  const seaOn = opt.seaNames !== false;
  const SEAS: SeaKey[] = ['w', 's', 'e'];
  /** 바다 이름 글(영어 화면은 ctxName 이 바꾼다 — text/ui.ts) */
  const seaText = (k: SeaKey) => { const n: CtxCell = { sido: seaCode(k), text: SEA_KO[k] }; return opt.ctxName ? opt.ctxName(n) : n.text; };
  let seaPrev: SeaSpot[] = [];   // 지금 그려 둔 자리(아직 쓸 수 있으면 그대로 — 지도를 끌 때 이름이 옮겨 다니지 않게)
  let seaHome = '';              // 지도 칸 크기·기본 보기·여백이 바뀌면 전 자리를 버리고 새로 고른다
  let seaSig = '';               // 자리를 정한 조건(보기·피할 것)이 같으면 다시 재지 않는다

  /**
   * 바다 이름: 이름표·맥락 이름·화면에 붙은 것이 다 놓인 뒤, 남는 바다의 가장 넓은 빈자리에 바다마다 하나(seaSpots). 다른 것의 자리는 바꾸지 않는다.
   * 피하는 것: 지역 칸·이웃 땅·강(땅 판정 격자 + 다각형 확인), 칸 밖 이름표와 그 지시선, 맥락 이름·길잡이 이름, 화면에 붙은 것(먼 섬 상자·섬 상자·축척 막대·위치 지도·확대 상자),
   * 확대 상자의 범위 네모. 자리가 없으면 그리지 않는다. 본 지도를 숨기는 섬 상자 격자에서는 없다
   */
  function drawSea() {
    layCtxLead();   // 이웃 땅에 들지 않는 이웃 이름(점·선) — 이름표 다음, 바다 이름보다 먼저
    if (!seaOn) return;
    const grid = isleL?.mode === 'grid';
    // 범위는 보이는 지도 전체에서 가장자리 8px 만 뺀 곳(이름표·맥락 이름의 viewRect 와 달리 여백을 빼지 않는다 — 여백은 칸을 맞추는 자리일 뿐 바다는 거기에도 보이고,
    // 여백을 쓰는 것(먼 섬 상자·섬 상자 줄·확대 상자)은 screenBoxes 로 따로 피한다. 빼면 먼 섬 상자 옆을 비운 전남광주 휴대폰 지도는 왼쪽 바다 100px 를 못 썼다)
    const u = rendered.u, [vx, vy, vw, vh] = viewBox(rendered, size);
    const view: Box = [vx + 8 * u, vy + 8 * u, vx + vw - 8 * u, vy + vh - 8 * u];
    const ep = effPad();
    const hk = `${Math.round(size.w)}x${Math.round(size.h)}|${homeBox.map((v) => v.toFixed(0)).join(',')}|${ep.t},${ep.r},${ep.b},${ep.l}`;
    if (hk !== seaHome) { seaHome = hk; seaPrev = []; }
    // 이 지도의 칸이 닿는 바다가 있으면 그 바다만(멀리 보이는 다른 바다에는 이름을 두지 않는다 — sea.ts coastSeas). 닿는 바다가 없는 내륙 지도는 보이는 바다를 그대로
    const coast = coastSeas(S);
    const asks = grid ? [] : SEAS.filter((key) => !coast.length || coast.includes(key)).flatMap((key) => { const text = seaText(key); const t2 = text ? splitTwo(text) : null; return text ? [{ key, text, ...ctxSize(text, 'water'), ...(t2 ? { alt: ctxSize(t2, 'water') } : {}) }] : []; });
    const blocked: Box[] = grid ? [] : [...screenBoxes(), ...ctxTaken, ...leadTaken];
    const lines: [number, number, number, number][] = grid ? [] : [...leadLines];
    if (!grid) {
      const list = new Map(labels.map((l) => [l.id, l.text]));
      const fs = labelPx(size.w);
      for (const p of placed) {
        if (!p.out) continue;
        const c = S.cells.get(p.id), b = labelBox(twoOf(list.get(p.id) ?? '', p.two), fs);
        blocked.push([p.x - (b.w / 2) * u, p.y - (b.h / 2) * u, p.x + (b.w / 2) * u, p.y + (b.h / 2) * u]);
        if (c) lines.push([c.label[0], c.label[1], p.out.ax, p.out.ay]);
      }
      if (zOn && zb) {
        const f = zb.frame, n = (a: string) => +(f.getAttribute(a) ?? 0);
        blocked.push([n('x'), n('y'), n('x') + n('width'), n('y') + n('height')]);
      }
      // 확대·이동하면 오른쪽 위에 '⤢ 전체 보기' 단추가 뜬다(문제 화면·둘러보기 — 지도 칸 밖 요소 .map-reset: 위 12 · 오른쪽 12 · 높이 44, 폭은 글에 따라 130px 안팎)
      if (interaction === 'full' && movedFrom(rendered)) blocked.push([...toMap(rendered, size, size.w - SEA_RESET_W, 0), ...toMap(rendered, size, size.w, SEA_RESET_H)] as Box);
    }
    const r1 = (v: number) => Math.round(v / u);
    const sig = `${u.toPrecision(6)}|${view.map(r1).join(',')}|${asks.map((a) => a.text).join(',')}|${blocked.map((b) => b.map(r1).join(',')).join(';')}|${lines.map((l) => l.map(r1).join(',')).join(';')}`;
    if (sig === seaSig) return;
    seaSig = sig;
    dropPx(gSea);
    seaPrev = !asks.length ? [] : seaSpots({
      mask: landMask(S), view, u, asks, blocked, lines, prev: seaPrev,
      // 고른 상자가 지역 칸·그린 강(obstacles)·이웃 땅·늘린 땅·그리지 않은 강 띠에 닿지 않나
      ok: (x, y, w, h) => {
        const b: Box = [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
        const hit = (k: Box) => k[0] < b[2] && k[2] > b[0] && k[1] < b[3] && k[3] > b[1];
        if (obstacles.some((ob) => hit(ob.box) && boxHits(ob.rings, x, y, w, h))) return false;
        if (S.outRings.length && boxHits(S.outRings, x, y, w, h)) return false;
        if (S.farRings.length && boxHits(S.farRings, x, y, w, h)) return false;
        if (S.outExt.some(hit)) return false;
        return river || !S.water.length || !boxHits(S.water, x, y, w, h);
      },
    });
    for (const s of seaPrev) {
      const text = asks.find((a) => a.key === s.key)!.text, sp = waterSp(text);
      putText(el('text', { x: (sp * CTX_PX) / 2, y: baseline(text, CTX_PX), 'text-anchor': 'middle' }, pxGroup(s.x, s.y, `cm-seaname ${s.key}${sp ? ' ko' : ''}`, gSea)), twoOf(text, s.two), baseline(text, CTX_PX), CTX_PX);
    }
  }

  /** 이름표를 놓고(layLabels), 남는 바다에 바다 이름을(drawSea — 이름표 자리가 바뀌면 다시 본다) */
  function drawLabels() {
    layLabels();
    drawSea();
  }

  /** 이름표: 글자 상자가 칸 안에 드는 자리 → (mode 에 따라) 칸 밖 빈 바탕 + 지시선 → 칸 위쪽 흰 판 */
  function layLabels() {
    dropPx(gLab);
    placed = [];
    // 섬 상자에 든 칸의 이름은 상자 왼쪽 위에(paintIsles) — 본 지도에서는 자리를 찾지 않는다. 확대 상자가 있으면 이번 과 이름표는 상자 안에만(mirrorZoom —
    // 상자 범위를 좁혀 이름표 점이 상자 밖으로 나간 큰 칸만 본 지도에, zLab)
    const list = isleSet.size || zOn ? labels.filter((l) => !isleSet.has(l.id) && !zLab.has(l.id)) : labels;
    if (!list.length) return;
    if (size.w < labelMinW) return;
    const u = rendered.u, fs = labelPx(size.w);
    host.style.setProperty('--cm-label', `${fs}px`);
    const asks = list.map((l) => { const t2 = splitTwo(l.text); return { id: l.id, ...labelBox(l.text, fs), ...(t2 ? { alt: labelBox(t2, fs) } : {}) }; });
    // 칸 안 자리(가장 무거운 계산)는 배율과 목록에만 달려 있다: 끌어서 옮기기만 했으면 그대로 쓴다
    const kIn = `${fs}|${u.toPrecision(6)}|${list.map((l) => `${l.id}:${l.text}`).join(',')}`;
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
      const ep = effPad();
      const kOut = `${labelMode}${labelClean ? '+' : ''}|${kIn}|${Math.round(size.w)}x${Math.round(size.h)}|${ep.t},${ep.r},${ep.b},${ep.l}|${screen.length}`;
      const size0 = new Map(asks.map((a) => [a.id, a]));
      // 칸 밖 이름표와 그 지시선은 맥락 이름(이웃 시도·한강) 자리도 피한다. 한강 이름은 보이는 범위에 따라 옮겨 다닌다(물가 옆 바탕)
      // (ctxPlaced — 그린 자리와 같다. 겹쳐서 옮긴 이웃 이름은 옮긴 자리)
      const avoid = !opt.contextNames ? [] : ctxPlaced().flatMap(({ w, h, at: p }): Box[] => (p ? [[p[0] - w / 2, p[1] - h / 2, p[0] + w / 2, p[1] + h / 2]] : []));
      const hitAny = (ks: Box[], x: number, y: number, w: number, h: number) => ks.some((k) => x - w / 2 < k[2] && x + w / 2 > k[0] && y - h / 2 < k[3] && y + h / 2 > k[1]);
      // 지도를 옮긴 뒤에도 쓸 수 있나: 지난번에 범위 때문에 밀려난 이름이 없었고, 놓았던 이름표가 아직 보이는 범위 안에 있으며
      // 화면에 붙은 것 밑에 깔리지 않고 맥락 이름과 겹치지 않는다
      const stillGood = () => !outRes.clipped && outRes.placed.every((p) => {
        const a = size0.get(p.id);
        if (!a) return false;
        const k = p.two && a.alt ? a.alt : a, w = k.w * u, h = k.h * u;
        return boxIn(within, p.x, p.y, w, h) && !hitAny(screen, p.x, p.y, w, h) && !hitAny(avoid, p.x, p.y, w, h);
      });
      if (kOut !== outKey || (at !== outAt && !stillGood())) {
        outKey = kOut;
        outAt = at;
        outRes = placeOutside(cellOf, asks, inRes, { mode: labelMode, u, obstacles, within, center, avoid, screen, plateHome: opt.plateHome, ...(opt.labelDotPx ? { dotPx: opt.labelDotPx } : {}), ...(labelClean ? { cleanPlates: true } : {}) });
      }
      placed = [...inRes.placed, ...outRes.placed];
    }
    const byId = new Map(list.map((l, i) => [l.id, { l, box: asks[i] }]));
    for (const p of placed) {
      const it = byId.get(p.id), c = S.cells.get(p.id);
      if (!it || !c) continue;
      const txt = twoOf(it.l.text, p.two), box = p.two && it.box.alt ? it.box.alt : it.box;
      const base = baseline(it.l.text, fs);
      if (!p.out) {
        const g = pxGroup(p.x, p.y, `cm-label${toneOf(it.l) === 'white' ? ' white' : ''}`, gLab);
        putText(el('text', { x: 0, y: base, 'text-anchor': 'middle' }, g), txt, base, fs);
        continue;
      }
      // 칸 밖: 칸 안 이름표 점에 묶음을 두고(점), 이름표까지 지시선
      const g = pxGroup(c.label[0], c.label[1], 'cm-label out', gLab);
      const tx = (p.x - c.label[0]) / u, ty = (p.y - c.label[1]) / u;
      el('path', { d: `M0 0L${((p.out.ax - c.label[0]) / u).toFixed(1)} ${((p.out.ay - c.label[1]) / u).toFixed(1)}`, class: 'cm-leader' }, g);
      el('circle', { r: 3, class: 'cm-leader-dot' }, g);
      if (p.out.plate) el('rect', { x: (tx - box.w / 2).toFixed(1), y: (ty - box.h / 2).toFixed(1), width: box.w, height: box.h, class: 'cm-plate' }, g);
      putText(el('text', { x: tx.toFixed(1), y: (ty + base).toFixed(1), 'text-anchor': 'middle' }, g), txt, ty + base, fs);
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
    if (isleSet.has(cid)) return;   // 섬 상자의 칸은 칸 색(정답·오답)으로만
    const c = S.cells.get(cid)!;
    let x = c.label[0], y = c.label[1];
    const p = placed.find((q) => q.id === cid && !q.out), l = p && labels.find((q) => q.id === cid);
    if (p && l) {
      const u = rendered.u, b = labelBox(twoOf(l.text, p.two), labelPx(size.w));
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
    if (isleSet.has(from) || isleSet.has(to)) return;   // 섬 상자로 가는 화살표는 본 지도 밖을 가리킨다
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

  /** 본 지도에서 고를 수 있는 칸: 섬 상자 칸은 상자에서만 고른다 */
  const mainActive = () => (isleSet.size ? new Set([...active].filter((cid) => !isleSet.has(cid))) : active);

  function tapAt(px: number, py: number) {
    const [x, y] = toMap(shown, size, px, py);
    const act = mainActive();
    const probe = probeAt(S, x, y, shown.u, act);
    const tap = classifyTap(probe, act);
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
      const act = mainActive();
      const pr = probeAt(S, x, y, shown.u, act);
      opt.onTap?.(pr.hit && act.has(pr.hit) ? { type: 'cell', id: pr.hit } : { type: 'outside' }, { px: p.x, py: p.y });
    });
  }

  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    // 숨으면(0×0 — 확대 상자를 걷을 때 그 작은 지도) 1×1 칸으로 다시 그리지 않는다: 보이지 않는 지도를 이름표까지 다시 놓는 헛일이었다
    // (2026-11-15 점검 — 상자가 떨어질 때 붙을 때의 몇 배, 27~33ms). 다시 보일 때(크기가 같아도) 그린다 — 그사이 setHome 이 쟀으면 그때 그렸다
    const r = host.getBoundingClientRect();
    if (!r.width && !r.height) { ghost = true; return; }
    const before = size, was = ghost;
    measure();
    if (!was && before.w === size.w && before.h === size.h) return;
    const z = zoomedFlag;
    layoutIsle();
    home = fitView(homeBox, size, effPad());
    commit(z ? clamp(shown) : home);
    paintIsles();   // 이름(상자 왼쪽 위)은 지도 칸 폭 문턱(labelMinW)을 따른다
  }) : null;
  ro?.observe(host);

  measure();
  home = fitView(homeBox, size, effPad());
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
      rim = ids ? new Set(ids) : null;
      drawRims();
    },
    setBold(ids) {
      bold = ids ? new Set(ids) : null;
      drawRims();
      paintInset();
      mirrorZoom();
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
      labelClean = !!o?.cleanPlates;
      drawLabels();
      paintIsles();
      mirrorZoom();
    },
    setIsles(ids) {
      const list = (ids ?? []).filter((cid, i, a) => S.cells.has(cid) && a.indexOf(cid) === i);
      const key = list.join(',');
      if (key === isleKey) return;
      isleKey = key;
      buildIsles(list);
      layoutIsle();
      // 본 지도의 섬 상자 칸(맥락색·굵은 선 없음)과 상자 칠을 새 목록으로
      drawRims();
      paintCells();
      // 본 지도 맞춤(줄이면 그만큼 비킨다). 이름표·맥락 이름은 새 여백으로 다시
      home = fitView(homeBox, size, effPad());
      inKey = outKey = '';
      if (!zoomedFlag) commit(home);
      else { paintScale(); syncLoc(); if (labels.length) drawLabels(); else drawSea(); }
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
      drawSea();
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
      // 지도 칸을 다시 잰다: 부르는 쪽(play.ts show)은 단추 띠를 먼저 바꾸고 부르는데, ResizeObserver 는 그 뒤에야 알린다.
      // 재지 않으면 본 지도 맞춤과 위치 지도 귀퉁이가 앞 문제(또는 지도를 만들 때)의 높이로 정해진다(syncLoc 머리 주석)
      const before = size;
      measure();
      const resized = before.w !== size.w || before.h !== size.h;
      if (loc && loc.usedH !== size.h) loc.key = '';
      homeBox = box;
      pad = p;
      layoutIsle();
      home = fitView(box, size, effPad());
      if (animate) {
        if (resized) commit(clamp(shown));   // 새 크기로 지금 보기를 먼저 맞춘 뒤 옮긴다(ResizeObserver 와 같게)
        animateTo(home, REVEAL_MS);
      } else {
        finishAnim();
        commit(home);
      }
      if (resized) paintIsles();   // ResizeObserver 가 할 일(이름 칸은 지도 칸 폭 문턱을 따른다) — 크기가 같아졌으니 그쪽은 건너뛴다
    },
    setPad(p, animate = true) {
      pad = p;
      const was = zoomedFlag;
      layoutIsle();
      home = fitView(homeBox, size, effPad());
      if (!was) animateTo(home, animate ? REVEAL_MS : 0);
      else { paintScale(); syncLoc(); }   // 확대한 채로는 다시 그리지 않으므로 축척 막대·위치 지도 자리만 맞춘다
    },
    reveal(ids, p0 = pad) {
      const p = shifted(p0);
      // 섬 상자에 든 칸은 늘 보인다(본 지도에서 찾지 않는다)
      ids = ids.filter((cid) => !isleSet.has(cid));
      const boxes = ids.map((cid) => S.cells.get(cid)).filter(Boolean).map((c): Box => [c!.label[0] - c!.r, c!.label[1] - c!.r, c!.label[0] + c!.r, c!.label[1] + c!.r]);
      if (!boxes.length) return;
      const box = boxes.reduce(unionBox);
      if (contains(shown, size, box, p)) return;
      animateTo(clamp(fitView(box, size, p, shown.u)), REVEAL_MS);
    },
    resetView(animate = true) {
      animateTo(home, animate ? REVEAL_MS : 0);
    },
    isIsleGrid: () => isleL?.mode === 'grid',
    setZoom(z) {
      zoom = z;
      zKey = '';
      const s0 = zSig();
      const moved = syncZoom();   // 붙으면 작은 지도 칠·이름표도 여기서 맞춘다(syncZoom)
      if (moved) { home = fitView(homeBox, size, effPad()); if (!zoomedFlag) commit(home); }
      // 이번 과 이름표가 상자로 옮겨 가거나 돌아올 때만 다시 놓는다(본 지도를 다시 그렸으면 그때 놓았다). 상자가 붙지 않는 지도는 이름표를 다시 놓지 않는다
      if (zSig() !== s0 && !(moved && !zoomedFlag)) drawLabels();
    },
    isZoomed: () => zoomedFlag,
    unitsPerPx: () => shown.u,
    destroy() {
      finishAnim();
      ro?.disconnect();
      clearTimeout(wheelTimer);
      zb?.map?.destroy();
      host.replaceChildren();
      host.classList.remove('cmap', 'part', 'thin-bank', 'tap-only', 'static', 'isle-grid', 'zoom-below');
      host.style.removeProperty('--cm-label');
      host.style.removeProperty('--zb-h');
    },
  };
}
