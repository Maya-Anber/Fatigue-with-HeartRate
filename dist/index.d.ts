/**
 * @package fitness-fatigue-system
 * Main entry point — re-exports all public APIs.
 *
 * Consumers can import from the package root:
 *   import { FatigueEngine, DataAggregator } from 'fitness-fatigue-system';
 *
 * Or from sub-paths (tree-shakeable):
 *   import { HeartRateMonitor } from 'fitness-fatigue-system/heart-rate';
 */
export { HeartRateMonitor, HeartRateMonitorServerProxy } from './heart-rate';
export type { HeartRateMeasurement, HRMonitorConfig } from './heart-rate';
export { EMGMonitor, EMGProcessor } from './emg';
export type { EMGSample, EMGConfig } from './emg';
export { BarbellVelocityTracker } from './barbell';
export type { VelocityReading, BarbellConfig } from './barbell';
export { DataAggregator } from './aggregator';
export type { SignalSnapshot, AggregatorConfig } from './aggregator';
export { FatigueEngine, RestTimeCalculator, FatigueAssessment } from './fatigue-engine';
export type { FatigueEngineConfig, ReadinessResult, RestCalculatorConfig, FatigueAssessmentConfig, EngineState, StateEvent, } from './fatigue-engine';
export { createAPIServer } from './api/server';
export { EMAFilter, SMAFilter, BandpassFilter, MedianFilter } from './utils/filters';
export { mean, rms, normalize, findPeaks } from './utils/math';
//# sourceMappingURL=index.d.ts.map