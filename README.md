#  Fatigue System

Real-time fatigue assessment from heart rate, EMG, and barbell velocity.

The main mobile workflow runs fully on-device in React Native. Camera PPG, Bluetooth EMG/IMU, aggregation, and fatigue scoring all stay local, with no backend required for the primary path.

## What It Does

- Native camera PPG capture for heart rate
- Bluetooth LE ingestion for EMG and IMU
- Local aggregation of heart rate, EMG, and velocity signals
- Local fatigue scoring and rest guidance
- Lightweight mobile orchestration with hidden sensor bridges

## Mobile Quick Start

Install the package in your app:

```bash
npm install fitness-fatigue-system
```

Use the React Native entrypoint:

```tsx
import React from 'react';
import { View } from 'react-native';
import { WorkoutFatigueSystem } from 'fitness-fatigue-system/react-native';

export const App = () => {
  return (
    <View style={{ flex: 1 }}>
      <WorkoutFatigueSystem hrMax={185} autoStart />
    </View>
  );
};
```

That controller starts the native camera bridge, listens for Bluetooth EMG/IMU packets when available, and feeds the readings into the local aggregator and fatigue engine.

## Mobile Components

### `WorkoutFatigueSystem`

The main on-device workout controller. It coordinates local heart rate, EMG, and velocity inputs and displays workout state, recovery progress, and assessment results.

### `CameraHeartRateComponent`

Native camera PPG capture for mobile. It supports `headless` mode so it can run hidden when embedded inside the workout controller.

### `BluetoothSensorBridge`

React Native Bluetooth bridge for ESP32 EMG/IMU packets. When `debug` is false, it can run as an invisible sensor bridge.

## Core Pipeline

- `DataAggregator` combines fresh heart rate, EMG, and velocity readings into a normalized snapshot.
- `FatigueEngine` evaluates each snapshot and manages rest / set transitions.
- `PPGProcessor` extracts BPM from red-channel camera samples.
- `EMGMonitor` and `BarbellVelocityTracker` process the local sensor inputs.

## Example Usage

```tsx
import React from 'react';
import { View } from 'react-native';
import {
  WorkoutFatigueSystem,
  CameraHeartRateComponent,
  BluetoothSensorBridge,
} from 'fitness-fatigue-system/react-native';

export const WorkoutScreen = () => {
  return (
    <View style={{ flex: 1 }}>
      <WorkoutFatigueSystem hrMax={185} autoStart />

      <CameraHeartRateComponent headless useTorch />

      <BluetoothSensorBridge debug={false} />
    </View>
  );
};
```

## Running The App

The package itself does not require a backend for the mobile flow. Build and run your React Native app as usual for Android or iOS.

## Optional Debugging

- Pass `debug` to `WorkoutFatigueSystem` to expose sample injection controls.
- Use `showPreview` on `CameraHeartRateComponent` if you want to inspect the latest red-channel sample.

## Package Entry Points

- `fitness-fatigue-system/react-native` for mobile UI and native bridges
- `fitness-fatigue-system` for the core signal-processing and fatigue modules

## Notes

- Native camera and Bluetooth capabilities are required on device.
- The mobile path is designed to stay lightweight and avoid browser APIs.
- A backend server exists in the repository for legacy or non-mobile workflows, but it is not required for the primary mobile experience.
