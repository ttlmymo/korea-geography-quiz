// 읍·면·동 영어 이름 손 표(pipeline/data/emd-en.json) 쓰기·확인(영어 동 공부 설계안 docs/EN_EMD_PLAN_2026-11-16.md 3.4).
//   node tools/emd-en.mjs           표를 다시 쓴다: 이름 = 원자료(.cache/admdongkor-…geojson, 없으면 판 폴더 동 단원 파일), en = 표의 fix 또는 tools/roma.mjs romaEmd
//   node tools/emd-en.mjs --check   다시 만든 값과 지금 표가 같은지만 본다(다르면 줄마다 알리고 1 로 끝남 — 쓰지 않음)
//   node tools/emd-en.mjs --from-pan   원자료가 있어도 판 폴더(public/data/geo/{판}/emd)에서 이름을 읽는다
// 표 모양: { _note, fix: { 행정동코드(adm_cd2): en }, names: { 행정동코드: [ko, en] } } — 줄마다 한 곳(바뀐 이름이 diff 로 보이게).
// fix 는 검수에서 손으로 고친 이름이다. 파이프라인(pipeline/build-geo.mjs)은 names 만 읽고, 코드가 없거나 ko 가 원자료와 다르면 멈춘다
// (행정동 개편이 검수 없이 지나가지 않게). 시험 tests/unit/emd-en.test.ts 가 'fix 를 뺀 줄 = romaEmd' 를 본다.
// 행정동이 바뀌면: 원자료를 바꾸고 → 이 도구로 표를 다시 쓰고 → git diff 로 새 줄을 검수(docs/review/en-emd-names.md) → 파이프라인
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { romaEmd } from './roma.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TABLE = path.join(ROOT, 'pipeline/data/emd-en.json');
const RAW = path.join(ROOT, '.cache/admdongkor-20261001/HangJeongDong_ver20261001.geojson');   // pipeline/build-geo.mjs 기본 원자료와 같은 파일
const ARGS = new Set(process.argv.slice(2));
for (const a of ARGS) if (!['--check', '--from-pan'].includes(a)) { console.error(`모르는 인자: ${a} (쓸 수 있는 것: --check, --from-pan)`); process.exit(2); }
const NOTE = '읍·면·동 영어 이름 손 표(영어 동 공부 설계안 docs/EN_EMD_PLAN_2026-11-16.md 3.3·3.4). 키 = 행정동 코드(adm_cd2), 값 = [한글 이름, 영어 이름]. '
  + 'node tools/emd-en.mjs 가 쓴다(영어 = fix 또는 tools/roma.mjs romaEmd — 국어의 로마자 표기법 소리 규칙 + 붙임표 단위, 숫자는 관용 꼴 \'Bongcheon 1-dong\'(D99, 사용자 결정 2026-11-16)). '
  + 'fix = 검수에서 손으로 고친 이름(코드: 영어). 파이프라인은 이 표를 읽어 판 동 단원 파일의 items[].en 에 쓰고, 코드가 없거나 한글 이름이 원자료와 다르면 멈춘다. '
  + '손 확인 목록: docs/review/en-emd-names.md';

/** 원자료(또는 판)의 읍·면·동: [행정동 코드, 한글 이름] (코드 차례) */
function sourceNames() {
  if (!ARGS.has('--from-pan') && fs.existsSync(RAW)) {
    const raw = JSON.parse(fs.readFileSync(RAW, 'utf8'));
    // pipeline/build-geo.mjs 1~3 이름 정리와 같은 셈: 이름 = adm_nm 의 마지막 낱말, 코드 = adm_cd2
    return { from: path.relative(ROOT, RAW).replace(/\\/g, '/'), list: raw.features.map((f) => [String(f.properties.adm_cd2), String(f.properties.adm_nm).split(' ').pop()]) };
  }
  const ver = fs.readdirSync(path.join(ROOT, 'public/data/geo')).filter((d) => d.startsWith('kr-')).sort().pop();
  const dir = path.join(ROOT, 'public/data/geo', ver);
  const units = JSON.parse(fs.readFileSync(path.join(dir, 'units.json'), 'utf8'));
  const list = [];
  for (const arr of Object.values(units.emdUnits ?? {})) for (const u of arr) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, 'emd', `${u.code}.json`), 'utf8'));
    for (const it of j.items) list.push([it.id.replace(/^kr:emd:/, ''), it.ko]);
  }
  return { from: `public/data/geo/${ver}/emd (동 공개 지역만)`, list };
}

const old = fs.existsSync(TABLE) ? JSON.parse(fs.readFileSync(TABLE, 'utf8')) : { fix: {}, names: {} };
const fix = old.fix ?? {};
const { from, list } = sourceNames();
const seen = new Set();
for (const [code, ko] of list) {
  if (!/^\d{10}$/.test(code)) throw new Error(`행정동 코드 모양이 아님: ${code} ${ko}`);
  if (seen.has(code)) throw new Error(`행정동 코드 겹침: ${code}`);
  seen.add(code);
}
for (const code of Object.keys(fix)) if (!seen.has(code)) throw new Error(`fix 의 ${code} 가 원자료에 없음 — 지우거나 코드를 고칠 것`);
const names = Object.fromEntries([...list].sort((a, b) => a[0].localeCompare(b[0])).map(([code, ko]) => [code, [ko, fix[code] ?? romaEmd(ko)]]));

if (ARGS.has('--check')) {
  const have = old.names ?? {};
  const diffs = [];
  for (const [code, [ko, en]] of Object.entries(names)) {
    const h = have[code];
    if (!h) diffs.push(`표에 없음 ${code} ${ko} → ${en}`);
    else if (h[0] !== ko || h[1] !== en) diffs.push(`다름 ${code}: 표 ${h.join(' / ')} · 다시 만든 값 ${ko} / ${en}`);
  }
  for (const code of Object.keys(have)) if (!names[code]) diffs.push(`원자료에 없음 ${code} ${have[code].join(' / ')}`);
  console.log(`emd-en --check(이름 출처 ${from}): ${Object.keys(names).length}곳 · 차이 ${diffs.length}${Object.keys(fix).length ? ` · 손으로 고친 것 ${Object.keys(fix).length}` : ''}`);
  for (const d of diffs.slice(0, 50)) console.log('  ' + d);
  process.exit(diffs.length ? 1 : 0);
}

// 줄마다 한 곳(JSON 으로 그대로 읽힘)
const line = (k, v) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`;
const text = '{\n'
  + ` "_note": ${JSON.stringify(NOTE)},\n`
  + ` "fix": {${Object.keys(fix).length ? '\n' + Object.keys(fix).sort().map((k) => line(k, fix[k])).join(',\n') + '\n ' : ''}},\n`
  + ` "names": {\n${Object.entries(names).map(([k, v]) => line(k, v)).join(',\n')}\n }\n}\n`;
JSON.parse(text);   // 모양 확인
const before = old.names ?? {};
const changed = Object.entries(names).filter(([k, v]) => !before[k] || before[k][0] !== v[0] || before[k][1] !== v[1]).length;
const gone = Object.keys(before).filter((k) => !names[k]).length;
fs.writeFileSync(TABLE, text);
console.log(`${path.relative(ROOT, TABLE).replace(/\\/g, '/')}: ${Object.keys(names).length}곳(이름 출처 ${from}) · 새로 쓰거나 바뀐 줄 ${changed} · 빠진 줄 ${gone} · 손으로 고친 것 ${Object.keys(fix).length}`);
