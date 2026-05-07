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
export interface PPGSample {
    timestamp: number;
    rawRed: number;
    filtered: number;
}
export interface HeartRateMeasurement {
    bpm: number;
    confidence: number;
    timestamp: number;
}
export declare class PPGProcessor {
    private bpFilter;
    private bpmSmooth;
    private threshold;
    private sampleBuffer;
    private lastBPM;
    /**
     * Feed one video frame into the processor.
     * Call this from your animation loop / ImageCapture.
     * @param imageData  ImageData from canvas.getImageData()
     * @returns          Latest HR estimate if enough data; null otherwise
     */
    procesFrame(imageData: ImageData): HeartRateMeasurement | null;
    /**
     * Extract the mean red-channel value from an ImageData frame.
     * The red channel is most sensitive to blood volume changes.
     */
    private extractRedChannel;
    /**
     * Compute BPM from the current sample buffer using peak detection.
     */
    private estimate;
    /** Returns the last known BPM, or null if never measured */
    getLastBPM(): number | null;
    reset(): void;
}
//# sourceMappingURL=ppg-processor.d.ts.map