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

import { MedianFilter, EMAFilter, SMAFilter } from '../utils/filters';
import { rms } from '../utils/math';

export interface EMGSample {
  timestamp: number;
  rawValues: number[];      // raw ADC readings from sensor
  rmsAmplitude: number;     // muscle activation level (μV RMS)
  medianFrequency: number;  // Hz — fatigue indicator
  fatigueScore: number;     // 0 = fresh, 1 = fully fatigued
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
export class EMGProcessor {
  private cfg: Required<EMGConfig>;
  private rmsFilter: EMAFilter;
  private freqFilter: SMAFilter;
  private spikeFilter: MedianFilter;

  private baselineRMS: number;
  private baselineFreq: number;
  private epochBuffer: number[] = [];

  constructor(config: EMGConfig = {}) {
    this.cfg = {
      sampleRateHz: config.sampleRateHz ?? 1000,
      baselineRMS: config.baselineRMS ?? 100,
      baselineMedianFreq: config.baselineMedianFreq ?? 80,
      epochSize: config.epochSize ?? 200,
    };
    this.baselineRMS = this.cfg.baselineRMS;
    this.baselineFreq = this.cfg.baselineMedianFreq;
    this.rmsFilter = new EMAFilter(0.25);
    this.freqFilter = new SMAFilter(5);
    this.spikeFilter = new MedianFilter(5);
  }

  /**
   * Push raw EMG samples. Process when a full epoch is available.
   * @param samples  Array of raw EMG values (μV or ADC units)
   */
  push(samples: number[]): EMGSample | null {
    // De-spike each sample before buffering
    const cleaned = samples.map(s => this.spikeFilter.update(s));
    this.epochBuffer.push(...cleaned);

    if (this.epochBuffer.length < this.cfg.epochSize) return null;

    const epoch = this.epochBuffer.splice(0, this.cfg.epochSize);
    return this.analyzeEpoch(epoch);
  }

  /**
   * Analyze one epoch and return EMG metrics.
   */
  private analyzeEpoch(epoch: number[]): EMGSample {
    // 1. RMS amplitude
    const rawRMS = rms(epoch);
    const smoothedRMS = this.rmsFilter.update(rawRMS);

    // 2. Median frequency via DFT magnitude spectrum
    const mf = this.estimateMedianFrequency(epoch);
    const smoothedMF = this.freqFilter.update(mf);

    // 3. Fatigue score: combines RMS increase and MF decrease
    //    RMS rises with fatigue (more motor unit recruitment)
    //    MF drops with fatigue (muscle fiber conduction slows)
    const rmsRatio = smoothedRMS / this.baselineRMS;     // >1 = more fatigued
    const mfRatio = this.baselineFreq / smoothedMF;      // >1 = more fatigued
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
  private estimateMedianFrequency(epoch: number[]): number {
    const N = epoch.length;
    const freqResolution = this.cfg.sampleRateHz / N;
    const numBins = Math.floor(N / 2);

    // Compute power spectrum via DFT (real input)
    const powerSpectrum: number[] = new Array(numBins).fill(0);
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
  calibrate(epoch: number[]): void {
    this.baselineRMS = rms(epoch);
    this.baselineFreq = this.estimateMedianFrequency(epoch);
  }

  reset(): void {
    this.rmsFilter.reset();
    this.freqFilter.reset();
    this.spikeFilter.reset();
    this.epochBuffer = [];
  }
}

// ─── Bluetooth Packet Parser ──────────────────────────────────────────────────

/**
 * Parse ESP32 EMG/IMU packets.
 * 
 * Packet format (CSV):
 *   EMG: timestamp,EMG,raw_signal,butterworth_filtered,rms_filtered,wearing_detection
 *   IMU: timestamp,IMU,roll,pitch,yaw
 */
export interface BluetoothPacket {
  timestamp: number;
  type: 'EMG' | 'IMU';
  emg?: {
    raw: number;
    butterworth: number;
    rms: number;
    wearingDetection: boolean;
  };
  imu?: {
    roll: number;
    pitch: number;
    yaw: number;
  };
}

export function parseBluetoothPacket(line: string): BluetoothPacket | null {
  const parts = line.trim().split(',');
  if (parts.length < 3) return null;

  const timestamp = parseInt(parts[0], 10);
  const type = parts[1].toUpperCase();

  if (type === 'EMG' && parts.length >= 6) {
    return {
      timestamp,
      type: 'EMG',
      emg: {
        raw: parseFloat(parts[2]),
        butterworth: parseFloat(parts[3]),
        rms: parseFloat(parts[4]),
        wearingDetection: parts[5].toLowerCase() === 'true',
      },
    };
  }

  if (type === 'IMU' && parts.length >= 5) {
    return {
      timestamp,
      type: 'IMU',
      imu: {
        roll: parseFloat(parts[2]),
        pitch: parseFloat(parts[3]),
        yaw: parseFloat(parts[4]),
      },
    };
  }

  return null;
}

// ─── EMG Monitor (Bluetooth-aware wrapper) ────────────────────────────────────

export interface EMGMonitorConfig extends EMGConfig {
  /** Buffer size for raw samples before processing. Default 200 */
  bufferSize?: number;
}

export class EMGMonitor {
  private processor: EMGProcessor;
  private rawBuffer: number[] = [];
  private listeners: Array<(sample: EMGSample) => void> = [];
  private latestSample: EMGSample | null = null;
  private config: Required<EMGConfig> & { bufferSize: number };

  constructor(config: EMGMonitorConfig = {}) {
    this.config = {
      sampleRateHz: config.sampleRateHz ?? 1000,
      baselineRMS: config.baselineRMS ?? 100,
      baselineMedianFreq: config.baselineMedianFreq ?? 80,
      epochSize: config.epochSize ?? 200,
      bufferSize: config.bufferSize ?? 200,
    };
    this.processor = new EMGProcessor(config);
  }

  /**
   * Ingest a Bluetooth EMG packet.
   * Buffers raw samples; emits EMGSample when epoch is complete.
   */
  ingestBluetoothPacket(packet: BluetoothPacket): void {
    if (packet.type !== 'EMG' || !packet.emg?.wearingDetection) return;
    this.rawBuffer.push(packet.emg.raw);

    if (this.rawBuffer.length >= this.config.bufferSize) {
      const chunk = this.rawBuffer.splice(0, this.config.bufferSize);
      const sample = this.processor.push(chunk);
      if (sample) this.emit(sample);
    }
  }

  /**
   * Ingest raw samples directly (for testing or non-Bluetooth sources).
   */
  ingestRawSamples(samples: number[]): void {
    const sample = this.processor.push(samples);
    if (sample) this.emit(sample);
  }

  push(samples: number[]): void {
    this.ingestRawSamples(samples);
  }

  calibrate(samples: number[]): void {
    this.processor.calibrate(samples);
  }

  on(event: 'reading', listener: (sample: EMGSample) => void): this {
    if (event === 'reading') this.listeners.push(listener);
    return this;
  }

  private emit(sample: EMGSample): void {
    this.latestSample = sample;
    this.listeners.forEach(fn => fn(sample));
  }

  getLatest(): EMGSample | null {
    return this.latestSample;
  }

  reset(): void {
    this.processor.reset();
    this.rawBuffer = [];
    this.latestSample = null;
  }
}
