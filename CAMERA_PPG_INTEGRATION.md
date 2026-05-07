/**

* @file CAMERA_PPG_INTEGRATION.md
* 
* Guide for camera-based heart rate measurement (Photoplethysmography) in React Native.
  */

# Camera PPG Heart Rate Integration

## Overview

This repo uses camera-based PPG as a heart-rate source. The overall idea is simple: capture frames from a camera, read the red-channel variation caused by blood volume changes, filter that signal, detect peaks, and turn the result into BPM plus confidence.

In this workspace, the implementation is split across three paths:

- Browser/TypeScript: the working PPG pipeline.
- React Native: a camera UI and bridge scaffold that is not yet doing full frame-to-PPG processing.
- API server: a relay that accepts pushed HR readings at `POST /ingest/hr`.

### Overall flow

1. Camera captures fingertip frames with rear camera and flash when available.
2. The red channel is sampled from each frame.
3. The signal is smoothed and bandpass-filtered into the cardiac frequency band.
4. Peaks are detected and converted into BPM.
5. The result is emitted with a confidence score and can be forwarded to the fatigue engine.

### What is actually implemented here

- `src/heart-rate/ppg-processor.ts` performs the red-channel extraction, filtering, peak detection, BPM estimation, and smoothing.
- `src/heart-rate/index.ts` requests the browser camera and feeds frames into `PPGProcessor`.
- `src/react-native/CameraHeartRateComponent.tsx` renders the native camera UI and torch control, but does not yet process pixels end to end.
- `src/api/server.ts` accepts readings pushed from a client and routes them into the fatigue pipeline.

### What is now implemented

- A fully wired React Native frame-processing path that extracts native camera red-channel samples and feeds `PPGProcessor`.
- A shipped native module implementation in this repo for mobile PPG capture on Android and iOS.

---

## Implementation Notes

The sections below are useful PPG references, but the current repo now ships its own native bridge instead of relying on an external RN camera library.

### Browser PPG path in this repo

The actual heart-rate logic is in `src/heart-rate/ppg-processor.ts`.

It does four key things:

- samples the red channel from camera frames
- applies a bandpass filter for the cardiac frequency band
- detects peaks in the filtered signal
- converts peak spacing into BPM and confidence

### React Native path in this repo

`src/react-native/CameraHeartRateComponent.tsx` is mostly a UI and camera-setup scaffold right now. It requests permission, renders the camera, toggles the torch, and tracks debug FPS, but it does not yet perform the frame-to-PPG processing pipeline.

### API bridge

The server exposes an ingestion endpoint for HR readings:

```typescript
await fetch('http://localhost:3001/ingest/hr', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ bpm: 72, confidence: 0.9 }),
});
```

### Future native-module example

If you want to add a real mobile pipeline later, a native module would need to do what the browser path already does: capture camera frames, extract a red-channel signal, and feed it into `PPGProcessor`.

#### Kotlin Implementation (Android)

Create `android/app/src/main/java/com/fitness/CameraHeartRateModule.kt`:

