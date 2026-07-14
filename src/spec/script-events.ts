export interface ScriptCustomEvent {
  readonly name: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface ScriptLifecycleEvent {
  readonly name:
    | 'revo.script.started'
    | 'revo.script.retrying'
    | 'revo.script.succeeded'
    | 'revo.script.failed';
  readonly details: Readonly<Record<string, unknown>>;
}

export type ScriptEvent = ScriptLifecycleEvent | ScriptCustomEvent;

export interface EventSink {
  emit(event: ScriptEvent): Promise<void>;
}
