/* scripts/gen-en.mjs
   index.html(한글 원본) → en/index.html(영문판) 자동 생성
   원칙: 원본은 손대지 않고 마커 블록 2개 + 상대경로만 치환한다. */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const SRC     = "index.html";
const OUT_DIR = "en";
const OUT     = path.join(OUT_DIR, "index.html");

/* en/ 아래에도 같은 구조가 생성되므로 상대경로 그대로 두는 화이트리스트 */
const KEEP_RELATIVE = ["seoul/"];

const raw = await readFile(SRC, "utf8");

/* ─────────────── 0. 마커 추출 ─────────────── */
const HEAD_RE  = /(<!-- GEN:HEAD:START -->)([\s\S]*?)(<!-- GEN:HEAD:END -->)/;
const GUIDE_RE = /(<!-- GEN:GUIDE:START -->)([\s\S]*?)(<!-- GEN:GUIDE:END -->)/;

const headM  = raw.match(HEAD_RE);
const guideM = raw.match(GUIDE_RE);
if (!headM)  throw new Error("GEN:HEAD 마커를 찾지 못했습니다.");
if (!guideM) throw new Error("GEN:GUIDE 마커를 찾지 못했습니다.");

const koHead = headM[2];

/* 한글 HEAD의 canonical을 단일 출처로 삼는다 (BASE_PATH 하드코딩 금지) */
const canonM = koHead.match(/<link rel="canonical" href="([^"]+)">/);
if (!canonM) throw new Error("한글 canonical을 찾지 못했습니다.");

const KO_URL  = canonM[1].replace(/\/*$/, "/");
const EN_URL  = KO_URL + "en/";
const NOINDEX = /<meta name="robots"[^>]*noindex/i.test(koHead);

const OG_IMAGE = KO_URL + "social-image/og-image-en.jpg";

/* ─────────────── 1. 영문 HEAD ─────────────── */
const EN_TITLE = "Korea Geography Master Quiz";
const EN_DESC  = "A free map-based quiz for learning South Korea's provinces, cities, " +
  "districts and neighborhoods. Tap the map, test yourself, and climb the live leaderboard.";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      name: EN_TITLE,
      url: EN_URL,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Any",
      inLanguage: "en",
      description: "A free learning quiz for South Korea's administrative divisions, played on an interactive map.",
      browserRequirements: "A modern browser with JavaScript enabled",
      offers: { "@type": "Offer", price: "0", priceCurrency: "KRW" }
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Do I need to sign up?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "You sign in with a Google or Kakao account, then choose a nickname. Your scores are posted to the live leaderboard automatically. There is no lengthy registration form."
          }
        },
        {
          "@type": "Question",
          name: "Which regions can I study?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Seoul, Incheon and Gyeonggi-do are covered down to the district (si/gun/gu) and neighborhood (eup/myeon/dong) level, and more regions are being added."
          }
        },
        {
          "@type": "Question",
          name: "Does it work on mobile?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. It runs in any smartphone browser, and you can add it to your home screen to use it like an app."
          }
        }
      ]
    }
  ]
};

const EN_HEAD = `
<title>${EN_TITLE} – Learn Korean Administrative Divisions on the Map</title>
${NOINDEX ? '\n<meta name="robots" content="noindex, nofollow">\n' : ""}
<meta name="description" content="${EN_DESC}">
<link rel="canonical" href="${EN_URL}">
<link rel="alternate" hreflang="ko" href="${KO_URL}">
<link rel="alternate" hreflang="en" href="${EN_URL}">
<link rel="alternate" hreflang="x-default" href="${KO_URL}">

<meta property="og:type" content="website">
<meta property="og:site_name" content="${EN_TITLE}">
<meta property="og:title" content="${EN_TITLE} – Learn Korean Administrative Divisions on the Map">
<meta property="og:description" content="${EN_DESC}">
<meta property="og:url" content="${EN_URL}">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${EN_TITLE} – illustrated map of South Korea's administrative divisions">
<meta property="og:locale" content="en_US">
<meta property="og:locale:alternate" content="ko_KR">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${EN_TITLE}">
<meta name="twitter:description" content="${EN_DESC}">
<meta name="twitter:image" content="${OG_IMAGE}">
<meta name="twitter:image:alt" content="${EN_TITLE} – illustrated map of South Korea's administrative divisions">

<script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2)}
</script>
`;

