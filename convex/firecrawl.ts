import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction, internalMutation } from "./_generated/server";

const researchResult = v.object({
  title: v.string(),
  url: v.string(),
  summary: v.string(),
});

type ResearchResult = {
  title: string;
  url: string;
  summary: string;
};

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function safeWebUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function parseFirecrawlSearchResponse(payload: unknown): ResearchResult[] {
  if (typeof payload !== "object" || payload === null) return [];
  const data = (payload as Record<string, unknown>).data;
  if (typeof data !== "object" || data === null) return [];
  const web = (data as Record<string, unknown>).web;
  if (!Array.isArray(web)) return [];
  const results: ResearchResult[] = [];
  for (const item of web) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const url = safeWebUrl(record.url);
    const title = cleanText(record.title, 160);
    const summary = cleanText(record.description, 320);
    if (!url || !title) continue;
    results.push({ title, url, summary: summary || "Live provider page discovered by Firecrawl." });
    if (results.length === 3) break;
  }
  return results;
}

export const replaceResearchSources = internalMutation({
  args: {
    taskId: v.id("tasks"),
    ownerKey: v.string(),
    mode: v.union(v.literal("live"), v.literal("fallback")),
    results: v.array(researchResult),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("tasks", args.taskId);
    if (!task || task.ownerKey !== args.ownerKey) throw new Error("Task ownership changed.");
    const existing = await ctx.db.query("researchSources").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).take(10);
    for (const source of existing) await ctx.db.delete("researchSources", source._id);
    const now = Date.now();
    for (const result of args.results) {
      await ctx.db.insert("researchSources", {
        ownerKey: args.ownerKey,
        taskId: task._id,
        ...result,
        provider: "firecrawl",
        mode: args.mode,
        createdAt: now,
      });
    }
    return null;
  },
});

export const researchLocalProviders = internalAction({
  args: { taskId: v.id("tasks"), ownerKey: v.string(), query: v.string(), location: v.string() },
  returns: v.object({
    mode: v.union(v.literal("live"), v.literal("fallback")),
    resultCount: v.number(),
    detail: v.string(),
  }),
  handler: async (ctx, args): Promise<{ mode: "live" | "fallback"; resultCount: number; detail: string }> => {
    const apiKey = env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      const persisted: null = await ctx.runMutation(internal.firecrawl.replaceResearchSources, {
        taskId: args.taskId,
        ownerKey: args.ownerKey,
        mode: "fallback",
        results: [],
      });
      void persisted;
      return { mode: "fallback", resultCount: 0, detail: "Firecrawl is not configured; research is blocked until configured." };
    }

    try {
      const response = await fetch("https://api.firecrawl.dev/v2/search", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          query: `${args.query.slice(0, 360)} near ${args.location.slice(0, 100)}`,
          limit: 3,
          sources: ["web"],
          country: "SG",
          location: "Singapore",
          timeout: 20_000,
        }),
      });
      if (!response.ok) throw new Error(`Firecrawl search failed (${response.status}).`);
      const results = parseFirecrawlSearchResponse(await response.json());
      if (results.length === 0) throw new Error("Firecrawl returned no usable provider sources.");
      const persisted: null = await ctx.runMutation(internal.firecrawl.replaceResearchSources, {
        taskId: args.taskId,
        ownerKey: args.ownerKey,
        mode: "live",
        results,
      });
      void persisted;
      return {
        mode: "live",
        resultCount: results.length,
        detail: `Firecrawl scanned ${results.length} live provider pages; these sources become the selectable options. Prices and availability are unconfirmed.`,
      };
    } catch {
      const persisted: null = await ctx.runMutation(internal.firecrawl.replaceResearchSources, {
        taskId: args.taskId,
        ownerKey: args.ownerKey,
        mode: "fallback",
        results: [],
      });
      void persisted;
      return { mode: "fallback", resultCount: 0, detail: "Live Firecrawl research was unavailable; no recommendations fabricated; retry when available." };
    }
  },
});
