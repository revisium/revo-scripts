export type ScriptEffect =
  | 'filesystem.read'
  | 'filesystem.write'
  | 'git.read'
  | 'git.write'
  | 'git.remote-write'
  | 'github.read'
  | 'github.write';
