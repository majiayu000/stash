# Color Semantics

stash keeps the neon theme, but colors must map to stable work meanings.

| Meaning | Token | Use |
|---|---|---|
| Priority P0/P1 | `--semantic-priority-high` | urgent or highest-priority work |
| Due / scheduled now | `--semantic-due` | today, overdue, or date-sensitive work |
| Active | `--semantic-active` | doing, live, currently progressing |
| Someday / later | `--semantic-someday` | parked, later, waiting, or non-urgent work |
| Inbox / unsorted | `--semantic-inbox` | newly captured or untriaged items |
| Muted helper text | `--semantic-muted-readable` | secondary instructional text that must stay readable |

Priority markers must include text labels (`P0` through `P3`) in addition to
color. Color alone is not a valid priority channel.
