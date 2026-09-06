/* ================================================================
   common.js  —  shared layer for the Isfahan AQ monitoring site.
   API base, i18n (fa/en), Jalali dates (Tehran clock),
   graphical AQI gauge (SVG, no emoji), contrast + helpers.
   ================================================================ */
const API = (location.protocol === "file:") ? "http://127.0.0.1:8000" : "";  // same-origin when served (LAN/tunnel/domain)

/* ---------- language (persisted) ---------- */
let lang = localStorage.getItem("aq_lang") || "fa";
function setLang(l){ lang = l; localStorage.setItem("aq_lang", l); }

const T = {
  fa: {
    org: "مرکز پایش و کنترل کیفیت هوای شهر اصفهان",
    subtitle: "سامانه پیش‌بینی کیفیت هوا — ۲۴ ساعت و ۳ روز آینده",
    cityTitle: "شاخص روزانه کیفیت هوای شهر — هفته گذشته و سه روز آینده",
    citySub: "هفته گذشته و سه روز آینده (پیش‌بینی)",
    cityNow: "کیفیت هوای کنونی شهر", miniBarsLabel: "۲۴ ساعت گذشته و ۲۴ ساعت آینده",
    heroTitle: "هوای پاک‌تر • زندگی سالم‌تر", heroSub: "سامانه پایش و پیش‌بینی برخط آلودگی هوای شهر اصفهان",
    loc: "اصفهان، ایران", script: "هوای پاک، آینده‌ روشن",
    wxSunny:"آفتابی", wxPartly:"نیمه‌ابری", wxCloudy:"ابری", wxRain:"بارانی", wxClear:"صاف",
    stationsHead: "ایستگاه‌ها بر پایه شاخص",
    stationsSub: "بدترین وضعیت در بالا",
    searchPh: "جست‌وجوی ایستگاه…",
    credit: "طراحی و توسعه: دانشگاه صنعتی اصفهان",
    aqi: "شاخص", dominant: "آلاینده غالب", observed: "مشاهده‌شده",
    forecast: "پیش‌بینی", updated: "به‌روزرسانی",
    noData: "داده‌ای موجود نیست", noStations: "ایستگاهی یافت نشد",
    back: "بازگشت به نقشه",
    stationTitle: "جزئیات ایستگاه", next24: "پیش‌بینی ۲۴ ساعت آینده",
    dailyTitle: "شاخص روزانه آلودگی هوا — ۵ روز گذشته و ۳ روز آینده",
    pollutantsTitle: "آلاینده‌ها — ۴۸ ساعت گذشته و ۲۴ ساعت آینده",
    hoverHint: "برای جزئیات کلیک کنید", loading: "در حال بارگذاری…",
    today: "امروز", currentAqi: "شاخص کنونی", measuredOnly: "فقط داده واقعی",
    hasFc: "دارای پیش‌بینی", noDailyData: "داده کافی برای شاخص روزانه نیست",
    partial: "روز ناقص (کمتر از ۷۵٪ ساعت‌ها)",
    stale: "پیش‌بینی به‌روز موجود نیست",
    hourlyAqiTitle: "شاخص ساعتی آلودگی هوا — ۴۸ ساعت گذشته و ۲۴ ساعت آینده",
    cityHourlyTitle: "شاخص ساعتی کیفیت هوای شهر — ۴۸ ساعت گذشته و ۲۴ ساعت آینده",
    weatherTitle: "هواشناسی (فرودگاه)", stationWeather: "هواشناسی ایستگاه",
    adviceTitle: "توصیه سلامت",
    wxTemp: "دما", wxHum: "رطوبت", wxWind: "باد", wxPress: "فشار", wxVis: "دید",
    animTitle: "پویانمایی تغییرات ذرات معلق ۲.۵ میکرومتری در سطح شهر",
    animSub: "",
    units: { CO:"ppm", O3:"ppb", NO2:"ppb", SO2:"ppb", PM2_5:"µg/m³", PM10:"µg/m³" },
    catFa: true
  },
  en: {
    org: "Isfahan Air Quality Monitoring & Control Center",
    subtitle: "Air-quality forecasting system — next 24 hours & 3 days",
    cityTitle: "Daily city AQI — past week & next 3 days",
    citySub: "Past week and next 3 days (forecast)",
    cityNow: "Current city air quality", miniBarsLabel: "Last 24 h & next 24 h",
    heroTitle: "Cleaner Air • Healthier Lives", heroSub: "Online system for monitoring & forecasting Isfahan city air pollution",
    loc: "Isfahan, Iran", script: "Clean Air \u00b7 Bright Future",
    wxSunny:"Sunny", wxPartly:"Partly cloudy", wxCloudy:"Cloudy", wxRain:"Rainy", wxClear:"Clear",
    stationsHead: "Stations by AQI",
    stationsSub: "Worst first",
    searchPh: "Search station…",
    credit: "Designed & developed by Isfahan University of Technology",
    aqi: "AQI", dominant: "Dominant pollutant", observed: "Observed",
    forecast: "Forecast", updated: "Updated",
    noData: "No data available", noStations: "No station found",
    back: "Back to map",
    stationTitle: "Station details", next24: "Next 24-hour forecast",
    dailyTitle: "Daily AQI — last 5 days & next 3 days",
    pollutantsTitle: "Pollutants — last 48 h & next 24 h",
    hoverHint: "Click for details", loading: "Loading…",
    today: "Today", currentAqi: "Current AQI", measuredOnly: "Measured only",
    hasFc: "Forecast available", noDailyData: "Not enough data for a daily index",
    partial: "partial day (<75% of hours)",
    stale: "No up-to-date forecast",
    hourlyAqiTitle: "Hourly AQI — last 48 h & next 24 h",
    cityHourlyTitle: "City hourly AQI — last 48 h & next 24 h",
    weatherTitle: "Weather (airport)", stationWeather: "Station weather",
    adviceTitle: "Health advice",
    wxTemp: "Temp", wxHum: "Humidity", wxWind: "Wind", wxPress: "Pressure", wxVis: "Visibility",
    animTitle: "Animation of PM2.5 particulate variation across the city",
    animSub: "",
    units: { CO:"ppm", O3:"ppb", NO2:"ppb", SO2:"ppb", PM2_5:"µg/m³", PM10:"µg/m³" },
    catFa: false
  }
};
const t = k => T[lang][k] ?? k;

