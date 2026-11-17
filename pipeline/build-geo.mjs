// 지도 데이터 만들기(설계서 8.3)
//  admdongkor 원본 → 전국 16 시·도 그대로(한 위상, 계획서 N19) → 이름 정리 → 단순화(5m, 작은 섬 남김) → 동·시군구·시·시도 합치기
//  → 이웃(공유 경계) → 한강 띠 잘라내기(이웃 계산 뒤) → 이름표 점·내접원 → 검사 → 내보내기(공개 지역만)
// 쓰는 법: node pipeline/build-geo.mjs [원본 geojson 경로]   (원본은 저장소에 올리지 않는 .cache/ 에 둔다)
//         node pipeline/build-geo.mjs --dry-all   기본 실행과 같은 전국 한 위상을 계산해 점검 보고서만 쓴다(저장소에는 아무것도 쓰지 않음).
//                                                 전국 256 동 단원의 과 묶기·단원 파일 크기도 보고서에 적는다
//         node pipeline/build-geo.mjs --preview   기본 실행에 더해, 동 단원이 꺼진(지역 표 emd off) 공개 지역의 동 단원 파일도 판 폴더에 쓴다.
//                                                 E8 부터는 아직 열지 않은(지역 표 status off) 13 시·도도 임시 과로 싣고(지역 경계 파일·이름표·이웃·동 단원 파일까지),
//                                                 시·도 단원(korea)이 꺼져 있으면(지역 표 korea.status off) 그것도 임시 과로 units.json 에 넣는다(전국 앱 틀을 16개 지역으로 보려는 것 — 과 구성·이름·slug 는 임시).
//                                                 화면을 미리 보려는 것이라 **커밋 금지**다(manifest.preview 가 붙고, 단위 시험 emd-units 가 실패해 배포가 막힌다).
//                                                 끝나면 기본 실행을 한 번 더 돌려 판 폴더를 되돌린다
// 전국 시·도 지도(계획서 N23 · E8): 판 폴더 sido.topo.json — 지역 고르기와 시·도 단원(korea)이 함께 쓴다. 기본 실행도 쓴다(새 파일이라 판은 그대로, N18)
// 시·도 단원(계획서 E10): 지역 표 korea.status live 면 원고(src/data/units.json korea 의 과·넓은 화면, src/data/place-lines.json korea 의 위치 한 줄)를
// 검사해 판 units.json 에 korea 로 싣는다(기본 실행). 전국 시·도 지도에는 독도·울릉도·마라도·백령도 덩어리와 그 점검 점이 시·도 칸 안에 남는지 본다
// 새 시·도(계획서 E11~E16, 첫 번째 E11 부산): 지역 표 status live 로 켜면 원고(units.json regions·place-lines.json)대로 싣는다. E11 부터 시·군·구 위치 한 줄에
// 바닷가 근거(coast)와 크기 smallest·largest 를 쓸 수 있고, '끝'(side edge)은 이름표 점과 실제 땅끝(꼭짓점) 모두 3위 안, 맞닿음(touch)은 경계 1km 이상이어야 한다
// (E11 검수 — 모든 지역에 적용, 지금 원고는 모두 지남). 새로 연 지역의 과·넓은 화면 이름은 지도 검사(N7)에 걸리면 실패한다
// (Q4 답 전의 세 지역은 pipeline/data/title-legacy.json — 보고만). units.json sameNames = 전국에서 두 시·도 이상에 있는 시·군·구 이름(앱이 섞인 화면에서 '부산 중구')
// E12(대구·대전·울산·세종): 과 없는 지역(지역 표 layer emd — 세종, 계획서 N4)도 공개한다. 동 단원(emd live)과 함께만 켤 수 있고, 원고(units.json)에는 과·넓은 화면 없이
// slugs(동 단원 slug)만 둔다. 판 units.json 에는 칸(시·군·구 층)만 싣고 lessons·screens 는 빈 목록이다(--preview 미리보기 지역과 같은 모양 — 앱 모델은 E8)
// E14(충남·경북): 통째로 먼 섬인 곳(경북 울릉군)은 지역 과·넓은 화면의 insets(섬 상자)로 싣고 섬 상자 안에서 16px 를 잰다(11단계 screen()).
// 지역 표 simplifySggM 이 지역마다 다를 수 있다(경북 40m — N20) — manifest simplify_m.sggBy
// 동 단원(계획서 E3): 지역 표 emd live 인 공개 지역의 시·군·구(일반구 단위)마다 판 폴더 emd/{코드}.json(과·화면·이웃·이름표 점·만나기 근거)과
// emd/{코드}.topo.json(동 5m + 같은 위상의 이웃 땅)을 쓰고 units.json 에 emdUnits(단원 색인)를 넣는다. 과 묶기·이름은 pipeline/emd-lib.mjs.
// 시험용 단원 파일(종로·중랑·노원·옹진·증평·검단·광주 동구·울릉)은 실행마다 tests/fixtures/emd/ 에 다시 쓴다(공개 여부와 상관없음, 사이트에 나가지 않음)
// 일반구 단원(계획서 E7 · N5): 지역 표 gu live 인 시 층 지역(경기)의 일반구 전부를 units.json guUnits 에 한 단원('{지역}/gu')으로 넣는다
// (과 = 시, 위치 한 줄은 지도 근거로 만든다). 경계는 새로 만들지 않는다 — 앱이 지역 -sgg 파일의 sgg 층을 쓴다
// 영어 이름(영어 동 공부 설계안 docs/EN_EMD_PLAN_2026-11-16.md 3.4·4절, 판 그대로 .2 — N18): 동 단원 파일의 곳(items[].en — 손 표 pipeline/data/emd-en.json)·
// 과(lessons[].en)·화면(screens[].en — 과·화면 낱말 표 EN_WORDS, 설계안 7.2 · D104), 단원 지도의 이웃 땅(topo out 의 en — 시·군·구 영어 이름),
// 일반구 단원의 en·과·화면, units.json enNames(영어 앱이 동·일반구·시·도 단원을 켜는 관문 — 설계안 5.1)를 쓴다. 손 표에 없는 동·한글이 다른 동,
// 낱말 표에 없는 과·화면 이름, 빈 영어 이름은 실패다(행정동이 바뀌면 node tools/emd-en.mjs 로 표를 다시 쓰고 검수 — docs/review/en-emd-names.md)
// 지역은 지역 표 src/data/sido.json(status live = 공개 지역), 공개 지역의 과·slug·화면은 src/data/units.json,
// 손으로 적은 값(바다 건너 이웃·강 띠·점검 좌표·이웃 땅 범위)은 pipeline/data/*.json 에서 읽는다.
// 북한 땅은 Natural Earth 10m(공개 도메인)에서 가져와 이웃 땅 층에 넣는다(.cache/naturalearth-v5.1.2/). E15 부터 같은 자료의 일본 대마도도(context.json japan — 경남 지도의 빈 바다를 메움)
// E15(경남): 지역 표 simplifySggM 이 첫 공개 지역(서울) 값과 다른 지역(경남 40m — N20)은 manifest simplify_m.sggBy 에 적는다. 거제·남해(땅으로 맞닿은 이웃 없는 섬)는
// pipeline/data/sea-links.json 의 다리로 이어진 바다 건너 이웃으로 외톨이 검사를 지난다
// 검사 하나라도 실패하면 아무것도 쓰지 않고 1 로 끝난다(검사 전에 만든 src/data 파일과 인천 개편 전 그림의 묶음도 검사 관문 앞에서 확인하고, 쓰기는 관문 뒤에서만 한다).
// 내보낼 파일은 mapshaper 계산까지 모두 메모리에 만든 뒤 맨 끝에 쓴다. 판 폴더와 src/data 파일을 .cache/pipeline-tmp 에 다 쓴 다음 이름 바꾸기로 넣고,
// 넣다가 실패하면 넣은 것을 되돌린다(내보내기 도중 mapshaper 가 죽거나 드라이브가 끊겨도 반쯤 쓴 판이나 판 폴더와 어긋난 src/data 가 남지 않는다).
// 판 폴더 안에서도 manifest.json 을 맨 마지막에 쓴다.
// 공개 지역(지역 표 status live)의 검사만 실패로 친다. 다른 시·도의 검사 실패는 기본 실행이면 화면에만, --dry-all 이면 보고서에 적는다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import mapshaper from 'mapshaper';
import * as topo from 'topojson-client';
import { buildUnit, checkTitle, dirIn, isleRange, resolveNames, tap, titleCtx, PHONE, PHONE_WIDE, INSET, TAP_FAIL, TAP_AMBIG } from './emd-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VER = 'kr-20261001.2';   // 판(계획서 N18): 옛 앱이 읽는 값이 바뀔 때만 올린다. .2 = 전국 한 위상(E2)
const SOURCE = {
  repo: 'vuski/admdongkor',
  commit: '3bc00489b76696db864bdbea4b19985cdfa8b403',
  file: 'ver20261001/HangJeongDong_ver20261001.geojson',
  bytes: 34652038,
  sha256: '843ece3a0b3429742cd4a1b699cc13987a88b5e5401f382e7fdaaa194ea5e605',
  license: 'CC BY 4.0 (원자료: 통계청 SGIS, 공공누리 제1유형)',
};
const SOURCE_NE = {
  repo: 'nvkelso/natural-earth-vector',
  tag: 'v5.1.2',
  file: 'geojson/ne_10m_admin_0_countries.geojson',
  bytes: 13287234,
  sha256: '239eec57ac17f100a11e2536cffc56752c318b50ae765b0918ff7aab4ce8f255',
  license: '공개 도메인(Natural Earth)',
};
// 법정동 목록(가이드 G2): 공공데이터포털 '국토교통부_전국 법정동'(data.go.kr 15063424). 있으면 서울 구별 법정동을 src/data 로 낸다
const SOURCE_BJD = {
  provider: '국토교통부 국가공간정보센터(공공데이터포털 15063424)',
  file: '국토교통부_전국 법정동_20260630.csv',
  modified: '2026-07-29',
  bytes: 1450210,
  sha256: 'e5657d4b53a16f72e42e9c0d91e84ff2d647e70dc56b9408da6fd057d0da45c3',
  license: '이용허락범위 제한 없음',
};
const BJD_RAW = path.join(ROOT, '.cache/molit-bjd-20260630/bjd.csv');
// 행정동 → 법정동 대응(서울 구 쪽): 서울특별시 누리집 '자치구별 동 현황(한글, 한자)' 쪽을 저장한 것. 있으면 구마다 대응표를 src/data 로 낸다
const SOURCE_DONGMAP = {
  provider: '서울특별시',
  title: '자치구별 동 현황(한글, 한자)',
  url: 'https://www.seoul.go.kr/seoul/autonomy_sub.do',
  modified: '2025-08-18',
  fetched: '2026-11-07',
  bytes: 149864,
  sha256: 'dd97a9714cec280d98efdc1e7cee77081f2848de412fdd7bab358c05259036e9',
};
const DONGMAP_RAW = path.join(ROOT, '.cache/seoul-dongmap-20250818/autonomy_sub.html');
// 인자: '--' 로 시작하면 플래그, 나머지 첫 값은 원본 경로(예전 argv[2] 동작 그대로)
const ARGS = process.argv.slice(2);
const FLAGS = new Set(ARGS.filter((a) => a.startsWith('--')));
for (const f of FLAGS) if (f !== '--dry-all' && f !== '--preview') { console.error(`모르는 플래그: ${f} (쓸 수 있는 것: --dry-all, --preview)`); process.exit(1); }
const DRY = FLAGS.has('--dry-all');
const PREVIEW = FLAGS.has('--preview');
if (DRY && PREVIEW) { console.error('--dry-all 과 --preview 는 함께 쓸 수 없습니다'); process.exit(1); }
const T0 = Date.now();
const RAW = ARGS.find((a) => !a.startsWith('--')) || path.join(ROOT, '.cache/admdongkor-20261001/HangJeongDong_ver20261001.geojson');
const REPORT_DIR = path.join(ROOT, '.cache/nationwide-report');   // --dry-all 보고서(저장소 밖, git 이 무시함)
const NE_RAW = path.join(ROOT, '.cache/naturalearth-v5.1.2/ne_10m_admin_0_countries.geojson');
// 개편 전 인천(ver20260401) 비교용: 옛 사이트가 저장소에 올려 두었던 hjd/hjd_28_incheon.geojson(커밋 366cb73).
// 출시 때 옛 파일을 저장소에서 빼므로(설계서 결정 9) .cache 로 옮겨 두고 크기·해시로 확인한다
const SOURCE_OLD_INCHEON = { from: 'hjd/hjd_28_incheon.geojson (커밋 366cb73)', bytes: 84825, sha256: '7b774978881dff299438a0ecdd5a2f2aebe4bec52be84bf929a34cf522257ae2' };
const OLD_INCHEON = path.join(ROOT, '.cache/legacy-hjd/hjd_28_incheon.geojson');
const OUT_DIR = path.join(ROOT, 'public/data/geo', VER);
// 새 파일(판 폴더·src/data)을 먼저 다 써 두고 이름을 바꿔 넣는 임시 자리: 저장소와 같은 드라이브여야 이름 바꾸기가 되고,
// public·src 밖이라 쓰다 죽어도 빌드에 섞이지 않는다(.cache 는 git 이 무시함)
const TMP_ROOT = path.join(ROOT, '.cache/pipeline-tmp');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const UNITS = readJson('src/data/units.json');
const SIDO = readJson('src/data/sido.json').sidos;          // 지역 표(16 시·도)
const SIDO_KOREA = readJson('src/data/sido.json').korea ?? { status: 'off' };   // 시·도 단원(korea) 켜기(계획서 E10) — live 면 원고 units.json korea 로 판에 싣는다
const SEA = readJson('pipeline/data/sea-links.json').links;  // 바다 건너 이웃
const RIVER = readJson('pipeline/data/rivers.json');         // 강 띠(한강)
const PROBE_LIST = readJson('pipeline/data/probes.json').probes;
const CTX = readJson('pipeline/data/context.json');          // 이웃 땅·북한 땅 범위
const GU_SLUGS = readJson('pipeline/data/gu-slugs.json').slugs;   // 일반구 동 단원 slug 뒤쪽('수원시 장안구' → jangan-gu)
const EMD_EN = readJson('pipeline/data/emd-en.json').names;      // 읍·면·동 영어 이름 손 표: 행정동 코드 → [한글, 영어](tools/emd-en.mjs 가 씀)
const EMD_EN_AGAIN = 'node tools/emd-en.mjs 로 표를 다시 쓰고 새 줄을 검수(docs/review/en-emd-names.md)';
// 동 과·화면 이름의 영어(설계안 7.2 · D104). 과 이름은 emd-lib 이 이 33가지 낱말과 '{방위} · {동} 둘레'(같은 단원 안 겹친 방위)로만 짓는다
// (11-16 전: 2026-10-01 판 과 이름 33종 = 낱말 31 + 둘레 2, 화면 이름은 단원 이름 + 낱말 22종) — 표에 없는 이름이면 실패.
// 2026-11-16(D2): 신안군 섬이 본 지도로 옮겨 과 이름이 '북동쪽 섬'·'남서쪽 섬' → '북쪽 섬'·'남쪽 섬'(이름 규칙 N7 이 본 지도에 보이는 곳으로 다시 잼) — 두 낱말을 더함
// (완도군은 '북동쪽 섬'·'남서쪽 섬' 그대로라 과 이름 35종 = 낱말 33 + 둘레 2, 화면 이름 낱말은 22종 그대로).
// 화면 글은 지역 화면 en('northwest'·'islands' — 토스트 'Gyeonggi, northwest')처럼 첫 글자를 소문자로 쓴다(unitJson screens)
const EN_WORDS = {
  북서쪽: 'Northwest', 북쪽: 'North', 북동쪽: 'Northeast', 서쪽: 'West', 가운데: 'Center', 동쪽: 'East', 남서쪽: 'Southwest', 남쪽: 'South', 남동쪽: 'Southeast',
  섬: 'Islands', '북쪽 섬': 'North islands', '북동쪽 섬': 'Northeast islands', '남서쪽 섬': 'Southwest islands', '남쪽 섬': 'South islands',
  // 2026-11-17(D2 '과를 셋으로'): 옹진군이 섬 과 셋으로 나뉘며 새로 생긴 이름
  '남동쪽 섬': 'Southeast islands', '동쪽 섬': 'East islands', '북서쪽 섬': 'Northwest islands', 전체: 'All', 시내: 'Urban area', '읍·면': 'Towns and townships',
  '시내 북서쪽': 'Urban northwest', '시내 북쪽': 'Urban north', '시내 북동쪽': 'Urban northeast', '시내 서쪽': 'Urban west', '시내 동쪽': 'Urban east',
  '시내 남서쪽': 'Urban southwest', '시내 남쪽': 'Urban south', '시내 남동쪽': 'Urban southeast',
  '읍·면 북서쪽': 'Northwest towns', '읍·면 북쪽': 'North towns', '읍·면 북동쪽': 'Northeast towns', '읍·면 서쪽': 'West towns', '읍·면 동쪽': 'East towns',
  '읍·면 남서쪽': 'Southwest towns', '읍·면 남쪽': 'South towns', '읍·면 남동쪽': 'Southeast towns',
};
const HANGUL = /[ㄱ-ㆎ가-힣]/;
// 원고-산출물 맞춤 검사(계획서 N33): 이 파일들의 sha256(CRLF→LF)을 manifest.inputs 에 적고 단위 시험이 지금 파일과 비교한다
const INPUT_FILES = ['src/data/units.json', 'src/data/place-lines.json', 'src/data/hard-words.json', 'src/data/sido.json',
  ...fs.readdirSync(path.join(ROOT, 'pipeline/data')).filter((n) => n.endsWith('.json')).sort().map((n) => `pipeline/data/${n}`),
  'pipeline/build-geo.mjs', 'pipeline/emd-lib.mjs'];

const SIMPLIFY_M = 5;        // 단순화 간격(m)
const RIVER_RADIUS_M = RIVER.radiusM;  // 강 띠 반지름(m)
const QUANT = 1e5;           // TopoJSON 양자화(지역 범위의 10만분의 1 ≈ 1m)
// 과 화면 검사용 휴대폰 지도 칸(PHONE)·넓은 화면(PHONE_WIDE)·내접원 지름 기준(TAP_FAIL 16 미만 실패, TAP_AMBIG 24 미만 '모호 확대')은
// pipeline/emd-lib.mjs 에 하나만 두고 가져다 쓴다(동 단원 묶기와 같은 값이어야 하므로)

const errors = [];
const notes = [];
const fail = (m) => errors.push(m);
const note = (m) => { notes.push(m); console.log('  ' + m); };
// 공개 지역(sido.json status live)의 검사만 실패로 친다. 다른 시·도의 실패는 issues 에 모아 기본 실행은 화면에, --dry-all 은 보고서에 적는다
const issues = [];
const LIVE_CODES = new Set(SIDO.filter((s) => s.status === 'live').map((s) => s.code));
const failAt = (sido, m) => (LIVE_CODES.has(sido) ? fail(m) : issues.push({ sido, msg: m }));
const sidoOfId = (id) => id.split(':')[2].slice(0, 2);   // 'kr:emd:1111051500'·'kr:sgg:41273' → 앞 2자리 = 시·도 코드(원자료에서 확인)
// 검사가 끝나기 전에 계산한 src/data 파일: 값만 만들어 두고, 검사를 모두 통과한 뒤 내보내기 단계에서 쓴다
const pending = [];   // [저장소 기준 경로, 내용]

/* ---------- 0 원본 확인 ---------- */
const rawBuf = fs.readFileSync(RAW);
const sha = crypto.createHash('sha256').update(rawBuf).digest('hex');
if (rawBuf.length !== SOURCE.bytes || sha !== SOURCE.sha256) { console.error(`원본이 다릅니다: ${rawBuf.length}B ${sha}`); process.exit(1); }
console.log(`원본 확인: ${SOURCE.file} @ ${SOURCE.commit.slice(0, 7)} (${rawBuf.length}B)`);
const raw = JSON.parse(rawBuf.toString('utf8'));
const neBuf = fs.readFileSync(NE_RAW);
const neSha = crypto.createHash('sha256').update(neBuf).digest('hex');
if (neBuf.length !== SOURCE_NE.bytes || neSha !== SOURCE_NE.sha256) { console.error(`Natural Earth 원본이 다릅니다: ${neBuf.length}B ${neSha}`); process.exit(1); }
const neFeats = JSON.parse(neBuf.toString('utf8')).features;
const nkGeom = neFeats.find((f) => f.properties.ADM0_A3 === 'PRK').geometry;

/* ---------- 0(이어서) 지역 표 확인: 원자료 시·도와 같고, 공개 지역은 units.json 과 같은 차례·값 ---------- */
{
  const bad = [];
  const rawSido = new Map(raw.features.map((f) => [String(f.properties.sido), f.properties.sidonm]));
  const codes = SIDO.map((s) => s.code), keys = SIDO.map((s) => s.key);
  if (new Set(codes).size !== codes.length || new Set(keys).size !== keys.length) bad.push('code·key 가 겹침');
  for (const s of SIDO) if (rawSido.get(s.code) !== s.full) bad.push(`${s.code} ${s.full}: 원자료는 ${rawSido.get(s.code) ?? '없음'}`);
  for (const [c, n] of rawSido) if (!codes.includes(c)) bad.push(`원자료 시·도 ${c} ${n} 이 표에 없음`);
  const live = SIDO.filter((s) => s.status === 'live').map((s) => s.key), inUnits = UNITS.regions.map((r) => r.key);
  if (JSON.stringify(live) !== JSON.stringify(inUnits)) bad.push(`공개 지역(${live.join(',')})과 units.json regions(${inUnits.join(',')})의 key·차례가 다름`);
  for (const R of UNITS.regions) {
    const s = SIDO.find((x) => x.key === R.key);
    if (s) for (const k of ['ko', 'full', 'en', 'layer']) if (s[k] !== R[k]) bad.push(`${R.key}.${k}: 지역 표 ${s[k]} / units.json ${R[k]}`);
    if (s && s.code !== R.sido) bad.push(`${R.key}.code: 지역 표 ${s.code} / units.json ${R.sido}`);
  }
  // layer emd(세종·제주: 시·군·구 과 없이 동 단원이 주, 계획서 N4 — 앱 모델은 E8, 공개는 E12 세종부터): 공부할 곳이 동 단원뿐이라 동 단원(emd live)이 함께 켜져 있어야 하고,
  // 원고(units.json)에는 과·넓은 화면이 없어야 한다(곳은 시·군·구 칸 — 지역 지도와 동 단원 slug 에만 쓴다)
  for (const s of SIDO) if (s.status === 'live' && s.layer === 'emd' && s.emd !== 'live') bad.push(`${s.key}: layer emd 지역은 동 단원(emd live)과 함께만 공개할 수 있음`);
  for (const R of UNITS.regions) if (R.layer === 'emd' && ((R.lessons ?? []).length || (R.screens ?? []).length)) bad.push(`${R.key}: layer emd 지역의 원고에 과·넓은 화면이 있음(과 없는 지역 — 공부는 동 단원)`);
  // 동 단원(emd live)은 공개 지역에서만 켤 수 있다(단원 slug·과 원고가 공개 지역의 units.json 에 있음)
  for (const s of SIDO) if (s.emd === 'live' && s.status !== 'live') bad.push(`${s.key}: emd live 는 status live 인 지역에서만 쓸 수 있음`);
  // 일반구 단원(gu live, 계획서 N5 · E7): 공개 지역이고 첫 공부 층이 si(일반구를 시로 합침)인 지역에서만. 일반구 3곳 이상은 아래 일반구 단원 검사가 본다
  for (const s of SIDO) {
    if (!['live', 'off'].includes(s.gu)) bad.push(`${s.key}.gu: live·off 가 아님(${s.gu})`);
    else if (s.gu === 'live' && (s.status !== 'live' || s.layer !== 'si')) bad.push(`${s.key}: gu live 는 status live 이고 layer si 인 지역에서만 쓸 수 있음`);
  }
  // 시·도 단원(korea, E10): live·off. live 면 과·화면 원고(src/data/units.json korea)가 있어야 한다(과 구성·칸 크기·이름 검사는 12단계)
  if (!['live', 'off'].includes(SIDO_KOREA.status)) bad.push(`korea.status: live·off 가 아님(${SIDO_KOREA.status})`);
  else if (SIDO_KOREA.status === 'live' && !(UNITS.korea && Array.isArray(UNITS.korea.lessons) && Array.isArray(UNITS.korea.screens))) bad.push('korea.status live 인데 원고 src/data/units.json 에 korea(lessons·screens)가 없음');
  if (bad.length) { for (const b of bad) console.error('지역 표: ' + b); console.error('src/data/sido.json 을 고치세요. 공개 지역의 차례·값이 다르면 src/data/units.json 쪽이 틀렸을 수도 있습니다 — 아무것도 쓰지 않았습니다'); process.exit(1); }
}
const SIDO_BY_CODE = Object.fromEntries(SIDO.map((s) => [s.code, s]));
const REGIONS = UNITS.regions;   // 공개 지역(위에서 지역 표의 live 와 같은 차례임을 확인). 과·slug·screens 등 손 값

/* ---------- 0(이어서) 전국 요약(가이드 G1): 시·도마다 시·군·구와 읍·면·동 수 ---------- */
// 시·도 종류는 이름 끝으로(지방자치법 제2조). 자치구는 특별시·통합특별시·광역시의 구만(제2조 ②),
// 일반구는 '수원시장안구'처럼 시 이름이 붙은 구, 세종은 기초 자치단체가 없고 제주의 시는 행정시(제3조 ②·⑤)
{
  const ILBAN = /^(.+?시)\s?(.+구)$/;   // 아래 GENERAL_GU 와 같음(그 선언보다 앞이라 따로 둠)
  const KINDS = ['특별자치시', '특별자치도', '통합특별시', '특별시', '광역시', '도'];
  const ORDER = ['특별시', '통합특별시', '광역시', '특별자치시', '도', '특별자치도'];
  const by = new Map();
  for (const f of raw.features) {
    const p = f.properties;
    const sd = String(p.sido);
    if (!by.has(sd)) by.set(sd, { code: sd, name: p.sidonm, kind: KINDS.find((k) => p.sidonm.endsWith(k)) ?? '', sgg: new Set(), eup: 0, myeon: 0, dong: 0 });
    const s = by.get(sd);
    s.sgg.add(p.sggnm);
    const d = String(p.adm_nm).split(' ').pop();
    if (d.endsWith('읍')) s.eup++; else if (d.endsWith('면')) s.myeon++; else if (d.endsWith('동') || d.endsWith('가')) s.dong++;
    else fail(`읍·면·동으로 못 나눔: ${p.adm_nm}`);
  }
  const sidos = [...by.values()].map((s) => {
    if (!s.kind) fail(`시·도 종류를 모름: ${s.name}`);
    const out = { code: s.code, name: s.name, kind: s.kind, si: 0, gun: 0, gu: 0, adminSi: 0, ilban: 0, ilbanSi: [], ilbanGu: {}, eup: s.eup, myeon: s.myeon, dong: s.dong };
    const si = new Set();
    for (const n of s.sgg) {
      if (s.kind === '특별자치시') continue;                 // 세종: 기초 자치단체 없음(데이터의 '세종시'는 시·도 자신)
      const m = n.match(ILBAN);
      if (m) { si.add(m[1]); out.ilban++; if (!out.ilbanSi.includes(m[1])) out.ilbanSi.push(m[1]); (out.ilbanGu[m[1]] ||= []).push(m[2]); }
      else if (n.endsWith('시')) si.add(n);
      else if (n.endsWith('군')) out.gun++;
      else if (n.endsWith('구')) out.gu++;
      else fail(`시·군·구로 못 나눔: ${s.name} ${n}`);
    }
    if (s.kind === '특별자치도' && s.name.startsWith('제주')) out.adminSi = si.size; else out.si = si.size;
    if (out.gu && !['특별시', '통합특별시', '광역시'].includes(s.kind)) fail(`${s.name}: 자치구가 있을 수 없는 시·도에 구 ${out.gu}`);
    return out;
  }).sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.code.localeCompare(b.code));
  const sum = (k) => sidos.reduce((t, s) => t + s[k], 0);
  const total = { sido: sidos.length, si: sum('si'), gun: sum('gun'), gu: sum('gu'), adminSi: sum('adminSi'), ilban: sum('ilban'), ilbanSi: sidos.reduce((t, s) => t + s.ilbanSi.length, 0), eup: sum('eup'), myeon: sum('myeon'), dong: sum('dong') };
  pending.push(['src/data/kr-summary.json', JSON.stringify({ _note: '전국 시·도별 시·군·구와 읍·면·동 수(행정동 기준). pipeline/build-geo.mjs 가 만든다', source: SOURCE.file, total, sidos }, null, 1) + '\n']);
  note(`전국 요약: 시·도 ${total.sido} · 시 ${total.si} 군 ${total.gun} 자치구 ${total.gu}(기초 ${total.si + total.gun + total.gu}) · 행정시 ${total.adminSi} · 일반구 ${total.ilban}(${total.ilbanSi}개 시) · 읍 ${total.eup} 면 ${total.myeon} 동 ${total.dong}`);
}

