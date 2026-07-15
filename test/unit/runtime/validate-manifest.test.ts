import { expect, test } from 'vitest';

import { validateScriptManifest } from '../../../src/runtime/definition/validation/manifest/validate-manifest.js';
import { ScriptFault } from '../../../src/runtime/spec/errors/index.js';
import { echoManifest as validManifest } from '../../support/runtime/echo-definition-input.js';

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

test('validates a generic classification pointer without selecting a script id', () => {
  expect({
    accepted: validateScriptManifest({ ...validManifest, classification: '/classification' })
      .classification,
    rejected: captureManifestFault({ ...validManifest, classification: 'classification' }),
  }).toEqual({
    accepted: '/classification',
    rejected: {
      code: 'revo.script.validation.manifest',
      message: 'Script manifest is invalid.',
      retryable: false,
      details: {
        issues: [{ path: '/classification', message: 'Path must be an RFC 6901 JSON Pointer.' }],
      },
    },
  });
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

test('rejects duplicate and dangling provider or credential requirements', () => {
  const fault = captureManifestFault({
    ...validManifest,
    effectClass: 'read',
    permissions: ['git.status.read'],
    resources: [{ name: 'repository', kind: 'repository', access: 'read' }],
    providers: [
      { name: 'git', contract: 'revo.provider.git/v1', resource: 'repository' },
      { name: 'git', contract: 'revo.provider.git/v1', resource: 'missing' },
    ],
    credentials: [
      { name: 'account', provider: 'github', providerRequirement: 'git' },
      { name: 'account', provider: 'github', providerRequirement: 'missing' },
    ],
    effects: ['git.read'],
  });

  expect(fault).toEqual({
    code: 'revo.script.validation.manifest',
    message: 'Script manifest is invalid.',
    retryable: false,
    details: {
      issues: [
        { path: '/providers/1/name', message: 'Provider names must be unique.' },
        { path: '/credentials/1/name', message: 'Credential names must be unique.' },
        { path: '/providers/1/resource', message: 'Provider must reference a declared resource.' },
        {
          path: '/credentials/1/providerRequirement',
          message: 'Credential must reference a declared provider requirement.',
        },
      ],
    },
  });
});
