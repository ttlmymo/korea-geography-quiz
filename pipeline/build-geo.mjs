// 지도 데이터 만들기(설계서 8.3)
//  admdongkor 원본 → 수도권 거르기 → 이름 정리 → 단순화(5m, 작은 섬 남김) → 동·시군구·시·시도 합치기
//  → 이웃(공유 경계) → 한강 띠 잘라내기(이웃 계산 뒤) → 이름표 점·내접원 → 과 화면 검사 → 내보내기
// 쓰는 법: node pipeline/build-geo.mjs [원본 geojson 경로]   (원본은 저장소에 올리지 않는 .cache/ 에 둔다)
// 북한 땅은 Natural Earth 10m(공개 도메인)에서 가져와 이웃 땅 층에 넣는다(.cache/naturalearth-v5.1.2/)
// 검사 하나라도 실패하면 아무것도 쓰지 않고 1 로 끝난다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import mapshaper from 'mapshaper';
import * as topo from 'topojson-client';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VER = 'kr-20261001.1';
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
const RAW = process.argv[2] || path.join(ROOT, '.cache/admdongkor-20261001/HangJeongDong_ver20261001.geojson');
const NE_RAW = path.join(ROOT, '.cache/naturalearth-v5.1.2/ne_10m_admin_0_countries.geojson');
// 개편 전 인천(ver20260401) 비교용: 옛 사이트가 저장소에 올려 두었던 hjd/hjd_28_incheon.geojson(커밋 366cb73).
// 출시 때 옛 파일을 저장소에서 빼므로(설계서 결정 9) .cache 로 옮겨 두고 크기·해시로 확인한다
const SOURCE_OLD_INCHEON = { from: 'hjd/hjd_28_incheon.geojson (커밋 366cb73)', bytes: 84825, sha256: '7b774978881dff299438a0ecdd5a2f2aebe4bec52be84bf929a34cf522257ae2' };
const OLD_INCHEON = path.join(ROOT, '.cache/legacy-hjd/hjd_28_incheon.geojson');
const OUT_DIR = path.join(ROOT, 'public/data/geo', VER);
const SVG_DIR = path.join(ROOT, 'src/data/svg');
const UNITS = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/units.json'), 'utf8'));

const SIMPLIFY_M = 5;        // 단순화 간격(m)
const RIVER_RADIUS_M = 400;  // 한강 띠 반지름(m): 서울 구간 강폭 약 0.8~1.2km
const QUANT = 1e5;           // TopoJSON 양자화(지역 범위의 10만분의 1 ≈ 1m)
const PHONE = { w: 358, h: 560, pad: 0.15 };   // 과 화면 검사용 휴대폰 지도 칸
// 넓은 화면(전체 연습·시험) 검사: 설계서 3.2 처럼 가장 좁은 휴대폰의 판정 전 지도 칸에 여백 없이 맞춘 크기(서울 전체 중구 21px)
const PHONE_WIDE = { w: 358, h: 440, pad: 0 };
const TAP_FAIL = 16, TAP_AMBIG = 24;           // 내접원 지름(px): 16 미만 실패, 24 미만 '모호 확대'

const errors = [];
const notes = [];
const fail = (m) => errors.push(m);
const note = (m) => { notes.push(m); console.log('  ' + m); };

/* ---------- 0 원본 확인 ---------- */
const rawBuf = fs.readFileSync(RAW);
const sha = crypto.createHash('sha256').update(rawBuf).digest('hex');
if (rawBuf.length !== SOURCE.bytes || sha !== SOURCE.sha256) { console.error(`원본이 다릅니다: ${rawBuf.length}B ${sha}`); process.exit(1); }
console.log(`원본 확인: ${SOURCE.file} @ ${SOURCE.commit.slice(0, 7)} (${rawBuf.length}B)`);
const raw = JSON.parse(rawBuf.toString('utf8'));
const neBuf = fs.readFileSync(NE_RAW);
const neSha = crypto.createHash('sha256').update(neBuf).digest('hex');
if (neBuf.length !== SOURCE_NE.bytes || neSha !== SOURCE_NE.sha256) { console.error(`Natural Earth 원본이 다릅니다: ${neBuf.length}B ${neSha}`); process.exit(1); }
const nkGeom = JSON.parse(neBuf.toString('utf8')).features.find((f) => f.properties.ADM0_A3 === 'PRK').geometry;

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
  fs.writeFileSync(path.join(ROOT, 'src/data/kr-summary.json'), JSON.stringify({ _note: '전국 시·도별 시·군·구와 읍·면·동 수(행정동 기준). pipeline/build-geo.mjs 가 만든다', source: SOURCE.file, total, sidos }, null, 1) + '\n');
  note(`전국 요약: 시·도 ${total.sido} · 시 ${total.si} 군 ${total.gun} 자치구 ${total.gu}(기초 ${total.si + total.gun + total.gu}) · 행정시 ${total.adminSi} · 일반구 ${total.ilban}(${total.ilbanSi}개 시) · 읍 ${total.eup} 면 ${total.myeon} 동 ${total.dong}`);
}

