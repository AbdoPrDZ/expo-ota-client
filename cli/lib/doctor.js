'use strict';

const { fail, log, ok, readExpoConfig, resolveProjectRoot, resolveRuntime, warn } = require('./project');

/** Checks that the app is wired to OTACenter. Resolves `true` when nothing failed. */
async function runDoctor(options = {}) {
  const root = resolveProjectRoot(options.projectRoot);
  let healthy = true;
  const bad = (message) => {
    healthy = false;
    fail(message);
  };

  log(`Checking ${root}`);

  try {
    require.resolve('expo-updates/package.json', { paths: [root] });
    ok('expo-updates is installed');
  } catch {
    bad('expo-updates is not installed: run `npx expo install expo-updates`');
  }

  let config;
  try {
    config = readExpoConfig(root);
  } catch (error) {
    bad(`cannot read the app config: ${error.message}`);
    return false;
  }

  const ota = config.extra && config.extra.otaClient;
  if (ota && ota.serverUrl && ota.package) ok(`config plugin: ${ota.serverUrl} · package ${ota.package}`);
  else bad('the expo-ota-client config plugin is missing from app.json / app.config.js');

  const updates = config.updates || {};
  if (updates.url && updates.url.includes('/ota-client/v1/expo/')) ok(`updates.url → ${updates.url}`);
  else bad('updates.url does not point at an OTACenter manifest route');

  if (updates.enabled === false) bad('updates.enabled is false');

  let runtime = null;
  try {
    runtime = resolveRuntime(config, options.runtime);
    ok(`runtimeVersion ${runtime} (must equal the version name in OTACenter)`);
  } catch (error) {
    warn(error.message);
  }

  if (updates.codeSigningCertificate) ok('code signing is configured');
  else warn('code signing is not configured (optional; see `expo-ota-client cert`)');

  if (!ota || !ota.serverUrl) return false;

  const base = `${ota.serverUrl.replace(/\/+$/, '')}/ota-client/v1`;

  try {
    const response = await fetch(`${base}/health`);
    if (response.ok) ok(`server reachable (${base}/health)`);
    else bad(`health check answered ${response.status}`);
  } catch (error) {
    bad(`server unreachable: ${error.message}`);
    return false;
  }

  if (runtime && updates.url) {
    const headers = {
      'expo-protocol-version': '1',
      'expo-platform': options.platform || 'android',
      'expo-runtime-version': runtime,
      ...(updates.requestHeaders || {}),
    };

    try {
      const response = await fetch(updates.url, { headers });
      if (response.ok) ok('the API key is accepted and the manifest route answers');
      else if (response.status === 401) bad('the server rejects the API key: use the key of this runtime\'s version');
      else if (response.status === 404) bad(`the server does not know package ${ota.package}`);
      else bad(`manifest request answered ${response.status}`);
    } catch (error) {
      bad(`manifest request failed: ${error.message}`);
    }
  }

  log(healthy ? '\nReady to receive OTA updates.' : '\nFix the failures above.');

  return healthy;
}

module.exports = { runDoctor };
