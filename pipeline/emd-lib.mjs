// 동 단원 묶기(계획서 NATIONWIDE_PLAN E3 · N7 · N8 · N10 · N13): 과 묶기 · 과 이름 · 과 이름 지도 검사 · 넓은 화면 나누기 · 만나기 근거.
// 지도 계산(단순화·이름표 점·내접원·상자·이웃·넓이 중심)은 pipeline/build-geo.mjs 가 하고, 여기서는 그 값으로 묶고 이름을 짓기만 한다.
// 파일·mapshaper 를 쓰지 않는 순수 함수라 단위 시험이 바로 부른다(tests/unit/emd-units.test.ts).
//
// 좌표는 모두 북쪽이 위인 미터(x 동쪽, y 북쪽)이고, 상자는 [서, 남, 동, 북]이다.
// 단원 입력 U = { code, ko, dongs: [동] }. 동 = {
//   id, ko, kind('동'|'읍'|'면'), x, y(이름표 점), r(내접원 반지름 m, labels 와 같은 반올림 값), area(m²), c([x, y] 실제 칠한 넓이의 무게중심, 먼 섬 덩어리 뺌),
//   box: { main(가장 큰 가까운 덩어리), near(먼 섬 뺀 덩어리, 통째로 먼 섬이면 null), all(덩어리 전부), isle(섬 상자 범위 — isleRange), island(통째로 먼 섬일 때 덩어리 전부) },
//   nb: [단원 안에서 맞닿은 동 id], out: [맞닿은 단원 밖 시·군·구 id], outer: 단원 바깥 경계(바다 포함)에 닿음 }

export const TAP_FAIL = 16, TAP_AMBIG = 24;               // 내접원 지름(px): 16 미만 실패, 24 미만 '모호 확대'(build-geo.mjs 도 이 값을 가져다 쓴다)
export const PHONE = { w: 358, h: 560, pad: 0.15 };      // 과 화면 검사용 휴대폰 지도 칸(build-geo.mjs 도 이 값을 쓴다)
// 넓은 화면(전체 연습·시험) 검사: 설계서 3.2 처럼 가장 좁은 휴대폰의 판정 전 지도 칸에 여백 없이 맞춘 크기(서울 전체 중구 21px)
export const PHONE_WIDE = { w: 358, h: 440, pad: 0 };
export const INSET = { w: 128, h: 112, pad: 0.12 };      // 섬 상자 한 칸(src/app/map/svgmap.ts INSET_MAX_W·H 와 여백 12% — 단위 시험이 같은지 본다)
export const AIM = 6, MAX = 7;                            // 과 목표 5~7곳(N10): 과 수 = round(곳 수 / 6), 한 과 최대 7곳
export const FAMILY_MAX = 7;                              // 숫자 가족 7곳 이하는 한 과에(Q8 기본값), 8곳 이상은 번호가 이어지게 둘로
export const CORE_MARGIN = 0.1;                           // 섬 과: 맞닿은 동이 있는 곳들의 상자를 긴 변의 10%씩 늘린 범위 밖이면 먼 섬
export const DIRS = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];   // src/app/registry.ts 와 같은 차례(동쪽부터 시계 반대 방향, 45도씩)
export const DIR_KO = { E: '동쪽', NE: '북동쪽', N: '북쪽', NW: '북서쪽', W: '서쪽', SW: '남서쪽', S: '남쪽', SE: '남동쪽' };   // src/app/text/ko.ts DIR_KO 와 같음(단위 시험이 본다)
const DIR_DEG = { E: 0, NE: 45, N: 90, NW: 135, W: 180, SW: -135, S: -90, SE: -45 };
export const SPLIT_MIN = 3;                             // 동·읍면을 따로 묶으려면 두 쪽 모두 이만큼 있어야 한다
const SCREEN_KIND = 'main';                        // 넓은 화면 칸 크기도 곳마다 가장 큰 덩어리 기준(과 화면과 같음)
// 과 이름 지도 검사(N7)의 독립 기준: '가운데'는 과의 넓이 중심이 무리 넓이 중심에서 등가 반지름의 CENTER_MAX 배 안, 방위 낱말은 나머지 곳들의 넓이 중심에서 DIR_MIN 배보다 멀어야 방향이 선다
export const CENTER_MAX = 0.35, DIR_MIN = 0.1;
// 만나기 근거 '끝'(N13): 그 동이 그쪽으로 가장 멀리 나간 자리가 단원 상자의 그쪽 변에서 상자 길이의 이 비율 안
export const EDGE_REACH = 0.15;
// 화면에 보이는 범위(E7 검수): 앱은 과·화면 fit 상자를 지도 칸에 여백 없이 맞춘다(src/app/map/view.ts fitView). 지도 칸이 상자보다 길쭉하면 짧은 축 쪽이 더 보인다.
// 세로로 긴 폰(PHONE 비율 0.64)과 가로로 긴 넓은 화면(이 비율 — 1440 학습 화면 지도 칸이 약 1.34, 더 넓은 모니터 몫을 둠) 두 비율로 맞춘 범위를 합친 것을 '보이는 범위'로 본다
export const VIEW_WIDE = 1.8;