/* ---------- 0(이어서) 서울 법정동(가이드 G2): 구마다 법정동 이름. 리·시군구·시도 줄은 빼고 읍면동 줄만 ---------- */
if (fs.existsSync(BJD_RAW)) {
  const buf = fs.readFileSync(BJD_RAW);
  const h = crypto.createHash('sha256').update(buf).digest('hex');
  if (buf.length !== SOURCE_BJD.bytes || h !== SOURCE_BJD.sha256) { console.error(`법정동 원본이 다릅니다: ${buf.length}B ${h}`); process.exit(1); }
  const rows = buf.toString('utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/).slice(1).map((l) => l.split(','));
  const byGu = {};
  for (const [, sido, sgg, emdName, ri] of rows) if (sido === '서울특별시' && sgg && emdName && !ri) (byGu[sgg] ||= []).push(emdName);
  const n = Object.values(byGu).reduce((t, l) => t + l.length, 0);
  if (Object.keys(byGu).length !== 25) fail(`서울 법정동: 구 ${Object.keys(byGu).length}곳(기대 25)`);
  fs.writeFileSync(path.join(ROOT, 'src/data/legal-dong-seoul.json'), JSON.stringify({ _note: '서울 구별 법정동 이름(파일 차례). pipeline/build-geo.mjs 가 만든다', source: SOURCE_BJD, byGu }, null, 1) + '\n');
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
  const legalList = fs.existsSync(legalFile) ? JSON.parse(fs.readFileSync(legalFile, 'utf8')).byGu : null;
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
  if (errors.length === errBefore) fs.writeFileSync(path.join(ROOT, 'src/data/seoul-dong-map.json'), JSON.stringify({ _note: '서울 구별 행정동 → 법정동(서울시 표 차례, 행정동 표기는 경계 데이터에 맞춤). pipeline/build-geo.mjs 가 만든다', source: SOURCE_DONGMAP, byGu }, null, 1) + '\n');
  if (errors.length === errBefore) note(`서울 동 대응표: 구 ${Object.keys(byGu).length} · 행정동 ${nRows} — 행정동은 경계 데이터와, 법정동은 국토부 목록과 같음(인현동은 1·2가 구분 없이 표기)`);
} else note('동 대응표 원본이 없어 src/data/seoul-dong-map.json 은 그대로');

/* ---------- 1~3 거르기·이름 정리 ---------- */
const REGION_BY_SIDO = Object.fromEntries(UNITS.regions.map((r) => [r.sido, r]));
const GENERAL_GU = /^(.+?시)\s?(.+구)$/;   // '수원시장안구' → 수원시 + 장안구
const emd = [];
for (const f of raw.features) {
  const p = f.properties;
  const region = REGION_BY_SIDO[String(p.sido)];
  if (!region) continue;
  const dong = String(p.adm_nm).split(' ').pop();
  let sggName = p.sggnm, si = p.sgg, siName = p.sggnm;
  const m = region.sido === '41' && String(p.sggnm).match(GENERAL_GU);
  if (m) { siName = m[1]; sggName = `${m[1]} ${m[2]}`; si = String(Math.floor(Number(p.sgg) / 10) * 10); }
  emd.push({ type: 'Feature', geometry: f.geometry, properties: {
    id: `kr:emd:${p.adm_cd2}`, code: p.adm_cd2, name: dong,
    sgg: p.sgg, sggId: `kr:sgg:${p.sgg}`, sggName,
    si, siId: `kr:sgg:${si}`, siName,
    sido: String(p.sido), sidoName: p.sidonm, region: region.key,
  } });
}
console.log(`수도권 행정동 ${emd.length}곳`);

// 이웃 땅(설계서 5.2 층 2): 수도권 밖 시도의 동 가운데 둘레 상자에 꼭짓점이 하나라도 든 것.
// 수도권 동과 같은 위상에서 단순화해야 도 경계가 어긋나지 않으므로 1단계에 함께 넣는다
const OUT_BOX = [125.4, 36.3, 128.5, 38.9];
const anyIn = (c, B) => (typeof c[0] === 'number' ? c[0] >= B[0] && c[0] <= B[2] && c[1] >= B[1] && c[1] <= B[3] : c.some((x) => anyIn(x, B)));
const outRaw = raw.features.filter((f) => !REGION_BY_SIDO[String(f.properties.sido)] && anyIn(f.geometry.coordinates, OUT_BOX))
  .map((f) => ({ type: 'Feature', geometry: f.geometry, properties: { sido: String(f.properties.sido), sidoName: f.properties.sidonm } }));
console.log(`이웃 땅(수도권 밖) 동 ${outRaw.length}곳`);

const ms = async (cmd, files) => mapshaper.applyCommands(cmd, files);
const fcOf = (s) => { const g = JSON.parse(String(s)); return g.type === 'FeatureCollection' ? g : { type: 'FeatureCollection', features: (g.geometries || []).map((geometry) => ({ type: 'Feature', properties: {}, geometry })) }; };
const DISSOLVE = '-dissolve sgg target=emd copy-fields=sggId,sggName,si,siId,siName,sido,region + name=sgg '
  + '-dissolve si target=emd copy-fields=siId,siName,sido,region + name=si '
  + '-dissolve sido target=emd copy-fields=sidoName,region + name=sido ';

/* ---------- 4~5 단순화·합치기(이웃 계산용 한 위상) ---------- */
const run1 = await ms(
  `-i emd.json out.json combine-files -simplify interval=${SIMPLIFY_M} keep-shapes target=* ${DISSOLVE}`
  + `-dissolve sido target=out copy-fields=sidoName + name=outSido `
  + `-o format=topojson target=emd,sgg,si,sido,outSido combined.json -o format=geojson geojson-type=FeatureCollection target=emd emd_s.json `
  + `-o format=geojson geojson-type=FeatureCollection target=outSido out_s.json -o format=geojson geojson-type=FeatureCollection target=sido sido_s.json`,
  { 'emd.json': JSON.stringify({ type: 'FeatureCollection', features: emd }), 'out.json': JSON.stringify({ type: 'FeatureCollection', features: outRaw }) });
const T1 = JSON.parse(String(run1['combined.json']));

/* ---------- 5(이어서) 북한 땅 ---------- */
// Natural Earth 북한 도형은 우리 경계와 휴전선에서 조금씩 어긋나 틈(바다색)이 보인다.
// 휴전선 구간(동경 126.75~128.3도, 한강 하구 동쪽)의 북한 경계선만 2km 띠로 넓혀 붙이고, 1단계에서 단순화한 남쪽 땅을 빼서 틈만 메운다.
// 하구·서해 쪽 해안은 넓히지 않는다(강화 북쪽 물길이 메워지지 않게)
const NK_CORRIDOR = [126.75, 37.6, 128.3, 38.7];
const runNK = await ms(
  `-i nk.json name=nk -i south.json name=south `
  + `-lines target=nk + name=nkline -clip target=nkline bbox=${NK_CORRIDOR.join(',')} -buffer target=nkline radius=2000 name=nkband `
  + `-merge-layers target=nk,nkband force name=nkall -dissolve target=nkall `
  + `-dissolve target=south -erase south target=nkall remove-slivers `
  + `-o format=geojson geojson-type=FeatureCollection target=nkall nk_out.json`,
  { 'nk.json': JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: nkGeom }] }),
    'south.json': JSON.stringify({ type: 'FeatureCollection', features: [...fcOf(run1['sido_s.json']).features, ...fcOf(run1['out_s.json']).features] }) });
