/** Small shared pixel-math helpers used by horizon/mask/segment/overcast/occluders. */

export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

export function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Grayscale (luminance) buffer, width/height of the source ImageData. */
export function toGray(imageData) {
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = luminance(data[i], data[i + 1], data[i + 2]);
  }
  return { gray, width, height };
}

/** Sobel gradient magnitude, same dimensions, zero-padded border. */
export function sobelMagnitude(gray, width, height) {
  const out = new Float32Array(width * height);
  const at = (x, y) => gray[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx =
        -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) +
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
      const gy =
        -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) +
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
      out[y * width + x] = Math.hypot(gx, gy);
    }
  }
  return out;
}

export function mean(arr) {
  if (arr.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

export function stdDev(arr) {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += (arr[i] - m) ** 2;
  return Math.sqrt(s / arr.length);
}

/**
 * 4-connected components over a binary mask. Returns components with pixel
 * index lists plus bbox/area/mean-luminance/texture computed from `gray`.
 */
export function connectedComponents(binaryMask, width, height, gray) {
  const labels = new Int32Array(width * height).fill(-1);
  const components = [];
  const stack = [];

  for (let start = 0; start < width * height; start++) {
    if (binaryMask[start] !== 1 || labels[start] !== -1) continue;

    const pixels = [];
    stack.push(start);
    labels[start] = components.length;
    while (stack.length) {
      const p = stack.pop();
      pixels.push(p);
      const x = p % width, y = (p / width) | 0;
      const neighbors = [];
      if (x > 0) neighbors.push(p - 1);
      if (x < width - 1) neighbors.push(p + 1);
      if (y > 0) neighbors.push(p - width);
      if (y < height - 1) neighbors.push(p + width);
      for (const n of neighbors) {
        if (binaryMask[n] === 1 && labels[n] === -1) {
          labels[n] = components.length;
          stack.push(n);
        }
      }
    }

    let x0 = width, y0 = height, x1 = 0, y1 = 0;
    const lums = [];
    for (const p of pixels) {
      const x = p % width, y = (p / width) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (gray) lums.push(gray[p]);
    }
    components.push({
      pixels,
      area: pixels.length,
      bbox: { x0, y0, x1: x1 + 1, y1: y1 + 1 },
      brightness: gray ? mean(lums) : null,
      texture: gray ? stdDev(lums) : null,
    });
  }

  return components;
}
