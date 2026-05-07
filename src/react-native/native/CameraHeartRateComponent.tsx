import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  NativeEventEmitter,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { PPGProcessor, HeartRateMeasurement } from '../../heart-rate/ppg-processor';
import {
  CAMERA_HEART_RATE_ERROR_EVENT,
  CAMERA_HEART_RATE_SAMPLE_EVENT,
  CAMERA_HEART_RATE_STATE_EVENT,
  CameraHeartRateSampleEvent,
  createCameraHeartRateEmitter,
  getCameraHeartRateNativeModule,
  hasCameraHeartRateNativeModule,
} from './CameraHeartRateBridge';

export interface CameraHeartRateProps {
  onReading?: (data: HeartRateMeasurement) => void;
  onError?: (error: string) => void;
  onReady?: () => void;
  useTorch?: boolean;
  debug?: boolean;
  showPreview?: boolean;
  headless?: boolean;
}

export const CameraHeartRateComponent: React.FC<CameraHeartRateProps> = ({
  onReading,
  onError,
  onReady,
  useTorch = true,
  debug = false,
  showPreview = false,
  headless = false,
}) => {
  const processorRef = useRef(new PPGProcessor());
  const nativeModuleRef = useRef(getCameraHeartRateNativeModule());
  const emitterRef = useRef<NativeEventEmitter | null>(null);
  const frameSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const errorSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const stateSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const frameCountRef = useRef(0);
  const fpsTimerRef = useRef(0);

  const [cameraPermission, setCameraPermission] = useState<boolean | null>(null);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [fps, setFps] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<'idle' | 'starting' | 'running' | 'stopped' | 'error'>('idle');
  const [latestReading, setLatestReading] = useState<HeartRateMeasurement | null>(null);
  const [latestSample, setLatestSample] = useState<number | null>(null);

  const detachEmitter = useCallback(() => {
    frameSubscriptionRef.current?.remove?.();
    errorSubscriptionRef.current?.remove?.();
    stateSubscriptionRef.current?.remove?.();
    frameSubscriptionRef.current = null;
    errorSubscriptionRef.current = null;
    stateSubscriptionRef.current = null;
  }, []);

  const handleSample = useCallback((sample: CameraHeartRateSampleEvent) => {
    frameCountRef.current += 1;
    const now = Date.now();
    if (now - fpsTimerRef.current > 1000) {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
      fpsTimerRef.current = now;
    }

    setLatestSample(sample.rawRed);
    const reading = processorRef.current.processRedSample({
      rawRed: sample.rawRed,
      timestamp: sample.timestamp,
    });

    if (reading) {
      setLatestReading(reading);
      onReading?.(reading);
    }
  }, [onReading]);

  const requestCameraPermission = useCallback(async () => {
    if (Platform.OS !== 'android') return true;

    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
      title: 'Camera permission required',
      message: 'The app needs camera access to capture the PPG signal.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
      buttonNeutral: 'Ask me later',
    });

    return result === PermissionsAndroid.RESULTS.GRANTED;
  }, []);

  const startBridge = useCallback(async () => {
    const nativeModule = nativeModuleRef.current ?? getCameraHeartRateNativeModule();
    if (!nativeModule || !hasCameraHeartRateNativeModule()) {
      setBridgeStatus('error');
      setCameraPermission(false);
      onError?.('CameraHeartRateModule is not available on this device.');
      return;
    }

    const granted = await requestCameraPermission();
    setCameraPermission(granted);
    if (!granted) {
      setBridgeStatus('error');
      onError?.('Camera permission denied. Please allow camera access to capture PPG.');
      return;
    }

    emitterRef.current = emitterRef.current ?? createCameraHeartRateEmitter();
    detachEmitter();

    if (emitterRef.current) {
      frameSubscriptionRef.current = emitterRef.current.addListener(CAMERA_HEART_RATE_SAMPLE_EVENT, handleSample);
      errorSubscriptionRef.current = emitterRef.current.addListener(CAMERA_HEART_RATE_ERROR_EVENT, (event) => {
        const message = typeof event === 'string'
          ? event
          : (event as { message?: string }).message ?? 'Camera PPG capture error';
        setBridgeStatus('error');
        onError?.(message);
      });
      stateSubscriptionRef.current = emitterRef.current.addListener(CAMERA_HEART_RATE_STATE_EVENT, (event) => {
        const state = typeof event === 'string' ? event : (event as { state?: string }).state;
        if (state === 'running') setBridgeStatus('running');
        if (state === 'stopped') setBridgeStatus('stopped');
      });
    }

    setBridgeStatus('starting');
    processorRef.current.reset();
    frameCountRef.current = 0;
    fpsTimerRef.current = Date.now();

    await nativeModule.start({
      useTorch,
      targetFps: 30,
      sampleRate: 30,
      analysisWindowSec: 5,
    });

    setBridgeStatus('running');
    setInitialized(true);
    setCameraPermission(true);
    onReady?.();
  }, [detachEmitter, handleSample, onError, onReady, requestCameraPermission, useTorch]);

  useEffect(() => {
    void startBridge().catch((error) => {
      const message = error instanceof Error ? error.message : 'Camera start failed';
      setBridgeStatus('error');
      onError?.(message);
    });

    return () => {
      detachEmitter();
      nativeModuleRef.current?.stop().catch(() => undefined);
    };
  }, [detachEmitter, onError, startBridge]);

  const toggleTorch = useCallback(async () => {
    const nativeModule = nativeModuleRef.current;
    if (!nativeModule) return;

    try {
      const nextTorchState = !isTorchOn;
      await nativeModule.setTorchEnabled(nextTorchState);
      setIsTorchOn(nextTorchState);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Torch toggle failed');
    }
  }, [isTorchOn, onError]);

  if (headless) {
    return null;
  }

  if (bridgeStatus === 'error' && cameraPermission === false) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Camera PPG capture is unavailable on this device</Text>
      </View>
    );
  }

  if (cameraPermission === null || bridgeStatus === 'starting') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#7CFFB2" />
        <Text style={styles.loadingText}>Starting native camera capture...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Mobile PPG Capture</Text>
        <Text style={styles.subtitle}>
          {bridgeStatus === 'running' ? 'Native camera bridge active' : 'Waiting for native camera bridge'}
        </Text>
        <Text style={styles.detailText}>Ready: {initialized ? 'Yes' : 'No'}</Text>
        <Text style={styles.detailText}>Torch: {isTorchOn ? 'On' : 'Off'}</Text>
        <Text style={styles.detailText}>FPS: {fps}</Text>
        {latestReading && (
          <Text style={styles.readingText}>
            {latestReading.bpm} bpm · {Math.round(latestReading.confidence * 100)}% confidence
          </Text>
        )}
        {showPreview && latestSample !== null && (
          <Text style={styles.detailText}>Latest red sample: {latestSample.toFixed(1)}</Text>
        )}
      </View>

      {debug && (
        <View style={styles.debugOverlay}>
          <Text style={styles.debugText}>Bridge: {bridgeStatus}</Text>
          <Text style={styles.debugText}>FPS: {fps}</Text>
          <Text style={styles.debugText}>Torch: {isTorchOn ? 'ON' : 'OFF'}</Text>
        </View>
      )}

      <TouchableOpacity style={styles.torchButton} onPress={toggleTorch}>
        <Text style={styles.torchButtonText}>{isTorchOn ? '💡 Off' : '💡 On'}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07111f',
  },
  card: {
    margin: 20,
    marginTop: 56,
    padding: 20,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    gap: 8,
  },
  title: {
    color: '#F7FAFF',
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: '#B7C6DB',
    fontSize: 14,
  },
  detailText: {
    color: '#D6DEEA',
    fontSize: 13,
  },
  readingText: {
    color: '#7CFFB2',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  debugOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 4,
  },
  debugText: {
    color: '#7CFFB2',
    fontSize: 12,
    fontWeight: '600',
  },
  torchButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#1B7CFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  torchButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#07111f',
    gap: 12,
  },
  loadingText: {
    color: '#D6DEEA',
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#07111f',
    paddingHorizontal: 24,
  },
  errorText: {
    color: '#FF7A90',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default CameraHeartRateComponent;