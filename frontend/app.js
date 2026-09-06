/* ================================================================
   app.js — map page. Sidebar (current city gauge + station list),
   colored AQI map badges, hover mini-chart, city trend chart,
   PM2.5 kriging movie. Jalali dates, fa/en.
   ================================================================ */
let map, markers = {}, cityChart = null, cityHourlyChart = null, cityMiniBars = null, hoverChart = null;
let stationsData = [];
const seriesCache = {};

document.addEventListener("DOMContentLoaded", () => {
  applyI18n();
  document.getElementById("langBtn").onclick = () => {
    setLang(lang === "fa" ? "en" : "fa");
    applyI18n(); headerRelocalize(); loadMeta(); loadStations(); loadCity(); loadCityHourly(); loadWeather(); animRelabel();
  };
  document.getElementById("stSearch").addEventListener("input", e => filterList(e.target.value));
  initHeader();
  initMap();
  loadMeta().then(loadStations);
  loadCity(); loadCityHourly(); loadWeather();
  initAnim();
  setInterval(() => { loadStations(); loadCity(); loadCityHourly(); loadWeather(); loadAnimFrames(); }, 5 * 60 * 1000);
});

function initMap(){
  map = L.map("map", { zoomControl: true }).setView([32.65, 51.68], 12);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
  map.attributionControl.setPosition("bottomleft");   // free the bottom-right corner for the legend
}

/* ---------- legend (clean swatches, no faces) ---------- */
async function loadMeta(){
  try{
    const m = await getJSON("/api/meta");
    window._cats = m.categories;
    window._catFa = Object.fromEntries(m.categories.map(c => [c.name_en, c.name_fa]));
    const rows = m.categories.map(c =>
        `<div class="row" style="background:${c.color}1c;border-color:${c.color}55">
           <span class="lg-face">${faceBadge(c.name_en, c.color, 18)}</span>
           <span class="lg-name">${lang === "fa" ? c.name_fa : c.name_en}</span>
           <span class="lg-range">${c.lo}–${c.hi}</span>
         </div>`).join("");
    const leg = document.getElementById("legend");
    leg.innerHTML = `<button class="lg-title" id="lgToggle" aria-expanded="true">${t("aqi")}<span class="lg-caret">▾</span></button>`
                  + `<div class="lg-body">${rows}</div>`;
    const tog = document.getElementById("lgToggle");
    tog.onclick = () => { const col = leg.classList.toggle("collapsed"); tog.setAttribute("aria-expanded", String(!col)); };
    if (window.matchMedia("(max-width: 680px)").matches){ leg.classList.add("collapsed"); tog.setAttribute("aria-expanded","false"); }
  }catch(e){ console.error(e); }
}

/* ---------- station map badges ---------- */
function badgeIcon(aqi, color){
  const size = 36, col = color || "#c3ccd4";
  return L.divIcon({ className: "", iconSize: [size, size], iconAnchor: [size/2, size/2],
    html: `<div class="aqi-badge" style="width:${size}px;height:${size}px;background:${col};color:${idealText(col)}">${aqi ?? "—"}</div>` });
}

async function loadStations(){
  try{
    const data = await getJSON("/api/stations");
    stationsData = data.stations;
    let newest = null;
    data.stations.forEach(s => {
      if (s.day && (!newest || s.day > newest)) newest = s.day;
      const icon = badgeIcon(s.aqi, s.color);
      if (!markers[s.station_id]) {
        const mk = L.marker([s.lat, s.lon], { icon }).addTo(map);
        mk.on("mouseover", ev => showHover(mk._st, ev));
        mk.on("mousemove", ev => positionHover(ev.originalEvent));
        mk.on("mouseout", () => hide("hovercard"));
        mk.on("click", () => location.href = `station.html?id=${s.station_id}`);
        markers[s.station_id] = mk;
      } else {
        markers[s.station_id].setIcon(icon);
      }
      markers[s.station_id]._st = s;
    });
    buildSidebar(data.stations);
    const u = document.getElementById("updated");
    if (u) u.textContent = newest ? `${t("updated")}: ${jDay(newest, true)}` : "";
  }catch(e){ console.error("stations", e); }
}

