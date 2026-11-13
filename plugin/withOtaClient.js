'use strict';

/**
 * Expo config plugin: points expo-updates at an OTACenter server.
 *
 * ```json
 * ["expo-ota-client", { "serverUrl": "https://ota.example.com", "apiKey": "v1.xxx" }]
 * ```
 *
 * It only edits the app config (`updates` and `extra.otaClient`); expo-updates'
 * own plugin turns that into native configuration during prebuild.
 */

const API_PREFIX = '/ota-client/v1';

/** Options the runtime reads back from `Constants.expoConfig.extra.otaClient`. */
const RUNTIME_KEYS = ['serverUrl', 'apiKey', 'package', 'iosUpdateUrl'];

const CHECK_MODES = ['ON_LOAD', 'ON_ERROR_RECOVERY', 'WIFI_ONLY', 'NEVER'];

class OtaPluginError extends Error {
  constructor(message) {
    super(`[expo-ota-client] ${message}`);
    this.name = 'OtaPluginError';
  }
}

function manifestUrl(serverUrl, pkg) {
  return `${serverUrl.replace(/\/+$/, '')}${API_PREFIX}/expo/${encodeURIComponent(pkg)}/manifest`;
}

function isExpoUpdatesInstalled(projectRoot) {
  try {
    require.resolve('expo-updates/package.json', { paths: [projectRoot] });
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {import('@expo/config-types').ExpoConfig & { _internal?: { projectRoot?: string } }} config
 * @param {{
 *   serverUrl: string,
 *   apiKey: string,
 *   package?: string,
 *   checkAutomatically?: 'ON_LOAD' | 'ON_ERROR_RECOVERY' | 'WIFI_ONLY' | 'NEVER',
 *   codeSigningCertificate?: string,
 *   codeSigningKeyId?: string,
 *   iosUpdateUrl?: string,
 *   allowInsecure?: boolean,
 *   inAppNativeUpdates?: boolean,
 *   skipDependencyCheck?: boolean,
 * }} props
 */
function withOtaClient(config, props = {}) {
  const options = props || {};

  if (!options.serverUrl || typeof options.serverUrl !== 'string')
    throw new OtaPluginError('`serverUrl` is required, e.g. "https://ota.example.com".');

  if (!/^https?:\/\//.test(options.serverUrl))
    throw new OtaPluginError(`\`serverUrl\` must start with http:// or https:// (got "${options.serverUrl}").`);

  if (options.serverUrl.startsWith('http://') && !options.allowInsecure)
    throw new OtaPluginError(
      '`serverUrl` uses http://. Release builds must use https; pass `allowInsecure: true` for local testing only.',
    );

  if (!options.apiKey || typeof options.apiKey !== 'string')
    throw new OtaPluginError("`apiKey` is required: the API key of this runtime's version in OTACenter.");

  const pkg = options.package || config.android?.package || config.ios?.bundleIdentifier;
  if (!pkg)
    throw new OtaPluginError(
      'No package name: set `package`, `android.package` or `ios.bundleIdentifier`. It must equal the app\'s package name in OTACenter.',
    );

  if (!config.runtimeVersion)
    throw new OtaPluginError(
      '`runtimeVersion` is not set. OTACenter matches it to a version name, e.g. "runtimeVersion": "1.0.0" or { "policy": "appVersion" }.',
    );

  const checkAutomatically = options.checkAutomatically || 'NEVER';
  if (!CHECK_MODES.includes(checkAutomatically))
    throw new OtaPluginError(`\`checkAutomatically\` must be one of ${CHECK_MODES.join(', ')}.`);

  const projectRoot = config._internal?.projectRoot || process.cwd();
  if (!options.skipDependencyCheck && !isExpoUpdatesInstalled(projectRoot))
    throw new OtaPluginError('expo-updates is not installed. Run `npx expo install expo-updates`.');

  const updates = { ...config.updates };

  updates.enabled = true;
  updates.url = manifestUrl(options.serverUrl, pkg);
  // The provider runs the check itself, so it can show the update UI first.
  updates.checkAutomatically = checkAutomatically;
  updates.fallbackToCacheTimeout = updates.fallbackToCacheTimeout ?? 0;
  updates.requestHeaders = {
    ...updates.requestHeaders,
    'API-KEY': options.apiKey,
  };

  if (options.codeSigningCertificate) {
    updates.codeSigningCertificate = options.codeSigningCertificate;
    updates.codeSigningMetadata = {
      keyid: options.codeSigningKeyId || 'main',
      alg: 'rsa-v1_5-sha256',
    };
  }

  const runtime = { package: pkg };
  for (const key of RUNTIME_KEYS) {
    if (key !== 'package' && options[key] !== undefined) runtime[key] = options[key];
  }
  runtime.serverUrl = options.serverUrl.replace(/\/+$/, '');

  const result = {
    ...config,
    updates,
    extra: {
      ...config.extra,
      otaClient: runtime,
    },
  };

  let output = result;
  if (options.inAppNativeUpdates === false) output = withoutInstallPermission(output);
  if (options.allowInsecure && options.serverUrl.startsWith('http://')) output = withCleartextTraffic(output);

  return output;
}

/**
 * Android release builds refuse plain HTTP, which would break both the update
 * check and the in-app APK download against an `http://` test server.
 */
function withCleartextTraffic(config) {
  const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

  return withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    application.$['android:usesCleartextTraffic'] = 'true';

    return mod;
  });
}

const INSTALL_PERMISSION = 'android.permission.REQUEST_INSTALL_PACKAGES';

/**
 * Removes the install permission the native module declares (apps on Google
 * Play may not use it without approval). New native builds then open in the
 * browser / store instead of installing in-app.
 */
function withoutInstallPermission(config) {
  const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

  return withAndroidManifest(config, (mod) => {
    AndroidConfig.Manifest.ensureToolsAvailable(mod.modResults);

    const manifest = mod.modResults.manifest;
    const permissions = (manifest['uses-permission'] || []).filter(
      (entry) => entry.$['android:name'] !== INSTALL_PERMISSION,
    );

    permissions.push({ $: { 'android:name': INSTALL_PERMISSION, 'tools:node': 'remove' } });
    manifest['uses-permission'] = permissions;

    return mod;
  });
}

module.exports = withOtaClient;
module.exports.withOtaClient = withOtaClient;
module.exports.manifestUrl = manifestUrl;
module.exports.OtaPluginError = OtaPluginError;
