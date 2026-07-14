export interface ApprovalEvidenceReference {
  readonly identity: Readonly<{ scheme: string; value: string }>;
  readonly title: string;
}

export interface ApprovalSubjectInput {
  readonly kind: 'plan' | 'change' | 'publication' | 'operation';
  readonly identity: Readonly<{ scheme: string; value: string }>;
  readonly revision: Readonly<{ scheme: string; value: string }>;
  readonly title: string;
  readonly summary: string;
  readonly evidence: readonly ApprovalEvidenceReference[];
  readonly risk?: string | undefined;
}

export type ApprovalSubjectResult = Readonly<
  ApprovalSubjectInput & { readonly schemaVersion: 'approval-subject/v1' }
>;

export type ApprovalSubjectResources = Readonly<Record<string, never>>;
