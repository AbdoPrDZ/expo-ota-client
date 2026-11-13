import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { OTADemoAccessScreen, OTAProvider, OtaClient, useOTA } from 'expo-ota-client';

/**
 * expo-ota-client example: the provider runs the update flow and shows the
 * built-in dialog; this screen shows the state and the actions.
 *
 * Updates only run in a release build (`npx expo run:android --variant release`).
 * In development the provider reports `disabled` and Metro serves the code.
 */
export default function App() {
  return (
    <OTAProvider onError={(error) => console.warn('[ota]', error.message)}>
      <SafeAreaView style={styles.safe}>
        <StatusBar style="auto" />
        <Home />
      </SafeAreaView>
    </OTAProvider>
  );
}

/** Changed for each test release, so you can see which code is running. */
const BUILD_LABEL = 'APK 1.1.0 · new native build';
const BUILD_COLOR = '#7C3AED';

function Home() {
  const { status, update, nativeUpdate, running, error, checkForUpdates } = useOTA();
  const [showDemo, setShowDemo] = useState(false);
  const config = OtaClient.getConfig();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>OTA Example</Text>
      <Text style={styles.subtitle}>expo-ota-client + OTACenter</Text>
      <View style={[styles.badge, { backgroundColor: BUILD_COLOR }]}>
        <Text style={styles.badgeText}>{BUILD_LABEL}</Text>
      </View>

      <Section title="Status">
        <Row label="Status" value={status} />
        {update ? <Row label="Update" value={`${update.bundleName ?? update.id}${update.demo ? ' (demo)' : ''}`} /> : null}
        {nativeUpdate ? <Row label="Native update" value={nativeUpdate.name} /> : null}
        {error ? <Row label="Last error" value={error.message} /> : null}
      </Section>

      <Section title="Running">
        <Row label="Runtime" value={running.runtimeVersion ?? '—'} />
        <Row label="Bundle" value={running.isEmbedded ? 'embedded' : (running.bundleName ?? '—')} />
        <Row label="Update id" value={running.updateId ?? '—'} />
        <Row label="Demo" value={running.demo ? 'yes' : 'no'} />
        <Row label="Emergency launch" value={running.isEmergencyLaunch ? 'yes' : 'no'} />
      </Section>

      <Section title="Server">
        <Row label="URL" value={config?.serverUrl ?? 'not configured'} />
        <Row label="Package" value={config?.package ?? '—'} />
      </Section>

      <Button label="Check for updates" onPress={() => void checkForUpdates()} disabled={status === 'disabled'} />
      <Button
        label={showDemo ? 'Hide demo access' : 'Demo access'}
        onPress={() => setShowDemo((value) => !value)}
        disabled={status === 'disabled'}
        secondary
      />

      {showDemo ? <OTADemoAccessScreen onLinked={() => void checkForUpdates()} /> : null}

      {status === 'disabled' ? (
        <Text style={styles.note}>
          Updates are off in development builds. Build a release to try them: npx expo run:android --variant release
        </Text>
      ) : null}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Button({
  label,
  onPress,
  disabled,
  secondary,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, secondary && styles.buttonSecondary, disabled && styles.buttonDisabled]}
    >
      <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  container: { padding: 20, gap: 14 },
  title: { fontSize: 24, fontWeight: '700', color: '#111827', marginTop: 24 },
  subtitle: { fontSize: 14, color: '#6B7280' },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  badgeText: { color: '#FFFFFF', fontWeight: '700' },
  section: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#374151', textTransform: 'uppercase' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  label: { color: '#6B7280', fontSize: 14 },
  value: { color: '#111827', fontSize: 14, flexShrink: 1, textAlign: 'right' },
  button: { backgroundColor: '#2563EB', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  buttonSecondary: { backgroundColor: '#E5E7EB' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#FFFFFF', fontWeight: '600' },
  buttonTextSecondary: { color: '#111827' },
  note: { color: '#6B7280', fontSize: 13, textAlign: 'center' },
});
