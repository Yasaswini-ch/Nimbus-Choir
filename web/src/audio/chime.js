import { TYPES, CHIME, TENSION } from "./config.js";
import { fAt, pool } from "./scales.js";

function chimeRange(type) {
  if (type === "cirrus") return [84, 100];
  if (type === "cumulonimbus") return [48, 62];
  const t = TYPES[type] ?? TYPES.cumulus;
  return [t.lo + 12, t.hi + 12];
}

function playPartials(ctx, freq, { volume, decaySeconds, t0, pan, master, reverb }) {
  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  panner.connect(master);
  const send = ctx.createGain();
  send.gain.value = 0.8;
  panner.connect(send);
  send.connect(reverb);

  for (const [ratio, amp] of CHIME.partials) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq * ratio;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume * amp, t0 + CHIME.attackSeconds);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + decaySeconds / Math.pow(ratio, 0.3));
    osc.connect(gain);
    gain.connect(panner);
    osc.start(t0);
    osc.stop(t0 + decaySeconds + 0.5);
  }
}

/** One bell note for a living voice, per its type's interval/range (stratus never chimes). */
export function scheduleChime(ctx, voice, cloud, tension, { scaleName, root, master, reverb }, t0 = ctx.currentTime + 0.02) {
  if (cloud.type === "stratus") return;
  const [lo, hi] = chimeRange(cloud.type);
  const calm = tension < TENSION.calmThreshold;
  const notes = pool(lo, hi, scaleName, root, calm);
  let idx = Math.floor(cloud.height * (notes.length - 1) + Math.random() * 3 - 1);
  idx = Math.max(0, Math.min(notes.length - 1, idx));
  let midi = notes[idx];
  if (Math.random() < tension * TENSION.chimeOffsetMaxProbability) midi += voice.dissonantOffset;

  const freq = fAt(midi);
  const volume = (cloud.type === "cumulonimbus" ? CHIME.volume.cumulonimbus : CHIME.volume.default) * (cloud.fade ?? 1);
  const decaySeconds = cloud.type === "cumulonimbus" ? CHIME.decaySeconds.cumulonimbus : CHIME.decaySeconds.default;
  playPartials(ctx, freq, { volume, decaySeconds, t0, pan: cloud.centroid.x * 2 - 1, master, reverb });
}

/** A short, high, hopeful chime phrase for an overcast "bright gap" patch. */
export function playBrightGapChime(ctx, patch, { scaleName, root, master, reverb }) {
  const notes = pool(84, 96, scaleName, root, true);
  const t0 = ctx.currentTime + 0.02;
  for (let i = 0; i < CHIME.brightGap.noteCount; i++) {
    const midi = notes[i % notes.length];
    playPartials(ctx, fAt(midi), {
      volume: CHIME.brightGap.volume,
      decaySeconds: CHIME.brightGap.decaySeconds,
      t0: t0 + i * CHIME.brightGap.noteSpacingSeconds,
      pan: patch.centroid.x * 2 - 1,
      master,
      reverb,
    });
  }
}

/** Rate limiter for the bright-gap chime: fires at most once per rateLimitSeconds. */
export function createBrightGapLimiter(rateLimitSeconds = CHIME.brightGap.rateLimitSeconds) {
  let lastFired = -Infinity;
  return {
    canFire(now) {
      return now - lastFired >= rateLimitSeconds;
    },
    markFired(now) {
      lastFired = now;
    },
  };
}
