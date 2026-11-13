import { test } from 'node:test';
import assert from 'node:assert/strict';
import { afterLesson, type Mastery, type Rec } from '../../src/app/core/mastery.ts';
import { homeCard } from '../../src/app/core/next.ts';
import { cellState, cellStates, tally, tomorrowCount, unfilled } from '../../src/app/core/tally.ts';
import { UI_EN, UI_KO } from '../../src/app/text/ui.ts';
import { idOf, reg } from './fixtures.ts';

const T = 20000;
const ids = (region: string) => reg.region(region)!.items.map((it) => it.id);
const lessonIds = (region: string, no: number) => reg.lesson(region, no)!.items;
const rec = (box: number, due: number | null, more: Partial<Rec> = {}): Rec => ({ box, due, hi: box >= 5 ? 3 : box >= 3 ? 2 : box >= 1 ? 1 : 0, streak: 0, grad: false, front: false, ...more });

test('칸 상태: 칠한 곳은 단계대로, 아직인 곳은 지금 배울 과에 들면 다음 과', () => {
  assert.equal(cellState(3, true), 'mastered');
  assert.equal(cellState(2, false), 'learning');
  assert.equal(cellState(1, true), 'learning');
  assert.equal(cellState(0, true), 'next');
  assert.equal(cellState(0, false), 'none');
});

test('지역 네 칸(다 익힘 / 익히는 중 / 다음 과 / 아직)은 합이 늘 전체와 같다', () => {
  // 시안의 '다음 과가 있는 날': 서울 1·2과 11곳 칠함(그중 2곳 다 익힘), 다음 3과 6곳
  const all = ids('seoul');
  const f: Record<string, number> = Object.fromEntries(all.map((id) => [id, 0]));
  for (const id of [...lessonIds('seoul', 1), ...lessonIds('seoul', 2)]) f[id] = 1;
  f[idOf('종로구')] = 3;
  f[idOf('중구', 'seoul')] = 3;
  const t = tally(all, f, lessonIds('seoul', 3));
  assert.deepEqual(t, { mastered: 2, learning: 9, next: 6, none: 8, filled: 11, total: 25 });
  assert.equal(t.mastered + t.learning + t.next + t.none, t.total);
  // 지금 배울 과가 없으면(다 채움) 다음 과는 0
  assert.equal(tally(all, f).next, 0);
  assert.equal(tally(all, f).none, 14);
});

test('일부만 칠한 과: 칠한 곳은 제 색을 지키고, 노랑(다음 과)은 남은 곳만', () => {
  const l3 = lessonIds('seoul', 3);
  const f: Record<string, number> = Object.fromEntries(l3.map((id, i) => [id, i < 2 ? 2 : 0]));
  assert.deepEqual(unfilled(l3, f), l3.slice(2));
  assert.deepEqual(cellStates(l3, f, l3), ['learning', 'learning', 'next', 'next', 'next', 'next']);
  const t = tally(l3, f, l3);
  assert.equal(t.next, 4);
  assert.equal(t.filled, 2);
  // fills 에 없는 곳은 아직(0)으로 본다
  assert.deepEqual(unfilled(l3, {}), l3);
});

test('내일 복습할 곳 수: homeCard 다음 과 카드의 tomorrow 와 같다', () => {
  const m = afterLesson({}, lessonIds('seoul', 1), T);   // 오늘 마침 → 내일 복습
  assert.equal(tomorrowCount(reg, m, T), 6);
  const card = homeCard({ reg, mastery: m, deck: null, daily: { day: T, n: 6 }, last: null, today: T });
  assert.equal(card.type === 'next' && card.tomorrow, tomorrowCount(reg, m, T));
  // 졸업한 곳·지금 데이터에 없는 곳은 세지 않는다
  const m2: Mastery = { ...m, [idOf('강남구')]: rec(5, null, { grad: true }), 'kr:sgg:99999': rec(1, T + 1) };
  assert.equal(tomorrowCount(reg, m2, T), 6);
});

