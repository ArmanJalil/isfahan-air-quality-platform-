/* ================================================================
   station.js — station page (station.html?id=NN)
   Gauge hero + daily AQI chart + pollutant charts for EVERY
   measured variable. Observed = solid line; where a prediction
   exists, a forecast line + shaded forecast band + "now" divider.
   ================================================================ */
const SID = new URLSearchParams(location.search).get("id");
/* display order; a card appears only if the station actually measures it */
const POLL_ORDER = ["PM2_5", "PM10", "CO", "O3", "NO2", "SO2"];
let charts = [];

document.addEventListener("DOMContentLoaded", () => {
  applyI18n();
  document.getElementById("langBtn").onclick = () => {
    setLang(lang === "fa" ? "en" : "fa");
    applyI18n(); headerRelocalize(); render();
  };
  initHeader();
  if (!SID) { location.href = "index.html"; return; }
  render();
});

async function render(){
  charts.forEach(c => c.destroy()); charts = [];
  try{
    const [stns, daily, hourly, haqi, wx] = await Promise.all([
      getJSON("/api/stations"),
      getJSON(`/api/station/${SID}/daily_aqi`),
      getJSON(`/api/station/${SID}/hourly`),
      getJSON(`/api/station/${SID}/hourly_aqi`).catch(() => ({ series: [] })),
      getJSON(`/api/station/${SID}/weather`).catch(() => ({ weather: null }))
    ]);
    const s = stns.stations.find(x => x.station_id == SID) || {};
    hero(s);
    stationWeather(wx.weather);
    hourlyAqiChart(haqi.series || []);
    dailyChart(daily);
    pollutantGrid(hourly);
  }catch(e){
    console.error(e);
    document.getElementById("heroName").textContent = t("noData");
  }
}

/* ---------- hero (gauge, no emoji) ---------- */
function hero(s){
  document.title = `${stName(s) || "Station"} — AQI`;
  document.getElementById("heroGauge").innerHTML =
    aqiGauge(s.aqi, s.color, s.category, { size: 108, stroke: 12 });
  document.getElementById("heroName").textContent = stName(s) || `#${SID}`;
  const catEl = document.getElementById("heroCat");
  catEl.textContent = catLabel(s) || t("noData");
  catEl.style.color = s.color || "var(--ink)";
  document.getElementById("heroDom").textContent =
    s.dominant ? `${t("dominant")}: ${s.dominant.replace("_", ".")}` : "";
  renderStationAdvice(s.category, s.color);
}

/* ---------- health advice for this station (mirrors the city banner) ---------- */
function renderStationAdvice(category, color){
  const box = document.getElementById("advice");
  const ico = document.getElementById("adviceIco");
  const txt = document.getElementById("adviceText");
  if (!box) return;
  if (!category){
    txt.textContent = t("noData"); ico.innerHTML = "";
    box.style.borderInlineStartColor = "var(--muted)"; box.style.background = "#fff"; return;
  }
  txt.textContent = healthAdvice(category);
  ico.innerHTML = faceBadge(category, color, 40);
  box.style.borderInlineStartColor = color || "var(--muted)";
  box.style.background = (color || "#8894a3") + "14";
}

/* ---------- hourly AQI (rolling now index) ---------- */
function hourlyAqiChart(series){
  const c = document.getElementById("hourlyAqiChart");
  if (!series.length){ c.style.display = "none"; return; }
  c.style.display = "";
  const ch = drawHourlyAqi(c, series);
  if (ch) charts.push(ch);
}

/* ---------- station weather strip ---------- */
function stationWeather(w){
  const host = document.getElementById("stwx");
  if (!host) return;
  if (!w){ host.innerHTML = ""; return; }
  const fmt = (v, u) => v == null ? "—" : `${v}${u ? " " + u : ""}`;
  const wind = (w.wind_speed == null && !w.wind_dir) ? "—"
             : `${w.wind_speed == null ? "" : w.wind_speed}${w.wind_dir ? " " + w.wind_dir : ""}`.trim();
  const items = [
    [WXICON.temp,  fmt(w.temperature, "°C"), t("wxTemp")],
    [WXICON.hum,   fmt(w.humidity, "%"),     t("wxHum")],
    [WXICON.wind,  wind,                     t("wxWind")],
    [WXICON.press, fmt(w.pressure, "hPa"),   t("wxPress")],
    [WXICON.vis,   fmt(w.visibility, "km"),  t("wxVis")]
  ];
  host.innerHTML = items.map(([ic, val, lbl]) =>
    `<span class="item"><span class="wx-ico">${ic}</span>${lbl}: <b>${val}</b></span>`).join("");
}

