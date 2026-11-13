/** A request to OTACenter failed; `status` is the HTTP status (0 for a network error). */
export class OtaRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errors: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'OtaRequestError';
  }
}

/** Updates are not available in this build (development, Expo Go, or no server configured). */
export class OtaDisabledError extends Error {
  constructor(reason: string) {
    super(`OTA updates are disabled: ${reason}`);
    this.name = 'OtaDisabledError';
  }
}

export function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === 'string') return new Error(error);

  return new Error('Unknown expo-ota-client error');
}
