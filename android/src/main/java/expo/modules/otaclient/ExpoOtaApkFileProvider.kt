package expo.modules.otaclient

import androidx.core.content.FileProvider

/**
 * Serves downloaded APKs to the package installer. A subclass, so the manifest
 * entry cannot collide with a FileProvider declared by the app or another library.
 */
class ExpoOtaApkFileProvider : FileProvider()
