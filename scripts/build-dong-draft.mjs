import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { SEOUL_SLUGS } from "./seoul-slugs.mjs";

const RAW_DIR = path.join("data", "encykorea-raw");
const INDEX_PATH = path.join(RAW_DIR, "_index.json");
const OUTPUT_PATH = path.join("data", "dong-draft.json");
const BJD_PATH = path.join("bjd", "bjd_11_seoul.geojson");
const GU_PATH = path.join("gu", "gu_11_seoul.geojson");
const ENTRY = /(?:^|\n)(\d+)\.\s*([^\n(]+?)\s*\(([^)\n]*)\)\s*\n([\s\S]*?)(?=\n\d+\.\s*[^\n(]+?\s*\([^)\n]*\)\s*\n|$)/g;

// GeoJSON 법정동 → 문서 항목명. 2007년 은평구 진관동은 진관내동·진관외동·구파발동을 통합해 신설됐다.
// 근거: 한국민족문화대백과사전 은평구 문서의 동 절 및 서울특별시 2007년 행정동 통합.
const MANUAL_MAP = {
  "11380": {
    "진관동": ["진관내동", "진관외동", "구파발동"]
  }
};

function splitDongSection(body) {
  const match = body.match(/(?:^|\n)#\s*동\(洞\)\s*\n([\s\S]*?)(?=\n#\s|$)/);
  return match ? match[1] : "";
}

function parseEntries(dongSection) {
  return [...dongSection.matchAll(ENTRY)].map((match) => ({
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
  return (residual + dongSection.slice(cursor)).trim().length;
}

function firstMentionContext(body, name) {
  const index = body.indexOf(name);
  return index < 0 ? null : body.slice(Math.max(0, index - 200), Math.min(body.length, index + name.length + 200));
}

function compositeCandidates(dongName) {
  const match = dongName.match(/^(.+?)(\d+)(가|동)$/);
  if (!match) return [];
  const stem = match[1];
  const out = [stem];
  if (!stem.endsWith("동")) out.push(`${stem}동`);
  return out;
}

function entrySource(entry) {
  return { name: entry.name, hanja: entry.hanja, docIndex: entry.docIndex, raw: entry.raw };
}

const [indexData, bjdData, guData] = await Promise.all([
  readFile(INDEX_PATH, "utf8").then(JSON.parse),
  readFile(BJD_PATH, "utf8").then(JSON.parse),
  readFile(GU_PATH, "utf8").then(JSON.parse)
]);
const indexBySlug = new Map((indexData.entries || []).map((entry) => [entry.slug, entry]));
const codeByGu = new Map((guData.features || []).map((feature) => [feature.properties?.sgg_nm, String(feature.properties?.sgg || "")]));
const bjdBySgg = new Map();
for (const feature of bjdData.features || []) {
  const bjdCode = String(feature.properties?.EMD_CD || "");
  const sgg = bjdCode.slice(0, 5);
  const dongName = feature.properties?.EMD_NM;
  if (!sgg || !dongName) continue;
  const list = bjdBySgg.get(sgg) || [];
  list.push({ dongName, bjdCode });
  bjdBySgg.set(sgg, list);
}
for (const list of bjdBySgg.values()) list.sort((a, b) => a.dongName.localeCompare(b.dongName, "ko"));

const gu = [];
const coverage = [];
const warnings = [];

for (const [guName, { slug }] of Object.entries(SEOUL_SLUGS)) {
  const sgg = codeByGu.get(guName) || "";
  const geoDongs = bjdBySgg.get(sgg) || [];
  const collection = indexBySlug.get(slug);
  const guWarnings = [];

  if (!collection?.success) {
    const warning = { slug, guName, type: "collectionFailed", detail: collection?.error || "수집 인덱스 항목 없음" };
    warnings.push(warning);
    gu.push({ slug, guName, sgg, eid: collection?.eid || "", sectionMissing: true, dong: [], compositeSource: [], docOnly: [], missing: geoDongs.map((item) => item.dongName), unresolved: [], warnings: [warning] });
    coverage.push({ guName, slug, sgg, geoCount: geoDongs.length, exact: 0, composite: 0, merged: 0, dongDoc: 0, mention: 0, missing: geoDongs.length });
    continue;
  }

  const article = JSON.parse(await readFile(path.join(RAW_DIR, `${slug}.json`), "utf8"));
  const body = String(article.body || "");
  const dongSection = splitDongSection(body);
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
  const usedSourceNames = new Set();
  const dong = [];
  const missing = [];
  let exact = 0, composite = 0, merged = 0, mention = 0;

  for (const geo of geoDongs) {
    const exactEntry = exactByName.get(geo.dongName);
    if (exactEntry) {
      exact += 1;
      usedSourceNames.add(exactEntry.name);
      dong.push({ dongName: geo.dongName, sourceName: exactEntry.name, bjdCode: geo.bjdCode, hanja: exactEntry.hanja, matchType: "exact", docIndex: exactEntry.docIndex, raw: exactEntry.raw });
      continue;
    }

    const manualNames = MANUAL_MAP[sgg]?.[geo.dongName];
    if (manualNames) {
      const manualEntries = manualNames.map((name) => exactByName.get(name)).filter(Boolean);
      if (manualEntries.length === manualNames.length) {
        merged += 1;
        manualEntries.forEach((entry) => usedSourceNames.add(entry.name));
        dong.push({
          dongName: geo.dongName,
          bjdCode: geo.bjdCode,
          matchType: "merged",
          sources: manualEntries.map(entrySource),
          raw: manualEntries.map((entry) => entry.raw)
        });
        continue;
      }
    }

    const compositeEntry = compositeCandidates(geo.dongName).map((candidate) => exactByName.get(candidate)).find(Boolean);
    if (compositeEntry) {
      composite += 1;
      usedSourceNames.add(compositeEntry.name);
      dong.push({ dongName: geo.dongName, sourceName: compositeEntry.name, bjdCode: geo.bjdCode, hanja: compositeEntry.hanja, matchType: "composite", docIndex: compositeEntry.docIndex, raw: compositeEntry.raw });
      continue;
    }

    const context = firstMentionContext(body, geo.dongName);
    if (context) {
      mention += 1;
      dong.push({ dongName: geo.dongName, bjdCode: geo.bjdCode, matchType: "mention", raw: "", context });
    } else {
      missing.push(geo.dongName);
    }
  }

  const sourceGroups = new Map();
  for (const item of dong.filter((item) => (item.matchType === "exact" || item.matchType === "composite") && item.sourceName)) {
    const group = sourceGroups.get(item.sourceName) || [];
    group.push(item.dongName);
    sourceGroups.set(item.sourceName, group);
  }
  for (const item of dong) {
    const sharedGroup = item.sourceName ? sourceGroups.get(item.sourceName) : null;
    if (sharedGroup?.length >= 2) {
      item.sharedGroup = [...sharedGroup];
      item.sharedGroupSize = sharedGroup.length;
    }
  }

  const compositeSource = [...usedSourceNames]
    .map((name) => ({ name, entry: exactByName.get(name) }))
    .filter(({ name }) => dong.some((item) => item.matchType === "composite" && item.sourceName === name))
    .map(({ name, entry }) => ({ ...entrySource(entry), usedFor: dong.filter((item) => item.matchType === "composite" && item.sourceName === name).map((item) => item.dongName) }));
  const docOnly = entries.filter((entry) => !usedSourceNames.has(entry.name)).map(entrySource);

  const row = {
    slug, guName, sgg, eid: article.eid || "", sectionMissing: !dongSection,
    dong, compositeSource, docOnly, missing, unresolved: [], warnings: guWarnings,
    sourceEntryCount: entries.length, residualLength: residual
  };
  gu.push(row);
  coverage.push({ guName, slug, sgg, geoCount: geoDongs.length, exact, composite, merged, dongDoc: 0, mention, missing: missing.length });
}

const output = { generatedAt: new Date().toISOString(), source: "한국민족문화대백과사전 OpenAPI", gu, coverage, warnings };
await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");

for (const row of coverage) {
  const bodyRate = row.geoCount ? (row.exact + row.composite + row.merged + row.dongDoc) / row.geoCount * 100 : 0;
  const referenceRate = row.geoCount ? (row.exact + row.composite + row.merged + row.dongDoc + row.mention) / row.geoCount * 100 : 0;
  console.log(`${row.guName}\t${row.sgg}\t${row.geoCount}\t${row.exact}\t${row.composite}\t${row.merged}\t${row.dongDoc}\t${row.mention}\t${row.missing}\t${bodyRate.toFixed(1)}%\t${referenceRate.toFixed(1)}%`);
}
for (const warning of warnings) console.log(`WARNING\t${warning.guName}\t${warning.type}\t${warning.detail}`);
