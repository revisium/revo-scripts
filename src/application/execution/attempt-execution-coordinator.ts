import { systemClock } from '../../runtime/execution/clock/system-clock.js';
import { createScriptDeadline } from '../../runtime/execution/deadline/create-script-deadline.js';
import { toUnexpectedExecutionFault } from '../../runtime/execution/failures/to-unexpected-execution-fault.js';
import { assertJsonPayloadWithinLimit } from '../../runtime/execution/payload/assert-json-payload-limit.js';
import { redactValue } from '../../runtime/execution/redaction/redact.js';
import { validateHandlerResult } from '../../runtime/execution/results/validate-handler-result.js';
import type { RegisteredScript } from '../../runtime/registry/contracts/registered-script.js';
import type { ScriptRegistry } from '../../runtime/registry/contracts/script-registry.js';
import { getRegisteredDefinition } from '../../runtime/registry/get-registered-definition.js';
import { ScriptFault } from '../../runtime/spec/errors/index.js';
import type { JsonObject, JsonValue } from '../../runtime/spec/json/json-value.js';
import type { ScriptResourceMap } from '../../runtime/spec/resources/index.js';
import type {
  ScriptEvidence,
  ScriptFailure,
  ScriptFailureStage,
} from '../../runtime/spec/result/index.js';
import type { ResolvedRevoScriptsOptions } from '../contracts/revo-scripts-options.js';
import {
  PreparedScriptBindingSchema,
  ScriptAttemptInputSchema,
} from '../contracts/script-attempt-schemas.js';
import type {
  ScriptAttemptExecutionContext,
  ScriptAttemptInput,
  ScriptAttemptResult,
  ScriptAttemptUncertainResult,
  ScriptTerminalAttemptResult,
} from '../contracts/script-attempt.js';
import type { ProviderCatalog } from '../providers/provider-catalog.js';
import { AttemptEventLane } from './attempt-event-lane.js';
import { AttemptResourcePreparer } from './attempt-resource-preparer.js';
import { AttemptState } from './attempt-state.js';
import { PartialAcquireFailure } from './partial-acquire-failure.js';

type UnsealedTerminalAttemptResult =
  | Readonly<{ kind: 'succeeded'; value: JsonValue; evidence: readonly ScriptEvidence[] }>
  | Readonly<{ kind: 'failed'; error: ScriptFailure; evidence: readonly ScriptEvidence[] }>
  | Readonly<{ kind: 'cancelled'; evidence: readonly ScriptEvidence[] }>
  | Readonly<{ kind: 'timedOut'; error: ScriptFailure; evidence: readonly ScriptEvidence[] }>;

export class AttemptExecutionCoordinator {
  private readonly options: ResolvedRevoScriptsOptions;
  private readonly registry: ScriptRegistry;
  private readonly catalog: ProviderCatalog;
  private readonly resources: AttemptResourcePreparer;
  private readonly state: AttemptState;

  constructor(
    options: ResolvedRevoScriptsOptions,
    registry: ScriptRegistry,
    catalog: ProviderCatalog,
    state: AttemptState,
  ) {
    this.options = options;
    this.registry = registry;
    this.catalog = catalog;
    this.resources = new AttemptResourcePreparer(options, catalog);
    this.state = state;
  }

