// 공유 그림(og:image) 만들기: 서울 지도(홈 시안처럼 1과 다 익힘·익히는 중, 2과 익히는 중, 3과 '다음 과' 노랑) + 사이트 이름·한 줄 소개, 한·영 1200×630 JPG.
// 루트 랜딩(ttlmymo.github.io)이 옛 주소 social-image/og-image-ko.jpg 를 직접 부르므로 같은 주소에 둔다.
// node tools/og-image.mjs → public/social-image/og-image-{ko,en}.jpg (한 번 돌리고 결과를 커밋한다. 빌드 때 돌지 않음)
// 그리기는 이 PC 의 Edge 머리 없는 모드, JPG 바꾸기는 Windows PowerShell(System.Drawing). 바깥에서 받는 것은 없다:
// 글꼴은 저장소의 @fontsource/ibm-plex-sans-kr 조각 가운데 그림에 쓰인 글자가 든 조각만 data: 로 넣는다.
// 모양(합본 2026-11-13): 흰 바탕 · 먹 글자 · 지도 바탕 면색 · 굵은 지역 외곽선 · 먹 1px 칸 경계 · 1px 틀(각진 모서리)
// 개수 줄은 한 줄로(영어는 단위 'districts' 가 둘째 줄로 떨어지지 않게 20px)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const work = path.join(root, '.cache/og');
const out = path.join(root, 'public/social-image');
fs.mkdirSync(work, { recursive: true });
fs.mkdirSync(out, { recursive: true });

const svg = JSON.parse(fs.readFileSync(path.join(root, 'src/data/svg/seoul.json'), 'utf8'));
const ver = fs.readdirSync(path.join(root, 'public/data/geo')).sort().at(-1);
const units = JSON.parse(fs.readFileSync(path.join(root, `public/data/geo/${ver}/units.json`), 'utf8'));
const count = (key) => units.regions.find((r) => r.key === key).items.length;
const seoul = units.regions.find((r) => r.key === 'seoul');

// 색(src/styles/tokens.css 와 같은 값)
const C = { ink: '#15191A', ink2: '#454D50', ink3: '#5F686B', bg: '#EFF1EE', water: '#BEDCF3', frame: '#C9CFCB', m3: '#0D7B50', learning: '#7FD0A8', next: '#FFD84A', white: '#FFFFFF' };
// 홈 시안(다음 과 날)과 같은 칠: 1과 = 익히는 중(그 가운데 앞 두 곳은 다 익힘), 2과 = 익히는 중, 3과 = 다음 과(노랑 + 굵은 테두리), 4·5과 = 아직
const fillOf = new Map();
seoul.lessons.forEach((l, i) => l.items.forEach((id, j) => fillOf.set(id, i === 0 ? (j < 2 ? C.m3 : C.learning) : i === 1 ? C.learning : i === 2 ? C.next : C.white)));
const nextIds = new Set(seoul.lessons[2].items);

const TEXT = {
  ko: { name: '채움지도', tag: ['백지도 퀴즈로 익히는', '대한민국 행정구역'], count: `서울 ${count('seoul')} · 인천 ${count('incheon')} · 경기 ${count('gyeonggi')}`, unit: '시·군·구' },
  en: { name: 'Fill the<br>Map', tag: ["Learn Korea's administrative", 'regions on a blank map'], count: `Seoul ${count('seoul')} · Incheon ${count('incheon')} · Gyeonggi ${count('gyeonggi')}`, unit: 'districts' },
};

// 글꼴: 굵기별 CSS 의 조각 가운데 이 그림의 글자를 하나라도 담은 조각만(unicode-range 로 고른다)
const PKG = path.join(root, 'node_modules/@fontsource/ibm-plex-sans-kr');
const used = new Set([...Object.values(TEXT).flatMap((t) => [t.name.replace(/<br>/g, ' '), ...t.tag, t.count, t.unit]).join('')].map((ch) => ch.codePointAt(0)));
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

// 지도: 정적 지도(RegionMap)와 같은 층 — 바탕 → 이웃 땅 → 강 → 굵은 외곽선(칸이 안쪽 반을 덮는다) → 칸(먹 1px) → 다음 과 굵은 테두리. 가장자리 여백 2.2%
const edge = Math.round(svg.w * 0.022);
const vb = [-edge, -edge, svg.w + 2 * edge, svg.h + 2 * edge];
const MAP_W = 600, MAP_H = Math.round((MAP_W * vb[3]) / vb[2]);
const nextD = svg.items.filter((it) => nextIds.has(it.id)).map((it) => it.d).join('');

