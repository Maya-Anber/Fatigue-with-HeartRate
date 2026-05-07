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

// Core modules
export { HeartRateMonitor, HeartRateMonitorServerProxy } from './heart-rate';
export type { HeartRateMeasurement, HRMonitorConfig } from './heart-rate';

export { EMGMonitor, EMGProcessor } from './emg';
export type { EMGSample, EMGConfig } from './emg';

export { BarbellVelocityTracker } from './barbell';
export type { VelocityReading, BarbellConfig } from './barbell';

export { DataAggregator } from './aggregator';
export type { SignalSnapshot, AggregatorConfig } from './aggregator';

export { FatigueEngine, RestTimeCalculator, FatigueAssessment } from './fatigue-engine';
export type {
  FatigueEngineConfig,
  ReadinessResult,
  RestCalculatorConfig,
  FatigueAssessmentConfig,
  EngineState,
  StateEvent,
} from './fatigue-engine';

// API server (Node.js only)
export { createAPIServer } from './api/server';

// React Native components (mobile only)
// Export from react-native subpath:
//   import { WorkoutFatigueSystem } from 'fitness-fatigue-system/react-native'
//   import { BluetoothSensorBridge } from 'fitness-fatigue-system/react-native'
//   import { CameraHeartRateComponent } from 'fitness-fatigue-system/react-native'

// Utilities (exposed for extension)
export { EMAFilter, SMAFilter, BandpassFilter, MedianFilter } from './utils/filters';
export { mean, rms, normalize, findPeaks } from './utils/math';
