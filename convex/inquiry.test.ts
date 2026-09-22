// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { describe, it, expect, vi, afterEach } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { parseRequest } from "./lib/request";
import { inquiryHash } from "./lib/inquiry";
const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const sessionToken = "test-inquiry-owner-private-token";
const now = Date.parse("2026-09-22T10:00:00+08:00");
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("real request and inquiry boundary", () => {
  it("uses date, area, budget, explicit style and active preference inputs", () => {
    const parsed = parseRequest(
      "Find a Swedish massage near Tanjong Pagar this Saturday afternoon under S$100",
      "elsewhere",
      ["Thai massage"],
      now,
    );
    expect(parsed).toMatchObject({
      style: "Swedish",
      budgetCents: 10000,
      requestedStart: "2026-09-26T12:00:00+08:00",
    });
    expect(
      parseRequest("massage tomorrow morning", "Tanjong Pagar", [], now).style,
    ).toBe("");
    expect(
      parseRequest(
        "massage tomorrow morning",
        "Tanjong Pagar",
        ["Thai massage"],
        now,
      ).style,
    ).toBe("Thai");
  });
  it("rejects unsupported service, area, invalid/past dates and ambiguous windows", () => {
    for (const text of [
      "book dinner Saturday afternoon",
      "massage near Orchard tomorrow morning",
      "massage 2026-02-30 afternoon",
      "massage 2026-08-29 afternoon",
      "massage sometime",
      "massage Saturday 3pm",
    ])
      expect(() => parseRequest(text, "Tanjong Pagar", [], now)).toThrow();
  });
  it("binds all email contents and recipient into the commitment", () => {
    const i = {
      recipient: "test@example.com",
      subject: "Hello",
      body: "Inquiry",
      testRecipient: true,
      sendEnabled: true,
    };
    const h = inquiryHash("rec", i);
    for (const patch of [
      { recipient: "other@example.com" },
      { subject: "Changed" },
      { body: "Changed" },
      { testRecipient: false },
    ])
      expect(inquiryHash("rec", { ...i, ...patch })).not.toBe(h);
  });
  async function setup() {
    vi.stubEnv("AGENTMAIL_API_KEY", "test-key");
    vi.stubEnv("AGENTMAIL_INBOX_ID", "sender@example.com");
    vi.stubEnv("AGENTMAIL_TEST_RECIPIENT", "test@example.com");
    const t = convexTest(schema, modules);
    await t.mutation(api.genie.bootstrapDemo, { sessionToken });
    const args = await t.run(async (ctx) => {
      const [p] = await ctx.db.query("profiles").take(1);
      const ownerKey = p.ownerKey;
      const intentId = await ctx.db.insert("intents", {
        ownerKey,
        text: "massage",
        category: "wellness",
        service: "massage",
        proximity: "near_me",
        ...parseRequest(
          "massage tomorrow afternoon under S$100",
          "Tanjong Pagar",
          [],
          Date.now(),
        ),
        createdAt: Date.now(),
      });
      const taskId = await ctx.db.insert("tasks", {
        ownerKey,
        intentId,
        status: "processing",
        title: "massage",
        summary: "test",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("researchSources", {
        ownerKey,
        taskId,
        title: "Actual source",
        url: "https://example.com/provider",
        summary: "Massage service page",
        provider: "firecrawl",
        mode: "live",
        createdAt: Date.now(),
      });
      return { taskId, ownerKey };
    });
    await t.mutation(internal.orchestration.prepareApproval, args);
    return { t, args };
  }
  it("builds recommendations from research with unknown price and blocks unapproved sending", async () => {
    const { t, args } = await setup();
    const workspace = await t.query(api.genie.getWorkspace, { sessionToken });
    expect(workspace.recommendations[0].business.name).toBe("Actual source");
    expect(workspace.recommendations[0].business.priceCents).toBeUndefined();
    expect(workspace.recommendations[0].recommendation.score).toBeUndefined();
    await expect(
      t.mutation(internal.agentmail.claimSend, args),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.genie.selectRecommendation, {
        sessionToken: "different-private-session-token",
        taskId: args.taskId,
        recommendationId: workspace.recommendations[0].recommendation._id,
      }),
    ).rejects.toThrow();
  });
  it("claims a send once and refuses a modified approved message", async () => {
    const { t, args } = await setup();
    await t.run(async (ctx) => {
      const a = await ctx.db
        .query("approvals")
        .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
        .unique();
      await ctx.db.patch("approvals", a!._id, { status: "approved" });
      await ctx.db.patch("tasks", args.taskId, { status: "executing" });
    });
    const claim = await t.mutation(internal.agentmail.claimSend, args);
    expect(claim).not.toBeNull();
    expect(await t.mutation(internal.agentmail.claimSend, args)).toBeNull();
    await t.run(async (ctx) => {
      const a = await ctx.db.get("approvals", claim!.approval._id);
      await ctx.db.patch("approvals", a!._id, {
        inquiry: { ...a!.inquiry!, body: "tampered" },
      });
    });
    await expect(
      t.mutation(internal.agentmail.claimSend, args),
    ).rejects.toThrow("changed");
  });
  it("persists ambiguous timeout and never repeats the external call", async () => {
    const { t, args } = await setup();
    await t.run(async (ctx) => {
      const a = await ctx.db
        .query("approvals")
        .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
        .unique();
      await ctx.db.patch("approvals", a!._id, { status: "approved" });
      await ctx.db.patch("tasks", args.taskId, { status: "executing" });
    });
    const fetch = vi.fn().mockRejectedValue(new Error("timeout"));
    vi.stubGlobal("fetch", fetch);
    expect(await t.action(internal.agentmail.sendApprovedInquiry, args)).toBe(
      false,
    );
    expect(await t.action(internal.agentmail.sendApprovedInquiry, args)).toBe(
      false,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    const w = await t.query(api.genie.getWorkspace, { sessionToken });
    expect(w.inquiry?.status).toBe("unknown");
    expect(w.outcome).toBeNull();
  });
  it("persists provider message ID, completes inquiry and creates no booking/calendar event", async () => {
    const { t, args } = await setup();
    await t.run(async (ctx) => {
      const a = await ctx.db
        .query("approvals")
        .withIndex("by_taskId", (q) => q.eq("taskId", args.taskId))
        .unique();
      await ctx.db.patch("approvals", a!._id, { status: "approved" });
      await ctx.db.patch("tasks", args.taskId, { status: "executing" });
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ message_id: "provider-id" }), {
            status: 200,
          }),
        ),
    );
    expect(await t.action(internal.agentmail.sendApprovedInquiry, args)).toBe(
      true,
    );
    await t.mutation(internal.orchestration.executeApproved, args);
    const w = await t.query(api.genie.getWorkspace, { sessionToken });
    expect(w.inquiry?.messageId).toBe("provider-id");
    expect(w.outcome?.status).toBe("inquiry_sent");
    expect(w.booking).toBeNull();
    expect(w.calendarEvent).toBeNull();
  });
  it("does not resurrect a removed memory when the session bootstraps again", async () => {
    const { t } = await setup();
    let w = await t.query(api.genie.getWorkspace, { sessionToken });
    const id = w.memories[0]._id;
    await t.mutation(api.genie.removeMemory, { sessionToken, memoryId: id });
    await t.mutation(api.genie.bootstrapDemo, { sessionToken });
    w = await t.query(api.genie.getWorkspace, { sessionToken });
    expect(w.memories.some((m) => m._id === id)).toBe(false);
  });
});
