import { expect, test } from 'vitest';

import { createCredentialConsumerFixture } from '../../support/consumer/credential-consumer-fixture.js';

test('resolves credentials and executes through bounded provider clients', async () => {
  const { observations, request, scripts } = createCredentialConsumerFixture();

  const result = await scripts.execute(request);

  expect({
    result,
    credentialBindings: observations.credentialBindings,
    providerCredentials: observations.providerRequests.map((providerRequest) =>
      Object.keys(providerRequest.credentials),
    ),
    credentialDisposals: observations.credentialDisposals,
    providerDisposals: observations.providerDisposals,
    eventNames: observations.events.map((event) => event.name),
    leakedSecret: JSON.stringify({ result, events: observations.events }).includes(
      'fixture-secret-that-must-not-escape',
    ),
  }).toEqual({
    result: {
      ok: true,
      value: { alias: 'revo-github' },
      evidence: [],
      attempts: 1,
    },
    credentialBindings: [{ alias: 'revo-github', provider: 'github' }],
    providerCredentials: [['token']],
    credentialDisposals: 1,
    providerDisposals: 1,
    eventNames: ['revo.script.started', 'revo.script.succeeded'],
    leakedSecret: false,
  });
});

test('rejects credential bindings that do not exactly match the manifest', async () => {
  const missing = createCredentialConsumerFixture();
  const extra = createCredentialConsumerFixture();
  const wrongProvider = createCredentialConsumerFixture();

  const results = await Promise.all([
    missing.scripts.execute({
      ...missing.request,
      bindings: { ...missing.request.bindings, credentials: {} },
    }),
    extra.scripts.execute({
      ...extra.request,
      bindings: {
        ...extra.request.bindings,
        credentials: {
          ...extra.request.bindings.credentials,
          unexpected: { alias: 'unexpected', provider: 'github' },
        },
      },
    }),
    wrongProvider.scripts.execute({
      ...wrongProvider.request,
      bindings: {
        ...wrongProvider.request.bindings,
        credentials: { token: { alias: 'revo-github', provider: 'gitlab' } },
      },
    }),
  ]);

  expect({
    results,
    credentialResolutions: [missing, extra, wrongProvider].map(
      ({ observations }) => observations.credentialBindings.length,
    ),
    providerCreations: [missing, extra, wrongProvider].map(
      ({ observations }) => observations.providerRequests.length,
    ),
  }).toEqual({
    results: [
      {
        ok: false,
        error: {
          code: 'revo.script.permission.credential',
          message: 'Credential bindings do not match the script manifest.',
          retryable: false,
        },
        attempts: 0,
      },
      {
        ok: false,
        error: {
          code: 'revo.script.permission.credential',
          message: 'Credential bindings do not match the script manifest.',
          retryable: false,
        },
        attempts: 0,
      },
      {
        ok: false,
        error: {
          code: 'revo.script.permission.credential',
          message: 'Credential binding token does not match the manifest.',
          retryable: false,
        },
        attempts: 0,
      },
    ],
    credentialResolutions: [0, 0, 0],
    providerCreations: [0, 0, 0],
  });
});

test('disposes a credential when cancellation wins after resolution', async () => {
  const controller = new AbortController();
  const { observations, request, scripts } = createCredentialConsumerFixture({
    abortAfterResolution: controller,
  });

  const result = await scripts.execute(request);

  expect({
    result,
    credentialResolutions: observations.credentialBindings.length,
    credentialDisposals: observations.credentialDisposals,
    providerCreations: observations.providerRequests.length,
  }).toEqual({
    result: {
      ok: false,
      error: {
        code: 'revo.script.execution.aborted',
        message: 'Script execution was aborted.',
        retryable: false,
      },
      attempts: 0,
    },
    credentialResolutions: 1,
    credentialDisposals: 1,
    providerCreations: 0,
  });
});
