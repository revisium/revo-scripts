import { z } from 'zod';

import { createScriptSchema } from '../../runtime/definition/schema/create-script-schema.js';

const boundedIdentifier = z
  .string()
  .min(1)
  .max(256)
  .refine(
    (value) => !hasControlCharacter(value),
    'Identifiers must not contain control characters.',
  );

const hasControlCharacter = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) {
      return true;
    }
  }
  return false;
};
const scriptId = boundedIdentifier.regex(/^script:.+/);
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const positiveInteger = z.number().int().positive();
const jsonValue = z.json();
const payloadLimitBytes = 1_048_576;
const eventLimitBytes = 65_536;

const withinJsonByteLimit =
  (limitBytes: number) =>
  (value: unknown): boolean => {
    try {
      const serialized = JSON.stringify(value);
      return serialized !== undefined && Buffer.byteLength(serialized, 'utf8') <= limitBytes;
    } catch {
      return false;
    }
  };
const operation = z.enum([
  'filesystem.read',
  'filesystem.write',
  'git.read',
  'git.write',
  'git.remote-write',
  'github.read',
  'github.write',
]);
const errorCode = z
  .string()
  .regex(/^revo\.script\.(validation|permission|timeout|execution|provider|idempotency)\..+/);
const failureStage = z.enum([
  'acquire',
  'handler',
  'provider',
  'timeout',
  'cleanup',
  'event_sink',
  'invariant',
]);
const scriptPin = z.strictObject({ id: scriptId, version: positiveInteger });
const resourceDescriptor = z.strictObject({
  resourceId: boundedIdentifier,
  kind: z.literal('repository'),
  repositoryId: boundedIdentifier,
  providerCoordinates: z.record(z.string(), jsonValue),
  grant: z.strictObject({
    permissions: z.array(z.string()),
    operations: z.array(operation),
  }),
});
const credentialDescriptor = z.strictObject({
  alias: boundedIdentifier,
  provider: boundedIdentifier,
});
const providerDescriptor = z.strictObject({
  id: boundedIdentifier.regex(/^provider:.+/),
  contract: boundedIdentifier.regex(/^revo\.provider\..+\/v[1-9]\d*$/),
  implementationDigest: digest,
  provenance: z.strictObject({ packageName: z.string().min(1), packageVersion: z.string().min(1) }),
  operations: z.array(operation),
  workspace: z.enum(['none', 'required']),
});
const retryPolicy = z.strictObject({
  mode: z.enum(['never', 'transient']),
  maxAttempts: positiveInteger,
  backoffMs: z.array(z.number().int().nonnegative()),
});
const attemptPolicy = z.strictObject({
  timeoutMs: positiveInteger,
  terminationGraceMs: z.literal(1_000),
  retry: retryPolicy,
  idempotency: z.enum(['read-only', 'required', 'not-retryable']),
});

const scriptBindingInput = z.strictObject({
  script: scriptPin,
  resources: z.record(
    z.string().min(1),
    z.strictObject({ resourceRef: z.string().min(1), workspaceRef: z.string().min(1).optional() }),
  ),
  credentials: z.record(z.string().min(1), z.string().min(1)),
});

const preparedScriptBinding = z.strictObject({
  schemaVersion: z.literal('prepared-script-binding/v1'),
  script: scriptPin,
  definitionDigest: digest,
  implementation: z.strictObject({
    id: z.string().min(1),
    version: z.string().min(1),
    buildDigest: digest,
  }),
  providers: z.array(providerDescriptor),
  resources: z.record(
    z.string().min(1),
    z.strictObject({
      resourceRef: z.string().min(1),
      workspaceRef: z.string().min(1).optional(),
      descriptor: resourceDescriptor,
      requirement: z.strictObject({
        kind: z.literal('repository'),
        access: z.enum(['read', 'write', 'publish', 'admin']),
      }),
    }),
  ),
  credentials: z.record(z.string().min(1), credentialDescriptor),
  attemptPolicy,
});

