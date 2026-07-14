import { ScriptFault } from '../spec/script-errors.js';
import type { EventSink, ScriptCustomEvent, ScriptEvent } from '../spec/script-events.js';
import type { ScriptManifestV1 } from '../spec/script-manifest.js';
import { assertEventWithinLimit } from './payload-limits.js';
import { redactValue } from './redact.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const escapePointerSegment = (segment: string): string =>
  segment.replaceAll('~', '~0').replaceAll('/', '~1');

const collectLeafPaths = (value: unknown, path = ''): readonly string[] => {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [path];
    }

    return value.flatMap((item, index) => collectLeafPaths(item, `${path}/${index}`));
  }

  if (isRecord(value)) {
    const entries = Object.entries(value);

    if (entries.length === 0) {
      return [path];
    }

    return entries.flatMap(([key, item]) =>
      collectLeafPaths(item, `${path}/${escapePointerSegment(key)}`),
    );
  }

  return [path];
};

const validateCustomEvent = (manifest: ScriptManifestV1, event: ScriptCustomEvent): void => {
  if (!manifest.events.allowed.includes(event.name) || event.name.startsWith('revo.script.')) {
    throw new ScriptFault(
      'revo.script.permission.event',
      `Custom event ${event.name} is not declared by the script manifest.`,
    );
  }

  const undeclaredPath = collectLeafPaths(event.details ?? {}).find(
    (path) => !manifest.events.detailPaths.includes(path),
  );

  if (undeclaredPath !== undefined) {
    throw new ScriptFault(
      'revo.script.permission.event',
      `Custom event detail path ${undeclaredPath} is not declared by the script manifest.`,
    );
  }
};

const redactDetails = (
  details: Readonly<Record<string, unknown>> | undefined,
  pointers: readonly string[],
): Readonly<Record<string, unknown>> | undefined => {
  if (details === undefined) {
    return undefined;
  }

  const redacted = redactValue(details, pointers);

  if (!isRecord(redacted)) {
    return { value: redacted };
  }

  return redacted;
};

export const emitCustomEvent = async (
  manifest: ScriptManifestV1,
  sink: EventSink,
  event: ScriptCustomEvent,
): Promise<void> => {
  validateCustomEvent(manifest, event);
  const details = redactDetails(event.details, manifest.redaction.eventPaths);
  const projectedEvent =
    details === undefined ? { name: event.name } : { name: event.name, details };

  await emitScriptEvent(sink, projectedEvent);
};

export const emitScriptEvent = async (sink: EventSink, event: ScriptEvent): Promise<void> => {
  assertEventWithinLimit(event);

  try {
    await sink.emit(event);
  } catch (cause: unknown) {
    throw new ScriptFault(
      'revo.script.execution.event_sink',
      'Event sink rejected a script event.',
      { cause },
    );
  }
};
