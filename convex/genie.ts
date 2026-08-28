import { sendEvent, type WorkflowId } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { ownerKeyFor, stableCommitmentHash } from "./lib/ownership";
import schema from "./schema";
import { workflow } from "./workflow";

const sessionArgs = { sessionToken: v.string() };

const businessFixtures = [
  {
    externalKey: "quiet-palm-tanjong-pagar",
    name: "Quiet Palm Thai Therapy",
    neighborhood: "Tanjong Pagar",
    latitude: 1.2769,
    longitude: 103.8452,
    travelMinutes: 9,
    rating: 4.8,
    reviewCount: 428,
    priceCents: 8800,
    currency: "SGD" as const,
    treatment: "90-min traditional Thai massage",
    source: "demo_fixture" as const,
  },
  {
    externalKey: "sage-stretch-chinatown",
    name: "Sage & Stretch",
    neighborhood: "Chinatown",
    latitude: 1.2838,
    longitude: 103.8436,
    travelMinutes: 12,
    rating: 4.7,
    reviewCount: 311,
    priceCents: 7600,
    currency: "SGD" as const,
    treatment: "75-min Thai-inspired stretch massage",
    source: "demo_fixture" as const,
  },
  {
    externalKey: "slow-house-duxton",
    name: "Slow House Duxton",
    neighborhood: "Duxton Hill",
    latitude: 1.2795,
    longitude: 103.842,
    travelMinutes: 14,
    rating: 4.6,
    reviewCount: 196,
    priceCents: 9800,
    currency: "SGD" as const,
    treatment: "90-min restorative massage",
    source: "demo_fixture" as const,
  },
];

export const bootstrapDemo = mutation({
  args: sessionArgs,
  returns: v.object({ profileId: v.id("profiles"), created: v.boolean() }),
  handler: async (ctx, args): Promise<{ profileId: Id<"profiles">; created: boolean }> => {
    const ownerKey = await ownerKeyFor(ctx, args.sessionToken);
    const now = Date.now();
    let profile = await ctx.db
      .query("profiles")
      .withIndex("by_ownerKey", (q) => q.eq("ownerKey", ownerKey))
      .unique();
    const created = profile === null;
    if (!profile) {
      const profileId = await ctx.db.insert("profiles", {
        ownerKey,
        displayName: "Joy",
        mode: ownerKey.startsWith("auth:") ? "authenticated" : "demo",
        createdAt: now,
        updatedAt: now,
      });
      profile = await ctx.db.get("profiles", profileId);
      if (!profile) throw new Error("Could not create profile.");
    }

    const location = await ctx.db
      .query("locations")
      .withIndex("by_ownerKey", (q) => q.eq("ownerKey", ownerKey))
      .unique();
    if (!location) {
      await ctx.db.insert("locations", {
        ownerKey,
        label: "Tanjong Pagar, Singapore",
        latitude: 1.2764,
        longitude: 103.8438,
        source: "demo",
        accuracyMeters: 900,
        updatedAt: now,
      });
    }

    const activeMemories = await ctx.db
      .query("memories")
      .withIndex("by_ownerKey_and_active", (q) => q.eq("ownerKey", ownerKey).eq("active", true))
      .take(20);
    const seededSubjects = new Set(activeMemories.map((memory) => memory.subject));
    const memories = [
      {
        kind: "experience" as const,
        subject: "thai_massage_rating",
        value: "Rated a Thai massage 9/10",
        provenance: "Demo of feedback from a previous completed visit",
        confidence: 1,
      },
      {
        kind: "explicit" as const,
        subject: "travel_radius",
        value: "Prefer places within 15 minutes",
        provenance: "User-stated preference in an earlier task",
        confidence: 1,
      },
      {
        kind: "inferred" as const,
        subject: "massage_style",
        value: "Likely prefers Thai-style pressure and stretching",
        provenance: "Inferred from the 9/10 Thai massage experience",
        confidence: 0.82,
      },
    ];
    for (const memory of memories) {
      if (!seededSubjects.has(memory.subject)) {
        await ctx.db.insert("memories", {
          ownerKey,
          ...memory,
          active: true,
          createdAt: now,
        });
      }
    }

    for (const fixture of businessFixtures) {
      const existing = await ctx.db
        .query("businesses")
        .withIndex("by_externalKey", (q) => q.eq("externalKey", fixture.externalKey))
        .unique();
      if (!existing) await ctx.db.insert("businesses", fixture);
    }

    await ctx.db.insert("auditLogs", {
      ownerKey,
      event: created ? "demo_bootstrapped" : "demo_resumed",
      detail: "Idempotent demo workspace bootstrap completed.",
      createdAt: now,
    });
    return { profileId: profile._id, created };
  },
});

