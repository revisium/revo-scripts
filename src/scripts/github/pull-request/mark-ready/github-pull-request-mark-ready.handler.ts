import type { ScriptContext, ScriptHandler } from '../../../../runtime/spec/definition/index.js';
import { toGitHubPullRequest } from '../../shared/to-github-pull-request.js';
import type {
  GitHubPullRequestMarkReadyInput,
  GitHubPullRequestMarkReadyResources,
  GitHubPullRequestMarkReadyResult,
} from './schemas.js';

export class GitHubPullRequestMarkReadyHandler implements ScriptHandler<
  GitHubPullRequestMarkReadyInput,
  GitHubPullRequestMarkReadyResult,
  GitHubPullRequestMarkReadyResources
> {
  async execute(
    input: Readonly<GitHubPullRequestMarkReadyInput>,
    context: Readonly<ScriptContext<GitHubPullRequestMarkReadyResources>>,
  ): Promise<{ readonly value: GitHubPullRequestMarkReadyResult }> {
    const snapshot = await context.resources.repository.clients.github.markReady({
      number: input.pullRequest.number,
      expectedHeadSha: input.pullRequest.head.sha,
      expectedProviderRevision: input.pullRequest.providerRevision,
      signal: context.signal,
    });
    return {
      value: toGitHubPullRequest(
        input.pullRequest.repositoryId,
        input.pullRequest.owner,
        input.pullRequest.repository,
        snapshot,
      ),
    };
  }
}
