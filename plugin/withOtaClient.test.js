'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const withOtaClient = require('./withOtaClient');

const base = {
  name: 'Demo',
  slug: 'demo',
  version: '1.0.0',
  runtimeVersion: '1.0.0',
  android: { package: 'com.example.demo' },
};

const props = { serverUrl: 'https://ota.example.com/', apiKey: 'v1.key', skipDependencyCheck: true };

test('points expo-updates at the OTACenter manifest route', () => {
  const config = withOtaClient(base, props);

  assert.equal(config.updates.url, 'https://ota.example.com/ota-client/v1/expo/com.example.demo/manifest');
  assert.equal(config.updates.enabled, true);
  assert.equal(config.updates.checkAutomatically, 'NEVER');
  assert.equal(config.updates.fallbackToCacheTimeout, 0);
  assert.deepEqual(config.updates.requestHeaders, { 'API-KEY': 'v1.key' });
});

test('exposes the server coordinates to the runtime through extra.otaClient', () => {
  const config = withOtaClient({ ...base, extra: { other: 1 } }, { ...props, iosUpdateUrl: 'https://apps.apple.com/app/id1' });

  assert.deepEqual(config.extra, {
    other: 1,
    otaClient: {
      package: 'com.example.demo',
      serverUrl: 'https://ota.example.com',
      apiKey: 'v1.key',
      iosUpdateUrl: 'https://apps.apple.com/app/id1',
    },
  });
});

test('keeps existing request headers and update settings', () => {
  const config = withOtaClient(
    { ...base, updates: { requestHeaders: { 'expo-channel-name': 'beta' }, fallbackToCacheTimeout: 3000 } },
    props,
  );

  assert.deepEqual(config.updates.requestHeaders, { 'expo-channel-name': 'beta', 'API-KEY': 'v1.key' });
  assert.equal(config.updates.fallbackToCacheTimeout, 3000);
});

test('falls back to the iOS bundle identifier and honours an explicit package', () => {
  const ios = withOtaClient({ ...base, android: undefined, ios: { bundleIdentifier: 'com.example.ios' } }, props);
  assert.match(ios.updates.url, /\/expo\/com\.example\.ios\/manifest$/);

  const explicit = withOtaClient(base, { ...props, package: 'com.other.app' });
  assert.match(explicit.updates.url, /\/expo\/com\.other\.app\/manifest$/);
});

test('wires code signing', () => {
  const config = withOtaClient(base, { ...props, codeSigningCertificate: './certs/certificate.pem' });

  assert.equal(config.updates.codeSigningCertificate, './certs/certificate.pem');
  assert.deepEqual(config.updates.codeSigningMetadata, { keyid: 'main', alg: 'rsa-v1_5-sha256' });
});

test('rejects incomplete or unsafe configuration', () => {
  assert.throws(() => withOtaClient(base, { ...props, serverUrl: undefined }), /serverUrl/);
  assert.throws(() => withOtaClient(base, { ...props, apiKey: '' }), /apiKey/);
  assert.throws(() => withOtaClient(base, { ...props, serverUrl: 'http://ota.local' }), /https/);
  assert.throws(() => withOtaClient({ ...base, runtimeVersion: undefined }, props), /runtimeVersion/);
  assert.throws(() => withOtaClient({ ...base, android: undefined }, props), /package/);
  assert.throws(() => withOtaClient(base, { ...props, checkAutomatically: 'SOMETIMES' }), /checkAutomatically/);
});

test('allows http for local testing when asked', () => {
  const config = withOtaClient(base, { ...props, serverUrl: 'http://192.168.1.10:8000', allowInsecure: true });

  assert.match(config.updates.url, /^http:\/\/192\.168\.1\.10:8000\/ota-client\/v1\/expo\//);
});

test('requires expo-updates unless the check is skipped', () => {
  // An empty folder outside this repo, where expo-updates cannot resolve.
  const empty = require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'no-expo-'));
  const config = { ...base, _internal: { projectRoot: empty } };

  assert.throws(() => withOtaClient(config, { ...props, skipDependencyCheck: false }), /expo-updates is not installed/);
});

test('can drop the install permission for store-distributed apps', () => {
  const kept = withOtaClient(base, props);
  assert.equal(kept.mods, undefined);

  const dropped = withOtaClient(base, { ...props, inAppNativeUpdates: false });
  assert.equal(typeof dropped.mods.android.manifest, 'function');
});
