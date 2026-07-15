import { createHash } from 'node:crypto';

import { z } from 'zod';

import { ScriptFault } from '../../../../../runtime/spec/errors/index.js';
import type { GitHubPullRequestSnapshot } from '../../../contracts/github-pull-request-snapshot.js';
import { githubManagedPullRequestOperation } from '../github-operation-marker.js';

const responseSchema = z.looseObject({
  number: z.number().int().positive(),
  node_id: z.string().min(1),
  html_url: z.url(),
  head: z.looseObject({ ref: z.string().min(1), sha: z.string().regex(/^[0-9a-f]{40}$/) }),
  base: z.looseObject({ ref: z.string().min(1) }),
  title: z.string(),
  body: z.string().nullable().optional(),
  state: z.enum(['open', 'closed']),
  draft: z.boolean(),
  mergeable: z.enum(['mergeable', 'conflicting', 'unknown']).nullable().optional(),
  mergeable_state: z.string().nullable().optional(),
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
  const title = parsed.data.title;
  const body = parsed.data.body ?? '';
  const businessBody = githubManagedPullRequestOperation(body)?.businessBody ?? body;
  const revision = createHash('sha256')
    .update(
      JSON.stringify({
        baseRef: parsed.data.base.ref,
        headRef: parsed.data.head.ref,
        title,
        body: businessBody,
      }),
    )
    .digest('hex');
  return {
    number: parsed.data.number,
    nodeId: parsed.data.node_id,
    url: parsed.data.html_url,
    head: { branch: parsed.data.head.ref, sha: parsed.data.head.sha },
    base: { branch: parsed.data.base.ref },
    title,
    body,
    providerRevision: `github-pr-metadata/v1:sha256:${revision}`,
    state: merged ? 'merged' : parsed.data.state,
    draft: parsed.data.draft,
    mergeable: parsed.data.mergeable ?? 'unknown',
    mergeState: parsed.data.mergeable_state ?? 'UNKNOWN',
    ...(parsed.data.merge_commit_sha == null
      ? {}
      : { mergeCommitSha: parsed.data.merge_commit_sha }),
  };
};
