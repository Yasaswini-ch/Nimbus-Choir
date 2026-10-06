/** Every tunable number for the sound engine, in one place. */

export const TYPES = {
  cirrus: { lo: 72, hi: 88, cut: 3200, gain: 0.05 },
  cumulus: { lo: 55, hi: 72, cut: 1500, gain: 0.08 },
  stratus: { lo: 36, hi: 43, cut: 420, gain: 0.09 },
  cumulonimbus: { lo: 40, hi: 55, cut: 650, gain: 0.09 },
};

export const SCALES = {
  penta: [0, 2, 4, 7, 9],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  blues: [0, 3, 5, 6, 7, 10],
};

export const PAD = {
  detuneCents: [-8, 0, 8],
  octaveUpGain: 0.25,
  lowpassQ: 2.5,
  tremolo: { minHz: 0.15, maxHz: 0.4, depth: 0.25, maxHzAtFullTension: 2.7 },
  pitchGlideSeconds: 0.8, // portamento time constant
  detuneSpreadMaxCents: 30,
};

export const CHIME = {
  partials: [
    [1, 1],
    [2.76, 0.35],
    [5.4, 0.12],
  ],
  attackSeconds: 0.008,
  intervalSeconds: {
    cirrus: [1.2, 3.7],
    cumulus: [2, 6],
    cumulonimbus: [5, 10],
    // stratus: no chimes
  },
  decaySeconds: { default: 1.8, cumulonimbus: 3 },
  volume: { default: 0.1, cumulonimbus: 0.15 },
  brightGap: {
    rateLimitSeconds: 20,
    noteCount: 3,
    noteSpacingSeconds: 0.18,
    volume: 0.08,
    decaySeconds: 1.2,
  },
};

export const REVERB = {
  durationSeconds: 3.2,
  decayPower: 2.6,
  sendGain: 0.7,
};

export const MASTER_GAIN = 0.8;

export const TENSION = {
  calmThreshold: 0.25, // below this, snap to chord tones (scale degrees 1,3,5)
  dissonanceStart: 0.4, // detune spread / dissonant offset ramps in from here
  dissonanceRange: 0.6, // (1 - dissonanceStart)
  chimeOffsetMaxProbability: 0.6,
  smoothingSeconds: 1, // setTargetAtTime tau for tension-driven parameter changes
  dissonantOffsetsSemitones: [1, 6, -1, 6], // minor second / tritone, by voice id % 4
};

export const VOICE_CAP = 8;

export const DEATH = {
  fadeTau: 0.5, // ~3*tau = 1.5s to near-silence
  pitchDroopSemitones: -1, // expressed via detune cents below
  pitchDroopDetuneCents: -100,
  cleanupDelayMs: 2500,
};

export const MERGE_GLIDE_SECONDS = 0.8;

export const OVERCAST = {
  gridCols: 6,
  gridRows: 4,
  darkBrightnessThreshold: 0.45, // mean patch brightness below this = "dark, heavy sky"
  flatTextureThreshold: 0.08, // mean patch texture below this = "flat"
  brightGapContrastThreshold: 0.2, // patch brightness - mean brightness, to count as a "bright gap"
  rotationFullBonusSeconds: 45, // an unheard-for-this-long patch gets the max rotation priority bonus
};
