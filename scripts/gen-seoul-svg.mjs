/* 루트 index.html의 서울 자치구 SVG 지도를 재현 가능하게 생성·주입한다. */

import { readFile, writeFile } from "node:fs/promises";
import { buildSeoulSvg, SEOUL_SVG_CSS } from "./seoul-svg.mjs";
import { SEOUL_SLUGS } from "./seoul-slugs.mjs";

const ROOT = "index.html";
const START = "<!-- GEN:SEOULMAP:START -->";
const END = "<!-- GEN:SEOULMAP:END -->";
const BASE_PATH = "/korea-geography-quiz";

const root = await readFile(ROOT, "utf8");
const guGeo = JSON.parse(await readFile("gu/gu_11_seoul.geojson", "utf8"));
const byName = new Map(
  guGeo.features
    .filter((f) => f?.properties?.sgg_nm && f?.geometry)
    .map((f) => [f.properties.sgg_nm, f])
);

const missing = Object.keys(SEOUL_SLUGS).filter((name) => !byName.has(name));
if (missing.length) throw new Error(`서울 GeoJSON 누락: ${missing.join(", ")}`);

const items = Object.entries(SEOUL_SLUGS)
  .map(([name, meta]) => ({
    name,
    en: meta.en,
    href: `${BASE_PATH}/seoul/${meta.slug}/`,
    feature: byName.get(name)
  }))
  .sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true }));

if (items.length !== 25) throw new Error(`서울 SVG 항목 수 오류: ${items.length}`);
const mapHtml = `<div class="seoul-map-wrap">${buildSeoulSvg(items, { lang: "ko" })}</div>`;

let out = root;
const markerRe = /(<!-- GEN:SEOULMAP:START -->)([\s\S]*?)(<!-- GEN:SEOULMAP:END -->)/;
if (markerRe.test(out)) {
  out = out.replace(markerRe, (_m, a, _b, c) => `${a}\n${mapHtml}\n${c}`);
} else {
  const section = `
   <section id="seoul-district-map" style="max-width:820px; margin:24px auto 0; padding:24px 18px 0; line-height:1.9; color:var(--text); font-size:15px;">
     <h2 style="font-size:22px; margin-bottom:8px;">서울 자치구별 소개</h2>
     <p>서울특별시 25개 자치구의 위치를 지도에서 선택해 각 구의 법정동 목록, 역사와 유래를 확인할 수 있습니다.</p>
     ${START}
${mapHtml}
     ${END}
   </section>`;
  const anchor = "<!-- GEN:GUIDE:END -->";
  if (!out.includes(anchor)) throw new Error("루트 GEN:GUIDE:END 마커를 찾지 못했습니다.");
  out = out.replace(anchor, `${anchor}\n${section}`);
}

if (!out.includes(".seoul-map-wrap{")) {
  const styleAt = out.lastIndexOf("</style>");
  if (styleAt < 0) throw new Error("루트 style 닫는 태그를 찾지 못했습니다.");
  out = out.slice(0, styleAt) + "\n" + SEOUL_SVG_CSS + "\n" + out.slice(styleAt);
}

if ((out.match(/GEN:SEOULMAP:START/g) || []).length !== 1 ||
    (out.match(/GEN:SEOULMAP:END/g) || []).length !== 1) {
  throw new Error("GEN:SEOULMAP 마커 쌍 오류");
}
if ((out.match(/class="gu-shape/g) || []).length !== 25) {
  throw new Error("루트 SVG 구 링크 수 오류");
}
if (!out.includes("<!-- GEN:HEAD:START -->") || !out.includes("<!-- GEN:HEAD:END -->")) {
  throw new Error("GEN:HEAD 마커 보존 실패");
}

await writeFile(ROOT, out, "utf8");
console.log(`✓ 루트 서울 SVG 생성: ${items.length}개 구 · ${ROOT}`);
console.log(`✓ 마커: ${START} / ${END}`);
console.log(`✓ CSS: 기존 style 블록 끝에 SEOUL_SVG_CSS 삽입`);
