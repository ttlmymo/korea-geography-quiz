// 측정(설계서 9): GA4 이벤트. 이름은 0단계 것을 이어 쓰고 값은 매개변수로 보낸다.
// 공통 매개변수: country 'kr', lang, data_ver, (있으면) region(slug). GA 는 배포 빌드에만 실리므로(Base.astro),
// 로컬에서는 gtag 가 없어 아무것도 보내지 않는다. 확인용으로 마지막 50개를 window.__kgqEvents 에 남긴다
import { devLog } from './devlog.ts';

type Value = string | number;
type Params = Record<string, Value | boolean | null | undefined>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    __kgqEvents?: [string, Record<string, Value>][];
  }
}

let common: Record<string, Value> = { country: 'kr' };

export function initAnalytics(lang: string, dataVer: string) {
  common = { country: 'kr', lang: lang === 'en' ? 'en' : 'ko', data_ver: dataVer };
}

/** 참·거짓은 1·0 으로(0단계 correct 와 같게), 빈 값은 뺀다 */
function clean(p: Params): Record<string, Value> {
  const out: Record<string, Value> = {};
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = typeof v === 'boolean' ? (v ? 1 : 0) : v;
  }
  return out;
}

export function track(name: string, params: Params = {}) {
  const p = { ...common, ...clean(params) };
  try {
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') window.gtag('event', name, p);
  } catch { /* 측정 실패는 앱에 영향 없음 */ }
  if (typeof window !== 'undefined') {
    const log = (window.__kgqEvents ??= []);
    log.push([name, p]);
    if (log.length > 50) log.shift();
  }
  devLog('ev', { name, ...p });
}
