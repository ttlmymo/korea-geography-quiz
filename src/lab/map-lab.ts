// 지도 실험실 동작: 실제 데이터로 과 하나를 흉내 내며 판정 표시를 보고, 끌기·집기 때 프레임 시간을 잰다.
// 화면 흐름은 S6 에서 제대로 만든다. 여기서는 지도 모듈(src/app/map)이 설계서대로 그리고 반응하는지만 본다
import { geoUrl, loadGeo, loadJSON, loadTopo } from '../app/data.ts';
import { createRegistry } from '../app/registry.ts';
import { buildShapes, specOf, type Shapes } from '../app/map/shapes.ts';
import { createSvgMap, type SvgMap } from '../app/map/svgmap.ts';
import { boxOf } from '../app/map/project.ts';
import type { Pad } from '../app/map/view.ts';
import { wrongInfo, type Tap } from '../app/core/judge.ts';
import { chooseOptions } from '../app/core/questions.ts';
import { rngFrom, shuffle } from '../app/core/rng.ts';
import { TAP_KO, dontKnowKo, promptKo, rightKo, wrongKo } from '../app/text/ko.ts';
import type { LabelsFile } from '../app/types.ts';
import { devLog } from '../app/devlog.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const root = document.querySelector<HTMLElement>('.lab')!;
const base = root.dataset.base!, ver = root.dataset.ver!;
const ui = {
  region: $<HTMLSelectElement>('region'), lesson: $<HTMLSelectElement>('lesson'), mode: $<HTMLSelectElement>('mode'),
  fps: $('fps'), band: $('band'), map: $('map'), reset: $<HTMLButtonElement>('reset'), toast: $('toast'), sheet: $('sheet'),
};

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
function button(text: string, cls: string, on: () => void) {
  const b = h('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', on);
  return b;
}

let toastTimer = 0;
function toast(text: string) {
  ui.toast.textContent = text;
  ui.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { ui.toast.hidden = true; }, 1600);
}

/* ---------- 프레임 재기: 손가락을 대고 있는 동안 + 뗀 뒤 0.4초 ---------- */
const frames: number[] = [];
let last = 0, holding = 0, stopAt = 0, commitMs = 0, paintMs = 0, fingers = 0;
function tick(t: number) {
  if (last) frames.push(t - last);
  last = t;
  if (holding > 0 || performance.now() < stopAt) requestAnimationFrame(tick);
  else report();
}
function report() {
  if (frames.length < 5) return;
  const s = frames.slice().sort((a, b) => a - b);
  const avg = s.reduce((a, b) => a + b, 0) / s.length;
  const p95 = s[Math.floor(s.length * 0.95)];
  const slow = s.filter((v) => v > 20).length;
  ui.fps.textContent = `프레임 평균 ${avg.toFixed(1)}ms · 95% ${p95.toFixed(1)}ms · 20ms 넘음 ${slow}/${s.length} · 다시 그리기 ${commitMs.toFixed(1)}+${paintMs.toFixed(0)}ms`;
  // 실기기 점검: 한 번 끌기·집기마다 PC 로(개발 서버에서만)
  devLog('frames', { mode: ui.mode.value, region: ui.region.value, gesture: fingers > 1 ? 'pinch' : 'drag', n: s.length, avg: +avg.toFixed(1), p95: +p95.toFixed(1), slow, commitMs: +commitMs.toFixed(1), paintMs: Math.round(paintMs) });
}
ui.map.addEventListener('pointerdown', () => {
  if (holding++ === 0 && performance.now() >= stopAt) {
    frames.length = 0;
    last = 0;
    fingers = 0;
    requestAnimationFrame(tick);
  }
  fingers = Math.max(fingers, holding);
});
const lift = () => { holding = Math.max(0, holding - 1); stopAt = performance.now() + 400; };
ui.map.addEventListener('pointerup', lift);
ui.map.addEventListener('pointercancel', lift);
ui.map.addEventListener('wheel', () => {
  if (holding === 0 && performance.now() >= stopAt) { frames.length = 0; last = 0; requestAnimationFrame(tick); }
  stopAt = performance.now() + 400;
}, { passive: true });

