import type { ScriptManifestV1 } from '../../../../spec/manifest/index.js';
import type { ManifestValidationIssue } from '../manifest-validation-issue.js';

export const validateRetryPolicy = (
  manifest: ScriptManifestV1,
): readonly ManifestValidationIssue[] => {
  if (
    manifest.retry.mode === 'never' &&
    (manifest.retry.maxAttempts !== 1 || manifest.retry.backoffMs.length !== 0)
  ) {
    return [{ path: '/retry', message: 'Retry mode never requires one attempt and no backoff.' }];
  }

  if (
    manifest.retry.mode === 'transient' &&
    manifest.retry.backoffMs.length !== manifest.retry.maxAttempts - 1
  ) {
    return [
      {
        path: '/retry/backoffMs',
        message: 'Transient retry requires one backoff for every retry attempt.',
      },
    ];
  }

  return [];
};