/* ---------- sidebar: station list (worst first) ---------- */
function buildSidebar(stations){
  const list = document.getElementById("stList");
  const sorted = [...stations].sort((a, b) => {
    if (a.aqi == null) return 1;
    if (b.aqi == null) return -1;
    return b.aqi - a.aqi;
  });
  list.innerHTML = sorted.map(s => {
    const col = s.color || "#c3ccd4";
    return `<li class="st-row" tabindex="0" role="button"
              data-id="${s.station_id}" data-name="${(stName(s)||"").toLowerCase()}"
              data-en="${(s.name_en||"").toLowerCase()}">
      <span class="st-pill" style="background:${col};color:${idealText(col)}">${s.aqi ?? "—"}</span>
      <span class="st-body">
        <span class="st-name">${stName(s) || ("#" + s.station_id)}</span>
        <span class="st-cat">${catLabel(s) || t("noData")}</span>
      </span>
    </li>`;
  }).join("");

  list.querySelectorAll(".st-row").forEach(row => {
    const id = row.dataset.id;
    const go = () => location.href = `station.html?id=${id}`;
    row.addEventListener("click", go);
    row.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    row.addEventListener("mouseenter", () => highlightMarker(id, true));
    row.addEventListener("mouseleave", () => highlightMarker(id, false));
  });
  filterList(document.getElementById("stSearch").value);
}

function highlightMarker(id, on){
  const mk = markers[id];
  if (!mk || !mk._icon) return;
  const b = mk._icon.querySelector(".aqi-badge");
  if (b) b.classList.toggle("mk-hi", on);
}

function filterList(q){
  q = (q || "").trim().toLowerCase();
  const rows = document.querySelectorAll("#stList .st-row");
  let visible = 0;
  rows.forEach(r => {
    const hit = !q || r.dataset.name.includes(q) || r.dataset.en.includes(q);
    r.style.display = hit ? "" : "none";
    if (hit) visible++;
  });
  const list = document.getElementById("stList");
  let empty = list.querySelector(".st-empty");
  if (!visible) {
    if (!empty) { empty = document.createElement("li"); empty.className = "st-empty"; list.appendChild(empty); }
    empty.textContent = t("noStations");
  } else if (empty) empty.remove();
}

/* ---------- hover mini chart ---------- */
async function showHover(s, ev){
  if (window.matchMedia("(max-width: 680px)").matches) return;
  const card = document.getElementById("hovercard");
  card.querySelector(".hc-title").textContent = `${stName(s)} — ${t("dailyTitle")}`;
  positionHover(ev.originalEvent);
  show("hovercard");
  try{
    if (!seriesCache[s.station_id])
      seriesCache[s.station_id] = await getJSON(`/api/station/${s.station_id}/daily_aqi`);
    const d = seriesCache[s.station_id];
    const rows = [...d.past, ...futureDaily(d.past, d.forecast)];
    drawHoverChart(rows.map(r => jDay(r.date)), rows.map(r => r.aqi),
                   rows.map((r, i) => i < d.past.length ? r.color : r.color + "99"));
  }catch(e){ console.error(e); }
}
function positionHover(e){
  const card = document.getElementById("hovercard");
  let x = e.clientX + 18, y = e.clientY + 18;
  if (x + 320 > innerWidth)  x = e.clientX - 320;
  if (y + 190 > innerHeight) y = e.clientY - 190;
  card.style.left = x + "px"; card.style.top = y + "px";
}
function drawHoverChart(labels, vals, colors){
  const ctx = document.querySelector(".hc-canvas");
  if (hoverChart) hoverChart.destroy();
  hoverChart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ data: vals, backgroundColor: colors, borderRadius: 5 }] },
    options: { plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { maxTicksLimit: 4 } },
                x: { grid: { display: false }, ticks: { font: { size: 9 } } } },
      animation: false, responsive: true, maintainAspectRatio: false }
  });
}