  async execute(
    input: ScriptAttemptInput,
    context: ScriptAttemptExecutionContext,
  ): Promise<ScriptAttemptResult> {
    const normalized = await this.normalizeInput(input, context);
    const registered = this.registry.resolve(normalized.script.id, normalized.script.version);
    await this.validateBinding(registered, normalized);
    const script = getRegisteredDefinition(this.registry, registered);
    const controller = new AbortController();
    const ref = { executionId: normalized.executionId, attemptId: normalized.attemptId };
    // Claim identity before allocating deadline/listener state. Rejections here
    // have no lifecycle resources to clean up.
    this.state.begin(ref, controller);
    const forwardAbort = () => controller.abort(context.signal.reason);
    if (context.signal.aborted) {
      forwardAbort();
    } else {
      context.signal.addEventListener('abort', forwardAbort, { once: true });
    }
    const clock = this.options.host.clock ?? systemClock;
    const deadline = createScriptDeadline(
      normalized.binding.attemptPolicy.timeoutMs,
      clock,
      controller.signal,
    );
    const lane = new AttemptEventLane(
      script,
      normalized.executionId,
      normalized.attemptOrdinal,
      context.events,
      () => clock.now(),
    );
    const progress: { phase: UncertainStage } = { phase: 'acquire' };
    const terminal = this.runAccepted(registered, normalized, controller, deadline, lane, progress);
    const initial = await settleOrTrigger(terminal, deadline.signal);
    if (initial.kind === 'settled') {
      return this.finishAccepted(ref, initial.result, deadline, context, forwardAbort);
    }

    const afterGrace = await settleWithin(
      terminal,
      normalized.binding.attemptPolicy.terminationGraceMs,
    );
    if (afterGrace !== undefined) {
      return this.finishAccepted(ref, afterGrace, deadline, context, forwardAbort);
    }

    lane.closeForUncertainty();
    const uncertain: ScriptAttemptUncertainResult = {
      kind: 'uncertain',
      trigger: triggerFor(deadline.signal.reason),
      stage: progress.phase,
      evidence: [],
    };
    this.state.markUncertain(ref, uncertain);
    void terminal.then((result) => {
      this.finishAccepted(ref, result, deadline, context, forwardAbort);
    });
    return uncertain;
  }

  private async runAccepted(
    registered: RegisteredScript<unknown, unknown, ScriptResourceMap>,
    input: ScriptAttemptInput,
    controller: AbortController,
    deadline: ReturnType<typeof createScriptDeadline>,
    lane: AttemptEventLane<unknown, unknown, ScriptResourceMap>,
    progress: { phase: UncertainStage },
  ): Promise<ScriptTerminalAttemptResult> {
    const script = getRegisteredDefinition(this.registry, registered);
    let acquired: Awaited<ReturnType<AttemptResourcePreparer['acquire']>> | undefined;
    let primary: UnsealedTerminalAttemptResult;
    let phase: ScriptFailureStage = 'acquire';
    try {
      progress.phase = 'validation';
      await this.validateRestoredCoordinates(script, input);
      throwIfDeadlineElapsed(deadline);
      const validatedInput = await script.inputSchema.validate(input.input);
      if (!validatedInput.ok) {
        throw new ScriptFault('revo.script.validation.input', 'Script input is invalid.', {
          details: { issues: validatedInput.issues },
        });
      }
      throwIfDeadlineElapsed(deadline);
      progress.phase = 'acquire';
      acquired = await this.resources.acquire(script.manifest, input.binding, deadline.signal);
      throwIfDeadlineElapsed(deadline);
      progress.phase = 'event_sink';
      await lane.started();
      throwIfDeadlineElapsed(deadline);
      phase = 'handler';
      progress.phase = 'handler';
      const handlerResult = await script.handler.execute(structuredClone(validatedInput.value), {
        executionId: input.executionId,
        attemptOrdinal: input.attemptOrdinal,
        resources: acquired.resources,
        signal: deadline.signal,
        // Return the lane's exact non-async boundary promise. It carries an
        // observer for fire-and-forget callers while preserving rejection for
        // a handler that explicitly awaits it.
        emit: (event) => lane.custom(event),
      });
      progress.phase = 'event_sink';
      await lane.drain();
      progress.phase = 'validation';
      const validatedResult = await validateHandlerResult(script, handlerResult);
      const latched = lane.failure();
      const deadlineFault = faultFromSignal(deadline.signal);
      if (deadlineFault !== undefined) {
        primary = outcomeForFault(deadlineFault, controller.signal.aborted, phase);
      } else if (latched !== undefined) {
        primary = failed(latched, 'handler');
      } else if (!isJsonValue(validatedResult.value)) {
        primary = failed(
          new ScriptFault('revo.script.validation.result', 'Script result is not JSON-compatible.'),
          'handler',
        );
      } else {
        primary = {
          kind: 'succeeded',
          value: validatedResult.value,
          evidence: validatedResult.evidence,
        };
      }
    } catch (error: unknown) {
      if (error instanceof PartialAcquireFailure) {
        const priorFault = toUnexpectedExecutionFault(
          error.primary,
          'Script resource acquisition failed unexpectedly.',
        );
        primary = failed(
          error.cleanup,
          'cleanup',
          failed(priorFault, stageFor(priorFault, 'acquire')),
        );
      } else {
        const fault = toUnexpectedExecutionFault(error, 'Script execution failed unexpectedly.');
        primary = outcomeForFault(fault, controller.signal.aborted, phase);
      }
    }

    // A handler may intentionally not await context.emit(). Its lane is still
    // part of this attempt and must settle before cleanup/outcome selection.
    try {
      progress.phase = 'event_sink';
      await lane.drain();
    } catch (error: unknown) {
      const fault = toUnexpectedExecutionFault(error, 'Script event delivery failed.');
      primary = failed(fault, stageFor(fault, 'handler'), primary);
    }

    progress.phase = 'cleanup';
    const cleanupFailure = await this.dispose(acquired);
    const trigger = faultFromSignal(deadline.signal);
    const settledPrimary =
      trigger === undefined ? primary : outcomeForFault(trigger, controller.signal.aborted, phase);
    const outcome =
      cleanupFailure === undefined
        ? settledPrimary
        : failed(cleanupFailure, 'cleanup', settledPrimary);
    progress.phase = 'event_sink';
    return sealTerminalResult(
      lane,
      redactFailureDetails(outcome, script.manifest.redaction.errorPaths),
    );
  }