export const getWorkspace = query({
  args: sessionArgs,
  returns: v.object({
    profile: v.union(schema.doc("profiles"), v.null()),
    location: v.union(schema.doc("locations"), v.null()),
    memories: v.array(schema.doc("memories")),
    calendarConnection: v.union(
      v.object({ provider: v.literal("google"), mode: v.union(v.literal("demo"), v.literal("oauth")), status: v.union(v.literal("connected"), v.literal("expired")), updatedAt: v.number() }),
      v.null(),
    ),
    task: v.union(schema.doc("tasks"), v.null()),
    stages: v.array(schema.doc("stages")),
    recommendations: v.array(v.object({ recommendation: schema.doc("recommendations"), business: schema.doc("businesses") })),
    researchSources: v.array(schema.doc("researchSources")),
    approval: v.union(schema.doc("approvals"), v.null()),
    calendarEvent: v.union(schema.doc("calendarEvents"), v.null()),
    booking: v.union(schema.doc("bookings"), v.null()),
    outcome: v.union(schema.doc("outcomes"), v.null()),
    feedback: v.union(schema.doc("feedback"), v.null()),
    evidence: v.array(schema.doc("evidence")),
    audit: v.array(schema.doc("auditLogs")),
  }),
  handler: async (ctx, args) => {
    const ownerKey = await ownerKeyFor(ctx, args.sessionToken);
    const profile = await ctx.db.query("profiles").withIndex("by_ownerKey", (q) => q.eq("ownerKey", ownerKey)).unique();
    const location = await ctx.db.query("locations").withIndex("by_ownerKey", (q) => q.eq("ownerKey", ownerKey)).unique();
    const memories = await ctx.db.query("memories").withIndex("by_ownerKey_and_active", (q) => q.eq("ownerKey", ownerKey).eq("active", true)).take(50);
    const connection = await ctx.db.query("calendarConnections").withIndex("by_ownerKey", (q) => q.eq("ownerKey", ownerKey)).unique();
    const calendarConnection = connection
      ? { provider: connection.provider, mode: connection.mode, status: connection.status, updatedAt: connection.updatedAt }
      : null;
    const task = (await ctx.db.query("tasks").withIndex("by_ownerKey_and_createdAt", (q) => q.eq("ownerKey", ownerKey)).order("desc").take(1))[0] ?? null;
    if (!task) {
      const audit = await ctx.db.query("auditLogs").withIndex("by_ownerKey", (q) => q.eq("ownerKey", ownerKey)).order("desc").take(40);
      return { profile, location, memories, calendarConnection, task: null, stages: [], recommendations: [], researchSources: [], approval: null, calendarEvent: null, booking: null, outcome: null, feedback: null, evidence: [], audit };
    }
    const stages = await ctx.db.query("stages").withIndex("by_taskId_and_ordinal", (q) => q.eq("taskId", task._id)).take(20);
    const recommendationDocs = await ctx.db.query("recommendations").withIndex("by_taskId_and_rank", (q) => q.eq("taskId", task._id)).take(10);
    const researchSources = await ctx.db.query("researchSources").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).take(3);
    const recommendations = [];
    for (const recommendation of recommendationDocs) {
      const business = await ctx.db.get("businesses", recommendation.businessId);
      if (business) recommendations.push({ recommendation, business });
    }
    const approval = await ctx.db.query("approvals").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).unique();
    const calendarEvent = await ctx.db.query("calendarEvents").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).unique();
    const booking = await ctx.db.query("bookings").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).unique();
    const outcome = await ctx.db.query("outcomes").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).unique();
    const feedback = await ctx.db.query("feedback").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).unique();
    const evidence = await ctx.db.query("evidence").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).take(50);
    const audit = await ctx.db.query("auditLogs").withIndex("by_ownerKey", (q) => q.eq("ownerKey", ownerKey)).order("desc").take(40);
    return { profile, location, memories, calendarConnection, task, stages, recommendations, researchSources, approval, calendarEvent, booking, outcome, feedback, evidence, audit };
  },
});

