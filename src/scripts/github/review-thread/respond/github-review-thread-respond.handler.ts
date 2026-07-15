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
    const operationKey = context.idempotencyKey;
    const selected = input.triage.items.map((item) => this.selection(input, item));
    const pullRequest = toProof(input);
    if (selected.length === 0) {
      return {
        value: {
          schemaVersion: 'github-review-threads-respond-result/v1',
          pullRequest,
          threads: [],
        },
      };
    }
    const receipts = await context.resources.repository.clients.github.respondBatch({
      pullRequestNumber: input.pullRequest.number,
      expectedHeadSha: input.pullRequest.head.sha,
      items: selected,
      operationKey,
      signal: context.signal,
    });
    if (receipts.length !== selected.length) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'GitHub returned an incomplete review-thread response batch.',
      );
    }
    const threads = receipts.map((receipt, index) => {
      const item = selected[index]!;
      if (
        receipt.threadId !== item.threadId ||
        receipt.disposition !== item.disposition ||
        receipt.replyId.length === 0 ||
        receipt.marker.length === 0 ||
        !/^sha256:[0-9a-f]{64}$/u.test(receipt.markerFingerprint)
      ) {
        throw new ScriptFault(
          'revo.script.provider.invalid_response',
          'GitHub returned an invalid review-thread response proof.',
        );
      }
      return receipt;
    });
    return {
      value: { schemaVersion: 'github-review-threads-respond-result/v1', pullRequest, threads },
    };
  }

  private selection(
    input: Readonly<GitHubReviewThreadRespondInput>,
    item: GitHubReviewThreadRespondInput['triage']['items'][number],
  ): Readonly<{ threadId: string; disposition: 'fix' | 'wontfix'; replyBody: string }> {
    if (item.decision === 'question') {
      const resolution = input.questionResolution?.resolution;
      if (resolution === undefined) {
        throw new ScriptFault(
          'revo.script.validation.input',
          'Question triage requires an active continuation resolution.',
        );
      }
      return {
        threadId: item.threadId,
        disposition: resolution.outcome,
        replyBody: `${resolution.outcome === 'fix' ? 'Addressed' : "Won't fix"}: ${resolution.note}`,
      };
    }
    return {
      threadId: item.threadId,
      disposition: item.decision,
      replyBody: (item.replyText ?? (item.decision === 'fix' ? 'Addressed.' : "Won't fix."))
        .replace(/\r\n?/gu, '\n')
        .trim(),
    };
  }
}

const toProof = (input: GitHubReviewThreadRespondInput) => ({
  owner: input.pullRequest.owner,
  repository: input.pullRequest.repository,
  number: input.pullRequest.number,
  headCommit: input.pullRequest.head.sha,
});