/* ---------- 0(이어서) 서울 법정동(가이드 G2): 구마다 법정동 이름. 리·시군구·시도 줄은 빼고 읍면동 줄만 ---------- */
let LEGAL_BY_GU = null;   // 아래 동 대응표가 쓴다(파일은 검사 뒤에 쓰므로 디스크가 아니라 이 값을 읽음)
if (fs.existsSync(BJD_RAW)) {
  const buf = fs.readFileSync(BJD_RAW);
  const h = crypto.createHash('sha256').update(buf).digest('hex');
  if (buf.length !== SOURCE_BJD.bytes || h !== SOURCE_BJD.sha256) { console.error(`법정동 원본이 다릅니다: ${buf.length}B ${h}`); process.exit(1); }
  const rows = buf.toString('utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/).slice(1).map((l) => l.split(','));
  const byGu = {};
  for (const [, sido, sgg, emdName, ri] of rows) if (sido === '서울특별시' && sgg && emdName && !ri) (byGu[sgg] ||= []).push(emdName);
  const n = Object.values(byGu).reduce((t, l) => t + l.length, 0);
  if (Object.keys(byGu).length !== 25) fail(`서울 법정동: 구 ${Object.keys(byGu).length}곳(기대 25)`);
  pending.push(['src/data/legal-dong-seoul.json', JSON.stringify({ _note: '서울 구별 법정동 이름(파일 차례). pipeline/build-geo.mjs 가 만든다', source: SOURCE_BJD, byGu }, null, 1) + '\n']);
  LEGAL_BY_GU = byGu;
  note(`서울 법정동 ${n}곳(구 ${Object.keys(byGu).length})`);
} else note('법정동 원본이 없어 src/data/legal-dong-seoul.json 은 그대로');

/* ---------- 0(이어서) 서울 행정동 → 법정동 대응(구 쪽): 서울시 표를 풀고, 행정동은 경계 데이터와, 법정동은 국토부 목록과 맞춘다 ---------- */
if (fs.existsSync(DONGMAP_RAW)) {
  const buf = fs.readFileSync(DONGMAP_RAW);
  const h = crypto.createHash('sha256').update(buf).digest('hex');
  if (buf.length !== SOURCE_DONGMAP.bytes || h !== SOURCE_DONGMAP.sha256) { console.error(`동 대응표 원본이 다릅니다: ${buf.length}B ${h}`); process.exit(1); }
  // 칸 안의 이름은 '이름(<i>한자</i>)' 꼴. 쉼표 없이 붙은 것(만리동1가()만리동2가())과 괄호가 덜 닫힌 것(신내1동()도 있다
  const namesOf = (cell) => cell.replace(/<br\s*\/?>/g, '').replace(/\(\s*<i>[^<]*<\/i>\s*\)?/g, ',').replace(/<[^>]+>/g, '')
    .split(',').map((x) => x.replace(/\s/g, '').replace(/洞/g, '동').replace(/\(+$/, '')).filter(Boolean);
  // 행정동 칸은 이름 하나(중계2,3동·금호2,3가동처럼 쉼표가 이름 안에 있고, 보라매洞처럼 '동'을 한자로 쓴 칸도 있다)
  const admOf = (cell) => cell.replace(/<br\s*\/?>/g, '').replace(/\(\s*<i>[^<]*<\/i>\s*\)?/g, '').replace(/<[^>]+>/g, '').replace(/\s/g, '').replace(/洞/g, '동').replace(/\(+$/, '');
  // 서울시 표기 → 경계 데이터·국토부 표기. 행정동의 '.'·','는 가운뎃점. 법정동 '인현동'은 1가·2가 가운데 어느 쪽인지 표에 없어 둘을 합쳐 맞춰 본다
  const admKey = (x) => x.replace(/[.,]/g, '·');
  const ADM_ALIAS = { '상일1동': '상일제1동', '상일2동': '상일제2동' };
  const LEGAL_EXPAND = { '신문로1.2가': ['신문로1가', '신문로2가'], '인현동': ['인현동1가', '인현동2가'] };
  const legalShow = (x) => x.replace('신문로1.2가', '신문로1·2가');
  const admOfData = {};
  for (const f of raw.features) if (String(f.properties.sido) === '11') (admOfData[f.properties.sggnm] ||= new Set()).add(String(f.properties.adm_nm).split(' ').pop());
  const legalFile = path.join(ROOT, 'src/data/legal-dong-seoul.json');
  const legalList = LEGAL_BY_GU ?? (fs.existsSync(legalFile) ? JSON.parse(fs.readFileSync(legalFile, 'utf8')).byGu : null);
  const byGu = {}, errBefore = errors.length;
  for (const m of buf.toString('utf8').matchAll(/<h5>\s*\d+\)\s*([^<(]+?)\s*\(<i>[^<]*<\/i>\)\s*-\s*행정동\(<i>[^<]*<\/i>\)\s*(\d+)\s*,\s*법정동\(<i>[^<]*<\/i>\)\s*(\d+)\s*<\/h5>([\s\S]*?)<\/table>/g)) {
    const gu = m[1].replace(/\s+/g, '');
    const rows = [...m[4].matchAll(/<tr>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g)]
      .map((r) => { const a = admOf(r[1]); return { adm: ADM_ALIAS[a] ?? admKey(a), raw: namesOf(r[2]) }; });
    const data = admOfData[gu];
    if (!data) { fail(`동 대응표: 경계 데이터에 없는 구 ${gu}`); continue; }
    const mine = new Set(rows.map((r) => r.adm));
    const onlyTbl = [...mine].filter((x) => !data.has(x)), onlyData = [...data].filter((x) => !mine.has(x));
    if (rows.length !== +m[2] || onlyTbl.length || onlyData.length) fail(`동 대응표 ${gu}: 행정동 ${rows.length}/${m[2]}, 표에만 ${onlyTbl.join('·')} / 경계에만 ${onlyData.join('·')}`);
    if (legalList) {
      const U = new Set(rows.flatMap((r) => r.raw.flatMap((x) => LEGAL_EXPAND[x] ?? [x]))), L2 = new Set(legalList[gu] ?? []);
      const a = [...U].filter((x) => !L2.has(x)), b = [...L2].filter((x) => !U.has(x));
      if (a.length || b.length || L2.size !== +m[3]) fail(`동 대응표 ${gu}: 법정동 표에만 ${a.join('·')} / 국토부에만 ${b.join('·')} (표 머리 ${m[3]}, 국토부 ${L2.size})`);
    }
    byGu[gu] = rows.map((r) => ({ adm: r.adm, legal: r.raw.map(legalShow) }));
  }
  if (Object.keys(byGu).length !== 25) fail(`동 대응표: 구 ${Object.keys(byGu).length}곳(기대 25)`);
  const nRows = Object.values(byGu).reduce((t, l) => t + l.length, 0);
  if (errors.length === errBefore) pending.push(['src/data/seoul-dong-map.json', JSON.stringify({ _note: '서울 구별 행정동 → 법정동(서울시 표 차례, 행정동 표기는 경계 데이터에 맞춤). pipeline/build-geo.mjs 가 만든다', source: SOURCE_DONGMAP, byGu }, null, 1) + '\n']);
  if (errors.length === errBefore) note(`서울 동 대응표: 구 ${Object.keys(byGu).length} · 행정동 ${nRows} — 행정동은 경계 데이터와, 법정동은 국토부 목록과 같음(인현동은 1·2가 구분 없이 표기)`);
} else note('동 대응표 원본이 없어 src/data/seoul-dong-map.json 은 그대로');

/* ---------- 1~3 이름 정리(전국 16 시·도를 모두 싣는다. 공개 지역만 고르는 것은 내보내기에서) ---------- */
const GENERAL_GU = /^(.+?시)\s?(.+구)$/;   // '수원시장안구' → 수원시 + 장안구
// 일반구: 세종(특별자치시, 기초 자치단체 없음)을 뺀 모든 시·도에서 시 이름·시 코드(10 단위 내림)를 붙인다. 수도권에서는 경기만 맞는다
const ilbanOf = (p) => (!String(p.sidonm).endsWith('특별자치시') && String(p.sggnm).match(GENERAL_GU)) || null;
const sggShow = (p) => { const m = ilbanOf(p); return m ? `${m[1]} ${m[2]}` : p.sggnm; };   // 원자료 이름 → 표시 이름('포항시남구' → '포항시 남구')
const emd = [];
for (const f of raw.features) {
  const p = f.properties;
  const row = SIDO_BY_CODE[String(p.sido)];
  const dong = String(p.adm_nm).split(' ').pop();
  let sggName = p.sggnm, si = p.sgg, siName = p.sggnm;
  const m = ilbanOf(p);
  if (m) { siName = m[1]; sggName = sggShow(p); si = String(Math.floor(Number(p.sgg) / 10) * 10); }
  emd.push({ type: 'Feature', geometry: f.geometry, properties: {
    id: `kr:emd:${p.adm_cd2}`, code: p.adm_cd2, name: dong,
    sgg: p.sgg, sggId: `kr:sgg:${p.sgg}`, sggName,
    si, siId: `kr:sgg:${si}`, siName,
    sido: String(p.sido), sidoName: p.sidonm, region: row.key,
  } });
}
console.log(`전국 행정동 ${emd.length}곳(공개 지역 ${emd.filter((f) => LIVE_CODES.has(f.properties.sido)).length}곳)`);
const sggToSi = Object.fromEntries(emd.map((f) => [f.properties.sggId, f.properties.siId]));     // 일반구 → 시(그 밖은 자기 자신)
const sggNameOf = Object.fromEntries(emd.map((f) => [f.properties.sggId, f.properties.sggName]));
// 내보내기는 공개 지역만: id 앞 2자리(시·도 코드)가 공개 지역인가. 이웃·이름표·검색 목록을 이것으로 거른다
const isLiveId = (id) => LIVE_CODES.has(sidoOfId(id));

// 이웃 땅(설계서 5.2 층 2, 계획서 N19) = 다른 시·도 전부 + 북한. 16 시·도가 모두 한 위상에 들어 있으므로 따로 싣지 않는다.
// (E1 까지는 공개 지역 밖 시·도의 동 가운데 둘레 상자 outBox 에 걸친 것만 같은 위상에 넣었다. E2 에서 없앰)

const ms = async (cmd, files) => mapshaper.applyCommands(cmd, files);
const fcOf = (s) => { const g = JSON.parse(String(s)); return g.type === 'FeatureCollection' ? g : { type: 'FeatureCollection', features: (g.geometries || []).map((geometry) => ({ type: 'Feature', properties: {}, geometry })) }; };
const DISSOLVE = '-dissolve sgg target=emd copy-fields=sggId,sggName,si,siId,siName,sido,region + name=sgg '
  + '-dissolve si target=emd copy-fields=siId,siName,sido,region + name=si '
  + '-dissolve sido target=emd copy-fields=sidoName,region + name=sido ';

/* ---------- 4~5 단순화·합치기(이웃 계산용 한 위상) ---------- */
const run1 = await ms(
  `-i emd.json -simplify interval=${SIMPLIFY_M} keep-shapes target=* ${DISSOLVE}`
  + `-o format=topojson target=emd,sgg,si,sido combined.json -o format=geojson geojson-type=FeatureCollection target=emd emd_s.json `
  + `-o format=geojson geojson-type=FeatureCollection target=sido sido_s.json`,
  { 'emd.json': JSON.stringify({ type: 'FeatureCollection', features: emd }) });
const T1 = JSON.parse(String(run1['combined.json']));
const tick = (label) => { if (DRY) console.log(`  [${((Date.now() - T0) / 1000).toFixed(1)}s] ${label}`); };
tick('1~5 거르기·단순화·합치기');

/* ---------- 5(이어서) 북한 땅 ---------- */
// Natural Earth 북한 도형은 우리 경계와 휴전선에서 조금씩 어긋나 틈(바다색)이 보인다.
// 휴전선 구간(context.json nkCorridor 상자 목록: 한강 하구 동쪽 동경 126.75도 ~ 동해안 — E13 에서 강원 고성군 북쪽 해안까지 늘림)의 북한 경계선만 2km 띠로 넓혀 붙이고,
// 1단계에서 단순화한 남쪽 땅을 빼서 틈만 메운다. 하구·서해 쪽 해안은 넓히지 않는다(강화 북쪽 물길이 메워지지 않게). 동해 쪽도 휴전선이 바다에 닿는 곳(북위 38.63)에서
// 끊는다(그 북쪽 북한 해안을 넓히면 바다에 북한 땅이 생긴다). 상자 하나([서, 남, 동, 북])만 적은 옛 모양도 읽는다.
// 첫 상자는 E2 명령 그대로 한 번에 메운다(서울·인천·경기 지도와 단원 파일의 북한 땅이 E12 와 바이트까지 같게). 둘째 상자부터는 따로 돌려 띠를 만들고
// 남쪽 땅과 첫 결과를 뺀 조각을 북한 땅 덩어리 목록에 덧붙인다(다시 합치기(dissolve)를 하면 서쪽 휴전선에도 꼭짓점이 몇 개 더 생겨 E12 산출물이 바뀐다 — E13 확인).
// 덧붙인 조각은 그 상자 서쪽 경도보다 동쪽만 남긴다(첫 상자의 띠와 겹치지 않고, 경기 지도 범위에 들지 않게)
const NK_CORRIDOR = Array.isArray(CTX.nkCorridor[0]) ? CTX.nkCorridor : [CTX.nkCorridor];
const inNkBox = ([x, y]) => NK_CORRIDOR.some((b) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]);
const nkInput = JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: nkGeom }] });
const southInput = JSON.stringify({ type: 'FeatureCollection', features: fcOf(run1['sido_s.json']).features });
const runNK = await ms(
  `-i nk.json name=nk -i south.json name=south `
  + `-lines target=nk + name=nkline -clip target=nkline bbox=${NK_CORRIDOR[0].join(',')} -buffer target=nkline radius=2000 name=nkband `
  + `-merge-layers target=nk,nkband force name=nkall -dissolve target=nkall `
  + `-dissolve target=south -erase south target=nkall remove-slivers `
  + `-o format=geojson geojson-type=FeatureCollection target=nkall nk_out.json`,
  { 'nk.json': nkInput, 'south.json': southInput });
const nkMain = fcOf(runNK['nk_out.json']).features;
const nkMore = [];   // 둘째 상자부터 덧붙인 띠 조각(보고용 넓이와 함께)
for (const b of NK_CORRIDOR.slice(1)) {
  const r = await ms(`-i nk.json name=nk -i south.json name=south -i main.json name=main `
    + `-lines target=nk + name=nkline -clip target=nkline bbox=${b.join(',')} -buffer target=nkline radius=2000 name=band `
    + `-clip target=band bbox=${b[0]},${b[1] - 0.05},${b[2] + 0.05},${b[3] + 0.05} -dissolve target=south -erase south target=band remove-slivers -erase main target=band remove-slivers `
    + `-o format=geojson geojson-type=FeatureCollection target=band band.json`,
    { 'nk.json': nkInput, 'south.json': southInput, 'main.json': JSON.stringify({ type: 'FeatureCollection', features: nkMain }) });
  nkMore.push(...fcOf(r['band.json']).features.filter((f) => f.geometry));
}
// 한 덩어리 목록(MultiPolygon)으로 묶어 북한 땅 하나로 둔다(이름표 lp 가 둘이 되지 않게 — 지역 경계 파일·단원 파일은 북한을 곳 하나로 싣는다)
const nkPolys = [...nkMain, ...nkMore].flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates));
const nkLand = nkMore.length ? [{ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: nkPolys }, properties: { sido: 'kp', sidoName: '북한' } }]
  : nkMain.map((f) => ({ type: 'Feature', geometry: f.geometry, properties: { sido: 'kp', sidoName: '북한' } }));
// 일본 땅(E15 · context.json japan): Natural Earth 일본 덩어리 가운데 바깥 고리 평균이 상자 안인 것(대마도 남섬·북섬)을 한 덩어리 목록으로.
// 우리 땅과 맞닿지 않으므로 북한처럼 메우거나 빼지 않는다. 이웃 땅 층(L.out)에 sido 'jp' 로 넣는다 — 지역 경계 파일은 지역 상자로 잘라 실리는 지역에만 들어가고
// (지금은 경남), 동 단원 파일은 단원 상자에 걸칠 때만, 전국 시·도 지도에는 넣지 않는다(북한만)
const JP = CTX.japan;
const jpPolys = JP ? (() => {
  const g = neFeats.find((f) => f.properties.ADM0_A3 === JP.a3)?.geometry;
  const ps = !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const mean = (r, k) => r.reduce((s, c) => s + c[k], 0) / r.length;
  return ps.filter((p) => { const x = mean(p[0], 0), y = mean(p[0], 1); return x >= JP.box[0] && x <= JP.box[2] && y >= JP.box[1] && y <= JP.box[3]; });
})() : [];
if (JP && !jpPolys.length) { console.error(`Natural Earth ${JP.a3} 에서 상자 ${JP.box.join(',')} 안의 덩어리를 못 찾음 — 아무것도 쓰지 않았습니다`); process.exit(1); }
const jpLand = jpPolys.length ? [{ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: jpPolys }, properties: { sido: 'jp', sidoName: JP.ko } }] : [];

/* ---------- 6 이웃: 공유 경계(위상) ---------- */
const neighbors = {};
// 층마다 id 열쇠: 동 id, 시군구 sggId, 시 siId
// 자기 자신은 이웃에서 뺀다: 합치기 층이 같은 위상에 들면 한 곳의 두 덩어리가 호를 함께 써 자기 이웃으로 잡히는 일이 있다
// (전국 위상의 목포시 유달동, 2026-11-14 확인. 대칭 검사로는 안 잡히고 이웃 쌍이 0.5 어긋난다)
const selfLoops = [];
for (const [layer, key] of [['emd', 'id'], ['sgg', 'sggId'], ['si', 'siId']]) {
  const geoms = T1.objects[layer].geometries; const nb = topo.neighbors(geoms); const map = {};
  geoms.forEach((g, i) => {
    const me = g.properties[key], list = [...new Set(nb[i].map((j) => geoms[j].properties[key]))];
    if (list.includes(me)) selfLoops.push({ layer, id: me });
    map[me] = list.filter((x) => x !== me).sort();
  });
  neighbors[layer] = map;
}
// manifest 기록(notes)에는 공개 지역 곳만 적는다. 다른 시·도 곳은 기본 실행이면 화면에만, --dry-all 이면 보고서(selfLoops)에 적는다
const liveSelfLoops = selfLoops.filter((x) => isLiveId(x.id)), otherSelfLoops = selfLoops.filter((x) => !isLiveId(x.id));
if (liveSelfLoops.length) note(`자기 자신이 이웃으로 잡혀 뺀 곳 ${liveSelfLoops.length}: ${liveSelfLoops.map((x) => `${x.layer} ${x.id}`).join(', ')}`);
if (otherSelfLoops.length && !DRY) console.log(`  자기 자신이 이웃으로 잡혀 뺀 곳(공개 지역 밖, 보고만) ${otherSelfLoops.length}: ${otherSelfLoops.map((x) => `${x.layer} ${x.id}`).join(', ')}`);
// 대칭 검사
const asym = { emd: 0, sgg: 0, si: 0 };
for (const [layer, map] of Object.entries(neighbors)) for (const [a, list] of Object.entries(map)) for (const b of list) if (!(map[b] || []).includes(a)) { asym[layer]++; failAt(sidoOfId(a), `이웃 비대칭 ${layer} ${a}→${b}`); }
const pairCount = (map) => Object.values(map).reduce((s, l) => s + l.length, 0) / 2;
// 내보내는 이웃 쌍: 두 곳이 모두 공개 지역인 쌍(공개 지역 칸과 다른 시·도 칸이 맞닿은 쌍은 내보내지 않는다 — .1 판과 같은 뜻)
const livePairCount = (map) => Object.entries(map).filter(([a]) => isLiveId(a)).reduce((s, [, l]) => s + l.filter(isLiveId).length, 0) / 2;
// 시 층 이름: '시(경기 31 기준)'처럼 시 층(layer si)인 공개 지역과 그 수
const siLayerLabel = `시(${REGIONS.filter((r) => r.layer === 'si').map((r) => `${r.ko} ${T1.objects.si.geometries.filter((g) => g.properties.sido === r.sido).length}`).join('·')} 기준)`;
note(`이웃 쌍(전국 위상): 동 ${pairCount(neighbors.emd)} · 시군구 ${pairCount(neighbors.sgg)} · 시 층 ${pairCount(neighbors.si)}`);
note(`이웃 쌍(공개 지역, 내보냄): 동 ${livePairCount(neighbors.emd)} · 시군구 ${livePairCount(neighbors.sgg)} · ${siLayerLabel} ${livePairCount(neighbors.si)}`);
// 바다 건너 이웃(손 표 pipeline/data/sea-links.json): 땅으로 맞닿지 않지만 다리로 이어진 곳. 전국을 싣고(외톨이 검사용), 내보내기는 두 곳 다 공개 지역인 쌍만
const knownSgg = new Set(raw.features.map((f) => `kr:sgg:${f.properties.sgg}`));
for (const { a, b } of SEA) for (const id of [a, b]) if (!knownSgg.has(id)) fail(`바다 건너 이웃: 원자료에 없는 시군구 ${id}`);
const SEA_LINKS = SEA.filter(({ a, b }) => sggToSi[a] && sggToSi[b]);
neighbors.sea = {};
for (const { a, b, via } of SEA_LINKS) {
  for (const [x, y] of [[a, b], [b, a]]) (neighbors.sea[x] ||= []).push({ id: y, via });
  // 시 층: 안산시 단원구 → 안산시(동 데이터의 일반구 → 시 대응)
  const sa = sggToSi[a], sb = sggToSi[b];
  if (sa !== a || sb !== b) for (const [x, y] of [[sa, sb], [sb, sa]]) (neighbors.sea[x] ||= []).push({ id: y, via });
}
// 시·도와 맞닿음(위치 한 줄 '충청남도·충청북도와 맞닿은' 검사용, 내보내지 않음): 전국 위상(5m, 강 띠 자르기 전)의 시 층 이웃 가운데
// 다른 시·도에 든 곳이 있으면 그 시·도와 맞닿은 것이다(맞닿은 경계 길이는 그 곳들과의 합 — 9(이어서) 위치 한 줄의 touch 검사).
// 시·도 이름은 지역 표 full(원자료 sidonm)로 쓴다. 공개 지역 시·도와의 맞닿음도 같은 방법으로 본다
const SIDO_NAMES = new Set(SIDO.map((s) => s.full));
// 땅으로 맞닿은 이웃도, 바다 건너 이웃도 없는 시군구: 공개 지역이면 실패(지역 표 lonelyOk 는 통과)
const lonelyAll = Object.entries(neighbors.sgg).filter(([, l]) => l.length === 0).map(([k]) => k);
const lonely = lonelyAll.filter((k) => !neighbors.sea[k] && !SIDO_BY_CODE[sidoOfId(k)].lonelyOk.includes(sggNameOf[k]));
for (const k of lonely) failAt(sidoOfId(k), `이웃이 하나도 없는 시군구: ${k} ${sggNameOf[k]}`);
const seaByName = new Map();
for (const { a } of SEA_LINKS) seaByName.set(sggNameOf[a], (seaByName.get(sggNameOf[a]) ?? 0) + 1);
note(`바다 건너 이웃 ${SEA_LINKS.length}쌍(${[...seaByName].map(([n, c]) => `${n} ${c}`).join(', ')})`);

/* ---------- 7 한강 띠: 강북·강남 쪽 시(군·구)가 맞닿는 경계 = 강 중심선 ---------- */
// 강북·강남 쪽 시 층 코드는 손 표 pipeline/data/rivers.json(서울 강북 14 + 고양·구리·남양주·파주 / 서울 강남 11 + 김포·하남)
const NORTH = new Set(RIVER.north);
const SOUTH = new Set(RIVER.south);
const riverLine = topo.mesh(T1, T1.objects.si, (a, b) => a !== b && (
  (NORTH.has(a.properties.si) && SOUTH.has(b.properties.si)) || (SOUTH.has(a.properties.si) && NORTH.has(b.properties.si))));
note(`${RIVER.name} 중심선 조각 ${riverLine.coordinates.length}개`);
tick('6~7 이웃·강 중심선');

/* ---------- 7(이어서) 띠로 넓혀 칸에서 잘라내고, 다시 합치기 ---------- */
const run2 = await ms(
  `-i emd.json name=emd -i river.json name=river -buffer target=river radius=${RIVER_RADIUS_M} name=water `
  + `-erase water target=emd remove-slivers ${DISSOLVE}`
  + `-o format=geojson geojson-type=FeatureCollection target=emd emd.json -o format=geojson geojson-type=FeatureCollection target=sgg sgg.json `
  + `-o format=geojson geojson-type=FeatureCollection target=si si.json -o format=geojson geojson-type=FeatureCollection target=sido sido.json `
  + `-o format=geojson geojson-type=FeatureCollection target=water water.json`,
  { 'emd.json': String(run1['emd_s.json']), 'river.json': JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: RIVER.name }, geometry: riverLine }] }) });
// L.out 은 시·도 밖 이웃 땅(북한, E15 부터 일본 대마도)만. 다른 시·도는 L.sido 에서 지역마다 고른다(regionSgg)
const L = { emd: fcOf(run2['emd.json']), sgg: fcOf(run2['sgg.json']), si: fcOf(run2['si.json']), sido: fcOf(run2['sido.json']), water: fcOf(run2['water.json']), out: { type: 'FeatureCollection', features: [...nkLand, ...jpLand] } };
L.water.features.forEach((f) => { f.properties = { name: RIVER.name }; });
tick('7 강 띠 잘라내기·다시 합치기');

/* ---------- 8 이름표 점·내접원(미터, 등장방형 투영) ---------- */
const LAT0 = 37.5, KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KY = 110570;
const toM = ([lon, lat]) => [lon * KX, -lat * KY];
const toLL = ([x, y]) => [x / KX, -y / KY];
const polysOf = (g) => !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
const ringArea = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(a / 2); };
function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-9; let t = ((px - ax) * dx + (py - ay) * dy) / l2; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); }
function inside(x, y, rings) { let c = false; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
function polylabel(rings, precision = 5) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of rings[0]) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  const dist = (x, y) => { let m = Infinity; for (const r of rings) for (let i = 0; i < r.length - 1; i++) m = Math.min(m, segDist(x, y, r[i][0], r[i][1], r[i + 1][0], r[i + 1][1])); return inside(x, y, rings) ? m : -m; };
  const size = Math.min(maxX - minX, maxY - minY); if (size <= 0) return [minX, minY, 0];
  let h = size / 2; const q = [];
  for (let x = minX; x < maxX; x += size) for (let y = minY; y < maxY; y += size) q.push([x + h, y + h, h, dist(x + h, y + h)]);
  let best = [(minX + maxX) / 2, (minY + maxY) / 2, 0, dist((minX + maxX) / 2, (minY + maxY) / 2)];
  while (q.length) {
    q.sort((a, b) => (b[3] + b[2] * Math.SQRT2) - (a[3] + a[2] * Math.SQRT2));
    const c = q.shift();
    if (c[3] > best[3]) best = c;
    if (c[3] + c[2] * Math.SQRT2 - best[3] <= precision) continue;
    const nh = c[2] / 2;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const x = c[0] + dx * nh, y = c[1] + dy * nh; q.push([x, y, nh, dist(x, y)]); }
  }
  return [best[0], best[1], Math.max(0, best[3])];
}
const r6 = (n) => Math.round(n * 1e6) / 1e6;
const labels = {};
const bboxM = {};
// 먼 섬(백령·대청·연평 등)은 앱에서 삽입 지도로 보이므로 이름표·화면 범위는 가까운 덩어리 기준.
// 규칙은 덩어리가 속한 시·도의 지역 표 far: { lonLt } 이면 바깥 고리 평균 경도가 그보다 작은 덩어리(수도권은 125.9 고정),
// null 이면 기본 규칙 — 그 시·도의 가장 큰 땅 덩어리 상자를 30km 늘린 범위 밖에 통째로 있는 덩어리
const FAR_KM = 30000;
const boxOf = (ps) => { let q = [Infinity, Infinity, -Infinity, -Infinity]; for (const p of ps) for (const [x, y] of p[0]) q = [Math.min(q[0], x), Math.min(q[1], y), Math.max(q[2], x), Math.max(q[3], y)]; return q; };
const sidoCore = {};   // 기본 규칙용: 시·도 코드 → 가장 큰 덩어리 상자(미터)를 30km 늘린 것(처음 쓸 때 계산)
const coreOf = (sido) => {
  if (sidoCore[sido]) return sidoCore[sido];
  const f = L.sido.features.find((x) => x.properties.sido === sido);
  const polys = polysOf(f.geometry).map((p) => p.map((r) => r.map(toM)));
  let big = polys[0]; for (const p of polys) if (ringArea(p[0]) > ringArea(big[0])) big = p;
  const b = boxOf([big]);
  return (sidoCore[sido] = [b[0] - FAR_KM, b[1] - FAR_KM, b[2] + FAR_KM, b[3] + FAR_KM]);
};
// rule: 지역 표 far 값({ lonLt } 또는 null = 기본 규칙). 돌려주는 함수의 polyLL 은 경위도 덩어리(고리 목록), polyM 은 같은 덩어리의 미터 좌표
const farBy = (rule) => (sido, polyLL, polyM) => {
  if (rule && rule.lonLt != null) return polyLL[0].reduce((s, c) => s + c[0], 0) / polyLL[0].length < rule.lonLt;
  const b = boxOf([polyM]), c = coreOf(sido);
  return b[2] < c[0] || b[0] > c[2] || b[3] < c[1] || b[1] > c[3];
};
const isFar = (sido, polyLL, polyM) => farBy(SIDO_BY_CODE[sido].far)(sido, polyLL, polyM);
const farEmd = {};   // --dry-all 보고용: 먼 섬 덩어리가 있는 동 id → { far, all }
const MAIN = { labels, bbox: bboxM, far: farEmd, main: true };   // 지역 표 규칙으로 잰 값(내보내기·검사가 씀)
// 여러 곳의 상자(미터)를 합친다. kind 'near'(먼 섬 뺀 상자)는 통째로 먼 섬인 곳(울릉군처럼 가까운 덩어리가 하나도 없는 곳, near 가 null)을 빼고 합친다.
// 그런 곳은 섬 상자로 따로 보여야 하고, 넣으면 지역 상자가 섬까지 늘어난다. 모든 곳이 그렇다면 섬 상자(island)를 합친다
const boxUnion = (ids, kind, B = bboxM) => {
  const use = kind === 'near' && ids.some((id) => B[id].near) ? ids.filter((id) => B[id].near) : ids;
  let q = [Infinity, Infinity, -Infinity, -Infinity];
  for (const id of use) { const b = B[id][kind] ?? B[id].island; q = [Math.min(q[0], b[0]), Math.min(q[1], b[1]), Math.max(q[2], b[2]), Math.max(q[3], b[3])]; }
  return q;
};
// 여러 곳의 상자(main 또는 near)를 합쳐 경위도 [서, 남, 동, 북] 으로
const unionLL = (ids, kind) => {
  const q = boxUnion(ids, kind);
  const [w, n] = toLL([q[0], q[1]]), [e, so] = toLL([q[2], q[3]]);
  return [w, so, e, n].map((v) => Math.round(v * 1e4) / 1e4);
};
// 이름표 점·내접원과 상자를 M 에 적는다. bbox[id] 는 all(덩어리 전부)·near(먼 섬 뺀 덩어리, 통째로 먼 섬이면 null)·main(가장 큰 가까운 덩어리)·
// island(통째로 먼 섬일 때만, 덩어리 전부). 통째로 먼 섬이면 이름표 점은 그 섬들 가운데 가장 큰 덩어리에 둔다
function measure(fc, key, farFn, M) {
  for (const f of fc.features) {
    const id = f.properties[key];
    const polysLL = polysOf(f.geometry);
    const polys = polysLL.map((p) => p.map((r) => r.map(toM)));
    if (!polys.length) { if (M.main) failAt(f.properties.sido, `빈 도형 ${id}`); continue; }
    const near = polys.filter((p, i) => !farFn(f.properties.sido, polysLL[i], p));
    if (key === 'id' && near.length < polys.length) M.far[id] = { far: polys.length - near.length, all: polys.length };
    const pool = near.length ? near : polys;
    let big = pool[0]; for (const p of pool) if (ringArea(p[0]) > ringArea(big[0])) big = p;
    const [x, y, ir] = polylabel(big);
    const [lon, lat] = toLL([x, y]);
    M.labels[id] = [r6(lon), r6(lat), Math.round(ir)];
    let b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of polys) for (const [px, py] of p[0]) b = [Math.min(b[0], px), Math.min(b[1], py), Math.max(b[2], px), Math.max(b[3], py)];
    M.bbox[id] = near.length ? { all: b, near: boxOf(near), main: boxOf([big]) } : { all: b, near: null, main: boxOf([big]), island: boxOf(polys) };
    // 동: 섬 상자로 보일 때의 범위(emd-lib isleRange — 16px 를 지키는 한 가까운 덩어리까지. 앱 isles.ts isleView 와 같은 식).
    // 시·군·구·시 층은 통째로 먼 섬인 곳(경북 울릉군)만 — 지역 과·넓은 화면의 섬 상자(insets, E14) 칸 크기를 잰다
    if (key === 'id' || !near.length) M.bbox[id].isle = isleRange(polys.map((p) => ({ box: boxOf([p]), a: ringArea(p[0]) })), Math.round(ir));
  }
}
const addLabels = (fc, key) => measure(fc, key, isFar, MAIN);
addLabels(L.emd, 'id'); addLabels(L.sgg, 'sggId'); addLabels(L.si, 'siId');

/* ---------- 11 검사 ---------- */
const countBy = (fc, key, val) => fc.features.filter((f) => f.properties[key] === val).length;
// 시·도마다 개수(지역 표 expect): 시군구(일반구 단위)·첫 공부 층(si)·읍면동
const counts = {};
for (const s of SIDO) {
  const c = counts[s.code] = { sgg: countBy(L.sgg, 'sido', s.code), si: countBy(L.si, 'sido', s.code), emd: countBy(L.emd, 'sido', s.code) };
  if (c.sgg !== s.expect.sgg || c.emd !== s.expect.emd || c.si !== s.expect.si) failAt(s.code, `개수 다름 ${s.code} ${s.ko}: 시군구 ${c.sgg}/${s.expect.sgg} 시 층 ${c.si}/${s.expect.si} 동 ${c.emd}/${s.expect.emd}`);
}
note(`개수: ${REGIONS.map((r) => `${r.ko} ${counts[r.sido].sgg}/${counts[r.sido].emd}`).join(' · ')}, ${REGIONS.filter((r) => r.layer === 'si').map((r) => `${r.ko} 시·군 층 ${counts[r.sido].si}`).join(' · ')}`);
const ids = [...L.emd.features.map((f) => f.properties.id), ...L.sgg.features.map((f) => f.properties.sggId)];
if (new Set(ids).size !== ids.length) fail('ID 중복');
// 일반구를 시로 합친 코드(10 단위 내림)가 실제 시·군·구 코드와 겹치면 시 층 합치기가 두 곳을 한 칸으로 묶는다.
// 겹칠 수 있는 시·군·구는 늘 같은 시·도(처리 범위 안)에 있으므로, 일반구 행(sggId ≠ siId)의 siId 가 원자료 시·군·구 코드에 있는지 본다.
// 시 층 id 하나에 시 이름이 둘 이상 붙어도 같은 뜻이다(합치기 뒤의 L.si 로는 첫 이름만 남아 보이지 않으므로 동 행에서 본다)
const siNamesOf = {}, siClash = new Set();
for (const { properties: p } of emd) {
  (siNamesOf[p.siId] ||= new Set()).add(p.siName);
  if (p.sggId !== p.siId && knownSgg.has(p.siId)) siClash.add(p.siId);
}
for (const [id, names] of Object.entries(siNamesOf)) if (names.size > 1) siClash.add(id);
for (const id of siClash) failAt(sidoOfId(id), `일반구 시 코드가 다른 시군구 코드와 겹침: ${id} (${[...siNamesOf[id]].join('·')})`);
const glued = L.sgg.features.filter((f) => /^\S+시\S+구$/.test(f.properties.sggName));
for (const f of glued) failAt(f.properties.sido, `붙여 쓴 이름: ${f.properties.sggName}`);

// 섬·강 점검(손 표 pipeline/data/probes.json): 점이 들어가야 할 시군구(없으면 물). 전국을 다 돌리고, 공개 지역이 아닌 시·도의 실패는 issues 로
const containing = (lon, lat) => {
  const [x, y] = toM([lon, lat]);
  const hit = L.sgg.features.find((f) => { const b = bboxM[f.properties.sggId]?.all; return (!b || (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3])) && polysOf(f.geometry).some((p) => inside(x, y, p.map((r) => r.map(toM)))); });
  return hit ? hit.properties : null;
};
// 규칙 점검: 원자료의 그 읍·면·동에서 덩어리 하나를 골라(가장 큰·가장 동쪽·가장 남쪽) polylabel 점을 구한다.
// rule.sgg 는 want 와 같은 표시 이름('포항시 남구')으로 쓴다. 원자료의 붙여 쓴 일반구 이름은 표시 이름으로 바꿔 견준다
const probePoint = (pr) => {
  if (!pr.rule) return [pr.lon, pr.lat];
  const hit = raw.features.filter((f) => String(f.properties.sido) === pr.sido && sggShow(f.properties) === pr.rule.sgg && String(f.properties.adm_nm).split(' ').pop() === pr.rule.emd);
  if (hit.length !== 1) { failAt(pr.sido, `점검 ${pr.name}: 원자료에서 ${pr.rule.sgg} ${pr.rule.emd} 를 하나로 못 찾음(${hit.length})`); return null; }
  const polys = polysOf(hit[0].geometry);
  const meanOf = (p, k) => p[0].reduce((s, c) => s + c[k], 0) / p[0].length;
  const score = { largest: (p) => ringArea(p[0].map(toM)), east: (p) => meanOf(p, 0), south: (p) => -meanOf(p, 1) }[pr.rule.pick];
  if (!score) { failAt(pr.sido, `점검 ${pr.name}: 모르는 pick ${pr.rule.pick}`); return null; }
  const pick = polys.reduce((a, b) => (score(b) > score(a) ? b : a));
  const [lon, lat] = toLL(polylabel(pick.map((r) => r.map(toM))));
  return [r6(lon), r6(lat)];
};
const probeResults = [];
for (const pr of PROBE_LIST) {
  const pt = probePoint(pr);
  if (!pt) continue;
  const got = containing(pt[0], pt[1]);
  const ok = pr.want === null ? got === null : got?.sggName === pr.want && got.sido === pr.sido;
  probeResults.push({ name: pr.name, sido: pr.sido, lon: pt[0], lat: pt[1], rule: pr.rule ?? null, want: pr.want, got: got ? got.sggName : null, ok, dryAll: !!pr.dryAll });
  if (!ok) failAt(pr.sido, `점검 좌표 ${pr.name}: ${got ? got.sggName : null} (기대 ${pr.want})`);
}
note(`점검 좌표 ${probeResults.length}곳 확인`);

