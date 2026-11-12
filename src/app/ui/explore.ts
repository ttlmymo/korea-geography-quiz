// 둘러보기(설계서 4.1 S11): 이름 붙은 지도, 이름 가리기, 채움 색, 칸을 누르면 그곳 카드(위치 한 줄·이웃·과 연습).
// 지도는 그대로 두고(확대 유지) 카드와 칸 상태만 바꾼다. 고른 곳은 주소(#/kr/{지역}/explore/{slug})에도 남긴다
import type { Tap } from '../core/judge.ts';
import { toHash } from '../router.ts';
import type { SvgMap } from '../map/svgmap.ts';
import { fillsOf, type Ctx } from './ctx.ts';
import { esc, topbar } from './dom.ts';
import { L, placeName } from '../text/ui.ts';
import { mountMap } from './maps.ts';

export function mountExplore(root: HTMLElement, ctx: Ctx, regionKey: string, slug: string | null) {
  const { reg } = ctx;
  const r = reg.region(regionKey)!;
  const st = { hide: false, fill: false, sel: slug ? reg.bySlug(regionKey, slug)?.item.id ?? null : null, peek: null as string | null };
  const rn = L.region(r);
  root.innerHTML = `<div class="page">${topbar(L.exploreTitle(rn))}
    <div class="row"><button class="chip" type="button" data-xact="hide" aria-pressed="false">${esc(L.hideNames)}</button><button class="chip" type="button" data-xact="fill" aria-pressed="false">${esc(L.fillColor)}</button></div>
    <div class="map-wrap"><div class="map-box explore" data-map="x" role="img" aria-label="${esc(L.exploreAria(rn))}"></div><button class="map-reset" type="button" data-xact="reset" hidden>${esc(L.resetView)}</button></div>
    <div class="x-card"></div>
    <p class="t13">${esc(L.source)}</p></div>`;
  const host = root.querySelector<HTMLElement>('[data-map="x"]')!;
  // 전체 보기 단추는 지도 밖(형제)에 둔다. 지도 안에 두면 지도가 누름을 가로채 단추가 눌리지 않는다
  const resetBtn = root.querySelector<HTMLButtonElement>('.map-wrap .map-reset')!;
  const cardEl = root.querySelector<HTMLElement>('.x-card')!;
  let map: SvgMap | null = null;
  let peekTimer = 0;
  const nm = (id: string) => placeName(reg, id);

  function card() {
    if (!st.sel) { cardEl.innerHTML = `<p class="t15">${esc(L.exploreEmpty(rn))}</p>`; return; }
    const p = reg.place(st.sel)!;
    const nb = reg.neighborsOf(st.sel).filter((id) => reg.place(id)?.region.key === r.key);
    const line = L.line(reg, st.sel);
    cardEl.innerHTML = `<section class="card"><h2 class="title-22">${esc(L.name(p.item))}</h2>${line ? `<p class="fb-line">${esc(line)}</p>` : ''}
      ${nb.length ? `<div class="stack" style="gap:6px"><p class="t14">${esc(L.touching)}</p><div class="row wrap">${nb.map((id) => `<button class="chip" type="button" data-xact="sel" data-arg="${id}">${esc(nm(id))}</button>`).join('')}</div></div>` : ''}
      <a class="btn" href="${toHash({ name: 'lesson', region: r.key, no: p.lesson.no })}">${esc(L.practice(L.lessonNo(p.lesson.no)))}</a>
      ${r.key === 'seoul' ? `<a class="linkrow" href="${ctx.base}${L.path(`seoul/${p.item.slug}/`)}">${esc(L.readMore)} <span aria-hidden="true">→</span></a>` : ''}</section>`;
  }

  function paint() {
    if (!map) return;
    const names = r.items.map((it) => ({ id: it.id, text: L.name(it) }));
    map.setLabels(st.hide ? (st.peek ? names.filter((n) => n.id === st.peek) : []) : names, { inside: true });
    map.setFills(st.fill ? fillsOf(ctx.mastery, r) : null);
    map.setQuestion(st.sel);
    for (const b of root.querySelectorAll<HTMLElement>('[data-xact="hide"],[data-xact="fill"]')) {
      const on = b.dataset.xact === 'hide' ? st.hide : st.fill;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }

  function select(id: string | null) {
    st.sel = id;
    const slugNow = id ? reg.place(id)?.item.slug ?? null : null;
    history.replaceState(history.state, '', location.pathname + location.search + toHash({ name: 'explore', region: r.key, slug: slugNow }));
    card();
    paint();
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

  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-xact]');
    if (!b) return;
    const a = b.dataset.xact;
    if (a === 'hide') { st.hide = !st.hide; paint(); }
    else if (a === 'fill') { st.fill = !st.fill; paint(); }
    else if (a === 'sel') select(b.dataset.arg!);
    else if (a === 'reset') map?.resetView();
  });

  card();
  mountMap(ctx, host, { region: r.key, interaction: 'full', contextNames: true, onTap, onZoomed: (z) => { resetBtn.hidden = !z; } })
    .then((m) => { map = m; paint(); })
    .catch(() => { host.textContent = L.mapFail; });

  return { destroy() { clearTimeout(peekTimer); map?.destroy(); } };
}
