/**
 * @file REACT_NATIVE_MOBILE_GUIDE.md
 * 
 * Complete guide for native mobile (React Native + Kotlin/Swift) integration.
 * This is the PRIMARY path for production use.
 */

# React Native Mobile Integration Guide

## 🎯 Overview

This guide covers integrating the fitness-fatigue-system into a **production React Native app** with:
- **Heart Rate:** Camera-based PPG (rear camera + flash)
- **EMG:** Bluetooth LE from ESP32 wearable
- **IMU:** Accelerometer/gyroscope from Bluetooth device
- **Fatigue Assessment:** Composite algorithm combining all three

---

## 📋 Prerequisites

- React Native 0.65+
- Node.js 16+
- Android Studio (for Android) or Xcode (for iOS)
- ESP32 with firmware sending Bluetooth packets
- Backend server running (`npm run start:api`)

---

## 🚀 Installation

### 1. Add Package to Your Project

```bash
npm install fitness-fatigue-system
```

### 2. Install Required Dependencies

```bash
# Bluetooth communication
npm install react-native-ble-plx

# Camera-based heart rate
npm install react-native-vision-camera @shopify/react-native-skia
npm install react-native-reanimated

# Optional but recommended
npm install react-native-gesture-handler react-native-safe-area-context
```

### 3. Update app.json (Expo)

If using Expo:

```json
{
  "expo": {
    "plugins": [
      ["react-native-vision-camera"],
      ["react-native-reanimated/plugin"]
    ]
  }
}
```

### 4. Android Permissions

Edit `android/app/src/main/AndroidManifest.xml`:

```xml
<!-- Camera -->
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.FLASHLIGHT" />

<!-- Bluetooth -->
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```

### 5. iOS Permissions

Edit `ios/[ProjectName]/Info.plist`:

```xml
<key>NSCameraUsageDescription</key>
<string>We need camera access to measure heart rate via PPG</string>

<key>NSBluetoothPeripheralUsageDescription</key>
<string>We need Bluetooth to connect to fitness sensors</string>

<key>NSBluetoothCentralUsageDescription</key>
<string>We need Bluetooth to connect to fitness sensors</string>

<key>NSLocationWhenInUseUsageDescription</key>
<string>We need location for Bluetooth device discovery</string>
```

---

## 🏗️ Integration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React Native App                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │      WorkoutFatigueSystem (Main Component)           │  │
│  │   - WebSocket connection to backend                  │  │
│  │   - State machine (idle → rest → set → assess)       │  │
│  │   - UI display & callbacks                           │  │
│  └──────────────────────────────────────────────────────┘  │
│                         ▲                                   │
│         ┌───────────────┼───────────────┐                  │
│         │               │               │                  │
│         ▼               ▼               ▼                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │  Camera    │  │ Bluetooth  │  │ Velocity   │           │
│  │     HR     │  │   Bridge   │  │   (Model)  │           │
│  │ Component  │  │  (EMG/IMU) │  │  (Optional)│           │
│  └────────────┘  └────────────┘  └────────────┘           │
│         │               │               │                  │
│         └───────────────┼───────────────┘                  │
│                         │                                  │
│  POST to backend:        ▼                                 │
│  /ingest/hr         HTTP POST                              │
│  /ingest/emg        /ingest/[hr|emg|velocity]              │
│  /ingest/velocity                                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
        ┌────────────────────────────────────┐
        │   Backend (Node.js + WebSocket)    │
        │                                    │
        │  - DataAggregator                  │
        │  - FatigueEngine                   │
        │  - ReadinessAssessment             │
        │  - RestCalculator                  │
        │                                    │
        └────────────────────────────────────┘
```

---

## 💻 Implementation

### Option 1: Simple Integration (Recommended for First-Time Setup)

Start with just the main fatigue component and external velocity:

```tsx
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { WorkoutFatigueSystem } from 'fitness-fatigue-system/react-native';

