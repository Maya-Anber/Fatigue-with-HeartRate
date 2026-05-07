/**
 * @file BluetoothSensorBridge.tsx
 * 
 * Complete React Native Bluetooth sensor integration component.
 * 
 * Connects to ESP32 Bluetooth LE wearable and parses EMG/IMU packets.
 * Self-contained: handles all Bluetooth setup, parsing, and error recovery.
 * 
 * Usage:
 *   <BluetoothSensorBridge
 *     onEMGReading={(sample) => {...}}
 *     onIMUReading={(imu) => {...}}
 *     onError={(error) => {...}}
 *   />
 * 
 * Install dependency:
 *   npm install react-native-ble-plx
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { View, Text, Alert, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import {
  BleManager,
  Characteristic,
  Device,
} from 'react-native-ble-plx';
import { EMGMonitor, parseBluetoothPacket, EMGSample } from '../emg';

export interface IMUReading {
  timestamp: number;
  roll: number;
  pitch: number;
  yaw: number;
}

export interface BluetoothSensorBridgeProps {
  /**
   * Callback when EMG sample is available.
   * Fired every ~200 samples at 1000Hz (≈ 5x per second).
   */
  onEMGReading?: (sample: EMGSample) => void;

  /**
   * Callback when IMU reading is available.
   * Fired ~20x per second.
   */
  onIMUReading?: (reading: IMUReading) => void;

  /**
   * Callback on connection/disconnection/error.
   */
  onStatusChange?: (status: 'scanning' | 'connecting' | 'connected' | 'error') => void;

  /**
   * Callback on error.
   */
  onError?: (error: string) => void;

  /**
   * Show debug UI (connects/disconnects button). Default false.
   */
  debug?: boolean;
}

