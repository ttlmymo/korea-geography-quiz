// 글꼴 CSS 만들기: @fontsource/ibm-plex-sans-kr 의 굵기별 CSS 에서 woff2 조각만 남겨 src/styles/fonts.css 로 묶는다.
// 조각은 글자 범위(unicode-range)별로 나뉘어 있어 방문자는 그 쪽에 나오는 글자의 조각만 받는다.
// 굵기를 바꾸거나 패키지를 올렸을 때만 다시 돌린다:  node tools/fonts.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG = path.join(ROOT, 'node_modules', '@fontsource', 'ibm-plex-sans-kr');
const OUT = path.join(ROOT, 'src', 'styles', 'fonts.css');
const WEIGHTS = [400, 600, 700];
// fonts.css 에서 본 조각 파일의 상대 경로(Vite 가 따라가서 dist/_astro 로 내보낸다)
const REL = '../../node_modules/@fontsource/ibm-plex-sans-kr/files/';

const ver = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8')).version;
const out = [
  `/* 만든 파일 — 손으로 고치지 않는다. tools/fonts.mjs 가 @fontsource/ibm-plex-sans-kr ${ver} 에서 만든다.`,
  `   IBM Plex Sans KR (SIL Open Font License 1.1), 굵기 ${WEIGHTS.join('·')}, woff2 조각만 */`,
];
let blocks = 0;
for (const w of WEIGHTS) {
  const css = fs.readFileSync(path.join(PKG, `${w}.css`), 'utf8');
  for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = m[1];
    const file = body.match(/url\(\.\/files\/([^)]+\.woff2)\)/)?.[1];
    const range = body.match(/unicode-range:\s*([^;]+);/)?.[1];
    if (!file || !range) throw new Error(`조각을 읽지 못함(굵기 ${w}): ${body.slice(0, 80)}`);
    if (!fs.existsSync(path.join(PKG, 'files', file))) throw new Error(`조각 파일 없음: ${file}`);
    out.push(`@font-face{font-family:'IBM Plex Sans KR';font-style:normal;font-display:swap;font-weight:${w};src:url(${REL}${file}) format('woff2');unicode-range:${range.replace(/\s+/g, '')}}`);
    blocks += 1;
  }
}
fs.writeFileSync(OUT, out.join('\n') + '\n');
console.log(`fonts.css: 조각 ${blocks}개(굵기 ${WEIGHTS.length}), ${fs.statSync(OUT).size} 바이트`);
