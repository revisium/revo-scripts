import {
  getRegisteredDefinition,
  type RegisteredScript,
  type ScriptRegistry,
} from '../core/registry/script-registry.js';
import { createScriptDeadline, type ScriptDeadline } from '../core/runtime/deadline.js';
import { executeScript } from '../core/runtime/execute-script.js';
import {
  assertEventWithinLimit,
  assertJsonPayloadWithinLimit,
} from '../core/runtime/payload-limits.js';
import { systemClock } from '../core/runtime/system-clock.js';
import { validateExecutionId } from '../core/runtime/validate-execution.js';
import { codePointLength } from '../core/runtime/validation-rules.js';
import { ScriptFault } from '../core/spec/script-errors.js';
import type { EventSink, ScriptEvent, ScriptLifecycleEvent } from '../core/spec/script-events.js';
import type {
  ScriptManifestV1,
  ScriptProviderRequirement,
  ScriptResourceRequirement,
} from '../core/spec/script-manifest.js';
import type { ScriptResourceHandle, ScriptResourceMap } from '../core/spec/script-resources.js';
import type { ScriptExecutionResult, ScriptFailure } from '../core/spec/script-result.js';
import type {
  ResolvedCredential,
  ScriptResourceBinding,
  TrustedWorkspaceAllocation,
} from '../host/contracts.js';
import type { PreparedProviderClients, ScriptProviderModule } from '../host/provider-module.js';
import type { RevoScriptExecutionRequest, RevoScripts, RevoScriptsOptions } from './contracts.js';
import { createDefinitionRegistry } from './definition-registry.js';
import {
  createProviderCatalog,
  type ProviderCatalog,
  requireProvider,
  requireProviderCoverage,
  resolveForPlan,
} from './provider-catalog.js';

interface PreparedExecution {
  readonly resources: ScriptResourceMap;
  dispose(): Promise<void>;
}

interface ValidatedProvider {
  readonly requirement: ScriptProviderRequirement;
  readonly resource: ScriptResourceRequirement;
  readonly binding: ScriptResourceBinding;
  readonly provider: ScriptProviderModule;
}

interface FacadeFailure {
  readonly ok: false;
  readonly error: ScriptFailure;
  readonly attempts: number;
}

interface BufferedTerminalSink {
  readonly sink: EventSink;
  discard(): void;
  flush(): Promise<void>;
}

const cleanupGraceMs = 1_000;

const fail = (fault: ScriptFault, attempts = 0): FacadeFailure =>
  Object.freeze({
    ok: false,
    error: Object.freeze({
      code: fault.code,
      message: fault.message,
      retryable: false,
    }),
    attempts,
  });

const isTerminalEvent = (event: ScriptEvent): boolean =>
  event.name === 'revo.script.succeeded' || event.name === 'revo.script.failed';

const createBufferedTerminalSink = (target: EventSink): BufferedTerminalSink => {
  let terminalEvent: ScriptEvent | undefined;
  const sink: EventSink = Object.freeze({
    emit: async (event: ScriptEvent) => {
      if (isTerminalEvent(event)) {
        if (terminalEvent !== undefined) {
          throw new ScriptFault(
            'revo.script.execution.event_sink',
            'Script execution produced more than one terminal event.',
          );
        }

        terminalEvent = event;
        return;
      }

      await target.emit(event);
    },
  });

  return Object.freeze({
    sink,
    discard: () => {
      terminalEvent = undefined;
    },
    flush: async () => {
      if (terminalEvent === undefined) {
        return;
      }

      const event = terminalEvent;
      terminalEvent = undefined;
      await target.emit(event);
    },
  });
};

