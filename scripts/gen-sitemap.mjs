import { readdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";

const ORIGIN = "https://ttlmymo.github.io";
const BASE_PATH = "/korea-geography-quiz-test"; // 실서비스: /korea-geography-quiz
const SITE_URL = ORIGIN + BASE_PATH;
const today = new Date().toISOString().slice(0, 10);

const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };

/* loc 하나 + 해당 페이지의 ko/en 짝(alt) */
const urls = [
  { loc: `${SITE_URL}/`,           pri: "1.0", freq: "weekly",
    alt: { ko: `${SITE_URL}/`, en: `${SITE_URL}/en/` } },
  { loc: `${SITE_URL}/en/`,        pri: "0.9", freq: "monthly",
    alt: { ko: `${SITE_URL}/`, en: `${SITE_URL}/en/` } },
  { loc: `${SITE_URL}/seoul/`,     pri: "0.9", freq: "monthly",
    alt: { ko: `${SITE_URL}/seoul/`, en: `${SITE_URL}/en/seoul/` } },
  { loc: `${SITE_URL}/en/seoul/`,  pri: "0.8", freq: "monthly",
    alt: { ko: `${SITE_URL}/seoul/`, en: `${SITE_URL}/en/seoul/` } }
  { loc: `${SITE_URL}/privacy.html`,    pri: "0.3", freq: "yearly", alt: null },
  { loc: `${SITE_URL}/privacy-en.html`, pri: "0.3", freq: "yearly", alt: null }
];

const dirs = await readdir("seoul", { withFileTypes: true });
for (const d of dirs) {
  if (!d.isDirectory()) continue;
  const koPath = path.join("seoul", d.name, "index.html");
  const enPath = path.join("en", "seoul", d.name, "index.html");
  const hasKo = await exists(koPath);
  const hasEn = await exists(enPath);
  if (!hasKo && !hasEn) continue;

  const koLoc = `${SITE_URL}/seoul/${d.name}/`;
  const enLoc = `${SITE_URL}/en/seoul/${d.name}/`;
  const alt = { ko: hasKo ? koLoc : null, en: hasEn ? enLoc : null };

  if (hasKo) urls.push({ loc: koLoc, pri: "0.7", freq: "monthly", alt });
  if (hasEn) urls.push({ loc: enLoc, pri: "0.6", freq: "monthly", alt });
}

const altXml = (alt) => {
  if (!alt) return "";
  const lines = [];
  if (alt.ko) lines.push(`    <xhtml:link rel="alternate" hreflang="ko" href="${alt.ko}"/>`);
  if (alt.en) lines.push(`    <xhtml:link rel="alternate" hreflang="en" href="${alt.en}"/>`);
  if (alt.ko) lines.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${alt.ko}"/>`);
  return lines.length ? "\n" + lines.join("\n") : "";
};

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.map((u) => `  <url>
    <loc>${u.loc}</loc>${altXml(u.alt)}
    <lastmod>${today}</lastmod>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.pri}</priority>
  </url>`).join("\n")}
</urlset>`;

await writeFile("sitemap.xml", xml, "utf8");
console.log(`sitemap.xml 생성 완료 (${urls.length}개 URL)`);
