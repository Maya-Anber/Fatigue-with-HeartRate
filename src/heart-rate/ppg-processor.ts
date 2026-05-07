/**
 * @module heart-rate/ppg-processor
 * PPG (Photoplethysmography) signal processor.
 *
 * Extracts heart rate from the red channel of camera frames.
 * Algorithm:
 *   1. Sample red-channel mean from each video frame (30fps)
 *   2. Bandpass filter to isolate cardiac band (0.5–3.5 Hz)
 *   3. Detect peaks using adaptive threshold
 *   4. Compute BPM from inter-peak intervals
 *   5. Validate and smooth the final BPM estimate
 */

import { BandpassFilter, EMAFilter, AdaptiveThreshold } from '../utils/filters';
import { findPeaks, mean } from '../utils/math';

export interface PPGSample {
  timestamp: number;    // ms since start
  rawRed: number;       // mean red channel [0–255]
  filtered: number;     // bandpass-filtered signal
}

export interface PPGRedChannelSample {
  rawRed: number;
  timestamp?: number;
}

export interface HeartRateMeasurement {
  bpm: number;           // beats per minute
  confidence: number;    // 0–1 (signal quality)
  timestamp: number;
}

const SAMPLE_RATE_HZ = 30;            // camera fps
const ANALYSIS_WINDOW_SEC = 5;        // seconds of history to analyze
const ANALYSIS_WINDOW = SAMPLE_RATE_HZ * ANALYSIS_WINDOW_SEC; // 150 samples
const BPM_MIN = 40;
const BPM_MAX = 200;
const PEAK_MIN_DISTANCE = Math.round(SAMPLE_RATE_HZ * (60 / BPM_MAX)); // ~9 frames

export class PPGProcessor {
  private bpFilter = new BandpassFilter();
  private bpmSmooth = new EMAFilter(0.3);
  private threshold = new AdaptiveThreshold();

  private sampleBuffer: PPGSample[] = [];
  private lastBPM: number | null = null;

  /**
   * Feed one video frame into the processor.
   * Call this from your animation loop / ImageCapture.
   * @param imageData  ImageData from canvas.getImageData()
   * @returns          Latest HR estimate if enough data; null otherwise
   */
  processFrame(imageData: ImageData): HeartRateMeasurement | null {
    const rawRed = this.extractRedChannel(imageData);
    return this.processRedSample({ rawRed });
  }

  /**
   * Backwards-compatible alias for older callers.
   */
  procesFrame(imageData: ImageData): HeartRateMeasurement | null {
    return this.processFrame(imageData);
  }

  /**
   * Feed a raw red-channel sample into the processor.
   * This is the shape used by native mobile frame-capture bridges.
   */
  processRedSample(sample: PPGRedChannelSample): HeartRateMeasurement | null {
    const timestamp = sample.timestamp ?? Date.now();
    const filtered = this.bpFilter.update(sample.rawRed);

    this.sampleBuffer.push({ timestamp, rawRed: sample.rawRed, filtered });
    if (this.sampleBuffer.length > ANALYSIS_WINDOW) {
      this.sampleBuffer.shift();
    }

    // Need at least 4 seconds before estimating
    if (this.sampleBuffer.length < SAMPLE_RATE_HZ * 4) return null;

    return this.estimate();
  }

  /**
   * Extract the mean red-channel value from an ImageData frame.
   * The red channel is most sensitive to blood volume changes.
   */
  private extractRedChannel(imageData: ImageData): number {
    const data = imageData.data; // [R, G, B, A, R, G, B, A, ...]
    let sum = 0;
    const pixelCount = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      sum += data[i]; // red channel
    }
    return sum / pixelCount;
  }

  /**
   * Compute BPM from the current sample buffer using peak detection.
   */
  private estimate(): HeartRateMeasurement | null {
    const signal = this.sampleBuffer.map(s => s.filtered);
    const peaks = findPeaks(signal, PEAK_MIN_DISTANCE);

    if (peaks.length < 2) return null;

    // Compute RR intervals in samples
    const rrIntervals: number[] = [];
    for (let i = 1; i < peaks.length; i++) {
      rrIntervals.push(peaks[i] - peaks[i - 1]);
    }

    // Convert RR intervals (samples) → BPM
    const bpmValues = rrIntervals.map(rr => (SAMPLE_RATE_HZ / rr) * 60);

    // Filter physiologically plausible values
    const validBPMs = bpmValues.filter(b => b >= BPM_MIN && b <= BPM_MAX);
    if (validBPMs.length === 0) return null;

    const rawBPM = mean(validBPMs);
    const smoothedBPM = this.bpmSmooth.update(rawBPM);

    // Confidence: more peaks + low variance = higher confidence
    const variance = validBPMs.reduce((acc, b) => acc + (b - rawBPM) ** 2, 0) / validBPMs.length;
    const confidence = Math.max(0, Math.min(1, 1 - variance / 400)) *
                       Math.min(1, validBPMs.length / 5);

    this.lastBPM = smoothedBPM;

    return {
      bpm: Math.round(smoothedBPM),
      confidence: parseFloat(confidence.toFixed(2)),
      timestamp: Date.now(),
    };
  }

  /** Returns the last known BPM, or null if never measured */
  getLastBPM(): number | null {
    return this.lastBPM;
  }

  reset(): void {
    this.bpFilter.reset();
    this.bpmSmooth.reset();
    this.sampleBuffer = [];
    this.lastBPM = null;
  }
}
