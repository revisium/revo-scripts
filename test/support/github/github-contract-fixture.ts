import type { ScriptResourceHandle } from '../../../src/runtime/spec/resources/index.js';

export const pullRequest = {
  schemaVersion: 'github-pull-request/v1' as const,
  repositoryId: 'repository-123',
  number: 42,
  pullRequestId: 'PR_node_42',
  url: 'https://github.com/revisium/revo-scripts/pull/42',
  head: { branch: 'revo/task', sha: 'a'.repeat(40) },
  base: { branch: 'master' },
  state: 'open' as const,
  draft: true,
};

export const githubResource = <T extends object>(
  github: T,
  access: 'read' | 'write' | 'publish' = 'write',
): ScriptResourceHandle<Readonly<{ github: T }>> => ({
  name: 'repository',
  kind: 'repository',
  access,
  grant: {
    permissions: [
      'github.pull-request.upsert',
      'github.pull-request.mark-ready',
      'github.pull-request.readiness',
      'github.review-thread.respond',
      'github.review-thread.resolve',
      'github.pull-request.merge',
    ],
    effects: access === 'read' ? ['github.read'] : ['github.read', 'github.write'],
  },
  clients: { github },
});
