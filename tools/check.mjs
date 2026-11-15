// 빌드 결과(dist) 점검. 하나라도 실패하면 1 로 끝나 배포를 막는다(설계서 8.4)
//  1 링크: 사이트 안 링크·자원이 모두 dist 에 있다
//  2 옛 주소: tests/legacy-urls.txt 의 주소가 모두 있다
//  3 사이트맵: loc 가 모두 있고, 색인 쪽과 1:1 이며, lastmod 가 날짜다. robots.txt 가 이 사이트맵을 알린다
//  4 쪽 머리: title·description·canonical(제 주소)·h1 하나·og:image(빌드에 있는 파일)
//  5 본문: JS 없이 읽히는 본문 글자 수(색인 쪽 200자 미만은 실패, 400자 미만은 경고), 다른 쪽과 겹치는 문장 비율(50% 넘으면 실패)
//  6 광고 자리: 광고를 둘 수 있다고 표시한 쪽(data-ads)은 글·허브·지역·소개·출처뿐. 홈(앱)·문의·방침·영문·404 에는 없다. ads.txt 가 광고 계정과 같다
//    (지역 허브는 지역 표 src/data/sido.json 에서 hub 가 있는 지역 — 계획서 E9)
//  7 정적 쪽 틀(계획서 E9 · 규칙은 tools/site-rules.mjs, 나쁜 예 시험은 tests/unit/site-rules.test.ts):
//    - 운영 기준 목록(tests/indexed-pages.json = 지금 운영에 나간 색인 쪽·lastmod·내용 지문)과 견줘
//      새 색인 쪽이 한 배포에 5개를 넘거나, 새 색인 쪽이 한국어가 아니거나(N26), 기준 목록의 쪽이 빠지면 실패
//    - lastmod 내용 기준: 내용(제목·설명·본문)이 기준과 다르면 lastmod 가 기준보다 늦어야, 같으면 lastmod 도 같아야 한다.
//      새 쪽은 lastmod 가 기준 목록의 가장 늦은 날보다 이르면 실패
//    - 방침 두 쪽: 사이트맵 lastmod 가 본문 시행일과 같아야 한다. 본문을 고쳤는데 시행일이 운영 그대로면
//      배포 빌드(GitHub Actions, 또는 --release)에서만 실패하고 로컬 점검에서는 경고다 — 시행일은 내보내는 날에만 정할 수 있다
//    - 틀 문장 비율: 새 쪽은 다른 쪽과 이름·숫자만 바꾼 문장이 본문의 절반을 넘으면 실패(기존 쪽은 재기만)
//    - hreflang 짝: 짝 쪽이 빌드에 있고 색인 쪽이며, 서로 같은 짝 목록을 가리킨다
//  + 금지 문자열: 'undefined', 옛 이름 '전국 지리 마스터', 채우지 않은 자리 표시({{…}})는 실패
//
// 쓰는 법: node tools/check.mjs [--dist <폴더>] [--release]   dist 점검(npm run check 의 마지막). --release 는 배포 빌드와 같은 판정
//          node tools/check.mjs --write-baseline --from <설명> [--dist <폴더>]
//              운영 기준 목록을 다시 쓴다. **운영에 배포한 뒤**, 배포한 것과 같은 빌드로 한 번 돌린다(배포 전에 쓰면 상한·lastmod 점검이 뜻을 잃는다).
//              --from(어느 배포본인지, 예: "운영 배포본 abc1234 — 2026-12-01")이 없으면 쓰지 않는다. 방침 두 쪽의 lastmod 는 본문 시행일로 적는다
import fs from 'node:fs';
import path from 'node:path';
import { SITE, BASE } from '../site.config.mjs';
import {
  factsOf, contentHash, checkNewIndex, checkLastmod, checkNewLastmod, checkHreflang, templateRatios, checkTemplate, effectiveOf, POLICY_PATHS, NEW_INDEX_MAX, TEMPLATE_MAX,
} from './site-rules.mjs';

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const DIST = opt('--dist') ?? 'dist';
const BASELINE = 'tests/indexed-pages.json';
/** 배포 빌드(.github/workflows/deploy.yml 의 '점검')와 같은 판정: 로컬에서 경고로 두는 '배포 날에만 정할 수 있는 것'도 실패로 본다 */
const RELEASE = process.env.GITHUB_ACTIONS === 'true' || argv.includes('--release');

