// 화면 글 두 벌(한국어·영어). 앱은 홈 문서의 lang 으로 하나를 고른다(설계서 7.2: /en/ 은 같은 앱, 영어 문구.
// 위치 한 줄·가이드는 한국어만이라 영어 화면에는 위치 한 줄이 없다)
import type { Dir8, Registry, UnitRef } from '../registry.ts';
import type { Tap, Wrong } from '../core/judge.ts';
import type { CtxCell, Item, Lesson, Region, Screen } from '../types.ts';
import { DIR_KO, TAP_KO, dontKnowKo, eulReul, eunNeun, guFirst, ieyo, koCount, meetKo, rightKo, unitKo, unitWordKo, wrongKo } from './ko.ts';
import { SIDOS, partOf, sidoByCode } from '../sidos.ts';

type TapMsg = Exclude<Tap['type'], 'cell'>;
type Pair = [string, string];
/** 지역 표(src/data/sido.json)에서 지역 키 → 글 두 개(desc·hub). 계획서 E8: regionDesc·hubs·RIVER_REGIONS 를 지역 표로 옮김 */
const fromTable = (pick: (s: (typeof SIDOS)[number]) => Pair | null | undefined) =>
  Object.fromEntries(SIDOS.flatMap((s) => { const v = pick(s); return v ? [[s.key, v]] : []; })) as Record<string, Pair>;
const ends = (r: Region, ids?: string[]) => {
  const list = ids ? r.items.filter((it) => ids.includes(it.id)) : r.items;
  const by = (e: string) => list.filter((it) => it.ko.endsWith(e)).length;
  return { si: by('시'), gun: by('군'), gu: by('구'), eup: by('읍'), myeon: by('면'), dong: by('동'), n: list.length };
};
/** 동 단원의 곳 종류(읍·면·동 차례): '동' · '읍·면' · '읍·면·동'. 동 단원이 아니면 '' */
const emdKinds = (e: ReturnType<typeof ends>) => (e.n && e.eup + e.myeon + e.dong === e.n ? [e.eup && '읍', e.myeon && '면', e.dong && '동'].filter(Boolean).join('·') : '');
/** 구 고르기 낱말(L.unitWord): 홑 꼴(제목·'다른 ○ 고르기')과 겹 꼴(목록 머리 '25 districts'). 한국어는 둘이 같다 */
export interface UnitWord { one: string; many: string }

/* ---------- 한국어 ---------- */


