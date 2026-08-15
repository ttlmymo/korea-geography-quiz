import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { SEOUL_SLUGS } from "./seoul-slugs.mjs";

const RAW_DIR = path.join("data", "encykorea-raw");
const INDEX_PATH = path.join(RAW_DIR, "_index.json");
const OUTPUT_PATH = path.join("data", "dong-draft.json");
const BJD_PATH = path.join("bjd", "bjd_11_seoul.geojson");
const ENTRY = /(?:^|\n)(\d+)\.\s*([^\n(]+?)\s*\(([^)\n]*)\)\s*\n([\s\S]*?)(?=\n\d+\.\s*[^\n(]+?\s*\([^)\n]*\)\s*\n|$)/g;

function splitDongSection(body) {
  const match = body.match(/(?:^|\n)#\s*동\(洞\)\s*\n([\s\S]*?)(?=\n#\s|$)/);
  return match ? match[1] : "";
}

function parseEntries(dongSection) {
  const matches = [...dongSection.matchAll(ENTRY)];
  return matches.map((match) => ({
    docIndex: Number(match[1]),
    name: match[2].trim(),
    hanja: match[3].trim(),
    raw: match[0],
    body: match[4],
    start: match.index,
    end: match.index + match[0].length
  }));
}

function residualLength(dongSection, entries) {
  let cursor = 0;
  let residual = "";
  for (const entry of entries) {
    residual += dongSection.slice(cursor, entry.start);
    cursor = entry.end;
  }
  residual += dongSection.slice(cursor);
  return residual.trim().length;
}

function firstMentionContext(body, name) {
  const index = body.indexOf(name);
  if (index < 0) return null;
  return body.slice(Math.max(0, index - 200), Math.min(body.length, index + name.length + 200));
}

function compositeDocName(dongName) {
  const stem = dongName.replace(/(?:\d+가|\d+동)$/, "");
  return stem === dongName ? null : `${stem}동`;
}

const [indexFile, bjdFile] = await Promise.all([
  readFile(INDEX_PATH, "utf8"),
  readFile(BJD_PATH, "utf8")
]);
const indexData = JSON.parse(indexFile);
const bjd = JSON.parse(bjdFile);
const bjdBySgg = new Map();
for (const feature of bjd.features || []) {
  const code = String(feature.properties?.EMD_CD || "");
  const sgg = code.slice(0, 5);
  const dongName = feature.properties?.EMD_NM;
  if (!sgg || !dongName) continue;
  if (!bjdBySgg.has(sgg)) bjdBySgg.set(sgg, []);
  bjdBySgg.get(sgg).push({ dongName, bjdCode: code });
}
for (const list of bjdBySgg.values()) {
  list.sort((a, b) => a.dongName.localeCompare(b.dongName, "ko"));
}

const indexBySlug = new Map((indexData.entries || []).map((entry) => [entry.slug, entry]));
const gu = [];
const warnings = [];
const coverage = [];

for (const [guName, { slug }] of Object.entries(SEOUL_SLUGS)) {
  const meta = indexBySlug.get(slug);
  if (!meta?.success) {
    const warning = { slug, guName, type: "collectionFailed", detail: meta?.error || "수집 인덱스 항목 없음" };
    warnings.push(warning);
    gu.push({ slug, guName, sgg: "", eid: meta?.eid || "", sectionMissing: true, dong: [], docOnly: [], missing: [], warnings: [warning] });
    continue;
  }

  const rawPath = path.join(RAW_DIR, `${slug}.json`);
  const article = JSON.parse(await readFile(rawPath, "utf8"));
  const body = String(article.body || "");
  const dongSection = splitDongSection(body);
  gu.push({ slug, guName, article, body, dongSection, sgg: "", temporary: true });
}

const guGeo = JSON.parse(await readFile(path.join("gu", "gu_11_seoul.geojson"), "utf8"));
const codeByGu = new Map((guGeo.features || []).map((feature) => [feature.properties?.sgg_nm, String(feature.properties?.sgg || "")]));

const finalGu = [];
for (const provisional of gu) {
  const { slug, guName } = provisional;
  const sgg = codeByGu.get(guName) || "";
  const article = provisional.article;
  const body = provisional.body || "";
  const dongSection = provisional.dongSection || "";
  const geoDongs = bjdBySgg.get(sgg) || [];
  const guWarnings = [];

  if (!article) {
    finalGu.push({ slug, guName, sgg, eid: provisional.eid || "", sectionMissing: true, dong: [], docOnly: [], missing: geoDongs.map((item) => item.dongName), warnings: provisional.warnings || [] });
    continue;
  }

  if (!dongSection) {
    const warning = { slug, guName, type: "sectionMissing", detail: "# 동(洞) 절이 없습니다." };
    warnings.push(warning); guWarnings.push(warning);
  }
  const entries = parseEntries(dongSection);
  if (dongSection && entries.length === 0) {
    const warning = { slug, guName, type: "entryZero", detail: "동 절은 있으나 ENTRY 정규식 일치 항목이 없습니다." };
    warnings.push(warning); guWarnings.push(warning);
  }
  const residual = residualLength(dongSection, entries);
  if (residual >= 500) {
    const warning = { slug, guName, type: "residualLong", detail: `ENTRY 미매칭 잔여 텍스트 ${residual}자` };
    warnings.push(warning); guWarnings.push(warning);
  }

  const exactByName = new Map(entries.map((entry) => [entry.name, entry]));
  const dong = [];
  const missing = [];
  let exact = 0, composite = 0, mention = 0;

  for (const geo of geoDongs) {
    const exactEntry = exactByName.get(geo.dongName);
    if (exactEntry) {
      exact += 1;
      dong.push({ dongName: geo.dongName, sourceName: exactEntry.name, bjdCode: geo.bjdCode, hanja: exactEntry.hanja, matchType: "exact", docIndex: exactEntry.docIndex, raw: exactEntry.raw });
      continue;
    }

    const compositeName = compositeDocName(geo.dongName);
    const compositeEntry = compositeName ? exactByName.get(compositeName) : null;
    if (compositeEntry) {
      composite += 1;
      dong.push({ dongName: geo.dongName, bjdCode: geo.bjdCode, hanja: compositeEntry.hanja, matchType: "composite", docIndex: compositeEntry.docIndex, raw: compositeEntry.raw, sourceName: compositeEntry.name });
      continue;
    }

    const context = firstMentionContext(body, geo.dongName);
    if (context) {
      mention += 1;
      dong.push({ dongName: geo.dongName, bjdCode: geo.bjdCode, hanja: "", matchType: "mention", docIndex: null, raw: "", context });
      continue;
    }

    missing.push(geo.dongName);
  }

  const geoNames = new Set(geoDongs.map((item) => item.dongName));
  const docOnly = entries
    .filter((entry) => !geoNames.has(entry.name))
    .map((entry) => ({ name: entry.name, hanja: entry.hanja, docIndex: entry.docIndex, raw: entry.raw }));

  const row = {
    slug,
    guName,
    sgg,
    eid: article.eid || "",
    sectionMissing: !dongSection,
    dong,
    docOnly,
    missing,
    warnings: guWarnings,
    sourceEntryCount: entries.length,
    residualLength: residual
  };
  finalGu.push(row);
  coverage.push({
    guName, slug, sgg, geoCount: geoDongs.length, exact, composite, mention,
    missing: missing.length, coverage: geoDongs.length ? (exact + composite + mention) / geoDongs.length : 0
  });
}

const output = {
  generatedAt: new Date().toISOString(),
  source: "한국민족문화대백과사전 OpenAPI",
  gu: finalGu,
  coverage,
  warnings
};
await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");

for (const row of coverage) {
  console.log(`${row.guName}\t${row.sgg}\t${row.geoCount}\t${row.exact}\t${row.composite}\t${row.mention}\t${row.missing}\t${(row.coverage * 100).toFixed(1)}%`);
}
const total = coverage.reduce((acc, row) => ({
  geoCount: acc.geoCount + row.geoCount,
  exact: acc.exact + row.exact,
  composite: acc.composite + row.composite,
  mention: acc.mention + row.mention,
  missing: acc.missing + row.missing
}), { geoCount: 0, exact: 0, composite: 0, mention: 0, missing: 0 });
console.log(`TOTAL\t-\t${total.geoCount}\t${total.exact}\t${total.composite}\t${total.mention}\t${total.missing}\t${((total.exact + total.composite + total.mention) / total.geoCount * 100).toFixed(1)}%`);
for (const warning of warnings) console.log(`WARNING\t${warning.guName}\t${warning.type}\t${warning.detail}`);
