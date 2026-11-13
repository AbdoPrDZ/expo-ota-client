import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as Updates from 'expo-updates';

import { OtaContext, type OtaContextValue } from '../context';
import { toError } from '../errors';
import { errorCode, OTA_APK_ERRORS } from '../installer';
import { OtaClient } from '../OtaClient';
import type { OtaNativeUpdate, OtaStatus, OtaUpdate } from '../types';
import { OTAUpdateOverlay, type OTAUpdateOverlayProps } from './OTAUpdateOverlay';

export interface OTAProviderProps {
  children: ReactNode;
  /** Check for updates on mount. Default `true`. */
  autoCheck?: boolean;
  /** Also ask OTACenter for a new native build when there is no JS update. Default `true`. */
  checkNativeUpdates?: boolean;
  /** Report the launch outcome after this delay (ms). Default `2000`. */
  confirmDelayMs?: number;
  /** Report activity events to OTACenter. Default `true`. */
  reportEvents?: boolean;
  /** Render the built-in update UI. Default `true`. */
  showUpdateOverlay?: boolean;
  /** Props for the built-in overlay (copy, styles). */
  overlayProps?: Omit<OTAUpdateOverlayProps, 'visible'>;
  onStatusChange?: (status: OtaStatus) => void;
  onUpdateAvailable?: (update: OtaUpdate) => void;
  onNativeUpdateAvailable?: (update: OtaNativeUpdate) => void;
  onError?: (error: Error) => void;
}

/**
 * Runs the update flow and renders your app. On launch it registers the device,
 * checks for a JS update (expo-updates against OTACenter) and, when there is
 * none, for a new native build. It always renders `children`, so the app works
 * offline; the overlay sits on top when an update is pending.
 *
 * In development builds and Expo Go it does nothing (Metro serves the code).
 */
