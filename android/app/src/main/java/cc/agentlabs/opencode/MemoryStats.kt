package cc.agentlabs.opencode

import android.os.Debug
import android.view.View
import android.view.ViewGroup
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.uimanager.ViewManager

class MemoryStatsModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "MemoryStats"

  @ReactMethod
  fun snapshot(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        val runtime = Runtime.getRuntime()
        var views = 0
        var capped = false
        fun visit(view: View, depth: Int) {
          if (views >= 20000 || depth >= 128) { capped = true; return }
          views++
          if (view is ViewGroup) {
            for (i in 0 until view.childCount) visit(view.getChildAt(i), depth + 1)
          }
        }
        reactApplicationContext.currentActivity?.window?.decorView?.let { visit(it, 0) }
        val result = Arguments.createMap()
        result.putDouble("java_heap_used_bytes", (runtime.totalMemory() - runtime.freeMemory()).toDouble())
        result.putDouble("java_heap_limit_bytes", runtime.maxMemory().toDouble())
        result.putDouble("native_heap_used_bytes", Debug.getNativeHeapAllocatedSize().toDouble())
        result.putInt("native_view_count", views)
        result.putInt("native_view_count_capped", if (capped) 1 else 0)
        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("MEMORY_SAMPLE", error)
      }
    }
  }
}

class MemoryStatsPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
    listOf(MemoryStatsModule(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