export const UI_KO = {
  lang: 'ko' as 'ko' | 'en',
  site: '채움지도',
  tagline: '백지도 퀴즈로 익히는 대한민국 행정구역',
  path: (p: string) => p,                       // 사이트 안 정적 쪽 주소(영어는 /en/ 아래)
  name: (it: Item) => it.ko,
  region: (r: Region) => r.ko,
  lesson: (l: Lesson) => l.title,
  lessonNo: (no: number) => `${no}과`,
  count(r: Region): string {
    if (r.layer === 'sido') return `${r.items.length}개 시·도`;
    const e = ends(r);
    const k = emdKinds(e);
    if (k) return `${e.n}개 ${k}`;
    // 군과 구만 있으면 지역이 스스로 쓰는 차례: 구를 먼저 '15구 1군'(부산)·'7구 2군'(대구), 지역 표 gunFirst 인 인천만 '2군 9구'(ko.ts guFirst, E12).
    // 그 밖에 둘 이상 섞이면 '27개 시·군·구'(전남광주), '31개 시·군'(경기)
    if (!e.si && e.gun && e.gu) return guFirst(r.items.map((it) => it.ko), r.key) ? `${e.gu}구 ${e.gun}군` : `${e.gun}군 ${e.gu}구`;
    const kinds = [e.si && '시', e.gun && '군', e.gu && '구'].filter(Boolean);
    return `${e.n}개 ${kinds.length ? kinds.join('·') : '곳'}`;
  },
  lessonCount(r: Region, ids: string[]): string {
    if (r.layer === 'sido') return `${ids.length}개 시·도`;
    const e = ends(r, ids);
    // 단위 차례는 지역 전체로 정한다(부산 3과 '4개 구·군' — 기장군 하나가 든 과)
    const kinds = guFirst(r.items.map((it) => it.ko), r.key) ? [e.si && '시', e.gu && '구', e.gun && '군'] : [e.si && '시', e.gun && '군', e.gu && '구'];
    return `${ids.length}개 ${emdKinds(e) || kinds.filter(Boolean).join('·') || '곳'}`;
  },
  /** 지도 맥락 이름(이웃 땅·한강): 한국어는 칸의 글 그대로(map/shapes.ts — 시·도는 짧은 이름, 동 단원 지도의 이웃은 시·군·구 이름) */
  ctxName: (n: CtxCell) => n.text,
  /**
   * 단원 이름(단원이 섞이는 화면 — 오늘 복습 라벨 '서울 6 · 종로구 4', 오늘 복습 문제 앞 이름 '종로구 ·', 계획서 N12 · E11): 레지스트리 mixName 그대로
   * (같은 이름이 여러 시·도에 있으면 '부산 중구'). 지역 키면 지역 이름, 모르는 키는 undefined
   */
  unitName: (reg: Registry, key: string): string | undefined => reg.mixName(key),
  /** 구 고르기 목록·최근 단추의 단원 이름(동 색인 — 단원 파일을 받기 전에도): '종로구' · '수원시 장안구' */
  pickName: (u: UnitRef) => u.index.ko,
  /** 구 고르기 낱말: 단원 이름 끝 글자로 모은다('구' · '시·군' · '시·군·구'). 없으면 fallback */
  unitWord: (names: string[], region: string, fallback: string): UnitWord => { const w = unitWordKo(names, region) || fallback; return { one: w, many: w }; },
  /** 일반구 단원 쪽 제목: '경기 일반구 24곳'('경기 일반구 24개 구'처럼 '구'가 겹치지 않게). parent = 지역 이름(영어만 씀) */
  guTitle: (unit: string, _parent: string, n: number) => `${unit} ${n}곳`,
  dir: (d: Dir8) => DIR_KO[d],
  tap: (t: TapMsg) => TAP_KO[t],
  // 문제
  prompt(reg: Registry, mode: 'meet' | 'choose' | 'find', id: string, b: (s: string) => string): string {
    const p = reg.place(id)!;
    if (mode === 'meet') return `이곳은 ${b(p.item.ko)}`;
    if (mode === 'choose') return `테두리 친 칸은 무슨 ${unitKo(p.region)}일까요?`;
    return `${b(p.item.ko)}${eulReul(p.item.ko).slice(p.item.ko.length)} 찾아 누르세요`;
  },
  /** 위치 한 줄: 시·군·구는 원고(item.line), 동은 만나기 근거로 만든 한 줄(N13), 일반구는 파이프라인이 근거로 만든 한 줄(item.line, E7) */
  line: (reg: Registry, id: string) => { const p = reg.place(id); return p?.region.layer === 'emd' && p.region.unit ? meetKo(reg, id) : p?.item.line ?? ''; },
  /** 단원이 섞이는 화면(오늘 복습·복습 목록)의 곳 이름: 동은 '종로구 청운효자동'(N12), 일반구는 '수원시 장안구', 시·군·구는 그대로 */
  // 동 단원 이름은 여러 시·도에 같은 이름이 있으면 지역 이름을 붙인다('부산 중구 중앙동' — registry.mixName, E11)
  fullName: (reg: Registry, id: string) => { const p = reg.place(id); return !p ? id : p.item.full ?? (p.region.unit ? `${reg.mixName(p.region.key) ?? p.region.ko} ${p.item.ko}` : p.item.ko); },
  /** 오늘 복습 문제의 앞 이름(N12): full 에서 곳 이름을 뺀 것 — 일반구 '수원시', 같은 이름이 여러 지역에 있는 시·군·구 '부산'(E11). 없으면 undefined */
  fullPre: (reg: Registry, id: string) => { const p = reg.place(id); return p?.item.full && p.item.full !== p.item.ko ? p.item.full.slice(0, -p.item.ko.length).trim() || undefined : undefined; },
  right: (reg: Registry, id: string, first: boolean) => rightKo(reg, id, first).title,
  wrong: (reg: Registry, w: Wrong, chose: boolean) => wrongKo(reg, w, chose),
  /** 오답 위치 글(정답이나 누른 곳이 섬 상자에 있을 때): 상자 자리는 실제 방위와 달라 방위 대신 정답이 어디 그려졌는지만(E5 검수) */
  isleWhere: (reg: Registry, id: string, inIsle: boolean) => { const t = reg.place(id)?.item.ko ?? ''; return inIsle ? `${eunNeun(t)} 따로 그린 섬 상자에 있어요` : `${eunNeun(t)} 본 지도에 있어요`; },
  dontKnow: (reg: Registry, id: string) => dontKnowKo(reg, id),
  fixed: (reg: Registry, id: string) => `여기가 ${ieyo(reg.place(id)?.item.ko ?? '')}`,
  meetAct: '테두리 친 칸을 눌러 보세요',
  next: '다음',
  hint: '힌트', hintUsed: '힌트 썼어요', dontKnowBtn: '모르겠어요',
  checkNote: '힌트 없이 한 번에 판정해요',
  quickNote: '힌트 없이 찾아요. 맞힌 곳은 배우기를 건너뛰어요',
  autoNote: '잠시 뒤 다음 문제로 넘어가요',
  tapMarked: '○ 표시한 칸을 눌러 보세요',
  tapOutlined: '테두리 친 칸을 눌러 보세요',
  useOptions: '아래 보기에서 골라 주세요',
  exitAria: '그만하기', exitQ: '그만할까요?', stay: '계속하기', leave: '그만하기',
  exitCheck: '시험을 그만하면 이번 시험 결과는 남지 않아요',
  exitSaved: '지금까지 푼 것은 저장돼요. 홈에서 이어서 할 수 있어요',
  resetView: '⤢ 전체 보기',
  sideAria: '이번 판의 곳',
  st: { no: '✕ 헷갈림', ok: '○ 맞힘', met: '만남', new: '아직' },
  confused: '헷갈린 곳',
  kind: { review: '오늘 복습', mix: '전체 연습', check: '시험' } as Record<string, string>,
  studying: '공부 중',
  // 문제 화면(합본 디자인 3.3): 문제 이름은 큰 글씨, 나머지는 작은 글씨. 이어 붙이면 prompt 와 같은 문장(pre · big · post)
  promptParts(reg: Registry, mode: 'meet' | 'choose' | 'find', id: string): { pre: string; big: string; post: string } {
    const p = reg.place(id)!;
    if (mode === 'meet') return { pre: '이곳은', big: p.item.ko, post: '' };
    if (mode === 'choose') return { pre: '', big: '', post: `테두리 친 칸은 무슨 ${unitKo(p.region)}일까요?` };
    return { pre: '', big: eulReul(p.item.ko), post: '찾아 누르세요' };
  },
  /** 왼쪽 열 맨 위 한 줄: 지금 문제의 종류 */
  modeLabel: { meet: '만나기', choose: '고르기', find: '이름을 가린 지도에서 찾기' } as Record<string, string>,
  findNote: '틀려도 괜찮아요. 정답이 어느 쪽에 있는지 알려 드려요',
  /** 머리의 문제 수 낱말: '17 / 19 문제' */
  qUnit: '문제',
  /** '이번 판의 곳' 목록에서 지금 묻는 곳 */
  stNow: '지금 문제',
  /** 지도 위 캡션 */
  mapCap: (mode: string): string => (mode === 'meet' ? '이름표를 보며 만나요' : '이름을 가린 지도'),
  /** 지도 아래 조작 안내: [마우스, 터치] */
  mapHelp: ['끌어서 옮기고, 휠로 확대해요', '끌어서 옮기고, 두 손가락으로 확대해요'],
  /** 문제 지도 범례(한강은 legendRiver) */
  /** ctxOther: 오늘 복습 판(과 범위 지도)의 바탕 칸 — 머리가 '오늘 복습'이라 '이번 과'가 무엇인지 맞지 않아서 */
  playKey: { pick: '고를 칸', outlined: '테두리 친 칸', ctxLesson: '이번 과 아님', ctxScreen: '이번 화면 아님', ctxOther: '다른 과' },
  // 홈
  notes: { saved: '기록은 이 브라우저에만 저장돼요', noStore: '이 창에서는 기록이 저장되지 않아요. 창을 닫으면 처음으로 돌아가요', inApp: '앱 안에서 연 화면이에요. 기록은 이 앱 안에만 남아요 · 크롬·사파리 같은 브라우저로 열면 그 브라우저에 따로 쌓여요' },
  rangeMap: (r: string, no: string) => `${r} ${no} 범위 지도`,
  newSub: '지도에서 하나씩 만나고, 이름을 가린 채 찾아요',
  start: '시작하기',
  resume: '이어서 하기',
  questions: (n: number, t: number) => `${n}/${t} 문제`,
  reviewAfter: (n: number) => `오늘 복습 ${n}곳은 끝나고 해요`,
  reviewTitle: (n: number) => `오늘 복습 ${n}곳`,
  reviewStart: '복습 시작',
  nextAfterReview: (x: string) => `다음: ${x} (복습 뒤에 추천)`,
  doneTitle: (r: string, count: string) => `${r} ${eulReul(count)} 모두 칠했어요`,
  doneSub: '다음 지역으로 넘어가 볼까요?',
  regionStart: (r: string) => `${r} 시작`,
  checkGo: (r: string) => `${r} 시험 보기`,
  nextEyebrow: (rec: boolean): string => (rec ? '다음 과' : '오늘은 충분히 했어요'),
  reviewDone: (tomorrow: number) => `오늘 복습 끝${tomorrow ? ` · 내일 ${tomorrow}곳` : ''}`,
  fillMap: (r: string) => `${r} 채움 지도`,
  filled: (n: number, f: number, d: number) => (f ? `${n}곳 중 ${f}곳 채움 · 다 익힘 ${d}` : '아직 칠한 곳이 없어요. 공부한 곳이 여기에 칠해져요'),
  namedMap: (r: string) => `이름이 붙은 ${r} 지도 보기`,
  knowIt: (r: string) => `이미 알아요 · ${r} 시험 보기`,
  how: '이렇게 공부해요',
  howSteps: [['① 만나기', '이름표를 보며 눌러 봐요'], ['② 찾기', '이름을 가리고 찾아요'], ['③ 복습', '다음 날 다시 나와요']],
  explore: '지역 알아보기',
  settings: '설정',
  // 2026-11-18 사용자 결정(안 2 — 전 문구 '정답을 맞히면 잠시 뒤 저절로 …' · '한 판에서 같은 곳을 처음 두 번 맞혔을 때는 …'가 어색하다)
  autoNext: ['정답을 맞히면 다음 문제로 자동으로 넘어가기', '새로 맞힌 곳은 처음 두 번까지 위치 설명이 나와요. 이때는 [다음]을 눌러야 넘어가요'],
  legend: ['아직', '익히는 중', '익히는 중', '다 익힘'],
  // 홈(합본 디자인 3.2): 지역 탭 · 큰 제목 · 진도 · 과 카드 줄. 제목의 '\n' 은 줄바꿈
  homeTabs: '지역 고르기',
  tabDue: '오늘 복습 있음',
  firstLesson: '첫 과',
  legendNext: '다음 과',
  legendRiver: '한강',
  legendAria: '지도 색 풀이',
  /** 큰 제목: '북서쪽\n6개 구를 채워요'(형광펜은 count) */
  lessonHead: (lesson: string, count: string) => `${lesson}\n${eulReul(count)} 채워요`,
  places: (n: number) => `${n}곳`,
  /** 복습 날 큰 제목: '채운 4곳을\n다시 만나요'(형광펜은 places(n)) */
  reviewHead: (places: string) => `채운 ${places}을\n다시 만나요`,
  reviewSub: '잊을 때쯤 다시 만나면 오래 남아요',
  /** 복습 라벨의 지역별 수: '서울 4곳' / '서울 6 · 경기 4' */
  reviewWhere: (parts: [string, number][]) => (parts.length === 1 ? `${parts[0][0]} ${parts[0][1]}곳` : parts.map(([r, n]) => `${r} ${n}`).join(' · ')),
  doneLabel: (r: string) => `${r} · 다 채움`,
  regionFull: (r: Region) => r.full,
  asOf: (y: number, m: number) => `경계 ${y}년 ${m}월 기준`,
  masteredNote: '다 익힌 곳은 지도에 이름이 남아요',
  progAria: (r: string, n: number) => `${r} ${n}곳의 채움 정도`,
  noLogin: '로그인 없이 바로 시작해요',
  /** '서울 다섯 과' */
  lessonsHead: (r: string, n: number) => `${r} ${koCount(n)} 과`,
  lessonsHelp: '과를 누르면 그 과부터 할 수 있어요',
  mixGo: (r: string) => `${r} 전체 연습`,
  /** 과 카드의 상태 한 줄 */
  stFilled: (total: number, f: number, d: number, due: number) => `${f === total ? `${f}곳 채움` : `${total}곳 중 ${f}곳 채움`}${due ? ` · 오늘 복습 ${due}` : d ? ` · 다 익힘 ${d}` : ''}`,
  stNext: (n: number) => `다음에 배울 ${n}곳`,
  stAfterReview: (n: number) => `복습 뒤에 배울 ${n}곳`,
  stFirst: (n: number) => `처음 배울 ${n}곳`,
  stNotYet: (n: number) => `${n}곳 · 아직`,
  /** 과 카드 네모 줄의 설명: '6곳 중 2곳 다 익힘, 4곳 익히는 중' / '5곳 모두 익히는 중' */
  dotsAria: (total: number, parts: [string, number][]) => (parts.length === 1 ? `${total}곳 모두 ${parts[0][0]}` : `${total}곳 중 ${parts.map(([s, n]) => `${n}곳 ${s}`).join(', ')}`),
  /** 과 카드의 짧은 이름: 종로구 → 종로 */
  // 시·도 단원(korea)의 곳 이름('대구' · '광주특별시')은 줄이지 않는다
  // 과 카드의 짧은 이름('종로'). 줄이면 한 글자가 되는 이름(중구·서구·동구·남구·북구)은 그대로 — 부산 1과 '중 · 서 · 동 · 영도'처럼 방위 낱말로 읽힌다(E11)
  short: (it: Item) => (it.id.startsWith('kr:sido:') ? it.ko : [...it.ko].length <= 2 ? it.ko : it.ko.replace(/[구시군]$/, '') || it.ko),
  /** 처음 온 사람의 진도 자리 안내(지도와 떨어진 글이라 '여기에' 대신 '지도에') */
  filledNone: '아직 칠한 곳이 없어요. 공부한 곳이 지도에 칠해져요',
  /** 칠한 곳이 없는 지역 탭의 진도 머리: '11곳 중 0곳 채움' */
  filledZero: (n: number) => `${n}곳 중 0곳 채움`,
  /** '지역 알아보기'의 정적 허브 쪽 [제목, 부제](지역 표 hub — 허브가 없는 지역 탭은 서울 허브). 영어 허브는 서울만 있다 */
  hubs: fromTable((s) => s.hub?.ko),
  /** '지역 알아보기'에서 정적 허브가 없는 지역 탭(새 시·도 · 전국)이 가는 지역 고르기 [제목, 부제] */
  pickerLink: ['전국 지역 고르기', '시·도 지도에서 공부할 지역을 골라요 →'] as [string, string],
  /** 홈 지역 탭이 넘칠 때(공개 지역 5곳 이상, 계획서 N22) 지역 고르기로 가는 마지막 탭 */
  otherTab: '다른 지역',
  /** 그 탭의 '+n' 을 화면 읽기가 읽는 글('플러스 14' 대신) */
  otherTabMore: (n: number) => `(${n}곳 더)`,
  /** 지역 고르기에서 열린 지역이 적을 때(운영) 접어 둔 '준비 중' 지역 묶음의 머리 */
  othersSoon: (n: number) => `다른 지역 ${n}곳 · 준비 중`,
  // 지역 고르기(계획서 N23): 전국 시·도 지도 + 권역별 목록, 아직 열지 않은 지역은 흐리게 '준비 중'
  regionsTitle: '어디를 공부할까요?',
  /** 지역 고르기 칸·홈 지도 아래 한 줄 [글, 꼬리표](지역 표 desc) */
  regionDesc: fromTable((s) => s.desc?.ko),
  /** 지역 고르기 칸의 한 줄: '25개 구 · 5과' */
  regionMeta: (count: string, n: number) => `${count} · ${n}과`,
  filledTag: (f: number, n: number) => `${f}/${n} 채움`,
  notYet: '아직',
  soon: '준비 중',
  /** 지역 고르기 지도 */
  pickerMap: '전국 지도. 열린 지역을 누르면 그 지역으로 가요',
  // 모두 열렸으면(한국어 E16 부터 열여섯 곳) '16곳 중 16곳 열림' 대신 수만(E17 — 여는 동안의 말을 운영 화면에 남기지 않음)
  pickerCap: (open: number, all: number) => (open === all ? `전국 시·도 ${all}곳` : `시·도 ${all}곳 중 ${open}곳 열림`),
  /** 지역 고르기의 시·도 단원 묶음 머리(칸 이름 '전국'과 겹치지 않게) */
  koreaHead: '시·도 한눈에',
  /** 지역 고르기 권역 머리 오른쪽: 열린 지역 수 */
  regionsCount: (n: number) => `${n}곳`,
  /** 지역 고르기 제목 아래 안내 */
  pickerSub: '지도나 목록에서 지역을 고르세요. 아직 열지 않은 지역은 흐리게 보여요',
  /** 같은 안내, 그 말 화면의 지역이 모두 열렸을 때(흐린 지역 없음 — E16 검수) */
  pickerSubAll: '지도나 목록에서 지역을 고르세요',
  /** 권역 이름(지역 표 group 그대로) */
  groupName: (g: string) => g,
  /** 과 없는 지역(세종·제주, 계획서 N4)의 지역 고르기 칸 한 줄: '25곳 · 4과' */
  mainMeta: (n: number, lessons: number) => `${n}곳 · ${lessons}과`,
  // 단원
  unitMapLabel: (r: string) => `${r} 채움 지도. 칸을 누르면 그곳 이야기가 나와요`,
  reviewChip: (n: number) => `오늘 복습 ${n} →`,
  order: '공부 순서',
  tagResume: (n: number, t: number) => `${n}/${t} 이어서`,
  tagDone: '✓ 끝', tagRec: '추천',
  mixName: (no: number, r: string) => `${no}과 ${r} 전체 연습`,
  mixSub: (n: number) => `${n}곳 섞어 찾기`,
  checkName: (r: string) => `${r} 시험`,
  checkSub: (n: number) => `${n}문제 · 시간을 재요`,
  dong: ['동까지 공부하기', '구 하나를 골라 그 구의 동을 익혀요'],
  // 동 단원(계획서 E5): 구 고르기(#/kr/{지역}/emd) · 단원 쪽(#/kr/{지역}/emd/{단원})
  /** 구 고르기 큰 제목: '어느 구의 동을
배울까요?'(word = 구 · 군·구 · 시·군·구) */
  pickTitle: (w: UnitWord) => `어느 ${w.one}의 동을
배울까요?`,
  pickSub: (w: UnitWord) => `${eulReul(w.one)} 하나 고르면 그 안의 동을 이웃끼리 묶은 과로 익혀요`,
  /** 구 고르기 목록 머리: '서울 25개 구' */
  pickHead: (r: string, n: number, w: UnitWord) => `${r} ${n}개 ${w.one}`,
  pickHelp: '이름을 누르면 그곳의 과가 나와요',
  /** 구 고르기 지도 범례: 칸 하나 = 구 하나의 동 진도 */
  pickKey: ['아직', '동을 익히는 중', '동을 다 익힘'],
  pickMap: (r: string) => `${r} 동 진도 지도. 칸을 누르면 그곳 동 단원으로 가요`,
  /** 단원 목록 칸: '17곳 · 3과' */
  unitMeta: (n: number, lessons: number) => `${n}곳 · ${lessons}과`,
  /** 마지막으로 공부한 단원으로 바로 가는 단추 */
  pickLast: (name: string) => `${name} 이어서 배우기`,
  pickLastTag: '최근',
  /** 단원 쪽 라벨: '서울 · 동까지 공부하기' */
  emdLabel: (r: string) => `${r} · 동까지 공부하기`,
  emdDesc: (n: number) => `이웃한 곳끼리 ${n}과로 묶었어요`,
  otherUnits: (w: UnitWord) => `다른 ${w.one} 고르기`,
  toRegion: (r: string) => `${r} 과로 돌아가기`,
  // 일반구 단원(계획서 N5 · E7): #/kr/{지역}/gu
  /** 일반구 단원 쪽 라벨: '경기 · 일반구 공부하기' */
  guLabel: (r: string) => `${r} · 일반구 공부하기`,
  guDesc: '구가 있는 시마다 한 과예요. 동을 배우기 전에 구부터 익혀요',
  /** 지역 쪽·홈·구 고르기의 일반구 단원 링크: '일반구 24곳 공부하기' */
  guGo: (n: number) => `일반구 ${n}곳 공부하기`,
  /** 구 고르기 지도의 넓은 화면 고르기(전체 · 북서부 …) */
  pickAll: '전체',
  pickScreens: '지도 범위',
  /** 구 고르기 넓은 화면 단추 글: '북서부'(지역 화면 이름 그대로) */
  screenTab: (s: Screen) => s.ko,
  /** 구 고르기 시 묶음 머리의 구 수: '수원시 4개 구' 의 '4개 구' */
  siGu: (n: number) => `${n}개 구`,
  loading: '지도를 불러오는 중이에요',
  more: '더 알아보기',
  seoulMore: '서울 25개 구 알아보기',
  // 과 시작 카드
  newNames: '2026년 7월부터 새 구 이름이에요(검단구·서해구 등)',
  startSub: (resume: boolean): string => (resume ? '하던 곳부터 이어서 할 수 있어요' : '처음이면 하나씩 만나며 배워요'),
  resumeAt: (n: number, t: number) => `이어서 하기 · ${n}/${t}`,
  restart: '처음부터 다시',
  learn: '배우기 시작',
  quick: '이미 알아요 · 바로 찾기',
  quickNoteStart: (other: string | null) => `바로 찾기에서 맞힌 곳은 배우기를 건너뛰어요${other ? ` · 하던 ${other}는 새로 시작하면 처음부터예요` : ''}`,
  /** 과 시작 지도 범례: 이 과의 칸(노랑 + 굵은 테두리) */
  thisLesson: '이번 과',
  // 과 요약
  /** 과 요약 숫자 칸 이름: [새로 채운 곳, 한 번에 맞힌 곳] */
  sumStatNames: ['새로 채운 곳', '한 번에 맞힌 곳'],
  sumTitle: (no: string) => `${no} 끝!`,
  sumMap: '이번 과에서 칠한 곳',
  nextLesson: (x: string) => `다음: ${x}`,
  nextMix: (r: string) => `다음: ${r} 전체 연습`,
  home: '홈으로',
  tomorrowReview: (n: number) => `내일 복습 ${n}곳이 홈에 나와요`,
  // 시험 결과
  resultTitle: (r: string) => `${r} 시험 결과`,
  time: (s: number) => `${Math.floor(s / 60)}분 ${s % 60}초`,
  resultMap: '시험 결과 지도: 흰 칸이 틀린 곳',
  /** 시험 결과 지도 범례: 맞힌 칸(틀린 칸은 wrongList) */
  resultKey: '맞힌 곳',
  wrongList: '틀린 곳',
  answer: (n: string) => `정답 <b>${n}</b>`,
  mine2: (n: string) => `내 답 ${n}`,
  allRight: '모두 맞혔어요!',
  again: '다시 보기',
  bestNew: '내 최고 기록을 넘었어요!',
  bestLine: (s: number, t: number, time: string) => `내 최고 기록 ${s}/${t} · ${time}`,
  bestTag: (s: number, t: number, time: string) => `최고 ${s}/${t} · ${time}`,
  // 복습 없음·랭킹
  noReview: '오늘 복습할 곳이 없어요',
  noReviewSub: (t: number) => (t ? `내일 ${t}곳이 나와요` : '과를 마치면 다음 날부터 복습이 나와요'),
  rank: '랭킹', rankTitle: '랭킹은 준비 중이에요', rankSub: '공부는 로그인 없이 할 수 있어요',
  // 둘러보기
  exploreTitle: (r: string) => `${r} 지도 보기`,
  hideNames: '이름 가리기', fillColor: '채움 색',
  exploreAria: (r: string) => `${r} 이름 지도`,
  exploreEmpty: (r: string) => `${r}의 곳을 누르면 위치와 이웃이 나와요`,
  touching: '맞닿은 곳',
  practice: (no: string) => `이곳이 든 ${no} 연습하기`,
  readMore: '자세히 읽기',
  source: '행정동 경계: 통계청 SGIS(공공누리 제1유형) · vuski/admdongkor(CC BY 4.0), 단순화·합침 가공',
  /** 동 단원 둘러보기의 출처 줄 덧말(영어만 — 동 영어 이름의 근거). 한국어는 없음 */
  sourceEmd: '',
  // 그 밖
  mapFail: '지도를 불러오지 못했어요. 연결을 확인하고 새로 고쳐 주세요',
  loadFail: ['지도를 불러오지 못했어요', '연결을 확인하고 새로 고쳐 주세요'],
  reviewEnd: '오늘 복습 끝! 칠한 곳이 더 단단해졌어요',
  mixEnd: (r: string) => `${r} 전체 연습 끝!`,
  back: '뒤로',
  /** 섬 상자 글(축척은 상자마다 막대로 — map/isles.ts insetScale. 2026-11-15 전에는 '먼 섬 · 축척 다름') */
  inset: '먼 섬',
  isles: '섬',
  /** 확대 상자 글(과 시작·요약 지역 전체 지도에서 이번 과가 아주 작을 때 — map/zoombox.ts). 옆에 그 상자의 축척 막대 */
  zoom: '확대',
  /** 넓은 판에서 화면이 바뀔 때 알림: '경기 남서부' */
  screenName: (r: string, s: Screen) => `${r} ${s.ko}`,
};
export type UI = typeof UI_KO;

