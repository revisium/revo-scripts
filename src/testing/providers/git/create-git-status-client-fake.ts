import type { GitStatusSnapshot } from '../../../providers/git/contracts/git-status-client.js';
import { DefaultGitStatusClientFake } from './default-git-status-client-fake.js';
import type { GitStatusClientFake } from './git-status-client-fake.js';

export const createGitStatusClientFake = (snapshot: GitStatusSnapshot): GitStatusClientFake =>
  new DefaultGitStatusClientFake(snapshot);
