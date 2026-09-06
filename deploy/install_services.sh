#!/usr/bin/env bash
# ================================================================
#  install_services.sh  -  register the 5 background services (systemd)
#  Run with sudo, from the repo root:  sudo bash deploy/install_services.sh
#  Auto-detects the repo path and the Linux user, so no editing needed.
# ================================================================
set -e
HERE="$(cd "$(dirname "$0")/.." && pwd)"
RUNUSER="${SUDO_USER:-$(whoami)}"
PY="$HERE/venv/bin/python"
UVICORN="$HERE/venv/bin/uvicorn"
echo ">>> repo=$HERE  user=$RUNUSER"

mk() {  # mk <name> <workdir> <execstart> <description>
  cat > "/etc/systemd/system/$1.service" <<UNIT
[Unit]
Description=$4
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
User=$RUNUSER
WorkingDirectory=$2
ExecStart=$3
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
UNIT
  echo "   wrote /etc/systemd/system/$1.service"
}

mk aqf-collector      "$HERE/database"    "$PY isfahan_pg_collector.py" "Isfahan AQ - hourly data collector"
mk aqf-predict-hourly "$HERE/aqf_serving" "$PY predict_job.py"          "Isfahan AQ - hourly pollutant forecasts"
mk aqf-predict-daily  "$HERE/aqf_serving" "$PY predict_daily_job.py"    "Isfahan AQ - daily AQI forecasts"
mk aqf-raster         "$HERE/aqf_serving" "$PY pm25_raster_job.py"      "Isfahan AQ - PM2.5 kriging rasters"
mk aqf-api            "$HERE/backend"     "$UVICORN api:app --host 0.0.0.0 --port 8000" "Isfahan AQ - FastAPI + website"

systemctl daemon-reload
for s in aqf-collector aqf-predict-hourly aqf-predict-daily aqf-raster aqf-api; do
  systemctl enable "$s"
  systemctl restart "$s"
done
echo ""
echo ">>> services started. Check any with:  systemctl status aqf-api"
echo ">>> website:  http://<SERVER-IP>:8000/     (open port 8000 in your firewall)"
