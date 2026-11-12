// 채움지도: 정적 쪽은 Astro 로 만들고, 공부 앱은 홈 문서 안의 해시 경로(#/kr/...)로 돈다
import fs from 'node:fs';
import { defineConfig } from 'astro/config';
import { SITE, BASE } from './site.config.mjs';

// 지도 실험실(src/lab/map.astro)·기기 점검(src/lab/device.astro)은 개발 서버에만 붙인다. 빌드 결과(배포)에는 들어가지 않는다
const REPORTS = new URL('./.cache/device/reports.jsonl', import.meta.url);
const labInDev = {
  name: 'chaeum-lab',
  hooks: {
    'astro:config:setup': ({ command, injectRoute }) => {
      if (command !== 'dev') return;
      injectRoute({ pattern: '/lab/map', entrypoint: './src/lab/map.astro' });
      injectRoute({ pattern: '/lab/device', entrypoint: './src/lab/device.astro' });
    },
    // 실기기 점검(설계서 12 S11): 휴대폰이 devLog(src/app/devlog.ts)로 보낸 기록을 한 줄씩 남긴다. 요약은 tools/device-report.mjs
    'astro:server:setup': ({ server }) => {
      // 이 단계의 req.url 이 기준 경로를 뗀 것인지 아닌지에 기대지 않으려고 끝만 본다
      server.middlewares.use((req, res, next) => {
        if (!(req.url ?? '').split('?')[0].endsWith('/__report')) { next(); return; }
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (c) => { if (body.length < 20000) body += c; });
        req.on('end', () => {
          try {
            const rec = { at: new Date().toISOString(), ua: req.headers['user-agent'] ?? '', ...JSON.parse(body) };
            fs.mkdirSync(new URL('.', REPORTS), { recursive: true });
            fs.appendFileSync(REPORTS, JSON.stringify(rec) + '\n');
            res.statusCode = 204;
          } catch { res.statusCode = 400; }
          res.end();
        });
      });
    },
  },
};

export default defineConfig({
  site: SITE,
  base: BASE,
  integrations: [labInDev],
  // 개발 도구 막대는 휴대폰 화면 아래(시트·버튼 자리)를 가려서 끈다
  devToolbar: { enabled: false },
  trailingSlash: 'ignore',
  // 'preserve': src/pages/privacy.astro → /privacy.html, src/pages/seoul/index.astro → /seoul/ (옛 주소 그대로)
  build: { format: 'preserve' },
});
