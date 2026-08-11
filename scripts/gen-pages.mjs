import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { SEOUL_SLUGS } from "./seoul-slugs.mjs";

/* ─── 설정: 실서비스로 옮길 때 이 두 줄만 바꾸면 됨 ─── */
const BASE_PATH = "/korea-geography-quiz";
const IS_TEST   = false;
/* ──────────────────────────────────────────────── */

const ORIGIN   = "https://ttlmymo.github.io";
const SITE_URL = ORIGIN + BASE_PATH;
const CDN = "https://cdn.jsdelivr.net/gh/ttlmymo/korea-geography-quiz@main";
const OG_IMAGE    = `${SITE_URL}/social-image/og-image-ko.jpg`;
const OG_IMAGE_EN = `${SITE_URL}/social-image/og-image-en.jpg`;
const ADJ_GRID = 0.007;

const HEAD_COMMON = `
<meta name="google-adsense-account" content="ca-pub-1946710813485758">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1946710813485758" crossorigin="anonymous"></script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-E5PLVYPNS2"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-E5PLVYPNS2');</script>`;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const koCmp = (a, b) => String(a).localeCompare(String(b), "ko", { numeric: true });

/* features.js에서 GU_FEATURE 객체 추출 */
async function loadFeatures() {
  const src = await readFile("features.js", "utf8");
  return new Function(src + "\nreturn GU_FEATURE;")();
}

async function loadFeaturesEn() {
  const src = await readFile("features_en.js", "utf8");
  return new Function(src + "\nreturn GU_FEATURE_EN;")();
}

async function loadRoma() {
  const src = await readFile("roma.js", "utf8");
  return new Function("window", src + "\nreturn { ROMA, romanizeDong, romanizePlace };")({});
}

/* 폴리곤 좌표 순회 */
function eachCoord(geometry, cb) {
  const walk = (arr, depth) => {
    if (depth === 0) { cb(arr[0], arr[1]); return; }
    arr.forEach((a) => walk(a, depth - 1));
  };
  if (geometry.type === "Polygon") walk(geometry.coordinates, 2);
  else if (geometry.type === "MultiPolygon") walk(geometry.coordinates, 3);
}

/* 격자 기반 인접 구 계산 (앱의 computeAdjacency와 같은 원리) */
function computeGuAdjacency(guGeo) {
  const cellToGus = new Map();
  guGeo.features.forEach((f) => {
    const code = f.properties?.sgg;
    if (!code || !f.geometry) return;
    const seen = new Set();
    eachCoord(f.geometry, (lng, lat) => {
      const cell = Math.round(lng / ADJ_GRID) + "," + Math.round(lat / ADJ_GRID);
      if (seen.has(cell)) return;
      seen.add(cell);
      if (!cellToGus.has(cell)) cellToGus.set(cell, new Set());
      cellToGus.get(cell).add(code);
    });
  });
  const adj = {};
  cellToGus.forEach((set) => {
    const arr = [...set];
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        (adj[arr[i]] ??= new Set()).add(arr[j]);
        (adj[arr[j]] ??= new Set()).add(arr[i]);
      }
    }
  });
  return adj;
}

/* 이미지 상대경로를 절대경로로 변환 */
const fixImg = (src) =>
  /^https?:\/\//.test(src) ? src : `${SITE_URL}/${String(src).replace(/^\/+/, "")}`;

