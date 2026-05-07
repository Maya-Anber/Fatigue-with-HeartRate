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
export interface SignalSnapshot {
    timestamp: number;
    heartRate: number | null;
    hrConfidence: number | null;
    emgFatigue: number | null;
    emgRMS: number | null;
    emgMedianFreq: number | null;
    velocityMps: number | null;
    velocityLossPct: number | null;
    norm: {
        hrRatio: number | null;
        emgFatigue: number | null;
        velocityLoss: number | null;
    };
    quality: {
        hrFresh: boolean;
        emgFresh: boolean;
        velocityFresh: boolean;
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
export declare class DataAggregator {
    private cfg;
    private latestHR;
    private latestEMG;
    private latestVelocity;
    private listeners;
    private timer;
    constructor(config: AggregatorConfig);
    ingestHeartRate(reading: HeartRateMeasurement): void;
    ingestEMG(sample: EMGSample): void;
    ingestVelocity(reading: VelocityReading): void;
    /**
     * Returns the current unified signal snapshot.
     * Always succeeds — missing data fields are null.
     */
    snapshot(): SignalSnapshot;
    on(_event: 'snapshot', listener: (data: SignalSnapshot) => void): this;
    destroy(): void;
}
//# sourceMappingURL=index.d.ts.map