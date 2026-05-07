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
  fatigueIndex: number;          // 0–1 composite fatigue score
  additionalRestSec: number;     // recommended extra rest (0 if ready)
  breakdown: {
    hrContribution: number;
    emgContribution: number;
    velocityContribution: number;
  };
  recommendation: string;        // human-readable message
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
  weights?: { emg: number; velocity: number; hr: number };
  /** Base additional rest in seconds when fatigued. Default: 30 */
  baseAdditionalRestSec?: number;
}

export class FatigueAssessment {
  private cfg: Required<FatigueAssessmentConfig>;

  constructor(config: FatigueAssessmentConfig = {}) {
    this.cfg = {
      emgFatigueThreshold: config.emgFatigueThreshold ?? 0.6,
      velocityLossThreshold: config.velocityLossThreshold ?? 20,
      hrRatioThreshold: config.hrRatioThreshold ?? 0.7,
      weights: config.weights ?? { emg: 0.30, velocity: 0.40, hr: 0.30 },
      baseAdditionalRestSec: config.baseAdditionalRestSec ?? 30,
    };
  }

  /**
   * Evaluate a SignalSnapshot after a set.
   * @param snapshot  Current aggregator snapshot (taken immediately post-set)
   */
  evaluate(snapshot: SignalSnapshot): ReadinessResult {
    const { norm, velocityLossPct } = snapshot;

    // ── EMG contribution ─────────────────────────────────────────────────
    const emgScore = norm.emgFatigue ?? 0;
    const emgContribution = Math.min(1, emgScore / this.cfg.emgFatigueThreshold);

    // ── Velocity contribution (trend-aware) ──────────────────────────────
    const velLoss = norm.velocityLoss ?? 0;   // already normalized [0–1]
    // Extra penalty if velocity is declining across reps (passed in as loss %)
    const rawLoss = velocityLossPct ?? 0;
    const trendPenalty = rawLoss > this.cfg.velocityLossThreshold ? 0.15 : 0;
    const velocityContribution = Math.min(1, velLoss + trendPenalty);

    // ── HR contribution (confidence-weighted) ────────────────────────────
    const hrRatio = norm.hrRatio ?? 0;
    const hrConf = snapshot.hrConfidence ?? 0;
    const hrContribution = Math.min(1, (hrRatio / this.cfg.hrRatioThreshold) * hrConf);

    // ── Composite fatigue index ───────────────────────────────────────────
    const { emg: we, velocity: wv, hr: wh } = this.cfg.weights;
    const fatigueIndex =
      we * emgContribution +
      wv * velocityContribution +
      wh * hrContribution;

    const ready = fatigueIndex < 0.5;

    // ── Additional rest recommendation ───────────────────────────────────
    // Scale extra rest linearly with fatigue index above the threshold
    const additionalRestSec = ready ? 0 :
      Math.round(this.cfg.baseAdditionalRestSec * (fatigueIndex - 0.5) / 0.5);

    const recommendation = this.buildRecommendation(ready, fatigueIndex, {
      emgContribution, velocityContribution, hrContribution,
    });

    return {
      ready,
      fatigueIndex: parseFloat(fatigueIndex.toFixed(3)),
      additionalRestSec,
      breakdown: {
        hrContribution: parseFloat(hrContribution.toFixed(3)),
        emgContribution: parseFloat(emgContribution.toFixed(3)),
        velocityContribution: parseFloat(velocityContribution.toFixed(3)),
      },
      recommendation,
    };
  }

  private buildRecommendation(
    ready: boolean,
    fi: number,
    breakdown: { emgContribution: number; velocityContribution: number; hrContribution: number }
  ): string {
    if (ready) return '✅ Ready for next set. Fatigue within acceptable limits.';

    const signals: string[] = [];
    if (breakdown.emgContribution > 0.6) signals.push('high EMG fatigue');
    if (breakdown.velocityContribution > 0.6) signals.push('velocity loss');
    if (breakdown.hrContribution > 0.6) signals.push('elevated heart rate');

    const severity = fi > 0.8 ? 'High' : 'Moderate';
    return `⚠️ ${severity} fatigue detected (${signals.join(', ')}). Rest recommended.`;
  }
}
