import { expect, test } from 'vitest';
import { z } from 'zod';

import { createRevoScripts, gitScripts, createScriptSchema } from '../../../src/index.js';
import { nodeGitProviders } from '../../../src/providers/git/index.js';
import { createMultiProviderConsumerFixture } from '../../support/consumer/multi-provider-consumer-fixture.js';
import { createGitHost, createGitScriptRequest } from '../../support/git/git-fixture.js';

const coordinateSchema = createScriptSchema({
  id: 'revo.script.test.provider-coordinate/v1',
  schema: z.strictObject({ owner: z.string(), repository: z.string() }),
  jsonSchema: 'input',
});

test('rejects coordinates for a provider that does not declare a coordinate schema', async () => {
  let workspaceCalls = 0;
  const { host } = createGitHost({
    resolveWorkspace: async () => {
      workspaceCalls += 1;
      throw new Error('Unsupported coordinates must fail before workspace resolution.');
    },
  });
  const scripts = createRevoScripts({
    definitions: [gitScripts()],
    providers: nodeGitProviders({
      processExecutor: { execute: async () => ({ exitCode: 0, stdout: '', stderr: '' }) },
    }),
    host,
  });
  const plan = scripts.resolveForPlan({ id: 'script:git/status', version: '1.0.0' });

  const result = await scripts.execute(
    createGitScriptRequest(plan, {
      executionId: 'unsupported-provider-coordinates',
      providerCoordinates: { git: {} },
    }),
  );

  expect({ result, workspaceCalls }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.provider.coordinates_unsupported',
        message: 'Provider coordinates are not supported by the selected implementations.',
        retryable: false,
      },
      attempts: 0,
    },
    workspaceCalls: 0,
  });
});

test('validates provider-owned coordinates before constructing clients', async () => {
  const valid = createMultiProviderConsumerFixture({
    alphaClient: 'alpha',
    betaClient: 'beta',
    alphaCoordinateSchema: coordinateSchema,
    providerCoordinates: {
      alpha: { owner: 'revisium', repository: 'orchestrator' },
    },
  });
  const invalid = createMultiProviderConsumerFixture({
    alphaClient: 'alpha',
    betaClient: 'beta',
    alphaCoordinateSchema: coordinateSchema,
    providerCoordinates: {
      alpha: { owner: 'revisium', repository: 42 },
    },
  });

  const validResult = await valid.scripts.execute(valid.request);
  const invalidResult = await invalid.scripts.execute(invalid.request);

  expect({
    valid: { result: validResult, created: valid.created },
    invalid: { result: invalidResult, created: invalid.created },
  }).toEqual({
    valid: {
      result: { ok: true, value: { completed: true }, evidence: [], attempts: 1 },
      created: ['alpha', 'beta'],
    },
    invalid: {
      result: {
        ok: false,
        error: {
          code: 'revo.script.provider.coordinates_invalid',
          message: 'Provider coordinates for alpha are invalid.',
          retryable: false,
        },
        attempts: 0,
      },
      created: [],
    },
  });
});

test('requires the exact coordinate keys declared by selected provider modules', async () => {
  const fixture = createMultiProviderConsumerFixture({
    alphaClient: 'alpha',
    betaClient: 'beta',
    alphaCoordinateSchema: coordinateSchema,
    providerCoordinates: {},
  });

  const result = await fixture.scripts.execute(fixture.request);

  expect({ result, created: fixture.created }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.provider.coordinates_invalid',
        message:
          'Provider coordinate keys for resource repository do not match the selected implementations.',
        retryable: false,
      },
      attempts: 0,
    },
    created: [],
  });
});

test('bounds provider coordinates before constructing clients', async () => {
  const fixture = createMultiProviderConsumerFixture({
    alphaClient: 'alpha',
    betaClient: 'beta',
    alphaCoordinateSchema: coordinateSchema,
    providerCoordinates: {
      alpha: { owner: 'revisium', repository: 'x'.repeat(16_384) },
    },
  });

  const result = await fixture.scripts.execute(fixture.request);

  expect({ result, created: fixture.created }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.provider.coordinates_invalid',
        message: 'Provider coordinates exceed the supported collection or payload limits.',
        retryable: false,
      },
      attempts: 0,
    },
    created: [],
  });
});