  private finishAccepted(
    ref: { readonly executionId: string; readonly attemptId: string },
    result: ScriptTerminalAttemptResult,
    deadline: ReturnType<typeof createScriptDeadline>,
    context: ScriptAttemptExecutionContext,
    forwardAbort: () => void,
  ): ScriptTerminalAttemptResult {
    this.state.finish(ref, result);
    deadline.dispose();
    context.signal.removeEventListener('abort', forwardAbort);
    return result;
  }

  private async normalizeInput(
    input: ScriptAttemptInput,
    context: ScriptAttemptExecutionContext,
  ): Promise<ScriptAttemptInput> {
    let validated;
    try {
      assertJsonPayloadWithinLimit(input, 'input');
      validated = await ScriptAttemptInputSchema.validate(input);
    } catch (error: unknown) {
      throw toUnexpectedExecutionFault(error, 'Script attempt input could not be validated.');
    }
    if (!validated.ok) {
      throw new ScriptFault('revo.script.validation.attempt', 'Script attempt input is invalid.');
    }
    if (
      context === null ||
      typeof context !== 'object' ||
      !isAbortSignal(context.signal) ||
      context.events === null ||
      typeof context.events !== 'object' ||
      typeof context.events.emit !== 'function'
    ) {
      throw new ScriptFault('revo.script.validation.attempt', 'Script attempt context is invalid.');
    }
    const normalized = structuredClone(validated.value);
    if (!isScriptAttemptInput(normalized)) {
      throw new ScriptFault('revo.script.validation.attempt', 'Script attempt input is invalid.');
    }
    return normalized;
  }

  private async validateBinding(
    script: RegisteredScript<unknown, unknown, ScriptResourceMap>,
    input: ScriptAttemptInput,
  ): Promise<void> {
    const restored = await PreparedScriptBindingSchema.validate(input.binding);
    if (!restored.ok) {
      throw new ScriptFault(
        'revo.script.validation.binding',
        'Prepared script binding is invalid.',
      );
    }
    this.requireExactDefinitionBinding(script, input);
    this.requireExactImplementationBinding(script, input);
    this.requireExactProviderBindings(script, input);
    this.requireExactResourceBindings(script, input);
    this.requireExactCredentialBindings(script, input);
  }

