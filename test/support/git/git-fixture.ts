import type { RevoScriptsHost } from '../../../src/host/revo-scripts-host.js';
import type {
  CredentialResolver,
  RevoScripts,
  ScriptAttemptResult,
  ScriptBindingInput,
  ScriptDefinition,
  ScriptEvent,
  ScriptIdentityPin,
  ScriptOperation,
  WorkspaceResolver,
} from '../../../src/index.js';
import { createRevoScripts, gitScripts } from '../../../src/index.js';
import {
  nodeGitProviders,
  type NodeGitProvidersOptions,
} from '../../../src/providers/git/index.js';
import type { ScriptClock } from '../../../src/runtime/spec/index.js';
import type { JsonValue } from '../../../src/runtime/spec/json/json-value.js';
import type {
  ScriptResourceHandle,
  ScriptResourceMap,
} from '../../../src/runtime/spec/resources/index.js';

export const gitTestHeadSha = '0123456789abcdef0123456789abcdef01234567';

export interface GitScriptRequestOptions {
  readonly executionId: string;
  readonly attemptId?: string;
  readonly input?: JsonValue;
  readonly permissions?: readonly string[];
  readonly operations?: readonly ScriptOperation[];
  readonly providerCoordinates?: Readonly<Record<string, JsonValue>>;
  readonly repositoryId?: string;
  readonly workspaceId?: string;
  readonly access?: 'read' | 'write' | 'publish';
}

export const createGitScriptBinding = (
  script: ScriptIdentityPin,
  options: GitScriptRequestOptions,
): ScriptBindingInput => ({
  script,
  resources: {
    repository: {
      resourceRef: 'resource:repository',
      workspaceRef: options.workspaceId ?? 'workspace-456',
    },
  },
  credentials: {},
});

export const createGitScriptAttempt = (
  script: ScriptIdentityPin,
  binding: Awaited<ReturnType<RevoScripts['prepareBinding']>>,
  options: GitScriptRequestOptions,
) =>
  ({
    executionId: options.executionId,
    attemptId: options.attemptId ?? `${options.executionId}:attempt-1`,
    attemptOrdinal: 1,
    script,
    binding,
    input: options.input ?? {
      resource: 'repository',
      baseCapture: `git-commit:${gitTestHeadSha}`,
      headCapture: `git-tree:${gitTestHeadSha}`,
    },
  }) as const;

export const executeGitScriptAttempt = async (
  scripts: RevoScripts,
  script: ScriptIdentityPin,
  options: GitScriptRequestOptions,
): Promise<ScriptAttemptResult> => {
  const signal = new AbortController().signal;
  const binding = await scripts.prepareBinding(createGitScriptBinding(script, options), { signal });
  return await scripts.executeAttempt(createGitScriptAttempt(script, binding, options), {
    signal,
    events: { emit: async () => undefined },
  });
};

export const requireNodeGitProviderRegistration = (options: NodeGitProvidersOptions) => {
  const registration = nodeGitProviders(options)[0];

  if (registration === undefined) {
    throw new Error('Expected the retained Git provider revision.');
  }

  return registration;
};

export interface GitHostOptions {
  readonly inspectWorkspace?: WorkspaceResolver['inspect'];
  readonly acquireWorkspace?: WorkspaceResolver['acquire'];
  readonly inspectCredential?: CredentialResolver['inspect'];
  readonly acquireCredential?: CredentialResolver['acquire'];
  readonly clock?: ScriptClock;
  readonly resource?: Readonly<{
    readonly resourceId: string;
    readonly repositoryId: string;
    readonly providerCoordinates: Readonly<Record<string, JsonValue>>;
    readonly grant: Readonly<{
      readonly permissions: readonly string[];
      readonly operations: readonly ScriptOperation[];
    }>;
  }>;
}

export interface GitHostFixture {
  readonly host: RevoScriptsHost;
  readonly calls: Readonly<{
    readonly resourceInspections: number;
    readonly workspaceInspections: number;
    readonly workspaceAcquisitions: number;
  }>;
}

