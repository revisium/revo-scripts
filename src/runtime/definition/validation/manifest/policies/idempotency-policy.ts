import type { ScriptEffect, ScriptManifestV1 } from '../../../../spec/manifest/index.js';
import type { ManifestValidationIssue } from '../manifest-validation-issue.js';

const mutationEffects = new Set<ScriptEffect>([
  'filesystem.write',
  'git.write',
  'git.remote-write',
  'github.write',
]);

export const validateIdempotencyPolicy = (
  manifest: ScriptManifestV1,
): readonly ManifestValidationIssue[] => {
  const declaresMutation = manifest.effects.some((effect) => mutationEffects.has(effect));

  if (manifest.idempotency === 'read-only' && declaresMutation) {
    return [
      {
        path: '/idempotency',
        message: 'Read-only idempotency must not declare a mutation effect.',
      },
    ];
  }

  if (manifest.idempotency === 'required' && !declaresMutation) {
    return [
      { path: '/idempotency', message: 'Required idempotency must declare a mutation effect.' },
    ];
  }

  if (
    manifest.idempotency === 'not-retryable' &&
    (!declaresMutation || manifest.retry.maxAttempts !== 1)
  ) {
    return [
      {
        path: '/idempotency',
        message: 'Not-retryable idempotency requires a mutation effect and one attempt.',
      },
    ];
  }

  return [];
};
