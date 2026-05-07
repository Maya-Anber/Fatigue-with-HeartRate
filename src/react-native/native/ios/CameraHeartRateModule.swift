import Foundation
import AVFoundation

@objc(CameraHeartRateModule)
class CameraHeartRateModule: RCTEventEmitter, AVCaptureVideoDataOutputSampleBufferDelegate {
  private let captureSession = AVCaptureSession()
  private let captureQueue = DispatchQueue(label: "CameraHeartRateModule.capture")
  private var videoOutput: AVCaptureVideoDataOutput?
  private var hasListeners = false
  private var isRunning = false
  private var frameIndex: Int = 0
  private var torchEnabled = false

  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func supportedEvents() -> [String]! {
    ["onCameraHeartRateFrame", "onCameraHeartRateState", "onCameraHeartRateError"]
  }

  @objc(start:resolver:rejecter:)
  func start(_ options: NSDictionary?, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
      guard let self else { return }

      guard granted else {
        reject("CAMERA_PERMISSION", "Camera permission is required before starting capture", nil)
        return
      }

      do {
        try self.configureSession()
        self.captureSession.startRunning()
        self.isRunning = true
        self.emitState("running")
        resolve(nil)
      } catch {
        reject("CAMERA_START_FAILED", error.localizedDescription, error)
      }
    }
  }

  @objc(stop:rejecter:)
  func stop(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    captureSession.stopRunning()
    isRunning = false
    frameIndex = 0
    emitState("stopped")
    resolve(nil)
  }

  @objc(setTorchEnabled:resolver:rejecter:)
  func setTorchEnabled(_ enabled: Bool, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    torchEnabled = enabled

    guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back), device.hasTorch else {
      resolve(nil)
      return
    }

    do {
      try device.lockForConfiguration()
      if enabled {
        try device.setTorchModeOn(level: AVCaptureDevice.maxAvailableTorchLevel)
      } else {
        device.torchMode = .off
      }
      device.unlockForConfiguration()
      resolve(nil)
    } catch {
      reject("TORCH_FAILED", error.localizedDescription, error)
    }
  }

  override func startObserving() {
    hasListeners = true
  }

  override func stopObserving() {
    hasListeners = false
  }

  private func configureSession() throws {
    captureSession.beginConfiguration()
    captureSession.sessionPreset = .vga640x480

    guard
      let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
      let input = try? AVCaptureDeviceInput(device: device),
      captureSession.canAddInput(input)
    else {
      throw NSError(domain: "CameraHeartRateModule", code: 1, userInfo: [NSLocalizedDescriptionKey: "Unable to create camera input"])
    }

    captureSession.inputs.forEach { captureSession.removeInput($0) }
    captureSession.addInput(input)

    let output = AVCaptureVideoDataOutput()
    output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA)]
    output.alwaysDiscardsLateVideoFrames = true
    output.setSampleBufferDelegate(self, queue: captureQueue)

    captureSession.outputs.forEach { captureSession.removeOutput($0) }
    guard captureSession.canAddOutput(output) else {
      throw NSError(domain: "CameraHeartRateModule", code: 2, userInfo: [NSLocalizedDescriptionKey: "Unable to add video output"])
    }

    captureSession.addOutput(output)
    videoOutput = output
    captureSession.commitConfiguration()

    if torchEnabled {
      try? setTorchOn()
    }
  }

  private func setTorchOn() throws {
    guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back), device.hasTorch else {
      return
    }

    try device.lockForConfiguration()
    defer { device.unlockForConfiguration() }
    try device.setTorchModeOn(level: AVCaptureDevice.maxAvailableTorchLevel)
  }

  func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    guard hasListeners, isRunning, let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

    CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }

    guard let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer) else { return }
    let width = CVPixelBufferGetWidth(pixelBuffer)
    let height = CVPixelBufferGetHeight(pixelBuffer)
    let bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer)
    let bytePointer = baseAddress.assumingMemoryBound(to: UInt8.self)

    var redSum: Double = 0
    var pixelCount: Double = 0
    let step = 2

    var row = 0
    while row < height {
      let rowOffset = row * bytesPerRow
      var col = 0
      while col < width {
        let pixelOffset = rowOffset + col * 4
        let red = Double(bytePointer[pixelOffset + 2])
        redSum += red
        pixelCount += 1
        col += step
      }
      row += step
    }

    guard pixelCount > 0 else { return }

    let payload: [String: Any] = [
      "timestamp": Date().timeIntervalSince1970 * 1000,
      "rawRed": redSum / pixelCount,
      "confidence": 1.0,
      "frameIndex": frameIndex,
      "width": width,
      "height": height,
    ]

    frameIndex += 1
    sendEvent(withName: "onCameraHeartRateFrame", body: payload)
  }

  private func emitState(_ state: String) {
    sendEvent(withName: "onCameraHeartRateState", body: [
      "state": state,
      "timestamp": Date().timeIntervalSince1970 * 1000,
    ])
  }
}