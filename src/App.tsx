import { useEffect, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../convex/_generated/api";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Compass,
  Heart,
  LoaderCircle,
  MapPin,
  MemoryStick,
  ShieldCheck,
  Sparkles,
  Star,
  X,
} from "lucide-react";

type View = "genie" | "memory";
type JourneyState = "idle" | "working" | "approval" | "complete" | "failed";
type Workspace = FunctionReturnType<typeof api.genie.getWorkspace>;

export type BackendBridge = {
  workspace: Workspace | null;
  calendarError?: string;
  submit: (text: string, simulateFailure?: boolean) => Promise<void>;
  select: (taskId: string, recommendationId: string) => Promise<void>;
  approve: (taskId: string, commitmentHash: string) => Promise<void>;
  reject: (taskId: string) => Promise<void>;
  retry: (taskId: string) => Promise<void>;
  feedback: (taskId: string, rating: number) => Promise<void>;
  removeMemory: (memoryId: string) => Promise<void>;
  setLocation: (value: {
    label: string;
    latitude: number;
    longitude: number;
    source: "browser" | "manual";
    accuracyMeters?: number;
  }) => Promise<void>;
  enableDemoCalendar: () => Promise<void>;
  connectGoogleCalendar: () => Promise<void>;
};

const examples = [
  "Find me a massage this Saturday afternoon near me",
  "Find Thai massage near Tanjong Pagar this Saturday afternoon under S$100",
  "Find a massage in Tanjong Pagar tomorrow morning",
];

const fallbackOptions = [
  {
    name: "Siam Stillness",
    kind: "Traditional Thai massage",
    distance: "8 min away",
    time: "Saturday, 3:00 PM",
    price: "$88 · 60 min",
    score: 96,
    reason: "Closest match to the Thai massage you rated 9/10.",
    best: true,
  },
  {
    name: "The Tides Wellness",
    kind: "Thai fusion massage",
    distance: "12 min away",
    time: "Saturday, 2:30 PM",
    price: "$105 · 60 min",
    score: 90,
    reason: "A quieter setting with excellent recent reviews.",
  },
  {
    name: "Knead & Breathe",
    kind: "Deep-tissue massage",
    distance: "14 min away",
    time: "Saturday, 4:00 PM",
    price: "$92 · 60 min",
    score: 84,
    reason:
      "Fits your calendar, but is less aligned with your preferred style.",
  },
];

const journey = [
  ["Understood", "Massage · Saturday afternoon · nearby"],
  ["Remembered", "Thai massage · rated 9/10 · within 15 min"],
  ["Checked calendar", "Free between 2:00 and 5:30 PM"],
  ["Compared", "12 nearby places · 3 strong matches"],
] as const;