  private requireExactDefinitionBinding(
    script: RegisteredScript<unknown, unknown, ScriptResourceMap>,
    input: ScriptAttemptInput,
  ): void {
    if (
      input.binding.schemaVersion !== 'prepared-script-binding/v1' ||
      input.binding.script.id !== input.script.id ||
      input.binding.script.version !== input.script.version ||
      input.binding.definitionDigest !== script.definitionDigest
    ) {
      throw new ScriptFault(
        'revo.script.validation.binding',
        'Prepared script binding does not match the exact script definition.',
      );
    }
  }

  private requireExactImplementationBinding(
    script: RegisteredScript<unknown, unknown, ScriptResourceMap>,
    input: ScriptAttemptInput,
  ): void {
    if (
      input.binding.implementation.id !== script.implementation.id ||
      input.binding.implementation.version !== script.implementation.version ||
      input.binding.implementation.buildDigest !== script.implementation.buildDigest ||
      input.binding.attemptPolicy.timeoutMs !== script.manifest.timeout.wallClockMs ||
      input.binding.attemptPolicy.terminationGraceMs !== terminationGraceMs ||
      input.binding.attemptPolicy.idempotency !== script.manifest.idempotency ||
      input.binding.attemptPolicy.retry.mode !== script.manifest.retry.mode ||
      input.binding.attemptPolicy.retry.maxAttempts !== script.manifest.retry.maxAttempts ||
      input.binding.attemptPolicy.retry.backoffMs.join(',') !==
        script.manifest.retry.backoffMs.join(',')
    ) {
      throw new ScriptFault(
        'revo.script.validation.binding',
        'Prepared script binding does not match the exact script definition.',
      );
    }
  }

  private requireExactProviderBindings(
    script: RegisteredScript<unknown, unknown, ScriptResourceMap>,
    input: ScriptAttemptInput,
  ): void {
    const expectedProviders = script.manifest.providers.map((requirement) =>
      this.catalog.describe(requirement),
    );
    if (
      input.binding.providers.length !== expectedProviders.length ||
      input.binding.providers.some((provider, index) => {
        const expected = expectedProviders[index];
        return expected === undefined || !sameProviderDescriptor(provider, expected);
      })
    ) {
      throw new ScriptFault(
        'revo.script.validation.binding',
        'Prepared script binding does not match the selected providers.',
      );
    }
  }

  private requireExactResourceBindings(
    script: RegisteredScript<unknown, unknown, ScriptResourceMap>,
    input: ScriptAttemptInput,
  ): void {
    const resourceNames = script.manifest.resources.map((resource) => resource.name);
    if (!hasExactNames(input.binding.resources, resourceNames)) {
      throw new ScriptFault(
        'revo.script.validation.binding',
        'Prepared script binding does not cover the exact manifest resources.',
      );
    }
    for (const requirement of script.manifest.resources) {
      const resource = input.binding.resources[requirement.name];
      if (
        resource?.descriptor.kind !== requirement.kind ||
        resource?.requirement.kind !== requirement.kind ||
        resource?.requirement.access !== requirement.access
      ) {
        throw new ScriptFault(
          'revo.script.validation.binding',
          'Prepared script binding does not match the exact resource requirement.',
        );
      }
      const workspaceRequired = script.manifest.providers.some(
        (provider) =>
          provider.resource === requirement.name &&
          this.catalog.describe(provider).workspace === 'required',
      );
      if (workspaceRequired && resource.workspaceRef === undefined) {
        throw new ScriptFault(
          'revo.script.provider.workspace_required',
          'Prepared workspace binding is required by the provider.',
        );
      }
      const missingPermission = script.manifest.permissions.find(
        (permission) => !resource.descriptor.grant.permissions.includes(permission),
      );
      const missingOperation = script.manifest.operations.find(
        (operation) => !resource.descriptor.grant.operations.includes(operation),
      );
      if (missingPermission !== undefined || missingOperation !== undefined) {
        throw new ScriptFault(
          'revo.script.permission.grant',
          'Prepared resource binding no longer carries the required grant.',
        );
      }
    }
  }

