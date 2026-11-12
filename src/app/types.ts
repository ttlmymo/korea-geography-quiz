// 앱이 쓰는 데이터 모양. 경계 데이터(public/data/geo/{판}/)는 파이프라인(pipeline/build-geo.mjs)이 만든다

/** [서, 남, 동, 북] 경도·위도 */
export type BBox = [number, number, number, number];

export interface Item {
  id: string;   // kr:sgg:11110
  ko: string;   // 종로구
  slug: string; // jongno-gu
  line: string; // 위치 한 줄
}

export interface Lesson {
  no: number;
  title: string;
  en?: string;          // 영어 과 이름(영어 앱)
  items: string[];      // 곳 id, 만나기 순서
  fit: BBox;            // 과 화면 범위(각 곳의 가장 큰 덩어리 기준)
  minTapPx: number;     // 가장 좁은 휴대폰에서 가장 작은 칸의 내접원 지름
  ambiguous: string[];  // 24px 보다 작아 '모호하면 확대'가 자주 일어날 곳
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
}

export interface Region {
  key: string;          // seoul
  sido: string;         // 11
  ko: string;           // 서울
  full: string;         // 서울특별시
  en: string;
  layer: 'sgg' | 'si';  // 경기는 일반구를 시로 합친 층
  fit: BBox;
  items: Item[];
  lessons: Lesson[];
  screens: Screen[];
}

export interface UnitsFile { version: string; regions: Region[] }

export interface NeighborsFile {
  sgg: Record<string, string[]>;
  si: Record<string, string[]>;
  sea: Record<string, { id: string; via: string }[]>;  // 다리로 이어진 바다 건너 이웃(옆으로 치지 않음)
}

/** id → [경도, 위도, 내접원 반지름 m] */
export type LabelsFile = Record<string, [number, number, number]>;

export interface GeoData { units: UnitsFile; neighbors: NeighborsFile; labels: LabelsFile }
