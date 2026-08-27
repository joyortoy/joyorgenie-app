import agent from "@convex-dev/agent/convex.config.js";
import workflow from "@convex-dev/workflow/convex.config.js";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    GOOGLE_CLIENT_ID: v.optional(v.string()),
    GOOGLE_CLIENT_SECRET: v.optional(v.string()),
    GOOGLE_OAUTH_REDIRECT_URI: v.optional(v.string()),
    APP_URL: v.optional(v.string()),
    JOYFNB_API_URL: v.optional(v.string()),
    JOYFNB_API_TOKEN: v.optional(v.string()),
  },
});

app.use(workflow);
app.use(agent);

export default app;
