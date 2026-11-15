// 한글 지명 로마자(국어의 로마자 표기법, 문화체육관광부 고시 제2014-42호)와 읍·면·동 영어 이름 꼴(영어 동 공부 설계안 docs/EN_EMD_PLAN_2026-11-16.md 3.3).
// 소리 규칙(romanizeHangul)은 옛 사이트 roma.js(git show c009859^:roma.js)의 것을 그대로 옮겼다: 자모표·연음(겹받침 나눔, ㅎ받침+ㅇ 은 ㅎ 빠짐)·
// 받침 중화·자음동화(비음화·유음화, ㄴ+ㄹ·ㄹ+ㄴ → ll)·ㄱ·ㄷ·ㅂ 뒤 ㅎ 밝혀 적기. 된소리는 적지 않는다. 구개음화·ㅎ받침 거센소리되기·ㄴ첨가는 없다
// (2026-11 판 이름에는 구개음화·거센소리되기 자리가 0곳 — 조사 2). 옛 파일의 시·도 예외 사전과 '남대문로·신문로'(-nno) 예외는 읍·면·동 이름에 쓰이지 않아 옮기지 않았다.
// 고칠 이름이 생기면 손 표 pipeline/data/emd-en.json 의 fix 에 적는다(tools/emd-en.mjs).
// 확인(조사 2, 2026-11-16): 국립국어원 로마자 표기 용례(행정 구역)와 이름이 같은 3,031곳에서 괄호 읽기 꼴(reading)이 글자까지 모두 같다.
// 이 파일은 도구·시험이 쓴다(앱과 파이프라인은 손 표를 읽는다 — 앱 묶음에 들지 않는다)

/* ---------- 소리 규칙(옛 roma.js 그대로) ---------- */
const CHO = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const JUNG = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const CHO_J = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const JONG_J = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
/** 겹받침: 연음 때 나눔 / 자음 앞 대표음 */
const SPLIT = { 'ㄳ': ['ㄱ', 'ㅅ'], 'ㄵ': ['ㄴ', 'ㅈ'], 'ㄶ': ['ㄴ', 'ㅎ'], 'ㄺ': ['ㄹ', 'ㄱ'], 'ㄻ': ['ㄹ', 'ㅁ'],
  'ㄼ': ['ㄹ', 'ㅂ'], 'ㄽ': ['ㄹ', 'ㅅ'], 'ㄾ': ['ㄹ', 'ㅌ'], 'ㄿ': ['ㄹ', 'ㅍ'], 'ㅀ': ['ㄹ', 'ㅎ'], 'ㅄ': ['ㅂ', 'ㅅ'] };
const REP = { 'ㄳ': 'ㄱ', 'ㄵ': 'ㄴ', 'ㄶ': 'ㄴ', 'ㄺ': 'ㄱ', 'ㄻ': 'ㅁ', 'ㄼ': 'ㄹ', 'ㄽ': 'ㄹ', 'ㄾ': 'ㄹ', 'ㄿ': 'ㅂ', 'ㅀ': 'ㄹ', 'ㅄ': 'ㅂ' };
/** 받침 중화 */
const NEU = { 'ㄱ': 'ㄱ', 'ㄲ': 'ㄱ', 'ㅋ': 'ㄱ', 'ㄴ': 'ㄴ', 'ㄷ': 'ㄷ', 'ㅅ': 'ㄷ', 'ㅆ': 'ㄷ', 'ㅈ': 'ㄷ', 'ㅊ': 'ㄷ',
  'ㅌ': 'ㄷ', 'ㅎ': 'ㄷ', 'ㄹ': 'ㄹ', 'ㅁ': 'ㅁ', 'ㅂ': 'ㅂ', 'ㅍ': 'ㅂ', 'ㅇ': 'ㅇ' };
const FIN = { 'ㄱ': 'k', 'ㄴ': 'n', 'ㄷ': 't', 'ㄹ': 'l', 'ㅁ': 'm', 'ㅂ': 'p', 'ㅇ': 'ng' };
/** 연음 때 다음 음절 첫소리로 넘어가는 소리 */
const LINK = { 'ㄱ': 'g', 'ㄲ': 'kk', 'ㄴ': 'n', 'ㄷ': 'd', 'ㄹ': 'r', 'ㅁ': 'm', 'ㅂ': 'b', 'ㅅ': 's', 'ㅆ': 'ss',
  'ㅈ': 'j', 'ㅊ': 'ch', 'ㅋ': 'k', 'ㅌ': 't', 'ㅍ': 'p', 'ㅎ': '' };
/** 자음동화: [앞 음절 받침 표기, 뒤 음절 첫소리 표기] */
const ASSIM = {
  'ㄱ': { 'ㄴ': ['ng', 'n'], 'ㄹ': ['ng', 'n'], 'ㅁ': ['ng', 'm'] },
  'ㄴ': { 'ㄹ': ['l', 'l'] },
  'ㄷ': { 'ㄴ': ['n', 'n'], 'ㄹ': ['n', 'n'], 'ㅁ': ['n', 'm'] },
  'ㄹ': { 'ㄴ': ['l', 'l'], 'ㄹ': ['l', 'l'] },
  'ㅁ': { 'ㄹ': ['m', 'n'] },
  'ㅂ': { 'ㄴ': ['m', 'n'], 'ㄹ': ['m', 'n'], 'ㅁ': ['m', 'm'] },
  'ㅇ': { 'ㄹ': ['ng', 'n'] },
};

