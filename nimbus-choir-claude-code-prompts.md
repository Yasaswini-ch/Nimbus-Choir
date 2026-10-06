# Nimbus Choir: Claude Code Prompt Pack

Run the prompts in order, one per Claude Code session. Use plan mode and approve each plan before it writes code.

**Before you start**
- Download the demo page from the artifact and save it as `/docs/nimbus-choir-demo.html` in the repo. Prompts 2 and 3 point Claude Code at it for the exact sound engine, CSS tokens, and sky rendering.
- Tell Claude Code to read current docs for Tinker, TabPFN, ElevenLabs, and NASA GIBS instead of guessing their APIs.
- Test on a real sky early. Threshold segmentation breaks on haze, gray overcast, and sunsets, which is why Prompt 2 includes a sky mask and patch mode, and Prompt 2b checks them against real photos.
- Put your five test photos in `/data/test/` as storm_1.jpg, storm_2.jpg, overcast_hills.jpg, sunny_cumulus_1.jpg, sunny_cumulus_2.jpg before running Prompt 2b.
- One of your sea photos has people's faces in it. Keep it as a local test image, and crop or skip it if you show screenshots in your DEV post.
- Everything trains on public data, so you don't need to collect anything. If you do snap a few sky photos outside, the classifier prompt can merge them in, but it's optional.

---

## Prompt 0: Project context

```
Create the repo "nimbus-choir" with a CLAUDE.md and this structure:
/training (Python), /forecast (Python), /web (vanilla JS + Vite),
/firmware (Arduino), /server (FastAPI), /docs.

CLAUDE.md must say: Nimbus Choir turns live sky video into a soft,
whimsical ambient piece where every detected cloud hums a pad and drops
chimes as it drifts. Cloud type picks the timbre, size picks volume,
height picks pitch, horizontal position picks stereo pan. The piece's
consonance reflects a short-term weather forecast (the "tension" value).

Sound direction: dreamy, glassy, music-box, wind-chime. NOT robotic and
NOT vowel or choir synthesis.

Visual direction: dreamy and soft. Pastel dusk gradient sky, glass-like
panels, light italic serif display type.

Core constraints: the main sky-camera mode runs offline on a phone
browser after load, open-weight models only, no photos or GPS leave the
device. An optional "Earth mode" (satellite imagery) may use the
network, and must be clearly marked as online.

Style: small files, typed Python, comments only where non-obvious, a
README section per module. Commit after every working step.

Do not write code yet. Propose the plan and wait for my approval.
```

---

## Prompt 1: Cloud type fine-tune (Tinker + Gemma)

```
In /training, build a pipeline to fine-tune an open-weight Gemma vision
model with Tinker as a cloud-type classifier (cirrus, cumulus, stratus,
cumulonimbus, clear).

First read the current Tinker docs and tell me the actual API before
coding. Then:

1. download_data.py: fetch the public CCSN dataset (and SWIMSEG if
   useful). Map CCSN's finer-grained labels onto our five classes and
   document the mapping. I have no photos of my own, so use public data
   only; if a /data/extra/<label>/ folder happens to exist, merge it in.
   Print each dataset's license; warn if redistribution is restricted.
2. prep.py: dedupe, resize, stratified 80/10/10 split, write manifests.
   Add training augmentation for real-world robustness: haze, sunset and
   sunrise color tints, brightness and contrast shifts, random crops, and
   phone-style blur and noise.
3. train.py: LoRA fine-tune via Tinker, config in YAML, logs loss and
   per-class accuracy each epoch, saves the adapter.
4. eval.py: confusion matrix PNG and a list of the 20 worst errors.
5. export.py: export a small quantized version for in-browser inference
   (ONNX). If Gemma is too heavy for a phone, distill into a small head
   on frozen DINOv2 embeddings and explain the tradeoff.

Ask me before spending any credits. Add a --dry-run flag.
```

---

## Prompt 2: Camera pipeline and UI (browser)

