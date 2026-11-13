#!/usr/bin/env node
'use strict';

const { Command } = require('commander');

const { AdminApi } = require('./lib/api');
const { runDoctor } = require('./lib/doctor');
const { CliError, log, npx, otaOptions, readExpoConfig, resolveProjectRoot, resolveRuntime } = require('./lib/project');
const { runRelease } = require('./lib/release');

const pkg = require('../package.json');

const program = new Command();

program
  .name('expo-ota-client')
  .description('Build, publish and promote Expo updates on an OTACenter server.')
  .version(pkg.version)
  .option('-r, --project-root <dir>', 'Expo app directory (defaults to cwd)');

const rootOf = () => program.opts().projectRoot;

/** Admin API for the configured server (or --server), plus the resolved project. */
function context(opts) {
  const root = resolveProjectRoot(rootOf());
  const config = readExpoConfig(root);
  const ota = otaOptions(config);
  const api = new AdminApi(opts.server || ota.serverUrl, opts.token || process.env.OTA_TOKEN);

  return { root, config, ota, api, runtime: resolveRuntime(config, opts.runtime) };
}

program
  .command('release')
  .description('Export the app and zip it for upload (release/<slug>-<runtime>-<version>.zip)')
  .option('-p, --platform <platform>', 'android, ios or all', 'all')
  .option('-o, --out <dir>', 'output directory', 'release')
  .option('--runtime <runtime>', 'override the resolved runtime version')
  .action(async (opts) => {
    await runRelease({ ...opts, projectRoot: rootOf() });
  });

program
  .command('publish')
  .description('Release and upload the bundle to OTACenter')
  .option('-t, --token <token>', 'OTACenter API token (or OTA_TOKEN)')
  .option('-s, --server <url>', 'OTACenter URL (defaults to the plugin serverUrl)')
  .option('-n, --name <name>', 'bundle name (defaults to the app version)')
  .option('-m, --changelog <text>', 'changelog')
  .option('-f, --file <zip>', 'upload an existing zip instead of exporting')
  .option('-p, --platform <platform>', 'android, ios or all', 'all')
  .option('--force-update', 'mark the update as required')
  .option('--demo', 'publish as a demo (only demo-domain members receive it)')
  .option('--activate', 'publish to everyone right away')
  .option('--runtime <runtime>', 'override the resolved runtime version')
  .action(async (opts) => {
    if (opts.demo && opts.activate) throw new CliError('Use either --demo or --activate, not both.');

    const { config, ota, api, runtime } = context(opts);
    const file = opts.file || (await runRelease({ ...opts, config, projectRoot: rootOf() })).zipPath;
    const name = opts.name || config.version;

    const app = await api.findApp(ota.package);
    const version = await api.findVersion(app.id, runtime);

    log(`Uploading ${name} to ${app.name} ${version.name}…`);
    const bundle = await api.uploadBundle(app.id, version.id, {
      file,
      name,
      changelog: opts.changelog,
      updateType: opts.forceUpdate ? 'force' : 'optional',
      runtime,
    });
    log(`Uploaded bundle #${bundle.id} (${(bundle.platforms || []).join(', ')})`);

    if (opts.demo) {
      await api.bundleAction(app.id, version.id, bundle.id, 'activate-demo');
      log('Published as a demo. Promote it with `expo-ota-client promote ' + name + '`.');
    } else if (opts.activate) {
      await api.bundleAction(app.id, version.id, bundle.id, 'activate');
      log('Published to everyone.');
    } else {
      log('Not published yet: activate it in OTACenter, or rerun with --activate / --demo.');
    }
  });

program
  .command('promote <bundle>')
  .description('Promote a demo bundle to public')
  .option('-t, --token <token>', 'OTACenter API token (or OTA_TOKEN)')
  .option('-s, --server <url>', 'OTACenter URL')
  .option('--runtime <runtime>', 'override the resolved runtime version')
  .action(async (bundleName, opts) => {
    const { ota, api, runtime } = context(opts);
    const app = await api.findApp(ota.package);
    const version = await api.findVersion(app.id, runtime);
    const bundle = await api.findBundle(app.id, version.id, bundleName);

    await api.bundleAction(app.id, version.id, bundle.id, 'promote');
    log(`${bundleName} is now public.`);
  });

program
  .command('login')
  .description('Get an API token for publish/promote (prints it; store it as OTA_TOKEN)')
  .requiredOption('-u, --user <login>', 'OTACenter login')
  .option('-P, --password <password>', 'password (or OTA_PASSWORD)')
  .option('-s, --server <url>', 'OTACenter URL (defaults to the plugin serverUrl)')
  .action(async (opts) => {
    const password = opts.password || process.env.OTA_PASSWORD;
    if (!password) throw new CliError('Pass --password or set OTA_PASSWORD.');

    const server = opts.server || otaOptions(readExpoConfig(resolveProjectRoot(rootOf()))).serverUrl;
    log(await AdminApi.login(server, opts.user, password));
  });

program
  .command('doctor')
  .description('Check that the app is wired to OTACenter')
  .option('--runtime <runtime>', 'override the resolved runtime version')
  .option('-p, --platform <platform>', 'platform for the manifest check', 'android')
  .action(async (opts) => {
    const healthy = await runDoctor({ ...opts, projectRoot: rootOf() });
    if (!healthy) process.exitCode = 1;
  });

program
  .command('cert')
  .description('Generate a code-signing key and certificate (wraps `expo-updates codesigning:generate`)')
  .option('--common-name <name>', 'certificate common name', 'OTACenter updates')
  .option('--years <years>', 'validity in years', '10')
  .action((opts) => {
    const root = resolveProjectRoot(rootOf());

    npx(root, [
      'expo-updates',
      'codesigning:generate',
      '--key-output-directory',
      'keys',
      '--certificate-output-directory',
      'certs',
      '--certificate-validity-duration-years',
      String(opts.years),
      '--certificate-common-name',
      opts.commonName,
    ]);

    log('');
    log('Next:');
    log('  1. App: add "codeSigningCertificate": "./certs/certificate.pem" to the expo-ota-client plugin options.');
    log('  2. Server: copy keys/private-key.pem to OTACenter and set OTA_EXPO_SIGNING_KEY=<path> in its .env.');
    log('  3. Keep keys/ out of git.');
  });

program.parseAsync(process.argv).catch((error) => {
  if (error instanceof CliError) {
    process.stderr.write(`expo-ota-client: ${error.message}\n`);
    process.exit(1);
  }

  throw error;
});
