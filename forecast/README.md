# forecast

Trains the "tension" predictor (0-1) that drives the sound engine's
consonance/dissonance via `engine.setTension()`, using TabPFN on public
Open-Meteo reanalysis data.

## Pipeline
| script | what it does |
|---|---|
| `config.py` | ~40 fixed lat/lon locations across climates, date range, label thresholds |
| `build_dataset.py` | one Open-Meteo historical-archive call per location, computes `pressure_trend_3h` and the label, balances and writes `data/dataset.csv` |
| `features.py` | shared camera-type -> cloud-cover-band feature bridge, used by both training (documented here) and the live `/predict` path, so they can never drift apart |
| `train.py` | fits TabPFN, evaluates **held out by location** (not random rows -- a model that's only seen Berlin and gets tested on more Berlin rows isn't proving it generalizes), saves a calibration plot and the deployed model |
| `predict.py` | loads the saved model, exposes `predict_tension()` for `/server`'s FastAPI endpoint |

## Be honest about what this is
- **Reanalysis data, not station observations.** Open-Meteo's historical archive is modeled/interpolated weather, not raw instrument readings. It's good enough for a mood dial, not a real forecast.
- **The camera-to-feature mapping is a rough proxy**, documented in `features.py`: the live app only ever sees camera-detected cloud *types* (cirrus/cumulus/stratus/cumulonimbus), never the altitude-banded cloud-cover percentages TabPFN trained on. One cirrus patch in frame doesn't mean "40% high cloud cover" the way the training data means it.
- **Expected accuracy is modest.** Held-out-by-location accuracy and the calibration plot (`model/calibration.png`) are the honest numbers to quote -- don't round up.
- Label is "rain or a pressure drop of 3 hPa or more within the next 6h," not "it will definitely rain."

## Data license
Open-Meteo's historical archive data is CC BY 4.0 (reuse with attribution). The free API tier is restricted to non-commercial use -- fine for this project; re-check [open-meteo.com/en/terms](https://open-meteo.com/en/terms) before any commercial reuse.

## TabPFN setup
`pip install tabpfn`. First run needs a one-time browser login or a `TABPFN_TOKEN` env var to download the model weights (open, non-commercially-licensed). After that it runs fully locally and offline -- no per-call cost, unlike Tinker in `/training`.

## Optional: upwind_cloud_cover
A feature slot for Earth-mode satellite data (Prompt 9) is left for later -- not implemented here, since Earth mode doesn't exist yet.
