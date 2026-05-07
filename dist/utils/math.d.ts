/**
 * @module utils/math
 * Shared mathematical utilities used across all modules.
 */
/** Clamp a value between min and max */
export declare function clamp(value: number, min: number, max: number): number;
/** Compute the arithmetic mean of an array */
export declare function mean(values: number[]): number;
/** Compute the root mean square of an array */
export declare function rms(values: number[]): number;
/** Compute variance of an array */
export declare function variance(values: number[]): number;
/** Compute standard deviation */
export declare function stddev(values: number[]): number;
/** Normalize a value to [0, 1] given a known range */
export declare function normalize(value: number, min: number, max: number): number;
/** Linear interpolation */
export declare function lerp(a: number, b: number, t: number): number;
/** Find local maxima in a signal (peaks) */
export declare function findPeaks(signal: number[], minDistance?: number): number[];
/** Simple timestamp in milliseconds */
export declare function now(): number;
//# sourceMappingURL=math.d.ts.map