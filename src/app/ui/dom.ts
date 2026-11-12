// 화면 조각: 글자 이스케이프, 아이콘(Lucide 선 모양을 옮김, 이모지 안 씀), 공통 막대·범례
import { L } from '../text/ui.ts';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const svg = (d: string, w = 2) =>
  `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const ICON = {
  back: svg('M15 5l-7 7 7 7', 2.2),
  close: svg('M6 6l12 12M18 6L6 18', 2.2),
  next: svg('M9 5l7 7-7 7', 2.2),
};

/** 앱 안 화면의 위 막대: 뒤로 + 제목 */
export const topbar = (title: string, extra = '') =>
  `<div class="topbar"><button class="icon-btn" type="button" data-act="back" aria-label="${esc(L.back)}">${ICON.back}</button><h1>${esc(title)}</h1>${extra}</div>`;

/** 숙달 색 범례(설계서 3.1 화면 이름: 아직 / 익히는 중 / 다 익힘) */
export const legend = () =>
  `<div class="legend">${['m0', 'm1', 'm2', 'm3'].map((v, i) => `<span><i class="sw${i ? '' : ' dot'}" style="background:var(--${v})"></i>${esc(L.legend[i])}</span>`).join('')}</div>`;

export const mapBox = (key: string, cls = '', label = '') =>
  `<div class="map-box ${cls}" data-map="${key}"${label ? ` role="img" aria-label="${esc(label)}"` : ''}></div>`;

/** 네이버·카카오 앱 안에서 연 화면(설계서 3.8): 기록이 그 앱 안에만 남는다 */
export const inAppBrowser = () => typeof navigator !== 'undefined' && /NAVER\(inapp|KAKAOTALK|DaumApps/i.test(navigator.userAgent);
