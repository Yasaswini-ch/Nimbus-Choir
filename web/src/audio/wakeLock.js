/**
 * Keeps the screen awake where the Wake Lock API is available. Audio itself
 * keeps running via the AudioContext regardless; this only manages the
 * screen/resume affordance for browsers (notably iOS Safari) that suspend
 * audio when the page is backgrounded without a fresh user gesture.
 */
export function createWakeLockManager({ onNeedsResume } = {}) {
  let lock = null;
  let needsResume = false;

  async function request() {
    if (!("wakeLock" in navigator)) return;
    try {
      lock = await navigator.wakeLock.request("screen");
      lock.addEventListener("release", () => { lock = null; });
    } catch {
      // permission denied or unsupported in this context; the "tap to
      // resume" fallback below still covers playback continuity.
    }
  }

  function handleVisibilityChange() {
    if (document.visibilityState === "visible") {
      if (!lock) request();
    } else if (!lock) {
      needsResume = true;
      onNeedsResume?.();
    }
  }

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pageshow", () => {
    if (needsResume) {
      needsResume = false;
    }
  });

  return {
    request,
    get needsResume() {
      return needsResume;
    },
    resume(audioContext) {
      needsResume = false;
      return audioContext?.resume();
    },
  };
}
