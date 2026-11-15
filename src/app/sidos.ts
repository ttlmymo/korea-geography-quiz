// 지역 표(src/data/sido.json, 계획서 3절 6 · E8): 앱이 읽는 칸. 지역 목록을 코드에 박지 않는다 — 앱·정적 쪽·파이프라인이 이 표 하나를 읽는다.
// 공개 여부는 표의 status 가 아니라 받은 경계 데이터(units.json regions)가 정한다: 운영 빌드는 공개 지역만, 미리보기(--preview)는 16개 지역을 싣는다.
// 그래서 지역 고르기의 '준비 중'은 '표에는 있는데 데이터에 없는 지역'이다
import table from '../data/sido.json' with { type: 'json' };

/** 두 말 글: [글, 꼬리표] 또는 [제목, 부제] */
type Pair = [string, string];

export interface SidoRow {
  code: string;          // 원자료 시·도 코드(11)
  key: string;           // 앱 주소의 지역 키(seoul)
  ko: string;            // 짧은 이름(서울)
  full: string;          // 원자료 이름(서울특별시)
  en: string;            // 영어 짧은 이름(Seoul)
  enChecked: boolean;    // 영어 이름을 확인했나 — false 면 영어 화면에 보이지 않는다(Q5)
  group: string;         // 권역(지역 고르기 목록 묶음에만)
  status: 'live' | 'off'; // 공개 지역인가 — 앱은 쓰지 않고(받은 units.json 이 정함) 정적 쪽 문구가 쓴다(src/lib/regions.ts, 계획서 E9)
  layer: 'sgg' | 'si' | 'emd';
  openOrder: number | null;  // 공개 차례(1 서울·2 인천·3 경기·4 부산 …, 열지 않은 지역 null) — 홈 탭이 넘칠 때 빈자리를 채우는 차례(N22 접기, E12)
  gunFirst: boolean;         // 군을 구보다 먼저 쓰는 지역(인천 '2군 9구'·'군·구'). false 면 구를 먼저(부산 '15구 1군'·대구 '7구 2군' — text/ko.ts guFirst, E12)
  desc: { ko: Pair; en: Pair } | null;          // 지역 고르기 칸·홈 지도 아래 한 줄
  hub: { ko: Pair; en?: Pair } | null;          // 정적 허브 쪽 /{key}/ (홈 '지역 알아보기'·머리글 '지역 지도')
  river: boolean;                               // 지역 지도에 한강 띠가 칸과 맞닿아 그려진다(범례 한강 견본)
  far: { lonLt?: number } | null;               // 먼 섬 규칙(파이프라인과 같은 칸). lonLt 가 있으면 지역 지도의 먼 섬 상자도 그 경도를 쓴다(map/shapes.ts farLonOf, E16)
  /**
   * 지역 안 묶음(E16 — 전남광주의 자치구 5곳): 같은 이름 곳(sameNames)을 섞인 화면에 쓸 때 지역 이름 대신 붙이는 이름. codes = 시·군·구 코드.
   * E16 에는 '광주 동구'(계획서 N3)였고, 2026-11-15 사용자 결정('모든 명칭은 법이 정한 명칭으로')으로 법정 약칭 '광주특별시 동구'·영어 'Dong-gu, Jeonnam-Gwangju'
   */
  parts?: { ko: string; en: string; codes: string[] }[];
}

export const SIDOS: SidoRow[] = (table as unknown as { sidos: SidoRow[] }).sidos;

/** 권역 차례(지역 고르기 목록). 계획서 N2 */
export const GROUPS = ['수도권', '강원', '충청', '호남', '영남', '제주'] as const;

const byKey = new Map(SIDOS.map((s) => [s.key, s]));
const byCode = new Map(SIDOS.map((s) => [s.code, s]));
export const sidoOf = (key: string): SidoRow | undefined => byKey.get(key);
/** 공개 차례 값(지역 표 openOrder). 표에 없거나 열지 않은 곳(시·도 단원 korea, openOrder null)은 맨 뒤 */
export const openRank = (key: string): number => sidoOf(key)?.openOrder ?? Number.MAX_SAFE_INTEGER;
/**
 * 공개 차례로 줄 세우기(E12): 먼저 연 지역이 앞(서울·인천·경기·부산·대구 …), 차례가 같으면(맨 뒤 무리) 받은 차례 그대로.
 * 지역 표 차례(시·도 코드 차례)로 고르면 '서울·부산·대구'가 앞서 개설 때부터 있던 인천·경기가 빠진다(E11·E12 검수).
 * 홈 탭 빈자리(ui/pages.ts homeTabs)·다 채움 카드의 남은 지역(core/next.ts homeCard)·정적 쪽 설명의 앞 세 이름(lib/regions.ts)이 함께 쓴다
 */
export function byOpenOrder<T>(xs: readonly T[], keyOf: (x: T) => string): T[] {
  return xs.map((x, i) => ({ x, i, r: openRank(keyOf(x)) })).sort((a, b) => a.r - b.r || a.i - b.i).map((o) => o.x);
}
/**
 * 그 말 화면에 지역을 보이는가: 영어 화면은 영어 이름을 확인한 지역만(지역 표 enChecked — Q5, 계획서 N26). 표에 없는 키(시·도 단원 korea 등)는 막지 않는다
 * — korea 는 영어 앱이 등록하지 않는다(registry emd:false)
 */
export const shownIn = (lang: string, key: string) => lang !== 'en' || sidoOf(key)?.enChecked !== false;
export const sidoByCode = (code: string): SidoRow | undefined => byCode.get(code);
/**
 * 곳이 든 지역 안 묶음(지역 표 parts, E16): key = 지역 키 또는 단원 키('jeonnam-gwangju/dong-gu'), idOrCode = 시·군·구 곳 id(kr:sgg:12210) 또는 코드(12210).
 * 묶음이 없는 지역·곳은 undefined — 섞인 화면 이름은 전처럼 지역 이름('부산 중구'). 키·id 가 문자열이 아니면(모양이 틀린 판) 묶음 없음으로 본다(E16 검수 — 예외를 내지 않게)
 */
export const partOf = (key: unknown, idOrCode: unknown) => {
  if (typeof key !== 'string' || typeof idOrCode !== 'string') return undefined;
  const code = idOrCode.replace(/^kr:sgg:/, '');
  return sidoOf(key.split('/')[0])?.parts?.find((p) => p.codes.includes(code));
};
