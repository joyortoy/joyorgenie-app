# JoyOrGenie build log

## Product
A narrow intent-to-action demo: find massage providers in Tanjong Pagar, Singapore, review live source pages, select a provider, preview an availability inquiry, and explicitly approve the exact email. An inquiry is never represented as a confirmed booking.

## Existing foundation
The standalone app uses Convex reactive records and `@convex-dev/workflow` for durable stages and an approval event. Private browser session tokens are hashed before storage. Memories retain provenance and can be removed. Existing Google Calendar integration remains separate from the inquiry workflow.

## 22 September 2026 changes
- Replaced fixed service/date assumptions with bounded deterministic parsing. Supported requests specify massage, a future weekday/date, and morning/afternoon/evening. Budget and explicit massage style are preserved. Unsupported services, areas and ambiguous time requests produce a visible explanation.
- Uses the saved location unless the request supplies an area, and uses active relevant massage preferences when style is unspecified. Scope is explicitly Tanjong Pagar; travel times remain unknown.
- Firecrawl results now become the selectable recommendation records. Source links and descriptions are retained. No generated ratings, prices, travel times or confirmed availability are shown.
- Added an AgentMail action behind an approval commitment covering recommendation, recipient, subject, body and test mode. The exact draft is previewed. Only a server-configured test inbox is allowed in this release.
- Added durable send-attempt records, returned provider message IDs and explicit unknown/failure states. A reserved or ambiguous send is never automatically repeated. No booking, payment or calendar side effect occurs in this flow.
- Removed memory resurrection during repeated workspace bootstrap.
- Fixed production server rendering by deferring browser storage access until client mount.

## Validation
- TypeScript typecheck passed.
- 15 tests passed, covering parsing, ownership, canonical SHA-256, approval tampering, duplicate send attempts, ambiguous timeout, persisted provider ID, and absence of calendar/booking side effects. AgentMail HTTP responses in tests are mocked.
- Build passed.
- Live Convex + Firecrawl smoke test reached awaiting approval with three real source pages and a requested future window (26 September). Missing prices remained unknown.
- AgentMail credentials/test recipient were not found in the checked app environments or local system configuration. Real email delivery has NOT been verified. The deployed preview disables sending until configured.

## Demo sequence (under three minutes)
1. Show the memory panel and inspect/remove a preference.
2. Ask: “Find a Thai massage near Tanjong Pagar this Saturday afternoon under S$100.”
3. Show durable stages, the actual requested date/budget, real source links, and unknown price/availability.
4. Select another option; show the inquiry preview changing.
5. With AgentMail configured, approve the exact inquiry to an inbox you control; show the persisted message ID and “awaiting reply.” Without credentials, explicitly demonstrate the disabled send state instead of claiming delivery.
6. Refresh to show the saved task and evidence.

## Remaining submission work
Record the actual walkthrough, verify event-specific submission rules and deadline, and submit the required links/materials. No video, social post, or hackathon submission was created by this change.