/* ---------- Jalali (Shamsi) dates, Tehran clock ---------- */
const faFmt  = new Intl.DateTimeFormat("fa-IR", { month:"short", day:"numeric" });
const faFmtW = new Intl.DateTimeFormat("fa-IR", { weekday:"short", month:"short", day:"numeric" });
const enFmt  = new Intl.DateTimeFormat("en-US-u-ca-persian", { month:"short", day:"numeric" });
const enFmtW = new Intl.DateTimeFormat("en-US-u-ca-persian", { weekday:"short", month:"short", day:"numeric" });

function jDay(dstr, withWeekday = false){
  const d = new Date(dstr + "T12:00:00");
  if (lang === "fa") return (withWeekday ? faFmtW : faFmt).format(d);
  return (withWeekday ? enFmtW : enFmt).format(d).replace(" AP", "");
}
function jHour(iso){
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, "0") + ":00";
  const day = (lang === "fa" ? faFmt : enFmt).format(d);
  return `${day} ${h}`;
}

/* ---------- graphical AQI gauge (SVG donut, instrument style) ---------- */
function aqiFrac(aqi){ if (aqi == null) return 0; return Math.max(0, Math.min(1, aqi / 300)); }
/* pick readable text color over a category color */
function idealText(hex){
  if (!hex) return "#12202c";
  const m = hex.replace("#","");
  const r = parseInt(m.substr(0,2),16), g = parseInt(m.substr(2,2),16), b = parseInt(m.substr(4,2),16);
  const L = (0.299*r + 0.587*g + 0.114*b) / 255;
  return L > 0.62 ? "#12202c" : "#ffffff";
}
function gaugeSVG(aqi, color, opts = {}){
  const size = opts.size || 72, stroke = opts.stroke || 9;
  const r = (size - stroke) / 2, cx = size / 2, c = 2 * Math.PI * r;
  const dash = c * aqiFrac(aqi);
  const col = color || "#c3ccd4";
  const fs = opts.fs || Math.round(size * 0.34);
  const sub = opts.sub ? `<text x="${cx}" y="${cx + fs*0.78}" text-anchor="middle" class="gauge-sub">${opts.sub}</text>` : "";
  return `<svg class="gauge" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="AQI ${aqi ?? "no data"}">
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="var(--ring-track)" stroke-width="${stroke}"/>
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${col}" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${dash.toFixed(1)} ${(c - dash).toFixed(1)}" transform="rotate(-90 ${cx} ${cx})"
      style="transition:stroke-dasharray .5s ease"/>
    <text x="${cx}" y="${cx}" text-anchor="middle" dominant-baseline="central"
      class="gauge-num" style="font-size:${fs}px">${aqi ?? "—"}</text>${sub}
  </svg>`;
}


