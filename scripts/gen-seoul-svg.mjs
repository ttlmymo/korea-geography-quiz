/* 루트 index.html의 서울 자치구 소개 섹션에서는 지도를 출력하지 않는다.
   스크립트가 실행돼도 기존에 생성된 지도 마커와 내용만 안전하게 제거한다. */
import { readFile, writeFile } from "node:fs/promises";

const ROOT = "index.html";
const START = "<!-- GEN:SEOULMAP:START -->";
const END = "<!-- GEN:SEOULMAP:END -->";
const markerRe = /(\s*<!-- GEN:SEOULMAP:START -->)[\s\S]*?(<!-- GEN:SEOULMAP:END -->\s*)/;

let out = await readFile(ROOT, "utf8");
const hadMap = markerRe.test(out);
out = out.replace(markerRe, "\n");

if (out.includes("<!-- GEN:SEOULMAP:START -->") || out.includes("<!-- GEN:SEOULMAP:END -->")) {
  throw new Error("루트 서울 소개 지도 마커 제거 실패");
}
if (!out.includes('data-i18n="link.seoulPrompt"') || !out.includes('data-i18n="link.seoulCta"')) {
  throw new Error("서울 소개 상세 링크 보존 실패");
}
if (!out.includes("<!-- GEN:GUIDE:START -->") || !out.includes("<!-- GEN:GUIDE:END -->")) {
  throw new Error("GEN:GUIDE 마커 보존 실패");
}
if (!out.includes("<!-- GEN:HEAD:START -->") || !out.includes("<!-- GEN:HEAD:END -->")) {
  throw new Error("GEN:HEAD 마커 보존 실패");
}

await writeFile(ROOT, out, "utf8");
console.log(hadMap ? "✓ 루트 서울 자치구 소개 지도 제거 완료" : "✓ 루트 서울 자치구 소개 지도 없음 확인");
