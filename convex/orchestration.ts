import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { stableCommitmentHash } from "./lib/ownership";
import { workflow } from "./workflow";

const stageKey = v.union(
  v.literal("understanding"),
  v.literal("memory"),
  v.literal("location"),
  v.literal("calendar"),
  v.literal("research"),
  v.literal("ranking"),
  v.literal("approval"),
  v.literal("execution"),
  v.literal("outcome"),
);

const stageDetails = {
  understanding: "Massage · Saturday afternoon · near your current location",
  memory: "Used: Thai massage rated 9/10; preference for travel within 15 minutes",
  location: "Current demo area: Tanjong Pagar · candidates capped at 15 minutes",
  calendar: "Demo availability: free Saturday from 2:00–5:30 PM (connect Google for live data)",
  research: "Compared 3 clearly labeled demo fixtures; no live business directory was claimed",
} as const;

export const completeStage = internalMutation({
  args: { taskId: v.id("tasks"), ownerKey: v.string(), key: stageKey, detail: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("tasks", args.taskId);
    if (!task || task.ownerKey !== args.ownerKey) throw new Error("Task ownership changed.");
    const stages = await ctx.db.query("stages").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).take(20);
    const stage = stages.find((item) => item.key === args.key);
    if (!stage) throw new Error(`Missing stage: ${args.key}`);
    const now = Date.now();
    await ctx.db.patch("stages", stage._id, { status: "complete", detail: args.detail, startedAt: stage.startedAt ?? now, completedAt: now });
    const next = stages.find((item) => item.ordinal === stage.ordinal + 1);
    if (next && next.status === "waiting") await ctx.db.patch("stages", next._id, { status: "running", startedAt: now });
    await ctx.db.patch("tasks", task._id, { summary: args.detail, updatedAt: now });
    await ctx.db.insert("auditLogs", { ownerKey: args.ownerKey, taskId: task._id, event: `stage_${args.key}_complete`, detail: args.detail, createdAt: now });
    return null;
  },
});

export const recordEvidence = internalMutation({
  args: {
    taskId: v.id("tasks"),
    ownerKey: v.string(),
    kind: v.union(v.literal("memory"), v.literal("location"), v.literal("calendar"), v.literal("business")),
    label: v.string(),
    detail: v.string(),
    source: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("tasks", args.taskId);
    if (!task || task.ownerKey !== args.ownerKey) throw new Error("Task ownership changed.");
    await ctx.db.insert("evidence", { ...args, createdAt: Date.now() });
    return null;
  },
});

