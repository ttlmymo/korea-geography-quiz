// robots.txt: 도메인 바로 아래에 둔다(옛 github.io 에서는 루트 랜딩 저장소의 몫이었다). 검색 로봇에게 사이트맵 주소를 알린다
import type { APIRoute } from 'astro';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL(BASE + '/sitemap.xml', site).href;
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${sitemap}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