export const setLocation = mutation({
  args: { ...sessionArgs, label: v.string(), latitude: v.number(), longitude: v.number(), source: v.union(v.literal("browser"), v.literal("manual")), accuracyMeters: v.optional(v.number()) },
  returns: v.id("locations"),
  handler: async (ctx, args) => {
    const ownerKey = await ownerKeyFor(ctx, args.sessionToken);
    if (args.latitude < -90 || args.latitude > 90 || args.longitude < -180 || args.longitude > 180) throw new Error("Invalid coordinates.");
    const existing = await ctx.db.query("locations").withIndex("by_ownerKey", (q) => q.eq("ownerKey", ownerKey)).unique();
    const value = { label: args.label.trim().slice(0, 120), latitude: Math.round(args.latitude * 10000) / 10000, longitude: Math.round(args.longitude * 10000) / 10000, source: args.source, accuracyMeters: args.accuracyMeters, updatedAt: Date.now() };
    const locationId = existing ? (await ctx.db.patch("locations", existing._id, value), existing._id) : await ctx.db.insert("locations", { ownerKey, ...value });
    await ctx.db.insert("auditLogs", { ownerKey, event: "location_updated", detail: `${value.label}; coordinates retained only for the current profile.`, createdAt: Date.now() });
    return locationId;
  },
});

export const enableDemoCalendar = mutation({
  args: sessionArgs,
  returns: v.id("calendarConnections"),
  handler: async (ctx, args) => {
    const ownerKey = await ownerKeyFor(ctx, args.sessionToken);
    const existing = await ctx.db.query("calendarConnections").withIndex("by_ownerKey", (q) => q.eq("ownerKey", ownerKey)).unique();
    const value = { provider: "google" as const, mode: "demo" as const, status: "connected" as const, updatedAt: Date.now() };
    const id = existing ? (await ctx.db.replace("calendarConnections", existing._id, { ownerKey, ...value }), existing._id) : await ctx.db.insert("calendarConnections", { ownerKey, ...value });
    await ctx.db.insert("auditLogs", { ownerKey, event: "demo_calendar_connected", detail: "Connected deterministic demo availability; no Google data was read.", createdAt: Date.now() });
    return id;
  },
});

export const submitIntent = mutation({
  args: { ...sessionArgs, text: v.string(), simulateFailure: v.optional(v.boolean()) },
  returns: v.object({ taskId: v.id("tasks"), workflowId: v.string() }),
  handler: async (ctx, args): Promise<{ taskId: Id<"tasks">; workflowId: string }> => {
    const ownerKey = await ownerKeyFor(ctx, args.sessionToken);
    const text = args.text.trim();
    if (text.length < 5 || text.length > 1000) throw new Error("Describe what you want in 5–1000 characters.");
    const now = Date.now();
    const intentId = await ctx.db.insert("intents", { ownerKey, text, category: "wellness", service: "massage", requestedWindow: "Saturday afternoon", proximity: "near_me", createdAt: now });
    const taskId = await ctx.db.insert("tasks", { ownerKey, intentId, status: "processing", title: "Find a massage for Saturday afternoon", summary: "Understanding your request and preparing trusted options.", createdAt: now, updatedAt: now });
    const stageFixtures = [
      ["understanding", "Understand", "Interpreting service, time, and proximity"],
      ["memory", "Memory", "Looking up relevant preferences with provenance"],
      ["location", "Location", "Checking the current area and travel radius"],
      ["calendar", "Calendar", "Finding a free Saturday-afternoon window"],
      ["research", "Research", "Searching live provider pages with Firecrawl"],
      ["ranking", "Rank", "Explaining the best matches"],
      ["approval", "Approve", "Waiting before any commitment"],
      ["execution", "Execute", "Creating only the approved calendar event"],
      ["outcome", "Outcome", "Recording the result and feedback"],
    ] as const;
    for (let ordinal = 0; ordinal < stageFixtures.length; ordinal += 1) {
      const [key, label, detail] = stageFixtures[ordinal];
      await ctx.db.insert("stages", { ownerKey, taskId, key, label, ordinal, status: ordinal === 0 ? "running" : "waiting", detail, ...(ordinal === 0 ? { startedAt: now } : {}) });
    }
    const workflowId: WorkflowId = await workflow.start(ctx, internal.orchestration.processIntent, { taskId, ownerKey, simulateFailure: args.simulateFailure ?? false }, { startAsync: true });
    await ctx.db.patch("tasks", taskId, { workflowId: workflowId as string });
    await ctx.db.insert("auditLogs", { ownerKey, taskId, event: "intent_submitted", detail: `Intent accepted: ${text}`, createdAt: now });
    return { taskId, workflowId: workflowId as string };
  },
});

