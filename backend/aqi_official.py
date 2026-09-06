# -*- coding: utf-8 -*-
"""
================================================================
 aqi_official.py  -  OFFICIAL AQI per the SDRA instruction (jadval)
================================================================
Single source of truth, used by: daily panel builder, predict job, API.

Daily concentrations (24h window ending 11:00 Tehran, >=18 valid hours):
  PM2_5, PM10 : mean of hourly
  SO2, NO2, O3_1 : max of hourly
  CO, O3_8    : max of 8h moving average (each 8h window needs >=6 valid)
O3 station index = max(O3_1 index, O3_8 index).
Station AQI = MAX of pollutant indices (dominant recorded).
City: per pollutant, MEAN of that pollutant's index across stations ->
      city AQI = MAX of those means.
Gap rule (official #5): concentration between rows -> the LOWER row's max
index. Below O3_1's first row -> undefined (None). Above top row -> 500.
Units: CO ppm, SO2/NO2/O3 ppb, PM ug/m3.
================================================================
"""
import math

PSI = [(0, 50), (51, 100), (101, 150), (151, 200), (201, 300), (301, 400), (401, 500)]

BP = {
    "CO":    [(0, 4.4), (4.5, 9.4), (9.5, 12.4), (12.5, 15.4), (15.5, 30.4), (30.5, 40.4), (40.5, 50.4)],
    "O3_1":  [None, None, (125, 164), (165, 204), (205, 404), (405, 504), (505, 604)],
    "O3_8":  [(0, 54), (55, 70), (71, 85), (86, 105), (106, 200), None, None],
    "NO2":   [(0, 53), (54, 100), (101, 360), (361, 649), (650, 1249), (1250, 1649), (1650, 2040)],
    "SO2":   [(0, 35), (36, 75), (76, 185), (186, 304), (305, 604), (605, 804), (805, 1004)],
    "PM10":  [(0, 54), (55, 154), (155, 254), (255, 354), (355, 424), (425, 504), (505, 604)],
    "PM2_5": [(0, 12), (12.1, 35.4), (35.5, 55.4), (55.5, 150.4), (150.5, 250.4), (250.5, 350.4), (350.5, 500.4)],
}

TARGETS = ["PM2_5", "PM10", "SO2", "NO2", "O3_1", "O3_8", "CO"]

AQI_CATEGORIES = [(0, 50, "Good"), (51, 100, "Moderate"),
                  (101, 150, "Unhealthy for Sensitive"), (151, 200, "Unhealthy"),
                  (201, 300, "Very Unhealthy"), (301, 500, "Hazardous")]
AQI_COLORS = {
    "Good":                    {"color": "#00E400", "name_fa": "\u062e\u0648\u0628"},
    "Moderate":                {"color": "#FFFF00", "name_fa": "\u0645\u062a\u0648\u0633\u0637"},
    "Unhealthy for Sensitive": {"color": "#FF7E00", "name_fa": "\u0646\u0627\u0633\u0627\u0644\u0645 \u0628\u0631\u0627\u06cc \u06af\u0631\u0648\u0647\u200c\u0647\u0627\u06cc \u062d\u0633\u0627\u0633"},
    "Unhealthy":               {"color": "#FF0000", "name_fa": "\u0646\u0627\u0633\u0627\u0644\u0645"},
    "Very Unhealthy":          {"color": "#8F3F97", "name_fa": "\u062e\u06cc\u0644\u06cc \u0646\u0627\u0633\u0627\u0644\u0645"},
    "Hazardous":               {"color": "#7E0023", "name_fa": "\u062e\u0637\u0631\u0646\u0627\u06a9"},
}


