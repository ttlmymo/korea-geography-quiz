// 둘러보기(설계서 4.1 S11, 합본 디자인 3.3): 이름 붙은 지도, 이름 가리기, 채움 색, 칸을 누르면 그곳 정보(위치 한 줄·이웃·과 연습).
// 문제 화면처럼 화면 전체(머리글·바닥글 없음, 스크롤 없음): 머리(← 뒤로 · 제목 · 이름 가리기·채움 색 토글) + 본문.
// 넓은 화면(1024 이상)은 왼쪽 열 = 고른 곳 정보 · 출처 | 오른쪽 틀 있는 큰 지도(캡션·범례 · 조작 안내),
// 좁은 화면은 지도(남은 높이) → [범례 줄: 채움 색일 때] → 정보 띠(선으로 나눔, 지도를 덮지 않고 지도 칸이 줄어든다).
// 지도는 그대로 두고(확대 유지) 정보와 칸 상태만 바꾼다. 고른 곳은 주소(#/kr/{지역}/explore/{slug})에도 남긴다
import type { Tap } from '../core/judge.ts';
import { toHash } from '../router.ts';
import type { SvgMap } from '../map/svgmap.ts';
import type { Pad } from '../map/view.ts';
import { fillsOf, type Ctx } from './ctx.ts';
import { ICON, esc } from './dom.ts';
import { L, placeName } from '../text/ui.ts';
import { boxOf } from '../map/project.ts';
import { STAGE_SCALE_MIN, insetPad, mountMap, shapesOf } from './maps.ts';

/** 넓은 화면 배치가 시작되는 폭(app.css·play.ts 와 같다) */
const WIDE_MQ = '(min-width: 1024px)';