// 인천 개편 확인(설계서 8.3 ①~⑥, ⑧): 인천이 공개 지역일 때만
const ICN_LIVE = REGIONS.some((r) => r.key === 'incheon');
const ICN = ['강화군', '옹진군', '제물포구', '영종구', '미추홀구', '연수구', '남동구', '부평구', '계양구', '서해구', '검단구'];
let INCHEON_REFORM = null;   // 아래 정적 SVG 의 개편 전 그림에서 씀
let INCHEON_OLD_OF = null;   // 인천 동 id → 개편 전 군·구 이름(개편 전 그림의 묶음)
if (ICN_LIVE) {
  const icNames = L.sgg.features.filter((f) => f.properties.sido === '28').map((f) => f.properties.sggName).sort();
  if (JSON.stringify(icNames) !== JSON.stringify([...ICN].sort())) fail(`인천 군·구가 현황과 다름: ${icNames.join(',')}`);
  const icEmd = L.emd.features.filter((f) => f.properties.sido === '28').map((f) => f.properties.name);
  const kinds = { 읍: icEmd.filter((n) => n.endsWith('읍')).length, 면: icEmd.filter((n) => n.endsWith('면')).length, 동: icEmd.filter((n) => n.endsWith('동')).length };
  if (kinds.읍 !== 1 || kinds.면 !== 19 || kinds.동 !== 138) fail(`인천 읍면동 구성 다름 ${JSON.stringify(kinds)}`);
  const oldCodes = L.sgg.features.filter((f) => ['28110', '28140', '28260'].includes(f.properties.sgg));
  if (oldCodes.length) fail('인천 옛 중구·동구·서구 코드가 남음');
  const NEW_COUNT = { 제물포구: 18, 영종구: 6, 서해구: 16, 검단구: 8 };
  for (const [g, n] of Object.entries(NEW_COUNT)) { const c = L.emd.features.filter((f) => f.properties.sggName === g).length; if (c !== n) fail(`${g} 동 수 ${c} (기대 ${n})`); }
  // 면적·동 목록: 개편 전(ver20260401) 중구+동구 = 제물포+영종, 서구 = 서해+검단
  if (fs.existsSync(OLD_INCHEON)) {
    const oldBuf = fs.readFileSync(OLD_INCHEON);
    const oldSha = crypto.createHash('sha256').update(oldBuf).digest('hex');
    if (oldBuf.length !== SOURCE_OLD_INCHEON.bytes || oldSha !== SOURCE_OLD_INCHEON.sha256) fail(`개편 전 인천 파일이 다릅니다: ${oldBuf.length}B ${oldSha}`);
    const old = JSON.parse(oldBuf.toString('utf8'));
    const raw28 = raw.features.filter((f) => String(f.properties.sido) === '28');
    const areaOf = (feats) => feats.reduce((s, f) => s + polysOf(f.geometry).reduce((t, p) => t + ringArea(p[0].map(toM)) - p.slice(1).reduce((u, h) => u + ringArea(h.map(toM)), 0), 0), 0);
    const pick = (fc, names) => fc.filter((f) => names.includes(f.properties.sggnm));
    const nm = (feats) => feats.map((f) => String(f.properties.adm_nm).split(' ').pop()).sort().join(',');
    for (const [oldG, newG] of [[['중구', '동구'], ['제물포구', '영종구']], [['서구'], ['서해구', '검단구']]]) {
      const a = areaOf(pick(old.features, oldG)), b = areaOf(pick(raw28, newG));
      const diff = Math.abs(a - b) / a;
      // 기준 1.5%: 비교용 옛 파일은 경계 정밀도가 다르고 해안선(매립지)도 판마다 바뀐다.
      // 동이 잘못 옮겨 갔는지는 바로 아래 '동 목록 같음' 검사가 가린다(2026-11-06 확인: 동별 차이가 해안 동에 몰림)
      if (diff > 0.015) fail(`면적 차이 ${oldG.join('+')} → ${newG.join('+')}: ${(diff * 100).toFixed(2)}%`);
      if (nm(pick(old.features, oldG)) !== nm(pick(raw28, newG))) notes.push(`동 이름 목록이 다름(분동·이름 변경 가능) ${oldG.join('+')} → ${newG.join('+')}`);
      note(`인천 ${oldG.join('+')} → ${newG.join('+')}: 면적 차이 ${(diff * 100).toFixed(3)}%, 동 목록 ${nm(pick(old.features, oldG)) === nm(pick(raw28, newG)) ? '같음' : '다름(아래 기록)'}`);
    }
    // 개편 대응표(인천 허브·가이드 G3): 새 구마다 옛 구에서 온 동. 동 이름으로 잇는다(위에서 두 묶음의 동 목록이 같음을 확인)
    const dongName = (f) => String(f.properties.adm_nm).split(' ').pop();
    const reform = [];
    for (const g of ['제물포구', '영종구', '서해구', '검단구']) {
      const dongs = raw28.filter((f) => f.properties.sggnm === g).map(dongName);
      const from = {};
      for (const d of dongs) {
        const o = old.features.filter((f) => ['중구', '동구', '서구'].includes(f.properties.sggnm) && dongName(f) === d);
        if (o.length !== 1) fail(`인천 대응표: ${g} ${d} 의 옛 구를 하나로 못 찾음(${o.length})`);
        else (from[o[0].properties.sggnm] ||= []).push(d);
      }
      for (const k of Object.keys(from)) from[k].sort((a, b) => a.localeCompare(b, 'ko'));
      // 면적(㎢): 지금 행정동 경계를 등장방형(37.5°) 미터 좌표로 잰 값 — 인천 위도에서 오차 0.5% 안팎
      const km2 = (feats) => +(areaOf(feats) / 1e6).toFixed(1);
      const fromArea = Object.fromEntries(Object.entries(from).map(([o, list]) => [o, km2(raw28.filter((f) => f.properties.sggnm === g && list.includes(dongName(f))))]));
      reform.push({ new: g, from, area_km2: km2(raw28.filter((f) => f.properties.sggnm === g)), fromArea });
    }
    pending.push(['src/data/incheon-reform.json', JSON.stringify({ _note: '인천 2026-07 개편: 새 구마다 옛 중구·동구·서구에서 온 행정동(ver20260401 → ver20261001, 동 이름으로 이음). pipeline/build-geo.mjs 가 만든다', source_old: 'vuski/admdongkor ver20260401(hjd/hjd_28_incheon.geojson)', source_new: SOURCE.file, reform }, null, 1) + '\n']);
    INCHEON_REFORM = reform;
    // 정적 쪽 개편 전 그림(아래 SVG 단계)의 묶음도 여기서 정하고 확인한다: 새 구의 동마다 옛 구가 있고, 옛 구로 묶으면 10곳(2군 8구).
    // 쓰기 단계에서 실패하면 판 폴더와 src/data 가 반쯤 쓰인 채 남으므로 검사 관문 앞에 둔다
    const oldOf = new Map();
    for (const r of reform) for (const [o, list] of Object.entries(r.from)) for (const dn of list) oldOf.set(`${r.new}|${dn}`, o);
    const NEW_GU = new Set(reform.map((r) => r.new));
    INCHEON_OLD_OF = new Map();
    for (const f of L.emd.features.filter((x) => x.properties.sido === '28')) {
      const k = `${f.properties.sggName}|${f.properties.name}`;
      if (NEW_GU.has(f.properties.sggName) && !oldOf.has(k)) fail(`인천 개편 전 그림: ${k} 의 옛 구 없음`);
      INCHEON_OLD_OF.set(f.properties.id, oldOf.get(k) ?? f.properties.sggName);
    }
    const nOld = new Set(INCHEON_OLD_OF.values()).size;
    if (nOld !== 10) fail(`인천 개편 전 군·구 ${nOld}곳(기대 10: 2군 8구)`);
    note(`인천 개편 대응표: ${reform.map((r) => `${r.new} ← ${Object.entries(r.from).map(([k, v]) => `${k} ${v.length}`).join('·')}`).join(' / ')}`);
  } else fail(`개편 전 인천 파일이 없음: ${path.relative(ROOT, OLD_INCHEON)} (${SOURCE_OLD_INCHEON.from} 에서 옮겨 둘 것)`);
}   // if (ICN_LIVE)

// 단원·과 구성: 이름이 데이터에 있는지, 과 화면 칸 크기(공개 지역만)
const units = [];
for (const R of REGIONS) {
  const layer = R.layer === 'si' ? L.si : L.sgg; const key = R.layer === 'si' ? 'siId' : 'sggId'; const nameKey = R.layer === 'si' ? 'siName' : 'sggName';
  const items = layer.features.filter((f) => f.properties.sido === R.sido);
  const byName = Object.fromEntries(items.map((f) => [f.properties[nameKey], f.properties[key]]));
  for (const n of Object.keys(byName)) if (!R.slugs[n]) fail(`${R.ko}: slug 없음 ${n}`);
  for (const n of Object.keys(R.slugs)) if (!byName[n]) fail(`${R.ko}: 데이터에 없는 이름 ${n}`);
  // 과 없는 지역(layer emd — 세종, 계획서 N4 · E12): 칸(시·군·구 층)만 싣고 과·넓은 화면은 없다. 공부는 동 단원(아래 12단계)이고,
  // 칸은 홈·지역 지도와 동 단원 slug(units.json slugs)에 쓴다. --preview 의 미리보기 지역(E8)과 같은 모양이다
  if (R.layer === 'emd') {
    units.push({ key: R.key, sido: R.sido, ko: R.ko, full: R.full, en: R.en, layer: R.layer, fit: unionLL(items.map((f) => f.properties[key]), 'near'),
      items: items.map((f) => ({ id: f.properties[key], ko: f.properties[nameKey], slug: R.slugs[f.properties[nameKey]] })).sort((a, b) => a.ko.localeCompare(b.ko, 'ko')),
      lessons: [], screens: [] });
    note(`${R.ko}: 과 없는 지역(칸 ${items.length} — 동 단원이 주 단원)`);
    continue;
  }
  const inLessons = R.lessons.flatMap((l) => l.items);
  if (new Set(inLessons).size !== items.length || inLessons.some((n) => !byName[n])) fail(`${R.ko}: 과 구성이 ${items.length}곳과 맞지 않음`);
  // 화면 검사(설계서 3.2): 가장 좁은 휴대폰 지도 칸에서 칸마다 내접원 지름. 16px 미만이면 실패, 24px 미만은 '모호 확대'.
  // 과 화면은 각 곳의 가장 큰 덩어리 기준(작은 섬은 끌어서 보고, 옹진 먼 섬은 섬 상자로), 넓은 화면은 먼 섬만 뺀 기준. 앱도 이 상자(fit)로 맞춘다
  // 통째로 먼 섬인 곳(경북 울릉군 — 가까운 덩어리가 없어 near 가 null)은 지역 과·넓은 화면에서 섬 상자(insets, 계획서 N8 · E14)로 따로 보인다:
  // 본 화면 상자·칸 크기는 나머지 곳으로 재고, 섬 상자 곳은 섬마다 INSET(128×112, 여백 12%) 상자에 isle 범위(isleRange — 앱 isles.ts isleView 와 같은 식)를
  // 맞춰 잰다(동 단원 emd-lib tapWith 와 같은 계산). 앱은 화면·과의 insets 를 섬 상자로 그린다(ui/maps.ts wholeView·lessonView — 지역에도 E13 검수에서 열어 둠).
  // 섬 상자 곳만 든 과·화면은 만들지 않는다(앱의 섬 격자 보기는 동 단원 섬 과에서만 써 봤다). insets 가 없으면 판 출력은 전과 같다
  const insetPx = (id) => {
    const v = bboxM[id].isle, w = v[2] - v[0], h = v[3] - v[1], m = Math.max(w, h) * INSET.pad;
    return Math.round(2 * labels[id][2] * Math.min(INSET.w / (w + 2 * m), INSET.h / (h + 2 * m)));
  };
  const screen = (label, lids, kind, phone = PHONE) => {
    // 데이터에 없는 이름이 든 과·화면은 위 구성 검사가 이미 실패로 적었다. 여기서 예외로 죽으면 그 문구가 안 나오므로 화면 계산만 건너뛴다
    if (lids.some((id) => !id)) return { fit: null, minTapPx: null, ambiguous: [] };
    const insets = lids.filter((id) => !bboxM[id].near), main = lids.filter((id) => bboxM[id].near);
    if (!main.length) { fail(`${R.ko} ${label}: 섬 상자로 보일 곳(${insets.join(', ')})만 있음 — 본 땅 곳과 함께 둘 것`); return { fit: null, minTapPx: null, ambiguous: [] }; }
    const b = boxUnion(main, kind);
    const w = b[2] - b[0], h = b[3] - b[1], p = Math.max(w, h) * phone.pad;
    const k = Math.min(phone.w / (w + 2 * p), phone.h / (h + 2 * p));   // px/m
    const sizes = [...main.map((id) => ({ id, d: Math.round(2 * labels[id][2] * k) })), ...insets.map((id) => ({ id, d: insetPx(id) }))];
    const min = sizes.reduce((a, s) => (s.d < a.d ? s : a));
    const ambiguous = sizes.filter((s) => s.d < TAP_AMBIG).map((s) => s.id);
    if (min.d < TAP_FAIL) fail(`${R.ko} ${label}: 가장 작은 칸 ${min.id} 지름 ${min.d}px (<${TAP_FAIL})`);
    return { fit: unionLL(main, kind), minTapPx: min.d, ambiguous, ...(insets.length ? { insets } : {}) };
  };
  const lessons = R.lessons.map((l) => {
    const lids = l.items.map((n) => byName[n]);
    return { no: l.no, title: l.title, en: l.en, items: lids, ...screen(`${l.no}과`, lids, 'main') };
  });
  note(`${R.ko} 과 화면 최소 칸(지름): ${lessons.map((l) => `${l.no}과 ${l.minTapPx}px${l.ambiguous.length ? '(모호 ' + l.ambiguous.length + ')' : ''}${l.insets ? '(섬 상자 ' + l.insets.map((id) => sggNameOf[id]).join('·') + ')' : ''}`).join(' · ')}`);
  // 넓은 화면(전체 연습·시험·넓은 복습): screens 가 없으면 지역 전체가 한 화면
  const screenDefs = R.screens ?? [{ key: 'all', ko: R.ko, en: R.en, items: Object.keys(R.slugs) }];
  const inScreens = screenDefs.flatMap((s) => s.items);
  if (new Set(inScreens).size !== items.length || inScreens.some((n) => !byName[n])) fail(`${R.ko}: 넓은 화면 구성이 ${items.length}곳과 맞지 않음`);
  const screens = screenDefs.map((s) => {
    const sids = s.items.map((n) => byName[n]);
    return { key: s.key, ko: s.ko, en: s.en, items: sids, ...screen(`넓은 화면 ${s.ko}`, sids, 'near', PHONE_WIDE) };
  });
  note(`${R.ko} 넓은 화면 최소 칸(지름): ${screens.map((s) => `${s.ko} ${s.minTapPx}px${s.ambiguous.length ? '(모호 ' + s.ambiguous.length + ')' : ''}${s.insets ? '(섬 상자 ' + s.insets.map((id) => sggNameOf[id]).join('·') + ')' : ''}`).join(' · ')}`);
  // 공통 완료 조건 2(계획서 5절): 1·2·3곳 과 수와 모호(16~24px) 칸 수
  const small = [1, 2, 3].map((n) => lessons.filter((l) => l.items.length === n).length);
  note(`${R.ko} 과 ${lessons.length} · 1·2·3곳 과 ${small.join('·')} · 모호 칸 과 ${lessons.reduce((t, l) => t + l.ambiguous.length, 0)} · 넓은 화면 ${screens.reduce((t, s) => t + s.ambiguous.length, 0)}`);
  units.push({ key: R.key, sido: R.sido, ko: R.ko, full: R.full, en: R.en, layer: R.layer, fit: unionLL(items.map((f) => f.properties[key]), 'near'),
    items: items.map((f) => ({ id: f.properties[key], ko: f.properties[nameKey], slug: R.slugs[f.properties[nameKey]] })).sort((a, b) => a.ko.localeCompare(b.ko, 'ko')),
    lessons, screens });
}

/* ---------- 9(이어서) 위치 한 줄(설계서 3.10): 원고 src/data/place-lines.json 의 근거를 지도로 확인 ---------- */
const LINES = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/place-lines.json'), 'utf8'));
const LINE_MAX = 30;
// 초4가 읽기 어려운 한자말(src/data/hard-words.json, 구 소개 글과 같이 씀) — 원고에 나오면 실패
const HARD_WORDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/hard-words.json'), 'utf8')).words;
const OLD_ICN = /(^|[^가-힣])(중구|동구|서구)(?![가-힣])/;   // 인천 옛 구 이름(남동구처럼 이름 속 글자는 빼고)
// 근거 이름 찾기(계획서 N27): ① '서울 강서구'처럼 지역 이름(지역 표 ko)을 붙인 꼴은 그 지역에서 ② 붙이지 않았으면
// 같은 지역 → 다른 공개 지역 차례로 찾는다 ③ 그래도 둘 이상이면 실패('지역 이름을 붙이세요'). 시 층(si) 이름으로 찾는다.
// 근거는 공개 지역 안에서만 찾는다(--dry-all 은 16 시·도를 다 계산하지만 기본 실행과 같은 결과가 나야 한다). 공개가 아닌 지역 이름을 붙이면 따로 실패
const LIVE_KEYS = new Set(REGIONS.map((r) => r.key));
const siByRegion = {};   // 공개 지역 key → 시 층 이름 → [feature]
for (const f of L.si.features) if (LIVE_KEYS.has(f.properties.region)) ((siByRegion[f.properties.region] ||= {})[f.properties.siName] ||= []).push(f);
const KEY_BY_KO = Object.fromEntries(SIDO.map((s) => [s.ko, s.key]));
const siOf = (name, R) => {
  const sp = name.indexOf(' '), pre = sp > 0 ? KEY_BY_KO[name.slice(0, sp)] : undefined;
  let hit;
  if (pre && !LIVE_KEYS.has(pre)) { fail(`위치 한 줄: 근거 '${name}'의 지역 ${name.slice(0, sp)}은 공개 지역이 아님(${R.ko})`); return undefined; }
  if (pre) hit = siByRegion[pre]?.[name.slice(sp + 1)] || [];
  else {
    hit = siByRegion[R.key]?.[name] || [];
    if (!hit.length) hit = REGIONS.filter((r) => r.key !== R.key).flatMap((r) => siByRegion[r.key]?.[name] || []);
  }
  if (hit.length !== 1) fail(`위치 한 줄: '${name}'을 하나로 찾지 못함(${hit.length}곳${hit.length > 1 ? ` — 지역 이름을 붙이세요(예: ${hit.map((f) => `${SIDO_BY_CODE[f.properties.sido].ko} ${name}`).join(', ')})` : ''}, ${R.ko})`);
  return hit.length === 1 ? hit[0] : undefined;
};
const DIR_DEG = { E: 0, NE: 45, N: 90, NW: 135, W: 180, SW: -135, S: -90, SE: -45 };
const lpt = (id) => { const [x, y] = toM([labels[id][0], labels[id][1]]); return [x, -y]; };   // 동쪽 x, 북쪽 y
const areaM2 = {};
const areaOf = (id) => (areaM2[id] ??= polysOf(L.si.features.find((f) => f.properties.siId === id).geometry)
  .reduce((s, p) => s + ringArea(p[0].map(toM)) - p.slice(1).reduce((h, r) => h + ringArea(r.map(toM)), 0), 0));
// '끝'(side edge)의 실제 땅끝(E11 검수): 칸의 바깥 고리 꼭짓점 가운데 그 방향으로 가장 먼 점(동쪽 x·북쪽 y 미터에 방향 단위 벡터를 곱한 값).
// 이름표 점 순위만 보면 실제 땅끝과 어긋난 '끝'이 지났다(영도구 '부산 남쪽 끝' — 이름표 1위, 꼭짓점 4위: 강서구 가덕도·사하구 다대포가 더 남쪽)
const siVerts = new Map();
const vertsOf = (id) => {
  if (!siVerts.has(id)) siVerts.set(id, polysOf(L.si.features.find((f) => f.properties.siId === id).geometry).flatMap((p) => p[0].map(([lon, lat]) => [lon * KX, lat * KY])));
  return siVerts.get(id);
};
const reachOf = (id, a) => vertsOf(id).reduce((m, [x, y]) => Math.max(m, x * Math.cos(a) + y * Math.sin(a)), -Infinity);
// 맞닿은 경계 길이(E11 검수): 전국 위상 T1(강 띠 자르기 전 — neighbors.si 와 같은 위상)의 시 층에서 두 칸이 함께 쓰는 호의 길이(m).
// 맞닿음(touch) 근거는 1km 이상이어야 한다 — 동래구와 부산진구(0.6km)처럼 지도에서 한 점으로 보이는 경계를 찾는 단서로 쓰지 않게
const TOUCH_MIN_M = 1000;
const siGeomById = new Map(T1.objects.si.geometries.map((g) => [g.properties.siId, g]));
const sharedMemo = new Map();
const sharedLen = (a, b) => {
  const k = a < b ? `${a}|${b}` : `${b}|${a}`;
  if (!sharedMemo.has(k)) sharedMemo.set(k, topo.mesh(T1, { type: 'GeometryCollection', geometries: [siGeomById.get(a), siGeomById.get(b)] }, (p, q) => p !== q).coordinates
    .reduce((t, l) => t + l.reduce((s, p, i) => (i ? s + Math.hypot((p[0] - l[i - 1][0]) * KX, (p[1] - l[i - 1][1]) * KY) : 0), 0), 0));
  return sharedMemo.get(k);
};
// 바닷가(계획서 E11 · N27 — 새 근거 coast, 시·군·구·시 층): 시 층 칸의 바깥 호(전국 위상 T1 의 시 층에서 다른 칸과 함께 쓰지 않는 호 = 바다·나라 밖과 닿은 선.
// 휴전선 구간 context.json nkCorridor 상자 안은 북한과 맞닿은 땅이라 뺀다)를 이름표 점에서 본 8방위(±60도, 겹쳐 셈)마다 길이(m)로 잰다.
// 시·도 단원(koreaLive 의 sidoCoasts)과 같은 계산을 시 층에 한다. 그 방향 기준은 시·군·구 크기에 맞춰 2km(시·도는 10km), '바다에 닿지 않음'은 1km 미만으로 같다.
// 'all'(바다로 둘러싸인 섬): 바닷가가 그 칸 둘레(바깥 호 + 다른 칸과 함께 쓰는 호)의 90% 이상
const SGG_COAST_MIN_M = 2000, SGG_COAST_NONE_M = 1000, COAST_ALL = 0.9;
const siCoastMemo = new Map();
function siCoast(siId) {
  if (siCoastMemo.has(siId)) return siCoastMemo.get(siId);
  const [lx, ly] = [labels[siId][0] * KX, labels[siId][1] * KY];
  const sec = Object.fromEntries(Object.keys(DIR_DEG).map((d) => [d, 0]));
  let total = 0, all = 0;
  const segs = (mesh, f) => { for (const line of mesh.coordinates) for (let i = 1; i < line.length; i++) f(line[i - 1], line[i], Math.hypot((line[i][0] - line[i - 1][0]) * KX, (line[i][1] - line[i - 1][1]) * KY)); };
  const g = T1.objects.si.geometries.find((x) => x.properties.siId === siId);
  segs(topo.mesh(T1, { type: 'GeometryCollection', geometries: [g] }), (a, b, len) => { all += len; });
  segs(topo.mesh(T1, T1.objects.si, (a, b) => a === b && a.properties.siId === siId), (a, b, len) => {
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (inNkBox(mid)) return;
    total += len;
    const deg = Math.atan2(mid[1] * KY - ly, mid[0] * KX - lx) * 180 / Math.PI;
    for (const [d, dd] of Object.entries(DIR_DEG)) if (Math.abs(((deg - dd + 540) % 360) - 180) <= 60) sec[d] += len;
  });
  const v = { total, all, sec };
  siCoastMemo.set(siId, v);
  return v;
}
const coastSeen = [];   // 보고용: coast 근거를 쓴 지역의 곳마다 바닷가 길이(km)
let lineCount = 0;
let touchMin = null;   // 보고용: 맞닿음 근거 가운데 가장 짧은 경계 [m, 곳, 근거]
for (const R of REGIONS) {
  const u = units.find((v) => v.key === R.key);
  const src = LINES[R.key] || {};
  // '_' 로 시작하는 칸은 설명(_note)
  for (const n of Object.keys(src)) if (!n.startsWith('_') && !u.items.some((it) => it.ko === n)) fail(`위치 한 줄: ${R.ko}에 없는 곳 ${n}`);
  if (u.items.some((it) => src[it.ko]?.coast !== undefined)) coastSeen.push(`${R.ko} ${u.items.map((it) => `${it.ko} ${(siCoast(it.id).total / 1000).toFixed(1)}`).join(' · ')}`);
  for (const it of u.items) {
    const e = src[it.ko], where = `${R.ko} ${it.ko}`;
    if (!e) { if (SIDO_BY_CODE[R.sido].lineRequired) fail(`위치 한 줄 없음: ${where}`); continue; }
    if (e.line.length > LINE_MAX) fail(`위치 한 줄이 ${e.line.length}자(>${LINE_MAX}): ${where}`);
    for (const w of HARD_WORDS) if (e.line.includes(w)) fail(`위치 한 줄 금지 낱말 '${w}': ${where}`);
    if (R.key === 'incheon' && OLD_ICN.test(e.line)) fail(`위치 한 줄에 인천 옛 구 이름: ${where}`);
    for (const [nm, lon, lat] of e.at || []) {   // 명소가 이곳 안에 있다
      const [x, y] = toM([lon, lat]);
      const hit = L.si.features.find((f) => polysOf(f.geometry).some((p) => inside(x, y, p.map((r) => r.map(toM)))));
      if (hit?.properties.siId !== it.id) fail(`위치 한 줄 명소 ${nm}: ${hit ? hit.properties.siName : '어느 칸도 아님'} 안에 있음(${where})`);
    }
    for (const nm of e.touch || []) {   // 맞닿은 곳(경계 1km 이상 — E11 검수)
      const nbs = SIDO_NAMES.has(nm) ? (neighbors.si[it.id] || []).filter((o) => SIDO_BY_CODE[sidoOfId(o)].full === nm && sidoOfId(o) !== sidoOfId(it.id))
        : [siOf(nm, R)?.properties.siId].filter((o) => o && (neighbors.si[it.id] || []).includes(o));
      if (!nbs.length) { fail(`위치 한 줄 맞닿음 '${nm}': 이웃이 아님(${where})`); continue; }
      const m = nbs.reduce((t, o) => t + sharedLen(it.id, o), 0);
      if (!touchMin || m < touchMin[0]) touchMin = [m, where, nm];
      if (m < TOUCH_MIN_M) fail(`위치 한 줄 맞닿음 '${nm}': 맞닿은 경계 ${(m / 1000).toFixed(2)}km(<${TOUCH_MIN_M / 1000}km — 지도에서 한 점으로 보임, ${where})`);
    }
    if (e.dir) {   // 기준의 그쪽(이름표 점 기준 ±60도)
      const [base, d] = e.dir, b = siOf(base, R);
      if (b) {
        const [x1, y1] = lpt(it.id), [x0, y0] = lpt(b.properties.siId);
        const deg = Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI;
        if (Math.abs(((deg - DIR_DEG[d] + 540) % 360) - 180) > 60) fail(`위치 한 줄 방향: ${base}의 ${d}가 아님(${deg.toFixed(0)}°, ${where})`);
      }
    }
    if (e.side) {   // 지역 안에서 그쪽 끝(3위 안) 또는 그쪽 절반
      const [d, kind] = e.side, a = DIR_DEG[d] * Math.PI / 180;
      const order = u.items.map((v) => { const [x, y] = lpt(v.id); return [v.id, x * Math.cos(a) + y * Math.sin(a)]; }).sort((p, q) => q[1] - p[1]);
      const rank = order.findIndex(([id]) => id === it.id) + 1;
      if (rank > (kind === 'edge' ? 3 : Math.ceil(order.length / 2))) fail(`위치 한 줄 '${R.ko} ${d}${kind === 'edge' ? ' 끝' : '쪽'}': ${order.length}곳 중 ${rank}번째(${where})`);
      if (kind === 'edge') {   // '끝'은 실제 땅끝(꼭짓점)으로도 3위 안(E11 검수 — 지금 네 지역의 '끝' 11곳은 모두 3위 안)
        const reach = u.items.map((v) => [v.id, reachOf(v.id, a)]).sort((p, q) => q[1] - p[1]);
        const vr = reach.findIndex(([id]) => id === it.id) + 1;
        if (vr > 3) fail(`위치 한 줄 '${R.ko} ${d} 끝': 실제 땅끝(꼭짓점)으로 ${reach.length}곳 중 ${vr}번째 — 1위 ${u.items.find((v) => v.id === reach[0][0]).ko}보다 ${((reach[0][1] - reach[vr - 1][1]) / 1000).toFixed(1)}km 뒤(${where})`);
      }
    }
    if (e.size) {   // '작은 시'는 지역에서 작은 쪽 5위 안, '넓은 곳'은 넓은 쪽 절반, '가장 작은'·'가장 넓은'은 넓이 1위(E11)
      const order = u.items.map((v) => v.id).sort((a, b) => areaOf(a) - areaOf(b)), rank = order.indexOf(it.id) + 1;
      const ok = { small: rank <= 5, big: rank > order.length / 2, smallest: rank === 1, largest: rank === order.length }[e.size];
      if (ok === undefined) fail(`위치 한 줄 크기 근거 모양이 틀림 '${e.size}'(${where})`);
      else if (!ok) fail(`위치 한 줄 '${{ small: '작은', big: '넓은', smallest: '가장 작은', largest: '가장 넓은' }[e.size]}': ${order.length}곳 중 작은 쪽 ${rank}번째(${where})`);
    }
    if (e.coast !== undefined) {   // 바닷가(E11): ['S'…] 그 방향 2km 이상 · true 2km 이상 · 'none' 1km 미만 · 'all' 둘레의 90% 이상
      const c = siCoast(it.id), km = (m) => (m / 1000).toFixed(1);
      if (e.coast === 'none') { if (c.total >= SGG_COAST_NONE_M) fail(`위치 한 줄 '바다에 닿지 않음': 바닷가 ${km(c.total)}km(${where})`); }
      else if (e.coast === 'all') { if (c.total < COAST_ALL * c.all) fail(`위치 한 줄 '바다로 둘러싸인': 바닷가가 둘레의 ${((c.total / c.all) * 100).toFixed(0)}%(<${COAST_ALL * 100}%, ${where})`); }
      else if (e.coast === true) { if (c.total < SGG_COAST_MIN_M) fail(`위치 한 줄 '바다에 닿은': 바닷가 ${km(c.total)}km(<${SGG_COAST_MIN_M / 1000}, ${where})`); }
      else if (Array.isArray(e.coast) && e.coast.length && e.coast.every((d) => d in DIR_DEG)) {
        for (const d of e.coast) if (!(c.sec[d] >= SGG_COAST_MIN_M)) fail(`위치 한 줄 '${d}쪽 바다': 그 방향 바닷가 ${km(c.sec[d])}km(<${SGG_COAST_MIN_M / 1000}, ${where})`);
      } else fail(`위치 한 줄 바닷가 근거 모양이 틀림 ${JSON.stringify(e.coast)}(${where})`);
    }
    if (e.river && !(e.river === 'N' ? NORTH : SOUTH).has(it.id.slice(7))) fail(`위치 한 줄 ${RIVER.name} ${e.river === 'N' ? '북쪽' : '남쪽'}이 아님(${where})`);
    it.line = e.line; lineCount++;
  }
}
note(`위치 한 줄 ${lineCount}곳: 길이·금지 낱말·인천 옛 이름·명소 좌표·맞닿음(경계 ${TOUCH_MIN_M / 1000}km 이상)·방향·끝(이름표 점·꼭짓점 3위 안)·한강·크기·바닷가 검사${touchMin ? ` · 가장 짧은 맞닿음 ${touchMin[1]}–${touchMin[2]} ${(touchMin[0] / 1000).toFixed(2)}km` : ''}${coastSeen.length ? ` · 바닷가(km) ${coastSeen.join(' / ')}` : ''}`);

tick('8~11 이름표 점·검사');

