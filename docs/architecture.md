# Architecture

```text
React + JoyUI Design Pack
        │ Convex subscriptions / typed functions
        ▼
Convex workspace ── profile, location, memories, task, stages, evidence
        │
        ▼
@convex-dev/workflow
 understand → memory → location → calendar → research → rank
        │                                               │
        │                              exact commitment hash
        │                                               ▼
        └────────────────────────────── await user approval
                                                        │
                                   approved event action│
                                                        ▼
                             Google Calendar or labelled demo event
                                                        │
                                                        ▼
                                  outcome → feedback → experience memory
```

## Durable state

The browser holds only an opaque demo bearer token (or a future authenticated
identity). Convex stores a SHA-256 fingerprint, never the bearer token. The
latest workspace is a reactive query, so task stages and approval state resume
after refresh.

The workflow pauses on a durable event. Approval is valid only when its SHA-256
commitment matches the selected recommendation, slot, price, and currency. The
calendar action independently rechecks that approved commitment before making
the side effect.

## Calendar modes

- **OAuth:** authorization-code flow, server-only token storage and refresh,
  Google `freeBusy`, and event creation after approval.
- **Demo:** deterministic Saturday availability and a visibly labelled
  `demo_confirmed` event. No Google data is claimed.

The Convex HTTP callback returns the Google authorization code and state to the
React app. The app combines them with its private session token when completing
OAuth; the callback never needs or receives that bearer token.

## Provider boundary

The demo ranks deterministic business fixtures because no inspected Joy system
exposes massage search or appointment booking. Completion creates a transparent
local hold with `not_supported` provider status. It never claims the massage
business accepted a reservation.
