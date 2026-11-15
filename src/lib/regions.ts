// 정적 쪽 틀(계획서 E9 · 6절 W1): 정적 쪽이 지역 목록을 쪽마다 박지 않고 지역 표(src/data/sido.json)에서 읽는다(3절 6).
// 이 파일은 순수 함수만 둔다(Astro 없이 노드 시험이 바로 부른다 — 불러오기에 확장자를 붙인다).
//  - 공개 지역(status live)의 이름 묶음: 홈·영문 홈·소개 쪽 description
//  - 허브 쪽(hub 가 있는 지역): 사이트맵·머리글 '지역 지도' 표시·404 갈 곳(점검기 tools/check.mjs 의 광고 자리도 같은 칸을 읽는다)
//  - 곳 id → 주소 이름(slug): 영어 정적 쪽의 곳 이름
import { SIDOS, type SidoRow } from '../app/sidos.ts';

/**
 * 5곳 이상일 때 이름을 쓰는 앞 세 지역: 공개 차례(지역 표 openOrder — 홈 탭 빈자리·다 채움 단추와 같은 차례, app/sidos.ts byOpenOrder 와 같은 규칙).
 * 행이 가진 openOrder 를 본다(시험이 넘긴 행 그대로). 지역 표 차례로 고르면 E12 에서 '서울·부산·대구'가 되어 E11 설명에 있던 인천·경기가 빠졌다(E12 검수)
 */
const firstThree = (rows: SidoRow[]) =>
  rows.map((s, i) => ({ s, i, r: s.openOrder ?? Number.MAX_SAFE_INTEGER })).sort((a, b) => a.r - b.r || a.i - b.i).slice(0, 3).map((o) => o.s);

/** 공개 지역(지역 표 status live). 차례는 표 차례 = 시·도 코드 차례(서울 11 · 인천 28 · 경기 41) */
export const LIVE: SidoRow[] = SIDOS.filter((s) => s.status === 'live');
/** 정적 허브 쪽(/{key}/)이 있는 지역(표 차례). 영어 허브는 hub.en 이 있는 지역만(서울) */
export const HUBS: SidoRow[] = SIDOS.filter((s) => s.hub);

/** 'A', 'A and B', 'A, B and C' */
export const listEn = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/**
 * 공부할 수 있는 지역 이름 묶음(한국어). 홈 탭처럼 4곳까지는 이름을 다 쓴다(N22 — 지역 표 차례).
 * '서울·인천·경기' · 5곳 이상 앞 셋은 공개 차례 '서울·인천·경기 등 8개 시·도' · 모두 열면 '전국 16개 시·도'
 */
export function scopeKo(rows: SidoRow[] = LIVE, all = SIDOS.length): string {
  if (!rows.length) throw new Error('공개 지역(지역 표 status live)이 없음');
  if (rows.length === all) return `전국 ${all}개 시·도`;
  if (rows.length <= 4) return rows.map((s) => s.ko).join('·');
  return `${firstThree(rows).map((s) => s.ko).join('·')} 등 ${rows.length}개 시·도`;
}

/**
 * 홈·소개 쪽 description 의 공부 범위(계획서 E10 완료 조건 6): 공개 지역의 시·군·구에, 시·도 단원(korea)이 열렸으면 '전국 16개 시·도'를 더한다.
 * korea 는 판 units.json 에 korea 가 있을 때(지역 표 korea.status live 면 파이프라인이 싣는다 — 부르는 쪽이 넘긴다).
 * '서울·인천·경기의 시·군·구' · '서울·인천·경기의 시·군·구와 전국 16개 시·도' · 모두 열면 '전국 16개 시·도와 시·군·구'.
 * 뒤에 붙는 조사는 '를'(구·도 모두 받침 없음). 영어 묶음(scopeEn)에는 시·도 단원을 넣지 않는다 — 2026-11-16 영어 앱에도 시·도 단원이 열렸지만(설계안 EN_EMD D98)
 * 한국어 설명과 같게 공부 범위만 쓴다(모두 열리면 'all 16 provinces and cities of Korea')
 */
export function studyKo(korea: boolean, rows: SidoRow[] = LIVE, all = SIDOS.length): string {
  const sgg = `${scopeKo(rows, all)}의 시·군·구`;
  if (!korea) return sgg;
  return rows.length === all ? `전국 ${all}개 시·도와 시·군·구` : `${sgg}와 전국 ${all}개 시·도`;
}

