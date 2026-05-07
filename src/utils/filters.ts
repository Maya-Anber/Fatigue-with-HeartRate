/**
 * @module utils/filters
 * Digital signal processing filters for physiological signals.
 * All filters are designed to be lightweight and real-time capable.
 */

/**
 * Exponential Moving Average (EMA) filter.
 * Fast, low-memory smoother. Alpha closer to 1 = more responsive; closer to 0 = smoother.
 */
export class EMAFilter {
  private value: number | null = null;
  constructor(private readonly alpha: number = 0.2) {}

  update(sample: number): number {
    if (this.value === null) {
      this.value = sample;
    } else {
      this.value = this.alpha * sample + (1 - this.alpha) * this.value;
    }
    return this.value;
  }

  reset(): void {
    this.value = null;
  }
}

/**
 * Moving Average (SMA) filter with a fixed window.
 * Good for smoothing noisy PPG/EMG signals.
 */
export class SMAFilter {
  private buffer: number[] = [];
  constructor(private readonly windowSize: number = 10) {}

  update(sample: number): number {
    this.buffer.push(sample);
    if (this.buffer.length > this.windowSize) this.buffer.shift();
    return this.buffer.reduce((a, b) => a + b, 0) / this.buffer.length;
  }

  reset(): void {
    this.buffer = [];
  }
}

/**
 * Butterworth Bandpass Filter (2nd order, IIR approximation).
 * Used to isolate the cardiac frequency band (0.5–3.5 Hz) in PPG.
 *
 * Coefficients pre-computed for:
 *   fs = 30 Hz (camera frame rate), low = 0.5 Hz, high = 3.5 Hz
 *
 * To recompute for different fs, use:
 *   scipy.signal.butter(2, [low, high], btype='band', fs=fs, output='sos')
 */
export class BandpassFilter {
  // 2nd-order cascaded sections (SOS) — coefficients for 30fps, 0.5–3.5Hz
  private readonly b0 = 0.08717;
  private readonly b1 = 0.0;
  private readonly b2 = -0.08717;
  private readonly a1 = -1.7864;
  private readonly a2 = 0.8257;

  private x1 = 0; private x2 = 0;
  private y1 = 0; private y2 = 0;

  update(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2
              - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }

  reset(): void {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
}

/**
 * Median filter — removes impulse noise ("salt and pepper").
 * Useful for EMG spike rejection.
 */
export class MedianFilter {
  private buffer: number[] = [];
  constructor(private readonly windowSize: number = 5) {}

  update(sample: number): number {
    this.buffer.push(sample);
    if (this.buffer.length > this.windowSize) this.buffer.shift();
    const sorted = [...this.buffer].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  reset(): void {
    this.buffer = [];
  }
}

/**
 * Adaptive Threshold filter — dynamically adjusts the detection threshold
 * based on recent signal statistics. Useful for robust peak detection in PPG.
 */
export class AdaptiveThreshold {
  private buffer: number[] = [];
  private readonly windowSize: number;

  constructor(windowSize: number = 50) {
    this.windowSize = windowSize;
  }

  /**
   * Check if a sample exceeds the adaptive threshold.
   * Returns true if sample is in the upper quartile of recent values.
   */
  isAboveThreshold(sample: number): boolean {
    this.buffer.push(sample);
    if (this.buffer.length > this.windowSize) this.buffer.shift();

    if (this.buffer.length < 10) return false;

    const sorted = [...this.buffer].sort((a, b) => a - b);
    const q75Idx = Math.floor(sorted.length * 0.75);
    const threshold = sorted[q75Idx];

    return sample > threshold;
  }

  reset(): void {
    this.buffer = [];
  }
}

/**
 * Adaptive threshold for peak detection.
 * Tracks signal amplitude dynamically to avoid false peaks during motion.
 */
export class AdaptiveThreshold {
  private peak = 0;
  private valley = 0;
  constructor(private readonly decay = 0.95) {}

  update(value: number): number {
    this.peak = Math.max(this.peak * this.decay, value);
    this.valley = Math.min(this.valley * this.decay, value);
    return (this.peak + this.valley) / 2;
  }
}
