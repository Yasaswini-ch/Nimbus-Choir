import { SCALES, TENSION } from "./config.js";

/** MIDI note number -> frequency (Hz), A4 = 69 = 440Hz. */
export function fAt(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * All MIDI notes in [lo, hi] that land on `scale` degrees rooted at `root`.
 * When `calm` (low tension), only chord tones (scale degrees 1, 3, 5) are
 * used. Falls back to [lo] if nothing in range matches.
 */
export function pool(lo, hi, scaleName, root, calm) {
  const scale = SCALES[scaleName] ?? SCALES.penta;
  const idx = calm
    ? [0, 2, 4].map((i) => Math.min(i, scale.length - 1))
    : scale.map((_, i) => i);
  const out = [];
  for (let octave = 0; octave < 10; octave++) {
    for (const i of idx) {
      const midi = 12 * octave + root + scale[i];
      if (midi >= lo && midi <= hi) out.push(midi);
    }
  }
  return out.length ? out : [lo];
}

/** Picks the pool note closest to a height-fraction (0-1) target within [lo, hi]. */
export function noteFor(lo, hi, heightFrac, scaleName, root, tension) {
  const calm = tension < TENSION.calmThreshold;
  const notes = pool(lo, hi, scaleName, root, calm);
  const target = lo + (hi - lo) * heightFrac;
  let best = notes[0];
  for (const m of notes) {
    if (Math.abs(m - target) < Math.abs(best - target)) best = m;
  }
  return best;
}

export function noteName(midi) {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return names[((midi % 12) + 12) % 12] + Math.floor(midi / 12 - 1);
}
