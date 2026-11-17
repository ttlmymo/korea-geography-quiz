// 읍·면·동 영어 이름(영어 동 공부 설계안 docs/EN_EMD_PLAN_2026-11-16.md 3.3·3.5·10.2 의 1·2)
//  ① 손 표 pipeline/data/emd-en.json: 판과 같은 곳 · 꼴 · 단원 안 겹침(전체 이름·짧은 이름) · 표 = 변환기(tools/roma.mjs, fix 뺌) · 고정 사례
//  ② 판 전수: 동 단원 256개의 곳·과·화면·이웃 땅(topo out) en 이 비지 않고 한글이 없다 · 일반구 단원 en·과·화면 · units.json enNames
// 국립국어원 용례 대조(3,031곳)는 표를 저장소에 싣지 않으므로(이용 조건 미확인) 여기서 하지 않는다 — 점검 단계 몫(설계안 3.5)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_VER } from '../../src/consts.ts';
import { romaEmd, emdShort, romanizeHangul } from '../../tools/roma.mjs';

const root = path.join(import.meta.dirname, '../..');
const dir = path.join(root, 'public/data/geo', DATA_VER);
const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
const table: { _note: string; fix: Record<string, string>; names: Record<string, [string, string]> } = read(path.join(root, 'pipeline/data/emd-en.json'));
const units = read(path.join(dir, 'units.json'));
const AGAIN = 'node tools/emd-en.mjs 로 표를 다시 쓰고(손 확인 docs/review/en-emd-names.md) node pipeline/build-geo.mjs';
const HANGUL = /[ㄱ-ㆎ가-힣]/;
type UnitFile = { code: string; ko: string; en: string; key: string; items: { id: string; ko: string; en?: string; kind: string }[]; lessons: { no: number; title: string; en?: string }[]; screens: { key: string; ko: string; en: string }[] };
const unitFiles: UnitFile[] = Object.values(units.emdUnits ?? {}).flatMap((list) => (list as { code: string }[]).map((u) => read(path.join(dir, 'emd', `${u.code}.json`))));

/* ---------- ① 손 표 ---------- */

test('이름 표: 모양(행정동 코드 10자리 → [한글, 영어]) · fix 는 표에 있는 코드만', () => {
  assert.ok(table._note.includes('D99'), '_note 에 숫자 꼴 결정(D99)');
  const entries = Object.entries(table.names);
  assert.ok(entries.length >= 3559, `표 ${entries.length}곳`);
  for (const [code, v] of entries) {
    assert.match(code, /^\d{10}$/, `코드 ${code}`);
    assert.ok(Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'string' && v[0] && v[1], `${code} 값 모양`);
  }
  for (const code of Object.keys(table.fix)) assert.ok(table.names[code], `fix ${code} 가 표에 없음`);
  assert.deepEqual(Object.keys(table.names), [...Object.keys(table.names)].sort(), '코드 차례(바뀐 줄이 diff 로 보이게)');
});

test('이름 표 = 판: 동 단원 파일의 모든 곳(3,559)이 같은 코드·같은 한글로 표에 있다', () => {
  const ids = unitFiles.flatMap((j) => j.items.map((it) => [it.id.replace(/^kr:emd:/, ''), it.ko] as const));
  assert.equal(ids.length, 3559, '판의 읍·면·동 수(2026-10-01 경계)');
  for (const [code, ko] of ids) {
    assert.ok(table.names[code], `표에 없음 ${code} ${ko} — ${AGAIN}`);
    assert.equal(table.names[code][0], ko, `${code} 한글 이름이 판과 다름 — ${AGAIN}`);
  }
});

test('이름 표 꼴: 첫 글자 대문자, 한글·undefined·두 칸 띄움·숫자에 붙은 영문 없음, 단위 붙임표가 한글 단위와 맞음', () => {
  const UNIT: Record<string, string> = { 동: '-dong', 읍: '-eup', 면: '-myeon' };
  for (const [code, [ko, en]] of Object.entries(table.names)) {
    const at = `${code} ${ko} '${en}'`;
    assert.match(en, /^[A-Z]/, `${at} 첫 글자`);
    assert.ok(!HANGUL.test(en), `${at} 한글`);
    assert.ok(!/undefined|null|NaN/.test(en), `${at} 빈 값 글`);
    assert.ok(!/\s\s|^\s|\s$/.test(en), `${at} 띄움`);
    assert.ok(!/\d[A-Za-z]|[A-Za-z]\d/.test(en), `${at} 숫자에 붙은 영문`);
    assert.ok(!/·\s|\s·|·[a-z]/.test(en), `${at} 가운뎃점 앞뒤 띄움·소문자`);
    assert.ok(en.endsWith(UNIT[ko.slice(-1)] ?? '?'), `${at} 단위`);
    assert.match(en, /^[A-Za-z0-9 ·-]+$/, `${at} 쓸 수 있는 글자(영문·숫자·띄움·가운뎃점·붙임표)`);
  }
});

