/**
 * @module utils/math
 * Shared mathematical utilities used across all modules.
 */

/** Clamp a value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Compute the arithmetic mean of an array */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

/** Compute the root mean square of an array */
export function rms(values: number[]): number {
  if (values.length === 0) return 0;
  const squaredSum = values.reduce((acc, v) => acc + v * v, 0);
  return Math.sqrt(squaredSum / values.length);
}

/** Compute variance of an array */
export function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
}

/** Compute standard deviation */
export function stddev(values: number[]): number {
  return Math.sqrt(variance(values));
}

/** Normalize a value to [0, 1] given a known range */
export function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

/** Linear interpolation */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

/** Find local maxima in a signal (peaks) */
export function findPeaks(signal: number[], minDistance = 10): number[] {
  const peaks: number[] = [];
  for (let i = minDistance; i < signal.length - minDistance; i++) {
    const window = signal.slice(i - minDistance, i + minDistance + 1);
    const max = Math.max(...window);
    if (signal[i] === max && (peaks.length === 0 || i - peaks[peaks.length - 1] >= minDistance)) {
      peaks.push(i);
    }
  }
  return peaks;
}

/** Simple timestamp in milliseconds */
export function now(): number {
  return Date.now();
}
