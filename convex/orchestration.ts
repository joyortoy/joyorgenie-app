import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, env } from "./_generated/server";
import schema from "./schema";
import { inquiryHash, validEmail } from "./lib/inquiry";
import { workflow } from "./workflow";

const taskArgs = { taskId: v.id("tasks"), ownerKey: v.string() };
const stageKey = v.union(
  ...(
    [
      "understanding",
      "memory",
      "location",
      "calendar",
      "research",
      "ranking",
      "approval",
      "execution",
      "outcome",
    ] as const
  ).map((k) => v.literal(k)),
);
export const getContext = internalQuery({
  args: taskArgs,
  returns: v.object({
    intent: schema.doc("intents"),
    memories: v.array(schema.doc("memories")),
  }),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("tasks", args.taskId);
    if (!task || task.ownerKey !== args.ownerKey)
      throw new Error("Task ownership changed.");
    const intent = await ctx.db.get("intents", task.intentId);
    if (!intent?.requestedStart || !intent.area)
      throw new Error(
        "Please submit a new request with a future date and supported area.",
      );
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_ownerKey_and_active", (q) =>
        q.eq("ownerKey", args.ownerKey).eq("active", true),
      )
      .take(50);
    return {
      intent,
      memories: memories.filter((m) => /massage|travel/i.test(m.subject)),
    };
  },
});
export const completeStage = internalMutation({
  args: { ...taskArgs, key: stageKey, detail: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("tasks", args.taskId);
    if (!task || task.ownerKey !== args.ownerKey)
      throw new Error("Task ownership changed.");
    const stages = await ctx.db
      .query("stages")
      .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
      .take(20);
    const stage = stages.find((s) => s.key === args.key);
    const now = Date.now();
    if (stage)
      await ctx.db.patch("stages", stage._id, {
        status: "complete",
        detail: args.detail,
        completedAt: now,
        startedAt: stage.startedAt ?? now,
      });
    const next = stages.find((s) => s.ordinal === (stage?.ordinal ?? -1) + 1);
    if (next?.status === "waiting")
      await ctx.db.patch("stages", next._id, {
        status: "running",
        startedAt: now,
      });
    await ctx.db.patch("tasks", args.taskId, {
      summary: args.detail,
      updatedAt: now,
    });
    return null;
  },
});
export const recordEvidence = internalMutation({
  args: {
    ...taskArgs,
    kind: v.union(
      v.literal("memory"),
      v.literal("location"),
      v.literal("calendar"),
      v.literal("business"),
    ),
    label: v.string(),
    detail: v.string(),
    source: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("tasks", args.taskId);
    if (!task || task.ownerKey !== args.ownerKey)
      throw new Error("Task ownership changed.");
    await ctx.db.insert("evidence", { ...args, createdAt: Date.now() });
    return null;
  },
});
export const prepareApproval = internalMutation({
  args: taskArgs,
  returns: v.object({
    approvalId: v.id("approvals"),
    commitmentHash: v.string(),
  }),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("tasks", args.taskId);
    if (!task || task.ownerKey !== args.ownerKey)
      throw new Error("Task ownership changed.");
    const existing = await ctx.db
      .query("approvals")
      .withIndex("by_taskId", (q) => q.eq("taskId", task._id))
      .unique();
    if (existing)
      return {
        approvalId: existing._id,
        commitmentHash: existing.commitmentHash,
      };
    const intent = await ctx.db.get("intents", task.intentId);
    if (!intent?.requestedStart || !intent.requestedEnd)
      throw new Error("Request has no valid time window.");
    const sources = await ctx.db
      .query("researchSources")
      .withIndex("by_taskId", (q) => q.eq("taskId", task._id))
      .take(3);
    if (!sources.length)
      throw new Error(
        "No live provider sources are available. Nothing has been sent. Retry research later.",
      );
    let top: import("./_generated/dataModel").Id<"recommendations"> | undefined;
    for (const [index, source] of sources.entries()) {
      const businessId = await ctx.db.insert("businesses", {
        externalKey: `${task._id}:${source._id}`,
        name: source.title,
        neighborhood: intent.area!,
        currency: "SGD",
        treatment: `${intent.style || ""} massage`.trim(),
        source: "firecrawl",
        sourceUrl: source.url,
      });
      const id = await ctx.db.insert("recommendations", {
        ownerKey: args.ownerKey,
        taskId: task._id,
        businessId,
        rank: index + 1,
        reason: `Search result for ${intent.style || ""} massage in ${intent.area}. Confirm service and price with the provider.`,
        slotStart: intent.requestedStart,
        slotEnd: intent.requestedEnd,
        evidenceSummary: source.summary,
      });
      if (!top) top = id;
    }
    if (!top) throw new Error("No candidate found.");
    const recipient = env.AGENTMAIL_TEST_RECIPIENT ?? "";
    const sendEnabled = Boolean(
      env.AGENTMAIL_API_KEY && env.AGENTMAIL_INBOX_ID && validEmail(recipient),
    );
    const inquiry = {
      recipient,
      subject: `[TEST] Massage availability — ${intent.requestedWindow}`,
      body: `Test inquiry for ${sources[0].title}\nSource: ${sources[0].url}\n\nHello,\nDo you offer ${intent.style || ""} massage in ${intent.area} during ${intent.requestedWindow}?${intent.budgetCents !== undefined ? ` My budget is S$${(intent.budgetCents / 100).toFixed(2)}.` : ""}\nPlease confirm the treatment duration, total price, and available times. This is an availability inquiry, not a booking.\nThank you.`,
      testRecipient: true,
      sendEnabled,
    };
    const commitmentHash = inquiryHash(top, inquiry);
    const approvalId = await ctx.db.insert("approvals", {
      ownerKey: args.ownerKey,
      taskId: task._id,
      recommendationId: top,
      status: "pending",
      commitmentHash,
      commitmentSummary:
        "Send this exact availability inquiry to the configured test inbox. No provider booking, payment, or calendar event.",
      currency: "SGD",
      inquiry,
      createdAt: Date.now(),
    });
    await ctx.db.patch("tasks", task._id, {
      status: "awaiting_approval",
      summary: sendEnabled
        ? "Review the provider and exact test inquiry before sending."
        : "Research is ready. Email sending needs an AgentMail inbox and verified test recipient.",
      updatedAt: Date.now(),
    });
    return { approvalId, commitmentHash };
  },
});
export const failTask = internalMutation({
  args: { ...taskArgs, detail: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("tasks", args.taskId);
    if (!task || task.ownerKey !== args.ownerKey)
      throw new Error("Task ownership changed.");
    const detail =
      args.detail ?? "Simulated research timeout; no side effect occurred.";
    await ctx.db.patch("tasks", task._id, {
      status: "failed",
      summary: detail,
      failureCode: "WORKFLOW_FAILED",
      updatedAt: Date.now(),
    });
    const stages = await ctx.db
      .query("stages")
      .withIndex("by_taskId", (q) => q.eq("taskId", task._id))
      .take(20);
    for (const stage of stages)
      if (stage.status === "running")
        await ctx.db.patch("stages", stage._id, {
          status: "failed",
          detail,
          completedAt: Date.now(),
        });
    return null;
  },
});
export const finalizeRejected = internalMutation({
  args: taskArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("tasks", args.taskId);
    if (!task || task.ownerKey !== args.ownerKey)
      throw new Error("Task ownership changed.");
    const stages = await ctx.db
      .query("stages")
      .withIndex("by_taskId", (q) => q.eq("taskId", task._id))
      .take(20);
    for (const s of stages)
      if (["approval", "execution", "outcome"].includes(s.key))
        await ctx.db.patch("stages", s._id, {
          status: "skipped",
          detail: "Declined; no inquiry sent.",
        });
    return null;
  },
});
export const executeApproved = internalMutation({
  args: taskArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("tasks", args.taskId);
    if (!task || task.ownerKey !== args.ownerKey)
      throw new Error("Task ownership changed.");
    const inquiry = await ctx.db
      .query("inquiries")
      .withIndex("by_taskId", (q) => q.eq("taskId", task._id))
      .unique();
    if (inquiry?.status !== "sent" || !inquiry.messageId)
      throw new Error("No confirmed inquiry send.");
    const existing = await ctx.db
      .query("outcomes")
      .withIndex("by_taskId", (q) => q.eq("taskId", task._id))
      .unique();
    const message =
      "Test inquiry sent — awaiting reply. No provider booking or calendar event has been created.";
    if (!existing)
      await ctx.db.insert("outcomes", {
        ownerKey: args.ownerKey,
        taskId: task._id,
        status: "inquiry_sent",
        message,
        createdAt: Date.now(),
      });
    await ctx.db.patch("tasks", task._id, {
      status: "completed",
      summary: message,
      updatedAt: Date.now(),
    });
    return null;
  },
});
export const processIntent = workflow
  .define({
    args: { ...taskArgs, simulateFailure: v.boolean() },
    returns: v.union(
      v.literal("completed"),
      v.literal("rejected"),
      v.literal("failed"),
    ),
  })
  .handler(async (step, args): Promise<"completed" | "rejected" | "failed"> => {
    try {
      const context = await step.runQuery(internal.orchestration.getContext, {
        taskId: args.taskId,
        ownerKey: args.ownerKey,
      });
      const details = {
        understanding: `${context.intent.style || ""} massage · ${context.intent.requestedWindow}${context.intent.budgetCents ? ` · budget S$${context.intent.budgetCents / 100}` : ""}`,
        memory:
          context.memories
            .map((m) => `${m.value} (${m.provenance})`)
            .join("; ") || "No relevant active memories.",
        location: context.intent.area!,
        calendar:
          "Requested window only. Provider availability and your calendar have not been checked.",
      };
      for (const key of [
        "understanding",
        "memory",
        "location",
        "calendar",
      ] as const) {
        await step.runMutation(internal.orchestration.completeStage, {
          taskId: args.taskId,
          ownerKey: args.ownerKey,
          key,
          detail: details[key],
        });
        if (key !== "understanding")
          await step.runMutation(internal.orchestration.recordEvidence, {
            taskId: args.taskId,
            ownerKey: args.ownerKey,
            kind: key,
            label: key,
            detail: details[key],
            source: "Request and active stored context",
          });
      }
      if (args.simulateFailure)
        throw new Error("Simulated research timeout; no side effect occurred.");
      const research = await step.runAction(
        internal.firecrawl.researchLocalProviders,
        {
          taskId: args.taskId,
          ownerKey: args.ownerKey,
          query: `${context.intent.style || ""} massage provider official website`,
          location: context.intent.area!,
        },
        { retry: true },
      );
      await step.runMutation(internal.orchestration.completeStage, {
        taskId: args.taskId,
        ownerKey: args.ownerKey,
        key: "research",
        detail: research.detail,
      });
      await step.runMutation(internal.orchestration.prepareApproval, {
        taskId: args.taskId,
        ownerKey: args.ownerKey,
      });
      await step.runMutation(internal.orchestration.completeStage, {
        taskId: args.taskId,
        ownerKey: args.ownerKey,
        key: "ranking",
        detail:
          "Options come from the returned sources. Search order is not a fit score; price, travel time, and availability remain unconfirmed.",
      });
      const decision = await step.awaitEvent({
        name: "approvalDecision",
        validator: v.object({ approved: v.boolean() }),
      });
      if (!decision.approved) {
        await step.runMutation(internal.orchestration.finalizeRejected, {
          taskId: args.taskId,
          ownerKey: args.ownerKey,
        });
        return "rejected";
      }
      const sent = await step.runAction(
        internal.agentmail.sendApprovedInquiry,
        { taskId: args.taskId, ownerKey: args.ownerKey },
        { retry: false },
      );
      if (!sent)
        throw new Error(
          "Email send is unconfirmed or failed. Check the inquiry status before any manual retry.",
        );
      for (const key of ["approval", "execution", "outcome"] as const)
        await step.runMutation(internal.orchestration.completeStage, {
          taskId: args.taskId,
          ownerKey: args.ownerKey,
          key,
          detail:
            key === "approval"
              ? "Exact inquiry approved"
              : "Test inquiry sent; awaiting reply.",
        });
      await step.runMutation(internal.orchestration.executeApproved, {
        taskId: args.taskId,
        ownerKey: args.ownerKey,
      });
      return "completed";
    } catch (error) {
      await step.runMutation(internal.orchestration.failTask, {
        taskId: args.taskId,
        ownerKey: args.ownerKey,
        detail:
          error instanceof Error ? error.message : "Workflow failed safely.",
      });
      return "failed";
    }
  });
