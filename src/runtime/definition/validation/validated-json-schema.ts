import type { ManifestValidationIssue } from './manifest/manifest-validation-issue.js';

export interface ValidatedJsonSchema {
  readonly jsonSchema: Readonly<Record<string, unknown>>;
  readonly issues: readonly ManifestValidationIssue[];
}
