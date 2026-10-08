/** Tiny local template used only when /narrate itself is unreachable, so the
 * caption is never empty even fully offline. Not meant to sound like Gemma --
 * just a non-empty placeholder until the server comes back. */
export function templateCaption({ camera = {}, tension = 0 } = {}) {
  const dominant = Object.entries(camera).sort((a, b) => b[1] - a[1])[0];
  const type = dominant && dominant[1] > 0 ? dominant[0] : "clear sky";
  const mood = tension < 0.25 ? "humming softly" : tension < 0.6 ? "stirring a little" : "humming with tension";
  return `The ${type} is ${mood}.`;
}