const errors = [];
const warns = [];
const err = (step, msg) => errors.push(`[${step}] ${msg}`);
const warn = (step, msg) => warns.push(`[${step}] ${msg}`);

if (!fs.existsSync(DIST)) { console.error('dist 가 없습니다. 먼저 npm run build'); process.exit(1); }

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}
const files = walk(DIST);
const htmls = files.filter((f) => f.endsWith('.html'));
const rel = (f) => path.relative(DIST, f).split(path.sep).join('/');
const urlOf = (f) => BASE + '/' + rel(f).replace(/(^|\/)index\.html$/, '$1');

/** 사이트 안 경로(기준 경로 포함) → dist 파일. 없으면 null */
function fileOf(urlPath) {
  let p = decodeURI(urlPath.split('#')[0].split('?')[0]);
  if (p !== BASE && !p.startsWith(BASE + '/')) return null;
  p = p.slice(BASE.length) || '/';
  const cands = p.endsWith('/') ? [path.join(DIST, p, 'index.html')] : [path.join(DIST, p), path.join(DIST, p, 'index.html')];
  return cands.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) || null;
}
const attrs = (html, re) => [...html.matchAll(re)].map((m) => m[1]);

const indexable = new Set(htmls.filter((f) => !/<meta name="robots" content="[^"]*noindex/.test(fs.readFileSync(f, 'utf8')) && rel(f) !== '404.html').map(urlOf));
const sitemapEntries = () => {
  const smPath = path.join(DIST, 'sitemap.xml');
  if (!fs.existsSync(smPath)) return null;
  return [...fs.readFileSync(smPath, 'utf8').matchAll(/<url><loc>([^<]+)<\/loc><lastmod>([^<]*)<\/lastmod><\/url>/g)].map(([, loc, lastmod]) => ({ loc, lastmod }));
};
/** 기준 경로를 뗀 사이트 안 주소('/seoul/') */
const local = (u) => u.slice(BASE.length) || '/';
const factsByPath = new Map(htmls.map((f) => [local(urlOf(f)), factsOf(fs.readFileSync(f, 'utf8'))]));

/* 운영 기준 목록 쓰기(--write-baseline): 점검하지 않고 쓰고 끝낸다 */
if (argv.includes('--write-baseline')) {
  const from = (opt('--from') ?? '').trim();
  if (!from || from.startsWith('--')) { console.error('--from <설명> 이 필요함(어느 운영 배포본으로 썼는지, 예: "운영 배포본 abc1234 — 2026-12-01"). 쓰지 않음'); process.exit(1); }
  const entries = sitemapEntries();
  if (!entries) { console.error('sitemap.xml 이 없음'); process.exit(1); }
  const lastmodOf = new Map(entries.map((e) => [local(new URL(e.loc).pathname), e.lastmod]));
  // 방침 두 쪽은 본문 시행일을 적는다(옛 빌드는 사이트맵에 DEFAULT_UPDATED 를 냈다 — 운영 시행일과 견줘야 '시행일 그대로 본문만 바뀜'을 잡는다)
  for (const p of POLICY_PATHS) {
    if (!lastmodOf.has(p)) continue;
    const eff = effectiveOf(factsByPath.get(p)?.text ?? '');
    if (!eff) { console.error(`${p}: 본문에서 시행일을 찾지 못함. 쓰지 않음`); process.exit(1); }
    lastmodOf.set(p, eff);
  }
  const pages = [...indexable].map(local).map((p) => ({ path: p, lastmod: lastmodOf.get(p) ?? '', hash: contentHash(factsByPath.get(p)) }));
  const order = [...lastmodOf.keys()];
  pages.sort((a, b) => order.indexOf(a.path) - order.indexOf(b.path));
  const out = {
    _note: '운영 기준 목록(계획서 E9): 지금 운영에 나간 색인 쪽과 그 lastmod·내용 지문(tools/site-rules.mjs contentHash — 제목·설명·본문 글, 데이터 판 이름 뺌). 방침 두 쪽의 lastmod 는 본문 시행일이다. tools/check.mjs 7 이 이것과 견줘 새 색인 쪽 상한(한 배포 5개)·빠진 쪽·lastmod 내용 기준을 본다. 운영에 배포한 뒤 그 빌드로 node tools/check.mjs --write-baseline --from "<배포 설명>" 을 돌려 다시 쓴다',
    from,
    pages,
  };
  // 한 쪽에 한 줄(배포마다 고친 줄이 diff 에 그대로 보이게)
  const body = [`{`, ` "_note": ${JSON.stringify(out._note)},`, ` "from": ${JSON.stringify(out.from)},`, ` "pages": [`,
    pages.map((p) => `  ${JSON.stringify(p)}`).join(',\n'), ` ]`, `}`].join('\n');
  fs.writeFileSync(BASELINE, body + '\n');
  console.log(`운영 기준 목록을 씀: ${BASELINE} · 색인 쪽 ${pages.length}개 (${DIST})`);
  process.exit(0);
}

