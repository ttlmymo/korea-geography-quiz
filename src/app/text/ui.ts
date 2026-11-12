// 화면 글 두 벌(한국어·영어). 앱은 홈 문서의 lang 으로 하나를 고른다(설계서 7.2: /en/ 은 같은 앱, 영어 문구.
// 위치 한 줄·가이드는 한국어만이라 영어 화면에는 위치 한 줄이 없다)
import type { Dir8, Registry } from '../registry.ts';
import type { Tap, Wrong } from '../core/judge.ts';
import type { Item, Lesson, Region, Screen } from '../types.ts';
import { DIR_KO, TAP_KO, dontKnowKo, eulReul, ieyo, rightKo, unitKo, wrongKo } from './ko.ts';

type TapMsg = Exclude<Tap['type'], 'cell'>;
const ends = (r: Region, ids?: string[]) => {
  const list = ids ? r.items.filter((it) => ids.includes(it.id)) : r.items;
  return { si: list.filter((it) => it.ko.endsWith('시')).length, gun: list.filter((it) => it.ko.endsWith('군')).length, gu: list.filter((it) => it.ko.endsWith('구')).length, n: list.length };
};

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
    const e = ends(r);
    if (!e.si && e.gun && e.gu) return `${e.gun}군 ${e.gu}구`;
    if (e.si && e.gun) return `${e.n}개 시·군`;
    return `${e.n}개 ${e.si ? '시' : e.gun ? '군' : '구'}`;
  },
  lessonCount(r: Region, ids: string[]): string {
    const e = ends(r, ids);
    return `${ids.length}개 ${[e.si && '시', e.gun && '군', e.gu && '구'].filter(Boolean).join('·')}`;
  },
  ctxName: (_sido: string, text: string) => text,
  dir: (d: Dir8) => DIR_KO[d],
  tap: (t: TapMsg) => TAP_KO[t],
  // 문제
  prompt(reg: Registry, mode: 'meet' | 'choose' | 'find', id: string, b: (s: string) => string): string {
    const p = reg.place(id)!;
    if (mode === 'meet') return `이곳은 ${b(p.item.ko)}`;
    if (mode === 'choose') return `테두리 친 칸은 무슨 ${unitKo(p.region)}일까요?`;
    return `${b(p.item.ko)}${eulReul(p.item.ko).slice(p.item.ko.length)} 찾아 누르세요`;
  },
  line: (reg: Registry, id: string) => reg.place(id)?.item.line ?? '',
  right: (reg: Registry, id: string, first: boolean) => rightKo(reg, id, first).title,
  wrong: (reg: Registry, w: Wrong, chose: boolean) => wrongKo(reg, w, chose),
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
  exitCheck: '시험을 그만하면 이번 시험 기록은 남지 않아요',
  exitSaved: '지금까지 푼 것은 저장돼요. 홈에서 이어서 할 수 있어요',
  resetView: '⤢ 전체 보기',
  sideAria: '이번 판의 곳',
  st: { no: '✕ 헷갈림', ok: '○ 맞힘', met: '만남', new: '아직' },
  confused: '헷갈린 곳',
  kind: { review: '오늘 복습', mix: '전체 연습', check: '시험' } as Record<string, string>,
  studying: '공부 중',
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
  doneStamp: (r: string) => `${r}<br>다 채움`,
  doneTitle: (r: string, count: string) => `${r} ${eulReul(count)} 모두 칠했어요`,
  doneSub: '다음 지역으로 넘어가 볼까요?',
  regionStart: (r: string) => `${r} 시작`,
  checkGo: (r: string) => `${r} 시험 보기`,
  nextEyebrow: (rec: boolean) => (rec ? '다음 과' : '오늘은 충분히 했어요'),
  nextTitle: (x: string) => `다음: ${x}`,
  reviewDone: (tomorrow: number) => `오늘 복습 끝${tomorrow ? ` · 내일 ${tomorrow}곳` : ''}`,
  mine: '나의 채움 지도',
  fillMap: (r: string) => `${r} 채움 지도`,
  filled: (n: number, f: number, d: number) => (f ? `${n}곳 중 ${f}곳 채움 · 다 익힘 ${d}` : '아직 칠한 곳이 없어요. 공부한 곳이 여기에 칠해져요'),
  whereFirst: '어디부터 공부할까요?',
  namedMap: (r: string) => `이름이 붙은 ${r} 지도 보기`,
  knowIt: (r: string) => `이미 알아요 · ${r} 시험 보기`,
  otherRegions: '다른 지역:',
  how: '이렇게 공부해요',
  howSteps: [['① 만나기', '이름표를 보며 눌러 봐요'], ['② 찾기', '이름을 가리고 찾아요'], ['③ 복습', '다음 날 다시 나와요']],
  explore: '지역 알아보기',
  seoulHub: ['서울 25개 구', '구마다 위치와 행정동 →'],
  settings: '설정',
  autoNext: ['정답을 맞히면 잠시 뒤 저절로 다음 문제로 넘어가기', '처음 두 번은 위치 한 줄을 읽도록 늘 [다음]을 눌러요'],
  legend: ['아직', '익히는 중', '익히는 중', '다 익힘'],
  // 지역 고르기
  regionsTitle: '어디를 공부할까요?',
  regionDesc: { seoul: ['한강을 사이에 두고 북쪽 14, 남쪽 11', ''], incheon: ['2026년 7월 새 구 이름(제물포·영종·서해·검단)', '새 이름'], gyeonggi: ['서울을 둘러싼 고리', ''] } as Record<string, [string, string]>,
  regionStep: (r: string, count: string, n: number) => `${r} · ${count} · ${n}과`,
  filledTag: (f: number, n: number) => `${f}/${n} 채움`,
  notYet: '아직',
  others: '다른 지역 (준비 중)',
  otherList: ['부산', '대구', '광주·전남(전남광주통합특별시)', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '경북', '경남', '제주'],
  soon: '준비 중',
  // 단원
  unitMapLabel: (r: string) => `${r} 채움 지도. 칸을 누르면 그곳 이야기가 나와요`,
  unitFilled: (f: number, n: number, d: number) => `${f}/${n} 채움 · 다 익힘 ${d}`,
  reviewChip: (n: number) => `오늘 복습 ${n} →`,
  order: '공부 순서',
  tagResume: (n: number, t: number) => `${n}/${t} 이어서`,
  tagDone: '✓ 끝', tagRec: '추천',
  mixName: (no: number, r: string) => `${no}과 ${r} 전체 연습`,
  mixSub: (n: number) => `${n}곳 섞어 찾기`,
  checkName: (r: string) => `${r} 시험`,
  checkSub: (n: number) => `${n}문제 · 시간을 재요`,
  dong: ['동까지 공부하기', '구 하나를 골라 그 구의 동을 익혀요'],
  more: '더 알아보기',
  seoulMore: '서울 25개 구 알아보기',
  sep: '·',
  // 과 시작 카드
  newNames: '2026년 7월부터 새 구 이름이에요(검단구·서해구 등)',
  startSub: (resume: boolean) => (resume ? '하던 곳부터 이어서 할 수 있어요' : '처음이면 하나씩 만나며 배워요'),
  resumeAt: (n: number, t: number) => `이어서 하기 · ${n}/${t}`,
  restart: '처음부터 다시',
  learn: '배우기 시작',
  quick: '이미 알아요 · 바로 찾기',
  quickNoteStart: (other: string | null) => `바로 찾기에서 맞힌 곳은 배우기를 건너뛰어요${other ? ` · 하던 ${other}는 새로 시작하면 처음부터예요` : ''}`,
  // 과 요약
  sumStamp: (no: string) => `${no}<br>끝`,
  sumTitle: (no: string) => `${no} 끝!`,
  sumMap: '이번 과에서 칠한 곳',
  sumStats: (newly: number, ok: number, t: number) => `새로 채운 곳 ${newly} · 한 번에 맞힌 곳 ${ok}/${t}`,
  nextLesson: (x: string) => `다음: ${x}`,
  nextMix: (r: string) => `다음: ${r} 전체 연습`,
  home: '홈으로',
  tomorrowReview: (n: number) => `내일 복습 ${n}곳이 홈에 나와요`,
  // 시험 결과
  resultTitle: (r: string) => `${r} 시험 결과`,
  time: (s: number) => `${Math.floor(s / 60)}분 ${s % 60}초`,
  resultMap: '시험 결과 지도: 흰 칸이 틀린 곳',
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
  // 그 밖
  mapFail: '지도를 불러오지 못했어요. 연결을 확인하고 새로 고쳐 주세요',
  loadFail: ['지도를 불러오지 못했어요', '연결을 확인하고 새로 고쳐 주세요'],
  reviewEnd: '오늘 복습 끝! 칠한 곳이 더 단단해졌어요',
  mixEnd: (r: string) => `${r} 전체 연습 끝!`,
  back: '뒤로',
  inset: '먼 섬 · 축척 다름',
  /** 넓은 판에서 화면이 바뀔 때 알림: '경기 남서부' */
  screenName: (r: string, s: Screen) => `${r} ${s.ko}`,
};
export type UI = typeof UI_KO;

