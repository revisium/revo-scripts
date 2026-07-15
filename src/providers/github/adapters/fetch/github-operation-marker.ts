import { createHash } from 'node:crypto';

const managedPullRequestMarker = '<!-- revo-managed-pr:v1 -->';

export interface GitHubManagedPullRequestIdentity {
  readonly operationKey: string;
  readonly headSha: string;
  readonly title: string;
  readonly baseBranch: string;
  readonly draft: boolean;
}

const digest = (value: string): string =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`;

const contentDigest = (identity: GitHubManagedPullRequestIdentity, businessBody: string): string =>
  digest(
    JSON.stringify({
      baseBranch: identity.baseBranch,
      businessBody: businessBody.replace(/\r\n?/gu, '\n').trimEnd(),
      draft: identity.draft,
      headSha: identity.headSha,
      title: identity.title,
    }),
  );

export const githubOperationMarker = (
  identity: GitHubManagedPullRequestIdentity,
  businessBody: string,
): string =>
  `<!-- revo-operation:v1 key=${digest(identity.operationKey)} head=${identity.headSha} content=${contentDigest(identity, businessBody)} -->`;

export const githubManagedPullRequestMarker = (): string => managedPullRequestMarker;

export const githubManagedPullRequestBody = (
  businessBody: string,
  identity: GitHubManagedPullRequestIdentity,
): string =>
  `${businessBody.replace(/\r\n?/gu, '\n').trimEnd()}\n\n${managedPullRequestMarker}\n${githubOperationMarker(identity, businessBody)}`;

export const githubManagedPullRequestOperation = (
  body: string,
): Readonly<{ businessBody: string; operationMarker: string }> | undefined => {
  const normalized = body.replace(/\r\n?/gu, '\n').trimEnd();
  const match =
    /^(?<business>[\s\S]*?)\n\n<!-- revo-managed-pr:v1 -->\n(?<operation><!-- revo-operation:v1 key=sha256:[0-9a-f]{64} head=[0-9a-f]{40,64} content=sha256:[0-9a-f]{64} -->)$/u.exec(
      normalized,
    );
  if (match?.groups?.business === undefined || match.groups.operation === undefined) {
    return undefined;
  }
  return { businessBody: match.groups.business, operationMarker: match.groups.operation };
};
