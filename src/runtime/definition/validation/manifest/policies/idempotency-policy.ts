import type { ScriptOperation, ScriptManifestV1 } from '../../../../spec/manifest/index.js';
import type { ManifestValidationIssue } from '../manifest-validation-issue.js';

const mutationOperations = new Set<ScriptOperation>([
  'filesystem.write',
  'git.write',
  'git.remote-write',
  'github.write',
]);

export const validateIdempotencyPolicy = (
  manifest: ScriptManifestV1,
): readonly ManifestValidationIssue[] => {
  const declaresMutation = manifest.operations.some((operation) =>
    mutationOperations.has(operation),
  );

  if (manifest.idempotency === 'read-only' && declaresMutation) {
    return [
      {
        path: '/idempotency',
        message: 'Read-only idempotency must not declare a mutation operation.',
      },
    ];
  }

  if (manifest.idempotency === 'required' && !declaresMutation) {
    return [
      { path: '/idempotency', message: 'Required idempotency must declare a mutation operation.' },
    ];
  }

  if (
    manifest.idempotency === 'not-retryable' &&
    (!declaresMutation || manifest.retry.maxAttempts !== 1)
  ) {
    return [
      {
        path: '/idempotency',
        message: 'Not-retryable idempotency requires a mutation operation and one attempt.',
      },
    ];
  }

  return [];
};