/* ---------- 12 동 단원(계획서 E3 · N8 · N10 · N11 · N13 · N17 · N30 · N31): 시·군·구(일반구 단위) 하나 = 단원 하나 ---------- */
// 과 묶기·이름·이름 검사·넓은 화면·만나기 근거는 pipeline/emd-lib.mjs(순수 함수). 여기서는 그 입력(이름표 점·상자·이웃·바깥 경계)을 만들고,
// 공개 지역 가운데 지역 표 emd live 인 지역(--preview 면 공개 지역 전부)의 단원을 검사한다. 단원 파일(TopoJSON)은 검사 관문 뒤 내보내기에서 만든다
const emdOfSgg = new Map();   // 시·군·구 id → 동 feature 목록(강 띠 자른 뒤 5m)
const sggOfEmd = {};          // 동 id → 시·군·구 id
const siNameOf = {};          // 시 층 id → 시 이름
for (const f of L.emd.features) {
  const p = f.properties;
  if (!emdOfSgg.has(p.sggId)) emdOfSgg.set(p.sggId, []);
  emdOfSgg.get(p.sggId).push(f);
  sggOfEmd[p.id] = p.sggId;
  siNameOf[p.siId] = p.siName;
}
// 바깥 경계: 같은 단원(또는 지역)의 다른 칸과 함께 쓰지 않는 호가 하나라도 있으면 바깥 경계(이웃 단원·바다)에 닿은 것(강 띠 자르기 전 전국 위상 T1)
const arcsOf = (g) => { const out = []; const walk = (a) => { if (typeof a === 'number') out.push(a < 0 ? ~a : a); else for (const x of a) walk(x); }; walk(g?.arcs ?? []); return out; };
const geomOf = Object.fromEntries(['emd', 'sgg', 'si'].map((layer) => [layer, new Map(T1.objects[layer].geometries.map((g) => [g.properties[{ emd: 'id', sgg: 'sggId', si: 'siId' }[layer]], g]))]));
const outerOf = (layer, ids) => {
  const use = new Map();
  for (const id of ids) for (const a of arcsOf(geomOf[layer].get(id))) use.set(a, (use.get(a) ?? 0) + 1);
  return Object.fromEntries(ids.map((id) => [id, arcsOf(geomOf[layer].get(id)).some((a) => use.get(a) === 1)]));
};
const polyArea = (g) => polysOf(g).reduce((s, p) => s + ringArea(p[0].map(toM)) - p.slice(1).reduce((h, r) => h + ringArea(r.map(toM)), 0), 0);
// 실제 칠한 넓이의 무게중심(북쪽이 위인 미터)과 그 넓이: 먼 섬 덩어리(isFar)는 뺀다(통째로 먼 섬이면 덩어리 전부). 과 이름 지도 검사(emd-lib checkTitle)의
// 독립 기준이라 이름을 짓는 이름표 점(polylabel)과 다른 계산이다
const ringAC = (r) => { let a = 0, cx = 0, cy = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const f = r[j][0] * r[i][1] - r[i][0] * r[j][1]; a += f; cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f; } return { a: a / 2, cx: a ? cx / (3 * a) : 0, cy: a ? cy / (3 * a) : 0 }; };
function areaCenter(f) {
  const polysLL = polysOf(f.geometry);
  const near = polysLL.filter((p) => !isFar(f.properties.sido, p, p.map((r) => r.map(toM))));
  let A = 0, X = 0, Y = 0;
  for (const p of (near.length ? near : polysLL)) p.forEach((ring, k) => {
    const { a, cx, cy } = ringAC(ring.map(([lon, lat]) => [lon * KX, lat * KY]));
    const s = (k ? -1 : 1) * Math.abs(a);
    A += s; X += cx * s; Y += cy * s;
  });
  return { a: A, c: [X / A, Y / A] };
}
const boxN = (b) => (b ? [b[0], -b[3], b[2], -b[1]] : b);   // toM 상자(y 가 남쪽으로 커짐) → 북쪽이 위인 상자
const llOfN = (b) => [b[0] / KX, b[1] / KY, b[2] / KX, b[3] / KY].map((v) => Math.round(v * 1e4) / 1e4);   // 북쪽이 위인 미터 상자 → 경위도 [서, 남, 동, 북](unionLL 과 같은 반올림)
const kindOfEmd = (name) => (name.endsWith('읍') ? '읍' : name.endsWith('면') ? '면' : '동');
/** emd-lib buildUnit 의 입력 */
function emdUnitInput(sggId) {
  const feats = emdOfSgg.get(sggId);
  const ids = feats.map((f) => f.properties.id), inUnit = new Set(ids);
  const outer = outerOf('emd', ids);
  const dongs = feats.map((f) => {
    const p = f.properties, nb = neighbors.emd[p.id] || [], b = bboxM[p.id];
    const ac = areaCenter(f).c;
    return { id: p.id, ko: p.name, kind: kindOfEmd(p.name), code: p.code, x: labels[p.id][0] * KX, y: labels[p.id][1] * KY, r: labels[p.id][2], area: polyArea(f.geometry),
      c: [Math.round(ac[0]), Math.round(ac[1])],
      box: { main: boxN(b.main), near: boxN(b.near), isle: boxN(b.isle), ...(b.island ? { island: boxN(b.island) } : {}) },
      nb: nb.filter((o) => inUnit.has(o)), out: [...new Set(nb.filter((o) => !inUnit.has(o)).map((o) => sggOfEmd[o]))].sort(), outer: outer[p.id] };
  });
  const code = sggId.slice(7);
  return { code, ko: sggNameOf[sggId], dongs, ...(LESSON_MOVES[code] ? { moves: LESSON_MOVES[code] } : {}) };
}
// 사람이 정한 과 옮기기(emd-lib buildUnit U.moves): 시·군·구 코드 → [{ ko: 옮길 곳, with: 그 곳이 갈 과에 든 곳 }]
const LESSON_MOVES = readJson('pipeline/data/lesson-moves.json').moves;
const emdBuilt = new Map();   // 시·군·구 id → { U, res } (한 번만 계산)
const unitOf = (sggId) => { if (!emdBuilt.has(sggId)) { const U = emdUnitInput(sggId); emdBuilt.set(sggId, { U, res: buildUnit(U) }); } return emdBuilt.get(sggId); };
// 단원 slug(N30): 시·군·구 층 지역은 units.json slugs 그대로, 시 층 지역의 일반구는 '{시 slug}-{일반구 slug}'(pipeline/data/gu-slugs.json)
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function unitNames(R, sggId) {
  const siId = sggToSi[sggId];
  if (!R) return { slug: null, en: '' };
  if (R.layer !== 'si' || siId === sggId) { const s = R.slugs[sggNameOf[sggId]] ?? null; return { slug: s, en: s ? cap(s) : '' }; }
  // 미리보기 지역(E8)의 일반구는 임시 로마자(R.guSlugs). 손 표 gu-slugs.json 은 공개 단계에서 채운다
  const si = R.slugs[siNameOf[siId]], gu = GU_SLUGS[sggNameOf[sggId]] ?? R.guSlugs?.[sggNameOf[sggId]];
  return si && gu ? { slug: `${si}-${gu}`, en: `${cap(si)} ${cap(gu)}` } : { slug: null, en: '' };
}
/** 시·군·구(일반구 단위) 영어 이름 = 동 단원 이름과 같은 셈(unitNames): 'Seongbuk-gu' · 일반구 'Cheonan-si Dongnam-gu'. 공개하지 않은 시·도는 '' — 동 단원 지도의 이웃 땅 이름(설계안 4절) */
const sggEn = (sggId) => unitNames(REGIONS.find((r) => r.sido === sidoOfId(sggId)), sggId).en;
/** 나라 밖 이웃 땅(L.out — 북한 kp·일본 jp)의 영어: 앱 UI_EN.ctxName 과 같은 말 */
const OUT_EN = { kp: 'North Korea', jp: 'Japan' };
/** 동 과·화면 이름의 영어(설계안 7.2): 낱말 표 EN_WORDS, '{방위} · {동} 둘레' 는 '{방위}, around {동 영어 이름}'. 표에 없으면 ''(단원 검사가 실패시킨다) */
function emdTitleEn(title, dongs) {
  const m = title.match(/^(.+) · (.+) 둘레$/);
  if (!m) return EN_WORDS[title] ?? '';
  const d = dongs.find((x) => x.ko === m[2]);
  return EN_WORDS[m[1]] && d && EMD_EN[d.code] ? `${EN_WORDS[m[1]]}, around ${EMD_EN[d.code][1]}` : '';
}
const lowerFirst = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);
const sggIdsOfSido = (sido) => L.sgg.features.filter((f) => f.properties.sido === sido).map((f) => f.properties.sggId)
  .sort((a, b) => sggNameOf[a].localeCompare(sggNameOf[b], 'ko') || a.localeCompare(b));
/** 단원 파일 emd/{코드}.json 의 내용(Region 모양 + 단원 안 이웃·이름표 점·만나기 근거, 계획서 N11·N30) */
function unitJson(sggId, R) {
  const { U, res } = unitOf(sggId);
  const S = SIDO_BY_CODE[sidoOfId(sggId)];
  const { slug, en } = unitNames(R, sggId);
  const items = [...U.dongs].sort((a, b) => a.ko.localeCompare(b.ko, 'ko') || a.id.localeCompare(b.id));
  const outside = {};
  for (const d of items) for (const o of d.out) outside[o] = { ko: sggNameOf[o], sido: sidoOfId(o) };
  return {
    version: VER, key: `${S.key}/${slug ?? U.code}`, region: S.key, code: U.code, sido: S.code, ko: U.ko, full: `${S.full} ${U.ko}`, en, layer: 'emd',
    ...(sggToSi[sggId] !== sggId ? { si: sggToSi[sggId] } : {}),
    fit: llOfN(res.view ?? res.base),   // 단원 전체 지도 범위: 섬을 뺀 단원 + 본 지도에 둔 먼 섬(emd-lib view)
    // 동 slug(N31) = 행정동 코드 adm_cd2 의 뒤 5자리(앞 5자리는 시·군·구 코드 — 원자료 3,559곳 모두 확인)
    // 영어 이름(설계안 3.4·4절): 곳 = 손 표, 과 = 낱말 표, 화면 = 단원 이름 화면이면 단원 en, 아니면 낱말 표(첫 글자 소문자)
    items: items.map((d) => ({ id: d.id, ko: d.ko, en: EMD_EN[d.code]?.[1] ?? '', slug: d.code.slice(5), kind: d.kind })),
    lessons: res.lessons.map((L) => ({ no: L.no, title: L.title, en: emdTitleEn(L.title, U.dongs), items: L.ids, fit: llOfN(L.box), minTapPx: L.minTapPx, ambiguous: L.ambiguous, ...(L.insets.length ? { insets: L.insets } : {}) })),
    screens: res.screens.map((s) => ({ key: s.key, ko: s.ko, en: s.ko === U.ko ? en : lowerFirst(emdTitleEn(s.ko, U.dongs)), items: s.ids, fit: llOfN(s.box), minTapPx: s.minTapPx, ambiguous: s.ambiguous, ...(s.insets.length ? { insets: s.insets } : {}) })),
    // 섬 상자가 있는 단원에만: 그 가운데 정말 먼 섬(지역 표 먼 섬 규칙 — 없으면 빈 목록). 앱이 상자 묶음 글을 '먼 섬'/'섬'으로 나눈다(D2 ⓑ 사용자 결정 2026-11-17).
    // 열쇠가 없는 파일(옛 캐시·섬 상자 없는 단원)은 전처럼 '먼 섬'
    ...([...res.lessons, ...res.screens].some((x) => x.insets.length) ? { far: res.far } : {}),
    neighbors: Object.fromEntries(items.map((d) => [d.id, [...d.nb].sort()])),
    labels: Object.fromEntries(items.map((d) => [d.id, labels[d.id]])),
    meet: Object.fromEntries(items.map((d) => [d.id, res.meet[d.id]])),
    outside,
  };
}
/* ---------- 11(이어서) 시·군·구 과·넓은 화면 이름 검사(계획서 N7 · E11) ---------- */
// 12자 안, 지역 안에서 겹치지 않음, 금지 낱말·행정 권역 용어('…권역'·'도심') 없음, 지도 검사(emd-lib checkTitle — 과의 실제 칠한 넓이 중심을 지역의 나머지 칸과 견줌:
// 방위 낱말 ±60도, '가운데'는 지역 넓이 중심에서 등가 반지름 0.35배 안, '끝'은 모든 곳이 지역 바깥 경계에 닿음. 섬 상자로 따로 보이는 곳은 기준에서 뺀다 — --dry-all 보고와 같은 계산).
// 넓은 화면이 둘 이상이면 화면 이름(ko)도 같은 검사를 한다. 새로 여는 지역은 걸리면 실패하고,
// pipeline/data/title-legacy.json 의 지역(Q4 답 전에 공개한 세 지역의 지금 이름)은 보고만 한다
{
  const LEGACY = new Set(readJson('pipeline/data/title-legacy.json').regions);
  const seen = [], legacyFails = [];
  for (const R of REGIONS) {
    const u = units.find((v) => v.key === R.key), layer = R.layer === 'si' ? 'si' : 'sgg', key = layer === 'si' ? 'siId' : 'sggId';
    const bad = (m) => (LEGACY.has(R.key) ? legacyFails.push(`${R.ko} ${m}`) : fail(`${R.ko} ${m}`));
    const itemIds = u.items.map((it) => it.id), outer = outerOf(layer, itemIds);
    const AC = Object.fromEntries(itemIds.map((id) => [id, areaCenter(L[layer].features.find((f) => f.properties[key] === id))]));
    const wsum = (ids) => ids.reduce((t, id) => t + AC[id].a, 0);
    const wc = (ids) => [0, 1].map((k) => ids.reduce((t, id) => t + AC[id].c[k] * AC[id].a, 0) / wsum(ids));
    const onMap = itemIds.filter((id) => bboxM[id].near);
    const check = (what, title, ids) => {
      if (!title || title.length > 12) bad(`${what} 이름 '${title}'이 비었거나 12자를 넘음(N7)`);
      for (const w of HARD_WORDS) if (title.includes(w)) bad(`${what} 이름 '${title}'에 금지 낱말 '${w}'`);
      if (/권역|도심/.test(title)) bad(`${what} 이름 '${title}'에 행정 권역 용어(N7)`);
      const lids = ids.filter((id) => onMap.includes(id)), rest = onMap.filter((id) => !lids.includes(id));
      if (!lids.length) return;
      const why = checkTitle(title, { at: wc(lids), base: wc(onMap), rest: wc(rest.length ? rest : onMap), r: Math.sqrt(wsum(onMap) / Math.PI), allOuter: lids.every((id) => outer[id]) });
      if (why.length) bad(`${what} 이름 '${title}' 지도 검사 — ${why.join(' / ')}`);
    };
    for (const l of u.lessons) check(`${l.no}과`, l.title, l.items);
    if (u.screens.length > 1) for (const s of u.screens) check(`넓은 화면 ${s.key}`, s.ko, s.items);
    for (const [what, list, k] of [['과', u.lessons, 'title'], ['넓은 화면', u.screens, 'ko'], ['넓은 화면', u.screens, 'key']]) if (new Set(list.map((x) => x[k])).size !== list.length) bad(`${what} ${k} 가 겹침`);
    if (!LEGACY.has(R.key)) seen.push(R.ko);
  }
  note(`시·군·구 과 이름 지도 검사(N7): ${seen.length ? `${seen.join('·')} 통과` : '새로 연 지역 없음'}${legacyFails.length ? ` · 보고만(Q4 전 이름) ${legacyFails.length}건: ${legacyFails.join(' / ')}` : ''}`);
}

/* ---------- 12(앞) 시·도 층과 미리보기 지역(계획서 E8 · N23 · N30): 전국 시·도 지도의 이름표 점, --preview 의 13 시·도 임시 과와 시·도 단원(korea) ---------- */
// 시·도 층: 전국 위상 T1 의 sido 층(강 띠 자르기 전 5m). 곳 id 는 kr:sido:{코드}(N15 — 시·도 단원의 숙달 키). 이름표 점은 가장 큰 가까운 덩어리의
// '경계에서 가장 먼 점'(먼 섬 규칙은 시·군·구와 같은 지역 표 far — 경북 울릉·독도, 인천 먼 섬은 이름표 자리에서 빠진다). labels.json 에는 넣지 않는다
// (전국 시·도 지도 파일과 units.json korea 에 싣는다 — 운영 labels.json 을 바꾸지 않으려고)
const SIDO_KEY = (code) => `kr:sido:${code}`;
const SIDO_FC = { type: 'FeatureCollection', features: topo.feature(T1, T1.objects.sido).features.map((f) => ({ type: 'Feature', geometry: f.geometry, properties: { sido: f.properties.sido, sidoId: SIDO_KEY(f.properties.sido) } })) };
const SIDO_M = { labels: {}, bbox: {}, far: {}, main: false };
measure(SIDO_FC, 'sidoId', isFar, SIDO_M);
geomOf.sido = new Map(T1.objects.sido.geometries.map((g) => [SIDO_KEY(g.properties.sido), g]));
const sidoNb = {};
{
  const gs = T1.objects.sido.geometries, nb = topo.neighbors(gs);
  gs.forEach((g, i) => { sidoNb[SIDO_KEY(g.properties.sido)] = [...new Set(nb[i].map((j) => SIDO_KEY(gs[j].properties.sido)))].filter((x) => x !== SIDO_KEY(g.properties.sido)).sort(); });
}
/**
 * emd-lib buildUnit 의 입력을 동이 아닌 층(시·군·구 sgg · 시 si · 시·도 sido)으로 만든다: 미리보기 지역의 임시 과와 시·도 단원의 과.
 * 곳 종류는 모두 '동'으로 둔다(동·읍면 나누기 없음), 단원 밖 이웃(out)은 다른 시·도 칸
 */
function levelInput(code, ko, ids, layer) {
  const M = layer === 'sido' ? SIDO_M : MAIN;
  const fc = layer === 'sido' ? SIDO_FC : L[layer];
  const key = { sgg: 'sggId', si: 'siId', sido: 'sidoId' }[layer];
  const feats = new Map(fc.features.map((f) => [f.properties[key], f]));
  const nbOf = layer === 'sido' ? sidoNb : neighbors[layer];
  const inU = new Set(ids), outer = outerOf(layer, ids);
  const nameOf = (id) => (layer === 'sido' ? SIDO_BY_CODE[id.slice(8)].ko : layer === 'si' ? siNameOf[id] : sggNameOf[id]);
  const dongs = ids.map((id) => {
    const f = feats.get(id), b = M.bbox[id], nb = nbOf[id] || [], ac = areaCenter(f).c;
    return { id, ko: nameOf(id), kind: '동', code: id.replace(/\D/g, ''), x: M.labels[id][0] * KX, y: M.labels[id][1] * KY, r: M.labels[id][2], area: polyArea(f.geometry),
      c: [Math.round(ac[0]), Math.round(ac[1])], box: { main: boxN(b.main), near: boxN(b.near), isle: boxN(b.near ?? b.main), ...(b.island ? { island: boxN(b.island) } : {}) },
      nb: nb.filter((o) => inU.has(o)), out: nb.filter((o) => !inU.has(o)), outer: outer[id] };
  });
  return { code, ko, dongs };
}
/** 임시 로마자(미리보기 slug 전용): 개정 로마자 표기의 글자 바꾸기만(받침 다음 ㅇ 은 이어 읽고 ㄹㄹ 은 ll — 그 밖의 동화 규칙 없음). 공개 단계에서 손 표로 바꾼다 */
const R_INI = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const R_MED = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const R_FIN = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];
const R_LINK = { k: 'g', t: 'd', p: 'b', l: 'r' };   // 받침 + ㅇ: 이어 읽는 소리
function romaLite(word) {
  const sy = [...word].map((ch) => { const c = ch.charCodeAt(0) - 0xac00; return c >= 0 && c < 11172 ? [Math.floor(c / 588), Math.floor((c % 588) / 28), c % 28] : null; });
  let out = '';
  sy.forEach((s, i) => {
    if (!s) return;
    out += R_INI[s[0]] + R_MED[s[1]];
    let f = R_FIN[s[2]];
    const nx = sy[i + 1];
    if (f && nx && nx[0] === 11) f = R_LINK[f] ?? f;
    out += f;
  });
  return out.replace(/lr/g, 'll');   // ㄹ+ㄹ → ll(울릉 ulleung)
}
const slugLite = (name) => { const m = /^(.+?)(시|군|구)$/.exec(name); return m && m[1] ? `${romaLite(m[1])}-${romaLite(m[2])}` : romaLite(name); };
// 임시 과·화면 이름의 영어(영어 앱 미리보기용): 방위 낱말만 옮긴다. '· ○○ 둘레' 같은 꼬리는 버린다
const EN_WORD = { 북서쪽: 'Northwest', 북쪽: 'North', 북동쪽: 'Northeast', 서쪽: 'West', 가운데: 'Center', 동쪽: 'East', 남서쪽: 'Southwest', 남쪽: 'South', 남동쪽: 'Southeast', 섬: 'Islands', 전체: 'All', 시내: 'Urban', '읍·면': 'Towns' };
const enWords = (t) => t.split(' ').map((w) => EN_WORD[w] ?? '').filter(Boolean).join(' ');
const PREVIEW_REGIONS = [];   // 손 원고(units.json regions)와 같은 모양 + slugs(임시)·guSlugs(임시)·preview
const previewIssues = [];     // 미리보기 지역 검사 실패(보고만)
let KOREA = null;             // units.json korea: 지역 표 korea.status live 면 원고로(koreaLive, E10), off 면 미리보기에만 임시 과
if (PREVIEW) {
  for (const s of SIDO.filter((x) => x.status !== 'live')) {
    const layer = s.layer === 'si' ? 'si' : 'sgg', key = layer === 'si' ? 'siId' : 'sggId', nameKey = layer === 'si' ? 'siName' : 'sggName';
    const feats = L[layer].features.filter((f) => f.properties.sido === s.code);
    const slugs = Object.fromEntries(feats.map((f) => [f.properties[nameKey], slugLite(f.properties[nameKey])]));
    const guSlugs = Object.fromEntries(L.sgg.features.filter((f) => f.properties.sido === s.code && f.properties.sggId !== f.properties.siId)
      .map((f) => [f.properties.sggName, slugLite(f.properties.sggName.replace(/^\S+\s/, ''))]));
    for (const [n, sl] of Object.entries(slugs)) if (!/^[a-z0-9-]{2,40}$/.test(sl) || Object.values(slugs).filter((x) => x === sl).length > 1) previewIssues.push(`${s.ko}: 임시 slug ${n} → ${sl}`);
    PREVIEW_REGIONS.push({ key: s.key, sido: s.code, ko: s.ko, full: s.full, en: s.en, layer: s.layer, slugs, guSlugs, preview: true });
    const ids = feats.map((f) => f.properties[key]);
    const items = feats.map((f) => ({ id: f.properties[key], ko: f.properties[nameKey], slug: slugs[f.properties[nameKey]] })).sort((a, b) => a.ko.localeCompare(b.ko, 'ko'));
    const base = { key: s.key, sido: s.code, ko: s.ko, full: s.full, en: s.en, layer: s.layer, fit: unionLL(ids, 'near'), items };
    // 과 없는 지역(세종·제주 — 지역 표 layer emd, 계획서 N4): 칸만 싣고 과는 없다(공부는 동 단원)
    if (s.layer === 'emd') { units.push({ ...base, lessons: [], screens: [] }); note(`미리보기 지역 ${s.ko}: 과 없는 지역(칸 ${ids.length} — 동 단원이 주 단원)`); continue; }
    const res = buildUnit(levelInput(s.code, s.ko, ids, layer));
    for (const p of res.problems) previewIssues.push(`${s.ko}: ${p.msg}`);
    const box = (b) => llOfN(b);
    units.push({ ...base,
      lessons: res.lessons.map((x) => ({ no: x.no, title: x.title, ...(enWords(x.title) ? { en: enWords(x.title) } : {}), items: x.ids, fit: box(x.box), minTapPx: x.minTapPx, ambiguous: x.ambiguous, ...(x.insets.length ? { insets: x.insets } : {}) })),
      screens: res.screens.map((x) => ({ key: x.key, ko: x.ko, en: enWords(x.ko) || s.en, items: x.ids, fit: box(x.box), minTapPx: x.minTapPx, ambiguous: x.ambiguous, ...(x.insets.length ? { insets: x.insets } : {}) })) });
    note(`미리보기 지역 ${s.ko}: ${ids.length}곳 · 임시 과 ${res.lessons.length} · 1·2·3곳 과 ${res.stats.small.join('·')} · 과 최소 칸 ${res.stats.minTapPx}px · 넓은 화면 ${res.screens.length}개 최소 ${res.stats.screenMinTapPx}px · 섬 상자 곳 ${res.lessons.reduce((t, x) => t + x.insets.length, 0)}`);
  }
  // 시·도 단원(korea, N30)이 꺼져 있으면(지역 표 korea.status off) 미리보기에만 16 시·도를 같은 묶기(이웃 따라 5~7곳)로 임시 과. 곳 이름은 지역 표 ko, slug 는 지역 키.
  // 켜져 있으면 아래 koreaLive() 가 원고로 만든다(기본 실행과 같음)
  if (SIDO_KOREA.status !== 'live') {
    const ids = SIDO.map((s) => SIDO_KEY(s.code));
    const res = buildUnit(levelInput('00', '전국', ids, 'sido'));
    for (const p of res.problems) previewIssues.push(`전국: ${p.msg}`);
    KOREA = { key: 'korea', sido: '00', ko: '전국', full: '대한민국', en: 'Korea', layer: 'sido', fit: llOfN(res.view ?? res.base),
      items: SIDO.map((s) => ({ id: SIDO_KEY(s.code), ko: s.ko, slug: s.key })).sort((a, b) => a.ko.localeCompare(b.ko, 'ko')),
      lessons: res.lessons.map((x) => ({ no: x.no, title: x.title, ...(enWords(x.title) ? { en: enWords(x.title) } : {}), items: x.ids, fit: llOfN(x.box), minTapPx: x.minTapPx, ambiguous: x.ambiguous, ...(x.insets.length ? { insets: x.insets } : {}) })),
      screens: res.screens.map((x) => ({ key: x.key, ko: x.ko, en: enWords(x.ko) || 'Korea', items: x.ids, fit: llOfN(x.box), minTapPx: x.minTapPx, ambiguous: x.ambiguous, ...(x.insets.length ? { insets: x.insets } : {}) })),
      labels: Object.fromEntries(ids.map((id) => [id, SIDO_M.labels[id]])), neighbors: Object.fromEntries(ids.map((id) => [id, sidoNb[id] ?? []])) };
    note(`미리보기 시·도 단원(korea): 16곳 · 임시 과 ${res.lessons.length}(${res.lessons.map((x) => `${x.title} ${x.ids.length}`).join('·')}) · 과 최소 칸 ${res.stats.minTapPx}px · 넓은 화면 ${res.screens.length}개 최소 ${res.stats.screenMinTapPx}px`);
  }
}

/* ---------- 12(앞, 이어서) 시·도 단원(korea, 계획서 E10 · N7 · N27 · N29 · N30): 지역 표 korea.status live 면 기본 실행도 싣는다 ---------- */
// 과·넓은 화면은 원고 src/data/units.json korea(이름 = 지역 표 ko, 곳 차례 = 만나기 차례), 위치 한 줄은 src/data/place-lines.json korea.
// 검사(하나라도 걸리면 아무것도 쓰지 않는다 — fail):
//  · 구성: 16 시·도가 저마다 정확히 한 과·한 넓은 화면에
//  · 칸 크기: 과 화면은 휴대폰 지도 칸(PHONE, 곳마다 가장 큰 가까운 덩어리), 넓은 화면은 PHONE_WIDE(먼 섬 뺀 덩어리)에서 내접원 지름 16px 이상 — 지역 과·화면 검사(screen())와 같은 계산
//  · 이름(N7): 12자 안, 겹치지 않음, 금지 낱말 없음, 지도 검사(emd-lib checkTitle — 실제 칠한 넓이 중심을 나머지 시·도와 견줌. 방위 ±60도, '가운데'는 등가 반지름의 0.35배 안)
//  · 위치 한 줄 16곳(N27 — 지도로 잴 수 있는 근거만): 길이·금지 낱말 + 근거마다 아래 계산
// 단원 범위(fit)는 시·도 덩어리 전부(독도·백령도·마라도까지 — 전국 시·도 지도와 지역 고르기 KOREA_FIT 과 같은 뜻): 단원 쪽·홈·둘러보기의 전국 지도에 독도가 보인다
const COAST_MIN_M = 10000, COAST_NONE_M = 1000;   // '그쪽 바다에 닿은' 근거: 그 방향(±60도) 바닷가 10km 이상 · '바다에 닿지 않은': 바닷가 1km 미만
const lenLL = (line) => line.reduce((s, p, i) => (i ? s + Math.hypot(toM(p)[0] - toM(line[i - 1])[0], toM(p)[1] - toM(line[i - 1])[1]) : 0), 0);
const SIDO_DEG8 = { E: 0, NE: 45, N: 90, NW: 135, W: 180, SW: -135, S: -90, SE: -45 };
/**
 * 시·도마다 바닷가(전국 위상 T1 의 시·도 층에서 다른 시·도와 함께 쓰지 않는 호 = 바다·북한과 닿은 선. 휴전선 구간 context.json nkCorridor 상자 안은 북한과 맞닿은 땅이라 뺀다)를
 * 이름표 점에서 본 8방위(±60도, 겹쳐 셈)마다 길이(m)로. 섬의 바닷가도 든다
 */
