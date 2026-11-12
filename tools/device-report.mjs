// 실기기 점검(설계서 12 S11) 요약: 개발 서버가 받은 휴대폰 기록(.cache/device/reports.jsonl)을 쪽 열기(sid)별로 묶어 보여 준다.
// node tools/device-report.mjs [--since 2026-11-08T10:00] [--events]
//  - 화면: 창 높이 범위·svh/dvh/lvh·저장 유지(기기 점검 쪽)
//  - 프레임: 지도 실험실 끌기·집기마다 평균·95%·20ms 넘은 프레임
//  - 누르기: 판정 종류(칸·모호·바깥·강), 찾기 오답 가운데 정답 칸이 손가락 반경(FINGER_PX) 안에 있던 것 = 오탭 후보
//  - 흐름(--events): 앱 이벤트와 시각, 20초 넘게 멈춘 곳
import fs from 'node:fs';

const FILE = new URL('../.cache/device/reports.jsonl', import.meta.url);
const args = process.argv.slice(2);
const since = args.includes('--since') ? Date.parse(args[args.indexOf('--since') + 1]) : 0;
const withEvents = args.includes('--events');
if (!fs.existsSync(FILE)) { console.log('기록 없음:', FILE.pathname); process.exit(0); }

const recs = fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => (r.t ?? 0) >= since);
const browser = (ua) => {
  const m = [[/SamsungBrowser\/([\d.]+)/, '삼성 인터넷'], [/NAVER\(inapp[^)]*\)/, '네이버 앱'], [/Whale\/([\d.]+)/, '웨일'], [/KAKAOTALK/, '카카오톡'],
    [/EdgA?\/([\d.]+)/, '엣지'], [/CriOS\/([\d.]+)/, '크롬(iOS)'], [/Chrome\/([\d.]+)/, '크롬'], [/Version\/([\d.]+).*Safari/, '사파리']];
  for (const [re, name] of m) { const x = ua.match(re); if (x) return `${name}${x[1] ? ' ' + x[1].split('.')[0] : ''}`; }
  return ua.slice(0, 60);
};
const model = (ua) => ua.match(/Android [\d.]+; ([^;)]+)/)?.[1] ?? (ua.includes('iPhone') ? 'iPhone' : ua.includes('Windows') ? 'Windows' : '?');
// 칸 번호 → 이름(가장 최근 판 units.json 에서 id·ko 가 있는 것 모두)
const NAMES = new Map();
const geoDir = new URL('../public/data/geo/', import.meta.url);
const ver = fs.readdirSync(geoDir).sort().at(-1);
(function walk(v) {
  if (Array.isArray(v)) v.forEach(walk);
  else if (v && typeof v === 'object') {
    if (typeof v.id === 'string' && typeof v.ko === 'string') NAMES.set(v.id, v.ko);
    Object.values(v).forEach(walk);
  }
})(JSON.parse(fs.readFileSync(new URL(`${ver}/units.json`, geoDir), 'utf8')));
const nm = (id) => NAMES.get(id) ?? id;
const hhmm = (t) => new Date(t).toLocaleTimeString('ko-KR', { hour12: false });
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };

const bySid = new Map();
for (const r of recs) {
  if (!bySid.has(r.sid)) bySid.set(r.sid, []);
  bySid.get(r.sid).push(r);
}
console.log(`기록 ${recs.length}줄 · 쪽 열기 ${bySid.size}번${since ? ` (${new Date(since).toLocaleString('ko-KR')} 이후)` : ''}`);