const nkLand = fcOf(runNK['nk_out.json']).features.map((f) => ({ type: 'Feature', geometry: f.geometry, properties: { sido: 'kp', sidoName: '북한' } }));

/* ---------- 6 이웃: 공유 경계(위상) ---------- */
const neighbors = {};
// 층마다 id 열쇠: 동 id, 시군구 sggId, 시 siId
for (const [layer, key] of [['emd', 'id'], ['sgg', 'sggId'], ['si', 'siId']]) {
  const geoms = T1.objects[layer].geometries; const nb = topo.neighbors(geoms); const map = {};
  geoms.forEach((g, i) => { map[g.properties[key]] = [...new Set(nb[i].map((j) => geoms[j].properties[key]))].sort(); });
  neighbors[layer] = map;
}
// 대칭 검사
for (const [layer, map] of Object.entries(neighbors)) for (const [a, list] of Object.entries(map)) for (const b of list) if (!(map[b] || []).includes(a)) fail(`이웃 비대칭 ${layer} ${a}→${b}`);
const pairCount = (map) => Object.values(map).reduce((s, l) => s + l.length, 0) / 2;
note(`이웃 쌍: 동 ${pairCount(neighbors.emd)} · 시군구 ${pairCount(neighbors.sgg)} · 시(경기 31 기준) ${pairCount(neighbors.si)}`);
// 바다 건너 이웃(손으로 쓴 표): 땅으로 맞닿지 않지만 다리로 이어진 곳. 피드백 문장에서 '바다 건너'로 쓴다
const SEA_LINKS = [
  ['kr:sgg:28155', 'kr:sgg:28275', '영종대교'],          // 영종구 ↔ 서해구
  ['kr:sgg:28155', 'kr:sgg:28185', '인천대교'],          // 영종구 ↔ 연수구
  ['kr:sgg:28720', 'kr:sgg:41273', '영흥대교·선재대교'],  // 옹진군 ↔ 안산시 단원구(대부도)
];
neighbors.sea = {};
for (const [a, b, via] of SEA_LINKS) {
  for (const [x, y] of [[a, b], [b, a]]) (neighbors.sea[x] ||= []).push({ id: y, via });
  // 시 층(경기 31): 안산시 단원구 → 안산시
  const toSi = (id) => (id.startsWith('kr:sgg:41') ? `kr:sgg:${Math.floor(Number(id.slice(7)) / 10) * 10}` : id);
  if (toSi(a) !== a || toSi(b) !== b) for (const [x, y] of [[toSi(a), toSi(b)], [toSi(b), toSi(a)]]) (neighbors.sea[x] ||= []).push({ id: y, via });
}
// 수도권 밖 시도와 맞닿음(위치 한 줄 '충청도와 맞닿은' 검사용, 내보내지 않음)
const siGeoms = T1.objects.si.geometries, outGeoms = T1.objects.outSido.geometries;
const nbX = topo.neighbors([...siGeoms, ...outGeoms]);
const touchOut = {};
siGeoms.forEach((g, i) => { touchOut[g.properties.siId] = nbX[i].filter((j) => j >= siGeoms.length).map((j) => outGeoms[j - siGeoms.length].properties.sidoName); });
const OUT_NAMES = new Set(outGeoms.map((g) => g.properties.sidoName));
const lonely = Object.entries(neighbors.sgg).filter(([k, l]) => l.length === 0 && !neighbors.sea[k]).map(([k]) => k);
if (lonely.length) fail(`이웃이 하나도 없는 시군구: ${lonely.join(', ')}`);
note(`바다 건너 이웃 ${SEA_LINKS.length}쌍(영종구 2, 옹진군 1)`);

