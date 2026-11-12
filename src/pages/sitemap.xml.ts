// 사이트맵: 서치콘솔에 제출한 주소(/sitemap.xml)를 그대로 쓴다. lastmod 는 쪽을 실제로 고친 날
import type { APIRoute } from 'astro';
import { SEOUL_GU } from '../data/seoul';
import { DEFAULT_UPDATED } from '../consts';
import { visibleGuides } from '../guides/registry';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

// 색인할 쪽 목록. 새 쪽을 만들면 여기에 더한다(tools/check.mjs 가 dist 의 색인 쪽과 1:1 인지 검사)
// 가이드는 검수한 글만(검수 전 초안은 noindex)
const GUIDES = visibleGuides().filter((g) => g.reviewed);

const PAGES: { path: string; updated?: string }[] = [
  { path: '/' }, { path: '/en/' },
  { path: '/seoul/' }, { path: '/en/seoul/' },
  ...SEOUL_GU.flatMap((g) => [{ path: `/seoul/${g.slug}/` }, { path: `/en/seoul/${g.slug}/` }]),
  { path: '/incheon/' }, { path: '/gyeonggi/' },
  ...(GUIDES.length ? [{ path: '/guide/' }, ...GUIDES.map((g) => ({ path: `/guide/${g.slug}/`, updated: g.updated }))] : []),
  { path: '/about/' }, { path: '/contact/' }, { path: '/sources/' },
  { path: '/privacy.html' }, { path: '/privacy-en.html' },
];

export const GET: APIRoute = ({ site }) => {
  const urls = PAGES.map((p) => {
    const loc = new URL(BASE + p.path, site).href;
    return `  <url><loc>${loc}</loc><lastmod>${p.updated ?? DEFAULT_UPDATED}</lastmod></url>`;
  }).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