export const WorkoutScreen: React.FC = () => {
  const [apiUrl] = useState('http://10.0.2.2:3001'); // Android emulator
  const [hrMax] = useState(185); // 220 - your_age

  return (
    <View style={styles.container}>
      <WorkoutFatigueSystem
        apiUrl={apiUrl}
        hrMax={hrMax}
        onStateChange={(event) => console.log(event)}
        onSnapshot={(snapshot) => console.log(snapshot)}
        onError={(error) => console.error(error)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
});
```

Push sensor data externally:

```tsx
const pushHeartRate = async (bpm: number, confidence: number) => {
  await fetch('http://10.0.2.2:3001/ingest/hr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bpm, confidence }),
  });
};

const pushEMG = async (samples: number[]) => {
  await fetch('http://10.0.2.2:3001/ingest/emg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ samples }),
  });
};

const pushVelocity = async (velocityMps: number) => {
  await fetch('http://10.0.2.2:3001/ingest/velocity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ velocityMps }),
  });
};
```

---

### Option 2: Full Integration (All Components)

For production apps, integrate all three data sources:

```tsx
import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { WorkoutFatigueSystem } from 'fitness-fatigue-system/react-native';
import { BluetoothSensorBridge } from 'fitness-fatigue-system/react-native';
import { CameraHeartRateComponent } from 'fitness-fatigue-system/react-native';
import { HeartRateMeasurement } from 'fitness-fatigue-system/heart-rate';
import { EMGSample } from 'fitness-fatigue-system/emg';
import { IMUReading } from 'fitness-fatigue-system/react-native';

export const FullWorkoutScreen: React.FC = () => {
  const API_URL = 'http://10.0.2.2:3001';
  const HR_MAX = 185;

  // ─── Heart Rate Callback ─────────────────────────────────────

  const handleHeartRateReading = useCallback(async (data: HeartRateMeasurement) => {
    console.log(`HR: ${data.bpm} BPM (confidence: ${data.confidence})`);
    
    await fetch(`${API_URL}/ingest/hr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bpm: data.bpm,
        confidence: data.confidence,
      }),
    });
  }, []);

  // ─── EMG Callback ────────────────────────────────────────────

  const handleEMGReading = useCallback(async (sample: EMGSample) => {
    console.log(`EMG Fatigue: ${sample.fatigueScore}`);
    
    await fetch(`${API_URL}/ingest/emg`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        samples: sample.rawValues,
      }),
    });
  }, []);

  // ─── IMU Callback ────────────────────────────────────────────

  const handleIMUReading = useCallback(async (imu: IMUReading) => {
    console.log(`IMU: roll=${imu.roll}, pitch=${imu.pitch}, yaw=${imu.yaw}`);
    
    // Compute barbell velocity from IMU data
    // This is app-specific; adapt to your model
    const estimatedVelocity = computeVelocityFromIMU(imu);
    
    await fetch(`${API_URL}/ingest/velocity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        velocityMps: estimatedVelocity,
      }),
    });
  }, []);

  // ─── Main Component Callbacks ────────────────────────────────

  const handleStateChange = (event: any) => {
    console.log(`State: ${event.state} (Set #${event.setNumber})`);
  };

  const handleSnapshot = (snapshot: any) => {
    console.log(`HR: ${snapshot.heartRate} BPM | Fatigue: ${snapshot.emgFatigue}`);
  };

  const handleError = (error: string) => {
    console.error(`Error: ${error}`);
  };

  // ─── Render ──────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Hidden camera component (runs in background) */}
      <View style={{ display: 'none' }}>
        <CameraHeartRateComponent
          onReading={handleHeartRateReading}
          onError={handleError}
          useTorch={true}
          debug={false}
        />
      </View>

      {/* Bluetooth bridge (invisible, but with debug panel optional) */}
      <BluetoothSensorBridge
        onEMGReading={handleEMGReading}
        onIMUReading={handleIMUReading}
        onError={handleError}
        debug={true}
      />

      {/* Main fatigue component */}
      <WorkoutFatigueSystem
        apiUrl={API_URL}
        hrMax={HR_MAX}
        onStateChange={handleStateChange}
        onSnapshot={handleSnapshot}
        onError={handleError}
      />
    </View>
  );
};

