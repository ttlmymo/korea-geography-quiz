// 공부 카드의 '이름 이야기' 한 줄(/data/story.json — 앱이 공부·둘러보기를 열 때 한 번 받는다, 부팅 때는 받지 않음).
// 원문 확인을 마친 소개 글(reviewed)에서만 고른다: 서울 구(seoul-intro) · 시·군·구(intro-kr) · 시·도 허브(region-hub-intro). 고르는 규칙은 lib/story.ts
// page = 그곳 소개 쪽(기준 경로 뒤, 한국어 주소). 둘러보기 카드의 '자세히 읽기'가 쓴다(영어 화면은 앞에 en/)
import type { APIRoute } from 'astro';
import { INTROS } from '../../data/seoul-intro';
import { INTROS_KR, INTROS_EN, hubIntroOf } from '../../data/region-intro';
import { UNITS } from '../../lib/geo';
import { SIDOS } from '../../app/sidos';
import { buildStories, type StoryIn } from '../../lib/story';

export const GET: APIRoute = () => {
  const placeOf = new Map<string, { key: string; slug: string }>();
  for (const r of UNITS.regions) for (const it of r.items) placeOf.set(it.id, { key: r.key, slug: it.slug });
  const en = new Map(INTROS_EN.map((x) => [x.id, x.paras]));
  const list: StoryIn[] = [];
  for (const x of [...INTROS, ...INTROS_KR]) {
    if (!x.reviewed) continue;
    const p = placeOf.get(x.id);
    list.push({ id: x.id, ko: x.paras, en: en.get(x.id) ?? null, ...(p ? { page: `${p.key}/${p.slug}/` } : {}) });
  }
  for (const s of SIDOS) {
    const h = hubIntroOf(s.key);
    if (h?.reviewed && h.en) list.push({ id: `kr:sido:${s.code}`, ko: h.paras, en: h.en.paras, page: `${s.key}/` });
  }
  return new Response(JSON.stringify({ v: 1, items: buildStories(list) }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