const scriptAttemptInput = z.strictObject({
  executionId: boundedIdentifier,
  attemptId: boundedIdentifier,
  attemptOrdinal: positiveInteger,
  script: scriptPin,
  binding: preparedScriptBinding,
  input: jsonValue,
});
const scriptAttemptRef = z.strictObject({
  executionId: boundedIdentifier,
  attemptId: boundedIdentifier,
});
const evidence = z.strictObject({
  kind: z.enum(['artifact', 'log', 'external']),
  ref: z.string().min(1).max(2_048),
  summary: z.string().max(4_096).optional(),
});
const failureCause = z.union([
  z.strictObject({ kind: z.literal('fault'), code: errorCode, stage: failureStage }),
  z.strictObject({
    kind: z.literal('prior_outcome'),
    outcome: z.enum(['succeeded', 'failed', 'cancelled', 'timedOut']),
  }),
]);
const failure = z.strictObject({
  code: errorCode,
  message: z.string().max(4_096),
  retryable: z.boolean(),
  stage: failureStage,
  details: z.record(z.string(), jsonValue).nullable(),
  causes: z.array(failureCause),
});

const lifecycleDetails = z.strictObject({
  script: scriptPin,
  definitionDigest: digest,
  attemptOrdinal: positiveInteger,
  timestampMs: z.number().int().nonnegative(),
});
const startedEvent = z.strictObject({
  name: z.literal('revo.script.started'),
  details: lifecycleDetails,
});
const succeededEvent = z.strictObject({
  name: z.literal('revo.script.succeeded'),
  details: lifecycleDetails.extend({ evidenceCount: z.number().int().min(0).max(64) }),
});
const failedEvent = z.strictObject({
  name: z.literal('revo.script.failed'),
  details: lifecycleDetails.extend({
    code: errorCode,
    stage: failureStage,
    retryable: z.boolean(),
  }),
});
const cancelledEvent = z.strictObject({
  name: z.literal('revo.script.cancelled'),
  details: lifecycleDetails,
});
const timedOutEvent = z.strictObject({
  name: z.literal('revo.script.timed_out'),
  details: lifecycleDetails.extend({ code: errorCode }),
});
const terminalEmission = <
  TEvent extends
    | typeof succeededEvent
    | typeof failedEvent
    | typeof cancelledEvent
    | typeof timedOutEvent,
>(
  event: TEvent,
) => z.strictObject({ emissionOrdinal: positiveInteger, event });
const succeededTerminalEvent = terminalEmission(succeededEvent);
const failedTerminalEvent = terminalEmission(failedEvent);
const cancelledTerminalEvent = terminalEmission(cancelledEvent);
const timedOutTerminalEvent = terminalEmission(timedOutEvent);

const terminalAttemptResult = z.union([
  z
    .strictObject({
      kind: z.literal('succeeded'),
      value: jsonValue,
      evidence: z.array(evidence).max(64),
      terminalEvent: succeededTerminalEvent,
    })
    .superRefine((value, context) => {
      if (value.terminalEvent.event.details.evidenceCount !== value.evidence.length) {
        context.addIssue({
          code: 'custom',
          message: 'Succeeded terminal event must match evidence.',
        });
      }
    }),
  z
    .strictObject({
      kind: z.literal('failed'),
      error: failure,
      evidence: z.array(evidence).max(64),
      terminalEvent: failedTerminalEvent,
    })
    .superRefine((value, context) => {
      const details = value.terminalEvent.event.details;
      if (
        details.code !== value.error.code ||
        details.stage !== value.error.stage ||
        details.retryable !== value.error.retryable
      ) {
        context.addIssue({ code: 'custom', message: 'Failed terminal event must match failure.' });
      }
    }),
  z.strictObject({
    kind: z.literal('cancelled'),
    evidence: z.array(evidence).max(64),
    terminalEvent: cancelledTerminalEvent,
  }),
  z
    .strictObject({
      kind: z.literal('timedOut'),
      error: failure,
      evidence: z.array(evidence).max(64),
      terminalEvent: timedOutTerminalEvent,
    })
    .superRefine((value, context) => {
      if (value.terminalEvent.event.details.code !== value.error.code) {
        context.addIssue({
          code: 'custom',
          message: 'Timed-out terminal event must match failure.',
        });
      }
    }),
]);
const uncertainAttemptResult = z.strictObject({
  kind: z.literal('uncertain'),
  trigger: z.enum(['timeout', 'cancellation']),
  stage: z.enum(['acquire', 'handler', 'validation', 'cleanup', 'event_sink']),
  evidence: z.array(evidence).max(64),
});
const attemptResult = z
  .union([terminalAttemptResult, uncertainAttemptResult])
  .refine(withinJsonByteLimit(payloadLimitBytes), {
    message: `Script attempt result exceeds the ${payloadLimitBytes}-byte JSON payload limit.`,
  });
