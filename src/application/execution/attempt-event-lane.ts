import { assertEventWithinLimit } from '../../runtime/execution/payload/assert-event-limit.js';
import { redactValue } from '../../runtime/execution/redaction/redact.js';
import type { ScriptDefinition } from '../../runtime/spec/definition/index.js';
import { ScriptFault } from '../../runtime/spec/errors/index.js';
import type { ScriptErrorCode } from '../../runtime/spec/errors/index.js';
import type { ScriptCustomEvent } from '../../runtime/spec/events/index.js';
import type { ScriptResourceMap } from '../../runtime/spec/resources/index.js';
import type { ScriptFailureStage } from '../../runtime/spec/result/index.js';
import { ScriptEventSchema } from '../contracts/script-attempt-schemas.js';
import type {
  EventSink,
  ScriptCancelledTerminalEventEmission,
  ScriptFailedTerminalEventEmission,
  ScriptLiveEvent,
  ScriptLifecycleDetails,
  ScriptStartedEvent,
  ScriptSucceededTerminalEventEmission,
  ScriptTerminalEvent,
  ScriptTimedOutTerminalEventEmission,
} from '../contracts/script-attempt.js';

export class AttemptEventLane<I, O, R extends ScriptResourceMap> {
  private readonly definition: ScriptDefinition<I, O, R>;
  private readonly executionId: string;
  private readonly attemptOrdinal: number;
  private readonly sink: EventSink;
  private readonly now: () => number;
  private ordinal = 0;
  private latched: ScriptFault | undefined;
  private pending: Promise<void> = Promise.resolve();
  private customEventsClosed = false;
  private terminalSealed = false;

  constructor(
    definition: ScriptDefinition<I, O, R>,
    executionId: string,
    attemptOrdinal: number,
    sink: EventSink,
    now: () => number,
  ) {
    this.definition = definition;
    this.executionId = executionId;
    this.attemptOrdinal = attemptOrdinal;
    this.sink = sink;
    this.now = now;
  }

  started(): Promise<void> {
    return this.enqueue(async () => await this.emitLive(this.startedEvent()));
  }

  custom(event: ScriptCustomEvent): Promise<void> {
    // Register the complete custom operation synchronously. A handler may
    // intentionally not await this promise, but the shared lane must still
    // drain it before an outcome or terminal event is selected.
    const boundary = this.enqueue(async () => await this.emitCustom(event));
    // Observe this exact promise without changing what an awaiting handler
    // receives. This prevents a fire-and-forget rejection from reaching the
    // process-level unhandled-rejection channel.
    void boundary.catch(() => undefined);
    return boundary;
  }

  sealSucceeded(evidenceCount: number): ScriptSucceededTerminalEventEmission {
    return this.sealTerminal({
      name: 'revo.script.succeeded',
      details: { ...this.lifecycleDetails(), evidenceCount },
    });
  }

  sealFailed(
    code: ScriptErrorCode,
    stage: ScriptFailureStage,
    retryable: boolean,
  ): ScriptFailedTerminalEventEmission {
    return this.sealTerminal({
      name: 'revo.script.failed',
      details: { ...this.lifecycleDetails(), code, stage, retryable },
    });
  }

  sealCancelled(): ScriptCancelledTerminalEventEmission {
    return this.sealTerminal({
      name: 'revo.script.cancelled',
      details: this.lifecycleDetails(),
    });
  }

  sealTimedOut(code: ScriptErrorCode): ScriptTimedOutTerminalEventEmission {
    return this.sealTerminal({
      name: 'revo.script.timed_out',
      details: { ...this.lifecycleDetails(), code },
    });
  }

  failure(): ScriptFault | undefined {
    return this.latched;
  }

  closeForUncertainty(): void {
    this.customEventsClosed = true;
  }

  async drain(): Promise<void> {
    try {
      await this.pending;
    } catch {
      // The latched fault below is the bounded public diagnostic.
    }
    if (this.latched !== undefined) {
      throw this.latched;
    }
  }

