import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = "https://devin.aks.ac.kr:8080";
const DRAFT_PATH = path.join("data", "dong-draft.json");
const DONG_RAW_DIR = path.join("data", "encykorea-raw", "dong");
const SEARCH_RESULTS_PATH = path.join(DONG_RAW_DIR, "_unresolved-searches.json");
const BJD_PATH = path.join("bjd", "bjd_11_seoul.geojson");
const MIN_INTERVAL_MS = 1000;
const MAX_REQUESTS = 60;
const MAX_ATTEMPTS = 3;
const key = (process.env.ENCYKOREA_KEY || "").trim();

if (!key) throw new Error("ENCYKOREA_KEY가 비어 있습니다.");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const exists = async (target) => access(target).then(() => true).catch(() => false);
const summarize = (item) => ({ eid: item?.eid || "", headword: item?.headword || "", definition: item?.definition || "" });
let requestCount = 0;
let lastRequestAt = 0;
let consecutive429 = 0;
let repeated5xx = 0;
const startedAt = Date.now();

async function apiGet(pathname) {
  let last = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await delay(wait);
    if (requestCount >= MAX_REQUESTS) throw new Error(`요청 수 상한 ${MAX_REQUESTS}회를 초과하려 했습니다.`);
    lastRequestAt = Date.now();
    requestCount += 1;
    const response = await fetch(`${BASE_URL}${pathname}`, { headers: { "X-API-Key": key } });
    const text = await response.text();
    last = { status: response.status, text };
    if (response.status === 429) {
      consecutive429 += 1;
      if (consecutive429 >= 3) throw new Error("429 응답이 연속 3회 발생하여 전체 보완 수집을 중단합니다.");
    } else {
      consecutive429 = 0;
    }
    if (response.status >= 500) {
      repeated5xx += 1;
      if (repeated5xx >= 3) throw new Error("5xx 응답이 반복되어 전체 보완 수집을 중단합니다.");
    } else {
      repeated5xx = 0;
    }
    if (response.status === 429 || response.status >= 500) {
      if (attempt < MAX_ATTEMPTS) {
        await delay(1000 * (2 ** (attempt - 1)));
        continue;
      }
    }
    return last;
  }
  return last;
}

function parseJson(text, context) {
  try { return JSON.parse(text); }
  catch (error) { throw new Error(`${context} JSON 파싱 실패: ${error.message}`); }
}