export const approveAction = mutation({
  args: { ...sessionArgs, taskId: v.id("tasks"), commitmentHash: v.string() },
  returns: v.object({ accepted: v.boolean() }),
  handler: async (ctx, args): Promise<{ accepted: boolean }> => {
    const ownerKey = await ownerKeyFor(ctx, args.sessionToken);
    const task = await ctx.db.get("tasks", args.taskId);
    if (!task || task.ownerKey !== ownerKey) throw new Error("Task not found.");
    if (task.status !== "awaiting_approval" || !task.workflowId) throw new Error("This task is not awaiting approval.");
    const approval = await ctx.db.query("approvals").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).unique();
    if (!approval || approval.status !== "pending") throw new Error("No pending approval exists.");
    const recommendation = await ctx.db.get("recommendations", approval.recommendationId);
    if (!recommendation) throw new Error("The proposed action changed; refresh before approving.");
    const expected = stableCommitmentHash(`${recommendation._id}|${recommendation.slotStart}|${recommendation.slotEnd}|${approval.amountCents}|${approval.currency}`);
    if (args.commitmentHash !== approval.commitmentHash || expected !== approval.commitmentHash) throw new Error("Approval did not match the exact current commitment.");
    const now = Date.now();
    await ctx.db.patch("approvals", approval._id, { status: "approved", decidedAt: now });
    await ctx.db.patch("tasks", task._id, { status: "executing", summary: "Approved. Creating exactly the disclosed calendar event.", updatedAt: now });
    await ctx.db.insert("evidence", { ownerKey, taskId: task._id, kind: "approval", label: "Explicit approval", detail: approval.commitmentSummary, source: `commitment ${approval.commitmentHash}`, createdAt: now });
    await ctx.db.insert("auditLogs", { ownerKey, taskId: task._id, event: "commitment_approved", detail: approval.commitmentHash, createdAt: now });
    await sendEvent(ctx, components.workflow, { name: "approvalDecision", workflowId: task.workflowId as WorkflowId, value: { approved: true } });
    return { accepted: true };
  },
});

export const rejectAction = mutation({
  args: { ...sessionArgs, taskId: v.id("tasks") },
  returns: v.object({ rejected: v.boolean() }),
  handler: async (ctx, args) => {
    const ownerKey = await ownerKeyFor(ctx, args.sessionToken);
    const task = await ctx.db.get("tasks", args.taskId);
    if (!task || task.ownerKey !== ownerKey) throw new Error("Task not found.");
    const approval = await ctx.db.query("approvals").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).unique();
    if (!approval || approval.status !== "pending" || !task.workflowId) throw new Error("No pending approval exists.");
    const now = Date.now();
    await ctx.db.patch("approvals", approval._id, { status: "rejected", decidedAt: now });
    await ctx.db.patch("tasks", task._id, { status: "rejected", summary: "Nothing was booked and no calendar event was created.", updatedAt: now });
    await ctx.db.insert("auditLogs", { ownerKey, taskId: task._id, event: "commitment_rejected", detail: "User rejected the proposed action; no side effect occurred.", createdAt: now });
    await sendEvent(ctx, components.workflow, { name: "approvalDecision", workflowId: task.workflowId as WorkflowId, value: { approved: false } });
    return { rejected: true };
  },
});