export const BluetoothSensorBridge: React.FC<BluetoothSensorBridgeProps> = ({
  onEMGReading,
  onIMUReading,
  onStatusChange,
  onError,
  debug = false,
}) => {
  const managerRef = useRef<BleManager | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const emgMonitorRef = useRef<EMGMonitor>(new EMGMonitor());
  const characteristicRef = useRef<Characteristic | null>(null);
  const subscriptionRef = useRef<any>(null);

  const [status, setStatus] = useState<'idle' | 'scanning' | 'connecting' | 'connected' | 'error'>(
    'idle'
  );
  const [error, setError] = useState<string | null>(null);
  const dataBufferRef = useRef<string>('');

  // ─── ESP32 Configuration ──────────────────────────────────────────────────

  // These UUIDs must match your ESP32 firmware
  const ESP32_SERVICE_UUID = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
  const ESP32_NOTIFY_UUID = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
  const ESP32_DEVICE_NAME = 'ESP32-Sensor'; // Customize to your device name

  // ─── Initialization ───────────────────────────────────────────────────────

  useEffect(() => {
    const manager = new BleManager();
    managerRef.current = manager;

    // Set up EMG monitor listener to call callback
    emgMonitorRef.current.on('reading', (sample) => {
      onEMGReading?.(sample);
    });

    const subscriptions = [
      manager.onStateChange((state) => {
        if (state === 'PoweredOn') {
          startScanning();
        } else if (state === 'PoweredOff') {
          disconnect();
          updateStatus('error', 'Bluetooth is off');
        }
      }),
    ];

    return () => {
      subscriptions.forEach(s => s?.remove?.());
      manager.destroy();
    };
  }, [onEMGReading]);

  // ─── Status Update Helper ─────────────────────────────────────────────────

  const updateStatus = useCallback(
    (newStatus: typeof status, errorMsg?: string) => {
      setStatus(newStatus);
      onStatusChange?.(newStatus);
      if (errorMsg) {
        setError(errorMsg);
        onError?.(errorMsg);
      } else {
        setError(null);
      }
    },
    [onStatusChange, onError]
  );

  // ─── Scanning ─────────────────────────────────────────────────────────────

  const startScanning = useCallback(async () => {
    if (status !== 'idle') return;
    if (!managerRef.current) return;

    updateStatus('scanning');

    try {
      managerRef.current.startDeviceScan(
        [ESP32_SERVICE_UUID],
        null,
        (scanError, device) => {
          if (scanError) {
            updateStatus('error', `Scan error: ${scanError.message}`);
            return;
          }

          // Found device
          if (device?.name?.includes(ESP32_DEVICE_NAME) || device?.localName?.includes(ESP32_DEVICE_NAME)) {
            managerRef.current?.stopDeviceScan();
            connect(device);
          }
        }
      );

      // Timeout after 10s if no device found
      const timeoutId = setTimeout(() => {
        if (status === 'scanning' && managerRef.current) {
          managerRef.current.stopDeviceScan();
          updateStatus('error', 'No ESP32 device found. Check it\'s powered on and nearby.');
        }
      }, 10000);

      return () => clearTimeout(timeoutId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Scan failed';
      updateStatus('error', `Bluetooth error: ${msg}`);
    }
  }, [status, updateStatus]);

  // ─── Connection ───────────────────────────────────────────────────────────

  const connect = useCallback(
    async (device: Device) => {
      if (!managerRef.current) return;

      try {
        updateStatus('connecting');
        deviceRef.current = device;

        // Connect
        const connected = await device.connect();
        await connected.discoverAllServicesAndCharacteristics();

        // Get characteristic
        const characteristic = await connected.characteristicsForService(ESP32_SERVICE_UUID);
        const notifyChar = characteristic.find(c => c.uuid === ESP32_NOTIFY_UUID);

        if (!notifyChar) {
          throw new Error(`Characteristic ${ESP32_NOTIFY_UUID} not found`);
        }

        characteristicRef.current = notifyChar;

        // Subscribe to notifications
        const subscription = notifyChar.monitor((error, ch) => {
          if (error) {
            updateStatus('error', `Monitor error: ${error.message}`);
            return;
          }

          if (ch?.value) {
            handleBluetoothData(ch.value);
          }
        });

        subscriptionRef.current = subscription;
        updateStatus('connected');
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Connection failed';
        updateStatus('error', msg);
        disconnect();
      }
    },
    [updateStatus]
  );

  // ─── Data Processing ──────────────────────────────────────────────────────

  const handleBluetoothData = useCallback((base64Data: string) => {
    try {
      // Decode base64 to string
      const data = atob(base64Data);
      dataBufferRef.current += data;

      // Split by newlines and process complete lines
      const lines = dataBufferRef.current.split('\n');
      dataBufferRef.current = lines[lines.length - 1]; // Keep incomplete line

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Parse packet
        const packet = parseBluetoothPacket(line);
        if (!packet) continue;

        // Route to appropriate handler
        if (packet.type === 'EMG' && packet.emg) {
          // Feed to EMG monitor (listener fires automatically)
          emgMonitorRef.current.ingestBluetoothPacket(packet);
        } else if (packet.type === 'IMU' && packet.imu) {
          // Emit IMU reading directly
          onIMUReading?.({
            timestamp: packet.timestamp,
            roll: packet.imu.roll,
            pitch: packet.imu.pitch,
            yaw: packet.imu.yaw,
          });
        }
      }
    } catch (e) {
      console.error('[BluetoothSensorBridge] Data processing error:', e);
    }
  }, [onIMUReading]);

  // ─── Disconnection ────────────────────────────────────────────────────────

  const disconnect = useCallback(async () => {
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }

    if (deviceRef.current) {
      try {
        await deviceRef.current.cancelConnection();
      } catch (e) {
        // Already disconnected
      }
      deviceRef.current = null;
    }

    characteristicRef.current = null;
    dataBufferRef.current = '';
    updateStatus('idle');
  }, [updateStatus]);

  // ─── Debug UI ─────────────────────────────────────────────────────────────

  if (!debug) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.debugPanel}>
        <Text style={styles.debugTitle}>Bluetooth Sensor</Text>
        <Text style={[styles.statusBadge, { backgroundColor: getStatusColor(status) }]}>
          {status.toUpperCase()}
        </Text>
        {error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={[styles.debugButton, status === 'connected' && styles.buttonDisabled]}
          onPress={startScanning}
          disabled={status !== 'idle'}
        >
          <Text style={styles.debugButtonText}>Connect</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.debugButton, status !== 'connected' && styles.buttonDisabled]}
          onPress={disconnect}
          disabled={status !== 'connected'}
        >
          <Text style={styles.debugButtonText}>Disconnect</Text>
        </TouchableOpacity>

        {status === 'scanning' || status === 'connecting' ? (
          <ActivityIndicator size="small" color="#007AFF" style={{ marginTop: 8 }} />
        ) : null}
      </View>
    </View>
  );
};

// ─── Styles ────────────────────────────────────────────────────────────────────

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'connected':
      return '#34C759';
    case 'scanning':
    case 'connecting':
      return '#FF9500';
    case 'error':
      return '#FF3B30';
    default:
      return '#8E8E93';
  }
};

const styles = StyleSheet.create({
  container: {
    padding: 12,
  },
  debugPanel: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  statusBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  errorText: {
    fontSize: 12,
    color: '#FF3B30',
  },
  debugButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  buttonDisabled: {
    backgroundColor: '#CCCCCC',
  },
  debugButtonText: {
    color: '#FFF',
    fontWeight: '600',
    textAlign: 'center',
    fontSize: 13,
  },
});

export default BluetoothSensorBridge;