function sidoCoasts() {
  const out = {};
  const inNk = inNkBox;   // 휴전선 상자 목록(5(이어서) 북한 땅)
  for (const s of SIDO) {
    const id = SIDO_KEY(s.code), [lx, ly] = [SIDO_M.labels[id][0] * KX, SIDO_M.labels[id][1] * KY];
    const ext = topo.mesh(T1, T1.objects.sido, (a, b) => a === b && a.properties.sido === s.code);
    const sec = Object.fromEntries(Object.keys(SIDO_DEG8).map((d) => [d, 0]));
    let total = 0, nk = 0;
    for (const line of ext.coordinates) for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const len = Math.hypot((a[0] - b[0]) * KX, (a[1] - b[1]) * KY);
      if (inNk(mid)) { nk += len; continue; }
      total += len;
      const deg = Math.atan2(mid[1] * KY - ly, mid[0] * KX - lx) * 180 / Math.PI;
      for (const [d, dd] of Object.entries(SIDO_DEG8)) if (Math.abs(((deg - dd + 540) % 360) - 180) <= 60) sec[d] += len;
    }
    out[id] = { total, nk, sec };
  }
  return out;
}
function koreaLive() {
  const src = UNITS.korea;
  const bad = (m) => fail(`시·도 단원(korea): ${m}`);
  const ids = SIDO.map((s) => SIDO_KEY(s.code));
  const idOfKo = Object.fromEntries(SIDO.map((s) => [s.ko, SIDO_KEY(s.code)]));
  const koOf = Object.fromEntries(SIDO.map((s) => [SIDO_KEY(s.code), s.ko]));
  const U = levelInput('00', '전국', ids, 'sido');
  const D = Object.fromEntries(U.dongs.map((d) => [d.id, d]));
  // 구성(과·넓은 화면): 이름이 지역 표에 있고, 16곳이 저마다 정확히 하나에
  let ok = true;
  for (const [what, list] of [['과', src.lessons], ['넓은 화면', src.screens]]) {
    const all = list.flatMap((x) => x.items ?? []);
    const unknown = all.filter((n) => !idOfKo[n]), dup = all.filter((n, i) => all.indexOf(n) !== i), missing = SIDO.filter((s) => !all.includes(s.ko)).map((s) => s.ko);
    if (unknown.length || dup.length || missing.length) { ok = false; bad(`${what} 구성 — 지역 표에 없는 이름 ${unknown.join('·') || '없음'} · 둘 이상에 든 곳 ${dup.join('·') || '없음'} · 빠진 곳 ${missing.join('·') || '없음'}`); }
  }
  if (src.lessons.some((l, i) => l.no !== i + 1)) { ok = false; bad('과 번호가 1부터 차례대로가 아님'); }
  if (!ok) return null;
  // 이름(N7): 지도 검사 문맥 = 그 과(화면)의 넓이 중심과 16 시·도 전체·나머지 시·도의 넓이 중심, 전체 등가 반지름
  const nameSeen = [];   // 보고용: 이름마다 나머지 시·도에서 본 넓이 중심 각도(동쪽 0°, 북쪽 90°)와 전체 가운데까지 거리(등가 반지름 배)
  const nameCheck = (what, title, lids) => {
    if (!title || title.length > 12) bad(`${what} 이름 '${title}'이 비었거나 12자를 넘음(N7)`);
    for (const w of HARD_WORDS) if (title.includes(w)) bad(`${what} 이름 '${title}'에 금지 낱말 '${w}'`);
    if (/권역|도심/.test(title)) bad(`${what} 이름 '${title}'에 행정 권역 용어(N7)`);
    const ctx = titleCtx(lids, ids, D), why = checkTitle(title, ctx);
    if (why.length) bad(`${what} 이름 '${title}' 지도 검사 — ${why.join(' / ')}`);
    nameSeen.push(`${title} ${(Math.atan2(ctx.at[1] - ctx.rest[1], ctx.at[0] - ctx.rest[0]) * 180 / Math.PI).toFixed(0)}°·${(Math.hypot(ctx.at[0] - ctx.base[0], ctx.at[1] - ctx.base[1]) / ctx.r).toFixed(2)}`);
    return why;
  };
  // 칸 크기: emd-lib tap(build-geo screen() 과 같은 계산 — 상자를 휴대폰 지도 칸에 맞췄을 때 곳마다 내접원 지름)
  const sizeOf = (what, lids, kind, phone) => {
    const t = tap(lids, D, kind, phone);
    if (t.min < TAP_FAIL) bad(`${what}: 가장 작은 칸 ${koOf[t.at]} 지름 ${t.min}px (<${TAP_FAIL})`);
    return { fit: llOfN(t.box), minTapPx: t.min, ambiguous: t.ambiguous };
  };
  const lessons = src.lessons.map((l) => {
    const lids = l.items.map((n) => idOfKo[n]);
    nameCheck(`${l.no}과`, l.title, lids);
    return { no: l.no, title: l.title, ...(l.en ? { en: l.en } : {}), items: lids, ...sizeOf(`${l.no}과 ${l.title}`, lids, 'main', PHONE) };
  });
  const screens = src.screens.map((s) => {
    const sids = s.items.map((n) => idOfKo[n]);
    if (!/^[a-z0-9-]{1,20}$/.test(s.key ?? '')) bad(`넓은 화면 key '${s.key}' 모양이 아님`);
    if (src.screens.length > 1) nameCheck(`넓은 화면 ${s.key}`, s.ko, sids);
    return { key: s.key, ko: s.ko, en: s.en ?? '', items: sids, ...sizeOf(`넓은 화면 ${s.ko}`, sids, 'near', PHONE_WIDE) };
  });
  for (const [what, list, k] of [['과', lessons, 'title'], ['넓은 화면', screens, 'ko'], ['넓은 화면', screens, 'key']]) if (new Set(list.map((x) => x[k])).size !== list.length) bad(`${what} ${k} 가 겹침`);
  const small = [1, 2, 3].map((n) => lessons.filter((l) => l.items.length === n).length);
  if (small[0]) bad(`1곳 과 ${small[0]}개`);
  note(`시·도 단원(korea): 16곳 · 과 ${lessons.length}(${lessons.map((l) => `${l.title} ${l.items.length}`).join('·')}) · 1·2·3곳 과 ${small.join('·')} · 과 최소 칸 ${Math.min(...lessons.map((l) => l.minTapPx))}px · 모호 칸 과 ${lessons.reduce((t, l) => t + l.ambiguous.length, 0)}`
    + ` · 넓은 화면 ${screens.length}개(${screens.map((s) => `${s.ko} ${s.items.length}곳 ${s.minTapPx}px`).join('·')}) · 모호 칸 넓은 화면 ${screens.reduce((t, s) => t + s.ambiguous.length, 0)}`
    + ` · 이름 지도 검사(각도·가운데 거리) ${nameSeen.join(' / ')}`);
  // 위치 한 줄(N27): 지도로 잴 수 있는 근거만. touch(맞닿은 시·도 — 전국 위상 시·도 이웃) · dir([기준 시·도, 방위] — 이름표 점 ±60도) ·
  // side([방위, edge|part] — 16곳 가운데 그쪽 3위 안 · 절반 안) · size(smallest·largest = 넓이 1위, small = 작은 쪽 5위 안, big = 넓은 쪽 절반) ·
  // coast(['E'…] — 이름표 점에서 그 방향 ±60도 바닷가 10km 이상, 'none' — 바닷가 1km 미만, 'most' — 바닷가가 16곳 가운데 가장 김) ·
  // onlyDo(이름이 '도'로 끝나는 시·도 가운데 바닷가가 없는 곳이 여기 하나뿐) · around(그 시·도 둘레의 80% 이상을 이곳과 함께 씀 — '서울을 둘러싼') ·
  // island(땅으로 맞닿은 시·도가 없음) · isles([점검 좌표 이름] — pipeline/data/probes.json 의 그 섬 점검이 통과하고 이 시·도의 섬이며, 점검 점이 이 곳이 든 과 범위 안)
  const lines = LINES.korea ?? {};
  const coasts = sidoCoasts();
  for (const n of Object.keys(lines)) if (!n.startsWith('_') && !idOfKo[n]) bad(`위치 한 줄: 지역 표에 없는 이름 ${n}`);
  const lp = (id) => [D[id].x, D[id].y];
  const areaRank = [...ids].sort((a, b) => D[b].area - D[a].area);
  const coastRank = [...ids].sort((a, b) => coasts[b].total - coasts[a].total);
  const perim = (id) => topo.mesh(T1, { type: 'GeometryCollection', geometries: [geomOf.sido.get(id)] }).coordinates.reduce((t, l) => t + lenLL(l), 0);
  const shared = (a, b) => topo.mesh(T1, { type: 'GeometryCollection', geometries: [geomOf.sido.get(a), geomOf.sido.get(b)] }, (p, q) => p !== q).coordinates.reduce((t, l) => t + lenLL(l), 0);
  const isDo = (id) => SIDO_BY_CODE[id.slice(8)].full.endsWith('도');
  const lineOf = {}, aroundSeen = [];
  for (const id of ids) {
    const e = lines[koOf[id]], where = `전국 ${koOf[id]}`;
    if (!e) { bad(`위치 한 줄 없음: ${where}`); continue; }
    const no = (m) => bad(`위치 한 줄 ${m}(${where})`);
    if (e.line.length > LINE_MAX) no(`${e.line.length}자(>${LINE_MAX})`);
    for (const w of HARD_WORDS) if (e.line.includes(w)) no(`금지 낱말 '${w}'`);
    if (e.at) no('명소(at)는 OSM 대조 허락 뒤에만(N27)');
    for (const n of e.touch || []) if (!idOfKo[n] || !(sidoNb[id] || []).includes(idOfKo[n])) no(`맞닿음 '${n}': 이웃이 아님`);
    if (e.dir) {
      const [base, d] = e.dir, b = idOfKo[base];
      if (!b || !(d in SIDO_DEG8)) no(`방향 근거 모양이 틀림 ${JSON.stringify(e.dir)}`);
      else { const deg = Math.atan2(lp(id)[1] - lp(b)[1], lp(id)[0] - lp(b)[0]) * 180 / Math.PI; if (Math.abs(((deg - SIDO_DEG8[d] + 540) % 360) - 180) > 60) no(`방향: ${base}의 ${d}가 아님(${deg.toFixed(0)}°)`); }
    }
    if (e.side) {
      const [d, kind] = e.side, a = SIDO_DEG8[d] * Math.PI / 180;
      const order = [...ids].sort((p, q) => (lp(q)[0] * Math.cos(a) + lp(q)[1] * Math.sin(a)) - (lp(p)[0] * Math.cos(a) + lp(p)[1] * Math.sin(a)));
      const rank = order.indexOf(id) + 1;
      if (rank > (kind === 'edge' ? 3 : Math.ceil(ids.length / 2))) no(`'${d}${kind === 'edge' ? ' 끝' : '쪽'}': 16곳 중 ${rank}번째`);
    }
    if (e.size) {
      const r = areaRank.indexOf(id) + 1;   // 넓은 차례
      const okSize = { largest: r === 1, smallest: r === ids.length, small: r > ids.length - 5, big: r <= ids.length / 2 }[e.size];
      if (!okSize) no(`크기 '${e.size}': 넓은 차례 16곳 중 ${r}번째`);
    }
    if (e.coast) {
      const c = coasts[id];
      if (e.coast === 'none') { if (c.total >= COAST_NONE_M) no(`'바다에 닿지 않음': 바닷가 ${(c.total / 1000).toFixed(1)}km`); }
      else if (e.coast === 'most') { if (coastRank[0] !== id) no(`'바닷가가 가장 김': 가장 긴 곳은 ${koOf[coastRank[0]]}`); }
      else for (const d of e.coast) if (!(c.sec[d] >= COAST_MIN_M)) no(`'${d}쪽 바다': 그 방향 바닷가 ${((c.sec[d] ?? 0) / 1000).toFixed(1)}km(<${COAST_MIN_M / 1000})`);
    }
    if (e.onlyDo && (coasts[id].total >= COAST_NONE_M || !isDo(id) || ids.some((o) => o !== id && isDo(o) && coasts[o].total < COAST_NONE_M))) no("'바다에 닿지 않은 하나뿐인 도'가 아님");
    if (e.around) {
      const b = idOfKo[e.around], k = b ? shared(id, b) / perim(b) : 0;
      if (k < 0.8) no(`'${e.around}을 둘러싼': ${e.around} 둘레 가운데 ${(k * 100).toFixed(0)}%만 맞닿음(80% 미만)`);
      aroundSeen.push(`${koOf[id]} — ${e.around} 둘레의 ${(k * 100).toFixed(0)}%`);
    }
    if (e.island && (sidoNb[id] || []).length) no('섬: 땅으로 맞닿은 시·도가 있음');
    // 섬 이름은 그 곳이 든 과 지도(만나기 카드가 뜨는 화면)에 보여야 한다: 점검 점이 과 범위(fit — 앱이 어느 폭에서나 다 보이게 맞추는 상자) 안.
    // korea 과에는 섬 상자(insets)가 없다. E10 검수: 3과 범위 밖의 울릉도·독도, 5과 범위 밖의 마라도를 가리키던 문장이 지났다
    const lessonOf = lessons.find((l) => l.items.includes(id));
    for (const n of e.isles || []) {
      const p = probeResults.find((x) => x.name === n);
      if (!p || !p.ok || p.sido !== id.slice(8)) no(`섬 '${n}': 점검 좌표가 없거나 통과하지 않았거나 다른 시·도`);
      else if (lessonOf && !(p.lon >= lessonOf.fit[0] && p.lon <= lessonOf.fit[2] && p.lat >= lessonOf.fit[1] && p.lat <= lessonOf.fit[3])) no(`섬 '${n}': ${lessonOf.no}과 지도 범위 밖(점검 점 ${p.lon}, ${p.lat})`);
    }
    lineOf[id] = e.line;
  }
  note(`시·도 단원(korea) 위치 한 줄 ${Object.keys(lineOf).length}곳: 길이·금지 낱말·맞닿음·방향·끝·크기·바닷가·둘러쌈·섬 검사`
    + ` · 바닷가(km) ${ids.map((id) => `${koOf[id]} ${(coasts[id].total / 1000).toFixed(0)}`).join(' ')} · 둘러쌈 ${aroundSeen.join(', ') || '없음'}`);
  // 단원 범위: 시·도 덩어리 전부(독도·백령도까지)
  const q = boxUnion(ids, 'all', SIDO_M.bbox), [w, n] = toLL([q[0], q[1]]), [e2, s2] = toLL([q[2], q[3]]);
  return { key: 'korea', sido: '00', ko: '전국', full: '대한민국', en: 'Korea', layer: 'sido', fit: [w, s2, e2, n].map((v) => Math.round(v * 1e4) / 1e4),
    items: SIDO.map((s) => ({ id: SIDO_KEY(s.code), ko: s.ko, slug: s.key, line: lineOf[SIDO_KEY(s.code)] ?? '' })).sort((a, b) => a.ko.localeCompare(b.ko, 'ko')),
    lessons, screens,
    labels: Object.fromEntries(ids.map((id) => [id, SIDO_M.labels[id]])), neighbors: Object.fromEntries(ids.map((id) => [id, sidoNb[id] ?? []])) };
}
if (SIDO_KOREA.status === 'live') KOREA = koreaLive();
if (PREVIEW && previewIssues.length) { console.log(`  미리보기 지역 검사 실패(보고만) ${previewIssues.length}건`); for (const m of previewIssues) console.log('    ' + m); }
// 앱에 싣는 지역: 공개 지역 + (미리보기면) 임시 과 지역. 이름표·이웃 내보내기와 지역 경계 파일이 이것을 본다(정적 쪽 SVG·검색 이름은 공개 지역만)
const OPEN_REGIONS = [...REGIONS, ...PREVIEW_REGIONS];
const OPEN_CODES = new Set(OPEN_REGIONS.map((r) => r.sido));
const isOpenId = (id) => OPEN_CODES.has(sidoOfId(id));

// 원자료 확인: adm_cd2 앞 5자리 = 시·군·구 코드(동 slug 가 단원 안에서 겹치지 않는 근거)
for (const f of L.emd.features) if (f.properties.code.slice(0, 5) !== f.properties.sgg) failAt(f.properties.sido, `행정동 코드 ${f.properties.code} 의 앞 5자리가 시·군·구 ${f.properties.sgg} 와 다름`);
// 읍·면·동 영어 이름 손 표(설계안 3.4): 원자료의 모든 동이 같은 코드·같은 한글로 표에 있고, 표에는 원자료에 없는 코드가 없다(행정동 개편이 검수 없이 지나가지 않게)
{
  const codes = new Set(L.emd.features.map((f) => f.properties.code));
  for (const f of L.emd.features) {
    const p = f.properties, e = EMD_EN[p.code];
    if (!e) failAt(p.sido, `동 영어 이름 표에 없음 ${p.code} ${p.name} — ${EMD_EN_AGAIN}`);
    else if (e[0] !== p.name) failAt(p.sido, `동 영어 이름 표의 한글 '${e[0]}' 가 원자료 '${p.name}'(${p.code})와 다름 — ${EMD_EN_AGAIN}`);
    else if (!e[1] || HANGUL.test(e[1])) failAt(p.sido, `동 영어 이름이 비었거나 한글 ${p.code} ${p.name} '${e[1]}' — ${EMD_EN_AGAIN}`);
  }
  const extra = Object.keys(EMD_EN).filter((c) => !codes.has(c));
  if (extra.length) fail(`동 영어 이름 표에 원자료에 없는 코드 ${extra.length}곳(${extra.slice(0, 5).join(', ')}) — ${EMD_EN_AGAIN}`);
  // 이웃 땅 이름(동 단원 지도 topo out): 공개 지역의 모든 시·군·구(일반구 단위)와 나라 밖 땅이 영어 이름을 갖는다 — 단원 지도에 어느 이웃이 들든 비지 않게
  for (const f of L.sgg.features) if (isLiveId(f.properties.sggId)) { const en = sggEn(f.properties.sggId); if (!en || HANGUL.test(en)) fail(`이웃 땅 영어 이름 없음 ${f.properties.sggName}(${f.properties.sggId}) '${en}'`); }
}
// 검사할 단원: 공개 지역 가운데 emd live(--preview 면 공개 지역 전부). emd 가 꺼진 지역의 실패(미리보기)는 보고만 한다
const emdLive = (R) => SIDO_BY_CODE[R.sido].emd === 'live';
// 미리보기(E8)는 임시 과 지역(PREVIEW_REGIONS)의 동 단원도 쓴다 — 과 없는 지역(세종·제주)은 동 단원이 주 단원이라 미리보기 화면에 꼭 있어야 한다
const EMD_REGIONS = OPEN_REGIONS.filter((R) => emdLive(R) || PREVIEW);
const emdIndex = {};      // units.json emdUnits: 지역 key → 단원 색인(N17)
const emdUnitFiles = [];  // [시·군·구 id, 지역] — 내보내기에서 단원 파일 두 개씩
const emdIssues = [];     // --preview 에서 emd 가 꺼진 지역의 검사 실패(보고만)
const nEn = { items: 0, lessons: 0, screens: 0 };   // 보고용: 영어 이름을 쓴 곳·과·화면 수
for (const R of EMD_REGIONS) {
  const failE = (m) => (emdLive(R) ? fail(m) : emdIssues.push(`${R.ko}: ${m}`));
  const list = [], slugs = new Set();
  let nLessons = 0, minTap = Infinity, small = [0, 0, 0];
  // 공통 완료 조건 2: 넓은 화면 최소 칸과 모호(16~24px) 칸 수도 시·군·구 줄과 같은 모양으로 남긴다(E6 검수)
  let nScreens = 0, screenMinTap = Infinity, ambLessons = 0, ambScreens = 0;
  const ambUnits = [];   // 모호 칸이 있는 단원 [이름, 과 칸, 화면 칸]
  for (const sggId of sggIdsOfSido(R.sido)) {
    const { U, res } = unitOf(sggId);
    const { slug } = unitNames(R, sggId);
    if (!slug || !/^[a-z0-9-]{2,40}$/.test(slug)) failE(`동 단원 ${U.ko}: 단원 slug 없음(${slug}) — pipeline/data/gu-slugs.json 또는 units.json slugs`);
    else if (slugs.has(slug)) failE(`동 단원 ${U.ko}: 단원 slug 겹침 ${slug}`);
    slugs.add(slug);
    for (const p of res.problems) failE(`동 단원 ${U.ko}: ${p.msg}`);
    const ids = U.dongs.map((d) => d.code.slice(5));
    if (new Set(ids).size !== ids.length) failE(`동 단원 ${U.ko}: 동 slug 겹침`);
    const j = unitJson(sggId, R);
    // 영어 이름(설계안 10.2 의 2 — 판 전수): 단원·곳·과·화면 en 이 비지 않고 한글이 없고, 과 영어 이름이 단원 안에서 겹치지 않는다
    for (const [what, v] of [['단원', j.en], ...j.items.map((it) => [it.ko, it.en]), ...j.lessons.map((l) => [`${l.no}과 '${l.title}'`, l.en]), ...j.screens.map((s) => [`화면 '${s.ko}'`, s.en])]) {
      if (!v || HANGUL.test(v)) failE(`동 단원 ${U.ko}: 영어 이름이 비었거나 한글 — ${what} '${v}'(곳은 pipeline/data/emd-en.json, 과·화면은 낱말 표 EN_WORDS)`);
    }
    if (new Set(j.lessons.map((l) => l.en)).size !== j.lessons.length) failE(`동 단원 ${U.ko}: 과 영어 이름 겹침`);
    nEn.items += j.items.length; nEn.lessons += j.lessons.length; nEn.screens += j.screens.length;
    list.push({ code: U.code, ko: U.ko, slug, n: U.dongs.length, lessons: res.lessons.length, ...(j.si ? { si: j.si } : {}), ids: j.items.map((it) => it.slug) });
    emdUnitFiles.push([sggId, R]);
    nLessons += res.lessons.length; minTap = Math.min(minTap, res.stats.minTapPx);
    small = small.map((v, i) => v + res.stats.small[i]);
    nScreens += res.stats.screens; screenMinTap = Math.min(screenMinTap, res.stats.screenMinTapPx);
    ambLessons += res.stats.ambiguous; ambScreens += res.stats.screenAmbiguous;
    if (res.stats.ambiguous + res.stats.screenAmbiguous) ambUnits.push([U.ko, res.stats.ambiguous, res.stats.screenAmbiguous]);
  }
  emdIndex[R.key] = list;
  note(`동 단원(${R.ko}${emdLive(R) ? '' : ', 미리보기'}): ${list.length}단원 ${list.reduce((t, u) => t + u.n, 0)}동 · 과 ${nLessons} · 1·2·3곳 과 ${small.join('·')} · 과 최소 칸 ${minTap}px`
    + ` · 넓은 화면 ${nScreens}개 최소 ${screenMinTap}px · 모호 칸 과 ${ambLessons} · 넓은 화면 ${ambScreens}`
    + (ambUnits.length ? ` (모호 칸 많은 단원: ${ambUnits.sort((x, y) => y[1] + y[2] - x[1] - x[2]).slice(0, 5).map(([n, l, v]) => `${n} 과 ${l}·화면 ${v}`).join(' · ')})` : ''));
}
// 시험용 단원(tests/fixtures/emd, 계획서 E3): 종로(작은 단원)·중랑(가족 16곳)·노원(상계 8 가족)·옹진(먼 섬)·증평(2곳)·
// 검단(인천 2과 — E4 '인천 동 공부 뒤 홈은 그 단원 다음 과' 시험). 공개 여부와 상관없이 만든다.
// E13 검수: 증평이 공개 지역(충북)이 되어 '공개하지 않은 시·도의 단원 키는 slug 대신 코드' 규칙을 보는 시험용 단원이 없어졌다 —
// 광주 동구(전남광주, E16 까지 코드 키)와 울릉군(경북 — 3곳 단원·통째로 먼 섬, E14 까지 코드 키)을 더한다
const FIXTURE_UNITS = ['kr:sgg:11110', 'kr:sgg:11260', 'kr:sgg:11350', 'kr:sgg:28290', 'kr:sgg:28720', 'kr:sgg:43745', 'kr:sgg:12210', 'kr:sgg:47940'];
for (const id of FIXTURE_UNITS) if (!emdOfSgg.has(id)) fail(`시험용 단원 ${id} 가 원자료에 없음`);
if (emdIssues.length) { console.log(`  동 단원 미리보기 검사 실패(보고만, 동이 꺼진 지역) ${emdIssues.length}건`); for (const m of emdIssues) console.log('    ' + m); }
if (EMD_REGIONS.length) note(`동 단원 영어 이름(설계안 3.4·7.2): 곳 ${nEn.items} · 과 ${nEn.lessons} · 화면 ${nEn.screens} — 손 표 pipeline/data/emd-en.json ${Object.keys(EMD_EN).length}곳, 낱말 표 ${Object.keys(EN_WORDS).length}가지`);
tick('12 동 단원 묶기');

/* ---------- 12(이어서) 일반구 단원(계획서 N5 · N30 · E7): 시 층 지역(경기)의 일반구 전부를 한 단원('{지역}/gu', 층 sgg)으로 ---------- */
// 과 = 시 하나. 일반구가 3곳 미만인 시는 맞닿은 시와 합친다(같이 작은 시 먼저, 합쳐 7곳 안 — 경기 안양시 2 + 안산시 2).
// 과 차례는 그 지역 과(시 층)에 시가 나오는 차례, 과 이름은 시 이름('수원시', '안양시·안산시' — 계획서 N7 대표 지명).
// 곳 = 일반구(숙달 키 kr:sgg:{일반구 코드} — 기존 형식 그대로, N15). 곳 이름은 '장안구'(과 이름이 시라 반복하지 않음), full 은 '수원시 장안구'(단원이 섞이는
// 화면 — 오늘 복습 등, N12), si 는 시 층 id(지역 지도에서 그 일반구가 든 칸), slug 는 일반구 동 단원과 같은 '{시 slug}-{구 slug}'.
// 넓은 화면은 지역 넓은 화면(경기 북서부·북동부·남서부·남동부)마다 그 안의 일반구. 16px 이 안 되면 긴 축으로 반씩 나눈다.
// 위치 한 줄(N27 — 지도로 잴 수 있는 근거만): '{시} {방위}' + 맞닿은 다른 시·군·구(함께 쓰는 경계가 긴 차례로 둘 + '등').
// 방위는 동 만나기와 같은 9칸(emd-lib dirIn — 그 시 일반구들의 가장 큰 덩어리 상자에서 본 이름표 점의 칸, 가운데 칸이면 '가운데')이고,
// 과 이름과 같은 지도 검사(emd-lib checkTitle — 넓이 중심을 같은 시 나머지 구와 견줌)를 지나야 쓴다. 걸리면 넓이 중심 8방위 → '가운데' 차례로 바꾸고,
// 다 걸리면 빌드가 실패한다(E7 검수: 이름표 점 평균에서 재면 작은 동탄구·병점구가 평균을 끌어 화성시 효행구가 '북서쪽'이 됐다).
// 경계는 새로 만들지 않는다(앱이 지역 -sgg 파일의 sgg 층을 쓴다, N5). 영어 앱은 units.json enNames 가 있을 때 등록한다(영어 동 공부 설계안 5.1 — 전에는 N26 으로 등록하지 않음).
// 영어 곳 이름은 앱이 slug 로 만든다('Jangan-gu' — 설계안 4절)
const guIndex = {};   // units.json guUnits: 지역 key → 일반구 단원(Region 모양)
const GU_REGIONS = REGIONS.filter((R) => SIDO_BY_CODE[R.sido].gu === 'live');
const DIR8 = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];
const DIR8_KO = { E: '동쪽', NE: '북동쪽', N: '북쪽', NW: '북서쪽', W: '서쪽', SW: '남서쪽', S: '남쪽', SE: '남동쪽' };   // 앱 text/ko.ts DIR_KO 와 같음
const hasJong = (w) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return c >= 0 && c < 11172 && c % 28 > 0; };
/** 칸 크기(지역 과 화면 검사 screen() 과 같은 계산): 상자를 휴대폰 지도 칸에 맞췄을 때 가장 작은 내접원 지름 */
const tapOf = (lids, kind, phone) => {
  const b = boxUnion(lids, kind);
  const w = b[2] - b[0], h = b[3] - b[1], p = Math.max(w, h) * phone.pad;
  const k = Math.min(phone.w / (w + 2 * p), phone.h / (h + 2 * p));
  const sizes = lids.map((id) => ({ id, d: Math.round(2 * labels[id][2] * k) }));
  const min = sizes.reduce((a, s) => (s.d < a.d ? s : a));
  return { fit: unionLL(lids, kind), minTapPx: min.d, at: min.id, ambiguous: sizes.filter((s) => s.d < TAP_AMBIG).map((s) => s.id), box: b };
};
for (const R of GU_REGIONS) {
  const u = units.find((v) => v.key === R.key);
  const guIds = L.sgg.features.filter((f) => f.properties.sido === R.sido && f.properties.sggId !== f.properties.siId).map((f) => f.properties.sggId).sort();
  if (guIds.length < 3) { fail(`${R.ko} 일반구 단원: 일반구 ${guIds.length}곳 — 3곳 이상인 지역에서만 만든다(N5)`); continue; }
  const bySi = new Map();
  for (const id of guIds) { const si = sggToSi[id]; if (!bySi.has(si)) bySi.set(si, []); bySi.get(si).push(id); }
  const siOrder = u.lessons.flatMap((l) => l.items);
  let groups = [...bySi.keys()].sort((a, b) => siOrder.indexOf(a) - siOrder.indexOf(b)).map((si) => [si]);
  const sizeOf = (g) => g.reduce((t, si) => t + bySi.get(si).length, 0);
  const touchSi = (g, h) => g.some((a) => h.some((b) => (neighbors.si[a] || []).includes(b)));
  for (const g of [...groups]) {
    if (!groups.includes(g) || sizeOf(g) >= 3) continue;
    const h = groups.filter((x) => x !== g && touchSi(g, x) && sizeOf(g) + sizeOf(x) <= 7)
      .sort((a, b) => Number(sizeOf(a) >= 3) - Number(sizeOf(b) >= 3) || sizeOf(a) - sizeOf(b) || groups.indexOf(a) - groups.indexOf(b))[0];
    if (!h) continue;   // 합칠 시가 없으면 그대로(아래 보고의 2곳 과)
    const at = Math.min(groups.indexOf(g), groups.indexOf(h));
    const merged = [...g, ...h].sort((a, b) => siOrder.indexOf(a) - siOrder.indexOf(b));
    groups = groups.filter((x) => x !== g && x !== h);
    groups.splice(at, 0, merged);
  }
  // 영어 이름(설계안 4절): 단원 '{지역 영어} city districts', 과·화면은 든 시의 영어 이름('Bucheon-si' · 'Ansan-si and Anyang-si' · 'A, B and C')
  const guEn = `${R.en} city districts`;
  const siEn = (si) => (R.slugs[siNameOf[si]] ? cap(R.slugs[siNameOf[si]]) : '');
  const andEn = (list) => (list.length < 3 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);
  const guLessons = groups.map((g, i) => {
    const ids = g.flatMap((si) => bySi.get(si));
    const title = g.map((si) => siNameOf[si]).join('·');
    const t = tapOf(ids, 'main', PHONE);
    if (t.minTapPx < TAP_FAIL) fail(`${R.ko} 일반구 단원 ${i + 1}과 ${title}: 가장 작은 칸 ${t.at} 지름 ${t.minTapPx}px (<${TAP_FAIL})`);
    if (title.length > 12) fail(`${R.ko} 일반구 단원 ${i + 1}과 이름 '${title}'이 12자를 넘음(N7)`);
    return { no: i + 1, title, en: andEn(g.map(siEn)), items: ids, fit: t.fit, minTapPx: t.minTapPx, ambiguous: t.ambiguous };
  });
  // 넓은 화면(전체 연습·시험): 단원 전체가 한 화면에서 16px 이면 하나. 아니면 과(시) 하나씩에서 시작해, 합쳐도 16px 인 동안 작은 덩어리부터
  // 가장 작은(같으면 이름표 점이 가까운) 덩어리와 합친다(동 단원 넓은 화면 다시 합치기와 같은 방식). 화면 이름은 든 과 이름('부천시·안산시·안양시')
  const cen = (ids) => [0, 1].map((k) => ids.reduce((t, id) => t + labels[id][k], 0) / ids.length);
  // si = 화면에 든 시(영어 이름용, 과 차례). 단원 전체 한 화면이면 null(화면 영어 이름 = 단원 영어 이름)
  let parts = tapOf(guIds, 'near', PHONE_WIDE).minTapPx >= TAP_FAIL ? [{ ids: [...guIds], names: [`${R.ko} 일반구`], si: null }] : guLessons.map((l, i) => ({ ids: [...l.items], names: [l.title], si: [...groups[i]] }));
  for (let again = parts.length > 1; again;) {
    again = false;
    for (const A of [...parts].sort((a, b) => a.ids.length - b.ids.length)) {
      const cA = cen(A.ids);
      const B = parts.filter((S) => S !== A && tapOf([...S.ids, ...A.ids], 'near', PHONE_WIDE).minTapPx >= TAP_FAIL)
        .sort((a, b) => a.ids.length - b.ids.length || Math.hypot(cen(a.ids)[0] - cA[0], cen(a.ids)[1] - cA[1]) - Math.hypot(cen(b.ids)[0] - cA[0], cen(b.ids)[1] - cA[1]))[0];
      if (!B) continue;
      const lo = parts.indexOf(A) < parts.indexOf(B) ? A : B, hi = lo === A ? B : A;   // 과 차례가 앞인 덩어리 자리에 둔다
      lo.ids = [...lo.ids, ...hi.ids]; lo.names = [...lo.names, ...hi.names]; lo.si = [...lo.si, ...hi.si];
      parts = parts.filter((S) => S !== hi);
      again = true;
      break;
    }
  }
  const guScreens = parts.map((p, i) => {
    const t = tapOf(p.ids, 'near', PHONE_WIDE), ko = p.names.join('·');
    if (t.minTapPx < TAP_FAIL) fail(`${R.ko} 일반구 단원 넓은 화면 ${ko}: 가장 작은 칸 ${t.at} 지름 ${t.minTapPx}px (<${TAP_FAIL})`);
    return { key: parts.length > 1 ? `s${i + 1}` : 'all', ko, en: p.si ? andEn(p.si.map(siEn)) : guEn, items: p.ids, fit: t.fit, minTapPx: t.minTapPx, ambiguous: t.ambiguous };
  });
  for (const si of bySi.keys()) if (!siEn(si)) fail(`${R.ko} 일반구 단원: ${siNameOf[si]} 영어 이름(units.json slugs) 없음`);
  for (const [what, v] of [['단원', guEn], ...guLessons.map((l) => [`${l.no}과 '${l.title}'`, l.en]), ...guScreens.map((s) => [`화면 '${s.ko}'`, s.en])]) {
    if (!v || HANGUL.test(v) || /undefined/.test(v)) fail(`${R.ko} 일반구 단원: 영어 이름이 비었거나 한글 — ${what} '${v}'`);
  }
  // 위치 한 줄. 맞닿은 곳은 함께 쓰는 경계가 긴 차례(전국 위상 T1 의 sgg 층에서 두 칸이 함께 쓰는 호의 길이, 미터)
  const lenM = (line) => line.reduce((s, p, i) => (i ? s + Math.hypot(toM(p)[0] - toM(line[i - 1])[0], toM(p)[1] - toM(line[i - 1])[1]) : 0), 0);
  const shared = (a, b) => topo.mesh(T1, { type: 'GeometryCollection', geometries: [geomOf.sgg.get(a), geomOf.sgg.get(b)] }, (p, q) => p !== q).coordinates.reduce((t, l) => t + lenM(l), 0);
  // 방위 근거: 넓이 중심(먼 섬 덩어리 뺌, 북쪽이 위인 미터)과 넓이 — 지도 검사(checkTitle)의 독립 기준
  const AC = Object.fromEntries(guIds.map((id) => [id, areaCenter(L.sgg.features.find((f) => f.properties.sggId === id))]));
  const wsum = (ids) => ids.reduce((t, id) => t + AC[id].a, 0);
  const wc = (ids) => [0, 1].map((k) => ids.reduce((t, id) => t + AC[id].c[k] * AC[id].a, 0) / wsum(ids));
  // 지도 검사 문맥(emd-lib titleCtx 와 같은 모양): 그 구의 넓이 중심과 같은 시 나머지 구들·시 전체의 넓이 중심, 시 등가 반지름
  const ctxOf = (id) => { const mates = bySi.get(sggToSi[id]); return { at: AC[id].c, base: wc(mates), rest: wc(mates.filter((o) => o !== id)), r: Math.sqrt(wsum(mates) / Math.PI), allOuter: false }; };
  const word = (d) => (d === 'C' ? '가운데' : DIR8_KO[d]);
  const DEG8 = { E: 0, NE: 45, N: 90, NW: 135, W: 180, SW: -135, S: -90, SE: -45 };
  const at8 = (deg) => DIR8[((Math.round(deg / 45) % 8) + 8) % 8];
  // 시마다 9칸 방위를 동 과 이름과 같은 이름 정하기(emd-lib resolveNames)에 넣는다. 지도 검사에 걸리면 후보로 바꾸는데, 9칸에서 덜 벗어나는 차례다:
  // 9칸 옆 방위 둘(넓이 중심 쪽에 가까운 것 먼저 — 고양시 덕양구 9칸 남쪽 → 남동쪽) → 넓이 중심 8방위 → '가운데'. 그리고
  // 같은 시 안에서 방위가 겹치면 그 방위로 더 멀리 나간 구는 그대로, 나머지는 그 구에서 본 상대 방위로 고친다(용인시 기흥구·수지구가 9칸으로는 모두 북서쪽).
  // 그래도 검사에 걸리거나 겹쳐 동 이름을 붙여야 하면('· ○○ 둘레') 빌드가 실패한다
  const GD = Object.fromEntries(guIds.map((id) => [id, { x: labels[id][0] * KX, y: labels[id][1] * KY, area: AC[id].a, ko: sggNameOf[id] }]));
  const guDir = {};   // 보고·시험용: 곳 id → { nine(9칸), use(쓴 방위), title }
  for (const [, mates] of bySi) {
    const ref = { box: boxN(boxUnion(mates, 'main')) };
    const cU = [0, 1].map((k) => mates.reduce((t, id) => t + [GD[id].x, GD[id].y][k], 0) / mates.length);
    const list = mates.map((id) => {
      const nine = dirIn([GD[id].x, GD[id].y], ref), ctx = ctxOf(id);
      const deg = Math.atan2(ctx.at[1] - ctx.rest[1], ctx.at[0] - ctx.rest[0]) * 180 / Math.PI, byArea = at8(deg);
      const off = (d) => Math.abs(((DEG8[d] - deg + 540) % 360) - 180);
      const side = nine !== 'C' ? [at8(DEG8[nine] + 45), at8(DEG8[nine] - 45)].sort((a, b) => off(a) - off(b)) : [];
      const alts = [...new Set([...side, byArea])].filter((d) => d !== nine);
      return { id, ids: [id], dir: nine, nine, alts, fmt: word, cU, title: word(nine) };
    });
    resolveNames(list, GD, (x, t) => !checkTitle(t, ctxOf(x.id)).length);
    for (const x of list) {
      guDir[x.id] = { nine: x.nine, use: x.dir, title: x.title, renamed: x.renamed };
      const why = checkTitle(x.title, ctxOf(x.id));
      if (x.suffixed || why.length) fail(`${R.ko} 일반구 단원 위치 한 줄: ${sggNameOf[x.id]} '${x.title}' — ${x.suffixed ? '같은 시 안에서 방위가 겹침' : `지도 검사 ${why.join(' / ')}`}(9칸 ${x.nine})`);
    }
  }
  const dirOfGu = (id) => guDir[id].title;
  const guLine = (id) => {
    const si = sggToSi[id];
    const outs = (neighbors.sgg[id] || []).filter((o) => sggToSi[o] !== si).map((o) => [o, shared(id, o)])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([o]) => o);
    const where = `${siNameOf[si]} ${dirOfGu(id)}`;
    // 다른 시·도의 곳은 시·도 짧은 이름을 붙인다('서울 강서구'). 이름이 이미 시·도 이름으로 시작하면 붙이지 않는다(E13 청주: '세종 세종시' → '세종시', 제주 '제주시'도 같음)
    const nameOf = (o) => { const n = sggNameOf[o], ko = SIDO_BY_CODE[sidoOfId(o)].ko; return sidoOfId(o) === R.sido || n.startsWith(ko) ? n : `${ko} ${n}`; };
    const withNames = (k) => {
      if (!k) return where;
      // 앞 이름과 같은 시·도 머리는 한 번만('서울 강서구·양천구')
      const list = outs.slice(0, k).map(nameOf).map((n, i, a) => { const p = n.split(' ')[0]; return i && sidoOfId(outs[i]) !== R.sido && a[i - 1].startsWith(`${p} `) ? n.slice(p.length + 1) : n; }).join('·');
      const more = outs.length > k ? ' 등' : '';
      const last = (list + more).replace(/\s/g, '');
      return `${where}, ${list}${more}${hasJong(last) ? '과' : '와'} 맞닿은 곳`;
    };
    for (const k of [Math.min(2, outs.length), Math.min(1, outs.length), 0]) { const s = withNames(k); if (s.length <= LINE_MAX) return s; }
    return where;
  };
  const items = guIds.map((id) => {
    const { slug } = unitNames(R, id);
    if (!slug) fail(`${R.ko} 일반구 단원: ${sggNameOf[id]} slug 없음 — pipeline/data/gu-slugs.json`);
    const line = guLine(id);
    for (const w of HARD_WORDS) if (line.includes(w)) fail(`${R.ko} 일반구 단원 위치 한 줄 금지 낱말 '${w}': ${sggNameOf[id]}`);
    return { id, ko: sggNameOf[id].replace(/^\S+\s/, ''), slug, full: sggNameOf[id], si: sggToSi[id], line };
  }).sort((a, b) => a.full.localeCompare(b.full, 'ko'));
  // 검사: 곳마다 정확히 한 과·한 넓은 화면, 과 이름·slug·곳 이름이 겹치지 않음
  for (const [what, list] of [['과', guLessons], ['넓은 화면', guScreens]]) {
    const inAll = list.flatMap((l) => l.items);
    if (inAll.length !== guIds.length || new Set(inAll).size !== guIds.length || guIds.some((id) => !inAll.includes(id))) fail(`${R.ko} 일반구 단원: ${what} 구성이 ${guIds.length}곳과 맞지 않음`);
  }
  for (const k of ['slug', 'ko']) if (new Set(items.map((it) => it[k])).size !== items.length) fail(`${R.ko} 일반구 단원: 곳 ${k} 겹침`);
  if (new Set(guLessons.map((l) => l.title)).size !== guLessons.length) fail(`${R.ko} 일반구 단원: 과 이름 겹침`);
  guIndex[R.key] = { key: `${R.key}/gu`, region: R.key, sido: R.sido, ko: `${R.ko} 일반구`, full: `${R.full} 일반구`, en: guEn, layer: 'sgg', fit: unionLL(guIds, 'near'), items, lessons: guLessons, screens: guScreens };
  const sm = [1, 2, 3].map((n) => guLessons.filter((l) => l.items.length === n).length);
  note(`일반구 단원(${R.ko}): ${guIds.length}곳 · 과 ${guLessons.length}(${guLessons.map((l) => `${l.title} ${l.items.length}`).join('·')}) · 1·2·3곳 과 ${sm.join('·')} · 과 최소 칸 ${Math.min(...guLessons.map((l) => l.minTapPx))}px`
    + ` · 넓은 화면 ${guScreens.length}개(${guScreens.map((s) => `${s.ko} ${s.items.length}곳 ${s.minTapPx}px`).join('·')}) · 모호 칸 과 ${guLessons.reduce((t, l) => t + l.ambiguous.length, 0)} · 넓은 화면 ${guScreens.reduce((t, s) => t + s.ambiguous.length, 0)}`);
  // 위치 한 줄 방위: 9칸 그대로 쓴 곳 수와, 9칸이 지도 검사에 걸려 바꾼 곳 · 같은 시 안에서 겹쳐 고친 곳(9칸→쓴 방위)
  const moved = guIds.filter((id) => guDir[id].use !== guDir[id].nine && !guDir[id].renamed), clash = guIds.filter((id) => guDir[id].renamed);
  note(`일반구 단원(${R.ko}) 위치 한 줄 방위: 9칸 그대로 ${guIds.length - moved.length - clash.length}곳`
    + (moved.length ? ` · 지도 검사로 바꿈 ${moved.map((id) => `${sggNameOf[id]} ${guDir[id].nine}→${guDir[id].use}`).join(', ')}` : '')
    + (clash.length ? ` · 같은 시 안에서 겹쳐 고침 ${clash.map((id) => `${sggNameOf[id]} ${guDir[id].nine}→${guDir[id].use}`).join(', ')}` : '')
    + ` · 가운데 ${guIds.filter((id) => guDir[id].use === 'C').length}곳`);
}

