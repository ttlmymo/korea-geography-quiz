// 빌드 결과(dist) 점검. 하나라도 실패하면 1 로 끝나 배포를 막는다(설계서 8.4)
//  1 링크: 사이트 안 링크·자원이 모두 dist 에 있다
//  2 옛 주소: tests/legacy-urls.txt 의 주소가 모두 있다
//  3 사이트맵: loc 가 모두 있고, 색인 쪽과 1:1 이며, lastmod 가 날짜다. robots.txt 가 이 사이트맵을 알린다
//  4 쪽 머리: title·description·canonical(제 주소)·h1 하나·og:image(빌드에 있는 파일)
//  5 본문: JS 없이 읽히는 본문 글자 수(색인 쪽 200자 미만은 실패, 400자 미만은 경고), 다른 쪽과 겹치는 문장 비율(50% 넘으면 실패)
//  6 광고 자리: 광고를 둘 수 있다고 표시한 쪽(data-ads)은 글·허브·지역·소개·출처뿐. 홈(앱)·문의·방침·영문·404 에는 없다. ads.txt 가 광고 계정과 같다
//  + 금지 문자열: 'undefined', 옛 이름 '전국 지리 마스터', 채우지 않은 자리 표시({{…}})는 실패
import fs from 'node:fs';
import path from 'node:path';
import { SITE, BASE } from '../site.config.mjs';

const DIST = 'dist';

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
const indexable = new Set(htmls.filter((f) => !/<meta name="robots" content="[^"]*noindex/.test(fs.readFileSync(f, 'utf8')) && rel(f) !== '404.html').map(urlOf));
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
const ADS_OK = new RegExp(`^${BASE}/(guide|seoul|incheon|gyeonggi|about|sources)/`);
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

/* 금지 문자열 */
for (const f of htmls) {
  const text = fs.readFileSync(f, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
  if (/\bundefined\b/.test(text)) err('금지', `${rel(f)}: 'undefined' 가 화면 글에 있음`);
  if (text.includes('전국 지리 마스터')) err('금지', `${rel(f)}: 옛 이름 '전국 지리 마스터'`);
  if (/\{\{[A-Z_]+\}\}/.test(text)) err('금지', `${rel(f)}: 채우지 않은 자리 표시 {{…}}`);
}

console.log(`쪽 ${htmls.length}개 · 파일 ${files.length}개 · 옛 주소 ${legacy.length}개 · 색인 쪽 ${indexable.size}개`);
for (const w of warns) console.log('경고 ' + w);
if (errors.length) { for (const e of errors) console.error('실패 ' + e); console.error(`점검 실패 ${errors.length}건`); process.exit(1); }
console.log('점검 통과');
