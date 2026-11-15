// 지역 표 src/data/sido.json(계획서 NATIONWIDE_PLAN 14.2·14.5): 16 시·도, 칸 값의 범위, 공개 지역이 units.json 과 같은지
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '../..');
const read = (rel: string) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));

type Sido = {
  code: string; key: string; ko: string; full: string; en: string; enChecked: boolean; group: string;
  status: string; emd: string; layer: string; far: { lonLt: number } | null; simplifySggM: number;
  lineRequired: boolean; lonelyOk: string[]; expect: { sgg: number; si: number; emd: number };
  hub: { ko: string[]; en?: string[] } | null;
  openOrder: number | null; gunFirst: boolean;
};
const sidos: Sido[] = read('src/data/sido.json').sidos;
const units: { regions: { key: string; sido: string; ko: string; full: string; en: string; layer: string }[] } = read('src/data/units.json');

test('지역 표: 16행, code·key 가 겹치지 않고 key 는 주소 꼴', () => {
  assert.equal(sidos.length, 16);
  assert.equal(new Set(sidos.map((s) => s.code)).size, 16);
  assert.equal(new Set(sidos.map((s) => s.key)).size, 16);
  for (const s of sidos) {
    assert.match(s.key, /^[a-z-]{2,20}$/, s.key);
    assert.match(s.code, /^\d{2}$/, s.code);
  }
});

test('지역 표: status·emd·layer·group 값이 허용 범위 안', () => {
  for (const s of sidos) {
    assert.ok(['live', 'off'].includes(s.status), `${s.key}.status ${s.status}`);
    assert.ok(['live', 'off'].includes(s.emd), `${s.key}.emd ${s.emd}`);
    assert.ok(['sgg', 'si', 'emd'].includes(s.layer), `${s.key}.layer ${s.layer}`);
    assert.ok(['수도권', '강원', '충청', '호남', '영남', '제주'].includes(s.group), `${s.key}.group ${s.group}`);
    assert.ok(s.far === null || typeof s.far.lonLt === 'number', `${s.key}.far`);
    assert.ok(Number.isInteger(s.simplifySggM) && s.simplifySggM > 0, `${s.key}.simplifySggM`);
    assert.ok(Array.isArray(s.lonelyOk), `${s.key}.lonelyOk`);
  }
});

test('지역 표: 공개 차례(openOrder)는 공개 지역만 1부터 빈틈·겹침 없는 정수, 열지 않은 지역은 null · gunFirst 는 참거짓(E12)', () => {
  // openOrder 는 홈 탭 빈자리·다 채움 단추·정적 쪽 설명 앞 세 이름의 차례다(app/sidos.ts byOpenOrder). 새 지역을 열며(E13~) 빼먹으면
  // 그 지역이 조용히 맨 뒤로 가고, 같은 번호를 주면 차례가 코드 차례로 섞인다 — 그래서 여기서 막는다. 다음에 여는 지역은 지금 가장 큰 번호 + 1
  const live = sidos.filter((s) => s.status === 'live');
  for (const s of sidos) {
    if (s.status === 'live') assert.ok(Number.isInteger(s.openOrder), `${s.key}: 공개 지역인데 openOrder ${s.openOrder}`);
    else assert.equal(s.openOrder, null, `${s.key}: 열지 않은 지역인데 openOrder ${s.openOrder}`);
    assert.equal(typeof s.gunFirst, 'boolean', `${s.key}.gunFirst`);
  }
  assert.deepEqual(live.map((s) => s.openOrder).sort((a, b) => a! - b!), live.map((_, i) => i + 1));
  // 개설 때부터 연 세 지역이 앞(서울·인천·경기 — 처음 온 사람의 탭, 다 채움 단추)
  assert.deepEqual(['seoul', 'incheon', 'gyeonggi'].map((k) => sidos.find((s) => s.key === k)!.openOrder), [1, 2, 3]);
});

test('지역 표: 허브 쪽(hub)이 있는 지역은 공개(live)다', () => {
  // 허브 쪽(src/pages/{key}/)은 판 units.json 의 그 지역을 읽고, 사이트맵·머리글 '지역 지도'·404 갈 곳(src/lib/regions.ts HUBS)에 나온다.
  // 운영 빌드의 판에는 공개 지역만 들어가므로, 공개하지 않은 지역에 hub 가 있으면 빌드가 멈추거나 공부할 수 없는 지역을 가리킨다.
  // 지역을 되돌릴 때(status off)는 hub 도 함께 null 로 하고, 허브 쪽은 noindex 로 둘지 지울지 정한다
  for (const s of sidos) if (s.hub) assert.equal(s.status, 'live', `${s.key}: hub 가 있는데 status ${s.status}`);
});

test('지역 표: 공개 지역이 units.json regions 와 같은 key·같은 차례·같은 값', () => {
  const live = sidos.filter((s) => s.status === 'live');
  assert.deepEqual(live.map((s) => s.key), units.regions.map((r) => r.key));
  for (const r of units.regions) {
    const s = live.find((x) => x.key === r.key)!;
    assert.deepEqual([s.code, s.ko, s.full, s.en, s.layer], [r.sido, r.ko, r.full, r.en, r.layer], r.key);
  }
});

test('지역 표: expect 합이 시·군·구 256(일반구 단위)·230(첫 공부 층)·읍·면·동 3,559', () => {
  const sum = (k: 'sgg' | 'si' | 'emd') => sidos.reduce((t, s) => t + s.expect[k], 0);
  assert.deepEqual([sum('sgg'), sum('si'), sum('emd')], [256, 230, 3559]);
  for (const s of sidos) assert.ok(s.expect.si <= s.expect.sgg, `${s.key}: si ${s.expect.si} > sgg ${s.expect.sgg}`);
});

// 합만 보면 공개가 아닌 두 시·도의 값을 서로 바꿔 적어도 통과하고, 그 지역을 공개하는 날에야 파이프라인이 실패한다.
// 원자료에서 만든 src/data/kr-summary.json 으로 시·도마다 맞춰 본다
type Summary = {
  code: string; name: string; kind: string; si: number; gun: number; gu: number; adminSi: number;
  ilban: number; ilbanSi: string[]; eup: number; myeon: number; dong: number;
};
test('지역 표: 시·도마다 full·expect 가 전국 요약(kr-summary.json)과 같다', () => {
  const summary: Summary[] = read('src/data/kr-summary.json').sidos;
  assert.equal(summary.length, sidos.length);
  for (const s of sidos) {
    const k = summary.find((x) => x.code === s.code);
    assert.ok(k, `${s.key}: kr-summary 에 시·도 ${s.code} 가 없음`);
    assert.equal(s.full, k.name, `${s.key}.full`);
    assert.equal(s.expect.emd, k.eup + k.myeon + k.dong, `${s.key}.expect.emd`);
    // 세종(특별자치시)은 기초 자치단체가 없어 시·도 자신이 한 칸. 그 밖은 일반구 단위 = 시(일반구 있는 시는 빼고) + 일반구 + 군 + 자치구 + 행정시
    const sgg = k.kind === '특별자치시' ? 1 : k.si - k.ilbanSi.length + k.ilban + k.gun + k.gu + k.adminSi;
    const si = k.kind === '특별자치시' ? 1 : k.si + k.gun + k.gu + k.adminSi;
    assert.deepEqual([s.expect.sgg, s.expect.si], [sgg, si], `${s.key}.expect sgg/si`);
  }
});
