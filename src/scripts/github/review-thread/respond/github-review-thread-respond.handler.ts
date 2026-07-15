import type { ScriptContext, ScriptHandler } from '../../../../runtime/spec/definition/index.js';
import { ScriptFault } from '../../../../runtime/spec/errors/index.js';
import type {
  GitHubReviewThreadRespondInput,
  GitHubReviewThreadRespondResources,
  GitHubReviewThreadRespondResult,
} from './types.js';

export class GitHubReviewThreadRespondHandler implements ScriptHandler<
  GitHubReviewThreadRespondInput,
  GitHubReviewThreadRespondResult,
  GitHubReviewThreadRespondResources
> {
  async execute(
    input: Readonly<GitHubReviewThreadRespondInput>,
    context: Readonly<ScriptContext<GitHubReviewThreadRespondResources>>,
  ): Promise<{ readonly value: GitHubReviewThreadRespondResult }> {
    if (context.idempotencyKey === undefined) {
      throw new ScriptFault(
        'revo.script.idempotency.key_required',
        'Script execution requires an idempotency key.',
      );
    }
    const snapshot = await context.resources.repository.clients.github.respond({
      pullRequestNumber: input.pullRequestNumber,
      expectedHeadSha: input.expectedHeadSha,
      threadId: input.threadId,
      body: input.body,
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
        replyId: snapshot.replyId,
        resolved: snapshot.resolved,
      },
    };
  }
}