export const prepareApproval = internalMutation({
  args: { taskId: v.id("tasks"), ownerKey: v.string() },
  returns: v.object({ approvalId: v.id("approvals"), commitmentHash: v.string() }),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("tasks", args.taskId);
    if (!task || task.ownerKey !== args.ownerKey) throw new Error("Task ownership changed.");
    const existingApproval = await ctx.db.query("approvals").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).unique();
    if (existingApproval) return { approvalId: existingApproval._id, commitmentHash: existingApproval.commitmentHash };
    const businesses = [];
    for (const key of ["quiet-palm-tanjong-pagar", "sage-stretch-chinatown", "slow-house-duxton"]) {
      const business = await ctx.db.query("businesses").withIndex("by_externalKey", (q) => q.eq("externalKey", key)).unique();
      if (!business) throw new Error(`Demo fixture missing: ${key}`);
      businesses.push(business);
    }
    const recommendationValues = [
      { score: 96, reason: "Best match for your 9/10 Thai-massage experience, strongest reviews, and only 9 minutes away.", slotStart: "2026-08-29T14:30:00+08:00", slotEnd: "2026-08-29T16:00:00+08:00" },
      { score: 88, reason: "A lower-cost Thai-inspired option within your 15-minute preference.", slotStart: "2026-08-29T15:00:00+08:00", slotEnd: "2026-08-29T16:15:00+08:00" },
      { score: 79, reason: "Calm restorative alternative nearby, but less aligned with your Thai-style preference.", slotStart: "2026-08-29T14:00:00+08:00", slotEnd: "2026-08-29T15:30:00+08:00" },
    ];
    const ids: Id<"recommendations">[] = [];
    for (let index = 0; index < businesses.length; index += 1) {
      const business = businesses[index];
      const value = recommendationValues[index];
      ids.push(await ctx.db.insert("recommendations", { ownerKey: args.ownerKey, taskId: task._id, businessId: business._id, rank: index + 1, ...value, evidenceSummary: `${business.rating}/5 from ${business.reviewCount} demo reviews · ${business.travelMinutes} min · ${business.source}` }));
    }
    const top = await ctx.db.get("recommendations", ids[0]);
    if (!top) throw new Error("Could not prepare the recommended action.");
    const business = businesses[0];
    const canonical = `${top._id}|${top.slotStart}|${top.slotEnd}|${business.priceCents}|${business.currency}`;
    const commitmentHash = stableCommitmentHash(canonical);
    const summary = `${business.treatment} at ${business.name}, Sat 2:30–4:00 PM, SGD ${(business.priceCents / 100).toFixed(2)}. Add one calendar event. Provider booking is not available; create a clearly disclosed local demo hold only.`;
    const approvalId = await ctx.db.insert("approvals", { ownerKey: args.ownerKey, taskId: task._id, recommendationId: top._id, status: "pending", commitmentHash, commitmentSummary: summary, amountCents: business.priceCents, currency: business.currency, createdAt: Date.now() });
    const stages = await ctx.db.query("stages").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).take(20);
    const ranking = stages.find((stage) => stage.key === "ranking");
    const approval = stages.find((stage) => stage.key === "approval");
    const now = Date.now();
    if (ranking) await ctx.db.patch("stages", ranking._id, { status: "complete", detail: "3 options ranked with preference, distance, cost, and evidence", completedAt: now });
    if (approval) await ctx.db.patch("stages", approval._id, { status: "blocked", detail: "Your exact approval is required before any calendar event or local hold", startedAt: approval.startedAt ?? now });
    await ctx.db.patch("tasks", task._id, { status: "awaiting_approval", summary: "Three matches are ready. Review the exact commitment before approving.", updatedAt: now });
    await ctx.db.insert("evidence", { ownerKey: args.ownerKey, taskId: task._id, kind: "business", label: "Demo research", detail: "Three deterministic demo fixtures ranked; not presented as live inventory.", source: "JoyOrGenie seed fixtures", createdAt: now });
    await ctx.db.insert("auditLogs", { ownerKey: args.ownerKey, taskId: task._id, event: "approval_requested", detail: `${commitmentHash}: ${summary}`, createdAt: now });
    return { approvalId, commitmentHash };
  },
});

export const failTask = internalMutation({
  args: { taskId: v.id("tasks"), ownerKey: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("tasks", args.taskId);
    if (!task || task.ownerKey !== args.ownerKey) throw new Error("Task ownership changed.");
    const stages = await ctx.db.query("stages").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).take(20);
    const research = stages.find((stage) => stage.key === "research");
    if (research) await ctx.db.patch("stages", research._id, { status: "failed", detail: "Simulated research provider timeout. Safe to retry; no side effect occurred.", completedAt: Date.now() });
    await ctx.db.patch("tasks", task._id, { status: "failed", failureCode: "SIMULATED_RESEARCH_TIMEOUT", summary: "Research paused safely. Retry from the durable task state.", updatedAt: Date.now() });
    await ctx.db.insert("auditLogs", { ownerKey: args.ownerKey, taskId: task._id, event: "task_failed_safely", detail: "SIMULATED_RESEARCH_TIMEOUT; no commitment or side effect.", createdAt: Date.now() });
    return null;
  },
});

export const finalizeRejected = internalMutation({
  args: { taskId: v.id("tasks"), ownerKey: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("tasks", args.taskId);
    if (!task || task.ownerKey !== args.ownerKey) throw new Error("Task ownership changed.");
    const stages = await ctx.db.query("stages").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).take(20);
    for (const stage of stages) {
      if (stage.key === "approval") await ctx.db.patch("stages", stage._id, { status: "complete", detail: "You declined; no action was taken", completedAt: Date.now() });
      if (stage.key === "execution" || stage.key === "outcome") await ctx.db.patch("stages", stage._id, { status: "skipped", detail: "Skipped because approval was declined" });
    }
    return null;
  },
});

