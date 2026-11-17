// 공유 그림(og:image) 만들기: 전국 시·도 지도(홈 시안처럼 시·도 단원 1과 다 익힘·익히는 중, 2과 익히는 중, 3과 '다음 과' 노랑) + 사이트 이름·한 줄 소개, 한·영 1200×630 JPG.
// 루트 랜딩(ttlmymo.github.io)이 옛 주소 social-image/og-image-ko.jpg 를 직접 부르므로 같은 주소에 둔다.
// node tools/og-image.mjs → public/social-image/og-image-{ko,en}.jpg (한 번 돌리고 결과를 커밋한다. 빌드 때 돌지 않음)
// 그리기는 이 PC 의 Edge 머리 없는 모드, JPG 바꾸기는 Windows PowerShell(System.Drawing). 바깥에서 받는 것은 없다:
// 글꼴은 저장소의 @fontsource/ibm-plex-sans-kr 조각 가운데 그림에 쓰인 글자가 든 조각만 data: 로 넣는다.
// 모양(합본 2026-11-13): 흰 바탕 · 먹 글자 · 지도 바탕 면색 · 굵은 바깥선 · 먹 1px 칸 경계 · 1px 틀(각진 모서리)
// (E17 전국 마무리) 세 지역(서울 지도 + '서울 25 · 인천 11 · 경기 31')에서 전국으로 바꿨다:
//  - 지도: 판 sido.topo.json(전국 시·도 지도 — 지역 고르기와 같은 파일·같은 범위 KOREA_FIT)
//  - 개수 줄: 홈 검색 설명과 같은 범위 말(src/lib/regions.ts — 한국어 studyKo, 영어 scopeEn). 영어는 영어 이름을 확인한 지역만(N26)
//    2026-11-16 영어 동 공부(설계안 docs/EN_EMD_PLAN_2026-11-16.md D107): 영어 앱에도 동이 열려 영어 덧말 '· down to neighborhoods'(한국어 '· 읍·면·동까지'와 같게),
//    범위 말은 세종·제주도 세어 'all 16 provinces and cities of Korea'
//  - 한국어는 열여섯을 모두 열었을 때의 글만 그린다(일부만 열린 판이면 글 모양을 새로 정해야 하므로 멈춘다)
// (E17 검수) 그림에 박은 개수 줄을 tools/og-image.text.json 에 함께 쓴다. 이 도구는 빌드 때 돌지 않아, 지역 표가 바뀌면(예: 전남광주 enChecked 를 켜면
//  영어 설명이 '… and 11 more regions'가 됨) 그림만 옛 글로 남는다. 시험 tests/unit/og-text.test.ts 가 이 파일을 지금 범위 말과 견줘 다시 돌리라고 알린다
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { LIVE, scopeEn, studyKo } from '../src/lib/regions.ts';
import { SIDOS } from '../src/app/sidos.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const topo = require('topojson-client');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const work = path.join(root, '.cache/og');
const out = path.join(root, 'public/social-image');
fs.mkdirSync(work, { recursive: true });
fs.mkdirSync(out, { recursive: true });

const ver = fs.readdirSync(path.join(root, 'public/data/geo')).sort().at(-1);
const units = JSON.parse(fs.readFileSync(path.join(root, `public/data/geo/${ver}/units.json`), 'utf8'));
const sido = JSON.parse(fs.readFileSync(path.join(root, `public/data/geo/${ver}/sido.topo.json`), 'utf8'));
if (!units.korea) throw new Error('판에 시·도 단원(korea)이 없음 — 전국 지도 그림의 칠할 과를 정할 수 없음');
if (LIVE.length !== SIDOS.length) throw new Error(`공개 지역 ${LIVE.length}/${SIDOS.length}곳 — 일부만 열린 판의 개수 줄 모양은 새로 정해야 함`);

// 색(src/styles/tokens.css 와 같은 값)
// sea = 바다(--map-sea, 2026-11-17), bg = 이웃 땅(북한·일본 — --map-out)
const C = { ink: '#15191A', ink2: '#454D50', ink3: '#5F686B', bg: '#EFF1EE', sea: '#A3CDF2', frame: '#C9CFCB', m3: '#0D7B50', learning: '#7FD0A8', next: '#FFD84A', white: '#FFFFFF' };
// 홈 시안(다음 과 날)과 같은 칠을 시·도 단원 과에: 1과 = 익히는 중(그 가운데 앞 두 곳은 다 익힘), 2과 = 익히는 중, 3과 = 다음 과(노랑 + 굵은 테두리), 4·5과 = 아직
const fillOf = new Map();
units.korea.lessons.forEach((l, i) => l.items.forEach((id, j) => fillOf.set(id, i === 0 ? (j < 2 ? C.m3 : C.learning) : i === 1 ? C.learning : i === 2 ? C.next : C.white)));
const nextIds = new Set(units.korea.lessons[2].items);

