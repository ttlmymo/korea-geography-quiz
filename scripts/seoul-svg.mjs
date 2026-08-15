/* 서울 25개 자치구 클릭 가능 SVG 지도 생성기 */

// x(경도)가 도 단위이므로 Web Mercator y도 도 단위로 환산해 가로·세로 비율을 맞춘다.
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)) * 180 / Math.PI;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * @param {Array<{name:string, en:string, href:string, feature:object}>} items
 * @param {{width?:number, lang?:string, activeName?:string}} opts
 * @returns {string} <svg> 문자열
 */
export function buildSeoulSvg(items, opts = {}) {
  const W = opts.width || 760;
  const PAD = 16;
  const lang = opts.lang === "en" ? "en" : "ko";

  const shapes = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  for (const it of items) {
    const g = it.feature.geometry || it.feature;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    const rings = [];
    let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;

    for (const poly of polys) {
      for (const ring of poly) {
        const pts = ring.map(([lon, lat]) => [lon, mercY(lat)]);
        for (const [x, y] of pts) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
          if (y < by0) by0 = y; if (y > by1) by1 = y;
        }
        rings.push(pts);
      }
    }
    shapes.push({ it, rings, cx: (bx0 + bx1) / 2, cy: (by0 + by1) / 2 });
  }

  const s = (W - PAD * 2) / (maxX - minX);
  const H = Math.round((maxY - minY) * s) + PAD * 2;
  const TX = (x) => +(PAD + (x - minX) * s).toFixed(1);
  const TY = (y) => +(H - PAD - (y - minY) * s).toFixed(1);

  let out = `<svg class="seoul-svg" viewBox="0 0 ${W} ${H}" width="100%" `
          + `xmlns="http://www.w3.org/2000/svg" role="group" `
          + `aria-label="${lang === "en" ? "Map of 25 districts of Seoul" : "서울특별시 25개 자치구 지도"}">`;

  for (const sh of shapes) {
    const d = sh.rings
      .map((r) => "M" + r.map(([x, y]) => `${TX(x)},${TY(y)}`).join("L") + "Z")
      .join(" ");
    const label = lang === "en" ? sh.it.en : sh.it.name;
    const active = opts.activeName && opts.activeName === sh.it.name;
    out += `<a href="${esc(sh.it.href)}" class="gu-shape${active ? " is-active" : ""}" `
         + `aria-label="${esc(label)}">`
         + `<title>${esc(label)}</title>`
         + `<path d="${d}"/>`
         + `<text x="${TX(sh.cx)}" y="${TY(sh.cy)}">${esc(label)}</text>`
         + `</a>`;
  }
  return out + `</svg>`;
}

/** SVG 지도에 필요한 CSS (페이지 <style>에 그대로 삽입) */
export const SEOUL_SVG_CSS = `
.seoul-map-wrap{ background:#f5f1e7; border:1px solid #d8cfbd; border-radius:16px;
  padding:10px; margin:0 0 16px; }
.seoul-svg{ display:block; width:100%; height:auto; }
.seoul-svg .gu-shape path{ fill:#e0e7dc; stroke:#f5f1e7; stroke-width:1.2;
  transition:fill .15s ease; }
.seoul-svg .gu-shape text{ font-family:"Jua",-apple-system,"Malgun Gothic",sans-serif;
  font-size:11px; fill:#5f5749; text-anchor:middle; dominant-baseline:middle;
  pointer-events:none; }
.seoul-svg .gu-shape:hover path,
.seoul-svg .gu-shape:focus path{ fill:#9cb98f; }
.seoul-svg .gu-shape:hover text,
.seoul-svg .gu-shape:focus text{ fill:#33301f; }
.seoul-svg .gu-shape.is-active path{ fill:#8aa97e; }
.seoul-svg .gu-shape.is-active text{ fill:#fff; }
.seoul-svg a{ cursor:pointer; }
.seoul-svg a:focus{ outline:none; }
.seoul-svg a:focus-visible path{ stroke:#5f5749; stroke-width:2.4; }
@media(max-width:600px){ .seoul-svg .gu-shape text{ font-size:9px; } }
`;