/* ---------- 상태 ---------- */
const geo = await loadGeo(base, ver);
const reg = createRegistry(geo);
let map: SvgMap | null = null;
let shapes: Shapes | null = null;
let order: string[] = [];
let target = '';
let phase: 'ask' | 'wrong' | 'done' = 'ask';
let hintUsed = false;
let rng = rngFrom(1);
let qn = 0;
const PAD_TOP = 12, PAD_SIDE = 16;

for (const r of reg.regions) ui.region.append(new Option(r.ko, r.key));
function fillLessons() {
  const r = reg.region(ui.region.value)!;
  ui.lesson.replaceChildren(...r.lessons.map((l) => new Option(`${l.no}과 ${l.title}`, String(l.no))), new Option('지역 전체', '0'));
}
fillLessons();

const nm = (id: string) => reg.place(id)?.item.ko ?? id;
const lessonIds = () => {
  const no = Number(ui.lesson.value);
  return no ? reg.lesson(ui.region.value, no)!.items : reg.region(ui.region.value)!.items.map((it) => it.id);
};

/** 시트를 그리고, 그 높이만큼 지도 아래 여백을 준다(설계서 4.2: 아래 = 시트 높이 + 12) */
function setSheet(parts: HTMLElement[]): Pad {
  ui.sheet.replaceChildren(...parts);
  ui.sheet.hidden = !parts.length;
  const pad = { t: PAD_TOP, r: PAD_SIDE, l: PAD_SIDE, b: (parts.length ? ui.sheet.offsetHeight : 0) + 12 };
  map?.setPad(pad);
  return pad;
}

async function build() {
  map?.destroy();
  map = null;
  const mode = ui.mode.value;
  ui.lesson.disabled = mode === 'emd' || mode === 'fill';
  ui.region.disabled = mode === 'emd';
  if (mode === 'emd') {
    // 부하 시험: 서울 427동 한 화면(설계서 5.3·결정 8)
    const [topo, labels] = await Promise.all([loadTopo(base, ver, 'seoul', 'emd'), loadJSON<LabelsFile>(geoUrl(base, ver, 'labels-emd.json'))]);
    const geoms = topo.objects.emd.geometries as { properties: { id: string; name: string; sggName: string } }[];
    const names = new Map(geoms.map((g) => [g.properties.id, `${g.properties.sggName} ${g.properties.name}`]));
    shapes = buildShapes(topo, { layer: 'emd', idKey: 'id', ids: geoms.map((g) => g.properties.id) }, labels);
    map = createSvgMap(ui.map, { shapes, onTap: (t) => toast(t.type === 'cell' ? names.get(t.id) ?? t.id : TAP_KO[t.type]), onZoomed, onCommit });
    const r = rngFrom(7);
    map.setFills(Object.fromEntries(shapes.ids.map((id) => [id, Math.floor(r() * 4)])));
    map.setHome(shapes.box, { t: 12, r: 12, b: 12, l: 12 });
    ui.band.textContent = `서울 ${shapes.ids.length}동 · 끌기·집기로 확대해 보세요`;
    setSheet([]);
    return;
  }
  const region = reg.region(ui.region.value)!;
  const topo = await loadTopo(base, ver, region.key);
  shapes = buildShapes(topo, specOf(region), geo.labels);
  map = createSvgMap(ui.map, { shapes, onTap, onZoomed, onCommit });
  if (mode === 'fill') {
    const r = rngFrom(3);
    map.setFills(Object.fromEntries(shapes.ids.map((id) => [id, Math.floor(r() * 4)])));
    map.setHome(boxOf(region.fit), { t: 12, r: 12, b: 12, l: 12 });
    // 복습할 곳 배지(무작위 다섯 곳): 작은 칸은 지도 아래 목록으로
    const small = map.setBadges(shuffle(shapes.ids, r).slice(0, 5));
    ui.band.textContent = `${region.ko} 채움 지도(무작위 단계)`;
    setSheet(small.length ? [h('div', 't3', `복습할 곳(칸이 작아 목록으로): ${small.map(nm).join(', ')}`)] : []);
    return;
  }
  const ids = lessonIds();
  const no = Number(ui.lesson.value);
  map.setActive(ids);
  map.setRim(no ? ids : null);
  const pad = setSheet([h('div', 't3', '…')]);
  map.setHome(no ? boxOf(reg.lesson(region.key, no)!.fit) : boxOf(region.fit), pad);
  rng = rngFrom(Date.now() % 100000);
  order = [];
  qn = 0;
  next();
}

