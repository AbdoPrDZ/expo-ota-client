import { apiBase } from './config';
import { deviceInfoHeader, getDeviceInfo } from './device';
import { OtaRequestError } from './errors';
import type { OtaClientConfig } from './types';

interface Envelope<T> {
  success?: boolean;
  message?: string;
  data?: T;
  errors?: { errors?: Record<string, string> } & Record<string, unknown>;
}

const TIMEOUT_MS = 15000;

/**
 * POSTs JSON to the OTACenter device API with the `API-KEY` and `X-Device-Info`
 * headers, and unwraps the `{ success, message, data }` envelope.
 */
export async function post<T>(config: OtaClientConfig, path: string, body: Record<string, unknown>): Promise<T> {
  const device = await getDeviceInfo();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${apiBase(config)}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'API-KEY': config.apiKey,
        'X-Device-Info': deviceInfoHeader(device),
      },
      body: JSON.stringify({ package: config.package, ...body }),
      signal: controller.signal,
    });
  } catch (error) {
    throw new OtaRequestError(error instanceof Error ? error.message : 'Network request failed', 0);
  } finally {
    clearTimeout(timer);
  }

  let envelope: Envelope<T> = {};
  try {
    envelope = (await response.json()) as Envelope<T>;
  } catch {
    // Non-JSON error page: keep the HTTP status.
  }

  if (!response.ok || envelope.success === false) {
    throw new OtaRequestError(
      envelope.message || `Request failed with status ${response.status}`,
      response.status,
      envelope.errors?.errors ?? {},
    );
  }

  return envelope.data as T;
}

/** `GET /health`; resolves `false` instead of throwing. */
export async function health(config: OtaClientConfig): Promise<boolean> {
  try {
    const response = await fetch(`${apiBase(config)}/health`, { headers: { Accept: 'application/json' } });
    return response.ok;
  } catch {
    return false;
  }
}