export default function App({ backend }: { backend?: BackendBridge }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>("genie");
  const [intent, setIntent] = useState("");
  const [example, setExample] = useState(0);
  const [state, setState] = useState<JourneyState>("idle");
  const [progress, setProgress] = useState(0);
  const [location, setLocation] = useState("Tiong Bahru");
  const [locationPending, setLocationPending] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState("");
  const [localMemories, setLocalMemories] = useState([
    {
      id: 1,
      label: "You enjoy Thai massage",
      detail: "Rated 9/10 after your last visit",
      kind: "Experience",
      confidence: 1,
    },
    {
      id: 2,
      label: "Keep travel under 15 minutes",
      detail: "Inferred from three recent choices",
      kind: "Inferred",
      confidence: 0.82,
    },
    {
      id: 3,
      label: "Prefer calm, low-noise places",
      detail: "You told Genie directly",
      kind: "Explicit",
      confidence: 1,
    },
  ]);
  const workspace = backend?.workspace;
  const memories = workspace
    ? workspace.memories.map((memory) => ({
        id: memory._id as string | number,
        label: memory.value,
        detail: memory.provenance,
        kind: memory.kind[0].toUpperCase() + memory.kind.slice(1),
        confidence: memory.confidence,
      }))
    : localMemories;
  const resultOptions = workspace?.recommendations.length
    ? workspace.recommendations.map(({ recommendation, business }, index) => ({
        id: recommendation._id,
        selected: workspace.approval?.recommendationId === recommendation._id,
        url: business.sourceUrl,
        name: business.name,
        kind: business.treatment,
        distance:
          business.travelMinutes === undefined
            ? "Travel time unknown"
            : `${business.travelMinutes} min away`,
        time: `Requested: ${new Date(recommendation.slotStart).toLocaleString("en-SG", { timeZone: "Asia/Singapore", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}–${new Date(recommendation.slotEnd).toLocaleTimeString("en-SG", { timeZone: "Asia/Singapore", hour: "numeric", minute: "2-digit" })} SGT`,
        price:
          business.priceCents === undefined
            ? "Price unconfirmed"
            : `S$${(business.priceCents / 100).toFixed(2)}`,
        score: recommendation.score,
        reason: recommendation.reason,
        evidence: recommendation.evidenceSummary,
        source: business.source,
        best: index === 0,
      }))
    : backend
      ? []
      : fallbackOptions;

  useEffect(() => {
    if (state !== "idle") return;
    const timer = window.setInterval(
      () => setExample((value) => (value + 1) % examples.length),
      3600,
    );
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(() => {
    if (state !== "working") return;
    if (backend) return;
    const timer = window.setInterval(() => {
      setProgress((value) => {
        if (value >= journey.length) {
          window.clearInterval(timer);
          setState("approval");
          return value;
        }
        return value + 1;
      });
    }, 620);
    return () => window.clearInterval(timer);
  }, [backend, state]);

  useEffect(() => {
    if (!workspace?.task) return;
    setIntent(workspace.task.title);
    setProgress(
      workspace.stages.filter((stage) => stage.status === "complete").length,
    );
    if (
      workspace.task.status === "processing" ||
      workspace.task.status === "executing"
    )
      setState("working");
    if (workspace.task.status === "awaiting_approval") setState("approval");
    if (workspace.task.status === "failed") setState("failed");
    if (workspace.task.status === "completed") setState("complete");
    if (workspace.task.status === "rejected") setState("idle");
  }, [workspace]);

  useEffect(() => {
    if (workspace?.location) setLocation(workspace.location.label);
  }, [workspace?.location]);

  useEffect(() => {
    if (backend?.calendarError) setCalendarMessage(backend.calendarError);
  }, [backend?.calendarError]);

  const firstName = workspace?.profile?.displayName ?? "Joy";

  async function begin() {
    const text = intent.trim() || examples[0];
    setIntent(text);
    setProgress(0);
    setState("working");
    setError("");
    if (backend) {
      try {
        await backend.submit(text);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed.");
        setState("idle");
      }
    }
  }

  function useLocation() {
    setLocationPending(true);
    if (!navigator.geolocation) {
      setLocationPending(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation("Near your current location");
        if (backend)
          void backend.setLocation({
            label: "Near your current location",
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            source: "browser",
            accuracyMeters: position.coords.accuracy,
          });
        setLocationPending(false);
      },
      () => setLocationPending(false),
      { maximumAge: 300_000, timeout: 8_000 },
    );
  }

  async function approveCurrent() {
    if (backend && workspace?.task && workspace.approval) {
      setBusy(true);
      setError("");
      try {
        await backend.approve(
          workspace.task._id,
          workspace.approval.commitmentHash,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Approval failed.");
      } finally {
        setBusy(false);
      }
      return;
    }
    setState("complete");
  }

  async function cancelCurrent() {
    if (backend && workspace?.task?.status === "awaiting_approval") {
      await backend.reject(workspace.task._id);
      return;
    }
    setState("idle");
  }

  async function removeCurrentMemory(id: string | number) {
    if (backend) await backend.removeMemory(String(id));
    else setLocalMemories((items) => items.filter((item) => item.id !== id));
  }

  async function connectGoogle() {
    if (!backend) return;
    setCalendarMessage("");
    try {
      await backend.connectGoogleCalendar();
    } catch (error) {
      setCalendarMessage(
        error instanceof Error
          ? error.message
          : "Google Calendar is not configured.",
      );
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => {
            setView("genie");
            setState("idle");
          }}
          aria-label="JoyOrGenie home"
        >
          <span className="brand-mark">
            <Sparkles size={18} />
          </span>
          <span>JoyOrGenie</span>
        </button>
        <nav aria-label="Primary">
          <button
            className={view === "genie" ? "active" : ""}
            onClick={() => setView("genie")}
          >
            Genie
          </button>
          <button
            className={view === "memory" ? "active" : ""}
            onClick={() => setView("memory")}
          >
            Memory
          </button>
        </nav>
        <div className="status-cluster">
          <button
            className="status-pill"
            onClick={useLocation}
            disabled={locationPending}
          >
            {locationPending ? (
              <LoaderCircle className="spin" size={14} />
            ) : (
              <MapPin size={14} />
            )}
            {location}
          </button>
          <span className="avatar">J</span>
        </div>
      </header>

      <main>
        {error && (
          <p role="alert" className="connection-note">
            {error}
          </p>
        )}
        {workspace?.task?.status === "failed" && (
          <div role="alert" className="connection-note">
            <p>{workspace.task.summary}</p>
            {workspace.inquiry ? (
              <p>{workspace.inquiry.detail}</p>
            ) : (
              <button
                onClick={() =>
                  backend
                    ?.retry(workspace.task!._id)
                    .catch((e) => setError(String(e)))
                }
              >
                Retry research
              </button>
            )}
          </div>
        )}

        {view === "memory" ? (
          <MemoryView memories={memories} onRemove={removeCurrentMemory} />
        ) : state === "idle" ? (
          <Home
            firstName={firstName}
            intent={intent}
            setIntent={setIntent}
            example={examples[example]}
            begin={begin}
            useLocation={useLocation}
            location={location}
            memoryCount={memories.length}
            calendarMode={workspace?.calendarConnection?.mode}
            connectGoogle={connectGoogle}
            connectDemo={() => backend?.enableDemoCalendar()}
            calendarMessage={calendarMessage}
          />
        ) : (
          <Journey
            intent={intent}
            state={state}
            progress={progress}
            options={resultOptions}
            stages={workspace?.stages}
            researchSources={workspace?.researchSources}
            approvalSummary={workspace?.approval?.commitmentSummary}
            inquiry={workspace?.approval?.inquiry}
            busy={busy}
            onSelect={(id) =>
              workspace?.task &&
              backend
                ?.select(workspace.task._id, id)
                .catch((e) => setError(String(e)))
            }
            outcome={workspace?.outcome?.message}
            onApprove={approveCurrent}
            onCancel={cancelCurrent}
            onFeedback={() =>
              workspace?.task && backend?.feedback(workspace.task._id, 9)
            }
          />
        )}
      </main>
    </div>
  );
}

function Home({
  firstName,
  intent,
  setIntent,
  example,
  begin,
  useLocation,
  location,
  memoryCount,
  calendarMode,
  connectGoogle,
  connectDemo,
  calendarMessage,
}: {
  firstName: string;
  intent: string;
  setIntent: (value: string) => void;
  example: string;
  begin: () => void | Promise<void>;
  useLocation: () => void;
  location: string;
  memoryCount: number;
  calendarMode?: "demo" | "oauth";
  connectGoogle: () => void;
  connectDemo: () => void;
  calendarMessage: string;
}) {
  return (
    <section className="home">
      <div className="ambient-shape ambient-shape-one" aria-hidden="true" />
      <div className="ambient-shape ambient-shape-two" aria-hidden="true" />
      <div className="home-layout">
        <div className="home-primary">
          <div className="home-copy">
            <span className="eyebrow">
              <Sparkles size={14} /> Your personal intent-to-action genie
            </span>
            <h1>
              Make room for
              <br />
              <em>what matters.</em>
            </h1>
            <p>
              Tell Genie the outcome. It remembers your preferences, checks your
              real context, and pauses before every commitment.
            </p>
          </div>
          <div className="composer-card">
            <div className="composer-label">
              <span>Ask JoyOrGenie</span>
              <span>⌘ Enter to send</span>
            </div>
            <textarea
              aria-label="Tell Genie what you want to do"
              value={intent}
              onChange={(event) => setIntent(event.target.value)}
              placeholder={example}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter")
                  begin();
              }}
            />
            <div className="composer-actions">
              <button className="context-button" onClick={useLocation}>
                <MapPin size={15} /> Near me
              </button>
              <button className="context-button" onClick={connectGoogle}>
                <CalendarDays size={15} />{" "}
                {calendarMode === "oauth"
                  ? "Calendar connected"
                  : "Connect calendar"}
              </button>
              {calendarMode !== "oauth" && (
                <button className="context-button" onClick={connectDemo}>
                  {calendarMode === "demo" ? "Demo active" : "Try demo"}
                </button>
              )}
              <button
                className="send-button"
                onClick={begin}
                aria-label="Ask Genie"
              >
                <ArrowRight size={20} />
              </button>
            </div>
          </div>
          {calendarMessage && (
            <p className="connection-note" role="status">
              {calendarMessage} Use the demo calendar until server OAuth
              credentials are configured.
            </p>
          )}
          <div className="trust-row">
            <span>
              <ShieldCheck size={16} /> You approve every action
            </span>
            <span>
              <MemoryStick size={16} /> Your memory stays inspectable
            </span>
          </div>
        </div>
        <aside className="context-rail" aria-label="Genie context">
          <div className="context-rail-heading">
            <span className="context-orbit">
              <Sparkles size={17} />
            </span>
            <div>
              <span className="eyebrow">Ready for you</span>
              <h2>Good to see you, {firstName}.</h2>
            </div>
          </div>
          <p className="context-intro">
            Genie will use only the context you can see here.
          </p>
          <div className="context-list">
            <div className="context-item">
              <span>
                <MapPin size={17} />
              </span>
              <div>
                <small>Starting near</small>
                <strong>{location}</strong>
              </div>
              <span className="context-state">Selected</span>
            </div>
            <div className="context-item">
              <span>
                <CalendarDays size={17} />
              </span>
              <div>
                <small>Calendar</small>
                <strong>
                  {calendarMode === "oauth"
                    ? "Google connected"
                    : calendarMode === "demo"
                      ? "Demo schedule"
                      : "Not connected"}
                </strong>
              </div>
              <span className={`context-state ${calendarMode ? "" : "muted"}`}>
                {calendarMode ? "Ready" : "Optional"}
              </span>
            </div>
            <div className="context-item">
              <span>
                <MemoryStick size={17} />
              </span>
              <div>
                <small>Remembered</small>
                <strong>{memoryCount} preferences</strong>
              </div>
              <span className="context-state">Yours</span>
            </div>
          </div>
          <div className="safety-card">
            <ShieldCheck size={19} />
            <div>
              <strong>Nothing happens silently.</strong>
              <p>
                You’ll review the exact action before Genie books, sends, or
                adds anything.
              </p>
            </div>
          </div>
          <div className="context-example">
            <span>Try asking</span>
            <button
              onClick={() =>
                setIntent(
                  "Find Thai massage near Tanjong Pagar this Saturday afternoon under S$100",
                )
              }
            >
              “Find a massage under S$100”
            </button>
          </div>
        </aside>
      </div>
      <aside className="demo-note">
        <strong>Hackathon demo</strong>
        <span>
          Massage inquiries in Tanjong Pagar, Singapore. Live sources inform
          options; availability and prices require provider confirmation.
        </span>
      </aside>
    </section>
  );
}

function Journey({
  intent,
  state,
  progress,
  options,
  stages,
  researchSources = [],
  approvalSummary,
  inquiry,
  busy,
  onSelect,
  outcome,
  onApprove,
  onCancel,
  onFeedback,
}: {
  intent: string;
  state: JourneyState;
  progress: number;
  options: Array<
    Omit<(typeof fallbackOptions)[number], "score"> & {
      score?: number;
      evidence?: string;
      source?: string;
      url?: string;
      id?: string;
      selected?: boolean;
    }
  >;
  stages?: Workspace["stages"];
  researchSources?: Workspace["researchSources"];
  approvalSummary?: string;
  inquiry?: NonNullable<Workspace["approval"]>["inquiry"];
  busy?: boolean;
  onSelect?: (id: string) => void;
  outcome?: string;
  onApprove: () => void | Promise<void>;
  onCancel: () => void | Promise<void>;
  onFeedback: () => void;
}) {
  const visibleOptions =
    state === "working" && progress < journey.length ? [] : options;
  const timeline = stages?.length
    ? stages.map((stage) => ({
        title: stage.label,
        detail: stage.detail,
        status: stage.status,
      }))
    : journey.map(([title, detail], index) => ({
        title,
        detail,
        status:
          progress > index || state !== "working"
            ? "complete"
            : progress === index
              ? "running"
              : "waiting",
      }));
  return (
    <section className="journey-page">
      <button className="back-link" onClick={onCancel}>
        ← New request
      </button>
      <div className="journey-header">
        <div>
          <span className="eyebrow">
            <Compass size={14} /> Active journey
          </span>
          <h1>{intent}</h1>
        </div>
        <span className={`journey-status ${state}`}>
          <span />
          {state === "working"
            ? "Working"
            : state === "complete"
              ? "Complete"
              : state === "failed"
                ? "Needs attention"
                : "Needs your approval"}
        </span>
      </div>

      <div className="journey-grid">
        <div className="timeline-card">
          <h2>What Genie did</h2>
          <div className="timeline">
            {timeline.map(({ title, detail, status }) => {
              const done = status === "complete";
              const active = status === "running";
              const failed = status === "failed";
              return (
                <div
                  className={`timeline-row ${done || active || failed ? "done" : ""} ${failed ? "failed" : ""}`}
                  key={title}
                >
                  <span className="timeline-icon">
                    {done ? (
                      <Check size={14} />
                    ) : active ? (
                      <LoaderCircle className="spin" size={14} />
                    ) : failed ? (
                      <X size={14} />
                    ) : null}
                  </span>
                  <div>
                    <strong>{title}</strong>
                    <p>{status !== "waiting" ? detail : "Waiting…"}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="results-column">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Sources for your request</span>
              <h2>
                {visibleOptions.length
                  ? `${visibleOptions.length} researched options`
                  : "Finding the best fit…"}
              </h2>
            </div>
            {visibleOptions.length > 0 && (
              <span
                className={`fixture-badge ${researchSources.length ? "live" : ""}`}
              >
                {researchSources.length
                  ? `${researchSources.length} live sources`
                  : "Demo fixtures"}
              </span>
            )}
          </div>
          {researchSources.length > 0 && (
            <aside
              className="research-panel"
              aria-label="Live Firecrawl research"
            >
              <div className="research-panel-heading">
                <span>
                  <Compass size={15} /> Live market scan
                </span>
                <strong>Firecrawl</strong>
              </div>
              <div className="research-links">
                {researchSources.map((source) => (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    key={source._id}
                  >
                    <span>{source.title}</span>
                    <small>{source.summary}</small>
                    <ArrowRight size={14} />
                  </a>
                ))}
              </div>
              <p>
                These sources are the options below. Search order is not a fit
                score. Service, price, and availability need confirmation.
              </p>
            </aside>
          )}
          {visibleOptions.map((option) => (
            <article
              className={`option-card ${option.best ? "best" : ""}`}
              key={option.name}
            >
              {option.best && (
                <span className="best-label">
                  <Sparkles size={12} /> First search result
                </span>
              )}
              <div className="option-top">
                <div>
                  <h3>{option.name}</h3>
                  <p>{option.kind}</p>
                </div>
                {option.score !== undefined && (
                  <span className="score">
                    <Star size={13} fill="currentColor" /> {option.score}%
                  </span>
                )}
              </div>
              <div className="option-meta">
                <span>
                  <MapPin size={14} /> {option.distance}
                </span>
                <span>
                  <Clock3 size={14} /> {option.time}
                </span>
                <span>{option.price}</span>
              </div>
              <p className="reason">{option.reason}</p>
              {option.url && (
                <a href={option.url} target="_blank" rel="noreferrer">
                  View source
                </a>
              )}
              {option.id && state === "approval" && (
                <button
                  className="secondary"
                  disabled={busy || option.selected}
                  onClick={() => onSelect?.(option.id!)}
                >
                  {option.selected
                    ? "Selected for inquiry"
                    : "Select for inquiry"}
                </button>
              )}
              <div className="evidence-row">
                <ShieldCheck size={13} />
                <span>
                  {option.evidence ??
                    "Compared using preference, distance, price, and disclosed demo review data."}
                </span>
                <span className="source-chip">
                  {option.source ?? "demo data"}
                </span>
              </div>
            </article>
          ))}
        </div>
      </div>

      {state === "approval" && (
        <Approval
          inquiry={inquiry}
          busy={busy}
          summary={approvalSummary}
          onApprove={onApprove}
          onCancel={onCancel}
        />
      )}
      {state === "complete" && (
        <Completion
          outcome={outcome}
          onAgain={onCancel}
          onFeedback={onFeedback}
        />
      )}
    </section>
  );
}

function Approval({
  summary,
  inquiry,
  busy,
  onApprove,
  onCancel,
}: {
  inquiry?: NonNullable<Workspace["approval"]>["inquiry"];
  busy?: boolean;
  summary?: string;
  onApprove: () => void | Promise<void>;
  onCancel: () => void | Promise<void>;
}) {
  return (
    <div className="approval-bar" role="region" aria-label="Approval required">
      <div className="approval-icon">
        <ShieldCheck size={22} />
      </div>
      <div className="approval-copy">
        <span className="eyebrow">Your approval is required</span>
        <strong>
          {summary ?? "Book Siam Stillness and add it to Google Calendar?"}
        </strong>
        <p>
          You approve the exact message below. An inquiry does not reserve an
          appointment.
        </p>
        {inquiry && (
          <div className="inquiry-preview">
            <p>
              <strong>To (test inbox):</strong>{" "}
              {inquiry.recipient || "Not configured — sending disabled"}
            </p>
            <p>
              <strong>Subject:</strong> {inquiry.subject}
            </p>
            <pre>{inquiry.body}</pre>
            {!inquiry.sendEnabled && (
              <p role="status">
                AgentMail configuration is incomplete. No email will be sent.
              </p>
            )}
          </div>
        )}
      </div>
      <div className="approval-actions">
        <button className="secondary" onClick={onCancel}>
          Not now
        </button>
        <button
          className="primary"
          disabled={busy || (inquiry !== undefined && !inquiry.sendEnabled)}
          onClick={onApprove}
        >
          {busy
            ? "Sending…"
            : inquiry
              ? "Approve & send test inquiry"
              : "Approve & continue"}{" "}
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function Completion({
  outcome,
  onAgain,
  onFeedback,
}: {
  outcome?: string;
  onAgain: () => void | Promise<void>;
  onFeedback: () => void;
}) {
  return (
    <div className="completion-card">
      <span className="completion-check">
        <Check size={26} />
      </span>
      <div>
        <span className="eyebrow">Done</span>
        <h2>
          {outcome
            ? "Inquiry sent — awaiting reply"
            : "Your Saturday reset is on the calendar."}
        </h2>
        <p>
          {outcome ??
            "Siam Stillness · Saturday, 3:00–4:00 PM. Booking and calendar evidence are saved to this journey."}
        </p>
      </div>
      <div className="feedback">
        <span>Was this a good choice?</span>
        <button aria-label="Good choice" onClick={onFeedback}>
          <Heart size={17} />
        </button>
        <button onClick={onAgain}>Plan something else</button>
      </div>
    </div>
  );
}

function MemoryView({
  memories,
  onRemove,
}: {
  memories: Array<{
    id: string | number;
    label: string;
    detail: string;
    kind: string;
    confidence: number;
  }>;
  onRemove: (id: string | number) => void | Promise<void>;
}) {
  return (
    <section className="memory-page">
      <span className="eyebrow">
        <MemoryStick size={14} /> Your memory
      </span>
      <h1>
        What Genie knows,
        <br />
        because you’re in control.
      </h1>
      <p className="lead">
        Every memory has a source. Remove anything and it stops influencing
        future recommendations.
      </p>
      <div className="memory-list">
        {memories.map((memory) => (
          <article className="memory-card" key={memory.id}>
            <span className={`memory-kind ${memory.kind.toLowerCase()}`}>
              {memory.kind}
            </span>
            <div>
              <h2>{memory.label}</h2>
              <p>{memory.detail}</p>
              <span className="confidence">
                {Math.round(memory.confidence * 100)}% confidence · source
                visible
              </span>
            </div>
            <button
              onClick={() => onRemove(memory.id)}
              aria-label={`Remove ${memory.label}`}
            >
              <X size={17} />
            </button>
          </article>
        ))}
        {memories.length === 0 && (
          <p className="empty-state">
            No stored memories. Genie will ask instead of assuming.
          </p>
        )}
      </div>
      <div className="privacy-note">
        <ShieldCheck size={20} />
        <div>
          <strong>Temporary context expires.</strong>
          <p>
            Your precise location is used for the active request, rounded before
            storage, and never becomes a permanent preference.
          </p>
        </div>
      </div>
    </section>
  );
}