// Helper: compute velocity from IMU
const computeVelocityFromIMU = (imu: IMUReading): number => {
  // This is a placeholder. Replace with your ML model or physics calculation
  // Example: use yaw acceleration to estimate barbell velocity
  return 1.0 + Math.sin(imu.yaw / 90) * 0.5;
};

const styles = StyleSheet.create({
  container: { flex: 1 },
});
```

---

## 🔧 Configuration

### Backend URL

**Android Emulator:**
```tsx
const API_URL = 'http://10.0.2.2:3001'; // Gateway to host
```

**Android Device:**
```tsx
// Get your PC's IP: ipconfig (Windows) or ifconfig (Mac/Linux)
const API_URL = 'http://192.168.1.100:3001'; // Replace with your IP
```

**iOS Simulator:**
```tsx
const API_URL = 'http://localhost:3001'; // Direct to host
```

**iOS Device:**
```tsx
const API_URL = 'http://192.168.1.100:3001'; // Same network as iPhone
```

### Heart Rate Max

```tsx
// For most athletes: 220 - age
const HR_MAX = 220 - 25; // Example: 25-year-old

// Athletic individuals may use lower values:
const HR_MAX = 190; // For well-trained athletes
```

### Fatigue Thresholds

Configure in your backend (see IMPLEMENTATION_GUIDE.md for details):

```typescript
// Rest until HR < (HR_MAX * 0.6)
const restThreshold = 0.60;

// Additional rest recommendation at this fatigue level
const fatigueThreshold = 0.50;

// EMG & Velocity weights
const weights = {
  emg: 0.45,
  velocity: 0.45,
  hr: 0.10,
};
```

---

## 📡 Data Flow & Synchronization

### Heart Rate (Camera PPG)

**Source:** Rear camera + flash
**Frequency:** 1-3x per second
**Data:**
```json
{
  "bpm": 145,
  "confidence": 0.85,
  "timestamp": 1234567890
}
```

**Push Endpoint:**
```bash
POST /ingest/hr
Content-Type: application/json

{
  "bpm": 145,
  "confidence": 0.85
}
```

---

### EMG (Bluetooth)

**Source:** ESP32 Bluetooth wearable
**Frequency:** ~100 samples per second (depending on buffer size)
**Data:**
```json
{
  "timestamp": 1234567890,
  "fatigueScore": 0.35,
  "rmsAmplitude": 250.5,
  "medianFrequency": 72.3,
  "rawValues": [100, 105, 98, 102, 100]
}
```

**Push Endpoint:**
```bash
POST /ingest/emg
Content-Type: application/json

