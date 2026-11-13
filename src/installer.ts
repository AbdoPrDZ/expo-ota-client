import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

/** Error codes of the in-app APK update. */
export const OTA_APK_ERRORS = {
  /** The user has not allowed this app to install packages ("install unknown apps"). */
  installPermission: 'E_OTA_INSTALL_PERMISSION',
  cancelled: 'E_OTA_APK_CANCELLED',
  checksum: 'E_OTA_APK_CHECKSUM',
  notApk: 'E_OTA_NOT_APK',
  http: 'E_OTA_APK_HTTP',
  download: 'E_OTA_APK_DOWNLOAD',
  install: 'E_OTA_APK_INSTALL',
  busy: 'E_OTA_APK_BUSY',
} as const;

export interface InstallerProgress {
  received: number;
  /** `-1` when the server sends no Content-Length. */
  total: number;
}

interface NativeInstaller {
  canInstall(): Promise<boolean>;
  openInstallSettings(): Promise<boolean>;
  downloadAndInstall(options: {
    url: string;
    fileName: string;
    headers: Record<string, string>;
    checksum: string | null;
  }): Promise<boolean>;
  cancel(): Promise<boolean>;
  addListener(event: 'onProgress', listener: (event: InstallerProgress) => void): { remove(): void };
}

/**
 * The `ExpoOtaInstaller` native module (Android). `null` on iOS, and in a build
 * made before the module was added (rebuild the app to get it).
 */
export const installer: NativeInstaller | null =
  Platform.OS === 'android' ? requireOptionalNativeModule<NativeInstaller>('ExpoOtaInstaller') : null;

/** The bridge `code` of an error, if any. */
export function errorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;

  return typeof code === 'string' ? code : null;
}