/* keep only forecast rows dated after the last observed day (drops stale forecasts) */
function futureDaily(past, forecast){
  const lastPast = (past && past.length) ? past[past.length - 1].date : null;
  const today = new Date().toISOString().slice(0, 10);
  const cut = lastPast || today;
  return (forecast || []).filter(r => r.date > cut);
}


/* ---------- AQI category index + expression face ---------- */
const CAT_ORDER = ["Good","Moderate","Unhealthy for Sensitive","Unhealthy","Very Unhealthy","Hazardous"];
function catIndex(category){ const i = CAT_ORDER.indexOf(category); return i < 0 ? 0 : i; }

/* eyes + mouth; mouth curves from smile (Good) to frown (Hazardous) */
function faceInner(ci, size, featColor){
  const F = featColor || "#1c2733";
  const cx = size/2, eyeY = 0.40*size, er = Math.max(2, 0.05*size);
  const x1 = 0.33*size, x2 = 0.67*size, baseY = 0.60*size;
  const amp = 0.15*size;
  let off = amp*(1.2 - 0.7*ci);                          // Good/Moderate smile, USG+ frown
  off = Math.max(-amp, Math.min(amp, off));              // + = smile, - = frown
  const brow = ci >= 4
    ? `<line x1="${0.29*size}" y1="${0.31*size}" x2="${0.42*size}" y2="${0.34*size}" stroke="${F}" stroke-width="${Math.max(1.6,0.035*size)}" stroke-linecap="round"/>
       <line x1="${0.71*size}" y1="${0.31*size}" x2="${0.58*size}" y2="${0.34*size}" stroke="${F}" stroke-width="${Math.max(1.6,0.035*size)}" stroke-linecap="round"/>` : "";
  return `${brow}
    <circle cx="${0.37*size}" cy="${eyeY}" r="${er}" fill="${F}"/>
    <circle cx="${0.63*size}" cy="${eyeY}" r="${er}" fill="${F}"/>
    <path d="M ${x1} ${baseY} Q ${cx} ${(baseY+off).toFixed(1)} ${x2} ${baseY}" fill="none"
          stroke="${F}" stroke-width="${Math.max(2,0.055*size)}" stroke-linecap="round"/>`;
}

/* gauge ring (colored by category) with an expression face in the centre */
function aqiGauge(aqi, color, category, opts = {}){
  const size = opts.size || 96, stroke = opts.stroke || 10;
  const r = (size - stroke)/2, cx = size/2, c = 2*Math.PI*r, dash = c*aqiFrac(aqi);
  const col = color || "#c3ccd4";
  const face = (aqi != null && category) ? faceInner(catIndex(category), size)
             : `<text x="${cx}" y="${cx}" text-anchor="middle" dominant-baseline="central" class="gauge-num" style="font-size:${Math.round(size*0.3)}px">—</text>`;
  return `<svg class="gauge" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="AQI ${aqi ?? "no data"}">
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="var(--ring-track)" stroke-width="${stroke}"/>
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${col}" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${dash.toFixed(1)} ${(c-dash).toFixed(1)}" transform="rotate(-90 ${cx} ${cx})"
      style="transition:stroke-dasharray .5s ease"/>
    ${face}
  </svg>`;
}

