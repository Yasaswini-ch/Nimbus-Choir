# training

Builds the five-class cloud-type classifier (cirrus, cumulus, stratus, cumulonimbus, clear) that ships to `/web` as a quantized ONNX model.

## Why this isn't a straight Gemma fine-tune
Tinker has no Gemma models, and no "Gemma vision model" exists to fine-tune in the first place. Tinker's vision-capable base models (Inkling, Inkling-Small, Qwen3.8-27B, Qwen3.6-35B-A3B, Qwen3.5-397B-A17B) are all far too large to ever run in a phone browser. So the pipeline instead:

1. LoRA fine-tunes `Qwen/Qwen3.6-35B-A3B-Instruct` via Tinker as a **teacher** classifier (cheapest current vision option on Tinker).
2. Samples the teacher over the training set to get soft labels.
3. Distills those soft labels, blended with the real CCSN ground truth, into a tiny **student**: a frozen open-weight DINOv2 backbone + a small trainable head. The student is what gets exported to ONNX and is the only thing that ever runs on-device.

## Pipeline
| script | what it does | touches Tinker (costs money)? |
|---|---|---|
| `download_data.py` | fetch CCSN, map its 11 WMO genus labels onto our 5 classes, merge `/data/extra/<label>/`, print dataset license | no |
| `prep.py` | dedupe, resize, stratified 80/10/10 split, write `manifest.csv`, generate augmented train copies (haze, sunset/sunrise tint, brightness/contrast, crop, phone blur/noise) | no |
| `train_teacher.py` | LoRA fine-tune the Tinker teacher | **yes** — dry-run by default, prints a cost estimate, needs `--yes-spend-credits` |
| `distill.py` | sample the teacher over the train set for soft labels | **yes** — same gate |
| `train_student.py` | train the DINOv2 + head student locally on ground truth + soft labels | no |
| `eval.py` | confusion matrix + 20 worst errors on the test split, for the student | no |
| `export.py` | export backbone + head to quantized ONNX for `onnxruntime-web` | no |

## CCSN → 5-class mapping
See `common/labels.py`. Ac and As (mid-level clouds) are the noisiest part of the mapping (Ac→cumulus, As→stratus, by shape); Ct (contrails) is folded into cirrus as the closest visual family. CCSN has **no clear-sky genus** — `download_data.py` warns if `/data/extra/clear/` is empty; you'll need to supply a small public clear-sky set or crops from your own sunny test photos before training.

## Before spending Tinker credits
`train_teacher.py` and `distill.py` always print their planned API calls and a token/cost estimate first and require `--yes-spend-credits` to actually run. Re-check current rates at the [Tinker models & pricing page](https://tinker-docs.thinkingmachines.ai/tinker/models/) before a real run — they change.

## Known gaps to verify against Tinker's own docs before a real run
The exact shape of a vision input (how an image attaches to a text prompt in a Tinker training datum / sampling call) wasn't fully detailed in the docs pages read while planning this — Tinker's "rendering" tutorial covers it. `train_teacher.py` and `distill.py` flag the relevant lines with `NOTE:` comments.
