import { ScriptFault } from '../../runtime/spec/errors/index.js';

/**
 * Internal transport for preserving both the rejected acquisition and a
 * cleanup failure. It never crosses the public facade.
 */
export class PartialAcquireFailure extends Error {
  readonly primary: unknown;
  readonly cleanup: ScriptFault;

  constructor(primary: unknown, cleanup: ScriptFault) {
    super('Acquired attempt resources could not be cleaned up.', { cause: primary });
    this.primary = primary;
    this.cleanup = cleanup;
  }
}
