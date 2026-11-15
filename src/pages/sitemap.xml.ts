// 사이트맵: 서치콘솔에 제출한 주소(/sitemap.xml)를 그대로 쓴다. 쪽 목록과 lastmod(내용 기준 — 쪽을 실제로 고친 날)는 src/lib/pages.ts.
// 허브는 지역 표(src/data/sido.json hub)에서 읽는다(계획서 E9). tools/check.mjs 가 dist 의 색인 쪽과 1:1 인지, 운영 기준 목록과 맞는지 본다
import type { APIRoute } from 'astro';
import { indexPages } from '../lib/pages';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export const GET: APIRoute = ({ site }) => {
  const urls = indexPages().map((p) => {
    const loc = new URL(BASE + p.path, site).href;
    return `  <url><loc>${loc}</loc><lastmod>${p.updated}</lastmod></url>`;
  }).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