/* short health guidance by category (fa/en) */
const ADVICE = {
  fa: {
    "Good": "هوا سالم است؛ همه می‌توانند فعالیت بیرونی داشته باشند.",
    "Moderate": "قابل قبول؛ افراد بسیار حساس فعالیت شدید و طولانی را کم کنند.",
    "Unhealthy for Sensitive": "گروه‌های حساس (بیماران قلبی و تنفسی، کودکان، سالمندان و باردارها) فعالیت طولانی بیرون را کم کنند.",
    "Unhealthy": "همه فعالیت شدید بیرون را کم کنند؛ گروه‌های حساس ترجیحاً بیرون نروند.",
    "Very Unhealthy": "از فعالیت بیرون خودداری کنید؛ گروه‌های حساس در خانه بمانند و از ماسک استفاده کنند.",
    "Hazardous": "شرایط اضطراری؛ همه در خانه بمانند و فعالیت بیرونی را متوقف کنند."
  },
  en: {
    "Good": "Air is clean; everyone can be active outdoors.",
    "Moderate": "Acceptable; very sensitive people should limit long, intense activity.",
    "Unhealthy for Sensitive": "Sensitive groups (heart/lung patients, children, elderly, pregnant) should limit long outdoor activity.",
    "Unhealthy": "Everyone should reduce hard outdoor activity; sensitive groups should preferably stay indoors.",
    "Very Unhealthy": "Avoid outdoor activity; sensitive groups should stay indoors and wear a mask.",
    "Hazardous": "Emergency conditions; everyone should stay indoors and stop outdoor activity."
  }
};
function healthAdvice(category){ return (ADVICE[lang] && ADVICE[lang][category]) || ""; }


const catLabel = s => (lang === "fa" ? (s.category_fa || "") : (s.category || ""));  // category only, never the station name
const stName   = s => (lang === "fa" ? (s.name_fa || s.name_en) : (s.name_en || s.name_fa));

/* ---------- misc ---------- */
function applyI18n(){
  document.documentElement.lang = lang;
  document.documentElement.dir = (lang === "fa") ? "rtl" : "ltr";
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const s = t(el.dataset.i18n);
    const i = s.indexOf("—");                       // split "title — timeframe" into a lighter sub-part
    if (i >= 0){
      el.innerHTML = s.slice(0, i).trim() + ' <span class="h-sub">' + s.slice(i + 1).trim() + '</span>';
    } else {
      el.textContent = s;
    }
  });
  document.querySelectorAll("[data-i18n-ph]").forEach(el => el.placeholder = t(el.dataset.i18nPh));
  const b = document.getElementById("langBtn");
  if (b) b.textContent = (lang === "fa") ? "EN" : "فارسی";
}
async function getJSON(path){
  const r = await fetch(API + path);
  if (!r.ok) throw new Error(path + " -> " + r.status);
  return r.json();
}
const show = id => document.getElementById(id)?.classList.remove("hidden");
const hide = id => document.getElementById(id)?.classList.add("hidden");