for (const [sid, rs] of bySid) {
  rs.sort((a, b) => a.t - b.t);
  const ua = rs[0].ua ?? '';
  console.log(`\n■ ${sid} · ${model(ua)} · ${browser(ua)} · ${hhmm(rs[0].t)}~${hhmm(rs.at(-1).t)} · ${rs[0].path}`);

  const dev = rs.filter((r) => r.kind === 'device').at(-1);
  if (dev) {
    console.log(`  화면 ${dev.screen}(배율 ${dev.dpr}) · 창 ${dev.inner} · 창 높이 ${dev.minH}~${dev.maxH} · 보이는 영역 ${dev.minVV}~${dev.maxVV} · svh ${dev.svh} dvh ${dev.dvh} lvh ${dev.lvh} · 어두운 모드 요청 ${dev.dark ? '예' : '아니요'}`);
    const app = Object.entries(dev.app ?? {}).map(([k, n]) => `${k} ${n}자`).join(', ') || '없음';
    console.log(`  저장 ${dev.store} · 이 쪽 ${dev.visits}번째 방문(처음 ${dev.firstVisit ? new Date(dev.firstVisit).toLocaleString('ko-KR') : '-'}) · 앱 기록 ${app}`);
  }

  const fr = rs.filter((r) => r.kind === 'frames');
  if (fr.length) {
    const groups = new Map();
    for (const f of fr) {
      const k = `${f.mode === 'emd' ? '서울 427동' : `${f.region} ${f.mode}`} ${f.gesture === 'pinch' ? '집기' : '끌기'}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(f);
    }
    for (const [k, fs2] of groups) {
      const slow = fs2.reduce((a, f) => a + f.slow, 0), n = fs2.reduce((a, f) => a + f.n, 0);
      console.log(`  프레임 ${k} ${fs2.length}번: 평균 ${med(fs2.map((f) => f.avg))}ms · 95% 중앙 ${med(fs2.map((f) => f.p95))}ms 최악 ${Math.max(...fs2.map((f) => f.p95))}ms · 20ms 넘음 ${slow}/${n}(${n ? Math.round((slow / n) * 100) : 0}%) · 다시 그리기 ${med(fs2.map((f) => f.commitMs))}+${med(fs2.map((f) => f.paintMs))}ms`);
    }
  }

  const taps = rs.filter((r) => r.kind === 'tap');
  if (taps.length) {
    const cnt = {};
    for (const t of taps) cnt[t.type] = (cnt[t.type] ?? 0) + 1;
    const ans = rs.filter((r) => r.kind === 'ans' && r.mode === 'find' && r.phase === 'ask' && !['ambiguous', 'outside', 'river'].includes(r.tap));
    const wrong = ans.filter((a) => a.tap !== a.q);
    const near = wrong.filter((a) => {
      const t = taps.filter((x) => x.t <= a.t).at(-1);
      return t && t.near?.includes(a.q);
    });
    const TYPE = { cell: '칸', ambiguous: '모호', outside: '바깥', river: '강' };
    console.log(`  누르기 ${taps.length}번: ${Object.entries(cnt).map(([k, n]) => `${TYPE[k] ?? k} ${n}`).join(' · ')} · 모호(키워 다시) ${Math.round(((cnt.ambiguous ?? 0) / taps.length) * 100)}%`);
    if (ans.length) console.log(`  찾기 답 ${ans.length}번: 오답 ${wrong.length} · 그 가운데 정답 칸이 손가락 반경 안(오탭 후보) ${near.length}${near.length ? ` — ${near.map((a) => `${nm(a.q)}←${nm(a.tap)}`).join(', ')}` : ''}`);
  }

  if (withEvents) {
    let prev = rs[0].t;
    for (const r of rs.filter((x) => x.kind === 'ev')) {
      const gap = (r.t - prev) / 1000;
      const extra = Object.entries(r).filter(([k]) => !['at', 'ua', 'sid', 't', 'path', 'kind', 'name', 'country', 'lang', 'data_ver'].includes(k)).map(([k, v]) => `${k}=${v}`).join(' ');
      console.log(`  ${hhmm(r.t)}${gap > 20 ? ` (+${Math.round(gap)}초 멈춤)` : ''} ${r.name} ${extra}`);
      prev = r.t;
    }
  }
}
