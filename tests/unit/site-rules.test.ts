// 정적 쪽 틀(계획서 E9 · W1): 점검 규칙(tools/site-rules.mjs)이 나쁜 예(틀만 같은 쪽 10개 · 짝 없는 hreflang · 상한을 넘는 새 쪽 ·
// 새 영어 쪽 · 새 쪽 lastmod 기본값)와 lastmod 내용 기준·방침 시행일을 잡는지, 지역 표에서 만드는 이름 묶음·slug 지도(src/lib/regions.ts)가 맞는지 본다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  factsOf, contentHash, checkNewIndex, checkLastmod, checkNewLastmod, checkHreflang, templateRatios, checkTemplate, sameFrame, wordsOf, effectiveOf,
  POLICY_PATHS, NEW_INDEX_MAX, TEMPLATE_MAX,
} from '../../tools/site-rules.mjs';
import { LIVE, HUBS, scopeKo, scopeEn, hubPathRe, slugMapOf, enOfSlug, listEn, type Named } from '../../src/lib/regions.ts';
import { SIDOS, sidoOf } from '../../src/app/sidos.ts';
import { DATA_VER, DEFAULT_UPDATED, PRIVACY_EFFECTIVE } from '../../src/consts.ts';

const root = path.join(import.meta.dirname, '../..');
const read = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const SITE = 'https://chaeumjido.co.kr';

/** 가짜 쪽 HTML(빌드 결과와 같은 모양: html lang · title · description · alternate · main 의 블록) */
function page(o: { lang?: string; title?: string; desc?: string; body: string[]; alts?: [string, string][]; noindex?: boolean }) {
  const alts = (o.alts ?? []).map(([l, p]) => `<link rel="alternate" hreflang="${l}" href="${SITE}${p}">`).join('\n');
  return `<!doctype html><html lang="${o.lang ?? 'ko'}"><head><title>${o.title ?? '쪽'}</title><meta name="description" content="${o.desc ?? '설명 글이 스무 자를 넘어야 하는 쪽 설명입니다'}">${alts}`
    + `${o.noindex ? '<meta name="robots" content="noindex">' : ''}</head><body><header><p>머리글은 본문이 아니다 머리글은 본문이 아니다</p></header>`
    + `<main>${o.body.map((t) => `<p>${t}</p>`).join('')}<svg><text>그림 글은 본문이 아니다 그림 글은 본문이 아니다</text></svg></main></body></html>`;
}
/** 사람이 쓴 고유 본문(쪽마다 다른 문장) */
const UNIQUE = [
  ['해운대는 모래사장이 넓고 겨울에도 바다를 보러 오는 사람이 많아요.', '동백섬을 한 바퀴 도는 산책길에서 광안대교가 보여요.'],
  ['자갈치시장은 바다 옆 생선 시장으로 아침마다 경매가 열려요.', '영도다리는 하루 한 번 다리를 들어 올리는 모습을 보여 줘요.'],
  ['금정산성은 우리나라에서 가장 긴 산성으로 성곽 길을 걸을 수 있어요.', '범어사 계곡은 여름에 물놀이하는 사람들로 붐벼요.'],
  ['낙동강 하구는 겨울 철새가 쉬어 가는 넓은 갯벌이에요.', '을숙도에는 철새를 살펴보는 전시관이 있어요.'],
  ['기장 바닷가에는 멸치 축제가 열리는 작은 항구가 있어요.', '해동용궁사는 바위 위 바다 쪽에 지은 절이에요.'],
  ['태종대는 깎아지른 바위 절벽과 등대가 있는 공원이에요.', '맑은 날에는 대마도가 멀리 보이기도 해요.'],
  ['감천마을은 산비탈에 알록달록한 집이 계단처럼 모여 있어요.', '골목 곳곳에 그림과 조형물이 있어 걸으며 구경해요.'],
];
/** 틀만 같은 쪽: 이름·숫자만 바꿨다(자동으로 찍어 낸 쪽) */
const NAMES = ['중구', '서구', '동구', '영도구', '부산진구', '동래구', '남구', '북구', '해운대구', '사하구'];
const tplBody = (n: string, i: number) => [
  `부산 ${n}는 어디에 있을까요? ${n}는 부산 남쪽에 있어요.`,
  `${n}에는 행정동이 ${10 + i}개 있고 맞닿은 곳은 ${3 + i}곳이에요.`,
  `채움지도에서는 부산 ${i + 1}과에서 ${n}를 다른 구와 함께 배워요.`,
  `${n}의 위치를 백지도에서 찾아보며 익혀요.`,
];

