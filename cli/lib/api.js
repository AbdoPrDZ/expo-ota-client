'use strict';

const fs = require('fs');
const path = require('path');

const { CliError } = require('./project');

/** Minimal client for OTACenter's admin API (`/api`), authenticated with a Sanctum token. */
class AdminApi {
  constructor(serverUrl, token) {
    if (!token) throw new CliError('An OTACenter token is required: pass --token or set OTA_TOKEN (see `expo-ota-client login`).');

    this.base = `${serverUrl.replace(/\/+$/, '')}/api`;
    this.token = token;
  }

  async request(method, url, body) {
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    let response;

    try {
      response = await fetch(`${this.base}${url}`, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.token}`,
          ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
      });
    } catch (error) {
      throw new CliError(`Cannot reach ${this.base}: ${error.message}`);
    }

    let data = {};
    try {
      data = await response.json();
    } catch {
      // keep empty
    }

    if (!response.ok || data.success === false) {
      const details = data.errors && data.errors.errors ? ` (${Object.values(data.errors.errors).join('; ')})` : '';
      throw new CliError(`${method} ${url} failed: ${data.message || response.status}${details}`);
    }

    return data;
  }

  async findApp(pkg) {
    const data = await this.request('GET', `/app?page=1&pageSize=50&search=${encodeURIComponent(pkg)}`);
    const app = (data.items || []).find((item) => item.package_name === pkg);

    if (!app) throw new CliError(`No app with package "${pkg}" in OTACenter.`);
    return app;
  }

  async findVersion(appId, name) {
    const data = await this.request('GET', `/app/${appId}/version?page=1&pageSize=500`);
    const version = (data.items || []).find((item) => item.name === name);

    if (!version) throw new CliError(`No version "${name}" for this app. Create it in OTACenter (client: Expo) first.`);
    if (version.client_type && version.client_type !== 'expo')
      throw new CliError(`Version "${name}" is an ota-client version. Set its client to Expo in OTACenter.`);

    return version;
  }

  async findBundle(appId, versionId, name) {
    const data = await this.request('GET', `/app/${appId}/version/${versionId}/bundle?page=1&pageSize=500`);
    const bundle = (data.items || []).find((item) => item.name === name);

    if (!bundle) throw new CliError(`No bundle "${name}" in this version.`);
    return bundle;
  }

  async uploadBundle(appId, versionId, { file, name, changelog, updateType, runtime }) {
    const form = new FormData();
    form.append('name', name);
    if (changelog) form.append('changelog', changelog);
    form.append('update_type', updateType || 'optional');
    if (runtime) form.append('runtime_version', runtime);
    form.append('file', new Blob([fs.readFileSync(file)], { type: 'application/zip' }), path.basename(file));

    const data = await this.request('POST', `/app/${appId}/version/${versionId}/bundle`, form);
    return data.item;
  }

  bundleAction(appId, versionId, bundleId, action) {
    return this.request('POST', `/app/${appId}/version/${versionId}/bundle/${bundleId}/${action}`);
  }

  static async login(serverUrl, login, password) {
    const response = await fetch(`${serverUrl.replace(/\/+$/, '')}/api/auth/login`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.token) throw new CliError(`Login failed: ${data.message || response.status}`);
    return data.token;
  }
}

module.exports = { AdminApi };
