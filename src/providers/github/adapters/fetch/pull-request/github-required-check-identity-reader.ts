import { z } from 'zod';

import type { GitHubRepositoryCoordinates } from '../../../contracts/github-repository-coordinates.js';
import { GitHubApiClient } from '../github-api-client.js';

export interface GitHubRequiredCheckIdentity {
  readonly complete: 'complete' | 'unavailable' | 'truncated';
  readonly names: readonly string[];
}

const requiredStatusCheckSchema = z.looseObject({
  context: z.string().min(1).max(256),
});
const requiredStatusChecksRuleSchema = z.looseObject({
  type: z.literal('required_status_checks'),
  parameters: z
    .looseObject({ required_status_checks: z.array(requiredStatusCheckSchema).max(100) })
    .nullable()
    .optional(),
});
const ruleSchema = z.looseObject({ type: z.string(), parameters: z.unknown().optional() });
const responseSchema = z.array(ruleSchema).max(100);

/** Reads the rules GitHub evaluates for the exact base branch under the bound credential. */
export class GitHubRequiredCheckIdentityReader {
  private readonly api: GitHubApiClient;
  private readonly coordinates: GitHubRepositoryCoordinates;

  constructor(api: GitHubApiClient, coordinates: GitHubRepositoryCoordinates) {
    this.api = api;
    this.coordinates = coordinates;
  }

  async read(baseBranch: string, signal: AbortSignal): Promise<GitHubRequiredCheckIdentity> {
    const page = await this.api.restPage(
      `/repos/${this.coordinates.owner}/${this.coordinates.repository}/rules/branches/${encodeURIComponent(baseBranch)}?per_page=100`,
      { signal },
    );
    if (page.hasNextPage) {
      return { complete: 'truncated', names: [] };
    }
    const response = responseSchema.safeParse(page.value);
    if (!response.success) {
      return { complete: 'unavailable', names: [] };
    }
    const names: string[] = [];
    for (const rule of response.data) {
      if (rule.type !== 'required_status_checks') {
        continue;
      }
      const requiredRule = requiredStatusChecksRuleSchema.safeParse(rule);
      if (
        !requiredRule.success ||
        requiredRule.data.parameters === null ||
        requiredRule.data.parameters === undefined
      ) {
        return { complete: 'unavailable', names: [] };
      }
      names.push(
        ...requiredRule.data.parameters.required_status_checks.map((check) => check.context),
      );
    }
    return {
      complete: 'complete',
      names: [...new Set(names)].sort((left, right) => left.localeCompare(right)),
    };
  }
}