// 지역마다 두 파일로 나눈다
//  · {지역}-sgg.topo.json: 시군구(·시 층)·시도·강 띠. 첫 화면과 과에서 쓰므로 지역 표 simplifySggM(20m)으로 더 단순하게
//  · 동(5m)은 지역 파일로 내보내지 않는다(E5) — 시·군·구마다 단원 파일 emd/{코드}.topo.json(아래 unitTopo)
const CTX_MARGIN = CTX.ctxMargin;   // 이웃 땅·강 띠를 싣는 범위: 지역 상자를 긴 변의 30%씩 사방으로 늘린 만큼
const sggSimplifyOf = (sido) => SIDO_BY_CODE[sido].simplifySggM;
// manifest 의 simplify_m.sgg 는 숫자 하나(첫 공개 지역 서울의 값 — 옛 판과 같은 모양, 출처 쪽이 그대로 보인다). 계획서 N20 으로 더 단순하게 한 지역
// (E14 경북·E15 경남 40m — 20m 면 넓은 화면 고리 점이 3만을 넘음)은 simplify_m.sggBy 에 { 지역 key: m } 로 따로 적고, 출처 쪽이 같은 간격끼리 묶어
// '20m(경북·경남은 40m)'처럼 덧붙인다. 다른 값이 없으면 sggBy 를 쓰지 않는다(E13 까지의 판과 같은 모양)
const SGG_SIMPLIFY_M = sggSimplifyOf(REGIONS[0].sido);
const SGG_SIMPLIFY_BY = Object.fromEntries(REGIONS.filter((r) => sggSimplifyOf(r.sido) !== SGG_SIMPLIFY_M).map((r) => [r.key, sggSimplifyOf(r.sido)]));
// 지역 경계 파일(-sgg) 하나: 칸 층(sgg·si)·시도·강 띠 + 이웃 땅(다른 시도·북한·일본 대마도 — 상자 안에 들 때만, 지금 경남 — 1km² 아래 섬 뺌)을 지역 상자로 자르고 단순화한 TopoJSON.
// 기본 실행의 내보내기와 --dry-all 의 크기 추정이 함께 쓴다(둘 다 같은 전국 위상이라 추정 = 실제 파일)
const ringPts = (g) => polysOf(g).reduce((t, p) => t + p.reduce((u, r) => u + r.length, 0), 0);
const ptsOf = (T, name) => (T.objects[name] ? topo.feature(T, T.objects[name]).features.reduce((s, f) => s + ringPts(f.geometry), 0) : 0);
// 고리 점(계획서 N20·7절): 지역 경계 파일을 그릴 때의 점 수 = 칸(첫 공부 층) + 이웃 땅 + 강 띠
// far = 먼 이웃 땅(2026-11-17 — total 에는 넣지 않고 따로 적는다: N20 의 고리 점 정의는 그대로)
const ringOf = (T, cellLayer) => { const r = { cell: ptsOf(T, cellLayer), out: ptsOf(T, 'out'), water: ptsOf(T, 'water'), far: ptsOf(T, 'far') }; r.total = r.cell + r.out + r.water; return r; };
const gz = (s) => zlib.gzipSync(s).length;
const kb = (n) => +(n / 1024).toFixed(1);
async function regionSgg(sido, layer, simplifyM) {
  const sel = (fc) => ({ type: 'FeatureCollection', features: fc.features.filter((f) => f.properties.sido === sido) });
  // 지역 상자(먼 섬 제외)를 늘린 경위도 상자로 이웃 땅·강 띠를 자른다. 과 밖으로 끌어도 빈 바다만 보이지 않게
  const [lon0, lat0, lon1, lat1] = unionLL(sel(L.sgg).features.map((f) => f.properties.sggId), 'near');
  const mg = Math.max(lon1 - lon0, lat1 - lat0) * CTX_MARGIN;
  const bb = [lon0 - mg, lat0 - mg, lon1 + mg, lat1 + mg].map((v) => v.toFixed(4));
  const layers = ['sgg', ...(layer === 'si' ? ['si'] : []), 'sido'];
  const input = Object.fromEntries(layers.map((n) => [`${n}.json`, JSON.stringify(sel(L[n]))]));
  input['water.json'] = JSON.stringify(L.water);
  // 이웃 땅: 전국 위상의 다른 시·도 전부(공개 여부와 상관없이, 강 띠를 뺀 모양) + 북한. 1km² 아래 섬은 뺀다
  input['out.json'] = JSON.stringify({ type: 'FeatureCollection', features: [...L.sido.features.filter((f) => f.properties.sido !== sido), ...L.out.features]
    .map((f) => ({ type: 'Feature', geometry: f.geometry, properties: { sido: f.properties.sido, name: f.properties.sidoName } })) });
  const out = await ms(`-i ${[...layers, 'water', 'out'].map((n) => `${n}.json`).join(' ')} combine-files `
    + `-clip target=water bbox=${bb.join(',')} -clip target=out bbox=${bb.join(',')} -filter-islands target=out min-area=1000000 -simplify interval=${simplifyM} keep-shapes target=* `
    + `-o format=topojson quantization=${QUANT} target=* out.json`, input);
  const T = JSON.parse(String(out['out.json']));
  // 지역 상자 밖이라 잘리고 나서 빈 이웃 땅(먼 시·도)은 뺀다. 앱은 이웃 땅을 이름(lp)과 함께 그리므로 빈 도형을 남기지 않는다
  for (const name of ['out', 'water']) if (T.objects[name]) T.objects[name].geometries = T.objects[name].geometries.filter((g) => g.type);
  // 맥락 이름 자리(설계서 5.2 층 7): 이웃 땅(시도·북한)과 강 띠마다 가장 큰 덩어리의 '경계에서 가장 먼 점'을 lp 로 싣는다
  const lpOf = (g) => {
    const polys = polysOf(g).map((p) => p.map((r) => r.map(toM)));
    if (!polys.length) return null;
    const big = polys.reduce((a, b) => (ringArea(b[0]) > ringArea(a[0]) ? b : a));
    const [lon, lat] = toLL(polylabel(big, 100));
    return [+lon.toFixed(4), +lat.toFixed(4)];
  };
  for (const name of ['out', 'water']) {
    if (!T.objects[name]) continue;
    topo.feature(T, T.objects[name]).features.forEach((f, i) => {
      const lp = lpOf(f.geometry);
      if (lp) T.objects[name].geometries[i].properties = { ...T.objects[name].geometries[i].properties, lp };
    });
  }
  // 먼 이웃 땅(far 층): 지역·과·넓은 화면(일반구 단원 것도 — 같은 파일을 쓴다)을 화면에 맞췄을 때 보이는 범위 + 칸 전체(먼 섬까지). 자기 시·도는 뺀다
  // (out 은 상자 bb 안의 다른 시·도·나라 밖 땅을 모두 담으므로 그 안쪽은 도려낸다)
  const us = [units.find((u) => u.sido === sido)].filter(Boolean);
  if (us.length && guIndex[us[0].key]) us.push(guIndex[us[0].key]);
  const all = unionLL(sel(L.sgg).features.map((f) => f.properties.sggId), 'all');
  // 먼 섬 상자가 붙는 지역(칸 전체가 가까운 상자 밖으로 나감 — 인천·전남광주 등)과 섬 상자로 보이는 곳이 있는 지역(경북 울릉)은 본 지도가 비켜 그려진다
  const inset = all[0] < lon0 || all[1] < lat0 || all[2] > lon1 || all[3] > lat1 || us.some((u) => [...u.lessons, ...u.screens].some((x) => x.insets?.length));
  const st = (fit) => ({ fit, strip: inset && FAR_STRIP_SHIFT_REGION });   // 지역 지도는 확대 상자 옆 줄이 섬 줄과 겹쳐 서지 않는다 — 먼 섬 상자 폭(140px / 560 의 반)만큼만
  const wide = farBox({ whole: [[lon0, lat0, lon1, lat1], ...us.map((u) => u.fit)].map(st), part: us.flatMap((u) => [...u.lessons.map((l) => l.fit), ...u.screens.map((s) => s.fit)]).map(st), keep: [all] });
  // far 몫이 FAR_REGION_ADD 를 넘으면 한 단계 거칠게(지역 지도의 먼 땅은 넓은 범위의 배경이다)
  const bare = JSON.stringify(T), base = gz(bare);
  for (const [i, step] of FAR_STEPS.filter((s) => s >= farStep(wide)).entries()) {
    const withFar = addFar(JSON.parse(bare), await farLand(wide, (p) => p.sido === sido, step, farCore(bb.map(Number))));
    T.arcs = withFar.arcs;
    if (withFar.objects.far) T.objects.far = withFar.objects.far; else delete T.objects.far;
    if (i >= 1 || gz(JSON.stringify(T)) - base <= FAR_REGION_ADD) break;
  }
  return T;
}
const emdTopo = async (sido) => String((await ms(`-i emd.json name=emd -o format=topojson quantization=${QUANT} target=emd out.json`,
  { 'emd.json': JSON.stringify({ type: 'FeatureCollection', features: L.emd.features.filter((f) => f.properties.sido === sido) }) }))['out.json']);
// 동 단원 파일 하나(계획서 N11): 그 단원의 동(5m) + 이웃 땅(이름 있는 다른 시·군·구 — 같은 시·도든 다른 시·도든 — 과 북한) + 강 띠를 한 위상으로.
// 지역 -sgg 파일을 빌려 겹치지 않는다(따로 단순화한 두 파일을 겹치면 단원 외곽이 어긋남). 이웃 땅 범위는 단원의 가까운 상자(먼 섬 동 뺌)를
// 긴 변의 15%씩 늘린 범위(scope 'box'). gz 가 UNIT_GZ_MAX 를 넘으면 그 단원만 맞닿은 시·군·구(바다 건너 이웃 포함)로 줄인다(scope 'touch').
// 이웃 땅은 1km² 아래 섬을 빼고, 단원 칸·이웃 땅·강 모두 더 단순화하지 않는다(5m — 한 위상에서 층마다 간격을 달리하면 단원 외곽과 함께 쓰는 호가 어긋날 수 있음)
const UNIT_CTX_MARGIN = 0.15, UNIT_GZ_MAX = 40 * 1024;
const llBox = (g) => { let q = [Infinity, Infinity, -Infinity, -Infinity]; for (const p of polysOf(g)) for (const [x, y] of p[0]) q = [Math.min(q[0], x), Math.min(q[1], y), Math.max(q[2], x), Math.max(q[3], y)]; return q; };
const llHits = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
/* ---------- 먼 이웃 땅(far 층 — 2026-11-17 사용자 결정 '모든 지도에 바다를 표현', docs/SEA_PLAN_2026-11-16.md 4절) ---------- */
// 지도 바탕이 바다색이 되어, 이웃 땅(out)에 담기지 않은 땅은 화면에서 바다로 칠해진다. out 은 지역 상자를 30%(단원은 15%, 큰 단원은 맞닿은 시·군·구만) 넓힌 범위만 담는데
// (칸과 같은 위상·같은 간격이라 크다), 세로 휴대폰·가로로 돌린 휴대폰·과 범위 확대에서는 화면이 그보다 넓게 보인다(2026-11-17 탐침: 지도 칸 가로세로 비 0.61~2.39 —
// 신안군 둘러보기는 화면의 13%가 빠진 땅이었고, 전국 지도에는 일본·중국이, 인천 먼 섬 상자에는 북한 땅이 빠졌다). 그 범위의 땅을 거칠게 단순화해 topo 의 far 층으로 따로 싣는다.
// 앱은 far → out → 칸 차례로 깐다(같은 면색이라 한 덩어리로 보인다 — src/app/map/shapes.ts buildShapes).
//  · 범위(넓은 상자 farBox): 화면에 맞추는 범위들을 지도 칸 비로 넓힌 것 — 지역·단원 전체는 둘러보기·쪽 지도의 비 FAR_ASPECT, 과·넓은 화면은 문제 화면의 비 FAR_ASPECT_PLAY
//    (비는 지도 칸 폭·높이를 안쪽 여백을 뺀 높이·폭으로 나눈 값으로 잡는다. 둘레 FAR_PAD 는 여백이 한쪽만 늘어 지도가 밀리는 몫 — 축척 막대를 비키면 위로 9% — 탐침의 지도 칸: 쪽 지도 560×234(여백 14 → 2.72, 축척 막대가 칸을 가려 아래 여백을 46 으로 늘리면 3.22) · 둘러보기 360×587(여백 12 → 0.57) ·
//    문제 화면 504×289(여백 12 → 1.90)·360×497(0.68)) —
//    과 칸 전체 상자(먼 섬까지 — 먼 섬 상자 둘레의 땅)를 품고 둘레 FAR_PAD. 화면에 붙는 것 때문에 더 보이는 몫도 넣는다:
//      - 섬 상자 줄(동 단원의 섬 — insets)·먼 섬 상자(지역 지도)가 붙는 지도(strip): 본 지도가 그만큼 비켜 그려진다. 범위가 칸의 좁은 쪽에 꽉 차면 본 지도가 줄어
//        FAR_STRIP_K 배 넓게 보이고(휴대폰 360 폭에서 상자 줄 136px 옆 본 지도 224px = 1.61배), 긴 쪽이 남으면 줄 폭만큼 옆으로 밀려 양옆으로 FAR_STRIP_SHIFT 씩 더 보인다
//        (가로로 돌린 휴대폰 560 폭에서 섬 줄 136 + 확대 상자 옆 줄 200 의 반 = 0.3 — 여수시 3과 시작. 지역 지도는 먼 섬 상자 옆을 비우는 몫 FAR_STRIP_SHIFT_REGION)
//      - 지역·단원 전체 지도(과 시작·요약)는 확대 상자를 지도 칸 아래에 늘린 줄에 둘 때 그 줄에도 지도가 이어져, 범위 높이의 FAR_BELOW 만큼 아래로 더 보인다
//        (휴대폰: 본 지도 268px 아래 상자 줄 176px = 0.66 — 순천시 1과 시작)
//  · 땅: 전국 위상 T1 의 시·군·구(강 띠 자르기 전 — 먼 곳의 강은 땅으로 메운다)에서 자기 것(지역 지도는 그 시·도, 단원 지도는 그 시·군·구)을 뺀 것 + 북한(휴전선 틈을 메운 nkLand)
//    + Natural Earth 의 일본·중국·러시아. 넓은 상자로 자르고 한 덩어리로 합친 뒤(dissolve2) 작은 섬(1km² 또는 간격의 제곱 아래)은 뺀다
//  · out 이 상자 안을 다 덮는 지도(지역 경계 파일 · 단원 scope 'box')는 그 상자 안쪽을 far 에서 도려낸다(FAR_LAP 만큼만 겹침 — 같은 땅을 두 번 싣지 않는다).
//    맞닿은 시·군·구만 실은 단원(scope 'touch')은 상자 안에도 빠진 땅이 있어 도려내지 않는다
//  · 단순화 간격: 넓은 상자 긴 변을 화면 FAR_PX px 로 보았을 때 1px 쯤(FAR_STEPS 가운데 그 이상인 첫 값 — 실제 화면은 그 범위를 360~900px 로 그려 1~2px 쯤이다.
//    먼 땅은 화면 가장자리 배경이라 그 정도 거칠어도 된다). 단원 지도 파일은 far 를 붙여 FAR_UNIT_GZ(단원 예산 UNIT_GZ_MAX 에서 단원 과 파일 몫 3KB 를 뺀 것 —
//    두 파일을 합쳐 40KB 안)를 넘거나 far 몫이 FAR_UNIT_ADD 를 넘으면(섬이 많은 남해안·서해안 단원 — scope box 만) 그 단원만 간격을 한 단계씩, 많아야 FAR_UNIT_UP 단계 올린다.
//    지역 경계 파일은 far 몫이 FAR_REGION_ADD 를 넘으면 한 단계만 올리고, 전국 지도는 SIDO_MAP_GZ_MAX 에 1KB 여유로 들 때까지 올린다
//  · 칸·out 과 한 위상에 넣지 않는다 — 넣으면 칸·out 의 호가 far 꼭짓점에서 쪼개져 기존 층이 바뀐다. 따로 계산해 topo 호 목록 끝에 덧붙인다(addFar — 기존 호·객체는 그대로)
const FAR_ASPECT = [0.55, 3.3], FAR_ASPECT_PLAY = [0.62, 1.95], FAR_PAD = 0.1, FAR_STRIP_K = 1.65, FAR_STRIP_SHIFT = 0.3, FAR_STRIP_SHIFT_REGION = 0.15, FAR_BELOW = 0.7, FAR_LAP = 0.01, FAR_PX = 700, FAR_PX_KOREA = 900, FAR_STEPS = [30, 60, 120, 250, 500, 1000, 2000, 4000, 8000], FAR_MIN_AREA = 1e6;
/**
 * 넓은 상자(경위도 [서, 남, 동, 북]): whole = 지역·단원 전체 범위들, part = 과·넓은 화면 범위들, keep = 통째로 품을 상자(칸 전체).
 * 범위는 [서, 남, 동, 북] 또는 { fit, strip } — strip 이면 섬 상자 줄·먼 섬 상자가 붙는 지도(true 면 옆 밀림 FAR_STRIP_SHIFT, 숫자면 그 값)
 */
const farBox = ({ whole = [], part = [], keep = [] }) => {
  let q = [Infinity, Infinity, -Infinity, -Infinity];
  const add = (b) => { q = [Math.min(q[0], b[0]), Math.min(q[1], b[1]), Math.max(q[2], b[2]), Math.max(q[3], b[3])]; };
  const fit = (b, [a0, a1], below = 0) => {
    const [w, s, e, n] = Array.isArray(b) ? b : b.fit, strip = !Array.isArray(b) && b.strip;
    const W = (e - w) * KX, H = (n - s) * KY, cx = (w + e) / 2, cy = (s + n) / 2;
    const k = strip ? FAR_STRIP_K : 1, shift = strip ? 1 + 2 * (strip === true ? FAR_STRIP_SHIFT : strip) : 1;
    // 가로로 긴 칸(비 a1)에 맞추면 폭이, 세로로 긴 칸(비 a0)에 맞추면 높이가 늘어난다
    const vw = Math.max(W * k, H * a1 * shift) * (1 + 2 * FAR_PAD), vh = Math.max(H, W / a0) * k * (1 + 2 * FAR_PAD);
    add([cx - vw / 2 / KX, cy - (vh / 2 + below * H) / KY, cx + vw / 2 / KX, cy + vh / 2 / KY]);
  };
  for (const b of whole) fit(b, FAR_ASPECT, FAR_BELOW);
  for (const b of part) fit(b, FAR_ASPECT_PLAY);
  for (const [w, s, e, n] of keep) { const m = Math.max((e - w) * KX, (n - s) * KY) * FAR_PAD; add([w - m / KX, s - m / KY, e + m / KX, n + m / KY]); }
  return q.map((v) => Math.round(v * 1e4) / 1e4);
};
/** 넓은 상자의 기본 단순화 간격(m) */
const FAR_UNIT_GZ = 37 * 1024, FAR_UNIT_ADD = 5 * 1024, FAR_UNIT_UP = 2, FAR_REGION_ADD = 4 * 1024;
// (px = 넓은 상자 긴 변을 몇 px 로 보나: 단원·지역 FAR_PX · 전국 FAR_PX_KOREA)
const farStep = (box, px = FAR_PX) => { const long = Math.max((box[2] - box[0]) * KX, (box[3] - box[1]) * KY); return FAR_STEPS.find((x) => x >= long / px) ?? FAR_STEPS[FAR_STEPS.length - 1]; };
/** 가까운 상자(out 을 자른 상자)를 FAR_LAP 만큼 안으로 줄인 것 — far 에서 도려낼 범위 */
const farCore = ([w, s, e, n]) => { const mx = (e - w) * FAR_LAP, my = (n - s) * FAR_LAP; return [w + mx, s + my, e - mx, n - my]; };
const farSggSrc = topo.feature(T1, T1.objects.sgg).features.map((f) => ({ type: 'Feature', geometry: f.geometry, properties: { sggId: f.properties.sggId, sido: f.properties.sido } }));
const farSimp = new Map();   // 간격(m) → 그 간격으로 단순화한 전국 시·군·구(상자와 함께)
async function farSggAt(step) {
  if (!farSimp.has(step)) {
    const r = await ms(`-i sgg.json -simplify interval=${step} keep-shapes -filter-islands min-area=${Math.max(FAR_MIN_AREA, step ** 2)} -o format=geojson geojson-type=FeatureCollection out.json`,
      { 'sgg.json': JSON.stringify({ type: 'FeatureCollection', features: farSggSrc }) });
    farSimp.set(step, fcOf(r['out.json']).features.filter((f) => f.geometry).map((f) => ({ ...f, box: llBox(f.geometry) })));
  }
  return farSimp.get(step);
}
// 나라 밖 땅: 북한(L.out 의 kp — 휴전선 틈을 메운 것)과 Natural Earth 일본·중국·러시아의 덩어리마다 상자
const farAbroad = [...nkLand.flatMap((f) => polysOf(f.geometry)), ...['JPN', 'CHN', 'RUS'].flatMap((a3) => polysOf(neFeats.find((f) => f.properties.ADM0_A3 === a3)?.geometry))]
  .map((p) => ({ p, box: llBox({ type: 'Polygon', coordinates: p }) }));
/** 넓은 상자 box 안의 먼 이웃 땅(덩어리 목록 — 경위도). mine(시·군·구 속성) = 자기 것(뺀다), step = 단순화 간격(m), core = 도려낼 상자(없으면 도려내지 않음) */
async function farLand(box, mine, step, core = null) {
  const sgg = (await farSggAt(step)).filter((f) => !mine(f.properties) && llHits(f.box, box));
  const abroad = farAbroad.filter((x) => llHits(x.box, box)).map((x) => x.p);
  const feats = [...sgg.map((f) => ({ type: 'Feature', properties: {}, geometry: f.geometry })), ...(abroad.length ? [{ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: abroad } }] : [])];
  if (!feats.length) return [];
  // 자르기·합치기를 먼저 한다: 상자만 겹치고 잘린 뒤 비는 지도(울릉군 등)는 여기서 끝난다(빈 층에 -filter-islands 를 돌리면 mapshaper 가 멈춘다)
  const f4 = (b) => b.map((v) => v.toFixed(4)).join(',');
  const c = await ms(`-i land.json -clip bbox=${f4(box)} ${core ? `-erase bbox=${f4(core)} ` : ''}-dissolve2 -o format=geojson geojson-type=FeatureCollection cut.json`,
    { 'land.json': JSON.stringify({ type: 'FeatureCollection', features: feats }) });
  const cut = fcOf(c['cut.json']).features.filter((f) => f.geometry && polysOf(f.geometry).length);
  if (!cut.length) return [];
  const r = await ms(`-i cut.json -simplify interval=${step} keep-shapes -filter-islands min-area=${Math.max(FAR_MIN_AREA, step ** 2)} -o format=geojson geojson-type=FeatureCollection out.json`,
    { 'cut.json': JSON.stringify({ type: 'FeatureCollection', features: cut }) });
  return fcOf(r['out.json']).features.flatMap((f) => polysOf(f.geometry));
}
/**
 * topo T 에 far 층을 덧붙인다: 덩어리의 고리마다 호 하나(T 의 양자화 그대로 — 호 목록 끝에 더하므로 기존 호 번호·객체는 바뀌지 않는다).
 * 양자화로 점이 셋 아래로 줄어든 고리는 뺀다. 덩어리가 없으면 아무것도 하지 않는다(far 층 없음 — 사방이 바다인 지도)
 */
function addFar(T, polys) {
  const tr = T.transform;
  if (!tr) throw new Error('addFar: 양자화 transform 이 없는 topo');
  const arcsOf = [];
  for (const p of polys) {
    const rings = [];
    for (const ring of p) {
      const arc = [];
      let px = 0, py = 0, n = 0;
      for (const [lon, lat] of ring) {
        const x = Math.round((lon - tr.translate[0]) / tr.scale[0]), y = Math.round((lat - tr.translate[1]) / tr.scale[1]);
        if (n && x === px && y === py) continue;
        arc.push([x - px, y - py]); px = x; py = y; n++;
      }
      if (n < 4) { if (!rings.length) break; continue; }   // 바깥 고리가 무너지면 덩어리째, 구멍 고리면 그 고리만 뺀다
      rings.push([T.arcs.length]);
      T.arcs.push(arc);
    }
    if (rings.length) arcsOf.push(rings);
  }
  if (arcsOf.length) T.objects.far = { type: 'GeometryCollection', geometries: [{ type: 'MultiPolygon', arcs: arcsOf }] };
  return T;
}
let sggBoxLL = null;   // 시·군·구 id → 경위도 상자(처음 쓸 때 계산)
async function unitTopo(sggId, scope = 'box') {
  // 나라 밖 이웃 땅(L.out — 북한 kp, E15 부터 일본 jp)은 sido 를 열쇠로
  sggBoxLL ??= new Map([...L.sgg.features, ...L.out.features.map((f) => ({ ...f, properties: { sggId: f.properties.sido } })), ...L.water.features.map((f, i) => ({ ...f, properties: { sggId: `water:${i}` } }))]
    .map((f) => [f.properties.sggId, llBox(f.geometry)]));
  const { res } = unitOf(sggId);
  const [w, s, e, n] = llOfN(res.base), mg = Math.max(e - w, n - s) * UNIT_CTX_MARGIN;
  const bb = [w - mg, s - mg, e + mg, n + mg];
  const near = new Set([...(neighbors.sgg[sggId] || []), ...(neighbors.sea[sggId] || []).map((x) => x.id)]);
  const out = [
    ...L.sgg.features.filter((f) => f.properties.sggId !== sggId && llHits(sggBoxLL.get(f.properties.sggId), bb) && (scope === 'box' || near.has(f.properties.sggId)))
      .map((f) => ({ type: 'Feature', geometry: f.geometry, properties: { id: f.properties.sggId, name: f.properties.sggName, sido: f.properties.sido, en: sggEn(f.properties.sggId) } })),
    ...L.out.features.filter((f) => llHits(sggBoxLL.get(f.properties.sido), bb)).map((f) => ({ type: 'Feature', geometry: f.geometry, properties: { id: f.properties.sido, name: f.properties.sidoName, sido: f.properties.sido, en: OUT_EN[f.properties.sido] ?? '' } })),
  ];
  const water = L.water.features.filter((f, i) => llHits(sggBoxLL.get(`water:${i}`), bb));
  const input = { 'emd.json': JSON.stringify({ type: 'FeatureCollection', features: emdOfSgg.get(sggId).map((f) => ({ type: 'Feature', geometry: f.geometry, properties: { id: f.properties.id } })) }) };
  if (out.length) input['out.json'] = JSON.stringify({ type: 'FeatureCollection', features: out });
  if (water.length) input['water.json'] = JSON.stringify({ type: 'FeatureCollection', features: water });
  const bbs = bb.map((v) => v.toFixed(4)).join(',');
  const r = await ms(`-i ${Object.keys(input).join(' ')} combine-files `
    + (out.length ? `-clip target=out bbox=${bbs} -filter-islands target=out min-area=1000000 ` : '')
    + (water.length ? `-clip target=water bbox=${bbs} ` : '')
    + `-o format=topojson quantization=${QUANT} target=* out.json`, input);
  const T = JSON.parse(String(r['out.json']));
  // 잘리고 나서 빈 도형은 빼고, 그래서 빈 객체가 되면(한강의 경위도 상자는 범위와 겹쳤지만 잘린 뒤 비는 단원 등) 객체째 지운다 — 앱이 빈 층을 그리지 않게
  for (const name of ['out', 'water']) {
    if (!T.objects[name]) continue;
    T.objects[name].geometries = T.objects[name].geometries.filter((g) => g.type);
    if (!T.objects[name].geometries.length) delete T.objects[name];
  }
  // 맥락 이름 자리(regionSgg 와 같음): 이웃 땅·강 띠마다 가장 큰 덩어리의 '경계에서 가장 먼 점'
  for (const name of ['out', 'water']) {
    if (!T.objects[name]) continue;
    topo.feature(T, T.objects[name]).features.forEach((f, i) => {
      const polys = polysOf(f.geometry).map((p) => p.map((q) => q.map(toM)));
      if (!polys.length) return;
      const big = polys.reduce((a, b) => (ringArea(b[0]) > ringArea(a[0]) ? b : a));
      const [lon, lat] = toLL(polylabel(big, 100));
      T.objects[name].geometries[i].properties = { ...T.objects[name].geometries[i].properties, lp: [+lon.toFixed(4), +lat.toFixed(4)] };
    });
  }
  const text = JSON.stringify(T);
  const pts = { cell: ptsOf(T, 'emd'), out: ptsOf(T, 'out'), water: ptsOf(T, 'water'), far: 0 };
  pts.total = pts.cell + pts.out + pts.water;
  return { text, gz: gz(text), bytes: Buffer.byteLength(text), pts, scope, bb };
}
/**
 * 단원 파일에 먼 이웃 땅(far 층)을 붙인다: 단원 전체·과·넓은 화면을 화면에 맞췄을 때 보이는 범위 + 동 전체(먼 섬까지). 자기 시·군·구는 뺀다.
 * base = far 없는 단원 파일(unitTopo — 칸·이웃 땅·강은 그대로 둔다). scope 'box' 면 상자 안쪽을 도려낸다(out 이 다 덮는다).
 * 붙여서 FAR_UNIT_GZ 를 넘거나 far 몫이 FAR_UNIT_ADD 를 넘으면 간격을 한 단계씩(많아야 FAR_UNIT_UP 단계) 올려 다시 만든다. 예산(FAR_UNIT_GZ)은 그 뒤에도 넘으면 끝까지 올린다
 * (far 없이도 넘는 단원은 기본 간격 그대로)
 */
