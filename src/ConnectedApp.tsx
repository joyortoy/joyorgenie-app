import { useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import App, { type BackendBridge } from "./App";

type Workspace = FunctionReturnType<typeof api.genie.getWorkspace>;
const SESSION_KEY = "joyorgenie.demo.session.v1";

function getSessionToken() {
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const token = crypto.randomUUID();
  window.localStorage.setItem(SESSION_KEY, token);
  return token;
}

export default function ConnectedApp() {
  const sessionToken = useMemo(getSessionToken, []);
  const bootstrapped = useRef(false);
  const [calendarError, setCalendarError] = useState<string>();
  const workspace = useQuery(api.genie.getWorkspace, { sessionToken });
  const bootstrapDemo = useMutation(api.genie.bootstrapDemo);
  const submitIntent = useMutation(api.genie.submitIntent);
  const approveAction = useMutation(api.genie.approveAction);
  const rejectAction = useMutation(api.genie.rejectAction);
  const retryTask = useMutation(api.genie.retryTask);
  const submitFeedback = useMutation(api.genie.submitFeedback);
  const removeMemory = useMutation(api.genie.removeMemory);
  const updateLocation = useMutation(api.genie.setLocation);
  const enableDemoCalendar = useMutation(api.genie.enableDemoCalendar);
  const beginGoogleCalendarConnect = useAction(api.calendar.beginGoogleCalendarConnect);
  const completeGoogleCalendarConnect = useAction(api.calendar.completeGoogleCalendarConnect);

  useEffect(() => {
    if (bootstrapped.current || workspace === undefined || workspace.profile) return;
    bootstrapped.current = true;
    void bootstrapDemo({ sessionToken }).catch(() => { bootstrapped.current = false; });
  }, [bootstrapDemo, sessionToken, workspace]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const state = params.get("calendar_state");
    const code = params.get("calendar_code");
    const callbackError = params.get("calendar_error");
    if (callbackError) {
      setCalendarError(`Google Calendar connection failed (${callbackError}).`);
      params.delete("calendar_error");
      window.history.replaceState({}, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
      return;
    }
    if (!state || !code) return;
    void completeGoogleCalendarConnect({ sessionToken, state, code }).finally(() => {
      params.delete("calendar_state");
      params.delete("calendar_code");
      window.history.replaceState({}, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
    });
  }, [completeGoogleCalendarConnect, sessionToken]);

  const backend: BackendBridge = {
    workspace: (workspace ?? null) as Workspace | null,
    calendarError,
    submit: async (text, simulateFailure = false) => { await submitIntent({ sessionToken, text, simulateFailure }); },
    approve: async (taskId, commitmentHash) => { await approveAction({ sessionToken, taskId: taskId as Id<"tasks">, commitmentHash }); },
    reject: async (taskId) => { await rejectAction({ sessionToken, taskId: taskId as Id<"tasks"> }); },
    retry: async (taskId) => { await retryTask({ sessionToken, taskId: taskId as Id<"tasks"> }); },
    feedback: async (taskId, rating) => { await submitFeedback({ sessionToken, taskId: taskId as Id<"tasks">, rating }); },
    removeMemory: async (memoryId) => { await removeMemory({ sessionToken, memoryId: memoryId as Id<"memories"> }); },
    setLocation: async (value) => { await updateLocation({ sessionToken, ...value }); },
    enableDemoCalendar: async () => { await enableDemoCalendar({ sessionToken }); },
    connectGoogleCalendar: async () => {
      const { authUrl } = await beginGoogleCalendarConnect({ sessionToken });
      window.location.assign(authUrl);
    },
  };

  return <App backend={backend} />;
}
