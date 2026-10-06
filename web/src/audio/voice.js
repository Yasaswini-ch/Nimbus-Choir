import { TYPES, PAD, TENSION, DEATH, MERGE_GLIDE_SECONDS } from "./config.js";
import { fAt, noteFor } from "./scales.js";

/**
 * Pad-voice lifecycle: 3 detuned oscillators (+ a quiet octave-up sine) into
 * a lowpass, then a slow tremolo, then pan, into both the dry output and the
 * reverb send. One voice per cloud/patch.
 */
export function createVoice(ctx, cloud, { master, reverb }) {
  const type = TYPES[cloud.type] ?? TYPES.cumulus;
  const wave = cloud.type === "cirrus" ? "sine" : "triangle";
  const mix = ctx.createGain();

  const oscs = PAD.detuneCents.map((cents) => {
    const o = ctx.createOscillator();
    o.type = wave;
    o.detune.value = cents;
    o.connect(mix);
    o.start();
    return o;
  });

  const up = ctx.createOscillator();
  up.type = "sine";
  const upGain = ctx.createGain();
  upGain.gain.value = PAD.octaveUpGain;
  up.connect(upGain);
  upGain.connect(mix);
  up.start();

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = type.cut;
  lowpass.Q.value = PAD.lowpassQ;

  const tremoloGain = ctx.createGain();
  tremoloGain.gain.value = 1;
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = PAD.tremolo.minHz + Math.random() * (PAD.tremolo.maxHz - PAD.tremolo.minHz);
  lfoGain.gain.value = PAD.tremolo.depth;
  lfo.connect(lfoGain);
  lfoGain.connect(tremoloGain.gain);
  lfo.start();

  const out = ctx.createGain();
  out.gain.value = 0; // birth: fade in from silence
  const pan = ctx.createStereoPanner();

  mix.connect(lowpass);
  lowpass.connect(tremoloGain);
  tremoloGain.connect(out);
  out.connect(pan);
  pan.connect(master);

  const send = ctx.createGain();
  send.gain.value = 0.7;
  pan.connect(send);
  send.connect(reverb);

  const voice = {
    id: cloud.id,
    oscs,
    up,
    lowpass,
    lfo,
    tremoloGain,
    out,
    pan,
    mix,
    send,
    upGain,
    lfoGain,
    dissonantOffset: TENSION.dissonantOffsetsSemitones[cloud.id % 4],
    dir: cloud.id % 2 ? 1 : -1,
    nextChimeAt: ctx.currentTime + 1 + Math.random() * 3,
    midi: 60,
    dying: false,
    mergingInto: null,
  };
  return voice;
}

function targetFrequency(voice, cloud, tension, scaleName, root) {
  const type = TYPES[cloud.type] ?? TYPES.cumulus;
  const base = noteFor(type.lo, type.hi, cloud.height, scaleName, root, tension);
  const dissonanceAmount = Math.max(0, (tension - TENSION.dissonanceStart) / TENSION.dissonanceRange);
  const dissonanceAmountClamped = Math.min(1, dissonanceAmount);
  voice.midi = base + voice.dissonantOffset * dissonanceAmountClamped;
  return fAt(voice.midi);
}

/** Per-tick update: portamento pitch, detune spread, pan, volume, tremolo rate. */
export function updateVoice(ctx, voice, cloud, tension, { scaleName, root }) {
  if (voice.dying || voice.mergingInto) return;
  const now = ctx.currentTime;
  const type = TYPES[cloud.type] ?? TYPES.cumulus;

  const freq = targetFrequency(voice, cloud, tension, scaleName, root);
  voice.oscs.forEach((o) => o.frequency.setTargetAtTime(freq, now, PAD.pitchGlideSeconds));
  voice.up.frequency.setTargetAtTime(freq * 2, now, PAD.pitchGlideSeconds);

  const dissonanceAmount = Math.min(1, Math.max(0, (tension - TENSION.dissonanceStart) / TENSION.dissonanceRange));
  const spread = dissonanceAmount * PAD.detuneSpreadMaxCents;
  voice.oscs[0].detune.setTargetAtTime(-8 - spread * voice.dir, now, TENSION.smoothingSeconds);
  voice.oscs[2].detune.setTargetAtTime(8 + spread * voice.dir, now, TENSION.smoothingSeconds);

  const tremoloHz = PAD.tremolo.minHz + tension * (PAD.tremolo.maxHzAtFullTension - PAD.tremolo.minHz);
  voice.lfo.frequency.setTargetAtTime(tremoloHz, now, TENSION.smoothingSeconds);

  const panValue = Math.max(-1, Math.min(1, cloud.centroid.x * 2 - 1));
  voice.pan.pan.setTargetAtTime(panValue, now, 0.2);

  const areaFactor = cloud.type === "cumulonimbus" ? 0.6 + cloud.area * 4 : 0.8 + cloud.area * 2;
  voice.out.gain.setTargetAtTime(type.gain * areaFactor, now, 0.6);
}

/** Death: fade out with a slight downward pitch droop, then stop and disconnect every node. */
export function killVoice(ctx, voice) {
  if (voice.dying) return;
  voice.dying = true;
  const now = ctx.currentTime;
  voice.out.gain.cancelScheduledValues(now);
  voice.out.gain.setTargetAtTime(0, now, DEATH.fadeTau);
  voice.oscs.forEach((o) => o.detune.setTargetAtTime(DEATH.pitchDroopDetuneCents, now, DEATH.fadeTau));
  scheduleCleanup(voice);
}

/** Merge: this (smaller) voice glides into the target's pitch/pan, then stops. */
export function mergeVoiceInto(ctx, voice, targetVoice) {
  if (voice.dying || voice.mergingInto) return;
  voice.mergingInto = targetVoice.id;
  const now = ctx.currentTime;
  voice.oscs.forEach((o, i) => {
    o.frequency.setTargetAtTime(fAt(targetVoice.midi), now, MERGE_GLIDE_SECONDS);
  });
  voice.up.frequency.setTargetAtTime(fAt(targetVoice.midi) * 2, now, MERGE_GLIDE_SECONDS);
  voice.pan.pan.setTargetAtTime(targetVoice.pan.pan.value, now, MERGE_GLIDE_SECONDS);
  voice.out.gain.setTargetAtTime(0, now + MERGE_GLIDE_SECONDS * 0.5, DEATH.fadeTau);
  voice.dying = true;
  scheduleCleanup(voice);
}

function scheduleCleanup(voice) {
  setTimeout(() => {
    const nodes = [...voice.oscs, voice.up, voice.lfo];
    for (const n of nodes) {
      try { n.stop(); } catch { /* already stopped */ }
      try { n.disconnect(); } catch { /* already disconnected */ }
    }
    for (const n of [voice.mix, voice.lowpass, voice.tremoloGain, voice.out, voice.pan, voice.send, voice.upGain, voice.lfoGain]) {
      try { n.disconnect(); } catch { /* already disconnected */ }
    }
  }, DEATH.cleanupDelayMs);
}
