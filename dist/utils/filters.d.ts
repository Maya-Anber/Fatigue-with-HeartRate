/**
 * @module utils/filters
 * Digital signal processing filters for physiological signals.
 * All filters are designed to be lightweight and real-time capable.
 */
/**
 * Exponential Moving Average (EMA) filter.
 * Fast, low-memory smoother. Alpha closer to 1 = more responsive; closer to 0 = smoother.
 */
export declare class EMAFilter {
    private readonly alpha;
    private value;
    constructor(alpha?: number);
    update(sample: number): number;
    reset(): void;
}
/**
 * Moving Average (SMA) filter with a fixed window.
 * Good for smoothing noisy PPG/EMG signals.
 */
export declare class SMAFilter {
    private readonly windowSize;
    private buffer;
    constructor(windowSize?: number);
    update(sample: number): number;
    reset(): void;
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
export declare class BandpassFilter {
    private readonly b0;
    private readonly b1;
    private readonly b2;
    private readonly a1;
    private readonly a2;
    private x1;
    private x2;
    private y1;
    private y2;
    update(x: number): number;
    reset(): void;
}
/**
 * Median filter — removes impulse noise ("salt and pepper").
 * Useful for EMG spike rejection.
 */
export declare class MedianFilter {
    private readonly windowSize;
    private buffer;
    constructor(windowSize?: number);
    update(sample: number): number;
    reset(): void;
}
/**
 * Adaptive threshold for peak detection.
 * Tracks signal amplitude dynamically to avoid false peaks during motion.
 */
export declare class AdaptiveThreshold {
    private readonly decay;
    private peak;
    private valley;
    constructor(decay?: number);
    update(value: number): number;
}
//# sourceMappingURL=filters.d.ts.map