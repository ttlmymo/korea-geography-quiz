import { readFile, writeFile } from "node:fs/promises";
import { SEOUL_SLUGS } from "./seoul-slugs.mjs";

const ROOT = "index.html";
const START = "<!-- GEN:SEOULMAP:START -->";
const END = "<!-- GEN:SEOULMAP:END -->";
const BASE_PATH = "/korea-geography-quiz";
const NAVER_KEY = "kizfnbhv3q";

const root = await readFile(ROOT, "utf8");
const guGeo = JSON.parse(await readFile("gu/gu_11_seoul.geojson", "utf8"));
const byName = new Map(
  guGeo.features
    .filter((f) => f?.properties?.sgg_nm && f?.geometry)
    .map((f) => [f.properties.sgg_nm, f])
);

const missing = Object.keys(SEOUL_SLUGS).filter((name) => !byName.has(name));
if (missing.length) throw new Error(`서울 GeoJSON 누락: ${missing.join(", ")}`);

const items = Object.entries(SEOUL_SLUGS)
  .map(([name, meta]) => ({
    name,
    href: `${BASE_PATH}/seoul/${meta.slug}/`,
    feature: byName.get(name)
  }))
  .sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true }));

if (items.length !== 25) throw new Error(`서울 Dynamic Map 항목 수 오류: ${items.length}`);

function eachCoord(geometry, cb) {
  const walk = (arr, depth) => {
    if (depth === 0) { cb(arr[0], arr[1]); return; }
    arr.forEach((a) => walk(a, depth - 1));
  };
  if (geometry.type === "Polygon") walk(geometry.coordinates, 2);
  else if (geometry.type === "MultiPolygon") walk(geometry.coordinates, 3);
}

function featuresBBox(features) {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  features.forEach((feature) => eachCoord(feature.geometry, (lon, lat) => {
    minLon = Math.min(minLon, lon); minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon); maxLat = Math.max(maxLat, lat);
  }));
  return [minLon, minLat, maxLon, maxLat];
}

const bbox = featuresBBox(items.map((item) => item.feature));
const hrefByName = Object.fromEntries(items.map((item) => [item.name, item.href]));

const ROOT_DYNAMIC_MAP_CSS = `
#rootSeoulDistrictMap{position:relative;width:100%;height:420px;border-radius:16px;overflow:hidden;background:#e8e2d5;box-shadow:0 6px 14px rgba(150,135,108,.16);margin-top:18px}
.root-seoul-map-wait{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--muted)}
.root-seoul-map-cap{font-size:12px;color:var(--muted);margin:6px 0 0;text-align:center}
.root-seoul-map-actions{display:flex;justify-content:flex-end;margin-top:10px}
.root-seoul-map-btn{font-family:inherit;font-size:13.5px;color:var(--text);background:var(--bg);border:1px solid #d8cfbd;border-radius:12px;padding:8px 16px;cursor:pointer;line-height:1.4}
.root-seoul-map-btn:hover{background:#ded7c8}
.root-seoul-map-btn:focus-visible{outline:3px solid var(--sage-d);outline-offset:2px}
@media(max-width:600px){#rootSeoulDistrictMap{height:300px}}
`;