  private requireExactCredentialBindings(
    script: RegisteredScript<unknown, unknown, ScriptResourceMap>,
    input: ScriptAttemptInput,
  ): void {
    const credentialNames = script.manifest.credentials.map((credential) => credential.name);
    if (!hasExactNames(input.binding.credentials, credentialNames)) {
      throw new ScriptFault(
        'revo.script.validation.binding',
        'Prepared script binding does not cover the exact manifest credentials.',
      );
    }
    for (const requirement of script.manifest.credentials) {
      if (input.binding.credentials[requirement.name]?.provider !== requirement.provider) {
        throw new ScriptFault(
          'revo.script.validation.binding',
          'Prepared credential binding does not match the exact manifest requirement.',
        );
      }
    }
  }

  private async validateRestoredCoordinates(
    script: ReturnType<typeof getRegisteredDefinition>,
    input: ScriptAttemptInput,
  ): Promise<void> {
    for (const requirement of script.manifest.resources) {
      const resource = input.binding.resources[requirement.name];
      if (resource === undefined) {
        throw new ScriptFault(
          'revo.script.validation.binding',
          'Prepared script binding does not cover the exact manifest resources.',
        );
      }
      // eslint-disable-next-line no-await-in-loop -- manifest order produces deterministic diagnostics.
      await this.catalog.validateCoordinates(
        script.manifest.providers.filter((provider) => provider.resource === requirement.name),
        resource.descriptor,
        requirement.name,
      );
    }
  }

  private async dispose(
    acquired: Awaited<ReturnType<AttemptResourcePreparer['acquire']>> | undefined,
  ): Promise<ScriptFault | undefined> {
    if (acquired === undefined) {
      return undefined;
    }
    try {
      await acquired.dispose();
      return undefined;
    } catch (error: unknown) {
      return toUnexpectedExecutionFault(error, 'Script provider cleanup failed.');
    }
  }
}

const stageFor = (
  fault: ScriptFault,
  phase: ScriptFailureStage = 'handler',
): ScriptFailureStage => {
  if (fault.code === 'revo.script.execution.cleanup') {
    return 'cleanup';
  }
  if (fault.code.startsWith('revo.script.timeout.')) {
    return 'timeout';
  }
  if (fault.code === 'revo.script.execution.event_sink') {
    return 'event_sink';
  }
  if (fault.code.startsWith('revo.script.provider.')) {
    return 'provider';
  }
  if (
    fault.code === 'revo.script.validation.event' ||
    fault.code === 'revo.script.validation.payload_limit'
  ) {
    return 'handler';
  }
  if (fault.code.startsWith('revo.script.validation.')) {
    return phase === 'acquire' ? 'acquire' : 'handler';
  }
  if (fault.code.startsWith('revo.script.permission.')) {
    return phase === 'acquire' ? 'acquire' : 'provider';
  }
  return phase;
};

const failed = (
  fault: ScriptFault,
  stage: ScriptFailureStage,
  prior?: UnsealedTerminalAttemptResult,
): UnsealedTerminalAttemptResult => ({
  kind: 'failed',
  error: {
    code: fault.code,
    message: fault.message,
    retryable: stage === 'handler' || stage === 'provider' ? fault.retryable : false,
    stage,
    details: toFailureDetails(fault.details),
    causes: canonicalCauses(prior, { code: fault.code, stage }),
  },
  evidence: prior?.evidence ?? [],
});