/** 쪽 묶음 → 규칙 입력: path → facts */
const factsMap = (pages: Record<string, string>) => new Map(Object.entries(pages).map(([p, h]) => [p, factsOf(h)]));
const bodies = (fm: Map<string, ReturnType<typeof factsOf>>) => new Map([...fm].map(([p, f]) => [p, f.blocks]));
/** 기준 목록: 지금 쪽들을 그대로(날짜 하나) */
const baselineOf = (fm: Map<string, ReturnType<typeof factsOf>>, lastmod = '2026-11-06') => ({ pages: [...fm].map(([p, f]) => ({ path: p, lastmod, hash: contentHash(f) })) });

test('나쁜 예 ①: 틀만 같은 쪽 10개 → 상한과 틀 문장 비율 둘 다 실패, 고유 본문 쪽은 통과', () => {
  const old = factsMap({ '/': page({ body: UNIQUE[0] }), '/about/': page({ body: UNIQUE[1] }) });
  const base = baselineOf(old);
  const added: Record<string, string> = {};
  NAMES.forEach((n, i) => { added[`/busan/g${i}/`] = page({ title: `${n} 위치`, body: tplBody(n, i) }); });
  const all = new Map([...old, ...factsMap(added)]);
  const cap = checkNewIndex([...all.keys()], base);
  assert.equal(cap.added.length, 10);
  assert.equal(cap.errors.length, 1);
  assert.match(cap.errors[0], /새 색인 쪽 10개 — 한 배포에 5개까지/);
  const ratios = templateRatios(bodies(all));
  const tpl = checkTemplate(ratios, cap.added);
  assert.equal(tpl.length, 10, tpl.join('\n'));
  for (const p of cap.added) assert.ok(ratios.get(p)! > TEMPLATE_MAX, `${p} ${ratios.get(p)}`);
  // 상한 안(3쪽)이어도 틀만 같으면 틀 문장 비율로 실패
  const three = new Map([...old, ...[...factsMap(added)].slice(0, 3)]);
  const cap3 = checkNewIndex([...three.keys()], base);
  assert.deepEqual(cap3.errors, []);
  assert.equal(checkTemplate(templateRatios(bodies(three)), cap3.added).length, 3);
  // 사람이 쓴 고유 본문 쪽 3개는 통과(기존 쪽은 틀 비율이 높아도 재기만)
  const good = new Map([...old, ...factsMap({ '/busan/a/': page({ body: UNIQUE[2] }), '/busan/b/': page({ body: UNIQUE[3] }), '/busan/c/': page({ body: UNIQUE[4] }) })]);
  const capG = checkNewIndex([...good.keys()], base);
  assert.deepEqual(capG.errors, []);
  assert.deepEqual(checkTemplate(templateRatios(bodies(good)), capG.added), []);
});

test('틀 판정: 이름·숫자만 바꾼 문장은 같은 틀, 낱말이 많이 다르면 다른 문장', () => {
  const w = wordsOf;
  assert.ok(sameFrame(w('마포구는 서울 서쪽, 한강 북쪽에 있어요.'), w('용산구는 서울 가운데, 한강 북쪽에 있어요.')));
  assert.ok(sameFrame(w('행정동 16개, 맞닿은 곳 5곳'), w('행정동 22개, 맞닿은 곳 7곳')));
  assert.ok(!sameFrame(w('해운대는 모래사장이 넓고 겨울에도 바다를 보러 와요.'), w('자갈치시장은 바다 옆 생선 시장으로 경매가 열려요.')));
  assert.ok(!sameFrame(w('짧은낱말 하나뿐'), w('다른낱말 하나뿐')), '세 낱말 이상이어야 바꾼 자리를 허용');
  assert.ok(sameFrame(w('짧은 세 낱말'), w('다른 세 낱말')));
});

