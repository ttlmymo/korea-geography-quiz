// 인쇄용 백지도(R1) 정적 쪽이 쓰는 데이터: 지역·전국 지도를 PrintMap 으로. 계산은 print-core.ts(단위 시험이 읽는다).
// 어느 지역에 쪽을 만드나: 지역 표에 허브가 있고 곳이 PRINT_MIN_ITEMS 곳 이상인 지역 + 전국 시·도(korea).
// 세종(1곳)·제주(2곳)는 시·군·구 지도로는 백지도가 되지 않아 뺀다 — 읍·면·동 백지도는 이 단계의 범위 밖이다
import fs from 'node:fs';
import path from 'node:path';
import { DATA_VER } from '../consts';
import { UNITS, region, svgOf, enNameOf } from './geo';
import { SIDOS, sidoOf } from '../app/sidos';
import { buildPrintMap, koreaSvg, type PrintMap, type SidoTopo } from './print-core';

export const PRINT_MIN_ITEMS = 3;
export const KOREA_KEY = 'korea';

/** 백지도 쪽이 있는 키: 전국 + 지역(공개 차례) */
export function printKeys(): string[] {
  const regions = UNITS.regions.filter((r) => r.items.length >= PRINT_MIN_ITEMS && sidoOf(r.key)?.hub).map((r) => r.key);
  return [KOREA_KEY, ...regions];
}

const topoCache: { v?: SidoTopo } = {};
const sidoTopo = (): SidoTopo => (topoCache.v ??= JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/geo', DATA_VER, 'sido.topo.json'), 'utf8')));

export function printMapOf(key: string): PrintMap {
  if (key === KOREA_KEY) {
    const sv = koreaSvg(sidoTopo());
    const names = sv.items.map((it) => {
      const row = SIDOS.find((s) => s.code === it.code)!;
      // 짧은 이름이 정식 이름과 다르면(전남광주통합특별시 = 광주특별시) 정답표에 정식 이름도 적는다
      return { id: it.id, ko: row.ko, en: row.en, ...(row.full !== row.ko && !row.full.startsWith(row.ko) ? { full: row.full } : {}) };
    });
    return buildPrintMap(key, sv, sv.items, names, sv.out, '', false);
  }
  const r = region(key);
  const svg = svgOf(key);
  const names = r.items.map((it) => ({ id: it.id, ko: it.ko, en: enNameOf(it.id) }));
  return buildPrintMap(key, svg, svg.items, names, svg.out, svg.water);
}

/** 정답표·화면에 쓰는 말 */
export const PRINT_TEXT = {
  ko: {
    print: '인쇄하기', optNumbers: '번호 표시', optAnswers: '정답표 포함',
    who: '이름', date: '날짜', answers: '정답표', no: '번호', name: '이름',
    mapSuffix: '백지도', answerSuffix: '정답표',
    ctx: '회색 땅은 이웃 지역이에요.', insetNote: '점선 상자는 멀리 떨어진 섬을 옮겨 그린 거예요.', tightNote: '칸이 좁아 번호가 작게 들어간 곳이 있어요.',
    src: (repo: string) => `경계: 통계청 SGIS(공공누리 제1유형), ${repo}(CC BY 4.0) 정리본을 채움지도가 단순화함 · 2026년 10월 1일 기준 · chaeumjido.co.kr`,
  },
  en: {
    print: 'Print', optNumbers: 'Show numbers', optAnswers: 'Include answer key',
    who: 'Name', date: 'Date', answers: 'Answer key', no: 'No.', name: 'Name',
    mapSuffix: 'blank map', answerSuffix: 'answer key',
    ctx: 'Gray areas are neighboring regions.', insetNote: 'The dashed box shows a distant island moved next to the map.', tightNote: 'A few cells are small, so their numbers are printed smaller.',
    src: (repo: string) => `Boundaries: Statistics Korea SGIS (KOGL Type 1), ${repo} (CC BY 4.0), simplified by Fill the Map · as of October 1, 2026 · chaeumjido.co.kr`,
  },
} as const;

export const boundarySourceRepo = (): string => {
  const m = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/geo', DATA_VER, 'manifest.json'), 'utf8'));
  return m.source.repo as string;
};
