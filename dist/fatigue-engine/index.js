"use strict";
/**
 * @module fatigue-engine
 * FatigueEngine — main workout loop orchestrator.
 *
 * Implements the MainLoop / RestTimeCalculator / FatigueAssessment
 * procedures from the specification as a clean async state machine.
 *
 *   Engine State Machine:
 *   IDLE → RESTING → ASSESSING → RESTING (loop) → DONE
 *
 * Usage:
 *   const engine = new FatigueEngine(aggregator, { hrMax: 185 });
 *   engine.on('state', (e) => updateUI(e));
 *   engine.startWorkout();
 *   engine.recordSetComplete();  // call after each set
 *   engine.endWorkout();
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FatigueAssessment = exports.RestTimeCalculator = exports.FatigueEngine = void 0;
const rest_calculator_1 = require("./rest-calculator");
Object.defineProperty(exports, "RestTimeCalculator", { enumerable: true, get: function () { return rest_calculator_1.RestTimeCalculator; } });
const fatigue_assessment_1 = require("./fatigue-assessment");
Object.defineProperty(exports, "FatigueAssessment", { enumerable: true, get: function () { return fatigue_assessment_1.FatigueAssessment; } });
// ─── Engine ──────────────────────────────────────────────────────────────────
class FatigueEngine {
    constructor(aggregator, config) {
        this.aggregator = aggregator;
        this.config = config;
        this.state = 'idle';
        this.setNumber = 0;
        this.stateListeners = [];
        this.progressListeners = [];
        // Signal to break the rest loop from outside (workout ended)
        this.workoutActive = false;
        // Resolves when the user calls recordSetComplete()
        this.setCompleteResolve = null;
        this.restCalc = new rest_calculator_1.RestTimeCalculator(aggregator, config.hrMax, config.rest);
        this.assessment = new fatigue_assessment_1.FatigueAssessment(config.fatigue);
    }
    on(event, listener) {
        if (event === 'state')
            this.stateListeners.push(listener);
        if (event === 'progress')
            this.progressListeners.push(listener);
        return this;
    }
    /**
     * Start the workout loop.
     * This is non-blocking — it runs as a background async loop.
     */
    startWorkout() {
        if (this.workoutActive)
            return;
        this.workoutActive = true;
        this.setNumber = 0;
        this.mainLoop().catch(console.error);
    }
    /**
     * Call this after the athlete completes each set.
     * Signals the engine to proceed to the fatigue assessment phase.
     */
    recordSetComplete() {
        this.setCompleteResolve?.();
        this.setCompleteResolve = null;
    }
    /** End the workout cleanly. */
    endWorkout() {
        this.workoutActive = false;
        this.setCompleteResolve?.();
        this.transition('done', 'Workout complete. Great work!');
    }
    // ─── Private state machine ────────────────────────────────────────────────
    async mainLoop() {
        while (this.workoutActive) {
            this.setNumber++;
            // ── Phase 1: REST ──────────────────────────────────────────────────
            await this.restPhase();
            if (!this.workoutActive)
                break;
            // ── Phase 2: SET (wait for athlete to complete it) ─────────────────
            this.transition('set', `Perform set #${this.setNumber} now.`);
            await this.waitForSetComplete();
            if (!this.workoutActive)
                break;
            // ── Phase 3: ASSESS ────────────────────────────────────────────────
            await this.assessPhase();
        }
    }
    /**
     * RestTimeCalculator: wait until HR < 0.6 × hrMax.
     * If additional rest is needed after assessment, this is called again.
     */
    async restPhase(additionalSec = 0) {
        const label = additionalSec > 0
            ? `Additional ${additionalSec}s rest recommended.`
            : `Rest until heart rate recovers.`;
        this.transition('resting', label);
        const onProgress = (prog) => {
            this.progressListeners.forEach(fn => fn(prog));
        };
        const elapsed = await this.restCalc.wait(onProgress);
        this.transition('resting', `Initial rest complete after ${Math.round(elapsed / 1000)}s.`);
    }
    /**
     * FatigueAssessment: evaluate signals. If fatigued, rest again recursively.
     * Max 2 recursive rest cycles to avoid infinite loops.
     */
    async assessPhase(depth = 0) {
        if (depth > 1)
            return; // safety cap
        this.transition('assessing', 'Evaluating fatigue signals…');
        const snapshot = this.aggregator.snapshot();
        const result = this.assessment.evaluate(snapshot);
        this.emit('state', {
            state: 'assessing',
            setNumber: this.setNumber,
            message: result.recommendation,
            data: result,
        });
        if (!result.ready && result.additionalRestSec > 0) {
            await this.additionalRestPhase(result.additionalRestSec);
            await this.assessPhase(depth + 1); // re-evaluate after additional rest
        }
    }
    async additionalRestPhase(seconds) {
        this.transition('resting', `Additional rest: ${seconds}s`);
        await new Promise(resolve => {
            let remaining = seconds;
            const tick = () => {
                this.progressListeners.forEach(fn => fn({
                    currentHR: this.aggregator.snapshot().heartRate,
                    targetHR: Math.round(this.config.hrMax * 0.6),
                    elapsedSec: seconds - remaining,
                    percentRecovered: Math.round(((seconds - remaining) / seconds) * 100),
                }));
                remaining--;
                if (remaining > 0 && this.workoutActive)
                    setTimeout(tick, 1000);
                else
                    resolve();
            };
            setTimeout(tick, 1000);
        });
    }
    /** Wait for recordSetComplete() to be called */
    waitForSetComplete() {
        return new Promise(resolve => {
            this.setCompleteResolve = resolve;
        });
    }
    transition(state, message) {
        this.state = state;
        this.emit('state', { state, setNumber: this.setNumber, message });
    }
    emit(event, data) {
        this.stateListeners.forEach(fn => fn(data));
    }
    getState() { return this.state; }
    getSetNumber() { return this.setNumber; }
}
exports.FatigueEngine = FatigueEngine;
//# sourceMappingURL=index.js.map