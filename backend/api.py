# -*- coding: utf-8 -*-
"""
================================================================
 api.py  -  FastAPI over the Isfahan AQ forecasts (Step 6)  [v2 OFFICIAL]
================================================================
All on the TEHRAN clock. AQI everywhere follows the SDRA instruction:
  * concentrations: PM mean24 | SO2/NO2/O3_1 max1h | CO/O3_8 max 8h-avg
  * station AQI = MAX pollutant index (O3 = max of O3_1/O3_8)
  * CITY: mean of each pollutant's index across stations -> MAX
  * official breakpoints (new PM2.5 table) + lower-row gap rule
  * "current" = online index over the trailing 24h ending at the latest hour
  * daily = 24h window ending 11:00

Endpoints (same shapes as before - frontend unchanged):
  /api/health /api/meta /api/stations
  /api/station/{id}/daily_aqi   /api/station/{id}/hourly
  /api/city/aqi

Run:   uvicorn api:app --reload --port 8000     (from backend/)
Needs: pip install fastapi "uvicorn[standard]" psycopg2-binary pandas
Credentials are read from the environment via config.py (see .env.example).
================================================================
"""

import os
import time
import datetime
import numpy as np
import pandas as pd
import psycopg2
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

import aqi_official as A
from config import PG, TZ, AIRPORT_ID

WEATHER_COLS = ["temperature","relativehumidity","windspeed","winddegree",
                "winddirection","pressure","visibility","raingauge","globalradiation"]
RAW = ["co", "o3", "no2", "so2", "pm10", "pm2_5"]
HOURLY_POLL = ["PM2_5", "PM10", "CO", "O3", "NO2", "SO2"]   # hourly chart pollutants (PM10 measured only)
MIN_HOURS = 18            # official 75% completeness for a daily value
DAILY_MIN_HOURS = 12     # relaxed rule for the on-site daily CHART only (marked 'partial')
MIN_8H = 6
CACHE_TTL = 300

app = FastAPI(title="Isfahan Air Quality API (official AQI)")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"])
_cache = {}


def conn():
    return psycopg2.connect(**PG, options="-c timezone=Asia/Tehran")


def query(sql, params=None):
    with conn() as c, c.cursor() as cur:
        cur.execute(sql, params or ())
        return pd.DataFrame(cur.fetchall(), columns=[d[0] for d in cur.description])


def tehran_naive(series):
    return pd.to_datetime(series, utc=True).dt.tz_convert(TZ).dt.tz_localize(None)


def cached(key, fn):
    now = time.time()
    if key in _cache and now - _cache[key][0] < CACHE_TTL:
        return _cache[key][1]
    val = fn()
    _cache[key] = (now, val)
    return val


# ============================================================
#  OFFICIAL aggregation over one hourly frame (rows = one station)
# ============================================================
def official_concs(sub, min_hours=MIN_HOURS):
    """sub: hourly df with cols CO,O3,NO2,SO2,PM10?,PM2_5 (may miss PM10).
    Returns {target: value} per official rules (>=18 valid; 8h roll >=6)."""
    concs = {}
    for p in ["PM2_5", "PM10"]:
        if p in sub:
            v = sub[p].dropna()
            if len(v) >= min_hours:
                concs[p] = float(v.mean())
    for src, tgt in [("SO2", "SO2"), ("NO2", "NO2"), ("O3", "O3_1")]:
        if src in sub:
            v = sub[src].dropna()
            if len(v) >= min_hours:
                concs[tgt] = float(v.max())
    for src, tgt in [("CO", "CO"), ("O3", "O3_8")]:
        if src in sub:
            r8 = sub[src].rolling(8, min_periods=MIN_8H).mean().dropna()
            if len(r8) >= min_hours:
                concs[tgt] = float(r8.max())
    return concs


def load_recent(days=10):
    df = query(f"""SELECT station_id, obs_time, {', '.join(RAW)}
                   FROM observations
                   WHERE obs_time >= now() - interval '{days} days'
                   ORDER BY obs_time;""")
    if df.empty:
        return df
    df["t"] = tehran_naive(df["obs_time"])
    df = df.rename(columns={"co": "CO", "o3": "O3", "no2": "NO2", "so2": "SO2",
                            "pm10": "PM10", "pm2_5": "PM2_5"})
    for p in ["CO", "O3", "NO2", "SO2", "PM10", "PM2_5"]:
        df[p] = pd.to_numeric(df[p], errors="coerce")
    return df


