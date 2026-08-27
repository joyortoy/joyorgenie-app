import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const memoryKind = v.union(
  v.literal("explicit"),
  v.literal("inferred"),
  v.literal("experience"),
  v.literal("temporary"),
);

export const stageStatus = v.union(
  v.literal("waiting"),
  v.literal("running"),
  v.literal("complete"),
  v.literal("blocked"),
  v.literal("failed"),
  v.literal("skipped"),
);

export default defineSchema({
  profiles: defineTable({
    ownerKey: v.string(),
    displayName: v.string(),
    mode: v.union(v.literal("demo"), v.literal("authenticated")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_ownerKey", ["ownerKey"]),

  locations: defineTable({
    ownerKey: v.string(),
    label: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    source: v.union(v.literal("browser"), v.literal("manual"), v.literal("demo")),
    accuracyMeters: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_ownerKey", ["ownerKey"]),

  memories: defineTable({
    ownerKey: v.string(),
    kind: memoryKind,
    subject: v.string(),
    value: v.string(),
    provenance: v.string(),
    confidence: v.number(),
    active: v.boolean(),
    sourceTaskId: v.optional(v.id("tasks")),
    createdAt: v.number(),
    removedAt: v.optional(v.number()),
  })
    .index("by_ownerKey", ["ownerKey"])
    .index("by_ownerKey_and_active", ["ownerKey", "active"]),

  intents: defineTable({
    ownerKey: v.string(),
    text: v.string(),
    category: v.literal("wellness"),
    service: v.literal("massage"),
    requestedWindow: v.string(),
    proximity: v.literal("near_me"),
    createdAt: v.number(),
  }).index("by_ownerKey", ["ownerKey"]),

  tasks: defineTable({
    ownerKey: v.string(),
    intentId: v.id("intents"),
    status: v.union(
      v.literal("processing"),
      v.literal("awaiting_approval"),
      v.literal("executing"),
      v.literal("completed"),
      v.literal("rejected"),
      v.literal("failed"),
    ),
    title: v.string(),
    summary: v.string(),
    workflowId: v.optional(v.string()),
    failureCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_ownerKey", ["ownerKey"])
    .index("by_ownerKey_and_createdAt", ["ownerKey", "createdAt"]),

  stages: defineTable({
    ownerKey: v.string(),
    taskId: v.id("tasks"),
    key: v.union(
      v.literal("understanding"),
      v.literal("memory"),
      v.literal("location"),
      v.literal("calendar"),
      v.literal("research"),
      v.literal("ranking"),
      v.literal("approval"),
      v.literal("execution"),
      v.literal("outcome"),
    ),
    label: v.string(),
    ordinal: v.number(),
    status: stageStatus,
    detail: v.string(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_taskId", ["taskId"])
    .index("by_taskId_and_ordinal", ["taskId", "ordinal"]),

  businesses: defineTable({
    externalKey: v.string(),
    name: v.string(),
    neighborhood: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    travelMinutes: v.number(),
    rating: v.number(),
    reviewCount: v.number(),
    priceCents: v.number(),
    currency: v.literal("SGD"),
    treatment: v.string(),
    source: v.literal("demo_fixture"),
  }).index("by_externalKey", ["externalKey"]),

  recommendations: defineTable({
    ownerKey: v.string(),
    taskId: v.id("tasks"),
    businessId: v.id("businesses"),
    rank: v.number(),
    score: v.number(),
    reason: v.string(),
    slotStart: v.string(),
    slotEnd: v.string(),
    evidenceSummary: v.string(),
  })
    .index("by_taskId", ["taskId"])
    .index("by_taskId_and_rank", ["taskId", "rank"]),

  approvals: defineTable({
    ownerKey: v.string(),
    taskId: v.id("tasks"),
    recommendationId: v.id("recommendations"),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    commitmentHash: v.string(),
    commitmentSummary: v.string(),
    amountCents: v.number(),
    currency: v.literal("SGD"),
    decidedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_taskId", ["taskId"])
    .index("by_ownerKey_and_status", ["ownerKey", "status"]),

  calendarConnections: defineTable({
    ownerKey: v.string(),
    provider: v.literal("google"),
    mode: v.union(v.literal("demo"), v.literal("oauth")),
    status: v.union(v.literal("connected"), v.literal("expired")),
    accessToken: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    scope: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_ownerKey", ["ownerKey"]),

  oauthStates: defineTable({
    ownerKey: v.string(),
    provider: v.literal("google"),
    state: v.string(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
  })
    .index("by_state", ["state"])
    .index("by_ownerKey", ["ownerKey"]),

  calendarEvents: defineTable({
    ownerKey: v.string(),
    taskId: v.id("tasks"),
    provider: v.literal("google"),
    providerEventId: v.string(),
    title: v.string(),
    start: v.string(),
    end: v.string(),
    status: v.union(v.literal("confirmed"), v.literal("demo_confirmed")),
    createdAt: v.number(),
  }).index("by_taskId", ["taskId"]),

  bookings: defineTable({
    ownerKey: v.string(),
    taskId: v.id("tasks"),
    recommendationId: v.id("recommendations"),
    status: v.union(v.literal("reserved_demo"), v.literal("not_supported")),
    reference: v.string(),
    disclosure: v.string(),
    createdAt: v.number(),
  }).index("by_taskId", ["taskId"]),

  outcomes: defineTable({
    ownerKey: v.string(),
    taskId: v.id("tasks"),
    status: v.literal("scheduled"),
    message: v.string(),
    createdAt: v.number(),
  }).index("by_taskId", ["taskId"]),

  feedback: defineTable({
    ownerKey: v.string(),
    taskId: v.id("tasks"),
    rating: v.number(),
    note: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_taskId", ["taskId"]),

  evidence: defineTable({
    ownerKey: v.string(),
    taskId: v.id("tasks"),
    kind: v.union(
      v.literal("memory"),
      v.literal("location"),
      v.literal("calendar"),
      v.literal("business"),
      v.literal("approval"),
      v.literal("execution"),
    ),
    label: v.string(),
    detail: v.string(),
    source: v.string(),
    createdAt: v.number(),
  })
    .index("by_taskId", ["taskId"])
    .index("by_ownerKey", ["ownerKey"]),

  auditLogs: defineTable({
    ownerKey: v.string(),
    taskId: v.optional(v.id("tasks")),
    event: v.string(),
    detail: v.string(),
    createdAt: v.number(),
  })
    .index("by_ownerKey", ["ownerKey"])
    .index("by_taskId", ["taskId"]),
});
