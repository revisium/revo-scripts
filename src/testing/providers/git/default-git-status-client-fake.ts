import type {
  GitStatusClient,
  GitStatusSnapshot,
} from '../../../providers/git/contracts/git-status-client.js';
import type { GitStatusClientFake } from './git-status-client-fake.js';

export class DefaultGitStatusClientFake implements GitStatusClientFake, GitStatusClient {
  readonly client: GitStatusClient = this;
  private calls = 0;
  private readonly snapshot: GitStatusSnapshot;

  constructor(snapshot: GitStatusSnapshot) {
    this.snapshot = structuredClone(snapshot);
  }

  async readStatus(signal: AbortSignal): Promise<GitStatusSnapshot> {
    if (signal.aborted) {
      throw signal.reason;
    }

    this.calls += 1;
    return structuredClone(this.snapshot);
  }

  callCount(): number {
    return this.calls;
  }
}