function renderPage({ guName, slug, en, desc, history, people, images, dongs, adjNames }) {
  const url = `${SITE_URL}/seoul/${slug}/`;
  const title = `${guName} 행정구역 지도·동 목록 | 전국 지리 마스터 퀴즈`;
  const metaDesc = `서울특별시 ${guName}의 위치와 법정동 ${dongs.length}개 목록, 인접 자치구, 역사와 유래를 지도와 함께 정리했습니다.`;

  const dongHtml = dongs.map((d) => `<li>${esc(d)}</li>`).join("");
  const adjHtml = adjNames.length
    ? adjNames.map((n) => {
        const s = SEOUL_SLUGS[n];
        return s ? `<a href="${SITE_URL}/seoul/${s.slug}/">${esc(n)}</a>` : esc(n);
      }).join(", ")
    : "인접한 자치구 정보가 없습니다.";

  const imgHtml = (images || []).map((im) =>
    `<figure><img src="${esc(fixImg(im.src))}" alt="${esc(im.caption || guName)}" loading="lazy">
     ${im.caption ? `<figcaption>${esc(im.caption)}</figcaption>` : ""}</figure>`).join("");

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "전국 지리 마스터 퀴즈", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "서울특별시", item: `${SITE_URL}/seoul/` },
        { "@type": "ListItem", position: 3, name: guName, item: url }
      ]},
      { "@type": "Place", name: `서울특별시 ${guName}`, alternateName: `Seoul ${en}`,
        description: desc || metaDesc, url,
        containedInPlace: { "@type": "AdministrativeArea", name: "서울특별시" } }
    ]
  };

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${HEAD_COMMON}
<title>${esc(title)}</title>
${IS_TEST ? '<meta name="robots" content="noindex, nofollow">' : ""}
<meta name="description" content="${esc(metaDesc)}">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="ko" href="${url}">
<link rel="alternate" hreflang="en" href="${SITE_URL}/en/seoul/${slug}/">
<link rel="alternate" hreflang="x-default" href="${url}">
<meta name="theme-color" content="#9cb98f">
<meta property="og:type" content="article">
<meta property="og:site_name" content="전국 지리 마스터 퀴즈">
<meta property="og:title" content="${esc(guName)} 행정구역 지도·동 목록">
<meta property="og:description" content="${esc(metaDesc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:locale" content="ko_KR">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${OG_IMAGE}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Jua&display=swap" rel="stylesheet">
<style>
:root{--bg:#e8e2d5;--card:#f0ebe0;--line:#d8cfbd;--text:#5f5749;--muted:#a59c89;--sage:#9cb98f;--sage-d:#8aa97e;--peach:#e3a183}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:"Jua",-apple-system,"Malgun Gothic",sans-serif;background:var(--bg);color:var(--text);line-height:1.9}
.wrap{max-width:820px;margin:0 auto;padding:28px 20px 60px}
nav.bc{font-size:13px;color:var(--muted);margin-bottom:18px}
nav.bc a{color:var(--muted);text-decoration:none}
h1{font-size:29px;font-weight:400;margin-bottom:10px}
.lead{font-size:15px;color:var(--muted);margin-bottom:22px}
section{background:var(--card);border-radius:22px;padding:24px 26px;margin-top:20px;box-shadow:0 8px 20px rgba(150,135,108,.18)}
section h2{font-size:20px;font-weight:400;margin-bottom:12px;color:var(--sage-d)}
section p{font-size:15.5px;margin-bottom:12px}
ul.dong{list-style:none;display:flex;flex-wrap:wrap;gap:9px;margin-top:6px}
ul.dong li{background:var(--bg);border-radius:12px;padding:8px 14px;font-size:14.5px;box-shadow:inset 0 2px 5px rgba(150,135,108,.18)}
figure{margin:14px 0 0}figure img{width:100%;border-radius:14px;display:block}
figcaption{font-size:12px;color:var(--muted);margin-top:6px;text-align:center}
.cta{display:inline-block;margin-top:8px;padding:15px 34px;background:var(--peach);color:#fff;font-size:17px;border-radius:16px;text-decoration:none;box-shadow:0 6px 14px rgba(150,135,108,.3)}
.cta-wrap{text-align:center;margin-top:26px}
a{color:var(--sage-d)}
footer{text-align:center;margin-top:36px;padding-top:22px;border-top:1px solid var(--line);font-size:13px;color:var(--muted)}
footer a{color:var(--muted);text-decoration:none}
@media(max-width:600px){h1{font-size:23px}section{padding:19px 17px}}
</style>
</head>
<body>
<div class="wrap">
<nav class="bc"><a href="${SITE_URL}/">홈</a> › <a href="${SITE_URL}/seoul/">서울특별시</a> › ${esc(guName)}</nav>

<h1>서울특별시 ${esc(guName)}</h1>
<p class="lead">${esc(en)} · 법정동 ${dongs.length}개 · 지도로 배우는 대한민국 행정구역</p>

<section>
  <h2>${esc(guName)}는 어떤 곳인가요?</h2>
  <p>${esc(desc || `${guName}는 서울특별시에 속한 자치구입니다.`)}</p>
</section>

${history ? `<section><h2>${esc(guName)}의 역사</h2><p>${esc(history)}</p></section>` : ""}
${people ? `<section><h2>인물과 이야기</h2><p>${esc(people)}</p>${imgHtml}</section>` : imgHtml ? `<section>${imgHtml}</section>` : ""}

<section>
  <h2>${esc(guName)}에 속한 법정동 (${dongs.length}개)</h2>
  <ul class="dong">${dongHtml}</ul>
</section>

<section>
  <h2>${esc(guName)}와 맞닿은 자치구</h2>
  <p>${adjHtml}</p>
</section>

<div class="cta-wrap">
  <a class="cta" href="${SITE_URL}/?region=seoul">🎮 서울 지리 퀴즈 풀어보기</a>
</div>

<footer>
  <a href="${SITE_URL}/">전국 지리 마스터 퀴즈</a> ·
  <a href="${SITE_URL}/seoul/">서울 자치구 전체 보기</a> ·
  <a href="${SITE_URL}/privacy.html">개인정보처리방침</a> ·
  <a href="mailto:koquiz.support@gmail.com">문의하기</a>
  <div style="margin-top:4px">Copyright 2026. koquiz.support@gmail.com</div>
</footer>
</div>
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</body>
</html>`;
}

function renderIndex(list) {
  const url = `${SITE_URL}/seoul/`;
  const items = list.map((g) =>
    `<li><a href="${SITE_URL}/seoul/${g.slug}/">${esc(g.guName)}</a> <span>${g.dongCount}개 동</span></li>`).join("");
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${HEAD_COMMON}
<title>서울특별시 25개 자치구 목록·지도 | 전국 지리 마스터 퀴즈</title>
${IS_TEST ? '<meta name="robots" content="noindex, nofollow">' : ""}
<meta name="description" content="서울특별시 25개 자치구의 위치와 법정동 목록, 역사와 유래를 한눈에. 지도로 배우는 대한민국 행정구역 학습 자료입니다.">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="ko" href="${url}">
<link rel="alternate" hreflang="en" href="${SITE_URL}/en/seoul/">
<link rel="alternate" hreflang="x-default" href="${url}">
<meta property="og:title" content="서울특별시 25개 자치구 목록·지도">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${OG_IMAGE}">
<link href="https://fonts.googleapis.com/css2?family=Jua&display=swap" rel="stylesheet">
<style>
:root{--bg:#e8e2d5;--card:#f0ebe0;--text:#5f5749;--muted:#a59c89;--sage-d:#8aa97e;--peach:#e3a183}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:"Jua",sans-serif;background:var(--bg);color:var(--text);line-height:1.9}
.wrap{max-width:820px;margin:0 auto;padding:28px 20px 60px}
h1{font-size:28px;font-weight:400;margin-bottom:10px}
p.lead{color:var(--muted);font-size:15px;margin-bottom:22px}
ul{list-style:none;display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:11px}
li{background:var(--card);border-radius:16px;padding:14px 17px;box-shadow:0 6px 14px rgba(150,135,108,.16)}
li a{color:var(--text);text-decoration:none;font-size:16px}
li span{display:block;font-size:12px;color:var(--muted)}
.cta{display:inline-block;margin-top:26px;padding:15px 34px;background:var(--peach);color:#fff;border-radius:16px;text-decoration:none}
</style>
</head>
<body><div class="wrap">
<h1>서울특별시 25개 자치구</h1>
<p class="lead">각 자치구의 위치, 법정동 목록, 역사와 유래를 확인해보세요.</p>
<ul>${items}</ul>
<div style="text-align:center"><a class="cta" href="${SITE_URL}/">🎮 지리 퀴즈 풀러 가기</a></div>
</div></body></html>`;
}

/* ─── 영문 페이지 ─── */
function renderPageEn({ guName, slug, en, desc, history, people, images, dongs, adjNames }) {
  const url = `${SITE_URL}/en/seoul/${slug}/`;
  const koUrl = `${SITE_URL}/seoul/${slug}/`;
  const title = `${en}, Seoul — Map & Neighborhood List | Korea Geography Master Quiz`;
  const metaDesc = `${en} is a district of Seoul, South Korea. Explore its location, ${dongs.length} legal neighborhoods (dong), adjacent districts, history and origin of its name.`;

  const dongHtml = dongs.map((d) => `<li>${esc(romanizeDong(d))}</li>`).join("");
  const adjHtml = adjNames.length
    ? adjNames.map((n) => {
        const s = SEOUL_SLUGS[n];
        return s ? `<a href="${SITE_URL}/en/seoul/${s.slug}/">${esc(s.en)}</a>` : esc(n);
      }).join(", ")
    : "No adjacent district data available.";

  const imgHtml = (images || []).map((im) => {
    const cap = im.captionEn || "";
    return `<figure><img src="${esc(fixImg(im.src))}" alt="${esc(cap || `${en}, Seoul`)}" loading="lazy">
     ${cap ? `<figcaption>${esc(cap)}</figcaption>`
           : (im.caption ? `<figcaption lang="ko">${esc(im.caption)}</figcaption>` : "")}</figure>`;
  }).join("");

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Korea Geography Master Quiz", item: `${SITE_URL}/en/` },
        { "@type": "ListItem", position: 2, name: "Seoul", item: `${SITE_URL}/en/seoul/` },
        { "@type": "ListItem", position: 3, name: en, item: url }
      ]},
      { "@type": "Place", name: `${en}, Seoul`, alternateName: `서울특별시 ${guName}`,
        description: desc || metaDesc, url,
        containedInPlace: { "@type": "AdministrativeArea", name: "Seoul" } }
    ]
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${HEAD_COMMON}
<title>${esc(title)}</title>
${IS_TEST ? '<meta name="robots" content="noindex, nofollow">' : ""}
<meta name="description" content="${esc(metaDesc)}">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="ko" href="${koUrl}">
<link rel="alternate" hreflang="en" href="${url}">
<link rel="alternate" hreflang="x-default" href="${koUrl}">
<meta name="theme-color" content="#9cb98f">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Korea Geography Master Quiz">
<meta property="og:title" content="${esc(en)} — Map &amp; Neighborhood List">
<meta property="og:description" content="${esc(metaDesc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${OG_IMAGE_EN}">
<meta property="og:locale" content="en_US">
<meta property="og:locale:alternate" content="ko_KR">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${OG_IMAGE_EN}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;600&family=Jua&display=swap" rel="stylesheet">
<style>
:root{--bg:#e8e2d5;--card:#f0ebe0;--line:#d8cfbd;--text:#5f5749;--muted:#a59c89;--sage:#9cb98f;--sage-d:#8aa97e;--peach:#e3a183}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:"Fredoka","Jua",-apple-system,sans-serif;background:var(--bg);color:var(--text);line-height:1.9}
.wrap{max-width:820px;margin:0 auto;padding:28px 20px 60px}
nav.bc{font-size:13px;color:var(--muted);margin-bottom:18px}
nav.bc a{color:var(--muted);text-decoration:none}
h1{font-size:29px;font-weight:400;margin-bottom:10px}
.lead{font-size:15px;color:var(--muted);margin-bottom:22px}
section{background:var(--card);border-radius:22px;padding:24px 26px;margin-top:20px;box-shadow:0 8px 20px rgba(150,135,108,.18)}
section h2{font-size:20px;font-weight:400;margin-bottom:12px;color:var(--sage-d)}
section p{font-size:15.5px;margin-bottom:12px}
ul.dong{list-style:none;display:flex;flex-wrap:wrap;gap:9px;margin-top:6px}
ul.dong li{background:var(--bg);border-radius:12px;padding:8px 14px;font-size:14.5px;box-shadow:inset 0 2px 5px rgba(150,135,108,.18)}
figure{margin:14px 0 0}figure img{width:100%;border-radius:14px;display:block}
figcaption{font-size:12px;color:var(--muted);margin-top:6px;text-align:center}
.cta{display:inline-block;margin-top:8px;padding:15px 34px;background:var(--peach);color:#fff;font-size:17px;border-radius:16px;text-decoration:none;box-shadow:0 6px 14px rgba(150,135,108,.3)}
.cta-wrap{text-align:center;margin-top:26px}
a{color:var(--sage-d)}
footer{text-align:center;margin-top:36px;padding-top:22px;border-top:1px solid var(--line);font-size:13px;color:var(--muted)}
footer a{color:var(--muted);text-decoration:none}
@media(max-width:600px){h1{font-size:23px}section{padding:19px 17px}}
</style>
</head>
<body>
<div class="wrap">
<nav class="bc"><a href="${SITE_URL}/en/">Home</a> › <a href="${SITE_URL}/en/seoul/">Seoul</a> › ${esc(en)} · <a href="${koUrl}" lang="ko" hreflang="ko">한국어</a></nav>

<h1>${esc(en)}, Seoul</h1>
<p class="lead"><span lang="ko">${esc(guName)}</span> · ${dongs.length} neighborhoods · Learn Korean administrative divisions with maps</p>

<section>
  <h2>About ${esc(en)}</h2>
  <p>${esc(desc || `${en} is one of the 25 autonomous districts of Seoul, South Korea.`)}</p>
</section>

${history ? `<section><h2>History of ${esc(en)}</h2><p>${esc(history)}</p></section>` : ""}
${people ? `<section><h2>People &amp; Stories</h2><p>${esc(people)}</p>${imgHtml}</section>` : imgHtml ? `<section>${imgHtml}</section>` : ""}

<section>
  <h2>Neighborhoods in ${esc(en)} (${dongs.length})</h2>
  <ul class="dong">${dongHtml}</ul>
</section>

<section>
  <h2>Districts bordering ${esc(en)}</h2>
  <p>${adjHtml}</p>
</section>

<div class="cta-wrap">
  <a class="cta" href="${SITE_URL}/en/?region=seoul">🎮 Play the Seoul geography quiz</a>
</div>

<footer>
  <a href="${SITE_URL}/en/">Korea Geography Master Quiz</a> ·
  <a href="${SITE_URL}/en/seoul/">All Seoul districts</a> ·
  <a href="${SITE_URL}/privacy-en.html">Privacy Policy</a> ·
  <a href="mailto:koquiz.support@gmail.com">Contact</a> ·
  <a href="${koUrl}" lang="ko">한국어로 보기</a>
  <div style="margin-top:4px">Copyright 2026. koquiz.support@gmail.com</div>
</footer>
</div>
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</body>
</html>`;
}

function renderIndexEn(list) {
  const url = `${SITE_URL}/en/seoul/`;
  const koUrl = `${SITE_URL}/seoul/`;
  const items = list.map((g) =>
    `<li><a href="${SITE_URL}/en/seoul/${g.slug}/">${esc(g.en)}</a> <span>${g.dongCount} neighborhoods</span></li>`).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${HEAD_COMMON}
<title>The 25 Districts of Seoul — List &amp; Map | Korea Geography Master Quiz</title>
${IS_TEST ? '<meta name="robots" content="noindex, nofollow">' : ""}
<meta name="description" content="A complete list of the 25 autonomous districts (gu) of Seoul, South Korea, with their neighborhoods, location and history.">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="ko" href="${koUrl}">
<link rel="alternate" hreflang="en" href="${url}">
<link rel="alternate" hreflang="x-default" href="${koUrl}">
<meta property="og:title" content="The 25 Districts of Seoul — List &amp; Map">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${OG_IMAGE_EN}">
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;600&family=Jua&display=swap" rel="stylesheet">
<style>
:root{--bg:#e8e2d5;--card:#f0ebe0;--text:#5f5749;--muted:#a59c89;--sage-d:#8aa97e;--peach:#e3a183}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:"Fredoka","Jua",sans-serif;background:var(--bg);color:var(--text);line-height:1.9}
.wrap{max-width:820px;margin:0 auto;padding:28px 20px 60px}
h1{font-size:28px;font-weight:400;margin-bottom:10px}
p.lead{color:var(--muted);font-size:15px;margin-bottom:22px}
ul{list-style:none;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:11px}
li{background:var(--card);border-radius:16px;padding:14px 17px;box-shadow:0 6px 14px rgba(150,135,108,.16)}
li a{color:var(--text);text-decoration:none;font-size:16px}
li span{display:block;font-size:12px;color:var(--muted)}
.cta{display:inline-block;margin-top:26px;padding:15px 34px;background:var(--peach);color:#fff;border-radius:16px;text-decoration:none}
</style>
</head>
<body><div class="wrap">
<h1>The 25 Districts of Seoul</h1>
<p class="lead">Explore each district's location, neighborhoods, history and the origin of its name. · <a href="${koUrl}" lang="ko" hreflang="ko">한국어</a></p>
<ul>${items}</ul>
<div style="text-align:center"><a class="cta" href="${SITE_URL}/en/?region=seoul">🎮 Play the geography quiz</a></div>
</div></body></html>`;
}

/* ─── 실행 ─── */
const features = await loadFeatures();
console.log("features.js 로드 완료:", Object.keys(features).length, "개 구");

let featuresEn = {};
try {
  featuresEn = await loadFeaturesEn();
  console.log("features_en.js 로드 완료:", Object.keys(featuresEn).length, "개 구");
} catch (e) {
  console.warn("⚠ features_en.js 로드 실패(영문 본문 생략):", e.message);
}

let romanizeDong = (s) => s;
try {
  ({ romanizeDong } = await loadRoma());
  console.log("roma.js 로드 완료:", romanizeDong("역삼동"));
} catch (e) {
  console.warn("⚠ roma.js 로드 실패(동 이름 한글 유지):", e.message);
}

const [guGeo, bjdGeo] = await Promise.all([
  fetch(`${CDN}/gu/gu_11_seoul.geojson`).then((r) => r.json()),
  fetch(`${CDN}/bjd/bjd_11_seoul.geojson`).then((r) => r.json())
]);
console.log("GeoJSON 로드 완료");

const nameByCode = {};
guGeo.features.forEach((f) => {
  const p = f.properties || {};
  if (p.sgg) nameByCode[p.sgg] = p.sgg_nm;
});

const dongsByCode = {};
bjdGeo.features.forEach((f) => {
  const p = f.properties || {};
  const code = String(p.EMD_CD || "").slice(0, 5) || p.COL_ADM_SE;
  const nm = p.EMD_NM;
  if (!code || !nm) return;
  (dongsByCode[code] ??= new Set()).add(nm);
});

const adj = computeGuAdjacency(guGeo);
const summary = [];

for (const [code, guName] of Object.entries(nameByCode)) {
  const meta = SEOUL_SLUGS[guName];
  if (!meta) { console.warn("⚠ 슬러그 없음:", guName); continue; }

  const f = features[guName] || {};
  const fe = featuresEn[guName] || featuresEn[meta.en] || {};
  const dongs = [...(dongsByCode[code] || [])].sort(koCmp);
  const adjNames = [...(adj[code] || [])].map((c) => nameByCode[c]).filter(Boolean).sort(koCmp);

  const html = renderPage({
    guName, slug: meta.slug, en: meta.en,
    desc: f.desc, history: f.history, people: f.people, images: f.images,
    dongs, adjNames
  });
  const dir = path.join("seoul", meta.slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "index.html"), html, "utf8");

  const imagesEn = (fe.images && fe.images.length)
    ? fe.images.map((im) => ({ src: im.src, captionEn: im.caption }))
    : (f.images || []);

  const htmlEn = renderPageEn({
    guName, slug: meta.slug, en: meta.en,
    desc: fe.desc, history: fe.history, people: fe.people,
    images: imagesEn,
    dongs, adjNames
  });
  const dirEn = path.join("en", "seoul", meta.slug);
  await mkdir(dirEn, { recursive: true });
  await writeFile(path.join(dirEn, "index.html"), htmlEn, "utf8");

  summary.push({ guName, slug: meta.slug, en: meta.en, dongCount: dongs.length });
  console.log(`✓ /seoul/${meta.slug}/ + /en/seoul/${meta.slug}/  (동 ${dongs.length}개, 인접 ${adjNames.length}개)`);
}

summary.sort((a, b) => koCmp(a.guName, b.guName));
await writeFile(path.join("seoul", "index.html"), renderIndex(summary), "utf8");

const summaryEn = [...summary].sort((a, b) => a.en.localeCompare(b.en, "en"));
await mkdir(path.join("en", "seoul"), { recursive: true });
await writeFile(path.join("en", "seoul", "index.html"), renderIndexEn(summaryEn), "utf8");

console.log(`\n완료: 한글 ${summary.length}개 + 영문 ${summaryEn.length}개 페이지, 목차 각 1개`);