const page = (t, lang) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
${fontCss}
html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:${C.white};font-family:'IBM Plex Sans KR',sans-serif;color:${C.ink};word-break:keep-all}
.txt{position:absolute;left:64px;top:0;bottom:0;width:${1200 - 64 - 48 - MAP_W - 40}px;display:flex;flex-direction:column;justify-content:center;gap:22px}
.mark{width:56px;height:56px;margin-bottom:2px}
h1{margin:0;font-size:${lang === 'ko' ? 104 : 92}px;line-height:1.05;font-weight:700;letter-spacing:-0.035em}
p{margin:0;font-size:${lang === 'ko' ? 34 : 28}px;line-height:1.35;font-weight:600;color:${C.ink2};letter-spacing:-0.01em}
.row{margin-top:6px;padding-top:16px;border-top:2px solid ${C.ink};font-size:${lang === 'ko' ? 24 : 20}px;line-height:1.4;font-weight:600;white-space:nowrap}
.unit{font-weight:400;color:${C.ink3}}
.map{position:absolute;right:48px;top:${Math.round((630 - MAP_H) / 2)}px;width:${MAP_W}px;height:${MAP_H}px;outline:1px solid ${C.frame};outline-offset:-1px;background:${C.bg}}
svg.m{display:block;width:100%;height:100%}
svg.m path{vector-effect:non-scaling-stroke;stroke-linejoin:round}
</style></head><body>
<div class="txt">
<svg class="mark" viewBox="0 0 24 24" fill="none" stroke="${C.ink}" stroke-width="1.6" stroke-linejoin="round"><path d="M9 9.5 15 11.5v5l-6-2z" fill="${C.learning}" stroke="none"/><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/></svg>
<h1>${t.name}</h1><p>${t.tag.join('<br>')}</p>
<div class="row">${t.count} <span class="unit">${t.unit}</span></div></div>
<div class="map"><svg class="m" viewBox="${vb.join(' ')}" xmlns="http://www.w3.org/2000/svg">
<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="${C.bg}"/>
<path d="${svg.out}" fill="${C.bg}"/>
<path d="${svg.water}" fill="${C.water}"/>
<path d="${svg.items.map((it) => it.d).join('')}" fill="none" stroke="${C.ink}" stroke-width="3.6"/>
${svg.items.map((it) => `<path d="${it.d}" fill="${fillOf.get(it.id) ?? C.white}" stroke="${C.ink}" stroke-width="1.1"/>`).join('\n')}
<path d="${nextD}" fill="none" stroke="${C.ink}" stroke-width="2.6"/>
</svg></div></body></html>`;

for (const lang of ['ko', 'en']) {
  const html = path.join(work, `og-${lang}.html`);
  const png = path.join(work, `og-${lang}.png`);
  const jpg = path.join(out, `og-image-${lang}.jpg`);
  fs.writeFileSync(html, page(TEXT[lang], lang));
  fs.rmSync(png, { force: true });
  // 글꼴(data:)이 다 읽힐 시간을 준다
  execFileSync(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1200,630', '--virtual-time-budget=5000',
    `--user-data-dir=${path.join(work, 'edge')}`, `--screenshot=${png}`, 'file:///' + html.replace(/\\/g, '/')], { stdio: 'ignore' });
  const ps = `Add-Type -AssemblyName System.Drawing; $i=[System.Drawing.Image]::FromFile('${png}'); ` +
    `$c=[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders()|?{$_.MimeType -eq 'image/jpeg'}; ` +
    `$p=New-Object System.Drawing.Imaging.EncoderParameters(1); $p.Param[0]=New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality,[long]88); ` +
    `$i.Save('${jpg}',$c,$p); $w=$i.Width; $h=$i.Height; $i.Dispose(); "$w x $h"`;
  const size = execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim();
  if (size !== '1200 x 630') throw new Error(`${lang}: 그림 크기 ${size}`);
  console.log(`${path.relative(root, jpg)} ${size} ${fs.statSync(jpg).size}B`);
}
