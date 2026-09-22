# JoyOrGenie

An approval-gated personal genie built on Convex. This standalone demo researches massage providers in Tanjong Pagar, Singapore and prepares an exact availability inquiry for a test inbox.

`request → active memory/location → live research → select source → preview inquiry → approve → send → await reply`

## Run

```sh
npm install
npx convex dev --once
npm run dev
```

The frontend uses `VITE_CONVEX_URL` from `.env.local`. Server configuration belongs in the Convex deployment:

- `FIRECRAWL_API_KEY`: live provider search; missing/unavailable research stops honestly instead of substituting fixtures.
- `AGENTMAIL_API_KEY`: server-only AgentMail credential.
- `AGENTMAIL_INBOX_ID`: existing sending inbox owned by the operator.
- `AGENTMAIL_TEST_RECIPIENT`: a verified inbox you control. This release sends only to this address, clearly labeled as a test recipient.

Set each with `npx convex env set NAME` using the CLI's secure configuration flow. Never add API keys to `VITE_` variables or commit credentials. Submit a new request after configuring mail so the approval preview reflects the new configuration.

## Supported request

“Find a Thai massage near Tanjong Pagar this Saturday afternoon under S$100.”

Massage only; Tanjong Pagar only. Dates accept weekdays, today/tomorrow or ISO dates, with morning/afternoon/evening windows in Singapore time. “Next Saturday” means the Saturday in the following week. Past/ambiguous windows and unsupported services/areas are rejected explicitly. The parser is deterministic; OpenAI is not required.

Live search pages become selectable options; search order is not a fit score. Price, travel time and provider availability remain unconfirmed. Requested times are not available appointment slots. A successful test email is not a provider booking.

## Approval and delivery

The SHA-256 commitment binds the selected recommendation and exact recipient, subject, body, test mode and send-enabled flag. Selecting a different provider updates the draft and commitment. Execution independently verifies ownership, approval, configuration and the requested date before claiming a send.

The send attempt is reserved transactionally before calling AgentMail. The workflow disables action retries. A timeout or missing response is recorded as unknown and cannot be automatically resent. Inspect AgentMail and reconcile manually before any new send. Successful responses persist the provider message ID. No payment, booking or calendar event is created by this inquiry workflow.

Browser session tokens are bearer credentials scoped to one demo workspace; only their hashes are stored. Existing Google Calendar OAuth support remains in the codebase, but the inquiry flow does not use calendar availability or create an event. Seeded memories are labeled examples; removing one excludes it from future requests.

## Verify

```sh
npm run verify
```

Tests mock AgentMail; they do not prove real delivery. Live email verification requires configured credentials and the operator's test inbox. See [hackathon.md](hackathon.md) for the build log, measured validation and demo script.