const emitFacadeFailure = async (
  options: RevoScriptsOptions,
  request: RevoScriptExecutionRequest,
  fault: ScriptFault,
  attempts = 0,
): Promise<ScriptExecutionResult<never>> => {
  const result = fail(fault, attempts);
  const executionIdLength = codePointLength(request.executionId);
  const event: ScriptLifecycleEvent = {
    name: 'revo.script.failed',
    details: {
      executionId:
        executionIdLength >= 1 && executionIdLength <= 256
          ? request.executionId
          : '[INVALID_EXECUTION_ID]',
      scriptId: request.script.id,
      scriptVersion: request.script.version,
      definitionDigest: request.script.definitionDigest,
      attempt: attempts,
      timestampMs: (options.host.clock ?? systemClock).now(),
      durationMs: 0,
      error: result.error,
    },
  };

  try {
    assertEventWithinLimit(event);
    await options.host.events.emit(event);
  } catch (error: unknown) {
    return fail(
      new ScriptFault('revo.script.execution.event_sink', 'Event sink rejected a script event.', {
        cause: error,
      }),
    );
  }

  return result;
};

const toFault = (error: unknown, message: string): ScriptFault =>
  error instanceof ScriptFault
    ? error
    : new ScriptFault('revo.script.execution.unexpected', message, { cause: error });

const throwIfAborted = (signal: AbortSignal): void => {
  if (!signal.aborted) {
    return;
  }

  if (signal.reason instanceof ScriptFault) {
    throw signal.reason;
  }

  throw new ScriptFault('revo.script.execution.aborted', 'Script execution was aborted.', {
    cause: signal.reason,
  });
};

const requireExactNames = (
  actual: readonly string[],
  expected: readonly string[],
  fault: ScriptFault,
): void => {
  if (actual.length !== expected.length || actual.some((name) => !expected.includes(name))) {
    throw fault;
  }
};

const validateBindingBounds = (request: RevoScriptExecutionRequest): void => {
  const resourceBindings = Object.values(request.bindings.resources);

  if (
    resourceBindings.length > 16 ||
    Object.keys(request.bindings.credentials).length > 16 ||
    request.providers.length > 8
  ) {
    throw new ScriptFault(
      'revo.script.validation.bindings',
      'Execution bindings exceed the supported collection limits.',
    );
  }

  resourceBindings.forEach((binding) => {
    if (binding.grant.permissions.length > 64 || binding.grant.effects.length > 16) {
      throw new ScriptFault(
        'revo.script.validation.bindings',
        'A resource grant exceeds the supported collection limits.',
      );
    }

    if (
      new Set(binding.grant.permissions).size !== binding.grant.permissions.length ||
      new Set(binding.grant.effects).size !== binding.grant.effects.length
    ) {
      throw new ScriptFault(
        'revo.script.validation.bindings',
        'Resource grant permissions and effects must be unique.',
      );
    }

    if (Object.keys(binding.providerCoordinates).length > 0) {
      throw new ScriptFault(
        'revo.script.provider.coordinates_unsupported',
        'Provider coordinates are not supported by the current facade slice.',
      );
    }
  });
};

const requireBinding = (
  request: RevoScriptExecutionRequest,
  manifest: ScriptManifestV1,
  requirement: ScriptResourceRequirement,
): ScriptResourceBinding => {
  const binding = request.bindings.resources[requirement.name];

  if (
    binding === undefined ||
    binding.kind !== requirement.kind ||
    binding.access !== requirement.access
  ) {
    throw new ScriptFault(
      'revo.script.permission.resource',
      `Resource binding ${requirement.name} does not match the manifest.`,
    );
  }

  const missingPermission = manifest.permissions.find(
    (permission) => !binding.grant.permissions.includes(permission),
  );

  if (missingPermission !== undefined) {
    throw new ScriptFault(
      'revo.script.permission.grant',
      `Resource binding ${requirement.name} is missing permission ${missingPermission}.`,
    );
  }

  const missingEffect = manifest.effects.find((effect) => !binding.grant.effects.includes(effect));

  if (missingEffect !== undefined) {
    throw new ScriptFault(
      'revo.script.permission.effect',
      `Resource binding ${requirement.name} is missing effect ${missingEffect}.`,
    );
  }

  return binding;
};

