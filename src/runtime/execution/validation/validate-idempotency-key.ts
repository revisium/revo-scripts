import { ScriptFault } from '../../spec/errors/index.js';
import type { ScriptManifestV1 } from '../../spec/manifest/index.js';
import { codePointLength } from '../../validation/code-point-length.js';

export const validateIdempotencyKey = (
  manifest: ScriptManifestV1,
  idempotencyKey: string | undefined,
): void => {
  if (manifest.idempotency === 'required' && idempotencyKey === undefined) {
    throw new ScriptFault(
      'revo.script.idempotency.key_required',
      'This script requires an idempotency key.',
    );
  }

  if (
    idempotencyKey !== undefined &&
    (codePointLength(idempotencyKey) === 0 || codePointLength(idempotencyKey) > 1_024)
  ) {
    throw new ScriptFault(
      'revo.script.validation.input',
      'Idempotency key must contain between 1 and 1024 Unicode code points.',
    );
  }
};
