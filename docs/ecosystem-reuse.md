# Joy ecosystem reuse record

This inventory was captured before application code was written. It records the
actual local interfaces inspected on 2026-08-27; names were not treated as proof
of capability.

## JoyCLI 0.26.0

`joycli architecture list` and `joycli architecture authorities` identify these
canonical capabilities:

- mission planning and dispatch;
- IntentStack working-context memory and IntentDeck durable knowledge intake;
- approval records, evidence boundaries, verification, and recovery;
- provider routing and runtime inspection.

`joycli architecture inspect authentication session memory location calendar
google orchestration approval` returned `no_implementation_found`. JoyOrGenie
therefore reuses the architectural semantics—structured intent, provenance,
approval, evidence, recovery—but does not import private JoyCLI modules or claim
that JoyCLI supplies Google Calendar or location APIs.

## JoyUI

The current JoyUI repository provides versioned Design Pack contracts, token
validation, deterministic hashing, an approval lifecycle, and Studio authoring.
JoyOrGenie's design is produced as a JoyUI Design Pack and consumed as checked-in
presentation tokens; the application does not import JoyUI runtime internals.

## JoyF&B

The inspected `backend/openapi.yaml` exposes health endpoints and one business
capability: authenticated, idempotent `POST /orders` for dine-in or takeaway
orders. It does not expose venue search, reservations, menus, massage providers,
or appointment booking. JoyOrGenie includes a typed JoyF&B order adapter for the
restaurant domain only and keeps massage/appointment execution behind a separate
domain adapter.

The reusable client behavior is its verified boundary pattern: bearer auth,
request correlation, timeouts, idempotency keys, typed errors, and safe retries.

## JoyUniverse

The installed JoyUniverse contract at
`/Users/joytan/Joyorgenie/joyuniverse/openapi.yaml` is a discovered description of
JoyCLI's local loopback API. It exposes health, runtime metadata, and discovery
session creation. No backend/schema generator exists in the inspected repository,
so this project does not fabricate one. Convex owns generated application types
and backend state.

## Existing JoyOrGenie

`joyortoy/joyorgenie` is an existing black-and-pink workplace shell that binds
JoyCLI/JoyClaw discovery and chat surfaces. It is not the requested Convex
intent-to-action product. This project is therefore created separately as
`joyorgenie-app`, as required when the preferred repository name is occupied.

## Shared auth, Google, location, and memory findings

- JoyF&B includes JWT/JWKS authentication and local development principals.
- No reusable Joy Calendar implementation was found. A separate Google Calendar
  OAuth adapter is required.
- No reusable Joy browser-geolocation module was found. The web-standard
  geolocation API is used with an explicit neighbourhood fallback and without a
  precise location trail.
- JoyCLI's memory model separates working context, promoted durable knowledge,
  provenance, confidence, revocation, and stale-context invalidation. The Convex
  memory schema mirrors those boundaries without importing JoyCLI storage.

