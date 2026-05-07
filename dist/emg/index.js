"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMGMonitor = exports.EMGProcessor = void 0;
const filters_1 = require("../utils/filters");
const math_1 = require("../utils/math");
/**
 * EMG Signal Processor.
 * Feed raw ADC/μV samples in chunks (epochs) and receive fatigue metrics.
 */
class EMGProcessor {
    constructor(config = {}) {
        this.epochBuffer = [];
        this.cfg = {
            sampleRateHz: config.sampleRateHz ?? 1000,
            baselineRMS: config.baselineRMS ?? 100,
            baselineMedianFreq: config.baselineMedianFreq ?? 80,
            epochSize: config.epochSize ?? 200,
        };
        this.baselineRMS = this.cfg.baselineRMS;
        this.baselineFreq = this.cfg.baselineMedianFreq;
        this.rmsFilter = new filters_1.EMAFilter(0.25);
        this.freqFilter = new filters_1.SMAFilter(5);
        this.spikeFilter = new filters_1.MedianFilter(5);
    }
    /**
     * Push raw EMG samples. Process when a full epoch is available.
     * @param samples  Array of raw EMG values (μV or ADC units)
     */
    push(samples) {
        // De-spike each sample before buffering
        const cleaned = samples.map(s => this.spikeFilter.update(s));
        this.epochBuffer.push(...cleaned);
        if (this.epochBuffer.length < this.cfg.epochSize)
            return null;
        const epoch = this.epochBuffer.splice(0, this.cfg.epochSize);
        return this.analyzeEpoch(epoch);
    }
    /**
     * Analyze one epoch and return EMG metrics.
     */
    analyzeEpoch(epoch) {
        // 1. RMS amplitude
        const rawRMS = (0, math_1.rms)(epoch);
        const smoothedRMS = this.rmsFilter.update(rawRMS);
        // 2. Median frequency via DFT magnitude spectrum
        const mf = this.estimateMedianFrequency(epoch);
        const smoothedMF = this.freqFilter.update(mf);
        // 3. Fatigue score: combines RMS increase and MF decrease
        //    RMS rises with fatigue (more motor unit recruitment)
        //    MF drops with fatigue (muscle fiber conduction slows)
        const rmsRatio = smoothedRMS / this.baselineRMS; // >1 = more fatigued
        const mfRatio = this.baselineFreq / smoothedMF; // >1 = more fatigued
        const fatigueScore = Math.min(1, ((rmsRatio - 1) * 0.4 + (mfRatio - 1) * 0.6));
        return {
            timestamp: Date.now(),
            rawValues: epoch,
            rmsAmplitude: parseFloat(smoothedRMS.toFixed(2)),
            medianFrequency: parseFloat(smoothedMF.toFixed(2)),
            fatigueScore: parseFloat(Math.max(0, fatigueScore).toFixed(3)),
        };
    }
    /**
     * Estimate median frequency using a simplified DFT.
     * The median frequency (MF) is the frequency that divides the power spectrum in half.
     * Falls with fatigue due to slowing of muscle fiber conduction velocity.
     *
     * Complexity: O(N * bins) where bins ≈ N/2 — suitable for epoch sizes ≤ 512.
     */
    estimateMedianFrequency(epoch) {
        const N = epoch.length;
        const freqResolution = this.cfg.sampleRateHz / N;
        const numBins = Math.floor(N / 2);
        // Compute power spectrum via DFT (real input)
        const powerSpectrum = new Array(numBins).fill(0);
        for (let k = 0; k < numBins; k++) {
            let re = 0, im = 0;
            for (let n = 0; n < N; n++) {
                const angle = (2 * Math.PI * k * n) / N;
                re += epoch[n] * Math.cos(angle);
                im -= epoch[n] * Math.sin(angle);
            }
            powerSpectrum[k] = (re * re + im * im) / N;
        }
        const totalPower = powerSpectrum.reduce((a, b) => a + b, 0);
        let cumPower = 0;
        for (let k = 0; k < numBins; k++) {
            cumPower += powerSpectrum[k];
            if (cumPower >= totalPower / 2) {
                return k * freqResolution;
            }
        }
        return freqResolution * numBins; // fallback
    }
    /**
     * Calibrate: record baseline from a fresh (non-fatigued) epoch.
     * Call this at the start of the workout.
     */
    calibrate(epoch) {
        this.baselineRMS = (0, math_1.rms)(epoch);
        this.baselineFreq = this.estimateMedianFrequency(epoch);
    }
    reset() {
        this.rmsFilter.reset();
        this.freqFilter.reset();
        this.spikeFilter.reset();
        this.epochBuffer = [];
    }
}
exports.EMGProcessor = EMGProcessor;
/**
 * EMG Monitor — wraps EMGProcessor with a data-push interface.
 * In production, feed this from Web Serial API or a WebSocket bridge.
 */
class EMGMonitor {
    constructor(config = {}) {
        this.listeners = [];
        this.latestSample = null;
        this.processor = new EMGProcessor(config);
    }
    /** Push raw samples. Fires 'reading' listeners when a full epoch is ready. */
    push(samples) {
        const result = this.processor.push(samples);
        if (result) {
            this.latestSample = result;
            this.listeners.forEach(fn => fn(result));
        }
    }
    on(_event, listener) {
        this.listeners.push(listener);
        return this;
    }
    getLatest() {
        return this.latestSample;
    }
    calibrate(freshEpoch) {
        this.processor.calibrate(freshEpoch);
    }
    reset() {
        this.processor.reset();
        this.latestSample = null;
    }
}
exports.EMGMonitor = EMGMonitor;
//# sourceMappingURL=index.js.map