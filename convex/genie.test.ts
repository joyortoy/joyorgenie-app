// @vitest-environment edge-runtime

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { stableCommitmentHash } from "./lib/ownership";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const sessionToken = "private-test-session-123456789";

describe("JoyOrGenie backend", () => {
  it("uses a standards-compatible SHA-256 digest", () => {
    expect(stableCommitmentHash("abc")).toBe(
      "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("bootstraps idempotently and never persists the bearer session token", async () => {
    const t = convexTest(schema, modules);
    const first = await t.mutation(api.genie.bootstrapDemo, { sessionToken });
    const second = await t.mutation(api.genie.bootstrapDemo, { sessionToken });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.profileId).toBe(first.profileId);

    const workspace = await t.query(api.genie.getWorkspace, { sessionToken });
    expect(workspace.memories.map((memory) => memory.kind)).toEqual(
      expect.arrayContaining(["explicit", "inferred", "experience"]),
    );
    expect(JSON.stringify(workspace)).not.toContain(sessionToken);
  });

  it("blocks execution when no exact pending approval exists", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.genie.bootstrapDemo, { sessionToken });
    const taskId = await t.run(async (ctx) => {
      const profile = await ctx.db.query("profiles").take(1);
      const ownerKey = profile[0].ownerKey;
      const intentId = await ctx.db.insert("intents", {
        ownerKey,
        text: "massage near me",
        category: "wellness",
        service: "massage",
        requestedWindow: "Saturday afternoon",
        proximity: "near_me",
        createdAt: 1,
      });
      return await ctx.db.insert("tasks", {
        ownerKey,
        intentId,
        status: "awaiting_approval",
        title: "Test task",
        summary: "Awaiting approval",
        workflowId: "fake-workflow",
        createdAt: 1,
        updatedAt: 1,
      });
    });

    await expect(
      t.mutation(api.genie.approveAction, {
        sessionToken,
        taskId,
        commitmentHash: "forged",
      }),
    ).rejects.toThrow("No pending approval exists");

    const sideEffects = await t.run(async (ctx) => ({
      events: await ctx.db.query("calendarEvents").take(10),
      bookings: await ctx.db.query("bookings").take(10),
    }));
    expect(sideEffects.events).toHaveLength(0);
    expect(sideEffects.bookings).toHaveLength(0);
  });
});
