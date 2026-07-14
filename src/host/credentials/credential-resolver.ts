import type { ScriptCredentialBinding } from '../bindings/script-credential-binding.js';
import type { ResolvedCredential } from './resolved-credential.js';

export interface CredentialResolver {
  resolve(binding: ScriptCredentialBinding, signal: AbortSignal): Promise<ResolvedCredential>;
}