NOW_COLS = ["CO", "O3", "NO2", "SO2", "PM10", "PM2_5"]

def _station_now_raw():
    """Per station: (pollutant->index dict, t_last) using the SDRA 'now' method."""
    def _build():
        df = load_recent(3)
        res = {}
        if df.empty:
            return res
        for sid, sub in df.groupby("station_id"):
            sub = sub.sort_values("t").copy()
            sub["hr"] = sub["t"].dt.floor("h")
            hourly = sub.groupby("hr")[NOW_COLS].mean()
            if hourly.empty:
                continue
            t_last = hourly.index.max()
            hours = pd.date_range(end=t_last, periods=12, freq="h")
            hourly = hourly.reindex(hours)
            concs = {}
            for p in ["PM2_5", "PM10", "SO2", "NO2", "CO"]:
                C = A.now_weighted_conc(list(hourly[p]))
                if C is not None:
                    concs[p] = C
            Co3 = A.now_weighted_conc(list(hourly["O3"]))
            if Co3 is not None:
                concs["O3_1"] = Co3
                concs["O3_8"] = Co3
            idx = A.station_indices(concs)
            if idx:
                res[int(sid)] = (idx, str(t_last))
        return res
    return cached("cur_now_raw", _build)


def current_station_aqi():
    """Station 'now' index = MAX of the per-pollutant now sub-indices."""
    def _build():
        out = {}
        for sid, (idx, t_last) in _station_now_raw().items():
            dom = max(idx, key=idx.get)
            out[sid] = (int(idx[dom]), dom, t_last)
        return out
    return cached("cur_aqi", _build)


def current_city_now():
    """City 'now' index: per pollutant, MEAN across stations; city = MAX (SDRA)."""
    def _build():
        raw = _station_now_raw()
        dicts = [idx for idx, _ in raw.values()]
        aqi, dom = A.city_aqi(dicts)
        tlast = max((t for _, t in raw.values()), default=None)
        return {"aqi": aqi, "dominant": dom, "t_last": tlast}
    return cached("cur_city_now", _build)


def daily_history(days=10, min_hours=MIN_HOURS):
    """Official daily AQI per station: day D = 24h window ending 11:00 of D."""
    POLS = ["PM2_5", "PM10", "CO", "O3", "NO2", "SO2"]
    def _build():
        df = load_recent(days)
        rows = []
        if df.empty:
            return pd.DataFrame(rows)
        df["day"] = (df["t"] + pd.Timedelta(hours=12)).dt.floor("D")
        for (sid, day), sub in df.groupby(["station_id", "day"]):
            sub = sub.sort_values("t")
            concs = official_concs(sub, min_hours=min_hours)
            aqi, dom = A.station_aqi(concs)
            if aqi is not None:
                best = max((int(sub[p].dropna().shape[0]) for p in POLS if p in sub), default=0)
                rows.append({"station_id": int(sid), "day": day.date(),
                             "aqi": aqi, "dominant": dom,
                             "partial": bool(best < MIN_HOURS),
                             "indices": A.station_indices(concs)})
        return pd.DataFrame(rows)
    return cached(f"daily_hist_{days}_{min_hours}", _build)


# ============================================================
#  ENDPOINTS
# ============================================================
@app.get("/api/health")
def health():
    try:
        n = query("SELECT count(*) c FROM observations;")["c"][0]
        return {"status": "ok", "observations": int(n),
                "time_tehran": datetime.datetime.now().isoformat()}
    except Exception as e:
        raise HTTPException(500, f"db error: {e}")


@app.get("/api/meta")
def meta():
    return {"pollutants": HOURLY_POLL,
            "categories": [{"lo": lo, "hi": hi, "name_en": n,
                            "name_fa": A.AQI_COLORS[n]["name_fa"],
                            "color": A.AQI_COLORS[n]["color"]}
                           for lo, hi, n in A.AQI_CATEGORIES]}


@app.get("/api/stations")
def stations():
    st = query("SELECT station_id, name_en, name_fa, latitude, longitude FROM stations;")
    cur = current_station_aqi()
    out = []
    for r in st.itertuples():
        if r.latitude in (None, 0) or r.longitude in (None, 0):
            continue
        aqi, dom, day = cur.get(int(r.station_id), (None, None, None))
        cat, color, name_fa = A.info(aqi)
        out.append({"station_id": int(r.station_id), "name_en": r.name_en,
                    "name_fa": r.name_fa, "lat": float(r.latitude),
                    "lon": float(r.longitude), "aqi": aqi,
                    "dominant": dom.replace("_", ".") if dom else None,
                    "category": cat, "category_fa": name_fa, "color": color,
                    "day": day[:10] if day else None})
    return {"stations": out}


