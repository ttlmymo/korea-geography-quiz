// 정적 쪽 점검 규칙(계획서 E9 · 6절 W1 · 3절 7). tools/check.mjs 가 dist 에 쓰고, tests/unit/site-rules.test.ts 가 나쁜 예로 시험한다.
// 모두 순수 함수다(파일을 읽거나 쓰지 않는다). 규칙마다 실패 글 목록을 돌려준다.
//  - 새 색인 쪽 상한: 운영 기준 목록(tests/indexed-pages.json)에 없는 색인 쪽이 한 배포에 NEW_INDEX_MAX 개를 넘으면 실패, 기준 목록의 쪽이 빠져도 실패.
//    새 색인 쪽은 한국어로만(3절 7 · 6절 W2 · N26 '새 영어 정적 쪽은 만들지 않음') — /en/ 주소이거나 쪽 말이 ko 가 아니면 실패
//  - lastmod 내용 기준: 쪽 내용(제목·설명·본문)이 기준과 다르면 lastmod 가 기준보다 늦어야 하고, 같으면 lastmod 도 같아야 한다.
//    새 쪽(기준에 없음)은 lastmod 가 기준 목록의 가장 늦은 날보다 이르면 실패(쪽을 만든 날 대신 기본값 DEFAULT_UPDATED 가 나간 것).
//    방침 두 쪽은 lastmod = 본문 시행일이다(effectiveOf) — 본문을 고쳤으면 시행일도 내보내는 날로 늦춰야 한다
//  - hreflang 짝: 짝 쪽이 있고(색인 쪽), 서로 같은 짝 목록을 가리키고, 자기 주소를 자기 말로 넣고, 짝 쪽의 말이 hreflang 과 같다
//  - 틀 문장 비율: 새 쪽에서, 다른 쪽과 이름·숫자만 바꾼 문장(같은 틀)이 본문의 TEMPLATE_MAX 를 넘으면 실패(기존 쪽은 재기만 한다)
import crypto from 'node:crypto';

/** 한 배포에 새로 내는 색인 쪽 상한(3절 7 · N25) */
// 기본 5. 한 번에 많이 낼 때(사용자 결정)만 환경변수 KGQ_NEW_INDEX_MAX 로 올린다 — 2026-11-19 전국 시·군·구 쪽 204곳을 한 번에 냈다(WORKLOG)
export const NEW_INDEX_MAX = 5;
export const newIndexMax = () => Number(process.env.KGQ_NEW_INDEX_MAX) || NEW_INDEX_MAX;
/** 새 쪽의 틀 문장 비율 상한 [제안] — 본문 글자의 절반 넘게 다른 쪽과 같은 틀이면 '자동으로 찍어 낸 쪽'으로 본다 */
export const TEMPLATE_MAX = 0.5;

const strip = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '');
const mainOf = (html) => strip((html.match(/<main[^>]*>([\s\S]*?)<\/main>/) || [, ''])[1]);
const plain = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim();

/** 본문 문장 = 블록 요소 하나의 글(15자 이상). 점검기 5(본문 글자 수·겹치는 문장)와 같은 자르기 */
export function blocksOf(html) {
  return [...mainOf(html).matchAll(/<(p|li|td|dd|dt|h1|h2|h3|figcaption)[^>]*>([\s\S]*?)<\/\1>/g)]
    .map((m) => plain(m[2])).filter((t) => t.length >= 15);
}

const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1];
/** 쪽 머리와 본문 */
export function factsOf(html) {
  const htmlTag = (html.match(/<html[^>]*>/) || [''])[0];
  const links = [...html.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]);
  return {
    lang: attr(htmlTag, 'lang') || '',
    noindex: /<meta name="robots" content="[^"]*noindex/.test(html),
    title: (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '',
    desc: (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '',
    alternates: links.filter((l) => attr(l, 'rel') === 'alternate' && attr(l, 'hreflang')).map((l) => ({ lang: attr(l, 'hreflang'), href: attr(l, 'href') || '' })),
    text: plain(mainOf(html)),
    blocks: blocksOf(html),
  };
}

/**
 * 쪽 내용의 지문: 제목·설명·본문 글(태그·스크립트·그림 뺌). 데이터 판 이름(kr-20261001.2)은 지운다 —
 * 판 이름만 바뀐 것은 검색에 알릴 내용 변화가 아니다(바닥글·출처 줄에 판 이름이 있다)
 */
export function contentHash(f) {
  const norm = (s) => s.replace(/kr-\d{8}\.\d+/g, 'kr-판');
  return crypto.createHash('sha1').update(`${norm(f.title)}\n${norm(f.desc)}\n${norm(f.text)}`).digest('hex').slice(0, 16);
}

/** 운영 기준 목록 파일 → Map(path → { lastmod, hash }) */
export const baseMap = (baseline) => new Map(baseline.pages.map((p) => [p.path, p]));

