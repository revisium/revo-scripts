import { ScriptFault } from '../../../../runtime/spec/errors/index.js';

export interface GitHubApiClientOptions {
  readonly token: string;
  readonly fetch: typeof globalThis.fetch;
  readonly apiBaseUrl: string;
  readonly graphqlUrl: string;
  readonly userAgent: string;
}

export interface GitHubRestPage {
  readonly value: unknown;
  readonly hasNextPage: boolean;
}

export class GitHubApiClient {
  private readonly options: GitHubApiClientOptions;

  constructor(options: GitHubApiClientOptions) {
    this.options = options;
  }

  async rest(
    path: string,
    request: Readonly<{
      method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
      body?: Readonly<Record<string, unknown>>;
      allowEmptyResponse?: boolean;
      signal: AbortSignal;
    }>,
  ): Promise<unknown> {
    return (
      await this.request(`${this.options.apiBaseUrl}${path}`, {
        method: request.method ?? 'GET',
        ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
        ...(request.allowEmptyResponse === true ? { allowEmptyResponse: true } : {}),
        signal: request.signal,
      })
    ).value;
  }

  async restPage(
    path: string,
    request: Readonly<{
      signal: AbortSignal;
    }>,
  ): Promise<GitHubRestPage> {
    return await this.request(`${this.options.apiBaseUrl}${path}`, {
      method: 'GET',
      signal: request.signal,
    });
  }

  async graphql(
    query: string,
    variables: Readonly<Record<string, unknown>>,
    signal: AbortSignal,
  ): Promise<unknown> {
    const response = await this.request(this.options.graphqlUrl, {
      method: 'POST',
      body: JSON.stringify({ query, variables }),
      signal,
    });
    if (
      typeof response.value === 'object' &&
      response.value !== null &&
      'errors' in response.value &&
      Array.isArray(response.value.errors) &&
      response.value.errors.length > 0
    ) {
      throw new ScriptFault(
        'revo.script.provider.request_failed',
        'GitHub GraphQL returned an operation error.',
      );
    }
    return response.value;
  }

  private async request(
    url: string,
    request: Readonly<{
      method: string;
      body?: string;
      allowEmptyResponse?: boolean | undefined;
      signal: AbortSignal;
    }>,
  ): Promise<GitHubRestPage> {
    let response: Response;
    try {
      response = await this.options.fetch(url, {
        method: request.method,
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${this.options.token}`,
          'content-type': 'application/json',
          'user-agent': this.options.userAgent,
          'x-github-api-version': '2022-11-28',
        },
        ...(request.body === undefined ? {} : { body: request.body }),
        signal: request.signal,
      });
    } catch (cause: unknown) {
      throw new ScriptFault('revo.script.provider.transient', 'GitHub request failed.', {
        retryable: true,
        cause,
      });
    }

    const rateLimited =
      response.status === 429 ||
      (response.status === 403 &&
        (response.headers.has('retry-after') ||
          response.headers.get('x-ratelimit-remaining') === '0'));
    if (rateLimited) {
      throw new ScriptFault(
        'revo.script.provider.transient',
        'GitHub rate-limited the operation.',
        { retryable: true },
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new ScriptFault(
        'revo.script.permission.provider',
        'GitHub rejected the bound credential.',
      );
    }
    if (!response.ok) {
      throw new ScriptFault(
        response.status >= 500
          ? 'revo.script.provider.transient'
          : 'revo.script.provider.request_failed',
        'GitHub rejected the operation.',
        { retryable: response.status >= 500 },
      );
    }

    if (response.status === 204 && request.allowEmptyResponse === true) {
      return { value: {}, hasNextPage: false };
    }

    try {
      return {
        value: await response.json(),
        hasNextPage: /(?:^|,)\s*<[^>]+>;\s*rel="?next"?/u.test(response.headers.get('link') ?? ''),
      };
    } catch (cause: unknown) {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'GitHub returned an invalid JSON response.',
        { cause },
      );
    }
  }
}
