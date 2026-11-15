// 사이트 전체에서 쓰는 이름과 값

export const SITE_NAME = '채움지도';
export const SITE_NAME_EN = 'Fill the Map';
export const TAGLINE = '백지도 퀴즈로 익히는 대한민국 행정구역';
export const TAGLINE_EN = "Learn Korea's administrative regions on a blank map";

// 경계 데이터 판: 폴더 이름·앱 상수·GA data_ver 를 이 값 하나로 맞춘다(설계서 8.3)
export const DATA_VER = 'kr-20261001.2';

export const GA_ID = 'G-E5PLVYPNS2';
export const ADSENSE_ACCOUNT = 'ca-pub-1946710813485758';
// 네이버 서치어드바이저 소유 확인(HTML 태그 방식, https://chaeumjido.co.kr 로 등록해 받은 값, 11-13). 모든 쪽 머리에 넣는다
export const NAVER_SITE_VERIFICATION = 'fc76226ad0f678ac55f61d23c7ec9b4d3e01f4a0';
export const CONTACT_EMAIL = 'koquiz.support@gmail.com';

// 쪽을 고친 날: 사이트맵 lastmod 로 쓴다(빌드한 날이 아니라 실제로 고친 날)
export const DEFAULT_UPDATED = '2026-11-06';

// 개인정보처리방침 시행일: 방침 본문을 고친 판을 내보내는 날로 고친다. 방침 본문의 {{EFFECTIVE}} 자리와 사이트맵 방침 두 줄의 lastmod 에 들어간다.
// 11-14 판은 이미 운영에 있다. E6 에서 2항(기기 저장)을 고쳤지만 단계 사이에는 내보내지 않으므로, 전국 확대를 마지막에 내보내는 날 그날 날짜로 바꾼다
// → 전국 확대를 내보낸 날 2026-11-16
// → 영어 방침 2항('(Korean app only)' 지움 — 영어 동 공부)도 같은 날 2026-11-16 에 내보냄(사용자 결정 '오늘 배포'). 시행일은 그대로
export const PRIVACY_EFFECTIVE = '2026-11-16';