@app.get("/api/station/{sid}/daily_aqi")
def station_daily(sid: int):
    hist = daily_history(10, DAILY_MIN_HOURS)
    past = []
    if not hist.empty:
        sub = hist[hist["station_id"] == sid].sort_values("day").tail(5)
        for r in sub.itertuples():
            cat, color, _ = A.info(int(r.aqi))
            past.append({"date": str(r.day), "aqi": int(r.aqi),
                         "category": cat, "color": color, "dominant": r.dominant,
                         "partial": bool(getattr(r, "partial", False))})
    fdf = query("""SELECT target_date, value, category, color, dominant
                   FROM predictions_daily
                   WHERE station_id=%s AND pollutant='AQI'
                     AND run_date=(SELECT max(run_date) FROM predictions_daily
                                   WHERE station_id=%s AND pollutant='AQI')
                   ORDER BY target_date;""", (sid, sid))
    forecast = [{"date": str(r.target_date), "aqi": round(float(r.value)),
                 "category": r.category, "color": r.color, "dominant": r.dominant}
                for r in fdf.itertuples()]
    return {"station_id": sid, "past": past, "forecast": forecast}


@app.get("/api/station/{sid}/hourly")
def station_hourly(sid: int):
    obs = query(f"""SELECT obs_time, {', '.join(p.lower() for p in HOURLY_POLL)}
                    FROM observations WHERE station_id=%s
                      AND obs_time >= COALESCE(
                            (SELECT max(obs_time) FROM observations WHERE station_id=%s),
                            now()) - interval '48 hours'
                    ORDER BY obs_time;""", (sid, sid))
    observed = {"time": [], **{p: [] for p in HOURLY_POLL}}
    if not obs.empty:
        observed["time"] = [t.isoformat() for t in tehran_naive(obs["obs_time"])]
        for p in HOURLY_POLL:
            observed[p] = [None if pd.isna(v) else float(v) for v in obs[p.lower()]]

    pred = query("""SELECT target_time, pollutant, value FROM predictions
                    WHERE station_id=%s
                      AND run_time=(SELECT max(run_time) FROM predictions WHERE station_id=%s)
                    ORDER BY target_time;""", (sid, sid))
    forecast = {"time": [], **{p: [] for p in HOURLY_POLL}}
    if not pred.empty:
        piv = pred.pivot_table(index="target_time", columns="pollutant", values="value")
        forecast["time"] = [t.isoformat() for t in tehran_naive(pd.Series(piv.index))]
        for p in HOURLY_POLL:
            forecast[p] = [None if (p not in piv or pd.isna(v)) else float(v)
                           for v in (piv[p] if p in piv else [np.nan] * len(piv))]
    return {"station_id": sid, "observed": observed, "forecast": forecast}


@app.get("/api/city/aqi")
def city_aqi():
    hist = daily_history(10)
    past = []
    if not hist.empty:
        for day, sub in hist.groupby("day"):
            aqi, dom = A.city_aqi(list(sub["indices"]))
            if aqi is None:
                continue
            cat, color, _ = A.info(aqi)
            past.append({"date": str(day), "aqi": aqi, "category": cat,
                         "color": color, "dominant": dom.replace("_", ".") if dom else None})
        past = sorted(past, key=lambda r: r["date"])[-7:]
    fdf = query("""SELECT target_date, value, dominant
                   FROM predictions_daily
                   WHERE station_id>0 AND pollutant='AQI'
                     AND run_date=(SELECT max(run_date) FROM predictions_daily
                                   WHERE station_id>0 AND pollutant='AQI')
                   ORDER BY target_date;""")
    forecast = []
    if not fdf.empty:
        from collections import Counter
        for day, sub in fdf.groupby("target_date"):
            vals = [float(v) for v in sub["value"] if pd.notna(v)]
            if not vals:
                continue
            aqi = int(round(sum(vals) / len(vals)))
            doms = [A._norm_dom(d) for d in sub["dominant"] if A._norm_dom(d)]
            dom = Counter(doms).most_common(1)[0][0] if doms else None
            cat, color, _ = A.info(aqi)
            forecast.append({"date": str(day), "aqi": aqi, "category": cat, "color": color,
                             "dominant": dom.replace("_", ".") if dom else None})
        forecast = sorted(forecast, key=lambda r: r["date"])

    cn = current_city_now()
    now = None
    if cn.get("aqi") is not None:
        cat, color, name_fa = A.info(cn["aqi"])
        now = {"aqi": cn["aqi"], "category": cat, "category_fa": name_fa, "color": color,
               "dominant": cn["dominant"].replace("_", ".") if cn.get("dominant") else None,
               "time": cn["t_last"]}
    return {"past": past, "forecast": forecast, "now": now}