async function unitFar(sggId, base) {
  const { res } = unitOf(sggId);
  // 섬 상자(insets)가 붙는 과·화면과, 그런 화면이 하나라도 있는 단원의 전체 지도는 본 지도가 상자 줄만큼 비켜 그려진다
  const isle = (x) => x.insets.length > 0;
  const wide = farBox({ whole: [{ fit: llOfN(res.view ?? res.base), strip: res.screens.some(isle) }],
    part: [...res.lessons, ...res.screens].map((x) => ({ fit: llOfN(x.box), strip: isle(x) })), keep: [unionLL(emdOfSgg.get(sggId).map((f) => f.properties.id), 'all')] });
  const step0 = farStep(wide);
  let got = null;
  const steps = FAR_STEPS.filter((s) => s >= step0);
  for (const [i, step] of steps.entries()) {
    const T = addFar(JSON.parse(base.text), await farLand(wide, (p) => p.sggId === sggId, step, base.scope === 'box' ? farCore(base.bb) : null));
    const text = JSON.stringify(T);
    got = { ...base, text, gz: gz(text), bytes: Buffer.byteLength(text), pts: { ...base.pts, far: ptsOf(T, 'far') }, farStep: step, farBox: wide };
    if (base.gz > FAR_UNIT_GZ) break;
    // far 몫 상한은 상자 안을 이웃 땅이 덮는 단원(box)만: 맞닿은 시·군·구만 실은 단원(touch — 신안·옹진)은 far 가 가까운 둘레 땅이라 거칠게 하지 않는다
    if (got.gz <= FAR_UNIT_GZ && (base.scope !== 'box' || got.gz - base.gz <= FAR_UNIT_ADD || i >= FAR_UNIT_UP)) break;
  }
  return got;
}
/**
 * 단원 파일: 'box' 가 예산을 넘으면 'touch'. 둘 다 재서 보고한다.
 * 모든 곳이 섬 과(섬 상자)로 보이는 단원(인천 옹진군 등)은 처음부터 'touch' — 본 지도가 화면에 나오지 않아 상자 범위의 이웃 땅은 쓰이지 않는데,
 * 먼 섬까지 든 상자를 15% 늘리면 이웃 땅이 고리 점의 72%(옹진, E3 검수)가 된다
 */
const unitTopoMemo = new Map();   // 시·군·구 id → 단원 파일(보고·내보내기·시험용 파일이 같은 것을 다시 계산하지 않게)
async function unitTopoFit(sggId) {
  if (unitTopoMemo.has(sggId)) return unitTopoMemo.get(sggId);
  const { U, res } = unitOf(sggId);
  // scope 는 먼 이웃 땅을 붙이기 전 크기로 정한다(2026-11-17 전과 같은 판정 — 칸·이웃 땅 층은 그대로다). 먼 이웃 땅은 그 뒤에 붙인다(unitFar)
  let got;
  if (res.islands.length === U.dongs.length) got = { ...(await unitFar(sggId, await unitTopo(sggId, 'touch'))), boxGz: null, allIsland: true };
  else {
    const a = await unitTopo(sggId, 'box');
    got = { ...(await unitFar(sggId, a.gz <= UNIT_GZ_MAX ? a : await unitTopo(sggId, 'touch'))), boxGz: a.gz };
  }
  unitTopoMemo.set(sggId, got);
  return got;
}

/* ---------- --dry-all: 전국 점검 보고서(저장소에는 아무것도 쓰지 않는다) ---------- */
if (DRY) {
  // 시·도 전체 한 화면(358×440, 여백 0, 먼 섬 뺀 상자) 최소 칸: 과 화면 검사와 같은 계산.
  // 통째로 먼 섬인 곳(울릉군 등)은 섬 상자로 따로 보이므로 상자와 최소 칸에서 빼고 island 로 적는다. M 은 잰 값(MAIN 또는 기본 규칙 ALT)
  const wideMin = (lids, M = MAIN) => {
    if (lids.length < 2) return null;
    const island = lids.filter((id) => !M.bbox[id].near), on = lids.filter((id) => M.bbox[id].near);
    if (!on.length) return null;
    const b = boxUnion(on, 'near', M.bbox);
    const w = b[2] - b[0], h = b[3] - b[1], p = Math.max(w, h) * PHONE_WIDE.pad;
    const k = Math.min(PHONE_WIDE.w / (w + 2 * p), PHONE_WIDE.h / (h + 2 * p));
    const sizes = on.map((id) => ({ id, d: Math.round(2 * M.labels[id][2] * k) }));
    const min = sizes.reduce((a, s) => (s.d < a.d ? s : a));
    return { px: min.d, at: min.id, fail: sizes.filter((s) => s.d < TAP_FAIL).length, ambiguous: sizes.filter((s) => s.d < TAP_AMBIG).length, island };
  };
  // 공개 지역처럼 far 가 기본 규칙이 아닌 시·도는 기본 규칙(가장 큰 땅 상자 +30km 밖)으로도 잰다(계획서 14.4 '먼 섬 목록(기본 규칙)').
  // 2.1절 값과 견주려고. 세 지역은 계획서 N8 대로 경도 125.9 를 고정한다(E2 확인: 기본 규칙이면 인천 강화 삼산·서도·옹진 자월 덩어리까지
  // 먼 섬이 되어 덕적면이 통째 먼 섬으로 바뀌고 인천 전체 한 화면 최소 칸이 12 → 15px 로 달라진다 — 운영 화면이 바뀌므로 E2 에서 바꾸지 않음). 동은 먼 섬 덩어리 수만 센다
  const ALT = { labels: {}, bbox: {}, far: {}, main: false };
  const defFar = farBy(null);
  const ofSido = (fc, code) => ({ features: fc.features.filter((f) => f.properties.sido === code) });
  for (const s of SIDO.filter((x) => x.far)) {
    measure(ofSido(L.sgg, s.code), 'sggId', defFar, ALT);
    measure(ofSido(L.si, s.code), 'siId', defFar, ALT);
    for (const f of ofSido(L.emd, s.code).features) {
      const polysLL = polysOf(f.geometry);
      const n = polysLL.filter((p) => defFar(s.code, p, p.map((r) => r.map(toM)))).length;
      if (n) ALT.far[f.properties.id] = { far: n, all: polysLL.length };
    }
  }
  tick('공개 지역 기본 규칙 다시 재기');
  const nameOfId = {};
  for (const f of L.emd.features) nameOfId[f.properties.id] = f.properties.name;
  for (const f of L.si.features) nameOfId[f.properties.siId] = f.properties.siName;
  for (const f of L.sgg.features) nameOfId[f.properties.sggId] = f.properties.sggName;
  const sidos = [];
  for (const s of SIDO) {
    const live = LIVE_CODES.has(s.code);
    const emdNames = L.emd.features.filter((f) => f.properties.sido === s.code).map((f) => f.properties.name);
    const kind = { eup: emdNames.filter((n) => n.endsWith('읍')).length, myeon: emdNames.filter((n) => n.endsWith('면')).length };
    kind.dong = emdNames.length - kind.eup - kind.myeon;
    const c = counts[s.code];
    const sggIds = L.sgg.features.filter((f) => f.properties.sido === s.code).map((f) => f.properties.sggId);
    const siIds = L.si.features.filter((f) => f.properties.sido === s.code).map((f) => f.properties.siId);
    const cellLayer = s.layer === 'si' ? 'si' : 'sgg';
    const T = await regionSgg(s.code, cellLayer, s.simplifySggM);
    const text = JSON.stringify(T);
    const ring = ringOf(T, cellLayer);
    // drawPts: 고리 점(계획서 N20 정의 = 칸 + 이웃 땅 + 강). 칸·이웃 땅·강은 cellPts·outPts·waterPts 로 따로도 적는다
    const sgg = { simplifyM: s.simplifySggM, bytes: Buffer.byteLength(text), gz: gz(text), cellPts: ring.cell, outPts: ring.out, waterPts: ring.water, drawPts: ring.total };
    const emdText = await emdTopo(s.code);
    const row = { code: s.code, key: s.key, ko: s.ko, full: s.full, status: s.status, layer: s.layer, far: s.far,
      count: { ...c, ...kind }, expect: s.expect, countOk: c.sgg === s.expect.sgg && c.si === s.expect.si && c.emd === s.expect.emd,
      wide: { sgg: wideMin(sggIds), si: s.layer === 'si' ? wideMin(siIds) : null }, sgg, emd: { bytes: Buffer.byteLength(emdText), gz: gz(emdText) } };
    if (s.far) row.wideDefault = { sgg: wideMin(sggIds, ALT), si: s.layer === 'si' ? wideMin(siIds, ALT) : null };   // 기본 규칙으로 잰 한 화면 최소 칸
    // 공개 지역은 지금 내보낸 파일과 견주고(읽기만), 과 구성을 적는다(공통 완료 조건 2: 과·화면 최소 칸, 모호 칸, 1·2·3곳 과 수)
    if (live) {
      const f = path.join(OUT_DIR, `${s.key}-sgg.topo.json`);
      if (fs.existsSync(f)) { const t = fs.readFileSync(f, 'utf8'), r = ringOf(JSON.parse(t), cellLayer); row.sggNow = { bytes: Buffer.byteLength(t), gz: gz(t), cellPts: r.cell, outPts: r.out, waterPts: r.water, drawPts: r.total }; }
      const u = units.find((v) => v.key === s.key);
      const bySize = {};
      for (const l of u.lessons) bySize[l.items.length] = (bySize[l.items.length] ?? 0) + 1;
      row.lessons = { count: u.lessons.length, bySize, small: [1, 2, 3].map((n) => bySize[n] ?? 0),
        minTapPx: Math.min(...u.lessons.map((l) => l.minTapPx)), ambiguous: u.lessons.reduce((t, l) => t + l.ambiguous.length, 0),
        screens: u.screens.map((v) => ({ ko: v.ko, minTapPx: v.minTapPx, ambiguous: v.ambiguous.length })) };
    }
    sidos.push(row);
    tick(`${s.ko} 경계 파일 추정`);
  }
  // 동 단원 256(계획서 E3 완료 조건 2): 전국 단원마다 과 묶기·이름 검사·넓은 화면·단원 파일 크기를 잰다(실패는 보고만 — 기준은 각 지역 공개 단계에서)
  const unitRows = [];
  for (const s of SIDO) for (const sggId of sggIdsOfSido(s.code)) {
    const { U, res } = unitOf(sggId);
    const t = await unitTopoFit(sggId);
    unitRows.push({ id: sggId, code: U.code, sido: s.code, sidoKo: s.ko, ko: U.ko, ...res.stats,
      problems: res.problems.map((p) => p.msg), problemKinds: [...new Set(res.problems.map((p) => p.kind))],
      gz: t.gz, boxGz: t.boxGz, bytes: t.bytes, scope: t.scope, allIsland: !!t.allIsland, pts: t.pts,
      lessonList: res.lessons.map((L) => ({ no: L.no, title: L.title, minTapPx: L.minTapPx, insets: L.insets.length, items: L.ids.map((id) => nameOfId[id]),
        group: L.group, center: L.center, renamed: L.renamed, suffixed: L.suffixed, apart: L.apart, virtual: L.virtual })),
      screenList: res.screens.map((S) => ({ key: S.key, ko: S.ko, n: S.ids.length, minTapPx: S.minTapPx, insets: S.insets.length })) });
  }
  tick('동 단원 256(묶기·단원 파일)');
  // 묶기 규칙을 고칠 때 파이프라인 전체를 다시 돌리지 않고 emd-lib.mjs 만 시험할 수 있게 단원 입력을 함께 남긴다(.cache, git 이 무시함)
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'emd-inputs.json'), JSON.stringify(SIDO.flatMap((s) => sggIdsOfSido(s.code).map((id) => ({ sido: s.code, sidoKo: s.ko, ...unitOf(id).U })))));
  // 시·군·구 과 이름 지도 검사(N7, 보고만): 지금 원고의 과 이름(Q4 답 전)에 동 과 이름과 같은 검사(emd-lib.mjs checkTitle)를 돌린다.
  // 기준은 실제 칠한 넓이 중심(먼 섬 덩어리 뺌)과 지역(섬 상자로 따로 보이는 곳을 뺀 칸 전부)의 넓이 중심·등가 반지름. '서울 서쪽'처럼 다른 지역을 기준으로 한 말도 지역 가운데 기준으로 잰다
  const titleRows = [];
  for (const R of REGIONS) {
    const u = units.find((v) => v.key === R.key), layer = R.layer === 'si' ? 'si' : 'sgg', key = layer === 'si' ? 'siId' : 'sggId';
    const itemIds = u.items.map((it) => it.id), outer = outerOf(layer, itemIds);
    const AC = Object.fromEntries(itemIds.map((id) => [id, areaCenter(L[layer].features.find((f) => f.properties[key] === id))]));
    const wsum = (ids) => ids.reduce((t, id) => t + AC[id].a, 0);
    const wc = (ids) => [0, 1].map((k) => ids.reduce((t, id) => t + AC[id].c[k] * AC[id].a, 0) / wsum(ids));
    const onMap = itemIds.filter((id) => bboxM[id].near);
    for (const l of u.lessons) {
      const rest = onMap.filter((id) => !l.items.includes(id));
      titleRows.push({ region: R.ko, no: l.no, title: l.title, fails: checkTitle(l.title, { at: wc(l.items), base: wc(onMap), rest: wc(rest), r: Math.sqrt(wsum(onMap) / Math.PI), allOuter: l.items.every((id) => outer[id]) }) });
    }
  }
  const lonelyRows =lonelyAll.map((k) => ({ id: k, name: `${SIDO_BY_CODE[sidoOfId(k)].ko} ${sggNameOf[k]}`, sea: !!neighbors.sea[k], lonelyOk: SIDO_BY_CODE[sidoOfId(k)].lonelyOk.includes(sggNameOf[k]) }));
  const emdById = new Map(L.emd.features.map((f) => [f.properties.id, f]));
  const farRowsOf = (far) => {
    const rows = {};
    for (const [id, v] of Object.entries(far)) {
      const f = emdById.get(id);
      (rows[f.properties.sido] ||= []).push({ id, name: `${f.properties.sggName} ${f.properties.name}`, far: v.far, all: v.all, whole: v.far === v.all });
    }
    return rows;
  };
  const farRows = farRowsOf(farEmd), farRowsDefault = farRowsOf(ALT.far);
  // 시·군·구(시 층) 단위로 통째로 먼 섬인 곳: 지역 상자·한 화면 칸에서 빼고 섬 상자로 따로 보여야 하는 곳(E14)
  const islandRows = [...new Set([...L.sgg.features.map((f) => f.properties.sggId), ...L.si.features.map((f) => f.properties.siId)])]
    .filter((id) => !bboxM[id].near).map((id) => ({ id, name: `${SIDO_BY_CODE[sidoOfId(id)].ko} ${nameOfId[id]}` }));
  const sum = (k) => sidos.reduce((t, s) => t + s.count[k], 0);
  const seconds = +((Date.now() - T0) / 1000).toFixed(1);
  const report = {
    _note: 'node pipeline/build-geo.mjs --dry-all 가 만든 전국 점검 보고(계획서 NATIONWIDE_PLAN 14.4). 저장소에는 아무것도 쓰지 않는다',
    source: SOURCE.file, version: VER, ran: new Date().toISOString(), seconds,
    live: REGIONS.map((r) => r.key),
    total: { sido: SIDO.length, sgg: sum('sgg'), si: sum('si'), emd: sum('emd'), eup: sum('eup'), myeon: sum('myeon'), dong: sum('dong') },
    pairs: { emd: pairCount(neighbors.emd), sgg: pairCount(neighbors.sgg), si: pairCount(neighbors.si) }, asym, selfLoops,
    lonely: lonelyRows, far: farRows, farDefault: farRowsDefault, island: islandRows, probes: probeResults, sidos,
    emdUnits: unitRows, sggTitles: titleRows,
    errors, issues, notes,
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'dry-all.json'), JSON.stringify(report, null, 1) + '\n');
  // 한국어 요약표
  const px = (w) => (w ? `${w.px}px(${nameOfId[w.at]}${w.fail ? `, 16 미만 ${w.fail}` : ''})${w.island.length ? ` · 섬 상자 ${w.island.map((id) => nameOfId[id]).join('·')}` : ''}` : '–');
  // 동 단원 요약
  const U_ = unitRows, tot = (f) => U_.reduce((t, u) => t + f(u), 0);
  const sizeAll = {};
  for (const u of U_) for (const [k, v] of Object.entries(u.sizes)) sizeAll[k] = (sizeAll[k] ?? 0) + v;
  const famAll = U_.flatMap((u) => u.families.map((f) => ({ ...f, unit: `${u.sidoKo} ${u.ko}` })));
  const famBy = (m) => famAll.filter((f) => f.mode === m).length;
  const failed = U_.filter((u) => u.problems.length);
  const over = U_.filter((u) => u.boxGz > UNIT_GZ_MAX), big = U_.filter((u) => u.gz > UNIT_GZ_MAX);
  const qs = (arr, p) => { const v = [...arr].sort((a, b) => a - b); return v[Math.floor((v.length - 1) * p)]; };
  const emdSummary = {
    units: U_.length, dongs: tot((u) => u.n), lessons: tot((u) => u.lessons), sizes: sizeAll, small: [1, 2, 3].map((k) => sizeAll[k] ?? 0),
    tapFailLessons: tot((u) => u.lessonList.filter((l) => l.minTapPx < 16).length), failedUnits: failed.length, over7: tot((u) => u.lessonList.filter((l) => l.items.length > 7).length), disconnected: tot((u) => u.disconnected),
    virtualLessons: tot((u) => u.virtualLessons), mixLessons: tot((u) => u.mixLessons),
    islands: tot((u) => u.islands), islandLessons: tot((u) => u.islandLessons), insetSingles: tot((u) => u.insetSingles), virtual: tot((u) => u.virtual),
    farIsles: tot((u) => u.far), keptIsles: tot((u) => u.kept),
    families: famAll.length, famWhole: famBy('whole'), famSplit: famBy('split'), famSplitGap: famBy('split-gap'), famFolded: famBy('folded'), famSpread: famAll.filter((f) => f.broken).length,
    center: tot((u) => u.center), renamed: tot((u) => u.renamed), suffixed: tot((u) => u.suffixed), nameFailUnits: U_.filter((u) => u.problemKinds.includes('name')).length,
    screens: tot((u) => u.screens), screensMax: Math.max(...U_.map((u) => u.screens)), screenFail: tot((u) => u.screenList.filter((s) => s.minTapPx < 16).length),
    gz: { median: qs(U_.map((u) => u.gz), 0.5), p90: qs(U_.map((u) => u.gz), 0.9), max: Math.max(...U_.map((u) => u.gz)), sum: tot((u) => u.gz) },
    boxOver40: over.length, bigUnits: big.length, ptsMax: Math.max(...U_.map((u) => u.pts.total)),
  };
  report.emdSummary = emdSummary;
  fs.writeFileSync(path.join(REPORT_DIR, 'dry-all.json'), JSON.stringify(report, null, 1) + '\n');
  const ES = emdSummary;
  const unitMd = [
    '', '## 동 단원 256(계획서 E3)', '',
    `- 단원 ${ES.units} · 동 ${ES.dongs} · 과 ${ES.lessons} (곳 수별 ${Object.entries(ES.sizes).map(([k, v]) => `${k}곳 ${v}`).join(' · ')})`,
    `- **1·2·3곳 과 ${ES.small.join(' · ')}** · 8곳 넘는 과(외톨이를 맞닿은 과에 합친 마지막 수단) ${ES.over7} · 16px 미만 과 ${ES.tapFailLessons} · 문제가 남은 단원 **${ES.failedUnits}**`,
    `- 맞닿음: 실제로 맞닿지 않은 곳이 섞인 과 ${ES.disconnected}(가상 이웃은 이웃으로 치지 않음) · 가상 이웃(단원 안에 맞닿은 동이 없어 가까운 동과 이어 친 곳)이 든 과 ${ES.virtualLessons} · 동과 읍·면을 따로 묶은 단원에서 다른 무리의 곳이 든 섞인 과 ${ES.mixLessons}`,
    `- 섬: 먼 섬 동 ${ES.islands} · 섬 과 ${ES.islandLessons} · 섬 하나를 가까운 과의 섬 상자로 넣은 과 ${ES.insetSingles} · 맞닿은 동이 없어 가까운 동과 이어 묶은 곳 ${ES.virtual}`,
    `- 섬 상자(D2 — 2026-11-16): 지역 표 far 규칙의 먼 섬 ${ES.farIsles}곳만 상자에 두고 가까운 섬은 본 지도로 옮긴다. **16px 때문에 상자에 남은 가까운 섬 ${ES.keptIsles}곳**: ${U_.filter((u) => u.kept).map((u) => `${u.sidoKo} ${u.ko} ${u.kept}`).join(' · ') || '없음'}`,
    `- 숫자 가족(2곳 이상) ${ES.families}: 한 과 그대로 ${ES.famWhole} · 8곳 이상이라 번호가 이어지게 나눔 ${ES.famSplit} · 8곳 이상인데 번호가 이어지게 자를 자리가 없어 반으로 자름(번호가 끊기거나 빠짐) ${ES.famSplitGap} · 서로 맞닿지 않아 규칙을 접음(맞닿은 조각만 묶음) ${ES.famFolded} · 한 과에 모으려던 조각이 16px 검사로 갈라진 가족 ${ES.famSpread}`,
    `- 과 이름: '가운데' ${ES.center}과 · 겹친 이름을 상대 방위로 고친 과 ${ES.renamed} · 그래도 겹쳐 동 이름을 붙인 과 ${ES.suffixed} · 이름 검사에 걸린 단원 ${ES.nameFailUnits}`,
    '- 과 이름 검사 기준(N7): 이름은 이름표 점의 넓이 가중 중심으로 짓고(과 2~3개면 과 중심들의 평균에서 본 상대 방위, 4개 이상이면 기준 상자 9칸, \'가운데\'는 다른 과가 세 방향 이상에서 둘러쌀 때만이고 아니면 열린 쪽 방위), 검사는 **실제 칠한 넓이 중심**으로 따로 잰다 — 방위 낱말은 과 넓이 중심이 무리의 나머지 곳들의 넓이 중심에서 그 방향 ±60도이고 둘 사이가 무리 등가 반지름의 0.1배보다 멀 것, \'가운데\'는 과 넓이 중심이 무리 넓이 중심에서 등가 반지름의 0.35배 안. 규칙 이름이 검사에 걸리면 후보 방위(9칸·열린 쪽·상대 방위·한 칸 옆) 가운데 검사를 지나는 첫 것으로 바꾸고, 겹친 이름을 풀 때도 검사를 지나는 이름만 쓴다. 후보가 다 걸리면 규칙 이름 그대로 두고 문제로 남긴다',
    `- 넓은 화면 ${ES.screens}(단원당 최대 ${ES.screensMax}) · 16px 미만 화면 ${ES.screenFail}`,
    `- 단원 파일 gz: 중앙 ${kb(ES.gz.median)} · 90% ${kb(ES.gz.p90)} · 최대 ${kb(ES.gz.max)}KB · 합 ${kb(ES.gz.sum)}KB · 이웃 땅 15% 상자로 40KB 넘음 ${ES.boxOver40} → 맞닿은 시·군·구로 줄여도 넘음(큰 단원) **${ES.bigUnits}** · 고리 점 최대 ${ES.ptsMax}`,
    '', '### 시·도별', '',
    '| 시·도 | 단원 | 동 | 과 | 1·2·3곳 과 | 과 최소 칸 | 넓은 화면 | 섬 동 / 섬 과 | 가족(그대로·나눔·접음) | gz 최대 KB | 문제 단원 |', '|---|---|---|---|---|---|---|---|---|---|---|',
    ...SIDO.map((s) => {
      const r = U_.filter((u) => u.sido === s.code), sm = [0, 1, 2].map((i) => r.reduce((t, u) => t + u.small[i], 0)), fam = r.flatMap((u) => u.families);
      return `| ${s.ko} | ${r.length} | ${r.reduce((t, u) => t + u.n, 0)} | ${r.reduce((t, u) => t + u.lessons, 0)} | ${sm.join('·')} | ${Math.min(...r.map((u) => u.minTapPx))}px | ${r.reduce((t, u) => t + u.screens, 0)} | ${r.reduce((t, u) => t + u.islands, 0)} / ${r.reduce((t, u) => t + u.islandLessons, 0)} | ${['whole', 'split', 'folded'].map((m) => fam.filter((f) => f.mode === m).length).join('·')} | ${kb(Math.max(...r.map((u) => u.gz)))} | ${r.filter((u) => u.problems.length).length} |`;
    }),
    '', '### 문제가 남은 단원', '',
    ...(failed.length ? failed.map((u) => `- ${u.sidoKo} ${u.ko}: ${u.problems.join(' / ')}`) : ['- 없음']),
    '', '### 단원 파일 40KB 넘는 단원(이웃 땅 15% 상자 → 맞닿은 시·군·구)', '',
    ...(over.length ? over.map((u) => `- ${u.sidoKo} ${u.ko}: ${kb(u.boxGz)} → ${kb(u.gz)}KB${u.gz > UNIT_GZ_MAX ? ' **큰 단원**' : ''} · 고리 점 ${u.pts.total}`) : ['- 없음']),
    '', '### 섬 과가 있는 단원', '',
    ...U_.filter((u) => u.islands).map((u) => `- ${u.sidoKo} ${u.ko}: 먼 섬 동 ${u.islands} · ${u.lessonList.filter((l) => l.insets).map((l) => `${l.no}과 ${l.title}(${l.items.join('·')}${l.insets < l.items.length ? `, 섬 상자 ${l.insets}` : ''})`).join(' / ')}`),
    '', '### 숫자 가족 처리(나눔·접음만)', '',
    ...famAll.filter((f) => f.mode !== 'whole').map((f) => `- ${f.unit} ${f.root}(${f.size}곳): ${{ split: '번호가 이어지게 나눔', 'split-gap': '**이어지게 자를 자리가 없어 반으로 자름**', folded: '맞닿지 않아 접음' }[f.mode]} → 조각 ${f.parts.join('+') || '없음(모두 1곳씩)'} · 과 ${f.lessons}개`),
    '', '### 맞닿음·무리가 어긋난 과(E7·E13 기준을 정할 때 함께 볼 목록)', '',
    ...(() => {
      const rows = U_.flatMap((u) => u.lessonList.filter((l) => l.apart || l.virtual || l.group === 'mix' || l.items.length > 7)
        .map((l) => `- ${u.sidoKo} ${u.ko} ${l.no}과 '${l.title}'(${l.items.join('·')}): ${[l.apart && '실제로 맞닿지 않은 곳이 섞임', l.virtual && !l.apart && '가상 이웃으로만 이어짐', l.group === 'mix' && '동·읍면 섞임', l.items.length > 7 && `${l.items.length}곳`].filter(Boolean).join(' · ')}`));
      return rows.length ? rows : ['- 없음'];
    })(),
    '', '### 단원별', '',
    '| 시·도 | 단원 | 동(동/읍/면) | 과 | 곳 수별 | 과 최소 칸 | 모호 칸 | 넓은 화면(최소 칸) | 섬 동/과 | gz KB(범위) | 고리 점 |', '|---|---|---|---|---|---|---|---|---|---|---|',
    ...U_.map((u) => `| ${u.sidoKo} | ${u.ko} | ${u.n}(${u.kinds.dong}/${u.kinds.eup}/${u.kinds.myeon}) | ${u.lessons} | ${Object.entries(u.sizes).map(([k, v]) => `${k}×${v}`).join(' ')} | ${u.minTapPx}${u.minTapPx < 16 ? ' **실패**' : ''} | ${u.ambiguous} | ${u.screens}(${u.screenMinTapPx}) | ${u.islands}/${u.islandLessons} | ${kb(u.gz)}${u.scope === 'touch' ? (u.allIsland ? '(모두 섬 — 맞닿음)' : `(맞닿음, 상자 ${kb(u.boxGz)})`) : ''} | ${u.pts.total} |`),
    '', '## 시·군·구 과 이름 지도 검사(N7, 보고만)', '',
    '- 동 과 이름과 같은 검사: 방위 낱말은 과의 실제 넓이 중심이 지역의 나머지 칸들의 넓이 중심에서 그 방향 ±60도이고 둘 사이가 지역 등가 반지름의 0.1배보다 멀 것, \'가운데\'는 지역 넓이 중심에서 등가 반지름의 0.35배 안, \'끝\'은 모든 곳이 지역 바깥 경계에 닿아야 통과.', '',
    ...titleRows.map((t) => `- ${t.region} ${t.no}과 '${t.title}': ${t.fails.length ? `**걸림** ${t.fails.join(' / ')}` : '통과'}`),
  ];
  const farLine = (rows, code) => rows[code].map((x) => `${x.name}${x.whole ? '(통째)' : `(${x.far}/${x.all})`}`).join(', ');
  const md = [
    '# 전국 점검 보고(--dry-all)', '',
    `- 원자료: ${SOURCE.file} · 판 ${VER} · 실행 ${report.ran} · **${seconds}초**`,
    `- 공개 지역(검사 실패 = 0 이 아닌 값으로 끝남): ${report.live.join(', ')} · 공개 지역 실패 ${errors.length}건 · 다른 시·도 실패(보고만) ${issues.length}건`,
    `- 합계: 시·도 ${report.total.sido} · 시·군·구 ${report.total.sgg}(일반구 단위) / ${report.total.si}(첫 공부 층) · 읍·면·동 ${report.total.emd}(읍 ${report.total.eup} · 면 ${report.total.myeon} · 동 ${report.total.dong})`,
    `- 이웃 쌍: 동 ${report.pairs.emd} · 시군구 ${report.pairs.sgg} · 시 층 ${report.pairs.si} · 비대칭 동 ${asym.emd} · 시군구 ${asym.sgg} · 시 층 ${asym.si}`
      + ` · 자기 자신이 이웃으로 잡혀 뺀 곳 ${selfLoops.length}${selfLoops.length ? `(${selfLoops.map((x) => `${x.layer} ${nameOfId[x.id] ?? ''} ${x.id}`).join(', ')})` : ''}`,
    '', '## 시·도별', '',
    '| 시·도 | 상태 | 층 | 시·군·구 sgg/si (기대) | 읍·면·동 (읍/면/동, 기대) | 한 화면 최소 칸 sgg 층 | si 층 | -sgg 추정 gz KB (지금 파일) | 고리 점 = 칸+이웃 땅+강 | -emd gz KB |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...sidos.map((r) => `| ${r.ko} | ${r.status} | ${r.layer} | ${r.count.sgg}/${r.count.si} (${r.expect.sgg}/${r.expect.si})${r.countOk ? '' : ' **다름**'} | ${r.count.emd} (${r.count.eup}/${r.count.myeon}/${r.count.dong}, ${r.expect.emd}) | ${px(r.wide.sgg)} | ${px(r.wide.si)} | ${kb(r.sgg.gz)}${r.sggNow ? ` (${kb(r.sggNow.gz)})` : ''} | ${r.sgg.drawPts} = ${r.sgg.cellPts}+${r.sgg.outPts}+${r.sgg.waterPts}${r.sggNow ? ` · 지금 ${r.sggNow.drawPts}` : ''} | ${kb(r.emd.gz)} |`),
    '', '- 한 화면 최소 칸: 358×440, 여백 0, 먼 섬 뺀 상자. 16px 미만이 공개 기준 실패(넓은 화면은 나눠서 맞춤). 통째로 먼 섬인 곳은 상자와 최소 칸에서 빼고 \'섬 상자\'로 적는다.',
    '- -sgg 추정: 전국 한 위상(이웃 땅 = 다른 시·도 전부 + 북한 + 일본 대마도(상자 안에 들 때 — 경남), 강 띠·lp 포함)으로 지역 상자(통째로 먼 섬 뺌) 30% 넓혀 자르고 simplifySggM 으로 단순화. 기본 실행도 같은 위상이라 공개 지역은 추정 = 지금 판 폴더의 파일(괄호 안·지금 값).',
    '', '## 공개 지역 과(공통 완료 조건 2)', '',
    // 과 없는 지역(layer emd — 세종, N4 · E12)은 시·군·구 과가 없다 — 동 단원 줄(아래 표)이 주 단원
    ...sidos.filter((r) => r.lessons && r.layer === 'emd').map((r) => `- ${r.ko}: 과 없는 지역(시·군·구 과 없음 — 동 단원이 주 단원, 아래 동 단원 표)`),
    ...sidos.filter((r) => r.lessons && r.layer !== 'emd').map((r) => `- ${r.ko}: 과 ${r.lessons.count} · 1곳 ${r.lessons.small[0]} · 2곳 ${r.lessons.small[1]} · 3곳 ${r.lessons.small[2]} 과`
      + ` (곳 수별 ${Object.entries(r.lessons.bySize).map(([n, c]) => `${n}곳 ${c}`).join(' · ')}) · 과 화면 최소 칸 ${r.lessons.minTapPx}px · 모호(16~24px) 칸 ${r.lessons.ambiguous}`
      + ` · 넓은 화면 ${r.lessons.screens.map((v) => `${v.ko} ${v.minTapPx}px${v.ambiguous ? `(모호 ${v.ambiguous})` : ''}`).join(' · ')}`),
    ...unitMd,
    '', '## 통째로 먼 섬인 시·군·구(섬 상자 따로, E14)', '',
    ...(islandRows.length ? islandRows.map((x) => `- ${x.name} (${x.id})`) : ['- 없음']),
    '', '## 땅으로 맞닿은 이웃이 없는 시·군·구', '',
    ...lonelyRows.map((x) => `- ${x.name} (${x.id})${x.sea ? ' — 바다 건너 이웃 손표 있음' : ''}${x.lonelyOk ? ' — 지역 표 lonelyOk' : ''}${!x.sea && !x.lonelyOk ? ' — 손표 없음' : ''}`),
    '', '## 먼 섬(덩어리 기준, 시·도별 규칙)', '',
    ...SIDO.filter((s) => farRows[s.code]).map((s) => `- ${s.ko}(${s.far?.lonLt != null ? `경도 ${s.far.lonLt} 서쪽` : '가장 큰 땅 상자 +30km 밖'}): ${farLine(farRows, s.code)}`),
    '', '## 기본 규칙(가장 큰 땅 상자 +30km 밖)으로 다시 잰 값 — far 규칙을 따로 둔 시·도(공개 지역)', '',
    '| 시·도 | 먼 섬(기본 규칙) | 한 화면 최소 칸 sgg 층 (지역 표 규칙) | si 층 (지역 표 규칙) |', '|---|---|---|---|',
    ...sidos.filter((r) => r.wideDefault).map((r) => `| ${r.ko} | ${farRowsDefault[r.code] ? farLine(farRowsDefault, r.code) : '없음'} | ${px(r.wideDefault.sgg)} (${px(r.wide.sgg)}) | ${px(r.wideDefault.si)}${r.wide.si ? ` (${px(r.wide.si)})` : ''} |`),
    '', '- 괄호 안은 지역 표 규칙(운영 기본 실행이 쓰는 값, 경도 125.9)으로 잰 값이다.',
    '', '## 점검 좌표', '',
    '| 이름 | 시·도 | 점(경도, 위도) | 정하는 법 | 기대 | 결과 | |', '|---|---|---|---|---|---|---|',
    ...probeResults.map((p) => `| ${p.name}${p.dryAll ? ' ★' : ''} | ${SIDO_BY_CODE[p.sido].ko} | ${p.lon}, ${p.lat} | ${p.rule ? `${p.rule.sgg} ${p.rule.emd} ${{ largest: '가장 큰', east: '가장 동쪽', south: '가장 남쪽' }[p.rule.pick]} 덩어리` : '좌표'} | ${p.want ?? '물'} | ${p.got ?? '물'} | ${p.ok ? '통과' : '**실패**'} |`),
    '', '- ★ 전국 점검 6(독도·울릉도·마라도·추자도·흑산도·백령도). 단순화(5m) 뒤 시·군·구 칸 안에 남는지 본다.',
    '', '## 실패', '',
    ...(errors.length ? errors.map((e) => `- 공개 지역: ${e}`) : ['- 공개 지역: 없음']),
    ...(issues.length ? issues.map((x) => `- ${SIDO_BY_CODE[x.sido]?.ko ?? x.sido}(보고만): ${x.msg}`) : ['- 다른 시·도: 없음']),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(REPORT_DIR, 'dry-all.md'), md);
  console.log(`\n보고서: ${path.relative(ROOT, REPORT_DIR)}/dry-all.json · dry-all.md (${seconds}초)`);
  console.log(`합계 시·도 ${report.total.sido} · 시·군·구 ${report.total.sgg}/${report.total.si} · 읍·면·동 ${report.total.emd}(${report.total.eup}/${report.total.myeon}/${report.total.dong}) · 이웃 쌍 ${report.pairs.emd}/${report.pairs.sgg}/${report.pairs.si}`);
  console.log(`동 단원 ${ES.units} · 과 ${ES.lessons} · 1·2·3곳 과 ${ES.small.join('/')} · 16px 미만 과 ${ES.tapFailLessons} · 문제 단원 ${ES.failedUnits} · 섬 과 ${ES.islandLessons} · 단원 파일 gz 최대 ${kb(ES.gz.max)}KB(40KB 넘음 ${ES.boxOver40} → 큰 단원 ${ES.bigUnits})`);
  if (errors.length) { for (const e of errors) console.error('실패 ' + e); console.error(`공개 지역 검사 실패 ${errors.length}건`); process.exit(1); }
  console.log('완료(저장소에 쓴 파일 없음)');
  process.exit(0);
}

