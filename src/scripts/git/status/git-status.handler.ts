import type { GitStatusSnapshot } from '../../../providers/git/contracts/git-status-client.js';
import type { ScriptContext, ScriptHandler } from '../../../runtime/spec/definition/index.js';
import type { GitStatusInput, GitStatusResources, GitStatusResult } from './types.js';

const isClean = (status: GitStatusSnapshot): boolean =>
  status.stagedCount === 0 &&
  status.unstagedCount === 0 &&
  status.untrackedCount === 0 &&
  status.conflictedCount === 0;

export class GitStatusHandler implements ScriptHandler<
  GitStatusInput,
  GitStatusResult,
  GitStatusResources
> {
  async execute(
    _input: Readonly<GitStatusInput>,
    context: Readonly<ScriptContext<GitStatusResources>>,
  ): Promise<{ readonly value: GitStatusResult }> {
    const status = await context.resources.repository.clients.git.readStatus(context.signal);

    return {
      value: {
        ...status,
        clean: isClean(status),
      },
    };
  }
}
