// 색인 쪽 목록(사이트맵)과 쪽마다 고친 날(lastmod) — 계획서 E9 · 6절 W1.
// 차례: 홈 → 허브(지역 표 hub 가 있는 지역, 표 차례) → 그 허브의 곳 쪽 → 가이드(검수한 글) → 소개·문의·출처 → 방침.
// lastmod 는 내용 기준이다: 빌드한 날이 아니라 그 쪽 내용이 실제로 바뀐 날. 내용이 날짜를 가진 곳(가이드 updated, 구 소개 reviewed,
// 방침 시행일)은 그 날짜를 쓰고, 나머지는 DEFAULT_UPDATED 에 쪽별 고친 날(UPDATED)을 더한다.
// 점검기(tools/check.mjs 7)가 운영 기준 목록(tests/indexed-pages.json)과 쪽 내용(제목·설명·본문)을 견줘
// '내용이 바뀌었는데 날짜 그대로'·'내용은 그대로인데 날짜만 바뀜'·'새 색인 쪽 5개 넘음'·'새 쪽 날짜가 기본값 그대로'를 잡는다.
// 정적 쪽은 사람이 검수한 고유 본문이 있을 때만 새로 만든다(6절 W, 애드센스 '가치 없는 콘텐츠' 반려 이력).
import { DEFAULT_UPDATED, PRIVACY_EFFECTIVE } from '../consts';
import { SEOUL_GU } from '../data/seoul';
import { INTROS, introOf } from '../data/seoul-intro';
import { visibleGuides } from '../guides/registry';
import { HUBS } from './regions';
import { region, UNITS, ilbanGuOf } from './geo';
import { regionIntroOf } from '../data/region-intro';

export interface IndexPage { path: string; updated: string }

/**
 * 쪽별 고친 날: 점검기가 '내용이 바뀌었는데 lastmod 가 기준 목록보다 늦지 않음'을 알리면, 그 쪽 주소와 내용을 고친 날을 여기에 적는다.
 * 예: { '/': '2026-12-01' } — 새 지역을 열어 홈 설명이 바뀐 날.
 * 홈·영문 홈·소개 쪽 description 은 공개 지역(지역 표 status live)에서 만들므로, 지역을 켤 때뿐 아니라 **되돌릴 때(status off)도**
 * '/', '/en/', '/about/' 세 줄에 그날을 적어야 점검 7 을 지난다(영어 이름을 확인하지 않은 지역이면 '/en/' 은 그대로).
 * 새 색인 쪽(W2 허브 등)은 만든 날을 꼭 적는다 — 없으면 DEFAULT_UPDATED 가 나가 점검 7 이 실패한다
 */