const resolveWorkspace = async (
  options: RevoScriptsOptions,
  provider: ScriptProviderModule,
  binding: ScriptResourceBinding,
  signal: AbortSignal,
): Promise<TrustedWorkspaceAllocation | undefined> => {
  if (provider.workspace === 'none') {
    return undefined;
  }

  if (binding.workspaceId === undefined) {
    throw new ScriptFault(
      'revo.script.provider.workspace_required',
      'Provider requires a workspace binding.',
    );
  }

  const workspace = await options.host.workspaces.resolve(binding.workspaceId, signal);
  throwIfAborted(signal);

  if (
    workspace.workspaceId !== binding.workspaceId ||
    workspace.repositoryId !== binding.repositoryId
  ) {
    throw new ScriptFault(
      'revo.script.provider.workspace_mismatch',
      'Resolved workspace does not match the resource binding.',
    );
  }

  return workspace;
};

const resolveCredentials = async (
  options: RevoScriptsOptions,
  manifest: ScriptManifestV1,
  providerRequirement: ScriptProviderRequirement,
  request: RevoScriptExecutionRequest,
  signal: AbortSignal,
  resolvedCredentials: ResolvedCredential[],
): Promise<Readonly<Record<string, ResolvedCredential>>> => {
  const credentials: Record<string, ResolvedCredential> = {};
  const requirements = manifest.credentials.filter(
    (requirement) => requirement.providerRequirement === providerRequirement.name,
  );

  const resolveAt = async (index: number): Promise<void> => {
    const requirement = requirements[index];

    if (requirement === undefined) {
      return;
    }

    const binding = request.bindings.credentials[requirement.name];

    if (binding === undefined || binding.provider !== requirement.provider) {
      throw new ScriptFault(
        'revo.script.permission.credential',
        `Credential binding ${requirement.name} does not match the manifest.`,
      );
    }

    const credential = await options.host.credentials.resolve(binding, signal);
    credentials[requirement.name] = credential;
    resolvedCredentials.push(credential);
    throwIfAborted(signal);
    await resolveAt(index + 1);
  };

  await resolveAt(0);

  return Object.freeze(credentials);
};

const mergeClients = (
  clientsByResource: Map<string, Record<string, object>>,
  resource: string,
  prepared: PreparedProviderClients,
): void => {
  const target = clientsByResource.get(resource);

  if (target === undefined) {
    throw new ScriptFault(
      'revo.script.permission.resource',
      `Provider references unknown resource ${resource}.`,
    );
  }

  Object.entries(prepared.clients).forEach(([name, client]) => {
    if (Object.hasOwn(target, name)) {
      throw new ScriptFault(
        'revo.script.provider.client_conflict',
        `Provider client ${name} is already attached to resource ${resource}.`,
      );
    }

    target[name] = client;
  });
};

const disposeAll = async (
  providers: readonly PreparedProviderClients[],
  credentials: readonly ResolvedCredential[],
): Promise<void> => {
  const results = await Promise.allSettled([
    ...providers.map((provider) => provider.dispose()),
    ...credentials.map((credential) => credential.dispose()),
  ]);

  if (results.some((result) => result.status === 'rejected')) {
    throw new ScriptFault(
      'revo.script.provider.cleanup_failed',
      'Provider resources could not be disposed safely.',
    );
  }
};

const disposeWithBudget = async (
  prepared: PreparedExecution,
  deadline: ScriptDeadline,
): Promise<void> => {
  const remainingMs = deadline.remainingMs();
  const budgetMs = remainingMs === 0 ? cleanupGraceMs : Math.min(remainingMs, cleanupGraceMs);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () =>
        reject(
          new ScriptFault(
            'revo.script.provider.cleanup_failed',
            'Provider cleanup exceeded its bounded grace period.',
          ),
        ),
      budgetMs,
    );
  });

  try {
    await Promise.race([prepared.dispose(), budget]);
  } finally {
    clearTimeout(timeout);
  }
};

const validateCredentialBindings = (
  manifest: ScriptManifestV1,
  request: RevoScriptExecutionRequest,
): void => {
  manifest.credentials.forEach((requirement) => {
    const binding = request.bindings.credentials[requirement.name];

    if (binding === undefined || binding.provider !== requirement.provider) {
      throw new ScriptFault(
        'revo.script.permission.credential',
        `Credential binding ${requirement.name} does not match the manifest.`,
      );
    }
  });
};

