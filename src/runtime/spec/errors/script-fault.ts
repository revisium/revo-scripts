import type { ScriptErrorCode } from './script-error-code.js';

export class ScriptFault extends Error {
  readonly code: ScriptErrorCode;
  readonly retryable: boolean;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: ScriptErrorCode,
    message: string,
    options?: Readonly<{
      retryable?: boolean;
      details?: Readonly<Record<string, unknown>>;
      // Accepted only for internal call-site compatibility. Causes are never
      // attached to the public error object: they can contain secrets/paths.
      cause?: unknown;
    }>,
  ) {
    super(boundMessage(message));
    this.name = 'ScriptFault';
    this.code = code;
    this.retryable = options?.retryable ?? false;
    if (options?.details !== undefined) {
      const details = safeDetails(options.details);
      if (details !== undefined) {
        this.details = details;
      }
    }
  }
}

const boundMessage = (message: string): string => message.slice(0, 4_096);

const safeDetails = (
  details: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> | undefined => {
  try {
    const serialized = JSON.stringify(details);
    if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > 65_536) {
      return undefined;
    }
    const parsed: unknown = JSON.parse(serialized);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
