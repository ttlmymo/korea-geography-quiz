import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { SEOUL_SLUGS } from "./seoul-slugs.mjs";

const BASE_URL = "https://devin.aks.ac.kr:8080";
const RAW_DIR = path.join("data", "encykorea-raw");
const INDEX_PATH = path.join(RAW_DIR, "_index.json");
const FORCE = process.argv.includes("--force");
const MIN_INTERVAL_MS = 1000;
const MAX_REQUESTS = 50;
const MAX_ATTEMPTS = 3;
const key = (process.env.ENCYKOREA_KEY || "").trim();

if (!key) throw new Error("ENCYKOREA_KEY가 비어 있습니다.");

let requestCount = 0;
let lastRequestAt = 0;
let consecutive429 = 0;
const startedAt = Date.now();
const log = [];
const index = [];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const exists = async (target) => access(target).then(() => true).catch(() => false);

function summarizeItem(item) {
  return {
    eid: item?.eid || "",
    headword: item?.headword || "",
    headwordOrigin: item?.headwordOrigin || "",
    field: item?.field || ""
  };
}

async function saveIndex() {
  await writeFile(INDEX_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(),
    requestCount,
    entries: index
  }, null, 2) + "\n", "utf8");
}

async function apiGet(pathname) {
  let last = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const gap = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (gap > 0) await delay(gap);
    if (requestCount >= MAX_REQUESTS) throw new Error(`요청 수 상한 ${MAX_REQUESTS}회를 초과하려 했습니다.`);

    lastRequestAt = Date.now();
    requestCount += 1;
    const response = await fetch(`${BASE_URL}${pathname}`, {
      headers: { "X-API-Key": key }
    });
    const text = await response.text();
    const result = { status: response.status, text };

    if (response.status === 429) {
      consecutive429 += 1;
      if (consecutive429 >= 3) {
        throw new Error("429 응답이 연속 3회 발생하여 전체 수집을 중단합니다.");
      }
    } else {
      consecutive429 = 0;
    }

    if (response.status === 429 || response.status >= 500) {
      last = result;
      if (attempt < MAX_ATTEMPTS) {
        await delay(1000 * (2 ** (attempt - 1)));
        continue;
      }
    }
    return result;
  }
  return last;
}

function parseJson(text, context) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${context} 응답 JSON 파싱 실패: ${error.message}`);
  }
}

function chooseArticle(items, guName) {
  const target = `서울특별시 ${guName}`;
  const exact = items.filter((item) => item?.headword === target);
  if (exact.length === 1) return { item: exact[0], rule: "exact-headword" };
  if (exact.length > 1) return { error: "동일한 정확 표제어 후보가 2건 이상입니다.", items };

  const fallback = items.filter((item) =>
    String(item?.headwordOrigin || "").includes("서울特別市") &&
    String(item?.field || "").startsWith("지리")
  );
  if (fallback.length === 1) return { item: fallback[0], rule: "seoul-origin-geography" };
  return { error: fallback.length === 0 ? "서울 지리 후보가 없습니다." : "서울 지리 후보가 2건 이상입니다.", items };
}

async function cachedEntry(guName, slug, rawPath) {
  const raw = await readFile(rawPath, "utf8");
  const article = parseJson(raw, `${guName} 캐시`);
  const info = await stat(rawPath);
  return {
    slug,
    guName,
    eid: article.eid || "",
    headword: article.headword || "",
    bodyLength: String(article.body || "").length,
    hasDongSection: String(article.body || "").includes("# 동(洞)"),
    lastModifiedTime: article.lastModifiedTime || "",
    fetchedAt: info.mtime.toISOString(),
    cached: true,
    success: true
  };
}

async function collectOne(guName, { slug }) {
  const rawPath = path.join(RAW_DIR, `${slug}.json`);
  if (!FORCE && await exists(rawPath)) {
    const entry = await cachedEntry(guName, slug, rawPath);
    console.log(`CACHE\t${guName}\t${slug}\t${entry.eid}`);
    return entry;
  }

  const q = encodeURIComponent(`서울특별시 ${guName}`);
  const search = await apiGet(`/api/articles/search?q=${q}&p=1&ps=10`);
  if (search.status !== 200) {
    return {
      slug, guName, success: false, stage: "search", status: search.status,
      error: "검색 API가 200을 반환하지 않았습니다.", searchResponse: search.text
    };
  }

  const searchJson = parseJson(search.text, `${guName} 검색`);
  const choice = chooseArticle(Array.isArray(searchJson.items) ? searchJson.items : [], guName);
  if (!choice.item) {
    return {
      slug, guName, success: false, stage: "choose", status: search.status,
      error: choice.error, items: (choice.items || []).map(summarizeItem), searchResponse: search.text
    };
  }

  const detail = await apiGet(`/api/articles/${encodeURIComponent(choice.item.eid)}`);
  if (detail.status !== 200) {
    return {
      slug, guName, eid: choice.item.eid || "", headword: choice.item.headword || "",
      success: false, stage: "detail", status: detail.status,
      error: "상세 API가 200을 반환하지 않았습니다.", detailResponse: detail.text
    };
  }

  const article = parseJson(detail.text, `${guName} 상세`);
  await writeFile(rawPath, detail.text, "utf8");
  return {
    slug,
    guName,
    eid: article.eid || choice.item.eid || "",
    headword: article.headword || choice.item.headword || "",
    bodyLength: String(article.body || "").length,
    hasDongSection: String(article.body || "").includes("# 동(洞)"),
    lastModifiedTime: article.lastModifiedTime || "",
    fetchedAt: new Date().toISOString(),
    cached: false,
    success: true,
    choiceRule: choice.rule
  };
}

await mkdir(RAW_DIR, { recursive: true });
try {
  for (const [guName, meta] of Object.entries(SEOUL_SLUGS)) {
    const entry = await collectOne(guName, meta);
    index.push(entry);
    const marker = entry.success ? "OK" : "FAIL";
    console.log(`${marker}\t${guName}\t${meta.slug}\t${entry.eid || "-"}\t${entry.bodyLength ?? "-"}\t${entry.hasDongSection ?? "-"}`);
    await saveIndex();
  }
} finally {
  await saveIndex();
}

const okCount = index.filter((entry) => entry.success).length;
const failCount = index.length - okCount;
const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`SUMMARY\tsuccess=${okCount}/25\tfail=${failCount}\trequests=${requestCount}\telapsedSeconds=${elapsedSeconds}`);
