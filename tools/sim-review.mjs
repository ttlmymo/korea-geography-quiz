// 복습량 흉내(계획서 NATIONWIDE_PLAN E4 · N32 · Q7): 실제 core(registry·next·session·questions·mastery)로 매일 오는 학습자를 흉내 내어
// 동 복습을 따로 셀 때(Q7 확정 — 동 몫 하루 30, 사용자 11-14)와 함께 셀 때(운영 중인 옛 규칙 — 하루 30 하나)의 '다 배운 날 · 추천 없는 날 · 늦은 복습'을 잰다.
// 견줌용으로 E4 의 첫 기본값(따로·동 20)도 함께 돈다.
//   node tools/sim-review.mjs --units <emdUnits 가 든 units.json> --emd <단원 파일 폴더> [--out <md 파일>] [--quick]
// 동 단원 파일은 node pipeline/build-geo.mjs --preview 출력(커밋 금지)의 사본을 준다. 주지 않으면 지금 판 폴더(동 공개 지역만 — E6 은 서울만)를 쓰고,
// 동 색인이 없는 지역은 동 단원 없이 흉내 낸다(그때는 주의 글을 낸다).
// 학습자: 날마다 온다 · 낼 수 있는 복습을 다 한다(몫마다 하루 상한 안, 복습 첫 시도 정답률 p, 틀리면 다시 문제는 맞힘) ·
//   과는 하루 1과까지(과 안에서는 모두 맞힘). '추천 따름'은 홈 주 카드가 추천할 때만, '매일 한 과'는 추천과 상관없이.
//   공부 차례는 홈 카드가 고르는 대로 하되, 지역을 다 칠한 날('다 채움' 카드) 고르는 길이 셋:
//   구 먼저 = 다음 지역 시·군·구 → 시·군·구를 다 마치면 동 단원(색인 차례) / 지역마다 = 그 지역 동 단원 → 다음 지역 시·군·구
//   (지역마다 길에서는 앞 지역의 동 복습이 다음 지역 시·군·구 공부와 겹친다 — 동 복습을 따로 세는 까닭)
//   구 도중에 동 = 첫 지역 시·군·구 MID_AFTER 과를 칠한 다음 날 그 지역 첫 동 단원을 연다(잠금이 없어 흔한 길, N9). 그 뒤는 홈 카드대로
//   구 도중에 동 계속 = 위와 같이 시작하고, 날마다 마지막 동 단원이 없거나 다 칠했으면 그 지역 다음 동 단원을 연다(동을 먼저 하려는 사람)
//   (두 길 모두 마지막 동 단원의 다음 과와 시·군·구 다음 과가 겹친다 — 차례 규칙 rule.unitNext 'yield'·'unit'·'sgg' 를 견준다)
// 기준(N32 [제안]): 추천 따름 학습자의 '추천 없는 날 30% 이하', '늦은 복습 20% 이하'. 못 맞추면 (나) '동만 졸업을 앞당김'
//   (동은 상자 5 에 닿으면 바로 졸업 — 상자 5 의 두 번 복습을 건너뜀)을 더한 안도 잰다
import fs from 'node:fs';
import path from 'node:path';
import { DATA_VER } from '../src/consts.ts';
import { createRegistry } from '../src/app/registry.ts';
import { createDeck, current, isDone } from '../src/app/core/deck.ts';
import { get, MAX_BOX } from '../src/app/core/mastery.ts';
import { DAILY_CAP, EMD_DAILY_CAP, EMD_UNIT_NEXT, homeCard, isEmd, NEW_SLACK, nextLesson, todayReview } from '../src/app/core/next.ts';
import { lessonQuestions, reviewQuestions } from '../src/app/core/questions.ts';
import { rngFrom } from '../src/app/core/rng.ts';
import { step } from '../src/app/core/session.ts';
import { studyKeys } from '../src/app/core/units.ts';

