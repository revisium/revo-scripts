import type { ScriptContext, ScriptHandler } from '../../../../runtime/spec/definition/index.js';
import { ScriptFault } from '../../../../runtime/spec/errors/index.js';
import type {
  GitHubReviewThreadResolveInput,
  GitHubReviewThreadResolveResources,
  GitHubReviewThreadResolveResult,
} from './types.js';

export class GitHubReviewThreadResolveHandler implements ScriptHandler<
  GitHubReviewThreadResolveInput,
  GitHubReviewThreadResolveResult,
  GitHubReviewThreadResolveResources
> {
  async execute(
    input: Readonly<GitHubReviewThreadResolveInput>,
    context: Readonly<ScriptContext<GitHubReviewThreadResolveResources>>,
  ): Promise<{ readonly value: GitHubReviewThreadResolveResult }> {
    if (context.idempotencyKey === undefined) {
      throw new ScriptFault(
        'revo.script.idempotency.key_required',
        'Script execution requires an idempotency key.',
      );
    }
    const snapshot = await context.resources.repository.clients.github.resolve({
      pullRequestNumber: input.pullRequestNumber,
      expectedHeadSha: input.expectedHeadSha,
      threadId: input.threadId,
      operationKey: context.idempotencyKey,
      signal: context.signal,
    });
    return {
      value: {
        schemaVersion: 'github-review-thread/v1',
        repositoryId: input.repositoryId,
        pullRequestNumber: input.pullRequestNumber,
        headSha: input.expectedHeadSha,
        threadId: snapshot.threadId,
        resolved: snapshot.resolved,
      },
    };
  }
}
