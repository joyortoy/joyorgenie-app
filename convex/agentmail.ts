import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction, internalMutation } from "./_generated/server";
import schema from "./schema";
import { inquiryHash, validEmail } from "./lib/inquiry";

export const claimSend = internalMutation({
  args: { taskId: v.id("tasks"), ownerKey: v.string() },
  returns: v.union(
    v.object({
      inquiryId: v.id("inquiries"),
      approval: schema.doc("approvals"),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("tasks", args.taskId);
    if (!task || task.ownerKey !== args.ownerKey || task.status !== "executing")
      throw new Error("Execution blocked.");
    const approval = await ctx.db
      .query("approvals")
      .withIndex("by_taskId", (q) => q.eq("taskId", task._id))
      .unique();
    if (
      !approval ||
      approval.status !== "approved" ||
      !approval.inquiry?.sendEnabled
    )
      throw new Error("Exact email approval required.");
    if (
      inquiryHash(approval.recommendationId, approval.inquiry) !==
      approval.commitmentHash
    )
      throw new Error("Approved email changed.");
    if (
      !validEmail(approval.inquiry.recipient) ||
      approval.inquiry.recipient !== env.AGENTMAIL_TEST_RECIPIENT ||
      !approval.inquiry.testRecipient
    )
      throw new Error("Verified test recipient configuration changed.");
    const recommendation = await ctx.db.get(
      "recommendations",
      approval.recommendationId,
    );
    if (!recommendation || Date.parse(recommendation.slotStart) <= Date.now())
      throw new Error("Requested time has passed.");
    if (!env.AGENTMAIL_API_KEY || !env.AGENTMAIL_INBOX_ID)
      throw new Error("AgentMail is not configured.");
    const existing = await ctx.db
      .query("inquiries")
      .withIndex("by_taskId", (q) => q.eq("taskId", task._id))
      .unique();
    if (existing) return null; // Sending/unknown is never blindly retried.
    const inquiryId = await ctx.db.insert("inquiries", {
      ownerKey: args.ownerKey,
      taskId: task._id,
      approvalId: approval._id,
      status: "sending",
      detail:
        "Send attempt reserved; if interrupted, reconcile with AgentMail before resending.",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { inquiryId, approval };
  },
});
export const recordSend = internalMutation({
  args: {
    inquiryId: v.id("inquiries"),
    status: v.union(
      v.literal("sent"),
      v.literal("failed"),
      v.literal("unknown"),
    ),
    messageId: v.optional(v.string()),
    detail: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const inquiry = await ctx.db.get("inquiries", args.inquiryId);
    if (!inquiry) throw new Error("Inquiry missing.");
    if (inquiry.status === "sent") return null;
    if (args.status === "sent" && !args.messageId)
      throw new Error("Message ID required.");
    await ctx.db.patch("inquiries", inquiry._id, {
      status: args.status,
      ...(args.messageId ? { messageId: args.messageId } : {}),
      detail: args.detail,
      updatedAt: Date.now(),
    });
    return null;
  },
});
export const sendApprovedInquiry = internalAction({
  args: { taskId: v.id("tasks"), ownerKey: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const claim = await ctx.runMutation(internal.agentmail.claimSend, args);
    if (!claim) return false;
    const inquiry = claim.approval.inquiry!;
    try {
      const response = await fetch(
        `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(env.AGENTMAIL_INBOX_ID!)}/messages/send`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${env.AGENTMAIL_API_KEY}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            to: [inquiry.recipient],
            subject: inquiry.subject,
            text: inquiry.body,
          }),
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!response.ok) {
        await ctx.runMutation(internal.agentmail.recordSend, {
          inquiryId: claim.inquiryId,
          status: response.status >= 500 ? "unknown" : "failed",
          detail: `AgentMail returned HTTP ${response.status}. Automatic resend disabled.`,
        });
        return false;
      }
      const result: unknown = await response.json();
      if (
        !result ||
        typeof result !== "object" ||
        !("message_id" in result) ||
        typeof result.message_id !== "string" ||
        !result.message_id
      )
        throw new Error("Missing message ID.");
      await ctx.runMutation(internal.agentmail.recordSend, {
        inquiryId: claim.inquiryId,
        status: "sent",
        messageId: result.message_id,
        detail:
          "AgentMail accepted the test inquiry. Awaiting reply; not a booking.",
      });
      return true;
    } catch {
      await ctx.runMutation(internal.agentmail.recordSend, {
        inquiryId: claim.inquiryId,
        status: "unknown",
        detail:
          "Send outcome unknown. Check AgentMail before any resend; automatic retries are disabled.",
      });
      return false;
    }
  },
});
