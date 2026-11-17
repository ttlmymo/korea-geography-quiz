// 앱이 쓰는 데이터 모양. 경계 데이터(public/data/geo/{판}/)는 파이프라인(pipeline/build-geo.mjs)이 만든다.
// 동 단원 파일(emd/{코드}.json)의 모양도 여기 하나에 둔다(계획서 E4 — 단위 시험도 이 타입을 쓴다)

/** [서, 남, 동, 북] 경도·위도 */
export type BBox = [number, number, number, number];

export interface Item {
  id: string;   // kr:sgg:11110 · kr:emd:1111051500
  ko: string;   // 종로구
  slug: string; // jongno-gu · 동은 adm_cd2 뒤 5자리(51500, 계획서 N31)
  line: string; // 위치 한 줄(동은 아직 없어 '' — 만나기 카드는 근거 meet 로 만든다, N13)
  kind?: '동' | '읍' | '면';   // 동 단원의 곳만
  full?: string;  // 단원이 섞이는 화면의 이름(계획서 N12): 일반구 단원의 곳 '수원시 장안구', 여러 지역에 같은 이름이 있는 시·군·구 '부산 중구'(레지스트리가 붙임, E11)
  si?: string;    // 일반구 단원의 곳만: 그 일반구가 든 시 층 id(kr:sgg:41110 — 지역 지도에서 그곳이 든 칸)
  // 동 단원의 곳만: 영어 이름('Cheongunhyoja-dong' — 판 .2 단원 파일 items[].en, 손 표 pipeline/data/emd-en.json, 설계안 EN_EMD 3절).
  // 옛 캐시 단원 파일에는 없다 — 영어 화면은 그때 한글 이름을 쓴다(숫자 slug 는 쓰지 않는다, EN_EMD 5.4)
  en?: string;
}

/**
 * 지도 맥락 이름 칸(이웃 땅·한강 — map/shapes.ts Shapes.names, 화면 글 text/ui.ts ctxName 이 받는다). sido = 시·도 코드(한강 'water', 북한 'kp', 일본 'jp', 바다 이름표 'sea:w'·'sea:s'·'sea:e' — map/sea.ts).
 * 동 단원 지도의 이웃 땅은 id(kr:sgg:…)·en(판 .2 topo out 의 영어 이름)이 있고, 일반구 단원의 나머지 칸(rest)은 id = 그 칸의 시·군 곳 id
 */
export interface CtxCell { sido: string; text: string; id?: string; en?: string; rest?: boolean }

export interface Lesson {
  no: number;
  title: string;
  en?: string;          // 영어 과 이름(영어 앱)
  items: string[];      // 곳 id, 만나기 순서
  fit: BBox;            // 과 화면 범위(각 곳의 가장 큰 덩어리 기준)
  minTapPx: number;     // 가장 좁은 휴대폰에서 가장 작은 칸의 내접원 지름
  ambiguous: string[];  // 24px 보다 작아 '모호하면 확대'가 자주 일어날 곳
  insets?: string[];    // 섬 상자로 따로 보일 곳(동 단원의 섬 과, 계획서 N8)
}

/** 지역 전체를 묻는 판(전체 연습·시험·넓은 복습)에서 한 번에 보이는 화면. 경기는 북부·남부 둘, 나머지는 지역 전체 하나 */
export interface Screen {
  key: string;          // north · south · all
  ko: string;           // 북부
  en: string;
  items: string[];
  fit: BBox;
  minTapPx: number;
  ambiguous: string[];
  insets?: string[];
}