/* ---------- 7 한강 띠: 강북·강남 쪽 시(군·구)가 맞닿는 경계 = 강 중심선 ---------- */
const NORTH = new Set(['11110', '11140', '11170', '11200', '11215', '11230', '11260', '11290', '11305', '11320', '11350', '11380', '11410', '11440',  // 서울 강북 14
  '41280', '41310', '41360', '41480']);   // 고양·구리·남양주·파주
const SOUTH = new Set(['11500', '11470', '11530', '11545', '11560', '11590', '11620', '11650', '11680', '11710', '11740',  // 서울 강남 11
  '41570', '41450']);   // 김포·하남
const riverLine = topo.mesh(T1, T1.objects.si, (a, b) => a !== b && (
  (NORTH.has(a.properties.si) && SOUTH.has(b.properties.si)) || (SOUTH.has(a.properties.si) && NORTH.has(b.properties.si))));
note(`한강 중심선 조각 ${riverLine.coordinates.length}개`);

/* ---------- 7(이어서) 띠로 넓혀 칸에서 잘라내고, 다시 합치기 ---------- */
const run2 = await ms(
  `-i emd.json name=emd -i river.json name=river -buffer target=river radius=${RIVER_RADIUS_M} name=water `
  + `-erase water target=emd remove-slivers ${DISSOLVE}`
  + `-o format=geojson geojson-type=FeatureCollection target=emd emd.json -o format=geojson geojson-type=FeatureCollection target=sgg sgg.json `
  + `-o format=geojson geojson-type=FeatureCollection target=si si.json -o format=geojson geojson-type=FeatureCollection target=sido sido.json `
  + `-o format=geojson geojson-type=FeatureCollection target=water water.json`,
  { 'emd.json': String(run1['emd_s.json']), 'river.json': JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: '한강' }, geometry: riverLine }] }) });
const L = { emd: fcOf(run2['emd.json']), sgg: fcOf(run2['sgg.json']), si: fcOf(run2['si.json']), sido: fcOf(run2['sido.json']), water: fcOf(run2['water.json']), out: fcOf(run1['out_s.json']) };
L.out.features.push(...nkLand);
L.water.features.forEach((f) => { f.properties = { name: '한강' }; });

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
// 먼 섬(백령·대청·연평 등, 동경 125.9도 서쪽)은 앱에서 삽입 지도로 보이므로 이름표·화면 범위는 가까운 덩어리 기준
const FAR_LON = 125.9;
const boxOf = (ps) => { let q = [Infinity, Infinity, -Infinity, -Infinity]; for (const p of ps) for (const [x, y] of p[0]) q = [Math.min(q[0], x), Math.min(q[1], y), Math.max(q[2], x), Math.max(q[3], y)]; return q; };
// 여러 곳의 상자(main 또는 near)를 합쳐 경위도 [서, 남, 동, 북] 으로
const unionLL = (ids, kind) => {
  let q = [Infinity, Infinity, -Infinity, -Infinity];
  for (const id of ids) { const b = bboxM[id][kind]; q = [Math.min(q[0], b[0]), Math.min(q[1], b[1]), Math.max(q[2], b[2]), Math.max(q[3], b[3])]; }
  const [w, n] = toLL([q[0], q[1]]), [e, so] = toLL([q[2], q[3]]);
  return [w, so, e, n].map((v) => Math.round(v * 1e4) / 1e4);
};
function addLabels(fc, key) {
  for (const f of fc.features) {
    const id = f.properties[key];
    const polysLL = polysOf(f.geometry);
    const polys = polysLL.map((p) => p.map((r) => r.map(toM)));
    if (!polys.length) { fail(`빈 도형 ${id}`); continue; }
    const near = polys.filter((p, i) => polysLL[i][0].reduce((s, c) => s + c[0], 0) / polysLL[i][0].length >= FAR_LON);
    const pool = near.length ? near : polys;
    let big = pool[0]; for (const p of pool) if (ringArea(p[0]) > ringArea(big[0])) big = p;
    const [x, y, ir] = polylabel(big);
    const [lon, lat] = toLL([x, y]);
    labels[id] = [r6(lon), r6(lat), Math.round(ir)];
    let b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of polys) for (const [px, py] of p[0]) b = [Math.min(b[0], px), Math.min(b[1], py), Math.max(b[2], px), Math.max(b[3], py)];
    bboxM[id] = { all: b, near: boxOf(pool), main: boxOf([big]) };
  }
}
addLabels(L.emd, 'id'); addLabels(L.sgg, 'sggId'); addLabels(L.si, 'siId');

