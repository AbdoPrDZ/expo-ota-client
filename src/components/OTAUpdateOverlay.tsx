import { useMemo, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { useOTA, type OtaContextValue } from '../context';
import { otaColors, otaRadius, otaSpacing } from '../styles';

export interface OTAUpdateOverlayCopy {
  updateTitle: string;
  updateMessage: string;
  nativeUpdateTitle: string;
  nativeUpdateMessage: string;
  requiredTitle: string;
  requiredMessage: string;
  demoLabel: string;
  installLabel: string;
  openNativeLabel: string;
  laterLabel: string;
  downloadingLabel: string;
  downloadingNativeLabel: string;
  cancelLabel: string;
  restartingLabel: string;
  failedTitle: string;
  retryLabel: string;
}

export interface OTAUpdateOverlayProps {
  /** Force the overlay open/closed. Defaults to the provider's status. */
  visible?: boolean;
  /** Show "not now" for optional updates. Default `true`. */
  allowLater?: boolean;
  copy?: Partial<OTAUpdateOverlayCopy>;
  /** Render your own UI with the provider's state and actions. */
  render?: (state: OtaContextValue) => ReactNode;
  overlayStyle?: StyleProp<ViewStyle>;
  cardStyle?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  messageStyle?: StyleProp<TextStyle>;
  primaryButtonStyle?: StyleProp<ViewStyle>;
  secondaryButtonStyle?: StyleProp<ViewStyle>;
  progressTrackStyle?: StyleProp<ViewStyle>;
  progressFillStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

const defaultCopy: OTAUpdateOverlayCopy = {
  updateTitle: 'Update available',
  updateMessage: 'A new version is ready to install. The app restarts once it is downloaded.',
  nativeUpdateTitle: 'New app version',
  nativeUpdateMessage: 'A new version of the app is available. Install it to keep receiving updates.',
  requiredTitle: 'Update required',
  requiredMessage: 'This update is required. Install it to continue.',
  demoLabel: 'Demo release',
  installLabel: 'Install now',
  openNativeLabel: 'Download',
  laterLabel: 'Not now',
  downloadingLabel: 'Downloading update…',
  downloadingNativeLabel: 'Downloading the new version…',
  cancelLabel: 'Cancel',
  restartingLabel: 'Restarting…',
  failedTitle: 'Update failed',
  retryLabel: 'Retry',
};

/**
 * The update prompt, download progress and failure state. Rendered by
 * `OTAProvider`; a forced update hides "not now" and blocks the back button.
 */
export function OTAUpdateOverlay({
  visible,
  allowLater = true,
  copy,
  render,
  overlayStyle,
  cardStyle,
  titleStyle,
  messageStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  progressTrackStyle,
  progressFillStyle,
  testID = 'ota-update-overlay',
}: OTAUpdateOverlayProps) {
  const state = useOTA();
  const texts = useMemo(() => ({ ...defaultCopy, ...copy }), [copy]);
  const { status, update, nativeUpdate, forceUpdate, isDemo, progress, error, dismissed, downloadKind } = state;

  const pending = status === 'update-available' || status === 'native-update-available';
  const busy = status === 'downloading' || status === 'restarting';
  const failed = status === 'failed' && !!update;
  const isVisible = (visible ?? (pending || busy || failed)) && !dismissed;

  if (!isVisible) return null;
  if (render) return <>{render(state)}</>;

  const isNative = status === 'native-update-available' || downloadKind === 'native';
  const downloadingNative = busy && downloadKind === 'native';
  // "Allow installs", or a failed APK download: shown under the prompt.
  const notice = pending && error ? error.message : null;
  const canLater = allowLater && !forceUpdate && !busy;

  const title = failed ? texts.failedTitle : forceUpdate ? texts.requiredTitle : isNative ? texts.nativeUpdateTitle : texts.updateTitle;
  const changelog = isNative ? null : update?.changelog;
  const body = failed
    ? (error?.message ?? '')
    : `${forceUpdate ? `${texts.requiredMessage} ` : ''}${isNative ? texts.nativeUpdateMessage : texts.updateMessage}`;
  const releaseName = isNative ? nativeUpdate?.name : update?.bundleName;

  // Android back button: dismisses an optional update; a forced update ignores it
  // (the modal stays open because `visible` does not change).
  const onRequestClose = () => {
    if (canLater) state.dismissUpdate();
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onRequestClose} testID={testID}>
      <View style={[styles.overlay, overlayStyle]}>
        <View style={[styles.card, cardStyle]}>
          {isDemo ? (
            <View style={styles.demoBadge}>
              <Text style={styles.demoText}>{texts.demoLabel}</Text>
            </View>
          ) : null}

          <Text style={[styles.title, titleStyle]}>
            {title}
            {releaseName ? ` · ${releaseName}` : ''}
          </Text>
          <Text style={[styles.message, messageStyle]}>{body}</Text>
          {changelog ? <Text style={[styles.changelog, messageStyle]}>{changelog}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          {busy ? (
            <View style={styles.progressBlock}>
              <Text style={styles.progressLabel}>
                {status === 'restarting'
                  ? texts.restartingLabel
                  : downloadingNative
                    ? texts.downloadingNativeLabel
                    : texts.downloadingLabel}
              </Text>
              {progress != null ? (
                <View style={[styles.track, progressTrackStyle]}>
                  <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }, progressFillStyle]} />
                </View>
              ) : (
                <ActivityIndicator color={otaColors.primary} />
              )}
              {downloadingNative ? (
                <Pressable style={[styles.button, styles.secondary, styles.cancel, secondaryButtonStyle]} onPress={() => void state.cancelDownload()}>
                  <Text style={styles.secondaryText}>{texts.cancelLabel}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={styles.actions}>
              {canLater ? (
                <Pressable style={[styles.button, styles.secondary, secondaryButtonStyle]} onPress={state.dismissUpdate}>
                  <Text style={styles.secondaryText}>{texts.laterLabel}</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={[styles.button, styles.primary, primaryButtonStyle]}
                onPress={() => void (failed ? state.retry() : isNative ? state.openNativeUpdate() : state.downloadAndInstall())}
              >
                <Text style={styles.primaryText}>
                  {failed ? texts.retryLabel : isNative ? texts.openNativeLabel : texts.installLabel}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: otaSpacing.lg,
    backgroundColor: otaColors.overlay,
  },
  card: {
    borderRadius: otaRadius.lg,
    padding: otaSpacing.lg,
    backgroundColor: otaColors.card,
    gap: otaSpacing.sm,
  },
  demoBadge: {
    alignSelf: 'flex-start',
    borderRadius: otaRadius.pill,
    paddingHorizontal: otaSpacing.sm,
    paddingVertical: 2,
    backgroundColor: otaColors.warningBackground,
  },
  demoText: { color: otaColors.warning, fontSize: 12, fontWeight: '600' },
  title: { color: otaColors.title, fontSize: 18, fontWeight: '700' },
  message: { color: otaColors.body, fontSize: 14, lineHeight: 20 },
  changelog: { color: otaColors.muted, fontSize: 13, lineHeight: 18 },
  notice: { color: otaColors.danger, fontSize: 13, lineHeight: 18 },
  cancel: { alignSelf: 'flex-end' },
  progressBlock: { marginTop: otaSpacing.sm, gap: otaSpacing.sm },
  progressLabel: { color: otaColors.body, fontSize: 13 },
  track: { height: 6, borderRadius: otaRadius.pill, backgroundColor: otaColors.track, overflow: 'hidden' },
  fill: { height: 6, borderRadius: otaRadius.pill, backgroundColor: otaColors.primary },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: otaSpacing.sm, marginTop: otaSpacing.sm },
  button: { borderRadius: otaRadius.sm, paddingHorizontal: otaSpacing.md, paddingVertical: 10 },
  primary: { backgroundColor: otaColors.primary },
  primaryText: { color: otaColors.primaryText, fontWeight: '600' },
  secondary: { backgroundColor: otaColors.secondary },
  secondaryText: { color: otaColors.secondaryText, fontWeight: '600' },
});
