/**
 * @module barbell
 * Barbell Velocity Tracker.
 *
 * Ingests velocity readings from an external model (your existing CV/sensor pipeline)
 * and computes:
 *   - Velocity loss % relative to the first rep of the set
 *   - Velocity trend (is the athlete getting slower?)
 *   - Fatigue flag (loss exceeds configurable threshold)
 *
 * This module does NOT compute velocity — it consumes it.
 * Integrate by calling tracker.push(metersPerSecond) after each rep.
 */
export interface VelocityReading {
    timestamp: number;
    velocityMps: number;
    velocityLossPct: number;
    trend: 'improving' | 'stable' | 'declining';
    fatigueFlag: boolean;
    repNumber: number;
}
export interface BarbellConfig {
    /**
     * Velocity loss threshold (%) that triggers a fatigue flag.
     * Commonly used thresholds:
     *   - 10% → strength focus (keep quality high)
     *   - 20% → hypertrophy (more volume tolerance)
     *   - 30% → endurance sets
     * Default: 20
     */
    velocityLossThreshold?: number;
    /**
     * Number of reps to average for the "first rep" baseline.
     * Default: 1 (just the very first rep)
     */
    baselineReps?: number;
    /**
     * Smoothing alpha for velocity trend (0–1). Higher = more responsive.
     * Default: 0.3
     */
    trendAlpha?: number;
}
export declare class BarbellVelocityTracker {
    private cfg;
    private repHistory;
    private baselineVelocity;
    private trendFilter;
    private smoothFilter;
    private latestReading;
    private listeners;
    constructor(config?: BarbellConfig);
    /**
     * Push a new rep's peak concentric velocity (m/s).
     * Returns a VelocityReading with loss, trend, and fatigue flag.
     */
    push(velocityMps: number): VelocityReading;
    on(_event: 'rep', listener: (data: VelocityReading) => void): this;
    getLatest(): VelocityReading | null;
    /** Velocity loss of the latest rep vs. baseline, or null if not enough data */
    getVelocityLossPct(): number | null;
    /** Reset for the next set */
    resetSet(): void;
}
//# sourceMappingURL=index.d.ts.map