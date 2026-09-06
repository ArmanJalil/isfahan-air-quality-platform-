# aqf_serving — forecast jobs & models

This package holds the forecasting pipeline (hourly + daily ensemble models,
the PM2.5 kriging raster job, shared data-prep utilities, and the model
definitions). See [`../docs/ML_PIPELINE.md`](../docs/ML_PIPELINE.md) for a full
description of every file, the model ensemble, and the loss design.

**Not included in this public release:**

- Trained model weights (`*.pth`), artefact caches (`*.pkl`), and data panels
  (`*.parquet`) — these are large and regenerable, and are git-ignored.
- The live database contents.

The two headline model definitions, `model_hybrid.py` (Hybrid TFT) and
`model_neural.py` (Attention Seq2Seq), together with the official-AQI engine
`aqi_official.py` (shared with the backend), capture the core technical
contribution. Credentials in every job are read from the environment via
`backend/config.py`, exactly like the API and collector.