export function mountExplore(root: HTMLElement, ctx: Ctx, regionKey: string, slug: string | null) {
  const { reg } = ctx;
  const r = reg.region(regionKey)!;
  const st = { hide: false, fill: false, sel: slug ? reg.bySlug(regionKey, slug)?.item.id ?? null : null, peek: null as string | null };
  const rn = L.region(r);
  // 토글: 먹 테두리 단추, 켜지면 먹색 바탕 흰 글자 + ✓(aria-pressed 가 뜻을 맡는다)
  const toggle = (act: string, text: string) => `<button class="tg" type="button" data-xact="${act}" aria-pressed="false"><span class="tk" aria-hidden="true">✓</span>${esc(text)}</button>`;
  root.innerHTML = `<div class="play xpl">
    <header class="play-top"><div class="pt-in">
      <button class="pt-exit" type="button" data-act="back" aria-label="${esc(L.back)}"><span class="pt-x">${ICON.back}</span><span class="pt-xt" aria-hidden="true">← ${esc(L.back)}</span></button>
      <h1 class="pt-title">${esc(L.exploreTitle(rn))}</h1>
      <div class="x-tools">${toggle('hide', L.hideNames)}${toggle('fill', L.fillColor)}</div></div></header>
    <div class="x-body">
      <div class="x-side"><div class="x-band"><div class="x-card" aria-live="polite"></div><p class="x-src">${esc(L.source)}</p></div></div>
      <div class="x-right">
        <div class="pr-cap"><span class="pr-ct">${esc(`${L.regionFull(r)} · ${L.count(r)}`)}</span><span class="legend pr-key" role="group" aria-label="${esc(L.legendAria)}"></span></div>
        <div class="play-stage"><div class="play-map" data-map="x" role="img" aria-label="${esc(L.exploreAria(rn))}"></div>
          <button class="map-reset" type="button" data-xact="reset" hidden>${esc(L.resetView)}</button></div>
        <p class="pr-help"><span class="hm">${esc(L.mapHelp[0])}</span><span class="ht">${esc(L.mapHelp[1])}</span></p>
      </div>
    </div></div>`;
  const shell = root.querySelector<HTMLElement>('.xpl')!;
  const host = root.querySelector<HTMLElement>('[data-map="x"]')!;
  // 전체 보기 단추는 지도 밖(형제)에 둔다. 지도 안에 두면 지도가 누름을 가로채 단추가 눌리지 않는다
  const resetBtn = root.querySelector<HTMLButtonElement>('.play-stage .map-reset')!;
  const cardEl = root.querySelector<HTMLElement>('.x-card')!;
  const keyEl = root.querySelector<HTMLElement>('.pr-key')!;
  let map: SvgMap | null = null;
  let peekTimer = 0;
  let alive = true;
  const nm = (id: string) => placeName(reg, id);
  /** 지도 여백: 정보는 지도 밖에 있으니 네 변이 같다(문제 화면과 같은 값) */
  const pad = (): Pad => { const m = matchMedia(WIDE_MQ).matches ? 24 : 12; return { t: m, r: m, b: m, l: m }; };
  /**
   * 섬 상자(인천)를 비킨 여백: 지역 전체가 고를 칸이라 모든 칸이 상자 밑에 깔리지 않게(maps.ts insetPad — 문제 화면과 같은 규칙).
   * 처음에는 mountMap 이 정하고, 지도 칸의 폭이 바뀌면(창 크기·회전 — 넓은·좁은 화면 경계를 넘는 것도) 여기서 다시 정한다.
   * 높이만 바뀌는 것(좁은 화면에서 정보 띠가 늘 때)은 지도가 스스로 다시 맞추고 상자 자리는 그대로 둔다
   */
  let curPad = pad();
  let hostW = 0;
  const placeInset = async () => {
    const s = await shapesOf(ctx, r.key);
    if (!alive || !map) return;
    curPad = insetPad(host, s, boxOf(r.fit), r.items.map((it) => it.id), pad());
    map.setPad(curPad, false);
  };
  const hostRo = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    if (host.clientWidth === hostW) return;
    hostW = host.clientWidth;
    if (map) void placeInset();
  }) : null;
  hostRo?.observe(host);

  /** 고른 곳 정보: 과 · 이름 · 위치 한 줄 · 맞닿은 곳(밑줄 글자 단추) · 연습하기(주 단추) · 자세히 읽기 */
  function card() {
    if (!st.sel) { cardEl.innerHTML = `<p class="x-empty">${esc(L.exploreEmpty(rn))}</p>`; return; }
    const p = reg.place(st.sel)!;
    const nb = reg.neighborsOf(st.sel).filter((id) => reg.place(id)?.region.key === r.key);
    const line = L.line(reg, st.sel);
    cardEl.innerHTML = `<p class="x-eye">${esc(`${rn} ${L.lessonNo(p.lesson.no)} · ${L.lesson(p.lesson)}`)}</p>
      <h2 class="x-name">${esc(L.name(p.item))}</h2>${line ? `<p class="x-line">${esc(line)}</p>` : ''}
      ${nb.length ? `<p class="x-nb"><span class="x-nh">${esc(L.touching)}</span>${nb.map((id) => `<button class="btn-text" type="button" data-xact="sel" data-arg="${id}">${esc(nm(id))}</button>`).join('')}</p>` : ''}
      <div class="x-acts"><a class="btn" href="${toHash({ name: 'lesson', region: r.key, no: p.lesson.no })}">${esc(L.practice(L.lessonNo(p.lesson.no)))}</a>
        ${r.key === 'seoul' ? `<a class="x-more" href="${ctx.base}${L.path(`seoul/${p.item.slug}/`)}">${esc(L.readMore)} <span aria-hidden="true">→</span></a>` : ''}</div>`;
  }

  /** 범례: 채움 색을 켰을 때 아직 / 익히는 중 / 다 익힘, 지도에 강이 있으면 한강. 좁은 화면은 채움 색일 때만 그 줄을 보인다 */
  function paintKey() {
    const items: [string, string][] = st.fill ? [['none', L.legend[0]], ['learning', L.legend[1]], ['mastered', L.legend[3]]] : [];
    if (host.querySelector('.cm-water')) items.push(['water', L.legendRiver]);
    keyEl.innerHTML = items.map(([s, t]) => `<span><i class="sw s-${s}" aria-hidden="true"></i>${esc(t)}</span>`).join('');
  }

  function paint() {
    shell.classList.toggle('fill', st.fill);
    for (const b of root.querySelectorAll<HTMLElement>('[data-xact="hide"],[data-xact="fill"]')) {
      b.setAttribute('aria-pressed', String(b.dataset.xact === 'hide' ? st.hide : st.fill));
    }
    paintKey();
    if (!map) return;
    const names = r.items.map((it) => ({ id: it.id, text: L.name(it) }));
    // 이름 가리기 중 누른 칸 하나(peek)는 꼭 보이게(must: 칸에 안 들면 칸 밖·흰 판). 다 보일 때는 자리가 있는 이름만(fit)
    map.setLabels(st.hide ? (st.peek ? names.filter((n) => n.id === st.peek) : []) : names, st.hide ? { mode: 'must' } : { mode: 'fit', minWidth: 0 });
    map.setFills(st.fill ? fillsOf(ctx.mastery, r) : null);
    map.setQuestion(st.sel);
  }

  function select(id: string | null) {
    st.sel = id;
    const slugNow = id ? reg.place(id)?.item.slug ?? null : null;
    history.replaceState(history.state, '', location.pathname + location.search + toHash({ name: 'explore', region: r.key, slug: slugNow }));
    card();
    paint();
    // 좁은 화면은 정보 띠가 늘어 지도 칸이 줄어든다(지도는 스스로 다시 맞춘다) — 그 뒤에 고른 칸이 보이게
    if (id) requestAnimationFrame(() => requestAnimationFrame(() => { if (alive && st.sel === id) map?.reveal([id], curPad); }));
  }

  function onTap(t: Tap) {
    if (t.type !== 'cell') return;
    if (st.hide) {
      // 이름을 가린 채 누르면 그 이름만 1.5초 보여 준다
      st.peek = t.id;
      clearTimeout(peekTimer);
      peekTimer = window.setTimeout(() => { st.peek = null; paint(); }, 1500);
    }
    select(t.id);
  }

  // 공용 #app 에 붙는 수신기라 destroy 에서 뗀다(문제 화면 play.ts 와 같은 이유)
  const onClick = (e: MouseEvent) => {
    if (!alive) return;
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-xact]');
    if (!b) return;
    const a = b.dataset.xact;
    if (a === 'hide') { st.hide = !st.hide; paint(); }
    else if (a === 'fill') { st.fill = !st.fill; paint(); }
    else if (a === 'sel') select(b.dataset.arg!);
    else if (a === 'reset') map?.resetView();
  };
  root.addEventListener('click', onClick);

  card();
  paint();
  mountMap(ctx, host, { region: r.key, interaction: 'full', contextNames: true, scaleBar: true, scaleMinWidth: STAGE_SCALE_MIN, pad: pad(), onTap, onZoomed: (z) => { resetBtn.hidden = !z; } })
    .then(async (m) => {
      if (!alive) { m.destroy(); return; }
      map = m;
      // mountMap 이 고른 여백(섬 상자 비키기)을 지금 크기로 다시 정해 알아 둔다(불러오는 사이 칸 크기가 바뀌었을 수 있다) — 고른 칸 보이기(reveal)도 그 여백으로
      hostW = host.clientWidth;
      await placeInset();
      if (!alive) return;
      paint();
      if (st.sel) map.reveal([st.sel], curPad);
    })
    .catch(() => { host.textContent = L.mapFail; host.classList.add('map-fail'); });

  return { destroy() { alive = false; root.removeEventListener('click', onClick); clearTimeout(peekTimer); hostRo?.disconnect(); map?.destroy(); } };
}