/* small round face badge (filled tint + expression) */
function faceBadge(category, color, size){
  const cx = size/2, r = size/2 - 1, col = color || "#c3ccd4";
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="${col}22" stroke="${col}" stroke-width="2"/>
    ${faceInner(catIndex(category || "Good"), size)}</svg>`;
}

/* forecast band + "now" divider for the hourly-AQI line (orientation-proof) */
function fcZoneHourly(nowIdx, lastIdx){
  return { id: "fcZoneH",
    beforeDatasetsDraw(chart){
      const { ctx, chartArea, scales } = chart;
      if (nowIdx == null || nowIdx < 0 || !scales.x) return;
      const xNow = scales.x.getPixelForValue(nowIdx);
      const xEnd = scales.x.getPixelForValue(lastIdx);
      const x1 = Math.min(xNow, xEnd), x2 = Math.max(xNow, xEnd);
      ctx.save();
      ctx.fillStyle = "rgba(232,131,58,.07)";
      ctx.fillRect(x1, chartArea.top, x2 - x1, chartArea.bottom - chartArea.top);
      ctx.strokeStyle = "rgba(232,131,58,.55)"; ctx.setLineDash([4,4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xNow, chartArea.top); ctx.lineTo(xNow, chartArea.bottom); ctx.stroke();
      ctx.restore();
    } };
}

/* hourly AQI line, coloured by AQI category per segment; forecast = dashed */
function drawHourlyAqi(canvas, series){
  if (!window.Chart || !series || !series.length) return null;
  // clamp to 48 h before / 24 h after the latest observed hour, so a stale
  // station in the feed can't stretch the chart back days/weeks
  let _b = series.length - 1;
  for (let i = 0; i < series.length; i++){ if (series[i].kind === "forecast"){ _b = i - 1; break; } }
  const _bt = Date.parse(series[Math.max(0, _b)].time);
  if (!isNaN(_bt)){
    const lo = _bt - 47*3600e3, hi = _bt + 24*3600e3;
    const f = series.filter(r => { const tt = Date.parse(r.time); return isNaN(tt) || (tt >= lo && tt <= hi); });
    if (f.length) series = f;
  }
  const labels = series.map(r => jHour(r.time));
  const data   = series.map(r => r.aqi);
  const colors = series.map(r => r.color || "#0f6ea3");
  let nowIdx = series.length - 1;
  for (let i = 0; i < series.length; i++){ if (series[i].kind === "forecast"){ nowIdx = i - 1; break; } }
  return new Chart(canvas, {
    type: "line",
    data: { labels, datasets: [{
      data, borderWidth: 2.6, pointRadius: 0, pointHoverRadius: 3, tension: .3, fill: false,
      segment: {
        borderColor: c => colors[c.p1DataIndex] || "#0f6ea3",
        borderDash:  c => (series[c.p1DataIndex] && series[c.p1DataIndex].kind === "forecast") ? [5,4] : undefined
      } }] },
    options: {
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: c => {
          const r = series[c.dataIndex];
          return ` ${t("aqi")}: ${c.raw}` + (r.kind === "forecast" ? ` (${t("forecast")})` : "") +
                 (r.dominant ? ` · ${r.dominant}` : "");
        } } } },
      scales: { y: { beginAtZero: true, title: { display: true, text: t("aqi") }, ticks: { maxTicksLimit: 6 } },
                x: { grid: { display: false }, ticks: { maxTicksLimit: 7, font: { size: 9 }, maxRotation: 0 } } },
      interaction: { mode: "index", intersect: false },
      animation: false, responsive: true, maintainAspectRatio: false },
    plugins: [ fcZoneHourly(nowIdx, series.length - 1) ]
  });
}

/* tiny inline weather icons (graphical, not emoji) */
const WXICON = {
  temp: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13.5V5a2 2 0 0 1 4 0v8.5a4 4 0 1 1-4 0z"/></svg>',
  hum:  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/></svg>',
  wind: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 8h11a2.5 2.5 0 1 0-2.5-2.5M3 12h15a3 3 0 1 1-3 3M3 16h8a2 2 0 1 1-2 2"/></svg>',
  press:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="13" r="7"/><path d="M12 13l3-3M12 3v2"/></svg>',
  vis:  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></svg>'
};


/* ---------- semicircular AQI gauge (needle) for the city card ---------- */
const DEFAULT_CATS = [
  {lo:0,hi:50,color:"#00E400",name_en:"Good",name_fa:"پاک"},
  {lo:51,hi:100,color:"#FFD21A",name_en:"Moderate",name_fa:"متوسط"},
  {lo:101,hi:150,color:"#FF7E00",name_en:"Unhealthy for Sensitive",name_fa:"ناسالم برای گروه‌های حساس"},
  {lo:151,hi:200,color:"#FF0000",name_en:"Unhealthy",name_fa:"ناسالم"},
  {lo:201,hi:300,color:"#8F3F97",name_en:"Very Unhealthy",name_fa:"خیلی ناسالم"},
  {lo:301,hi:500,color:"#7E0023",name_en:"Hazardous",name_fa:"خطرناک"}
];
function catsList(){ return (window._cats && window._cats.length === 6) ? window._cats : DEFAULT_CATS; }
function gaugePt(cx,cy,r,deg){ const a=(deg-90)*Math.PI/180; return [cx+r*Math.cos(a), cy+r*Math.sin(a)]; }
function gaugeArc(cx,cy,r,a,b){ const [x1,y1]=gaugePt(cx,cy,r,a),[x2,y2]=gaugePt(cx,cy,r,b);
  const large=(b-a)>180?1:0; return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`; }

