import { expectTypeOf, test } from 'vitest';

import type { GitCommitInput } from '../../src/scripts/git/index.js';
import type {
  GitHubPullRequestMergeInput,
  GitHubPullRequestMergeResult,
} from '../../src/scripts/github/index.js';

test('publishes schema-exact deeply readonly built-in data types', () => {
  expectTypeOf<GitCommitInput['author']>().toEqualTypeOf<
    Readonly<{ name: string; email: string; timestamp: string }>
  >();

  type ApprovalKind = GitHubPullRequestMergeInput['approvalSubject']['kind'];
  type ResultIssueAction = NonNullable<GitHubPullRequestMergeResult['issueRef']>['action'];

  // @ts-expect-error The merge input schema accepts only publication or operation subjects.
  const invalidApprovalKind: ApprovalKind = 'plan';
  // @ts-expect-error The merge result schema cannot emit the input-only none action.
  const invalidResultIssueAction: ResultIssueAction = 'none';
  void invalidApprovalKind;
  void invalidResultIssueAction;
});
