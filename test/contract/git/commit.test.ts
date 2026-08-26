import { expect, test } from 'vitest';

import type { GitCommitClient, GitCommitRequest } from '../../../src/providers/git/index.js';
import { gitCommitScript } from '../../../src/scripts/git/index.js';
import { createGitScriptContractHarness } from '../../support/git/git-fixture.js';

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
  const harness = createGitScriptContractHarness(gitCommitScript, {
    executionId: 'git-commit-contract',
    resources: {
      repository: {
        name: 'repository',
        kind: 'repository',
        access: 'write',
        grant: {
          permissions: ['git.commit.write'],
          operations: ['git.read', 'git.write'],
        },
        clients: { git: client },
      },
    },
  });

  const execution = await harness.runAttempt({
    resource: 'repository',
    remoteIdentity: 'github.com/revisium/revo-scripts',
    branch: 'revo/task-run',
    expectedParent: parent,
    expectedTree: tree,
    title: 'add bounded scripts',
    issueAction: 'none',
    author,
  });

  expect({ result: execution.result, requests }).toMatchObject({
    result: {
      kind: 'succeeded',
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
    },
    requests: [
      {
        remoteIdentity: 'github.com/revisium/revo-scripts',
        branch: 'revo/task-run',
        expectedParent: parent,
        expectedTree: tree,
        message: 'feat: add bounded scripts',
        operationKey: 'git-commit-contract',
        signal: expect.any(AbortSignal) as unknown,
        author,
      },
    ],
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
    const harness = createGitScriptContractHarness(gitCommitScript, {
      executionId: 'git-commit-issue-tag',
      resources: {
        repository: {
          name: 'repository',
          kind: 'repository',
          access: 'write',
          grant: { permissions: ['git.commit.write'], operations: ['git.read', 'git.write'] },
          clients: {
            git: {
              commit: async (request: GitCommitRequest) => {
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

    const result = await harness.runAttempt({
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
      result: result.result.kind,
      messages: requests.map((request) => request.message),
    }).toEqual({
      result: 'succeeded',
      messages: [expectedMessage],
    });
  },
);

test('rejects an issue reference when canonical issue action is none before Git', async () => {
  let calls = 0;
  const harness = createGitScriptContractHarness(gitCommitScript, {
    executionId: 'git-commit-no-issue',
    resources: {
      repository: {
        name: 'repository',
        kind: 'repository',
        access: 'write',
        grant: { permissions: ['git.commit.write'], operations: ['git.read', 'git.write'] },
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

  const result = await harness.runAttempt({
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

  expect({ result: result.result.kind, calls }).toEqual({ result: 'failed', calls: 0 });
});
