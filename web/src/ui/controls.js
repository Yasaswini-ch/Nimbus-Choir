/** Wires the sensitivity/horizon sliders, debug/narrator toggles, and test-video file picker.
 * Earth mode's globe picker is complex enough to own its own wiring directly in main.js. */

export function bindControls({ onSensitivityChange, onHorizonChange, onDebugToggle, onNarratorToggle, onVideoFile }) {
  const sensitivity = document.getElementById("sensitivity");
  const sensitivityValue = document.getElementById("sensitivity-value");
  const horizon = document.getElementById("horizon");
  const horizonValue = document.getElementById("horizon-value");
  const horizonToggle = document.getElementById("toggle-horizon");
  const debugToggle = document.getElementById("toggle-debug");
  const narratorToggle = document.getElementById("toggle-narrator");
  const videoFile = document.getElementById("video-file");

  let horizonManual = false;
  let debugOn = true;
  let narratorVoiceOn = false;

  sensitivity.oninput = (e) => {
    const v = +e.target.value;
    sensitivityValue.textContent = v.toFixed(2);
    onSensitivityChange(v);
  };

  horizon.oninput = (e) => {
    if (!horizonManual) return;
    const v = +e.target.value;
    horizonValue.textContent = v.toFixed(2);
    onHorizonChange(v);
  };

  horizonToggle.onclick = () => {
    horizonManual = !horizonManual;
    horizonToggle.textContent = `Horizon: ${horizonManual ? "manual" : "auto"}`;
    horizonValue.textContent = horizonManual ? (+horizon.value).toFixed(2) : "auto";
    onHorizonChange(horizonManual ? +horizon.value : null);
  };

  debugToggle.onclick = () => {
    debugOn = !debugOn;
    debugToggle.textContent = `Debug overlay: ${debugOn ? "on" : "off"}`;
    onDebugToggle(debugOn);
  };

  narratorToggle.onclick = () => {
    narratorVoiceOn = !narratorVoiceOn;
    narratorToggle.textContent = `Sky narrator: ${narratorVoiceOn ? "on" : "off"}`;
    onNarratorToggle(narratorVoiceOn);
  };

  videoFile.onchange = (e) => {
    const file = e.target.files?.[0];
    if (file) onVideoFile(file);
  };
}
