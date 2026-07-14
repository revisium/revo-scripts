export interface ScriptClock {
  now(): number;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
}