/**
 * 지역(reg.regions) 또는 동 단원(reg.units, 계획서 N30). 동 단원도 같은 모양이라 문제·판·숙달 코드를 그대로 쓴다.
 * 동 단원의 key 는 '{지역}/{단원 slug}'(seoul/jongno-gu), layer 는 'emd' 이고 unit 에 단원 정보가 붙는다.
 * 과 없는 지역(세종·제주, 계획서 N4 · E8): 지역 표 layer 'emd' 인 지역은 layer 'emd'·unit 없음·lessons [] 로 온다 — items 는 지역 지도의 칸(시·군·구 1~2곳)이고
 * 공부는 그 지역의 동 단원(주 단원)으로 한다(core/next.ts unitMain·mainUnitOf).
 * 시·도 단원(key 'korea', layer 'sido', 계획서 N30 · E8 모델 · E10 데이터): 곳 id kr:sido:{코드} 16곳. reg.units 에 들지만 unit 이 없어
 * 지역처럼 다룬다(kgq_last_v1·kgq_best_v1 키 'korea' — 지역 키 모양)
 */
export interface Region {
  key: string;          // seoul · seoul/jongno-gu · korea
  sido: string;         // 11 (korea 는 '00')
  ko: string;           // 서울 · 종로구 · 전국
  full: string;         // 서울특별시 · 서울특별시 종로구 · 대한민국
  en: string;
  layer: 'sgg' | 'si' | 'emd' | 'sido';  // 경기는 일반구를 시로 합친 층, 동 단원·과 없는 지역은 emd, 시·도 단원은 sido
  fit: BBox;
  items: Item[];
  lessons: Lesson[];
  screens: Screen[];
  unit?: UnitMeta;      // 동 단원에만
}

/** 9칸 방위(단원 가운데에서 본 곳의 자리). C = 가운데 */
export type Dir9 = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | 'C';

/** 동 만나기 카드 근거(계획서 N13): 단원 안 자리 · 단원 '끝' · 맞닿은 단원 밖 시·군·구(outside 의 id) */
export interface Meet { dir: Dir9; edge?: 'N' | 'E' | 'S' | 'W'; touch?: string[] }

/** 단원 정보(등록된 단원 Region.unit): 동 단원 또는 일반구 단원(gu, 계획서 N5 · E7 — layer 'sgg') */
export interface UnitMeta {
  parent: string;       // 지역 키(seoul) — 홈 탭·kgq_last_v1 에는 이 키를 쓴다(N9·N16)
  code: string;         // 동 단원: 시·군·구 코드 5자리(11110) — 단원 파일 이름·GA unit_id. 일반구 단원: 시·도 코드(41)
  gu?: boolean;         // 일반구 단원('{지역}/gu')
  si?: string;          // 일반구 단원이면 시 층 id(kr:sgg:41280)
  meet: Record<string, Meet>;
  outside: Record<string, { ko: string; sido: string }>;
  /** 섬 상자가 있는 동 단원: 그 가운데 정말 먼 섬(지역 표 먼 섬 규칙). 없으면 빈 목록, 옛 캐시 파일이면 열쇠가 없다 */
  far?: string[];
}

/** units.json emdUnits 의 단원 한 줄(동 색인, 계획서 N17): 단원 파일 없이 '아는 곳'·복습 수·복습 차례·단원별 모으기를 판정한다 */
export interface EmdIndex {
  code: string;         // 11110
  ko: string;           // 종로구
  slug: string;         // jongno-gu
  n: number;            // 곳 수
  lessons: number;      // 과 수
  ids: string[];        // 곳 id 뒤 5자리(곳 id = 'kr:emd:' + code + 이것)
  si?: string;
}

/** 동 단원 파일 public/data/geo/{판}/emd/{코드}.json(파이프라인 E3 규격). 지도 경계는 같은 이름의 .topo.json */
export interface EmdUnitFile {
  version: string;
  key: string;          // seoul/jongno-gu
  region: string;       // seoul
  code: string;
  sido: string;
  ko: string;
  full: string;
  en: string;
  layer: 'emd';
  si?: string;
  fit: BBox;
  items: { id: string; ko: string; slug: string; kind: '동' | '읍' | '면'; en?: string }[];   // en: 판 .2 부터(옛 캐시에는 없음)
  lessons: Lesson[];
  screens: Screen[];
  far?: string[];                         // 섬 상자가 있는 단원: 정말 먼 섬(없으면 [])
  neighbors: Record<string, string[]>;    // 단원 안 이웃
  labels: LabelsFile;                     // 이름표 점
  meet: Record<string, Meet>;
  outside: Record<string, { ko: string; sido: string }>;
}