def now_weighted_conc(vals):
    """SDRA 'now' (ham-aknoon) weighted concentration.
    vals: hourly averages for the last (up to) 12 hours, OLDEST -> NEWEST.
    Rule: valid only if >= 2 of the 3 hours ending at the current hour present.
    w = 1 - (max - min)/max over the 12 hours; floored at 0.5.
    C = sum(w**offset * c) / sum(w**offset), offset 0 = current hour."""
    v = list(vals)[-12:]
    n = len(v)
    def ok(x):
        if x is None:
            return False
        try:
            return not math.isnan(float(x))
        except (TypeError, ValueError):
            return False
    last3 = v[-3:]
    if sum(1 for x in last3 if ok(x)) < 2:
        return None
    pairs = []
    for k, x in enumerate(v):
        if not ok(x):
            continue
        pairs.append((max(float(x), 0.0), (n - 1) - k))
    if not pairs:
        return None
    cs = [c for c, _ in pairs]
    cmax, cmin = max(cs), min(cs)
    w = 0.5 if cmax <= 0 else 1.0 - (cmax - cmin) / cmax
    if w < 0.5:
        w = 0.5
    num = sum(c * (w ** e) for c, e in pairs)
    den = sum(w ** e for _, e in pairs)
    return (num / den) if den > 0 else None


def sub_index(pollutant, c):
    """Official sub-index. Gap -> lower row's max index. None if undefined."""
    if pollutant not in BP or c is None:
        return None
    try:
        c = float(c)
    except (TypeError, ValueError):
        return None
    if math.isnan(c):
        return None
    c = max(c, 0.0)
    rows = BP[pollutant]
    prev_ihigh = None
    for (ilo, ihi), row in zip(PSI, rows):
        if row is None:
            continue
        clo, chi = row
        if c < clo:
            return prev_ihigh
        if c <= chi:
            return int(round((ihi - ilo) / (chi - clo) * (c - clo) + ilo))
        prev_ihigh = ihi
    return 500


def station_indices(concs):
    """concs: {target: value}. Returns {display_pollutant: index}
    where O3 = max(O3_1, O3_8)."""
    idx = {}
    for p in ["PM2_5", "PM10", "SO2", "NO2", "CO"]:
        s = sub_index(p, concs.get(p))
        if s is not None:
            idx[p] = s
    o3 = [s for s in (sub_index("O3_1", concs.get("O3_1")),
                      sub_index("O3_8", concs.get("O3_8"))) if s is not None]
    if o3:
        idx["O3"] = max(o3)
    return idx


def station_aqi(concs):
    """(aqi, dominant) = MAX of pollutant indices."""
    idx = station_indices(concs)
    if not idx:
        return None, None
    dom = max(idx, key=idx.get)
    return int(idx[dom]), dom


def _norm_dom(x):
    if not x:
        return None
    x = str(x)
    return "O3" if x.upper().startswith("O3") else x


def city_aqi(per_station_indices):
    """City AQI = AVERAGE of per-station AQIs (each = MAX of its sub-indices).
    Dominant = pollutant dominant in the most stations (majority vote)."""
    from collections import Counter
    aqis, doms = [], []
    for d in per_station_indices:
        if not d:
            continue
        dom = max(d, key=d.get)
        aqis.append(d[dom])
        doms.append(_norm_dom(dom))
    if not aqis:
        return None, None
    city = int(round(sum(aqis) / len(aqis)))
    dom = Counter(doms).most_common(1)[0][0] if doms else None
    return city, dom


def category(aqi):
    if aqi is None:
        return None
    for lo, hi, name in AQI_CATEGORIES:
        if lo <= aqi <= hi:
            return name
    return "Hazardous"


def info(aqi):
    cat = category(aqi)
    if cat is None:
        return None, "#9e9e9e", None
    c = AQI_COLORS[cat]
    return cat, c["color"], c["name_fa"]


UNIT_SANITY = {"CO": (0, 60, "ppm"), "SO2": (0, 1200, "ppb"), "NO2": (0, 2500, "ppb"),
               "O3": (0, 700, "ppb"), "PM10": (0, 1500, "ug/m3"), "PM2_5": (0, 800, "ug/m3")}
