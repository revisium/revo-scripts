import type { ScriptContext, ScriptHandler } from '../../../../runtime/spec/definition/index.js';
import { ScriptFault } from '../../../../runtime/spec/errors/index.js';
import { toGitHubPullRequest } from '../../shared/to-github-pull-request.js';
import type {
  GitHubPullRequestMergeInput,
  GitHubPullRequestMergeResources,
  GitHubPullRequestMergeResult,
} from './types.js';

export class GitHubPullRequestMergeHandler implements ScriptHandler<
  GitHubPullRequestMergeInput,
  GitHubPullRequestMergeResult,
  GitHubPullRequestMergeResources
> {
  async execute(
    input: Readonly<GitHubPullRequestMergeInput>,
    context: Readonly<ScriptContext<GitHubPullRequestMergeResources>>,
  ): Promise<{ readonly value: GitHubPullRequestMergeResult }> {
    if (context.idempotencyKey === undefined) {
      throw new ScriptFault(
        'revo.script.idempotency.key_required',
        'Script execution requires an idempotency key.',
      );
    }
    const snapshot = await context.resources.repository.clients.github.merge({
      number: input.pullRequest.number,
      expectedHeadSha: input.pullRequest.head.sha,
      method: input.method,
      operationKey: context.idempotencyKey,
      signal: context.signal,
    });
    if (snapshot.state !== 'merged' || snapshot.mergeCommitSha === undefined) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'GitHub did not confirm a merged pull request.',
      );
    }
    return { value: toGitHubPullRequest(input.pullRequest.repositoryId, snapshot) };
  }
}
