# -*- coding: utf-8 -*-
"""
================================================================
 Isfahan air-quality + weather -> PostgreSQL collector (daemon)
================================================================
Runs on a server. Every hour it:
  1. logs in to the upstream Isfahan air-quality API,
  2. fetches the latest weather (all stations + airport) and
     pollution (all stations) data,
  3. UPSERTs it into PostgreSQL (new rows added, duplicates skipped).

Tables (created automatically on first run):
  stations(station_id PK, name_en, name_fa, latitude, longitude)
  observations(station_id, obs_time, <weather...>, <pollutants...>,
               PRIMARY KEY(station_id, obs_time))

obs_time is stored as TIMESTAMPTZ. Incoming API timestamps are Tehran
local time; they are converted to UTC before storage.

All credentials are read from environment variables (see .env.example).

Requires:  pip install requests psycopg2-binary
Run:       python isfahan_pg_collector.py
Stop:      Ctrl+C   (or run under systemd / nohup on the server)
================================================================
"""

import os
import sys
import base64
import hashlib
import datetime
import ssl
import time
from zoneinfo import ZoneInfo

import requests
import urllib3
from requests.adapters import HTTPAdapter
import psycopg2
import psycopg2.extras

# make backend/config.py importable regardless of the working directory
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))
from config import PG, UPSTREAM, TZ, AIRPORT_ID  # noqa: E402

urllib3.disable_warnings()

# ============================================================
#  API + SCHEDULE CONFIG (credentials come from config/env)
# ============================================================
USERNAME       = UPSTREAM["username"]
PASSWORD       = UPSTREAM["password"]
BASE_URL       = UPSTREAM["base_url"]
STATE_ID       = UPSTREAM["state_id"]
TZ_TEHRAN      = ZoneInfo(TZ)

POLL_MINUTES   = 60
LOOKBACK_HOURS = 6
MAX_TRIES      = 5
RETRY_WAIT     = 2
POLITE_PAUSE   = 0.5

WEATHER_COLS = ["WindSpeed", "WindDegree", "WindDirection", "Temperature",
                "RelativeHumidity", "DewpointTemperature", "Pressure",
                "Visibility", "RainGauge", "GlobalRadiation"]
POLLUTANT_COLS = ["CO", "O3", "NO", "NO2", "NOx", "SO2", "PM10", "PM2_5"]


# ============================================================
#  LEGACY TLS SESSION (upstream needs old TLS + browser UA)
# ============================================================
def _ctx():
    c = ssl.create_default_context()
    c.minimum_version = ssl.TLSVersion.TLSv1_2
    c.set_ciphers("DEFAULT@SECLEVEL=0")
    c.options |= getattr(ssl, "OP_LEGACY_SERVER_CONNECT", 0x04)
    c.check_hostname = False
    c.verify_mode = ssl.CERT_NONE
    return c


class LegacyTLSAdapter(HTTPAdapter):
    def init_poolmanager(self, *a, **k):
        k["ssl_context"] = _ctx()
        return super().init_poolmanager(*a, **k)

    def proxy_manager_for(self, *a, **k):
        k["ssl_context"] = _ctx()
        return super().proxy_manager_for(*a, **k)


def make_session():
    s = requests.Session()
    s.mount("https://", LegacyTLSAdapter())
    s.headers.update({"User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")})
    s.verify = False
    return s


SESSION = make_session()


def req(method, url, **kw):
    global SESSION
    kw.setdefault("timeout", 30)
    last = None
    for _ in range(MAX_TRIES):
        try:
            r = SESSION.request(method, url, **kw)
            if r.status_code == 403:
                last = "403"
                SESSION = make_session()
                time.sleep(RETRY_WAIT)
                continue
            return r
        except requests.exceptions.RequestException as e:
            last = type(e).__name__
            SESSION = make_session()
            time.sleep(RETRY_WAIT)
    raise RuntimeError(f"request failed after {MAX_TRIES} tries ({last})")


def safe_list(r, key):
    try:
        data = (r.json().get("Data") or {})
        return data.get(key) or []
    except Exception:
        return []


# ============================================================
#  API CALLS
# ============================================================
def get_token():
    now = datetime.datetime.now(TZ_TEHRAN)
    key = now.strftime("%A") + str(
        (now.year - 374) * 2 + (now.month ** 2) * 3 + (now.day ** 3))
    r = req("POST", f"{BASE_URL}/api/login/",
            headers={"Accept": "application/json",
                     "Content-Type": "application/x-www-form-urlencoded"},
            data={"grant_type": "password", "username": USERNAME,
                  "password": PASSWORD, "culture": "fa-IR",
                  "CaptchaId": base64.b64encode(b"WebService").decode(),
                  "UserEnteredCaptchaCode": hashlib.md5(key.encode()).hexdigest()})
    r.raise_for_status()
    return r.json()["access_token"]


def fetch_stations(token):
    r = req("GET", f"{BASE_URL}/api/v2/Station/GetByStateId",
            headers={"Authorization": f"Bearer {token}"},
            params={"StateId": STATE_ID})
    r.raise_for_status()
    return r.json()


def fetch_weather(token, from_d, to_d, station_ids=""):
    r = req("GET", f"{BASE_URL}/api/Weather/GetData",
            headers={"Authorization": f"Bearer {token}"},
            params={"stationIds": station_ids, "fromDate": from_d,
                    "toDate": to_d, "showEmptyRecords": "false",
                    "sortOrder": "asc", "Take": 1000, "Skip": 0})
    return safe_list(r, "StationWeatherDataViewModels")


