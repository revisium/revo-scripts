import { expect, test } from 'vitest';

import { expectedConsumerPullRequestLifecycleCatalog } from '../../support/consumer/consumer-pull-request-lifecycle-catalog-expectation.js';
import { expectedConsumerPullRequestLifecycle } from '../../support/consumer/consumer-pull-request-lifecycle-expectation.js';
import { ConsumerPullRequestLifecycle } from '../../support/consumer/consumer-pull-request-lifecycle.js';

test(
  'composes one consumer flow from workspace capture through a merged pull request',
  { timeout: 30_000 },
  async () => {
    const scenario = await ConsumerPullRequestLifecycle.create();
    try {
      expect(scenario.catalog()).toEqual(expectedConsumerPullRequestLifecycleCatalog);
      await scenario.status();
      await scenario.commit();
      await scenario.push();
      await scenario.upsert();
      await scenario.markReady();
      await scenario.readinessBeforeResponse();
      await scenario.respond();
      await scenario.resolve();
      await scenario.approval();
      await scenario.readinessAfterResolution();
      await scenario.merge();

      const outcome = await scenario.outcome();
      expect(outcome).toEqual(expectedConsumerPullRequestLifecycle(scenario.dynamicFacts()));
    } finally {
      await scenario.dispose();
    }
  },
);