/**
 * 일반구 단원(units.json guUnits, 계획서 N5 · E7): 시 층 지역의 일반구 전부. 경계는 부모 지역 -sgg 파일의 sgg 층을 쓴다(새 경계 파일 없음).
 * 곳 id 는 kr:sgg:{일반구 코드}(숙달 키 그대로), 이름표 점·이웃은 labels.json·neighbors.json(sgg)
 */
export interface GuUnitFile {
  key: string;          // gyeonggi/gu
  region: string;       // gyeonggi
  sido: string;
  ko: string;           // 경기 일반구
  full: string;
  en: string;
  layer: 'sgg';
  fit: BBox;
  items: { id: string; ko: string; slug: string; full: string; si: string; line: string }[];
  lessons: Lesson[];
  screens: Screen[];
}

/**
 * 시·도 단원(units.json korea, 계획서 N30 · E8 모델 · E10 데이터): 16 시·도를 맞히는 단원. 경계는 판 폴더의 전국 시·도 지도(sido.topo.json, 지역 고르기와 같은 파일),
 * 이름표 점·이웃은 이 파일에(labels.json·neighbors.json 에 시·도 층을 더하지 않는다). 영어 앱은 판에 enNames 가 있을 때만 등록한다(EN_EMD 5.1 — 전에는 N26 으로 등록하지 않음)
 */
export interface KoreaFile {
  key: 'korea';
  sido: string;
  ko: string;
  full: string;
  en: string;
  layer: 'sido';
  fit: BBox;
  items: { id: string; ko: string; slug: string; line?: string }[];
  lessons: Lesson[];
  screens: Screen[];
  labels: LabelsFile;
  neighbors: Record<string, string[]>;
}

/**
 * emdUnits: 동 공개 지역(지역 표 emd live)만. 없으면(옛 캐시·동 공개 전) 동 입구를 숨긴다. guUnits: 일반구 단원이 켜진 지역(지역 표 gu live)만.
 * korea: 시·도 단원이 켜졌을 때만(E10 — E8 에서는 --preview 미리보기에만 임시 과로 실린다)
 */
/** sameNames(E11 · N12): 전국에서 두 시·도 이상에 있는 시·군·구 이름(중구·동구·서구·남구·북구·강서구·고성군) — 지역이 섞이는 화면에서 시·도 이름을 붙인다 */
/**
 * enNames(설계안 EN_EMD 5.1): 이 판의 동 단원 파일·일반구 단원에 영어 이름(곳·과·화면·이웃 땅 en)이 실렸다는 표시. 영어 앱은 이것이 true 일 때만
 * 동·일반구·시·도 단원을 싣는다(registry.ts unitOptions — 배포 직후 옛 캐시 units.json 을 받은 새 JS 는 지금 영어 앱처럼 셋을 끈다)
 */
export interface UnitsFile { version: string; enNames?: boolean; regions: Region[]; emdUnits?: Record<string, EmdIndex[]>; guUnits?: Record<string, GuUnitFile>; korea?: KoreaFile; sameNames?: string[] }

export interface NeighborsFile {
  sgg: Record<string, string[]>;
  si: Record<string, string[]>;
  sea: Record<string, { id: string; via: string }[]>;  // 다리로 이어진 바다 건너 이웃(옆으로 치지 않음)
}

/** id → [경도, 위도, 내접원 반지름 m] */
export type LabelsFile = Record<string, [number, number, number]>;

export interface GeoData { units: UnitsFile; neighbors: NeighborsFile; labels: LabelsFile }
