export interface ScriptCustomEvent {
  readonly name: string;
  readonly details?: Readonly<Record<string, unknown>>;
}