const ROOT = path.join(import.meta.dirname, '..');
const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const VER_DIR = path.join(ROOT, 'public/data/geo', DATA_VER);
const UNITS = arg('--units', path.join(VER_DIR, 'units.json'));
const EMD = arg('--emd', path.join(VER_DIR, 'emd'));
const OUT = arg('--out', null);
const QUICK = args.includes('--quick');
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const unitsFile = read(UNITS);
if (!unitsFile.emdUnits) { console.error(`${UNITS} 에 emdUnits(동 색인)가 없음 — --preview 출력 사본을 --units·--emd 로 주세요`); process.exit(1); }
const neighbors = read(path.join(VER_DIR, 'neighbors.json')), labels = read(path.join(VER_DIR, 'labels.json'));

/** 범위(지역 키 목록)의 레지스트리: 그 지역들과 그 지역들의 동 단원을 모두 등록 */
function registryOf(scope) {
  const regions = unitsFile.regions.filter((r) => scope.includes(r.key));
  const emdUnits = Object.fromEntries(scope.map((k) => [k, unitsFile.emdUnits[k] ?? []]));
  const missing = scope.filter((k) => !emdUnits[k].length);
  if (missing.length) console.error(`주의: ${missing.join(',')} 은 동 색인이 없어 동 단원 없이 흉내 낸다 — 모든 지역을 보려면 --preview 출력 사본을 --units·--emd 로 주세요`);
  const reg = createRegistry({ units: { version: unitsFile.version, regions, emdUnits }, neighbors, labels });
  for (const k of scope) for (const u of reg.emdUnits(k)) reg.addUnit(read(path.join(EMD, `${u.code}.json`)));
  return reg;
}

// 기본 차례 규칙(EMD_UNIT_NEXT)은 sep·sep20·sepEarly 가 쓴다. sepUnit·sepSgg 는 차례 규칙만 바꾼 견줌용(서울 범위에서만 돈다)
const RULES = {
  sep: { name: `따로·동 ${EMD_DAILY_CAP}(Q7 확정)`, rule: { separate: true, emdCap: EMD_DAILY_CAP, unitNext: EMD_UNIT_NEXT }, early: false },
  sep20: { name: '따로·동 20(E4 첫 기본값, 견줌)', rule: { separate: true, emdCap: 20, unitNext: EMD_UNIT_NEXT }, early: false },
  shared: { name: '함께 30(운영 중인 옛 규칙)', rule: { separate: false, emdCap: EMD_DAILY_CAP }, early: false },
  sepEarly: { name: `따로·동 ${EMD_DAILY_CAP} + 동 졸업 앞당김(나)`, rule: { separate: true, emdCap: EMD_DAILY_CAP, unitNext: EMD_UNIT_NEXT }, early: true },
  sepUnit: { name: `따로·동 ${EMD_DAILY_CAP} · 단원 과 늘 먼저(E4 첫 구현)`, rule: { separate: true, emdCap: EMD_DAILY_CAP, unitNext: 'unit' }, early: false, extra: true },
  sepSgg: { name: `따로·동 ${EMD_DAILY_CAP} · 구 다음 과 늘 먼저(N32 글자)`, rule: { separate: true, emdCap: EMD_DAILY_CAP, unitNext: 'sgg' }, early: false, extra: true },
};
/** '구 도중에 동' 길: 첫 지역 시·군·구 이 과까지 칠한 다음 날 그 지역 첫 동 단원을 연다 */
const MID_AFTER = 2;