test('홈 문구(한·영): 큰 제목·과 줄 제목·짧은 이름·과 카드 상태', () => {
  const seoul = reg.region('seoul')!, gg = reg.region('gyeonggi')!, ic = reg.region('incheon')!;
  assert.equal(UI_KO.lessonHead('한강 남쪽 서부', '6개 구'), '한강 남쪽 서부\n6개 구를 채워요');
  assert.equal(UI_KO.lessonHead('서울 서쪽', '5개 시'), '서울 서쪽\n5개 시를 채워요');
  assert.equal(UI_KO.lessonHead('섬과 바다', '3개 군·구'), '섬과 바다\n3개 군·구를 채워요');
  assert.equal(UI_KO.reviewHead(UI_KO.places(4)), '채운 4곳을\n다시 만나요');
  assert.equal(UI_EN.reviewHead(UI_EN.places(1)), 'Meet the 1 place\nyou filled, again');
  assert.equal(UI_KO.lessonsHead('서울', seoul.lessons.length), '서울 다섯 과');
  assert.equal(UI_KO.lessonsHead('인천', ic.lessons.length), '인천 세 과');
  assert.equal(UI_KO.lessonsHead('경기', gg.lessons.length), '경기 일곱 과');
  assert.equal(UI_EN.lessonsHead('Seoul', 5), 'Seoul in 5 lessons');
  assert.equal(UI_KO.reviewWhere([['서울', 4]]), '서울 4곳');
  assert.equal(UI_KO.reviewWhere([['서울', 6], ['경기', 4]]), '서울 6 · 경기 4');
  assert.equal(UI_KO.asOf(2026, 10), '경계 2026년 10월 기준');
  assert.equal(UI_EN.asOf(2026, 10), 'Boundaries as of October 2026');
  const short = (name: string, region?: string) => [UI_KO.short(reg.place(idOf(name, region))!.item), UI_EN.short(reg.place(idOf(name, region))!.item)];
  assert.deepEqual(short('종로구'), ['종로', 'Jongno']);
  assert.deepEqual(short('중구', 'seoul'), ['중', 'Jung']);
  assert.deepEqual(short('수원시'), ['수원', 'Suwon']);
  assert.deepEqual(short('옹진군'), ['옹진', 'Ongjin']);
  assert.equal(UI_KO.stFilled(6, 6, 2, 0), '6곳 채움 · 다 익힘 2');
  assert.equal(UI_KO.stFilled(6, 6, 2, 2), '6곳 채움 · 오늘 복습 2');
  assert.equal(UI_KO.stFilled(5, 5, 0, 0), '5곳 채움');
  assert.equal(UI_KO.stFilled(6, 3, 0, 0), '6곳 중 3곳 채움');
  assert.equal(UI_KO.dotsAria(6, [['다 익힘', 2], ['익히는 중', 4]]), '6곳 중 2곳 다 익힘, 4곳 익히는 중');
  assert.equal(UI_KO.dotsAria(5, [['익히는 중', 5]]), '5곳 모두 익히는 중');
  assert.equal(UI_EN.dotsAria(5, [['Learning', 5]]), '5 places, all learning');
  assert.equal(UI_EN.dotsAria(6, [['Next lesson', 6]]), '6 places, all in the next lesson');
  assert.equal(UI_EN.dotsAria(4, [['Not yet', 4]]), '4 places, none filled yet');
  assert.equal(UI_EN.dotsAria(6, [['Mastered', 2], ['Learning', 4]]), '6 places: 2 mastered, 4 learning');
  // 진도 자리 문구: '여기에'가 아니라 '지도에', 칠한 곳이 없는 탭은 수로
  assert.equal(UI_KO.filledNone, '아직 칠한 곳이 없어요. 공부한 곳이 지도에 칠해져요');
  assert.equal(UI_KO.filledZero(11), '11곳 중 0곳 채움');
  assert.equal(UI_EN.filledZero(11), '0 of 11 filled');
});
