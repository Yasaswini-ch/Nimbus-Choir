# Nimbus Choir

Nimbus Choir turns live sky video into a soft, whimsical ambient piece where
every detected cloud hums a pad and drops chimes as it drifts. Cloud type
picks the timbre, size picks volume, height picks pitch, horizontal position
picks stereo pan. The piece's consonance reflects a short-term weather
forecast (the "tension" value).

## Sound direction
Dreamy, glassy, music-box, wind-chime. NOT robotic and NOT vowel or choir
synthesis.

## Visual direction
Dreamy and soft. Pastel dusk gradient sky, glass-like panels, light italic
serif display type.

## Core constraints
The main sky-camera mode runs offline on a phone browser after load,
open-weight models only, no photos or GPS leave the device. An optional
"Earth mode" (satellite imagery) may use the network, and must be clearly
marked as online.

## Repo structure
- `/training` (Python) — cloud-type classifier fine-tuning
- `/forecast` (Python) — tension predictor
- `/web` (vanilla JS + Vite) — camera pipeline, UI, sound engine
- `/firmware` (Arduino) — optional sensor node
- `/server` (FastAPI) — forecast serving, Earth-mode proxy
- `/docs` — demo page, debug output, write-up

## Style
Small files, typed Python, comments only where non-obvious, a README
section per module. Commit after every working step.