const sealTerminalResult = (
  lane: AttemptEventLane<unknown, unknown, ScriptResourceMap>,
  result: UnsealedTerminalAttemptResult,
): ScriptTerminalAttemptResult => {
  if (result.kind === 'succeeded') {
    return {
      ...result,
      terminalEvent: lane.sealSucceeded(result.evidence.length),
    };
  }
  if (result.kind === 'failed') {
    return {
      ...result,
      terminalEvent: lane.sealFailed(result.error.code, result.error.stage, result.error.retryable),
    };
  }
  if (result.kind === 'cancelled') {
    return { ...result, terminalEvent: lane.sealCancelled() };
  }
  return {
    ...result,
    terminalEvent: lane.sealTimedOut(result.error.code),
  };
};

const canonicalCauses = (
  prior: UnsealedTerminalAttemptResult | undefined,
  primary?: Readonly<{ code: string; stage: ScriptFailureStage }>,
): ScriptFailure['causes'] => {
  if (prior === undefined) {
    return [];
  }
  const candidates =
    prior.kind === 'failed'
      ? [
          { kind: 'fault' as const, code: prior.error.code, stage: prior.error.stage },
          ...prior.error.causes,
        ]
      : [{ kind: 'prior_outcome' as const, outcome: prior.kind }];
  const unique = new Map<string, (typeof candidates)[number]>();
  for (const cause of candidates) {
    const key =
      cause.kind === 'fault' ? `fault:${cause.stage}:${cause.code}` : `prior:${cause.outcome}`;
    if (cause.kind !== 'fault' || cause.code !== primary?.code || cause.stage !== primary?.stage) {
      unique.set(key, cause);
    }
  }
  return [...unique.values()].sort(compareCause);
};

const causeStageOrder: Readonly<Record<ScriptFailureStage, number>> = {
  acquire: 0,
  handler: 1,
  provider: 2,
  cleanup: 3,
  event_sink: 4,
  timeout: 5,
  invariant: 6,
};

const compareCause = (
  left: ScriptFailure['causes'][number],
  right: ScriptFailure['causes'][number],
): number => {
  if (left.kind === 'prior_outcome' && right.kind === 'prior_outcome') {
    return left.outcome.localeCompare(right.outcome);
  }
  if (left.kind === 'prior_outcome') {
    return 1;
  }
  if (right.kind === 'prior_outcome') {
    return -1;
  }
  return (
    causeStageOrder[left.stage] - causeStageOrder[right.stage] ||
    left.code.localeCompare(right.code)
  );
};

const outcomeForFault = (
  fault: ScriptFault,
  wasCancelled: boolean,
  phase: ScriptFailureStage,
): UnsealedTerminalAttemptResult => {
  if (fault.code === 'revo.script.timeout.wall_clock') {
    return {
      kind: 'timedOut',
      error: failureFor(fault, 'timeout'),
      evidence: [],
    };
  }
  // Caller cancellation wins over a generic rejection caused by the abort.
  // The explicit timeout branch above remains stronger than cancellation.
  if (wasCancelled) {
    return { kind: 'cancelled', evidence: [] };
  }
  return failed(fault, stageFor(fault, phase));
};

const failureFor = (fault: ScriptFault, stage: ScriptFailureStage) => ({
  code: fault.code,
  message: fault.message,
  retryable: stage === 'handler' || stage === 'provider' ? fault.retryable : false,
  stage,
  details: toFailureDetails(fault.details),
  causes: [],
});

const redactFailureDetails = (
  result: UnsealedTerminalAttemptResult,
  paths: readonly string[],
): UnsealedTerminalAttemptResult => {
  if (result.kind !== 'failed' && result.kind !== 'timedOut') {
    return result;
  }
  const details = result.error.details;
  if (details === null) {
    return result;
  }
  const redacted = redactValue(details, paths);
  return { ...result, error: { ...result.error, details: toFailureDetails(redacted) } };
};

const toFailureDetails = (details: unknown): JsonObject | null =>
  isJsonObject(details) ? structuredClone(details) : null;

