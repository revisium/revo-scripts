import type { ScriptManifestV1 } from '../../../runtime/spec/manifest/index.js';

type GitHubPublishManifestPolicyV1 = Pick<
  ScriptManifestV1,
  | 'effectClass'
  | 'permissions'
  | 'resources'
  | 'providers'
  | 'credentials'
  | 'effects'
  | 'timeout'
  | 'retry'
  | 'idempotency'
  | 'redaction'
  | 'events'
>;

export const githubPublishManifestPolicyV1 = <
  const Permission extends string,
  const WallClockMs extends number,
  const MaxAttempts extends number,
  const BackoffMs extends readonly number[],
>(
  facts: Readonly<{
    permission: Permission;
    wallClockMs: WallClockMs;
    maxAttempts: MaxAttempts;
    backoffMs: BackoffMs;
  }>,
) =>
  ({
    effectClass: 'publish',
    permissions: [facts.permission],
    resources: [{ name: 'repository', kind: 'repository', access: 'publish' }],
    providers: [{ name: 'github', contract: 'revo.provider.github/v1', resource: 'repository' }],
    credentials: [{ name: 'token', provider: 'github', providerRequirement: 'github' }],
    effects: ['github.read', 'github.write'],
    timeout: { wallClockMs: facts.wallClockMs },
    retry: {
      mode: 'transient',
      maxAttempts: facts.maxAttempts,
      backoffMs: [...facts.backoffMs],
    },
    idempotency: 'required',
    redaction: { inputPaths: [], resultPaths: [], errorPaths: [], eventPaths: [] },
    events: { allowed: [], detailPaths: [] },
  }) as const satisfies GitHubPublishManifestPolicyV1;
