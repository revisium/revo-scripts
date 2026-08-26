import { expectTypeOf, test } from 'vitest';

import type {
  DeepReadonly,
  EventSink,
  RevoScripts,
  ScriptCustomEvent,
  ScriptErrorCode,
  ScriptHandlerResult,
  ScriptImplementationIdentity,
  ScriptResourceMap,
  ScriptAttemptUncertainResult,
  ScriptCancelledTerminalEventEmission,
  ScriptFailedTerminalEventEmission,
  ScriptLiveEventEmission,
  ScriptTerminalAttemptResult,
  ScriptTerminalEventEmission,
  ScriptStartedEvent,
  ScriptSucceededTerminalEventEmission,
  ScriptTimedOutTerminalEventEmission,
} from '../../src/index.js';
import type { GitCommitInput } from '../../src/scripts/git/index.js';
import type {
  GitHubPullRequestMergeInput,
  GitHubPullRequestMergeResult,
} from '../../src/scripts/github/index.js';

test('publishes schema-exact deeply readonly built-in data types', () => {
  expectTypeOf<GitCommitInput['author']>().toEqualTypeOf<
    Readonly<{ name: string; email: string; timestamp: string }>
  >();

  type ApprovalKind = GitHubPullRequestMergeInput['approvalSubject']['kind'];
  type ResultIssueAction = NonNullable<GitHubPullRequestMergeResult['issueRef']>['action'];

  // @ts-expect-error The merge input schema accepts only publication or operation subjects.
  const invalidApprovalKind: ApprovalKind = 'plan';
  // @ts-expect-error The merge result schema cannot emit the input-only none action.
  const invalidResultIssueAction: ResultIssueAction = 'none';
  void invalidApprovalKind;
  void invalidResultIssueAction;
});

test('publishes the one-attempt facade and omits the legacy execute method', () => {
  expectTypeOf<RevoScripts>().toHaveProperty('prepareBinding');
  expectTypeOf<RevoScripts>().toHaveProperty('executeAttempt');
  expectTypeOf<RevoScripts>().toHaveProperty('cancelAttempt');
  expectTypeOf<RevoScripts>().toHaveProperty('reconcileAttempt');

  expectTypeOf<RevoScripts>().not.toHaveProperty('execute');
});

test('publishes the complete SC1 authoring surface from the root', () => {
  expectTypeOf<ScriptErrorCode>().toMatchTypeOf<`revo.script.${string}`>();
  expectTypeOf<ScriptCustomEvent>().toMatchTypeOf<{ name: string }>();
  expectTypeOf<ScriptResourceMap>().toMatchTypeOf<Readonly<Record<string, object>>>();
  expectTypeOf<ScriptHandlerResult<{ ok: true }>>().toMatchTypeOf<{ value: { ok: true } }>();
  expectTypeOf<ScriptImplementationIdentity>().toMatchTypeOf<{
    id: string;
    version: string;
    buildDigest: `sha256:${string}`;
  }>();
  expectTypeOf<DeepReadonly<{ nested: { value: string } }>>().toEqualTypeOf<{
    readonly nested: { readonly value: string };
  }>();
  expectTypeOf<ScriptTerminalAttemptResult>().toHaveProperty('terminalEvent');
  expectTypeOf<ScriptTerminalEventEmission>().toMatchTypeOf<{
    emissionOrdinal: number;
    event: { name: string };
  }>();
  expectTypeOf<ScriptAttemptUncertainResult>().not.toHaveProperty('terminalEvent');
});

declare const sink: EventSink;
declare const succeededTerminal: ScriptSucceededTerminalEventEmission;
declare const failedTerminal: ScriptFailedTerminalEventEmission;
declare const cancelledTerminal: ScriptCancelledTerminalEventEmission;
declare const timedOutTerminal: ScriptTimedOutTerminalEventEmission;
declare const startedEvent: ScriptStartedEvent;
declare const customEvent: ScriptCustomEvent;

const assertTerminalEventTypeBoundary = (): void => {
  // @ts-expect-error Live sinks reject every terminal event variant.
  void sink.emit(succeededTerminal);
  // @ts-expect-error Live sinks reject every terminal event variant.
  void sink.emit(failedTerminal);
  // @ts-expect-error Live sinks reject every terminal event variant.
  void sink.emit(cancelledTerminal);
  // @ts-expect-error Live sinks reject every terminal event variant.
  void sink.emit(timedOutTerminal);

  const startedLive: ScriptLiveEventEmission = { emissionOrdinal: 1, event: startedEvent };
  const customLive: ScriptLiveEventEmission = { emissionOrdinal: 2, event: customEvent };
  const startedAsTerminal: Extract<ScriptTerminalAttemptResult, { kind: 'succeeded' }> = {
    kind: 'succeeded',
    value: null,
    evidence: [],
    // @ts-expect-error A started event is live-only, never a succeeded terminal event.
    terminalEvent: startedLive,
  };
  const customAsTerminal: Extract<ScriptTerminalAttemptResult, { kind: 'cancelled' }> = {
    kind: 'cancelled',
    evidence: [],
    // @ts-expect-error A custom event is live-only, never a cancelled terminal event.
    terminalEvent: customLive,
  };
  const wrongTerminalForSuccess: Extract<ScriptTerminalAttemptResult, { kind: 'succeeded' }> = {
    kind: 'succeeded',
    value: null,
    evidence: [],
    // @ts-expect-error A failed terminal event cannot certify a succeeded result.
    terminalEvent: failedTerminal,
  };
  void startedAsTerminal;
  void customAsTerminal;
  void wrongTerminalForSuccess;
};

void assertTerminalEventTypeBoundary;
