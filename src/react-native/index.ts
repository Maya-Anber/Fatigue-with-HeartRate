/**
 * @file src/react-native/index.ts
 * 
 * React Native entry point.
 * 
 * Usage:
 *   import { WorkoutFatigueSystem } from 'fitness-fatigue-system/react-native'
 *   import { BluetoothSensorBridge } from 'fitness-fatigue-system/react-native'
 *   import { CameraHeartRateComponent } from 'fitness-fatigue-system/react-native'
 * 
 * Or from package.json:
 *   "react-native": "src/react-native/index.ts"
 */

export { WorkoutFatigueSystem } from './WorkoutFatigueSystem';
export type { WorkoutFatigueSystemProps } from './WorkoutFatigueSystem';

export { BluetoothSensorBridge } from './BluetoothSensorBridge';
export type { BluetoothSensorBridgeProps, IMUReading } from './BluetoothSensorBridge';

export { CameraHeartRateComponent } from './CameraHeartRateComponent';
export type { CameraHeartRateProps } from './CameraHeartRateComponent';

export {
	CAMERA_HEART_RATE_ERROR_EVENT,
	CAMERA_HEART_RATE_SAMPLE_EVENT,
	CAMERA_HEART_RATE_STATE_EVENT,
	createCameraHeartRateEmitter,
	getCameraHeartRateNativeModule,
	hasCameraHeartRateNativeModule,
} from './native/CameraHeartRateBridge';

export type {
	CameraHeartRateNativeModule,
	CameraHeartRateSampleEvent,
	CameraHeartRateStartOptions,
} from './native/CameraHeartRateBridge';