function sim(reg, { policy, p, rule, early, path: way = 'sgg-first', maxDays = 3000, seed = 1 }) {
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  const all = [...reg.regions.flatMap((r) => r.items.map((it) => it.id)), ...reg.units.flatMap((u) => u.items.map((it) => it.id))];
  const sggAll = reg.regions.flatMap((r) => r.items.map((it) => it.id));
  const unitOrder = reg.regions.flatMap((r) => reg.emdUnits(r.key).map((u) => u.key));
  let m = {}, last = null, lastUnit = null, midStarted = false;
  let learnedDay = null, gradDay = null, sggDoneDay = null, noRec = 0, noRecSgg = 0, noRecEmd = 0, blockedSgg = 0, lessonDays = 0, maxBacklog = 0, maxLeft = 0;
  const unitsLeft = (area) => unitOrder.filter((k) => (!area || reg.areaOf(k) === area) && reg.region(k).items.some((it) => !colored(it.id)));
  const cnt = { ans: 0, late: 0, emdAns: 0, emdLate: 0, ansAll: 0 };
  const colored = (id) => (m[id]?.hi ?? 0) >= 1;
  const boxOf = (id) => get(m, id).box;
  for (let day = 0; day < maxDays; day++) {
    let daily = { day, n: 0 }, dailyEmd = { day, n: 0 };
    const learning = learnedDay === null;
    maxBacklog = Math.max(maxBacklog, todayReview(reg, m, day, 0, 0, { rule }).due);
    // 1) 낼 수 있는 복습을 다 한다(몫마다 하루 상한 안)
    for (;;) {
      const plan = todayReview(reg, m, day, daily.n, dailyEmd.n, { rule });
      if (!plan.round.length) break;
      let deck = createDeck('review', reviewQuestions(plan.round, boxOf), { seed: day });
      while (!isDone(deck)) {
        const q = current(deck);
        const first = !q.retry;
        const ok = first ? rnd() < p : true;
        if (first) {
          const late = get(m, q.id).due < day;
          cnt.ansAll++;
          if (learning) { cnt.ans++; cnt.late += late; if (isEmd(q.id)) { cnt.emdAns++; cnt.emdLate += late; } }
        }
        const st = step(reg, deck, m, daily, { result: ok ? 'correct' : 'wrong' }, day, dailyEmd, rule);
        deck = st.deck; m = st.mastery; daily = st.daily; dailyEmd = st.dailyEmd;
        // (나) 동만 졸업을 앞당김: 상자 5 에 닿으면 바로 졸업
        if (early && first && isEmd(q.id)) { const r = m[q.id]; if (r && r.box >= MAX_BOX && !r.grad) m = { ...m, [q.id]: { ...r, grad: true, due: null, hi: 3 } }; }
      }
    }
    maxLeft = Math.max(maxLeft, todayReview(reg, m, day, 0, 0, { rule }).due);
    // 2) 새 과: 홈 주 카드대로(다 칠한 지역이면 다음 지역, 시·군·구를 다 마치면 아직인 첫 동 단원)
    if (learning) {
      if (way === 'mid' || way === 'mid-emd') {
        const area = reg.regions[0].key;
        if (!midStarted) {
          const nl = nextLesson(reg, m, area);
          if (nl === null || nl > MID_AFTER) {
            const u = unitsLeft(area)[0];
            if (u) ({ last, lastUnit } = studyKeys(reg, u));
            midStarted = true;
          }
        } else if (way === 'mid-emd' && (!lastUnit || nextLesson(reg, m, lastUnit) === null)) {
          // 동 계속: 마지막 동 단원이 없거나(시·군·구 과를 해서 지워짐) 다 칠했으면 그 지역의 다음 동 단원을 연다
          const u = unitsLeft(area)[0];
          if (u) ({ last, lastUnit } = studyKeys(reg, u));
        }
      }
      const cardOf = () => homeCard({ reg, mastery: m, deck: null, daily, dailyEmd, last, lastUnit, today: day, rule });
      let card = cardOf();
      for (let g = 0; card.type === 'done' && g < 3; g++) {
        const here = way === 'by-region' ? unitsLeft(card.region)[0] : undefined;
        if (here) ({ last, lastUnit } = studyKeys(reg, here));
        else if (card.more.length) { last = card.more[0]; lastUnit = null; }
        else {
          const u = unitsLeft()[0];
          if (!u) break;
          ({ last, lastUnit } = studyKeys(reg, u));
        }
        card = cardOf();
      }
      if (card.type === 'new') card = { type: 'next', region: card.region, lesson: card.lesson, recommend: true, tomorrow: 0 };   // 처음 온 날: 첫 과
      if (card.type === 'next') {
        if (!card.recommend) {
          noRec++;
          if (card.unit) noRecEmd++; else noRecSgg++;
          // 시·군·구 몫이 남았고 그 지역 시·군·구 과도 남았는데 추천이 없다(동 단원 과가 시·군·구 본 경로를 막은 날)
          if (DAILY_CAP - daily.n >= NEW_SLACK && nextLesson(reg, m, card.region) !== null) blockedSgg++;
        }
        if (policy === 'daily' || card.recommend) {
          const key = card.unit ?? card.region;
          let deck = createDeck('lesson', lessonQuestions(reg, key, card.lesson, boxOf, rngFrom(day + 7)), { region: key, lesson: card.lesson, seed: day });
          while (!isDone(deck)) {
            const st = step(reg, deck, m, daily, { result: 'correct' }, day, dailyEmd, rule);
            deck = st.deck; m = st.mastery; daily = st.daily; dailyEmd = st.dailyEmd;
          }
          ({ last, lastUnit } = studyKeys(reg, key));
          lessonDays++;
        }
      } else noRec++;
      if (sggDoneDay === null && sggAll.every(colored)) sggDoneDay = day;
      if (all.every(colored)) learnedDay = day;
    }
    if (learnedDay !== null && all.every((id) => m[id]?.grad)) { gradDay = day; break; }
    if (QUICK && learnedDay !== null) break;
  }
  const days = (learnedDay ?? maxDays) + 1;
  return {
    places: all.length, learnedDay, gradDay, sggDoneDay,
    noRecRate: noRec / days, noRecSggRate: noRecSgg / days, noRecEmdRate: noRecEmd / days, blockedSggRate: blockedSgg / days,
    lateRate: cnt.ans ? cnt.late / cnt.ans : 0, emdLateRate: cnt.emdAns ? cnt.emdLate / cnt.emdAns : 0,
    reviewsPerPlace: cnt.ansAll / all.length, maxBacklog, maxLeft,
  };
}

