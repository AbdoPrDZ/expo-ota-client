import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { toError } from '../errors';
import { OtaClient } from '../OtaClient';
import { otaColors, otaRadius, otaSpacing } from '../styles';
import type { OtaDeviceLink } from '../types';

export interface OTADemoAccessCopy {
  title: string;
  intro: string;
  codePlaceholder: string;
  linkLabel: string;
  unlinkLabel: string;
  linkedAs: string;
  eligible: string;
  notEligible: string;
}

export interface OTADemoAccessScreenProps {
  /** Called after the device is linked; check for updates here to receive a demo right away. */
  onLinked?: (link: OtaDeviceLink) => void;
  onUnlinked?: () => void;
  copy?: Partial<OTADemoAccessCopy>;
  style?: StyleProp<ViewStyle>;
}

const defaultCopy: OTADemoAccessCopy = {
  title: 'Demo access',
  intro: 'Enter the code from OTACenter (Users → Demo access) to receive demo releases on this device.',
  codePlaceholder: 'ABCD-2345',
  linkLabel: 'Link this device',
  unlinkLabel: 'Unlink',
  linkedAs: 'Linked to',
  eligible: 'This device receives demo releases.',
  notEligible: 'Not in a domain that allows demos: only public releases are received.',
};

/**
 * Links the device to an OTACenter user with a one-time code, so it receives
 * demo releases. Put it behind a settings or debug menu.
 */
export function OTADemoAccessScreen({ onLinked, onUnlinked, copy, style }: OTADemoAccessScreenProps) {
  const texts = { ...defaultCopy, ...copy };
  const [link, setLink] = useState<OtaDeviceLink | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (action: () => Promise<OtaDeviceLink>) => {
    setBusy(true);
    setError(null);

    try {
      const result = await action();
      setLink(result);
      return result;
    } catch (cause) {
      setError(toError(cause).message);
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void run(() => OtaClient.getDeviceLink());
  }, [run]);

  const submit = async () => {
    const result = await run(() => OtaClient.linkDevice(code.trim()));
    if (result?.linked) {
      setCode('');
      onLinked?.(result);
    }
  };

  const unlink = async () => {
    const result = await run(() => OtaClient.unlinkDevice());
    if (result && !result.linked) onUnlinked?.();
  };

  return (
    <View style={[styles.container, style]}>
      <Text style={styles.title}>{texts.title}</Text>

      {link?.linked ? (
        <View style={styles.block}>
          <Text style={styles.body}>
            {texts.linkedAs} <Text style={styles.strong}>{link.user?.name}</Text>
          </Text>
          <Text style={link.demoEligible ? styles.ok : styles.muted}>
            {link.demoEligible ? texts.eligible : texts.notEligible}
          </Text>
          <Pressable style={[styles.button, styles.secondary]} onPress={() => void unlink()} disabled={busy}>
            <Text style={styles.secondaryText}>{texts.unlinkLabel}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.block}>
          <Text style={styles.body}>{texts.intro}</Text>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder={texts.codePlaceholder}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
            style={styles.input}
          />
          <Pressable
            style={[styles.button, styles.primary, (!code.trim() || busy) && styles.disabled]}
            onPress={() => void submit()}
            disabled={!code.trim() || busy}
          >
            <Text style={styles.primaryText}>{texts.linkLabel}</Text>
          </Pressable>
        </View>
      )}

      {busy ? <ActivityIndicator color={otaColors.primary} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: otaSpacing.lg, gap: otaSpacing.md },
  title: { color: otaColors.title, fontSize: 20, fontWeight: '700' },
  block: { gap: otaSpacing.sm },
  body: { color: otaColors.body, fontSize: 14, lineHeight: 20 },
  strong: { fontWeight: '700', color: otaColors.title },
  ok: { color: '#047857', fontSize: 13 },
  muted: { color: otaColors.muted, fontSize: 13 },
  error: { color: otaColors.danger, fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: otaColors.border,
    borderRadius: otaRadius.sm,
    paddingHorizontal: otaSpacing.md,
    paddingVertical: 10,
    fontSize: 18,
    letterSpacing: 4,
  },
  button: { borderRadius: otaRadius.sm, paddingHorizontal: otaSpacing.md, paddingVertical: 12, alignItems: 'center' },
  primary: { backgroundColor: otaColors.primary },
  primaryText: { color: otaColors.primaryText, fontWeight: '600' },
  secondary: { backgroundColor: otaColors.secondary },
  secondaryText: { color: otaColors.secondaryText, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
