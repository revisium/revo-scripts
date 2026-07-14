import type { CredentialResolver } from '../../../host/credentials/credential-resolver.js';
import type { ResolvedCredential } from '../../../host/credentials/resolved-credential.js';
import { ScriptFault } from '../../../runtime/spec/errors/index.js';
import type {
  ScriptManifestV1,
  ScriptProviderRequirement,
} from '../../../runtime/spec/manifest/index.js';
import type { RevoScriptExecutionRequest } from '../../contracts/revo-script-execution-request.js';
import { throwIfAborted } from '../../execution/execution-abort.js';

/* eslint-disable no-await-in-loop -- Owner: revo-scripts maintainers; credential leases must be acquired in deterministic cleanup order; remove when the lifecycle contract permits parallel resolution. */

export const resolveProviderCredentials = async (
  resolver: CredentialResolver,
  manifest: ScriptManifestV1,
  providerRequirement: ScriptProviderRequirement,
  request: RevoScriptExecutionRequest,
  signal: AbortSignal,
  resolvedCredentials: ResolvedCredential[],
): Promise<Readonly<Record<string, ResolvedCredential>>> => {
  const credentials: Record<string, ResolvedCredential> = {};
  const requirements = manifest.credentials.filter(
    (requirement) => requirement.providerRequirement === providerRequirement.name,
  );
  for (const requirement of requirements) {
    const binding = request.bindings.credentials[requirement.name];

    if (binding?.provider !== requirement.provider) {
      throw new ScriptFault(
        'revo.script.permission.credential',
        `Credential binding ${requirement.name} does not match the manifest.`,
      );
    }

    const credential = await resolver.resolve(binding, signal);
    credentials[requirement.name] = credential;
    resolvedCredentials.push(credential);
    throwIfAborted(signal);
  }

  return credentials;
};
