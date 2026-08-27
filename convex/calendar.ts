import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { action, env, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { ownerKeyFor, stableCommitmentHash } from "./lib/ownership";

const sessionArgs = { sessionToken: v.string() };

async function usableAccessToken(
  ctx: ActionCtx,
  connection: {
    ownerKey: string;
    accessToken: string;
    refreshToken: string | null;
    expiresAt: number | null;
  },
): Promise<string> {
  if (connection.expiresAt === null || connection.expiresAt > Date.now() + 60_000) {
    return connection.accessToken;
  }
  if (!connection.refreshToken || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Google Calendar authorization expired. Reconnect Calendar to continue.");
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: connection.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error(`Google Calendar token refresh failed (${response.status}).`);
  const payload = await response.json() as { access_token?: unknown; expires_in?: unknown };
  if (typeof payload.access_token !== "string") throw new Error("Google did not return a refreshed access token.");
  const expiresAt = Date.now() + (typeof payload.expires_in === "number" ? payload.expires_in : 3600) * 1000;
  await ctx.runMutation(internal.calendar.persistRefreshedToken, {
    ownerKey: connection.ownerKey,
    accessToken: payload.access_token,
    expiresAt,
  });
  return payload.access_token;
}

export const beginGoogleCalendarConnect = action({
  args: sessionArgs,
  returns: v.object({ authUrl: v.string() }),
  handler: async (ctx, args): Promise<{ authUrl: string }> => {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_OAUTH_REDIRECT_URI) {
      throw new Error("Google Calendar OAuth is not configured. Use Demo Calendar or add the documented server environment variables.");
    }
    const ownerKey = await ownerKeyFor(ctx, args.sessionToken);
    const state = crypto.randomUUID();
    await ctx.runMutation(internal.calendar.storeOAuthState, { ownerKey, state });
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      state,
      scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly",
    });
    return { authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` };
  },
});

export const completeGoogleCalendarConnect = action({
  args: { ...sessionArgs, state: v.string(), code: v.string() },
  returns: v.object({ connected: v.boolean() }),
  handler: async (ctx, args): Promise<{ connected: boolean }> => {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_OAUTH_REDIRECT_URI) throw new Error("Google Calendar OAuth is not configured.");
    const ownerKey = await ownerKeyFor(ctx, args.sessionToken);
    const valid: boolean = await ctx.runQuery(internal.calendar.validateOAuthState, { ownerKey, state: args.state });
    if (!valid) throw new Error("OAuth state is invalid, expired, or already used.");
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, code: args.code, grant_type: "authorization_code", redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI }),
    });
    if (!response.ok) throw new Error(`Google token exchange failed (${response.status}).`);
    const payload = await response.json() as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; scope?: unknown };
    if (typeof payload.access_token !== "string") throw new Error("Google did not return an access token.");
    await ctx.runMutation(internal.calendar.persistOAuthConnection, {
      ownerKey,
      state: args.state,
      accessToken: payload.access_token,
      refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : null,
      expiresAt: Date.now() + (typeof payload.expires_in === "number" ? payload.expires_in : 3600) * 1000,
      scope: typeof payload.scope === "string" ? payload.scope : "",
    });
    return { connected: true };
  },
});

export const checkGoogleAvailability = action({
  args: { ...sessionArgs, timeMin: v.string(), timeMax: v.string() },
  returns: v.object({
    mode: v.union(v.literal("google"), v.literal("demo")),
    busy: v.array(v.object({ start: v.string(), end: v.string() })),
    disclosure: v.string(),
  }),
  handler: async (ctx, args): Promise<{ mode: "google" | "demo"; busy: Array<{ start: string; end: string }>; disclosure: string }> => {
    const startMs = Date.parse(args.timeMin);
    const endMs = Date.parse(args.timeMax);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || endMs - startMs > 7 * 24 * 60 * 60 * 1000) {
      throw new Error("Availability requires a valid window of at most seven days.");
    }
    const ownerKey = await ownerKeyFor(ctx, args.sessionToken);
    const connection: { ownerKey: string; mode: "demo" | "oauth"; status: "connected" | "expired"; accessToken: string | null; refreshToken: string | null; expiresAt: number | null } | null = await ctx.runQuery(internal.calendar.privateCalendarConnection, { ownerKey });
    if (!connection || connection.mode !== "oauth" || !connection.accessToken) {
      return { mode: "demo", busy: [], disclosure: "Demo availability only; Google Calendar is not connected." };
    }
    const accessToken = await usableAccessToken(ctx, {
      ownerKey,
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken,
      expiresAt: connection.expiresAt,
    });
    const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ timeMin: new Date(startMs).toISOString(), timeMax: new Date(endMs).toISOString(), timeZone: "Asia/Singapore", items: [{ id: "primary" }] }),
    });
    if (!response.ok) throw new Error(`Google Calendar availability check failed (${response.status}).`);
    const payload = await response.json() as { calendars?: unknown };
    const calendars = payload.calendars;
    if (typeof calendars !== "object" || calendars === null) throw new Error("Google Calendar returned an invalid availability response.");
    const primary = (calendars as Record<string, unknown>).primary;
    if (typeof primary !== "object" || primary === null) throw new Error("Google Calendar did not return primary-calendar availability.");
    const rawBusy = (primary as Record<string, unknown>).busy;
    if (!Array.isArray(rawBusy)) throw new Error("Google Calendar returned invalid busy intervals.");
    const busy = rawBusy.flatMap((item) => {
      if (typeof item !== "object" || item === null) return [];
      const start = (item as Record<string, unknown>).start;
      const end = (item as Record<string, unknown>).end;
      return typeof start === "string" && typeof end === "string" ? [{ start, end }] : [];
    });
    return { mode: "google", busy, disclosure: "Live busy intervals read from the connected primary Google Calendar." };
  },
});

export const storeOAuthState = internalMutation({
  args: { ownerKey: v.string(), state: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("oauthStates", { ownerKey: args.ownerKey, provider: "google", state: args.state, expiresAt: Date.now() + 10 * 60 * 1000 });
    return null;
  },
});

export const validateOAuthState = internalQuery({
  args: { ownerKey: v.string(), state: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const state = await ctx.db.query("oauthStates").withIndex("by_state", (q) => q.eq("state", args.state)).unique();
    return state !== null && state.ownerKey === args.ownerKey && state.usedAt === undefined && state.expiresAt > Date.now();
  },
});

export const persistOAuthConnection = internalMutation({
  args: { ownerKey: v.string(), state: v.string(), accessToken: v.string(), refreshToken: v.union(v.string(), v.null()), expiresAt: v.number(), scope: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const oauthState = await ctx.db.query("oauthStates").withIndex("by_state", (q) => q.eq("state", args.state)).unique();
    if (!oauthState || oauthState.ownerKey !== args.ownerKey || oauthState.usedAt !== undefined || oauthState.expiresAt <= Date.now()) throw new Error("OAuth state expired before persistence.");
    const existing = await ctx.db.query("calendarConnections").withIndex("by_ownerKey", (q) => q.eq("ownerKey", args.ownerKey)).unique();
    const value = { ownerKey: args.ownerKey, provider: "google" as const, mode: "oauth" as const, status: "connected" as const, accessToken: args.accessToken, ...(args.refreshToken ? { refreshToken: args.refreshToken } : {}), expiresAt: args.expiresAt, scope: args.scope, updatedAt: Date.now() };
    if (existing) await ctx.db.replace("calendarConnections", existing._id, value);
    else await ctx.db.insert("calendarConnections", value);
    await ctx.db.patch("oauthStates", oauthState._id, { usedAt: Date.now() });
    await ctx.db.insert("auditLogs", { ownerKey: args.ownerKey, event: "google_calendar_connected", detail: "Google Calendar OAuth completed; tokens are server-only.", createdAt: Date.now() });
    return null;
  },
});

export const privateCalendarConnection = internalQuery({
  args: { ownerKey: v.string() },
  returns: v.union(
    v.object({
      ownerKey: v.string(),
      mode: v.union(v.literal("demo"), v.literal("oauth")),
      status: v.union(v.literal("connected"), v.literal("expired")),
      accessToken: v.union(v.string(), v.null()),
      refreshToken: v.union(v.string(), v.null()),
      expiresAt: v.union(v.number(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const connection = await ctx.db.query("calendarConnections").withIndex("by_ownerKey", (q) => q.eq("ownerKey", args.ownerKey)).unique();
    if (!connection) return null;
    return {
      ownerKey: connection.ownerKey,
      mode: connection.mode,
      status: connection.status,
      accessToken: connection.accessToken ?? null,
      refreshToken: connection.refreshToken ?? null,
      expiresAt: connection.expiresAt ?? null,
    };
  },
});

export const persistRefreshedToken = internalMutation({
  args: { ownerKey: v.string(), accessToken: v.string(), expiresAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.query("calendarConnections").withIndex("by_ownerKey", (q) => q.eq("ownerKey", args.ownerKey)).unique();
    if (!connection || connection.mode !== "oauth") throw new Error("Google Calendar connection no longer exists.");
    await ctx.db.patch("calendarConnections", connection._id, { accessToken: args.accessToken, expiresAt: args.expiresAt, status: "connected", updatedAt: Date.now() });
    await ctx.db.insert("auditLogs", { ownerKey: args.ownerKey, event: "google_calendar_token_refreshed", detail: "Server refreshed Google Calendar access without exposing tokens to the client.", createdAt: Date.now() });
    return null;
  },
});

export const approvedEventContext = internalQuery({
  args: { taskId: v.id("tasks"), ownerKey: v.string() },
  returns: v.object({ title: v.string(), start: v.string(), end: v.string(), accessToken: v.union(v.string(), v.null()), refreshToken: v.union(v.string(), v.null()), expiresAt: v.union(v.number(), v.null()), connectionMode: v.union(v.literal("demo"), v.literal("oauth"), v.null()) }),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("tasks", args.taskId);
    if (!task || task.ownerKey !== args.ownerKey) throw new Error("Task ownership changed.");
    const approval = await ctx.db.query("approvals").withIndex("by_taskId", (q) => q.eq("taskId", task._id)).unique();
    if (!approval || approval.status !== "approved") throw new Error("Calendar execution requires exact approval.");
    const recommendation = await ctx.db.get("recommendations", approval.recommendationId);
    if (!recommendation) throw new Error("Recommendation missing.");
    const business = await ctx.db.get("businesses", recommendation.businessId);
    if (!business) throw new Error("Business missing.");
    const expected = stableCommitmentHash(`${recommendation._id}|${recommendation.slotStart}|${recommendation.slotEnd}|${approval.amountCents}|${approval.currency}`);
    if (expected !== approval.commitmentHash) throw new Error("Approved commitment no longer matches the event.");
    const connection = await ctx.db.query("calendarConnections").withIndex("by_ownerKey", (q) => q.eq("ownerKey", args.ownerKey)).unique();
    return { title: `${business.treatment} · ${business.name}`, start: recommendation.slotStart, end: recommendation.slotEnd, accessToken: connection?.mode === "oauth" && connection.status === "connected" ? connection.accessToken ?? null : null, refreshToken: connection?.mode === "oauth" ? connection.refreshToken ?? null : null, expiresAt: connection?.mode === "oauth" ? connection.expiresAt ?? null : null, connectionMode: connection?.mode ?? null };
  },
});

export const persistCalendarEvent = internalMutation({
  args: { taskId: v.id("tasks"), ownerKey: v.string(), title: v.string(), start: v.string(), end: v.string(), providerEventId: v.string(), status: v.union(v.literal("confirmed"), v.literal("demo_confirmed")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("calendarEvents").withIndex("by_taskId", (q) => q.eq("taskId", args.taskId)).unique();
    if (!existing) await ctx.db.insert("calendarEvents", { ownerKey: args.ownerKey, taskId: args.taskId, provider: "google", providerEventId: args.providerEventId, title: args.title, start: args.start, end: args.end, status: args.status, createdAt: Date.now() });
    return null;
  },
});

export const createApprovedEvent = internalAction({
  args: { taskId: v.id("tasks"), ownerKey: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const details: { title: string; start: string; end: string; accessToken: string | null; refreshToken: string | null; expiresAt: number | null; connectionMode: "demo" | "oauth" | null } = await ctx.runQuery(internal.calendar.approvedEventContext, args);
    if (!details.accessToken) {
      await ctx.runMutation(internal.calendar.persistCalendarEvent, { ...args, title: details.title, start: details.start, end: details.end, providerEventId: `demo-${args.taskId}`, status: "demo_confirmed" });
      return null;
    }
    const accessToken = await usableAccessToken(ctx, { ownerKey: args.ownerKey, accessToken: details.accessToken, refreshToken: details.refreshToken, expiresAt: details.expiresAt });
    const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ summary: details.title, description: "Created by JoyOrGenie after exact user approval.", start: { dateTime: details.start }, end: { dateTime: details.end } }),
    });
    if (!response.ok) throw new Error(`Google Calendar event creation failed (${response.status}).`);
    const payload = await response.json() as { id?: unknown };
    if (typeof payload.id !== "string") throw new Error("Google Calendar did not return an event id.");
    await ctx.runMutation(internal.calendar.persistCalendarEvent, { ...args, title: details.title, start: details.start, end: details.end, providerEventId: payload.id, status: "confirmed" });
    return null;
  },
});
