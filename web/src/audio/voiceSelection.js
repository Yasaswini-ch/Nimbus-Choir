import { VOICE_CAP, OVERCAST } from "./config.js";

/**
 * Pure function: which of `tracked` clouds/patches should get an audible
 * voice this round, capped at `max`. Clear-sky clouds are prioritized by
 * area (bigger = louder = more worth a voice, matching "dropping the
 * smallest clouds"). Patches are prioritized by brightness/texture contrast
 * against the current patch set's mean brightness, plus a recency bonus for
 * patches that haven't been heard in a while -- so a mostly-uniform overcast
 * sky still rotates through all its patches over time instead of always
 * sounding the same 8.
 */
export function selectVoices(tracked, max = VOICE_CAP, now = 0) {
  if (tracked.length <= max) return tracked.map((t) => t.id);

  const patches = tracked.filter((t) => t.mode === "patch");
  const meanBrightness = patches.length
    ? patches.reduce((s, p) => s + p.brightness, 0) / patches.length
    : 0;

  const scored = tracked.map((t) => {
    if (t.mode === "patch") {
      const contrast = Math.abs(t.brightness - meanBrightness) + t.texture;
      const unheardSeconds = t.lastHeardAt == null ? OVERCAST.rotationFullBonusSeconds : now - t.lastHeardAt;
      const rotationBonus = Math.min(1, Math.max(0, unheardSeconds) / OVERCAST.rotationFullBonusSeconds);
      return { id: t.id, priority: contrast * 0.6 + rotationBonus * 0.4 };
    }
    return { id: t.id, priority: t.area };
  });

  scored.sort((a, b) => b.priority - a.priority);
  return scored.slice(0, max).map((s) => s.id);
}
