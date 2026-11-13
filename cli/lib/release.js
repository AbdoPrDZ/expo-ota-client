'use strict';

const fs = require('fs');
const path = require('path');

const {
  CliError,
  log,
  npx,
  readExpoConfig,
  removeQuietly,
  resolveProjectRoot,
  resolveRuntime,
  tempDir,
} = require('./project');
const { zipDirectory } = require('./zip');

const PLATFORMS = ['android', 'ios'];

function platformsFor(option) {
  if (!option || option === 'all') return PLATFORMS;
  if (PLATFORMS.includes(option)) return [option];

  throw new CliError(`--platform must be android, ios or all (got "${option}").`);
}

/**
 * Builds the upload for OTACenter: `npx expo export` output plus the public app
 * config (`expoConfig.json`, which carries the runtime version and becomes
 * `Constants.expoConfig` inside the update), zipped under `dist/`.
 */
async function runRelease(options = {}) {
  const root = resolveProjectRoot(options.projectRoot);
  const config = options.config || readExpoConfig(root);
  const runtime = resolveRuntime(config, options.runtime);
  const platforms = platformsFor(options.platform);
  const outDir = path.resolve(root, options.out || 'release');
  const name = `${config.slug || 'app'}-${runtime}-${config.version || '0.0.0'}`;
  const zipPath = path.join(outDir, `${name}.zip`);

  const staging = tempDir();
  const dist = path.join(staging, 'dist');

  try {
    log(`Exporting ${config.name || config.slug} for ${platforms.join(', ')} (runtime ${runtime})`);

    npx(root, [
      'expo',
      'export',
      ...platforms.flatMap((platform) => ['--platform', platform]),
      '--output-dir',
      dist,
    ]);

    if (!fs.existsSync(path.join(dist, 'metadata.json')))
      throw new CliError('`npx expo export` produced no metadata.json.');

    fs.writeFileSync(path.join(dist, 'expoConfig.json'), JSON.stringify({ ...config, runtimeVersion: runtime }, null, 2));

    fs.mkdirSync(outDir, { recursive: true });
    const count = await zipDirectory(dist, zipPath);

    log(`Created ${zipPath} (${count} files)`);

    return { zipPath, runtime, version: config.version, config };
  } finally {
    removeQuietly(staging);
  }
}

module.exports = { runRelease, platformsFor };
