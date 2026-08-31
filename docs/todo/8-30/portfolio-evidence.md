# Portfolio execution evidence

This tracker records reproducible evidence for the consolidation plan. It is not a second control plane and does not replace provider-side revocation records or migration acceptance tests.

Last verified: 2026-08-31, Asia/Shanghai

| Scope | Claim | Status | Evidence | Next action |
|---|---|---|---|---|
| Public portfolio | `majiayu000` owns 100 public, original, non-fork repositories: 82 active and 18 archived. | verified | [GitHub REST repository listing](https://api.github.com/users/majiayu000/repos?per_page=100&type=owner&sort=full_name) | Re-run before each retirement batch. |
| Inventory drift | `patch-tournament` was created before the first plan commit but omitted from the 99-repository inventory. | corrected | [`patch-tournament`](https://github.com/majiayu000/patch-tournament) | Treat as the only 90-day incubation experiment. |
| Remem contract | Source-built `0.6.84` is installed and its worker is live. Production `raw sessions` returned five valid `codex-cli` sessions with stable refs/hashes while retaining and reporting 3,193 excluded pre-identity rows across 220 legacy sessions. The bounded cutover repair was squash-merged as `e3c5ffcd`; PR CI passed in full and issue #1053 closed automatically. | installed/live/upstream acceptance passed | [PR #1054](https://github.com/majiayu000/remem/pull/1054), [PR #1055](https://github.com/majiayu000/remem/pull/1055), [Issue #1053](https://github.com/majiayu000/remem/issues/1053) | Keep the production contract smoke in release acceptance. |
| Refine cutover | Current `origin/main` commit `5707d20` is installed. Full workspace tests and clippy passed; missing-provider injection failed without local fallback. A secure provider configuration was migrated from shell literals, the local stack passed Doctor with zero failures, and a bounded production `--latest 1` run processed one Remem session into 11 observations with zero failures or quarantines. The database contains one `remem://raw-session/v2` reference and zero persisted raw bodies. | Remem-only cutover and bounded non-dry acceptance passed | [PR #206](https://github.com/majiayu000/refine/pull/206), [Issue #203](https://github.com/majiayu000/refine/issues/203), [Issue #204](https://github.com/majiayu000/refine/issues/204) | Review #203/#204 against their remaining acceptance criteria before closing them. |
| `bookmark-1130` | GitHub Pages configuration was removed; the old URL returns HTTP 404; repository remains archived. | verified closed | [repository](https://github.com/majiayu000/bookmark-1130), [former Pages URL](https://majiayu000.github.io/bookmark-1130/) | Keep historical deployment metadata as audit evidence. |
| `myweather` | Repository Secrets `USERNAME` and `PASSWORD` were deleted and GitHub Actions was disabled. | GitHub-side containment complete | [repository](https://github.com/majiayu000/myweather) | SMTP credential owner must confirm provider-side revocation. |
| Credential repositories | Standard GitHub Secret Scanning is enabled on `sse-fast-chat-server`, `echart-use-flask`, `fastapi-starter`, and `myweather`; current open-alert count is zero. Generic-pattern scanning and validity checks remain unavailable. No authenticated Azure, Oracle, Redis, or identified SMTP provider CLI/configuration is present on this machine, so provider-side rotation cannot be proven from this access path. | GitHub containment complete / provider rotation blocked | Repository Security settings and Secret Scanning REST endpoints | Credential owners must revoke or rotate in the provider accounts and record non-secret proof. |
| Stash launch gate | The repository has no public release and intentionally grants no OSS license. | verified blocked | [Stash README](../../../README.md#access-license-and-launch-boundary), [GitHub Releases](https://github.com/majiayu000/stash/releases) | Add a license and first stable release only when the public launch decision is made. |

## Revalidation commands

These commands expose metadata and counts only; they do not print secret values.

```sh
gh api --paginate 'users/majiayu000/repos?per_page=100&type=owner&sort=full_name' --slurp \
  | jq 'add | map(select(.fork | not)) | {total: length, active: map(select(.archived | not)) | length, archived: map(select(.archived)) | length}'

gh api repos/majiayu000/myweather/actions/secrets \
  --jq '{total_count, names: [.secrets[].name]}'

gh api repos/majiayu000/myweather/actions/permissions \
  --jq '{enabled, allowed_actions}'
```
