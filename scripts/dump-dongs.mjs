import { readFile } from "node:fs/promises";
const CDN = "https://cdn.jsdelivr.net/gh/ttlmymo/korea-geography-quiz@main";

const src = await readFile("roma.js", "utf8");
const { romanizeDong } = new Function(src + "\nreturn { romanizeDong };")();

const geo = await fetch(`${CDN}/bjd/bjd_11_seoul.geojson`).then((r) => r.json());
const set = new Set();
geo.features.forEach((f) => { const nm = f.properties?.EMD_NM; if (nm) set.add(nm); });

const list = [...set].sort((a, b) => a.localeCompare(b, "ko"));
console.error(`총 ${list.length}개`);
list.forEach((n) => console.log(`${n}\t${romanizeDong(n)}`));
