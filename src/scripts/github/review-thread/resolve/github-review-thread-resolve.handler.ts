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
    const proof = input.responses.pullRequest;
    if (
      proof.owner !== input.pullRequest.owner ||
      proof.repository !== input.pullRequest.repository ||
      proof.number !== input.pullRequest.number ||
      proof.headCommit !== input.pullRequest.head.sha
    ) {
      throw new ScriptFault(
        'revo.script.idempotency.conflict',
        'Response proofs do not match the pinned pull request revision.',
      );
    }
    if (input.responses.threads.length === 0) {
      return {
        value: {
          schemaVersion: 'github-review-threads-resolve-result/v1',
          pullRequest: proof,
          threads: [],
        },
      };
    }
    const receipts = await context.resources.repository.clients.github.resolveBatch({
      pullRequestNumber: input.pullRequest.number,
      expectedHeadSha: input.pullRequest.head.sha,
      items: input.responses.threads.map((response) => ({
        threadId: response.threadId,
        replyId: response.replyId,
        marker: response.marker,
        markerFingerprint: response.markerFingerprint,
      })),
      signal: context.signal,
    });
    if (receipts.length !== input.responses.threads.length) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'GitHub returned an incomplete review-thread resolution batch.',
      );
    }
    const threads = receipts.map((receipt, index) => {
      const response = input.responses.threads[index]!;
      if (
        receipt.threadId !== response.threadId ||
        receipt.replyId !== response.replyId ||
        receipt.marker !== response.marker ||
        receipt.markerFingerprint !== response.markerFingerprint
      ) {
        throw new ScriptFault(
          'revo.script.provider.invalid_response',
          'GitHub returned an invalid review-thread resolution proof.',
        );
      }
      return receipt;
    });
    return {
      value: {
        schemaVersion: 'github-review-threads-resolve-result/v1',
        pullRequest: proof,
        threads,
      },
    };
  }
}