const validateProviders = (
  catalog: ProviderCatalog,
  manifest: ScriptManifestV1,
  request: RevoScriptExecutionRequest,
): readonly ValidatedProvider[] =>
  manifest.providers.map((requirement) => {
    const resource = manifest.resources.find(
      (candidate) => candidate.name === requirement.resource,
    );

    if (resource === undefined) {
      throw new ScriptFault(
        'revo.script.validation.manifest',
        'Provider requirement references an unknown resource.',
      );
    }

    const pin = request.providers.find((candidate) => candidate.name === requirement.name);
    return Object.freeze({
      requirement,
      resource,
      binding: requireBinding(request, manifest, resource),
      provider: requireProvider(catalog, requirement, pin),
    });
  });

const validateRequestBeforeProviders = async (
  registry: ScriptRegistry,
  script: RegisteredScript<unknown, unknown, ScriptResourceMap>,
  request: RevoScriptExecutionRequest,
  deadline: ScriptDeadline,
): Promise<void> => {
  validateExecutionId(request.executionId);
  assertJsonPayloadWithinLimit(request.input, 'input');
  assertJsonPayloadWithinLimit(request.bindings, 'bindings');

  if (script.manifest.idempotency === 'required' && request.idempotencyKey === undefined) {
    throw new ScriptFault(
      'revo.script.idempotency.key_required',
      'This script requires an idempotency key.',
    );
  }

  if (
    request.idempotencyKey !== undefined &&
    (codePointLength(request.idempotencyKey) === 0 ||
      codePointLength(request.idempotencyKey) > 1_024)
  ) {
    throw new ScriptFault(
      'revo.script.validation.input',
      'Idempotency key must contain between 1 and 1024 Unicode code points.',
    );
  }

  const definition = getRegisteredDefinition(registry, script);
  const input = await deadline.race(definition.inputSchema.validate(request.input));

  if (!input.ok) {
    throw new ScriptFault('revo.script.validation.input', 'Script input is invalid.', {
      details: { issues: input.issues },
    });
  }
};

const prepareExecution = async (
  options: RevoScriptsOptions,
  catalog: ProviderCatalog,
  manifest: ScriptManifestV1,
  request: RevoScriptExecutionRequest,
  signal: AbortSignal,
): Promise<PreparedExecution> => {
  validateBindingBounds(request);
  requireExactNames(
    Object.keys(request.bindings.resources),
    manifest.resources.map((resource) => resource.name),
    new ScriptFault(
      'revo.script.permission.resource',
      'Resource bindings do not match the script manifest.',
    ),
  );
  requireExactNames(
    Object.keys(request.bindings.credentials),
    manifest.credentials.map((credential) => credential.name),
    new ScriptFault(
      'revo.script.permission.credential',
      'Credential bindings do not match the script manifest.',
    ),
  );

  if (request.providers.length !== manifest.providers.length) {
    throw new ScriptFault(
      'revo.script.provider.pin_mismatch',
      'Provider pins do not match the script manifest.',
    );
  }

  manifest.resources.forEach((requirement) => requireBinding(request, manifest, requirement));
  validateCredentialBindings(manifest, request);
  const validatedProviders = validateProviders(catalog, manifest, request);

  const clientsByResource = new Map<string, Record<string, object>>(
    manifest.resources.map((resource) => [resource.name, {}]),
  );
  const preparedProviders: PreparedProviderClients[] = [];
  const resolvedCredentials: ResolvedCredential[] = [];

  try {
    const prepareAt = async (index: number): Promise<void> => {
      const validated = validatedProviders[index];

      if (validated === undefined) {
        return;
      }

      const workspace = await resolveWorkspace(
        options,
        validated.provider,
        validated.binding,
        signal,
      );
      const credentials = await resolveCredentials(
        options,
        manifest,
        validated.requirement,
        request,
        signal,
        resolvedCredentials,
      );
      const prepared = await validated.provider.createResourceClients({
        manifest,
        provider: validated.requirement,
        requirement: validated.resource,
        binding: validated.binding,
        ...(workspace === undefined ? {} : { workspace }),
        credentials,
        signal,
      });
      preparedProviders.push(prepared);
      throwIfAborted(signal);
      mergeClients(clientsByResource, validated.requirement.resource, prepared);
      await prepareAt(index + 1);
    };

    await prepareAt(0);
    throwIfAborted(signal);

    const resources: Record<string, ScriptResourceHandle<object>> = {};
    manifest.resources.forEach((requirement) => {
      const binding = requireBinding(request, manifest, requirement);
      resources[requirement.name] = Object.freeze({
        name: requirement.name,
        kind: requirement.kind,
        access: requirement.access,
        grant: binding.grant,
        clients: Object.freeze(clientsByResource.get(requirement.name) ?? {}),
      });
    });

    return Object.freeze({
      resources: Object.freeze(resources),
      dispose: () => disposeAll(preparedProviders, resolvedCredentials),
    });
  } catch (error: unknown) {
    await disposeAll(preparedProviders, resolvedCredentials);
    throw error;
  }
};