function targetList(draft) {
  const targets = [];
  for (const gu of draft.gu) {
    for (const dong of gu.dong || []) {
      if (dong.matchType === "mention" || dong.matchType === "missing") targets.push({ gu, dong });
    }
    for (const dongName of gu.missing || []) targets.push({ gu, dong: { dongName, matchType: "missing" } });
  }
  const seen = new Set();
  return targets.filter(({ gu, dong }) => {
    const id = `${gu.sgg}:${dong.dongName}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function findDraftDong(gu, dongName) {
  return (gu.dong || []).find((dong) => dong.dongName === dongName);
}

function searchQueries(guName, dongName) {
  return [
    { stage: 1, query: dongName },
    { stage: 2, query: `${dongName} ${guName}` },
    { stage: 3, query: `서울특별시 ${guName} ${dongName}` }
  ];
}

async function searchAllStages(guName, dongName) {
  const stages = [];
  for (const spec of searchQueries(guName, dongName)) {
    const response = await apiGet(`/api/articles/search?q=${encodeURIComponent(spec.query)}&p=1&ps=10`);
    if (response.status !== 200) {
      stages.push({ ...spec, status: response.status, totalCount: null, currentCount: null, items: [], response: response.text });
      console.log(`SEARCH\t${guName}\t${dongName}\t${spec.stage}\tHTTP-${response.status}\t[]`);
      continue;
    }
    const json = parseJson(response.text, `${guName} ${dongName} ${spec.stage}차 검색`);
    const items = Array.isArray(json.items) ? json.items : [];
    stages.push({ ...spec, status: response.status, totalCount: json.totalCount ?? null, currentCount: json.currentCount ?? null, items });
    console.log(`SEARCH\t${guName}\t${dongName}\t${spec.stage}\ttotal=${json.totalCount ?? ""}\tcurrent=${json.currentCount ?? ""}`);
    console.log(`SEARCH_ITEMS\t${guName}\t${dongName}\t${spec.stage}\t${JSON.stringify(items)}`);
  }
  return stages;
}

function uniqueAcceptedHeadwordCandidates(stages, dongName) {
  const byEid = new Map();
  for (const stage of stages) {
    for (const item of stage.items || []) {
      if (item?.headword === dongName || String(item?.headword || "").endsWith(dongName)) byEid.set(item.eid, item);
    }
  }
  return [...byEid.values()];
}

const [draft, bjd] = await Promise.all([
  readFile(DRAFT_PATH, "utf8").then(JSON.parse),
  readFile(BJD_PATH, "utf8").then(JSON.parse)
]);
const bjdCodeByKey = new Map((bjd.features || []).map((feature) => [
  `${String(feature.properties?.EMD_CD || "").slice(0, 5)}:${feature.properties?.EMD_NM}`,
  String(feature.properties?.EMD_CD || "")
]));
const targets = targetList(draft);
console.log(`TARGET_COUNT\t${targets.length}`);
for (const { gu, dong } of targets) console.log(`TARGET\t${gu.guName}\t${gu.sgg}\t${dong.dongName}\t${dong.matchType}`);
if (targets.length > 60) throw new Error(`보완 대상 ${targets.length}개가 60개를 초과하여 중단합니다.`);
if (process.argv.includes("--dry-run")) process.exit(0);

await mkdir(DONG_RAW_DIR, { recursive: true });
const unresolved = [];
const accepted = [];
const resultRows = [];
for (const { gu, dong: target } of targets) {
  const rawPath = path.join(DONG_RAW_DIR, `${gu.sgg}-${target.dongName}.json`);
  let article = null;
  let stages = [];
  if (await exists(rawPath)) {
    article = parseJson(await readFile(rawPath, "utf8"), `${gu.guName} ${target.dongName} 캐시`);
    console.log(`CACHE\t${gu.guName}\t${target.dongName}\t${article.eid || ""}`);
  } else {
    stages = await searchAllStages(gu.guName, target.dongName);
    const candidates = uniqueAcceptedHeadwordCandidates(stages, target.dongName);
    if (stages.some((stage) => stage.status !== 200)) {
      const item = { guName: gu.guName, sgg: gu.sgg, dongName: target.dongName, reason: "searchHttpFailure", candidates: candidates.map(summarize), stages };
      unresolved.push(item); resultRows.push(item);
      console.log(`UNRESOLVED\t${gu.guName}\t${target.dongName}\tsearch-http-failure`);
      continue;
    }
    if (candidates.length !== 1) {
      const item = { guName: gu.guName, sgg: gu.sgg, dongName: target.dongName, reason: candidates.length ? "ambiguousCandidates" : "noCandidate", candidates: candidates.map(summarize), stages };
      unresolved.push(item); resultRows.push(item);
      console.log(`UNRESOLVED\t${gu.guName}\t${target.dongName}\tcandidates-${candidates.length}`);
      continue;
    }
    const detail = await apiGet(`/api/articles/${encodeURIComponent(candidates[0].eid)}`);
    if (detail.status !== 200) {
      const item = { guName: gu.guName, sgg: gu.sgg, dongName: target.dongName, reason: `detail HTTP ${detail.status}`, candidates: candidates.map(summarize), stages, detailResponse: detail.text };
      unresolved.push(item); resultRows.push(item);
      console.log(`UNRESOLVED\t${gu.guName}\t${target.dongName}\tdetail-${detail.status}`);
      continue;
    }
    const candidateArticle = parseJson(detail.text, `${gu.guName} ${target.dongName} 상세`);
    const searchable = `${candidateArticle.body || ""}\n${candidateArticle.definition || ""}`;
    if (!searchable.includes(gu.guName)) {
      const item = { guName: gu.guName, sgg: gu.sgg, dongName: target.dongName, reason: "guNameNotInBodyOrDefinition", candidates: candidates.map(summarize), stages };
      unresolved.push(item); resultRows.push(item);
      console.log(`UNRESOLVED\t${gu.guName}\t${target.dongName}\tgu-name-mismatch`);
      continue;
    }
    article = candidateArticle;
    await writeFile(rawPath, detail.text, "utf8");
  }

  const bjdCode = bjdCodeByKey.get(`${gu.sgg}:${target.dongName}`) || target.bjdCode || "";
  const existing = findDraftDong(gu, target.dongName);
  const dongDoc = { ...(existing || {}), dongName: target.dongName, bjdCode, matchType: "dongDoc", eid: article.eid || "", raw: String(article.body || ""), definition: article.definition || "", context: undefined };
  if (existing) Object.assign(existing, dongDoc);
  else gu.dong.push(dongDoc);
  gu.missing = (gu.missing || []).filter((name) => name !== target.dongName);
  accepted.push({ guName: gu.guName, sgg: gu.sgg, dongName: target.dongName, eid: article.eid || "" });
  resultRows.push({ guName: gu.guName, sgg: gu.sgg, dongName: target.dongName, outcome: "accepted", eid: article.eid || "", stages });
  console.log(`ACCEPT\t${gu.guName}\t${target.dongName}\t${article.eid || ""}`);
}

for (const gu of draft.gu) gu.unresolved = unresolved.filter((item) => item.sgg === gu.sgg);
for (const row of draft.coverage || []) {
  const gu = draft.gu.find((item) => item.slug === row.slug);
  row.dongDoc = (gu?.dong || []).filter((dong) => dong.matchType === "dongDoc").length;
  row.mention = (gu?.dong || []).filter((dong) => dong.matchType === "mention").length;
  row.missing = (gu?.missing || []).length;
}
draft.supplement = { generatedAt: new Date().toISOString(), requestCount, elapsedSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)), targetCount: targets.length, accepted, unresolved };
await writeFile(DRAFT_PATH, JSON.stringify(draft, null, 2) + "\n", "utf8");
await writeFile(SEARCH_RESULTS_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), requestCount, results: resultRows }, null, 2) + "\n", "utf8");
console.log(`SUMMARY\ttargets=${targets.length}\taccepted=${accepted.length}\tunresolved=${unresolved.length}\trequests=${requestCount}\telapsedSeconds=${((Date.now() - startedAt) / 1000).toFixed(1)}`);
