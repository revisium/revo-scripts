export interface GitHubRepositoryCoordinates extends Readonly<Record<string, unknown>> {
  readonly owner: string;
  readonly repository: string;
}
