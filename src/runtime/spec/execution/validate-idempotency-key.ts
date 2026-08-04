import { ScriptFault } from '../errors/script-fault.js';
import type { ScriptManifestV1 } from '../manifest/script-manifest.js';

export function validateIdempotencyKey(
  idempotency: 'required',
  idempotencyKey: string | undefined,
): string;
export function validateIdempotencyKey(
  idempotency: ScriptManifestV1['idempotency'],
  idempotencyKey: string | undefined,
): string | undefined;
export function validateIdempotencyKey(
  idempotency: ScriptManifestV1['idempotency'],
  idempotencyKey: string | undefined,
): string | undefined {
  if (idempotency === 'required' && idempotencyKey === undefined) {
    throw new ScriptFault(
      'revo.script.idempotency.key_required',
      'This script requires an idempotency key.',
    );
  }

  const idempotencyKeyLength =
    idempotencyKey === undefined ? undefined : Array.from(idempotencyKey).length;

  if (
    idempotencyKeyLength !== undefined &&
    (idempotencyKeyLength === 0 || idempotencyKeyLength > 1_024)
  ) {
    throw new ScriptFault(
      'revo.script.validation.input',
      'Idempotency key must contain between 1 and 1024 Unicode code points.',
    );
  }

  return idempotencyKey;
}