/* ---------- 11 검사 ---------- */
const countBy = (fc, key, val) => fc.features.filter((f) => f.properties[key] === val).length;
const EXPECT = { '11': [25, 427], '28': [11, 158], '41': [47, 602] };
for (const [sido, [nSgg, nEmd]] of Object.entries(EXPECT)) {
  const a = countBy(L.sgg, 'sido', sido), b = countBy(L.emd, 'sido', sido);
  if (a !== nSgg || b !== nEmd) fail(`개수 다름 ${sido}: 시군구 ${a}/${nSgg} 동 ${b}/${nEmd}`);
}
if (countBy(L.si, 'sido', '41') !== 31) fail(`경기 시·군 층이 31이 아님: ${countBy(L.si, 'sido', '41')}`);
note(`개수: 서울 25/427 · 인천 11/158 · 경기 47/602, 경기 시·군 층 ${countBy(L.si, 'sido', '41')}`);
const ids = [...L.emd.features.map((f) => f.properties.id), ...L.sgg.features.map((f) => f.properties.sggId)];
if (new Set(ids).size !== ids.length) fail('ID 중복');
const glued = L.sgg.features.map((f) => f.properties.sggName).filter((n) => /^\S+시\S+구$/.test(n));
if (glued.length) fail(`붙여 쓴 이름: ${glued.join(', ')}`);

// 섬·강 점검 좌표: 점이 들어가야 할 시군구(없으면 물)
const containing = (lon, lat) => { const [x, y] = toM([lon, lat]); const hit = L.sgg.features.find((f) => polysOf(f.geometry).some((p) => inside(x, y, p.map((r) => r.map(toM))))); return hit ? hit.properties.sggName : null; };
const PROBES = [
  ['백령도', 124.6825, 37.9593, '옹진군'], ['영종도(인천공항)', 126.4505, 37.4602, '영종구'], ['강화도', 126.4878, 37.7468, '강화군'],
  ['여의도', 126.9250, 37.5260, '영등포구'], ['한강(반포대교 부근 강 가운데)', 126.9963, 37.5145, null], ['경복궁', 126.9770, 37.5796, '종로구'],
];
for (const [name, lon, lat, want] of PROBES) { const got = containing(lon, lat); if (got !== want) fail(`점검 좌표 ${name}: ${got} (기대 ${want})`); }
note(`점검 좌표 ${PROBES.length}곳 확인`);

// 인천 개편 확인(설계서 8.3 ①~⑥, ⑧)
const ICN = ['강화군', '옹진군', '제물포구', '영종구', '미추홀구', '연수구', '남동구', '부평구', '계양구', '서해구', '검단구'];
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
let INCHEON_REFORM = null;   // 아래 정적 SVG 의 개편 전 그림에서 씀
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
  fs.writeFileSync(path.join(ROOT, 'src/data/incheon-reform.json'), JSON.stringify({ _note: '인천 2026-07 개편: 새 구마다 옛 중구·동구·서구에서 온 행정동(ver20260401 → ver20261001, 동 이름으로 이음). pipeline/build-geo.mjs 가 만든다', source_old: 'vuski/admdongkor ver20260401(hjd/hjd_28_incheon.geojson)', source_new: SOURCE.file, reform }, null, 1) + '\n');
  INCHEON_REFORM = reform;
  note(`인천 개편 대응표: ${reform.map((r) => `${r.new} ← ${Object.entries(r.from).map(([k, v]) => `${k} ${v.length}`).join('·')}`).join(' / ')}`);
} else fail(`개편 전 인천 파일이 없음: ${path.relative(ROOT, OLD_INCHEON)} (${SOURCE_OLD_INCHEON.from} 에서 옮겨 둘 것)`);

