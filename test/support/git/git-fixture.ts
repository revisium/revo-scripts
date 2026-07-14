import type {
  CredentialResolver,
  RevoScriptsHost,
  WorkspaceResolver,
} from '../../../src/host/index.js';
import type { RevoScriptExecutionRequest, ScriptPlanDescriptor } from '../../../src/index.js';
import {
  nodeGitProviders,
  type NodeGitProvidersOptions,
} from '../../../src/providers/git/index.js';
import type {
  EventSink,
  ScriptClock,
  ScriptEffect,
  ScriptEvent,
} from '../../../src/runtime/spec/index.js';

export const gitTestHeadSha = '0123456789abcdef0123456789abcdef01234567';

export interface GitScriptRequestOptions {
  readonly executionId: string;
  readonly input?: unknown;
  readonly permissions?: readonly string[];
  readonly effects?: readonly ScriptEffect[];
  readonly providerCoordinates?: Readonly<Record<string, unknown>>;
  readonly repositoryId?: string;
  readonly workspaceId?: string;
  readonly providers?: RevoScriptExecutionRequest['providers'];
  readonly signal?: AbortSignal;
  readonly access?: 'read' | 'write' | 'publish';
  readonly idempotencyKey?: string;
}

export const createGitScriptRequest = (
  plan: ScriptPlanDescriptor,
  options: GitScriptRequestOptions,
): RevoScriptExecutionRequest => ({
  executionId: options.executionId,
  script: plan.script,
  providers: options.providers ?? plan.providers,
  input: options.input ?? {},
  bindings: {
    resources: {
      repository: {
        resourceId: 'target',
        kind: 'repository',
        repositoryId: options.repositoryId ?? 'repository-123',
        workspaceId: options.workspaceId ?? 'workspace-456',
        access: options.access ?? 'read',
        grant: {
          permissions: options.permissions ?? ['git.status.read'],
          effects: options.effects ?? ['git.read'],
        },
        providerCoordinates: options.providerCoordinates ?? {},
      },
    },
    credentials: {},
  },
  ...(options.signal === undefined ? {} : { signal: options.signal }),
  ...(options.idempotencyKey === undefined ? {} : { idempotencyKey: options.idempotencyKey }),
});

export const requireNodeGitProviderRegistration = (options: NodeGitProvidersOptions) => {
  const registration = nodeGitProviders(options)[0];

  if (registration === undefined) {
    throw new Error('Expected the retained Git provider revision.');
  }

  return registration;
};

export interface GitHostOptions {
  readonly resolveWorkspace?: WorkspaceResolver['resolve'];
  readonly resolveCredential?: CredentialResolver['resolve'];
  readonly clock?: ScriptClock;
  readonly onEvent?: EventSink['emit'];
}

export interface GitHostFixture {
  readonly host: RevoScriptsHost;
  readonly events: ScriptEvent[];
}

export const createGitHost = (options: GitHostOptions = {}): GitHostFixture => {
  const events: ScriptEvent[] = [];
  const host: RevoScriptsHost = {
    workspaces: {
      resolve:
        options.resolveWorkspace ??
        (async (workspaceId) => ({
          workspaceId,
          repositoryId: 'repository-123',
          absolutePath: '/tmp/revo-worktree',
        })),
    },
    credentials: {
      resolve:
        options.resolveCredential ??
        (async () => {
          throw new Error('Git scripts must not resolve credentials.');
        }),
    },
    events: {
      emit: async (event) => {
        events.push(event);
        await options.onEvent?.(event);
      },
    },
    ...(options.clock === undefined ? {} : { clock: options.clock }),
  };

  return { host, events };
};