export function OTAProvider({
  children,
  autoCheck = true,
  checkNativeUpdates = true,
  confirmDelayMs = 2000,
  reportEvents = true,
  showUpdateOverlay = true,
  overlayProps,
  onStatusChange,
  onUpdateAvailable,
  onNativeUpdateAvailable,
  onError,
}: OTAProviderProps) {
  const enabled = OtaClient.isEnabled();
  const [status, setStatus] = useState<OtaStatus>(enabled ? 'idle' : 'disabled');
  const [update, setUpdate] = useState<OtaUpdate | null>(null);
  const [nativeUpdate, setNativeUpdate] = useState<OtaNativeUpdate | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [downloadKind, setDownloadKind] = useState<'update' | 'native' | null>(null);
  const [nativeProgress, setNativeProgress] = useState<number | null>(null);

  const { downloadProgress } = Updates.useUpdates();
  const running = useMemo(() => OtaClient.getRunningInfo(), []);

  const callbacks = useRef({ onStatusChange, onUpdateAvailable, onNativeUpdateAvailable, onError });
  callbacks.current = { onStatusChange, onUpdateAvailable, onNativeUpdateAvailable, onError };

  const report = useCallback<typeof OtaClient.reportEvent>(
    (...args) => (reportEvents ? OtaClient.reportEvent(...args) : Promise.resolve(false)),
    [reportEvents],
  );

  const move = useCallback((next: OtaStatus) => {
    setStatus(next);
    callbacks.current.onStatusChange?.(next);
  }, []);

  const fail = useCallback(
    (cause: unknown) => {
      const err = toError(cause);
      setError(err);
      move('failed');
      callbacks.current.onError?.(err);
      return err;
    },
    [move],
  );

  const checkForUpdates = useCallback(async () => {
    if (!enabled) return;

    move('checking');
    setError(null);
    setDismissed(false);

    try {
      const result = await OtaClient.checkForUpdate();

      if (result.type === 'update') {
        setUpdate(result.update);
        setNativeUpdate(null);
        move('update-available');
        callbacks.current.onUpdateAvailable?.(result.update);
        void report('update.available', { update: result.update.bundleName ?? result.update.id, demo: result.update.demo });
        return;
      }

      if (result.type === 'rollback') {
        // Stage the rollback; expo-updates applies it on the next launch.
        await OtaClient.downloadUpdate();
      }

      setUpdate(null);

      const native = checkNativeUpdates ? await OtaClient.checkNativeUpdate() : null;
      if (native) {
        setNativeUpdate(native);
        move('native-update-available');
        callbacks.current.onNativeUpdateAvailable?.(native);
        void report('update.available', { version: native.name, native: true, demo: native.demo });
        return;
      }

      move('up-to-date');
    } catch (cause) {
      // An unreachable server must never block the app: log it and carry on.
      const err = toError(cause);
      setError(err);
      move('up-to-date');
      callbacks.current.onError?.(err);
    }
  }, [enabled, checkNativeUpdates, move, report]);

  const downloadAndInstall = useCallback(async () => {
    if (!enabled || !update) return;

    move('downloading');
    setDownloadKind('update');
    setError(null);

    try {
      await OtaClient.downloadUpdate();
      await report('update.downloaded', { update: update.bundleName ?? update.id });

      move('restarting');
      await report('update.installed', { update: update.bundleName ?? update.id });
      await OtaClient.applyUpdate();
    } catch (cause) {
      const err = fail(cause);
      void report('update.failed', { update: update.bundleName ?? update.id }, err.message);
    }
  }, [enabled, update, move, report, fail]);

  const openNativeUpdate = useCallback(async () => {
    if (!nativeUpdate) return;

    // iOS, or a build made before the native module was added: open the link.
    if (!OtaClient.supportsInAppNativeUpdate()) {
      try {
        await OtaClient.openNativeUpdate(nativeUpdate);
      } catch (cause) {
        setError(toError(cause));
      }
      return;
    }

    setError(null);

    if (!(await OtaClient.canInstallNativeUpdate())) {
      await OtaClient.openInstallSettings();

      const err = new Error('Allow this app to install updates, then tap Download again.');
      (err as Error & { code?: string }).code = OTA_APK_ERRORS.installPermission;
      setError(err);
      return;
    }

    setDownloadKind('native');
    setNativeProgress(null);
    move('downloading');

    try {
      await OtaClient.installNativeUpdate(nativeUpdate, { onProgress: (fraction) => setNativeProgress(fraction) });
      void report('update.downloaded', { version: nativeUpdate.name, native: true });
    } catch (cause) {
      if (errorCode(cause) !== OTA_APK_ERRORS.cancelled) {
        const err = toError(cause);
        setError(err);
        callbacks.current.onError?.(err);
        void report('update.failed', { version: nativeUpdate.name, native: true }, err.message);
      }
    } finally {
      setDownloadKind(null);
      // The installer now covers the app; if the user backs out, offer it again.
      move('native-update-available');
    }
  }, [nativeUpdate, move, report]);

  const cancelDownload = useCallback(async () => {
    await OtaClient.cancelNativeUpdate();
  }, []);

  const forceUpdate =
    (status === 'update-available' && update?.updateType === 'force') ||
    (status === 'native-update-available' && nativeUpdate?.updateType === 'force');

  const dismissUpdate = useCallback(() => {
    if (forceUpdate) return;

    setDismissed(true);
    void report('update.refused', { update: update?.bundleName ?? nativeUpdate?.name ?? null });
  }, [forceUpdate, update, nativeUpdate, report]);

  const retry = useCallback(async () => {
    if (update) await downloadAndInstall();
    else await checkForUpdates();
  }, [update, downloadAndInstall, checkForUpdates]);

  // Launch: register the device, report the outcome, then check.
  useEffect(() => {
    if (!enabled) return;

    const timer = setTimeout(() => void OtaClient.confirmLaunch(), confirmDelayMs);

    if (autoCheck) void checkForUpdates();
    else void OtaClient.getDeviceInfo().catch(() => undefined);

    return () => clearTimeout(timer);
    // Runs once per mount by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<OtaContextValue>(
    () => ({
      status,
      update,
      nativeUpdate,
      forceUpdate,
      isDemo: (status === 'native-update-available' ? nativeUpdate?.demo : update?.demo) ?? false,
      progress:
        status !== 'downloading'
          ? null
          : downloadKind === 'native'
            ? nativeProgress
            : typeof downloadProgress === 'number'
              ? downloadProgress
              : null,
      downloadKind,
      error,
      dismissed,
      running,
      checkForUpdates,
      downloadAndInstall,
      openNativeUpdate,
      cancelDownload,
      dismissUpdate,
      retry,
    }),
    [status, update, nativeUpdate, forceUpdate, downloadProgress, downloadKind, nativeProgress, error, dismissed, running, checkForUpdates, downloadAndInstall, openNativeUpdate, cancelDownload, dismissUpdate, retry],
  );

  return (
    <OtaContext.Provider value={value}>
      {children}
      {showUpdateOverlay && enabled ? <OTAUpdateOverlay {...overlayProps} /> : null}
    </OtaContext.Provider>
  );
}