export const executeApproved = internalMutation({
  args: { taskId: v.id("tasks"), ownerKey: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("tasks", args.taskId);
    if (!task || task.ownerKey !== args.ownerKey) throw new Error("Task ownership changed.");
    const approval = await ctx.db.query("approvals").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).unique();
    if (!approval || approval.status !== "approved") throw new Error("Execution blocked: exact approval is missing.");
    const recommendation = await ctx.db.get("recommendations", approval.recommendationId);
    if (!recommendation) throw new Error("Execution blocked: recommendation is missing.");
    const business = await ctx.db.get("businesses", recommendation.businessId);
    if (!business) throw new Error("Execution blocked: business is missing.");
    const event = await ctx.db.query("calendarEvents").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).unique();
    if (!event) throw new Error("Execution blocked: the approved calendar step did not complete.");
    await ctx.db.insert("bookings", { ownerKey: args.ownerKey, taskId: task._id, recommendationId: recommendation._id, status: "not_supported", reference: `LOCAL-HOLD-${String(task._id).slice(-6).toUpperCase()}`, disclosure: "No compatible appointment-booking API was available. This is a local demo hold, not a provider-confirmed booking.", createdAt: Date.now() });
    await ctx.db.insert("outcomes", { ownerKey: args.ownerKey, taskId: task._id, status: "scheduled", message: `${business.name} is held locally for Saturday at 2:30 PM. ${event.status === "demo_confirmed" ? "A clearly labeled demo calendar event was created." : "The event was created in Google Calendar."}`, createdAt: Date.now() });
    const stages = await ctx.db.query("stages").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).take(20);
    const now = Date.now();
    for (const stage of stages) {
      if (stage.key === "approval") await ctx.db.patch("stages", stage._id, { status: "complete", detail: "Exact commitment approved", completedAt: now });
      if (stage.key === "execution") await ctx.db.patch("stages", stage._id, { status: "complete", detail: "Created approved event and disclosed local demo hold", startedAt: now, completedAt: now });
      if (stage.key === "outcome") await ctx.db.patch("stages", stage._id, { status: "complete", detail: "Result saved; ready for feedback", startedAt: now, completedAt: now });
    }
    await ctx.db.patch("tasks", task._id, { status: "completed", summary: "Scheduled with a transparent local hold. Tell Genie how it went.", updatedAt: now });
    await ctx.db.insert("evidence", { ownerKey: args.ownerKey, taskId: task._id, kind: "execution", label: "Approved side effect", detail: `Created only the approved event; booking capability disclosed as unsupported.`, source: approval.commitmentHash, createdAt: now });
    await ctx.db.insert("auditLogs", { ownerKey: args.ownerKey, taskId: task._id, event: "task_completed", detail: `Execution matched approval ${approval.commitmentHash}.`, createdAt: now });
    return null;
  },
});

export const processIntent = workflow
  .define({
    args: { taskId: v.id("tasks"), ownerKey: v.string(), simulateFailure: v.boolean() },
    returns: v.union(v.literal("awaiting_approval"), v.literal("completed"), v.literal("rejected"), v.literal("failed")),
  })
  .handler(async (step, args): Promise<"awaiting_approval" | "completed" | "rejected" | "failed"> => {
    for (const key of ["understanding", "memory", "location", "calendar", "research"] as const) {
      await step.runMutation(internal.orchestration.completeStage, { taskId: args.taskId, ownerKey: args.ownerKey, key, detail: stageDetails[key] });
      await step.sleep(180);
      if (key === "memory") await step.runMutation(internal.orchestration.recordEvidence, { taskId: args.taskId, ownerKey: args.ownerKey, kind: "memory", label: "Relevant memory", detail: "Thai massage rated 9/10; travel within 15 minutes", source: "structured memories with provenance" });
      if (key === "location") await step.runMutation(internal.orchestration.recordEvidence, { taskId: args.taskId, ownerKey: args.ownerKey, kind: "location", label: "Current area", detail: "Tanjong Pagar, Singapore", source: "current profile location" });
      if (key === "calendar") await step.runMutation(internal.orchestration.recordEvidence, { taskId: args.taskId, ownerKey: args.ownerKey, kind: "calendar", label: "Availability", detail: "Saturday 2:00–5:30 PM", source: "clearly labeled deterministic demo calendar" });
      if (key === "research" && args.simulateFailure) {
        await step.runMutation(internal.orchestration.failTask, { taskId: args.taskId, ownerKey: args.ownerKey });
        return "failed";
      }
    }
    await step.runMutation(internal.orchestration.prepareApproval, { taskId: args.taskId, ownerKey: args.ownerKey });
    const decision = await step.awaitEvent({ name: "approvalDecision", validator: v.object({ approved: v.boolean() }) });
    if (!decision.approved) {
      await step.runMutation(internal.orchestration.finalizeRejected, { taskId: args.taskId, ownerKey: args.ownerKey });
      return "rejected";
    }
    await step.runAction(internal.calendar.createApprovedEvent, { taskId: args.taskId, ownerKey: args.ownerKey }, { retry: true });
    await step.runMutation(internal.orchestration.executeApproved, { taskId: args.taskId, ownerKey: args.ownerKey });
    return "completed";
  });
