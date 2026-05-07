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
    percentRecovered: number;
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
export declare class RestTimeCalculator {
    private readonly aggregator;
    private readonly hrMax;
    private cfg;
    constructor(aggregator: DataAggregator, hrMax: number, config?: RestCalculatorConfig);
    /**
     * Wait until HR falls below hrMax × hrRecoveryRatio.
     * @param onProgress  Called every poll with current recovery status.
     * @returns           Elapsed rest time in milliseconds.
     */
    wait(onProgress?: RestProgressCallback): Promise<number>;
}
//# sourceMappingURL=rest-calculator.d.ts.map