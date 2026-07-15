import type { RevoScripts, ScriptIdentityPin } from '../../../src/index.js';

export const summarizeConsumerDefinition = (scripts: RevoScripts, script: ScriptIdentityPin) => {
  const manifest = scripts
    .listManifests()
    .find((candidate) => candidate.id === script.id && candidate.version === script.version);

  if (manifest === undefined) {
    throw new Error(`Expected ${script.id}@${script.version} in the consumer catalog.`);
  }

  const descriptors = scripts.listProviderImplementations();
  return {
    script: `${manifest.id}@${manifest.version}`,
    permissions: manifest.permissions,
    resources: manifest.resources.map((resource) => `${resource.name}:${resource.access}`),
    effects: manifest.effects,
    providers: manifest.providers.map((requirement) => {
      const provider = descriptors.find((candidate) => candidate.contract === requirement.contract);

      if (provider === undefined) {
        throw new Error(
          `Expected provider contract ${requirement.contract} in the consumer catalog.`,
        );
      }

      return {
        name: requirement.name,
        resource: requirement.resource,
        id: provider.id,
        contract: provider.contract,
        implementationDigest: provider.implementationDigest,
        workspace: provider.workspace,
      };
    }),
  };
};