const execute = async (
  options: RevoScriptsOptions,
  registry: ScriptRegistry,
  catalog: ProviderCatalog,
  request: RevoScriptExecutionRequest,
): Promise<ScriptExecutionResult<unknown>> => {
  let script: RegisteredScript<unknown, unknown, ScriptResourceMap>;
  try {
    script = registry.getExact(
      request.script.id,
      request.script.version,
      request.script.definitionDigest,
    );
  } catch (error: unknown) {
    return emitFacadeFailure(options, request, toFault(error, 'Script definition lookup failed.'));
  }

  const deadline = createScriptDeadline(
    script.manifest.timeout.wallClockMs,
    options.host.clock ?? systemClock,
    request.signal,
  );

  try {
    try {
      await validateRequestBeforeProviders(registry, script, request, deadline);
    } catch (error: unknown) {
      return emitFacadeFailure(options, request, toFault(error, 'Script input preflight failed.'));
    }

    let prepared: PreparedExecution;
    try {
      prepared = await deadline.race(
        prepareExecution(options, catalog, script.manifest, request, deadline.signal),
      );
    } catch (error: unknown) {
      return emitFacadeFailure(
        options,
        request,
        toFault(error, 'Script provider preparation failed.'),
      );
    }

    const terminalSink = createBufferedTerminalSink(options.host.events);
    let result: ScriptExecutionResult<unknown>;
    try {
      result = await executeScript(registry, script, {
        executionId: request.executionId,
        input: request.input,
        resources: prepared.resources,
        ...(request.idempotencyKey === undefined ? {} : { idempotencyKey: request.idempotencyKey }),
        eventSink: terminalSink.sink,
        ...(options.host.clock === undefined ? {} : { clock: options.host.clock }),
        signal: deadline.signal,
      });
    } catch (error: unknown) {
      result = fail(toFault(error, 'Script execution failed unexpectedly.'));
    }

    try {
      await disposeWithBudget(prepared, deadline);
    } catch (error: unknown) {
      terminalSink.discard();
      return emitFacadeFailure(
        options,
        request,
        toFault(error, 'Script provider cleanup failed.'),
        result.attempts,
      );
    }

    try {
      await terminalSink.flush();
    } catch (error: unknown) {
      return fail(
        new ScriptFault('revo.script.execution.event_sink', 'Event sink rejected a script event.', {
          cause: error,
        }),
        result.attempts,
      );
    }

    return result;
  } finally {
    deadline.dispose();
  }
};

export const createRevoScripts = (options: RevoScriptsOptions): RevoScripts => {
  const registry = createDefinitionRegistry(options);
  const catalog = createProviderCatalog(options.providers);
  requireProviderCoverage(registry, catalog);

  const facade: RevoScripts = {
    resolveForPlan: (script: { readonly id: `script:${string}`; readonly version: string }) =>
      resolveForPlan(registry, catalog, script),
    execute: (request: RevoScriptExecutionRequest) => execute(options, registry, catalog, request),
    listManifests: () => registry.listManifests(),
    listProviderImplementations: () => catalog.descriptors,
  };

  return Object.freeze(facade);
};
