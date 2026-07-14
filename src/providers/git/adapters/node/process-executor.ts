export interface ProcessExecutionRequest {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly maxOutputBytes: number;
  readonly signal: AbortSignal;
}

export interface ProcessExecutionResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type ProcessExecutor = (request: ProcessExecutionRequest) => Promise<ProcessExecutionResult>;