// 단원·과 구성: 이름이 데이터에 있는지, 과 화면 칸 크기
const units = [];
for (const R of UNITS.regions) {
  const layer = R.layer === 'si' ? L.si : L.sgg; const key = R.layer === 'si' ? 'siId' : 'sggId'; const nameKey = R.layer === 'si' ? 'siName' : 'sggName';
  const items = layer.features.filter((f) => f.properties.sido === R.sido);
  const byName = Object.fromEntries(items.map((f) => [f.properties[nameKey], f.properties[key]]));
  for (const n of Object.keys(byName)) if (!R.slugs[n]) fail(`${R.ko}: slug 없음 ${n}`);
  for (const n of Object.keys(R.slugs)) if (!byName[n]) fail(`${R.ko}: 데이터에 없는 이름 ${n}`);
  const inLessons = R.lessons.flatMap((l) => l.items);
  if (new Set(inLessons).size !== items.length || inLessons.some((n) => !byName[n])) fail(`${R.ko}: 과 구성이 ${items.length}곳과 맞지 않음`);
  // 화면 검사(설계서 3.2): 가장 좁은 휴대폰 지도 칸에서 칸마다 내접원 지름. 16px 미만이면 실패, 24px 미만은 '모호 확대'.
  // 과 화면은 각 곳의 가장 큰 덩어리 기준(작은 섬은 끌어서 보고, 옹진 먼 섬은 섬 상자로), 넓은 화면은 먼 섬만 뺀 기준. 앱도 이 상자(fit)로 맞춘다
  const screen = (label, lids, kind, phone = PHONE) => {
    let b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const id of lids) { const q = bboxM[id][kind]; b = [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[2]), Math.max(b[3], q[3])]; }
    const w = b[2] - b[0], h = b[3] - b[1], p = Math.max(w, h) * phone.pad;
    const k = Math.min(phone.w / (w + 2 * p), phone.h / (h + 2 * p));   // px/m
    const sizes = lids.map((id) => ({ id, d: Math.round(2 * labels[id][2] * k) }));
    const min = sizes.reduce((a, s) => (s.d < a.d ? s : a));
    const ambiguous = sizes.filter((s) => s.d < TAP_AMBIG).map((s) => s.id);
    if (min.d < TAP_FAIL) fail(`${R.ko} ${label}: 가장 작은 칸 ${min.id} 지름 ${min.d}px (<${TAP_FAIL})`);
    return { fit: unionLL(lids, kind), minTapPx: min.d, ambiguous };
  };
  const lessons = R.lessons.map((l) => {
    const lids = l.items.map((n) => byName[n]);
    return { no: l.no, title: l.title, en: l.en, items: lids, ...screen(`${l.no}과`, lids, 'main') };
  });
  note(`${R.ko} 과 화면 최소 칸(지름): ${lessons.map((l) => `${l.no}과 ${l.minTapPx}px${l.ambiguous.length ? '(모호 ' + l.ambiguous.length + ')' : ''}`).join(' · ')}`);
  // 넓은 화면(전체 연습·시험·넓은 복습): screens 가 없으면 지역 전체가 한 화면
  const screenDefs = R.screens ?? [{ key: 'all', ko: R.ko, en: R.en, items: Object.keys(R.slugs) }];
  const inScreens = screenDefs.flatMap((s) => s.items);
  if (new Set(inScreens).size !== items.length || inScreens.some((n) => !byName[n])) fail(`${R.ko}: 넓은 화면 구성이 ${items.length}곳과 맞지 않음`);
  const screens = screenDefs.map((s) => {
    const sids = s.items.map((n) => byName[n]);
    return { key: s.key, ko: s.ko, en: s.en, items: sids, ...screen(`넓은 화면 ${s.ko}`, sids, 'near', PHONE_WIDE) };
  });
  note(`${R.ko} 넓은 화면 최소 칸(지름): ${screens.map((s) => `${s.ko} ${s.minTapPx}px${s.ambiguous.length ? '(모호 ' + s.ambiguous.length + ')' : ''}`).join(' · ')}`);
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
const siByName = {};
for (const f of L.si.features) (siByName[f.properties.siName] ||= []).push(f);
const siOf = (name) => { const hit = siByName[name] || []; if (hit.length !== 1) fail(`위치 한 줄: '${name}'을 하나로 찾지 못함(${hit.length}곳)`); return hit[0]; };
const DIR_DEG = { E: 0, NE: 45, N: 90, NW: 135, W: 180, SW: -135, S: -90, SE: -45 };
const lpt = (id) => { const [x, y] = toM([labels[id][0], labels[id][1]]); return [x, -y]; };   // 동쪽 x, 북쪽 y
const areaM2 = {};
const areaOf = (id) => (areaM2[id] ??= polysOf(L.si.features.find((f) => f.properties.siId === id).geometry)
  .reduce((s, p) => s + ringArea(p[0].map(toM)) - p.slice(1).reduce((h, r) => h + ringArea(r.map(toM)), 0), 0));
let lineCount = 0;
for (const R of UNITS.regions) {
  const u = units.find((v) => v.key === R.key);
  const src = LINES[R.key] || {};
  for (const n of Object.keys(src)) if (!u.items.some((it) => it.ko === n)) fail(`위치 한 줄: ${R.ko}에 없는 곳 ${n}`);
  for (const it of u.items) {
    const e = src[it.ko], where = `${R.ko} ${it.ko}`;
    if (!e) { fail(`위치 한 줄 없음: ${where}`); continue; }
    if (e.line.length > LINE_MAX) fail(`위치 한 줄이 ${e.line.length}자(>${LINE_MAX}): ${where}`);
    for (const w of HARD_WORDS) if (e.line.includes(w)) fail(`위치 한 줄 금지 낱말 '${w}': ${where}`);
    if (R.key === 'incheon' && OLD_ICN.test(e.line)) fail(`위치 한 줄에 인천 옛 구 이름: ${where}`);
    for (const [nm, lon, lat] of e.at || []) {   // 명소가 이곳 안에 있다
      const [x, y] = toM([lon, lat]);
      const hit = L.si.features.find((f) => polysOf(f.geometry).some((p) => inside(x, y, p.map((r) => r.map(toM)))));
      if (hit?.properties.siId !== it.id) fail(`위치 한 줄 명소 ${nm}: ${hit ? hit.properties.siName : '어느 칸도 아님'} 안에 있음(${where})`);
    }
    for (const nm of e.touch || []) {   // 맞닿은 곳
      const ok = OUT_NAMES.has(nm) ? (touchOut[it.id] || []).includes(nm) : (neighbors.si[it.id] || []).includes(siOf(nm)?.properties.siId);
      if (!ok) fail(`위치 한 줄 맞닿음 '${nm}': 이웃이 아님(${where})`);
    }
    if (e.dir) {   // 기준의 그쪽(이름표 점 기준 ±60도)
      const [base, d] = e.dir, b = siOf(base);
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
    }
    if (e.size) {   // '작은 시'는 지역에서 작은 쪽 5위 안, '넓은 곳'은 넓은 쪽 절반
      const order = u.items.map((v) => v.id).sort((a, b) => areaOf(a) - areaOf(b)), rank = order.indexOf(it.id) + 1;
      if (e.size === 'small' ? rank > 5 : rank <= order.length / 2) fail(`위치 한 줄 '${e.size === 'small' ? '작은' : '넓은'}': ${order.length}곳 중 작은 쪽 ${rank}번째(${where})`);
    }
    if (e.river && !(e.river === 'N' ? NORTH : SOUTH).has(it.id.slice(7))) fail(`위치 한 줄 한강 ${e.river === 'N' ? '북쪽' : '남쪽'}이 아님(${where})`);
    it.line = e.line; lineCount++;
  }
}
note(`위치 한 줄 ${lineCount}곳: 길이·금지 낱말·인천 옛 이름·명소 좌표·맞닿음·방향·끝·한강·크기 검사`);

