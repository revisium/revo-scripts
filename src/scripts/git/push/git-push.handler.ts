import type { ScriptContext, ScriptHandler } from '../../../runtime/spec/definition/index.js';
import { ScriptFault } from '../../../runtime/spec/errors/index.js';
import type { GitPushInput, GitPushResources, GitPushResult } from './types.js';

export class GitPushHandler implements ScriptHandler<
  GitPushInput,
  GitPushResult,
  GitPushResources
> {
  async execute(
    input: Readonly<GitPushInput>,
    context: Readonly<ScriptContext<GitPushResources>>,
  ): Promise<{ readonly value: GitPushResult }> {
    if (context.idempotencyKey === undefined) {
      throw new ScriptFault(
        'revo.script.idempotency.key_required',
        'Script execution requires an idempotency key.',
      );
    }

    const request = {
      remoteIdentity: input.change.remoteIdentity,
      branch: input.change.branch,
      headCommit: input.change.headCommit,
      operationKey: context.idempotencyKey,
      signal: context.signal,
    };
    const published = await context.resources.repository.clients.git.push(
      input.expectedRemoteHead === undefined
        ? request
        : { ...request, expectedRemoteHead: input.expectedRemoteHead },
    );

    if (published.remoteHead !== input.change.headCommit) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'Git provider did not confirm the requested remote head.',
      );
    }

    return { value: input.change };
  }
}
