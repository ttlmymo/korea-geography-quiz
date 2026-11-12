// 공유 그림(og:image) 만들기: 서울 지도를 과 차례로 칠한 그림 + 사이트 이름·한 줄 소개, 한·영 1200×630 JPG.
// 루트 랜딩(ttlmymo.github.io)이 옛 주소 social-image/og-image-ko.jpg 를 직접 부르므로 같은 주소에 둔다.
// node tools/og-image.mjs → public/social-image/og-image-{ko,en}.jpg (한 번 돌리고 결과를 커밋한다. 빌드 때 돌지 않음)
// 그리기는 이 PC 의 Edge 머리 없는 모드, JPG 바꾸기는 Windows PowerShell(System.Drawing)
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
// 과 차례로 진하게: 1과 다 익힘, 2과 칠함 2, 3과 칠함 1, 4·5과는 아직(그 가운데 하나는 '찾을 곳')
const FILL = ['#22663F', '#9ACF84', '#D9EBA9', '#FFFDF8', '#FFFDF8'];
const fillOf = new Map();
seoul.lessons.forEach((l, i) => l.items.forEach((id) => fillOf.set(id, FILL[i] ?? '#FFFDF8')));
fillOf.set(seoul.lessons[3].items[0], '#FFD43B');

const TEXT = {
  ko: { name: '채움지도', tag: ['백지도 퀴즈로 익히는', '대한민국 행정구역'], count: `서울 ${count('seoul')} · 인천 ${count('incheon')} · 경기 ${count('gyeonggi')}`, unit: '시·군·구' },
  en: { name: 'Fill the<br>Map', tag: ["Learn Korea's administrative", 'regions on a blank map'], count: `Seoul ${count('seoul')} · Incheon ${count('incheon')} · Gyeonggi ${count('gyeonggi')}`, unit: 'districts' },
};

const page = (t, lang) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#F7F3EA;font-family:'Noto Sans KR','Malgun Gothic',sans-serif;color:#26231E}
.txt{position:absolute;left:64px;top:0;bottom:0;width:470px;display:flex;flex-direction:column;justify-content:center;gap:26px}
h1{margin:0;font-size:${lang === 'ko' ? 112 : 100}px;line-height:1.05;font-weight:900;letter-spacing:-0.02em}
p{margin:0;font-size:${lang === 'ko' ? 38 : 34}px;line-height:1.35;font-weight:700;color:#4F483F}
.row{margin-top:6px;font-size:26px;line-height:1.4;font-weight:700;color:#4F483F}
.unit{font-weight:500;color:#6E665A}
.map{position:absolute;right:44px;top:50px;width:580px;height:530px;border-radius:28px;overflow:hidden;border:2px solid #D8CFBD}
svg{display:block;width:100%;height:100%}
</style></head><body>
<div class="txt"><h1>${t.name}</h1><p>${t.tag.join('<br>')}</p>
<div class="row">${t.count} <span class="unit">${t.unit}</span></div></div>
<div class="map"><svg viewBox="0 0 ${svg.w} ${svg.h}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
<path d="${svg.out}" fill="#E4DDCE" stroke="#C9BFAC" stroke-width="1.5"/>
${svg.items.map((it) => `<path d="${it.d}" fill="${fillOf.get(it.id) ?? '#FFFDF8'}" stroke="#8C806B" stroke-width="2.2" stroke-linejoin="round"/>`).join('\n')}
<path d="${svg.water}" fill="#CADDE8" stroke="#8C806B" stroke-width="1.2"/>
</svg></div></body></html>`;

for (const lang of ['ko', 'en']) {
  const html = path.join(work, `og-${lang}.html`);
  const png = path.join(work, `og-${lang}.png`);
  const jpg = path.join(out, `og-image-${lang}.jpg`);
  fs.writeFileSync(html, page(TEXT[lang], lang));
  execFileSync(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1200,630',
    `--user-data-dir=${path.join(work, 'edge')}`, `--screenshot=${png}`, 'file:///' + html.replace(/\\/g, '/')], { stdio: 'ignore' });
  const ps = `Add-Type -AssemblyName System.Drawing; $i=[System.Drawing.Image]::FromFile('${png}'); ` +
    `$c=[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders()|?{$_.MimeType -eq 'image/jpeg'}; ` +
    `$p=New-Object System.Drawing.Imaging.EncoderParameters(1); $p.Param[0]=New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality,[long]88); ` +
    `$i.Save('${jpg}',$c,$p); $w=$i.Width; $h=$i.Height; $i.Dispose(); "$w x $h"`;
  const size = execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim();
  if (size !== '1200 x 630') throw new Error(`${lang}: 그림 크기 ${size}`);
  console.log(`${path.relative(root, jpg)} ${size} ${fs.statSync(jpg).size}B`);
}
