# Quick Start Guide

Run the fatigue pipeline fully on the phone. No backend server is required.

## Prerequisites

- Node.js 16+
- npm or yarn
- Android device or emulator for React Native
- Optional: ESP32 with EMG/IMU firmware

## Install

```bash
npm install
```

## Use The Mobile Pipeline

Mount the local React Native controller in your app:

```tsx
import React from 'react';
import { View } from 'react-native';
import { WorkoutFatigueSystem } from './src/react-native';

export const App = () => (
  <View style={{ flex: 1 }}>
    <WorkoutFatigueSystem hrMax={185} autoStart />
  </View>
);
```

The controller starts the native camera PPG bridge, listens for Bluetooth EMG/IMU packets when available, and feeds everything into the local aggregator and fatigue engine.

## Run The App

```bash
npm run android
```

or

```bash
npm run ios
```

## Optional Debugging

If you want to test the UI without live sensors, pass `debug` to `WorkoutFatigueSystem` and use the built-in sample injection buttons.

You can also render the camera bridge directly if you want a standalone PPG view:

```tsx
import { CameraHeartRateComponent } from './src/react-native';

<CameraHeartRateComponent useTorch />
```

## What Runs On Device

- Camera PPG capture through the native bridge
- Bluetooth EMG/IMU ingestion when paired hardware is present
- Local aggregation and fatigue scoring
- Local rest timing and readiness assessment

## Common Issues

- Camera permission denied: re-enable camera permission in system settings.
- No EMG/IMU data: make sure the ESP32 is paired and broadcasting packets.
- Android emulator: use a physical device if the native camera bridge is not available in the emulator build.