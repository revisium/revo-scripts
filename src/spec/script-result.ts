export interface ScriptEvidence {
  readonly kind: 'artifact' | 'log' | 'external';
  readonly ref: string;
  readonly summary?: string;
}

export interface ScriptHandlerResult<O> {
  readonly value: O;
  readonly evidence?: readonly ScriptEvidence[];
}
