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

import { PPGProcessor, HeartRateMeasurement } from './ppg-processor';

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
export class HeartRateMonitor {
  private processor = new PPGProcessor();
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private rafId: number | null = null;
  private emitTimer: ReturnType<typeof setInterval> | null = null;
  private listeners: Map<HREvent, Array<(data: unknown) => void>> = new Map();
  private frameCount = 0;
  private config: Required<HRMonitorConfig>;
  private latestReading: HeartRateMeasurement | null = null;

  constructor(config: HRMonitorConfig = {}) {
    this.config = {
      frameSkip: config.frameSkip ?? 0,
      torch: config.torch ?? true,
      emitIntervalMs: config.emitIntervalMs ?? 1000,
    };
  }

  /** Register an event listener */
  on(event: HREvent, listener: (data: unknown) => void): this {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  private emit(event: HREvent, data: unknown): void {
    (this.listeners.get(event) ?? []).forEach(fn => fn(data));
  }

  /**
   * Start heart rate monitoring.
   * Requests camera permission and begins frame processing.
   */
  async start(): Promise<void> {
    if (this.stream) return; // already running

    try {
      // Request rear camera with flash/torch if available
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 320 },    // smaller = faster processing
          height: { ideal: 240 },
          frameRate: { ideal: 30 },
        },
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Attempt to enable torch for better PPG signal
      if (this.config.torch) {
        await this.enableTorch();
      }

      // Set up off-screen video + canvas
      this.video = document.createElement('video');
      this.video.srcObject = this.stream;
      this.video.playsInline = true;
      await this.video.play();

      this.canvas = document.createElement('canvas');
      this.canvas.width = 80;   // downsample for speed
      this.canvas.height = 60;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;

      this.processor.reset();
      this.startFrameLoop();
      this.startEmitLoop();
      this.emit('started', null);
    } catch (err) {
      this.emit('error', err);
      throw err;
    }
  }

  /** Stop monitoring and release camera */
  stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    if (this.emitTimer !== null) clearInterval(this.emitTimer);
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.video = null;
    this.canvas = null;
    this.ctx = null;
    this.processor.reset();
    this.emit('stopped', null);
  }

  /** Get the most recent reading synchronously */
  getLatest(): HeartRateMeasurement | null {
    return this.latestReading;
  }

  private startFrameLoop(): void {
    const tick = () => {
      if (!this.video || !this.ctx || !this.canvas) return;
      this.frameCount++;

      if (this.frameCount % (this.config.frameSkip + 1) === 0) {
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const result = this.processor.procesFrame(imageData);
        if (result) this.latestReading = result;
      }

      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private startEmitLoop(): void {
    this.emitTimer = setInterval(() => {
      if (this.latestReading) {
        this.emit('reading', this.latestReading);
      }
    }, this.config.emitIntervalMs);
  }

  private async enableTorch(): Promise<void> {
    try {
      const track = this.stream?.getVideoTracks()[0];
      if (!track) return;
      const capabilities = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
      if (capabilities?.torch) {
        await track.applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] });
      }
    } catch {
      // Torch not supported — silently continue
    }
  }
}

/**
 * Node.js / Server-side stub for HeartRateMonitor.
 * Used when running in the REST/WebSocket API server.
 * Receives BPM updates pushed from the browser client.
 */
export class HeartRateMonitorServerProxy {
  private latestReading: HeartRateMeasurement | null = null;
  private listeners: Array<(data: HeartRateMeasurement) => void> = [];

  /** Called by the WebSocket handler when a client pushes a new reading */
  ingest(reading: HeartRateMeasurement): void {
    this.latestReading = reading;
    this.listeners.forEach(fn => fn(reading));
  }

  on(_event: 'reading', listener: (data: HeartRateMeasurement) => void): this {
    this.listeners.push(listener);
    return this;
  }

  getLatest(): HeartRateMeasurement | null {
    return this.latestReading;
  }
}