/* ---------- 영어 ---------- */

const enName = (it: Item) => it.slug.replace(/^./, (c) => c.toUpperCase());
const enPlace = (reg: Registry, id: string) => { const p = reg.place(id); return p ? enName(p.item) : id; };
const DIR_EN: Record<Dir8, string> = { E: 'east', NE: 'northeast', N: 'north', NW: 'northwest', W: 'west', SW: 'southwest', S: 'south', SE: 'southeast' };
const SIDO_EN: Record<string, string> = { '11': 'Seoul', '28': 'Incheon', '41': 'Gyeonggi', '51': 'Gangwon', '42': 'Gangwon', '43': 'Chungbuk', '44': 'Chungnam', '30': 'Daejeon', '36': 'Sejong', '47': 'Gyeongbuk', kp: 'North Korea' };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const unitEn = (r: Region) => { const e = ends(r); return [e.si && 'city', e.gun && 'county', e.gu && 'district'].filter(Boolean).join(' or '); };

export const UI_EN: UI = {
  lang: 'en',
  site: 'Fill the Map',
  tagline: "Learn Korea's administrative regions on a blank map",
  path: (p: string) => `en/${p}`,
  name: enName,
  region: (r: Region) => r.en,
  lesson: (l: Lesson) => l.en ?? l.title,
  lessonNo: (no: number) => `lesson ${no}`,
  count(r: Region): string {
    const e = ends(r);
    if (!e.si && e.gun && e.gu) return `${plural(e.gun, 'county', 'counties')}, ${plural(e.gu, 'district', 'districts')}`;
    if (e.si && e.gun) return `${e.n} cities and counties`;
    return plural(e.n, e.si ? 'city' : e.gun ? 'county' : 'district', e.si ? 'cities' : e.gun ? 'counties' : 'districts');
  },
  lessonCount(r: Region, ids: string[]): string {
    const e = ends(r, ids);
    const kinds = [e.si && 'cities', e.gun && 'counties', e.gu && 'districts'].filter(Boolean);
    return `${ids.length} ${kinds.length === 1 ? kinds[0] : 'places'}`;
  },
  ctxName: (sido: string, text: string) => (sido === 'water' ? 'Han River' : SIDO_EN[sido] ?? text),
  dir: (d: Dir8) => DIR_EN[d],
  tap: (t: TapMsg) => ({ ambiguous: 'Tap again, a little closer in', outside: 'Pick one of the bright areas', river: 'Tap on land' })[t],
  prompt(reg: Registry, mode: 'meet' | 'choose' | 'find', id: string, b: (s: string) => string): string {
    const p = reg.place(id)!;
    if (mode === 'meet') return `This is ${b(enName(p.item))}`;
    if (mode === 'choose') return `Which ${unitEn(p.region)} is outlined?`;
    return `Find and tap ${b(enName(p.item))}`;
  },
  line: () => '',
  right: (reg: Registry, id: string, first: boolean) => (first ? `Correct! ${enPlace(reg, id)}` : enPlace(reg, id)),
  wrong(reg: Registry, w: Wrong, chose: boolean) {
    const t = enPlace(reg, w.target), p = enPlace(reg, w.picked);
    return {
      title: chose ? `You chose ${p}` : `You tapped ${p}`,
      where: w.adjacent ? `${t} borders ${p} on the ${DIR_EN[w.dir]}` : `${t} lies ${DIR_EN[w.dir]} of ${p}`,
      act: chose ? `The outlined area is ${t}` : `Tap the marked ${t} once`,
    };
  },
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
  exitCheck: 'If you stop the test now, this attempt is not kept',
  exitSaved: 'Your answers so far are saved. You can continue from the home page',
  resetView: '⤢ Whole map',
  sideAria: 'Places in this round',
  st: { no: '✕ Mixed up', ok: '○ Right', met: 'Met', new: 'Not yet' },
  confused: 'Mixed up',
  kind: { review: "Today's review", mix: 'Full practice', check: 'Test' },
  studying: 'Studying',
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
  doneStamp: (r: string) => `${r}<br>filled`,
  doneTitle: (r: string, count: string) => `You've filled all ${count} of ${r}`,
  doneSub: 'Ready for the next region?',
  regionStart: (r: string) => `Start ${r}`,
  checkGo: (r: string) => `Take the ${r} test`,
  nextEyebrow: (rec: boolean) => (rec ? 'Next lesson' : "That's plenty for today"),
  nextTitle: (x: string) => `Next: ${x}`,
  reviewDone: (tomorrow: number) => `Today's review is done${tomorrow ? ` · ${plural(tomorrow, 'place', 'places')} tomorrow` : ''}`,
  mine: 'My filled map',
  fillMap: (r: string) => `Filled map of ${r}`,
  filled: (n: number, f: number, d: number) => (f ? `${f} of ${n} filled · ${d} mastered` : 'Nothing filled yet. The places you study get colored here'),
  whereFirst: 'Where would you like to start?',
  namedMap: (r: string) => `See the map of ${r} with names`,
  knowIt: (r: string) => `Already know it · Take the ${r} test`,
  otherRegions: 'Other regions:',
  how: 'How it works',
  howSteps: [['① Meet', 'Tap each place with its name shown'], ['② Find', 'Find it with the names hidden'], ['③ Review', 'It comes back the next day']],
  explore: 'Explore regions',
  seoulHub: ["Seoul's 25 districts", 'Where each one is →'],
  settings: 'Settings',
  autoNext: ['Move to the next question by itself after a correct answer', 'The first two times you always press [Next]'],
  legend: ['Not yet', 'Learning', 'Learning', 'Mastered'],
  regionsTitle: 'Where would you like to study?',
  regionDesc: { seoul: ['14 north of the Han River, 11 south', ''], incheon: ['New district names from July 2026 (Jemulpo, Yeongjong, Seohae, Geomdan)', 'New names'], gyeonggi: ['The ring around Seoul', ''] },
  regionStep: (r: string, count: string, n: number) => `${r} · ${count} · ${n} lessons`,
  filledTag: (f: number, n: number) => `${f}/${n} filled`,
  notYet: 'Not yet',
  others: 'Other regions (coming soon)',
  otherList: ['Busan', 'Daegu', 'Gwangju–Jeonnam', 'Daejeon', 'Ulsan', 'Sejong', 'Gangwon', 'Chungbuk', 'Chungnam', 'Jeonbuk', 'Gyeongbuk', 'Gyeongnam', 'Jeju'],
  soon: 'Coming soon',
  unitMapLabel: (r: string) => `Filled map of ${r}. Tap a place to read about it`,
  unitFilled: (f: number, n: number, d: number) => `${f}/${n} filled · ${d} mastered`,
  reviewChip: (n: number) => `Today's review ${n} →`,
  order: 'Study path',
  tagResume: (n: number, t: number) => `${n}/${t} continue`,
  tagDone: '✓ Done', tagRec: 'Up next',
  mixName: (no: number, r: string) => `Lesson ${no} · All of ${r}`,
  mixSub: (n: number) => `Find all ${n}, mixed`,
  checkName: (r: string) => `${r} test`,
  checkSub: (n: number) => `${n} questions · timed`,
  dong: ['Down to neighborhoods', 'Pick a district and learn its dong'],
  more: 'Read more',
  seoulMore: "About Seoul's 25 districts",
  sep: ' · ',
  newNames: 'New district names from July 2026 (Geomdan-gu, Seohae-gu and more)',
  startSub: (resume: boolean) => (resume ? 'You can pick up where you left off' : 'New here? Meet them one by one'),
  resumeAt: (n: number, t: number) => `Continue · ${n}/${t}`,
  restart: 'Start over',
  learn: 'Start learning',
  quick: 'Already know them · Quick find',
  quickNoteStart: (other: string | null) => `Places you get right in quick find skip the lesson${other ? ` · Starting this resets your unfinished ${other}` : ''}`,
  sumStamp: (no: string) => `${no.replace('lesson', 'Lesson')}<br>done`,
  sumTitle: (no: string) => `${no.replace('lesson', 'Lesson')} done!`,
  sumMap: 'What you filled in this lesson',
  sumStats: (newly: number, ok: number, t: number) => `Newly filled ${newly} · Right first time ${ok}/${t}`,
  nextLesson: (x: string) => `Next: ${x}`,
  nextMix: (r: string) => `Next: all of ${r}`,
  home: 'Home',
  tomorrowReview: (n: number) => `${plural(n, 'place', 'places')} to review tomorrow on the home page`,
  resultTitle: (r: string) => `${r} test results`,
  time: (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
  resultMap: 'Test result map: white areas were wrong',
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
  mapFail: "Couldn't load the map. Check your connection and reload",
  loadFail: ["Couldn't load the map", 'Check your connection and reload'],
  reviewEnd: "Today's review is done! Your filled places are stronger now",
  mixEnd: (r: string) => `All of ${r} done!`,
  back: 'Back',
  inset: 'Far islands · not to scale',
  screenName: (r: string, s: Screen) => `${r}, ${s.en}`,
};

/** 지금 화면 글. main.ts 가 문서의 lang 을 보고 한 번 정한다 */
export let L: UI = UI_KO;
export function setLang(lang: string) {
  L = lang === 'en' ? UI_EN : UI_KO;
}
export const placeName = (reg: Registry, id: string) => { const p = reg.place(id); return p ? L.name(p.item) : id; };
