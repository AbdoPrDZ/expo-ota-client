package expo.modules.otaclient

import android.content.Context
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlin.concurrent.thread

/** Options of `downloadAndInstall()`. */
class DownloadOptions : Record {
  @Field
  val url: String = ""

  @Field
  val fileName: String = "update.apk"

  @Field
  val headers: Map<String, String> = emptyMap()

  /** Hex SHA-256 from OTACenter; the download is rejected when it does not match. */
  @Field
  val checksum: String? = null
}

/**
 * `ExpoOtaInstaller`: downloads a new APK inside the app and opens the system
 * installer, so a new native build never goes through the browser. Android only.
 */
class ExpoOtaInstallerModule : Module() {

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  /** Cancel flag of the running download; `null` when none runs. */
  private val running = AtomicReference<AtomicBoolean?>(null)

  private val mainHandler = Handler(Looper.getMainLooper())

  override fun definition() = ModuleDefinition {
    Name("ExpoOtaInstaller")

    Events(PROGRESS_EVENT)

    AsyncFunction("canInstall") {
      ApkInstaller.canInstall(context)
    }

    AsyncFunction("openInstallSettings") {
      ApkInstaller.openInstallSettings(context)
    }

    AsyncFunction("cancel") {
      val flag = running.get()
      flag?.set(true)
      flag != null
    }

    AsyncFunction("downloadAndInstall") { options: DownloadOptions, promise: Promise ->
      val ctx = context

      if (!ApkInstaller.canInstall(ctx)) {
        promise.reject(ApkInstaller.E_INSTALL_PERMISSION, "The app is not allowed to install packages yet.", null)
        return@AsyncFunction
      }

      if (options.url.isBlank()) {
        promise.reject(ApkInstaller.E_DOWNLOAD, "No download URL.", null)
        return@AsyncFunction
      }

      val cancelled = AtomicBoolean(false)
      if (!running.compareAndSet(null, cancelled)) {
        promise.reject(E_BUSY, "An app update is already downloading.", null)
        return@AsyncFunction
      }

      thread(name = "ExpoOtaInstaller") {
        try {
          val file = ApkInstaller.download(
            context = ctx,
            url = options.url,
            fileName = options.fileName,
            headers = options.headers,
            expectedSha256 = options.checksum,
            cancelled = cancelled,
          ) { received, total ->
            sendEvent(PROGRESS_EVENT, mapOf("received" to received.toDouble(), "total" to total.toDouble()))
          }

          mainHandler.post {
            try {
              ApkInstaller.launchInstaller(ctx, file)
              promise.resolve(true)
            } catch (e: ApkInstaller.ApkInstallException) {
              promise.reject(e.code, e.message, e)
            }
          }
        } catch (e: ApkInstaller.ApkInstallException) {
          promise.reject(e.code, e.message, e)
        } catch (e: Exception) {
          promise.reject(ApkInstaller.E_DOWNLOAD, e.message, e)
        } finally {
          running.set(null)
        }
      }
    }
  }

  private companion object {
    const val PROGRESS_EVENT = "onProgress"
    const val E_BUSY = "E_OTA_APK_BUSY"
  }
}
