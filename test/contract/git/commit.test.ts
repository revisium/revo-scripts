import { expect, test } from 'vitest';

import type { GitCommitClient } from '../../../src/providers/git/index.js';
import { gitCommitScript } from '../../../src/scripts/git/index.js';
import { createScriptContractHarness } from '../../../src/testing/index.js';

const parent = '0123456789abcdef0123456789abcdef01234567';
const tree = '89abcdef0123456789abcdef0123456789abcdef';
const head = 'fedcba9876543210fedcba9876543210fedcba98';
const author = {
  name: 'Revisium Bot',
  email: 'bot@revisium.io',
  timestamp: '2026-07-15T09:00:00.000Z',
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
    resource: 'repository',
    remoteIdentity: 'github.com/revisium/revo-scripts',
    branch: 'revo/task-run',
    expectedParent: parent,
    expectedTree: tree,
    title: 'add bounded scripts',
    issueAction: 'none',
    author,
  });

  expect({ result: execution.result, requests }).toEqual({
    result: {
      ok: true,
      value: {
        schemaVersion: 'git-change/v1',
        repositoryId: 'repository',
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
        operationKey: 'run:commit:1',
        signal: expect.any(AbortSignal) as unknown,
        author,
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
    resource: 'repository',
    remoteIdentity: 'github.com/revisium/revo-scripts',
    branch: 'revo/task-run',
    expectedParent: parent,
    expectedTree: tree,
    title: 'add bounded scripts',
    issueAction: 'none',
    author,
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

test.each([
  {
    name: 'same-repository close',
    remoteIdentity: 'github.com/revisium/revo-scripts',
    issueAction: 'close' as const,
    issueRef: {
      owner: 'revisium',
      repository: 'revo-scripts',
      number: 351,
      url: 'https://github.com/revisium/revo-scripts/issues/351',
    },
    expectedMessage: 'feat: #351 add bounded scripts',
  },
  {
    name: 'same-repository refs with CRLF title',
    remoteIdentity: 'https://github.com/revisium/revo-scripts.git',
    issueAction: 'refs' as const,
    issueRef: {
      owner: 'revisium',
      repository: 'revo-scripts',
      number: 352,
      url: 'https://github.com/revisium/revo-scripts/issues/352',
    },
    expectedMessage: 'feat: #352 add\nbounded scripts',
  },
  {
    name: 'cross-repository close with matching owner',
    remoteIdentity: 'github.com/revisium/revo-scripts',
    issueAction: 'close' as const,
    issueRef: {
      owner: 'revisium',
      repository: 'orchestrator',
      number: 353,
      url: 'https://github.com/revisium/orchestrator/issues/353',
    },
    expectedMessage: 'feat: revisium/orchestrator#353 add bounded scripts',
  },
])(
  'renders the canonical issue tag for $name',
  async ({ remoteIdentity, issueAction, issueRef, expectedMessage }) => {
    const requests: Array<{ readonly message: string }> = [];
    const harness = createScriptContractHarness(gitCommitScript, {
      executionId: 'git-commit-issue-tag',
      idempotencyKey: 'run:commit:issue-tag',
      resources: {
        repository: {
          name: 'repository',
          kind: 'repository',
          access: 'write',
          grant: { permissions: ['git.commit.write'], effects: ['git.read', 'git.write'] },
          clients: {
            git: {
              commit: async (request) => {
                requests.push(request);
                return {
                  remoteIdentity: request.remoteIdentity,
                  branch: request.branch,
                  baseCommit: request.expectedParent,
                  headCommit: head,
                  commits: [head],
                };
              },
            },
          },
        },
      },
    });

    const result = await harness.execute({
      resource: 'repository',
      remoteIdentity,
      branch: 'revo/task-run',
      expectedParent: parent,
      expectedTree: tree,
      title: issueAction === 'refs' ? 'add\r\nbounded scripts' : 'add bounded scripts',
      issueRef,
      issueAction,
      author,
    });

    expect({
      result: result.result.ok,
      messages: requests.map((request) => request.message),
    }).toEqual({
      result: true,
      messages: [expectedMessage],
    });
  },
);

test('rejects an issue reference when canonical issue action is none before Git', async () => {
  let calls = 0;
  const harness = createScriptContractHarness(gitCommitScript, {
    executionId: 'git-commit-no-issue',
    idempotencyKey: 'run:commit:no-issue',
    resources: {
      repository: {
        name: 'repository',
        kind: 'repository',
        access: 'write',
        grant: { permissions: ['git.commit.write'], effects: ['git.read', 'git.write'] },
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
    resource: 'repository',
    remoteIdentity: 'github.com/revisium/revo-scripts',
    branch: 'revo/task-run',
    expectedParent: parent,
    expectedTree: tree,
    title: 'add bounded scripts',
    issueRef: {
      owner: 'revisium',
      repository: 'revo-scripts',
      number: 351,
      url: 'https://github.com/revisium/revo-scripts/issues/351',
    },
    issueAction: 'none',
    author,
  });

  expect({ result: result.result.ok, calls }).toEqual({ result: false, calls: 0 });
});