/* ---------- 작은 도구 ---------- */
const union = (bs) => bs.reduce((q, b) => [Math.min(q[0], b[0]), Math.min(q[1], b[1]), Math.max(q[2], b[2]), Math.max(q[3], b[3])], [Infinity, Infinity, -Infinity, -Infinity]);
const hits = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const widen = (b, f) => { const m = Math.max(b[2] - b[0], b[3] - b[1]) * f; return [b[0] - m, b[1] - m, b[2] + m, b[3] + m]; };
// 동의 '가까운 덩어리' 상자: 시·도 규칙으로 통째로 먼 섬인 동(울릉군의 동, 옹진 백령면 등)은 가장 큰 덩어리 상자로 본다
// (섬 상자 island 는 울릉읍의 독도처럼 멀리 떨어진 덩어리까지 들어 단원 화면이 지나치게 커진다. 단원 안의 먼 섬은 아래 섬 과·섬 상자로 따로 다룬다)
const nearOf = (d) => d.box.near ?? d.box.main;
// 섬 상자 한 곳의 범위: build-geo.mjs 가 isleRange 로 잰 isle(16px 를 지키는 한 가까운 덩어리까지). isle 이 없는 옛 입력은 가장 큰 덩어리(E5 첫 구현과 같음)
const isleOf = (d) => d.box.isle ?? d.box.main;
const byKo = (D) => (a, b) => D[a].ko.localeCompare(D[b].ko, 'ko') || (a < b ? -1 : a > b ? 1 : 0);
const centroid = (ids, D) => [ids.reduce((s, id) => s + D[id].x, 0) / ids.length, ids.reduce((s, id) => s + D[id].y, 0) / ids.length];
/** 이름표 점의 넓이 가중 무게중심(과 이름·만나기 방위): 지도에서 칠해진 넓이가 큰 곳 쪽으로 간다 */
export const wcentroid = (ids, D) => {
  const w = ids.reduce((s, id) => s + Math.max(D[id].area, 1), 0);
  return [ids.reduce((s, id) => s + D[id].x * Math.max(D[id].area, 1), 0) / w, ids.reduce((s, id) => s + D[id].y * Math.max(D[id].area, 1), 0) / w];
};
/** 실제 칠한 넓이의 무게중심(과 이름 지도 검사 전용 — 이름을 짓는 계산과 다른 기준). c 가 없는 옛 입력은 이름표 점으로 대신한다 */
const acOf = (d) => d.c ?? [d.x, d.y];
const acentroid = (ids, D) => {
  const w = ids.reduce((s, id) => s + Math.max(D[id].area, 1), 0);
  return [0, 1].map((k) => ids.reduce((s, id) => s + acOf(D[id])[k] * Math.max(D[id].area, 1), 0) / w);
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const nwScore = (c) => c[0] - c[1];   // 작을수록 서쪽·북쪽
const angDiff = (a, b) => ((a - b + 540) % 360) - 180;
const dirAt = (deg) => DIRS[((Math.round(deg / 45) % 8) + 8) % 8];
/** 8방위(미터 벡터, 동쪽 0도·북쪽 90도) */
const sector8 = (v) => dirAt(Math.atan2(v[1], v[0]) * 180 / Math.PI);
/** 여러 곳의 상자: 'main' 은 곳마다 가장 큰 가까운 덩어리, 'near' 는 먼 섬을 뺀 덩어리 전부, 'isle' 은 섬 상자 범위(덩어리 전부) */
export function unionOf(ids, D, kind) {
  return union(ids.map((id) => (kind === 'main' ? D[id].box.main : kind === 'isle' ? isleOf(D[id]) : nearOf(D[id]))));
}

/** 화면 하나의 칸 크기(build-geo.mjs screen() 과 같은 계산): 상자를 휴대폰 지도 칸에 맞췄을 때 곳마다 내접원 지름(px) */
export function tap(ids, D, kind, phone) {
  const b = unionOf(ids, D, kind);
  const w = b[2] - b[0], h = b[3] - b[1], p = Math.max(w, h) * phone.pad;
  const k = Math.min(phone.w / (w + 2 * p), phone.h / (h + 2 * p));
  const sizes = ids.map((id) => ({ id, d: Math.round(2 * D[id].r * k) }));
  const min = sizes.reduce((a, s) => (s.d < a.d ? s : a));
  return { box: b, min: min.d, at: min.id, ambiguous: sizes.filter((s) => s.d < TAP_AMBIG).map((s) => s.id) };
}
/**
 * 섬 상자 한 곳의 범위(미터 상자, 방향 무관): 가장 큰 덩어리 상자에서 시작해 덩어리 상자 가운데가 가까운 차례로(같으면 넓은 것 먼저) 더한다.
 * 더한 범위를 섬 상자(INSET)에 맞췄을 때 그 곳의 내접원 지름(tap 과 같은 반올림)이 TAP_FAIL 이상일 때만 더한다 —
 * 16px 검사를 지키는 한 섬 여럿으로 된 면(자월면·북도면·덕적면)의 작은 섬까지 상자에 보이게(E5 검수: 가장 큰 덩어리만이면 면 넓이의 최대 66% 가 잘렸다).
 * parts = [{ box, a(넓이) }], r = 내접원 반지름(m). 앱 src/app/map/isles.ts isleView 와 같은 식이다(tests/unit/emd-units.test.ts 가 견준다)
 */
export function isleRange(parts, r) {
  if (!parts.length) return null;
  const big = parts.reduce((x, y) => (y.a > x.a ? y : x));
  const cen = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  const c0 = cen(big.box);
  const rest = parts.filter((p) => p !== big).map((p) => ({ p, d: Math.hypot(cen(p.box)[0] - c0[0], cen(p.box)[1] - c0[1]) })).sort((x, y) => x.d - y.d || y.p.a - x.p.a);
  let b = big.box;
  for (const { p } of rest) {
    const nb = union([b, p.box]);
    const w = nb[2] - nb[0], h = nb[3] - nb[1], m = Math.max(w, h) * INSET.pad;
    if (Math.round(2 * r * Math.min(INSET.w / (w + 2 * m), INSET.h / (h + 2 * m))) >= TAP_FAIL) b = nb;
  }
  return b;
}

/** 섬 상자를 쓰는 화면: insets 의 곳은 섬마다 삽입 상자(INSET, 범위 = isleRange)에서, 나머지는 본 화면에서 잰다 */
function tapWith(ids, insets, D, kind, phone) {
  const main = ids.filter((id) => !insets.includes(id));
  const parts = [...(main.length ? [tap(main, D, kind, phone)] : []), ...insets.map((id) => tap([id], D, 'isle', INSET))];
  const min = parts.reduce((a, p) => (p.min < a.min ? p : a));
  return { box: main.length ? parts[0].box : unionOf(ids, D, kind), min: min.min, at: min.at, ambiguous: [...new Set(parts.flatMap((p) => p.ambiguous))] };
}
/** 상자 b 를 지도 칸에 여백 없이 맞췄을 때 보이는 범위: 폰 비율과 VIEW_WIDE 비율 두 가지의 합(가운데 맞춤이라 그 사이 비율은 이 안에 든다) */
export function seenBox(b) {
  const w = b[2] - b[0], h = b[3] - b[1], cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
  return union([PHONE.w / PHONE.h, VIEW_WIDE].map((a) => { const W = Math.max(w, h * a), H = Math.max(h, w / a); return [cx - W / 2, cy - H / 2, cx + W / 2, cy + H / 2]; }));
}
/**
 * 섬 상자로 보이는 먼 섬을 본 지도로(E7 검수 — 강화 서도면). 먼 섬이 그 과·화면의 보이는 범위(seenBox)와 겹치면 본 지도에도 제자리가 그려지는데,
 * 섬 상자 칸은 본 지도에서 맥락색이라('이번 과 아님'과 같은 색) 같은 섬이 두 번 보이고 제자리를 눌러도 정답이 되지 않는다.
 * 그런 섬을 본 지도로 옮겨 다시 재고(fit 이 넓어진다) 16px 를 지나면 옮긴 채 둔다 — 가까운 섬과 같은 대우. 옮기면 fit 이 넓어져 다른 섬이 겹칠 수 있어
 * 바뀌지 않을 때까지 되풀이한다. 본 지도에 곳이 하나도 없는 과·화면(옹진 섬 과 — 격자로 본 지도를 숨김)은 그대로
 */
function seenIsles(X, D, kind, phone) {
  for (let again = true; again;) {
    again = false;
    const main = X.ids.filter((id) => !X.insets.includes(id));
    if (!main.length) return;
    const seen = seenBox(unionOf(main, D, kind));
    for (const id of X.insets) {
      if (!hits(nearOf(D[id]), seen)) continue;
      const insets = X.insets.filter((o) => o !== id);
      if (tapWith(X.ids, insets, D, kind, phone).min < TAP_FAIL) continue;
      X.insets = insets;
      again = true;
      break;
    }
  }
}

/** 이어진 덩어리(맞닿음 그래프): ids 차례를 지키며 나눈다 */
function components(ids, adj) {
  const set = new Set(ids), seen = new Set(), out = [];
  for (const s of ids) {
    if (seen.has(s)) continue;
    const comp = [], st = [s];
    seen.add(s);
    while (st.length) { const v = st.pop(); comp.push(v); for (const w of adj(v)) if (set.has(w) && !seen.has(w)) { seen.add(w); st.push(w); } }
    out.push(ids.filter((id) => comp.includes(id)));
  }
  return out;
}

/**
 * 실패한 화면을 반으로(상자의 긴 축으로 이름표 점을 줄 세워 앞 절반·뒤 절반).
 * adj 를 주면(E7 — 끊긴 과가 남은 단원의 다시 묶기에서만) 두 쪽이 모두 맞닿아 이어지는 자르는 자리를 긴 축 → 짧은 축 차례로,
 * 가운데에서 가까운 자리부터 찾는다. 그런 자리가 없으면 긴 축 앞 절반·뒤 절반 그대로
 */
function bisect(ids, D, kind, adj) {
  const b = unionOf(ids, D, kind), ax = (b[2] - b[0]) >= (b[3] - b[1]) ? 'x' : 'y';
  const order = (k) => [...ids].sort((a, c) => D[a][k] - D[c][k] || byKo(D)(a, c));
  const s = order(ax);
  const h = Math.ceil(s.length / 2);
  if (adj) {
    for (const k of [ax, ax === 'x' ? 'y' : 'x']) {
      const t = order(k);
      const cuts = [...Array(t.length - 1).keys()].map((i) => i + 1).sort((p, q) => Math.abs(p - h) - Math.abs(q - h) || q - p);
      for (const i of cuts) if (components(t.slice(0, i), adj).length === 1 && components(t.slice(i), adj).length === 1) return [t.slice(0, i), t.slice(i)];
    }
  }
  return [s.slice(0, h), s.slice(h)];
}
function splitUntil(ids, D, kind, phone, adj) {
  if (ids.length < 2 || tap(ids, D, kind, phone).min >= TAP_FAIL) return [ids];
  return bisect(ids, D, kind, adj).flatMap((g) => splitUntil(g, D, kind, phone, adj));
}

/* ---------- 숫자 가족(N10 2단계, Q8 기본값) ---------- */
// '상계1동'·'상계3·4동'·'종로1·2·3·4가동'·'상일제1동'·'면목본동' → 뿌리(상계·종로·상일·면목)와 번호(본 = 0). 숫자가 없는 이름은 가족이 아니다
const FAMILY = /^(.+?)(?:제?(\d+)(?:[·.,]\d+)*가?|(본))(동|가동)$/;
export function familyOf(name) {
  const m = FAMILY.exec(name);
  return m ? { root: m[1], no: m[3] ? 0 : Number(m[2]) } : null;
}
/**
 * 가족 목록(번호 차례)을 과에 넣을 덩어리로. 돌려주는 값 { parts, mode }
 *  - 서로 맞닿지 않으면 맞닿은 조각마다(규칙을 접음, mode 'folded'), 1곳 조각은 가족 규칙에서 뺀다
 *  - 7곳을 넘으면 번호 차례를 지키면서 두 조각이 각각 이어지는 자르는 자리 가운데 가장 고른 곳에서 둘로(mode 'split')
 *  - 그런 자리가 없으면 앞 절반·뒤 절반으로 자르고 조각마다 다시 이어진 덩어리로 — 번호가 끊기거나 빠지는 곳이 생긴다(mode 'split-gap', 보고서에 따로 셈)
 */
export function famParts(list, D) {
  const adj = (id) => D[id].nb;
  const comps = components(list, adj);
  if (comps.length > 1) return { parts: comps.flatMap((c) => famParts(c, D).parts), mode: 'folded' };
  if (list.length <= FAMILY_MAX) return { parts: list.length >= 2 ? [list] : [], mode: 'whole' };
  const n = list.length;
  let cut = 0;
  for (let i = 2; i <= n - 2; i++) {
    if (components(list.slice(0, i), adj).length > 1 || components(list.slice(i), adj).length > 1) continue;
    if (!cut || Math.abs(2 * i - n) <= Math.abs(2 * cut - n)) cut = i;   // 같으면 뒤 자리(앞 조각이 큰 쪽 — 반 나누기 ceil 과 같은 쪽)
  }
  if (cut) {
    const a = famParts(list.slice(0, cut), D), b = famParts(list.slice(cut), D);
    return { parts: [...a.parts, ...b.parts], mode: [a.mode, b.mode].includes('split-gap') ? 'split-gap' : 'split' };
  }
  const h = Math.ceil(n / 2);
  return { parts: [...famParts(list.slice(0, h), D).parts, ...famParts(list.slice(h), D).parts], mode: 'split-gap' };
}
/** 무리(동 또는 읍·면) 안의 덩어리: 가족 덩어리 + 나머지는 한 곳씩. report 는 가족마다 처리 결과 */
function blocksOf(ids, D) {
  const byRoot = new Map();
  for (const id of ids) { const f = familyOf(D[id].ko); if (f) { if (!byRoot.has(f.root)) byRoot.set(f.root, []); byRoot.get(f.root).push(id); } }
  const blocks = [], report = [], used = new Set();
  for (const [root, mem] of byRoot) {
    if (mem.length < 2) continue;
    mem.sort((a, b) => familyOf(D[a].ko).no - familyOf(D[b].ko).no || byKo(D)(a, b));
    const { parts, mode } = famParts(mem, D);
    report.push({ root, size: mem.length, parts: parts.map((p) => p.length), partIds: parts, mode });
    for (const p of parts) { blocks.push({ ids: p, root }); for (const id of p) used.add(id); }
  }
  for (const id of ids) if (!used.has(id)) blocks.push({ ids: [id], root: null });
  return { blocks, report };
}

/* ---------- 이웃을 따라 붙이기(N10 3단계)와 작은 과 고치기 ---------- */
// 과 수 K = round(곳 수 / 6). 씨앗 덩어리에서 시작해 맞닿은 덩어리 가운데 내접원 크기가 3배 안인 것을 먼저, 그다음 무리 밖 빈 이웃이 적은 것
// (구석부터 채워 외톨이가 남지 않게), 그다음 무게중심에 가까운 것을 붙인다. 한 과는 MAX(7)곳을 넘지 않는다.
// 맞닿은 덩어리가 없으면 거기서 멈춘다(멀리 있는 덩어리를 빌리지 않음). 다음 씨앗은 남은 덩어리 가운데 빈 이웃이 가장 적은 것(같으면 북서쪽, 빈 이웃이 0 인 외톨이는 맨 뒤)
function grow(blocks, D, adj, first) {
  const n = blocks.reduce((s, b) => s + b.ids.length, 0);
  if (!n) return [];
  const K = Math.max(1, Math.round(n / AIM));
  const blockOf = new Map();
  blocks.forEach((b, i) => { for (const id of b.ids) blockOf.set(id, i); });
  const cen = blocks.map((b) => centroid(b.ids, D));
  const rOf = (ids) => ids.reduce((s, id) => s + Math.max(D[id].r, 1), 0) / ids.length;
  const nbBlocks = blocks.map((b) => { const s = new Set(); for (const id of b.ids) for (const w of adj(id)) { const i = blockOf.get(w); if (i != null && blocks[i] !== b) s.add(i); } return [...s]; });
  const left = new Set(blocks.map((_, i) => i));
  const freeDeg = (i, grpSet) => nbBlocks[i].filter((j) => left.has(j) && !grpSet.has(j)).length;
  const out = [];
  while (left.size) {
    const remN = [...left].reduce((s, i) => s + blocks[i].ids.length, 0);
    const tgt = Math.min(MAX, Math.max(1, Math.round(remN / Math.max(1, K - out.length))));
    // 빈 이웃이 하나도 없는 덩어리(이웃이 모두 먼저 묶인 외톨이)는 씨앗으로 삼지 않는다 — 그런 것만 남았을 때만 한 곳씩 과로 두고 repairSmall 이 맞닿은 과에 합친다
    const rank = (i) => { const f = freeDeg(i, new Set()); return f === 0 ? Infinity : f; };
    const seed = !out.length && left.has(first) ? first : [...left].sort((a, b) => rank(a) - rank(b) || nwScore(cen[a]) - nwScore(cen[b]) || a - b)[0];
    const grp = [...blocks[seed].ids], grpSet = new Set([seed]);
    left.delete(seed);
    while (grp.length < tgt && left.size) {
      const c = centroid(grp, D), r = rOf(grp);
      const fit = (i) => grp.length + blocks[i].ids.length <= MAX;
      const near = new Set();
      for (const b of grpSet) for (const i of nbBlocks[b]) if (left.has(i)) near.add(i);
      let pool = [...near].filter(fit);
      if (!pool.length) break;   // 맞닿은 덩어리가 없거나 너무 크면 여기서 멈춘다(멀리 있는 덩어리를 빌리지 않음)
      const ok = pool.filter((i) => { const q = rOf(blocks[i].ids) / r; return q < 3 && q > 1 / 3; });
      if (ok.length) pool = ok;
      pool.sort((a, b) => freeDeg(a, grpSet) - freeDeg(b, grpSet) || dist(cen[a], c) - dist(cen[b], c) || a - b);
      grp.push(...blocks[pool[0]].ids);
      grpSet.add(pool[0]);
      left.delete(pool[0]);
    }
    out.push(grp);
  }
  return out;
}
const SIZE_COST = (n) => (n === 1 ? 100 : n === 2 ? 30 : n === 3 ? 12 : n === 4 ? 3 : n <= MAX ? 0 : 25 * (n - MAX));
/** 묶음의 구조 점수(정수): 작은 과·8곳 이상 과·끊긴 과·과 수가 K 와 다름에 벌점 */
function shape(ls, adj, K) {
  let s = 4 * Math.abs(ls.length - K);
  for (const ids of ls) s += SIZE_COST(ids.length) + (components(ids, adj).length > 1 ? 20 : 0);
  return s;
}
/** 묶음 점수(작을수록 좋음): 구조 점수, 같으면 과가 덜 퍼진 쪽 */
function score(ls, D, adj, K) {
  let s = shape(ls, adj, K);
  for (const ids of ls) {
    const c = centroid(ids, D);
    s += 0.01 * ids.reduce((t, id) => t + dist([D[id].x, D[id].y], c) / Math.max(D[id].r, 50), 0) / ids.length;
  }
  return s;
}
/** 3곳 이하 과 고치기: 맞닿은 과와 합쳐 7곳 안이면 합치고, 아니면 맞닿은 큰 과(6곳 이상)에서 가족이 아닌 한 곳을 넘겨받는다(넘겨준 과가 끊기지 않고 둘 다 16px 이 될 때) */
function repairSmall(ls, D, adj, famIds) {
  const ok = (ids) => tap(ids, D, 'main', PHONE).min >= TAP_FAIL;
  const touch = (A, B) => A.some((id) => adj(id).some((w) => B.includes(w)));
  for (let guard = 0; guard < 40; guard++) {
    let changed = false;
    for (const A of [...ls].sort((a, b) => a.length - b.length)) {
      if (A.length > 3 || !ls.includes(A)) continue;
      const nbs = ls.filter((B) => B !== A && touch(A, B));
      const mergeTo = nbs.filter((B) => A.length + B.length <= MAX && ok([...A, ...B])).sort((a, b) => a.length - b.length)[0];
      if (mergeTo) { mergeTo.push(...A); ls.splice(ls.indexOf(A), 1); changed = true; break; }
      const c = centroid(A, D);
      const moves = [];
      for (const B of nbs) {
        if (B.length < 6) continue;
        for (const x of B) {
          if (famIds.has(x) || !adj(x).some((w) => A.includes(w))) continue;
          const rest = B.filter((y) => y !== x);
          if (components(rest, adj).length > 1 || !ok(rest) || !ok([...A, x])) continue;
          moves.push({ B, x, d: dist([D[x].x, D[x].y], c) });
        }
      }
      moves.sort((a, b) => a.d - b.d || (a.x < b.x ? -1 : 1));
      if (moves.length) { const { B, x } = moves[0]; B.splice(B.indexOf(x), 1); A.push(x); changed = true; break; }
    }
    if (!changed) break;
  }
  return ls;
}
/**
 * 묶음 다듬기: 맞닿은 두 과 사이에서 덩어리(가족 조각 또는 한 곳) 하나를 옮겨 **구조 점수**(작은 과·큰 과·끊긴 과·과 수)가 내려가면 받아들인다
 * (가장 많이 내려가는 것부터, 같으면 덜 퍼진 쪽, 더 내려가지 않을 때까지). 퍼짐만 조금 줄어드는 옮기기는 받지 않는다 — 받으면 종로구 평창동(북쪽 산)이
 * 혜화·종로 쪽 과로 옮겨 가는 것처럼 지도에서 어색한 묶음이 된다. 옮긴 뒤 두 과가 모두 이어져 있고 16px 이며 MAX(7)를 넘지 않아야 한다.
 * 첫 씨앗만 바꾸는 탐색이 놓치는 묶음(노원구 4·4·4·7 → 4·4·6·5)을 찾는다
 */
function improve(ls, blocks, D, adj, K) {
  const blockOf = new Map();
  blocks.forEach((b, i) => { for (const id of b.ids) blockOf.set(id, i); });
  const ok = (ids) => tap(ids, D, 'main', PHONE).min >= TAP_FAIL;
  const conn = (ids) => components(ids, adj).length === 1;
  let cur = shape(ls, adj, K);
  for (let guard = 0; guard < 60 && cur > 0; guard++) {
    let best = null;
    for (const A of ls) {
      for (const bi of [...new Set(A.map((id) => blockOf.get(id)))]) {
        const mv = A.filter((id) => blockOf.get(id) === bi), rest = A.filter((id) => blockOf.get(id) !== bi);
        if (rest.length && (!conn(rest) || !ok(rest))) continue;
        for (const B of ls) {
          if (B === A || B.length + mv.length > MAX || !mv.some((id) => adj(id).some((w) => B.includes(w)))) continue;
          const nb = [...B, ...mv];
          if (!conn(nb) || !ok(nb)) continue;
          const next = ls.map((X) => (X === A ? rest : X === B ? nb : X)).filter((X) => X.length);
          const sh = shape(next, adj, K);
          if (sh >= cur) continue;
          const s = score(next, D, adj, K);
          if (!best || s < best.s - 1e-9) best = { s, sh, next };
        }
      }
    }
    if (!best) break;
    ls = best.next;
    cur = best.sh;
  }
  return ls;
}
/** 무리 하나를 과로: 첫 씨앗을 덩어리마다 바꿔 가며 묶고(→ 16px 실패는 반으로 → 작은 과 고치기) 점수가 가장 좋은 묶음을 고른 뒤(같으면 앞의 것) 다듬는다 */
function partition(blocks, D, adj) {
  const n = blocks.reduce((s, b) => s + b.ids.length, 0);
  if (!n) return [];
  const K = Math.max(1, Math.round(n / AIM));
  const famIds = new Set(blocks.filter((b) => b.ids.length > 1).flatMap((b) => b.ids));
  let best = null, bestScore = Infinity;
  const tried = [];
  for (let first = 0; first < blocks.length; first++) {
    const ls = repairSmall(grow(blocks, D, adj, first).flatMap((ids) => splitUntil(ids, D, 'main', PHONE)), D, adj, famIds);
    const s = score(ls, D, adj, K);
    tried.push(ls);
    if (s < bestScore - 1e-9) { best = ls; bestScore = s; }
  }
  const out = improve(best.map((ids) => [...ids]), blocks, D, adj, K);
  // 끊긴 과가 남으면(E7, 화성시 만세구 송산면·새솔동 — 16px 반 나누기가 맞닿지 않은 두 곳을 한쪽에 남겼다): 시작점마다 ① 지금 묶음을 다듬은 것과
  // ② 반 나누기를 맞닿음을 지키는 자리에서 하게(bisect adj) 다시 묶어 다듬은 것을 모두 견줘 점수가 가장 좋은 것을 고른다(같으면 앞의 것).
  // 끊긴 과가 없는 단원(서울 25단원 등)은 이 단계를 거치지 않아 결과가 그대로다
  if (!out.some((ids) => components(ids, adj).length > 1)) return out;
  let pick = out, pickScore = score(out, D, adj, K);
  const consider = (ls) => {
    const c = improve(ls.map((ids) => [...ids]), blocks, D, adj, K), s = score(c, D, adj, K);
    if (s < pickScore - 1e-9) { pick = c; pickScore = s; }
  };
  for (const ls of tried) consider(ls);
  for (let first = 0; first < blocks.length; first++) consider(repairSmall(grow(blocks, D, adj, first).flatMap((ids) => splitUntil(ids, D, 'main', PHONE, adj)), D, adj, famIds));
  return pick;
}

/* ---------- 이름(N7) ---------- */
/**
 * 기준 상자(ref.box = 기준 곳들의 상자, 지도 화면이 맞추는 범위)에서 본 점의 자리: 상자 가운데를 0, 가장자리를 ±1 로 둔 정규화 좌표(u 동쪽, v 북쪽).
 * 상자가 길쭉해도 '위쪽 가운데'는 북쪽이 되게(휴대폰 지도는 상자를 화면에 맞춰 보이므로 사람은 칸 자리로 방위를 읽는다)
 */
const normIn = (c, ref) => { const [x0, y0, x1, y1] = ref.box; return [(c[0] - (x0 + x1) / 2) / Math.max((x1 - x0) / 2, 1), (c[1] - (y0 + y1) / 2) / Math.max((y1 - y0) / 2, 1)]; };
/** 9칸 방위: 기준 상자를 가로·세로 셋으로 나눠 가운데 칸이면 'C', 나머지는 그 칸의 8방위 */
export function dirIn(c, ref) {
  const [u, v] = normIn(c, ref), T = 1 / 3;
  const col = u < -T ? 'W' : u > T ? 'E' : '', row = v > T ? 'N' : v < -T ? 'S' : '';
  return row + col || 'C';
}
const dirWord = (d) => (d === 'C' ? '가운데' : DIR_KO[d]);
/**
 * 과(또는 화면) ids 와 맞닿은 다른 단위마다, 그 단위에서 ids 와 맞닿은 곳들의 무게중심 방향(ids 의 무게중심에서, 도)과
 * 방향들 사이 가장 큰 빈틈. 빈틈이 180도 미만이면 다른 과들이 세 방향 이상에서 둘러싼 것(맞닿은 단위가 둘 이하면 둘러싸일 수 없다).
 * 둘러싸이지 않았으면 가장 큰 빈틈의 가운데가 '열린 쪽'(다른 과가 없고 단원 바깥 경계로 트인 쪽)이다
 */
function around(ids, others, D) {
  const set = new Set(ids), c = wcentroid(ids, D), angs = [];
  for (const M of others) {
    const touch = M.filter((o) => !set.has(o) && D[o].nb.some((w) => set.has(w)));
    if (!touch.length) continue;
    const t = wcentroid(touch, D);
    angs.push(Math.atan2(t[1] - c[1], t[0] - c[0]) * 180 / Math.PI);
  }
  if (!angs.length) return { surrounded: false, open: null };
  angs.sort((a, b) => a - b);
  let gap = 360 - (angs[angs.length - 1] - angs[0]), open = angs[angs.length - 1] + gap / 2;
  for (let i = 1; i < angs.length; i++) if (angs[i] - angs[i - 1] > gap) { gap = angs[i] - angs[i - 1]; open = angs[i - 1] + gap / 2; }
  return { surrounded: angs.length >= 3 && gap < 180, open: dirAt(open) };
}
export const surrounded = (ids, others, D) => around(ids, others, D).surrounded;
/**
 * 무리 하나(같은 기준 상자를 쓰는 과들, 또는 넓은 화면들)의 방위 키. units: [ids], peers: 둘러싸임을 볼 단원 안 단위 전부(ids 목록), ref: 기준 상자.
 *  - 단위가 2~3개면 상대 방위: 단위 무게중심들의 평균(단위마다 한 표)에서 본 그 단위 무게중심의 8방위(미터). 둘이면 서로 반대쪽, 셋이면 세 쪽으로 갈린다.
 *    넓이 가중 평균에서 재면 넓은 과(동작구 사당 쪽 등) 쪽으로 기준이 끌려 나머지 과가 모두 같은 쪽 이름이 된다
 *  - 4개 이상이면 기준 상자 9칸(dirIn). 가운데 칸이어도 다른 과들이 세 방향 이상에서 둘러싸지 않으면 '가운데' 대신 열린 쪽(around)의 방위
 *    (강남구 2과 역삼·대치·삼성은 가운데 칸이지만 북동쪽이 송파·한강으로 트여 '북동쪽')
 * 단위 무게중심은 이름표 점의 넓이 가중(wcentroid) — 이름표 점을 그냥 평균하면 종로구 1과(평창·부암·청운효자·무악…)처럼
 * 넓은 북쪽 산(평창동)이 든 과가 작은 동들 쪽으로 끌려 '남서쪽'이 된다(2026-11-14 확인)
 */
function dirsOf(units, peers, ref, D) {
  if (units.length === 1) return [{ d: dirIn(wcentroid(units[0], D), ref), alts: [] }];   // 하나뿐이면(섬 과와 나란한 본토 과 등) 기준 상자 9칸
  const cs = units.map((ids) => wcentroid(ids, D));
  const cM = [0, 1].map((k) => cs.reduce((s, c) => s + c[k], 0) / cs.length);
  return units.map((ids, i) => {
    const rel = sector8([cs[i][0] - cM[0], cs[i][1] - cM[1]]), nine = dirIn(cs[i], ref);
    const a = around(ids, peers.filter((p) => p !== ids), D);
    let d;
    if (units.length <= 3) d = rel;
    else if (nine !== 'C') d = nine;
    else d = a.surrounded ? 'C' : a.open ?? rel;
    // 규칙 이름이 지도 검사에 걸릴 때 차례로 시도할 다른 방위: 9칸 · 열린 쪽 · 상대 방위 · 한 칸 옆 방위('가운데'는 둘러싸일 때만이라 후보에 넣지 않는다)
    const alts = [nine, a.open, rel, ...(d !== 'C' ? [dirAt(DIR_DEG[d] + 45), dirAt(DIR_DEG[d] - 45)] : [])].filter((x) => x && x !== 'C' && x !== d);
    return { d, alts: [...new Set(alts)] };
  });
}
/** 무리 가운데(dirsOf 의 상대 방위 기준과 같음): 단위 무게중심들의 평균 */
const midOf = (units, D) => { const cs = units.map((ids) => wcentroid(ids, D)); return [0, 1].map((k) => cs.reduce((s, c) => s + c[k], 0) / cs.length); };
/** d 에서 r 쪽으로 한 칸(45도) 돌린 방위. r 이 d 와 같은 쪽이나 반대쪽이면 null(돌릴 쪽이 없음) */
function turn(d, r) {
  const delta = angDiff(DIR_DEG[r], DIR_DEG[d]);
  if (Math.abs(delta) < 22.5 || Math.abs(delta) > 157.5) return null;
  return dirAt(DIR_DEG[d] + 45 * Math.sign(delta));
}
/**
 * 이름 정하기(N7). list: [{ ids, dir(규칙 방위, 방위 없는 이름은 null), alts(후보 방위), fmt(dir) → 이름, cU(무리 가운데), title }], accept(item, title) → 지도 검사 통과
 *  ① 규칙 이름이 지도 검사에 걸리면 후보 방위(alts) 가운데 검사를 지나고 다른 이름과 겹치지 않는 첫 것(없으면 검사만 지나는 첫 것)으로 바꾼다(fixed)
 *  ② 이름이 겹치면 이름마다 그 이름에 가장 잘 맞는 단위 하나는 그대로 두고('가운데'면 무리 가운데에 가장 가까운 것, 방위면 그쪽으로 가장 멀리 나간 것),
 *     나머지는 그대로 둔 단위에서 본 상대 방위로 고친다('가운데' → 그 방위, '북쪽' → 서쪽 쪽이면 '북서쪽'처럼 한 칸 돌림). 돌릴 쪽이 없거나(같은 축)
 *     그 이름이 검사에 걸리거나 겹치면 후보 방위 가운데 검사를 지나고 겹치지 않는 첫 것(renamed). 다 안 되면 원래 이름 그대로 둔다
 *  ③ 그래도 겹친 이름에는 그 단위에서 가장 넓은 동 이름을 붙인다('북쪽 · 상계1동 둘레', suffixed)
 */
export function resolveNames(list, D, accept) {
  for (const x of list) { x.renamed = false; x.suffixed = false; x.fixed = false; }
  const titles = () => new Set(list.map((x) => x.title));
  for (const x of list) {
    if (x.dir == null || accept(x, x.title)) continue;
    const others = new Set(list.filter((y) => y !== x).map((y) => y.title));
    const ok = (x.alts ?? []).filter((a) => accept(x, x.fmt(a)));
    const d2 = ok.find((a) => !others.has(x.fmt(a))) ?? ok[0];
    if (d2) { x.dir = d2; x.title = x.fmt(d2); x.fixed = true; }
    // 마지막 수단(E7): 규칙 방위와 후보 방위가 모두 지도 검사에 걸리면, '가운데' 검사(넓이 중심이 무리 가운데에서 등가 반지름의 CENTER_MAX 배 안)를
    // 지날 때만 '가운데'로 짓는다. 과가 2~3개라 둘러싸임(세 방향)을 채울 수 없는 단원의 가운데 띠 과(시흥시 2과 배곧·월곶·장곡·연성·능곡·군자)가 여기에 든다.
    // 걸리는 과가 없는 단원(서울 25단원 등)은 이름이 그대로다
    else if (accept(x, x.fmt('C'))) { x.dir = 'C'; x.title = x.fmt('C'); x.fixed = true; }
  }
  const groups = new Map();
  for (const x of list) { if (!groups.has(x.title)) groups.set(x.title, []); groups.get(x.title).push(x); }
  for (const [, G] of groups) {
    if (G.length < 2 || G.some((x) => x.dir == null)) continue;   // '시내'·'섬'처럼 방위가 없는 이름은 동 이름으로만 가른다
    const d0 = G[0].dir, fitOf = (x) => { const c = wcentroid(x.ids, D); return d0 === 'C' ? -dist(c, x.cU) : (c[0] - x.cU[0]) * Math.cos(DIR_DEG[d0] * Math.PI / 180) + (c[1] - x.cU[1]) * Math.sin(DIR_DEG[d0] * Math.PI / 180); };
    const keep = G.reduce((a, b) => (fitOf(b) > fitOf(a) ? b : a));
    const ck = wcentroid(keep.ids, D);
    for (const x of G) {
      if (x === keep) continue;
      const c = wcentroid(x.ids, D), r = sector8([c[0] - ck[0], c[1] - ck[1]]);
      const taken = titles();
      const d2 = [x.dir === 'C' ? r : turn(x.dir, r), ...(x.alts ?? [])].find((a) => a && a !== x.dir && !taken.has(x.fmt(a)) && accept(x, x.fmt(a)));
      if (!d2) continue;
      x.title = x.fmt(d2); x.dir = d2; x.renamed = true;
    }
  }
  const count = new Map();
  for (const x of list) count.set(x.title, (count.get(x.title) ?? 0) + 1);
  for (const x of list) if (count.get(x.title) > 1) { const big = x.ids.reduce((a, b) => (D[b].area > D[a].area ? b : a)); x.title = `${x.title} · ${D[big].ko} 둘레`; x.suffixed = true; }
  return list;
}
// 과 이름의 방위 낱말: 앱 판정 문장과 같은 '북동쪽' 꼴과, 시·군·구 과 원고의 '동북'·'서부' 꼴
const TOKENS = [
  [/(북동|동북)(쪽|부)?/, 'NE'], [/(북서|서북)(쪽|부)?/, 'NW'], [/(남동|동남)(쪽|부)?/, 'SE'], [/(남서|서남)(쪽|부)?/, 'SW'],
  [/북(쪽|부)/, 'N'], [/남(쪽|부)/, 'S'], [/동(쪽|부)/, 'E'], [/서(쪽|부)/, 'W'],
];
/**
 * 과 이름 지도 검사(N7). title 의 ' · ' 앞만 본다(뒤는 '○○동 둘레'처럼 동 이름).
 * 이름을 짓는 계산(이름표 점의 넓이 가중 중심 · 기준 상자 9칸 · 상대 방위)과 **다른 기준**으로 잰다 — 같은 계산으로 검사하면 구조상 실패할 수 없다(E3 검수 지적).
 *  방위 낱말: 과의 실제 칠한 넓이 중심(at)이 무리의 나머지 곳들의 넓이 중심(rest)에서 그 방향 ±60도(미터)이고, 둘 사이가 무리 등가 반지름의
 *            DIR_MIN(0.1)배보다 멀다(나머지와 무게중심이 겹치면 방향이 서지 않음). 무리 전체 넓이 중심에서 재면 넓은 과는 늘 그 옆이라 방향이 서지 않는다
 *  '가운데': 과의 넓이 중심이 무리 넓이 중심(base)에서 등가 반지름의 CENTER_MAX(0.35)배 안
 *  '끝': 과의 모든 곳이 기준(지역·단원) 바깥 경계에 닿음
 * (검수가 예로 든 '곳의 과반이 그 방향 칸·이웃 칸' 검사는 넣어 보았으나 뺐다: 기준점을 넓이 중심·곳 평균·상자 가운데 어느 것으로 두어도 이름 방향과 엇갈린
 *  쪽으로 길게 퍼진 과를 떨어뜨렸다 — 서초구 3과(서초1~4·양재·내곡)는 넓이로 남동쪽이 맞는데 서초1~4동이 가운데라 2/7 로 걸림. 2026-11-14)
 * ctx = { at, base, rest, r(무리 등가 반지름 m), allOuter }. 돌려주는 값: 지나지 못한 까닭 목록(빈 목록 = 통과)
 */
export function checkTitle(title, ctx) {
  let head = title.split(' · ')[0];
  const why = [];
  const R = Math.max(ctx.r, 1);
  const v = [ctx.at[0] - ctx.rest[0], ctx.at[1] - ctx.rest[1]], gap = Math.hypot(v[0], v[1]) / R;
  const deg = Math.atan2(v[1], v[0]) * 180 / Math.PI;
  for (const [re, d] of TOKENS) {
    const m = re.exec(head);
    if (!m) continue;
    head = head.slice(0, m.index) + ' '.repeat(m[0].length) + head.slice(m.index + m[0].length);   // 같은 글자를 두 번 읽지 않게
    const off = Math.abs(angDiff(deg, DIR_DEG[d]));
    if (gap < DIR_MIN) why.push(`'${m[0]}': 넓이 중심이 나머지 곳들과 겹침(등가 반지름의 ${gap.toFixed(2)}배 < ${DIR_MIN})`);
    else if (off > 60) why.push(`'${m[0]}': 나머지 곳들에서 본 넓이 중심이 ${deg.toFixed(0)}°(기대 ${DIR_DEG[d]}°±60)`);
  }
  const far = Math.hypot(ctx.at[0] - ctx.base[0], ctx.at[1] - ctx.base[1]) / R;
  if (title.split(' · ')[0].includes('가운데') && far > CENTER_MAX) why.push(`'가운데': 넓이 중심이 무리 가운데에서 등가 반지름의 ${far.toFixed(2)}배(> ${CENTER_MAX})`);
  if (title.split(' · ')[0].includes('끝') && !ctx.allOuter) why.push("'끝': 바깥 경계에 닿지 않는 곳이 있음");
  return why;
}
/** 지도 검사 문맥: 과(ids)와 그 무리(base 곳들). 나머지가 없으면(무리 = 과) 무리 자신을 나머지로 친다 */
export function titleCtx(ids, baseIdsList, D) {
  const set = new Set(ids), rest = baseIdsList.filter((id) => !set.has(id));
  return { at: acentroid(ids, D), base: acentroid(baseIdsList, D), rest: acentroid(rest.length ? rest : baseIdsList, D),
    r: Math.sqrt(baseIdsList.reduce((s, id) => s + Math.max(D[id].area, 1), 0) / Math.PI), allOuter: ids.every((id) => D[id].outer) };
}

/* ---------- 단원 하나 ---------- */
/**
 * 동 단원 하나의 과·넓은 화면·만나기 근거를 만든다.
 * 돌려주는 값: { lessons, screens, meet, problems, stats, base }
 *  lessons/screens 의 box 는 북쪽이 위인 미터 상자(build-geo.mjs 가 경위도 fit 으로 바꾼다), insets 는 섬 상자로 보이는 곳
 */
export function buildUnit(U) {
  // 단원의 곳이 모두 통째로 먼 섬이면(경북 울릉군 — 지역 먼 섬 규칙으로 세 곳 모두 near null) 곳마다 범위(main)를 섬 상자 범위(isle — isleRange,
  // 16px 를 지키는 한 가까운 덩어리까지)로 쓴다. 가장 큰 덩어리만이면 단원·과·화면 fit 에서 죽도(울릉읍)가 빠지고 관음도(북면)가 틀에 잘렸다(E14 검수).
  // 지역 섬 상자와 같은 범위다. 독도는 isleRange 밖이라 여전히 빠진다. 그런 단원이 아니면 입력 그대로(공개한 단원 파일은 바이트 같음)
  const wholeIsle = U.dongs.length > 0 && U.dongs.every((d) => d.box.near == null && d.box.isle);
  const D = Object.fromEntries(U.dongs.map((d) => [d.id, wholeIsle ? { ...d, box: { ...d.box, main: d.box.isle } } : d]));
  const all = U.dongs.map((d) => d.id).sort(byKo(D));
  const kindOf = (id) => (D[id].kind === '동' ? 'dong' : 'em');
  const mixed = new Set(all.map(kindOf)).size > 1;
  // 동과 읍·면을 따로 묶는 것(N10 1단계)은 두 쪽이 모두 SPLIT_MIN(3)곳 이상일 때만. 한쪽이 1~2곳이면(화성시 만세구의 새솔동 하나,
  // 창원시 마산회원구의 내서읍 하나) 따로 묶으면 1~2곳 과가 되어 한 무리로 묶는다(이름 앞에 '시내'·'읍·면'도 붙이지 않음)
  const split = mixed && ['dong', 'em'].every((k) => all.filter((id) => kindOf(id) === k).length >= SPLIT_MIN);
  const groupOf = (id) => (split ? kindOf(id) : 'one');

  // 1 먼 섬 동(N8): 단원 안에 맞닿은 동이 없고, 맞닿은 동이 있는 곳들의 상자(10% 늘림) 밖. 그런 곳이 없으면(옹진·신안처럼 모두 섬) 맞닿은 동이 없는 곳 모두
  const linked = all.filter((id) => D[id].nb.length);
  const core = linked.length ? widen(union(linked.map((id) => nearOf(D[id]))), CORE_MARGIN) : null;
  const islands = all.filter((id) => !D[id].nb.length && (!core || !hits(nearOf(D[id]), core)));
  const isIsland = new Set(islands);
  const land = all.filter((id) => !isIsland.has(id));
  // 가까운 섬(E7): 먼 섬은 아니지만 땅으로 맞닿은 곳이 하나도 없는 곳(단원 안 이웃도, 단원 밖 시·군·구도 없음 — 강화 교동면·삼산면).
  // 먼 섬과 합쳐 둘 이상이면 먼 섬과 함께 섬 과로 묶는다(가까운 섬은 본 지도, 먼 섬만 섬 상자). 다른 단원에 둘러싸인 곳(단원 밖 이웃이 있음)은 섬이 아니다
  const near0 = land.filter((id) => !D[id].nb.length && !D[id].out.length);
  const nearIsles = near0.length && islands.length + near0.length >= 2 ? near0 : [];
  const isNearIsle = new Set(nearIsles);
  const studyLand = land.filter((id) => !isNearIsle.has(id));   // 동·읍면 무리로 묶을 곳(가까운 섬은 섬 과로)
  // 섬이 아닌데 단원 안에 맞닿은 동이 없는 곳(다른 단원에 둘러싸인 곳 등)은 같은 무리에서 가장 가까운 곳과 맞닿은 것으로 친다(묶기에만 — 보고서는 '가상 이웃'으로 따로 셈)
  const virt = new Map();
  for (const id of studyLand) {
    if (D[id].nb.length) continue;
    const cands = studyLand.filter((o) => o !== id && groupOf(o) === groupOf(id));
    const pool = cands.length ? cands : studyLand.filter((o) => o !== id);
    if (!pool.length) continue;
    const near = pool.reduce((a, o) => (dist([D[o].x, D[o].y], [D[id].x, D[id].y]) < dist([D[a].x, D[a].y], [D[id].x, D[id].y]) ? o : a));
    for (const [a, b] of [[id, near], [near, id]]) { if (!virt.has(a)) virt.set(a, []); virt.get(a).push(b); }
  }
  const adj = (id) => [...D[id].nb, ...(virt.get(id) ?? [])];

  // 2 무리마다(동과 읍·면을 따로) 가족 덩어리 → 이웃을 따라 붙이기 → 16px 실패는 반으로 → 3곳 이하 과 고치기 → 다듬기(partition)
  const groups = split ? ['dong', 'em'] : ['one'];
  let lessons = [];
  const families = [], famIds = new Set();
  for (const g of groups) {
    const ids = studyLand.filter((id) => groupOf(id) === g);
    const { blocks, report } = blocksOf(ids, D);
    families.push(...report);
    for (const b of blocks) if (b.ids.length > 1) for (const id of b.ids) famIds.add(id);
    lessons.push(...partition(blocks, D, adj).map((ls) => ({ ids: ls, group: g, insets: [] })));
  }
  const lessonTap = (L) => tapWith(L.ids, L.insets, D, 'main', PHONE);
  // 4 섬 과: 먼 섬 동끼리(가까운 것끼리 5~7곳), 섬마다 삽입 상자. 하나뿐이면 같은 무리의 과(7곳 안을 먼저) 가운데 가장 가까운 과에 넣고 삽입 상자로.
  //   가까운 섬(nearIsles)이 있으면 먼 섬과 함께 묶고, 삽입 상자는 먼 섬만(가까운 섬은 본 지도에서 자리를 보인다)
  const allAdj = (id) => islands.filter((o) => o !== id);
  if (nearIsles.length) {
    const isleAll = [...islands, ...nearIsles].sort(byKo(D));
    const ib = isleAll.map((id) => ({ ids: [id], root: null }));
    const first = ib.reduce((a, b, i) => (nwScore([D[b.ids[0]].x, D[b.ids[0]].y]) < nwScore([D[ib[a].ids[0]].x, D[ib[a].ids[0]].y]) ? i : a), 0);
    lessons.push(...grow(ib, D, (id) => isleAll.filter((o) => o !== id), first).map((ls) => ({ ids: ls, group: 'island', insets: ls.filter((id) => isIsland.has(id)) })));
  } else if (islands.length >= 2) {
    const ib = islands.map((id) => ({ ids: [id], root: null }));
    const first = ib.reduce((a, b, i) => (nwScore([D[b.ids[0]].x, D[b.ids[0]].y]) < nwScore([D[ib[a].ids[0]].x, D[ib[a].ids[0]].y]) ? i : a), 0);
    lessons.push(...grow(ib, D, allAdj, first).map((ls) => ({ ids: ls, group: 'island', insets: [...ls] })));
  } else if (islands.length === 1 && lessons.length) {
    const id = islands[0], p = [D[id].x, D[id].y];
    const gap = (M) => Math.min(...M.ids.map((o) => dist([D[o].x, D[o].y], p)));
    const L = [...lessons].sort((a, b) => Number(b.group === groupOf(id)) - Number(a.group === groupOf(id)) || Number(a.ids.length < MAX ? 0 : 1) - Number(b.ids.length < MAX ? 0 : 1) || gap(a) - gap(b))[0];
    L.ids = [...L.ids, id];
    L.insets = [...L.insets, id];
  } else if (islands.length === 1) lessons.push({ ids: [...islands], group: 'island', insets: [...islands] });
  // 5 1곳 과(무리 안에서 맞닿은 과가 없거나 합칠 수 없던 곳)는 맞닿은 과로: 같은 무리 → 다른 무리 차례로,
  //   ① 합쳐 7곳 안이고 16px 이면 합치고 ② 아니면 맞닿은 과(5곳 이상)에서 가족이 아닌 한 곳을 넘겨받는다(넘겨준 과가 끊기지 않고 둘 다 16px).
  //   ③ 그래도 안 되면 마지막 수단으로 맞닿은 과(없으면 가까운 과)에 7곳을 넘더라도 합친다(보고서 '8곳 넘는 과')
  for (const L of [...lessons]) {
    if (L.ids.length !== 1 || L.group === 'island' || !lessons.includes(L)) continue;
    const id = L.ids[0], p = [D[id].x, D[id].y];
    const touching = (M) => M.ids.some((o) => adj(id).includes(o));
    const gap = (M) => Math.min(...M.ids.map((o) => dist([D[o].x, D[o].y], p)));
    const others = lessons.filter((M) => M !== L && M.group !== 'island');
    let done = false;
    for (const same of [true, false]) {
      const cs = others.filter((M) => touching(M) && (M.group === L.group) === same).sort((a, b) => a.ids.length - b.ids.length || gap(a) - gap(b));
      const to = cs.find((M) => M.ids.length < MAX && lessonTap({ ...M, ids: [...M.ids, id] }).min >= TAP_FAIL);
      if (to) { to.ids = [...to.ids, id]; lessons = lessons.filter((x) => x !== L); done = true; break; }
      const moves = [];
      for (const M of cs) {
        if (M.ids.length < 5) continue;
        for (const x of M.ids) {
          if (M.insets.includes(x) || famIds.has(x) || !adj(x).includes(id)) continue;
          const rest = M.ids.filter((y) => y !== x);
          if (components(rest.filter((y) => !M.insets.includes(y)), adj).length > 1) continue;
          if (lessonTap({ ...M, ids: rest }).min < TAP_FAIL || tap([id, x], D, 'main', PHONE).min < TAP_FAIL) continue;
          moves.push({ M, x, d: dist([D[x].x, D[x].y], p) });
        }
      }
      moves.sort((a, b) => a.d - b.d || (a.x < b.x ? -1 : 1));
      if (moves.length) { const { M, x } = moves[0]; M.ids = M.ids.filter((y) => y !== x); L.ids = [id, x]; done = true; break; }
    }
    if (done) continue;
    const cands = others.sort((a, b) => Number(touching(b)) - Number(touching(a)) || Number(b.group === L.group) - Number(a.group === L.group) || a.ids.length - b.ids.length || gap(a) - gap(b));
    for (const M of cands) {
      const merged = { ...M, ids: [...M.ids, id], insets: [...M.insets] };
      if (lessonTap(merged).min >= TAP_FAIL) { M.ids = merged.ids; lessons = lessons.filter((x) => x !== L); break; }
    }
  }
  // 보이는 범위에 든 먼 섬은 본 지도로(seenIsles — 강화 3과 서도면). 과 묶기는 그대로이고 섬 상자만 바뀐다
  for (const L of lessons) if (L.insets.length) seenIsles(L, D, 'main', PHONE);
  // 동과 읍·면을 따로 묶은 단원에서 1곳 과 처리나 섬 하나로 다른 무리의 곳이 든 과는 '섞인 과'(mix): 차례는 무리 과 뒤이고, 이름은 곳이 많은 무리의 앞말로 그 무리 과와 짝 지어 짓는다(7 이름)
  if (split) for (const L of lessons) if (L.group !== 'island' && new Set(L.ids.map(groupOf)).size > 1) L.group = 'mix';

  // 6 차례: 동 → 읍·면 → 섞인 과 → 섬, 무리 안에서는 북서쪽 과부터 가까운 과로. 한 숫자 가족이 둘 이상의 과에 나뉘면 작은 번호가 든 과가 앞(노원 상계1~5동 과가 상계6·7~10동 과 앞).
  //   과 안의 곳은 숫자 가족을 번호 차례로 붙이고 나머지는 북서쪽부터 가까운 차례
  const pathOrder = (items, cenOf) => {
    const left = [...items], out = [];
    let cur = left.sort((a, b) => nwScore(cenOf(a)) - nwScore(cenOf(b)))[0];
    while (cur) { out.push(cur); left.splice(left.indexOf(cur), 1); const c = cenOf(cur); cur = left.sort((a, b) => dist(cenOf(a), c) - dist(cenOf(b), c))[0]; }
    return out;
  };
  const famOrder = (ls) => {
    const roots = [...new Set(ls.flatMap((L) => L.ids.map((id) => familyOf(D[id].ko)?.root).filter(Boolean)))].sort();
    for (const root of roots) {
      const minNo = (L) => Math.min(...L.ids.filter((id) => familyOf(D[id].ko)?.root === root).map((id) => familyOf(D[id].ko).no));
      const at = ls.map((L, i) => (L.ids.some((id) => familyOf(D[id].ko)?.root === root) ? i : -1)).filter((i) => i >= 0);
      if (at.length < 2) continue;
      const sorted = at.map((i) => ls[i]).sort((a, b) => minNo(a) - minNo(b));
      at.forEach((i, k) => { ls[i] = sorted[k]; });
    }
    return ls;
  };
  const itemOrder = (ids) => {
    const subs = new Map();
    for (const id of ids) {
      const f = familyOf(D[id].ko), key = f && ids.filter((o) => familyOf(D[o].ko)?.root === f.root).length >= 2 ? `f:${f.root}` : `s:${id}`;
      if (!subs.has(key)) subs.set(key, []);
      subs.get(key).push(id);
    }
    const list = [...subs.values()].map((s) => s.sort((a, b) => (familyOf(D[a].ko)?.no ?? 0) - (familyOf(D[b].ko)?.no ?? 0) || byKo(D)(a, b)));
    return pathOrder(list, (s) => centroid(s, D)).flat();
  };
  const ORDER = [...groups, 'mix', 'island'];
  lessons = ORDER.flatMap((g) => famOrder(pathOrder(lessons.filter((L) => L.group === g), (L) => centroid(L.ids, D))));
  for (const L of lessons) L.ids = itemOrder(L.ids);

  // 7 이름(N7): 무리(동·읍면을 따로 묶은 단원은 그 무리, 섞인 과는 곳이 많은 무리(앞말 무리), 섬 과는 섬끼리, 그 밖은 섬을 뺀 단원)마다 dirsOf 로 방위를 정한다.
  //   무리에 과가 하나뿐이면 무리 이름(시내·읍·면) 또는 '전체', 섬 과는 '섬'·'{방위} 섬'. 이름이 겹치면 resolveNames(상대 방위 → 동 이름)
  const refOf = (ids) => ({ box: union(ids.map((id) => nearOf(D[id]))) });
  const unitRef = refOf(land.length ? land : all);
  const allRef = refOf(all);
  const own = (g) => split && (g === 'dong' || g === 'em');   // 동·읍면을 따로 묶은 단원의 한 무리
  const groupRef = (g) => (g === 'island' ? allRef : own(g) ? refOf(land.filter((id) => groupOf(id) === g)) : unitRef);
  const label = { dong: '시내', em: '읍·면' };
  // 이름·지도 검사는 본 지도에 보이는 곳으로 잰다: 섬 하나를 섬 상자로 넣은 과·화면은 그 섬을 뺀다(섬 과는 모두 섬 상자라 전부)
  const shown = (X) => (X.insets.length < X.ids.length ? X.ids.filter((id) => !X.insets.includes(id)) : X.ids);
  const nonIsland = (Ls) => Ls.filter((L) => L.group !== 'island').map(shown);
  // 지도 검사의 무리(기준 곳들): 섬 과는 단원 전체, 동·읍면을 따로 묶은 단원의 과는 그 무리, 그 밖(섞인 과 포함)은 섬을 뺀 단원
  const baseIds = (g) => (g === 'island' ? all : own(g) ? land.filter((id) => groupOf(id) === g) : (land.length ? land : all));
  // 지도 검사 문맥: 그 과의 무리(baseIds)와 무리 기준 상자(groupRef). 규칙 이름이 검사에 걸리면 resolveNames 가 후보 방위로 바꾸고(검사는 이름을 짓는 계산과
  // 다른 기준이라 걸러 내는 일을 한다), 후보가 다 걸리면 규칙 이름 그대로 두고 문제로 남긴다
  const ctxOf = (ids, g) => titleCtx(ids, baseIds(g), D);
  // 섞인 과의 앞말 무리(E7 검수 — 김포 3과 장기·김포본·사우·풍무동 + 고촌읍, 남양주 3과 별내동 + 별내·퇴계원·진건·오남·진접): 섞인 과는 곳이 많은 무리
  // (같으면 동)의 이름을 쓴다. 그 무리의 곳이 무리 과와 섞인 과에 나뉘므로, 무리 과에만 '시내'를 붙이면 그 과가 무리 전부인 것처럼 읽힌다(김포 1과 '시내'에
  // 동 8곳 가운데 4곳). 그래서 무리 과와 섞인 과를 한 무리로 보고 방위를 붙여 짝 이름이 되게 한다('시내 북서쪽'·'시내 남동쪽'). 과 차례는 그대로이고,
  // 섞인 과가 없는 단원은 이름이 그대로다
  const headOf = new Map(lessons.filter((L) => L.group === 'mix').map((L) => [L, L.ids.filter((id) => kindOf(id) === 'dong').length * 2 >= L.ids.length ? 'dong' : 'em']));
  const nameGroup = (L) => headOf.get(L) ?? L.group;
  // 과 이름 지도 검사의 무리: 앞말 무리에는 그 이름을 쓰는 섞인 과의 곳도 넣는다(섞인 과가 없으면 baseIds 그대로)
  const lessonBase = (g) => { const extra = lessons.filter((L) => headOf.get(L) === g).flatMap(shown); return extra.length ? [...new Set([...baseIds(g), ...extra])] : baseIds(g); };
  const ctxL = (ids, g) => titleCtx(ids, lessonBase(g), D);
  const named = [];
  const peersL = nonIsland(lessons);
  for (const g of ORDER) {
    if (g === 'mix') continue;   // 섞인 과는 앞말 무리와 함께 짓는다
    const ls = lessons.filter((L) => nameGroup(L) === g);
    if (!ls.length) continue;
    const ref = ls.some((L) => headOf.has(L)) ? refOf(lessonBase(g)) : groupRef(g);
    const ds = dirsOf(ls.map(shown), peersL, ref, D);
    const cU = midOf(ls.map(shown), D);
    for (const L of ls) {
      const { d, alts } = ds[ls.indexOf(L)];
      let fmt = null, title = null;
      if (g === 'island') { if (ls.length === 1) title = '섬'; else fmt = (x) => `${dirWord(x)} 섬`; }
      else if (ls.length === 1) title = own(g) ? label[g] : lessons.length === 1 ? '전체' : null;
      if (title == null && !fmt) fmt = own(g) ? (x) => `${label[g]} ${dirWord(x)}` : (x) => dirWord(x);
      named.push({ L, ids: shown(L), dir: fmt ? d : null, alts, fmt: fmt ?? (() => title), cU, title: fmt ? fmt(d) : title, g });
    }
  }
  resolveNames(named, D, (x, t) => !checkTitle(t, ctxL(x.ids, x.g)).length);
  for (const x of named) { x.L.title = x.title; x.L.renamed = x.renamed; x.L.suffixed = x.suffixed; x.L.fixed = x.fixed; x.L.center = x.dir === 'C'; }

  // 8 넓은 화면(전체 연습·시험): 섬을 뺀 단원이 한 화면에서 16px 이 되면 하나, 아니면 동·읍면으로 나눈 뒤 반씩 나누고,
  //   나눈 화면끼리 다시 합쳐도 16px 이 되면 합친다(작은 화면부터). 칸 크기는 과 화면처럼 곳마다 가장 큰 덩어리 기준(SCREEN_KIND) —
  //   군산 옥도면처럼 섬이 흩어진 동은 덩어리 전부로 재면 혼자서도 16px 이 안 된다. 먼 섬은 따로 '섬' 화면(하나뿐이면 가까운 화면의 섬 상자)
  let parts;
  if (land.length < 2 || tap(land, D, SCREEN_KIND, PHONE_WIDE).min >= TAP_FAIL) parts = land.length ? [{ ids: [...land], group: null, insets: [] }] : [];
  else {
    parts = groups.flatMap((g) => splitUntil(land.filter((id) => groupOf(id) === g), D, SCREEN_KIND, PHONE_WIDE).map((ids) => ({ ids, group: g, insets: [] })));
    for (let again = true; again;) {
      again = false;
      const order = [...parts].sort((a, b) => a.ids.length - b.ids.length);
      for (const A of order) {
        const B = parts.filter((S) => S !== A && (S.group === A.group || !split))
          .filter((S) => tap([...A.ids, ...S.ids], D, SCREEN_KIND, PHONE_WIDE).min >= TAP_FAIL)
          .sort((a, b) => a.ids.length - b.ids.length || dist(centroid(a.ids, D), centroid(A.ids, D)) - dist(centroid(b.ids, D), centroid(A.ids, D)))[0];
        if (B) { B.ids.push(...A.ids); parts.splice(parts.indexOf(A), 1); again = true; break; }
      }
    }
    // 다시 합친 뒤에도 3곳 이하인 화면(E7 검수 — 화성시 만세구 '북서쪽' 송산면·새솔동 2곳: 전체 연습·시험 문제가 그 화면 안에서 둘 중 하나 고르기가 된다)은
    // 맞닿은 화면에서 맞닿은 곳을 하나씩 넘겨받는다. 넘겨받는 곳은 그 화면 가운데에서 가까운 차례이고, 두 화면이 모두 16px 를 지키고 넘겨준 화면의
    // 이어진 덩어리 수가 늘지 않을 때만이다. 두 화면의 곳 수 차이가 1 이하가 될 때까지 한다(만세구 2·8 → 5·5). 3곳 이하 화면이 없는 단원(서울 25단원 등)은 그대로
    // cross: 다른 무리(동↔읍·면) 화면에서도 넘겨받는다(아래 E13)
    const borrow = (A, cross) => {
      for (;;) {
        const cA = centroid(A.ids, D), moves = [];
        for (const B of parts) {
          if (B === A || (split && !cross && B.group !== A.group) || B.ids.length - A.ids.length < 2) continue;
          const nB = components(B.ids, adj).length;
          for (const x of B.ids) {
            if (!adj(x).some((a) => A.ids.includes(a))) continue;
            const rest = B.ids.filter((y) => y !== x);
            if (components(rest, adj).length > nB) continue;
            if (tap(rest, D, SCREEN_KIND, PHONE_WIDE).min < TAP_FAIL || tap([...A.ids, x], D, SCREEN_KIND, PHONE_WIDE).min < TAP_FAIL) continue;
            moves.push({ B, x, d: dist([D[x].x, D[x].y], cA) });
          }
        }
        if (!moves.length) break;
        moves.sort((a, b) => a.d - b.d || byKo(D)(a.x, b.x));
        const { B, x } = moves[0];
        B.ids.splice(B.ids.indexOf(x), 1);
        A.ids.push(x);
      }
    };
    for (const A of parts) if (A.ids.length <= 3) borrow(A, false);
    // E13: 같은 무리 안에서 넘겨받아도 3곳 이하인 화면 — 무리 전체가 3곳(청주시 청원구·흥덕구의 읍·면)이거나, 16px 때문에 무리가 3곳씩으로 나뉜 경우(제주시 읍·면 서쪽·동쪽,
    // 우도면이 작아 읍·면 여섯을 한 화면에 넣지 못함) — 는 다른 무리 화면에서도 같은 조건(맞닿은 곳, 두 화면 모두 16px, 넘겨준 화면의 덩어리 수가 늘지 않음,
    // 곳 수 차이 1 이하까지)으로 넘겨받는다. 넘겨받으면 화면이 무리를 가르지 않으므로(동 하나가 든 '읍·면' 화면, 동이 다 들지 않은 '시내' 화면)
    // 그 단원의 화면 이름은 무리 말('시내'·'읍·면') 없이 단원 기준 방위로 짓는다(섞인 과의 짝 이름과 같은 생각 — E7). 3곳 이하 화면이 없는 단원은 그대로(E12 까지 공개한 단원 모두)
    if (split && parts.some((A) => A.ids.length <= 3)) {
      let moved = false;
      for (const A of parts) if (A.ids.length <= 3) { const n = A.ids.length; borrow(A, true); moved ||= A.ids.length > n; }
      if (moved) for (const S of parts) S.group = 'one';
    }
  }
  if (islands.length >= 2 || !parts.length) parts.push({ ids: [...islands], group: 'island', insets: [...islands] });
  else if (islands.length === 1) {
    const id = islands[0], p = [D[id].x, D[id].y];
    const S = parts.reduce((a, b) => (dist(centroid(b.ids, D), p) < dist(centroid(a.ids, D), p) ? b : a));
    S.ids.push(id); S.insets.push(id);
  }
  parts = parts.filter((S) => S.ids.length);
  // 보이는 범위에 든 먼 섬은 본 지도로(seenIsles — 강화 전체 화면의 서도면)
  for (const S of parts) if (S.insets.length) seenIsles(S, D, SCREEN_KIND, PHONE_WIDE);
  parts = [...pathOrder(parts.filter((S) => S.group !== 'island'), (S) => centroid(S.ids, D)), ...parts.filter((S) => S.group === 'island')];
  // 화면 이름: 과 이름과 같은 규칙(dirsOf · resolveNames)으로, 무리마다(동·읍면을 따로 나눈 단원은 그 무리)
  const screenNames = parts.map(() => null);
  if (parts.length === 1) screenNames[0] = { title: U.ko, dir: null };
  else {
    const peersS = parts.filter((S) => S.group !== 'island').map(shown);
    const sNamed = [];
    for (const g of [...new Set(parts.map((S) => S.group))]) {
      const ps = parts.filter((S) => S.group === g);
      if (g === 'island') { for (const S of ps) sNamed.push({ S, ids: S.ids, dir: null, fmt: () => '섬', cU: null, title: '섬', g: 'island' }); continue; }
      // 무리에 화면이 하나뿐이면 과처럼 무리 이름('시내'·'읍·면'), 섬을 뺀 단원 한 화면(+ 섬 화면)이면 단원 이름
      if (ps.length === 1) { const t = own(g) ? label[g] : U.ko; sNamed.push({ S: ps[0], ids: shown(ps[0]), dir: null, fmt: () => t, cU: null, title: t, g }); continue; }
      // g 가 null(섬을 뺀 단원 한 화면 + 섬 화면)이거나 'one' 이면 섬을 뺀 단원 기준, 동·읍면을 따로 나눈 단원은 그 무리 기준
      const ds = dirsOf(ps.map(shown), peersS, groupRef(g), D);
      const cU = midOf(ps.map(shown), D);
      const fmt = own(g) ? (x) => `${label[g]} ${dirWord(x)}` : (x) => dirWord(x);
      ps.forEach((S, i) => sNamed.push({ S, ids: shown(S), dir: ds[i].d, alts: ds[i].alts, fmt, cU, title: fmt(ds[i].d), g }));
    }
    resolveNames(sNamed, D, (x, t) => !checkTitle(t, ctxOf(x.ids, x.g)).length);
    for (const x of sNamed) screenNames[parts.indexOf(x.S)] = x;
  }
  const screens = parts.map((S, i) => {
    const t = tapWith(S.ids, S.insets, D, SCREEN_KIND, PHONE_WIDE);
    return { key: parts.length === 1 ? 'all' : S.group === 'island' ? 'islands' : `s${i + 1}`, ko: screenNames[i].title, ids: itemOrder(S.ids), insets: S.insets, box: t.box, minTapPx: t.min, at: t.at, ambiguous: t.ambiguous };
  });

  // 9 만나기 근거(N13): ① 단원 안 끝 ② 맞닿은 단원 밖 시·군·구 ③ 단원에서 본 방위(9칸, 이름표 점)
  //   '끝'은 동이 그쪽으로 가장 멀리 나간 자리(먼 섬을 뺀 덩어리 상자의 변)로 줄 세워 3위 안(작은 단원은 2·1위)이고, 그 자리가 단원 상자의 그쪽 변에서
  //   상자 길이의 EDGE_REACH(15%) 안이며, 단원 바깥 경계에 닿고, 9칸 방위가 그쪽 성분을 가질 때만 준다('가운데'인 곳에는 주지 않음).
  //   섬 과·섬 상자로 보이는 먼 섬 동은 줄 세우기에서 뺀다(지도에서 자리가 보이지 않음). 모든 곳이 섬이면 전부로 줄 세운다.
  //   이름표 점으로 줄 세우면 서초2동이 '동쪽 끝'(실제 4위)처럼 지도와 어긋났다(E3 검수, 서울 28곳)
  const pool = land.length ? land : all;
  const n = pool.length, R = n >= 10 ? 3 : n >= 6 ? 2 : n >= 4 ? 1 : 0;
  const EXT = { N: (b) => b[3], S: (b) => -b[1], E: (b) => b[2], W: (b) => -b[0] };
  const ub = unitRef.box, span = { N: ub[3] - ub[1], S: ub[3] - ub[1], E: ub[2] - ub[0], W: ub[2] - ub[0] };
  const rank = {};
  for (const d of ['N', 'E', 'S', 'W']) {
    [...pool].sort((p, q) => EXT[d](nearOf(D[q])) - EXT[d](nearOf(D[p])) || byKo(D)(p, q)).forEach((id, i) => { (rank[id] ||= {})[d] = i + 1; });
  }
  const meet = {};
  for (const id of all) {
    const dir = dirIn([D[id].x, D[id].y], unitRef);
    const ok = (d) => rank[id] && D[id].outer && rank[id][d] <= R && dir.includes(d) && EXT[d](ub) - EXT[d](nearOf(D[id])) <= EDGE_REACH * span[d];
    const edge = ['N', 'E', 'S', 'W'].filter(ok).sort((a, b) => rank[id][a] - rank[id][b])[0];
    meet[id] = { dir, ...(edge ? { edge } : {}), ...(D[id].out.length ? { touch: [...D[id].out] } : {}) };
  }

  // 10 문제와 통계
  const problems = [];
  const outLessons = lessons.map((L, i) => {
    const t = lessonTap(L);
    const why = checkTitle(L.title, ctxL(shown(L), nameGroup(L)));
    if (t.min < TAP_FAIL) problems.push({ kind: 'tap', msg: `${i + 1}과 ${L.title}: 가장 작은 칸 ${D[t.at].ko} ${t.min}px (<${TAP_FAIL})` });
    if (L.ids.length === 1 && all.length > 1) problems.push({ kind: 'single', msg: `${i + 1}과 ${L.title}: 1곳 과(${D[L.ids[0]].ko}) — 이웃 과에 합치지 못함` });
    for (const w of why) problems.push({ kind: 'name', msg: `${i + 1}과 ${L.title}: 이름 검사 ${w}` });
    const main = L.ids.filter((id) => !L.insets.includes(id));
    return { no: i + 1, title: L.title, ids: L.ids, insets: L.insets, group: L.group, box: t.box, minTapPx: t.min, at: t.at, ambiguous: t.ambiguous,
      center: L.center, fixed: L.fixed, renamed: L.renamed, suffixed: L.suffixed,
      // 맞닿음: 실제(단원 안 이웃만)로 끊긴 과와, 가상 이웃(맞닿은 동이 없는 곳을 가까운 동과 이어 친 것)으로만 이어진 과를 따로 센다
      apart: L.group !== 'island' && components(main, (id) => D[id].nb).length > 1, virtual: L.group !== 'island' && main.some((id) => virt.has(id)) };
  });
  for (const S of screens) if (S.minTapPx < TAP_FAIL) problems.push({ kind: 'tap', msg: `넓은 화면 ${S.ko}: 가장 작은 칸 ${D[S.at].ko} ${S.minTapPx}px (<${TAP_FAIL})` });
  screens.forEach((S, i) => {
    if (!screenNames[i].dir) return;
    for (const w of checkTitle(S.ko, ctxOf(shown(parts[i]), parts[i].group))) problems.push({ kind: 'name', msg: `넓은 화면 ${S.ko}: 이름 검사 ${w}` });
  });
  const inLesson = new Map();
  for (const L of outLessons) for (const id of L.ids) inLesson.set(id, (inLesson.get(id) ?? 0) + 1);
  for (const id of all) if (inLesson.get(id) !== 1) problems.push({ kind: 'cover', msg: `${D[id].ko}: 과 ${inLesson.get(id) ?? 0}개에 듦` });
  // 가족이 끝까지 한 과에 남았나(16px 반 나누기·1곳 과 합치기 뒤)
  const lessonOf = new Map(outLessons.flatMap((L) => L.ids.map((id) => [id, L.no])));
  for (const f of families) {
    const mem = land.filter((id) => familyOf(D[id].ko)?.root === f.root);
    f.lessons = new Set(mem.map((id) => lessonOf.get(id))).size;   // 가족 전부(접힌 곳 포함)가 든 과 수
    f.broken = f.partIds.filter((p) => new Set(p.map((id) => lessonOf.get(id))).size > 1).length;   // 한 과에 모으려던 조각이 16px 반 나누기로 갈라진 수
    delete f.partIds;
  }
  const sizes = {};
  for (const L of outLessons) sizes[L.ids.length] = (sizes[L.ids.length] ?? 0) + 1;
  const stats = {
    n: all.length, kinds: { dong: all.filter((id) => D[id].kind === '동').length, eup: all.filter((id) => D[id].kind === '읍').length, myeon: all.filter((id) => D[id].kind === '면').length },
    mixed, split, lessons: outLessons.length, sizes, small: [1, 2, 3].map((k) => sizes[k] ?? 0),
    minTapPx: Math.min(...outLessons.map((L) => L.minTapPx)), ambiguous: outLessons.reduce((t, L) => t + L.ambiguous.length, 0),
    islands: islands.length, nearIsles: nearIsles.length, islandLessons: outLessons.filter((L) => L.group === 'island').length, insetSingles: outLessons.filter((L) => L.group !== 'island' && L.insets.length).length,
    screens: screens.length, screenMinTapPx: Math.min(...screens.map((S) => S.minTapPx)), screenAmbiguous: screens.reduce((t, S) => t + S.ambiguous.length, 0),
    families, virtual: [...virt.keys()].filter((id) => !D[id].nb.length).length,
    disconnected: outLessons.filter((L) => L.apart).length,          // 실제로 맞닿지 않은 곳이 섞인 과(가상 이웃은 이웃으로 치지 않음)
    virtualLessons: outLessons.filter((L) => L.virtual).length,      // 가상 이웃으로 묶은 곳이 든 과
    mixLessons: outLessons.filter((L) => L.group === 'mix').length,  // 동과 읍·면을 따로 묶은 단원에서 다른 무리의 곳이 든 과
    center: outLessons.filter((L) => L.center).length, fixed: outLessons.filter((L) => L.fixed).length, renamed: outLessons.filter((L) => L.renamed).length, suffixed: outLessons.filter((L) => L.suffixed).length,
    nameFail: new Set(problems.filter((p) => p.kind === 'name').map((p) => p.msg.split(':')[0])).size,
  };
  // 단원 전체 지도 범위(view — 단원 쪽·둘러보기, 앱 maps.ts wholeView 가 섬 상자가 없으면 단원 fit 을 쓴다): 섬을 뺀 단원(base)에
  // 넓은 화면에서 섬 상자로 남지 않은 먼 섬(seenIsles 로 본 지도에 둔 곳 — 강화 서도면)을 더한다. 그런 섬이 없으면 base 그대로(E7 검수: 폰 단원 쪽에서 서도면이 잘렸다)
  const screenIsles = new Set(screens.flatMap((S) => S.insets));
  const seenFar = islands.filter((id) => !screenIsles.has(id));
  const view = land.length && seenFar.length ? union([unitRef.box, ...seenFar.map((id) => nearOf(D[id]))]) : unitRef.box;
  return { lessons: outLessons, screens, meet, problems, stats, base: unitRef.box, view, islands };
}