function next() {
  if (!map) return;
  if (!order.length) order = shuffle(lessonIds(), rng);
  target = order.shift()!;
  phase = 'ask';
  hintUsed = false;
  qn++;
  map.clearMarks();
  map.setHint(null);
  map.setLabels([]);
  map.resetView(false);
  const mode = ui.mode.value as 'find' | 'meet' | 'choose';
  const q = promptKo(reg, { mode, id: target });
  ui.band.textContent = q.band;
  if (mode === 'meet') {
    map.setQuestion(target, { breathe: qn <= 2 });
    map.setLabels([{ id: target, text: nm(target) }]);
    setSheet([h('div', 't2', q.line ?? ''), h('div', 't3', q.act ?? '')]);
  } else if (mode === 'choose') {
    map.setQuestion(target);
    const opts = h('div', 'opts');
    for (const o of chooseOptions(reg, target, 0, rng)) opts.append(button(nm(o), 'btn2', () => choose(o)));
    setSheet([opts]);
  } else {
    map.setQuestion(null);
    const row = h('div', 'row');
    const hintBtn = button('힌트', 'btn2', () => {
      if (hintUsed) return;
      hintUsed = true;
      hintBtn.textContent = '힌트 썼어요';
      hintBtn.disabled = true;
      const near = lessonIds().filter((v) => v !== target).sort((a, b) => reg.dist(target, a) - reg.dist(target, b)).slice(0, 2);
      map!.setHint([target, ...near]);
    });
    row.append(hintBtn, button('모르겠어요', 'btn2', dontKnow));
    setSheet([row]);
  }
}

function afterJudge(parts: HTMLElement[], reveal: string[]) {
  const pad = setSheet(parts);
  if (reveal.length) map!.reveal(reveal, pad);
}

function right() {
  phase = 'done';
  map!.setHint(null);
  map!.setQuestion(null);
  map!.mark({ ok: target, pencil: true });
  const t = rightKo(reg, target, true);
  afterJudge([h('div', 't1 ok', `○ ${t.title}`), h('div', 't2', t.line), button('다음', 'btn', next)], [target]);
}

function wrong(picked: string, chose: boolean) {
  phase = 'wrong';
  map!.setHint(null);
  map!.mark({ ok: target, no: picked, arrow: true });
  const t = wrongKo(reg, wrongInfo(reg, target, picked), chose);
  afterJudge([h('div', 't1 no', `✕ ${t.title}`), h('div', 't2', t.where), h('div', 't3', `○ ${t.act}`)], [picked, target]);
}

function dontKnow() {
  phase = 'wrong';
  map!.setHint(null);
  map!.mark({ ok: target, blink: true });
  const t = dontKnowKo(reg, target);
  afterJudge([h('div', 't1', t.title), h('div', 't3', t.act)], [target]);
}

function choose(picked: string) {
  if (phase !== 'ask') return;
  if (picked === target) right();
  else wrong(picked, true);
}

function onTap(tap: Tap) {
  if (tap.type !== 'cell') return toast(TAP_KO[tap.type]);
  const mode = ui.mode.value;
  if (phase === 'done') return;
  if (phase === 'wrong') {
    if (tap.id === target) {
      phase = 'done';
      ui.sheet.append(button('다음', 'btn', next));
      map!.setPad({ t: PAD_TOP, r: PAD_SIDE, l: PAD_SIDE, b: ui.sheet.offsetHeight + 12 });
    } else toast('○ 표시한 칸을 눌러 보세요');
    return;
  }
  if (mode === 'meet') {
    if (tap.id === target) {
      map!.mark({ ok: target, pencil: true });
      window.setTimeout(next, 450);
    } else toast('테두리 친 칸을 눌러 보세요');
    return;
  }
  if (mode === 'choose') return toast('아래 보기에서 골라 주세요');
  if (tap.id === target) right();
  else wrong(tap.id, false);
}

function onZoomed(z: boolean) {
  ui.reset.hidden = !z;
}
function onCommit(ms: number) {
  commitMs = ms;
  const t0 = performance.now();
  requestAnimationFrame(() => requestAnimationFrame(() => { paintMs = performance.now() - t0; }));
}

ui.reset.addEventListener('click', () => map?.resetView());
ui.region.addEventListener('change', () => { fillLessons(); build(); });
ui.lesson.addEventListener('change', build);
ui.mode.addEventListener('change', build);
build();