/* ---------- daily AQI: 5 past + 3 forecast ---------- */
function dailyChart(d){
  const past = d.past || [];
  const fc = futureDaily(past, d.forecast);       // drop stale/past-dated daily forecast
  const rows = [...past, ...fc];
  const cut = past.length;
  const ctx = document.getElementById("dailyChart");
  let note = document.getElementById("dailyNote");
  if (!rows.length){                               // nothing valid -> clear note, hide canvas
    ctx.style.display = "none";
    if (!note){ note = document.createElement("div"); note.id = "dailyNote";
                note.className = "chart-empty"; ctx.parentElement.appendChild(note); }
    note.textContent = t("noDailyData");
    return;
  }
  ctx.style.display = "";
  if (note) note.remove();
  charts.push(new Chart(ctx, {
    type: "bar",
    data: { labels: rows.map(r => jDay(r.date, true)),
      datasets: [{ data: rows.map(r => r.aqi),
        backgroundColor: rows.map((r, i) =>
          i >= cut ? r.color + "80"                 // forecast: lighter
                   : (r.partial ? r.color + "59" : r.color)),  // partial past: faded
        borderColor: rows.map((r, i) =>
          (i < cut && r.partial) ? "#8a95a3" : r.color),
        borderWidth: rows.map((r, i) =>
          (i < cut && r.partial) ? 2 : (i < cut ? 0 : 2)),
        borderDash: [4, 3], borderRadius: 10, maxBarThickness: 56 }] },
    options: {
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: c => {
          const r = rows[c.dataIndex];
          const tag = c.dataIndex >= cut ? ` (${t("forecast")})`
                     : (r.partial ? ` (${t("partial")})` : "");
          return ` ${t("aqi")}: ${c.raw}${tag}` + (r.dominant ? ` · ${r.dominant}` : "");
        } } } },
      scales: { y: { beginAtZero: true, title: { display: true, text: t("aqi") } },
                x: { grid: { display: false } } },
      animation: false, responsive: true, maintainAspectRatio: false }
  }));
}

/* ---------- pollutant charts: every measured variable ---------- */
function pollutantGrid(d){
  const host = document.getElementById("pollGrid");
  host.innerHTML = "";
  const dd = withFutureForecast(d);              // drop stale (past-dated) forecast points
  POLL_ORDER.forEach(p => {
    const hasObs = (dd.observed[p] || []).some(v => v != null);
    const hasFc  = (dd.forecast[p] || []).some(v => v != null);
    if (!hasObs && !hasFc) return;                 // station does not measure this
    const card = document.createElement("div");
    card.className = "poll-card";
    const tag = hasFc
      ? `<span class="poll-tag fc">${t("hasFc")}</span>`
      : `<span class="poll-tag obs">${t("measuredOnly")}</span>`;
    card.innerHTML =
      `<div class="ph-t">
         <span class="ph-name">${p.replace("_", ".")} <span class="ph-u">${T[lang].units[p] || ""}</span></span>
         ${tag}
       </div>
       <div class="poll-canvas-wrap"><canvas></canvas></div>`;
    host.appendChild(card);
    drawPollChart(card.querySelector("canvas"), p, dd, hasFc);
  });
  if (!host.children.length)
    host.innerHTML = `<div class="card-sub">${t("noData")}</div>`;
}

/* keep only hourly forecast points whose time is AFTER the last observed hour */
function withFutureForecast(d){
  const obsT = d.observed.time || [];
  const lastObs = obsT.length ? obsT[obsT.length - 1] : "";
  const rawT = d.forecast.time || [];
  const keep = [];
  rawT.forEach((tt, i) => { if (tt > lastObs) keep.push(i); });
  const fc = { time: keep.map(i => rawT[i]) };
  POLL_ORDER.forEach(p => { const a = d.forecast[p] || []; fc[p] = keep.map(i => a[i]); });
  return { observed: d.observed, forecast: fc };
}

/* forecast band + "now" divider, drawn behind the lines.
   Orientation-proof: shade between the "now" point and the last point,
   whichever side the time axis runs (works in both RTL and LTR). */
function fcZonePlugin(nowIdx, lastIdx){
  return {
    id: "fcZone",
    beforeDatasetsDraw(chart){
      const { ctx, chartArea, scales } = chart;
      if (nowIdx == null || !scales.x) return;
      const xNow = scales.x.getPixelForValue(nowIdx);
      const xEnd = scales.x.getPixelForValue(lastIdx);
      const x1 = Math.min(xNow, xEnd), x2 = Math.max(xNow, xEnd);
      ctx.save();
      ctx.fillStyle = "rgba(232,131,58,.07)";
      ctx.fillRect(x1, chartArea.top, x2 - x1, chartArea.bottom - chartArea.top);
      ctx.strokeStyle = "rgba(232,131,58,.55)";
      ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xNow, chartArea.top); ctx.lineTo(xNow, chartArea.bottom); ctx.stroke();
      ctx.restore();
    }
  };
}

function drawPollChart(ctx, p, d, hasFc){
  const obsT = d.observed.time || [], fcT = d.forecast.time || [];
  const labels = [...obsT, ...fcT].map(jHour);
  const obs = d.observed[p] || [], fc = d.forecast[p] || [];
  const obsData = [...obs, ...fcT.map(() => null)];
  const datasets = [{
    label: t("observed"), data: obsData, borderColor: "#0f6ea3",
    backgroundColor: "rgba(15,110,163,.10)", fill: true,
    borderWidth: 2, pointRadius: 0, tension: .3, spanGaps: false
  }];
  const plugins = [];
  if (hasFc){
    const fcData = obs.map(() => null);
    if (obs.length) fcData[obs.length - 1] = obs[obs.length - 1];   // join lines
    fc.forEach(v => fcData.push(v));
    datasets.push({
      label: t("forecast"), data: fcData, borderColor: "#e8833a",
      backgroundColor: "rgba(232,131,58,.10)", borderWidth: 2.6,
      pointRadius: 0, pointHoverRadius: 3, tension: .3, spanGaps: true
    });
    plugins.push(fcZonePlugin(obs.length - 1, labels.length - 1));
  }
  charts.push(new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      plugins: { legend: { display: hasFc, labels: { boxWidth: 12, font: { size: 10 } } } },
      scales: { x: { ticks: { maxTicksLimit: 6, font: { size: 9 }, maxRotation: 0 } },
                y: { beginAtZero: true, ticks: { maxTicksLimit: 5 } } },
      interaction: { mode: "index", intersect: false },
      animation: false, responsive: true, maintainAspectRatio: false },
    plugins
  }));
}