/* ---------- 영어 ---------- */

const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
/** 일반구 주소 이름(slug)의 시·구: 'suwon-si-jangan-gu' → ['suwon-si', 'jangan-gu'] */
const GU_SLUG = /^(.+?-si)-(.+)$/;
/** 주소 이름 → 영어 이름: 'jongno-gu' → 'Jongno-gu', 'suwon-si-jangan-gu' → 'Suwon-si Jangan-gu'(src/lib/regions.ts enOfSlug 와 같은 셈 — 동 단원 파일 en 과 256/256 같다) */
export const enOfSlug = (sl: string) => { const m = GU_SLUG.exec(sl); return m ? `${cap(m[1])} ${cap(m[2])}` : cap(sl); };
/** 동 짧은 이름(설계안 EN_EMD 3.3 · D101 — tools/roma.mjs emdShort 와 같은 셈): '-dong' 만 떼고(남는 글이 4자 미만이면 그대로) '-eup'·'-myeon' 은 남긴다 */
export const emdShortEn = (en: string) => { const s = en.replace(/-dong$/, ''); return s !== en && s.length >= 4 ? s : en; };
/**
 * 영어 곳 이름(설계안 EN_EMD 5.2): 동은 판의 en(옛 캐시라 없으면 한글 — 숫자 slug 는 어떤 경우에도 쓰지 않는다, 5.4), 시·도 단원의 곳은 지역 표 en('Jeonnam-Gwangju'),
 * 일반구 단원의 곳은 주소 이름의 구('Jangan-gu' — 시는 fullName·fullPre 가 붙인다), 그 밖(시·군·구)은 주소 이름('Gangnam-gu')
 */