const TEXT = {
  // 개수 줄 = 굵은 범위 말(count) + 옅은 덧말(pre 는 앞, unit 은 뒤)
  ko: { name: '채움지도', tag: ['백지도 퀴즈로 익히는', '대한민국 행정구역'], pre: '', count: studyKo(true), unit: '· 읍·면·동까지' },
  en: { name: 'Fill the<br>Map', tag: ["Learn Korea's administrative", 'regions on a blank map'], pre: 'Districts of', count: scopeEn(), unit: '· down to neighborhoods' },
};

// 글꼴: 굵기별 CSS 의 조각 가운데 이 그림의 글자를 하나라도 담은 조각만(unicode-range 로 고른다)
const PKG = path.join(root, 'node_modules/@fontsource/ibm-plex-sans-kr');
const used = new Set([...Object.values(TEXT).flatMap((t) => [t.name.replace(/<br>/g, ' '), ...t.tag, t.pre, t.count, t.unit]).join('')].map((ch) => ch.codePointAt(0)));
const inRange = (range) => range.split(',').some((part) => {
  const [a, b] = part.trim().replace(/^U\+/i, '').split('-').map((h) => parseInt(h, 16));
  for (const cp of used) if (cp >= a && cp <= (b ?? a)) return true;
  return false;
});
const fontCss = [400, 600, 700].flatMap((w) => [...fs.readFileSync(path.join(PKG, `${w}.css`), 'utf8').matchAll(/@font-face\s*\{([^}]*)\}/g)].flatMap((m) => {
  const file = m[1].match(/url\(\.\/files\/([^)]+\.woff2)\)/)?.[1];
  const range = m[1].match(/unicode-range:\s*([^;]+);/)?.[1];
  if (!file || !range || !inRange(range)) return [];
  const data = fs.readFileSync(path.join(PKG, 'files', file)).toString('base64');
  return [`@font-face{font-family:'IBM Plex Sans KR';font-weight:${w};font-style:normal;src:url(data:font/woff2;base64,${data}) format('woff2');unicode-range:${range.replace(/\s+/g, '')}}`];
})).join('\n');
if (!fontCss) throw new Error('글꼴 조각을 찾지 못함');