/** 한글 → 로마자(소문자, 한글이 아닌 글자는 그대로) */
export function romanizeHangul(str) {
  const syl = [...String(str)].map((ch) => {
    const c = ch.charCodeAt(0) - 0xAC00;
    return c >= 0 && c < 11172 ? { cho: Math.floor(c / 588), jung: Math.floor((c % 588) / 28), jong: c % 28 } : { raw: ch };
  });
  const initR = syl.map((s) => (s.raw !== undefined ? null : CHO[s.cho]));
  const finR = syl.map(() => '');
  for (let i = 0; i < syl.length; i++) {
    const s = syl[i];
    if (s.raw !== undefined) continue;
    const jong = JONG_J[s.jong];
    if (!jong) continue;
    const nx = syl[i + 1];
    const nxCho = nx && nx.raw === undefined ? CHO_J[nx.cho] : null;
    if (nxCho === 'ㅇ') {   // 연음
      if (SPLIT[jong]) {
        const [a, b] = SPLIT[jong];
        finR[i] = FIN[NEU[a]] || '';
        initR[i + 1] = LINK[b] || '';
      } else if (jong === 'ㅇ') {
        finR[i] = 'ng'; initR[i + 1] = '';
      } else {
        finR[i] = ''; initR[i + 1] = LINK[jong] || '';
      }
      continue;
    }
    const neu = NEU[REP[jong] || jong] || jong;
    const rule = nxCho && ASSIM[neu] && ASSIM[neu][nxCho];
    if (rule) { finR[i] = rule[0]; initR[i + 1] = rule[1]; } else finR[i] = FIN[neu] || '';
  }
  let out = '';
  syl.forEach((s, i) => { out += s.raw !== undefined ? s.raw : (initR[i] || '') + JUNG[s.jung] + finR[i]; });
  return out;
}

/* ---------- 읍·면·동 이름 꼴(설계안 3.3 · D99 사용자 결정 2026-11-16: 숫자는 관용 꼴 'Bongcheon 1-dong') ---------- */
const DIG = ['', 'il', 'i', 'sam', 'sa', 'o', 'yuk', 'chil', 'pal', 'gu'];
/** 숫자 한자어 읽기(고시 꼴 괄호 안): 11 → sibil(받침 p + 모음 연음, 용례 'Daemyeong 11(sibil)-dong') */
const sino = (n) => {
  n = +n;
  const s = n < 10 ? DIG[n] : (Math.floor(n / 10) === 1 ? '' : DIG[Math.floor(n / 10)]) + 'sip' + DIG[n % 10];
  return s.replace(/sip(?=[aeiou])/g, 'sib');
};
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const UNIT = { 동: 'dong', 읍: 'eup', 면: 'myeon', 리: 'ri' };

/**
 * 읍·면·동 이름 → 영어 이름. 줄기 로마자 + 붙임표 + 단위(고시 제3장 제5항 — 붙임표 앞뒤 소리 변화는 적지 않음).
 *  - 숫자: 'Gaepo 1-dong'(공공 관용, D99). reading: true 면 고시 꼴 'Gaepo 1(il)-dong'(국립국어원 용례와 견줄 때만 — 표는 기본값으로 만든다)
 *  - N가동: 'Geumho 1-ga-dong' · 'Jongno 1·2·3·4-ga-dong', 성수N가N동: 'Seongsu 1-ga 1-dong'
 *  - 가운뎃점: 남기고 이름마다 대문자('Sanggye 3·4-dong' · 'Bullo·Bongmu-dong' · 'Bongmyeong 2·Songjeong-dong'), 쉼표는 가운뎃점으로('Duryu 1·2-dong')
 *  - 합친 이름·본동·제N동: 붙여 씀('Wangsimnidoseon-dong' · 'Junggyebon-dong' · 'Sangilje 1-dong')
 *  - '가'로 끝나는 진짜 이름(숫자 없는 가 — 신가동·삼가동)은 이름의 일부('Singa-dong')
 */
export function romaEmd(name, { reading = false } = {}) {
  const num = (n) => (reading ? `${n}(${sino(n)})` : `${n}`);
  const m = String(name).match(/^(.*?)(동|읍|면|리)$/);
  if (!m || !m[1]) return cap(romanizeHangul(name));
  const body = m[1], unit = UNIT[m[2]];
  const g = body.match(/^([가-힣]+?)(\d+)가(\d+)$/);   // 성수1가1동: 가 다음 숫자
  if (g) return `${cap(romanizeHangul(g[1]))} ${num(g[2])}-ga ${num(g[3])}-${unit}`;
  let out = '', ga = false;
  body.split(/[·,.]/).forEach((p, i) => {
    let mm = p.match(/^([가-힣]*?)(\d*)(가?)$/);
    if (!mm) mm = [p, p, '', ''];
    let [, stem, n, gaMark] = mm;
    if (gaMark && !n) { stem += '가'; gaMark = ''; }
    if (gaMark) ga = true;
    const sep = i === 0 ? '' : '·';
    out += sep + (stem ? cap(romanizeHangul(stem)) + (n ? ' ' + num(n) : '') : num(n));
  });
  return `${out}${ga ? '-ga' : ''}-${unit}`;
}

/**
 * 짧은 이름(설계안 3.3 · D101 — 쪽 지도·과 카드·길잡이): '-dong' 만 뗀다. 떼고 남는 글이 4자 미만이면 그대로('Bon-dong'), '-eup'·'-myeon' 은 남긴다
 * ('Gaepo 1-dong' → 'Gaepo 1', 'Byeollae-dong' → 'Byeollae', 'Byeollae-myeon' 그대로). 앱 UI_EN.short 가 같은 규칙이어야 한다(구현 2 — 시험이 견줌)
 */
export function emdShort(en) {
  const s = String(en).replace(/-dong$/, '');
  return s !== en && s.length >= 4 ? s : en;
}
