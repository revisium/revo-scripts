import { systemClock } from '../../runtime/execution/clock/system-clock.js';
import { createScriptDeadline } from '../../runtime/execution/deadline/create-script-deadline.js';
import { executeValidatedScript } from '../../runtime/execution/execute-validated-script.js';
import type { RegisteredScript } from '../../runtime/registry/contracts/registered-script.js';
import type { ScriptRegistry } from '../../runtime/registry/contracts/script-registry.js';
import { ScriptFault } from '../../runtime/spec/errors/index.js';
import type { ScriptResourceMap } from '../../runtime/spec/resources/index.js';
import type { ScriptExecutionResult } from '../../runtime/spec/result/index.js';
import type { RevoScriptExecutionRequest } from '../contracts/revo-script-execution-request.js';
import type { RevoScriptsOptions } from '../contracts/revo-scripts-options.js';
import { ProviderExecutionPreparer } from '../providers/preparation/provider-execution-preparer.js';
import type { ProviderCatalog } from '../providers/provider-catalog.js';
import { BufferedTerminalEventSink } from './buffered-terminal-event-sink.js';
import { createApplicationFailure } from './create-application-failure.js';
import { emitApplicationFailure } from './emit-application-failure.js';
import { validateRequestBeforeProviders } from './request-preflight.js';
import { toApplicationFault } from './to-application-fault.js';

export class ScriptExecutionCoordinator {
  private readonly options: RevoScriptsOptions;
  private readonly registry: ScriptRegistry;
  private readonly preparer: ProviderExecutionPreparer;

  constructor(options: RevoScriptsOptions, registry: ScriptRegistry, catalog: ProviderCatalog) {
    this.options = options;
    this.registry = registry;
    this.preparer = new ProviderExecutionPreparer(options, catalog);
  }

  async execute(request: RevoScriptExecutionRequest): Promise<ScriptExecutionResult<unknown>> {
    const script = await this.resolveScript(request);

    if (!('manifest' in script)) {
      return script;
    }

    const deadline = createScriptDeadline(
      script.manifest.timeout.wallClockMs,
      this.options.host.clock ?? systemClock,
      request.signal,
    );

    let input: unknown;
    try {
      try {
        input = await validateRequestBeforeProviders(this.registry, script, request, deadline);
      } catch (error: unknown) {
        return emitApplicationFailure(
          this.options,
          request,
          toApplicationFault(error, 'Script input preflight failed.'),
        );
      }

      let prepared;
      try {
        prepared = await deadline.race(
          this.preparer.prepare(script.manifest, request, deadline.signal),
        );
      } catch (error: unknown) {
        return emitApplicationFailure(
          this.options,
          request,
          toApplicationFault(error, 'Script provider preparation failed.'),
        );
      }

      const terminalSink = new BufferedTerminalEventSink(this.options.host.events);
      let result: ScriptExecutionResult<unknown>;
      try {
        result = await executeValidatedScript(
          this.registry,
          script,
          {
            executionId: request.executionId,
            input: request.input,
            resources: prepared.resources,
            ...(request.idempotencyKey === undefined
              ? {}
              : { idempotencyKey: request.idempotencyKey }),
            eventSink: terminalSink,
            ...(this.options.host.clock === undefined ? {} : { clock: this.options.host.clock }),
            signal: deadline.signal,
          },
          input,
        );
      } catch (error: unknown) {
        result = createApplicationFailure(
          toApplicationFault(error, 'Script execution failed unexpectedly.'),
        );
      }

      try {
        await prepared.dispose(deadline);
      } catch (error: unknown) {
        terminalSink.discard();
        return emitApplicationFailure(
          this.options,
          request,
          toApplicationFault(error, 'Script provider cleanup failed.'),
          result.attempts,
        );
      }

      try {
        await terminalSink.flush();
      } catch (error: unknown) {
        return createApplicationFailure(
          new ScriptFault(
            'revo.script.execution.event_sink',
            'Event sink rejected a script event.',
            { cause: error },
          ),
          result.attempts,
        );
      }

      return result;
    } finally {
      deadline.dispose();
    }
  }

  private async resolveScript(
    request: RevoScriptExecutionRequest,
  ): Promise<RegisteredScript<unknown, unknown, ScriptResourceMap> | ScriptExecutionResult<never>> {
    try {
      return this.registry.getExact(
        request.script.id,
        request.script.version,
        request.script.definitionDigest,
      );
    } catch (error: unknown) {
      return emitApplicationFailure(
        this.options,
        request,
        toApplicationFault(error, 'Script definition lookup failed.'),
      );
    }
  }
}