// 공개 지역 밖 검사 실패(보고만): 기본 실행도 전국을 계산하므로 공개가 아닌 시·도의 실패(바다 건너 이웃 손표가 아직 없는 완도·진도·거제·남해 등)가
// 여기에 나온다. 조용히 사라지지 않게 화면에만 찍는다(manifest 기록에는 넣지 않음). 그 시·도를 공개하는 단계에서 실패로 바뀐다
if (issues.length) { console.log(`  공개 지역 밖 검사 실패(보고만) ${issues.length}건`); for (const x of issues) console.log(`    ${SIDO_BY_CODE[x.sido]?.ko ?? x.sido}: ${x.msg}`); }
if (errors.length) { for (const e of errors) console.error('실패 ' + e); console.error(`검사 실패 ${errors.length}건 — 아무것도 쓰지 않았습니다`); process.exit(1); }

/* ---------- 10 내보내기(공개 지역만): mapshaper 계산까지 모두 메모리에서 끝낸 뒤 맨 끝에 한꺼번에 쓴다 ---------- */
const outFiles = [];   // 판 폴더에 쓸 [이름, 내용]. manifest.json 은 맨 끝에 더한다
const files = {};
const put = (name, text) => { outFiles.push([name, text]); files[name] = { bytes: Buffer.byteLength(text), gzip: gz(text) }; };

const svgSource = {};
const CONTEXT_JP = [];   // 일본 땅(대마도)이 이웃 땅으로 실린 공개 지역 key(E15)
// 지역 경계 파일: 공개 지역 + (미리보기면) 임시 과 지역. 정적 쪽 SVG 의 바탕(svgSource)은 공개 지역만
for (const R of OPEN_REGIONS) {
  const T = await regionSgg(R.sido, R.layer, sggSimplifyOf(R.sido));
  const text = JSON.stringify(T);
  put(`${R.key}-sgg.topo.json`, text);
  // 공통 완료 조건 2: 파일 gz 와 고리 점(칸 + 이웃 땅 + 강)
  const ring = ringOf(T, R.layer === 'si' ? 'si' : 'sgg');
  note(`${R.ko} 지역 경계 파일: gz ${kb(gz(text))}KB · 고리 점 ${ring.total} = 칸 ${ring.cell} + 이웃 땅 ${ring.out} + 강 ${ring.water} · 먼 땅 ${ring.far} · 이웃 땅 ${(T.objects.out?.geometries ?? []).map((g) => g.properties.name).join('·')}`);
  // 일본 땅(대마도)이 실린 공개 지역(manifest context_jp — 출처 쪽 '이웃 땅' 항목이 읽는다)
  if (!R.preview && (T.objects.out?.geometries ?? []).some((g) => g.properties.sido === 'jp')) CONTEXT_JP.push(R.key);
  // 과 없는 지역(layer emd — 세종)의 칸은 시·군·구 층(sgg)
  if (!R.preview) svgSource[R.key] = { items: topo.feature(T, T.objects[R.layer === 'si' ? 'si' : 'sgg']), water: T.objects.water ? topo.feature(T, T.objects.water) : { features: [] }, out: topo.feature(T, T.objects.out) };
  // {지역}-emd.topo.json·labels-emd·neighbors-emd 는 E5 부터 내보내지 않는다: 동은 단원 파일(emd/{코드}.*)로만 받고, 실험실·시험도 단원 파일을 쓴다.
  // 앞 판 폴더(.1)에는 남아 있다(옛 앱은 이 파일을 읽지 않았다 — 실험실·시험만 썼음). emdTopo 는 --dry-all 크기 보고가 쓴다
}
// 이웃·이름표는 공개 지역 곳만(열쇠와 목록 모두). 전국 위상에서 공개 지역 칸이 다른 시·도 칸과 맞닿은 쌍은 내보내지 않는다(.1 판과 같은 뜻 — 앱은 공개 지역 밖 곳을 모른다)
// 미리보기(E8)면 임시 과 지역의 곳도(isOpenId — 기본 실행은 공개 지역과 같다)
const liveNb = (map) => Object.fromEntries(Object.entries(map).filter(([k]) => isOpenId(k)).map(([k, l]) => [k, l.filter(isOpenId)]));
const liveSea = Object.fromEntries(Object.entries(neighbors.sea).filter(([k]) => isOpenId(k)).map(([k, l]) => [k, l.filter((x) => isOpenId(x.id))]).filter(([, l]) => l.length));
const isEmd = (id) => id.startsWith('kr:emd:');
const liveLabels = Object.entries(labels).filter(([id]) => isOpenId(id));
put('neighbors.json', JSON.stringify({ sgg: liveNb(neighbors.sgg), si: liveNb(neighbors.si), sea: liveSea }));
put('labels.json', JSON.stringify(Object.fromEntries(liveLabels.filter(([id]) => !isEmd(id)))));
// 전국 시·도 지도(계획서 N23 · E8): 지역 고르기와 시·도 단원(korea)이 함께 쓴다. 시·도 16 칸(T1 sido 층, 강 띠 자르기 전) + 북한(맥락 땅)을
// SIDO_MAP_M 으로 단순화한다. 섬 필터는 쓰지 않는다. 단순화에서 사라지는 점검 섬(독도·마라도 — 경북·제주의 덩어리 가운데 가장 동쪽·가장 남쪽 덩어리 묶음)은
// 원래 모양(5m)을 덧붙인다. 칸마다 이름표 점 l: [경도, 위도, 내접원 m](labels.json 에는 넣지 않음). 운영에도 쓴다(새 파일 — 판 그대로, N18)
const SIDO_MAP_M = 400, SIDO_MAP_GZ_MAX = 35 * 1024;
{
  const src = topo.feature(T1, T1.objects.sido).features.map((f) => ({ type: 'Feature', geometry: f.geometry, properties: { id: SIDO_KEY(f.properties.sido), name: f.properties.sidoName, sido: f.properties.sido } }));
  // 맥락 땅은 북한만(E15 의 일본 대마도는 넣지 않는다 — 지역 고르기·시·도 단원 지도는 E10 그대로)
  const out = { type: 'FeatureCollection', features: L.out.features.filter((f) => f.properties.sido === 'kp').map((f) => ({ type: 'Feature', geometry: f.geometry, properties: { sido: 'kp', name: '북한' } })) };
  const r = await ms(`-i sido.json out.json combine-files -clip target=out bbox=123.5,37.4,132.6,39.4 -simplify interval=${SIDO_MAP_M} keep-shapes target=* `
    + '-o format=geojson geojson-type=FeatureCollection target=sido s.json -o format=geojson geojson-type=FeatureCollection target=out o.json',
    { 'sido.json': JSON.stringify({ type: 'FeatureCollection', features: src }), 'out.json': JSON.stringify(out) });
  const simp = fcOf(r['s.json']);
  // 점검 섬 덧붙이기: 바깥 고리 평균이 기준 너머인 덩어리 묶음(독도 = 경북에서 동경 131.8 동쪽 · 마라도 = 제주에서 북위 33.13 남쪽 — 원자료 덩어리로 확인)
  const KEEP = [{ name: '독도', sido: '47', pick: (p) => p[0].reduce((s, c) => s + c[0], 0) / p[0].length > 131.8 }, { name: '마라도', sido: '50', pick: (p) => p[0].reduce((s, c) => s + c[1], 0) / p[0].length < 33.13 }];
  const kept = [];
  for (const k of KEEP) {
    const orig = src.find((f) => f.properties.sido === k.sido), dst = simp.features.find((f) => f.properties.sido === k.sido);
    const add = polysOf(orig.geometry).filter(k.pick);
    // 검사 관문 뒤라 fail 대신 멈춘다(아직 아무것도 쓰지 않았다)
    if (!add.length) throw new Error(`전국 시·도 지도: 원자료 ${k.name} 덩어리를 못 찾음`);
    dst.geometry = { type: 'MultiPolygon', coordinates: [...polysOf(dst.geometry), ...add] };
    kept.push(`${k.name} ${add.length}덩어리`);
  }
  const t = await ms(`-i sido.json out.json combine-files -o format=topojson quantization=${QUANT} target=* map.json`, { 'sido.json': JSON.stringify(simp), 'out.json': String(r['o.json']) });
  const T = JSON.parse(String(t['map.json']));
  T.objects.sido.geometries.forEach((g) => { g.properties = { id: g.properties.id, name: g.properties.name, sido: g.properties.sido, l: SIDO_M.labels[g.properties.id] }; });
  if (T.objects.out) T.objects.out.geometries = T.objects.out.geometries.filter((g) => g.type);
  // 먼 이웃 땅(far 층 — 2026-11-17 바다 표현): 나라 안은 모두 칸이라 나라 밖 땅만(북위 39.4도 위 북한·일본·중국·러시아). 범위는 시·도 단원(korea)의 전체·과·넓은 화면
  {
    const b = KOREA ?? { fit: unionLL(L.sgg.features.map((f) => f.properties.sggId), 'all'), lessons: [], screens: [] };
    const wide = farBox({ whole: [b.fit], part: [...b.lessons.map((l) => l.fit), ...b.screens.map((s) => s.fit)] });
    // 예산(SIDO_MAP_GZ_MAX)을 넘으면 간격을 한 단계씩 올린다(나라 밖 땅은 화면 가장자리 배경)
    const bare = JSON.stringify(T);
    for (const step of FAR_STEPS.filter((s) => s >= farStep(wide, FAR_PX_KOREA))) {
      const withFar = addFar(JSON.parse(bare), await farLand(wide, () => true, step));
      T.arcs = withFar.arcs;
      if (withFar.objects.far) T.objects.far = withFar.objects.far; else delete T.objects.far;
      if (gz(JSON.stringify(T)) <= SIDO_MAP_GZ_MAX - 1024) break;
    }
  }
  const ids = T.objects.sido.geometries.map((g) => g.properties.id);
  if (ids.length !== SIDO.length || ids.some((id) => !SIDO_M.labels[id])) throw new Error(`전국 시·도 지도: 칸 ${ids.length}(기대 ${SIDO.length}) 또는 이름표 점 없음`);
  // 점검 섬(계획서 E10 완료 조건 2 · N23): 독도·울릉도·마라도·백령도의 점검 점(pipeline/data/probes.json — 원자료 덩어리의 polylabel 점, 백령도는 좌표)이
  // 단순화한 지도에서도 그 시·도 칸 안에 남는다(덩어리가 사라지거나 어긋나면 멈춤). 시·도마다 이름표 점 l 도 자기 칸 안에 있다(시·도 단원 문제의 '이 칸'이 그 칸)
  const cellOf = new Map(topo.feature(T, T.objects.sido).features.map((f) => [f.properties.id, polysOf(f.geometry).map((p) => p.map((r) => r.map(toM)))]));
  const inCell = (id, lon, lat) => { const [x, y] = toM([lon, lat]); return (cellOf.get(id) || []).some((p) => inside(x, y, p)); };
  for (const nm of ['독도', '울릉도', '마라도', '백령도']) {
    const p = probeResults.find((x) => x.name === nm);
    if (!p || !inCell(SIDO_KEY(p.sido), p.lon, p.lat)) throw new Error(`전국 시·도 지도: ${nm} 점검 점이 ${p ? SIDO_BY_CODE[p.sido].ko : '?'} 칸 안에 없음(덩어리가 단순화에서 사라졌거나 어긋남)`);
  }
  const offLabel = ids.filter((id) => !inCell(id, SIDO_M.labels[id][0], SIDO_M.labels[id][1]));
  if (offLabel.length) throw new Error(`전국 시·도 지도: 이름표 점이 자기 칸 밖 ${offLabel.join(', ')}`);
  kept.push('점검 점 독도·울릉도·마라도·백령도와 이름표 점 16곳이 칸 안');
  // 범위(앱 pages.ts KOREA_FIT 과 같아야 한다 — 단위 시험이 견줌)
  let bb = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of topo.feature(T, T.objects.sido).features) for (const p of polysOf(f.geometry)) for (const [x, y] of p[0]) bb = [Math.min(bb[0], x), Math.min(bb[1], y), Math.max(bb[2], x), Math.max(bb[3], y)];
  const text = JSON.stringify(T);
  if (gz(text) > SIDO_MAP_GZ_MAX) throw new Error(`전국 시·도 지도: gz ${kb(gz(text))}KB(>${kb(SIDO_MAP_GZ_MAX)}KB, 7절 예산)`);
  put('sido.topo.json', text);
  const ring = ringOf(T, 'sido');
  note(`전국 시·도 지도(${SIDO_MAP_M}m): gz ${kb(gz(text))}KB · 고리 점 ${ring.total} = 칸 ${ring.cell} + 이웃 땅 ${ring.out} · 먼 땅 ${ring.far} · 덧붙인 점검 섬 ${kept.join('·')} · 범위 [${bb.map((v) => v.toFixed(4)).join(', ')}]`);
}
// 같은 이름 시·군·구(계획서 2.3 · N12 · E11): 전국에서 두 시·도 이상에 있는 시·군·구 이름(중구 5·동구 5·서구 4·남구 4·북구 4·강서구 2·고성군 2 = 26곳).
// 앱은 지역이 섞이는 화면(오늘 복습·복습 목록)에서 이 이름의 곳·동 단원에 시·도 이름을 붙인다('부산 중구' — 아직 연 지역에 겹치는 곳이 없어도 같은 이름이면).
// 일반구('포항시 남구')는 시 이름이 붙은 이름이라 들지 않는다. 옛 앱이 모르는 필드라 판은 그대로(N18)
const SAME_NAMES = (() => {
  const by = new Map();
  for (const f of L.sgg.features) { const n = f.properties.sggName; if (!by.has(n)) by.set(n, new Set()); by.get(n).add(f.properties.sido); }
  return [...by].filter(([, s]) => s.size > 1).map(([n]) => n).sort((a, b) => a.localeCompare(b, 'ko'));
})();
note(`같은 이름 시·군·구(전국): ${SAME_NAMES.map((n) => `${n} ${L.sgg.features.filter((f) => f.properties.sggName === n).length}`).join(' · ')} = ${L.sgg.features.filter((f) => SAME_NAMES.includes(f.properties.sggName)).length}곳`);
// emdUnits(계획서 N17: 단원 색인 = 단원 코드·이름·slug·동 수·과 수·동 slug 목록)는 동 단원이 켜진 지역(--preview 면 공개 지역 전부)만. 없으면 필드를 쓰지 않는다
// guUnits(계획서 N5 · E7): 일반구 단원이 켜진 지역(지역 표 gu live)만. 없으면 필드를 쓰지 않는다(옛 앱은 모르는 필드라 읽지 않는다 — 판 그대로, N18)
// enNames(영어 동 공부 설계안 5.1 · D105): 동 단원 파일·일반구 단원에 영어 이름이 있다는 표시 — 영어 앱은 이것이 있을 때만 동·일반구·시·도 단원을 켠다
// (배포 직후 캐시에 남은 옛 units.json 을 새 앱이 받으면 영어 화면은 지금처럼 셋을 끈다). 판은 그대로 .2(N18 — 옛 앱은 모르는 필드를 읽지 않는다)
put('units.json', JSON.stringify({ version: VER, enNames: true, regions: units, ...(Object.keys(emdIndex).length ? { emdUnits: emdIndex } : {}), ...(Object.keys(guIndex).length ? { guUnits: guIndex } : {}), ...(KOREA ? { korea: KOREA } : {}), sameNames: SAME_NAMES }));
// 동 단원 파일: 판 폴더 emd/{코드}.json · emd/{코드}.topo.json
if (emdUnitFiles.length) {
  const bigs = [], gzs = [], ptsMax = { n: 0, ko: '' }, gzMax = { n: 0, ko: '' };
  for (const [sggId, R] of emdUnitFiles) {
    const t = await unitTopoFit(sggId), j = unitJson(sggId, R);
    put(`emd/${j.code}.json`, JSON.stringify(j));
    put(`emd/${j.code}.topo.json`, t.text);
    gzs.push(t.gz);
    if (t.gz > UNIT_GZ_MAX) bigs.push(`${R.ko} ${j.ko} ${kb(t.gz)}KB`);
    if (t.pts.total > ptsMax.n) Object.assign(ptsMax, { n: t.pts.total, ko: `${R.ko} ${j.ko}` });
    if (t.gz > gzMax.n) Object.assign(gzMax, { n: t.gz, ko: `${R.ko} ${j.ko}` });
    if (t.scope === 'touch') note(`동 단원 파일 ${R.ko} ${j.ko}: ${t.allIsland ? '모든 곳이 섬 과라' : `이웃 땅 상자 ${kb(t.boxGz)}KB →`} 맞닿은 시·군·구로 줄여 ${kb(t.gz)}KB`);
  }
  note(`동 단원 파일 ${emdUnitFiles.length}쌍: .topo gz 중앙 ${kb([...gzs].sort((a, b) => a - b)[Math.floor((gzs.length - 1) / 2)])} · 최대 ${kb(gzMax.n)}KB(${gzMax.ko}) · 고리 점 최대 ${ptsMax.n}(${ptsMax.ko})${bigs.length ? ` · 40KB 넘는 큰 단원 ${bigs.join(', ')}` : ''}`);
}
// 시험용 단원 파일(tests/fixtures/emd): 내용은 판 폴더 단원 파일과 같은 꼴. 사이트에 나가지 않으므로 manifest.files 에 넣지 않는다
const fixtureFiles = [];
for (const sggId of FIXTURE_UNITS) {
  const R = REGIONS.find((r) => r.sido === sidoOfId(sggId));
  const t = await unitTopoFit(sggId), j = unitJson(sggId, R);
  fixtureFiles.push([`${j.code}.json`, JSON.stringify(j, null, 1) + '\n'], [`${j.code}.topo.json`, t.text]);
}
// 시·군·구·시 이름(정적 쪽 빌드 전용, 계획서 N17): 앱은 받지 않으므로 public 이 아니라 src/data/search-sgg.json 에 둔다(src/lib/geo.ts 가 읽음).
// .1 판 search.json 에서 읍·면·동 줄을 뺀 것과 같다(읍·면·동 이름은 정적 쪽 SVG 의 dongs 로 쓴다)
const SI_SIDOS = new Set(REGIONS.filter((r) => r.layer === 'si').map((r) => r.sido));
const liveSgg = L.sgg.features.filter((f) => LIVE_CODES.has(f.properties.sido));
const search = [
  ...liveSgg.map((f) => ({ id: f.properties.sggId, ko: f.properties.sggName, kind: 'sgg', region: f.properties.region, si: f.properties.siId })),
  // 일반구가 있는 시(경기 수원시 등)는 시군구 층에 없으므로 시 층(layer si)인 지역의 시 층에서 더한다
  ...L.si.features.filter((f) => SI_SIDOS.has(f.properties.sido) && !liveSgg.some((g) => g.properties.sggId === f.properties.siId)).map((f) => ({ id: f.properties.siId, ko: f.properties.siName, kind: 'si', region: f.properties.region })),
];
pending.push(['src/data/search-sgg.json', JSON.stringify({ _note: '공개 지역 시·군·구·시 이름(정적 쪽 빌드 전용, 앱은 받지 않음). pipeline/build-geo.mjs 가 만든다', version: VER, items: search }, null, 1) + '\n']);

// 정적 쪽용 SVG 경로와 곳마다 읍·면·동 목록(빌드 때 쓰고 사이트에 그대로 내보내지 않음): 지역별 시군구(·시) 층 + 강 + 이웃 땅.
// 쪽에 바로 넣으므로 지도 폭 1000 단위의 1단위(서울 약 40m·경기 약 150m)로 다시 단순화하고 좌표를 정수로 둔다
for (const R of REGIONS) {
  const key = R.layer === 'si' ? 'siId' : 'sggId';
  const src = svgSource[R.key];
  const b = boxUnion(src.items.features.map((f) => f.properties[key]), 'near');
  const W = 1000, s = W / (b[2] - b[0]), H = Math.round((b[3] - b[1]) * s);
  const simp = await ms(`-i items.json water.json out.json combine-files -simplify interval=${Math.round(1 / s)} keep-shapes target=* `
    + `-o format=geojson geojson-type=FeatureCollection target=items items_s.json -o format=geojson geojson-type=FeatureCollection target=water water_s.json -o format=geojson geojson-type=FeatureCollection target=out out_s.json`,
    { 'items.json': JSON.stringify(src.items), 'water.json': JSON.stringify(src.water), 'out.json': JSON.stringify(src.out) });
  const S = (n) => fcOf(simp[n]).features;
  const px = ([lon, lat]) => { const [x, y] = toM([lon, lat]); return [(x - b[0]) * s, (y - b[1]) * s]; };
  const d = (g) => polysOf(g).map((p) => p.map((r) => 'M' + r.map((c) => px(c).map((v) => Math.round(v)).join(' ')).join('L') + 'Z').join('')).join('');
  const emdOf = (id) => L.emd.features.filter((f) => f.properties[key] === id).map((f) => f.properties.name).sort((x, y) => x.localeCompare(y, 'ko'));
  const items = S('items_s.json').map((f) => {
    const id = f.properties[key];
    const [x, y] = px([labels[id][0], labels[id][1]]);
    const dongs = emdOf(id);
    // 경기 시 층: 일반구(수원시 장안구 등)가 있으면 이름만
    const gu = R.layer === 'si' ? L.sgg.features.filter((g) => g.properties.siId === id && g.properties.sggId !== id).map((g) => g.properties.sggName.replace(/^\S+ /, '')).sort((x2, y2) => x2.localeCompare(y2, 'ko')) : [];
    return { id, d: d(f.geometry), lx: Math.round(x), ly: Math.round(y), ir: +(labels[id][2] * s).toFixed(1), dongs, gu };
  });
  const water = S('water_s.json').map((f) => d(f.geometry)).join('');
  const out = S('out_s.json').map((f) => d(f.geometry)).join('');
  pending.push([`src/data/svg/${R.key}.json`, JSON.stringify({ version: VER, w: W, h: H, items, water, out })]);
  // 인천 개편 전 그림(가이드 G3): 지금 행정동을 옛 구(중구·동구·서구)로 묶어 같은 틀(W·H·축척)에 그린다.
  // 개편 전 판 경계를 그대로 쓰지 않는 것은 해안선이 판마다 달라 두 그림이 어긋나기 때문(위 면적 비교 참고)
  if (R.key === 'incheon' && INCHEON_REFORM) {
    // 묶음(동 → 옛 구)과 그 검사는 검사 관문 앞(인천 개편 확인)에서 했다
    const feats = L.emd.features.filter((f) => f.properties.sido === R.sido)
      .map((f) => ({ type: 'Feature', geometry: f.geometry, properties: { old: INCHEON_OLD_OF.get(f.properties.id) } }));
    const bo = await ms(`-i emd.json name=emd -dissolve old target=emd -simplify interval=${Math.round(1 / s)} keep-shapes `
      + `-o format=geojson geojson-type=FeatureCollection before.json`, { 'emd.json': JSON.stringify({ type: 'FeatureCollection', features: feats }) });
    const before = fcOf(bo['before.json']).features.map((f) => {
      const polysLL = polysOf(f.geometry);
      const polys = polysLL.map((p) => p.map((r) => r.map(toM)));
      const near = polys.filter((p, i) => !isFar(R.sido, polysLL[i], p));   // addLabels 와 같이 먼 섬은 빼고
      const big = (near.length ? near : polys).reduce((x, y) => (ringArea(y[0]) > ringArea(x[0]) ? y : x));
      const pl = polylabel(big, 50);
      return { id: `old:${f.properties.old}`, name: f.properties.old, d: d(f.geometry), lx: Math.round((pl[0] - b[0]) * s), ly: Math.round((pl[1] - b[1]) * s), ir: +(pl[2] * s).toFixed(1), dongs: [], gu: [] };
    });
    if (before.length !== 10) throw new Error(`인천 개편 전 군·구 ${before.length}곳(기대 10: 2군 8구)`);   // 관문 앞에서 확인했으므로 이중 안전(아직 아무것도 안 씀)
    pending.push(['src/data/svg/incheon-before.json', JSON.stringify({ version: VER, w: W, h: H, items: before, water, out })]);
    console.log(`  인천 개편 전 그림: ${before.map((x) => x.name).join('·')}`);
  }
}

// 원고-산출물 맞춤(계획서 N33): 손 원고·손 표·이 파일의 sha256. core.autocrlf=true 라 작업 트리(CRLF)와 Actions(LF)가 달라서 CRLF 를 LF 로 바꾼 바이트로 잰다.
// tests/unit/data-inputs.test.ts 가 지금 파일과 같은지 본다(원고를 고치고 파이프라인을 다시 돌리지 않으면 배포 점검이 막힌다)
const lfBytes = (buf) => { const out = Buffer.alloc(buf.length); let n = 0; for (let i = 0; i < buf.length; i++) if (!(buf[i] === 13 && buf[i + 1] === 10)) out[n++] = buf[i]; return out.subarray(0, n); };
const inputs = Object.fromEntries(INPUT_FILES.map((rel) => [rel, crypto.createHash('sha256').update(lfBytes(fs.readFileSync(path.join(ROOT, rel)))).digest('hex')]));
// manifest 의 files 에는 manifest 자신이 들지 않는다(.1 판과 같음). 판 폴더에서 맨 마지막에 쓴다
// --preview 출력에는 preview 를 붙인다(커밋 금지 표시 — tests/unit/emd-units.test.ts 가 이것과 판 폴더 emd/ 를 보고 막는다)
const manifestText = JSON.stringify({ version: VER, source: SOURCE, source_context: SOURCE_NE, built: new Date().toISOString().slice(0, 10), simplify_m: { emd: SIMPLIFY_M, sgg: SGG_SIMPLIFY_M, ...(Object.keys(SGG_SIMPLIFY_BY).length ? { sggBy: SGG_SIMPLIFY_BY } : {}) }, river_radius_m: RIVER_RADIUS_M, ...(CONTEXT_JP.length ? { context_jp: CONTEXT_JP } : {}), notes, files: { ...files }, inputs,
  ...(PREVIEW ? { preview: '미리보기(--preview) 출력 — 커밋·배포 금지. node pipeline/build-geo.mjs 를 다시 돌려 되돌릴 것' } : {}) }, null, 1);
put('manifest.json', manifestText);

/* ---------- 10(이어서) 쓰기: 여기까지 오면 계산은 모두 끝났다 ---------- */
// ① 새 파일을 모두 .cache/pipeline-tmp/stage 에 저장소와 같은 상대 경로로 먼저 다 쓴다(이 동안 저장소는 그대로).
//    src/data 파일 = 검사 전에 값만 만들어 둔 것(전국 요약·서울 법정동·동 대응표·인천 개편)과 검색 이름·정적 쪽 SVG. 판 폴더 안에서는 manifest.json 이 맨 끝
// ② 이름 바꾸기로 하나씩 넣는다: src/data 파일들 → 판 폴더(맨 끝). 자리에 있던 것은 .cache/pipeline-tmp/backup 으로 옮겨 둔다.
//    넣는 도중 하나라도 실패하면(예: E: 외장 드라이브가 끊김) 이미 넣은 것을 거꾸로 되돌려, src/data 와 판 폴더가 서로 다른 실행의 값으로 갈리지 않게 한다
//    (같은 판을 다시 돌린 경우 판 이름이 같아 시험으로는 이 어긋남을 못 잡는다)
// 앞 판 폴더(kr-20261001.1 등)는 건드리지 않는다(계획서 N18: 다음 배포 한 번까지 남김. 옛 앱·캐시가 아직 읽는다)
const STAGE = path.join(TMP_ROOT, 'stage'), BACKUP = path.join(TMP_ROOT, 'backup');
for (const d of [STAGE, BACKUP]) fs.rmSync(d, { recursive: true, force: true });
const outRel = path.relative(ROOT, OUT_DIR);
fs.mkdirSync(path.join(STAGE, outRel), { recursive: true });
for (const [name, text] of outFiles) { const p = path.join(STAGE, outRel, name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); }
for (const [rel, text] of pending) { const p = path.join(STAGE, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); }
// 시험용 단원 파일은 폴더째 바꿔 넣는다(시험 단원 목록이 바뀌어도 옛 파일이 남지 않게)
const FIX_REL = path.join('tests', 'fixtures', 'emd');
fs.mkdirSync(path.join(STAGE, FIX_REL), { recursive: true });
for (const [name, text] of fixtureFiles) fs.writeFileSync(path.join(STAGE, FIX_REL, name), text);
const swapped = [];   // 넣은 차례: [저장소 기준 경로, 자리에 앞 것이 있었는지]
try {
  for (const rel of [...pending.map(([r]) => r), FIX_REL, outRel]) {
    const dst = path.join(ROOT, rel), bak = path.join(BACKUP, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    const had = fs.existsSync(dst);
    if (had) { fs.mkdirSync(path.dirname(bak), { recursive: true }); fs.renameSync(dst, bak); }
    swapped.push([rel, had]);
    fs.renameSync(path.join(STAGE, rel), dst);
  }
} catch (e) {
  const stuck = [];
  for (const [rel, had] of swapped.reverse()) {
    const dst = path.join(ROOT, rel);
    try { fs.rmSync(dst, { recursive: true, force: true }); if (had) fs.renameSync(path.join(BACKUP, rel), dst); } catch { stuck.push(rel); }
  }
  console.error(`새 파일을 넣지 못했습니다(${e.code ?? e.message}). `
    + (stuck.length ? `되돌리지 못한 곳 ${stuck.length}: ${stuck.join(', ')} — 앞 내용은 ${path.relative(ROOT, BACKUP)} 에 있습니다` : `넣은 ${swapped.length}곳을 모두 되돌렸습니다(저장소는 실행 전 그대로)`));
  process.exit(1);
}
for (const d of [BACKUP, STAGE]) fs.rmSync(d, { recursive: true, force: true });

console.log('\n내보낸 파일(' + path.relative(ROOT, OUT_DIR) + '):');
for (const [n, s] of Object.entries(files)) if (!n.startsWith('emd/')) console.log(`  ${n.padEnd(22)} ${(s.bytes / 1024).toFixed(1).padStart(7)}KB  gzip ${(s.gzip / 1024).toFixed(1)}KB`);
const emdOut = Object.entries(files).filter(([n]) => n.startsWith('emd/'));
if (emdOut.length) console.log(`  emd/ 동 단원 파일 ${emdOut.length}개 ${(emdOut.reduce((t, [, s]) => t + s.bytes, 0) / 1024).toFixed(1)}KB  gzip ${(emdOut.reduce((t, [, s]) => t + s.gzip, 0) / 1024).toFixed(1)}KB${PREVIEW ? '  ← 미리보기: 커밋 금지, 기본 실행으로 되돌릴 것' : ''}`);
console.log(`src/data: ${pending.map(([rel]) => path.relative('src/data', rel).replace(/\\/g, '/')).join(', ')}`);
console.log(`시험용 단원 파일(${FIX_REL.replace(/\\/g, '/')}): ${fixtureFiles.map(([n]) => n).join(', ')}`);
const others = fs.readdirSync(path.dirname(OUT_DIR)).filter((n) => n !== VER);
if (others.length) console.log(`앞 판 폴더(그대로 둠): ${others.join(', ')}`);
console.log('완료');
