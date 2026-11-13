import { Platform } from 'react-native';
import * as Updates from 'expo-updates';

import type { OtaDeviceInfo } from './types';

/**
 * Extra-param keys. expo-updates persists extra params and sends them with
 * every update request in the `Expo-Extra-Params` header, which is how
 * OTACenter recognises the device on manifest requests.
 */
export const PARAM = {
  did: 'did',
  manufacturer: 'mf',
  brand: 'br',
  model: 'mdl',
  osVersion: 'av',
  apiLevel: 'sdv',
  /** Last update id whose launch was confirmed to the server. */
  lastConfirmed: 'lc',
  /** Last emergency launch reported to the server. */
  lastRollback: 'lr',
} as const;

interface ExpoDeviceModule {
  manufacturer: string | null;
  brand: string | null;
  modelName: string | null;
  osVersion: string | null;
  platformApiLevel: number | null;
}

/** `expo-device` is optional; without it only the id is reported. */
function expoDevice(): ExpoDeviceModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-device') as ExpoDeviceModule;
  } catch {
    return null;
  }
}

function randomId(): string {
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));

  return `exp-${bytes.map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

let cached: Promise<OtaDeviceInfo> | null = null;

/**
 * The device fingerprint. The id is generated once and kept in expo-updates'
 * extra params, so it survives restarts and updates (not reinstalls).
 */
export function getDeviceInfo(): Promise<OtaDeviceInfo> {
  if (!cached) {
    cached = (async () => {
      const params = Updates.isEnabled ? await Updates.getExtraParamsAsync() : {};
      const device = expoDevice();

      const info: OtaDeviceInfo = {
        did: params[PARAM.did] || randomId(),
        manufacturer: device?.manufacturer ?? null,
        brand: device?.brand ?? null,
        model: device?.modelName ?? null,
        osVersion: device?.osVersion ?? (Platform.Version != null ? String(Platform.Version) : null),
        apiLevel: device?.platformApiLevel != null ? String(device.platformApiLevel) : null,
      };

      if (Updates.isEnabled) await registerExtraParams(info, params);

      return info;
    })().catch((error) => {
      cached = null;
      throw error;
    });
  }

  return cached;
}

async function registerExtraParams(info: OtaDeviceInfo, current: Record<string, string>): Promise<void> {
  const wanted: Record<string, string | null> = {
    [PARAM.did]: info.did,
    [PARAM.manufacturer]: info.manufacturer,
    [PARAM.brand]: info.brand,
    [PARAM.model]: info.model,
    [PARAM.osVersion]: info.osVersion,
    [PARAM.apiLevel]: info.apiLevel,
  };

  for (const [key, value] of Object.entries(wanted)) {
    if (value && current[key] !== value) await Updates.setExtraParamAsync(key, value);
  }
}

/** `did=…;mf=…;…` for the JSON endpoints (`/app/info`, events, device linking). */
export function deviceInfoHeader(info: OtaDeviceInfo): string {
  const clean = (value: string | null) => (value ?? '').replace(/[;=]/g, ' ').trim();

  return [
    `did=${clean(info.did)}`,
    `mf=${clean(info.manufacturer)}`,
    `br=${clean(info.brand)}`,
    `mdl=${clean(info.model)}`,
    `av=${clean(info.osVersion)}`,
    `sdv=${clean(info.apiLevel)}`,
  ].join(';');
}

export async function getParam(key: string): Promise<string | null> {
  if (!Updates.isEnabled) return null;

  return (await Updates.getExtraParamsAsync())[key] ?? null;
}

export async function setParam(key: string, value: string): Promise<void> {
  if (Updates.isEnabled) await Updates.setExtraParamAsync(key, value);
}