/* ─────────────── 2. 영문 GUIDE ─────────────── */
const EN_GUIDE = `
   <section id="content-guide" style="max-width:820px; margin:40px auto 0; padding:24px 18px 40px; line-height:1.9; color:#333; font-size:15px; border-top:1px solid #ddd;">

     <h2 style="font-size:22px; margin-bottom:8px;">What is Korea Geography Master Quiz?</h2>
     <p>Korea Geography Master Quiz is a learning game that helps you get familiar with South Korea's administrative divisions using a real interactive map. You either find a place on the map or name the highlighted area, so anyone from elementary students to adults can pick up the hierarchy of provinces, cities, districts and neighborhoods naturally. Because you work with an actual map instead of memorizing lists, it builds a real sense of where things are.</p>

     <h2 style="font-size:22px; margin:28px 0 8px;">How Korean administrative divisions are structured</h2>
     <p>South Korea's divisions split into upper-level (gwangyeok) and basic (gicho) local governments. The upper level includes one special city (Seoul), six metropolitan cities (Busan, Daegu, Incheon, Gwangju, Daejeon, Ulsan), one special self-governing city (Sejong), and several provinces (do) and special self-governing provinces. Below them sit cities (si), counties (gun) and districts (gu), and below those the towns (eup), townships (myeon) and neighborhoods (dong). Once this hierarchy clicks, placing any region becomes much easier.</p>

     <h2 style="font-size:22px; margin:28px 0 8px;">A look at each region</h2>
     <p><strong>Seoul</strong>, the capital, is made up of 25 autonomous districts. The Han River splits the city into Gangbuk and Gangnam, ranging from the historic core of Jongno-gu and Jung-gu to newer centers like Gangnam-gu and Songpa-gu. You can check each district's location, list of legal-status neighborhoods, and history on the <a href="seoul/">Seoul district pages</a>.</p>
     <p><strong>Incheon</strong> is a port city on the Yellow Sea that grew around Incheon International Airport and its harbor. It also includes island-only areas such as Ganghwa-gun and Ongjin-gun, which make excellent examples when learning how divisions work.</p>
     <p><strong>Gyeonggi-do</strong> surrounds Seoul and is the most populous province in the country, home to special-case cities of over a million residents such as Suwon, Seongnam, Goyang and Yongin. With cities, farmland, mountains and coastline all present, its makeup is remarkably varied.</p>

     <h2 style="font-size:22px; margin:28px 0 8px;">What will you learn?</h2>
     <p>Playing repeatedly teaches you each area's exact location, which region it belongs to, and its name. In Learning Mode you can tap the map to instantly confirm where a district or neighborhood sits, which helps not only for exams but also for travel and everyday life in Korea.</p>

     <h2 style="font-size:22px; margin:28px 0 8px;">Frequently asked questions</h2>
     <p><strong>Q. Do I need to sign up?</strong><br>
     You sign in with a Google or Kakao account, then choose a nickname. Your scores are posted to the live leaderboard automatically. There is no lengthy registration form.</p>
     <p><strong>Q. Which regions can I study?</strong><br>
     Seoul, Incheon and Gyeonggi-do are covered down to the district and neighborhood level, and more regions are being added.</p>
     <p><strong>Q. Does it work on mobile?</strong><br>
     Yes. It runs in any smartphone browser, and you can add it to your home screen to use it like an app.</p>

   </section>
`;

/* ─────────────── 3. 5단계 치환 ─────────────── */
let out = raw;

// (1) lang 속성 — CSS의 html[lang="en"] 셀렉터를 건드리지 않도록 <html ...> 태그만
out = out.replace(/<html\s+lang="ko"\s*>/i, '<html lang="en">');
if (!/<html\s+lang="en"\s*>/i.test(out)) throw new Error("html lang 치환 실패");

// (2) HEAD 블록
out = out.replace(HEAD_RE, (_m, a, _b, c) => a + EN_HEAD + c);

// (3) GUIDE 블록
out = out.replace(GUIDE_RE, (_m, a, _b, c) => a + EN_GUIDE + "   " + c);

// (4) 로컬 스크립트 3종 → ../
out = out.replace(
  /(<script\s+src=")(?!https?:|\/\/|\.\.\/)([^"]+\.js(?:\?[^"]*)?)(")/g,
  (_m, a, src, c) => a + "../" + src + c
);

// (5) 푸터 privacy 링크 → ../
out = out.replace(/href="privacy\.html"/g, 'href="../privacy.html"');

/* ─────────────── 4. 최종 가드 ─────────────── */
const problems = [];

if (!/<html\s+lang="en"/i.test(out))       problems.push('lang="en" 누락');
if (!/"inLanguage":\s*"en"/.test(out))     problems.push('"inLanguage": "en" 누락');
if (out.includes("GEN:HEAD:START") === false)  problems.push("GEN:HEAD 마커 소실");
if (out.includes("GEN:GUIDE:START") === false) problems.push("GEN:GUIDE 마커 소실");

const ATTR_RE = /\b(?:src|href)="([^"]*)"/g;
for (const m of out.matchAll(ATTR_RE)) {
  const v = m[1];
  if (!v) continue;
  if (v.includes("${")) continue;                       // JS 템플릿 리터럴은 제외
  if (/^(https?:)?\/\//i.test(v)) continue;             // 절대 URL
  if (/^(data:|mailto:|tel:|#|\/|\.\.\/)/i.test(v)) continue;
  if (KEEP_RELATIVE.includes(v)) continue;              // 화이트리스트
  problems.push(`남은 상대경로: ${v}`);
}

if (problems.length) {
  console.error("✗ gen-en.mjs 검증 실패");
  problems.forEach((p) => console.error("   - " + p));
  process.exit(1);
}

/* ─────────────── 5. 출력 ─────────────── */
await mkdir(OUT_DIR, { recursive: true });
await writeFile(OUT, out, "utf8");
console.log(`✓ ${OUT} 생성 완료  (canonical: ${EN_URL}, noindex: ${NOINDEX})`);
