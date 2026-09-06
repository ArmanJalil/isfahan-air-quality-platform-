# -*- coding: utf-8 -*-
"""
config.py - central configuration for the Isfahan Air Quality platform.

Every secret (database password, upstream API credentials, host names)
is read from environment variables so that nothing sensitive lives in
the source tree. Copy `.env.example` to `.env`, fill in your own values,
and load it (e.g. with `python-dotenv` or your process manager).
"""

import os


def _get(name, default=None, required=False):
    val = os.environ.get(name, default)
    if required and not val:
        raise RuntimeError(
            f"Missing required environment variable: {name}. "
            f"See .env.example."
        )
    return val


# ---- PostgreSQL -------------------------------------------------------
PG = dict(
    host=_get("PG_HOST", "localhost"),
    port=int(_get("PG_PORT", "5432")),
    dbname=_get("PG_DBNAME", "isfahan_aqm"),
    user=_get("PG_USER", "postgres"),
    password=_get("PG_PASSWORD", required=True),
)

# ---- Upstream Isfahan air-quality API ---------------------------------
UPSTREAM = dict(
    base_url=_get("AQ_API_BASE_URL", "https://aqm.isfahan.ir/Service"),
    username=_get("AQ_API_USERNAME", required=True),
    password=_get("AQ_API_PASSWORD", required=True),
    state_id=int(_get("AQ_API_STATE_ID", "6")),
)

# ---- Misc -------------------------------------------------------------
TZ = _get("APP_TZ", "Asia/Tehran")
AIRPORT_ID = int(_get("AIRPORT_STATION_ID", "361"))
