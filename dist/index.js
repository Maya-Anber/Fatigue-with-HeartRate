"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.findPeaks = exports.normalize = exports.rms = exports.mean = exports.MedianFilter = exports.BandpassFilter = exports.SMAFilter = exports.EMAFilter = exports.createAPIServer = exports.FatigueAssessment = exports.RestTimeCalculator = exports.FatigueEngine = exports.DataAggregator = exports.BarbellVelocityTracker = exports.EMGProcessor = exports.EMGMonitor = exports.HeartRateMonitorServerProxy = exports.HeartRateMonitor = void 0;
// Core modules
var heart_rate_1 = require("./heart-rate");
Object.defineProperty(exports, "HeartRateMonitor", { enumerable: true, get: function () { return heart_rate_1.HeartRateMonitor; } });
Object.defineProperty(exports, "HeartRateMonitorServerProxy", { enumerable: true, get: function () { return heart_rate_1.HeartRateMonitorServerProxy; } });
var emg_1 = require("./emg");
Object.defineProperty(exports, "EMGMonitor", { enumerable: true, get: function () { return emg_1.EMGMonitor; } });
Object.defineProperty(exports, "EMGProcessor", { enumerable: true, get: function () { return emg_1.EMGProcessor; } });
var barbell_1 = require("./barbell");
Object.defineProperty(exports, "BarbellVelocityTracker", { enumerable: true, get: function () { return barbell_1.BarbellVelocityTracker; } });
var aggregator_1 = require("./aggregator");
Object.defineProperty(exports, "DataAggregator", { enumerable: true, get: function () { return aggregator_1.DataAggregator; } });
var fatigue_engine_1 = require("./fatigue-engine");
Object.defineProperty(exports, "FatigueEngine", { enumerable: true, get: function () { return fatigue_engine_1.FatigueEngine; } });
Object.defineProperty(exports, "RestTimeCalculator", { enumerable: true, get: function () { return fatigue_engine_1.RestTimeCalculator; } });
Object.defineProperty(exports, "FatigueAssessment", { enumerable: true, get: function () { return fatigue_engine_1.FatigueAssessment; } });
// API server (Node.js only)
var server_1 = require("./api/server");
Object.defineProperty(exports, "createAPIServer", { enumerable: true, get: function () { return server_1.createAPIServer; } });
// Utilities (exposed for extension)
var filters_1 = require("./utils/filters");
Object.defineProperty(exports, "EMAFilter", { enumerable: true, get: function () { return filters_1.EMAFilter; } });
Object.defineProperty(exports, "SMAFilter", { enumerable: true, get: function () { return filters_1.SMAFilter; } });
Object.defineProperty(exports, "BandpassFilter", { enumerable: true, get: function () { return filters_1.BandpassFilter; } });
Object.defineProperty(exports, "MedianFilter", { enumerable: true, get: function () { return filters_1.MedianFilter; } });
var math_1 = require("./utils/math");
Object.defineProperty(exports, "mean", { enumerable: true, get: function () { return math_1.mean; } });
Object.defineProperty(exports, "rms", { enumerable: true, get: function () { return math_1.rms; } });
Object.defineProperty(exports, "normalize", { enumerable: true, get: function () { return math_1.normalize; } });
Object.defineProperty(exports, "findPeaks", { enumerable: true, get: function () { return math_1.findPeaks; } });
//# sourceMappingURL=index.js.map