#!/usr/bin/env bash
# ================================================================
#  first_run.sh  -  seed the database and produce a first set of forecasts
#  Run once, AFTER setup_server.sh:   bash deploy/first_run.sh
# ================================================================
set -e
HERE="$(cd "$(dirname "$0")/.." && pwd)"
PY="$HERE/venv/bin/python"

echo ">>> [1/5] backfill last 30 days of observations"
cd "$HERE/database" && "$PY" backfill.py --hours 720

echo ">>> [2/5] one hourly forecast cycle (pollutants, 1-24h)"
cd "$HERE/aqf_serving" && "$PY" predict_job.py --once

echo ">>> [3/5] one daily forecast cycle (official AQI, 1-3 days)"
cd "$HERE/aqf_serving" && "$PY" predict_daily_job.py --reset --once

echo ">>> [4/5] build the PM2.5 kriging movie frames"
cd "$HERE/aqf_serving" && "$PY" pm25_raster_job.py --once

echo ">>> [5/5] verify what landed in the database"
cd "$HERE/aqf_serving" && "$PY" check_db.py --station 349

echo ""
echo ">>> If the checks show rows, install the 24/7 services:"
echo "    sudo bash deploy/install_services.sh"
