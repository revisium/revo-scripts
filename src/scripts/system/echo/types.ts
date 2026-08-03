export interface EchoInput {
  readonly message: string;
}

export type EchoResult = Readonly<EchoInput>;
export type EchoResources = Readonly<Record<string, never>>;
