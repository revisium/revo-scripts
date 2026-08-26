import { expect, test } from 'vitest';

import { gitStatusScript } from '../../../src/scripts/git/index.js';
import { createGitStatusClientFake } from '../../../src/testing/index.js';
import { createGitScriptContractHarness } from '../../support/git/git-fixture.js';

const createGitStatusHarness = (
  snapshot: Parameters<typeof createGitStatusClientFake>[0],
  executionId: string,
) => {
  const fake = createGitStatusClientFake(snapshot);
  const harness = createGitScriptContractHarness(gitStatusScript, {
    executionId,
    resources: {
      repository: {
        name: 'repository',
        kind: 'repository',
        access: 'read',
        grant: { permissions: ['git.status.read'], operations: ['filesystem.read', 'git.read'] },
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

  const execution = await harness.runAttempt({
    resource: 'repository',
    baseCapture: 'git-commit:0123456789abcdef0123456789abcdef01234567',
    headCapture: 'git-tree:89abcdef0123456789abcdef0123456789abcdef',
  });

  expect({ result: execution.result, capabilityCalls: fake.callCount() }).toMatchObject({
    result: {
      kind: 'succeeded',
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
    },
    capabilityCalls: 1,
  });
  expect(execution.events).toHaveLength(1);
  const [started] = execution.events;
  const startedDetails = lifecycleDetails(started, 'revo.script.started');
  expect(startedDetails).toMatchObject({
    script: { id: 'script:git/status', version: 1 },
    definitionDigest: gitStatusScript.definitionDigest,
    attemptOrdinal: 1,
  });
  expect(typeof startedDetails.timestampMs).toBe('number');
  if (execution.result.kind !== 'succeeded') {
    throw new Error('Expected a succeeded script attempt.');
  }
  const succeededDetails = lifecycleDetails(
    execution.result.terminalEvent.event,
    'revo.script.succeeded',
  );
  expect(succeededDetails).toMatchObject({ evidenceCount: 0 });
  expect(typeof succeededDetails.timestampMs).toBe('number');
});

const lifecycleDetails = (
  event:
    | Awaited<
        ReturnType<ReturnType<typeof createGitStatusHarness>['harness']['runAttempt']>
      >['events'][number]
    | undefined,
  name: 'revo.script.started' | 'revo.script.succeeded',
) => {
  if (event?.name !== name) {
    throw new Error(`Expected lifecycle event ${name}.`);
  }
  if (event.details === undefined) {
    throw new Error(`Lifecycle event ${name} must include details.`);
  }
  return event.details;
};

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

  await expect(
    harness.runAttempt({
      resource: 'repository',
      baseCapture: 'git-commit:0123456789abcdef0123456789abcdef01234567',
      headCapture: 'git-tree:89abcdef0123456789abcdef0123456789abcdef',
      unexpected: true,
    }),
  ).resolves.toMatchObject({
    result: { kind: 'failed', error: { code: 'revo.script.validation.input' } },
  });
  expect(fake.callCount()).toEqual(0);
});