// 지도: 앱과 같은 투영(경도에 cos 37.5° — src/app/map 의 등장방형).
// 2026-11-17 사용자 결정('공유 그림에도 바다를 표현, 울릉도·독도처럼 육지에서 멀어 육지가 작게 보이게 만드는 섬은 사각형 틀에 넣어 확대 표시'):
//  - 바탕은 바다색, 이웃 땅(판 sido.topo.json out = 북한 · far = 일본 등)은 면색
//  - 본 지도 범위는 본토·제주와 가까운 섬(흑산·가거도·연평도까지). 전에는 지역 고르기와 같은 범위(KOREA_FIT 124.61~131.87 — 백령도에서 독도까지)라 본토가 지도 칸 폭의 절반쯤이었다
//  - 범위를 넓히던 먼 섬 셋은 본 지도에서 빼고 상자에: 백령·대청·소청도(인천), 울릉도·독도(경북). 상자마다 제 축척(본 지도보다 크게)
const FIT = [125.0, 33.05, 131.0, 38.65];
const KX = Math.cos((37.5 * Math.PI) / 180);
const S = 1000 / ((FIT[2] - FIT[0]) * KX);
const px = ([lon, lat]) => `${(((lon - FIT[0]) * KX) * S).toFixed(1)},${((FIT[3] - lat) * S).toFixed(1)}`;
/** 상자에 넣는 먼 섬(경도·위도 범위): 본 지도에서는 이 범위에 온전히 든 조각을 뺀다 */
const FAR = [
  { key: 'baengnyeong', sido: '28', box: [124.58, 37.74, 124.80, 38.00] },   // 백령·대청·소청도
  { key: 'ulleung', sido: '47', box: [130.76, 37.44, 130.95, 37.57] },       // 울릉도
  { key: 'dokdo', sido: '47', box: [131.853, 37.232, 131.882, 37.250] },     // 독도(동도·서도)
];
const polysOf = (geom) => (geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : []);
const inBox = (pl, b) => pl[0].every(([x, y]) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]);
const dPolys = (polys, f = px) => polys.map((pl) => pl.map((r) => `M${r.map(f).join('L')}Z`).join('')).join('');
const cells = sido.objects.sido.geometries.map((g) => {
  const polys = polysOf(topo.feature(sido, g).geometry);
  const far = FAR.filter((F) => F.sido === g.properties.sido);
  return { id: g.properties.id, sido: g.properties.sido, polys, d: dPolys(polys.filter((pl) => !far.some((F) => inBox(pl, F.box)))) };
});
if (cells.some((c) => !fillOf.has(c.id))) throw new Error('전국 지도 칸 가운데 시·도 단원 과에 없는 칸이 있음');
// 층마다 따로 그린다(far 에도 북한이 들어 있어 out 과 한 path 로 이으면 감는 방향이 달라 겹친 곳이 비어 보였다)
const landD = ['far', 'out'].flatMap((k) => (sido.objects[k] ? sido.objects[k].geometries.map((g) => dPolys(polysOf(topo.feature(sido, g).geometry))) : []));
if (!landD.length) throw new Error('판 전국 지도에 이웃 땅(out·far)이 없음 — 바다와 이웃 땅을 나눠 칠할 수 없음');
const W = 1000, H = Math.round((FIT[3] - FIT[1]) * S);
const edge = Math.round(W * 0.03);
const vb = [-edge, -edge, W + 2 * edge, H + 2 * edge];
const MAP_H = 566, MAP_W = Math.round((MAP_H * vb[2]) / vb[3]);
const nextD = cells.filter((c) => nextIds.has(c.id)).map((c) => c.d).join('');
// 먼 섬 상자: 지도 칸 안의 자리(px — 왼쪽 위 기준)와 크기. 서해 북쪽 구석에 백령도, 동해에 울릉도(위)·독도(아래). 섬은 상자에 가득(여백 14%)
const K = MAP_W / vb[2];                                         // 본 지도 px/단위
const at = (lon, lat) => [(((lon - FIT[0]) * KX) * S - vb[0]) * K, ((FIT[3] - lat) * S - vb[1]) * K];
const BOX = { baengnyeong: { at: at(125.02, 38.60), w: 78, h: 84 }, ulleung: { at: at(130.02, 38.02), w: 86, h: 72 }, dokdo: { at: [at(130.02, 38.02)[0], at(130.02, 38.02)[1] + 72 + 8], w: 86, h: 58 } };
const insets = FAR.map((F) => {
  const c = cells.find((x) => x.sido === F.sido), o = BOX[F.key];
  const polys = c.polys.filter((pl) => inBox(pl, F.box));
  if (!polys.length) throw new Error(`먼 섬 ${F.key}: 판 전국 지도에 그 섬 조각이 없음`);
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const pl of polys) for (const [x, y] of pl[0]) b = [Math.min(b[0], x * KX), Math.min(b[1], -y), Math.max(b[2], x * KX), Math.max(b[3], -y)];
  const k = Math.min(o.w / (b[2] - b[0]), o.h / (b[3] - b[1])) * 0.72;                 // px/도(투영한) — 섬이 상자의 72%
  const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
  const f = ([lon, lat]) => `${((lon * KX - cx) * k + o.w / 2).toFixed(1)},${((-lat - cy) * k + o.h / 2).toFixed(1)}`;
  return { key: F.key, x: Math.round(o.at[0]), y: Math.round(o.at[1]), w: o.w, h: o.h, d: dPolys(polys, f), fill: fillOf.get(c.id), next: nextIds.has(c.id), zoom: k / (S * K) };
});

