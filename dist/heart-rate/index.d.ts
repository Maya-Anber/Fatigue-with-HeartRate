/**
 * @module heart-rate
 * Heart Rate Monitor using rear camera PPG (Photoplethysmography).
 *
 * Usage (browser):
 *   const hr = new HeartRateMonitor();
 *   await hr.start();
 *   hr.on('reading', (data) => console.log(data.bpm));
 *
 * How it works:
 *   - Requests rear camera via getUserMedia (with torch/flash if available)
 *   - Renders frames to an off-screen canvas
 *   - Extracts red-channel mean per frame (~30fps)
 *   - Runs PPG processor to derive BPM via peak detection
 */
import { HeartRateMeasurement } from './ppg-processor';
export type { HeartRateMeasurement };
export type HREvent = 'reading' | 'error' | 'started' | 'stopped';
export interface HRMonitorConfig {
    /** Frames to skip between processing (0 = every frame). Default 0 */
    frameSkip?: number;
    /** Whether to use the torch/flash (improves PPG quality). Default true */
    torch?: boolean;
    /** Callback polling interval ms — how often to fire 'reading' events. Default 1000 */
    emitIntervalMs?: number;
}
/**
 * Browser-side Heart Rate Monitor.
 * Wraps getUserMedia + canvas + PPGProcessor into a simple EventEmitter-like API.
 *
 * NOTE: In a Node.js/Kotlin bridge context, this class is replaced by a
 * WebSocket proxy that relays frames from the native app. See api/server.ts.
 */
export declare class HeartRateMonitor {
    private processor;
    private stream;
    private video;
    private canvas;
    private ctx;
    private rafId;
    private emitTimer;
    private listeners;
    private frameCount;
    private config;
    private latestReading;
    constructor(config?: HRMonitorConfig);
    /** Register an event listener */
    on(event: HREvent, listener: (data: unknown) => void): this;
    private emit;
    /**
     * Start heart rate monitoring.
     * Requests camera permission and begins frame processing.
     */
    start(): Promise<void>;
    /** Stop monitoring and release camera */
    stop(): void;
    /** Get the most recent reading synchronously */
    getLatest(): HeartRateMeasurement | null;
    private startFrameLoop;
    private startEmitLoop;
    private enableTorch;
}
/**
 * Node.js / Server-side stub for HeartRateMonitor.
 * Used when running in the REST/WebSocket API server.
 * Receives BPM updates pushed from the browser client.
 */
export declare class HeartRateMonitorServerProxy {
    private latestReading;
    private listeners;
    /** Called by the WebSocket handler when a client pushes a new reading */
    ingest(reading: HeartRateMeasurement): void;
    on(_event: 'reading', listener: (data: HeartRateMeasurement) => void): this;
    getLatest(): HeartRateMeasurement | null;
}
//# sourceMappingURL=index.d.ts.map