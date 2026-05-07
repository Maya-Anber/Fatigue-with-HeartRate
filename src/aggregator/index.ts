/**
 * @module aggregator
 * Synchronized multi-signal Data Aggregator.
 *
 * Collects heart rate, EMG, and barbell velocity readings on their own
 * natural cadences and produces a unified, normalized snapshot on demand
 * or on a fixed polling interval.
 *
 * Design decisions:
 *   - Each signal is stored with its timestamp; the aggregator uses
 *     recency windows to accept or reject stale data.
 *   - Missing signals are flagged but do NOT block the pipeline —
 *     the fatigue engine gracefully handles partial inputs.
 *   - All values are normalized to [0, 1] for the ML/fatigue layer.
 */

import { HeartRateMeasurement } from '../heart-rate';
import { EMGSample } from '../emg';
import { VelocityReading } from '../barbell';
import { normalize, clamp } from '../utils/math';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SignalSnapshot {
  timestamp: number;

  // Raw values (for display / logging)
  heartRate: number | null;          // BPM
  hrConfidence: number | null;       // 0–1
  emgFatigue: number | null;         // 0–1
  emgRMS: number | null;             // μV
  emgMedianFreq: number | null;      // Hz
  velocityMps: number | null;        // m/s
  velocityLossPct: number | null;    // %

  // Normalized inputs for fatigue engine [0–1]
  norm: {
    hrRatio: number | null;          // current_hr / hr_max
    emgFatigue: number | null;       // already normalized
    velocityLoss: number | null;     // 0 = no loss, 1 = full threshold exceeded
  };

  // Data quality flags
  quality: {
    hrFresh: boolean;                // HR reading is <5s old
    emgFresh: boolean;               // EMG reading is <2s old
    velocityFresh: boolean;          // Velocity reading is <30s old
  };
}

export interface AggregatorConfig {
  /** Athlete's predicted maximum heart rate (220 - age). Required. */
  hrMax: number;
  /** Max velocity loss % before normalization clips to 1.0. Default: 30 */
  maxVelocityLoss?: number;
  /** HR reading expiry in ms. Default: 5000 */
  hrStalenessMs?: number;
  /** EMG reading expiry in ms. Default: 2000 */
  emgStalenessMs?: number;
  /** Velocity reading expiry in ms. Default: 30000 */
  velocityStalenessMs?: number;
  /** Polling interval for snapshot events. 0 = disabled. Default: 500 */
  snapshotIntervalMs?: number;
}

// ─── Aggregator ───────────────────────────────────────────────────────────────

export class DataAggregator {
  private cfg: Required<AggregatorConfig>;
  private latestHR: HeartRateMeasurement | null = null;
  private latestEMG: EMGSample | null = null;
  private latestVelocity: VelocityReading | null = null;
  private listeners: Array<(snapshot: SignalSnapshot) => void> = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(config: AggregatorConfig) {
    this.cfg = {
      hrMax: config.hrMax,
      maxVelocityLoss: config.maxVelocityLoss ?? 30,
      hrStalenessMs: config.hrStalenessMs ?? 5000,
      emgStalenessMs: config.emgStalenessMs ?? 2000,
      velocityStalenessMs: config.velocityStalenessMs ?? 30000,
      snapshotIntervalMs: config.snapshotIntervalMs ?? 500,
    };

    if (this.cfg.snapshotIntervalMs > 0) {
      this.timer = setInterval(() => {
        const snap = this.snapshot();
        this.listeners.forEach(fn => fn(snap));
      }, this.cfg.snapshotIntervalMs);
    }
  }

  // ─── Ingest methods (called by sensor monitors) ──────────────────────────

  ingestHeartRate(reading: HeartRateMeasurement): void {
    this.latestHR = reading;
  }

  ingestEMG(sample: EMGSample): void {
    this.latestEMG = sample;
  }

  ingestVelocity(reading: VelocityReading): void {
    this.latestVelocity = reading;
  }

  // ─── Snapshot ─────────────────────────────────────────────────────────────

  /**
   * Returns the current unified signal snapshot.
   * Always succeeds — missing data fields are null.
   */
  snapshot(): SignalSnapshot {
    const now = Date.now();

    const hrFresh = this.latestHR !== null &&
      (now - this.latestHR.timestamp) < this.cfg.hrStalenessMs;
    const emgFresh = this.latestEMG !== null &&
      (now - this.latestEMG.timestamp) < this.cfg.emgStalenessMs;
    const velocityFresh = this.latestVelocity !== null &&
      (now - this.latestVelocity.timestamp) < this.cfg.velocityStalenessMs;

    const hr = hrFresh ? this.latestHR!.bpm : null;
    const hrConf = hrFresh ? this.latestHR!.confidence : null;
    const emgFatigue = emgFresh ? this.latestEMG!.fatigueScore : null;
    const emgRMS = emgFresh ? this.latestEMG!.rmsAmplitude : null;
    const emgMF = emgFresh ? this.latestEMG!.medianFrequency : null;
    const velMps = velocityFresh ? this.latestVelocity!.velocityMps : null;
    const velLoss = velocityFresh ? this.latestVelocity!.velocityLossPct : null;

    return {
      timestamp: now,
      heartRate: hr,
      hrConfidence: hrConf,
      emgFatigue,
      emgRMS,
      emgMedianFreq: emgMF,
      velocityMps: velMps,
      velocityLossPct: velLoss,
      norm: {
        hrRatio: hr !== null ? clamp(hr / this.cfg.hrMax, 0, 1) : null,
        emgFatigue: emgFatigue,
        velocityLoss: velLoss !== null
          ? normalize(velLoss, 0, this.cfg.maxVelocityLoss)
          : null,
      },
      quality: { hrFresh, emgFresh, velocityFresh },
    };
  }

  on(_event: 'snapshot', listener: (data: SignalSnapshot) => void): this {
    this.listeners.push(listener);
    return this;
  }

  destroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