const page = (t, lang) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
${fontCss}
html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:${C.white};font-family:'IBM Plex Sans KR',sans-serif;color:${C.ink};word-break:keep-all}
.txt{position:absolute;left:64px;top:0;bottom:0;width:${1200 - 64 - 48 - MAP_W - 40}px;display:flex;flex-direction:column;justify-content:center;gap:22px}
.mark{width:56px;height:56px;margin-bottom:2px}
h1{margin:0;font-size:${lang === 'ko' ? 104 : 92}px;line-height:1.05;font-weight:700;letter-spacing:-0.035em}
p{margin:0;font-size:${lang === 'ko' ? 34 : 28}px;line-height:1.35;font-weight:600;color:${C.ink2};letter-spacing:-0.01em}
.row{margin-top:6px;padding-top:16px;border-top:2px solid ${C.ink};font-size:${lang === 'ko' ? 23 : 20}px;line-height:1.4;font-weight:600;text-wrap:balance}
.unit{font-weight:400;color:${C.ink3}}
.map{position:absolute;right:48px;top:${Math.round((630 - MAP_H) / 2)}px;width:${MAP_W}px;height:${MAP_H}px;outline:1px solid ${C.frame};outline-offset:-1px;background:${C.sea};overflow:hidden}
.far{position:absolute;box-sizing:border-box;border:1px solid ${C.ink};background:${C.sea}}
.far svg{display:block;width:100%;height:100%}
svg.m{display:block;width:100%;height:100%}
svg.m path{vector-effect:non-scaling-stroke;stroke-linejoin:round}
</style></head><body>
<div class="txt">
<svg class="mark" viewBox="0 0 24 24" fill="none" stroke="${C.ink}" stroke-width="1.6" stroke-linejoin="round"><path d="M9 9.5 15 11.5v5l-6-2z" fill="${C.learning}" stroke="none"/><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/></svg>
<h1>${t.name}</h1><p>${t.tag.join('<br>')}</p>
<div class="row">${t.pre ? `<span class="unit">${t.pre}</span> ` : ''}${t.count}${t.unit ? ` <span class="unit">${t.unit}</span>` : ''}</div></div>
<div class="map"><svg class="m" viewBox="${vb.join(' ')}" xmlns="http://www.w3.org/2000/svg">
<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="${C.sea}"/>
${landD.map((d) => `<path d="${d}" fill="${C.bg}" stroke="none"/>`).join('')}
<path d="${cells.map((c) => c.d).join('')}" fill="none" stroke="${C.ink}" stroke-width="2.4"/>
${cells.map((c) => `<path d="${c.d}" fill="${fillOf.get(c.id)}" stroke="${C.ink}" stroke-width="1"/>`).join('\n')}
<path d="${nextD}" fill="none" stroke="${C.ink}" stroke-width="2.4"/>
</svg>
${insets.map((i) => `<div class="far" style="left:${i.x}px;top:${i.y}px;width:${i.w}px;height:${i.h}px"><svg viewBox="0 0 ${i.w} ${i.h}" xmlns="http://www.w3.org/2000/svg"><path d="${i.d}" fill="${i.fill}" stroke="${C.ink}" stroke-width="${i.next ? 2 : 1.2}" stroke-linejoin="round"/></svg></div>`).join('\n')}
</div></body></html>`;

for (const lang of ['ko', 'en']) {
  const html = path.join(work, `og-${lang}.html`);
  const png = path.join(work, `og-${lang}.png`);
  const jpg = path.join(out, `og-image-${lang}.jpg`);
  fs.writeFileSync(html, page(TEXT[lang], lang));
  fs.rmSync(png, { force: true });
  // 글꼴(data:)이 다 읽힐 시간을 준다
  execFileSync(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1200,630', '--virtual-time-budget=5000',
    `--user-data-dir=${path.join(work, 'edge')}`, `--screenshot=${png}`, 'file:///' + html.replace(/\\/g, '/')], { stdio: 'ignore' });
  // Edge 가 다른 머리 없는 Edge 가 떠 있는 PC 에서는 그림을 다 쓰기 전에 돌아온다(2026-11-16 — 그림이 몇 초 뒤에 생김). 그림 크기가 멈출 때까지 기다린다(최대 30초)
  for (let i = 0, last = -1; i < 150; i++) {
    const size = fs.existsSync(png) ? fs.statSync(png).size : -1;
    if (size > 0 && size === last) break;
    last = size;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
  }
  const ps = `Add-Type -AssemblyName System.Drawing; $i=[System.Drawing.Image]::FromFile('${png}'); ` +
    `$c=[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders()|?{$_.MimeType -eq 'image/jpeg'}; ` +
    `$p=New-Object System.Drawing.Imaging.EncoderParameters(1); $p.Param[0]=New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality,[long]88); ` +
    `$i.Save('${jpg}',$c,$p); $w=$i.Width; $h=$i.Height; $i.Dispose(); "$w x $h"`;
  const size = execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim();
  if (size !== '1200 x 630') throw new Error(`${lang}: 그림 크기 ${size}`);
  console.log(`${path.relative(root, jpg)} ${size} ${fs.statSync(jpg).size}B · ${[TEXT[lang].pre, TEXT[lang].count, TEXT[lang].unit].filter(Boolean).join(' ')}`);
}
console.log(`지도 칸 ${MAP_W}x${MAP_H} · 먼 섬 상자 ${insets.map((i) => `${i.key} ${i.w}x${i.h} 본 지도의 ${i.zoom.toFixed(1)}배`).join(' · ')}`);
// 그림에 박은 글(개수 줄)을 남긴다 — 그림과 함께 커밋한다
const sidecar = path.join(root, 'tools/og-image.text.json');
fs.writeFileSync(sidecar, JSON.stringify({
  note: 'node tools/og-image.mjs 가 쓴다 — public/social-image/og-image-{ko,en}.jpg 에 박힌 개수 줄. 손으로 고치지 않는다(tests/unit/og-text.test.ts 가 지금 범위 말과 견줌)',
  ver,
  ko: { pre: TEXT.ko.pre, count: TEXT.ko.count, unit: TEXT.ko.unit },
  en: { pre: TEXT.en.pre, count: TEXT.en.count, unit: TEXT.en.unit },
}, null, 2) + '\n');
console.log(path.relative(root, sidecar));
