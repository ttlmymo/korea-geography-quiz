import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const WORKBOOK = path.join("data", "dong-source.xlsx");
const SHEET_PATH = path.join("xl", "worksheets", "sheet1.xml");

function decodeXml(value) {
  return String(value ?? "")
    .replace(/&#(x[0-9A-Fa-f]+|\d+);/g, (_, token) => String.fromCodePoint(token.startsWith("x") ? parseInt(token.slice(1), 16) : parseInt(token, 10)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function encodeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;")
    .replace(/\r/g, "&#13;").replace(/\n/g, "&#10;");
}

function cellValue(rowXml, column, rowNumber) {
  const escaped = `${column}${rowNumber}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cell = rowXml.match(new RegExp(`<c r="${escaped}"[^>]*>([\\s\\S]*?)</c>`));
  if (!cell) return "";
  const text = cell[1].match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/);
  return text ? decodeXml(text[1]) : "";
}

function inlineCell(column, rowNumber, value, style) {
  return `<c r="${column}${rowNumber}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${encodeXml(value)}</t></is></c>`;
}

function numberCell(column, rowNumber, value, style = 0) {
  return `<c r="${column}${rowNumber}" s="${style}"><v>${Number(value)}</v></c>`;
}

function splitSentences(text) {
  const source = String(text ?? "");
  const out = [];
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (!/[.!?]/.test(source[index])) continue;
    const next = source[index + 1] || "";
    if (next && !/\s/.test(next)) continue;
    const sentence = source.slice(start, index + 1).trim();
    if (sentence) out.push(sentence);
    start = index + 1;
  }
  const tail = source.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

function isDirectionIntro(text) {
  const startsWithGuDirection = /^(?:(?:서울특별시\s*)?[가-힣]+구(?:의)?|구의?)\s*(?:(?:동|서|남|북)(?:북|남)?|중앙)\s*(?:쪽|부|끝)?(?:\s*(?:한강변|한강\s*변|일대|지역|끝|중앙))?.{0,36}(?:있는|위치한|자리한|위치하고|자리하고|위치한다|자리한다|있다)/.test(text);
  const hasBoundary = /(?:접해|접한다|경계로|경계를|맞닿|연접|사이에)/.test(text);
  return { startsWithGuDirection, hasBoundary, introOnly: startsWithGuDirection && !hasBoundary };
}

function classify(sentence, isFirst = false) {
  const text = sentence.trim();
  const intro = isDirectionIntro(text);
  if (isFirst && intro.introOnly) return { bucket: "delete", hold: false, reasons: ["구 내 방위 도입"], introDeleted: true, introVariant: false };
  const historical = /(?:\b(?:1[0-9]{3}|20[0-9]{2})년|조선|고려|백제|고구려|신라|일제|편입|신설|분구|개칭|통합|철거민|이주|정착|유래|유적|설화|전설|원찰|개명|발굴|보호수|고인돌|주거지|창릉천|진관사)/.test(text);
  const location = /(?:북쪽|남쪽|동쪽|서쪽|중앙|한강변|기슭|경계|접해 있|맞닿|사이에 있|위치해 있|있는 동이다|동쪽에 있)/.test(text);
  const origin = /(?:유래|연유|이름.*(?:생겨|유래|불리|변하)|한자.*(?:뜻|표기)|지명.*(?:생겨|유래))/.test(text);
  const geography = /(?:하천|천\b|산\b|고개|대로|로\b|교\b|철도|지하철|노선|역\b|터널|대교|고속도로)/.test(text);
  const administrativeHistory = /(?:\d{4}년.*(?:편입|신설|분구|개칭|통합|소속)|(?:편입|신설|분구|개칭|통합).*(?:\d{4}년|되었|되면서))/.test(text);
  const keepSignal = historical || location || origin || geography || administrativeHistory;
  const commercial = /(?:상권|상가|백화점|시장|유흥|상업지역|가구단지|학원가|업소|상점|점포|아파트단지)/.test(text);
  const admin = /(?:동사무소|행정복지센터|주민센터|구청|출장소|행정동).*(?:담당|관할|운영)|(?:담당|관할).*(?:동사무소|행정복지센터|주민센터|구청|출장소|행정동)/.test(text);
  const statistic = /(?:인구|세대수|가구수|면적|인구밀도|인구는|세대는)/.test(text);
  const ongoing = /(?:(?:개발|조성|재개발|정비사업|공사).*(?:진행\s*중|예정|계획\s*(?:중|되어\s*있)|추진\s*중)|(?:진행\s*중|예정|추진\s*중).*(?:개발|조성|재개발|정비사업|공사))/.test(text) && !historical;
  const evaluative = /(?:교통이\s*(?:매우\s*)?편리|교통.*?편리|쾌적|유명(?:하다|한)|살기\s*좋|중심지로서|요람으로|이름\s*높)/.test(text);
  const deleteReasons = [commercial && "상권·상업시설", admin && "행정 관할", statistic && "수치 통계", ongoing && "진행·예정 사업", evaluative && "평가 표현"].filter(Boolean);
  if (deleteReasons.length) {
    // 연도·변천·유래가 분명한 문장은 현재 시설·관할 단어가 함께 있어도 확정 과거 사실로 보존한다.
    if (historical || origin || administrativeHistory) return { bucket: "keep", hold: false, reasons: deleteReasons };
    // 역명·노선 같은 골격에 편리성 평가가 결합된 문장은 문장 단위로 삭제한다.
    if (evaluative) return { bucket: "delete", hold: false, reasons: deleteReasons };
    if (!keepSignal) return { bucket: "delete", hold: false, reasons: deleteReasons };
    return { bucket: "keep", hold: true, reasons: deleteReasons };
  }
  if (keepSignal) return { bucket: "keep", hold: false, reasons: [] };
  return { bucket: "keep", hold: true, reasons: [] };
}

function selectBody(body) {
  const sentences = splitSentences(body);
  const keep = [], deleted = [], held = [], introVariants = [];
  for (const [index, sentence] of sentences.entries()) {
    const result = classify(sentence, index === 0);
    const intro = isDirectionIntro(sentence.trim());
    if (index === 0 && intro.startsWithGuDirection && !intro.introOnly) introVariants.push(sentence);
    if (result.bucket === "delete") deleted.push(sentence);
    else keep.push(sentence);
    if (result.hold) held.push({ sentence, reasons: result.reasons });
  }
  return { keep, deleted, held, introVariants, introDeletedCount: deleted.filter((sentence, index) => index === 0 && isDirectionIntro(sentence).introOnly).length, selectedText: keep.join("\n"), deletedText: deleted.join("\n") };
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), "filter-dong-source-"));
try {
  execFileSync("unzip", ["-q", WORKBOOK, "-d", tempDir]);
  const sheetFile = path.join(tempDir, SHEET_PATH);
  let sheetXml = await readFile(sheetFile, "utf8");
  const groupSelections = new Map();
  const rowResults = [];
  sheetXml = sheetXml.replace(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g, (full, rowString, rowInner) => {
    const rowNumber = Number(rowString);
    const withoutNewColumns = rowInner.replace(/<c r="[LMN]\d+"[\s\S]*?<\/c>/g, "");
    if (rowNumber === 1) {
      return full.replace(rowInner, `${withoutNewColumns}${inlineCell("L", rowNumber, "선별문", 1)}${inlineCell("M", rowNumber, "선별문글자수", 1)}${inlineCell("N", rowNumber, "버린문장", 1)}`);
    }
    const matchType = cellValue(rowInner, "G", rowNumber);
    const groupId = cellValue(rowInner, "H", rowNumber);
    const sourceBody = cellValue(rowInner, "I", rowNumber);
    const existingNote = cellValue(rowInner, "K", rowNumber);
    let selected = { selectedText: "", deletedText: "", held: [], introVariants: [], introDeletedCount: 0, keep: [], deleted: [] };
    if (matchType !== "none" && sourceBody) {
      if (matchType === "composite" && groupId && groupSelections.has(groupId)) selected = groupSelections.get(groupId);
      else {
        selected = selectBody(sourceBody);
        if (matchType === "composite" && groupId) groupSelections.set(groupId, selected);
      }
    }
    const note = selected.held.length && !existingNote.split(";").map((value) => value.trim()).includes("판정보류")
      ? `${existingNote ? `${existingNote}; ` : ""}판정보류`
      : existingNote;
    rowResults.push({
      rowNumber, guName: cellValue(rowInner, "B", rowNumber), dongName: cellValue(rowInner, "D", rowNumber), matchType, groupId,
      sourceBody, selectedText: selected.selectedText, deletedText: selected.deletedText, held: selected.held, introVariants: selected.introVariants, introDeletedCount: selected.introDeletedCount, selectedLength: selected.selectedText.length
    });
    const withoutK = withoutNewColumns.replace(new RegExp(`<c r="K${rowNumber}"[\\s\\S]*?<\\/c>`), "");
    const newCells = `${inlineCell("K", rowNumber, note, 2)}${inlineCell("L", rowNumber, selected.selectedText, 2)}${numberCell("M", rowNumber, selected.selectedText.length)}${inlineCell("N", rowNumber, selected.deletedText, 2)}`;
    return full.replace(rowInner, `${withoutK}${newCells}`);
  });
  sheetXml = sheetXml.replace("</cols>", '<col min="12" max="12" width="100" customWidth="1"/><col min="13" max="13" width="14" customWidth="1"/><col min="14" max="14" width="100" customWidth="1"/></cols>');
  sheetXml = sheetXml.replace(/<autoFilter ref="A1:K(\d+)"\/>/, '<autoFilter ref="A1:N$1"/>');
  await writeFile(sheetFile, sheetXml, "utf8");
  await rm(WORKBOOK, { force: true });
  execFileSync("zip", ["-q", "-r", path.resolve(WORKBOOK), "."], { cwd: tempDir });
  const nonNone = rowResults.filter((row) => row.matchType !== "none" && row.sourceBody);
  const distribution = { "200자 이하": 0, "201~400자": 0, "401~600자": 0, "601자 초과": 0 };
  for (const row of nonNone) {
    if (row.selectedLength <= 200) distribution["200자 이하"] += 1;
    else if (row.selectedLength <= 400) distribution["201~400자"] += 1;
    else if (row.selectedLength <= 600) distribution["401~600자"] += 1;
    else distribution["601자 초과"] += 1;
  }
  const report = {
    rows: rowResults.length,
    nonNone: nonNone.length,
    distribution,
    over400: nonNone.filter((row) => row.selectedLength > 400).map((row) => ({ guName: row.guName, dongName: row.dongName, length: row.selectedLength })),
    fullyDeleted: nonNone.filter((row) => !row.selectedText && row.deletedText).map((row) => ({ guName: row.guName, dongName: row.dongName })),
    held: nonNone.filter((row) => row.held.length).map((row) => ({ guName: row.guName, dongName: row.dongName, heldCount: row.held.length, sample: row.held[0].sentence })),
    groups: groupSelections.size,
    introDeleted: nonNone.filter((row) => row.introDeletedCount).map((row) => ({ guName: row.guName, dongName: row.dongName, sentence: splitSentences(row.sourceBody)[0] || "" })),
    introVariants: nonNone.flatMap((row) => (row.introVariants || []).map((sentence) => ({ guName: row.guName, dongName: row.dongName, sentence }))),
    sentenceCounts: { source: 0, selected: 0, deleted: 0 }
  };
  for (const row of nonNone) {
    report.sentenceCounts.source += splitSentences(row.sourceBody).length;
    report.sentenceCounts.selected += splitSentences(row.selectedText).length;
    report.sentenceCounts.deleted += splitSentences(row.deletedText).length;
  }
  await writeFile("/tmp/q-filter-summary.json", JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(report, null, 2));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