const cancellation = z.union([
  z.strictObject({ kind: z.literal('acknowledged') }),
  z.strictObject({ kind: z.literal('alreadyTerminal'), result: terminalAttemptResult }),
  z.strictObject({ kind: z.literal('uncertain'), result: uncertainAttemptResult }),
  z.strictObject({ kind: z.literal('notFound') }),
  z.strictObject({ kind: z.literal('unknown') }),
]);
const reconciliation = z.union([
  z.strictObject({ kind: z.literal('terminal'), result: terminalAttemptResult }),
  z.strictObject({ kind: z.literal('uncertain'), result: uncertainAttemptResult }),
  z.strictObject({ kind: z.literal('notFound') }),
  z.strictObject({ kind: z.literal('unknown') }),
]);
const customEvent = z.strictObject({
  name: z
    .string()
    .min(1)
    .refine((name) => !name.startsWith('revo.script.')),
  details: z.record(z.string(), jsonValue).optional(),
});
const scriptEvent = z
  .union([startedEvent, succeededEvent, failedEvent, cancelledEvent, timedOutEvent, customEvent])
  .refine(withinJsonByteLimit(eventLimitBytes), {
    message: `Script event exceeds the ${eventLimitBytes}-byte JSON payload limit.`,
  });

export const ScriptBindingInputSchema = createScriptSchema({
  id: 'revo.script.binding-input/v1',
  schema: scriptBindingInput,
  jsonSchema: 'input',
});
export const PreparedScriptBindingSchema = createScriptSchema({
  id: 'revo.script.prepared-binding/v1',
  schema: preparedScriptBinding,
  jsonSchema: 'output',
});
export const ScriptAttemptInputSchema = createScriptSchema({
  id: 'revo.script.attempt-input/v1',
  schema: scriptAttemptInput,
  jsonSchema: 'input',
});
export const ScriptAttemptRefSchema = createScriptSchema({
  id: 'revo.script.attempt-ref/v1',
  schema: scriptAttemptRef,
  jsonSchema: 'input',
});
export const ScriptEvidenceSchema = createScriptSchema({
  id: 'revo.script.evidence/v1',
  schema: evidence,
  jsonSchema: 'output',
});
export const ScriptFailureSchema = createScriptSchema({
  id: 'revo.script.failure/v1',
  schema: failure,
  jsonSchema: 'output',
});
export const ScriptAttemptResultSchema = createScriptSchema({
  id: 'revo.script.attempt-result/v1',
  schema: attemptResult,
  jsonSchema: 'output',
});
export const AttemptCancellationResultSchema = createScriptSchema({
  id: 'revo.script.attempt-cancellation/v1',
  schema: cancellation,
  jsonSchema: 'output',
});
export const ScriptReconciliationResultSchema = createScriptSchema({
  id: 'revo.script.reconciliation/v1',
  schema: reconciliation,
  jsonSchema: 'output',
});
export const ScriptEventSchema = createScriptSchema({
  id: 'revo.script.event/v1',
  schema: scriptEvent,
  jsonSchema: 'output',
});
