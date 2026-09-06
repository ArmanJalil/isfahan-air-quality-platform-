# Isfahan Air Quality Platform

An operational, end-to-end system that monitors, forecasts, and visualizes urban air quality for the city of Isfahan, Iran. It was commissioned by the Isfahan Department of Crisis Management and delivered as a live bilingual (Persian / English) web platform.

The platform ingests hourly pollution and weather data from the municipal station network, stores it in PostgreSQL, produces 24-hour pollutant forecasts and 1-to-3-day official Air Quality Index (AQI) forecasts with a deep-learning ensemble, and serves everything through a FastAPI backend and an interactive Leaflet + Chart.js dashboard.

> **Role:** product owner and sole developer — front end, back end, database, data pipeline, and machine-learning models.

---

## What it does

- **Live monitoring** — an interactive map of every monitoring station, color-coded by the official AQI, with a sortable "worst first" station list, per-station detail pages, and current weather.
- **Forecasting** — hourly pollutant forecasts (PM2.5, PM10, CO, O3, NO2, SO2) for the next 24 hours, and official daily AQI forecasts for the next 3 days, per station and city-wide.
- **PM2.5 "movie"** — an animated kriging surface of PM2.5 across the city, blending the last 24 observed hours with the next 24 forecast hours.
- **Official AQI engine** — a single, auditable implementation of the national (SDRA) AQI instruction: correct averaging windows per pollutant, the lower-row gap rule, completeness thresholds, and the "now" weighted-concentration method.
- **Bilingual, RTL-aware UI** — full Persian/English switching with Jalali (Shamsi) calendar dates on the Tehran clock, plus health-advice banners per AQI category.

---

## Architecture

```
 upstream station API                 PostgreSQL                       browser
 (hourly pollution + weather)   ┌───────────────────────┐      ┌────────────────────┐
        │                        │  stations             │      │  Leaflet map       │
        ▼                        │  observations         │      │  Chart.js charts   │
 ┌──────────────┐   upsert       │  predictions          │◄──── │  PM2.5 animation   │
 │  collector   │──────────────► │  predictions_daily    │ HTTP │  station pages     │
 │  (daemon)    │                │  pm25_rasters         │      └─────────▲──────────┘
 └──────────────┘                └──────────▲────────────┘                │
                                            │                              │ JSON
 ┌───────────────────────────┐  write       │                   ┌─────────┴──────────┐
 │  forecast jobs (PyTorch)  │──────────────┘                   │   FastAPI (api.py) │
 │  hourly + daily ensemble  │                                  │   + static site    │
 │  PM2.5 kriging raster job │◄─────────────────────────────────┤                    │
 └───────────────────────────┘         read observations        └────────────────────┘
```

Five background services run continuously: the **collector**, the **hourly forecast**, the **daily forecast**, the **PM2.5 raster** job, and the **API + website**.

---

## Machine-learning approach

Forecasts come from an **ensemble of two sequence models**, averaged per station and pollutant:

1. **Attention Seq2Seq** — an LSTM encoder–decoder with attention over the history window.
2. **Hybrid TFT** — a Temporal-Fusion-Transformer-inspired network built natively in PyTorch, combining a Variable Selection Network (which learns *which* neighbouring stations and weather variables matter), an LSTM encoder, interpretable multi-head attention, and a quantile head (p10 / p50 / p90) with guaranteed ordering.

Both are trained with a **physics-informed, spike-weighted masked loss**: a pinball (quantile) loss that up-weights pollution spikes, plus soft physical constraints for non-negativity and a per-pollutant rate-of-change limit. Missing values are masked rather than imputed, so gaps in the station feed never leak into the loss.

The PM2.5 surface uses **Ordinary Kriging** over the station values with an IDW fallback, masked to the Isfahan city polygon.

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend / API | Python, FastAPI, Uvicorn |
| Database | PostgreSQL (TIMESTAMPTZ, UPSERT merge, spatial polygon) |
| ML | PyTorch (LSTM, attention, TFT blocks, quantile + physics loss), scikit-learn |
| Geostatistics | PyKrige (Ordinary Kriging), IDW fallback |
| Data pipeline | requests, pandas, NumPy, PyArrow |
| Frontend | Vanilla JS, Leaflet, Chart.js, SVG gauges, Vazirmatn font |
| i18n | Persian / English, RTL, Jalali calendar (Intl API) |
| Deployment | systemd services on Ubuntu, CPU-only PyTorch |

---

## Repository layout

```
backend/          FastAPI app, official-AQI engine, config (env-based)
  api.py              REST API + static-site host
  aqi_official.py     the SDRA official-AQI implementation (single source of truth)
  config.py           reads every secret from environment variables
database/         hourly data collector (daemon) -> PostgreSQL
frontend/         bilingual dashboard (index, station page, shared layer)
aqf_serving/      forecast jobs + model definitions (see docs/ML_PIPELINE.md)
deploy/           server setup + systemd service scripts
docs/             deployment and ML-pipeline notes
```

---

## Running locally

```bash
# 1. install
pip install -r requirements.txt

# 2. configure (never commit the real .env)
cp .env.example .env         # then edit with your DB + API credentials

# 3. create the database
createdb isfahan_aqm

# 4. collect some data (leave running, or run once)
python database/isfahan_pg_collector.py

# 5. start the API + website
cd backend && uvicorn api:app --reload --port 8000
# open http://127.0.0.1:8000
```

Server deployment (PostgreSQL, virtualenv, five systemd services) is documented in [`docs/DEPLOY.md`](docs/DEPLOY.md).

---

## Security notes

- **No secrets in the source tree.** Database and upstream-API credentials are read from environment variables via `backend/config.py`; `.env` is git-ignored and only `.env.example` is committed.
- Model weights, caches, data files, logs, and tunnelling binaries are excluded via `.gitignore`.
- This public version is a portfolio release; the credentials, trained weights, and the live database are not included.

---

## Author

**Arman Jalil Sargaleh** — Environmental Scientist, Remote Sensing & AI
arman.JALIL-SARGHALEH@etu.univ-amu.fr
