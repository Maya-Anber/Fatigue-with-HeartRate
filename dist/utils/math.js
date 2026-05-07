"use strict";
/**
 * @module utils/math
 * Shared mathematical utilities used across all modules.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.clamp = clamp;
exports.mean = mean;
exports.rms = rms;
exports.variance = variance;
exports.stddev = stddev;
exports.normalize = normalize;
exports.lerp = lerp;
exports.findPeaks = findPeaks;
exports.now = now;
/** Clamp a value between min and max */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
/** Compute the arithmetic mean of an array */
function mean(values) {
    if (values.length === 0)
        return 0;
    return values.reduce((acc, v) => acc + v, 0) / values.length;
}
/** Compute the root mean square of an array */
function rms(values) {
    if (values.length === 0)
        return 0;
    const squaredSum = values.reduce((acc, v) => acc + v * v, 0);
    return Math.sqrt(squaredSum / values.length);
}
/** Compute variance of an array */
function variance(values) {
    if (values.length < 2)
        return 0;
    const m = mean(values);
    return values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
}
/** Compute standard deviation */
function stddev(values) {
    return Math.sqrt(variance(values));
}
/** Normalize a value to [0, 1] given a known range */
function normalize(value, min, max) {
    if (max === min)
        return 0;
    return clamp((value - min) / (max - min), 0, 1);
}
/** Linear interpolation */
function lerp(a, b, t) {
    return a + (b - a) * clamp(t, 0, 1);
}
/** Find local maxima in a signal (peaks) */
function findPeaks(signal, minDistance = 10) {
    const peaks = [];
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
function now() {
    return Date.now();
}
//# sourceMappingURL=math.js.map