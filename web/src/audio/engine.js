import { MASTER_GAIN, VOICE_CAP, CHIME, OVERCAST } from "./config.js";
import { createReverb } from "./reverb.js";
import { createVoice, updateVoice, killVoice, mergeVoiceInto } from "./voice.js";
import { selectVoices } from "./voiceSelection.js";
import { scheduleChime, playBrightGapChime, createBrightGapLimiter } from "./chime.js";

const TICK_MS = 100;

let ctx = null;
let master = null;
let reverb = null;
let tickTimer = null;

const registry = new Map(); // id -> { cloud, lastHeardAt }
const voices = new Map(); // id -> voice (currently sounding)
const brightGapLimiter = createBrightGapLimiter();

let tension = 0;
let scaleName = "penta";
let root = 0;

function randomInterval([lo, hi]) {
  return lo + Math.random() * (hi - lo);
}

function reconcileVoices(now) {
  const tracked = [...registry.entries()].map(([id, entry]) => ({
    id,
    mode: entry.cloud.mode ?? "cloud",
    area: entry.cloud.area ?? 0,
    brightness: entry.cloud.brightness ?? 0.5,
    texture: entry.cloud.texture ?? 0,
    lastHeardAt: entry.lastHeardAt,
  }));
  const selectedIds = new Set(selectVoices(tracked, VOICE_CAP, now));

  for (const id of selectedIds) {
    if (!voices.has(id)) {
      const entry = registry.get(id);
      if (entry) voices.set(id, createVoice(ctx, entry.cloud, { master, reverb }));
    }
  }
  for (const [id, voice] of voices) {
    if (!selectedIds.has(id)) {
      killVoice(ctx, voice);
      voices.delete(id);
    }
  }
}

function heavySky() {
  const patches = [...registry.values()].map((e) => e.cloud).filter((c) => c.mode === "patch");
  if (!patches.length) return false;
  const meanBrightness = patches.reduce((s, p) => s + p.brightness, 0) / patches.length;
  const meanTexture = patches.reduce((s, p) => s + p.texture, 0) / patches.length;
  return meanBrightness < OVERCAST.darkBrightnessThreshold && meanTexture < OVERCAST.flatTextureThreshold;
}

function maybeFireBrightGap(now) {
  const patches = [...registry.values()].map((e) => e.cloud).filter((c) => c.mode === "patch");
  if (patches.length < 2 || !brightGapLimiter.canFire(now)) return;
  const meanBrightness = patches.reduce((s, p) => s + p.brightness, 0) / patches.length;
  const brightest = patches.reduce((a, b) => (b.brightness > a.brightness ? b : a));
  if (brightest.brightness - meanBrightness >= OVERCAST.brightGapContrastThreshold) {
    playBrightGapChime(ctx, brightest, { scaleName, root, master, reverb });
    brightGapLimiter.markFired(now);
  }
}

function tick() {
  const now = ctx.currentTime;
  const dark = heavySky();

  for (const [id, voice] of voices) {
    const entry = registry.get(id);
    if (!entry) continue;
    const cloud = entry.cloud;
    updateVoice(ctx, voice, cloud, tension, { scaleName, root });
    entry.lastHeardAt = now;

    const isHighVoiced = cloud.type === "cirrus" || cloud.type === "cumulus";
    const suppressedByHeavySky = cloud.mode === "patch" && dark && isHighVoiced && Math.random() < 0.8;

    if (cloud.type !== "stratus" && !voice.dying && now > voice.nextChimeAt && !suppressedByHeavySky) {
      scheduleChime(ctx, voice, cloud, tension, { scaleName, root, master, reverb });
      voice.nextChimeAt = now + randomInterval(CHIME.intervalSeconds[cloud.type] ?? CHIME.intervalSeconds.cumulus);
    }
  }

  maybeFireBrightGap(now);
}

export function start() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const compressor = ctx.createDynamicsCompressor();
  master = ctx.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(compressor);
  compressor.connect(ctx.destination);
  reverb = createReverb(ctx);
  reverb.connect(master);
  tickTimer = setInterval(tick, TICK_MS);
}

export function setTension(v) {
  tension = Math.max(0, Math.min(1, v));
}

export function setScale(name) {
  scaleName = name;
}

export function setRoot(midi) {
  root = midi;
}

export function setMuted(muted) {
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : MASTER_GAIN, ctx.currentTime, 0.1);
}

/** Creates or updates the voice for this cloud/patch id. Call once per tracked cloud per frame. */
export function upsertCloud(cloud) {
  if (!ctx) return;
  registry.set(cloud.id, { cloud, lastHeardAt: registry.get(cloud.id)?.lastHeardAt ?? null });
  if (voices.has(cloud.id)) {
    // keep the live voice's cloud reference current between tick() calls
    const entry = registry.get(cloud.id);
    entry.cloud = cloud;
  }
  reconcileVoices(ctx.currentTime);
}

/** Removes a cloud/patch. If mergeIntoId is given and both have voices, glides this one into it. */
export function removeCloud(id, { mergeIntoId = null } = {}) {
  if (!ctx) {
    registry.delete(id);
    return;
  }
  const voice = voices.get(id);
  if (voice) {
    const target = mergeIntoId != null ? voices.get(mergeIntoId) : null;
    if (target) mergeVoiceInto(ctx, voice, target);
    else killVoice(ctx, voice);
    voices.delete(id);
  }
  registry.delete(id);
  reconcileVoices(ctx.currentTime);
}

export function getActiveVoiceCount() {
  return voices.size;
}

export function getAudioContext() {
  return ctx;
}
