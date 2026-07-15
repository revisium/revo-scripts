import { expect, test } from 'vitest';

import { approvalSubjectScript } from '../../../src/scripts/approval/index.js';
import { createScriptContractHarness } from '../../../src/testing/index.js';

test('builds a provider-neutral approval subject without host provenance', async () => {
  const harness = createScriptContractHarness(approvalSubjectScript, {
    executionId: 'approval-subject-contract',
    resources: {},
  });

  const execution = await harness.execute({
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
  });

  expect(execution.result).toEqual({
    ok: true,
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
    attempts: 1,
  });
});