test('이름 표 겹침: 같은 단원(시·군·구 코드) 안 영어 전체 이름·짧은 이름이 겹치지 않는다', () => {
  const by = new Map<string, [string, string][]>();
  for (const [code, v] of Object.entries(table.names)) { const k = code.slice(0, 5); if (!by.has(k)) by.set(k, []); by.get(k)!.push(v); }
  for (const [unit, list] of by) {
    for (const f of [(e: string) => e, emdShort]) {
      const seen = new Map<string, string>();
      for (const [ko, en] of list) {
        const k = f(en);
        assert.ok(!seen.has(k), `단원 ${unit}: ${seen.get(k)} 와 ${ko} 가 같은 '${k}'`);
        seen.set(k, ko);
      }
    }
  }
});

test('이름 표 = 변환기: fix 를 뺀 모든 줄이 tools/roma.mjs romaEmd 와 같고, fix 줄은 fix 값', () => {
  for (const [code, [ko, en]] of Object.entries(table.names)) assert.equal(en, table.fix[code] ?? romaEmd(ko), `${code} ${ko} — ${AGAIN}`);
});

// 고정 사례(설계안 3.3·3.5): 고시 예시 · 꼴이 깨지던 39곳의 대표 · 소리 변화 자리(ㄴ+ㄹ·ㄹ+ㄴ·ㄱ/ㅂ+ㄹ·ㅇ+ㄹ·ㄱ/ㅂ+ㅎ·연음) · 단위만 다른 쌍
const FIXED: [string, string][] = [
  ['봉천1동', 'Bongcheon 1-dong'],                 // 고시 예시(D99 관용 꼴 — 고시 괄호 꼴은 'Bongcheon 1(il)-dong')
  ['개포1동', 'Gaepo 1-dong'], ['상계10동', 'Sanggye 10-dong'], ['대명11동', 'Daemyeong 11-dong'], ['구로1동', 'Guro 1-dong'],
  ['금호1가동', 'Geumho 1-ga-dong'], ['용산2가동', 'Yongsan 2-ga-dong'], ['수성1가동', 'Suseong 1-ga-dong'],
  ['금호2·3가동', 'Geumho 2·3-ga-dong'], ['종로1·2·3·4가동', 'Jongno 1·2·3·4-ga-dong'], ['종로5·6가동', 'Jongno 5·6-ga-dong'],
  ['성수1가1동', 'Seongsu 1-ga 1-dong'], ['성수2가3동', 'Seongsu 2-ga 3-dong'],
  ['상계3·4동', 'Sanggye 3·4-dong'], ['면목3·8동', 'Myeonmok 3·8-dong'], ['숭의1·3동', 'Sungui 1·3-dong'],
  ['불로·봉무동', 'Bullo·Bongmu-dong'], ['용담·명암·산성동', 'Yongdam·Myeongam·Sanseong-dong'], ['탑·대성동', 'Tap·Daeseong-dong'], ['호암·직동', 'Hoam·Jik-dong'],
  ['봉명2·송정동', 'Bongmyeong 2·Songjeong-dong'], ['화수1·화평동', 'Hwasu 1·Hwapyeong-dong'],
  ['두류1,2동', 'Duryu 1·2-dong'],                   // 쉼표 → 가운뎃점
  ['청운효자동', 'Cheongunhyoja-dong'], ['왕십리도선동', 'Wangsimnidoseon-dong'], ['중계본동', 'Junggyebon-dong'], ['본동', 'Bon-dong'],
  ['상일제1동', 'Sangilje 1-dong'], ['가야제1동', 'Gayaje 1-dong'],
  ['신가동', 'Singa-dong'], ['삼가동', 'Samga-dong'],   // 숫자 없는 '가'는 이름의 일부
  ['신림동', 'Sillim-dong'], ['교현·안림동', 'Gyohyeon·Allim-dong'],           // ㄴ+ㄹ
  ['별내동', 'Byeollae-dong'], ['별내면', 'Byeollae-myeon'],                 // ㄹ+ㄴ · 단위만 다른 쌍
  ['속리산면', 'Songnisan-myeon'], ['압량읍', 'Amnyang-eup'],                 // ㄱ+ㄹ · ㅂ+ㄹ
  ['한강로동', 'Hangangno-dong'], ['청라1동', 'Cheongna 1-dong'],             // ㅇ+ㄹ
  ['묵호동', 'Mukho-dong'], ['압해읍', 'Aphae-eup'], ['집현동', 'Jiphyeon-dong'],   // ㄱ·ㅂ 뒤 ㅎ 밝혀 적기
  ['학온동', 'Hagon-dong'], ['인덕원동', 'Indeogwon-dong'], ['진접읍', 'Jinjeop-eup'],   // 연음 · 받침
  ['고덕동', 'Godeok-dong'], ['고덕면', 'Godeok-myeon'],
];