{
  "samples": [100, 105, 98, 102, 100]
}
```

---

### IMU (Bluetooth)

**Source:** ESP32 Bluetooth wearable (IMU sensor)
**Frequency:** ~20Hz
**Data:**
```json
{
  "timestamp": 1234567890,
  "roll": 0.5,
  "pitch": -0.2,
  "yaw": 1.1
}
```

**Usage:** Compute barbell velocity from IMU acceleration/rotation

---

### Composite Output

**WebSocket Event** (real-time):
```json
{
  "type": "snapshot",
  "data": {
    "timestamp": 1234567890,
    "heartRate": 145,
    "hrConfidence": 0.85,
    "emgFatigue": 0.35,
    "velocityMps": 1.2,
    "velocityLossPct": 15,
    "quality": {
      "hrFresh": true,
      "emgFresh": true,
      "velocityFresh": true
    }
  }
}
```

---

## 🐛 Troubleshooting

### Camera Issues

**"Camera permission denied"**
- Ensure `NSCameraUsageDescription` is in Info.plist (iOS)
- Ensure `android.permission.CAMERA` is in AndroidManifest.xml (Android)
- Grant permissions in device settings

**"No camera device found"**
- Requires rear camera (won't work on some tablets or devices without camera)
- Try on a different device

**"HR accuracy is poor"**
- Ensure good lighting (avoid direct sunlight)
- Keep finger steady on camera lens
- Ensure torch/flash is on (improves signal)
- PPG accuracy: ±5 BPM under ideal conditions

---

### Bluetooth Issues

**"No ESP32 device found"**
- Check ESP32 is powered on
- Verify device name in code matches your ESP32
- Ensure Bluetooth is enabled on phone
- Check permissions are granted

**"Bluetooth connection drops"**
- Bluetooth interference (reduce distance, avoid microwaves)
- Weak battery on ESP32
- Try re-pairing device in OS settings

**"EMG data looks wrong"**
- Verify CSV packet format matches specification
- Check electrode placement on arm
- Ensure EMG sensor is properly calibrated

---

### Network Issues

**"Cannot reach backend server"**
- Verify server is running: `npm run start:api`
- Check firewall allows port 3001
- Verify correct IP/URL in app config
- Android emulator? Use `10.0.2.2` instead of `localhost`

**"WebSocket connection fails"**
- Server not running
- Firewall blocking WebSocket on port 3001
- Network timeout (increase timeout if slow network)

---

## 📊 Example Workout Flow

1. **User Taps "Start Workout"**
   - App connects to backend via WebSocket
   - Camera starts (if enabled)
   - Bluetooth connects (if available)

2. **Engine Enters RESTING State**
   - Waiting for HR to stabilize (< 0.6 × HRmax)
   - Camera feeding real-time HR readings
   - EMG baseline being recorded

3. **User Performs Set**
   - User taps "Set Complete"
   - Engine enters ASSESSING state
   - Fatigue score computed from EMG + velocity

4. **Rest Recommendation**
   - If fatigued, engine enters RESTING state
   - Shows recommended rest time
   - Polls HR until < threshold
   - Back to step 3

5. **Workout Ends**
   - User taps "End Workout"
   - Metrics saved/logged
   - Session complete

---

## 🚀 Performance Tips

### Reduce CPU Load

```tsx
// Increase snapshot interval (default 500ms)
// Configure on backend

// Reduce frame processing on camera
<CameraHeartRateComponent
  frameSkip={1}  // Process every 2nd frame
/>
```

### Reduce Battery Drain

```tsx
// Disable torch if lighting is adequate
useTorch={false}

// Reduce Bluetooth polling frequency
// (requires backend config)
```

### Improve Accuracy

```tsx
// Ensure torch is on
useTorch={true}

// Allow time for EMG calibration
// (30-60 seconds of baseline recording)

// Ensure barbell velocity model is well-trained
```

---

## 🔐 Security

- All data sent over HTTP (use HTTPS in production)
- No authentication in example (implement in your backend)
- BLE is encrypted by default (Android/iOS)
- Consider adding API key authentication

---

## 📚 Related Docs

- [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) — Full API reference
- [BLUETOOTH_INTEGRATION.md](./BLUETOOTH_INTEGRATION.md) — ESP32 setup
- [CAMERA_PPG_INTEGRATION.md](./CAMERA_PPG_INTEGRATION.md) — Heart rate camera details
- [example/react-native-complete-integration.tsx](./example/react-native-complete-integration.tsx) — Complete working example

---

## 💪 Production Checklist

- [ ] Backend deployed (not local dev machine)
- [ ] React Native app uses correct backend URL/IP
- [ ] Camera permissions requested & granted
- [ ] Bluetooth permissions requested & granted
- [ ] HR_MAX configured correctly for each athlete
- [ ] EMG baseline calibrated at workout start
- [ ] Barbell velocity model trained & accurate
- [ ] Network security policy allows HTTP (or use HTTPS)
- [ ] Error handling implemented for all edge cases
- [ ] Tested on real devices (Android & iOS)

---

Ready to build a production fitness app! 🏋️‍♂️💪