/**
 * 새 색인 쪽 상한과 빠진 쪽. indexable: 이번 빌드의 색인 쪽 주소(기준 경로 없이).
 * langOf(path → html lang)를 주면 새 쪽이 한국어인지도 본다(주지 않아도 /en/ 주소는 잡는다)
 */
export function checkNewIndex(indexable, baseline, { max = newIndexMax(), langOf } = {}) {
  const base = baseMap(baseline);
  const now = new Set(indexable);
  const added = [...now].filter((p) => !base.has(p)).sort();
  const removed = [...base.keys()].filter((p) => !now.has(p));
  const errors = [];
  if (added.length > max) errors.push(`새 색인 쪽 ${added.length}개 — 한 배포에 ${max}개까지(정적 쪽은 사람이 검수한 고유 본문이 있을 때만, 묶음으로 나눠 낸다): ${added.join(' ')}`);
  for (const p of removed) errors.push(`운영 기준 목록의 색인 쪽이 빠짐 ${p} (주소가 사라지거나 noindex 가 됨)`);
  // 2026-11-19 사용자 결정 '한국어가 있는 쪽은 영어도 전부'로 새 영어 쪽을 허용한다(N26 폐지). 말은 주소와 맞아야 한다:
  // /en/ 주소의 새 쪽은 쪽 말이 en, 그 밖의 새 쪽은 ko
  for (const p of added) {
    const lang = langOf?.get(p);
    const isEn = /^\/en(\/|$)/.test(p);
    if (lang !== undefined && lang !== (isEn ? 'en' : 'ko')) errors.push(`${p}: 새 색인 쪽의 말(lang ${lang || '?'})이 주소와 맞지 않음 — /en/ 주소는 en, 그 밖은 ko`);
  }
  return { added, removed, errors };
}