/**
 * 같은 묶음(영어). 영어 화면은 영어 이름을 확인한 지역만 보인다(enChecked, N26) — 확인하지 않은 지역은 이름도 수도 넣지 않는다(과 없는 지역도 센다 — EN_EMD).
 * 'Seoul, Incheon and Gyeonggi' · 5곳 이상 앞 셋은 공개 차례 'Seoul, Incheon, Gyeonggi and 4 more regions' · 모두 'all 16 provinces and cities of Korea'
 */
export function scopeEn(rows: SidoRow[] = LIVE, all = SIDOS.length): string {
  // 과 없는 지역(layer emd — 세종·제주, N4)도 센다: 2026-11-16 영어 앱에 동 단원이 열려(설계안 EN_EMD) 영어 앱도 싣는다. 전에는(N26, E12) 영어 앱이 동을 읽지 않아 뺐다
  const en = rows.filter((s) => s.enChecked);
  if (!en.length) throw new Error('영어로 보일 공개 지역이 없음');
  if (en.length === all) return `all ${all} provinces and cities of Korea`;
  if (en.length <= 4) return listEn(en.map((s) => s.en));
  return `${firstThree(en).map((s) => s.en).join(', ')} and ${en.length - 3} more regions`;
}

/** 허브 쪽 주소의 첫 마디인가('/seoul/'·'/incheon/x/' → true). 머리글이 지금 쪽을 '지역 지도'로 굵게 할 때 */
export function hubPathRe(rows: SidoRow[] = HUBS): RegExp {
  return rows.length ? new RegExp(`^/(${rows.map((s) => s.key).join('|')})(/|$)`) : /$^/;
}

/** 이름 파일(src/data/search-sgg.json) 한 줄 */
export interface Named { id: string; ko: string; kind: string; region: string }
/** 원고(src/data/units.json)에서 쓰는 칸 */
export interface SlugSource { regions: { key: string; slugs: Record<string, string> }[]; generalGu?: Record<string, string> }

/**
 * 곳 id → slug(계획서 E9: id 기준). 원고의 '이름 → slug' 를 그 지역 안의 이름으로 곳 id 에 잇는다.
 * 이름만으로 찾으면 중구·동구·서구·남구·북구·강서구·고성군처럼 여러 지역에 있는 이름이 서로 덮어쓴다(2.3절, 26곳).
 * 일반구('수원시 장안구'처럼 시 이름을 붙인 이름)는 지역 칸 없이 적혀 있어 전국에서 하나여야 한다.
 * 같은 id 에 다른 slug 가 오거나, 한 지역 안에 같은 이름이 둘이면 빌드를 멈춘다
 */
export function slugMapOf(src: SlugSource, names: Named[]): Map<string, string> {
  const m = new Map<string, string>();
  const put = (id: string, sl: string) => {
    const was = m.get(id);
    if (was !== undefined && was !== sl) throw new Error(`곳 ${id} 의 slug 가 둘: ${was} · ${sl}`);
    m.set(id, sl);
  };
  const named = names.filter((s) => s.kind !== 'emd');
  for (const r of src.regions) {
    for (const [ko, sl] of Object.entries(r.slugs)) {
      const hit = named.filter((s) => s.region === r.key && s.ko === ko);
      if (hit.length > 1) throw new Error(`${r.key} 안에 '${ko}' 가 ${hit.length}곳(${hit.map((s) => s.id).join(', ')})`);
      for (const s of hit) put(s.id, sl);
    }
  }
  for (const [ko, sl] of Object.entries(src.generalGu ?? {})) {
    if (ko === '_note') continue;
    const hit = named.filter((s) => s.kind === 'sgg' && s.ko === ko);
    if (hit.length > 1) throw new Error(`일반구 이름 '${ko}' 가 ${hit.length}곳(${hit.map((s) => s.id).join(', ')}) — 지역을 붙여 적어야 함`);
    for (const s of hit) put(s.id, sl);
  }
  return m;
}

/** 주소 이름 → 영어 이름: 'mapo-gu' → 'Mapo-gu', 'goyang-si-deogyang-gu' → 'Goyang-si Deogyang-gu' */
export function enOfSlug(sl: string): string {
  const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
  const m = /^(.+?-si)-(.+)$/.exec(sl);
  return m ? `${cap(m[1])} ${cap(m[2])}` : cap(sl);
}
