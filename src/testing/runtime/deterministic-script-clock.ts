import type { ScriptClock } from '../../runtime/spec/execution/index.js';

export class DeterministicScriptClock implements ScriptClock {
  private nowMs: number;
  private readonly sleeps: number[] = [];

  constructor(nowMs: number) {
    this.nowMs = nowMs;
  }

  now(): number {
    return this.nowMs;
  }

  async sleep(ms: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
      throw signal.reason;
    }

    this.sleeps.push(ms);
    this.nowMs += ms;
  }

  readSleeps(): readonly number[] {
    return [...this.sleeps];
  }
}