test('고정 사례(손으로 쓴 값): romaEmd 와 표가 모두 이 값', () => {
  const byKo = new Map<string, string[]>();
  for (const [ko, en] of Object.values(table.names)) { if (!byKo.has(ko)) byKo.set(ko, []); byKo.get(ko)!.push(en); }
  let inTable = 0;
  for (const [ko, en] of FIXED) {
    assert.equal(romaEmd(ko), en, `romaEmd(${ko})`);
    for (const t of byKo.get(ko) ?? []) { assert.equal(t, en, `표의 ${ko}`); inTable++; }
  }
  assert.ok(inTable >= 40, `고정 사례 가운데 표에 있는 것 ${inTable}`);
  // 고시 꼴(괄호 읽기)은 용례와 견줄 때만 쓴다: 'sibil' 연음 포함
  assert.equal(romaEmd('봉천1동', { reading: true }), 'Bongcheon 1(il)-dong');
  assert.equal(romaEmd('대명11동', { reading: true }), 'Daemyeong 11(sibil)-dong');
  assert.equal(romaEmd('성수1가1동', { reading: true }), 'Seongsu 1(il)-ga 1(il)-dong');
  assert.equal(romaEmd('종로1·2·3·4가동', { reading: true }), 'Jongno 1(il)·2(i)·3(sam)·4(sa)-ga-dong');
  assert.equal(romanizeHangul('신라'), 'silla');
});

test('짧은 이름(D101): -dong 만 떼고, 남는 글이 4자 미만이면 그대로, -eup·-myeon 은 남김', () => {
  assert.equal(emdShort('Gaepo 1-dong'), 'Gaepo 1');
  assert.equal(emdShort('Cheongunhyoja-dong'), 'Cheongunhyoja');
  assert.equal(emdShort('Byeollae-dong'), 'Byeollae');
  assert.equal(emdShort('Byeollae-myeon'), 'Byeollae-myeon');
  assert.equal(emdShort('Jinjeop-eup'), 'Jinjeop-eup');
  assert.equal(emdShort('Bon-dong'), 'Bon-dong');
  assert.equal(emdShort('Sang-dong'), 'Sang');
  assert.equal(emdShort('Jongno 1·2·3·4-ga-dong'), 'Jongno 1·2·3·4-ga');
});

/* ---------- ② 판 전수(S2) ---------- */

// 과·화면 낱말 표(설계안 7.2 · D104). 화면 글은 지역 화면과 같게 첫 글자를 소문자로 쓴다('Gyeonggi, northwest'처럼 쉼표 뒤에 붙는 말)
const WORDS: Record<string, string> = {
  북서쪽: 'Northwest', 북쪽: 'North', 북동쪽: 'Northeast', 서쪽: 'West', 가운데: 'Center', 동쪽: 'East', 남서쪽: 'Southwest', 남쪽: 'South', 남동쪽: 'Southeast',
  섬: 'Islands', '북쪽 섬': 'North islands', '북동쪽 섬': 'Northeast islands', '남서쪽 섬': 'Southwest islands', '남쪽 섬': 'South islands', '남동쪽 섬': 'Southeast islands', '동쪽 섬': 'East islands', '북서쪽 섬': 'Northwest islands', 전체: 'All', 시내: 'Urban area', '읍·면': 'Towns and townships',
  '시내 북서쪽': 'Urban northwest', '시내 북쪽': 'Urban north', '시내 북동쪽': 'Urban northeast', '시내 서쪽': 'Urban west', '시내 동쪽': 'Urban east',
  '시내 남서쪽': 'Urban southwest', '시내 남쪽': 'Urban south', '시내 남동쪽': 'Urban southeast',
  '읍·면 북서쪽': 'Northwest towns', '읍·면 북쪽': 'North towns', '읍·면 북동쪽': 'Northeast towns', '읍·면 서쪽': 'West towns', '읍·면 동쪽': 'East towns',
  '읍·면 남서쪽': 'Southwest towns', '읍·면 남쪽': 'South towns', '읍·면 남동쪽': 'Southeast towns',
};
const lessonEn = (title: string, j: UnitFile) => {
  const m = title.match(/^(.+) · (.+) 둘레$/);   // 같은 단원 안 겹친 방위에 붙인 동 이름(emd-lib resolveNames)
  if (!m) return WORDS[title];
  const it = j.items.find((x) => x.ko === m[2]);
  return WORDS[m[1]] && it ? `${WORDS[m[1]]}, around ${table.names[it.id.replace(/^kr:emd:/, '')][1]}` : undefined;
};

