# GH127 Product Spec — Durable session deep links and bounded transcripts

Issue: #127

## Goal

Every session detail URL identifies both the provider and session, remains
usable outside the recent-session list, and loads transcript evidence in
bounded increments without blocking the HTTP event loop.

## Behavior invariants

1. `/sessions/:provider/:sessionId` is the canonical shareable URL.
2. A canonical URL fetches that exact session from the API. It does not depend
   on the Workbench's recent 30-session projection.
3. A legacy `/sessions/:sessionId` URL redirects only when exactly one provider
   owns the ID. Duplicate IDs show both provider choices; missing IDs show an
   explicit not-found state.
4. Session event responses have a validated limit, an opaque cursor, a bounded
   response payload, and paging metadata. Invalid cursors fail visibly.
5. Transcript pages are append-ordered. Loading the next page preserves
   tool-call/output pairing when the two events lie on opposite page boundaries.
6. Tool and file summaries describe the complete transcript, not only the
   currently loaded page.
7. Filesystem discovery and transcript parsing run in the existing session
   Worker so a large transcript request does not stall `/health`.
8. Empty, loading, retry, disambiguation, not-found, and load-more failure states
   are truthful and distinct.

## Acceptance

- Tests cover a session older than the recent 30, duplicate IDs across
  providers, canonical browser navigation, not found, and retry.
- API tests cover cursor boundaries, invalid cursor/limit input, payload
  truncation, complete summaries, and a large transcript.
- Client tests prove incremental loading and pairing across a page boundary.
- A concurrency test keeps `/health` inside its existing responsiveness budget
  while a large event page is parsed.
- Typecheck, unit/integration tests, build, E2E, and the unchanged performance
  gates pass.

## Non-goals

- Replacing source JSONL files with a new transcript database.
- Live streaming or WebSocket transport.
- Editing or deleting provider session history.
