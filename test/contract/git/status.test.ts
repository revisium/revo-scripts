import { expect, test } from 'vitest';

import { gitStatusScript } from '../../../src/git/status.js';
import {
  createGitStatusCapabilityFake,
  createScriptContractHarness,
} from '../../../src/testing/contract-harness.js';

test('returns one bounded read-only repository status through the public contract harness', async () => {
  const fake = createGitStatusCapabilityFake({
    branch: 'feat/runtime-foundation',
    headSha: '0123456789abcdef0123456789abcdef01234567',
    detached: false,
    stagedCount: 2,
    unstagedCount: 3,
    untrackedCount: 1,
    conflictedCount: 0,
  });
  const harness = createScriptContractHarness(gitStatusScript, {
    executionId: 'git-status-contract',
    nowMs: 1_000,
    resources: {
      repository: {
        name: 'repository',
        kind: 'repository',
        access: 'read',
        grant: { permissions: ['git.status.read'], effects: ['git.read'] },
        capabilities: fake.capability,
      },
    },
  });

  const execution = await harness.execute({});

  expect({ execution, capabilityCalls: fake.callCount() }).toEqual({
    execution: {
      result: {
        ok: true,
        value: {
          branch: 'feat/runtime-foundation',
          headSha: '0123456789abcdef0123456789abcdef01234567',
          detached: false,
          clean: false,
          stagedCount: 2,
          unstagedCount: 3,
          untrackedCount: 1,
          conflictedCount: 0,
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
  const fake = createGitStatusCapabilityFake({
    branch: null,
    headSha: '0123456789abcdef0123456789abcdef01234567',
    detached: true,
    stagedCount: 0,
    unstagedCount: 0,
    untrackedCount: 0,
    conflictedCount: 0,
  });
  const harness = createScriptContractHarness(gitStatusScript, {
    executionId: 'git-status-invalid-input',
    nowMs: 1_000,
    resources: {
      repository: {
        name: 'repository',
        kind: 'repository',
        access: 'read',
        grant: { permissions: ['git.status.read'], effects: ['git.read'] },
        capabilities: fake.capability,
      },
    },
  });

  const execution = await harness.execute({ unexpected: true });

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
