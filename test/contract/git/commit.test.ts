import { expect, test } from 'vitest';

import type { GitCommitClient } from '../../../src/providers/git/index.js';
import { gitCommitScript } from '../../../src/scripts/git/index.js';
import { createScriptContractHarness } from '../../../src/testing/index.js';

const parent = '0123456789abcdef0123456789abcdef01234567';
const tree = '89abcdef0123456789abcdef0123456789abcdef';
const head = 'fedcba9876543210fedcba9876543210fedcba98';
const authorship = {
  name: 'Revo Scripts',
  email: 'revo-scripts@example.test',
  timestamp: '2026-07-14T00:00:00Z',
} as const;

test('commits the exact approved tree and returns a provenance-free Git change', async () => {
  const requests: unknown[] = [];
  const client: GitCommitClient = {
    commit: async (request) => {
      requests.push(request);
      return {
        remoteIdentity: 'github.com/revisium/revo-scripts',
        branch: 'revo/task-run',
        baseCommit: parent,
        headCommit: head,
        commits: [head],
      };
    },
  };
  const harness = createScriptContractHarness(gitCommitScript, {
    executionId: 'git-commit-contract',
    idempotencyKey: 'run:commit:1',
    resources: {
      repository: {
        name: 'repository',
        kind: 'repository',
        access: 'write',
        grant: {
          permissions: ['git.commit.write'],
          effects: ['git.read', 'git.write'],
        },
        clients: { git: client },
      },
    },
  });

  const execution = await harness.execute({
    repositoryId: 'repository-123',
    remoteIdentity: 'github.com/revisium/revo-scripts',
    branch: 'revo/task-run',
    expectedParent: parent,
    expectedTree: tree,
    message: 'feat: add bounded scripts',
    authorship,
  });

  expect({ result: execution.result, requests }).toEqual({
    result: {
      ok: true,
      value: {
        schemaVersion: 'git-change/v1',
        repositoryId: 'repository-123',
        remoteIdentity: 'github.com/revisium/revo-scripts',
        branch: 'revo/task-run',
        baseCommit: parent,
        headCommit: head,
        commits: [head],
      },
      evidence: [],
      attempts: 1,
    },
    requests: [
      {
        remoteIdentity: 'github.com/revisium/revo-scripts',
        branch: 'revo/task-run',
        expectedParent: parent,
        expectedTree: tree,
        message: 'feat: add bounded scripts',
        authorship,
        operationKey: 'run:commit:1',
        signal: expect.any(AbortSignal) as unknown,
      },
    ],
  });
});

test('requires a host-derived idempotency key before invoking Git', async () => {
  let calls = 0;
  const harness = createScriptContractHarness(gitCommitScript, {
    executionId: 'git-commit-no-key',
    resources: {
      repository: {
        name: 'repository',
        kind: 'repository',
        access: 'write',
        grant: {
          permissions: ['git.commit.write'],
          effects: ['git.read', 'git.write'],
        },
        clients: {
          git: {
            commit: async () => {
              calls += 1;
              throw new Error('must not run');
            },
          },
        },
      },
    },
  });

  const result = await harness.execute({
    repositoryId: 'repository-123',
    remoteIdentity: 'github.com/revisium/revo-scripts',
    branch: 'revo/task-run',
    expectedParent: parent,
    expectedTree: tree,
    message: 'feat: add bounded scripts',
    authorship,
  });

  expect({ result: result.result, calls }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.idempotency.key_required',
        message: 'This script requires an idempotency key.',
        retryable: false,
      },
      attempts: 0,
    },
    calls: 0,
  });
});
