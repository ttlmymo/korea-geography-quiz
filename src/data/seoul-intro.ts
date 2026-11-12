// 서울 구 쪽의 소개 글(애드센스 계획 4-5·8절). 글마다 구청 누리집 같은 1차 자료로 쓰고, 사람이 원문과 대조한 뒤 reviewed 에 날짜를 넣는다.
// reviewed 가 없으면 개발 서버에서만 '검수 전 초안' 띠와 함께 보이고, 배포 빌드에는 들어가지 않는다(가이드와 같은 규칙).
// 문장은 초등학교 4학년이 읽을 수 있게 쓴다(설계서 3.10). 날짜는 구청마다 적는 방식이 달라(1943년 4월 1일·6월 10일) 해까지만 쓴다
import HARD from './hard-words.json';

export interface Source { t: string; url: string }
export interface Intro {
  slug: string;
  paras: string[];
  sources: Source[];
  read: string;
  reviewed: string | null;
  check: string[];
}

export const INTROS: Intro[] = [
  {
    slug: 'jongno-gu',
    paras: [
      "종로라는 이름은 종루에서 왔어요. 조선 때 지금의 종로1가에 큰 종을 매단 종루가 있었고, 이 종으로 도성 문을 열고 닫는 시각을 알렸어요. 1943년 서울에 구 제도를 실시할 때 '종루가 있는 거리'라는 뜻으로 종로구가 됐어요.",
      '경복궁·창덕궁·창경궁·종묘·사직단처럼 조선 때부터 내려온 문화유산이 많은 곳이에요. 세종로 네거리 근처에는 전국의 도로 이정표가 기준으로 삼는 도로원표가 있어요.',
    ],
    sources: [{ t: '종로구청, 역사와 연혁 · 종로구 역사(2026. 8. 7. 수정)', url: 'https://www.jongno.go.kr/Main.do?menuNo=1890' }],
    read: '2026-11-07',
    reviewed: null,
    check: ['종로구 역사 쪽은 구제도 실시를 1943년 4월 1일로 적었고, 중구·용산·서대문 쪽은 6월 10일로 적어 글에는 해만 씀'],
  },
  {
    slug: 'jung-gu',
    paras: [
      '중구는 서울 4대문 안의 한가운데에 있어요. 북쪽은 청계천을 따라 종로구와 맞닿고, 남쪽에는 남산이 있어요.',
      '1943년 서울(그때 이름은 경성부)에 구 제도를 처음 둘 때 일곱 사무소 가운데 하나인 중앙 사무소로 시작해, 그해 중구가 됐어요. 은행 본점과 큰 회사가 모인 업무 중심지이고, 백화점과 큰 시장이 모인 쇼핑 중심지이기도 해요.',
    ],
    sources: [
      { t: '중구청, 중구의 연혁', url: 'https://www.junggu.seoul.kr/content.do?cmsid=14345' },
      { t: '중구청, 일반현황', url: 'https://www.junggu.seoul.kr/content.do?cmsid=14056' },
      { t: '중구청, 지역특성', url: 'https://www.junggu.seoul.kr/content.do?cmsid=14063' },
    ],
    read: '2026-11-07',
    reviewed: null,
    check: ["'일곱 사무소'는 연혁의 '경성부 전역에 7개 사무소가 설치' 문장에 기댐", "'4대문 안의 한가운데'는 일반현황(서울의 중심부)·지역특성(4대문 내 중심 업무지구)을 합친 표현"],
  },
  {
    slug: 'yongsan-gu',
    paras: [
      '용산구청은 용산구가 1896년 한성부 용산방에서 시작했다고 소개해요. 광복 뒤인 1945년 10월 용산구라는 이름이 붙었어요.',
      "남산 남쪽 자락에 있는 용산동2가 동네는 '해방촌'이라고 불러요. 1945년 해방 뒤 외국에서 돌아온 동포와 북쪽에서 내려온 사람들이 이 산자락에 모여 살았기 때문이에요.",
    ],
    sources: [{ t: '용산구청, 용산역사 · 동명유래', url: 'https://www.yongsan.go.kr/portal/main/contents.do?menuNo=200218' }],
    read: '2026-11-07',
    reviewed: null,
    check: ["'남산 남쪽 자락'은 동명유래의 '남산의 연맥이 후암동을 지나 남쪽으로 뻗어내려간 구릉지대'를 줄인 말", "'북쪽에서 내려온 사람들'은 원문의 '월남민'"],
  },
  {
    slug: 'eunpyeong-gu',
    paras: [
      '은평이라는 이름은 조선 때 한성부 북부의 성 밖 마을인 연은방과 상평방, 두 이름에서 왔어요.',
      '이곳은 경기도 고양군 은평면이었다가 1949년 서울 서대문구에 들어왔어요. 1973년에는 고양군의 구파발·진관 지역도 서울에 들어왔고, 1979년 10월 1일 서대문구에서 나뉘어 은평구가 됐어요.',
    ],
    sources: [{ t: '은평구청, 은평소개', url: 'https://www.ep.go.kr/www/contents.do?key=776' }],
    read: '2026-11-07',
    reviewed: null,
    check: ["'연은방의 은 + 상평방의 평'처럼 한 글자씩 땄다고는 쓰지 않음(원문은 '이 두 지명에서 유래')", "서대문구청 행정기구 연혁은 같은 방을 '영은방'으로 적음 — 은평구청 표기 '연은방'을 따름"],
  },
  {
    slug: 'seodaemun-gu',
    paras: [
      "서대문이라는 이름은 조선 때 도성의 네 큰 문 가운데 서쪽 문인 돈의문, 곧 서대문에서 왔어요. 그 문 아래쪽 마을이라 '서대문'이라는 지역 이름을 얻었어요.",
      "1943년 서대문 구역소가 생겼고, 1945년 10월 서대문구청이 됐어요. 1949년 경기도 고양군의 은평면·연희면 일부가 서대문구에 들어왔다가, 1979년 녹번동·불광동 같은 북쪽 동네가 은평구로 나뉘었어요. 홍은동이라는 이름도 옛 홍제외리의 '홍'과 은평면의 '은'을 따서 지었어요.",
    ],
    sources: [
      { t: '서대문구청, 행정기구 연혁', url: 'https://www.sdm.go.kr/wesdm/history/history.do' },
      { t: '서대문구청, 동명 유래', url: 'https://www.sdm.go.kr/wesdm/history/origin.do' },
    ],
    read: '2026-11-07',
    reviewed: null,
    check: ['서대문구 행정기구 연혁에서 1943. 4. 1. 서대문사무소, 1943. 6. 10. 서대문구역소, 1945. 10. 16. 구청'],
  },
  {
    slug: 'mapo-gu',
    paras: [
      '마포구는 1944년 10월 23일 서대문구와 용산구의 일부를 떼어 새로 생겼어요.',
      '넓이는 23.85㎢로 서울의 약 3.9%예요. 동 가운데 상암동이 8.40㎢로 가장 넓어, 마포구 넓이의 3분의 1이 넘어요.',
    ],
    sources: [
      { t: '마포구청, 설립목적 및 임무', url: 'https://www.mapo.go.kr/site/main/content/mapo04010102' },
      { t: '마포구청, 위치와 면적', url: 'https://www.mapo.go.kr/site/main/content/mapo04010105' },
    ],
    read: '2026-11-07',
    reviewed: null,
    check: ['위치와 면적 쪽은 상암동을 마포구의 35%라고 적음(3분의 1이 넘음)', '이름 유래는 구청 쪽에서 찾지 못해 쓰지 않음'],
  },
  {
    slug: "dongjak-gu",
    paras: [
      "동작이라는 이름은 한강의 옛 나루터인 동재기나루에서 왔어요. 조선 때 이곳 나루는 남쪽 지방과 서울을 잇는 길목이라 사람과 물건이 많이 오갔어요.",
      "동작구는 1980년 4월 1일 관악구에서 나뉘어 서울의 17번째 구가 됐어요. 넓이는 16.39㎢로 서울의 2.7%예요.",
    ],
    sources: [
      { t: "동작구청, 동작역사", url: "https://www.dongjak.go.kr/portal/main/contents.do?menuNo=201198" },
      { t: "동작구청, 연혁", url: "https://www.dongjak.go.kr/portal/main/contents.do?menuNo=201225" },
      { t: "동작구청, 일반현황", url: "https://www.dongjak.go.kr/portal/main/contents.do?menuNo=200092" },
    ],
    read: "2026-11-07",
    reviewed: null,
    check: ["'남쪽 지방'은 원문의 '삼남지역'을 쉽게 쓴 말"],
  },
  {
    slug: "seocho-gu",
    paras: [
      "서초라는 이름은 '서리풀'이라는 옛 이름에서 왔어요. 서초구청은 '서초'가 좋은 일을 떠올리게 하는 풀, 곧 벼를 뜻한다고 풀이하고, 옛날 서초동에서 난 쌀을 임금님께 바쳤다는 기록이 있다고 소개해요.",
      "서초구는 1988년 1월 1일 강남구에서 서초동·반포동·방배동·양재동 등 11개 법정동을 떼어 새로 생겼어요. 북쪽은 한강 건너 용산구와 마주 보고, 남쪽은 경기 과천시·성남시와 맞닿아요.",
    ],
    sources: [
      { t: "서초구청, 지명유래", url: "https://www.seocho.go.kr/site/seocho/05/10502040100002015070810.jsp" },
      { t: "서초구청, 연혁", url: "https://www.seocho.go.kr/site/seocho/05/10502010000002015062601.jsp" },
    ],
    read: "2026-11-07",
    reviewed: null,
    check: ["연혁 쪽의 11개 법정동에는 도곡동이 들어 있고, 강남구청 강남역사관은 1989년 도곡동이 다시 강남구로 갔다고 적음"],
  },
  {
    slug: "gangnam-gu",
    paras: [
      "강남구는 1975년 성동구의 영동 출장소가 없어지면서 새로 생겼어요. 그때 강남구는 지금의 서초구·강남구·송파구·강동구를 모두 합친 넓은 구였어요. 그 뒤 1979년 강동구가, 1988년 서초구가 나뉘어 나갔어요.",
      "동쪽은 탄천을 사이에 두고 송파구와, 서쪽은 강남대로를 따라 서초구와 맞닿아요. 넓이는 39.5㎢로 서울의 6.53%이고, 가장 넓은 동은 세곡동이에요.",
    ],
    sources: [
      { t: "강남구청, 강남역사관", url: "https://www.gangnam.go.kr/contents/history/1/view.do?mid=ID06_040405" },
      { t: "강남구청, 일반현황", url: "https://www.gangnam.go.kr/contents/hello/3/view.do?mid=ID06_040401" },
    ],
    read: "2026-11-07",
    reviewed: null,
    check: ["'강남'이라는 이름의 뜻은 구청 쪽에서 찾지 못해 쓰지 않음"],
  },
  {
    slug: "songpa-gu",
    paras: [
      "송파라는 이름이 어디서 왔는지는 몇 가지 이야기가 전해요. 그 가운데 하나는 옛날 한강 가 마을 언덕에 소나무가 빽빽해서 '소나무 언덕(松坡)'이라 불렀다는 이야기예요.",
      "이 지역은 1979년 새로 생긴 강동구에 속했다가, 1988년 1월 1일 강동구에서 나뉘어 송파구가 됐어요. 조선 때 이곳 한강의 삼전도는 한강나루·노들나루와 함께 서울 한강의 세 나루로 꼽혔어요.",
    ],
    sources: [
      { t: "송파구청, 송파연혁", url: "https://www.songpa.go.kr/www/contents.do?key=2364" },
      { t: "송파구청, 송파역사 · 동명유래", url: "https://www.songpa.go.kr/www/contents.do?key=2367" },
    ],
    read: "2026-11-07",
    reviewed: null,
    check: ["이름 유래는 원문이 세 가지 설을 드는데 그 가운데 하나만 소개함", "'서울 한강의 세 나루'는 원문의 '경강삼진(京江三津)'"],
  },
  {
    slug: "gangdong-gu",
    paras: [
      "강동구는 1979년 10월 1일 천호 출장소가 구로 바뀌면서 생겼어요. 처음에는 지금의 송파구 땅까지 함께였는데, 1988년 1월 1일 송파구가 나뉘어 나갔어요.",
      "한강 가의 암사동 유적은 지금부터 약 6000~5000년 전 신석기 시대 사람들이 살던 집터예요. 남북한을 통틀어 집터가 가장 많이 나온 마을 유적 가운데 하나로, 땅을 파고 지붕을 덮은 움집 자리가 나왔어요.",
    ],
    sources: [
      { t: "강동구청, 강동구연혁", url: "https://www.gangdong.go.kr/web/newportal/contents/gdp_004_001_004_001" },
      { t: "강동구청, 역사속의 강동", url: "https://www.gangdong.go.kr/web/culture/contents/gdc020_020_010" },
    ],
    read: "2026-11-07",
    reviewed: null,
    check: ["'처음에는 지금의 송파구 땅까지 함께'는 연혁의 1988. 1. 1. '송파구와 분구'와 송파구청 연혁에 기댐", "'강동'이라는 이름의 뜻은 구청 쪽에서 찾지 못해 쓰지 않음"],
  },
  {
    slug: "gangseo-gu",
    paras: [
      "지금 강서구의 동네 대부분은 옛 경기도 김포군 양동면·양서면 마을이었어요. 1963년 서울 영등포구에 들어왔고, 1977년 9월 1일 영등포구의 16개 동을 묶어 강서구가 생겼어요.",
      "1988년 1월 1일에는 목동·신정동·신월동이 양천구로 나뉘어 나갔어요. 넓이는 41.46㎢이고, 그 가운데 절반이 넘는 54.3%가 녹지 지역이에요(2026년 1월 1일 기준).",
    ],
    sources: [
      { t: "강서구청, 강서연혁", url: "https://www.gangseo.seoul.kr/gs050705" },
      { t: "강서구청, 우리구 소개 · 일반현황", url: "https://www.gangseo.seoul.kr/gs050002" },
    ],
    read: "2026-11-07",
    reviewed: null,
    check: ["'동네 대부분'은 1963년 편입 마을 목록(가양·마곡·등촌·염창·화곡·발산·송정·과해·방화·개화 등)과 지금 법정동을 견준 말"],
  },
  {
    slug: "yangcheon-gu",
    paras: [
      "양천이라는 이름은 고려 때인 1310년부터 쓰였어요. 양천구청은 이 이름을 '밝은 태양과 냇물이 흐르는 아름다운 고장'이라고 풀이해요. 조선 때는 양천현이라는 고을 이름으로 쓰였어요.",
      "지금 양천구 땅은 1963년 경기도 김포군에서 서울 영등포구로 들어왔어요. 1977년 강서구에 속했다가 1988년 1월 1일 강서구에서 나뉘어 양천구가 됐어요. 넓이는 약 17.4㎢예요.",
    ],
    sources: [
      { t: "양천구청, 연혁 및 역사", url: "https://www.yangcheon.go.kr/site/yangcheon/04/10402010100002016081013.jsp" },
      { t: "양천구청, 위치와 면적", url: "https://www.yangcheon.go.kr/site/yangcheon/04/10402030100002016081013.jsp" },
    ],
    read: "2026-11-07",
    reviewed: null,
    check: ["넓이는 위치와 면적 쪽 표의 합계 17,407,258.6㎡를 줄인 값", "'1963년 김포군에서'는 연혁 첫 줄(김포군 양동면·양서면 등 편입)과 강서구청 연혁(양동면 신정·목동리)에 기댐"],
  },
  {
    slug: "guro-gu",
    paras: [
      "구로라는 이름은 옛날 이곳에 오래 산 노인 아홉 명이 있었다는 전설에서 왔어요. 한자로 '아홉 구(九)'와 '늙을 로(老)'를 써요.",
      "1980년 4월 1일 영등포구의 남쪽 지역을 나눠 구로구가 생겼어요. 처음에는 지금 금천구인 독산동·시흥동 등도 구로구였는데, 1995년 3월 1일 금천구가 생기면서 나뉘어 나갔어요.",
    ],
    sources: [
      { t: "구로구청, 연혁(2026. 7. 6. 수정)", url: "https://www.guro.go.kr/www/contents.do?key=2091" },
      { t: "구로구청, 동별역사", url: "https://www.guro.go.kr/www/contents.do?key=2126" },
    ],
    read: "2026-11-07",
    reviewed: null,
    check: ["전설은 동별역사의 구로동 항목('9명의 장수한 노인이 있었다는 전설')에서"],
  },
  {
    slug: "geumcheon-gu",
    paras: [
      "금천이라는 이름은 조선 태종 때인 1413년에 생긴 금천현에서 왔어요. 1795년 시흥현으로 이름이 바뀔 때까지 380여 년 동안 이 이름을 썼어요.",
      "금천구는 1995년 3월 1일 구로구의 독산동·시흥동과 가리봉동 일부(지금의 가산동)를 나눠 새로 생겼어요. 그래서 금천구의 법정동은 가산동·독산동·시흥동 셋뿐이에요.",
    ],
    sources: [
      { t: "금천구청, 금천의 유래", url: "https://www.geumcheon.go.kr/portal/contents.do?key=441" },
      { t: "금천구청, 구연혁", url: "https://www.geumcheon.go.kr/portal/contents.do?key=284" },
      { t: "구로구청, 연혁", url: "https://www.guro.go.kr/www/contents.do?key=2091" },
    ],
    read: "2026-11-07",
    reviewed: null,
    check: ["'가리봉동 일부(지금의 가산동)'는 구로구청 연혁의 '가리봉(가산)동' 표기에 기댐"],
  },
  {
    slug: "yeongdeungpo-gu",
    paras: [
      "영등포라는 이름이 어디서 왔는지는 확실하지 않아요. 영등포구청은 영등굿과 관계된 '영등'에 물가를 뜻하는 '포(浦)'가 붙은 이름으로 보는 풀이가 많다고 소개해요.",
      "영등포구는 1943년 서울에 처음 생긴 일곱 구 가운데 하나예요. 지금은 넓이가 24.35㎢(서울의 4.02%)지만, 1973년 관악구, 1977년 강서구, 1980년 구로구가 모두 영등포구의 땅을 나눠 생겼어요.",
    ],
    sources: [
      { t: "영등포구청, 동 명칭 및 지명 유래", url: "https://www.ydp.go.kr/www/contents.do?key=2887" },
      { t: "영등포구청, 일반현황", url: "https://www.ydp.go.kr/www/contents.do?key=2882" },
      { t: "성동구청, 성동구 역사(1943년 일곱 구)", url: "https://www.sd.go.kr/main/contents.do?key=1377" },
      { t: "관악구청, 연혁", url: "https://www.gwanak.go.kr/site/gwanak/11/11101010000002016051207.jsp" },
      { t: "강서구청, 강서연혁", url: "https://www.gangseo.seoul.kr/gs050705" },
      { t: "구로구청, 연혁", url: "https://www.guro.go.kr/www/contents.do?key=2091" },
    ],
    read: "2026-11-07",
    reviewed: null,
    check: ["영등포구청 조직변천사 쪽은 글로 읽히지 않아, 1943년 일곱 구는 성동구청, 나뉜 구는 관악·강서·구로 구청 연혁으로 씀"],
  },
  {
    slug: "gwanak-gu",
    paras: [
      "'관악'이라는 이름은 1963년 서울에 새로 들어온 경기도 시흥군 동면 땅을 맡을 '관악 출장소'를 두면서 처음 행정 이름으로 쓰였어요. 1973년 7월 1일 영등포구에서 나뉘어 관악구가 됐어요.",
      "처음 관악구에는 지금의 동작구 땅과 서초구의 방배동·서초동·반포동 등도 들어 있었어요. 1980년 4월 1일 노량진동·상도동 등이 동작구로 나뉘어 나갔어요. 넓이는 29.56㎢로 서울의 4.9%예요.",
    ],
    sources: [
      { t: "관악구청, 연혁", url: "https://www.gwanak.go.kr/site/gwanak/11/11101010000002016051207.jsp" },
      { t: "관악구청, 일반현황", url: "https://www.gwanak.go.kr/site/gwanak/11/11101030000002016051207.jsp" },
    ],
    read: "2026-11-07",
    reviewed: null,
    check: [],
  },
  {
    slug: "seongdong-gu",
    paras: [
      "성동이라는 이름은 '도성의 동쪽'이라는 뜻이에요. 조선 때 광희문으로 도성을 나서면 동쪽으로 넓은 들이 펼쳐졌는데, 이 들을 '살곶이들'이라고도 불렀어요.",
      "성동구는 1943년 서울에 처음 구를 둘 때 생긴 일곱 구(종로·중구·용산·동대문·서대문·성동·영등포) 가운데 하나예요. 한때는 지금의 강남·광진 지역까지 맡았는데, 1975년 강남구가, 1995년 3월 1일 광진구가 나뉘어 나갔어요. 넓이는 16.799㎢로 서울의 2.8%예요.",
    ],
    sources: [
      { t: "성동구청, 성동구 역사", url: "https://www.sd.go.kr/main/contents.do?key=1377" },
      { t: "성동구청, 일반현황", url: "https://www.sd.go.kr/main/contents.do?key=1380" },
    ],
    read: "2026-11-07",
    reviewed: null,
    check: ["'지금의 강남 지역까지 맡았는데'는 1975. 10. 1. '성동구 영동출장소와 천호출장소를 합해 강남구 신설'에 기댐"],
  },
  {
    slug: "gwangjin-gu",
    paras: [
      "광진이라는 이름은 '광나루'에서 왔어요. 지금 광장동의 광진교 근처에 넓은 나루터가 있어 '너븐나루'라고도 불렀다고 해요.",
      "이곳은 1949년 경기도 고양군 뚝도면에서 서울로 들어왔고, 오랫동안 성동구에 속했어요. 1995년 3월 1일 중랑천과 동일로를 따라 성동구를 둘로 나누면서 광진구가 생겼어요. 넓이는 17.08㎢로 서울의 2.8%예요.",
    ],
    sources: [
      { t: "광진구청, 역사속의 광진", url: "https://www.gwangjin.go.kr/portal/main/contents.do?menuNo=200270" },
      { t: "광진구청, 연혁", url: "https://www.gwangjin.go.kr/portal/main/contents.do?menuNo=200198" },
      { t: "광진구청, 일반현황", url: "https://www.gwangjin.go.kr/portal/main/contents.do?menuNo=200088" },
    ],
    read: "2026-11-07",
    reviewed: null,
    check: [],
  },
  {
    slug: "dongdaemun-gu",
    paras: [
      "동대문구라는 이름은 도성의 네 큰 문 가운데 하나인 동대문(흥인지문) 밖에 자리한 데서 왔어요.",
      "1943년 서울에 구 제도를 실시할 때 동부 출장소를 동대문구와 성동구로 나눠 생겼어요. 그 뒤 1949년 성북구가, 1988년 1월 1일 면목동·상봉동·망우동 등이 중랑구로 나뉘어 나갔어요. 넓이는 14.25㎢예요.",
    ],
    sources: [
      { t: "동대문구청, 역사", url: "https://www.ddm.go.kr/www/contents.do?key=258" },
      { t: "동대문구청, 연혁", url: "https://www.ddm.go.kr/www/contents.do?key=259" },
      { t: "동대문구청, 기본현황", url: "https://www.ddm.go.kr/www/contents.do?key=262" },
    ],
    read: "2026-11-07",
    reviewed: null,
    check: [],
  },
  {
    slug: "jungnang-gu",
    paras: [
      "중랑구 땅은 원래 경기도 양주군 구리면과 고양군 뚝도면의 일부였어요. 1949년 면목리가, 1963년 상봉·중화·묵·망우·신내 지역이 서울에 들어왔어요.",
      "1988년 1월 1일 사람이 너무 많아진 구들을 나누면서 중랑·노원·서초·양천·송파 다섯 구가 새로 생겼는데, 중랑구는 이때 동대문구에서 나뉘었어요. 망우산·봉화산·용마산 둘레에서는 구석기·청동기 시대 유물이 나왔어요.",
    ],
    sources: [{ t: "중랑구청, 연혁 · 중랑구 소개", url: "https://www.jungnang.go.kr/portal/main/contents.do?menuNo=200454" }],
    read: "2026-11-07",
    reviewed: null,
    check: ["'중랑'이라는 이름의 유래는 구청 쪽에서 찾지 못해 쓰지 않음", "연혁 쪽은 1949년 편입일을 8월 15일로 적음(다른 구청은 8월 13일) — 글에는 해만"],
  },
  {
    slug: "seongbuk-gu",
    paras: [
      "성북구라는 이름은 말 그대로 도성의 북쪽에 있다는 뜻이에요. 서울 성곽과 정릉, 간송미술관 같은 문화유산이 있어요.",
      "성북구는 1949년 8월 13일 동대문구의 돈암동·안암동·성북동과 경기도 고양군 숭인면의 여러 마을을 묶어 생겼어요. 이때 들어온 미아리·번리·수유리·우이리 지역은 1973년 도봉구에 속했다가 1995년 강북구가 됐어요. 넓이는 24.57㎢로 서울의 4.06%예요.",
    ],
    sources: [
      { t: "성북구청, 성북소개", url: "https://www.sb.go.kr/www/contents.do?key=5962" },
      { t: "성북구청, 연혁(2025. 3. 17. 수정)", url: "https://www.sb.go.kr/www/contents.do?key=5963" },
      { t: "강북구청, 강북역사(2025. 10. 3. 수정)", url: "https://www.gangbuk.go.kr/portal/main/contents.do?menuNo=200130" },
    ],
    read: "2026-11-07",
    reviewed: null,
    check: [],
  },
  {
    slug: "gangbuk-gu",
    paras: [
      "강북구의 법정동은 미아동·번동·수유동·우이동 넷이에요. 조선 때 이 네 동네는 한성부 동부 숭신방에 속했어요.",
      "이 지역은 1949년 8월 13일 서울에 들어와 성북구에 속했고, 1973년부터는 새로 생긴 도봉구에 속했어요. 그 뒤 사람이 많아진 도봉구를 다시 나누면서, 1995년 3월 1일 이 네 동 지역으로 강북구가 생겼어요.",
    ],
    sources: [{ t: "강북구청, 강북역사(2025. 10. 3. 수정)", url: "https://www.gangbuk.go.kr/portal/main/contents.do?menuNo=200130" }],
    read: "2026-11-07",
    reviewed: null,
    check: ["'강북'이라는 이름의 뜻은 구청 쪽에서 찾지 못해 쓰지 않음"],
  },
  {
    slug: "dobong-gu",
    paras: [
      "도봉구라는 이름은 이 지역을 대표하는 산인 도봉산에서 따왔어요. 도봉산은 화강암 바위 봉우리가 높이 솟은 산으로, 가장 높은 봉우리는 자운봉이에요.",
      "도봉구는 1973년 7월 1일 성북구에서 나뉘어 생겼어요. 그 뒤 1988년 1월 1일 노원구가, 1995년 3월 1일 강북구가 도봉구에서 나뉘어 나갔어요. 넓이는 20.84㎢로 서울의 3.44%이고, 북한산 국립공원 같은 공원이 구 넓이의 절반이 넘어요.",
    ],
    sources: [
      { t: "도봉구청, 구/동의 유래", url: "https://www.dobong.go.kr/Contents.asp?code=10009550" },
      { t: "도봉구청, 연혁", url: "https://www.dobong.go.kr/Contents.asp?code=10009549" },
      { t: "도봉구청, 일반현황", url: "https://www.dobong.go.kr/Contents.asp?code=10009543" },
    ],
    read: "2026-11-07",
    reviewed: null,
    check: ["공원 비율은 유래 쪽의 '공원면적이 구면적의 52.5%'에서"],
  },
  {
    slug: "nowon-gu",
    paras: [
      "조선 때 이 지역에는 양주의 노원면과 해등촌면이 있었고, 노원구청은 이 둘을 합쳐 지금의 노원이 됐다고 설명해요. 상계초등학교 근처에는 옛날 노원역(驛)과 노원(蘆院)이 있던 자리라서 '원터'라고 불린 곳이 있어요.",
      "노원구는 1988년 1월 1일 도봉구에서 나뉘어 생겼어요. 이때 중랑·서초·양천·송파구도 함께 새로 생겼어요.",
    ],
    sources: [
      { t: "노원구청, 노원역사 · 근세이전", url: "https://www.nowon.kr/www/intrcn/intrcn1/intrcn1_01.jsp" },
      { t: "노원구청, 지명유래", url: "https://www.nowon.kr/www/intrcn/intrcn1/intrcn1_06.jsp" },
      { t: "도봉구청, 연혁", url: "https://www.dobong.go.kr/Contents.asp?code=10009549" },
      { t: "중랑구청, 연혁", url: "https://www.jungnang.go.kr/portal/main/contents.do?menuNo=200454" },
    ],
    read: "2026-11-07",
    reviewed: null,
    check: ["'노원역(驛)'은 지하철역이 아니라 원문 지명유래의 옛 역 — 헷갈리지 않는지", "강북구청 강북역사의 1988년 문장은 노원구에 도봉동·창동을 넣어 적어(다른 구청과 어긋남) 쓰지 않음"],
  },
];

// 어려운 한자말이 나오면 빌드를 멈춘다
for (const x of INTROS) for (const w of HARD.words) if (x.paras.some((p) => p.includes(w))) throw new Error(`구 소개 글(${x.slug})에 어려운 말 '${w}'`);

/** 이 빌드에 보일 소개 글(검수한 글, 개발 서버에서는 초안도) */
export const introOf = (slug: string) => INTROS.find((x) => x.slug === slug && (x.reviewed || import.meta.env.DEV)) ?? null;
