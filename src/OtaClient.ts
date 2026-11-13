import { Linking, Platform } from 'react-native';
import * as Updates from 'expo-updates';

import { apiBase, configure as configureClient, getConfig } from './config';
import { deviceInfoHeader, getDeviceInfo, getParam, PARAM, setParam } from './device';
import { OtaDisabledError } from './errors';
import { health, post } from './http';
import { installer, type InstallerProgress } from './installer';
import type {
  OtaCenterMetadata,
  OtaCheckResult,
  OtaClientConfig,
  OtaDeviceInfo,
  OtaDeviceLink,
  OtaNativeUpdate,
  OtaReportEvent,
  OtaReportPayload,
  OtaRunningInfo,
  OtaUpdate,
  OtaUpdateType,
} from './types';

/** Bundle name reported to OTACenter while the embedded update runs. */
const EMBEDDED_BUNDLE = 'embedded';

interface ServerUpdateInfo {
  id: number;
  name: string;
  updateType?: OtaUpdateType | null;
  checksum?: string | null;
  demo?: boolean;
}

interface AppInfoResponse {
  availableUpdates: { version: ServerUpdateInfo | null; bundle: ServerUpdateInfo | null };
}

function metadataOf(manifest: unknown): OtaCenterMetadata {
  const extra = (manifest as { extra?: { otaCenter?: OtaCenterMetadata } } | null | undefined)?.extra;

  return extra?.otaCenter ?? {};
}

function toUpdate(manifest: unknown): OtaUpdate {
  const m = (manifest ?? {}) as { id?: string; createdAt?: string };
  const meta = metadataOf(manifest);

  return {
    id: m.id ?? '',
    createdAt: m.createdAt ? new Date(m.createdAt) : null,
    bundleId: meta.bundleId ?? null,
    bundleName: meta.bundleName ?? null,
    updateType: meta.updateType === 'force' ? 'force' : 'optional',
    changelog: meta.changelog ?? null,
    demo: meta.demo === true,
  };
}

function requireConfig(): OtaClientConfig {
  const config = getConfig();
  if (!config) throw new OtaDisabledError('no server configured (add the expo-ota-client config plugin)');

  return config;
}

/**
 * Imperative API. expo-updates downloads and applies JS updates; this adds
 * OTACenter's metadata (forced updates, demos, changelog), native-build checks,
 * device linking and activity reporting.
 */