# ============================================================
#  PM2.5 KRIGING MOVIE  (rasters written hourly by pm25_raster_job.py)
# ============================================================
@app.get("/api/pm25_frames")
def pm25_frames():
    df = query("""SELECT extract(epoch FROM frame_time)::bigint AS ep,
                         frame_time, kind, bounds, n_stations
                  FROM pm25_rasters
                  WHERE frame_time > now() - interval '25 hours'
                    AND frame_time <= now() + interval '24 hours'
                  ORDER BY frame_time;""")
    if df.empty:
        return {"bounds": None, "frames": []}
    bounds = None
    frames = []
    for r in df.itertuples():
        bounds = r.bounds
        frames.append({"epoch": int(r.ep),
                       "time": tehran_naive(pd.Series([r.frame_time]))[0].isoformat(),
                       "kind": r.kind, "n_stations": int(r.n_stations),
                       "url": f"/api/pm25_frame/{int(r.ep)}.png"})
    import json as _json
    return {"bounds": _json.loads(bounds), "frames": frames}


@app.get("/api/pm25_frame/{epoch}.png")
def pm25_frame(epoch: int):
    df = query("SELECT png FROM pm25_rasters WHERE extract(epoch FROM frame_time)::bigint = %s;",
               (epoch,))
    if df.empty:
        raise HTTPException(404, "frame not found")
    return Response(content=bytes(df["png"][0]), media_type="image/png",
                    headers={"Cache-Control": "public, max-age=3600"})


# ============================================================
#  HOURLY AQI  (rolling official "now" index, one value per hour)
# ============================================================
def _obs_hourly(sid, back_hours):
    q = query(f"""SELECT obs_time, {', '.join(p.lower() for p in NOW_COLS)}
                  FROM observations WHERE station_id=%s
                    AND obs_time >= COALESCE(
                          (SELECT max(obs_time) FROM observations WHERE station_id=%s), now())
                          - interval '{back_hours} hours'
                  ORDER BY obs_time;""", (sid, sid))
    if q.empty:
        return pd.DataFrame(), None
    q["t"] = tehran_naive(q["obs_time"]).dt.floor("h")
    q = q.rename(columns={p.lower(): p for p in NOW_COLS})
    for p in NOW_COLS:
        q[p] = pd.to_numeric(q[p], errors="coerce")
    g = q.groupby("t")[NOW_COLS].mean()
    return g, (g.index.max() if not g.empty else None)


def _pred_hourly(sid):
    pred = query("""SELECT target_time, pollutant, value FROM predictions
                    WHERE station_id=%s
                      AND run_time=(SELECT max(run_time) FROM predictions WHERE station_id=%s)
                    ORDER BY target_time;""", (sid, sid))
    if pred.empty:
        return pd.DataFrame()
    piv = pred.pivot_table(index="target_time", columns="pollutant", values="value")
    piv.index = tehran_naive(pd.Series(piv.index)).dt.floor("h").values
    keep = [c for c in NOW_COLS if c in piv.columns]
    return piv[keep]


def _now_index_at(win):
    """win: hourly DataFrame (<=12 rows, ending at the target hour)."""
    concs = {}
    for p in ["PM2_5", "PM10", "SO2", "NO2", "CO"]:
        if p in win:
            C = A.now_weighted_conc(list(win[p]))
            if C is not None:
                concs[p] = C
    if "O3" in win:
        Co3 = A.now_weighted_conc(list(win["O3"]))
        if Co3 is not None:
            concs["O3_1"] = Co3
            concs["O3_8"] = Co3
    aqi, dom = A.station_aqi(concs)
    return aqi, dom, A.station_indices(concs)