if (errors.length) { for (const e of errors) console.error('실패 ' + e); console.error(`검사 실패 ${errors.length}건 — 아무것도 쓰지 않았습니다`); process.exit(1); }

/* ---------- 10 내보내기 ---------- */
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(SVG_DIR, { recursive: true });
const files = {};
const write = (name, text) => { fs.writeFileSync(path.join(OUT_DIR, name), text); files[name] = { bytes: Buffer.byteLength(text), gzip: zlib.gzipSync(text).length }; };

// 지역마다 두 파일로 나눈다
//  · {지역}-sgg.topo.json: 시군구(·경기는 시)·시도·강 띠. 첫 화면과 과에서 쓰므로 20m 로 더 단순하게
//  · {지역}-emd.topo.json: 행정동(5m). 동 단원·둘러보기에서만 받는다
const SGG_SIMPLIFY_M = 20;
const CTX_MARGIN = 0.3;   // 이웃 땅·강 띠를 싣는 범위: 지역 상자를 긴 변의 30%씩 사방으로 늘린 만큼
const svgSource = {};
for (const R of UNITS.regions) {
  const sel = (fc) => ({ type: 'FeatureCollection', features: fc.features.filter((f) => f.properties.sido === R.sido) });
  // 지역 상자(먼 섬 제외)를 늘린 경위도 상자로 이웃 땅·강 띠를 자른다. 과 밖으로 끌어도 빈 바다만 보이지 않게
  const [lon0, lat0, lon1, lat1] = unionLL(sel(L.sgg).features.map((f) => f.properties.sggId), 'near');
  const mg = Math.max(lon1 - lon0, lat1 - lat0) * CTX_MARGIN;
  const bb = [lon0 - mg, lat0 - mg, lon1 + mg, lat1 + mg].map((v) => v.toFixed(4));
  const layers = ['sgg', ...(R.layer === 'si' ? ['si'] : []), 'sido'];
  const input = Object.fromEntries(layers.map((n) => [`${n}.json`, JSON.stringify(sel(L[n]))]));
  input['water.json'] = JSON.stringify(L.water);
  // 이웃 땅: 다른 수도권 시도(강 띠를 뺀 모양) + 수도권 밖 시도. 1km² 아래 섬은 뺀다
  input['out.json'] = JSON.stringify({ type: 'FeatureCollection', features: [...L.sido.features.filter((f) => f.properties.sido !== R.sido), ...L.out.features]
    .map((f) => ({ type: 'Feature', geometry: f.geometry, properties: { sido: f.properties.sido, name: f.properties.sidoName } })) });
  const out = await ms(`-i ${[...layers, 'water', 'out'].map((n) => `${n}.json`).join(' ')} combine-files `
    + `-clip target=water bbox=${bb.join(',')} -clip target=out bbox=${bb.join(',')} -filter-islands target=out min-area=1000000 -simplify interval=${SGG_SIMPLIFY_M} keep-shapes target=* `
    + `-o format=topojson quantization=${QUANT} target=* out.json`, input);
  const T = JSON.parse(String(out['out.json']));
  // 맥락 이름 자리(설계서 5.2 층 7): 이웃 땅(시도·북한)과 한강 띠마다 가장 큰 덩어리의 '경계에서 가장 먼 점'을 lp 로 싣는다
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
  write(`${R.key}-sgg.topo.json`, JSON.stringify(T));
  svgSource[R.key] = { items: topo.feature(T, T.objects[R.layer]), water: T.objects.water ? topo.feature(T, T.objects.water) : { features: [] }, out: topo.feature(T, T.objects.out) };
  const outE = await ms(`-i emd.json name=emd -o format=topojson quantization=${QUANT} target=emd out.json`, { 'emd.json': JSON.stringify(sel(L.emd)) });
  write(`${R.key}-emd.topo.json`, String(outE['out.json']));
}
const isEmd = (id) => id.startsWith('kr:emd:');
write('neighbors.json', JSON.stringify({ sgg: neighbors.sgg, si: neighbors.si, sea: neighbors.sea }));
write('neighbors-emd.json', JSON.stringify({ emd: neighbors.emd }));
write('labels.json', JSON.stringify(Object.fromEntries(Object.entries(labels).filter(([id]) => !isEmd(id)))));
write('labels-emd.json', JSON.stringify(Object.fromEntries(Object.entries(labels).filter(([id]) => isEmd(id)))));
write('units.json', JSON.stringify({ version: VER, regions: units }));
const search = [
  ...L.sgg.features.map((f) => ({ id: f.properties.sggId, ko: f.properties.sggName, kind: 'sgg', region: f.properties.region, si: f.properties.siId })),
  // 일반구가 있는 경기 8개 시(수원시 등)는 시군구 층에 없으므로 시 층에서 더한다
  ...L.si.features.filter((f) => f.properties.sido === '41' && !L.sgg.features.some((g) => g.properties.sggId === f.properties.siId)).map((f) => ({ id: f.properties.siId, ko: f.properties.siName, kind: 'si', region: f.properties.region })),
  ...L.emd.features.map((f) => ({ id: f.properties.id, ko: f.properties.name, kind: 'emd', region: f.properties.region, parent: f.properties.sggId })),
];
write('search.json', JSON.stringify(search));
write('manifest.json', JSON.stringify({ version: VER, source: SOURCE, source_context: SOURCE_NE, built: new Date().toISOString().slice(0, 10), simplify_m: { emd: SIMPLIFY_M, sgg: SGG_SIMPLIFY_M }, river_radius_m: RIVER_RADIUS_M, notes, files }, null, 1));