const UPDATED: Record<string, string> = {
  // 시·도 단원(korea, 계획서 E10)을 열어 홈·소개 쪽 설명과 소개 첫 단락에 '전국 16개 시·도'가 들어간 날(영어 홈은 그대로 — 영어 앱은 시·도 단원을 싣지 않음).
  // 같은 날 부산(E11)을 열어 홈·영문 홈·소개 쪽 설명이 '서울·부산·인천·경기' / 'Seoul, Busan, Incheon and Gyeonggi'로, 소개 첫 단락·과 수 줄에 부산이 들어감.
  // 같은 날 대구·대전·울산·세종(E12)을 열어 설명이 '서울·인천·경기 등 8개 시·도' / 'Seoul, Incheon, Gyeonggi and 4 more regions'(앞 세 이름은 공개 차례 openOrder,
  // 영어는 세종 뺌)로, 소개 첫 단락에 '대구 7구 2군, 대전 5개 구, 울산 4구 1군, 세종 25개 읍·면·동'과 과 수 줄이 들어감(날짜는 그대로 2026-11-14).
  // 강원·충북·전북·제주(E13, 2026-11-15)를 열어 설명이 '서울·인천·경기 등 12개 시·도' / 'Seoul, Incheon, Gyeonggi and 7 more regions'(영어는 세종·제주 뺌)로,
  // 소개 첫 단락에 '충북 11개 시·군, 제주 43개 읍·면·동, 강원 18개 시·군, 전북 14개 시·군'과 과 수 줄(제주는 열한 과)이 들어감 — 그날로 바꿈.
  // 같은 날 충남·경북(E14)을 열어 설명이 '… 등 14개 시·도' / '… and 9 more regions'로, 소개 첫 단락에 '충남 15개 시·군, 경북 22개 시·군', 출처 쪽에
  // '20m(경북은 40m)'·'충남 15개 시·군, 경북 22개 시·군'이 들어감(날짜는 그대로 2026-11-15).
  // 같은 날 경남(E15)을 열어 설명의 시·도 수와 영어 '… more regions' 수가 하나씩 늘고 소개 첫 단락에 '경남 18개 시·군'과 과 수 줄이 들어감(날짜 그대로).
  // E14·E15 를 합친 판의 설명은 '… 등 15개 시·도' / '… and 10 more regions'.
  // 같은 날 전남광주(E16 — 마지막 새 지역)를 열어 열여섯 시·도가 모두 열려 한국어 설명이 '전국 16개 시·도와 시·군·구'(lib/regions.ts studyKo — 모두 열면 그 글)로,
  // 소개 첫 단락·과 수 줄에 전남광주가 들어감(날짜 그대로). 영어 설명은 그대로('… and 10 more regions' — 전남광주는 영문 확인 전이라 세지 않음, Q5).
  // 같은 날 사용자 지시로 전남광주 영문을 켜(짧은 이름 Jeonnam-Gwangju) 영어 설명이 '… and 11 more regions'로 바뀜('/en/' 날짜 그대로 2026-11-15, 공유 그림 og-image-en 도 다시 만듦).
  // 같은 날 사용자 결정('모든 명칭은 법이 정한 명칭으로')으로 한국어 짧은 이름 '전남광주'를 법정 약칭 '광주특별시'로 바꿔 소개 첫 단락·과 수 줄이
  // '광주특별시 27개 시·군·구'·'광주특별시는 여섯 과'가 됨('/about/' 날짜 그대로 2026-11-15). '/'·'/en/' 설명은 '전국 16개 시·도…'·'Seoul, Incheon, Gyeonggi …'라 그대로.
  // 배포는 마지막에 한 번(사용자 결정 11-14)이라 운영에서 세 쪽이 실제로 바뀌는 날은 배포일이다 — 배포 때 이 세 줄을 배포일로 바꾼다(PRIVACY_EFFECTIVE 와 함께).
  // 점검 7 은 기준일(11-06)보다 늦기만 하면 통과해 이 어긋남을 잡지 못한다. → 배포일 2026-11-16 으로 바꿈(/sources/ 도)
  // 2026-11-17 서울 과 이름을 방위로 바꿔(사용자 결정 — '도심과 서북' → '북서쪽' 등) 첫 카드 '서울 1과 · 북서쪽 6개 구'가 됨
  '/': '2026-11-17',
  // 영어 동 공부(설계안 docs/EN_EMD_PLAN_2026-11-16.md 9절): 영어 앱에 세종·제주(과 없는 지역)도 열려 영문 홈 설명이 'Seoul, Incheon, Gyeonggi and 11 more regions' →
  // 'all 16 provinces and cities of Korea'(lib/regions.ts scopeEn)로 바뀜. 전국 확대(79b1863)와 같은 날 2026-11-16 에 두 번째로 내보냄(사용자 결정 11-16 '오늘 배포') —
  // 날짜가 운영 기준과 같아 점검 7 을 지나지 못하므로, 배포 빌드로 운영 기준 목록을 먼저 다시 쓰고 내보냈다(docs/WORKLOG.md 2026-11-16 영어 동 공부 배포)
  // 2026-11-17 서울 과 이름: 첫 카드 'Seoul lesson 1 · Northwest, 6 districts'
  '/en/': '2026-11-17',
  // 2026-11-17 서울 과 이름: '배우는 순서' 글과 과 표(구 쪽 25 × 한·영의 '서울 N과 …에서' 줄은 아래 GU_PAGES_UPDATED)
  // 2026-11-18 쪽 아래의 출처 표기 줄을 뺌(사용자 결정 — 출처는 /sources/ 에만, 한·영 같게): 서울·경기·인천 허브와 구 쪽 25 × 한·영(아래 GU_PAGES_UPDATED)
  '/seoul/': '2026-11-18',
  '/en/seoul/': '2026-11-18',
  '/gyeonggi/': '2026-11-18',
  '/incheon/': '2026-11-19',   // 2026-11-19 학습 가이드(인천 개편) 링크가 들어감
  // 2026-11-18 소개 쪽을 줄임(지역·과 수 나열과 데이터 설명을 뺌 — 사용자 결정)
  '/about/': '2026-11-18',
  // 데이터 출처 '위치 한 줄' 항목에 지도로 확인하는 근거 '바닷가'를 더한 날(E11 — 새 근거 coast).
  // '합치기' 항목의 시 층 지도를 판에서 만들어 '경기·충북·전북'이 들어간 날(E13 검수, 2026-11-15). 배포 때 /·/en/·/about/ 처럼 배포일로 바꾼다.
  // 같은 날 경남(E15)을 열어 '합치기'에 경남, '단순화'가 E14 와 합쳐 '20m(경북·경남은 40m)'로, '이웃 땅'에 대마도(일본)가 들어감(날짜 그대로).
  // 같은 날 전남광주(E16)를 열어 '단순화'가 '20m(전남광주는 60m, 경북·경남은 40m)'로 바뀜(날짜 그대로)
  // 같은 날 전국 마무리(E17)에서 '단순화' 묶음을 간격 차례로 바꿔 '20m(경북·경남은 40m, 전남광주는 60m)'가 됨(날짜 그대로).
  // 같은 날 법정 약칭으로 바꿔 '… 광주특별시는 60m'가 됨(날짜 그대로).
  // 같은 날(E17) 모든 쪽 바닥글의 출처 줄이 '북한 땅' → '이웃 땅(북한·일본)'(영어 'Neighboring land (North Korea, Japan)')으로 바뀌었지만
  // 바닥글은 <main> 밖이라 쪽 내용 지문(tools/site-rules.mjs contentHash — 제목·설명·본문)에 들지 않아 어느 쪽 날짜도 바꾸지 않는다
  // 2026-11-18 출처 쪽을 줄임(판 이름·파일 해시·단순화 간격 등 만드는 사람용 정보를 뺌 — 사용자 결정)
  '/sources/': '2026-11-18',
  // 2026-11-19 학습 가이드 6편과 목록 공개(사용자 '바로 적용') — 새 쪽은 만든 날을 적는다(점검 7)
  // 2026-11-19 서울·인천·경기 밖 13개 시·도 허브(한·영, 사용자 '만들어줘') — 새 쪽은 만든 날
  '/busan/': '2026-11-19',
  '/en/busan/': '2026-11-20',
  '/daegu/': '2026-11-19',
  '/en/daegu/': '2026-11-20',
  '/daejeon/': '2026-11-19',
  '/en/daejeon/': '2026-11-20',
  '/ulsan/': '2026-11-19',
  '/en/ulsan/': '2026-11-20',
  '/sejong/': '2026-11-19',
  '/en/sejong/': '2026-11-19',
  '/chungbuk/': '2026-11-19',
  '/en/chungbuk/': '2026-11-19',
  '/chungnam/': '2026-11-19',
  '/en/chungnam/': '2026-11-20',
  '/gyeongbuk/': '2026-11-19',
  '/en/gyeongbuk/': '2026-11-19',
  '/gyeongnam/': '2026-11-19',
  '/en/gyeongnam/': '2026-11-19',
  '/gangwon/': '2026-11-19',
  '/en/gangwon/': '2026-11-20',
  '/jeonbuk/': '2026-11-19',
  '/en/jeonbuk/': '2026-11-20',
  '/jeonnam-gwangju/': '2026-11-19',
  '/en/jeonnam-gwangju/': '2026-11-20',
  '/jeju/': '2026-11-19',
  '/en/jeju/': '2026-11-19',
  '/guide/': '2026-11-19',
  // 2026-11-19 한국어 쪽마다 영어 쪽(사용자 지시) — 새 영어 쪽은 만든 날
  '/en/incheon/': '2026-11-19',
  '/en/gyeonggi/': '2026-11-19',
  '/en/about/': '2026-11-19',
  '/en/contact/': '2026-11-19',
  '/en/sources/': '2026-11-19',
  '/en/guide/': '2026-11-19',
  '/guide/korea-divisions-2026/': '2026-11-19',
  '/guide/legal-vs-administrative-dong/': '2026-11-19',
  '/guide/incheon-reform-2026/': '2026-11-20',
  '/guide/autonomous-vs-general-gu/': '2026-11-20',
  '/guide/seoul-25-gu/': '2026-11-19',
  '/guide/recall-practice/': '2026-11-20',
};

