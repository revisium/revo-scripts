import type { ScriptResourceHandle } from '../../../src/runtime/spec/resources/index.js';

export const pullRequest = {
  schemaVersion: 'github-pull-request/v1' as const,
  repositoryId: 'repository-123',
  owner: 'revisium',
  repository: 'revo-scripts',
  number: 42,
  pullRequestId: 'PR_node_42',
  url: 'https://github.com/revisium/revo-scripts/pull/42',
  head: { branch: 'revo/task', sha: 'a'.repeat(40) },
  base: { branch: 'master' },
  providerRevision:
    'github-pr-metadata/v1:sha256:c34eb0e7ca5e5f3044aec08d85e80e1af8ae9d594dafd5c80820bb8a686e25cd',
  state: 'open' as const,
  draft: true,
};

export const githubResource = <T extends object>(
  github: T,
  access: 'read' | 'write' | 'publish' | 'admin' = 'write',
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
