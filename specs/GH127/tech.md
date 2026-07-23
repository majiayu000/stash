# GH127 Technical Spec — Provider identity and Worker event pages

## Routes

The browser owns two route shapes:

- canonical: `/sessions/:provider/:sessionId`;
- legacy: `/sessions/:sessionId`.

Canonical detail loads `GET /api/agent-sessions/:provider/:id` directly and
converts the returned provider session into a Workbench view model. Legacy
resolution requests both provider-qualified detail endpoints. One match
redirects with `replace`; two matches render explicit choices; zero matches
render not found. Non-404 failures remain retryable errors.

Every in-product session link emits the canonical route. React list keys also
include the provider.

## Event-page API

`GET /api/agent-sessions/:provider/:id/events?cursor=&limit=` returns:

```ts
interface AgentSessionEventPage {
  data: AgentSessionEvent[];
  page: {
    cursor: string | null;
    nextCursor: string | null;
    hasMore: boolean;
    limit: number;
    totalEvents: number;
    responseBytes: number;
  };
  summary: {
    toolCalls: Array<{ name: string; count: number }>;
    filesTouched: Array<{ path: string; count: number }>;
  };
}
```

The default limit is 100 and the maximum is 200. The cursor is an opaque
base64url-encoded versioned event offset. Pages progress from the beginning of
the append-ordered transcript. A fixed serialized-event byte budget may end a
page before its count limit. Oversized individual text or metadata values are
truncated explicitly with `truncated: true`, preventing one event from escaping
the response bound.

Starting at the beginning means a boundary may expose a call before its output,
but never exposes a later output before its already-loaded call. Appending the
next page lets the existing call-ID pairing span the combined array without
duplicates or reordering.

## Worker boundary

The `SessionScanExecutor` adds an event-page request. The Worker:

1. parses the provider file;
2. computes complete tool/file summaries;
3. validates and slices the requested page;
4. sends only the bounded page and compact summary across the Worker boundary.

The web route first finds the exact provider session through an unlimited
metadata scan in the Worker, so sessions older than list limits remain
addressable. Main-thread source parsing is not used by the event route.

## Client state

`SessionDetailPage` owns exact-session, first-page, and next-page state.
Successful pages append events and replace the complete summary. The button
uses `nextCursor`; a failed next page preserves already loaded transcript
content and exposes a retry action.

The sidebar consumes server summaries, so it remains complete before the user
loads every transcript page.

## Verification map

| Invariant | Verification |
| --- | --- |
| Provider-qualified canonical identity | route/component and E2E tests |
| Older-than-30 direct access | component/API integration tests |
| Duplicate legacy ID | component tests |
| Stable cursor and bounded response | paging unit/integration tests |
| Cross-page tool pairing | transcript component test |
| Complete summary | Worker and client tests |
| Main loop responsiveness | concurrent integration/performance test |
