import { WorkflowManager } from "@convex-dev/workflow";
import { components } from "./_generated/api";

export const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    maxParallelism: 8,
    defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 250, base: 2 },
  },
});