def _station_aqi_series(sid, back=48, fwd=24):
    obs, t_last = _obs_hourly(sid, back + 14)
    if obs.empty or t_last is None:
        return [], None
    fc = _pred_hourly(sid)
    end = t_last + pd.Timedelta(hours=fwd)
    full = pd.date_range(start=obs.index.min(), end=end, freq="h")
    frame = pd.DataFrame(index=full, columns=NOW_COLS, dtype=float)
    common_o = obs.index.intersection(frame.index)
    frame.loc[common_o, NOW_COLS] = obs.loc[common_o, NOW_COLS].values
    if not fc.empty:
        common_f = fc.index.intersection(frame.index)
        for c in fc.columns:
            frame.loc[common_f, c] = fc.loc[common_f, c].values
    show_from = t_last - pd.Timedelta(hours=back - 1)
    hours = list(frame.index)
    rows = []
    for i, h in enumerate(hours):
        if h < show_from:
            continue
        win = frame.iloc[max(0, i - 11): i + 1]
        aqi, dom, idx = _now_index_at(win)
        if aqi is None:
            continue
        cat, color, _ = A.info(aqi)
        rows.append({"time": h.isoformat(), "aqi": aqi, "color": color, "category": cat,
                     "dominant": (dom or "").replace("_", "."),
                     "kind": "observed" if h <= t_last else "forecast", "_idx": idx})
    return rows, t_last


@app.get("/api/station/{sid}/hourly_aqi")
def station_hourly_aqi(sid: int):
    def _b():
        rows, _ = _station_aqi_series(sid)
        return {"station_id": sid,
                "series": [{k: v for k, v in r.items() if k != "_idx"} for r in rows]}
    return cached(f"haqi_{sid}", _b)


@app.get("/api/city/hourly_aqi")
def city_hourly_aqi():
    def _b():
        st = query("SELECT station_id FROM stations;")
        per_hour, boundary = {}, None
        for sid in st["station_id"]:
            rows, t_last = _station_aqi_series(int(sid))
            if t_last is not None:
                boundary = t_last if boundary is None else max(boundary, t_last)
            for r in rows:
                per_hour.setdefault(r["time"], []).append(r["_idx"])
        series = []
        lo = (boundary - pd.Timedelta(hours=47)) if boundary is not None else None
        hi = (boundary + pd.Timedelta(hours=24)) if boundary is not None else None
        for h in sorted(per_hour):
            if lo is not None:
                ts = pd.Timestamp(h)
                if ts < lo or ts > hi:
                    continue
            aqi, dom = A.city_aqi(per_hour[h])
            if aqi is None:
                continue
            cat, color, _ = A.info(aqi)
            kind = "observed"
            if boundary is not None and pd.Timestamp(h) > boundary:
                kind = "forecast"
            series.append({"time": h, "aqi": aqi, "color": color, "category": cat,
                           "dominant": (dom or "").replace("_", "."), "kind": kind})
        return {"series": series}
    return cached("city_haqi", _b)


# ============================================================
#  WEATHER  (latest airport / station reading)
# ============================================================
def _weather_latest(sid):
    df = query(f"""SELECT obs_time, {', '.join(WEATHER_COLS)}
                   FROM observations WHERE station_id=%s
                     AND obs_time >= now() - interval '12 hours'
                   ORDER BY obs_time DESC LIMIT 1;""", (sid,))
    if df.empty:
        return None
    r = df.iloc[0]
    def num(x):
        try:
            v = float(x); return None if pd.isna(v) else round(v, 1)
        except (TypeError, ValueError):
            return None
    return {"time": tehran_naive(pd.Series([r["obs_time"]]))[0].isoformat(),
            "temperature": num(r["temperature"]),
            "humidity": num(r["relativehumidity"]),
            "wind_speed": num(r["windspeed"]),
            "wind_deg": num(r["winddegree"]),
            "wind_dir": (None if pd.isna(r["winddirection"]) else str(r["winddirection"])),
            "pressure": num(r["pressure"]),
            "visibility": num(r["visibility"]),
            "rain": num(r["raingauge"]),
            "radiation": num(r["globalradiation"])}


@app.get("/api/weather")
def weather_airport():
    return cached("wx_airport", lambda: {"source": "airport", "station_id": AIRPORT_ID,
                                         "weather": _weather_latest(AIRPORT_ID)})


@app.get("/api/station/{sid}/weather")
def weather_station(sid: int):
    return cached(f"wx_{sid}", lambda: {"station_id": sid, "weather": _weather_latest(sid)})


FRONTEND = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend")
if os.path.isdir(FRONTEND):
    app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