test('판 units.json: enNames 표시(영어 앱이 동·일반구·시·도 단원을 켜는 관문, 설계안 5.1)', () => {
  assert.equal(units.enNames, true);
});

test('판 전수: 동 단원 256개의 곳·과·화면 en 이 비지 않고 한글이 없고, 곳은 이름 표·과는 낱말 표·화면은 단원 이름이나 낱말 표', () => {
  assert.equal(unitFiles.length, 256);
  let lessons = 0, screens = 0;
  for (const j of unitFiles) {
    assert.ok(j.en && !HANGUL.test(j.en), `${j.key} 단원 en '${j.en}'`);
    for (const it of j.items) assert.equal(it.en, table.names[it.id.replace(/^kr:emd:/, '')]?.[1], `${j.key} ${it.ko} en`);
    for (const l of j.lessons) {
      lessons++;
      assert.ok(l.en && !HANGUL.test(l.en), `${j.key} ${l.no}과 '${l.title}' en '${l.en}'`);
      assert.equal(l.en, lessonEn(l.title, j), `${j.key} ${l.no}과 '${l.title}' — 7.2 낱말 표`);
    }
    for (const s of j.screens) {
      screens++;
      const want = s.ko === j.ko ? j.en : WORDS[s.ko] && WORDS[s.ko][0].toLowerCase() + WORDS[s.ko].slice(1);
      assert.ok(s.en && !HANGUL.test(s.en), `${j.key} 화면 ${s.key} '${s.ko}' en '${s.en}'`);
      assert.equal(s.en, want, `${j.key} 화면 ${s.key} '${s.ko}'`);
    }
    const titles = j.lessons.map((l) => l.en);
    assert.equal(new Set(titles).size, titles.length, `${j.key} 과 영어 이름 겹침`);
  }
  assert.deepEqual([lessons, screens], [674, 351], '과·화면 수(2026-10-01 판 — 2026-11-17 옹진군이 과 하나에서 셋으로: 672 → 674)');
});

test('판 전수: 동 단원 지도의 이웃 땅(topo out) 이름 en — 비지 않고 한글 없음, 같은 id 는 어디서나 같은 en, 시·군·구는 시·군·구 영어 이름', () => {
  const enOf = new Map<string, string>();
  // 시·군·구 영어 이름: 지역 곳(시·군·구 층)은 slug 첫 글자 대문자, 일반구는 동 단원 en('Suwon-si Jangan-gu')
  const want = new Map<string, string>();
  for (const r of units.regions) for (const it of r.items) want.set(it.id, it.slug.replace(/^./, (c: string) => c.toUpperCase()));
  for (const j of unitFiles) want.set(`kr:sgg:${j.code}`, j.en);
  want.set('kp', 'North Korea');
  want.set('jp', 'Japan');
  let n = 0;
  for (const j of unitFiles) {
    const t = read(path.join(dir, 'emd', `${j.code}.topo.json`));
    for (const g of t.objects.out?.geometries ?? []) {
      const p = g.properties ?? {};
      n++;
      assert.ok(p.en && !HANGUL.test(p.en), `${j.key} 이웃 땅 ${p.id} ${p.name} en '${p.en}'`);
      if (enOf.has(p.id)) assert.equal(p.en, enOf.get(p.id), `${p.id} en 이 단원마다 다름`);
      enOf.set(p.id, p.en);
      assert.equal(p.en, want.get(p.id), `${j.key} 이웃 땅 ${p.id} ${p.name}`);
    }
  }
  assert.ok(n > 2000 && enOf.size >= 256, `이웃 땅 조각 ${n} · id ${enOf.size}`);
});

test('판 전수: 일반구 단원 en(\'Gyeonggi city districts\')·과(시 영어 이름)·화면 en 이 비지 않고 한글이 없다', () => {
  const gu = Object.values(units.guUnits ?? {}) as { key: string; region: string; en: string; lessons: { title: string; en?: string }[]; screens: { ko: string; en: string }[] }[];
  assert.ok(gu.length >= 3);
  for (const g of gu) {
    const r = units.regions.find((x: { key: string }) => x.key === g.region);
    assert.equal(g.en, `${r.en} city districts`, g.key);
    for (const l of g.lessons) {
      assert.ok(l.en && !HANGUL.test(l.en), `${g.key} 과 '${l.title}' en '${l.en}'`);
      assert.equal(l.en.split(/, | and /).length, l.title.split('·').length, `${g.key} 과 '${l.title}' 시 수`);
    }
    for (const s of g.screens) assert.ok(s.en && !HANGUL.test(s.en), `${g.key} 화면 '${s.ko}' en '${s.en}'`);
    if (g.screens.length === 1) assert.equal(g.screens[0].en, g.en, `${g.key} 화면 하나뿐이면 단원 이름`);
  }
});