```
In /web, build a camera pipeline in vanilla JS:

- getUserMedia rear camera, 10 fps analysis loop on a downscaled canvas.
- Sky mask first: exclude ground, trees, hills, and buildings (green
  or very dark textured regions, strong edges, and anything below the
  horizon line). Keep a manual "horizon" slider as an override. All
  later steps run only inside the sky mask.
- Sky/cloud segmentation, clear-sky case: a blue-red ratio threshold,
  with a slider for sensitivity. Connected components give clouds. Drop
  blobs under a minimum area.
- Overcast detection: if the sky mask is mostly gray (low saturation) or
  one blob covers more than about 70% of it, switch to "patch mode".
  Split the sky into a grid of roughly 6x4 patches. Each patch becomes a
  pseudo-cloud whose id is its grid cell, with brightness, local contrast
  (texture), and height from its row. Track patches over time the same
  way, so brightness changes and gaps produce events.
- Horizon and sea: detect the horizon line (strongest long horizontal
  edge, plus a saturation jump between sky and water) and treat
  everything below it as non-sky. The sea is often as blue as the sky,
  so a blue-red threshold alone will wrongly count it.
- Occluders: poles, flags, wires, and vehicles can cut one cloud into
  several fragments. Mask thin vertical structures and merge cloud
  fragments that are separated only by a thin occluder (gap narrower
  than a small fraction of frame width) into one cloud before tracking.
- Real-world note: my own test photos cover three conditions: gray storm
  skies with dark lumpy clouds, flat hazy overcast over hills, and blue
  sky with bright cumulus above the sea, with trees, poles, flags, and
  people in the foreground. Blue-sky-only logic will fail on the first
  two, and a naive threshold will fail on the third.
- Tracker: match blobs between frames by centroid distance plus IoU,
  assign stable IDs, detect merges and splits, keep a 1.5 s grace period
  before deleting a lost cloud.
- Per cloud or patch, expose {id, type, confidence, area, centroid,
  height (0-1, top of frame = 1), velocity, age, brightness, texture,
  mode: "cloud" | "patch"}. In patch mode, type is derived from
  brightness and texture: dark and lumpy = cumulonimbus-like, dark and
  flat = stratus-like, bright and wispy = cirrus-like.
- Classify each cloud crop using the exported ONNX model via
  onnxruntime-web, throttled to once per second per cloud, with majority
  voting over the last 5 results.
- Debug overlay drawing boxes, IDs, and type labels.

Add a recorded-video test mode so I can develop indoors. Include unit
tests for the tracker using synthetic moving blobs.

UI direction: dreamy and soft. Pastel dusk gradient sky (periwinkle,
pink, peach) that sinks to plum and indigo as tension rises, faint
twinkling stars, glass-like panels with backdrop blur, pill buttons,
Fraunces (light italic) for display text and Quicksand for UI. Dark mode
is a night-indigo version. Reference /docs/nimbus-choir-demo.html for
the exact CSS tokens and sky rendering.
```

---

## Prompt 2b: Test the pipeline on my real photos

```
Put my five real sky photos in /data/test/ (storm_1.jpg, storm_2.jpg,
overcast_hills.jpg, sunny_cumulus_1.jpg, sunny_cumulus_2.jpg). Write a script, /web/tests/photo_check.js (or a
Node script using the same segmentation code), that runs the sky mask,
overcast detection, and patch mode on each photo and saves debug images
to /docs/debug/: the sky mask overlay, the detected clouds or patches,
and a text summary (mode chosen, number of voices, per-patch brightness
range).

Expected behavior to verify and report:
- storm_1 and storm_2: sky mask excludes the trees and the building
  corner; patch mode is chosen; dark lumpy patches map to
  cumulonimbus-like voices; the bright strip near the horizon in storm_2
  is detected as a bright gap.
- overcast_hills: sky mask excludes the hills and foreground greenery;
  patch mode is chosen; patches map to a flat stratus-like drone with
  little variation.

- sunny_cumulus_1 and sunny_cumulus_2: clear-sky mode is chosen (not
  patch mode); the sea below the horizon is excluded from the sky mask;
  poles, the flag, and the vehicle do not break one big cumulus into
  many voices; the large towering clouds map to cumulus or
  cumulonimbus-like voices and the small wispy ones to lighter voices.
  Report how many separate clouds were detected per photo.

If any expectation fails, show me the debug image, propose a fix, and
wait before changing thresholds. Do not tune thresholds to just these
five photos; keep them general and note any overfitting risk.
```