// 정적 쪽용 SVG 경로와 곳마다 읍·면·동 목록(빌드 때 쓰고 사이트에 그대로 내보내지 않음): 지역별 시군구(·시) 층 + 강 + 이웃 땅.
// 쪽에 바로 넣으므로 지도 폭 1000 단위의 1단위(서울 약 40m·경기 약 150m)로 다시 단순화하고 좌표를 정수로 둔다
for (const R of UNITS.regions) {
  const key = R.layer === 'si' ? 'siId' : 'sggId';
  const src = svgSource[R.key];
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of src.items.features) { const q = bboxM[f.properties[key]].near; b = [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[2]), Math.max(b[3], q[3])]; }
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
  fs.writeFileSync(path.join(SVG_DIR, `${R.key}.json`), JSON.stringify({ version: VER, w: W, h: H, items, water, out }));
  // 인천 개편 전 그림(가이드 G3): 지금 행정동을 옛 구(중구·동구·서구)로 묶어 같은 틀(W·H·축척)에 그린다.
  // 개편 전 판 경계를 그대로 쓰지 않는 것은 해안선이 판마다 달라 두 그림이 어긋나기 때문(위 면적 비교 참고)
  if (R.key === 'incheon' && INCHEON_REFORM) {
    const oldOf = new Map();
    for (const r of INCHEON_REFORM) for (const [o, list] of Object.entries(r.from)) for (const dn of list) oldOf.set(`${r.new}|${dn}`, o);
    const NEW_GU = new Set(INCHEON_REFORM.map((r) => r.new));
    const feats = L.emd.features.filter((f) => f.properties.sido === R.sido).map((f) => {
      const k = `${f.properties.sggName}|${f.properties.name}`;
      if (NEW_GU.has(f.properties.sggName) && !oldOf.has(k)) throw new Error(`인천 개편 전 그림: ${k} 의 옛 구 없음`);
      return { type: 'Feature', geometry: f.geometry, properties: { old: oldOf.get(k) ?? f.properties.sggName } };
    });
    const bo = await ms(`-i emd.json name=emd -dissolve old target=emd -simplify interval=${Math.round(1 / s)} keep-shapes `
      + `-o format=geojson geojson-type=FeatureCollection before.json`, { 'emd.json': JSON.stringify({ type: 'FeatureCollection', features: feats }) });
    const before = fcOf(bo['before.json']).features.map((f) => {
      const polysLL = polysOf(f.geometry);
      const polys = polysLL.map((p) => p.map((r) => r.map(toM)));
      const near = polys.filter((p, i) => polysLL[i][0].reduce((t, c) => t + c[0], 0) / polysLL[i][0].length >= FAR_LON);   // addLabels 와 같이 먼 섬은 빼고
      const big = (near.length ? near : polys).reduce((x, y) => (ringArea(y[0]) > ringArea(x[0]) ? y : x));
      const pl = polylabel(big, 50);
      return { id: `old:${f.properties.old}`, name: f.properties.old, d: d(f.geometry), lx: Math.round((pl[0] - b[0]) * s), ly: Math.round((pl[1] - b[1]) * s), ir: +(pl[2] * s).toFixed(1), dongs: [], gu: [] };
    });
    if (before.length !== 10) throw new Error(`인천 개편 전 군·구 ${before.length}곳(기대 10: 2군 8구)`);
    fs.writeFileSync(path.join(SVG_DIR, 'incheon-before.json'), JSON.stringify({ version: VER, w: W, h: H, items: before, water, out }));
    console.log(`  인천 개편 전 그림: ${before.map((x) => x.name).join('·')}`);
  }
}

console.log('\n내보낸 파일(' + path.relative(ROOT, OUT_DIR) + '):');
for (const [n, s] of Object.entries(files)) console.log(`  ${n.padEnd(22)} ${(s.bytes / 1024).toFixed(1).padStart(7)}KB  gzip ${(s.gzip / 1024).toFixed(1)}KB`);
console.log('정적 쪽 SVG: ' + path.relative(ROOT, SVG_DIR));
console.log('완료');
