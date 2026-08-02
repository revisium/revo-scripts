import { expect, test } from 'vitest';

import { pureScriptManifestPolicy } from '../../../src/scripts/shared/pure-script-manifest-policy.js';

const expectedPolicy = {
  effectClass: 'pure',
  permissions: [],
  resources: [],
  providers: [],
  credentials: [],
  effects: [],
  timeout: { wallClockMs: 1_000 },
  retry: { mode: 'never', maxAttempts: 1, backoffMs: [] },
  idempotency: 'read-only',
  redaction: { inputPaths: [], resultPaths: [], errorPaths: [], eventPaths: [] },
  events: { allowed: [], detailPaths: [] },
};

test('creates the exact pure no-capability manifest policy', () => {
  expect(pureScriptManifestPolicy()).toEqual(expectedPolicy);
});

test('isolates mutable transport collections between manifests', () => {
  const first = pureScriptManifestPolicy();
  const second = pureScriptManifestPolicy();

  expect(first).not.toBe(second);
  expect(first.permissions).not.toBe(second.permissions);
  expect(first.retry).not.toBe(second.retry);
  expect(first.retry.backoffMs).not.toBe(second.retry.backoffMs);
  expect(first.redaction).not.toBe(second.redaction);
  expect(first.events).not.toBe(second.events);
  expect(first).toEqual(second);
});