---

## Prompt 3: Sound engine

```
In /web/audio, build the sky sound engine with the Web Audio API. No
samples. A working prototype of this design is in
/docs/nimbus-choir-demo.html; read it first and port it into clean ES
modules (voice.js, chime.js, reverb.js, scales.js, engine.js) rather
than rewriting from scratch.

Each cloud gets two layers:

1. Pad voice: 3 detuned oscillators (-8, 0, +8 cents; sine for cirrus,
   triangle for the rest) plus a quiet sine one octave up, into a
   lowpass (Q 2.5), then a slow tremolo (0.15-0.4 Hz LFO) for a
   breathing feel, then StereoPanner. Lowpass cutoffs: cirrus 3200 Hz,
   cumulus 1500, stratus 420, cumulonimbus 650.
2. Chimes: every few seconds each cloud plays a bell note built from 3
   sine partials (ratios 1, 2.76, 5.4) with a fast attack and an
   exponential decay. Cirrus: high and sparkly, every 1.2-3.7 s.
   Cumulus: music-box, every 2-6 s. Cumulonimbus: slow low bells,
   every 5-10 s, longer decay. Stratus: pad only, no chimes.

Shared effects: a generated convolution reverb (3.2 s decaying noise
impulse, stereo) with every voice and chime sending to it, then a
master gain and a DynamicsCompressor.

Mapping:
- Height picks pitch from a selectable scale (pentatonic, Dorian, blues)
  and root, quantized to each type's range. Pitch glides with a
  0.8 s time constant so changes feel like portamento.
- Position sets pan. Size sets volume (cumulonimbus louder as it grows).
- Birth: slow fade in. Death: ~1.5 s fade with a slight downward pitch
  droop. Merge: the smaller voice glides into the larger one.
- "tension" input (0-1): below 0.25, all notes snap to chord tones
  (scale degrees 1, 3, 5). From 0.4 upward, each voice gains a fixed
  dissonant offset (minor second or tritone), pad detune spread widens
  up to 30 cents, and chimes land on the offset notes with probability
  up to 60%. The tremolo speeds up to about 2.7 Hz. Always smooth the
  changes (setTargetAtTime, ~1 s).
- Cap at 8 simultaneous voices, dropping the smallest clouds.
- Clean up every oscillator and node on voice death to avoid leaks.
- Screen-off mode: keep audio running, use Wake Lock where supported,
  and show a "tap to resume" note for iOS limits.

Overcast behavior (for patch mode, where there are up to 24 pseudo-clouds):
- Cap at 8 voices still applies: pick the 8 patches with the strongest
  brightness or texture contrast, and rotate them slowly so the whole sky
  gets heard over time.
- A mostly dark, low, flat sky leans on the stratus-style drone and slow
  low bells, with very few high chimes.
- A bright gap (a patch much brighter than its neighbors) triggers a
  small, high, hopeful chime phrase, rate-limited to once every ~20 s.
- Tension defaults to a higher baseline when the sky is dark and heavy.

Expose a small API: engine.start(), setTension(), setScale(), setRoot(),
upsertCloud({id,type,area,centroid,height}), removeCloud(id). Keep the
standalone demo page with simulated drifting clouds and sliders so I
can tune the sound by ear. Put every tunable number (cutoffs, intervals,
gains, reverb length) in one config file.
```

---

## Prompt 4: Forecast mood (TabPFN)

