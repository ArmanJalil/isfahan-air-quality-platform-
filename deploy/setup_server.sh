#!/usr/bin/env bash
# ================================================================
#  setup_server.sh  -  one-shot server setup for the Isfahan AQ system
#  Run it from the repo root:   bash deploy/setup_server.sh
#  Credentials are read from .env — never hard-coded here.
# ================================================================
set -e
HERE="$(cd "$(dirname "$0")/.." && pwd)"
echo ">>> repo root: $HERE"

# load .env if present (for PG_PASSWORD / PG_DBNAME)
if [ -f "$HERE/.env" ]; then set -a; . "$HERE/.env"; set +a; fi
: "${PG_PASSWORD:?Set PG_PASSWORD in .env before running}"
: "${PG_DBNAME:=isfahan_aqm}"

echo ">>> [1/5] system packages (python venv + PostgreSQL)"
sudo apt update
sudo apt install -y python3-venv python3-pip postgresql postgresql-contrib

echo ">>> [2/5] PostgreSQL database + password (from .env)"
sudo -u postgres psql -c "ALTER USER postgres PASSWORD '${PG_PASSWORD}';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${PG_DBNAME}';" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE ${PG_DBNAME};"

echo ">>> [3/5] Python virtual environment"
python3 -m venv "$HERE/venv"
"$HERE/venv/bin/pip" install --upgrade pip

echo ">>> [4/5] PyTorch (CPU-only build, smaller)"
"$HERE/venv/bin/pip" install torch --index-url https://download.pytorch.org/whl/cpu

echo ">>> [5/5] remaining Python packages"
"$HERE/venv/bin/pip" install -r "$HERE/deploy/requirements-server.txt"

echo ""
echo ">>> DONE. Next:"
echo "    1) bash deploy/first_run.sh"
echo "    2) sudo bash deploy/install_services.sh"
