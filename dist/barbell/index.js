"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BarbellVelocityTracker = void 0;
const filters_1 = require("../utils/filters");
const math_1 = require("../utils/math");
class BarbellVelocityTracker {
    constructor(config = {}) {
        this.repHistory = []; // all velocities this set
        this.baselineVelocity = null;
        this.latestReading = null;
        this.listeners = [];
        this.cfg = {
            velocityLossThreshold: config.velocityLossThreshold ?? 20,
            baselineReps: config.baselineReps ?? 1,
            trendAlpha: config.trendAlpha ?? 0.3,
        };
        this.trendFilter = new filters_1.EMAFilter(this.cfg.trendAlpha);
        this.smoothFilter = new filters_1.SMAFilter(3);
    }
    /**
     * Push a new rep's peak concentric velocity (m/s).
     * Returns a VelocityReading with loss, trend, and fatigue flag.
     */
    push(velocityMps) {
        const smoothed = this.smoothFilter.update(velocityMps);
        this.repHistory.push(smoothed);
        const repNumber = this.repHistory.length;
        // Establish baseline from the first N reps
        if (repNumber <= this.cfg.baselineReps) {
            this.baselineVelocity = (0, math_1.mean)(this.repHistory.slice(0, this.cfg.baselineReps));
        }
        const baseline = this.baselineVelocity ?? smoothed;
        const velocityLossPct = Math.max(0, ((baseline - smoothed) / baseline) * 100);
        const fatigueFlag = velocityLossPct >= this.cfg.velocityLossThreshold;
        // Trend: compare EMA of recent velocity to previous
        const trendValue = this.trendFilter.update(smoothed);
        const prevTrend = repNumber > 1 ? this.repHistory[repNumber - 2] : smoothed;
        const delta = trendValue - prevTrend;
        const trend = delta > 0.02 ? 'improving' :
            delta < -0.02 ? 'declining' :
                'stable';
        const reading = {
            timestamp: Date.now(),
            velocityMps: parseFloat(smoothed.toFixed(3)),
            velocityLossPct: parseFloat(velocityLossPct.toFixed(1)),
            trend,
            fatigueFlag,
            repNumber,
        };
        this.latestReading = reading;
        this.listeners.forEach(fn => fn(reading));
        return reading;
    }
    on(_event, listener) {
        this.listeners.push(listener);
        return this;
    }
    getLatest() {
        return this.latestReading;
    }
    /** Velocity loss of the latest rep vs. baseline, or null if not enough data */
    getVelocityLossPct() {
        return this.latestReading?.velocityLossPct ?? null;
    }
    /** Reset for the next set */
    resetSet() {
        this.repHistory = [];
        this.baselineVelocity = null;
        this.trendFilter.reset();
        this.smoothFilter.reset();
        this.latestReading = null;
    }
}
exports.BarbellVelocityTracker = BarbellVelocityTracker;
//# sourceMappingURL=index.js.map