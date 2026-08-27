import { expect, test } from 'vitest';

import type {
  ScriptCancelledTerminalEventEmission,
  ScriptSucceededTerminalEventEmission,
} from '../../../src/application/contracts/script-attempt.js';
import { AttemptState } from '../../../src/application/execution/attempt-state.js';
import { PartialAcquireFailure } from '../../../src/application/execution/partial-acquire-failure.js';
import { ScriptFault } from '../../../src/runtime/spec/errors/index.js';

test('never turns an untracked attempt into a false notFound after process uncertainty', () => {
  const state = new AttemptState();
  const ref = { executionId: 'run-unknown', attemptId: 'attempt-unknown' };

  expect(state.cancel(ref)).toEqual({ kind: 'unknown' });
  expect(state.reconcile(ref)).toEqual({ kind: 'unknown' });
});

test('returns the exact validated terminal result without overwriting it on cancel', () => {
  const state = new AttemptState();
  const ref = { executionId: 'run-terminal', attemptId: 'attempt-terminal' };
  state.begin(ref, new AbortController());
  const result = {
    kind: 'succeeded' as const,
    value: { ok: true },
    evidence: [],
    terminalEvent: succeededTerminalEvent,
  };
  state.finish(ref, result);

  expect(state.cancel(ref)).toEqual({ kind: 'alreadyTerminal', result });
  expect(state.reconcile(ref)).toEqual({ kind: 'terminal', result });
});

test('keeps an uncertain attempt observable and rejects duplicate physical identities', () => {
  const state = new AttemptState();
  const ref = { executionId: 'run-uncertain', attemptId: 'attempt-uncertain' };
  state.begin(ref, new AbortController());
  const uncertain = {
    kind: 'uncertain' as const,
    trigger: 'timeout' as const,
    stage: 'handler' as const,
    evidence: [],
  };
  state.markUncertain(ref, uncertain);

  expect(state.reconcile(ref)).toEqual({ kind: 'uncertain', result: uncertain });
  expect(state.cancel(ref)).toEqual({ kind: 'uncertain', result: uncertain });
  let duplicate: unknown;
  try {
    state.begin(ref, new AbortController());
  } catch (error: unknown) {
    duplicate = error;
  }
  expect(duplicate).toMatchObject({ code: 'revo.script.validation.attempt' });
});

test('bounds open attempt retention with a retryable capacity fault', () => {
  const state = new AttemptState();
  for (let index = 0; index < 1_024; index += 1) {
    state.begin(
      { executionId: `run-${index}`, attemptId: `attempt-${index}` },
      new AbortController(),
    );
  }

  let capacity: unknown;
  try {
    state.begin(
      { executionId: 'run-overflow', attemptId: 'attempt-overflow' },
      new AbortController(),
    );
  } catch (error: unknown) {
    capacity = error;
  }
  expect(capacity).toMatchObject({ code: 'revo.script.execution.capacity', retryable: true });
});

test('evicts the oldest terminal result after 1,024 retained results', () => {
  const state = new AttemptState();
  const result = {
    kind: 'cancelled' as const,
    evidence: [],
    terminalEvent: cancelledTerminalEvent,
  };
  for (let index = 0; index < 1_025; index += 1) {
    const ref = { executionId: `terminal-run-${index}`, attemptId: `terminal-attempt-${index}` };
    state.begin(ref, new AbortController());
    state.finish(ref, result);
  }

  expect(
    state.reconcile({ executionId: 'terminal-run-0', attemptId: 'terminal-attempt-0' }),
  ).toEqual({ kind: 'unknown' });
  expect(
    state.reconcile({ executionId: 'terminal-run-1024', attemptId: 'terminal-attempt-1024' }),
  ).toEqual({ kind: 'terminal', result });
});

test('retains both acquisition and cleanup evidence internally for precedence normalization', () => {
  const primary = new Error('acquire failed');
  const cleanup = new ScriptFault(
    'revo.script.execution.cleanup',
    'Provider resources could not be disposed safely.',
  );
  const failure = new PartialAcquireFailure(primary, cleanup);

  expect({ primary: failure.primary, cleanup: failure.cleanup, cause: failure.cause }).toEqual({
    primary,
    cleanup,
    cause: primary,
  });
});

const succeededTerminalEvent = {
  emissionOrdinal: 1,
  event: {
    name: 'revo.script.succeeded',
    details: {
      script: { id: 'script:test/reconciliation', version: 1 },
      definitionDigest: `sha256:${'0'.repeat(64)}`,
      attemptOrdinal: 1,
      timestampMs: 0,
      evidenceCount: 0,
    },
  },
} satisfies ScriptSucceededTerminalEventEmission;

const cancelledTerminalEvent = {
  emissionOrdinal: 1,
  event: {
    name: 'revo.script.cancelled',
    details: {
      script: { id: 'script:test/reconciliation', version: 1 },
      definitionDigest: `sha256:${'0'.repeat(64)}`,
      attemptOrdinal: 1,
      timestampMs: 0,
    },
  },
} satisfies ScriptCancelledTerminalEventEmission;