const later = (a: string, b?: string | null) => (b && b > a ? b : a);
/** 구 쪽 25 × 한·영을 함께 고친 날: 2026-11-17 서울 과 이름을 방위로(과 줄 '서울 1과 '북서쪽'에서 …'), 2026-11-18 쪽 아래 출처 표기 줄을 뺌 */
const GU_PAGES_UPDATED = '2026-11-19';   // 2026-11-19 영어 구 쪽에 영어 소개 글이 들어감
/** 2026-11-20 소개 글·출처 표기를 다시 고쳐 내용이 바뀐 곳 쪽(한·영) — 소개 글의 확인한 날(reviewed)은 그대로라 여기에 따로 적는다 */
const CONTENT_REVISED_1120 = new Set<string>([
  '/en/seoul/gangseo-gu/',
  '/en/seoul/seodaemun-gu/',
  '/en/seoul/yangcheon-gu/',
  '/en/seoul/eunpyeong-gu/',
  '/en/jeonnam-gwangju/goheung-gun/',
  '/en/jeonnam-gwangju/gurye-gun/',
  '/jeonnam-gwangju/damyang-gun/',
  '/en/jeonnam-gwangju/damyang-gun/',
  '/en/jeonnam-gwangju/mokpo-si/',
  '/en/jeonnam-gwangju/boseong-gun/',
  '/en/jeonnam-gwangju/seo-gu/',
  '/en/jeonnam-gwangju/suncheon-si/',
  '/en/jeonnam-gwangju/yeosu-si/',
  '/en/jeonnam-gwangju/yeongam-gun/',
  '/en/jeonnam-gwangju/wando-gun/',
  '/en/jeonnam-gwangju/jangseong-gun/',
  '/en/jeonnam-gwangju/jangheung-gun/',
  '/en/jeonnam-gwangju/haenam-gun/',
  '/en/busan/geumjeong-gu/',
  '/en/busan/nam-gu/',
  '/en/busan/dongnae-gu/',
  '/en/busan/busanjin-gu/',
  '/en/busan/buk-gu/',
  '/en/busan/sasang-gu/',
  '/en/busan/saha-gu/',
  '/en/busan/seo-gu/',
  '/en/busan/suyeong-gu/',
  '/en/busan/yeongdo-gu/',
  '/en/busan/jung-gu/',
  '/en/daegu/gunwi-gun/',
  '/en/daegu/nam-gu/',
  '/en/daegu/dong-gu/',
  '/daegu/jung-gu/',
  '/en/daegu/jung-gu/',
  '/en/incheon/ganghwa-gun/',
  '/en/incheon/geomdan-gu/',
  '/en/incheon/gyeyang-gu/',
  '/en/incheon/namdong-gu/',
  '/en/incheon/michuhol-gu/',
  '/en/incheon/bupyeong-gu/',
  '/en/incheon/seohae-gu/',
  '/en/incheon/yeonsu-gu/',
  '/en/incheon/yeongjong-gu/',
  '/en/incheon/ongjin-gun/',
  '/incheon/jemulpo-gu/',
  '/en/incheon/jemulpo-gu/',
  '/en/daejeon/daedeok-gu/',
  '/en/daejeon/yuseong-gu/',
  '/en/ulsan/nam-gu/',
  '/en/ulsan/buk-gu/',
  '/en/ulsan/jung-gu/',
  '/en/sejong/sejong-si/',
  '/en/gyeonggi/goyang-si/',
  '/en/gyeonggi/gwangju-si/',
  '/en/gyeonggi/guri-si/',
  '/en/gyeonggi/gunpo-si/',
  '/en/gyeonggi/namyangju-si/',
  '/en/gyeonggi/dongducheon-si/',
  '/gyeonggi/bucheon-si/',
  '/en/gyeonggi/bucheon-si/',
  '/gyeonggi/suwon-si/',
  '/en/gyeonggi/suwon-si/',
  '/en/gyeonggi/siheung-si/',
  '/gyeonggi/anyang-si/',
  '/en/gyeonggi/anyang-si/',
  '/en/gyeonggi/yangju-si/',
  '/en/gyeonggi/yeoju-si/',
  '/en/gyeonggi/yongin-si/',
  '/en/gyeonggi/icheon-si/',
  '/en/gyeonggi/paju-si/',
  '/en/gyeonggi/pocheon-si/',
  '/gyeonggi/hanam-si/',
  '/en/gyeonggi/hanam-si/',
  '/en/gyeonggi/hwaseong-si/',
  '/en/chungbuk/danyang-gun/',
  '/en/chungbuk/okcheon-gun/',
  '/en/chungbuk/eumseong-gun/',
  '/en/chungbuk/cheongju-si/',
  '/en/chungnam/gongju-si/',
  '/chungnam/geumsan-gun/',
  '/en/chungnam/geumsan-gun/',
  '/chungnam/boryeong-si/',
  '/en/chungnam/boryeong-si/',
  '/chungnam/seocheon-gun/',
  '/en/chungnam/seocheon-gun/',
  '/chungnam/cheonan-si/',
  '/en/chungnam/cheonan-si/',
  '/en/gyeongbuk/yeongyang-gun/',
  '/en/gyeongbuk/yecheon-gun/',
  '/en/gyeongbuk/uiseong-gun/',
  '/en/gyeongbuk/cheongsong-gun/',
  '/gyeongbuk/chilgok-gun/',
  '/en/gyeongbuk/chilgok-gun/',
  '/en/gyeongnam/geoje-si/',
  '/en/gyeongnam/goseong-gun/',
  '/gyeongnam/sancheong-gun/',
  '/en/gyeongnam/sancheong-gun/',
  '/en/gyeongnam/uiryeong-gun/',
  '/en/gyeongnam/changnyeong-gun/',
  '/en/gyeongnam/changwon-si/',
  '/en/gyeongnam/hadong-gun/',
  '/en/gyeongnam/haman-gun/',
  '/en/gyeongnam/hamyang-gun/',
  '/en/jeju/jeju-si/',
  '/en/gangwon/donghae-si/',
  '/en/gangwon/wonju-si/',
  '/gangwon/inje-gun/',
  '/en/gangwon/inje-gun/',
  '/gangwon/cheorwon-gun/',
  '/en/gangwon/cheorwon-gun/',
  '/en/jeonbuk/gochang-gun/',
  '/en/jeonbuk/gunsan-si/',
  '/en/jeonbuk/gimje-si/',
  '/en/jeonbuk/sunchang-gun/',
  '/jeonbuk/wanju-gun/',
  '/en/jeonbuk/wanju-gun/',
  '/jeonbuk/jangsu-gun/',
  '/en/jeonbuk/jangsu-gun/',
  '/jeonbuk/jeonju-si/',
  '/en/jeonbuk/jeonju-si/',
  '/en/guide/korea-divisions-2026/',
  '/en/guide/incheon-reform-2026/',
  '/en/guide/legal-vs-administrative-dong/',
  '/en/guide/autonomous-vs-general-gu/',
  '/en/guide/seoul-25-gu/',
  '/en/guide/recall-practice/',
]);
const at = (path: string, base = DEFAULT_UPDATED): IndexPage => ({ path, updated: later(later(base, UPDATED[path]), CONTENT_REVISED_1120.has(path) ? '2026-11-20' : null) });