const mapHtml = `
<div class="root-seoul-map" aria-label="서울특별시 25개 자치구 위치 지도">
  <div id="rootSeoulDistrictMap"><span class="root-seoul-map-wait">서울 지도를 불러오는 중…</span></div>
  <p class="root-seoul-map-cap">서울특별시 25개 자치구 위치 지도</p>
  <div class="root-seoul-map-actions"><button type="button" class="root-seoul-map-btn" id="rootSeoulMapReset">↺ 서울 전체 보기</button></div>
  <noscript><p class="root-seoul-map-cap">지도를 보려면 자바스크립트를 켜 주세요. 아래 버튼에서 자치구를 선택할 수 있습니다.</p></noscript>
</div>
<script>
(function(){
  var D = ${JSON.stringify({ bb: bbox, href: hrefByName }).replace(/</g, "\\u003c")};
  var el = document.getElementById("rootSeoulDistrictMap");
  var resetBtn = document.getElementById("rootSeoulMapReset");
  var map = null, bounds = null, started = false, drawn = false;

  function fitSeoulBounds(){
    if (!map || !bounds) return;
    map.fitBounds(bounds, { top:28, right:28, bottom:28, left:28 });
    map.setZoom(10);
  }

  function draw(geo){
    if (drawn) return; drawn = true;
    try {
      var features = (geo.features || []).filter(function(f){
        return f && f.geometry && D.href[f.properties && f.properties.sgg_nm];
      });
      map.data.addGeoJson({ type:"FeatureCollection", features:features });
      map.data.setStyle({ fillColor:"#1a73e8", fillOpacity:0.12,
        strokeColor:"#1a73e8", strokeOpacity:0.95, strokeWeight:2.5 });
      bounds = new naver.maps.LatLngBounds(
        new naver.maps.LatLng(D.bb[1], D.bb[0]),
        new naver.maps.LatLng(D.bb[3], D.bb[2]));
      fitSeoulBounds();
      naver.maps.Event.addListener(map.data, "mouseover", function(e){
        map.data.revertStyle();
        map.data.overrideStyle(e.feature, { fillColor:"#1a73e8", fillOpacity:0.28,
          strokeColor:"#0b57d0", strokeOpacity:1, strokeWeight:3 });
      });
      naver.maps.Event.addListener(map.data, "mouseout", function(){ map.data.revertStyle(); });
      naver.maps.Event.addListener(map.data, "click", function(e){
        var name = e.feature && e.feature.getProperty("sgg_nm");
        if (name && D.href[name]) window.location.href = D.href[name];
      });
    } catch(e) {}
  }

  function init(){
    var wait = el.querySelector(".root-seoul-map-wait"); if (wait) wait.remove();
    map = new naver.maps.Map(el, {
      center:new naver.maps.LatLng(37.5665,126.9780), zoom:10,
      scrollWheel:false, pinchZoom:true, mapDataControl:false,
      logoControlOptions:{position:naver.maps.Position.BOTTOM_LEFT},
      scaleControlOptions:{position:naver.maps.Position.BOTTOM_RIGHT},
      zoomControl:true,
      zoomControlOptions:{style:naver.maps.ZoomControlStyle.SMALL,position:naver.maps.Position.TOP_RIGHT}
    });
    fetch("${BASE_PATH}/gu/gu_11_seoul.geojson")
      .then(function(r){ if(!r.ok) throw new Error("GeoJSON load failed"); return r.json(); })
      .then(function(geo){ naver.maps.Event.once(map,"init",function(){draw(geo);}); setTimeout(function(){draw(geo);},300); })
      .catch(function(){ el.innerHTML = ""; });
  }

  if (resetBtn) resetBtn.addEventListener("click", fitSeoulBounds);
  function start(){
    if (started) return; started = true;
    if (window.naver && naver.maps) init();
  }
  function observe(){
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function(entries){
        if (entries.some(function(entry){return entry.isIntersecting;})) { io.disconnect(); start(); }
      },{rootMargin:"200px"});
      io.observe(el);
    } else { start(); }
  }
  if (document.readyState === "complete") observe();
  else window.addEventListener("load", observe, {once:true});
})();
</script>`;

let out = root;
const markerRe = /(<!-- GEN:SEOULMAP:START -->)([\s\S]*?)(<!-- GEN:SEOULMAP:END -->)/;
if (markerRe.test(out)) {
  out = out.replace(markerRe, (_m, a, _b, c) => `${a}\n${mapHtml}\n${c}`);
} else {
  const section = `
   <section id="seoul-district-map" style="max-width:820px; margin:24px auto 0; padding:24px 18px 0; line-height:1.9; color:var(--text); font-size:15px;">
     <h2 style="font-size:22px; margin-bottom:8px;">서울 자치구별 소개</h2>
     <p>서울특별시 25개 자치구의 위치를 지도에서 선택해 각 구의 법정동 목록, 역사와 유래를 확인할 수 있습니다.</p>
     ${START}
${mapHtml}
     ${END}
   </section>`;
  const anchor = "<!-- GEN:GUIDE:END -->";
  if (!out.includes(anchor)) throw new Error("루트 GEN:GUIDE:END 마커를 찾지 못했습니다.");
  out = out.replace(anchor, `${anchor}\n${section}`);
}

if (!out.includes("#rootSeoulDistrictMap{")) {
  const styleAt = out.lastIndexOf("</style>");
  if (styleAt < 0) throw new Error("루트 style 닫는 태그를 찾지 못했습니다.");
  out = out.slice(0, styleAt) + "\n" + ROOT_DYNAMIC_MAP_CSS + "\n" + out.slice(styleAt);
}

if ((out.match(/GEN:SEOULMAP:START/g) || []).length !== 1 ||
    (out.match(/GEN:SEOULMAP:END/g) || []).length !== 1) {
  throw new Error("GEN:SEOULMAP 마커 쌍 오류");
}
if (!out.includes('id="rootSeoulDistrictMap"')) throw new Error("루트 Dynamic Map 마크업 누락");
if (!out.includes("<!-- GEN:HEAD:START -->") || !out.includes("<!-- GEN:HEAD:END -->")) {
  throw new Error("GEN:HEAD 마커 보존 실패");
}

await writeFile(ROOT, out, "utf8");
console.log(`✓ 루트 서울 Dynamic Map 생성: ${items.length}개 구 · ${ROOT}`);
console.log(`✓ 마커: ${START} / ${END}`);
console.log("✓ CSS: 기존 style 블록 끝에 ROOT_DYNAMIC_MAP_CSS 삽입");