const isJsonObject = (value: unknown): value is JsonObject =>
  isRecord(value) && Object.values(value).every(isJsonValue);

const isJsonValue = (value: unknown): value is JsonValue => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (typeof value === 'object') {
    return Object.values(value).every(isJsonValue);
  }
  return false;
};

const isAbortSignal = (value: unknown): value is AbortSignal =>
  typeof value === 'object' &&
  value !== null &&
  'aborted' in value &&
  typeof value.aborted === 'boolean' &&
  'addEventListener' in value &&
  typeof value.addEventListener === 'function';

const hasExactNames = (
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): boolean => {
  const actual = Object.keys(value);
  return actual.length === expected.length && actual.every((name) => expected.includes(name));
};

const sameProviderDescriptor = (
  actual: ScriptAttemptInput['binding']['providers'][number],
  expected: ScriptAttemptInput['binding']['providers'][number],
): boolean =>
  actual.id === expected.id &&
  actual.contract === expected.contract &&
  actual.implementationDigest === expected.implementationDigest &&
  actual.workspace === expected.workspace &&
  actual.provenance.packageName === expected.provenance.packageName &&
  actual.provenance.packageVersion === expected.provenance.packageVersion &&
  actual.operations.length === expected.operations.length &&
  actual.operations.every((operation, index) => operation === expected.operations[index]);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isScriptAttemptInput = (value: unknown): value is ScriptAttemptInput => {
  if (!isRecord(value) || !isRecord(value.script) || !isRecord(value.binding)) {
    return false;
  }
  return (
    typeof value.executionId === 'string' &&
    value.executionId.length > 0 &&
    typeof value.attemptId === 'string' &&
    value.attemptId.length > 0 &&
    typeof value.attemptOrdinal === 'number' &&
    Number.isSafeInteger(value.attemptOrdinal) &&
    value.attemptOrdinal > 0 &&
    typeof value.script.id === 'string' &&
    value.script.id.startsWith('script:') &&
    Number.isSafeInteger(value.script.version) &&
    typeof value.binding.schemaVersion === 'string' &&
    value.binding.schemaVersion === 'prepared-script-binding/v1'
  );
};

const terminationGraceMs = 1_000;
type UncertainStage = 'acquire' | 'handler' | 'validation' | 'cleanup' | 'event_sink';

const settleOrTrigger = async (
  terminal: Promise<ScriptTerminalAttemptResult>,
  signal: AbortSignal,
): Promise<
  | Readonly<{ kind: 'settled'; result: ScriptTerminalAttemptResult }>
  | Readonly<{ kind: 'triggered' }>
> =>
  await Promise.race([
    terminal.then((result) => ({ kind: 'settled' as const, result })),
    new Promise<Readonly<{ kind: 'triggered' }>>((resolve) => {
      if (signal.aborted) {
        resolve({ kind: 'triggered' });
      } else {
        signal.addEventListener('abort', () => resolve({ kind: 'triggered' }), { once: true });
      }
    }),
  ]);

const settleWithin = async (
  terminal: Promise<ScriptTerminalAttemptResult>,
  timeoutMs: number,
): Promise<ScriptTerminalAttemptResult | undefined> =>
  await new Promise<ScriptTerminalAttemptResult | undefined>((resolve) => {
    const timer = setTimeout(() => resolve(undefined), timeoutMs);
    void terminal.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
    );
  });

const triggerFor = (reason: unknown): 'timeout' | 'cancellation' =>
  reason instanceof ScriptFault && reason.code === 'revo.script.timeout.wall_clock'
    ? 'timeout'
    : 'cancellation';

const faultFromSignal = (signal: AbortSignal): ScriptFault | undefined =>
  signal.reason instanceof ScriptFault ? signal.reason : undefined;

const throwIfDeadlineElapsed = (deadline: ReturnType<typeof createScriptDeadline>): void => {
  const fault = faultFromSignal(deadline.signal);
  if (fault !== undefined) {
    throw fault;
  }
};
