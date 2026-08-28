# JoyOrGenie

JoyOrGenie is a location-aware, intent-to-action personal genie built on Convex.
Instead of opening five apps, the user says the outcome they want. Genie combines
remembered preferences, current context, calendar availability, and transparent
provider evidence, then pauses for explicit approval before it commits anything.

`intent → memory → location → calendar → options → approval → action → outcome → learning`

The hackathon story follows a returning user who rated a Thai massage 9/10 and
asks: “I want a massage this Saturday afternoon somewhere near me.” The app must
survive refreshes and make the difference between demo fixtures and live
integrations impossible to miss.

## Run locally

Prerequisites: Node 20+ and a local Convex deployment.

```bash
npm install
npx convex dev --once
npm run seed
npm run dev
```

Open [http://localhost:5179](http://localhost:5179). The deterministic demo does
not require paid API credentials.

When `FIRECRAWL_API_KEY` is configured on the Convex deployment, the research
stage searches live provider pages through Firecrawl v2 Search and shows those
sources in the journey. Ranked candidates remain explicitly labelled demo
inventory until provider availability can be verified.

For verification:

```bash
npm run verify
```

## Trust boundaries

- A recommendation is not an execution. The selected action is hashed and
  persisted; only approval of that exact hash can cross the execution boundary.
- Current location is temporary context. The browser location is rounded before
  persistence and is not promoted to durable memory.
- Every memory has a kind, provenance, confidence, and removal path.
- Google OAuth tokens are server-only Convex secrets/data. The browser never
  receives refresh tokens.
- Demo businesses are labelled fixtures. JoyF&B is used only for its real
  `POST /orders` capability; it is not misrepresented as a massage-booking API.

## Configuration

Copy `.env.example` to `.env.local` for the web client. Set server-only values
with `npx convex env set NAME value`.

Google Calendar live mode needs an OAuth web client whose redirect URI matches
`GOOGLE_OAUTH_REDIRECT_URI`. Without those credentials, “demo calendar” provides
deterministic availability and evidence while remaining visibly labelled.

OpenAI is optional. The required massage journey uses deterministic parsing and
ranking so the core demo remains repeatable when `OPENAI_API_KEY` is absent.

Firecrawl live research uses the server-only `FIRECRAWL_API_KEY`. If Firecrawl
is unavailable, the durable workflow records a disclosed fallback and continues
without claiming live research.

## Project records

- [Joy ecosystem reuse record](docs/ecosystem-reuse.md)
- [JoyCLI product contract](docs/joyorgenie.joy)
- [Approved JoyUI Design Pack](.joyui/design-packs/packs/design_pack_7da95640bfc0785c.json)

This is a new standalone repository. It does not modify JoyUI Studio, the
existing JoyOrGenie workplace shell, or JoyOrSpa.