test('나쁜 예 ②: 짝 없는 hreflang → 실패, 서로 가리키는 짝은 통과', () => {
  const pair = (ko: string, en: string): [string, string][] => [['ko', ko], ['en', en], ['x-default', ko]];
  const good = factsMap({
    '/x/': page({ body: UNIQUE[0], alts: pair('/x/', '/en/x/') }),
    '/en/x/': page({ lang: 'en', body: ['An English page that has its own sentence here.'], alts: pair('/x/', '/en/x/') }),
  });
  const ok = checkHreflang(good, SITE);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.pairs, 2);
  // 영어 쪽이 되돌아 가리키지 않음(짝 없는 hreflang)
  const oneWay = factsMap({ '/x/': page({ body: UNIQUE[0], alts: pair('/x/', '/en/x/') }), '/en/x/': page({ lang: 'en', body: ['An English page with no alternate links at all.'] }) });
  assert.match(checkHreflang(oneWay, SITE).errors.join('\n'), /되돌아 가리키지 않음/);
  // 짝 쪽이 빌드에 없음
  const missing = factsMap({ '/x/': page({ body: UNIQUE[0], alts: pair('/x/', '/en/x/') }) });
  assert.match(checkHreflang(missing, SITE).errors.join('\n'), /짝 쪽이 빌드에 없음/);
  // 짝 쪽이 색인하지 않는 쪽 · 짝 쪽의 말이 다름 · 자기 주소가 없음 · x-default 가 짝 밖
  const bad = factsMap({
    '/x/': page({ body: UNIQUE[0], alts: pair('/x/', '/en/x/') }),
    '/en/x/': page({ lang: 'ko', noindex: true, body: ['An English page that has its own sentence here.'], alts: pair('/x/', '/en/x/') }),
    '/y/': page({ body: UNIQUE[1], alts: [['en', '/en/x/'], ['x-default', '/z/']] }),
  });
  const msg = checkHreflang(bad, SITE).errors.join('\n');
  assert.match(msg, /색인하지 않는 쪽/);
  assert.match(msg, /쪽 말이 ko/);
  assert.match(msg, /\/y\/: hreflang 목록에 자기 주소가 없음/);
  assert.match(msg, /x-default 가 짝 가운데 하나가 아님/);
});

