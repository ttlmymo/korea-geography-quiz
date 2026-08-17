import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { SEOUL_SLUGS } from "./seoul-slugs.mjs";

const RAW_DIR = path.join("data", "encykorea-raw");
const INDEX_PATH = path.join(RAW_DIR, "_index.json");
const BJD_PATH = path.join("bjd", "bjd_11_seoul.geojson");
const GU_PATH = path.join("gu", "gu_11_seoul.geojson");
const OUTPUT_PATH = path.join("data", "dong-source.xlsx");
const ENTRY = /(?:^|\n)(\d+)\.\s*([^\n]*\([^\)\n]*\)[^\n]*)\n([\s\S]*?)(?=\n\d+\.\s*[^\n]*\([^\)\n]*\)[^\n]*\n|$)/g;

function xml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/\r/g, "&#13;")
    .replace(/\n/g, "&#10;");
}

function columnName(index) {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function inlineCell(ref, value, style = 0) {
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

function numberCell(ref, value, style = 0) {
  return `<c r="${ref}" s="${style}"><v>${Number(value)}</v></c>`;
}

function worksheetXml(rows, widths, autoFilterRef) {
  const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((cell, colIndex) => {
      const ref = `${columnName(colIndex)}${rowIndex + 1}`;
      const style = rowIndex === 0 ? 1 : (cell.wrap ? 2 : 0);
      return cell.number ? numberCell(ref, cell.value, style) : inlineCell(ref, cell.value, style);
    }).join("");
    return `<row r="${rowIndex + 1}"${rowIndex === 0 ? ' ht="24" customHeight="1"' : ""}>${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>${cols}</cols>
  <sheetData>${sheetRows}</sheetData>
  <autoFilter ref="${autoFilterRef}"/>
</worksheet>`;
}

function splitDongSection(body) {
  const match = String(body || "").match(/(?:^|\n)#\s*동\(洞\)\s*\n([\s\S]*?)(?=\n#\s|$)/);
  return match ? match[1] : "";
}

function parseEntries(section) {
  return [...section.matchAll(ENTRY)].map((match) => {
    const headerRaw = match[2];
    const titleMatch = headerRaw.match(/^\s*([^\s(]+)\s*\(([^)\n]*)\)\s*$/);
    return {
      docIndex: Number(match[1]),
      headerRaw,
      name: titleMatch ? titleMatch[1] : "",
      body: match[3],
      start: match.index,
      end: match.index + match[0].length,
      malformed: !titleMatch
    };
  });
}

function compositeCandidates(dongName) {
  const match = dongName.match(/^(.+?)(\d+)가$/);
  if (!match) return [];
  const stem = match[1];
  return [...new Set([stem, stem.endsWith("동") ? stem : `${stem}동`])];
}

function parseNotes(section, entries) {
  const notes = [];
  if (!section) notes.push("동(洞) 절 없음");
  if (section && entries.length === 0) notes.push("번호 항목 파싱 0건");
  if (entries.some((entry) => entry.malformed)) notes.push("형식이 다른 표제어 항목 있음");
  if (entries.length > 0) {
    const missing = [];
    for (let n = entries[0].docIndex; n <= entries.at(-1).docIndex; n += 1) {
      if (!entries.some((entry) => entry.docIndex === n)) missing.push(n);
    }
    if (missing.length) notes.push(`번호 결번: ${missing.join(", ")}`);
  }
  let cursor = 0;
  let residual = "";
  for (const entry of entries) {
    residual += section.slice(cursor, entry.start);
    cursor = entry.end;
  }
  residual += section.slice(cursor);
  if (residual.trim()) notes.push(`미파싱 잔여 텍스트 ${residual.length}자`);
  return notes;
}

function makeWorkbookXml(rawRows, summaryRows) {
  const sourceHeader = ["연번", "자치구", "자치구코드", "법정동명", "법정동코드", "원문표제어", "매칭유형", "공유그룹", "원문전문", "글자수", "비고"];
  const sourceRows = [sourceHeader.map((value) => ({ value }))];
  for (const row of rawRows) {
    sourceRows.push([
      { value: row.no, number: true },
      { value: row.guName },
      { value: row.sgg },
      { value: row.dongName },
      { value: row.dongCode },
      { value: row.sourceHeader },
      { value: row.matchType },
      { value: row.groupId },
      { value: row.body, wrap: true },
      { value: row.charCount, number: true },
      { value: row.note, wrap: true }
    ]);
  }
  const summaryHeader = ["자치구", "자치구코드", "법정동 수", "exact", "composite", "none", "원문 평균 글자수", "원문 최대 글자수"];
  const aggregate = summaryRows.reduce((acc, row) => ({
    total: acc.total + row.total,
    exact: acc.exact + row.exact,
    composite: acc.composite + row.composite,
    none: acc.none + row.none,
    charSum: acc.charSum + row.charSum,
    charCount: acc.charCount + row.charCount,
    max: Math.max(acc.max, row.max)
  }), { total: 0, exact: 0, composite: 0, none: 0, charSum: 0, charCount: 0, max: 0 });
  const summarySheetRows = [summaryHeader.map((value) => ({ value }))];
  for (const row of summaryRows) {
    summarySheetRows.push([
      { value: row.guName }, { value: row.sgg }, { value: row.total, number: true }, { value: row.exact, number: true },
      { value: row.composite, number: true }, { value: row.none, number: true },
      { value: row.charCount ? (row.charSum / row.charCount).toFixed(2) : "", number: Boolean(row.charCount) },
      { value: row.max, number: true }
    ]);
  }
  summarySheetRows.push([
    { value: "합계" }, { value: "" }, { value: aggregate.total, number: true }, { value: aggregate.exact, number: true },
    { value: aggregate.composite, number: true }, { value: aggregate.none, number: true },
    { value: aggregate.charCount ? (aggregate.charSum / aggregate.charCount).toFixed(2) : "", number: Boolean(aggregate.charCount) },
    { value: aggregate.max, number: true }
  ]);
  return {
    sheet1: worksheetXml(sourceRows, [7, 12, 11, 14, 15, 24, 12, 22, 100, 12, 34], `A1:K${sourceRows.length}`),
    sheet2: worksheetXml(summarySheetRows, [14, 12, 13, 10, 12, 10, 20, 20], `A1:H${summarySheetRows.length}`)
  };
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
  const code = String(feature.properties?.EMD_CD || "");
  const guCode = code.slice(0, 5);
  const dongName = String(feature.properties?.EMD_NM || "");
  if (!/^\d{8}$/.test(code) || !dongName) continue;
  // 입력 GeoJSON의 EMD_CD는 8자리이므로 법정동 행정표준 10자리 형식으로 00을 접미한다.
  const standardDongCode = `${code}00`;
  const list = bjdBySgg.get(guCode) || [];
  list.push({ dongName, dongCode: standardDongCode });
  bjdBySgg.set(guCode, list);
}
for (const list of bjdBySgg.values()) list.sort((a, b) => a.dongName.localeCompare(b.dongName, "ko"));

const sourceRows = [];
const summaryRows = [];
const validation = { cacheIssues: [], parserNotes: [], none: [], composite: [] };
for (const [guName, { slug }] of Object.entries(SEOUL_SLUGS).sort(([a], [b]) => a.localeCompare(b, "ko"))) {
  const collection = indexBySlug.get(slug);
  const targetSgg = codeByGu.get(guName) || "";
  const legalDongs = bjdBySgg.get(targetSgg) || [];
  let article = null;
  if (!collection?.success) validation.cacheIssues.push({ guName, slug, reason: "수집 인덱스 성공 항목 없음" });
  try { article = JSON.parse(await readFile(path.join(RAW_DIR, `${slug}.json`), "utf8")); } catch { validation.cacheIssues.push({ guName, slug, reason: "캐시 파일 없음 또는 JSON 파싱 실패" }); }
  const section = splitDongSection(article?.body || "");
  const entries = parseEntries(section);
  const notes = parseNotes(section, entries);
  if (notes.length) validation.parserNotes.push({ guName, notes });
  const exactByName = new Map(entries.filter((entry) => entry.name).map((entry) => [entry.name, entry]));
  const sourceCoverage = new Map();
  for (const legal of legalDongs) {
    if (exactByName.has(legal.dongName)) {
      const list = sourceCoverage.get(legal.dongName) || [];
      list.push(legal.dongName);
      sourceCoverage.set(legal.dongName, list);
    }
    for (const candidate of compositeCandidates(legal.dongName)) {
      const entry = exactByName.get(candidate);
      if (entry) {
        const list = sourceCoverage.get(candidate) || [];
        if (!list.includes(legal.dongName)) list.push(legal.dongName);
        sourceCoverage.set(candidate, list);
      }
    }
  }
  const compositeByName = new Map([...sourceCoverage.entries()].filter(([, members]) => members.length > 1));
  const guRows = [];
  for (const legal of legalDongs) {
    const exact = exactByName.get(legal.dongName);
    let entry = exact || null;
    let matchType = exact ? "exact" : "none";
    let groupId = "";
    let sourceName = exact?.name || "";
    if (exact && (compositeByName.get(exact.name) || []).length > 1) {
      matchType = "composite";
      groupId = `${targetSgg}:${exact.name}`;
    } else if (!entry) {
      const candidates = compositeCandidates(legal.dongName);
      const compositeName = candidates.find((candidate) => (compositeByName.get(candidate) || []).length > 1);
      if (compositeName) {
        entry = exactByName.get(compositeName);
        sourceName = compositeName;
        matchType = "composite";
        groupId = `${targetSgg}:${compositeName}`;
      }
    }
    const noteParts = [...notes];
    if (matchType === "none") noteParts.push("대응 원문 표제어 없음");
    const row = {
      guName,
      sgg: targetSgg,
      dongName: legal.dongName,
      dongCode: legal.dongCode,
      sourceHeader: (entry?.headerRaw || "").replace(/\r$/, ""),
      matchType,
      groupId,
      body: entry?.body || "",
      charCount: entry?.body?.length || 0,
      note: noteParts.join("; ")
    };
    guRows.push(row);
    if (matchType === "none") validation.none.push({ guName, dongName: legal.dongName });
  }
  for (const [sourceName, members] of compositeByName.entries()) {
    const entry = exactByName.get(sourceName);
    if (members.length) validation.composite.push({ guName, groupId: `${targetSgg}:${sourceName}`, sourceHeader: entry.headerRaw.replace(/\r$/, ""), count: members.length, members: [...members].sort((a, b) => a.localeCompare(b, "ko")) });
  }
  const chars = guRows.filter((row) => row.matchType !== "none").map((row) => row.charCount);
  summaryRows.push({
    guName, sgg: targetSgg, total: guRows.length,
    exact: guRows.filter((row) => row.matchType === "exact").length,
    composite: guRows.filter((row) => row.matchType === "composite").length,
    none: guRows.filter((row) => row.matchType === "none").length,
    charSum: chars.reduce((sum, value) => sum + value, 0), charCount: chars.length, max: Math.max(0, ...chars)
  });
  sourceRows.push(...guRows);
}
sourceRows.sort((a, b) => a.guName.localeCompare(b.guName, "ko") || a.dongName.localeCompare(b.dongName, "ko"));
sourceRows.forEach((row, index) => { row.no = index + 1; });
summaryRows.sort((a, b) => a.guName.localeCompare(b.guName, "ko"));
if (sourceRows.length !== 467) throw new Error(`법정동 행 수 오류: ${sourceRows.length}`);
if (validation.cacheIssues.length) throw new Error(`캐시 문제: ${JSON.stringify(validation.cacheIssues)}`);

const sheets = makeWorkbookXml(sourceRows, summaryRows);
const tempDir = await mkdtemp(path.join(os.tmpdir(), "dong-source-xlsx-"));
try {
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="원문" sheetId="1" r:id="rId1"/><sheet name="집계" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="맑은 고딕"/></font><font><b/><sz val="10"/><name val="맑은 고딕"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs></styleSheet>`,
    "xl/worksheets/sheet1.xml": sheets.sheet1,
    "xl/worksheets/sheet2.xml": sheets.sheet2
  };
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(tempDir, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
  execFileSync("zip", ["-q", "-r", path.resolve(OUTPUT_PATH), "."], { cwd: tempDir });
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

const summary = {
  rows: sourceRows.length,
  exact: sourceRows.filter((row) => row.matchType === "exact").length,
  composite: sourceRows.filter((row) => row.matchType === "composite").length,
  none: sourceRows.filter((row) => row.matchType === "none").length,
  parserNotes: validation.parserNotes,
  noneList: validation.none,
  compositeGroups: validation.composite.sort((a, b) => a.guName.localeCompare(b.guName, "ko") || a.groupId.localeCompare(b.groupId, "ko")),
  summaryRows
};
console.log(JSON.stringify(summary, null, 2));