/** 방침 두 쪽: 사이트맵 lastmod = 본문 시행일(consts PRIVACY_EFFECTIVE). 날짜는 내보내는 날에만 정할 수 있다 */
export const POLICY_PATHS = ['/privacy.html', '/privacy-en.html'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
/** 방침 본문 글에서 시행일('시행일: 2026년 11월 14일' · 'Effective date: November 14, 2026') → '2026-11-14', 없으면 null */
export function effectiveOf(text) {
  const ko = /시행일\s*:?\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/.exec(text);
  if (ko) return ymd(ko[1], ko[2], ko[3]);
  const en = /Effective date\s*:?\s*([A-Z][a-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(text);
  if (en && MONTHS.includes(en[1])) return ymd(en[3], MONTHS.indexOf(en[1]) + 1, en[2]);
  return null;
}

/**
 * lastmod 내용 기준. entries: 사이트맵 [{ path, lastmod }], hashOf: path → 이번 빌드 내용 지문.
 * 기준 목록에 있는 쪽만 본다(새 쪽은 checkNewLastmod)
 */
export function checkLastmod(entries, hashOf, baseline) {
  const base = baseMap(baseline);
  const errors = [];
  for (const { path, lastmod } of entries) {
    const b = base.get(path);
    if (!b) continue;
    const h = hashOf.get(path);
    const hint = POLICY_PATHS.includes(path) ? '방침은 내보내는 날 src/consts.ts PRIVACY_EFFECTIVE(시행일)를 그날로' : '고친 날을 src/lib/pages.ts UPDATED 에';
    if (h !== b.hash && !(lastmod > b.lastmod)) errors.push(`${path}: 내용이 운영 기준과 다른데 lastmod ${lastmod} 가 기준 ${b.lastmod} 보다 늦지 않음 — ${hint}`);
    if (h === b.hash && lastmod !== b.lastmod) errors.push(`${path}: 내용은 운영 기준과 같은데 lastmod 가 ${b.lastmod} → ${lastmod} 로 바뀜`);
  }
  return errors;
}

/**
 * 새 쪽(기준 목록에 없음)의 lastmod: 기준 목록의 가장 늦은 lastmod 보다 이르면 실패.
 * 운영에 나간 뒤에 만든 쪽이니 그보다 이를 수 없다(같은 날은 허용 — 배포한 날 다시 내보낼 수 있다).
 * pages.ts 의 at() 은 UPDATED 에 날짜가 없으면 DEFAULT_UPDATED 를 쓰므로, 새 허브(W2)를 내며 날짜를 빠뜨리면 여기서 잡힌다
 */
export function checkNewLastmod(entries, baseline) {
  const base = baseMap(baseline);
  const floor = baseline.pages.reduce((m, p) => (p.lastmod > m ? p.lastmod : m), '');
  return entries.filter((e) => !base.has(e.path) && e.lastmod < floor)
    .map((e) => `${e.path}: 새 색인 쪽인데 lastmod ${e.lastmod} 가 운영 기준 목록의 가장 늦은 날 ${floor} 보다 이름 — 쪽을 만든 날을 src/lib/pages.ts UPDATED 에`);
}

/**
 * hreflang 짝. pages: path → { lang, noindex, alternates }. site: 'https://…', base: 기준 경로('' 또는 '/x').
 * 한 쪽이 짝을 알리면 그 짝들이 모두 같은 목록을 알려야 한다(서로 가리킴). x-default 는 짝 가운데 하나여야 한다
 */
export function checkHreflang(pages, site, base = '') {
  const errors = [];
  const pathOf = (href) => {
    let u;
    try { u = new URL(href); } catch { return null; }
    if (u.origin !== site || !(u.pathname === base || u.pathname.startsWith(base + '/'))) return null;
    return u.pathname.slice(base.length) || '/';
  };
  const key = (alts) => alts.map((a) => `${a.lang} ${a.href}`).sort().join('\n');
  let pairs = 0;
  for (const [p, f] of pages) {
    const alts = f.alternates || [];
    if (!alts.length) continue;
    const langs = alts.map((a) => a.lang);
    for (const l of new Set(langs)) if (langs.filter((x) => x === l).length > 1) errors.push(`${p}: hreflang ${l} 가 둘`);
    const self = alts.find((a) => a.lang !== 'x-default' && pathOf(a.href) === p);
    if (!self) errors.push(`${p}: hreflang 목록에 자기 주소가 없음`);
    else if (self.lang !== f.lang) errors.push(`${p}: 자기 주소의 hreflang ${self.lang} 가 쪽 말(lang ${f.lang})과 다름`);
    const xd = alts.find((a) => a.lang === 'x-default');
    if (xd && !alts.some((a) => a.lang !== 'x-default' && a.href === xd.href)) errors.push(`${p}: x-default 가 짝 가운데 하나가 아님 (${xd.href})`);
    for (const a of alts) {
      if (a.lang === 'x-default') continue;
      const q = pathOf(a.href);
      if (q === p) continue;
      const g = q === null ? undefined : pages.get(q);
      if (!g) { errors.push(`${p}: hreflang ${a.lang} 의 짝 쪽이 빌드에 없음 (${a.href})`); continue; }
      if (g.noindex && !f.noindex) errors.push(`${p}: hreflang ${a.lang} 의 짝 ${q} 가 색인하지 않는 쪽`);
      if (g.lang !== a.lang) errors.push(`${p}: hreflang ${a.lang} 짝 ${q} 의 쪽 말이 ${g.lang || '(없음)'}`);
      if (key(g.alternates || []) !== key(alts)) errors.push(`${p}: 짝 ${q} 가 같은 hreflang 목록으로 되돌아 가리키지 않음(짝 없는 hreflang)`);
      else pairs++;
    }
  }
  return { errors, pairs };
}

/* ---------- 틀 문장 비율 ---------- */
// 문장을 낱말로 나눈다(숫자는 0 으로, 문장 부호는 띄어쓰기로). 한국어는 이름에 조사가 붙어 낱말 하나가 통째로 바뀐다
export const wordsOf = (s) => s.replace(/[0-9]+/g, '0').replace(/[.,·:;!?()'"“”‘’[\]<>/\\~–—-]/g, ' ').replace(/\s+/g, ' ').trim().split(' ');
/** 같은 틀: 낱말 수가 같고 다른 자리가 1/3 이하(세 낱말 미만이면 모두 같아야) — 이름·숫자만 바꾼 문장 */
export function sameFrame(a, b) {
  if (a.length !== b.length) return false;
  const allow = a.length >= 3 ? Math.max(1, Math.floor(a.length / 3)) : 0;
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++diff > allow) return false;
  return true;
}

/**
 * 쪽마다 틀 문장 비율(0~1): 본문 글자 가운데, 다른 쪽에 같은 틀 문장이 있는 문장의 글자 몫.
 * bodies: path → 문장 목록(blocksOf)
 */
export function templateRatios(bodies) {
  const byLen = new Map();   // 낱말 수 → [{ page, w }]
  const parsed = new Map();
  for (const [p, list] of bodies) {
    const ws = list.map((t) => ({ t, w: wordsOf(t) }));
    parsed.set(p, ws);
    for (const { w } of ws) {
      if (!byLen.has(w.length)) byLen.set(w.length, []);
      byLen.get(w.length).push({ page: p, w });
    }
  }
  const out = new Map();
  for (const [p, ws] of parsed) {
    let total = 0, tpl = 0;
    for (const { t, w } of ws) {
      total += t.length;
      if ((byLen.get(w.length) || []).some((o) => o.page !== p && sameFrame(w, o.w))) tpl += t.length;
    }
    out.set(p, total ? tpl / total : 0);
  }
  return out;
}

/** 새 쪽(기준 목록에 없는 색인 쪽)에만 상한을 적용한다 */
export function checkTemplate(ratios, newPaths, max = TEMPLATE_MAX) {
  const errors = [];
  for (const p of newPaths) {
    const r = ratios.get(p) ?? 0;
    if (r > max) errors.push(`${p}: 새 쪽인데 다른 쪽과 같은 틀 문장이 본문의 ${Math.round(r * 100)}% (상한 ${Math.round(max * 100)}% — 사람이 쓴 고유 본문이 필요)`);
  }
  return errors;
}
