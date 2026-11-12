// 기기 점검 동작: 화면 높이(창·svh·dvh·lvh·visualViewport)와 이 브라우저 안 저장이 남는지 재서 보여 주고 PC 로 보낸다.
// 주소창이 숨고 나올 때 높이가 바뀌므로, 바뀔 때마다 가장 작은·큰 값을 모아 1초 뒤 다시 보낸다
import { devLog } from '../app/devlog.ts';

const $ = (id: string) => document.getElementById(id)!;
const VISITS = 'kgq_devcheck_visits';
const APP_KEYS = ['kgq_mastery_v1:p1', 'kgq_deck_v1:p1', 'kgq_daily_v1:p1', 'kgq_last_v1:p1', 'kgq_settings_v1'];

function rows(id: string, list: [string, string | number][]) {
  $(id).innerHTML = '';
  for (const [k, v] of list) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    const td = document.createElement('td');
    th.textContent = k;
    td.textContent = String(v);
    tr.append(th, td);
    $(id).append(tr);
  }
}

/* ---------- 저장: 방문 때마다 시각을 하나 더 적는다. 앱을 닫았다 열어도 늘어나면 남는 것 ---------- */
let visits: number[] = [];
let store = '';
const app: Record<string, number> = {};
try {
  const kv = localStorage;
  const old = JSON.parse(kv.getItem(VISITS) ?? '[]');
  visits = Array.isArray(old) ? old.filter((x) => typeof x === 'number') : [];
  visits.push(Date.now());
  kv.setItem(VISITS, JSON.stringify(visits.slice(-20)));
  for (const k of APP_KEYS) {
    const v = kv.getItem(k);
    if (v !== null) app[k] = v.length;
  }
  store = 'ok';
} catch (e) {
  store = `막힘: ${(e as Error)?.name ?? e}`;
}
const when = (t: number) => new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
rows('store', [
  ['localStorage', store],
  ['이 쪽 방문', visits.length ? `${visits.length}번째 (처음 ${when(visits[0])})` : '-'],
  ['앱 진행 기록', Object.keys(app).length ? Object.entries(app).map(([k, n]) => `${k.replace(/^kgq_|_v1(:p1)?$/g, '')} ${n}자`).join(', ') : '없음'],
]);

/* ---------- 화면 ---------- */
const seen = { minH: Infinity, maxH: 0, minVV: Infinity, maxVV: 0 };
const px = (id: string) => Math.round($(id).getBoundingClientRect().height);
function measure() {
  const vv = window.visualViewport;
  const vvh = vv ? Math.round(vv.height) : 0;
  seen.minH = Math.min(seen.minH, innerHeight);
  seen.maxH = Math.max(seen.maxH, innerHeight);
  if (vv) { seen.minVV = Math.min(seen.minVV, vvh); seen.maxVV = Math.max(seen.maxVV, vvh); }
  return {
    ua: navigator.userAgent,
    screen: `${screen.width}×${screen.height}`,
    inner: `${innerWidth}×${innerHeight}`,
    vv: vv ? `${Math.round(vv.width)}×${vvh}` : '없음',
    svh: px('svh'), dvh: px('dvh'), lvh: px('lvh'),
    dpr: devicePixelRatio,
    dark: matchMedia('(prefers-color-scheme: dark)').matches,
    standalone: matchMedia('(display-mode: standalone)').matches,
    minH: seen.minH, maxH: seen.maxH, minVV: seen.minVV === Infinity ? 0 : seen.minVV, maxVV: seen.maxVV,
  };
}
function show(m: ReturnType<typeof measure>) {
  rows('screen', [
    ['브라우저', m.ua],
    ['기기 화면', `${m.screen} (배율 ${m.dpr})`],
    ['창(지금)', m.inner],
    ['보이는 영역', m.vv],
    ['창 높이 범위', `${m.minH} ~ ${m.maxH}`],
    ['100svh · dvh · lvh', `${m.svh} · ${m.dvh} · ${m.lvh}`],
    ['어두운 모드 요청', m.dark ? '예' : '아니요'],
  ]);
}

let n = 0;
function send() {
  const m = measure();
  show(m);
  devLog('device', { ...m, store, visits: visits.length, firstVisit: visits[0] ?? null, app });
  $('sent').textContent = `PC 로 보냄 ${++n}번 (${when(Date.now())})`;
}
send();
let timer = 0;
const later = () => { show(measure()); clearTimeout(timer); timer = window.setTimeout(send, 1000); };
addEventListener('resize', later);
window.visualViewport?.addEventListener('resize', later);