/** 허브 아래 곳 쪽(한·영 짝). 지금은 서울 25개 구뿐 — 새 지역의 곳 쪽(W3)은 애드센스 승인 뒤, 한 배포에 5쪽 이하로 */
const PLACES: Record<string, () => IndexPage[]> = {
  seoul: () => {
    const r = region('seoul');
    for (const x of INTROS) if (!r.items.some((it) => it.id === x.id)) throw new Error(`구 소개 글의 곳 ${x.id} 가 서울에 없음`);
    return SEOUL_GU.flatMap((g) => {
      const id = r.items.find((it) => it.slug === g.slug)!.id;
      // 한국어 구 쪽은 검수한 소개 글이 들어간 날 내용이 바뀐다(영어 쪽에는 소개 글이 없다)
      return [at(`/seoul/${g.slug}/`, later(later(DEFAULT_UPDATED, introOf(id)?.reviewed), GU_PAGES_UPDATED)), at(`/en/seoul/${g.slug}/`, later(DEFAULT_UPDATED, GU_PAGES_UPDATED))];
    });
  },
};

/** 서울 밖 시·군·구 쪽(src/pages/[region]/[slug]) — 소개 글에 확인한 날(reviewed)이 있는 곳만. 허브가 없는 지역도 사이트맵에 넣는다(2026-11-19) */
function regionPlaces(): IndexPage[] {
  return UNITS.regions.filter((r) => r.key !== 'seoul').flatMap((r) => r.items.flatMap((it) => {
    const x = regionIntroOf(it.id);
    // 시 쪽은 그 안에 싣는 일반구 소개 글이 확인된 날에도 내용이 바뀐다
    const day = ilbanGuOf(it.id).reduce((d, g) => later(d, regionIntroOf(g.id)?.reviewed), x?.reviewed ?? '');
    return x?.reviewed ? [at(`/${r.key}/${it.slug}/`, later(DEFAULT_UPDATED, day)), at(`/en/${r.key}/${it.slug}/`, later(DEFAULT_UPDATED, day))] : [];
  }));
}

export function indexPages(): IndexPage[] {
  const guides = visibleGuides().filter((g) => g.reviewed);
  return [
    at('/'), at('/en/'),
    ...HUBS.flatMap((s) => [at(`/${s.key}/`), ...(s.hub?.en ? [at(`/en/${s.key}/`)] : []), ...(PLACES[s.key]?.() ?? [])]),
    ...regionPlaces(),
    ...(guides.length ? [at('/guide/'), ...guides.map((g) => at(`/guide/${g.slug}/`, g.updated))] : []),
    ...(guides.length ? [at('/en/guide/'), ...guides.map((g) => at(`/en/guide/${g.slug}/`, later(g.updated, '2026-11-19')))] : []),
    at('/about/'), at('/en/about/'), at('/contact/'), at('/en/contact/'), at('/sources/'), at('/en/sources/'),
    // 방침은 본문을 고쳐 내보낸 날 = 시행일(consts PRIVACY_EFFECTIVE)
    at('/privacy.html', PRIVACY_EFFECTIVE), at('/privacy-en.html', PRIVACY_EFFECTIVE),
  ];
}