const enName = (it: Item): string => {
  if (it.id.startsWith('kr:emd:')) return it.en || it.ko;
  if (it.id.startsWith('kr:sido:')) return sidoByCode(it.id.slice(8))?.en ?? cap(it.slug);
  const g = it.si ? GU_SLUG.exec(it.slug) : null;
  return g ? cap(g[2]) : cap(it.slug);
};
const enPlace = (reg: Registry, id: string) => { const p = reg.place(id); return p ? enName(p.item) : id; };
const DIR_EN: Record<Dir8, string> = { E: 'east', NE: 'northeast', N: 'north', NW: 'northwest', W: 'west', SW: 'southwest', S: 'south', SE: 'southeast' };
/** 'a' · 'a or b' · 'a, b or c'(listAnd 는 'and') */
const listOr = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`);
const listAnd = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
/** 동 단원의 곳 갈래 낱말(읍·면·동 차례 — 한국어 emdKinds 와 같은 차례): [홑, 겹]. 동 단원이 아니면 [] */
const emdWordsEn = (e: ReturnType<typeof ends>): [string, string][] =>
  (emdKinds(e) ? ([e.eup && ['town', 'towns'], e.myeon && ['township', 'townships'], e.dong && ['neighborhood', 'neighborhoods']].filter(Boolean) as [string, string][]) : []);
/** 동 단원 수 글: 한 갈래면 그 낱말('17 neighborhoods'), 여럿이면 '25 towns, townships and neighborhoods'. 동 단원이 아니면 '' */
const emdCountEn = (e: ReturnType<typeof ends>) => { const w = emdWordsEn(e); return !w.length ? '' : w.length === 1 ? plural(e.n, w[0][0], w[0][1]) : `${e.n} ${listAnd(w.map((x) => x[1]))}`; };
/**
 * 지도 맥락 이름(이웃 땅)의 영어: 시·도는 지역 표 en(16곳, 계획서 E8 · N26). 영어 이름을 확인하지 않은 시·도(enChecked false — Q5. 전남광주는 2026-11-15 켬)는 ''
 * (지도에 이름을 두지 않는다 — 한글을 영어 화면에 섞지 않게)
 */
const sidoEn = (code: string) => { const s = sidoByCode(code); return s ? (s.enChecked ? s.en : '') : undefined; };
/**
 * 바다 이름(영어 — 지도 바다 이름표, map/sea.ts SEA_KO 의 짝. 2026-11-17): 국토지리정보원 '대한민국 국가지도집' 영문판 'Ocean' 쪽(nationalatlas.ngii.go.kr/pages/page_745.php)의 표기 —
 * 'East Sea'(동해 — 정부가 나라 밖에 쓰는 이름)·'Yellow Sea'(서쪽 바다. 'West Sea' 는 그 쪽에 없다), 남쪽 바다는 그 쪽이 'South Sea' 와 'Korea Strait' 를 함께 쓴다(한국어 '남해'의 짝으로 'South Sea'.
 * 나라 밖에서는 'Korea Strait' 가 통용 — 변도성·최병주 2018, 한국해양학회지 바다 23권 3호의 표기 조사)
 */
const SEA_EN: Record<string, string> = { 'sea:w': 'Yellow Sea', 'sea:s': 'South Sea', 'sea:e': 'East Sea' };
function plural(n: number, one: string, many: string) { return `${n} ${n === 1 ? one : many}`; }
/** 고르기 문제의 단위 낱말: 시·도 단원 'province or city', 동 단원 'neighborhood' · 'town, township or neighborhood', 그 밖 'city or county' 등(전과 같음) */
const unitEn = (r: Region) => {
  if (r.layer === 'sido') return 'province or city';
  const e = ends(r);
  const w = emdWordsEn(e);
  if (w.length) return listOr(w.map((x) => x[0]));
  return [e.si && 'city', e.gun && 'county', e.gu && 'district'].filter(Boolean).join(' or ');
};
/** 과 카드 네모 줄 설명에서 칸 상태 이름을 문장 속 말로('6 places, all in the next lesson') */
const EN_STATE: Record<string, string> = { 'Next lesson': 'in the next lesson', 'First lesson': 'in the first lesson', 'Not yet': 'not filled yet' };
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const UI_EN: UI = {
  lang: 'en',
  site: 'Fill the Map',
  tagline: "Learn Korea's administrative regions on a blank map",
  path: (p: string) => `en/${p}`,
  name: enName,
  region: (r: Region) => r.en,
  // 영어 과 이름이 없으면(옛 캐시 단원 파일 — 동·일반구 과) 한글 과 이름(EN_EMD 5.4)
  lesson: (l: Lesson) => l.en || l.title,
  lessonNo: (no: number) => `lesson ${no}`,
  count(r: Region): string {
    if (r.layer === 'sido') return plural(r.items.length, 'province or city', 'provinces and cities');
    const e = ends(r);
    const emd = emdCountEn(e);
    if (emd) return emd;
    if (!e.si && e.gun && e.gu) return guFirst(r.items.map((it) => it.ko), r.key)
      ? `${plural(e.gu, 'district', 'districts')}, ${plural(e.gun, 'county', 'counties')}`
      : `${plural(e.gun, 'county', 'counties')}, ${plural(e.gu, 'district', 'districts')}`;
    if (e.si && e.gun && e.gu) return `${e.n} cities, counties and districts`;
    if (e.si && e.gun) return `${e.n} cities and counties`;
    if (e.si && e.gu) return `${e.n} cities and districts`;
    if (!e.si && !e.gun && !e.gu) return plural(e.n, 'place', 'places');
    return plural(e.n, e.si ? 'city' : e.gun ? 'county' : 'district', e.si ? 'cities' : e.gun ? 'counties' : 'districts');
  },
  lessonCount(r: Region, ids: string[]): string {
    if (r.layer === 'sido') return plural(ids.length, 'province or city', 'provinces and cities');
    const e = ends(r, ids);
    const emd = emdCountEn(e);
    if (emd) return emd;
    const kinds = [e.si && 'cities', e.gun && 'counties', e.gu && 'districts'].filter(Boolean);
    return `${ids.length} ${kinds.length === 1 ? kinds[0] : 'places'}`;
  },
  // 강 띠는 한강, 북한은 'North Korea', 일본(E15 경남 지도의 대마도)은 'Japan'. 동 단원 지도의 이웃 땅(id 가 있는 칸)은 판의 영어 이름(en — 'Seongbuk-gu',
  // 'Cheonan-si Dongnam-gu')이고 en 이 없으면(옛 캐시) '' — 한글을 영어 지도에 두지 않는다(EN_EMD 5.4). 일반구 단원의 나머지 칸은 ctxNamer 가 레지스트리 이름을 en 으로 넘긴다.
  // 그 밖(지역 지도의 이웃 시·도)은 지역 표 영어 이름(확인하지 않은 시·도는 '' — 지도에 두지 않음), 표에 없으면 원래 글.
  // 바다 이름(map/sea.ts — sido 'sea:w'·'sea:s'·'sea:e', 2026-11-17)은 SEA_EN
  ctxName: (n: CtxCell) => (n.sido === 'water' ? 'Han River' : n.sido === 'kp' ? 'North Korea' : n.sido === 'jp' ? 'Japan'
    : n.sido in SEA_EN ? SEA_EN[n.sido]
    : n.en !== undefined ? n.en : n.id ? '' : sidoEn(n.sido) ?? n.text),
  /**
   * 단원 이름(오늘 복습 라벨·문제 앞): 동 단원은 단원 영어 이름('Jongno-gu'), 같은 이름이 여러 시·도에 있으면 지역(묶음) 이름을 붙인다('Jung-gu, Busan' ·
   * 'Dong-gu, Jeonnam-Gwangju' — 한국어 mixName 과 같은 규칙). 단원 파일을 받기 전이면 동 색인 주소 이름으로(enOfSlug). 일반구 단원·시·도 단원·지역은 그 영어 이름
   */
  unitName(reg: Registry, key: string): string | undefined {
    const r = reg.region(key);
    if (r && (!r.unit || r.unit.gu)) return r.en;
    const ref = reg.unit(key);
    const base = r?.en || (ref ? enOfSlug(ref.index.slug) : undefined);
    const mix = reg.mixName(key);
    if (!base || mix === undefined || mix === (r?.ko ?? ref?.index.ko)) return base;
    const area = reg.areaOf(key) ?? '';
    return `${base}, ${partOf(area, ref?.code ?? r?.unit?.code ?? '')?.en ?? reg.region(area)?.en ?? ''}`;
  },
  pickName: (u: UnitRef) => enOfSlug(u.index.slug),
  /**
   * 시 → city, 군 → county, 구 → district(한국어 unitWordKo 와 같은 끝 글자·차례 — 구를 먼저 쓰는 지역은 'district or county'): 홑 꼴은 'or'('city, county or district'),
   * 겹 꼴은 'and'('cities, counties and districts'). 시·군·구가 없으면 fallback 글자('구' · '시')로
   */
  unitWord(names: string[], region: string, fallback: string): UnitWord {
    const EN: Record<string, [string, string]> = { 시: ['city', 'cities'], 군: ['county', 'counties'], 구: ['district', 'districts'] };
    const of = (ks: string[]) => ks.filter((k) => EN[k]).map((k) => EN[k]);
    const w = of(unitWordKo(names, region).split('·'));
    const use = w.length ? w : of([fallback]).length ? of([fallback]) : [['place', 'places'] as [string, string]];
    return { one: listOr(use.map((x) => x[0])), many: listAnd(use.map((x) => x[1])) };
  },
  guTitle: (_unit: string, parent: string, n: number) => `${parent} · ${plural(n, 'city district', 'city districts')}`,
  dir: (d: Dir8) => DIR_EN[d],
  tap: (t: TapMsg) => ({ ambiguous: 'Tap again, a little closer in', outside: 'Pick one of the bright areas', river: 'Tap on land' })[t],
  prompt(reg: Registry, mode: 'meet' | 'choose' | 'find', id: string, b: (s: string) => string): string {
    const p = reg.place(id)!;
    if (mode === 'meet') return `This is ${b(enName(p.item))}`;
    if (mode === 'choose') return `Which ${unitEn(p.region)} is outlined?`;
    return `Find and tap ${b(enName(p.item))}`;
  },
  line: () => '',
  // 단원이 섞이는 화면의 곳 이름(N12): 동은 '곳, 단원'('Cheongunhyoja-dong, Jongno-gu' · 'Jungang-dong, Jung-gu, Busan' — 단원 이름은 unitName),
  // 일반구는 'Suwon-si Jangan-gu'(한국어 '수원시 장안구'와 같은 꼴), 같은 이름이 여러 지역에 있는 시·군·구(레지스트리가 full 을 붙임)는 'Jung-gu, Busan'(E11).
  // 지역 안 묶음(지역 표 parts — 전남광주의 자치구 5곳, E16)에 든 곳은 묶음 이름('Dong-gu, Jeonnam-Gwangju' — 2026-11-15 법정 약칭으로 바꾸며 지역 영어 이름과 맞춤, 전에는 'Dong-gu, Gwangju')
  fullName(reg: Registry, id: string): string {
    const p = reg.place(id);
    if (!p) return id;
    const g = p.region.unit?.gu ? GU_SLUG.exec(p.item.slug) : null;
    if (g) return `${cap(g[1])} ${cap(g[2])}`;
    if (p.region.unit && !p.region.unit.gu) return `${enName(p.item)}, ${UI_EN.unitName(reg, p.region.key) ?? p.region.en}`;
    return p.item.full && !p.region.unit ? `${enName(p.item)}, ${partOf(p.region.key, id)?.en ?? p.region.en}` : enName(p.item);
  },
  // 오늘 복습 문제의 앞 이름: 일반구는 시('Suwon-si'), 같은 이름이 여러 지역에 있는 시·군·구는 지역('Busan'). 동은 play.ts 가 단원 이름(unitName)을 붙인다
  fullPre(reg: Registry, id: string): string | undefined {
    const p = reg.place(id);
    const g = p?.region.unit?.gu ? GU_SLUG.exec(p.item.slug) : null;
    if (g) return cap(g[1]);
    return p?.item.full && !p.region.unit ? partOf(p.region.key, id)?.en ?? p.region.en : undefined;
  },
  right: (reg: Registry, id: string, first: boolean) => (first ? `Correct! ${enPlace(reg, id)}` : enPlace(reg, id)),
  wrong(reg: Registry, w: Wrong, chose: boolean) {
    const t = enPlace(reg, w.target), p = enPlace(reg, w.picked);
    return {
      title: chose ? `You chose ${p}` : `You tapped ${p}`,
      where: w.adjacent ? `${t} borders ${p} on the ${DIR_EN[w.dir]}` : `${t} lies ${DIR_EN[w.dir]} of ${p}`,
      act: chose ? `The outlined area is ${t}` : `Tap the marked ${t} once`,
    };
  },
  isleWhere: (reg: Registry, id: string, inIsle: boolean) => (inIsle ? `${enPlace(reg, id)} is in its own island box` : `${enPlace(reg, id)} is on the main map`),
  dontKnow: (reg: Registry, id: string) => ({ title: `This is ${enPlace(reg, id)}`, act: 'Tap it once' }),
  fixed: (reg: Registry, id: string) => `This is ${enPlace(reg, id)}`,
  meetAct: 'Tap the outlined area',
  next: 'Next',
  hint: 'Hint', hintUsed: 'Hint used', dontKnowBtn: "I don't know",
  checkNote: 'No hints. Each tap is final',
  quickNote: 'No hints. The places you get right skip the lesson',
  autoNote: 'Moving on in a moment',
  tapMarked: 'Tap the area marked ○',
  tapOutlined: 'Tap the outlined area',
  useOptions: 'Pick an answer below',
  exitAria: 'Stop', exitQ: 'Stop here?', stay: 'Keep going', leave: 'Stop',
  exitCheck: "If you stop the test now, this attempt's result is not kept",
  exitSaved: 'Your answers so far are saved. You can continue from the home page',
  resetView: '⤢ Whole map',
  sideAria: 'Places in this round',
  st: { no: '✕ Mixed up', ok: '○ Right', met: 'Met', new: 'Not yet' },
  confused: 'Mixed up',
  kind: { review: "Today's review", mix: 'Full practice', check: 'Test' },
  studying: 'Studying',
  promptParts(reg: Registry, mode: 'meet' | 'choose' | 'find', id: string) {
    const p = reg.place(id)!;
    if (mode === 'meet') return { pre: 'This is', big: enName(p.item), post: '' };
    if (mode === 'choose') return { pre: '', big: '', post: `Which ${unitEn(p.region)} is outlined?` };
    return { pre: 'Find and tap', big: enName(p.item), post: '' };
  },
  modeLabel: { meet: 'Meet', choose: 'Choose', find: 'Find it on the map with names hidden' },
  findNote: "It's fine to miss. You'll see which way the answer is",
  qUnit: 'questions',
  stNow: 'Now',
  mapCap: (mode: string) => (mode === 'meet' ? 'Meet it by its label' : 'Map with names hidden'),
  mapHelp: ['Drag to move, scroll to zoom', 'Drag to move, pinch to zoom'],
  playKey: { pick: 'Choices', outlined: 'Outlined', ctxLesson: 'Not this lesson', ctxScreen: 'Not on this screen', ctxOther: 'Other lessons' },
  notes: { saved: 'Your progress is saved in this browser only', noStore: "This window can't save progress. Closing it starts over", inApp: 'You opened this inside an app. Progress stays in that app · A browser such as Chrome or Safari keeps its own record' },
  rangeMap: (r: string, no: string) => `Map of ${r} ${no}`,
  newSub: 'Meet the places one by one on the map, then find them with the names hidden',
  start: 'Start',
  resume: 'Continue',
  questions: (n: number, t: number) => `${n}/${t} questions`,
  reviewAfter: (n: number) => `Today's review (${plural(n, 'place', 'places')}) comes after`,
  reviewTitle: (n: number) => `Today's review: ${plural(n, 'place', 'places')}`,
  reviewStart: 'Start review',
  nextAfterReview: (x: string) => `Next: ${x} (after the review)`,
  doneTitle: (r: string, count: string) => `You've filled all ${count} of ${r}`,
  doneSub: 'Ready for the next region?',
  regionStart: (r: string) => `Start ${r}`,
  checkGo: (r: string) => `Take the ${r} test`,
  nextEyebrow: (rec: boolean) => (rec ? 'Next lesson' : "That's plenty for today"),
  reviewDone: (tomorrow: number) => `Today's review is done${tomorrow ? ` · ${plural(tomorrow, 'place', 'places')} tomorrow` : ''}`,
  fillMap: (r: string) => `Filled map of ${r}`,
  filled: (n: number, f: number, d: number) => (f ? `${f} of ${n} filled · ${d} mastered` : 'Nothing filled yet. The places you study get colored here'),
  namedMap: (r: string) => `See the map of ${r} with names`,
  knowIt: (r: string) => `Already know it · Take the ${r} test`,
  how: 'How it works',
  howSteps: [['① Meet', 'Tap each place with its name shown'], ['② Find', 'Find it with the names hidden'], ['③ Review', 'It comes back the next day']],
  explore: 'Explore regions',
  settings: 'Settings',
  autoNext: ['Go to the next question automatically after a correct answer', 'The first two times you get a place right, its location note is shown and you press [Next] to continue'],
  legend: ['Not yet', 'Learning', 'Learning', 'Mastered'],
  homeTabs: 'Choose a region',
  tabDue: 'review today',
  firstLesson: 'First lesson',
  legendNext: 'Next lesson',
  legendRiver: 'Han River',
  legendAria: 'Map key',
  lessonHead: (lesson: string, count: string) => `${lesson}\nFill in ${count}`,
  places: (n: number) => plural(n, 'place', 'places'),
  reviewHead: (places: string) => `Meet the ${places}\nyou filled, again`,
  reviewSub: 'Meeting them again just as they start to fade makes them stick',
  reviewWhere: (parts: [string, number][]) => parts.map(([r, n]) => `${r} ${n}`).join(' · '),
  doneLabel: (r: string) => `${r} · all filled`,
  regionFull: (r: Region) => r.en,
  asOf: (y: number, m: number) => `Boundaries as of ${MONTHS_EN[m - 1] ?? m} ${y}`,
  masteredNote: 'Mastered places keep their names on the map',
  progAria: (r: string, n: number) => `How much of ${r}'s ${n} places is filled`,
  noLogin: 'No sign-in needed',
  lessonsHead: (r: string, n: number) => `${r} in ${plural(n, 'lesson', 'lessons')}`,   // 과가 하나인 대전·울산 'Daejeon in 1 lesson'(E12 검수)
  lessonsHelp: 'Pick a lesson to start from there',
  mixGo: (r: string) => `Practice all of ${r}`,
  stFilled: (total: number, f: number, d: number, due: number) => `${f === total ? `${f} filled` : `${f} of ${total} filled`}${due ? ` · ${due} to review today` : d ? ` · ${d} mastered` : ''}`,
  stNext: (n: number) => `${n} to learn next`,
  stAfterReview: (n: number) => `${n} to learn after the review`,
  stFirst: (n: number) => `${n} to learn first`,
  stNotYet: (n: number) => `${n} · not yet`,
  dotsAria(total: number, parts: [string, number][]) {
    const say = (s: string) => EN_STATE[s] ?? s.toLowerCase();
    if (parts.length !== 1) return `${plural(total, 'place', 'places')}: ${parts.map(([s, n]) => `${n} ${say(s)}`).join(', ')}`;
    return parts[0][0] === 'Not yet' ? `${plural(total, 'place', 'places')}, none filled yet` : `${plural(total, 'place', 'places')}, all ${say(parts[0][0])}`;
  },
  // 짧은 이름: 동은 '-dong' 만 뗀다(emdShortEn — 'Gaepo 1' · 'Bon-dong' · 'Byeollae-myeon', 영어 이름이 없는 옛 캐시는 한글 그대로),
  // 시·도 단원의 곳은 줄이지 않는다('Jeonnam-Gwangju'), 시·군·구·일반구는 '-gu'·'-si'·'-gun' 을 뗀다('Jongno' · 'Jangan')
  short: (it: Item) => (it.id.startsWith('kr:emd:') ? (it.en ? emdShortEn(it.en) : it.ko) : it.id.startsWith('kr:sido:') ? enName(it) : enName(it).replace(/-(gu|si|gun)$/, '')),
  filledNone: 'Nothing filled yet. The places you study get colored on the map',
  filledZero: (n: number) => `0 of ${n} filled`,
  hubs: fromTable((s) => s.hub?.en),
  pickerLink: ['All regions', 'Pick a region to study on the map of Korea →'] as [string, string],
  otherTab: 'More',
  otherTabMore: (n: number) => `(${plural(n, 'more region', 'more regions')})`,
  othersSoon: (n: number) => `${plural(n, 'other region', 'other regions')} · coming soon`,
  regionsTitle: 'Where would you like to study?',
  regionDesc: fromTable((s) => s.desc?.en),
  regionMeta: (count: string, n: number) => `${count} · ${plural(n, 'lesson', 'lessons')}`,
  filledTag: (f: number, n: number) => `${f}/${n} filled`,
  notYet: 'Not yet',
  soon: 'Coming soon',
  pickerMap: 'Map of Korea. Tap an open region to go there',
  // 모두 열렸으면(2026-11-16 영어 동 공부부터 세종·제주도 열림) 한국어 '전국 시·도 16곳'처럼 수만
  pickerCap: (open: number, all: number) => (open === all ? `All ${all} provinces and cities` : `${open} of ${all} regions open`),
  koreaHead: 'Provinces at a glance',
  regionsCount: (n: number) => plural(n, 'region', 'regions'),
  pickerSub: 'Pick a region on the map or in the list. Regions not open yet are grayed out',
  pickerSubAll: 'Pick a region on the map or in the list',
  groupName: (g: string) => ({ 수도권: 'Capital area', 강원: 'Gangwon', 충청: 'Chungcheong', 호남: 'Honam', 영남: 'Yeongnam', 제주: 'Jeju' })[g] ?? g,
  mainMeta: (n: number, lessons: number) => `${plural(n, 'place', 'places')} · ${plural(lessons, 'lesson', 'lessons')}`,
  unitMapLabel: (r: string) => `Filled map of ${r}. Tap a place to read about it`,
  reviewChip: (n: number) => `Today's review ${n} →`,
  order: 'Study path',
  tagResume: (n: number, t: number) => `${n}/${t} continue`,
  tagDone: '✓ Done', tagRec: 'Up next',
  mixName: (no: number, r: string) => `Lesson ${no} · All of ${r}`,
  mixSub: (n: number) => `Find all ${n}, mixed`,
  checkName: (r: string) => `${r} test`,
  checkSub: (n: number) => `${n} questions · timed`,
  dong: ['Down to neighborhoods', 'Pick a district and learn its dong'],
  // 동 단원(설계안 EN_EMD — 2026-11-16 전에는 영어 앱에 열지 않아 'Which district?' 하나였다). 낱말은 unitWord: 'Which city or county?' · 'Seoul: 25 districts'
  pickTitle: (w: UnitWord) => `Which ${w.one}?`,
  pickSub: (w: UnitWord) => `Pick a ${w.one} to learn its neighborhoods`,
  pickHead: (r: string, n: number, w: UnitWord) => `${r}: ${n} ${n === 1 ? w.one : w.many}`,
  pickHelp: 'Pick a name to see its lessons',
  pickKey: ['Not yet', 'Learning', 'Mastered'],
  pickMap: (r: string) => `Map of ${r}`,
  unitMeta: (n: number, lessons: number) => `${plural(n, 'place', 'places')} · ${plural(lessons, 'lesson', 'lessons')}`,
  pickLast: (name: string) => `Continue ${name}`,
  pickLastTag: 'Recent',
  emdLabel: (r: string) => `${r} · neighborhoods`,
  emdDesc: (n: number) => `${plural(n, 'lesson', 'lessons')} of neighbors`,
  otherUnits: (w: UnitWord) => `Pick another ${w.one}`,
  toRegion: (r: string) => `Back to ${r}`,
  // 일반구 단원(EN_EMD — 2026-11-16 부터 영어 앱에도 열림)
  guLabel: (r: string) => `${r} · city districts`,
  guDesc: 'One lesson per city with districts',
  guGo: (n: number) => `Learn ${plural(n, 'city district', 'city districts')}`,
  pickAll: 'All',
  pickScreens: 'Map area',
  // 화면 영어 이름은 토스트 꼴('Gyeonggi, northwest' — 첫 글자 소문자)이라 단추에서는 첫 글자를 대문자로('All · Northwest · Northeast')
  screenTab: (s: Screen) => cap(s.en || s.ko),
  siGu: (n: number) => plural(n, 'district', 'districts'),
  loading: 'Loading the map',
  more: 'Read more',
  seoulMore: "About Seoul's 25 districts",
  newNames: 'New district names from July 2026 (Geomdan-gu, Seohae-gu and more)',
  startSub: (resume: boolean) => (resume ? 'You can pick up where you left off' : 'New here? Meet them one by one'),
  resumeAt: (n: number, t: number) => `Continue · ${n}/${t}`,
  restart: 'Start over',
  learn: 'Start learning',
  quick: 'Already know them · Quick find',
  quickNoteStart: (other: string | null) => `Places you get right in quick find skip the lesson${other ? ` · Starting this resets your unfinished ${other}` : ''}`,
  thisLesson: 'This lesson',
  sumStatNames: ['Newly filled', 'Right first time'],
  sumTitle: (no: string) => `${no.replace('lesson', 'Lesson')} done!`,
  sumMap: 'What you filled in this lesson',
  nextLesson: (x: string) => `Next: ${x}`,
  nextMix: (r: string) => `Next: all of ${r}`,
  home: 'Home',
  tomorrowReview: (n: number) => `${plural(n, 'place', 'places')} to review tomorrow on the home page`,
  resultTitle: (r: string) => `${r} test results`,
  time: (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
  resultMap: 'Test result map: white areas were wrong',
  resultKey: 'Right',
  wrongList: 'Missed',
  answer: (n: string) => `Answer <b>${n}</b>`,
  mine2: (n: string) => `You: ${n}`,
  allRight: 'All correct!',
  again: 'Try again',
  bestNew: 'A new personal best!',
  bestLine: (s: number, t: number, time: string) => `Your best: ${s}/${t} · ${time}`,
  bestTag: (s: number, t: number, time: string) => `best ${s}/${t} · ${time}`,
  noReview: 'Nothing to review today',
  noReviewSub: (t: number) => (t ? `${plural(t, 'place', 'places')} tomorrow` : 'Finish a lesson and reviews start the next day'),
  rank: 'Ranking', rankTitle: 'The ranking is coming soon', rankSub: 'You can study without signing in',
  exploreTitle: (r: string) => `Map of ${r}`,
  hideNames: 'Hide names', fillColor: 'Filled colors',
  exploreAria: (r: string) => `Map of ${r} with names`,
  exploreEmpty: (r: string) => `Tap a place in ${r} to see where it is and what it borders`,
  touching: 'Borders',
  practice: (no: string) => `Practice ${no}, which has this place`,
  readMore: 'Read more',
  source: 'Boundaries: Statistics Korea SGIS (KOGL Type 1) · vuski/admdongkor (CC BY 4.0), simplified and merged',
  // 동 단원 둘러보기에만 붙인다(동 이름이 보이는 곳 — 시·군·구 둘러보기와 관문이 닫힌 영어 앱에는 동 이름이 없다)
  sourceEmd: ' · Neighborhood names: Revised Romanization of Korean (numbers as digits)',
  mapFail: "Couldn't load the map. Check your connection and reload",
  loadFail: ["Couldn't load the map", 'Check your connection and reload'],
  reviewEnd: "Today's review is done! Your filled places are stronger now",
  mixEnd: (r: string) => `All of ${r} done!`,
  back: 'Back',
  inset: 'Far islands',
  isles: 'Islands',
  zoom: 'Zoomed in',
  // 영어 화면 이름이 없으면(옛 캐시 단원 파일 — en '') 한글 화면 이름(EN_EMD 5.4)
  screenName: (r: string, s: Screen) => `${r}, ${s.en || s.ko}`,
};

