// 해시 경로(설계서 7.3). 홈 문서 하나 안에서 화면을 바꾼다. '#/'로 시작하지 않는 조각(로그인 토큰 #access_token=…)은 건드리지 않는다

export type Route =
  | { name: 'home' }
  | { name: 'regions' }
  | { name: 'unit'; region: string }
  | { name: 'lesson'; region: string; no: number }
  | { name: 'place'; region: string; slug: string }   // 바깥·공유 링크: 그곳이 든 과의 시작 카드
  | { name: 'mix'; region: string }
  | { name: 'check'; region: string }
  | { name: 'explore'; region: string; slug: string | null }
  | { name: 'review' }
  | { name: 'rank' };

/** 경로가 가리키는 지역·과·곳이 있는지 묻는다(색인에서) */
export interface Known {
  region(key: string): boolean;
  lesson(region: string, no: number): boolean;
  slug(region: string, slug: string): boolean;
}

export interface Parsed {
  route: Route;
  /** null 이 아니면 주소를 pathname + fix 로 바꾼다(replaceState): 모르는 경로 → 홈, 옛 ?region= → #/kr/{지역} */
  fix: string | null;
}

const HOME: Route = { name: 'home' };

function dec(s: string): string | null {
  try { return decodeURIComponent(s); } catch { return null; }
}

function match(parts: string[], k: Known): Route | null {
  const [a, region, b, c, ...rest] = parts;
  if (a === 'review' && parts.length === 1) return { name: 'review' };
  if (a === 'rank' && parts.length === 1) return { name: 'rank' };
  if (a !== 'kr') return null;
  if (parts.length === 1) return { name: 'regions' };
  if (!k.region(region)) return null;
  if (parts.length === 2) return { name: 'unit', region };
  if (b === 'mix' && parts.length === 3) return { name: 'mix', region };
  if (b === 'check' && parts.length === 3) return { name: 'check', region };
  if (b === 'explore' && parts.length <= 4) {
    if (c === undefined) return { name: 'explore', region, slug: null };
    return k.slug(region, c) ? { name: 'explore', region, slug: c } : null;
  }
  if (b === 'sgg' && parts.length === 4 && !rest.length) {
    const p = /^p([1-9]\d{0,2})$/.exec(c);
    if (p) return k.lesson(region, Number(p[1])) ? { name: 'lesson', region, no: Number(p[1]) } : null;
    if (c.startsWith('@') && k.slug(region, c.slice(1))) return { name: 'place', region, slug: c.slice(1) };
  }
  return null;  // 동 단원(#/kr/{지역}/emd/…)은 P1
}

export function parseRoute(hash: string, search: string, k: Known): Parsed {
  if (!hash.startsWith('#/')) {
    const q = new URLSearchParams(search);
    const legacy = q.get('region');
    if (legacy !== null) {
      q.delete('region');
      const rest = q.toString();
      const route: Route = k.region(legacy) ? { name: 'unit', region: legacy } : HOME;
      return { route, fix: (rest ? `?${rest}` : '') + (route.name === 'unit' ? toHash(route) : hash) };
    }
    return { route: HOME, fix: null };
  }
  const parts = hash.slice(2).split('/').filter(Boolean).map(dec);
  if (parts.some((p) => p === null)) return { route: HOME, fix: search };
  if (!parts.length) return { route: HOME, fix: null };
  const route = match(parts as string[], k);
  return route ? { route, fix: null } : { route: HOME, fix: search };
}

export function toHash(r: Route): string {
  switch (r.name) {
    case 'home': return '';
    case 'regions': return '#/kr';
    case 'unit': return `#/kr/${r.region}`;
    case 'lesson': return `#/kr/${r.region}/sgg/p${r.no}`;
    case 'place': return `#/kr/${r.region}/sgg/@${r.slug}`;
    case 'mix': return `#/kr/${r.region}/mix`;
    case 'check': return `#/kr/${r.region}/check`;
    case 'explore': return `#/kr/${r.region}/explore${r.slug ? `/${r.slug}` : ''}`;
    case 'review': return '#/review';
    case 'rank': return '#/rank';
  }
}
