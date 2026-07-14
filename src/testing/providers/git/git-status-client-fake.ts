import type { GitStatusClient } from '../../../providers/git/contracts/git-status-client.js';

export interface GitStatusClientFake {
  readonly client: GitStatusClient;
  callCount(): number;
}
