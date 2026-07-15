import type { ScriptContext, ScriptHandler } from '../../../runtime/spec/definition/index.js';
import { ScriptFault } from '../../../runtime/spec/errors/index.js';
import type { GitCommitInput, GitCommitResources, GitCommitResult } from './types.js';

export class GitCommitHandler implements ScriptHandler<
  GitCommitInput,
  GitCommitResult,
  GitCommitResources
> {
  async execute(
    input: Readonly<GitCommitInput>,
    context: Readonly<ScriptContext<GitCommitResources>>,
  ): Promise<{ readonly value: GitCommitResult }> {
    if (context.idempotencyKey === undefined) {
      throw new ScriptFault(
        'revo.script.idempotency.key_required',
        'Script execution requires an idempotency key.',
      );
    }

    const snapshot = await context.resources.repository.clients.git.commit({
      remoteIdentity: input.remoteIdentity,
      branch: input.branch,
      expectedParent: input.expectedParent,
      expectedTree: input.expectedTree,
      message: input.message,
      authorship: input.authorship,
      operationKey: context.idempotencyKey,
      signal: context.signal,
    });

    return {
      value: {
        schemaVersion: 'git-change/v1',
        repositoryId: input.repositoryId,
        ...snapshot,
      },
    };
  }
}