export const OtaClient = {
  /** `true` in a release build with expo-updates enabled and a server configured. */
  isEnabled(): boolean {
    return Updates.isEnabled && !__DEV__ && getConfig() !== null;
  },

  getConfig,

  /** Overrides server values for this package's own requests (not expo-updates' manifest URL). */
  configure: configureClient,

  getDeviceInfo(): Promise<OtaDeviceInfo> {
    return getDeviceInfo();
  },

  /** What runs right now. */
  getRunningInfo(): OtaRunningInfo {
    const meta = metadataOf(Updates.manifest);

    return {
      updateId: Updates.updateId ?? null,
      runtimeVersion: Updates.runtimeVersion ?? null,
      isEmbedded: Updates.isEmbeddedLaunch,
      isEmergencyLaunch: Updates.isEmergencyLaunch,
      bundleName: Updates.isEmbeddedLaunch ? null : (meta.bundleName ?? null),
      demo: !Updates.isEmbeddedLaunch && meta.demo === true,
    };
  },

  /** `GET /health`; `false` when the server cannot be reached. */
  async isServerReachable(): Promise<boolean> {
    const config = getConfig();
    return config ? health(config) : false;
  },

  /** Asks the server for a JS update (expo-updates manifest request). */
  async checkForUpdate(): Promise<OtaCheckResult> {
    if (!Updates.isEnabled) throw new OtaDisabledError('expo-updates is disabled in this build');

    // Registers the device id first, so the request can be matched to a (demo) user.
    await getDeviceInfo();

    const result = await Updates.checkForUpdateAsync();

    if (result.isRollBackToEmbedded) return { type: 'rollback' };
    if (!result.isAvailable || !result.manifest) return { type: 'none' };

    return { type: 'update', update: toUpdate(result.manifest) };
  },

  /** Downloads the update found by `checkForUpdate()`; it applies on `applyUpdate()` or the next launch. */
  async downloadUpdate(): Promise<OtaUpdate | null> {
    const result = await Updates.fetchUpdateAsync();

    return result.manifest ? toUpdate(result.manifest) : null;
  },

  /** Restarts the app into the downloaded update. */
  async applyUpdate(): Promise<void> {
    await Updates.reloadAsync();
  },

  /**
   * Asks OTACenter whether a new native build exists for this runtime
   * (`POST /app/info`). JS updates are expo-updates' job; this only reports
   * builds that need a new install.
   */
  async checkNativeUpdate(): Promise<OtaNativeUpdate | null> {
    const config = requireConfig();
    const running = this.getRunningInfo();

    const data = await post<AppInfoResponse>(config, '/app/info', {
      version: running.runtimeVersion ?? '',
      bundle: running.bundleName ?? EMBEDDED_BUNDLE,
    });

    const version = data?.availableUpdates?.version;
    if (!version) return null;

    return {
      id: version.id,
      name: version.name,
      updateType: version.updateType === 'force' ? 'force' : 'optional',
      checksum: version.checksum ?? null,
      demo: version.demo === true,
      url: await this.nativeUpdateUrl(version.id),
    };
  },

  /**
   * Android: the APK link (it also carries the key and device id, so it works
   * from a browser too). iOS: `iosUpdateUrl` from the plugin options.
   */
  async nativeUpdateUrl(versionId: number): Promise<string | null> {
    const config = requireConfig();

    if (Platform.OS !== 'android') return config.iosUpdateUrl ?? null;

    const { did } = await getDeviceInfo();
    const query = `api_key=${encodeURIComponent(config.apiKey)}&did=${encodeURIComponent(did)}`;

    return `${apiBase(config)}/app/update/version/${versionId}?${query}`;
  },

  /** `true` when a new APK can be downloaded and installed inside the app (Android, rebuilt with this package). */
  supportsInAppNativeUpdate(): boolean {
    return installer !== null;
  },

  /** Whether the app may open the package installer ("install unknown apps" on Android 8+). */
  async canInstallNativeUpdate(): Promise<boolean> {
    return installer ? installer.canInstall() : false;
  },

  /** Opens the system "install unknown apps" toggle for this app. */
  async openInstallSettings(): Promise<boolean> {
    return installer ? installer.openInstallSettings() : false;
  },

  /**
   * Installs a new native build. On Android the APK is downloaded inside the
   * app — no browser — checked against the server's SHA-256, and handed to the
   * system installer; resolves once the installer is shown. Rejects with a
   * `code` from `OTA_APK_ERRORS` (notably `installPermission`). On iOS, and in
   * a build without the native module, the link is opened instead.
   *
   * @param onProgress 0–1, or `null` when the size is unknown.
   */
  async installNativeUpdate(
    update: OtaNativeUpdate,
    { onProgress }: { onProgress?: (fraction: number | null, raw: InstallerProgress) => void } = {},
  ): Promise<boolean> {
    if (!update.url) return false;
    if (!installer) return this.openNativeUpdate(update);

    const config = requireConfig();
    const device = await getDeviceInfo();
    const subscription = onProgress
      ? installer.addListener('onProgress', (event) => onProgress(event.total > 0 ? event.received / event.total : null, event))
      : null;

    try {
      return await installer.downloadAndInstall({
        url: update.url,
        fileName: `${config.package}-${update.name}.apk`,
        headers: { 'API-KEY': config.apiKey, 'X-Device-Info': deviceInfoHeader(device) },
        checksum: update.checksum,
      });
    } finally {
      subscription?.remove();
    }
  },

  /** Cancels a running `installNativeUpdate()` download. */
  async cancelNativeUpdate(): Promise<boolean> {
    return installer ? installer.cancel() : false;
  },

  /**
   * Opens the native update link in the browser / store. On Android prefer
   * `installNativeUpdate()`, which stays inside the app.
   */
  async openNativeUpdate(update: OtaNativeUpdate): Promise<boolean> {
    if (!update.url) return false;

    await Linking.openURL(update.url);
    return true;
  },

  /**
   * Records an activity event in OTACenter (`POST /app/event`). Fire-and-forget:
   * resolves `false` on any failure and never throws.
   */
  async reportEvent(event: OtaReportEvent, payload: OtaReportPayload = {}, message?: string): Promise<boolean> {
    const config = getConfig();
    if (!config || !Updates.isEnabled) return false;

    const running = this.getRunningInfo();
    const meta = Object.keys(payload).length > 0 ? JSON.stringify(payload) : null;

    try {
      await post(config, '/app/event', {
        version: running.runtimeVersion ?? '',
        bundle: running.bundleName,
        event,
        message: message ?? null,
        meta,
      });
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Reports the outcome of this launch once per update: a successful OTA launch
   * (`bundle.launch_confirmed`) or an emergency fallback to the embedded update
   * (`update.rollback`). Called by `OTAProvider` after `confirmDelayMs`.
   */
  async confirmLaunch(): Promise<void> {
    if (!this.isEnabled()) return;

    const running = this.getRunningInfo();

    if (running.isEmergencyLaunch) {
      const key = `${Updates.emergencyLaunchReason ?? 'unknown'}`;
      if ((await getParam(PARAM.lastRollback)) === key) return;

      if (await this.reportEvent('update.rollback', { reason: Updates.emergencyLaunchReason ?? null }, 'Emergency launch of the embedded update'))
        await setParam(PARAM.lastRollback, key);
      return;
    }

    if (running.isEmbedded || !running.updateId) return;
    if ((await getParam(PARAM.lastConfirmed)) === running.updateId) return;

    if (await this.reportEvent('bundle.launch_confirmed', { updateId: running.updateId }, `Bundle ${running.bundleName ?? running.updateId} is running`))
      await setParam(PARAM.lastConfirmed, running.updateId);
  },

  /* ------------------------------ demo access ------------------------------ */

  /** Links this device to the user who created `code` in OTACenter (demo releases). */
  async linkDevice(code: string): Promise<OtaDeviceLink> {
    return post<OtaDeviceLink>(requireConfig(), '/device/link', { version: Updates.runtimeVersion ?? '', code });
  },

  async unlinkDevice(): Promise<OtaDeviceLink> {
    return post<OtaDeviceLink>(requireConfig(), '/device/unlink', { version: Updates.runtimeVersion ?? '' });
  },

  /** Who this device is linked to, and whether it receives demo releases. */
  async getDeviceLink(): Promise<OtaDeviceLink> {
    return post<OtaDeviceLink>(requireConfig(), '/device/info', { version: Updates.runtimeVersion ?? '' });
  },
};

export type OtaClientApi = typeof OtaClient;