```
In /forecast, build the "tension" predictor with TabPFN, using public
data only. I cannot collect my own data.

1. Read the current TabPFN docs and confirm the API.
2. build_dataset.py: download hourly history from the Open-Meteo
   historical weather archive for 30-50 diverse locations over 2-3 years
   (check their current terms and rate limits first). Variables:
   cloud_cover, cloud_cover_low, cloud_cover_mid, cloud_cover_high,
   pressure_msl, relative_humidity_2m, precipitation. Compute
   pressure_trend_3h. Label: "rain or a pressure drop of 3 hPa or more
   within the next 6 h". Subsample to a few thousand balanced rows so
   TabPFN stays fast.
3. Feature bridge: at runtime the app only sees camera clouds, so map
   camera cloud types onto the training features (cirrus -> high cover,
   altostratus-like layers -> mid, cumulus and stratus -> low, deep
   cumulonimbus -> all three) and take pressure, pressure trend, and
   humidity from the Open-Meteo forecast API for a coarse location.
   Document this mapping and its limits.
4. train/predict: TabPFN classifier, held-out evaluation by location
   (not random rows), calibration plot, and a function that returns a
   probability 0-1 for the web app's tension input.
5. Serve it from FastAPI /predict, with a pure-JS rule-based fallback
   (falling pressure plus thickening high cloud means higher tension) so
   the app works offline.
6. Optional feature upwind_cloud_cover, filled only when Earth mode data
   exists.

Document honestly that this is reanalysis data, not station
observations, that the camera-to-feature mapping is approximate, and
what accuracy to expect.
```

---

## Prompt 5: Arduino node (optional)

```
This is optional; the app must work fully without it.

In /firmware, write PlatformIO firmware for an Arduino-compatible board
with a BME280 over I2C (ask me which board). Read temp, humidity, and
pressure every 30 s, compute a 3-hour pressure trend in a ring buffer,
and send JSON lines over serial (and Wi-Fi or BLE if the board supports
it). Include a wiring diagram in ASCII, a calibration note, and a small
Python logger in /server that appends the readings to SQLite. Add
low-power sleep between reads.
```

---

## Prompt 6: Sky narrator (ElevenLabs + Gemma)

```
Add an optional "sky narrator" feature, a gentle field-guide voice.
Every 60 s, build a short summary of the sky state (types, coverage,
tension, pressure trend) and have Gemma write one or two lines, playful
and under 25 words, describing what the sky is humming or chiming right
now. Voice it with ElevenLabs (read their current docs; stream and cache
audio) and duck the ambient engine's master gain while it speaks.
Offline fallback: browser speechSynthesis. Off by default, with a text
caption always shown. Never send camera images, only the numeric summary.
```

---

## Prompt 7: Optional partner stack (pick two or three)

```
Add: (a) FastAPI deployed on Render with render.yaml, (b) Tiger Data
time-series table for sky readings with a weekly "symphony of the week"
query, (c) Sentry Agent Tracing around the narrator agent, (d) a
Temporal workflow for a daily dawn-chorus summary.

Only add what works end to end, and tell me what you skipped.
```

---

## Prompt 8: Write-up

```
Using the repo and git history, draft my DEV submission for the
Hacktoberfest "Touch Grass" challenge. Sections: what it is, why open
models matter here (offline, privacy, fine-tunable), architecture, how
each partner tech is used meaningfully, what failed, and field-test
notes. Leave [PLACEHOLDER] markers for my real field-test experience
and demo clip. Don't invent results.

Describe the sound design honestly, including that I first tried
formant-synthesized choir voices and abandoned them because they sounded
robotic, then switched to pads plus bell chimes with reverb. Include the
tradeoff: it is a "choir" in concept (one voice per cloud) but ambient
and chime-based in sound.

Explain how the project gets people outside: the intended use is lying
in a field with headphones in and the screen off. If Earth mode shipped,
describe it as a secondary mode and be clear that it needs internet.
```

---

## Prompt 9: Earth mode (NASA GIBS satellite imagery)

```
In /web and /server, add an "Earth mode" using NASA GIBS (no API key;
read the current WMTS docs and layer list first, and tell me which
layers and satellites you picked and which regions they cover).

- A FastAPI proxy fetches and caches tiles for a coarse user-chosen
  region. Never send exact GPS.
- Layers: a visible layer for cloud masks and a clean-infrared layer
  for cloud-top height (colder top = higher cloud).
- Load the last 6-12 geostationary frames and loop them as a time-lapse.
- Reuse the existing segmentation, tracker, and sound engine. x picks
  pan, IR cold-top picks pitch, brightness and size pick timbre. Do not
  use the ground-photo classifier on satellite views.
- Export upwind cloud coverage as a feature for /forecast.
- Show a clear "needs internet" badge, cache a few frames for flaky
  connections, and fall back to the sky-camera mode when offline.
- If a region only has sparse coverage (for example once-daily polar
  orbiter passes), say so in the UI.
```
