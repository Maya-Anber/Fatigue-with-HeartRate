/**
 * @module fatigue-engine/rest-calculator
 * RestTimeCalculator — monitors heart rate until it falls below the recovery threshold.
 *
 * Algorithm:
 *   1. Poll the aggregator snapshot every `pollIntervalMs`
 *   2. Block until HR < hrMax * hrRecoveryRatio
 *   3. Emit progress events during the wait
 *   4. Resolve when condition is met or timeout occurs
 */

import { DataAggregator } from '../aggregator';

export interface RestProgress {
  currentHR: number | null;
  targetHR: number;
  elapsedSec: number;
  percentRecovered: number;  // 0–100
}

export interface RestCalculatorConfig {
  /** hrMax × this ratio = recovery target. Default: 0.6 */
  hrRecoveryRatio?: number;
  /** Poll interval ms. Default: 1000 */
  pollIntervalMs?: number;
  /** Hard timeout ms — resolve even if HR not recovered. Default: 300_000 (5 min) */
  timeoutMs?: number;
  /** Minimum rest duration regardless of HR. Default: 30_000 (30s) */
  minRestMs?: number;
}

export type RestProgressCallback = (progress: RestProgress) => void;

export class RestTimeCalculator {
  private cfg: Required<RestCalculatorConfig>;

  constructor(
    private readonly aggregator: DataAggregator,
    private readonly hrMax: number,
    config: RestCalculatorConfig = {}
  ) {
    this.cfg = {
      hrRecoveryRatio: config.hrRecoveryRatio ?? 0.6,
      pollIntervalMs: config.pollIntervalMs ?? 1000,
      timeoutMs: config.timeoutMs ?? 300_000,
      minRestMs: config.minRestMs ?? 30_000,
    };
  }

  /**
   * Wait until HR falls below hrMax × hrRecoveryRatio.
   * @param onProgress  Called every poll with current recovery status.
   * @returns           Elapsed rest time in milliseconds.
   */
  async wait(onProgress?: RestProgressCallback): Promise<number> {
    const targetHR = this.hrMax * this.cfg.hrRecoveryRatio;
    const startTime = Date.now();
    const deadline = startTime + this.cfg.timeoutMs;

    return new Promise((resolve) => {
      const tick = () => {
        const now = Date.now();
        const elapsed = now - startTime;
        const snapshot = this.aggregator.snapshot();
        const currentHR = snapshot.heartRate;

        // Compute progress percentage
        const hrAtStart = Math.max(currentHR ?? targetHR, targetHR);
        const percentRecovered = currentHR !== null
          ? Math.min(100, ((hrAtStart - currentHR) / (hrAtStart - targetHR)) * 100)
          : 0;

        onProgress?.({
          currentHR,
          targetHR: Math.round(targetHR),
          elapsedSec: Math.round(elapsed / 1000),
          percentRecovered: Math.max(0, Math.round(percentRecovered)),
        });

        const hrOk = currentHR === null || currentHR <= targetHR;
        const minRestOk = elapsed >= this.cfg.minRestMs;
        const timedOut = now >= deadline;

        if ((hrOk && minRestOk) || timedOut) {
          resolve(elapsed);
        } else {
          setTimeout(tick, this.cfg.pollIntervalMs);
        }
      };

      // Start after one poll interval
      setTimeout(tick, this.cfg.pollIntervalMs);
    });
  }
}
