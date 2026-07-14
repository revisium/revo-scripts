import { expect, test } from 'vitest';

import { validateScriptManifest } from '../../../src/runtime/validate-manifest.js';
import { ScriptFault } from '../../../src/spec/script-errors.js';

const validManifest = {
  schemaVersion: 'revo.script.manifest/v1',
  id: 'script:test/echo',
  version: '1.0.0',
  summary: 'Returns the provided message.',
  inputSchemaId: 'revo.script.test.echo.input/v1',
  resultSchemaId: 'revo.script.test.echo.result/v1',
  effectClass: 'pure',
  permissions: [],
  resources: [],
  effects: [],
  timeout: { wallClockMs: 1_000 },
  retry: { mode: 'never', maxAttempts: 1, backoffMs: [] },
  idempotency: 'read-only',
  redaction: {
    inputPaths: [],
    resultPaths: [],
    errorPaths: [],
    eventPaths: [],
  },
  events: {
    allowed: [],
    detailPaths: [],
  },
} as const;

const captureManifestFault = (value: unknown) => {
  try {
    validateScriptManifest(value);
  } catch (error: unknown) {
    if (error instanceof ScriptFault) {
      return {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
        details: error.details,
      };
    }

    throw error;
  }

  throw new Error('Expected manifest validation to fail');
};

test('accepts the closed v1 manifest shape', () => {
  expect(validateScriptManifest(validManifest)).toEqual(validManifest);
});

test('rejects unknown fields before policy validation', () => {
  const fault = captureManifestFault({ ...validManifest, nextNode: 'publish' });

  expect(fault).toEqual({
    code: 'revo.script.validation.manifest',
    message: 'Script manifest is invalid.',
    retryable: false,
    details: {
      issues: [{ path: '/nextNode', message: 'Unknown manifest field.' }],
    },
  });
});

test('rejects invalid identities and scalar bounds', () => {
  const fault = captureManifestFault({
    ...validManifest,
    id: 'script:Git/status',
    version: '^1.0.0',
    summary: 'x'.repeat(513),
    timeout: { wallClockMs: 300_001 },
  });

  expect(fault).toEqual({
    code: 'revo.script.validation.manifest',
    message: 'Script manifest is invalid.',
    retryable: false,
    details: {
      issues: [
        { path: '/id', message: 'Script id must use the script:<namespace>/<name> format.' },
        { path: '/version', message: 'Version must be an exact semantic version.' },
        { path: '/summary', message: 'Summary must contain at most 512 Unicode code points.' },
        {
          path: '/timeout/wallClockMs',
          message: 'Wall-clock timeout must be between 1 and 300000 milliseconds.',
        },
      ],
    },
  });
});

test('rejects duplicate resource and event identities plus invalid JSON pointers', () => {
  const fault = captureManifestFault({
    ...validManifest,
    effectClass: 'read',
    resources: [
      { name: 'repository', kind: 'repository', access: 'read' },
      { name: 'repository', kind: 'repository', access: 'read' },
    ],
    effects: ['git.read'],
    redaction: {
      ...validManifest.redaction,
      inputPaths: ['token', 'token'],
    },
    events: {
      allowed: ['git.status.observed', 'git.status.observed'],
      detailPaths: ['/counts', '/counts'],
    },
  });

  expect(fault).toEqual({
    code: 'revo.script.validation.manifest',
    message: 'Script manifest is invalid.',
    retryable: false,
    details: {
      issues: [
        { path: '/resources/1/name', message: 'Resource names must be unique.' },
        { path: '/events/allowed/1', message: 'Custom event names must be unique.' },
        { path: '/redaction/inputPaths/0', message: 'Path must be an RFC 6901 JSON Pointer.' },
        { path: '/redaction/inputPaths/1', message: 'Path must be an RFC 6901 JSON Pointer.' },
        { path: '/redaction/inputPaths/1', message: 'Redaction paths must be unique.' },
        { path: '/events/detailPaths/1', message: 'Event detail paths must be unique.' },
      ],
    },
  });
});

test('rejects resource and effect access above the declared effect class', () => {
  const fault = captureManifestFault({
    ...validManifest,
    effectClass: 'read',
    permissions: ['git.status.write'],
    resources: [{ name: 'repository', kind: 'repository', access: 'write' }],
    effects: ['git.write'],
    idempotency: 'required',
  });

  expect(fault).toEqual({
    code: 'revo.script.validation.manifest',
    message: 'Script manifest is invalid.',
    retryable: false,
    details: {
      issues: [
        {
          path: '/resources/0/access',
          message: 'Resource access exceeds the read effect class.',
        },
        { path: '/effects/0', message: 'Effect is not permitted by the read effect class.' },
      ],
    },
  });
});

test('rejects lifecycle namespace declarations before registration', () => {
  const fault = captureManifestFault({
    ...validManifest,
    events: { allowed: ['revo.script.succeeded'], detailPaths: [] },
  });

  expect(fault).toEqual({
    code: 'revo.script.validation.manifest',
    message: 'Script manifest is invalid.',
    retryable: false,
    details: {
      issues: [
        {
          path: '/events/allowed/0',
          message: 'Custom event name must not use the reserved revo.script namespace.',
        },
      ],
    },
  });
});
