import { z } from 'zod';

import { ScriptFault } from '../../../../../runtime/spec/errors/index.js';
import type { GitHubPullRequestSnapshot } from '../../../contracts/github-pull-request-snapshot.js';

const responseSchema = z.looseObject({
  number: z.number().int().positive(),
  node_id: z.string().min(1),
  html_url: z.url(),
  head: z.looseObject({ ref: z.string().min(1), sha: z.string().regex(/^[0-9a-f]{40}$/) }),
  base: z.looseObject({ ref: z.string().min(1) }),
  state: z.enum(['open', 'closed']),
  draft: z.boolean(),
  merged: z.boolean().optional(),
  merged_at: z.string().nullable().optional(),
  merge_commit_sha: z
    .string()
    .regex(/^[0-9a-f]{40}$/)
    .nullable()
    .optional(),
});

export const parseGitHubPullRequest = (value: unknown): GitHubPullRequestSnapshot => {
  const parsed = responseSchema.safeParse(value);
  if (!parsed.success) {
    throw new ScriptFault(
      'revo.script.provider.invalid_response',
      'GitHub returned an invalid pull request.',
    );
  }
  const merged = parsed.data.merged === true || parsed.data.merged_at != null;
  return {
    number: parsed.data.number,
    nodeId: parsed.data.node_id,
    url: parsed.data.html_url,
    head: { branch: parsed.data.head.ref, sha: parsed.data.head.sha },
    base: { branch: parsed.data.base.ref },
    state: merged ? 'merged' : parsed.data.state,
    draft: parsed.data.draft,
    ...(parsed.data.merge_commit_sha == null
      ? {}
      : { mergeCommitSha: parsed.data.merge_commit_sha }),
  };
};
