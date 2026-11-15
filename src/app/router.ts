// 해시 경로(설계서 7.3). 홈 문서 하나 안에서 화면을 바꾼다. '#/'로 시작하지 않는 조각(로그인 토큰 #access_token=…)은 건드리지 않는다.
// 동 단원(계획서 E5): #/kr/{지역}/emd = 구 고르기, #/kr/{지역}/emd/{단원 slug} = 단원 쪽, 그 아래 /p{n}·/mix·/check·/explore[/{동 slug}]·/@{동 slug}.
// 동 단원 경로의 region 에는 단원 키('{지역}/{단원 slug}', seoul/jongno-gu)가 들어가 지역 경로와 같은 이름(unit·lesson·…)을 쓴다.
// 동 색인(units.json emdUnits)이 없는 지역의 동 주소는 지금처럼 홈으로 보낸다.
// 일반구 단원(계획서 N5 · E7): #/kr/{지역}/gu 와 그 아래(동 단원과 같은 마디). region 에는 단원 키('{지역}/gu')가 들어간다

export type Route =
  | { name: 'home' }
  | { name: 'regions' }
  | { name: 'unit'; region: string }                 // 지역 또는 동 단원 키
  | { name: 'emd'; region: string }                  // 구 고르기(그 지역의 동 단원 목록)
  | { name: 'lesson'; region: string; no: number }
  | { name: 'place'; region: string; slug: string }   // 바깥·공유 링크: 그곳이 든 과의 시작 카드
  | { name: 'mix'; region: string }
  | { name: 'check'; region: string }
  | { name: 'explore'; region: string; slug: string | null }
  | { name: 'review' }
  | { name: 'rank' };

/** 경로가 가리키는 지역·과·곳이 있는지 묻는다(색인에서). lesson·slug 의 region 은 동 단원 키일 수도 있다(단원 파일을 받기 전에는 동 색인으로 판정) */
export interface Known {
  region(key: string): boolean;
  lesson(region: string, no: number): boolean;
  slug(region: string, slug: string): boolean;
  /** 그 지역에 동 단원이 있나(동 색인). 없으면(동 공개 전·동을 끈 창) 동 주소는 홈으로 */
  emd?(region: string): boolean;
  /** 동 단원 키('{지역}/{단원 slug}')가 동 색인에 있나 */
  unit?(key: string): boolean;
  /** 과 없는 지역(세종·제주, 계획서 N4 · E8)인가: 지역 주소(구 고르기)와 /emd 만 열고, 지역 과·전체 연습·시험·둘러보기 주소는 홈으로 */
  main?(key: string): boolean;
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

/** 동 단원 아래 경로: [] 단원 쪽 · [mix] · [check] · [explore(, 동 slug)] · [p{n}] · [@{동 slug}] */
function matchUnit(key: string, rest: string[], k: Known): Route | null {
  const [b, c] = rest;
  if (!rest.length) return { name: 'unit', region: key };
  if (b === 'mix' && rest.length === 1) return { name: 'mix', region: key };
  if (b === 'check' && rest.length === 1) return { name: 'check', region: key };
  if (b === 'explore' && rest.length <= 2) {
    if (c === undefined) return { name: 'explore', region: key, slug: null };
    return k.slug(key, c) ? { name: 'explore', region: key, slug: c } : null;
  }
  if (rest.length !== 1) return null;
  const p = /^p([1-9]\d{0,2})$/.exec(b);
  if (p) return k.lesson(key, Number(p[1])) ? { name: 'lesson', region: key, no: Number(p[1]) } : null;
  if (b.startsWith('@') && k.slug(key, b.slice(1))) return { name: 'place', region: key, slug: b.slice(1) };
  return null;
}

function match(parts: string[], k: Known): Route | null {
  const [a, region, b, c, ...rest] = parts;
  if (a === 'review' && parts.length === 1) return { name: 'review' };
  if (a === 'rank' && parts.length === 1) return { name: 'rank' };
  if (a !== 'kr') return null;
  if (parts.length === 1) return { name: 'regions' };
  if (!k.region(region)) return null;
  if (parts.length === 2) return { name: 'unit', region };
  if (b === 'emd') {
    if (!k.emd?.(region)) return null;
    if (parts.length === 3) return { name: 'emd', region };
    const key = `${region}/${c}`;
    // 일반구 단원(gu)은 #/kr/{지역}/gu 로만(같은 단원에 주소가 둘이 되지 않게)
    return c !== 'gu' && k.unit?.(key) ? matchUnit(key, rest, k) : null;
  }
  // 일반구 단원(계획서 N5 · E7): #/kr/{지역}/gu 와 그 아래 /p{n}·/mix·/check·/explore[/{slug}]·/@{slug}. 단원이 없으면(일반구를 끈 창·지역 표 gu off) 홈으로
  if (b === 'gu') {
    const key = `${region}/gu`;
    return k.unit?.(key) ? matchUnit(key, parts.slice(3), k) : null;
  }
  if (k.main?.(region)) return null;
  if (b === 'mix' && parts.length === 3) return { name: 'mix', region };
  if (b === 'check' && parts.length === 3) return { name: 'check', region };
  if (b === 'explore' && parts.length <= 4) {
    if (c === undefined) return { name: 'explore', region, slug: null };
    return k.slug(region, c) ? { name: 'explore', region, slug: c } : null;
  }
  // 과·곳 주소의 층 마디: 지역은 /sgg, 시·도 단원(korea)은 /sido
  if (b === (region === 'korea' ? 'sido' : 'sgg') && parts.length === 4 && !rest.length) {
    const p = /^p([1-9]\d{0,2})$/.exec(c);
    if (p) return k.lesson(region, Number(p[1])) ? { name: 'lesson', region, no: Number(p[1]) } : null;
    if (c.startsWith('@') && k.slug(region, c.slice(1))) return { name: 'place', region, slug: c.slice(1) };
  }
  return null;
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

/** 지역 키는 그대로, 동 단원 키(seoul/jongno-gu)는 seoul/emd/jongno-gu, 일반구 단원 키(gyeonggi/gu)는 그대로 gyeonggi/gu */
const at = (key: string) => (/^[a-z-]+\/gu$/.test(key) ? key : key.replace('/', '/emd/'));
/** 과·곳 주소의 층 마디: 지역은 /sgg, 시·도 단원은 /sido(#/kr/korea/sido/p1, E8), 동 단원은 없음(#/kr/seoul/emd/jongno-gu/p1) */
const layerOf = (key: string) => (key.includes('/') ? '' : key === 'korea' ? '/sido' : '/sgg');

export function toHash(r: Route): string {
  switch (r.name) {
    case 'home': return '';
    case 'regions': return '#/kr';
    case 'unit': return `#/kr/${at(r.region)}`;
    case 'emd': return `#/kr/${r.region}/emd`;
    case 'lesson': return `#/kr/${at(r.region)}${layerOf(r.region)}/p${r.no}`;
    case 'place': return `#/kr/${at(r.region)}${layerOf(r.region)}/@${r.slug}`;
    case 'mix': return `#/kr/${at(r.region)}/mix`;
    case 'check': return `#/kr/${at(r.region)}/check`;
    case 'explore': return `#/kr/${at(r.region)}/explore${r.slug ? `/${r.slug}` : ''}`;
    case 'review': return '#/review';
    case 'rank': return '#/rank';
  }
}
