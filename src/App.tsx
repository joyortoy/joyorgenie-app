import { useEffect, useMemo, useState } from "react";
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
type JourneyState = "idle" | "working" | "approval" | "complete";

const examples = [
  "Find me a massage this Saturday afternoon near me",
  "Plan a quiet dinner after my last meeting",
  "Help me make the most of Sunday morning",
];

const options = [
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
    reason: "Fits your calendar, but is less aligned with your preferred style.",
  },
];

const journey = [
  ["Understood", "Massage · Saturday afternoon · nearby"],
  ["Remembered", "Thai massage · rated 9/10 · within 15 min"],
  ["Checked calendar", "Free between 2:00 and 5:30 PM"],
  ["Compared", "12 nearby places · 3 strong matches"],
] as const;

export default function App() {
  const [view, setView] = useState<View>("genie");
  const [intent, setIntent] = useState("");
  const [example, setExample] = useState(0);
  const [state, setState] = useState<JourneyState>("idle");
  const [progress, setProgress] = useState(0);
  const [location, setLocation] = useState("Tiong Bahru");
  const [locationPending, setLocationPending] = useState(false);
  const [memories, setMemories] = useState([
    { id: 1, label: "You enjoy Thai massage", detail: "Rated 9/10 after your last visit", kind: "Experience" },
    { id: 2, label: "Keep travel under 15 minutes", detail: "Inferred from three recent choices", kind: "Inferred" },
    { id: 3, label: "Prefer calm, low-noise places", detail: "You told Genie directly", kind: "Explicit" },
  ]);

  useEffect(() => {
    if (state !== "idle") return;
    const timer = window.setInterval(() => setExample((value) => (value + 1) % examples.length), 3600);
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(() => {
    if (state !== "working") return;
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
  }, [state]);

  const firstName = useMemo(() => "Joy", []);

  function begin() {
    setIntent((value) => value.trim() || examples[0]);
    setProgress(0);
    setState("working");
  }

  function useLocation() {
    setLocationPending(true);
    if (!navigator.geolocation) {
      setLocationPending(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => {
        setLocation("Near your current location");
        setLocationPending(false);
      },
      () => setLocationPending(false),
      { maximumAge: 300_000, timeout: 8_000 },
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => { setView("genie"); setState("idle"); }} aria-label="JoyOrGenie home">
          <span className="brand-mark"><Sparkles size={18} /></span>
          <span>JoyOrGenie</span>
        </button>
        <nav aria-label="Primary">
          <button className={view === "genie" ? "active" : ""} onClick={() => setView("genie")}>Genie</button>
          <button className={view === "memory" ? "active" : ""} onClick={() => setView("memory")}>Memory</button>
        </nav>
        <div className="status-cluster">
          <button className="status-pill" onClick={useLocation} disabled={locationPending}>
            {locationPending ? <LoaderCircle className="spin" size={14} /> : <MapPin size={14} />}{location}
          </button>
          <span className="avatar">J</span>
        </div>
      </header>

      <main>
        {view === "memory" ? (
          <MemoryView memories={memories} onRemove={(id) => setMemories((items) => items.filter((item) => item.id !== id))} />
        ) : state === "idle" ? (
          <Home firstName={firstName} intent={intent} setIntent={setIntent} example={examples[example]} begin={begin} useLocation={useLocation} />
        ) : (
          <Journey intent={intent} state={state} progress={progress} onApprove={() => setState("complete")} onCancel={() => setState("idle")} />
        )}
      </main>
    </div>
  );
}

function Home({ firstName, intent, setIntent, example, begin, useLocation }: {
  firstName: string; intent: string; setIntent: (value: string) => void; example: string; begin: () => void; useLocation: () => void;
}) {
  return (
    <section className="home">
      <div className="home-copy">
        <span className="eyebrow"><Sparkles size={14} /> Your personal intent-to-action genie</span>
        <h1>What do you want<br />to do, {firstName}?</h1>
        <p>Say the outcome. Genie remembers what matters, checks the real world, and asks before anything is committed.</p>
      </div>
      <div className="composer-card">
        <textarea
          aria-label="Tell Genie what you want to do"
          value={intent}
          onChange={(event) => setIntent(event.target.value)}
          placeholder={example}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") begin();
          }}
        />
        <div className="composer-actions">
          <button className="context-button" onClick={useLocation}><MapPin size={15} /> Near me</button>
          <button className="context-button"><CalendarDays size={15} /> Calendar connected</button>
          <button className="send-button" onClick={begin} aria-label="Ask Genie"><ArrowRight size={20} /></button>
        </div>
      </div>
      <div className="trust-row">
        <span><ShieldCheck size={16} /> You approve every real-world action</span>
        <span><MemoryStick size={16} /> Memories are visible and removable</span>
      </div>
      <aside className="demo-note"><strong>Hackathon demo</strong><span>Deterministic sample businesses are clearly marked until live provider credentials are configured.</span></aside>
    </section>
  );
}

function Journey({ intent, state, progress, onApprove, onCancel }: {
  intent: string; state: JourneyState; progress: number; onApprove: () => void; onCancel: () => void;
}) {
  const visibleOptions = state === "working" && progress < journey.length ? [] : options;
  return (
    <section className="journey-page">
      <button className="back-link" onClick={onCancel}>← New request</button>
      <div className="journey-header">
        <div><span className="eyebrow"><Compass size={14} /> Active journey</span><h1>{intent}</h1></div>
        <span className={`journey-status ${state}`}><span />{state === "working" ? "Working" : state === "complete" ? "Complete" : "Needs your approval"}</span>
      </div>

      <div className="journey-grid">
        <div className="timeline-card">
          <h2>What Genie did</h2>
          <div className="timeline">
            {journey.map(([title, detail], index) => {
              const done = progress > index || state !== "working";
              const active = state === "working" && progress === index;
              return <div className={`timeline-row ${done ? "done" : ""}`} key={title}>
                <span className="timeline-icon">{done ? <Check size={14} /> : active ? <LoaderCircle className="spin" size={14} /> : null}</span>
                <div><strong>{title}</strong><p>{done || active ? detail : "Waiting…"}</p></div>
              </div>;
            })}
          </div>
        </div>

        <div className="results-column">
          <div className="section-heading"><div><span className="eyebrow">Ranked for you</span><h2>{visibleOptions.length ? "Three good fits" : "Finding the best fit…"}</h2></div>{visibleOptions.length > 0 && <span className="fixture-badge">Demo fixtures</span>}</div>
          {visibleOptions.map((option) => (
            <article className={`option-card ${option.best ? "best" : ""}`} key={option.name}>
              {option.best && <span className="best-label"><Sparkles size={12} /> Best match</span>}
              <div className="option-top"><div><h3>{option.name}</h3><p>{option.kind}</p></div><span className="score"><Star size={13} fill="currentColor" /> {option.score}%</span></div>
              <div className="option-meta"><span><MapPin size={14} /> {option.distance}</span><span><Clock3 size={14} /> {option.time}</span><span>{option.price}</span></div>
              <p className="reason">{option.reason}</p>
            </article>
          ))}
        </div>
      </div>

      {state === "approval" && <Approval onApprove={onApprove} onCancel={onCancel} />}
      {state === "complete" && <Completion onAgain={onCancel} />}
    </section>
  );
}

function Approval({ onApprove, onCancel }: { onApprove: () => void; onCancel: () => void }) {
  return (
    <div className="approval-bar" role="region" aria-label="Approval required">
      <div className="approval-icon"><ShieldCheck size={22} /></div>
      <div className="approval-copy"><span className="eyebrow">Your approval is required</span><strong>Book Siam Stillness and add it to Google Calendar?</strong><p>Saturday at 3:00 PM · 60 minutes · $88 · no cancellation fee before Friday</p></div>
      <div className="approval-actions"><button className="secondary" onClick={onCancel}>Not now</button><button className="primary" onClick={onApprove}>Approve & continue <ChevronRight size={16} /></button></div>
    </div>
  );
}

function Completion({ onAgain }: { onAgain: () => void }) {
  return (
    <div className="completion-card">
      <span className="completion-check"><Check size={26} /></span>
      <div><span className="eyebrow">Done</span><h2>Your Saturday reset is on the calendar.</h2><p>Siam Stillness · Saturday, 3:00–4:00 PM. Booking and calendar evidence are saved to this journey.</p></div>
      <div className="feedback"><span>Was this a good choice?</span><button aria-label="Good choice"><Heart size={17} /></button><button onClick={onAgain}>Plan something else</button></div>
    </div>
  );
}

function MemoryView({ memories, onRemove }: { memories: Array<{ id: number; label: string; detail: string; kind: string }>; onRemove: (id: number) => void }) {
  return (
    <section className="memory-page">
      <span className="eyebrow"><MemoryStick size={14} /> Your memory</span>
      <h1>What Genie knows,<br />because you’re in control.</h1>
      <p className="lead">Every memory has a source. Remove anything and it stops influencing future recommendations.</p>
      <div className="memory-list">
        {memories.map((memory) => <article className="memory-card" key={memory.id}><span className={`memory-kind ${memory.kind.toLowerCase()}`}>{memory.kind}</span><div><h2>{memory.label}</h2><p>{memory.detail}</p></div><button onClick={() => onRemove(memory.id)} aria-label={`Remove ${memory.label}`}><X size={17} /></button></article>)}
        {memories.length === 0 && <p className="empty-state">No stored memories. Genie will ask instead of assuming.</p>}
      </div>
      <div className="privacy-note"><ShieldCheck size={20} /><div><strong>Temporary context expires.</strong><p>Your precise location is used for the active request, rounded before storage, and never becomes a permanent preference.</p></div></div>
    </section>
  );
}