/* ---------- current city gauge (sidebar) + city trend chart ---------- */
function renderCityNow(d){
  const g = document.getElementById("cityGauge");
  const catEl = document.getElementById("cityCat");
  const domEl = document.getElementById("cityDom");
  const dateEl = document.getElementById("cityDate");

  function paint(aqi, color, catEn, catFa, dominant, when){
    g.innerHTML = cityGaugeSVG(aqi);
    catEl.textContent = (lang === "fa" ? (catFa || catEn || "") : (catEn || "")) || t("noData");
    catEl.style.color = color || "var(--ink)";
    domEl.textContent = dominant || "—";
    dateEl.textContent = when || "";
    renderAdvice(catEn, color);
  }

  const now = d.now;                                   // official 'now' city index
  if (now && now.aqi != null){
    paint(now.aqi, now.color, now.category, now.category_fa, now.dominant, now.time ? jHour(now.time) : "");
    return;
  }
  const past = d.past || [];
  const fc = futureDaily(past, d.forecast);
  const cur = past.length ? past[past.length - 1] : (fc.length ? fc[0] : null);
  if (!cur){ paint(null, null, null, null, null, ""); return; }
  const catFa = window._catFa ? window._catFa[cur.category] : null;
  const isFc = !(past.length);
  paint(cur.aqi, cur.color, cur.category, catFa, cur.dominant,
        `${jDay(cur.date, true)}${isFc ? " · " + t("forecast") : ""}`);
}

/* ---------- health advice banner ---------- */
function renderAdvice(category, color){
  const box = document.getElementById("advice");
  const ico = document.getElementById("adviceIco");
  const txt = document.getElementById("adviceText");
  if (!box) return;
  if (!category){ txt.textContent = t("noData"); ico.innerHTML = ""; box.style.borderInlineStartColor = "var(--muted)"; box.style.background = "#fff"; return; }
  txt.textContent = healthAdvice(category);
  ico.innerHTML = faceBadge(category, color, 40);
  box.style.borderInlineStartColor = color || "var(--muted)";
  box.style.background = (color || "#8894a3") + "14";
}

/* ---------- weather tiles (airport) ---------- */
function loadWeather(){
  getJSON("/api/weather").then(d => {
    const w = d.weather, row = document.getElementById("wxRow");
    if (!row) return;
    if (!w){ row.innerHTML = `<div class="card-sub">${t("noData")}</div>`;
             document.getElementById("wxTime").textContent = ""; return; }
    document.getElementById("wxTime").textContent = w.time ? jHour(w.time) : "";
    const fmt = (v, u) => v == null ? "—" : `${v}${u ? " " + u : ""}`;
    const wind = (w.wind_speed == null && !w.wind_dir) ? "—"
               : `${w.wind_speed == null ? "" : w.wind_speed}${w.wind_dir ? " " + w.wind_dir : ""}`.trim();
    const tiles = [
      [WXICON.temp,  fmt(w.temperature, "°C"), t("wxTemp")],
      [WXICON.hum,   fmt(w.humidity, "%"),     t("wxHum")],
      [WXICON.wind,  wind,                     t("wxWind")],
      [WXICON.press, fmt(w.pressure, "hPa"),   t("wxPress")],
      [WXICON.vis,   fmt(w.visibility, "km"),  t("wxVis")]
    ];
    row.innerHTML = tiles.map(([ic, val, lbl]) =>
      `<div class="wx-tile"><span class="wx-ico">${ic}</span><span class="wx-val">${val}</span><span class="wx-lbl">${lbl}</span></div>`
    ).join("");
  }).catch(e => console.error("weather", e));
}

/* ---------- city hourly AQI (rolling now index) ---------- */
function loadCityHourly(){
  getJSON("/api/city/hourly_aqi").then(d => {
    const series = d.series || [];
    const c = document.getElementById("cityHourlyChart");
    if (c){ if (cityHourlyChart) cityHourlyChart.destroy(); cityHourlyChart = drawHourlyAqi(c, series); }
    const mb = document.getElementById("cityMiniBars");
    if (mb){ if (cityMiniBars) cityMiniBars.destroy(); cityMiniBars = drawMiniBars(mb, series); }
  }).catch(e => console.error("city hourly", e));
}

