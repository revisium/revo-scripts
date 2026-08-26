import type { ScriptManifestV1 } from '../../../spec/manifest/index.js';
import type { ManifestValidationIssue } from './manifest-validation-issue.js';
import { validateCollectionPolicy } from './policies/collection-policy.js';
import { validateIdempotencyPolicy } from './policies/idempotency-policy.js';
import { validateOperationPolicy } from './policies/operation-policy.js';
import { validatePathPolicy } from './policies/path-policy.js';
import { validateRetryPolicy } from './policies/retry-policy.js';

export const validateManifestPolicy = (
  manifest: ScriptManifestV1,
): readonly ManifestValidationIssue[] => [
  ...validateCollectionPolicy(manifest),
  ...validatePathPolicy(manifest),
  ...validateOperationPolicy(manifest),
  ...validateRetryPolicy(manifest),
  ...validateIdempotencyPolicy(manifest),
];