// [이름, 지역, 길, 견줌용 차례 규칙(extra)도 돌리나]. 서울은 지역이 하나라 '구 먼저'·'지역마다'가 같다
const SCOPES = [
  ['서울 구+동', ['seoul'], 'sgg-first', true],
  ['수도권 구+동 · 구 먼저', ['seoul', 'incheon', 'gyeonggi'], 'sgg-first', false],
  ['수도권 구+동 · 지역마다', ['seoul', 'incheon', 'gyeonggi'], 'by-region', false],
  [`서울 구+동 · 구 ${MID_AFTER}과 뒤 동`, ['seoul'], 'mid', true],
  [`서울 구+동 · 구 ${MID_AFTER}과 뒤 동 계속`, ['seoul'], 'mid-emd', true],
];
const pct = (x) => `${Math.round(x * 100)}%`;
const rows = [];
const t0 = Date.now();
for (const [scopeName, scope, way, extra] of SCOPES) {
  const reg = registryOf(scope);
  for (const [rk, R] of Object.entries(RULES)) {
    if (R.extra && !extra) continue;
    for (const policy of ['follow', 'daily']) {
      for (const p of [1, 0.85]) {
        const r = sim(reg, { policy, p, rule: R.rule, early: R.early, path: way });
        const ok = policy === 'follow' ? r.noRecRate <= 0.3 && r.lateRate <= 0.2 : null;
        rows.push({ scope: scopeName, way, rule: rk, ruleName: R.name, policy, p, ...r, ok });
        console.error(`${scopeName} · ${R.name} · ${policy} · ${p}: 다 배운 날 ${r.learnedDay} · 구 다 칠한 날 ${r.sggDoneDay} · 추천 없는 날 ${pct(r.noRecRate)}(구 몫 남음 ${pct(r.blockedSggRate)}) · 늦은 복습 ${pct(r.lateRate)} (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
      }
    }
  }
}

const md = [
  '# 복습량 흉내표 (계획서 E4 · N32 · Q7)',
  '',
  `- 만든 때: ${new Date().toISOString().slice(0, 16)} · 판 ${unitsFile.version} · 동 단원 파일 ${EMD}`,
  `- 실제 core 사용: registry(동 단원 등록) · next.ts homeCard·todayReview · session.ts step · questions.ts lessonQuestions·reviewQuestions · mastery.ts`,
  `- 학습자: 매일 옴 · 낼 수 있는 복습을 다 함(첫 시도 정답률 p) · 과는 하루 1과(과 안은 모두 맞힘). 추천 따름 = 홈 카드가 추천할 때만 / 매일 한 과 = 추천과 상관없이`,
  `- 규칙: 따로·동 ${EMD_DAILY_CAP}(Q7 확정, 사용자 11-14) = 시·군·구 하루 ${DAILY_CAP} + 동 하루 ${EMD_DAILY_CAP}, 새 과 추천은 각 몫의 여유 · 따로·동 20 = 동 몫만 20 으로(E4 첫 기본값, 견줌) · 함께 30(운영 중인 옛 규칙) = 하루 ${DAILY_CAP} 하나 · (나) = 따로·동 ${EMD_DAILY_CAP} + 동은 상자 5 에 닿으면 바로 졸업`,
  `- 차례 규칙(따로 셀 때, 마지막 동 단원의 다음 과와 시·군·구 다음 과가 겹칠 때): 기본 '${EMD_UNIT_NEXT}' = 단원 과를 동 몫 여유로 추천할 수 있으면 단원 과, 없으면 시·군·구 다음 과(시·군·구 몫이 남았을 때) · 단원 과 늘 먼저 = E4 첫 구현(동 몫을 다 쓰면 시·군·구 몫이 남아도 추천 없음) · 구 다음 과 늘 먼저 = N32 차례 글자 그대로(단원 과는 시·군·구 추천이 없을 때만). 견줌용 둘은 서울 범위에서만 돈다`,
  `- 길: 구 먼저 = 모든 지역 시·군·구 → 동 단원 / 지역마다 = 서울 구 → 서울 동 → 인천 구 → 인천 동 → 경기 구 → 경기 동(지역을 다 칠한 날 그 지역 동 단원부터) / 구 ${MID_AFTER}과 뒤 동 = 서울 구 ${MID_AFTER}과를 칠한 다음 날 종로 단원을 열고 그 뒤 홈 카드대로(시·군·구 과를 하면 마지막 단원이 지워져 홈은 지역 차례로 — N16, 시·군·구를 다 칠하면 남은 동 단원) / 구 ${MID_AFTER}과 뒤 동 계속 = 같이 시작하고, 날마다 마지막 동 단원이 없거나 다 칠했으면 서울의 다음 동 단원을 연다(시·군·구 과를 추천받아 하면 다음 날 다시 동 단원으로)`,
  '- 지표: 다 배운 날(0일째부터, 모든 곳을 칠한 날) · 구 다 칠한 날 = 시·군·구를 모두 칠한 날(본 경로가 얼마나 늦어지나) · 추천 없는 날 = 다 배울 때까지 추천 과가 없던 날의 비율(괄호: 그날 차례가 시·군·구 과였던 날 / 동 과였던 날) · 구 몫 남은 날 = 추천 없는 날 가운데 시·군·구 몫 여유(≥ 6)와 시·군·구 남은 과가 있었던 날(동이 본 경로를 막은 날) · 늦은 복습 = 다 배울 때까지 복습 첫 답 가운데 정해진 날보다 늦은 것(괄호: 동만) · 다 졸업한 날 · 곳당 복습 · 가장 많이 밀린 복습(하루 시작 때 / 복습을 다 한 뒤 남은 것)',
  '- 기준(N32 [제안]): 추천 따름 학습자 — 추천 없는 날 30% 이하 · 늦은 복습 20% 이하',
  '',
  '| 범위(곳) | 규칙 | 학습자 | 정답률 | 다 배운 날 | 구 다 칠한 날 | 추천 없는 날(구/동) | 구 몫 남은 날 | 늦은 복습(동) | 다 졸업한 날 | 곳당 복습 | 밀린 복습 최대(시작/남음) | 기준 |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.scope}(${r.places}) | ${r.ruleName} | ${r.policy === 'follow' ? '추천 따름' : '매일 한 과'} | ${pct(r.p)} | ${r.learnedDay ?? '–'} | ${r.sggDoneDay ?? '–'} | ${pct(r.noRecRate)} (${pct(r.noRecSggRate)}/${pct(r.noRecEmdRate)}) | ${pct(r.blockedSggRate)} | ${pct(r.lateRate)} (${pct(r.emdLateRate)}) | ${r.gradDay ?? '–'} | ${r.reviewsPerPlace.toFixed(1)} | ${r.maxBacklog} / ${r.maxLeft} | ${r.ok === null ? '–' : r.ok ? '맞춤' : '못 맞춤'} |`),
  '',
];
md.push('## 기준(추천 따름: 추천 없는 날 30% 이하 · 늦은 복습 20% 이하)을 맞춘 경우', '');
for (const [rk, R] of Object.entries(RULES)) {
  const f = rows.filter((r) => r.rule === rk && r.policy === 'follow');
  md.push(`- ${R.name}: ${f.filter((r) => r.ok).length}/${f.length}`);
}
md.push('', '## 같은 경우끼리 견줌(추천 따름, 다 배운 날 · 구 다 칠한 날 · 추천 없는 날(구 몫 남은 날) · 늦은 복습)', '');
for (const [scopeName] of SCOPES) for (const p of [1, 0.85]) {
  const at = (rk) => rows.find((r) => r.scope === scopeName && r.rule === rk && r.policy === 'follow' && r.p === p);
  md.push(`- ${scopeName} · 정답률 ${pct(p)}: ` + Object.keys(RULES).filter((rk) => at(rk)).map((rk) => { const r = at(rk); return `${RULES[rk].name} ${r.learnedDay ?? '–'}일·구 ${r.sggDoneDay ?? '–'}일·${pct(r.noRecRate)}(구 몫 ${pct(r.blockedSggRate)})·${pct(r.lateRate)}`; }).join(' / '));
}
// 견줌용 차례 규칙이 '구 먼저' 길에서 기본과 같은가(시·군·구를 다 마친 뒤에 동을 시작하면 두 과가 겹치지 않는다 — 다르면 차례 규칙이 이 길에도 닿는다)
const same = (a, b) => ['learnedDay', 'sggDoneDay', 'noRecRate', 'lateRate', 'gradDay'].every((k) => a[k] === b[k]);
for (const [scopeName, , way, extra] of SCOPES) {
  if (!extra || way.startsWith('mid')) continue;
  const base = rows.filter((r) => r.scope === scopeName && r.rule === 'sep');
  const diff = ['sepUnit', 'sepSgg'].filter((rk) => base.some((b) => !same(b, rows.find((r) => r.scope === scopeName && r.rule === rk && r.policy === b.policy && r.p === b.p))));
  md.push(`- ${scopeName}: 견줌용 차례 규칙이 기본과 ${diff.length ? `다름(${diff.map((rk) => RULES[rk].name).join(', ')})` : '모두 같음(시·군·구를 다 마친 뒤 동을 시작해 겹치지 않음)'}`);
}
md.push(`- 걸린 시간 ${((Date.now() - t0) / 1000).toFixed(1)}초`);
const text = md.join('\n') + '\n';
if (OUT) { fs.writeFileSync(OUT, text); fs.writeFileSync(OUT.replace(/\.md$/, '.json'), JSON.stringify(rows, null, 1)); }
process.stdout.write(text);
