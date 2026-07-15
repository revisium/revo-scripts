import type { ScriptContext, ScriptHandler } from '../../../../runtime/spec/definition/index.js';
import { ScriptFault } from '../../../../runtime/spec/errors/index.js';
import { toGitHubPullRequest } from '../../shared/to-github-pull-request.js';
import type {
  GitHubPullRequestMarkReadyInput,
  GitHubPullRequestMarkReadyResources,
  GitHubPullRequestMarkReadyResult,
} from './types.js';

export class GitHubPullRequestMarkReadyHandler implements ScriptHandler<
  GitHubPullRequestMarkReadyInput,
  GitHubPullRequestMarkReadyResult,
  GitHubPullRequestMarkReadyResources
> {
  async execute(
    input: Readonly<GitHubPullRequestMarkReadyInput>,
    context: Readonly<ScriptContext<GitHubPullRequestMarkReadyResources>>,
  ): Promise<{ readonly value: GitHubPullRequestMarkReadyResult }> {
    if (context.idempotencyKey === undefined) {
      throw new ScriptFault(
        'revo.script.idempotency.key_required',
        'Script execution requires an idempotency key.',
      );
    }
    const snapshot = await context.resources.repository.clients.github.markReady({
      number: input.pullRequest.number,
      expectedHeadSha: input.pullRequest.head.sha,
      operationKey: context.idempotencyKey,
      signal: context.signal,
    });
    return { value: toGitHubPullRequest(input.pullRequest.repositoryId, snapshot) };
  }
}
