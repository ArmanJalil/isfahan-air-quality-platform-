# Deploying the Isfahan Air-Quality system (Ubuntu server)

This runs everything that powers the website:
- **collector** – pulls new pollution + weather into PostgreSQL every hour
- **hourly forecast** – ensemble model, 1–24 h pollutant forecasts
- **daily forecast** – official AQI, 1–3 days ahead
- **raster job** – the PM2.5 kriging "movie" frames
- **API + website** – FastAPI serving the map/pages

> Replace `<SERVER-IP>`, `<USER>`, and the deploy path with your own values.
> All credentials live in the `.env` file (see `.env.example`), never in code.

---

## Requirements
- Ubuntu 22.04 / 24.04
- PostgreSQL
- Python 3.9+ with a virtual environment (PyTorch CPU build, FastAPI, uvicorn,
  psycopg2, pandas, numpy, scikit-learn, pyarrow, pykrige, scipy, requests,
  matplotlib)
- ~2 GB free disk (PyTorch is the largest dependency)

---

## Step 1 — copy the project to the server
Copy the repository to your deploy directory, e.g. `/home/<USER>/aqf`, so it
contains: `aqf_serving/ backend/ database/ frontend/ deploy/ docs/`.

## Step 2 — install everything
```bash
cd /home/<USER>/aqf
bash deploy/setup_server.sh
```
This installs PostgreSQL, creates the `isfahan_aqm` database, builds the Python
environment, and installs all packages. The database password is taken from
your environment, not hard-coded.

## Step 3 — configure credentials
```bash
cp .env.example .env      # then edit with your DB + upstream-API credentials
```

## Step 4 — seed the database + first forecasts
```bash
bash deploy/first_run.sh
```
Backfills ~30 days of data, runs one hourly and one daily forecast, builds the
map movie, and prints a verification table.

## Step 5 — turn on the 24/7 services
```bash
sudo bash deploy/install_services.sh
```
Registers five systemd services that auto-start on boot and restart on failure:
`aqf-collector, aqf-predict-hourly, aqf-predict-daily, aqf-raster, aqf-api`.

Check any of them:
```bash
systemctl status aqf-api
journalctl -u aqf-predict-daily -n 40
```

## Step 6 — open the website
The API + site run on **port 8000**: `http://<SERVER-IP>:8000/`
(open port 8000 in your firewall for the intended audience).

To serve it on a normal domain, put Nginx in front of `127.0.0.1:8000`. If you
serve it somewhere other than `:8000`, set the API base in `frontend/common.js`
accordingly.

---

## Everyday operations
- Restart a service:   `sudo systemctl restart aqf-api`
- Inspect the DB:      `cd aqf_serving && ../venv/bin/python check_db.py`
- Update models:       replace files under `aqf_serving/models` and
  `aqf_serving/outputs`, then restart the predict services.

## Troubleshooting
- `systemctl status <service>` shows the error.
- Most failures are (a) the database credentials in `.env`, or (b) the server
  cannot reach the upstream API. The collector log shows which.
- Re-running any `deploy/*.sh` script is safe.
