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

// ─── Event types ─────────────────────────────────────────────────────────────

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

// ─── Config ───────────────────────────────────────────────────────────────────

export interface FatigueEngineConfig {
  hrMax: number;
  rest?: RestCalculatorConfig;
  fatigue?: FatigueAssessmentConfig;
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class FatigueEngine {
  private state: EngineState = 'idle';
  private setNumber = 0;

  private restCalc: RestTimeCalculator;
  private assessment: FatigueAssessment;

  private stateListeners: Array<(e: StateEvent) => void> = [];
  private progressListeners: Array<(e: RestProgressEvent) => void> = [];

  // Signal to break the rest loop from outside (workout ended)
  private workoutActive = false;
  // Resolves when the user calls recordSetComplete()
  private setCompleteResolve: (() => void) | null = null;

  constructor(
    private readonly aggregator: DataAggregator,
    private readonly config: FatigueEngineConfig
  ) {
    this.restCalc = new RestTimeCalculator(aggregator, config.hrMax, config.rest);
    this.assessment = new FatigueAssessment(config.fatigue);
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  on(event: 'state', listener: (e: StateEvent) => void): this;
  on(event: 'progress', listener: (e: RestProgressEvent) => void): this;
  on(event: 'state' | 'progress', listener: ((e: StateEvent) => void) | ((e: RestProgressEvent) => void)): this {
    if (event === 'state') this.stateListeners.push(listener as (e: StateEvent) => void);
    if (event === 'progress') this.progressListeners.push(listener as (e: RestProgressEvent) => void);
    return this;
  }

  /**
   * Start the workout loop.
   * This is non-blocking — it runs as a background async loop.
   */
  startWorkout(): void {
    if (this.workoutActive) return;
    this.workoutActive = true;
    this.setNumber = 0;
    this.mainLoop().catch(console.error);
  }

  /**
   * Call this after the athlete completes each set.
   * Signals the engine to proceed to the fatigue assessment phase.
   */
  recordSetComplete(): void {
    this.setCompleteResolve?.();
    this.setCompleteResolve = null;
  }

  /** End the workout cleanly. */
  endWorkout(): void {
    this.workoutActive = false;
    this.setCompleteResolve?.();
    this.transition('done', 'Workout complete. Great work!');
  }

  // ─── Private state machine ────────────────────────────────────────────────

  private async mainLoop(): Promise<void> {
    while (this.workoutActive) {
      this.setNumber++;

      // ── Phase 1: REST ──────────────────────────────────────────────────
      await this.restPhase();
      if (!this.workoutActive) break;

      // ── Phase 2: SET (wait for athlete to complete it) ─────────────────
      this.transition('set', `Perform set #${this.setNumber} now.`);
      await this.waitForSetComplete();
      if (!this.workoutActive) break;

      // ── Phase 3: ASSESS ────────────────────────────────────────────────
      await this.assessPhase();
    }
  }

  /**
   * RestTimeCalculator: wait until HR < 0.6 × hrMax.
   * If additional rest is needed after assessment, this is called again.
   */
  private async restPhase(additionalSec = 0): Promise<void> {
    const label = additionalSec > 0
      ? `Additional ${additionalSec}s rest recommended.`
      : `Rest until heart rate recovers.`;

    this.transition('resting', label);

    const onProgress: RestProgressCallback = (prog) => {
      this.progressListeners.forEach(fn => fn(prog));
    };

    const elapsed = await this.restCalc.wait(onProgress);
    this.transition('resting', `Initial rest complete after ${Math.round(elapsed / 1000)}s.`);
  }

  /**
   * FatigueAssessment: evaluate signals. If fatigued, rest again recursively.
   * Max 2 recursive rest cycles to avoid infinite loops.
   */
  private async assessPhase(depth = 0): Promise<void> {
    if (depth > 1) return; // safety cap

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

  private async additionalRestPhase(seconds: number): Promise<void> {
    this.transition('resting', `Additional rest: ${seconds}s`);

    await new Promise<void>(resolve => {
      let remaining = seconds;
      const tick = () => {
        this.progressListeners.forEach(fn => fn({
          currentHR: this.aggregator.snapshot().heartRate,
          targetHR: Math.round(this.config.hrMax * 0.6),
          elapsedSec: seconds - remaining,
          percentRecovered: Math.round(((seconds - remaining) / seconds) * 100),
        }));
        remaining--;
        if (remaining > 0 && this.workoutActive) setTimeout(tick, 1000);
        else resolve();
      };
      setTimeout(tick, 1000);
    });
  }

  /** Wait for recordSetComplete() to be called */
  private waitForSetComplete(): Promise<void> {
    return new Promise(resolve => {
      this.setCompleteResolve = resolve;
    });
  }

  private transition(state: EngineState, message: string): void {
    this.state = state;
    this.emit('state', { state, setNumber: this.setNumber, message });
  }

  private emit(event: 'state', data: StateEvent): void {
    this.stateListeners.forEach(fn => fn(data));
  }

  getState(): EngineState { return this.state; }
  getSetNumber(): number { return this.setNumber; }
}

// Re-export sub-modules for convenience
export { RestTimeCalculator, FatigueAssessment };
export type { RestCalculatorConfig, FatigueAssessmentConfig, RestProgressCallback };