test('나쁜 예 ③: 상한을 넘는 새 쪽(6개) → 실패, 5개는 통과, 기준 목록의 쪽이 빠지면 실패', () => {
  const old = factsMap({ '/': page({ body: UNIQUE[0] }) });
  const base = baselineOf(old);
  const mk = (n: number) => new Map([...old, ...factsMap(Object.fromEntries(Array.from({ length: n }, (_, i) => [`/new${i}/`, page({ body: UNIQUE[(i % 6) + 1] })])))]);
  assert.equal(NEW_INDEX_MAX, 5);
  assert.deepEqual(checkNewIndex([...mk(5).keys()], base).errors, []);
  const six = checkNewIndex([...mk(6).keys()], base);
  assert.equal(six.errors.length, 1);
  assert.match(six.errors[0], /새 색인 쪽 6개/);
  const gone = checkNewIndex(['/new0/'], base);
  assert.match(gone.errors.join('\n'), /운영 기준 목록의 색인 쪽이 빠짐 \//);
});

test('나쁜 예 ④: 새 영어 색인 쪽은 허용(2026-11-19 N26 폐지), 말과 주소가 어긋나면 실패', () => {
  const old = factsMap({ '/': page({ body: UNIQUE[0] }), '/en/': page({ lang: 'en', body: ['An English home page that has its own sentence.'] }) });
  const base = baselineOf(old);
  const withNew = (extra: Record<string, string>) => new Map([...old, ...factsMap(extra)]);
  const langOf = (fm: Map<string, ReturnType<typeof factsOf>>) => new Map([...fm].map(([p, f]) => [p, f.lang]));
  // 한·영 짝이 함께 새로 생기면 통과
  const en = withNew({ '/busan/': page({ body: UNIQUE[1] }), '/en/busan/': page({ lang: 'en', body: ['Busan is a port city on the south-east coast of Korea.'] }) });
  assert.deepEqual(checkNewIndex([...en.keys()], base, { langOf: langOf(en) }).errors, []);
  // 주소는 /en/ 이 아닌데 쪽 말이 en 이면, /en/ 주소인데 쪽 말이 ko 이면 실패
  const odd = withNew({ '/busan-en/': page({ lang: 'en', body: ['Busan is a port city on the south-east coast of Korea.'] }) });
  assert.match(checkNewIndex([...odd.keys()], base, { langOf: langOf(odd) }).errors.join(' '), /\/busan-en\/: 새 색인 쪽의 말/);
  const odd2 = withNew({ '/en/busan/': page({ lang: 'ko', body: UNIQUE[1] }) });
  assert.match(checkNewIndex([...odd2.keys()], base, { langOf: langOf(odd2) }).errors.join(' '), /\/en\/busan\/: 새 색인 쪽의 말/);
});

test('나쁜 예 ⑤: 새 쪽의 lastmod 가 기본값(DEFAULT_UPDATED) 그대로 → 실패, 만든 날을 적으면 통과', () => {
  const base = { pages: [{ path: '/', lastmod: DEFAULT_UPDATED, hash: '0'.repeat(16) }, { path: '/privacy.html', lastmod: '2026-11-14', hash: '1'.repeat(16) }] };
  // W2 에서 지역 표에 hub 를 넣어 /busan/ 을 처음 내는데 pages.ts UPDATED 에 날짜를 빠뜨린 경우
  const bad = checkNewLastmod([{ path: '/', lastmod: DEFAULT_UPDATED }, { path: '/busan/', lastmod: DEFAULT_UPDATED }], base);
  assert.equal(bad.length, 1);
  assert.match(bad[0], /^\/busan\/: 새 색인 쪽인데 lastmod 2026-11-06 가 운영 기준 목록의 가장 늦은 날 2026-11-14 보다 이름 — 쪽을 만든 날을 src\/lib\/pages.ts UPDATED 에/);
  // 운영 기준의 가장 늦은 날과 같은 날(배포한 날 다시 내보냄)·그 뒤는 통과. 기준에 있는 쪽은 여기서 보지 않는다(checkLastmod)
  assert.deepEqual(checkNewLastmod([{ path: '/', lastmod: DEFAULT_UPDATED }, { path: '/busan/', lastmod: '2026-11-14' }, { path: '/daegu/', lastmod: '2026-12-01' }], base), []);
});

test('방침 시행일: 본문에서 읽고, 본문을 고쳤는데 시행일이 운영 그대로면 실패(배포 날 PRIVACY_EFFECTIVE 안내)', () => {
  // 방침 쪽(src/pages/privacy*.astro)과 같은 방식으로 원문의 {{EFFECTIVE}} 를 채운다 — 원문 꼴이 바뀌면 여기서 잡힌다
  const [y, m, d] = PRIVACY_EFFECTIVE.split('-').map(Number);
  const ko = fs.readFileSync(path.join(root, 'src/data/legal/privacy-ko.html'), 'utf8').replace('{{EFFECTIVE}}', `${y}년 ${m}월 ${d}일`);
  const en = fs.readFileSync(path.join(root, 'src/data/legal/privacy-en.html'), 'utf8')
    .replace('{{EFFECTIVE}}', new Date(`${PRIVACY_EFFECTIVE}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }));
  assert.equal(effectiveOf(factsOf(`<html lang="ko"><main>${ko}</main></html>`).text), PRIVACY_EFFECTIVE);
  assert.equal(effectiveOf(factsOf(`<html lang="en"><main>${en}</main></html>`).text), PRIVACY_EFFECTIVE);
  assert.equal(effectiveOf('Effective date: Smarch 3, 2026'), null);
  assert.equal(effectiveOf('시행일이 없는 글'), null);
  assert.deepEqual(POLICY_PATHS, ['/privacy.html', '/privacy-en.html']);
  // 운영: 시행일 11-14 본문. 지금: 2항을 고친 본문인데 시행일은 그대로 11-14 → 실패(시행일이 같은 서로 다른 방침 두 판)
  const before = factsMap({ '/privacy.html': page({ body: ['2. 기기에 저장하는 것은 공부 기록뿐이에요.', '시행일: 2026년 11월 14일'] }) });
  const base = baselineOf(before, '2026-11-14');
  const after = factsMap({ '/privacy.html': page({ body: ['2. 기기에 저장하는 것은 공부 기록과 동 공부 기록이에요.', '시행일: 2026년 11월 14일'] }) });
  const hashOf = new Map([...after].map(([p, f]) => [p, contentHash(f)]));
  const same = checkLastmod([{ path: '/privacy.html', lastmod: '2026-11-14' }], hashOf, base);
  assert.equal(same.length, 1);
  assert.match(same[0], /PRIVACY_EFFECTIVE\(시행일\)를 그날로/);
  // 내보내는 날로 시행일을 늦추면 통과
  const moved = factsMap({ '/privacy.html': page({ body: ['2. 기기에 저장하는 것은 공부 기록과 동 공부 기록이에요.', '시행일: 2026년 12월 1일'] }) });
  assert.deepEqual(checkLastmod([{ path: '/privacy.html', lastmod: '2026-12-01' }], new Map([...moved].map(([p, f]) => [p, contentHash(f)])), base), []);
});

test('lastmod 내용 기준: 바뀐 쪽은 날짜가 늦어야, 그대로인 쪽은 날짜도 그대로', () => {
  const before = factsMap({ '/a/': page({ body: UNIQUE[0] }), '/b/': page({ body: UNIQUE[1], desc: '데이터 판 kr-20261001.1 을 쓰는 쪽의 설명입니다' }) });
  const base = baselineOf(before);
  const after = factsMap({ '/a/': page({ body: [...UNIQUE[0], '새로 검수한 소개 단락을 한 줄 더 넣었어요.'] }), '/b/': page({ body: UNIQUE[1], desc: '데이터 판 kr-20261001.2 을 쓰는 쪽의 설명입니다' }) });
  const hashOf = new Map([...after].map(([p, f]) => [p, contentHash(f)]));
  // 데이터 판 이름만 바뀐 쪽은 내용 그대로로 본다
  assert.equal(hashOf.get('/b/'), base.pages[1].hash);
  // 내용이 바뀌었는데 날짜 그대로 → 실패
  assert.match(checkLastmod([{ path: '/a/', lastmod: '2026-11-06' }, { path: '/b/', lastmod: '2026-11-06' }], hashOf, base).join('\n'), /\/a\/: 내용이 운영 기준과 다른데/);
  // 내용 그대로인데 날짜만 바뀜 → 실패
  assert.match(checkLastmod([{ path: '/a/', lastmod: '2026-11-20' }, { path: '/b/', lastmod: '2026-11-20' }], hashOf, base).join('\n'), /\/b\/: 내용은 운영 기준과 같은데/);
  // 바뀐 쪽만 늦은 날짜 → 통과. 새 쪽(기준에 없음)은 보지 않는다
  assert.deepEqual(checkLastmod([{ path: '/a/', lastmod: '2026-11-20' }, { path: '/b/', lastmod: '2026-11-06' }, { path: '/c/', lastmod: '2026-11-21' }], hashOf, base), []);
  // 머리글·그림 글은 내용이 아니다
  const h1 = contentHash(factsOf(page({ body: UNIQUE[2] })));
  const h2 = contentHash(factsOf(page({ body: UNIQUE[2] }).replace('머리글은 본문이 아니다', '머리글을 바꿨다').replace('그림 글은', '그림을')));
  assert.equal(h1, h2);
});

test('운영 기준 목록 파일: 홈 둘이 있고, 주소가 겹치지 않고 날짜·지문 꼴', () => {
  // 쪽 수는 배포 뒤 다시 쓸 때마다 바뀌므로 박지 않는다(2026-11-14 운영 배포본 fb01299 기준 61쪽)
  const b = read('tests/indexed-pages.json');
  const paths = b.pages.map((p: { path: string }) => p.path);
  assert.ok(paths.includes('/') && paths.includes('/en/'));
  assert.equal(new Set(paths).size, paths.length);
  for (const p of b.pages) {
    assert.match(p.path, /^\/([a-z0-9-]+\/)*([a-z0-9-]+\.html)?$/, p.path);
    assert.match(p.lastmod, /^\d{4}-\d{2}-\d{2}$/, p.path);
    assert.match(p.hash, /^[0-9a-f]{16}$/, p.path);
  }
  assert.ok(b.from.length > 0);
  // 방침 두 쪽은 본문 시행일(운영 배포본의 시행일 2026-11-14)이고, 지금 시행일보다 늦을 수 없다
  for (const p of POLICY_PATHS) {
    const row = b.pages.find((x: { path: string }) => x.path === p);
    assert.ok(row && row.lastmod <= PRIVACY_EFFECTIVE, `${p} ${row?.lastmod}`);
  }
});

// 이름의 숫자: 운영 지역 수는 지금 판에서 센다(E12 여덟 · E13 열둘 · E14 열넷)
test('지역 표 → 이름 묶음: 지역이 넷까지는 이름을 다 쓰고(E11), 다섯 이상이면 앞 셋 + 나머지 수로 줄여 쓴다(공개 지역 수는 지역 표에서 셈)', () => {
  // 지역 표 공개 지역(지역 표 차례). E13 열두 지역 + E14 충남·경북 — 수는 지금 판에서 센다
  assert.deepEqual(LIVE.map((s) => s.key), SIDOS.filter((s) => s.status === 'live').map((s) => s.key));
  assert.deepEqual(LIVE.filter((s) => (s.openOrder ?? 99) <= 12).map((s) => s.key), ['seoul', 'busan', 'daegu', 'incheon', 'daejeon', 'ulsan', 'sejong', 'gyeonggi', 'chungbuk', 'jeju', 'gangwon', 'jeonbuk']);
  // 다섯 곳 이상이면 앞 셋을 공개 차례(지역 표 openOrder — 홈 탭·다 채움 단추와 같은 차례)로 고른다(E12 검수: 지역 표 차례면 '서울·부산·대구'가 되어 인천·경기가 빠졌다)
  // E16 에 열여섯 곳을 모두 열면 '전국 16개 시·도'(regions.ts — 모두 열면 그 글)
  assert.equal(scopeKo(), LIVE.length === SIDOS.length ? `전국 ${SIDOS.length}개 시·도` : `서울·인천·경기 등 ${LIVE.length}개 시·도`);
  // 영어는 영문 확인 전 지역만 빼고 센다(2026-11-16 부터 과 없는 지역 세종·제주도 셈 — 영어 앱에도 동 단원이 열림, EN_EMD 7.1.
  // 전에는 빼서 E13 'and 7 more' · E14 9 · E15 까지 10 · E16 11). 모두 열려 영문을 다 확인했으면 'all 16 provinces and cities of Korea'
  const enLive = LIVE.filter((s) => s.enChecked).length;
  assert.equal(scopeEn(), enLive === SIDOS.length ? `all ${SIDOS.length} provinces and cities of Korea` : `Seoul, Incheon, Gyeonggi and ${enLive - 3} more regions`);
  const rows = (...keys: string[]) => SIDOS.filter((s) => keys.includes(s.key));
  // 세 지역(E10 까지)·네 지역(E11)은 전과 같은 글
  const e10 = rows('seoul', 'incheon', 'gyeonggi');
  assert.equal(scopeKo(e10), '서울·인천·경기');
  assert.equal(scopeEn(e10), 'Seoul, Incheon and Gyeonggi');
  assert.equal(scopeKo(rows('seoul', 'busan', 'incheon', 'gyeonggi')), '서울·부산·인천·경기');
  assert.equal(scopeEn(rows('seoul', 'busan', 'incheon', 'gyeonggi')), 'Seoul, Busan, Incheon and Gyeonggi');
  assert.equal(scopeKo(rows('seoul', 'busan', 'daegu', 'incheon', 'daejeon', 'ulsan', 'sejong', 'gyeonggi')), '서울·인천·경기 등 8개 시·도');
  // 공개 차례가 없는 행(openOrder null)만 남으면 받은 차례(지역 표 차례) 그대로
  // (E13 부터 열지 않은 지역은 넷뿐이라, E13 에 연 행의 공개 차례를 지운 다섯 행으로 본다 — 지역 표 차례 광주특별시(전남광주 — 2026-11-15 법정 약칭)·충북·충남·경북·경남)
  assert.equal(scopeKo(SIDOS.filter((s) => s.openOrder === null || s.openOrder >= 9).map((s) => ({ ...s, openOrder: null })).slice(0, 5)), '광주특별시·충북·충남 등 5개 시·도');
  assert.equal(scopeKo(SIDOS), '전국 16개 시·도');
  // 영어는 영어 이름을 확인한 지역만 — 확인하지 않은 지역(enChecked false)은 이름도 수도 넣지 않고, '모두'라고 하지 않는다.
  // 전남광주는 2026-11-15 사용자 지시로 켬(짧은 이름 Jeonnam-Gwangju). 규칙은 전남광주 영문을 끈 가짜 행으로 본다
  assert.equal(sidoOf('jeonnam-gwangju')!.enChecked, true);
  const hideJg = (xs: typeof SIDOS) => xs.map((s) => (s.key === 'jeonnam-gwangju' ? { ...s, enChecked: false } : s));
  assert.equal(scopeEn(rows('seoul', 'jeonnam-gwangju', 'incheon')), 'Seoul, Jeonnam-Gwangju and Incheon');
  assert.equal(scopeEn(hideJg(rows('seoul', 'jeonnam-gwangju', 'incheon'))), 'Seoul and Incheon');
  // 과 없는 지역(세종·제주 — layer emd)도 센다(EN_EMD — 2026-11-16 영어 앱에도 동이 열림. E12~E17 에는 빼서 '… and 11 more regions'): 영어 이름을 다 확인하면 '모두'
  assert.equal(scopeEn(SIDOS), 'all 16 provinces and cities of Korea');
  assert.equal(scopeEn(hideJg(SIDOS)), 'Seoul, Incheon, Gyeonggi and 12 more regions');
  // 공개 차례가 없는 행이면 지역 표 차례로 앞 셋(영문을 끈 전남광주는 이름도 수도 없음)
  assert.equal(scopeEn(hideJg(SIDOS).map((s) => ({ ...s, openOrder: null }))), 'Seoul, Busan, Daegu and 12 more regions');
  assert.equal(scopeEn(SIDOS.map((s) => ({ ...s, enChecked: true, layer: 'sgg' as const }))), 'all 16 provinces and cities of Korea');
  assert.throws(() => scopeKo([]));
  assert.equal(listEn(['A']), 'A');
});

test('지역 표 → 허브: 서울·인천·경기, 머리글 지금 쪽 판정', () => {
  assert.deepEqual(HUBS.map((s) => s.key), ['seoul', 'incheon', 'gyeonggi']);
  const re = hubPathRe();
  for (const p of ['/seoul/', '/seoul/jongno-gu/', '/incheon/', '/gyeonggi', '/seoul']) assert.ok(re.test(p), p);
  for (const p of ['/', '/seoulx/', '/busan/', '/guide/', '/about/']) assert.ok(!re.test(p), p);
  assert.ok(!hubPathRe([]).test('/'), '허브가 없으면 아무 주소도 아님');
});

test('slug 지도는 곳 id 기준: 여러 지역의 같은 이름(중구)이 덮어쓰지 않음', () => {
  const names: Named[] = [
    { id: 'kr:sgg:11140', ko: '중구', kind: 'sgg', region: 'seoul' },
    { id: 'kr:sgg:26110', ko: '중구', kind: 'sgg', region: 'busan' },
    { id: 'kr:sgg:41281', ko: '고양시 덕양구', kind: 'sgg', region: 'gyeonggi' },
  ];
  const src = { regions: [{ key: 'seoul', slugs: { 중구: 'jung-gu' } }, { key: 'busan', slugs: { 중구: 'busan-jung-gu' } }], generalGu: { _note: '', '고양시 덕양구': 'goyang-si-deogyang-gu' } };
  const m = slugMapOf(src, names);
  assert.equal(m.get('kr:sgg:11140'), 'jung-gu');
  assert.equal(m.get('kr:sgg:26110'), 'busan-jung-gu');
  assert.equal(enOfSlug(m.get('kr:sgg:41281')!), 'Goyang-si Deogyang-gu');
  // 이름으로만 찾던 예전 방식이면 서울 중구가 부산 slug 로 덮였다
  const byKo = new Map<string, string>();
  for (const r of src.regions) for (const [ko, sl] of Object.entries(r.slugs)) byKo.set(ko, sl);
  assert.equal(byKo.get('중구'), 'busan-jung-gu');
  // 한 지역 안 같은 이름 둘 · 같은 id 에 다른 slug · 전국에 둘인 일반구 이름은 멈춘다
  assert.throws(() => slugMapOf({ regions: [{ key: 'seoul', slugs: { 중구: 'jung-gu' } }] }, [...names, { id: 'kr:sgg:11999', ko: '중구', kind: 'si', region: 'seoul' }]), /seoul 안에 '중구' 가 2곳/);
  assert.throws(() => slugMapOf({ regions: [{ key: 'seoul', slugs: { 중구: 'jung-gu' } }, { key: 'seoul', slugs: { 중구: 'joong-gu' } }] }, names), /slug 가 둘/);
  assert.throws(() => slugMapOf({ regions: [], generalGu: { '고양시 덕양구': 'x' } }, [...names, { id: 'kr:sgg:99999', ko: '고양시 덕양구', kind: 'sgg', region: 'busan' }]), /일반구 이름/);
});

test('slug 지도(실제 원고): 공개 지역의 모든 곳이 판 units.json 의 slug 와 같다', () => {
  const units = read('src/data/units.json');
  const names: Named[] = read('src/data/search-sgg.json').items;
  const m = slugMapOf(units, names);
  const pub = read(`public/data/geo/${DATA_VER}/units.json`);
  const items = [...pub.regions.flatMap((r: { items: { id: string; slug: string }[] }) => r.items), ...Object.values(pub.guUnits ?? {}).flatMap((u) => (u as { items: { id: string; slug: string }[] }).items)];
  assert.ok(items.length >= 83, String(items.length));
  for (const it of items) assert.equal(m.get(it.id), it.slug, it.id);
  // 서울 구 쪽 영어 이웃 이름에 나오는 경기 일반구·인천 구
  assert.equal(enOfSlug(m.get('kr:sgg:41281')!), 'Goyang-si Deogyang-gu');
  assert.equal(enOfSlug(m.get('kr:sgg:11140')!), 'Jung-gu');
});
