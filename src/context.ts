import { createContext, useContext } from 'react';

import type { OtaNativeUpdate, OtaRunningInfo, OtaStatus, OtaUpdate } from './types';

export interface OtaContextValue {
  status: OtaStatus;
  /** The JS update the server offers, when `status` is `update-available`. */
  update: OtaUpdate | null;
  /** A new native build, when `status` is `native-update-available`. */
  nativeUpdate: OtaNativeUpdate | null;
  /** `true` when the pending update (JS or native) is required: no "not now". */
  forceUpdate: boolean;
  /** `true` when the pending update is a demo release. */
  isDemo: boolean;
  /** 0–1 while downloading, `null` when unknown. */
  progress: number | null;
  /** What is downloading while `status` is `downloading`: a JS update or a new native build. */
  downloadKind: 'update' | 'native' | null;
  error: Error | null;
  /** The user postponed the pending optional update. */
  dismissed: boolean;
  running: OtaRunningInfo;

  checkForUpdates(): Promise<void>;
  /** Downloads the pending JS update and restarts into it. */
  downloadAndInstall(): Promise<void>;
  /**
   * Installs the new native build. Android: downloads the APK inside the app
   * (progress in `progress`) and opens the system installer; when installs are
   * not allowed yet it opens that setting and sets `error` (code
   * `E_OTA_INSTALL_PERMISSION`) — call it again afterwards. iOS: opens the store link.
   */
  openNativeUpdate(): Promise<void>;
  /** Cancels the in-app APK download. */
  cancelDownload(): Promise<void>;
  /** Postpones an optional update (ignored for a forced one). */
  dismissUpdate(): void;
  retry(): Promise<void>;
}

export const OtaContext = createContext<OtaContextValue | null>(null);

/** The provider's state and actions. Must be used inside `<OTAProvider>`. */
export function useOTA(): OtaContextValue {
  const value = useContext(OtaContext);

  if (!value) throw new Error('useOTA() must be used inside <OTAProvider>');

  return value;
}
