"use strict";
/**
 * @module utils/filters
 * Digital signal processing filters for physiological signals.
 * All filters are designed to be lightweight and real-time capable.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdaptiveThreshold = exports.MedianFilter = exports.BandpassFilter = exports.SMAFilter = exports.EMAFilter = void 0;
/**
 * Exponential Moving Average (EMA) filter.
 * Fast, low-memory smoother. Alpha closer to 1 = more responsive; closer to 0 = smoother.
 */
class EMAFilter {
    constructor(alpha = 0.2) {
        this.alpha = alpha;
        this.value = null;
    }
    update(sample) {
        if (this.value === null) {
            this.value = sample;
        }
        else {
            this.value = this.alpha * sample + (1 - this.alpha) * this.value;
        }
        return this.value;
    }
    reset() {
        this.value = null;
    }
}
exports.EMAFilter = EMAFilter;
/**
 * Moving Average (SMA) filter with a fixed window.
 * Good for smoothing noisy PPG/EMG signals.
 */
class SMAFilter {
    constructor(windowSize = 10) {
        this.windowSize = windowSize;
        this.buffer = [];
    }
    update(sample) {
        this.buffer.push(sample);
        if (this.buffer.length > this.windowSize)
            this.buffer.shift();
        return this.buffer.reduce((a, b) => a + b, 0) / this.buffer.length;
    }
    reset() {
        this.buffer = [];
    }
}
exports.SMAFilter = SMAFilter;
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
class BandpassFilter {
    constructor() {
        // 2nd-order cascaded sections (SOS) — coefficients for 30fps, 0.5–3.5Hz
        this.b0 = 0.08717;
        this.b1 = 0.0;
        this.b2 = -0.08717;
        this.a1 = -1.7864;
        this.a2 = 0.8257;
        this.x1 = 0;
        this.x2 = 0;
        this.y1 = 0;
        this.y2 = 0;
    }
    update(x) {
        const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2
            - this.a1 * this.y1 - this.a2 * this.y2;
        this.x2 = this.x1;
        this.x1 = x;
        this.y2 = this.y1;
        this.y1 = y;
        return y;
    }
    reset() {
        this.x1 = this.x2 = this.y1 = this.y2 = 0;
    }
}
exports.BandpassFilter = BandpassFilter;
/**
 * Median filter — removes impulse noise ("salt and pepper").
 * Useful for EMG spike rejection.
 */
class MedianFilter {
    constructor(windowSize = 5) {
        this.windowSize = windowSize;
        this.buffer = [];
    }
    update(sample) {
        this.buffer.push(sample);
        if (this.buffer.length > this.windowSize)
            this.buffer.shift();
        const sorted = [...this.buffer].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
    }
    reset() {
        this.buffer = [];
    }
}
exports.MedianFilter = MedianFilter;
/**
 * Adaptive threshold for peak detection.
 * Tracks signal amplitude dynamically to avoid false peaks during motion.
 */
class AdaptiveThreshold {
    constructor(decay = 0.95) {
        this.decay = decay;
        this.peak = 0;
        this.valley = 0;
    }
    update(value) {
        this.peak = Math.max(this.peak * this.decay, value);
        this.valley = Math.min(this.valley * this.decay, value);
        return (this.peak + this.valley) / 2;
    }
}
exports.AdaptiveThreshold = AdaptiveThreshold;
//# sourceMappingURL=filters.js.map