export const createGitHost = (options: GitHostOptions = {}): GitHostFixture => {
  let resourceInspections = 0;
  let workspaceInspections = 0;
  let workspaceAcquisitions = 0;
  const repositoryId = options.resource?.repositoryId ?? 'repository-123';
  const host: RevoScriptsHost = {
    resources: {
      inspect: async (resourceRef) => {
        resourceInspections += 1;
        if (resourceRef !== 'resource:repository') {
          return undefined;
        }
        return {
          resourceId: options.resource?.resourceId ?? 'target',
          kind: 'repository',
          repositoryId,
          providerCoordinates: options.resource?.providerCoordinates ?? {},
          grant: options.resource?.grant ?? {
            permissions: ['git.status.read'],
            operations: ['filesystem.read', 'git.read'],
          },
        };
      },
    },
    workspaces: {
      inspect: async (reference, context) => {
        workspaceInspections += 1;
        return await (options.inspectWorkspace ?? defaultWorkspaceInspection)(reference, context);
      },
      acquire: async (reference, context) => {
        workspaceAcquisitions += 1;
        return await (options.acquireWorkspace ?? defaultWorkspaceAcquisition)(reference, context);
      },
    },
    credentials: {
      inspect:
        options.inspectCredential ??
        (async () => {
          throw new Error('Git scripts must not inspect credentials.');
        }),
      acquire:
        options.acquireCredential ??
        (async () => {
          throw new Error('Git scripts must not acquire credentials.');
        }),
    },
    ...(options.clock === undefined ? {} : { clock: options.clock }),
  };

  return {
    host,
    calls: {
      get resourceInspections() {
        return resourceInspections;
      },
      get workspaceInspections() {
        return workspaceInspections;
      },
      get workspaceAcquisitions() {
        return workspaceAcquisitions;
      },
    },
  };
};

const defaultWorkspaceInspection: WorkspaceResolver['inspect'] = async (workspaceRef) => ({
  workspaceId: workspaceRef,
  repositoryId: 'repository-123',
});

const defaultWorkspaceAcquisition: WorkspaceResolver['acquire'] = async (workspaceRef) => ({
  workspaceId: workspaceRef,
  repositoryId: 'repository-123',
  absolutePath: '/tmp/revo-worktree',
});

export interface GitScriptContractHarness {
  runAttempt(
    input: JsonValue,
  ): Promise<Readonly<{ result: ScriptAttemptResult; events: readonly ScriptEvent[] }>>;
}

export const createGitScriptContractHarness = <I, O, R extends ScriptResourceMap>(
  definition: ScriptDefinition<I, O, R>,
  options: Readonly<{
    readonly executionId: string;
    readonly resources: Readonly<{
      readonly repository: ScriptResourceHandle<Readonly<{ git: object }>>;
    }>;
  }>,
): GitScriptContractHarness => {
  const resource = options.resources.repository;
  const scripts = createRevoScripts({
    definitions: [gitScripts()],
    providers: [
      {
        module: {
          id: 'provider:git/contract-fake',
          contract: 'revo.provider.git/v1',
          implementationDigest:
            'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          provenance: { packageName: '@revisium/revo-scripts', packageVersion: '0.0.0' },
          operations: ['filesystem.read', 'git.read', 'git.write', 'git.remote-write'],
          workspace: 'required',
          createResourceClients: async () => ({
            clients: { git: resource.clients.git },
            dispose: async () => undefined,
          }),
        },
      },
    ],
    host: createGitHost({
      resource: {
        resourceId: 'target',
        repositoryId: 'repository-123',
        providerCoordinates: {},
        grant: resource.grant,
      },
    }).host,
  });

  return {
    runAttempt: async (input: JsonValue) => {
      const script = { id: definition.manifest.id, version: definition.manifest.version } as const;
      const signal = new AbortController().signal;
      const binding = await scripts.prepareBinding(
        createGitScriptBinding(script, { executionId: options.executionId }),
        { signal },
      );
      const emissions: ScriptEvent[] = [];
      const result = await scripts.executeAttempt(
        createGitScriptAttempt(script, binding, { executionId: options.executionId, input }),
        {
          signal,
          events: {
            emit: async (emission) => {
              emissions.push(emission.event);
            },
          },
        },
      );
      return { result, events: emissions };
    },
  };
};