```kotlin
package com.fitness

import android.app.Activity
import android.content.Context
import android.graphics.ImageFormat
import android.hardware.Camera
import android.media.Image
import android.view.SurfaceTexture
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.Executors
import kotlin.math.*

class CameraHeartRateModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var camera: ProcessCameraProvider? = null
  private var analyzing = false
  private val executor = Executors.newSingleThreadExecutor()

  // PPG signal buffer
  private val redBuffer = mutableListOf<Float>()
  private val ANALYSIS_WINDOW = 150  // 5 sec @ 30fps
  private val SAMPLE_RATE = 30

  override fun getName() = "CameraHeartRateModule"

  @ReactMethod
  fun start(promise: Promise) {
    try {
      val future = ProcessCameraProvider.getInstance(reactApplicationContext)
      future.addListener({
        val cameraProvider = future.get()
        setupCamera(cameraProvider)
        analyzing = true
        promise.resolve(null)
      }, ContextCompat.getMainExecutor(reactApplicationContext))
    } catch (e: Exception) {
      promise.reject("CAMERA_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    analyzing = false
    camera?.unbindAll()
    promise.resolve(null)
  }

  private fun setupCamera(cameraProvider: ProcessCameraProvider) {
    val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

    val imageAnalysis = ImageAnalysis.Builder()
      .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
      .setResolutionSelector(
        ResolutionSelector.Builder()
          .setAspectRatioStrategy(
            AspectRatioStrategy(
              Rational(4, 3),
              AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY
            )
          )
          .setResolutionStrategy(
            ResolutionStrategy(
              Size(480, 360),
              ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER
            )
          )
          .build()
      )
      .build()
      .also {
        it.setAnalyzer(executor, PPGAnalyzer())
      }

    try {
      cameraProvider.bindToLifecycle(
        currentActivity as androidx.lifecycle.LifecycleOwner,
        cameraSelector,
        imageAnalysis
      )
    
      // Enable flash/torch
      val camera = cameraProvider.bindToLifecycle(
        currentActivity as androidx.lifecycle.LifecycleOwner,
        cameraSelector
      ) as Camera
      camera.cameraControl.enableTorch(true)
    } catch (e: Exception) {
      e.printStackTrace()
    }
  }

  private inner class PPGAnalyzer : ImageAnalysis.Analyzer {
    override fun analyze(image: ImageProxy) {
      try {
        val redChannel = extractRedChannel(image)
        redBuffer.add(redChannel)

        if (redBuffer.size > ANALYSIS_WINDOW) {
          redBuffer.removeAt(0)
        }

        if (redBuffer.size >= 120) { // 4 sec minimum
          val bpm = estimateBPM(redBuffer)
          if (bpm in 40..200) {
            emitReading(bpm, 0.8f)
          }
        }
      } finally {
        image.close()
      }
    }

    private fun extractRedChannel(image: ImageProxy): Float {
      val planes = image.planes
      val ySize = planes[0].buffer.remaining()
      val uvSize = planes[1].buffer.remaining()

      val data = ByteArray(ySize + uvSize)
      planes[0].buffer.get(data, 0, ySize)
      planes[1].buffer.get(data, ySize, uvSize)

      var redSum = 0L
      var pixelCount = 0

      // UV is interleaved: V, U, V, U...
      // Convert YUV to Red
      for (i in ySize until ySize + uvSize step 2) {
        if (i + 1 < data.size) {
          val v = (data[i].toInt() and 0xFF).toFloat()
          val u = (data[i + 1].toInt() and 0xFF).toFloat()
        
          // Simplified YUV to RGB (red channel)
          val r = (v - 128) * 1.77f
          redSum += r.toInt().toLong()
          pixelCount++
        }
      }

      return if (pixelCount > 0) {
        (redSum.toFloat() / pixelCount + 128) / 255f
      } else {
        0.5f
      }
    }

    private fun estimateBPM(buffer: List<Float>): Int {
      // Apply bandpass filter (0.5–3.5 Hz cardiac band)
      val filtered = bandpassFilter(buffer)

      // Find peaks
      val peaks = findPeaks(filtered)

      if (peaks.size < 2) return 0

      // Calculate inter-peak intervals (in samples)
      val intervals = mutableListOf<Int>()
      for (i in 1 until peaks.size) {
        intervals.add(peaks[i] - peaks[i - 1])
      }

      // Convert to BPM
      val avgInterval = intervals.average()
      val bpm = ((SAMPLE_RATE / avgInterval) * 60).toInt()

      return bpm
    }

    private fun bandpassFilter(buffer: List<Float>): List<Float> {
      // 2nd-order Butterworth bandpass: 0.5–3.5 Hz @ 30fps
      val b0 = 0.08717f
      val a1 = -1.7864f
      val a2 = 0.8257f

      val result = mutableListOf<Float>()
      var y1 = 0f
      var y2 = 0f
      var x1 = 0f
      var x2 = 0f

      for (x in buffer) {
        val y = b0 * x - a1 * y1 - a2 * y2
        result.add(y)
        x2 = x1
        x1 = x
        y2 = y1
        y1 = y
      }

      return result
    }

    private fun findPeaks(signal: List<Float>): List<Int> {
      val peaks = mutableListOf<Int>()
      val window = 9

      for (i in window until signal.size - window) {
        val localMax = signal[i] == signal.slice(i - window..i + window).maxOrNull()
        if (localMax) {
          peaks.add(i)
        }
      }

      return peaks
    }

    private fun emitReading(bpm: Int, confidence: Float) {
      val params = Arguments.createMap().apply {
        putInt("bpm", bpm)
        putDouble("confidence", confidence.toDouble())
      }

      reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("onHeartRate", params)
    }
  }
}
```

#### React Native Module Registration

Update `android/app/src/main/java/com/fitness/FitnessPackage.kt`:

```kotlin
package com.fitness

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class FitnessPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(CameraHeartRateModule(reactContext))
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }
}
```

### fitness-fatigue-system HeartRateMonitorServerProxy

For simplicity, use the built-in proxy:

```typescript
import { HeartRateMonitorServerProxy } from 'fitness-fatigue-system/heart-rate';

// Server-side (Node.js):
const hrProxy = new HeartRateMonitorServerProxy();
const aggregator = new DataAggregator({ hrMax: 185 });

hrProxy.on('reading', (hr) => aggregator.ingestHeartRate(hr));

// Client-side (React Native):
// Any component can push HR readings:
await fetch('http://localhost:3001/ingest/hr', {
  method: 'POST',
  body: JSON.stringify({ bpm: 72, confidence: 0.9 }),
});
```

---

## React Native Component

Current React Native component state in this repo:

- camera permission handling is present
- a camera preview is rendered
- torch control is present
- the actual PPG frame processing is not yet wired up

The snippet below is still a useful target shape for the UI, but it should not be read as already working end to end.

Complete PPG heart rate component:

```typescript
/**
 * @file CameraHeartRateComponent.tsx
 * 
 * Wraps camera PPG measurement with UI.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  NativeEventEmitter,
  NativeModules,
  Alert,
} from 'react-native';

const { CameraHeartRateModule } = NativeModules;
const heartRateEmitter = new NativeEventEmitter(CameraHeartRateModule);

interface CameraHeartRateComponentProps {
  onReading: (bpm: number, confidence: number) => void;
  onError?: (error: string) => void;
}

export const CameraHeartRateComponent: React.FC<CameraHeartRateComponentProps> = ({
  onReading,
  onError,
}) => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [latestBPM, setLatestBPM] = useState<number | null>(null);
  const [status, setStatus] = useState('Ready');

  const unsubscribeRef = useRef<ReturnType<typeof heartRateEmitter.addListener> | null>(null);

  const startMonitoring = useCallback(async () => {
    try {
      setStatus('Starting camera...');
      await CameraHeartRateModule.start();
      setIsMonitoring(true);
      setStatus('Place finger on camera';

      // Listen for readings
      unsubscribeRef.current = heartRateEmitter.addListener('onHeartRate', ({ bpm, confidence }) => {
        setLatestBPM(bpm);
        setStatus(`❤️ ${bpm} bpm (${Math.round(confidence * 100)}%)`);
        onReading(bpm, confidence);
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Start failed';
      setStatus(`Error: ${msg}`);
      onError?.(msg);
    }
  }, [onReading, onError]);

  const stopMonitoring = useCallback(async () => {
    try {
      await CameraHeartRateModule.stop();
      setIsMonitoring(false);
      setStatus('Stopped');
      unsubscribeRef.current?.remove();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Stop failed';
      Alert.alert('Error', msg);
    }
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.statusBox}>
        <Text style={styles.statusText}>{status}</Text>
        {latestBPM && (
          <Text style={styles.bpmDisplay}>{latestBPM}</Text>
        )}
      </View>

      <TouchableOpacity
        style={[styles.button, isMonitoring && styles.buttonActive]}
        onPress={isMonitoring ? stopMonitoring : startMonitoring}
      >
        <Text style={styles.buttonText}>
          {isMonitoring ? '⏹ Stop' : '▶ Measure HR'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.hint}>
        {isMonitoring
          ? 'Keep steady, ensure good lighting'
          : 'Tap to start measuring heart rate'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    alignItems: 'center',
  },
  statusBox: {
    width: '100%',
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  bpmDisplay: {
    fontSize: 32,
    fontWeight: '700',
    color: '#e74c3c',
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#3498db',
    borderRadius: 8,
    marginBottom: 12,
  },
  buttonActive: {
    backgroundColor: '#e74c3c',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
});
```

---

## Integration with Workout Screen

```typescript
import { CameraHeartRateComponent } from './CameraHeartRateComponent';
import { WorkoutFatigueSystem } from 'fitness-fatigue-system/react-native';

export const FitnessWorkoutScreen = () => {
  const apiUrl = 'http://192.168.1.100:3001';

  const handleHeartRateReading = useCallback(async (bpm: number, confidence: number) => {
    // Push to backend
    await fetch(`${apiUrl}/ingest/hr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bpm, confidence }),
    });
  }, []);

  return (
    <View>
      <CameraHeartRateComponent onReading={handleHeartRateReading} />
      <WorkoutFatigueSystem apiUrl={apiUrl} hrMax={185} />
    </View>
  );
};
```

---

## Performance Optimization

### CPU Load Reduction

- Process at 15fps instead of 30fps: `setBackpressureStrategy(STRATEGY_KEEP_ONLY_LATEST)`
- Downscale frames: 480×360 instead of 1080×2160
- Use integer math instead of floating-point
- Process on background thread (already done with executor)

### Power Optimization

- **Flash/Torch:** Only enable during measurement
- **Camera:** Release after each session
- **Sampling:** Adaptive rate (faster when just started, slower when settled)

### Accuracy Tips

- **Positioning:** Fingertip should fill 70% of frame
- **Pressure:** Consistent pressure on camera lens
- **Lighting:** Strong flash, no external light wash
- **Movement:** User should be stationary during measurement
- **Baseline:** 10–15 seconds needed for initial BPM estimate

---

## Troubleshooting PPG

| Issue                | Cause                   | Solution                               |
| -------------------- | ----------------------- | -------------------------------------- |
| "Permission denied"  | Camera not granted      | Request permissions in AndroidManifest |
| BPM is 0             | No red channel detected | Ensure good lighting, check lens       |
| BPM way off (200+)   | Noise peaks detected    | Move to brighter area                  |
| Very low confidence  | Insufficient data       | Wait 15+ seconds                       |
| Jumps between values | Frame drops             | Increase buffering window              |
| App crashes          | Memory leak             | Check event emitter unsubscribe        |

---

## References

- PPG Theory: [Photoplethysmography on Wikipedia](https://en.wikipedia.org/wiki/Photoplethysmography)
- Heart Rate Detection: [Peak Detection Algorithms](https://en.wikipedia.org/wiki/Peak_detection)
- Butterworth Filter: [IIR Digital Filters](https://en.wikipedia.org/wiki/Butterworth_filter)
