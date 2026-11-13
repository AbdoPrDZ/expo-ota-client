'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

class CliError extends Error {}

const isWindows = process.platform === 'win32';

function log(message = '') {
  process.stdout.write(`${message}\n`);
}

function ok(message) {
  log(`  ok    ${message}`);
}

function warn(message) {
  log(`  warn  ${message}`);
}

function fail(message) {
  log(`  fail  ${message}`);
}

function resolveProjectRoot(input) {
  const root = path.resolve(input || process.cwd());

  if (!fs.existsSync(path.join(root, 'package.json')))
    throw new CliError(`No package.json in ${root}. Run this from your Expo app, or pass --project-root.`);

  return root;
}

/** Runs `npx <args>` in the project, inheriting stdio unless `capture` is set. */
function npx(root, args, { capture = false } = {}) {
  const options = {
    cwd: root,
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  };

  // `npx.cmd` needs a shell on Windows; pass one quoted command line rather than
  // shell + args, which Node does not escape.
  const result = isWindows
    ? spawnSync(['npx', ...args].map(quoteForCmd).join(' '), { ...options, shell: true })
    : spawnSync('npx', args, options);

  if (result.error) throw new CliError(`npx ${args.join(' ')} failed: ${result.error.message}`);
  if (result.status !== 0) throw new CliError(`npx ${args.join(' ')} exited with code ${result.status}`);

  return result.stdout;
}

function quoteForCmd(arg) {
  return /^[\w@%+=:,./\\-]+$/.test(arg) ? arg : `"${String(arg).replace(/"/g, '""')}"`;
}

/** The evaluated public app config (`npx expo config --json --type public`). */
function readExpoConfig(root) {
  const out = npx(root, ['expo', 'config', '--json', '--type', 'public'], { capture: true });

  try {
    return JSON.parse(out);
  } catch {
    throw new CliError('Could not parse the output of `npx expo config --json`.');
  }
}

/**
 * The runtime string OTACenter matches to a version name. Only a fixed string
 * or the `appVersion` policy can be resolved on the build machine.
 */
function resolveRuntime(config, override) {
  if (override) return override;

  const runtime = config.runtimeVersion;
  if (typeof runtime === 'string' && runtime) return runtime;
  if (runtime && runtime.policy === 'appVersion' && config.version) return config.version;

  throw new CliError(
    'Cannot resolve runtimeVersion from the app config (policy ' +
      JSON.stringify(runtime) +
      '). Use a fixed string or { "policy": "appVersion" }, or pass --runtime.',
  );
}

/** Server coordinates written by the config plugin. */
function otaOptions(config) {
  const options = (config.extra && config.extra.otaClient) || null;

  if (!options || !options.serverUrl || !options.package)
    throw new CliError('The expo-ota-client config plugin is not configured (no extra.otaClient in the app config).');

  return options;
}

function tempDir(prefix = 'expo-ota-client-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function removeQuietly(target) {
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch {
    // Best effort.
  }
}

module.exports = {
  CliError,
  fail,
  log,
  npx,
  ok,
  otaOptions,
  readExpoConfig,
  removeQuietly,
  resolveProjectRoot,
  resolveRuntime,
  tempDir,
  warn,
};
