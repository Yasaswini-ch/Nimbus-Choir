# web

Vanilla JS + Vite phone-browser app: camera capture, sky segmentation and cloud tracking, the ONNX cloud-type classifier, and the Web Audio sound engine. Runs fully offline after first load; no photos or GPS leave the device.

## Earth mode (`/src/earth`)
An online, explicitly-marked alternative to the sky camera that sonifies
live NASA GIBS satellite imagery instead. Opened via the globe icon
(bottom-right of the stage): a few cloud shapes part (CSS transition on
`.globe-clouds`) to reveal a spinning globe (`globe.js`'s orthographic
projection, drawn with Natural Earth 110m coastlines in `coastlines.json`
-- public domain, see `coastlines.LICENSE.txt`). Clicking a glowing pin, or
anywhere on the globe, calls `/earth/frames/{region}` and snaps to the
nearest of the five real GOES/Himawari-8 coverage regions
(`globe.js`'s `nearestRegion`).

`satelliteSource.js` stitches each frame's tiles into visible/IR canvases
and loops them; `satelliteSegment.js` detects cloud blobs from visible-band
brightness (no sky mask -- satellite imagery is already "all sky") and
buckets brightness+size into one of the sound engine's 4 existing timbres
(`satellitePseudoType`), bypassing the ground-photo ONNX classifier
entirely per the Earth mode spec. IR-band brightness drives pitch as a
colder-cloud-top proxy -- see `/server/README.md`'s Earth mode section for
why that's an approximation, not a real temperature decode.

The orange "Online" badge is always visible while Earth mode is active
(click it to go back to the camera); if the satellite proxy is unreachable,
`main.js` shows a message and falls back to the camera automatically.
