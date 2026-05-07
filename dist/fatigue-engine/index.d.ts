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
import { DataAggregator } from '../aggregator';
import { RestTimeCalculator, RestCalculatorConfig, RestProgressCallback } from './rest-calculator';
import { FatigueAssessment, FatigueAssessmentConfig, ReadinessResult } from './fatigue-assessment';
export type { ReadinessResult };
export type EngineState = 'idle' | 'resting' | 'assessing' | 'set' | 'done';
export interface StateEvent {
    state: EngineState;
    setNumber: number;
    message: string;
    data?: unknown;
}
export interface RestProgressEvent {
    currentHR: number | null;
    targetHR: number;
    elapsedSec: number;
    percentRecovered: number;
}
export interface FatigueEngineConfig {
    hrMax: number;
    rest?: RestCalculatorConfig;
    fatigue?: FatigueAssessmentConfig;
}
export declare class FatigueEngine {
    private readonly aggregator;
    private readonly config;
    private state;
    private setNumber;
    private restCalc;
    private assessment;
    private stateListeners;
    private progressListeners;
    private workoutActive;
    private setCompleteResolve;
    constructor(aggregator: DataAggregator, config: FatigueEngineConfig);
    on(event: 'state', listener: (e: StateEvent) => void): this;
    on(event: 'progress', listener: (e: RestProgressEvent) => void): this;
    /**
     * Start the workout loop.
     * This is non-blocking — it runs as a background async loop.
     */
    startWorkout(): void;
    /**
     * Call this after the athlete completes each set.
     * Signals the engine to proceed to the fatigue assessment phase.
     */
    recordSetComplete(): void;
    /** End the workout cleanly. */
    endWorkout(): void;
    private mainLoop;
    /**
     * RestTimeCalculator: wait until HR < 0.6 × hrMax.
     * If additional rest is needed after assessment, this is called again.
     */
    private restPhase;
    /**
     * FatigueAssessment: evaluate signals. If fatigued, rest again recursively.
     * Max 2 recursive rest cycles to avoid infinite loops.
     */
    private assessPhase;
    private additionalRestPhase;
    /** Wait for recordSetComplete() to be called */
    private waitForSetComplete;
    private transition;
    private emit;
    getState(): EngineState;
    getSetNumber(): number;
}
export { RestTimeCalculator, FatigueAssessment };
export type { RestCalculatorConfig, FatigueAssessmentConfig, RestProgressCallback };
//# sourceMappingURL=index.d.ts.map