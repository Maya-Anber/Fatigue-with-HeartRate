import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

export interface CameraHeartRateStartOptions {
  useTorch?: boolean;
  targetFps?: number;
  sampleRate?: number;
  analysisWindowSec?: number;
}

export interface CameraHeartRateSampleEvent {
  timestamp: number;
  rawRed: number;
  frameIndex?: number;
  width?: number;
  height?: number;
  confidence?: number;
}

export interface CameraHeartRateNativeModule {
  start(options?: CameraHeartRateStartOptions): Promise<void>;
  stop(): Promise<void>;
  setTorchEnabled(enabled: boolean): Promise<void>;
  addListener?(eventName: string): void;
  removeListeners?(count: number): void;
}

export const CAMERA_HEART_RATE_SAMPLE_EVENT = 'onCameraHeartRateFrame';
export const CAMERA_HEART_RATE_STATE_EVENT = 'onCameraHeartRateState';
export const CAMERA_HEART_RATE_ERROR_EVENT = 'onCameraHeartRateError';

const MODULE_NAMES = ['CameraHeartRateModule', 'CameraHeartRateNativeModule'] as const;

function resolveNativeModule(): CameraHeartRateNativeModule | null {
  for (const moduleName of MODULE_NAMES) {
    const candidate = NativeModules[moduleName] as CameraHeartRateNativeModule | undefined;
    if (candidate) return candidate;
  }

  return null;
}

export function hasCameraHeartRateNativeModule(): boolean {
  return resolveNativeModule() !== null;
}

export function getCameraHeartRateNativeModule(): CameraHeartRateNativeModule | null {
  return resolveNativeModule();
}

export function createCameraHeartRateEmitter(): NativeEventEmitter | null {
  const module = resolveNativeModule();
  return module ? new NativeEventEmitter(module as never) : null;
}

export function isCameraHeartRateNativeBridgeAvailable(): boolean {
  return Platform.OS === 'android';
}