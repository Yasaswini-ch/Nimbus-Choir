import { REVERB } from "./config.js";

/** Generated convolution reverb: a decaying stereo noise impulse. */
export function createReverb(ctx) {
  const len = Math.floor(ctx.sampleRate * REVERB.durationSeconds);
  const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, REVERB.decayPower);
    }
  }
  const convolver = ctx.createConvolver();
  convolver.buffer = buffer;
  return convolver;
}
