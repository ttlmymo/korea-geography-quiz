// 보기 계산(그리기와 따로): 가운데 점과 '화면 1px 당 지도 단위(u)'로 보기를 나타낸다.
// viewBox 는 늘 지도 칸의 가로세로 비와 같게 만들어, 화면 좌표 ↔ 지도 좌표가 곱셈 하나로 오간다
import type { Box } from './project.ts';

export interface View { cx: number; cy: number; u: number }
export interface Size { w: number; h: number }
export interface Pad { t: number; r: number; b: number; l: number }

/** 확대 한계(설계서 5.3): 맞춤 보기의 0.8~8배 */
export const MIN_K = 0.8;
export const MAX_K = 8;

export const NO_PAD: Pad = { t: 0, r: 0, b: 0, l: 0 };

/** 상자를 여백 안쪽 칸에 꼭 맞게. minU 를 주면 그보다 더 키우지는 않는다(판정 뒤 두 칸 보이기) */
export function fitView(box: Box, size: Size, pad: Pad = NO_PAD, minU = 0): View {
  const aw = Math.max(1, size.w - pad.l - pad.r), ah = Math.max(1, size.h - pad.t - pad.b);
  const u = Math.max((box[2] - box[0]) / aw, (box[3] - box[1]) / ah, minU, 1e-6);
  // 여백 칸의 가운데가 상자 가운데에 오게
  const ox = pad.l + aw / 2 - size.w / 2, oy = pad.t + ah / 2 - size.h / 2;
  return { cx: (box[0] + box[2]) / 2 - ox * u, cy: (box[1] + box[3]) / 2 - oy * u, u };
}

export function viewBox(v: View, size: Size): [number, number, number, number] {
  return [v.cx - (size.w * v.u) / 2, v.cy - (size.h * v.u) / 2, size.w * v.u, size.h * v.u];
}

export function toMap(v: View, size: Size, px: number, py: number): [number, number] {
  return [v.cx + (px - size.w / 2) * v.u, v.cy + (py - size.h / 2) * v.u];
}

export function toScreen(v: View, size: Size, x: number, y: number): [number, number] {
  return [(x - v.cx) / v.u + size.w / 2, (y - v.cy) / v.u + size.h / 2];
}

/** 화면 점 (px, py) 를 제자리에 두고 factor 배 키운다 */
export function zoomAround(v: View, size: Size, px: number, py: number, factor: number): View {
  const [x, y] = toMap(v, size, px, py);
  const u = v.u / factor;
  return { cx: x - (px - size.w / 2) * u, cy: y - (py - size.h / 2) * u, u };
}

/**
 * 한계 안으로: 배율은 home 의 0.8~8배, 가운데는 bounds 안(그래서 bounds 밖은 많아야 반 화면만 보인다)
 */
export function clampView(v: View, home: View, bounds: Box): View {
  const u = Math.min(home.u / MIN_K, Math.max(home.u / MAX_K, v.u));
  return { cx: Math.min(bounds[2], Math.max(bounds[0], v.cx)), cy: Math.min(bounds[3], Math.max(bounds[1], v.cy)), u };
}

/**
 * from 보기로 그린 그림을 CSS transform(원점 0 0)으로 to 보기처럼 보이게 하는 값.
 * 제스처·움직임 중에는 이것만 걸고, 끝나면 viewBox 를 to 로 바꿔 선명하게 다시 그린다
 */
export function cssBetween(from: View, to: View, size: Size): { k: number; tx: number; ty: number } {
  const [fx, fy] = viewBox(from, size), [tx0, ty0] = viewBox(to, size);
  return { k: from.u / to.u, tx: (fx - tx0) / to.u, ty: (fy - ty0) / to.u };
}

/** 상자가 보기 안(여백 빼고)에 다 들어오나 */
export function contains(v: View, size: Size, box: Box, pad: Pad = NO_PAD): boolean {
  const [x0, y0] = toMap(v, size, pad.l, pad.t), [x1, y1] = toMap(v, size, size.w - pad.r, size.h - pad.b);
  return box[0] >= x0 && box[1] >= y0 && box[2] <= x1 && box[3] <= y1;
}