/* 1 링크 */
for (const f of htmls) {
  const html = fs.readFileSync(f, 'utf8');
  const here = urlOf(f);
  const refs = [...attrs(html, /\s(?:href|src)="([^"]*)"/g)];
  for (const r of refs) {
    if (!r || r.startsWith('#') || /^(mailto:|tel:|data:|javascript:)/.test(r)) continue;
    let u;
    try { u = new URL(r, SITE + here); } catch { err(1, `${rel(f)}: 주소를 읽을 수 없음 ${r}`); continue; }
    if (u.origin !== SITE || !(u.pathname === BASE || u.pathname.startsWith(BASE + '/'))) continue;   // 바깥 링크
    if (!fileOf(u.pathname)) err(1, `${rel(f)}: 없는 곳으로 가는 링크 ${r}`);
  }
}

/* 2 옛 주소 */
const legacy = fs.readFileSync('tests/legacy-urls.txt', 'utf8').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
for (const p of legacy) if (!fileOf(BASE + p)) err(2, `옛 주소가 빌드에 없음 ${p}`);

/* 3 사이트맵 */
const smPath = path.join(DIST, 'sitemap.xml');
if (!fs.existsSync(smPath)) err(3, 'sitemap.xml 이 없음');
else {
  const sm = fs.readFileSync(smPath, 'utf8');
  const entries = [...sm.matchAll(/<url><loc>([^<]+)<\/loc><lastmod>([^<]*)<\/lastmod><\/url>/g)];
  const locs = new Set();
  for (const [, loc, lastmod] of entries) {
    const u = new URL(loc);
    if (u.origin !== SITE) err(3, `다른 주소 ${loc}`);
    if (!fileOf(u.pathname)) err(3, `사이트맵의 쪽이 빌드에 없음 ${loc}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lastmod) || isNaN(Date.parse(lastmod))) err(3, `lastmod 가 날짜가 아님 ${loc} ${lastmod}`);
    locs.add(u.pathname);
  }
  for (const u of indexable) if (!locs.has(u)) err(3, `색인 쪽이 사이트맵에 없음 ${u}`);
  for (const u of locs) if (!indexable.has(u)) err(3, `사이트맵에 색인하지 않는 쪽 ${u}`);
}

/* 4 쪽 머리 */
for (const f of htmls) {
  const html = fs.readFileSync(f, 'utf8');
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  const canon = (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (!title || !title.trim()) err(4, `${rel(f)}: title 없음`);
  if (!desc || desc.trim().length < 20) err(4, `${rel(f)}: description 없음 또는 너무 짧음`);
  if (rel(f) === '404.html') { if (canon) err(4, '404.html: 없는 주소마다 나오는 쪽인데 canonical 이 있음'); }
  else if (canon !== SITE + urlOf(f)) err(4, `${rel(f)}: canonical 이 제 주소가 아님 (${canon})`);
  if (h1 !== 1) err(4, `${rel(f)}: h1 이 ${h1}개`);
  const og = (html.match(/<meta property="og:image" content="([^"]*)"/) || [])[1];
  if (!og || !og.startsWith(SITE + BASE + '/') || !fileOf(og.slice(SITE.length))) err(4, `${rel(f)}: og:image 가 없거나 빌드에 없는 파일 (${og})`);
}

/* 5 본문 글자 수와 겹치는 문장 */
// 색인 쪽(사이트맵에 있는 쪽)만. 앱 문서(홈)는 JS 가 그리므로 대체 글만 본다. 문장 = 블록 요소 하나의 글(15자 이상)
const blocks = (html) => {
  const main = (html.match(/<main[^>]*>([\s\S]*?)<\/main>/) || [, ''])[1]
    .replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '');
  return [...main.matchAll(/<(p|li|td|dd|dt|h1|h2|h3|figcaption)[^>]*>([\s\S]*?)<\/\1>/g)]
    .map((m) => m[2].replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim()).filter((t) => t.length >= 15);
};
const bodyOf = new Map();
for (const f of htmls) {
  const u = urlOf(f);
  if (!indexable.has(u)) continue;
  bodyOf.set(u, blocks(fs.readFileSync(f, 'utf8')));
}
const seen = new Map();
for (const list of bodyOf.values()) for (const t of new Set(list)) seen.set(t, (seen.get(t) || 0) + 1);
for (const [u, list] of bodyOf) {
  const total = list.reduce((s, t) => s + t.length, 0);
  const dup = list.filter((t) => seen.get(t) > 1).reduce((s, t) => s + t.length, 0);
  const isApp = u === BASE + '/' || u === BASE + '/en/';
  if (!isApp && total < 200) err(5, `${u}: 본문 ${total}자(200자 미만)`);
  else if (!isApp && total < 400) warn(5, `${u}: 본문 ${total}자(400자 미만)`);
  if (total && dup / total > 0.5) err(5, `${u}: 다른 쪽과 겹치는 문장 ${Math.round((dup / total) * 100)}%`);
}

/* 6 광고 자리 */
// 지역 허브는 지역 표에서 hub 가 있는 지역(정적 쪽 틀 — 계획서 E9)
const HUB_KEYS = JSON.parse(fs.readFileSync('src/data/sido.json', 'utf8')).sidos.filter((s) => s.hub).map((s) => s.key);
const ADS_OK = new RegExp(`^${BASE}/(${['guide', ...HUB_KEYS, 'about', 'sources'].join('|')})/`);
for (const f of htmls) {
  const html = fs.readFileSync(f, 'utf8');
  const u = urlOf(f);
  const marked = /<html[^>]*\sdata-ads="1"/.test(html);
  const script = html.includes('pagead2.googlesyndication.com');
  if (marked && !ADS_OK.test(u)) err(6, `${u}: 광고를 두면 안 되는 쪽에 광고 표시`);
  if (script && !marked) err(6, `${u}: 광고 표시 없는 쪽에 애드센스 스크립트`);
}
// ads.txt: 맞춤 도메인 바로 아래(BASE '')에서 애드센스가 읽는다. consts 의 광고 계정과 같아야 한다
const pub = (fs.readFileSync('src/consts.ts', 'utf8').match(/ADSENSE_ACCOUNT = 'ca-(pub-\d+)'/) || [])[1];
const adsTxt = fs.existsSync(path.join(DIST, 'ads.txt')) ? fs.readFileSync(path.join(DIST, 'ads.txt'), 'utf8') : '';
if (!pub || !adsTxt.includes(`google.com, ${pub}, DIRECT, f08c47fec0942fa0`)) err(6, `ads.txt 가 없거나 광고 계정(${pub})과 다름`);
// robots.txt: 도메인 바로 아래에서 검색 로봇이 읽는다. 사이트맵 주소가 맞아야 한다(3)
const robots = fs.existsSync(path.join(DIST, 'robots.txt')) ? fs.readFileSync(path.join(DIST, 'robots.txt'), 'utf8') : '';
if (!robots.includes(`Sitemap: ${SITE}${BASE}/sitemap.xml`)) err(3, `robots.txt 가 없거나 사이트맵 주소(${SITE}${BASE}/sitemap.xml)를 알리지 않음`);

/* 7 정적 쪽 틀 */
let line7 = '';
if (!fs.existsSync(BASELINE)) err(7, `운영 기준 목록 ${BASELINE} 이 없음(node tools/check.mjs --write-baseline — 운영 배포본 빌드로)`);
else {
  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const idx = [...indexable].map(local);
  const cap = checkNewIndex(idx, baseline, { langOf: new Map(idx.map((p) => [p, factsByPath.get(p)?.lang ?? ''])) });
  for (const e of cap.errors) err(7, e);
  const entries = (sitemapEntries() ?? []).map((e) => ({ path: local(new URL(e.loc).pathname), lastmod: e.lastmod }));
  const hashOf = new Map(idx.map((p) => [p, contentHash(factsByPath.get(p))]));
  const policy = entries.filter((e) => POLICY_PATHS.includes(e.path));
  for (const e of checkLastmod(entries.filter((x) => !policy.includes(x)), hashOf, baseline)) err(7, e);
  for (const e of checkNewLastmod(entries, baseline)) err(7, e);
  // 방침: lastmod = 본문 시행일(pages.ts). 본문을 고쳤는데 시행일이 운영 그대로인 것은 내보내는 날에야 고칠 수 있어 배포 빌드에서만 실패
  for (const e of policy) {
    const eff = effectiveOf(factsByPath.get(e.path)?.text ?? '');
    if (eff !== e.lastmod) err(7, `${e.path}: 사이트맵 lastmod ${e.lastmod} 가 본문 시행일 ${eff ?? '(못 찾음)'} 과 다름(src/lib/pages.ts 방침 줄)`);
  }
  for (const e of checkLastmod(policy, hashOf, baseline)) (RELEASE ? err : warn)(7, RELEASE ? e : `${e} (배포 빌드에서는 실패)`);
  const ratios = templateRatios(new Map([...bodyOf].map(([u, list]) => [local(u), list])));
  for (const e of checkTemplate(ratios, cap.added)) err(7, e);
  const hl = checkHreflang(factsByPath, SITE, BASE);
  for (const e of hl.errors) err(7, e);
  const old = [...ratios].filter(([p]) => !cap.added.includes(p)).sort((a, b) => b[1] - a[1]);
  const pct = (r) => `${Math.round(r * 100)}%`;
  line7 = `정적 쪽 틀: 기준 ${baseline.pages.length}쪽 · 새 색인 쪽 ${cap.added.length}개(상한 ${NEW_INDEX_MAX}) · 빠진 쪽 ${cap.removed.length} · `
    + `틀 문장 비율 새 쪽 최대 ${cap.added.length ? pct(Math.max(...cap.added.map((p) => ratios.get(p) ?? 0))) : '-'}(상한 ${pct(TEMPLATE_MAX)}) · 기존 쪽 최대 ${old.length ? `${pct(old[0][1])} ${old[0][0]}` : '-'} · hreflang 짝 ${hl.pairs}`
    + ` · 방침 시행일 ${policy.map((e) => e.lastmod).join('/') || '-'}(운영 ${POLICY_PATHS.map((p) => baseline.pages.find((x) => x.path === p)?.lastmod ?? '-').join('/')})${RELEASE ? ' · 배포 판정' : ''}`;
}

/* 금지 문자열 */
for (const f of htmls) {
  const text = fs.readFileSync(f, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
  if (/\bundefined\b/.test(text)) err('금지', `${rel(f)}: 'undefined' 가 화면 글에 있음`);
  if (text.includes('전국 지리 마스터')) err('금지', `${rel(f)}: 옛 이름 '전국 지리 마스터'`);
  if (/\{\{[A-Z_]+\}\}/.test(text)) err('금지', `${rel(f)}: 채우지 않은 자리 표시 {{…}}`);
}

console.log(`쪽 ${htmls.length}개 · 파일 ${files.length}개 · 옛 주소 ${legacy.length}개 · 색인 쪽 ${indexable.size}개`);
if (line7) console.log(line7);
for (const w of warns) console.log('경고 ' + w);
if (errors.length) { for (const e of errors) console.error('실패 ' + e); console.error(`점검 실패 ${errors.length}건`); process.exit(1); }
console.log('점검 통과');
