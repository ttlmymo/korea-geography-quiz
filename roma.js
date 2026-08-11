/* ============================================================
   roma.js — 한글 지명 로마자 변환 (브라우저 + Node 빌드 공용)
   ⚠ import / export 사용 금지
   - index.html   : <script src="roma.js?v=1"></script>
   - gen-pages.mjs: new Function(src + "\nreturn {...};")()
   ============================================================ */

/* ── 1. 강제 지정 사전 ──
   자동 변환으로 충분하므로 비워둬도 됩니다.
   특정 지명을 반드시 이 표기로 고정하고 싶을 때만 추가하세요. */
const ROMA = {
  // "강남구": "Gangnam-gu",
};

/* ── 2. 예외 사전 ──
   자동 변환 결과가 공식 표기와 다른 지명만 등록. (스템 기준으로도 조회됨) */
const ROMA_EXCEPTIONS = {
  /* 시·도 (자동 변환하면 Seoulteukbyeol-si 처럼 나오므로 반드시 필요) */
  "서울특별시": "Seoul",
  "부산광역시": "Busan",
  "대구광역시": "Daegu",
  "인천광역시": "Incheon",
  "광주광역시": "Gwangju",
  "대전광역시": "Daejeon",
  "울산광역시": "Ulsan",
  "세종특별자치시": "Sejong",
  "경기도": "Gyeonggi-do",
  "강원특별자치도": "Gangwon-do",
  "강원도": "Gangwon-do",
  "충청북도": "Chungcheongbuk-do",
  "충청남도": "Chungcheongnam-do",
  "전북특별자치도": "Jeonbuk-do",
  "전라북도": "Jeonbuk-do",
  "전라남도": "Jeollanam-do",
  "경상북도": "Gyeongsangbuk-do",
  "경상남도": "Gyeongsangnam-do",
  "제주특별자치도": "Jeju-do",

  /* 동·로 단위 예외 */
  "남대문로": "Namdaemunno",   // 자동 변환: Namdaemullo
  "신문로":   "Sinmunno"       // 자동 변환: Sinmullo
};

/* ── 3. 자모 테이블 ── */
const _CHO  = ['g','kk','n','d','tt','r','m','b','pp','s','ss','','j','jj','ch','k','t','p','h'];
const _JUNG = ['a','ae','ya','yae','eo','e','yeo','ye','o','wa','wae','oe','yo','u','wo','we','wi','yu','eu','ui','i'];
const _CHO_J  = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const _JONG_J = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

/* 겹받침: 연음 시 분해 / 자음 앞 대표음 */
const _SPLIT = {'ㄳ':['ㄱ','ㅅ'],'ㄵ':['ㄴ','ㅈ'],'ㄶ':['ㄴ','ㅎ'],'ㄺ':['ㄹ','ㄱ'],'ㄻ':['ㄹ','ㅁ'],
                'ㄼ':['ㄹ','ㅂ'],'ㄽ':['ㄹ','ㅅ'],'ㄾ':['ㄹ','ㅌ'],'ㄿ':['ㄹ','ㅍ'],'ㅀ':['ㄹ','ㅎ'],'ㅄ':['ㅂ','ㅅ']};
const _REP = {'ㄳ':'ㄱ','ㄵ':'ㄴ','ㄶ':'ㄴ','ㄺ':'ㄱ','ㄻ':'ㅁ','ㄼ':'ㄹ','ㄽ':'ㄹ','ㄾ':'ㄹ','ㄿ':'ㅂ','ㅀ':'ㄹ','ㅄ':'ㅂ'};
/* 받침 중화 */
const _NEU = {'ㄱ':'ㄱ','ㄲ':'ㄱ','ㅋ':'ㄱ','ㄴ':'ㄴ','ㄷ':'ㄷ','ㅅ':'ㄷ','ㅆ':'ㄷ','ㅈ':'ㄷ','ㅊ':'ㄷ',
              'ㅌ':'ㄷ','ㅎ':'ㄷ','ㄹ':'ㄹ','ㅁ':'ㅁ','ㅂ':'ㅂ','ㅍ':'ㅂ','ㅇ':'ㅇ'};
const _FIN  = {'ㄱ':'k','ㄴ':'n','ㄷ':'t','ㄹ':'l','ㅁ':'m','ㅂ':'p','ㅇ':'ng'};
/* 연음 시 다음 음절 초성으로 넘어가는 소리 */
const _LINK = {'ㄱ':'g','ㄲ':'kk','ㄴ':'n','ㄷ':'d','ㄹ':'r','ㅁ':'m','ㅂ':'b','ㅅ':'s','ㅆ':'ss',
               'ㅈ':'j','ㅊ':'ch','ㅋ':'k','ㅌ':'t','ㅍ':'p','ㅎ':''};
