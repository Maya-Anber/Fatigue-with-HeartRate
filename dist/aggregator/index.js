"use strict";
/**
 * @module aggregator
 * Synchronized multi-signal Data Aggregator.
 *
 * Collects heart rate, EMG, and barbell velocity readings on their own
 * natural cadences and produces a unified, normalized snapshot on demand
 * or on a fixed polling interval.
 *
 * Design decisions:
 *   - Each signal is stored with its timestamp; the aggregator uses
 *     recency windows to accept or reject stale data.
 *   - Missing signals are flagged but do NOT block the pipeline —
 *     the fatigue engine gracefully handles partial inputs.
 *   - All values are normalized to [0, 1] for the ML/fatigue layer.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataAggregator = void 0;
const math_1 = require("../utils/math");
// ─── Aggregator ───────────────────────────────────────────────────────────────
class DataAggregator {
    constructor(config) {
        this.latestHR = null;
        this.latestEMG = null;
        this.latestVelocity = null;
        this.listeners = [];
        this.timer = null;
        this.cfg = {
            hrMax: config.hrMax,
            maxVelocityLoss: config.maxVelocityLoss ?? 30,
            hrStalenessMs: config.hrStalenessMs ?? 5000,
            emgStalenessMs: config.emgStalenessMs ?? 2000,
            velocityStalenessMs: config.velocityStalenessMs ?? 30000,
            snapshotIntervalMs: config.snapshotIntervalMs ?? 500,
        };
        if (this.cfg.snapshotIntervalMs > 0) {
            this.timer = setInterval(() => {
                const snap = this.snapshot();
                this.listeners.forEach(fn => fn(snap));
            }, this.cfg.snapshotIntervalMs);
        }
    }
    // ─── Ingest methods (called by sensor monitors) ──────────────────────────
    ingestHeartRate(reading) {
        this.latestHR = reading;
    }
    ingestEMG(sample) {
        this.latestEMG = sample;
    }
    ingestVelocity(reading) {
        this.latestVelocity = reading;
    }
    // ─── Snapshot ─────────────────────────────────────────────────────────────
    /**
     * Returns the current unified signal snapshot.
     * Always succeeds — missing data fields are null.
     */
    snapshot() {
        const now = Date.now();
        const hrFresh = this.latestHR !== null &&
            (now - this.latestHR.timestamp) < this.cfg.hrStalenessMs;
        const emgFresh = this.latestEMG !== null &&
            (now - this.latestEMG.timestamp) < this.cfg.emgStalenessMs;
        const velocityFresh = this.latestVelocity !== null &&
            (now - this.latestVelocity.timestamp) < this.cfg.velocityStalenessMs;
        const hr = hrFresh ? this.latestHR.bpm : null;
        const hrConf = hrFresh ? this.latestHR.confidence : null;
        const emgFatigue = emgFresh ? this.latestEMG.fatigueScore : null;
        const emgRMS = emgFresh ? this.latestEMG.rmsAmplitude : null;
        const emgMF = emgFresh ? this.latestEMG.medianFrequency : null;
        const velMps = velocityFresh ? this.latestVelocity.velocityMps : null;
        const velLoss = velocityFresh ? this.latestVelocity.velocityLossPct : null;
        return {
            timestamp: now,
            heartRate: hr,
            hrConfidence: hrConf,
            emgFatigue,
            emgRMS,
            emgMedianFreq: emgMF,
            velocityMps: velMps,
            velocityLossPct: velLoss,
            norm: {
                hrRatio: hr !== null ? (0, math_1.clamp)(hr / this.cfg.hrMax, 0, 1) : null,
                emgFatigue: emgFatigue,
                velocityLoss: velLoss !== null
                    ? (0, math_1.normalize)(velLoss, 0, this.cfg.maxVelocityLoss)
                    : null,
            },
            quality: { hrFresh, emgFresh, velocityFresh },
        };
    }
    on(_event, listener) {
        this.listeners.push(listener);
        return this;
    }
    destroy() {
        if (this.timer)
            clearInterval(this.timer);
    }
}
exports.DataAggregator = DataAggregator;
//# sourceMappingURL=index.js.map