async function loadCity(){
  try{
    const d = await getJSON("/api/city/aqi");
    renderCityNow(d);
    const rows = [...d.past, ...futureDaily(d.past, d.forecast)];
    if (!rows.length) return;
    const cut = d.past.length;
    const ctx = document.getElementById("cityChart");
    if (cityChart) cityChart.destroy();
    cityChart = new Chart(ctx, {
      type: "bar",
      data: { labels: rows.map(r => jDay(r.date, true)),
        datasets: [{ data: rows.map(r => r.aqi),
          backgroundColor: rows.map((r, i) => i < cut ? r.color : r.color + "80"),
          borderColor: rows.map(r => r.color),
          borderWidth: rows.map((r, i) => i < cut ? 0 : 2),
          borderDash: [4, 3], borderRadius: 8, maxBarThickness: 46 }] },
      options: {
        plugins: { legend: { display: false },
          tooltip: { callbacks: {
            label: c => {
              const r = rows[c.dataIndex];
              const tag = c.dataIndex >= cut ? ` (${t("forecast")})` : "";
              return ` ${t("aqi")}: ${c.raw}${tag}` + (r.dominant ? ` · ${t("dominant")}: ${r.dominant}` : "");
            } } } },
        scales: { y: { beginAtZero: true, title: { display: true, text: t("aqi") } },
                  x: { grid: { display: false } } },
        animation: false, responsive: true, maintainAspectRatio: false }
    });
  }catch(e){ console.error("city", e); }
}

/* ================================================================
   PM2.5 kriging MOVIE
   ================================================================ */
let animMap = null, animOverlay = null, animFrames = [], animImgs = [];
let animIdx = 0, animTimer = null;
const FRAME_MS = 100;

function initAnim(){
  const el = document.getElementById("animMap");
  if (!el) return;
  animMap = L.map("animMap", { zoomControl: false, attributionControl: false })
             .setView([32.665, 51.68], 12);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    { maxZoom: 18 }).addTo(animMap);
  document.getElementById("animPlay").onclick = animToggle;
  document.getElementById("animSlider").oninput = e => { animPause(); animShow(parseInt(e.target.value, 10)); };
  loadAnimFrames();
}

async function loadAnimFrames(){
  try{
    const d = await getJSON("/api/pm25_frames");
    if (!d.frames || !d.frames.length) return;
    const keep = animIdx;
    animFrames = d.frames;
    animImgs = await Promise.all(d.frames.map(async f => {
      const r = await fetch(API + f.url);
      return URL.createObjectURL(await r.blob());
    }));
    const b = d.bounds;
    if (animOverlay) animMap.removeLayer(animOverlay);
    animOverlay = L.imageOverlay(animImgs[0], b, { opacity: 0.72 }).addTo(animMap);
    animMap.fitBounds(b);
    document.getElementById("animSlider").max = animFrames.length - 1;
    animShow(Math.min(keep, animFrames.length - 1));
  }catch(e){ console.error("anim", e); }
}
function animShow(i){
  if (!animFrames.length || !animOverlay) return;
  animIdx = ((i % animFrames.length) + animFrames.length) % animFrames.length;
  animOverlay.setUrl(animImgs[animIdx]);
  document.getElementById("animSlider").value = animIdx;
  animRelabel();
}
function animRelabel(){
  if (!animFrames.length) return;
  const f = animFrames[animIdx];
  const tag = f.kind === "forecast" ? ` <span class="fc-tag">${t("forecast")}</span>` : ` ${t("observed")}`;
  document.getElementById("animLabel").innerHTML = `${jHour(f.time)}${tag}`;
}
function animToggle(){ if (animTimer) animPause(); else animPlayStart(); }
function animPlayStart(){
  if (!animFrames.length) return;
  document.getElementById("animPlay").textContent = "⏸";
  animTimer = setInterval(() => animShow(animIdx + 1), FRAME_MS);
}
function animPause(){
  clearInterval(animTimer); animTimer = null;
  const b = document.getElementById("animPlay");
  if (b) b.textContent = "▶";
}
