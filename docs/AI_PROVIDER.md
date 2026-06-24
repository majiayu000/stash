# AI provider and review writes

stash can use an OpenAI-compatible chat-completions endpoint for local AI flows. The server owns the provider configuration and API key. The browser only receives typed draft, coach, and summary results.

## Configuration

Set these environment variables before starting the server:

```sh
export STASH_AI_PROVIDER=openai_compatible
export STASH_AI_BASE_URL=http://127.0.0.1:11434/v1/chat/completions
export STASH_AI_API_KEY=local-dev-key
export STASH_AI_MODEL=your-json-capable-model
export STASH_AI_TIMEOUT_MS=30000

bun run server:dev
```

`STASH_AI_PROVIDER` defaults to `disabled`. When disabled, AI endpoints return `AI_PROVIDER_UNAVAILABLE` and the UI shows the error inline.

`STASH_AI_BASE_URL` must be the chat-completions endpoint. The provider response must include a JSON object in `choices[0].message.content`.

## No Silent Writes

AI flows are review-first:

- Idea decomposition creates `ai_generation_runs` and `decision_drafts`.
- Meeting triage stores the meeting source and creates source-spanned `decision_drafts`.
- Drafts do not become normal todos until a user accepts or edit-accepts them in Decision Inbox.
- Rejected drafts do not create work items.
- Task coach messages are persisted as coach messages.
- Coach summaries do not write to a todo until the user clicks append.
- Confirmed summary writes insert `work_item_ai_writes` rows that point back to the originating `ai_generation_runs.id`.

High-risk or unclear meeting drafts are flagged in Decision Inbox and are skipped by the safe auto-adopt action. They require explicit manual review before adoption.

## Local Smoke

Use the deterministic Playwright mock provider for repeatable verification:

```sh
bun run verify:ci
```

For manual provider testing, start the server with the environment variables above, then:

1. Open a captured idea and click `decompose into drafts`.
2. Edit a draft in Decision Inbox and accept it.
3. Confirm the accepted task appears as a normal WorkItem.
4. Open a task, ask Task Coach a question, summarize, then append to journal or description.
5. Import meeting notes from Decision Inbox and confirm source spans are visible before accepting.