/* 자음동화표: [앞 음절 받침 표기, 뒤 음절 초성 표기] */
const _ASSIM = {
  'ㄱ': {'ㄴ':['ng','n'], 'ㄹ':['ng','n'], 'ㅁ':['ng','m']},
  'ㄴ': {'ㄹ':['l','l']},
  'ㄷ': {'ㄴ':['n','n'],  'ㄹ':['n','n'],  'ㅁ':['n','m']},
  'ㄹ': {'ㄴ':['l','l'],  'ㄹ':['l','l']},
  'ㅁ': {'ㄹ':['m','n']},
  'ㅂ': {'ㄴ':['m','n'],  'ㄹ':['m','n'],  'ㅁ':['m','m']},
  'ㅇ': {'ㄹ':['ng','n']}
};

/* ── 4. 핵심: 한글 → 로마자 (국어의 로마자 표기법) ── */
function romanizeHangul(str) {
  const syl = [...String(str)].map((ch) => {
    const c = ch.charCodeAt(0) - 0xAC00;
    return (c >= 0 && c < 11172)
      ? { cho: Math.floor(c / 588), jung: Math.floor((c % 588) / 28), jong: c % 28 }
      : { raw: ch };
  });

  const initR = syl.map((s) => (s.raw !== undefined ? null : _CHO[s.cho]));
  const finR  = syl.map(() => "");

  for (let i = 0; i < syl.length; i++) {
    const s = syl[i];
    if (s.raw !== undefined) continue;
    const jong = _JONG_J[s.jong];
    if (!jong) continue;

    const nx = syl[i + 1];
    const nxCho = (nx && nx.raw === undefined) ? _CHO_J[nx.cho] : null;

    if (nxCho === 'ㅇ') {                       // 연음
      if (_SPLIT[jong]) {
        const [a, b] = _SPLIT[jong];
        finR[i] = _FIN[_NEU[a]] || "";
        initR[i + 1] = _LINK[b] || "";
      } else if (jong === 'ㅇ') {
        finR[i] = 'ng'; initR[i + 1] = '';
      } else {
        finR[i] = ''; initR[i + 1] = _LINK[jong] || "";
      }
      continue;
    }

    const neu = _NEU[_REP[jong] || jong] || jong;
    const rule = nxCho && _ASSIM[neu] && _ASSIM[neu][nxCho];
    if (rule) { finR[i] = rule[0]; initR[i + 1] = rule[1]; }
    else      { finR[i] = _FIN[neu] || ""; }
  }

  let out = "";
  syl.forEach((s, i) => {
    out += (s.raw !== undefined) ? s.raw : (initR[i] || "") + _JUNG[s.jung] + finR[i];
  });
  return out;
}

/* ── 5. 행정구역 접미사 처리 ── */
const _SUF  = { '동':'dong', '리':'ri', '가':'ga', '읍':'eup', '면':'myeon' };
const _SUF2 = { '구':'gu', '시':'si', '군':'gun', '도':'do' };   // ★ 추가
const _cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function romanizeDong(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  if (ROMA_EXCEPTIONS[raw]) return ROMA_EXCEPTIONS[raw];
  if (ROMA[raw]) return ROMA[raw];

  let stem = raw, tail = "", m;

  // 회현동1가 / 종로1가 → " 1-ga"
  if ((m = stem.match(/^(.+?)(\d+)가$/))) { stem = m[1]; tail = ` ${m[2]}-ga`; }

  // 역삼1동 → " 1-dong" / 역삼동 → "-dong"
  if ((m = stem.match(/^(.+?)(\d+)(동|리|가)$/))) {
    stem = m[1]; tail = ` ${m[2]}-${_SUF[m[3]]}` + tail;
  } else if ((m = stem.match(/^(.+?)(동|리|가|읍|면)$/))) {
    stem = m[1]; tail = `-${_SUF[m[2]]}` + tail;
  }

  const base = ROMA_EXCEPTIONS[stem] || ROMA[stem] || _cap(romanizeHangul(stem));
  return base + tail;
}

/* ★ 수정: 구·시·군·도까지 처리하는 범용 변환 */
function romanizePlace(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  if (ROMA_EXCEPTIONS[raw]) return ROMA_EXCEPTIONS[raw];
  if (ROMA[raw]) return ROMA[raw];

  // 동·리·가·읍·면 계열은 기존 로직에 위임
  if (/(동|리|가|읍|면)$/.test(raw)) return romanizeDong(raw);

  const m = raw.match(/^(.+?)(구|시|군|도)$/);
  if (m) {
    const base = ROMA_EXCEPTIONS[m[1]] || ROMA[m[1]] || _cap(romanizeHangul(m[1]));
    return `${base}-${_SUF2[m[2]]}`;
  }
  return _cap(romanizeHangul(raw));
}

if (typeof window !== "undefined") {
  window.ROMA = ROMA;
  window.romanizeHangul = romanizeHangul;
  window.romanizeDong = romanizeDong;
  window.romanizePlace = romanizePlace;
}