export const retryTask = mutation({
  args: { ...sessionArgs, taskId: v.id("tasks") },
  returns: v.object({ workflowId: v.string() }),
  handler: async (ctx, args): Promise<{ workflowId: string }> => {
    const ownerKey = await ownerKeyFor(ctx, args.sessionToken);
    const task = await ctx.db.get("tasks", args.taskId);
    if (!task || task.ownerKey !== ownerKey) throw new Error("Task not found.");
    if (task.status !== "failed") throw new Error("Only failed tasks can be retried.");
    const existingApproval = await ctx.db.query("approvals").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).unique();
    if (existingApproval) await ctx.db.delete("approvals", existingApproval._id);
    const existingRecommendations = await ctx.db.query("recommendations").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).take(10);
    for (const recommendation of existingRecommendations) await ctx.db.delete("recommendations", recommendation._id);
    const stages = await ctx.db.query("stages").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).take(20);
    for (const stage of stages) await ctx.db.patch("stages", stage._id, { status: stage.ordinal === 0 ? "running" : "waiting", detail: stage.ordinal === 0 ? "Retrying from a clean durable checkpoint" : stage.detail, startedAt: stage.ordinal === 0 ? Date.now() : undefined, completedAt: undefined });
    const workflowId: WorkflowId = await workflow.start(ctx, internal.orchestration.processIntent, { taskId: task._id, ownerKey, simulateFailure: false }, { startAsync: true });
    await ctx.db.patch("tasks", task._id, { status: "processing", workflowId: workflowId as string, failureCode: undefined, summary: "Retrying safely.", updatedAt: Date.now() });
    return { workflowId: workflowId as string };
  },
});

export const submitFeedback = mutation({
  args: { ...sessionArgs, taskId: v.id("tasks"), rating: v.number(), note: v.optional(v.string()) },
  returns: v.object({ feedbackId: v.id("feedback"), memoryId: v.id("memories") }),
  handler: async (ctx, args) => {
    const ownerKey = await ownerKeyFor(ctx, args.sessionToken);
    const task = await ctx.db.get("tasks", args.taskId);
    if (!task || task.ownerKey !== ownerKey || task.status !== "completed") throw new Error("Feedback requires your completed task.");
    if (!Number.isInteger(args.rating) || args.rating < 1 || args.rating > 10) throw new Error("Rating must be an integer from 1 to 10.");
    const existing = await ctx.db.query("feedback").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).unique();
    if (existing) throw new Error("Feedback has already been recorded.");
    const now = Date.now();
    const feedbackId = await ctx.db.insert("feedback", { ownerKey, taskId: task._id, rating: args.rating, note: args.note?.trim().slice(0, 500), createdAt: now });
    const memoryId = await ctx.db.insert("memories", { ownerKey, kind: "experience", subject: `massage_feedback_${task._id}`, value: `Rated this massage plan ${args.rating}/10${args.note ? `: ${args.note.trim().slice(0, 180)}` : ""}`, provenance: "Explicit feedback after this completed JoyOrGenie task", confidence: 1, active: true, sourceTaskId: task._id, createdAt: now });
    await ctx.db.insert("auditLogs", { ownerKey, taskId: task._id, event: "feedback_saved", detail: `Experience memory created from an explicit ${args.rating}/10 rating.`, createdAt: now });
    return { feedbackId, memoryId };
  },
});

export const removeMemory = mutation({
  args: { ...sessionArgs, memoryId: v.id("memories") },
  returns: v.object({ removed: v.boolean() }),
  handler: async (ctx, args) => {
    const ownerKey = await ownerKeyFor(ctx, args.sessionToken);
    const memory = await ctx.db.get("memories", args.memoryId);
    if (!memory || memory.ownerKey !== ownerKey) throw new Error("Memory not found.");
    if (!memory.active) return { removed: false };
    await ctx.db.patch("memories", memory._id, { active: false, removedAt: Date.now() });
    await ctx.db.insert("auditLogs", { ownerKey, taskId: memory.sourceTaskId, event: "memory_removed", detail: `${memory.kind}:${memory.subject}`, createdAt: Date.now() });
    return { removed: true };
  },
});