/** 지금 화면 글. main.ts 가 문서의 lang 을 보고 한 번 정한다 */
export let L: UI = UI_KO;
export function setLang(lang: string) {
  L = lang === 'en' ? UI_EN : UI_KO;
}
export const placeName = (reg: Registry, id: string) => { const p = reg.place(id); return p ? L.name(p.item) : id; };
/**
 * 지도 맥락 이름 함수(svgmap opt.ctxName): 일반구 단원의 나머지 칸(rest — 그 지역의 다른 시·군)은 레지스트리의 그 곳 이름(L.name — 'Uijeongbu-si')을 en 으로 넘긴다.
 * 한국어는 칸의 글 그대로(L.ctxName 이 en 을 보지 않는다)
 */
export const ctxNamer = (reg: Registry) => (n: CtxCell): string => {
  const it = n.rest && n.id ? reg.place(n.id)?.item : undefined;
  return L.ctxName(it ? { ...n, en: L.name(it) } : n);
};
/**
 * 오늘 복습(단원이 섞이는 판) 문제의 앞 이름(play.ts band — N12 · E11 · EN_EMD 7.1): 동은 단원 이름(unitName — '종로구' · 'Jongno-gu',
 * 단원을 모르면 지역 이름), 일반구는 시('수원시' · 'Suwon-si'), 같은 이름이 여러 지역에 있는 시·군·구는 지역('부산' · 'Busan'). 그 밖은 undefined.
 * 시험이 두 말을 견줄 수 있게 글 벌(T)을 받는다(기본 = 지금 화면 글)
 */
export function mixPre(reg: Registry, id: string, T: UI = L): string | undefined {
  const p = reg.place(id);
  if (id.startsWith('kr:emd:')) return (p && T.unitName(reg, p.region.key)) ?? (p ? T.region(p.region) : undefined);
  return T.fullPre(reg, id);
}
