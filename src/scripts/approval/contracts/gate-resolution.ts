export interface GateResolutionSubjectV1 {
  readonly outputNode: string;
  readonly outputOrdinal: number;
  readonly identity: Readonly<{ scheme: string; value: string }>;
  readonly revision: Readonly<{ scheme: string; value: string }>;
  readonly executionPlanHash: string;
}

export interface MergeOverrideAuditV1 {
  readonly kind: 'merge-override/v1';
  readonly threadIds: readonly string[];
  readonly actor: string;
  readonly reason: string;
  readonly risk: string;
  readonly verificationResponsibility: string;
  readonly headCommit: string;
  readonly fingerprint?: string | undefined;
}

interface GateDecisionV1 {
  readonly status: 'active';
  readonly decidedAt: string;
  readonly decidedBy: string;
}

export type MergeGateResolutionArtifactV1 = Readonly<{
  schemaVersion: 'gate-resolution/v1';
  inboxId: string;
  resolution:
    | Readonly<
        GateDecisionV1 & {
          mode: 'subject-approval';
          outcome: 'approved';
          subject: GateResolutionSubjectV1;
          note?: string | undefined;
          audit?: never;
        }
      >
    | Readonly<
        GateDecisionV1 & {
          mode: 'subject-approval';
          outcome: 'override_merge';
          subject: GateResolutionSubjectV1;
          note: string;
          audit: MergeOverrideAuditV1;
        }
      >;
}>;

export type QuestionGateResolutionArtifactV1 = Readonly<{
  schemaVersion: 'gate-resolution/v1';
  inboxId: string;
  resolution: Readonly<
    GateDecisionV1 & {
      mode: 'continuation';
      outcome: 'fix' | 'wontfix';
      note: string;
    }
  >;
}>;