  private async emitCustom(event: ScriptCustomEvent): Promise<void> {
    if (this.customEventsClosed) {
      throw new ScriptFault(
        'revo.script.execution.aborted',
        'Script attempt no longer accepts custom events.',
      );
    }
    if (this.latched !== undefined) {
      throw this.latched;
    }
    if (!this.definition.manifest.events.allowed.includes(event.name)) {
      return this.rejectCustomEvent();
    }
    try {
      if (!hasAuthorizedDetailLeaves(event.details, this.definition.manifest.events.detailPaths)) {
        return this.rejectCustomEvent();
      }
      const redacted = {
        ...event,
        ...(event.details === undefined
          ? {}
          : { details: redactValue(event.details, this.definition.manifest.redaction.eventPaths) }),
      };
      assertEventWithinLimit(redacted);
      if (!isCustomEvent(redacted)) {
        return this.rejectCustomEvent();
      }
      const validated = await ScriptEventSchema.validate(redacted);
      if (!validated.ok || !isCustomEvent(validated.value)) {
        return this.rejectCustomEvent();
      }
      await this.emitLive(validated.value);
    } catch (error: unknown) {
      if (error instanceof ScriptFault) {
        this.latched = error;
        throw error;
      }
      this.latched = new ScriptFault(
        'revo.script.execution.event_sink',
        'Event sink rejected a script event.',
        { cause: error },
      );
      throw this.latched;
    }
  }

  private rejectCustomEvent(): never {
    const fault = new ScriptFault(
      'revo.script.validation.event',
      'Script emitted an undeclared custom event.',
    );
    this.latched = fault;
    throw fault;
  }

  private lifecycleDetails(): ScriptLifecycleDetails {
    return {
      script: { id: this.definition.manifest.id, version: this.definition.manifest.version },
      definitionDigest: this.definition.definitionDigest,
      attemptOrdinal: this.attemptOrdinal,
      timestampMs: this.now(),
    };
  }

  private startedEvent(): ScriptStartedEvent {
    return { name: 'revo.script.started', details: this.lifecycleDetails() };
  }

  private sealTerminal<TEvent extends ScriptTerminalEvent>(
    event: TEvent,
  ): Readonly<{ readonly emissionOrdinal: number; readonly event: TEvent }> {
    if (this.terminalSealed) {
      throw new ScriptFault(
        'revo.script.execution.invariant',
        'Script attempt terminal event was sealed more than once.',
      );
    }
    this.terminalSealed = true;
    return { emissionOrdinal: ++this.ordinal, event: structuredClone(event) };
  }

  private async emitLive(event: ScriptLiveEvent): Promise<void> {
    try {
      await this.sink.emit({ emissionOrdinal: ++this.ordinal, event: structuredClone(event) });
    } catch (error: unknown) {
      this.latched = new ScriptFault(
        'revo.script.execution.event_sink',
        'Event sink rejected a script event.',
        { cause: error },
      );
      throw this.latched;
    }
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const boundary = this.pending.then(operation);
    // The lane must continue serially after an observed custom failure. The
    // caller still receives `boundary` (and therefore its original rejection),
    // while drain reads the latched bounded fault after this settled queue.
    this.pending = boundary.catch(() => undefined);
    return boundary;
  }
}

const isCustomEvent = (value: unknown): value is ScriptCustomEvent =>
  typeof value === 'object' && value !== null && 'name' in value && typeof value.name === 'string';

const hasAuthorizedDetailLeaves = (
  details: unknown,
  allowedPointers: readonly string[],
): boolean => {
  if (details === undefined) {
    return true;
  }
  if (!isRecord(details)) {
    return false;
  }
  return detailLeaves(details).every((pointer) => allowedPointers.includes(pointer));
};

const detailLeaves = (value: unknown, prefix = ''): readonly string[] => {
  if (Array.isArray(value)) {
    return value.length === 0
      ? [prefix]
      : value.flatMap((child, index) => detailLeaves(child, `${prefix}/${index}`));
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    return entries.length === 0
      ? [prefix]
      : entries.flatMap(([key, child]) =>
          detailLeaves(child, `${prefix}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`),
        );
  }
  return [prefix];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
