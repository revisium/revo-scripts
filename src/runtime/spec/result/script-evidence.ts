export interface ScriptEvidence {
  readonly kind: 'artifact' | 'log' | 'external';
  readonly ref: string;
  readonly summary?: string;
}
