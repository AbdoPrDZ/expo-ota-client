import Constants from 'expo-constants';

import type { OtaClientConfig } from './types';

let override: Partial<OtaClientConfig> = {};

function fromAppConfig(): Partial<OtaClientConfig> {
  const extra = (Constants.expoConfig?.extra ?? {}) as { otaClient?: Partial<OtaClientConfig> };

  return extra.otaClient ?? {};
}

/**
 * The server coordinates: the config plugin's values (`extra.otaClient`),
 * overridden by `configure()`. `null` when no server is configured.
 *
 * Note that expo-updates itself keeps the URL and API key it was built with;
 * an override only changes the requests this package makes (`/app/info`,
 * events, device linking).
 */
export function getConfig(): OtaClientConfig | null {
  const config = { ...fromAppConfig(), ...override };

  if (!config.serverUrl || !config.apiKey || !config.package) return null;

  return {
    ...config,
    serverUrl: config.serverUrl.replace(/\/+$/, ''),
  } as OtaClientConfig;
}

export function configure(values: Partial<OtaClientConfig>): OtaClientConfig | null {
  override = { ...override, ...values };

  return getConfig();
}

/** Base URL of the device API. */
export function apiBase(config: OtaClientConfig): string {
  return `${config.serverUrl}/ota-client/v1`;
}
