// 지도 투영: 등장방형(기준 위도 37.5도), 단위는 미터, y 는 아래로. 파이프라인(pipeline/build-geo.mjs 의 toM)과 같은 축척이라
// 빌드 때 잰 칸 크기(minTapPx·내접원)가 화면과 맞는다. 원점(동경 127도, 북위 37.5도)을 빼서 숫자를 작게 둔다
import type { BBox } from '../types.ts';

export const LAT0 = 37.5;
export const KX = 111320 * Math.cos(LAT0 * Math.PI / 180);
export const KY = 110570;
const LON0 = 127;

/** [서, 위, 동, 아래] 지도 단위(미터, y 아래로) */
export type Box = [number, number, number, number];

export const project = (lon: number, lat: number): [number, number] => [(lon - LON0) * KX, (LAT0 - lat) * KY];
export const unproject = (x: number, y: number): [number, number] => [x / KX + LON0, LAT0 - y / KY];

/** 경도·위도 상자 [서, 남, 동, 북] → 지도 상자 */
export function boxOf(b: BBox): Box {
  const [x0, y1] = project(b[0], b[1]);
  const [x1, y0] = project(b[2], b[3]);
  return [x0, y0, x1, y1];
}

export const unionBox = (a: Box, b: Box): Box => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
