/**
 * @module fatigue-engine/fatigue-assessment
 * FatigueAssessment — evaluates set performance to determine if additional rest is needed.
 *
 * Inputs: EMG fatigue score, velocity loss %, optional HR ratio
 * Output: ReadinessResult — proceed or additional rest recommendation
 *
 * Improvement over binary threshold:
 *   - Weighted composite fatigue index from all signals
 *   - Velocity *trend* considered (deteriorating trend = harsher penalty)
 *   - Confidence-weighted HR contribution
 */
import { SignalSnapshot } from '../aggregator';
export interface ReadinessResult {
    ready: boolean;
    fatigueIndex: number;
    additionalRestSec: number;
    breakdown: {
        hrContribution: number;
        emgContribution: number;
        velocityContribution: number;
    };
    recommendation: string;
}
export interface FatigueAssessmentConfig {
    /** EMG fatigue score threshold [0–1]. Above = fatigued. Default: 0.6 */
    emgFatigueThreshold?: number;
    /** Velocity loss % threshold. Above = fatigued. Default: 20 */
    velocityLossThreshold?: number;
    /** HR ratio threshold (hr/hrMax). Above = not recovered. Default: 0.7 */
    hrRatioThreshold?: number;
    /**
     * Signal weights for composite index. Must sum to ~1.0.
     * Default: { emg: 0.45, velocity: 0.45, hr: 0.10 }
     * Adjust if one signal is unavailable or less trusted.
     */
    weights?: {
        emg: number;
        velocity: number;
        hr: number;
    };
    /** Base additional rest in seconds when fatigued. Default: 30 */
    baseAdditionalRestSec?: number;
}
export declare class FatigueAssessment {
    private cfg;
    constructor(config?: FatigueAssessmentConfig);
    /**
     * Evaluate a SignalSnapshot after a set.
     * @param snapshot  Current aggregator snapshot (taken immediately post-set)
     */
    evaluate(snapshot: SignalSnapshot): ReadinessResult;
    private buildRecommendation;
}
//# sourceMappingURL=fatigue-assessment.d.ts.map