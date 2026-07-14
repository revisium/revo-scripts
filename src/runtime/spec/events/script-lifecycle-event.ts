export interface ScriptLifecycleEvent {
  readonly name:
    | 'revo.script.started'
    | 'revo.script.retrying'
    | 'revo.script.succeeded'
    | 'revo.script.failed';
  readonly details: Readonly<Record<string, unknown>>;
}