def fetch_pollution(token, station_id, from_d, to_d):
    r = req("GET", f"{BASE_URL}/api/v1/GetDataHourly/Get",
            headers={"Authorization": f"Bearer {token}"},
            params={"stationId": station_id, "fromDate": from_d, "toDate": to_d})
    return safe_list(r, "GasDataViewModels")


# ============================================================
#  DATABASE
# ============================================================
def db_connect():
    return psycopg2.connect(**PG)


def db_init(conn):
    weather_ddl = ",\n            ".join(
        f'"{c.lower()}" REAL' if c != "WindDirection" else '"winddirection" TEXT'
        for c in WEATHER_COLS)
    pollutant_ddl = ",\n            ".join(f'"{c.lower()}" REAL'
                                           for c in POLLUTANT_COLS)
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS stations (
                station_id INT PRIMARY KEY,
                name_en    TEXT,
                name_fa    TEXT,
                latitude   DOUBLE PRECISION,
                longitude  DOUBLE PRECISION
            );
        """)
        cur.execute(f"""
            CREATE TABLE IF NOT EXISTS observations (
                station_id INT NOT NULL,
                obs_time   TIMESTAMPTZ NOT NULL,
                {weather_ddl},
                {pollutant_ddl},
                updated_at TIMESTAMPTZ DEFAULT now(),
                PRIMARY KEY (station_id, obs_time)
            );
        """)
        cur.execute("""CREATE INDEX IF NOT EXISTS idx_obs_time
                       ON observations(obs_time);""")
    conn.commit()


def tehran_to_utc(date_str):
    dt = datetime.datetime.fromisoformat(date_str).replace(tzinfo=TZ_TEHRAN)
    return dt.astimezone(datetime.timezone.utc)


def upsert_stations(conn, stations):
    rows = [(s["StationId"], s.get("StationName_En"), s.get("StationName_Fa"),
             s.get("Latitude"), s.get("Longitude")) for s in stations]
    with conn.cursor() as cur:
        psycopg2.extras.execute_values(cur, """
            INSERT INTO stations (station_id, name_en, name_fa, latitude, longitude)
            VALUES %s
            ON CONFLICT (station_id) DO UPDATE
              SET name_en = EXCLUDED.name_en,
                  name_fa = EXCLUDED.name_fa,
                  latitude = EXCLUDED.latitude,
                  longitude = EXCLUDED.longitude;
        """, rows)
    conn.commit()


def upsert_observations(conn, records, source):
    """source = 'weather' or 'pollution'. ON CONFLICT merge combines weather
    and pollution for the same (station, hour) without overwriting with nulls."""
    cols = WEATHER_COLS if source == "weather" else POLLUTANT_COLS
    db_cols = [c.lower() for c in cols]

    rows = []
    for rec in records:
        if not rec.get("Date") or rec.get("StationId") in (None, 0):
            continue
        obs_time = tehran_to_utc(rec["Date"])
        vals = [rec.get(c) for c in cols]
        rows.append((rec["StationId"], obs_time, *vals))
    if not rows:
        return 0

    dedup = {}
    for row in rows:
        dedup[(row[0], row[1])] = row
    rows = list(dedup.values())

    col_list = ", ".join(["station_id", "obs_time"] + db_cols)
    updates = ", ".join(
        f'"{c}" = COALESCE(EXCLUDED."{c}", observations."{c}")'
        for c in db_cols)

    with conn.cursor() as cur:
        psycopg2.extras.execute_values(cur, f"""
            INSERT INTO observations ({col_list})
            VALUES %s
            ON CONFLICT (station_id, obs_time) DO UPDATE
              SET {updates}, updated_at = now();
        """, rows)
    conn.commit()
    return len(rows)


# ============================================================
#  ONE COLLECTION CYCLE
# ============================================================
def run_cycle(conn):
    stamp = datetime.datetime.now(TZ_TEHRAN).strftime("%Y-%m-%d %H:%M")
    print(f"\n[{stamp}] cycle start")

    token = get_token()
    stations = fetch_stations(token)
    upsert_stations(conn, stations)

    now = datetime.datetime.now(TZ_TEHRAN).replace(minute=0, second=0, microsecond=0)
    fmt = "%Y-%m-%d %H:00"
    from_d = (now - datetime.timedelta(hours=LOOKBACK_HOURS)).strftime(fmt)
    to_d = now.strftime(fmt)

    w = fetch_weather(token, from_d, to_d, "")
    time.sleep(POLITE_PAUSE)
    w += fetch_weather(token, from_d, to_d, str(AIRPORT_ID))
    n_w = upsert_observations(conn, w, "weather")

    n_p = 0
    for st in stations:
        recs = fetch_pollution(token, st["StationId"], from_d, to_d)
        n_p += upsert_observations(conn, recs, "pollution")
        time.sleep(POLITE_PAUSE)

    print(f"[{stamp}] upserted  weather={n_w}  pollution={n_p} rows "
          f"(window {from_d} .. {to_d} Tehran)")


# ============================================================
#  MAIN LOOP
# ============================================================
if __name__ == "__main__":
    conn = db_connect()
    db_init(conn)
    print(f"Connected to PostgreSQL '{PG['dbname']}'. "
          f"Polling every {POLL_MINUTES} min. Ctrl+C to stop.")

    while True:
        try:
            if conn.closed:
                conn = db_connect()
            run_cycle(conn)
        except KeyboardInterrupt:
            print("\nStopped by user.")
            break
        except Exception as e:
            print(f"  cycle error: {type(e).__name__}: {e}")
            try:
                conn.rollback()
            except Exception:
                pass
        time.sleep(POLL_MINUTES * 60)
