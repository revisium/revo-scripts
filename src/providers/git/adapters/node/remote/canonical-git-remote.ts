import { ScriptFault } from '../../../../../runtime/spec/errors/index.js';

const scpLikeRemote = /^(?:[^@]+@)?([^:]+):(.+)$/;
const canonicalRemote = /^([^/]+)\/(.+)$/;

const trimBoundarySlashes = (value: string): string => {
  let start = 0;
  let end = value.length;
  while (value[start] === '/') {
    start += 1;
  }
  while (end > start && value[end - 1] === '/') {
    end -= 1;
  }
  return value.slice(start, end);
};

export const canonicalGitRemote = (value: string): string => {
  const trimmed = value.trim();
  let hostAndPath: string;

  try {
    const url = new URL(trimmed);
    hostAndPath = `${url.hostname}${url.pathname}`;
  } catch {
    const match = scpLikeRemote.exec(trimmed);
    const canonical = canonicalRemote.exec(trimmed);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      hostAndPath = `${match[1]}/${match[2]}`;
    } else if (canonical?.[1] !== undefined && canonical[2] !== undefined) {
      hostAndPath = `${canonical[1]}/${canonical[2]}`;
    } else {
      throw new ScriptFault(
        'revo.script.provider.invalid_response',
        'Git returned an unsupported remote URL.',
      );
    }
  }

  return trimBoundarySlashes(hostAndPath)
    .replace(/\.git$/u, '')
    .toLowerCase();
};
