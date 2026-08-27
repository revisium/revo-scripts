import { expect, test } from 'vitest';

import type { RevoScriptsHost } from '../../../src/host/revo-scripts-host.js';
import { approvalScripts, createRevoScripts } from '../../../src/index.js';

const host: RevoScriptsHost = {
  resources: { inspect: async () => undefined },
  workspaces: {
    inspect: async () => undefined,
    acquire: async () => {
      throw new Error('Approval subject does not acquire workspaces.');
    },
  },
  credentials: {
    inspect: async () => undefined,
    acquire: async () => {
      throw new Error('Approval subject does not acquire credentials.');
    },
  },
};

test('builds a provider-neutral approval subject without host provenance', async () => {
  const scripts = createRevoScripts({ definitions: [approvalScripts()], providers: [], host });
  const signal = new AbortController().signal;
  const script = { id: 'script:approval/subject', version: 1 } as const;
  const binding = await scripts.prepareBinding(
    { script, resources: {}, credentials: {} },
    { signal },
  );
  const result = await scripts.executeAttempt(
    {
      executionId: 'approval-subject-contract',
      attemptId: 'approval-subject-contract:attempt-1',
      attemptOrdinal: 1,
      script,
      binding,
      input: {
        kind: 'publication',
        identity: { scheme: 'uri', value: 'github://revisium/revo-scripts/pull/10' },
        revision: {
          scheme: 'git-commit',
          value: '0123456789abcdef0123456789abcdef01234567',
        },
        title: 'Publish bounded scripts',
        summary: 'The exact pull-request head is ready for approval.',
        evidence: [
          {
            identity: { scheme: 'script-result', value: 'github-readiness/v1:repository-123#42' },
            title: 'GitHub readiness',
          },
        ],
        risk: 'GitHub mutation follows approval.',
      },
    },
    { signal, events: { emit: async () => undefined } },
  );

  expect(result).toMatchObject({
    kind: 'succeeded',
    value: {
      schemaVersion: 'approval-subject/v1',
      kind: 'publication',
      identity: { scheme: 'uri', value: 'github://revisium/revo-scripts/pull/10' },
      revision: {
        scheme: 'git-commit',
        value: '0123456789abcdef0123456789abcdef01234567',
      },
      title: 'Publish bounded scripts',
      summary: 'The exact pull-request head is ready for approval.',
      evidence: [
        {
          identity: { scheme: 'script-result', value: 'github-readiness/v1:repository-123#42' },
          title: 'GitHub readiness',
        },
      ],
      risk: 'GitHub mutation follows approval.',
    },
    evidence: [],
  });
});
