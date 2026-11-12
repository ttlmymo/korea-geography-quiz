import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eunNeun, eulReul, ieyo, euro, gwaWa, iGa, wrongKo, dontKnowKo, rightKo, promptKo, unitKo } from '../../src/app/text/ko.ts';
import { wrongInfo } from '../../src/app/core/judge.ts';
import { reg, idOf } from './fixtures.ts';

test('조사: 받침 있음·없음·ㄹ', () => {
  assert.equal(eunNeun('마포구'), '마포구는');
  assert.equal(eunNeun('강화군'), '강화군은');
  assert.equal(eulReul('서대문구'), '서대문구를');
  assert.equal(eulReul('수원시'), '수원시를');
  assert.equal(eulReul('연천군'), '연천군을');
  assert.equal(ieyo('종로구'), '종로구예요');
  assert.equal(ieyo('옹진군'), '옹진군이에요');
  assert.equal(euro('서울'), '서울로');      // ㄹ 받침
  assert.equal(euro('인천'), '인천으로');
  assert.equal(euro('경기'), '경기로');
  assert.equal(gwaWa('인천'), '인천과');
  assert.equal(iGa('경기'), '경기가');
});

test('오답 문장: 마포구는 서대문구의 서쪽 옆(이름표 각도 -172°, 위치 한 줄과 같은 방향)', () => {
  const w = wrongInfo(reg, idOf('마포구'), idOf('서대문구'));
  assert.equal(w.adjacent, true);
  assert.deepEqual(wrongKo(reg, w), {
    title: '서대문구를 눌렀어요',
    where: '마포구는 서대문구의 서쪽 옆이에요',
    act: '표시한 마포구를 한 번 눌러 보세요',
  });
});

test('오답 문장: 맞닿지 않으면 방향, 고르기는 골랐어요', () => {
  const w = wrongInfo(reg, idOf('강남구'), idOf('은평구'));
  assert.equal(w.adjacent, false);
  const t = wrongKo(reg, w, true);
  assert.equal(t.title, '은평구를 골랐어요');
  assert.equal(t.where, '강남구는 은평구에서 남동쪽 방향이에요');
  assert.equal(t.act, '테두리 친 곳은 강남구예요');
});

test('바다 건너 다리 이웃은 옆으로 치지 않는다(영종구·서해구)', () => {
  const w = wrongInfo(reg, idOf('영종구'), idOf('서해구'));
  assert.equal(w.adjacent, false);
  assert.match(wrongKo(reg, w).where, /^영종구는 서해구에서 .+ 방향이에요$/);
});

test('정답·모르겠어요 문장', () => {
  assert.deepEqual(rightKo(reg, idOf('종로구'), true), { title: '맞아요! 종로구', line: '서울 한가운데 북쪽, 경복궁이 있는 곳' });
  assert.equal(rightKo(reg, idOf('종로구'), false).title, '종로구');
  assert.deepEqual(dontKnowKo(reg, idOf('강화군')), { title: '여기가 강화군이에요', act: '한 번 눌러 보세요' });
});

test('문제 문장: 단위 이름은 지역 데이터에서', () => {
  assert.deepEqual(reg.regions.map(unitKo), ['구', '군·구', '시·군']);
  const id = idOf('마포구');
  assert.deepEqual(promptKo(reg, { mode: 'meet', id }), { band: '이곳은 마포구', line: '서대문구 서쪽, 홍대와 월드컵경기장이 있는 곳', act: '테두리 친 칸을 눌러 보세요' });
  assert.deepEqual(promptKo(reg, { mode: 'choose', id }), { band: '테두리 친 칸은 무슨 구일까요?' });
  assert.deepEqual(promptKo(reg, { mode: 'choose', id: idOf('옹진군') }), { band: '테두리 친 칸은 무슨 군·구일까요?' });
  assert.deepEqual(promptKo(reg, { mode: 'choose', id: idOf('수원시') }), { band: '테두리 친 칸은 무슨 시·군일까요?' });
  assert.deepEqual(promptKo(reg, { mode: 'find', id }), { band: '마포구를 찾아 누르세요' });
  assert.deepEqual(promptKo(reg, { mode: 'find', id: idOf('연천군') }), { band: '연천군을 찾아 누르세요' });
});

test('영어 화면 글: 한국어와 같은 항목을 모두 갖추고, 판정 문장이 영어', async () => {
  const { UI_KO, UI_EN } = await import('../../src/app/text/ui.ts');
  assert.deepEqual(Object.keys(UI_EN).sort(), Object.keys(UI_KO).sort());
  for (const k of Object.keys(UI_KO) as (keyof typeof UI_KO)[]) assert.equal(typeof UI_EN[k], typeof UI_KO[k], k);
  const w = wrongInfo(reg, idOf('마포구'), idOf('서대문구'));
  assert.deepEqual(UI_EN.wrong(reg, w, false), { title: 'You tapped Seodaemun-gu', where: 'Mapo-gu borders Seodaemun-gu on the west', act: 'Tap the marked Mapo-gu once' });
  assert.equal(UI_EN.prompt(reg, 'find', idOf('마포구'), (s) => `<b>${s}</b>`), 'Find and tap <b>Mapo-gu</b>');
  assert.equal(UI_EN.prompt(reg, 'choose', idOf('수원시'), (s) => s), 'Which city or county is outlined?');
  assert.equal(UI_EN.count(reg.region('incheon')!), '2 counties, 9 districts');
  assert.equal(UI_EN.count(reg.region('gyeonggi')!), '31 cities and counties');
  assert.equal(UI_KO.count(reg.region('gyeonggi')!), '31개 시·군');
  assert.equal(UI_KO.prompt(reg, 'find', idOf('연천군'), (s) => s), '연천군을 찾아 누르세요');
  assert.equal(UI_EN.line(reg, idOf('마포구')), '');   // 위치 한 줄은 한국어만
  assert.equal(UI_EN.ctxName('41', '경기도'), 'Gyeonggi');
  assert.equal(UI_EN.ctxName('water', '한강'), 'Han River');
});
