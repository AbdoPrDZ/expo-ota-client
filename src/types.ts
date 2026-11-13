/** Server coordinates, written by the config plugin into `extra.otaClient`. */
export interface OtaClientConfig {
  /** Scheme + host of the OTACenter server, e.g. `https://ota.example.com`. */
  serverUrl: string;
  /** API key of this runtime's version in OTACenter (sent as `API-KEY`). */
  apiKey: string;
  /** The app's package name in OTACenter. */
  package: string;
  /** Where to send iOS users when a new native build exists (App Store / TestFlight link). */
  iosUpdateUrl?: string;
}

/** How insistently the server wants an update installed. */
export type OtaUpdateType = 'optional' | 'force';

/** OTACenter metadata carried in an update manifest (`extra.otaCenter`). */
export interface OtaCenterMetadata {
  bundleId?: number;
  bundleName?: string;
  updateType?: OtaUpdateType;
  changelog?: string | null;
  demo?: boolean;
}

/** A JS update (bundle) offered by the server. */
export interface OtaUpdate {
  /** expo-updates update id (UUID). */
  id: string;
  createdAt: Date | null;
  bundleId: number | null;
  bundleName: string | null;
  updateType: OtaUpdateType;
  changelog: string | null;
  /** `true` when it is a demo release (offered to demo testers only). */
  demo: boolean;
}

/** A new native build (APK / store release) reported by the server. */
export interface OtaNativeUpdate {
  id: number;
  name: string;
  updateType: OtaUpdateType;
  /** SHA-256 of the installer, when known. */
  checksum: string | null;
  demo: boolean;
  /** Android: the APK download link. iOS: `iosUpdateUrl`. `null` when there is nowhere to send the user. */
  url: string | null;
}

/** What the app is running right now. */
export interface OtaRunningInfo {
  updateId: string | null;
  runtimeVersion: string | null;
  /** `true` while the update embedded in the binary runs. */
  isEmbedded: boolean;
  /** `true` when expo-updates fell back to the embedded update after a crash. */
  isEmergencyLaunch: boolean;
  bundleName: string | null;
  demo: boolean;
}

export type OtaCheckResult =
  | { type: 'none' }
  | { type: 'update'; update: OtaUpdate }
  /** The server asked to return to the embedded update; it applies on the next launch. */
  | { type: 'rollback' };

export interface OtaDeviceInfo {
  /** Stable per-install id, used by OTACenter to recognise the device. */
  did: string;
  manufacturer: string | null;
  brand: string | null;
  model: string | null;
  osVersion: string | null;
  apiLevel: string | null;
}

export interface OtaDeviceLink {
  linked: boolean;
  user: { id: number; name: string } | null;
  /** `true` when this device receives demo releases of the app. */
  demoEligible: boolean;
}

/** Events OTACenter records in its activity log. */
export type OtaReportEvent =
  | 'update.available'
  | 'update.refused'
  | 'update.downloaded'
  | 'update.installed'
  | 'update.failed'
  | 'update.rollback'
  | 'bundle.launch_confirmed'
  | 'bundle.launch_failed';

export type OtaReportPayload = Record<string, string | number | boolean | null | undefined>;

export type OtaStatus =
  /** Updates are off (development build, Expo Go, or no server configured). */
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'up-to-date'
  /** A JS update is available. */
  | 'update-available'
  /** A new native build is available. */
  | 'native-update-available'
  | 'downloading'
  /** Downloaded; the app is restarting into it. */
  | 'restarting'
  | 'failed';
