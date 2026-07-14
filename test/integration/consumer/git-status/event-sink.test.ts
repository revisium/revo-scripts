import { expect, test } from 'vitest';

import { builtInScripts, createRevoScripts } from '../../../../src/index.js';
import { nodeGitProviders } from '../../../../src/providers/git/index.js';
import {
  createGitHost,
  createGitScriptRequest,
  gitTestHeadSha,
} from '../../../support/git/git-fixture.js';

test('returns a structured failure when the host rejects the terminal event', async () => {
  const { events, host } = createGitHost({
    onEvent: async (event) => {
      if (event.name === 'revo.script.succeeded') {
        throw new Error('event storage unavailable');
      }
    },
  });
  const scripts = createRevoScripts({
    definitions: [builtInScripts()],
    providers: nodeGitProviders({
      processExecutor: {
        execute: async () => ({
          exitCode: 0,
          stdout: [`# branch.oid ${gitTestHeadSha}`, '# branch.head master', ''].join('\0'),
          stderr: '',
        }),
      },
    }),
    host,
  });
  const plan = scripts.resolveForPlan({ id: 'script:git/status', version: '1.0.0' });

  const result = await scripts.execute(
    createGitScriptRequest(plan, { executionId: 'terminal-event-failure' }),
  );

  expect({ result, eventNames: events.map((event) => event.name) }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.execution.event_sink',
        message: 'Event sink rejected a script event.',
        retryable: false,
      },
      attempts: 1,
    },
    eventNames: ['revo.script.started', 'revo.script.succeeded'],
  });
});
