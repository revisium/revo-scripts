import { expect, test } from 'vitest';

import { gitStatusScript } from '../../../src/scripts/git/index.js';
import {
  createGitStatusClientFake,
  createScriptContractHarness,
} from '../../../src/testing/index.js';

const createGitStatusHarness = (
  snapshot: Parameters<typeof createGitStatusClientFake>[0],
  executionId: string,
) => {
  const fake = createGitStatusClientFake(snapshot);
  const harness = createScriptContractHarness(gitStatusScript, {
    executionId,
    nowMs: 1_000,
    resources: {
      repository: {
        name: 'repository',
        kind: 'repository',
        access: 'read',
        grant: { permissions: ['git.status.read'], effects: ['filesystem.read', 'git.read'] },
        clients: { git: fake.client },
      },
    },
  });

  return { fake, harness };
};

test('returns one bounded read-only repository status through the public contract harness', async () => {
  const { fake, harness } = createGitStatusHarness(
    {
      baseCapture: 'git-commit:0123456789abcdef0123456789abcdef01234567',
      headCapture: 'git-tree:89abcdef0123456789abcdef0123456789abcdef',
      changedPaths: [
        { path: 'README.md', status: 'modified' },
        { path: 'src/new-file.ts', status: 'untracked' },
      ],
      clean: false,
    },
    'git-status-contract',
  );

  const execution = await harness.execute({
    resource: 'repository',
    baseCapture: 'git-commit:0123456789abcdef0123456789abcdef01234567',
    headCapture: 'git-tree:89abcdef0123456789abcdef0123456789abcdef',
  });

  expect({ execution, capabilityCalls: fake.callCount() }).toEqual({
    execution: {
      result: {
        ok: true,
        value: {
          schemaVersion: 'workspace-change/v1',
          baseCapture: 'git-commit:0123456789abcdef0123456789abcdef01234567',
          headCapture: 'git-tree:89abcdef0123456789abcdef0123456789abcdef',
          changedPaths: [
            { path: 'README.md', status: 'modified' },
            { path: 'src/new-file.ts', status: 'untracked' },
          ],
          clean: false,
        },
        evidence: [],
        attempts: 1,
      },
      events: [
        {
          name: 'revo.script.started',
          details: {
            executionId: 'git-status-contract',
            scriptId: 'script:git/status',
            scriptVersion: '1.0.0',
            definitionDigest: gitStatusScript.definitionDigest,
            attempt: 1,
            timestampMs: 1_000,
          },
        },
        {
          name: 'revo.script.succeeded',
          details: {
            executionId: 'git-status-contract',
            scriptId: 'script:git/status',
            scriptVersion: '1.0.0',
            definitionDigest: gitStatusScript.definitionDigest,
            attempt: 1,
            timestampMs: 1_000,
            durationMs: 0,
          },
        },
      ],
      sleeps: [],
    },
    capabilityCalls: 1,
  });
});

test('rejects unknown input fields before invoking the Git capability', async () => {
  const { fake, harness } = createGitStatusHarness(
    {
      baseCapture: 'git-commit:0123456789abcdef0123456789abcdef01234567',
      headCapture: 'git-tree:89abcdef0123456789abcdef0123456789abcdef',
      changedPaths: [],
      clean: true,
    },
    'git-status-invalid-input',
  );

  const execution = await harness.execute({
    resource: 'repository',
    baseCapture: 'git-commit:0123456789abcdef0123456789abcdef01234567',
    headCapture: 'git-tree:89abcdef0123456789abcdef0123456789abcdef',
    unexpected: true,
  });

  expect({ result: execution.result, capabilityCalls: fake.callCount() }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.validation.input',
        message: 'Script input is invalid.',
        retryable: false,
        details: {
          issues: [
            {
              message: 'Unrecognized key: "unexpected"',
              path: [],
            },
          ],
        },
      },
      attempts: 0,
    },
    capabilityCalls: 0,
  });
});
