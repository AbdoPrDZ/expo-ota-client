'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { CliError, otaOptions, resolveRuntime } = require('./project');
const { platformsFor } = require('./release');
const { zipDirectory } = require('./zip');

test('resolves a fixed runtime, the appVersion policy, or an override', () => {
  assert.equal(resolveRuntime({ runtimeVersion: '2.0.0' }), '2.0.0');
  assert.equal(resolveRuntime({ version: '1.4.0', runtimeVersion: { policy: 'appVersion' } }), '1.4.0');
  assert.equal(resolveRuntime({ runtimeVersion: { policy: 'fingerprint' } }, '9.9.9'), '9.9.9');
  assert.throws(() => resolveRuntime({ runtimeVersion: { policy: 'fingerprint' } }), CliError);
});

test('reads the plugin options or explains they are missing', () => {
  assert.deepEqual(otaOptions({ extra: { otaClient: { serverUrl: 'https://x', package: 'a.b' } } }), {
    serverUrl: 'https://x',
    package: 'a.b',
  });
  assert.throws(() => otaOptions({ extra: {} }), /config plugin is not configured/);
});

test('maps --platform to export platforms', () => {
  assert.deepEqual(platformsFor('all'), ['android', 'ios']);
  assert.deepEqual(platformsFor('ios'), ['ios']);
  assert.throws(() => platformsFor('web'), CliError);
});

test('zips a directory under dist/ with forward slashes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-src-'));
  fs.mkdirSync(path.join(dir, '_expo', 'static'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'metadata.json'), '{}');
  fs.writeFileSync(path.join(dir, '_expo', 'static', 'index.hbc'), 'js');

  const out = path.join(os.tmpdir(), `zip-out-${Date.now()}.zip`);
  const count = await zipDirectory(dir, out);

  assert.equal(count, 2);
  const bytes = fs.readFileSync(out).toString('latin1');
  assert.ok(bytes.includes('dist/metadata.json'));
  assert.ok(bytes.includes('dist/_expo/static/index.hbc'));
  assert.ok(!bytes.includes('\\'));

  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(out, { force: true });
});