/* aqi -> gauge SVG. Center shows the expression face + the AQI number. */
function cityGaugeSVG(aqi, opts={}){
  const W=320, H=262, cx=160, cy=148, r=114, band=20;
  const cats=catsList(), START=225, SPAN=270, seg=SPAN/cats.length;
  const idxOf=v=>{ let i=cats.findIndex(c=>v>=c.lo && v<=c.hi); if(i<0) i=(v>cats[cats.length-1].hi)?cats.length-1:0; return i; };
  // colored band segments
  let segs="";
  for(let i=0;i<cats.length;i++){
    const a=START+i*seg+(i?0.8:0), b=START+(i+1)*seg-(i<cats.length-1?0.8:0);
    segs+=`<path d="${gaugeArc(cx,cy,r,a,b)}" fill="none" stroke="${cats[i].color}" stroke-width="${band}"/>`;
  }
  // boundary numbers, set well outside the band
  const tickR=r+band/2+15;
  let ticks="";
  for(let i=0;i<cats.length-1;i++){
    const [lx,ly]=gaugePt(cx,cy,tickR,START+(i+1)*seg);
    ticks+=`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="700" fill="var(--muted)">${cats[i].hi}</text>`;
  }
  const col=(aqi!=null)?cats[idxOf(aqi)].color:"#c3ccd4";
  // arrow at the value, tip pointing OUTWARD to the coloured band
  let arrow="";
  if(aqi!=null){
    const c=cats[idxOf(aqi)], f=Math.max(0,Math.min(1,(aqi-c.lo)/((c.hi-c.lo)||1)));
    const nd=START+(idxOf(aqi)+f)*seg;
    const [tx,ty]=gaugePt(cx,cy,r-band/2-1,nd);       // tip near band inner edge
    const [ax,ay]=gaugePt(cx,cy,r-band-14,nd-5.5);    // base inward
    const [bx,by]=gaugePt(cx,cy,r-band-14,nd+5.5);
    arrow=`<polygon points="${tx.toFixed(1)},${ty.toFixed(1)} ${ax.toFixed(1)},${ay.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}" fill="#fff" stroke="#1c2733" stroke-width="1.5" stroke-linejoin="round"/>`;
  }
  // big expression face on a disc coloured by the current AQI (emoji style:
  // dense colour at the edge, lighter in the middle); number below, in the gap.
  const featC = idealText(col);
  const faceR = 55, fcy = cy - 8;
  const grad = `<radialGradient id="fg" cx="50%" cy="42%" r="62%">
      <stop offset="0%" stop-color="${col}" stop-opacity="0.45"/>
      <stop offset="62%" stop-color="${col}" stop-opacity="0.82"/>
      <stop offset="100%" stop-color="${col}" stop-opacity="1"/></radialGradient>`;
  const disc = `<circle cx="${cx}" cy="${fcy}" r="${faceR}" fill="url(#fg)" stroke="#111" stroke-width="5"/>`;
  const face = (aqi!=null)
    ? `<g transform="translate(${cx-faceR}, ${fcy-faceR})">${faceInner(catIndex(catFromAqi(aqi)), faceR*2, featC)}</g>` : "";
  const num=(aqi!=null)?aqi:"—";
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="AQI ${num}">
    <defs>${grad}</defs>
    ${segs}${ticks}${arrow}${disc}${face}
    <text x="${cx}" y="${cy+92}" text-anchor="middle" font-size="38" font-weight="800" fill="var(--ink)" style="font-variant-numeric:tabular-nums">${num}</text>
  </svg>`;
}
function catFromAqi(aqi){ const cats=catsList(); const c=cats.find(c=>aqi>=c.lo&&aqi<=c.hi); return c?c.name_en:(aqi>500?"Hazardous":"Good"); }

/* compact 24h-past + 24h-future AQI column bars (sidebar) */
function drawMiniBars(canvas, series){
  if(!window.Chart || !series || !series.length) return null;
  let nowIdx=series.length-1;
  for(let i=0;i<series.length;i++){ if(series[i].kind==="forecast"){ nowIdx=i-1; break; } }
  const lo=Math.max(0, nowIdx-23), hi=Math.min(series.length, nowIdx+1+24);
  const win=series.slice(lo,hi);
  let niWin=win.findIndex(r=>r.kind==="forecast"); niWin=(niWin<0?win.length-1:niWin-1);  // current hour in window
  const nowMark={ id:"nowMark", afterDatasetsDraw(chart){
    const {ctx,scales,chartArea}=chart;
    if(niWin<0||!scales.x) return;
    const x=scales.x.getPixelForValue(niWin), yTop=chartArea.top;
    ctx.save(); ctx.fillStyle="#1565ff";
    ctx.beginPath(); ctx.moveTo(x,yTop+9); ctx.lineTo(x-6,yTop-1); ctx.lineTo(x+6,yTop-1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle="#1565ff"; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(x,yTop); ctx.lineTo(x,chartArea.bottom); ctx.stroke();
    ctx.restore();
  }};
  return new Chart(canvas,{ type:"bar",
    data:{ labels:win.map(r=>r.time),
      datasets:[{ data:win.map(r=>r.aqi),
        backgroundColor:win.map(r=> r.kind==="forecast" ? (r.color+"9c") : r.color),
        borderWidth:0, categoryPercentage:0.9, barPercentage:0.95 }] },
    options:{ layout:{padding:{top:10}}, plugins:{ legend:{display:false},
        tooltip:{ callbacks:{ title:i=>jHour(win[i[0].dataIndex].time),
          label:c=>` ${t("aqi")}: ${c.raw}`+(win[c.dataIndex].kind==="forecast"?` (${t("forecast")})`:"") } } },
      scales:{ x:{display:false}, y:{display:false,beginAtZero:true} },
      animation:false, responsive:true, maintainAspectRatio:false },
    plugins:[nowMark] });
}


/* ================= header ribbon: weather condition + live clock ================= */
const HWICON = {
  sun:  '<svg viewBox="0 0 48 48" width="40" height="40"><circle cx="24" cy="24" r="9" fill="#FFD21A"/><g stroke="#FFD21A" stroke-width="3" stroke-linecap="round">'+
        [0,45,90,135,180,225,270,315].map(a=>{const r=(a)*Math.PI/180,x1=24+14*Math.cos(r),y1=24+14*Math.sin(r),x2=24+19*Math.cos(r),y2=24+19*Math.sin(r);return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;}).join('')+'</g></svg>',
  partly:'<svg viewBox="0 0 48 48" width="40" height="40"><circle cx="18" cy="18" r="7" fill="#FFD21A"/><g stroke="#FFD21A" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="5" x2="18" y2="9"/><line x1="6" y1="18" x2="10" y2="18"/><line x1="9" y1="9" x2="12" y2="12"/></g><path d="M16 34a7 7 0 0 1 1-13.9 9 9 0 0 1 17 3.2A6 6 0 0 1 33 34z" fill="#e9eef4" stroke="#c7d2de" stroke-width="1"/></svg>',
  cloud:'<svg viewBox="0 0 48 48" width="40" height="40"><path d="M15 36a8 8 0 0 1 1.2-15.9 11 11 0 0 1 21 3.2A7 7 0 0 1 36 36z" fill="#e9eef4" stroke="#c7d2de" stroke-width="1.2"/></svg>',
  rain: '<svg viewBox="0 0 48 48" width="40" height="40"><path d="M15 30a8 8 0 0 1 1.2-15.9 11 11 0 0 1 21 3.2A7 7 0 0 1 36 30z" fill="#e9eef4" stroke="#c7d2de" stroke-width="1.2"/><g stroke="#5ea0ff" stroke-width="2.6" stroke-linecap="round"><line x1="18" y1="34" x2="16" y2="40"/><line x1="26" y1="34" x2="24" y2="40"/><line x1="34" y1="34" x2="32" y2="40"/></g></svg>',
  moon: '<svg viewBox="0 0 48 48" width="40" height="40"><path d="M30 33a13 13 0 1 1-9-22 11 11 0 0 0 9 22z" fill="#FFE38A"/></svg>',
  cloudnight:'<svg viewBox="0 0 48 48" width="40" height="40"><path d="M22 15a8 8 0 1 0 6 12" fill="none" stroke="#FFE38A" stroke-width="2.4"/><path d="M15 37a8 8 0 0 1 1.2-15.9 11 11 0 0 1 21 3.2A7 7 0 0 1 36 37z" fill="#e9eef4" stroke="#c7d2de" stroke-width="1.2"/></svg>'
};
function estimateCondition(w){
  if(!w) return {key:"cloud", txt:"wxCloudy"};
  const hr = w.time ? parseInt(String(w.time).slice(11,13),10) : 12;
  const night = (hr<6 || hr>=19);
  const rain = (w.rain||0) > 0.1;
  const gr = w.radiation, hum = w.humidity, vis = w.visibility;
  if(rain) return {key:"rain", txt:"wxRain"};
  if(night) return (hum!=null&&hum>82) ? {key:"cloudnight",txt:"wxCloudy"} : {key:"moon",txt:"wxClear"};
  if(gr!=null) return gr>350?{key:"sun",txt:"wxSunny"} : gr>120?{key:"partly",txt:"wxPartly"} : {key:"cloud",txt:"wxCloudy"};
  if(vis!=null&&vis<4) return {key:"cloud",txt:"wxCloudy"};
  if(hum!=null&&hum>82) return {key:"cloud",txt:"wxCloudy"};
  return {key:"sun",txt:"wxSunny"};
}
function renderHeaderWeather(w){
  window._lastWeather = w;
  const ic=document.getElementById("hwIcon"), tp=document.getElementById("hwTemp"),
        cd=document.getElementById("hwCond"), lc=document.getElementById("hwLoc");
  if(!ic) return;
  if(!w){ ic.innerHTML=""; if(tp) tp.textContent="—"; if(cd) cd.textContent=""; return; }
  const c=estimateCondition(w);
  ic.innerHTML = HWICON[c.key] || HWICON.cloud;
  if(tp) tp.textContent = (w.temperature!=null? Math.round(w.temperature): "—") + "°C";
  if(cd) cd.textContent = t(c.txt);
  if(lc) lc.textContent = t("loc");
}
function clockTick(){
  const de=document.getElementById("hcDate"), ti=document.getElementById("hcTime");
  if(!ti) return;
  const now=new Date();
  ti.textContent = new Intl.DateTimeFormat(lang==="fa"?"fa-IR":"en-GB",
      {hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"Asia/Tehran"}).format(now);
  if(de) de.textContent = (lang==="fa")
    ? new Intl.DateTimeFormat("fa-IR",{weekday:"long",day:"numeric",month:"long",timeZone:"Asia/Tehran"}).format(now)
    : new Intl.DateTimeFormat("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric",timeZone:"Asia/Tehran"}).format(now);
}
function initHeader(){
  clockTick(); setInterval(clockTick, 20000);
  getJSON("/api/weather").then(d=>renderHeaderWeather(d.weather)).catch(()=>renderHeaderWeather(null));
  const hs=document.getElementById("heroSearch");
  if(hs) hs.onclick=()=>{ const el=document.getElementById("stSearch");
    if(el){ el.scrollIntoView({behavior:"smooth",block:"center"}); el.focus(); } else location.href="index.html"; };
}
function headerRelocalize(){ clockTick(); renderHeaderWeather(window._lastWeather); }


/* Chart.js global look */
if (window.Chart){
  Chart.defaults.font.family = "Vazirmatn, Tahoma, 'Segoe UI', sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.color = "#697787";
}
