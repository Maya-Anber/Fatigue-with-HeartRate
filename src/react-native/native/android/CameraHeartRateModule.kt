package com.fitnessfatiguesystem

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.util.Log
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class CameraHeartRateModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val cameraExecutor: ExecutorService = Executors.newSingleThreadExecutor()
  private var cameraProvider: ProcessCameraProvider? = null
  private var imageAnalysis: ImageAnalysis? = null
  private var isRunning = false
  private var frameIndex = 0L

  override fun getName(): String = "CameraHeartRateModule"

  @ReactMethod
  fun start(options: ReadableMap?, promise: Promise) {
    val activity: Activity = currentActivity ?: run {
      promise.reject("CAMERA_UNAVAILABLE", "No active Android activity available")
      return
    }

    if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
      promise.reject("CAMERA_PERMISSION", "Camera permission is required before starting capture")
      return
    }

    val targetFps = options?.getInt("targetFps") ?: 30
    val sampleRate = options?.getInt("sampleRate") ?: targetFps
    val analysisWindowSec = options?.getInt("analysisWindowSec") ?: 5
    Log.d("CameraHeartRateModule", "Starting capture targetFps=$targetFps sampleRate=$sampleRate window=$analysisWindowSec")

    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      try {
        cameraProvider = future.get()
        val provider = cameraProvider ?: throw IllegalStateException("Camera provider unavailable")
        bindCamera(provider, activity)
        isRunning = true
        emitState("running")
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject("CAMERA_START_FAILED", error.message, error)
      }
    }, ContextCompat.getMainExecutor(context))
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      cameraProvider?.unbindAll()
      imageAnalysis = null
      isRunning = false
      emitState("stopped")
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("CAMERA_STOP_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun setTorchEnabled(enabled: Boolean, promise: Promise) {
    emitState(if (enabled) "torch-on" else "torch-off")
    promise.resolve(null)
  }

  private fun bindCamera(provider: ProcessCameraProvider, activity: Activity) {
    provider.unbindAll()

    val analysis = ImageAnalysis.Builder()
      .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
      .build()

    analysis.setAnalyzer(cameraExecutor) { image ->
      try {
        val redMean = extractRedMean(image)
        emitSample(redMean, image.width, image.height)
      } catch (error: Exception) {
        emitError(error.message ?: "Frame analysis failed")
      } finally {
        image.close()
      }
    }

    imageAnalysis = analysis
    provider.bindToLifecycle(
      activity as androidx.lifecycle.LifecycleOwner,
      CameraSelector.DEFAULT_BACK_CAMERA,
      analysis
    )
  }

  private fun extractRedMean(image: ImageProxy): Double {
    val yPlane = image.planes[0].buffer.duplicate()
    val vPlane = image.planes[2].buffer.duplicate()
    val yRowStride = image.planes[0].rowStride
    val yPixelStride = image.planes[0].pixelStride
    val vRowStride = image.planes[2].rowStride
    val vPixelStride = image.planes[2].pixelStride

    var redSum = 0.0
    var pixelCount = 0
    val step = 2

    for (row in 0 until image.height step step) {
      val yRow = row * yRowStride
      val uvRow = (row / 2) * vRowStride

      for (col in 0 until image.width step step) {
        val y = (yPlane.get(yRow + col * yPixelStride).toInt() and 0xFF).toDouble()
        val v = (vPlane.get(uvRow + (col / 2) * vPixelStride).toInt() and 0xFF).toDouble()
        val red = (y + 1.402 * (v - 128.0)).coerceIn(0.0, 255.0)
        redSum += red
        pixelCount += 1
      }
    }

    return if (pixelCount > 0) redSum / pixelCount else 0.0
  }

  private fun emitSample(rawRed: Double, width: Int, height: Int) {
    if (!isRunning) return

    val payload = Arguments.createMap().apply {
      putDouble("timestamp", System.currentTimeMillis().toDouble())
      putDouble("rawRed", rawRed)
      putDouble("confidence", 1.0)
      putDouble("frameIndex", frameIndex.toDouble())
      putInt("width", width)
      putInt("height", height)
    }

    frameIndex += 1
    context
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("onCameraHeartRateFrame", payload)
  }

  private fun emitState(state: String) {
    val payload = Arguments.createMap().apply {
      putString("state", state)
      putDouble("timestamp", System.currentTimeMillis().toDouble())
    }

    context
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("onCameraHeartRateState", payload)
  }

  private fun emitError(message: String) {
    val payload = Arguments.createMap().apply {
      putString("message", message)
      putDouble("timestamp", System.currentTimeMillis().toDouble())
    }

    context
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("onCameraHeartRateError", payload)
  }
}