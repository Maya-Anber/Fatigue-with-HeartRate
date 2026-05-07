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

import { EMAFilter, SMAFilter } from '../utils/filters';
import { mean } from '../utils/math';

export interface VelocityReading {
  timestamp: number;
  velocityMps: number;         // m/s, concentric phase peak velocity
  velocityLossPct: number;     // % drop from set's first rep
  trend: 'improving' | 'stable' | 'declining';
  fatigueFlag: boolean;        // true if loss exceeds threshold
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

export class BarbellVelocityTracker {
  private cfg: Required<BarbellConfig>;
  private repHistory: number[] = [];       // all velocities this set
  private baselineVelocity: number | null = null;
  private trendFilter: EMAFilter;
  private smoothFilter: SMAFilter;
  private latestReading: VelocityReading | null = null;
  private listeners: Array<(r: VelocityReading) => void> = [];

  constructor(config: BarbellConfig = {}) {
    this.cfg = {
      velocityLossThreshold: config.velocityLossThreshold ?? 20,
      baselineReps: config.baselineReps ?? 1,
      trendAlpha: config.trendAlpha ?? 0.3,
    };
    this.trendFilter = new EMAFilter(this.cfg.trendAlpha);
    this.smoothFilter = new SMAFilter(3);
  }

  /**
   * Push a new rep's peak concentric velocity (m/s).
   * Returns a VelocityReading with loss, trend, and fatigue flag.
   */
  push(velocityMps: number): VelocityReading {
    const smoothed = this.smoothFilter.update(velocityMps);
    this.repHistory.push(smoothed);
    const repNumber = this.repHistory.length;

    // Establish baseline from the first N reps
    if (repNumber <= this.cfg.baselineReps) {
      this.baselineVelocity = mean(this.repHistory.slice(0, this.cfg.baselineReps));
    }

    const baseline = this.baselineVelocity ?? smoothed;
    const velocityLossPct = Math.max(0, ((baseline - smoothed) / baseline) * 100);
    const fatigueFlag = velocityLossPct >= this.cfg.velocityLossThreshold;

    // Trend: compare EMA of recent velocity to previous
    const trendValue = this.trendFilter.update(smoothed);
    const prevTrend = repNumber > 1 ? this.repHistory[repNumber - 2] : smoothed;
    const delta = trendValue - prevTrend;
    const trend: VelocityReading['trend'] =
      delta > 0.02 ? 'improving' :
      delta < -0.02 ? 'declining' :
      'stable';

    const reading: VelocityReading = {
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

  on(_event: 'rep', listener: (data: VelocityReading) => void): this {
    this.listeners.push(listener);
    return this;
  }

  getLatest(): VelocityReading | null {
    return this.latestReading;
  }

  /** Velocity loss of the latest rep vs. baseline, or null if not enough data */
  getVelocityLossPct(): number | null {
    return this.latestReading?.velocityLossPct ?? null;
  }

  /** Reset for the next set */
  resetSet(): void {
    this.repHistory = [];
    this.baselineVelocity = null;
    this.trendFilter.reset();
    this.smoothFilter.reset();
    this.latestReading = null;
  }
}
