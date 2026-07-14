import { ScriptFault } from '../../spec/errors/index.js';
import type { EventSink, ScriptCustomEvent } from '../../spec/events/index.js';
import type { ScriptManifestV1 } from '../../spec/manifest/index.js';
import { assertEventWithinLimit } from '../payload/assert-event-limit.js';
import { redactValue } from '../redaction/redact.js';
import { emitScriptEvent } from './emit-script-event.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const escapePointerSegment = (segment: string): string =>
  segment.replaceAll('~', '~0').replaceAll('/', '~1');

const collectLeafPaths = (value: unknown, path = ''): readonly string[] => {
  if (Array.isArray(value)) {
    return value.length === 0
      ? [path]
      : value.flatMap((item, index) => collectLeafPaths(item, `${path}/${index}`));
  }

  if (isRecord(value)) {
    const entries = Object.entries(value);
    return entries.length === 0
      ? [path]
      : entries.flatMap(([key, item]) =>
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
  return isRecord(redacted) ? redacted : { value: redacted };
};

export const emitCustomEvent = async (
  manifest: ScriptManifestV1,
  sink: EventSink,
  event: ScriptCustomEvent,
): Promise<void> => {
  assertEventWithinLimit(event);
  validateCustomEvent(manifest, event);
  const details = redactDetails(event.details, manifest.redaction.eventPaths);
  const projectedEvent =
    details === undefined ? { name: event.name } : { name: event.name, details };

  await emitScriptEvent(sink, projectedEvent);
};
