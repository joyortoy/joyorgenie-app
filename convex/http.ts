import { httpRouter } from "convex/server";
import { env, httpAction } from "./_generated/server";

const http = httpRouter();

http.route({
  path: "/google-calendar/callback",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    if (!env.APP_URL) {
      return new Response("Google Calendar callback is not configured.", {
        status: 500,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    let destination: URL;
    try {
      destination = new URL(env.APP_URL);
      if (destination.protocol !== "http:" && destination.protocol !== "https:") {
        throw new Error("Unsupported APP_URL protocol.");
      }
    } catch {
      return new Response("Google Calendar callback APP_URL is invalid.", {
        status: 500,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    const callback = new URL(request.url);
    const code = callback.searchParams.get("code");
    const state = callback.searchParams.get("state");
    const providerError = callback.searchParams.get("error");

    // Never reflect Google's raw error description or any other query value.
    // The browser receives only bounded markers or the two values required for
    // the app to finish the server-side token exchange with its private session.
    if (providerError) {
      destination.searchParams.set("calendar_error", "oauth_denied");
    } else if (!code || !state || code.length > 4096 || state.length > 512) {
      destination.searchParams.set("calendar_error", "invalid_callback");
    } else {
      destination.searchParams.set("calendar_code", code);
      destination.searchParams.set("calendar_state", state);
    }

    return new Response(null, {
      status: 302,
      headers: {
        location: destination.toString(),
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      },
    });
  }),
});

export default http;
