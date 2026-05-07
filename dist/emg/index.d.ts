/**
 * @module emg
 * EMG (Electromyography) signal processing module.
 *
 * Computes fatigue indicators from raw EMG signals:
 *   - RMS amplitude (muscle activation level)
 *   - Median frequency shift (fatigue proxy — drops as muscle fatigues)
 *   - Normalized fatigue score [0–1]
 *
 * Input source: Web Serial API (physical sensor) or simulated data.
 * The module is sensor-agnostic; it accepts raw float arrays.
 */
export interface EMGSample {
    timestamp: number;
    rawValues: number[];
    rmsAmplitude: number;
    medianFrequency: number;
    fatigueScore: number;
}
export interface EMGConfig {
    /** Sample rate of the EMG sensor in Hz. Default 1000 */
    sampleRateHz?: number;
    /** Baseline RMS recorded when fresh (μV). Default 100 */
    baselineRMS?: number;
    /** Baseline median frequency when fresh (Hz). Default 80 */
    baselineMedianFreq?: number;
    /** Window size for each analysis epoch (samples). Default 200 */
    epochSize?: number;
}
/**
 * EMG Signal Processor.
 * Feed raw ADC/μV samples in chunks (epochs) and receive fatigue metrics.
 */
export declare class EMGProcessor {
    private cfg;
    private rmsFilter;
    private freqFilter;
    private spikeFilter;
    private baselineRMS;
    private baselineFreq;
    private epochBuffer;
    constructor(config?: EMGConfig);
    /**
     * Push raw EMG samples. Process when a full epoch is available.
     * @param samples  Array of raw EMG values (μV or ADC units)
     */
    push(samples: number[]): EMGSample | null;
    /**
     * Analyze one epoch and return EMG metrics.
     */
    private analyzeEpoch;
    /**
     * Estimate median frequency using a simplified DFT.
     * The median frequency (MF) is the frequency that divides the power spectrum in half.
     * Falls with fatigue due to slowing of muscle fiber conduction velocity.
     *
     * Complexity: O(N * bins) where bins ≈ N/2 — suitable for epoch sizes ≤ 512.
     */
    private estimateMedianFrequency;
    /**
     * Calibrate: record baseline from a fresh (non-fatigued) epoch.
     * Call this at the start of the workout.
     */
    calibrate(epoch: number[]): void;
    reset(): void;
}
/**
 * EMG Monitor — wraps EMGProcessor with a data-push interface.
 * In production, feed this from Web Serial API or a WebSocket bridge.
 */
export declare class EMGMonitor {
    private processor;
    private listeners;
    private latestSample;
    constructor(config?: EMGConfig);
    /** Push raw samples. Fires 'reading' listeners when a full epoch is ready. */
    push(samples: number[]): void;
    on(_event: 'reading', listener: (data: EMGSample) => void): this;
    getLatest(): EMGSample | null;
    calibrate(freshEpoch: number[]): void;
    reset(): void;
}
//# sourceMappingURL=index.d.ts.map