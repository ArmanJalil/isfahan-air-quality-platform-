# ML pipeline — forecast jobs and models

This document summarizes the `aqf_serving/` package. In this portfolio release
the trained weights, cached artefacts, and data panels are **not** included
(they are large and regenerable); the code and design are provided.

## Files

| File | Purpose |
|---|---|
| `predict_job.py` | hourly pollutant forecast daemon (1–24 h), writes `predictions` |
| `predict_daily_job.py` | daily official-AQI forecast daemon (1–3 days), writes `predictions_daily` |
| `pm25_raster_job.py` | hourly PM2.5 Ordinary-Kriging rasters (IDW fallback), writes `pm25_rasters` |
| `model_neural.py` | Attention Seq2Seq (LSTM encoder–decoder + attention) |
| `model_hybrid.py` | Hybrid TFT (Variable Selection Network + LSTM + attention + quantile head) |
| `model_tft.py`, `model_lightgbm.py`, `model_persistence.py`, `model_spatial.py` | additional / baseline models used during model selection |
| `aqf_common.py` | shared data prep: windowing, scaling, log-with-shift, masked losses, evaluation + artefact saving |
| `aqf_inference.py` | builds live feature panels and per-station training artefacts for inference |
| `aqi_official.py` | the official (SDRA) AQI engine — identical to the backend copy |

## Model ensemble

Final forecasts average two members per (station, pollutant):

1. **Attention Seq2Seq** — LSTM encoder–decoder with attention over the history window.
2. **Hybrid TFT** — TFT-style Variable Selection Network + LSTM encoder + interpretable
   multi-head attention + LSTMCell decoder + ordered quantile head (p10/p50/p90).

### Loss

Spike-weighted, NaN-masked **pinball** loss across the three quantiles, plus a
**physics** term on the median (in real units): non-negativity and a
per-pollutant rate-of-change limit. Masking means missing observations never
contribute to the gradient.

### Official AQI

Concentrations are aggregated per the national instruction (PM: 24 h mean;
SO2/NO2/O3-1h: max; CO/O3-8h: max of the 8 h moving average), sub-indexed with
the lower-row gap rule, combined to a station AQI (max sub-index) and a city
AQI (mean of station AQIs, majority-vote dominant pollutant).

## Regenerating artefacts

Weights and panels are produced by training each model (e.g.
`python model_hybrid.py --station 349 --pollutant PM2_5`) and by the panel
builders referenced in the forecast jobs. See the deployment `first_run.sh`
for the end-to-end seed sequence.
