---
name: project-guideline
description: Complete project structure, runtime workflow, and maintenance guidance for gitlab-copilot-ci
keywords:
  - project-structure
  - app-runtime
  - review-process
  - review-history
  - debounce
  - release-process
---

# Project Guideline SKILL

## Project Overview

**gitlab-copilot-ci** is a Bun-based shell application compiled into a binary for automated merge-request review. The binary runs inside GitLab CI for an external repository, reads merge-request diffs from GitLab, asks a configured review agent to produce inline findings plus a markdown summary, posts new inline discussions, and replaces a single top-level summary note.

### Runtime Environments

#### 1. App Runtime
- **Context**: The compiled binary runs in CI for a target repository.
- **Purpose**: Review merge-request diffs with either GitHub Copilot CLI or Pi and post results back to GitLab.
- **State Management**: Review history is stored inside the summary note itself as a hidden base64-encoded HTML marker block. There is no SQLite database.
- **Entry Point**: `app/main.ts`.

#### 2. Project CI Runtime
- **Context**: This repository's own CI builds and publishes release binaries.
- **Purpose**: Validate, package, and publish `gitlab-copilot-ci` artifacts.
- **Entry Points**: `scripts/ci/ensure-release.ts`, `scripts/ci/build-and-publish.ts`, `scripts/ci/publish-release.ts`.
- **Artifact variants**: Release CI publishes both glibc Linux artifacts (`linux-x64`, `linux-arm64`) and musl Linux artifacts (`linux-x64-musl`, `linux-arm64-musl`). Use glibc artifacts for Debian/Ubuntu-class environments and musl artifacts for Alpine-class environments.
- **Compatibility note**: `gcompat` is only a compatibility layer for running many glibc binaries on Alpine. It is not the same as a native musl build and should not replace the `*-musl` artifacts when Alpine is the intended runtime.
- **Post-release trigger**: `.gitlab-ci.yml` includes a `trigger:runner` job in a dedicated `trigger` stage. When `RUNNER_TRIGGER_TOKEN` is set on `main`, it runs after `release:publish`, reads `RELEASE_TAG` from the `release:check` dotenv artifact, and POSTs `TARGET_JOB` plus `GITLAB_COPILOT_CLI_VERSION` to `RUNNER_TRIGGER_URL`.
- **Validation Gates**: Both GitHub Actions and GitLab CI run explicit `bun run lint`, `bun run test`, `bun run typecheck`, and `bun run tsc` jobs before build/release steps proceed. `typecheck` runs TSTyche with TypeScript `6.0.3`; `tsc` continues to use the project's `typescript@7.0.2` dependency.

### Investigation Workflow

- When behavior is uncertain, prefer a live investigation with `test.ts` before guessing.
- `test.ts` is the repo's playground for real GitLab API experiments.
- Load the real MR/project/token environment from `test.sh` when using that playground so the investigation matches CI and live GitLab behavior.

## Terminology

### Review vs. Summary

- **Review**: One inline GitLab discussion posted on a specific diff position. Review items come from `ReviewItemEntity` and must include `file_path`, English `suggestion`, `rank`, `diff_file`, `diff_line_code`, and at least one of `new_line` or `old_line`.
- **Summary**: One top-level markdown note for the merge request. It contains the human-readable walkthrough/changes/review summary/other suggestions plus metrics, errors, and the hidden review-history marker block.

### HTML Markers

All GitLab comments created by the CLI are identified by `--html-marker-prefix`.

- `<prefix>-review-marker`: inserted into every inline review comment.
- `<prefix>-summary-marker`: inserted at the start of the summary note.
- `<prefix>-review-data-start` / `<prefix>-review-data-end`: wrap the hidden base64 review-history payload at the end of the summary note.
- `<prefix>-reviewing-marker`: inserted into the temporary top-level note that marks an in-progress review job.

### Review History Payload

The hidden summary payload encodes `JSON.stringify(reviewHistoryRuns)` in base64.

Each element in the array represents one CI review run:

```ts
type ReviewHistoryRunEntity = {
  discussions: Array<{
    discussion_id: string;
    note_id: string;
    content: {
      suggestion: string;
      file_path: string;
      old_line: number | null;
      new_line: number | null;
    };
  }>;
};
```

Rules:
- Only successfully posted inline discussions are stored.
- Summary-only `## 💡 Other Suggestions` content is not stored.
- History is trimmed to the latest `--max-history-length` runs.
- Before prompt generation and before the next summary note is written, the runtime fetches all merge-request discussion pages from GitLab and removes any stored history entries whose discussion is already resolved.
- If a stored history discussion id no longer exists in the live merge-request discussions payload, treat it as deleted and remove it from stored history as well.
- If the live discussion still exists but the stored `note_id` no longer appears in that discussion's notes, treat the original review note as deleted and remove that history item.
- When reconciling stored history against live GitLab discussions, prefer each diff note's `resolved` boolean. Older/nullish fallback fields such as `resolved_at`, `resolved_by`, `resolved_by_id`, and `resolved_by_push` are only fallback signals when `resolved` is absent.
- History reconciliation logs should report three counts separately: removed resolved review items, removed deleted review items, and kept existing unresolved review items.
- Resolved historical inline discussions must never be embedded into the prompt duplicate-suppression section and must never remain in the hidden base64 review-history payload.
- The next run flattens prior `content` items, writes them to a temp Markdown file beside the diff pages, formats them as repeated review blocks with a small `Diff` table plus a freeform `Suggestions` section, and tells the model to read that file only at the final JSON-construction step to suppress duplicate inline findings on the same file and exact old/new line pair.
- The next run flattens prior `suggestion` items, writes them to a temp Markdown file beside the diff pages, formats them as repeated review blocks with a small `Diff` table plus a freeform `Suggestions` section, and tells the model to read that file only at the final JSON-construction step to suppress duplicate inline findings on the same file and exact old/new line pair.
- The runtime uses a shared constant output path `join(tmpdir(), "output.json")` for JSON handoff. Prompt instructions tell the model to use Node.js `fs.writeFileSync()` to write the final JSON payload there, without requiring minification and without returning JSON in the final response message.
- Agent services (`copilot` and `pi`) read that shared output file after the agent process exits. Review JSON markers are no longer used for service-level parsing.
- Agent services must normalize parsed review JSON before returning it to the main workflow. Malformed localized summary records, `summary.changes`, or `reviews[].suggestions` must fall back to empty safe shapes instead of crashing summary or inline rendering, and each normalization problem must be appended to `response.errors` with a `[Validation] ...` message so the summary errors section displays it.
- `app/services/copilot.ts` must explicitly allow the repository working directory plus temp directories through Copilot CLI `--add-dir` flags. Include `process.cwd()`, `tmpdir()`, and the POSIX `/tmp` alias when available, plus any resolved realpaths, because macOS can expose `/tmp` as a symlink while Node reports the real temp directory under `/var/folders/...`.
- Summary parsing should accept older stored history entries that used `content` instead of `suggestion`, but all newly written history payloads should store `suggestion`.
- Previous inline discussions are not auto-deleted; users resolve them manually in GitLab.

## Module Organization

| File | Purpose |
|------|---------|
| `app/main.ts` | Orchestrates debounce, stale-commit skipping, diff fetch, prompt generation, agent execution, inline discussion posting, summary replacement, and cleanup of the reviewing marker note |
| `app/constants.ts` | Shared output-file path and CLI environment defaults |
| `app/prompts.ts` | Builds the review prompt, including diff-reading instructions, deferred duplicate-suppression history guidance, translation requirements, and diff-position guidance |
| `app/services/gitlab.ts` | GitLab API wrapper for MR fetch, diff pagination, note lookup/creation/deletion, history parsing, inline discussion creation, and failed-request logging with GitLab `x-request-id` correlation ids |
| `app/services/gitlab.types.ts` | GitLab-facing entities, review-history payload types, MR note types, and diff result types |
| `app/services/copilot.ts` | GitHub Copilot CLI invocation, output-file JSON reading from `output.json`, and Copilot-specific usage extraction |
| `app/services/pi.ts` | Pi invocation, Pi-event interpretation, shared output-file JSON handoff reading, human-readable console formatting, and usage extraction |
| `app/services/logger.ts` | Shared `consola` logger and optional file logging |
| `app/i18n/index.ts` | Typed runtime i18n helper for locale resolution, one-time async initialization, dot-path keys, plural selection, and dispatch to per-locale dictionaries |
| `app/i18n/prompts.ts` | Prompt-specific language helper text, such as the shared classical Chinese script note derived from `--thinking-lang` and any requested translation languages |
| `app/i18n/locales/*.ts` | Per-locale translation dictionaries, with `app/i18n/locales/en.ts` as the source schema for key and interpolation typing |
| `app/i18n/schema.ts` | Shared locale-definition helper types used by the split i18n dictionaries |
| `app/utils/argv.ts` | CLI argument parsing via yargs |
| `app/utils/env.ts` | Shared live getters for runtime environment variables so modules can import a central env helper without snapshotting `process.env` at import time |
| `app/utils/std-handler.ts` | Shared stdout/stderr helpers for incremental log streaming, recent-output tails, and marked-JSON capture |
| `app/utils/diff-files.ts` | Writes paginated unified diff files and can recompute positions from `diff_file` / `diff_line_code` references |
| `app/utils/review-helpers.ts` | Pure helpers for review line/location formatting |
| `app/utils/composers/review-comment-builder.ts` | Renders inline review comment bodies plus requested/translated display-language selection helpers |
| `app/utils/composers/reviewing-comment-builder.ts` | Renders the top-level review-in-progress marker note body using the current commit reference |
| `app/utils/composers/comment-helper.ts` | Shared comment-formatting, GitLab link generation, and localization helpers reused by comment builders |
| `app/utils/lang.ts` | Shared language display-name and flag helpers for collapsed-language headers, with cached Intl/flag lookups |
| `app/utils/composers/summary-comment-builder.ts` | Renders summary markdown, performance/errors, history trimming, and encoded history blocks |
| `app/utils/composers/summary-comment-with-snippet-builder.ts` | Renders the reduced top-level summary note used when `--post-summary-with-snippet` succeeds |
| `app/utils/composers/summary-comment-with-critical-error-builder.ts` | Renders the critical-error summary title and warning block reused by the main summary composer |
| `app/utils/time.ts` | Temporal-based time helpers and async sleep utility |
| `app/utils/model-name-parser.ts` | Shared model parsing helpers |
| `app/utils/copilot-effort.ts` | Copilot CLI effort normalization helpers |
| `app/utils/commit-reference.ts` | Shared current-commit SHA, short SHA, and URL helpers |
| `app/utils/model-display.ts` | Shared normalized model display string for summaries and inline reviews |
| `app/utils/pi-message-formatter.ts` | Human-readable Pi console event formatter |
| `app/utils/pi-usage-collector.ts` | Pi usage extraction helpers |
| `app/utils/stats/*.ts` | OS-specific runtime stats samplers plus the shared collector that records parent and agent usage during agent execution |
| `app/utils/json.ts` | Safe JSON extraction/parsing helpers |
| `app/utils/cli-env.ts` | Shared CLI environment helpers |
| `app/utils/empty-review-response.ts` | Shared empty error-response builder used by both agent service implementations |
| `app/types/review.types.ts` | Shared review/summary/usage payload types |
| `scripts/commit.ts` | Interactive local commit helper that runs checks, stages changes, and creates a Conventional Commit |

Rules:
- No default exports in `app/`.
- Use named imports throughout.
- Prefer pure helpers in `app/utils/` over embedding parser/formatter logic in `app/main.ts`.
- Type imports should come from the owning domain module, for example `./types/review.types` and `./services/gitlab.types`.
- `scripts/commit.ts` uses `node:readline/promises` for text input. Do not use `consola.prompt({ type: "text" })` there: with Bun 1.4.0 it can duplicate typed characters. Consola select and confirm prompts remain in use.
- Bun service specs share `mock.module()` registrations across files. A mock of `app/services/logger.ts` must expose every imported logger export, including both `logger` and `writeLogStream`, so parallel service-module loading cannot fail with a missing ESM export.

Model display rules:
- `app/utils/model-display.ts` defaults missing effort suffixes to `medium` in rendered model labels.
- `app/utils/model-display.ts` now reads the configured model from `argv["model"]` directly. `getModelDisplayName({ hideEffort: true })` returns only the normalized model id without any effort badge and is used by summary-title fallbacks when the agent response omits `readableModelName`.
- `mimo` effort labels are displayed directly from the configured effort, with omitted effort rendered as `medium`.
- `MiniMax` display labels are agent-aware. For `pi`, omitted effort renders as `thinking: disabled`; for `github-copilot-cli`, omitted effort renders as `thinking: adaptive`. Explicit `MiniMax` effort values other than `off` or `disabled` render as `thinking: adaptive`; `off` and `disabled` always render as `thinking: disabled`.
- `app/services/copilot.ts` removes provider prefixes and any trailing effort suffix from `argv["model"]` before passing the model id to Copilot CLI `--model`. For example, `github-copilot/gpt-5.6-terra:max` becomes `--model gpt-5.6-terra --effort max`. Copilot accepts `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`; `off` and `disabled` map to `none`, while every other unsupported configured effort maps to `medium` before it is passed via `--effort`.

## CLI Arguments and Environment Variables

`app/utils/argv.ts` accepts:

- `--agent`: required. `github-copilot-cli` or `pi`.
- `--gitlab-token`: defaults to `GITLAB_TOKEN`.
- `--gitlab-url`: defaults to `CI_SERVER_URL`.
- `--agent-bin`: optional override for the selected agent binary. Defaults to `AGENT_BIN` when set, otherwise the provider-specific fallback (`copilot` / `pi`).
- `--agent-args`: optional extra CLI arguments appended after built-in provider flags.
- `--model`: shared runtime model string. Default: `gpt-5.4`.
- `--copilot-github-token`: defaults to `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, or `GITHUB_TOKEN`.
- `--project-id`: defaults to `CI_PROJECT_ID`.
- `--mr-iid`: defaults to `CI_MERGE_REQUEST_IID`.
- `--max-git-diff-page`: positive integer page limit for paginated MR diff fetches. Default: unlimited.
- `--max-history-length`: positive integer cap for the number of review runs kept in the encoded summary history. Default: `12`.
- `--review-max-pending-time`: maximum time to wait for an existing reviewing marker before skipping the current run. Accepts integer durations with suffixes `ms`, `milliseconds`, `s`, `seconds`, `minutes`, or `m`. Default: `30minutes`.
- `--mr-check-interval`: shared reviewing-marker / latest-commit poll interval. Accepts integer durations with suffixes `ms`, `milliseconds`, `s`, `seconds`, `minutes`, or `m`. Default: `10s`.
- `--html-marker-prefix`: lowercase kebab-case prefix used to build the marker names above. Default: `copilot`.
- `--dry-run` / `--debug` / `-d`: run the real review pipeline but skip all GitLab writes, including inline comments, summary notes, and reviewing-marker notes.
- `--post-summary-with-snippet`: create a public GitLab project snippet that stores the full summary markdown, then post a reduced top-level summary note that links to that snippet. Default: `false`. Critical-error summaries skip snippet creation, and snippet-creation failures fall back to the original full summary note.
- `--log`: enable file logging; supports bare flag or a directory path.
- `--max-stdout-size`: byte-size string with case-insensitive `b`, `kb`, or `mb` suffixes. Default: `100mb`. Live agent stdout printing stops once accumulated stdout reaches `80%` of that byte limit, measured with `Buffer.byteLength(...)`, so the process keeps a `20%` safety margin below GitLab's maximum job log file size.
- `--collect-runtime-stats`: collect best-effort runtime stats for the Bun parent process and the spawned review agent while the agent runs. Default: `false`.
- `--log-level`: logger verbosity.
- `--instruction-files`: repeatable list of repository instruction entry files passed through to the prompt.
- `--extra-prompts`: appended prompt text.
- `--should-teach-diff-compute`: include the explicit unified-diff line-number teaching block. Default: `false`.
- `--tools`: repeatable extra tool allowlist entries.
- `--allow-all-tools`: allow all permissions for the selected agent. Default: `false`. Copilot CLI receives `--allow-all`; Pi receives `--approve` with no `--tools` allowlist. The runtime's built-in Copilot tool and directory allowlists are omitted to avoid conflicting flags.
- `--lang`: repeatable display languages for summary/inline output.
- `--thinking-lang`: primary thinking language and required language key included in every language-keyed review/summary record returned by the agent. Default: `en`.
- `--collapsed-lang` / `--c-lang`: repeatable display languages to render in `<details>` blocks.
- `--collapse-changes-summary`: wrap the rendered `## 🚧 Changes` section in a runtime-owned `<details>` block with summary label `Details`. Default: `false`.
- `--collapse-review-summary`: wrap the rendered `## 🔍 Review Summary` section in a runtime-owned `<details>` block with summary label `Details`. Default: `false`.
- `--ignored-rank`: repeatable prompt-side rank suppression request with values `HIGH`, `MEDIUM`, `LOW`.
- `--version` / `-v`: print version info and exit.

Pi JSON parsing rules:
- `app/services/pi.ts` must capture review JSON incrementally from streamed assistant text events (`text_delta`, `text_end`, `message_end`) using the shared marked-JSON capture helper instead of relying only on the final `agent_end` payload.
- Final `agent_end` assistant text remains a fallback source when no streamed marker block was captured.
- Keep focused coverage in `app/services/pi.spec.ts` for cases where streamed assistant text contains a complete marker block but the final `agent_end` text is truncated or otherwise malformed.

Language rendering rules:
- The agent response shape is direct and normalized at the source: `readableModelName`, `summary.walkthrough`, `summary.changes`, `summary.otherSuggestions`, and `reviews[].suggestions[lang].{detail,abstract}`. There is no runtime normalization layer and no legacy `summary.content`, `summary.translations`, `reviews[].suggestion`, or `reviews[].translations` contract.
- The review prompt also tells the model to begin reasoning in `--thinking-lang` immediately after receiving the prompt; if the selected runtime exposes visible thinking/planning text before the final JSON line, that visible reasoning should stay in `--thinking-lang` too.
- The review prompt also tells the model to translate the prompt instructions it relies on into `--thinking-lang` at the start of reasoning for internal use, then base all subsequent reasoning on that translated prompt, and to prefer direct UTF-8 characters over Unicode escape sequences in visible thinking and final JSON string values whenever valid JSON allows it.
- Requested response languages are `--thinking-lang` plus every language requested by `--lang` and `--collapsed-lang`, deduped by normalized language tag.
- When no `--lang` / `--collapsed-lang` values are provided, summary and inline rendering default to `--thinking-lang` instead of assuming English.
- Language display helpers should normalize empty display-language inputs to `--thinking-lang`, and must still fall back to `en` if tests or import order expose an unset runtime argv value.
- Display-language inputs and helper defaults should use canonical language tags such as `en`, `ja`, and `zh-CN`; do not add special handling for the literal `english` in rendering helpers.
- `reviews[].suggestions[lang].detail` is the inline-review body for that language, and `reviews[].suggestions[lang].abstract` is the summary-list text for that language.
- Review-history persistence uses `reviews[].suggestions[thinkingLang].abstract` as `ReviewHistoryContentEntity.suggestion`, while summary-history parsing still accepts older stored `content` payloads for backward compatibility.
- Inline rank badges are rendered by the runtime and stay in the source/thinking language even when the inline comment body is shown in another display language.
- Summary review-list entries link the `file_path:line` label to the current run's successfully created GitLab inline note when the runtime has both `CI_PROJECT_URL` and the created `note_id`; when inline posting fails or no note URL context is available, the summary falls back to plain `file_path:line` text.
- When `--post-summary-with-snippet` succeeds, the top-level summary note keeps only the summary marker, a plain title, a localized standalone snippet link line, any collapsed errors section, and the hidden review-history payload. The snippet itself stores the original full summary markdown.
- When inline posting succeeds only after `recomputeReviewPositionFromDiffReference(...)` adjusts the location, the runtime must also render the summary from those recomputed coordinates so the summary line numbers and note links match the stored current-run history entry.

Runtime environment variable reads are centralized in `app/utils/env.ts`. Keep its exports as live getters instead of import-time snapshots so tests and modules that mutate `process.env` after startup still observe current values.
- Help/version handling belongs at the entrypoint boundary: `app/main.ts` must return before dynamically importing GitLab-dependent runtime modules such as `app/services/gitlab.ts` or `app/utils/review-process.ts`, so `bun dev -h` and `bun dev -v` do not require MR/project arguments.
- Failed GitLab API calls should be logged before rethrowing, and that log line must include the GitLab `x-request-id` response header when present so operators can correlate CI failures with GitLab server logs.

## Internal I18n

- Internal user-facing GitLab note strings should use `t(...)` from `app/i18n/index.ts` instead of introducing new hard-coded literals in feature code. Console log strings are currently not localized and remain English.
- Summary UI labels rendered by `app/utils/composers/summary-comment-builder.ts` and `app/utils/composers/review-comment-builder.ts`, including summary headings, table headers, review-rank tags, empty-review lines, history footers, and performance/error detail summaries, should use `t(...)` so they follow the intended render language.
- `app/utils/composers/reviewing-comment-builder.ts` should render the reviewing-marker manual-delete hint through `reviewProcess.reviewingMarker.manualDeleteHint` with a `linkToJobDetail` interpolation value derived from `CI_JOB_URL` or the `CI_PROJECT_URL` + `CI_JOB_ID` fallback, and locale files should keep that phrase localized rather than hard-coding the markdown link in feature code.
- `ReviewResponseEntity.withCriticalError` must be set from the concrete failure branches that own the fault, not inferred later from generic error strings. Current critical sources are: GitLab diff-fetch failures returned by `GitLabService.getMergeRequestDiffs()`, agent runs that exit with a non-zero code, and agent runs that exit without producing the marked review JSON block. Child-process `error` events should record the startup failure for the eventual `close` path instead of resolving early, so agent criticality is decided from the final exit outcome. When an agent closes non-zero, the runtime should return a critical exit-code error immediately and skip any marked-JSON extraction or parse attempts from captured output. When the flag is true, the summary renderer inserts a GitLab `> [!warning]` block between the summary title and walkthrough title for each rendered language, using localized `reviewSummary.criticalError.*` text and a CI job detail link derived from `CI_JOB_URL` or the `CI_PROJECT_URL` + `CI_JOB_ID` fallback; the retry instruction is plain localized text, not a separate retry URL.
- `app/i18n/index.ts` resolves the active locale directly from `argv["thinking-lang"]`. Startup code must call and await `initI18n({ preloadLanguageTags })` once before any translated runtime output is built; preload the thinking language plus every requested display/collapsed language. After initialization, `t(...)` is synchronous.
- `app/i18n/index.ts` should own the async loading boundary and cache the active locale after initialization rather than performing dynamic imports inside each `t(...)` call.
- `t(key, { lang })` is the supported way to force a specific render language for a localized runtime string while keeping the globally initialized thinking language unchanged.
- Locale definitions live under `app/i18n/locales/` such as `app/i18n/locales/en.ts` and `app/i18n/locales/zh-TW.ts`; keep `app/i18n/index.ts` focused on typing, locale resolution, initialization, and lookup.
- Locale keys are nested objects with dot-path lookup keys derived from the English source dictionary. Interpolated entries should be functions, not placeholder strings, and placeholder names must stay stable across all locales because interpolation parameter names are inferred from the English source locale.
- Pluralized entries are also leaf values: define them as branch objects with keys such as `zero`, `one`, and `other`, and call them through the normal `t(key, { count })` API. The full sentence for `zero` belongs in the locale file rather than feature code.
- Type-level translation key generation must stop recursion at pluralized leaves so `TranslationKey` contains the plural entry's dot-path key itself, not nested branch keys like `.zero` or `.other`.
- Special language tags `zh-Hans`, `zh-Hant`, `zh-lzh`, `zh-Hans-lzh`, and `zh-Hant-lzh` are supported. `zh-lzh` and `zh-Hans-lzh` render as classical Chinese in simplified characters, `zh-Hant-lzh` renders as classical Chinese in traditional characters, and collapsed-language headers should fall back to `文言文` display names plus the `zh-CN` flag alias when Bun `Intl` does not support those tags.
- Locale resolution order is: exact `--thinking-lang`, then its primary language subtag, then the configured fallback language, then its primary language subtag, and finally English.
- When adding or renaming translation keys, update every bundled locale together and add or adjust the `tstyche` type checks in `app/i18n/index.tst.ts`.
- Validate i18n typing with `bun run typecheck`; `tstyche` auto-discovers `*.tst.ts` files, so new type-only checks should follow that suffix.
- Do not rewrite existing translations unless the user explicitly asked for wording changes, a key changed, or a placeholder bug requires it. Avoid unrelated translation churn.

Documentation maintenance rule:
- Whenever `app/utils/argv.ts` changes the CLI argument surface, defaults, aliases, or descriptions, update `README.md` in the same change so the published options table stays synchronized with the implementation.

## Review Workflow

`app/main.ts` follows this sequence:

1. Check for an existing `<!-- <prefix>-reviewing-marker -->` note.
2. If present, wait for `--mr-check-interval` and check again until the marker disappears or total wait exceeds `--review-max-pending-time`.
3. If the marker still exists at the limit, log a warning and exit successfully without reviewing.
4. During each pending-review wait cycle, re-fetch the merge request and compare `process.env.CI_COMMIT_SHA` to `mr.diff_refs.head_sha`; if the MR head already moved, exit successfully without waiting further.
5. If the MR head moved to a different commit, log a warning and exit successfully without reviewing.
6. If not in `--dry-run`, post a new reviewing-marker note that references the current commit (`CI_COMMIT_SHORT_SHA` / `CI_PROJECT_URL/-/commit/CI_COMMIT_SHA` when available).
7. Load the existing summary note, decode the review-history block if present, fetch all merge-request discussion pages from GitLab, drop any resolved stored discussions from that history snapshot, then flatten only the unresolved discussion content for later duplicate suppression.
8. Fetch paginated MR diffs and write one temp file per page: `mr-diff.page-<n>.diff`.
9. When unresolved prior inline history exists, write it to `prior-inline-review-history.md` in the same temp directory as the diff pages.
10. Run the configured agent (`github-copilot-cli` or `pi`) with the generated prompt.
11. While the agent process is still alive, poll GitLab every 10 seconds; if the merge-request head SHA no longer matches `CI_COMMIT_SHA`, cancel the run, kill the agent process, and remove the current reviewing-marker note immediately when possible.
12. When `--collect-runtime-stats` is enabled, start the shared runtime sampler around the spawned agent process and attach the collected parent/agent stats to the response before final resolve.
13. If not in `--dry-run`, wait again for other reviewing-marker notes while ignoring this process's own reviewing-marker note id so the job does not block on itself.
14. Re-fetch the merge request and compare `process.env.CI_COMMIT_SHA` to the latest `mr.diff_refs.head_sha` again.
15. If the MR head moved during review preparation or agent execution, skip all inline-review and summary writes.
16. If not in `--dry-run`, post inline GitLab discussions. `--ignored-rank` is enforced by prompt instructions, not runtime post-filtering.
17. Build the summary note from the structured response. When `--post-summary-with-snippet` is enabled and the response does not carry `withCriticalError`, first render the full summary markdown, create a public GitLab project snippet titled with `t("reviewSummary.title", { readableModelName, lang: thinkingLang })`, use `summary.md` as the snippet file path, log snippet creation success or failure to the terminal, and then render the reduced top-level note with a plain title plus a localized snippet link line. Do not repeat the review-list summary in that reduced note. If snippet creation fails, fall back to the original full summary note. Unless `--dry-run` is enabled, post the new summary note before deleting any prior summary note. If posting the new summary fails, keep the old summary note in place. Stored history contains only unresolved historical inline discussions plus the newly created discussions from the current run.
18. Delete the reviewing-marker note in a `finally` block when one was created, unless stale-run cancellation already removed it early.

### Duplicate Suppression Semantics

Prompt history is not a request to repeat or validate older comments. It is only a deferred suppression list.

- Suppress a new inline review only when the same issue is already covered on the same file and exact same old/new line pair.
- If the same issue appears on a different file or line pair, it is a new finding and should still be reported.
- The model should ignore the history file during initial review analysis and read it only immediately before constructing the final JSON payload.
- The deferred history file should include only duplicate-detection fields (`file_path`, `new_line`, `old_line`, `suggestion`) and should omit GitLab discussion metadata such as `discussion_id` and `note_id`.
- Keep rich suggestion markdown outside table cells; only the diff coordinates belong in the small `Diff` table.
- History must not inflate the summary walkthrough, change list, summary counts, or other summary prose.
- Resolved historical discussions are excluded from this suppression list because the runtime removes them after reconciling stored history against the live merge-request discussion state from GitLab.

## Summary Construction

`app/utils/composers/summary-comment-builder.ts` builds the final MR summary note in this order:

1. `<!-- <prefix>-summary-marker -->`
2. Rendered summary markdown in the requested display languages, built from `response.readableModelName`, `response.summary.walkthrough`, `response.summary.changes`, `response.summary.otherSuggestions`, and `response.reviews[].suggestions[lang].abstract`. The runtime owns the final GitLab layout and localizes the main title, section titles, review-count lead sentence, changes-table headers, history footer, and rank tags.
  - The localized `## 🔍 Review Summary` lead sentence should scope findings to the current CI commit reference rendered by `buildCurrentCommitReference()` from `app/utils/composers/comment-helper.ts`. In English, the preferred phrasing is `I found 2 inline review suggestions in the changes up to commit [\`12345678\`](...)`.
  - The review-in-progress marker note body should be rendered by `app/utils/composers/reviewing-comment-builder.ts`, not by `app/utils/review-process.ts`, so the markdown shape stays covered by a dedicated contract snapshot.
  - `summary.changes[*][lang].layers[*].files` stay plain path strings in model output. `app/utils/composers/summary-comment-builder.ts` wraps long file paths when rendering the `Layer / File(s)` table column so narrow GitLab tables stay readable.
  - Languages listed in `--collapsed-lang` render inside top-level `<details>` blocks whose `<summary>` label uses `Intl.DisplayNames` to show the language name in that language, and appends a flag emoji when the language tag includes a region or an explicit alias. Plain `en` is treated as `en-GB` for the flag. `zh`, `zh-Hans`, `zh-Hant`, `zh-lzh`, `zh-Hans-lzh`, and `zh-Hant-lzh` all alias to the `zh-CN` flag. When Bun `Intl` cannot resolve the classical Chinese tags, fall back to `文言文`, `文言文（简体）`, or `文言文（繁體）` as appropriate.
  - Section-level collapsing for `🚧 Changes` and `🔍 Review Summary` is runtime-owned. When `--collapse-changes-summary` or `--collapse-review-summary` is enabled, `app/utils/composers/summary-comment-builder.ts` wraps the rendered section body in a nested `<details>` block with summary label `Details`.

## Comment Composer Tests

- Comment-builder unit tests and contract tests live under `app/utils/composers/`.
- Ordinary unit coverage stays in `review-comment-builder.spec.ts` and `summary-comment-builder.spec.ts`.
- Snapshot-backed contract coverage lives in `review-comment-builder.contract.test.ts` and `summary-comment-builder.contract.test.ts`.
- Contract snapshot artifacts are stored under `app/utils/composers/__snapshots__/` so builder contracts stay separate from other utility tests.
3. Performance metrics section when available.
  - When `response.runtimeStats` exists, render runtime platform, peak parent memory, parent CPU time, peak agent tree memory, peak agent tree CPU, peak process count, agent read/write bytes when available, and backend notes.
  - When `response.usage` exists, render input/output/cache tokens plus provider-specific metrics such as Copilot `AI Credits`, total tokens, and reasoning tokens.
4. Collapsed errors section when errors exist.
5. The hidden review-history block:

```md
<!-- <prefix>-review-data-start -->
<!--
<base64 JSON array>
-->
<!-- <prefix>-review-data-end -->
```

The history block must stay at the very end of the summary note.

Review-summary rendering rules:
- The prompt returns only structured summary and inline-review data. The runtime generates the localized review-count lead sentence and the optional prior-history footer text itself.
- After the inline-review list, the runtime includes the separator plus the localized history-exclusion note only when prior inline review history existed before the current run.
- Inline rank tags inside both the summary list and inline discussions use the source/thinking language, even when the surrounding detail body is rendered in another display language.

## Inline Review Position Rules

`GitLabService.createReviewDiscussion()` posts exactly the provided `newLine` and/or `oldLine` values. Keep this behavior in sync with the prompt contract.

Important GitLab position rules:
- `startSha` must equal `baseSha`.
- Omit `oldLine` for newly added lines.
- A review must include at least one of `new_line` or `old_line`.
- Runtime posting now prefers `newLine` whenever both `new_line` and `old_line` are present on a single review item, so one inline thread is anchored to the new side instead of rendering twice in split diff views.
- `diff_file` and `diff_line_code` are required in model output so the runtime can retry failed inline positions with a recomputed location.

If posting fails, `app/main.ts` retries once using `recomputeReviewPositionFromDiffReference()`.

## Provider Notes

### GitHub Copilot CLI
- Default allowlist: `read_file`, `list_directory`, `search_files`, `grep`, `shell(node)`.
- `--model provider/model` removes the provider prefix before passing the model id to Copilot CLI.
- Final `:effort` suffix is translated to `copilot --effort <level>`.
- Generic stdout/stderr stream logging and marker-block capture live in `app/utils/std-handler.ts`; `app/services/copilot.ts` should keep only Copilot-specific argument building, process orchestration, and result parsing.
- Agent runtime stats collection is provider-agnostic and lives in `app/utils/stats/`; `app/services/copilot.ts` should only start and stop the shared collector around the spawned child process.
- Copilot stdout still feeds marker capture and file logging after the console print budget is exhausted; only live terminal printing is suppressed.
- Copilot usage metrics are parsed from the CLI's trailing `AI Credits ...` and `Tokens ↑ ... (… cached, … written) • ↓ ... (… reasoning)` lines and mapped into `response.usage.aiCredits`, `input`, `cacheRead`, `cacheWrite`, `output`, `totalTokens`, and `reasoningTokens` when those lines are present. The older form without the `written` value remains supported.

### Pi
- Default allowlist: `read,grep,find,ls,bash`.
- Runs with `--mode json --no-session`.
- Stdin must stay ignored to avoid hangs.
- Provider failures may arrive entirely on stdout JSON events.
- Generic stdout/stderr stream logging and recent-output tails live in `app/utils/std-handler.ts`; `app/services/pi.ts` should keep only Pi-specific JSONL event interpretation and final review extraction.
- Agent runtime stats collection is provider-agnostic and lives in `app/utils/stats/`; `app/services/pi.ts` should only start and stop the shared collector around the spawned child process.
- Stdout JSONL is parsed incrementally during `data` events; the runtime keeps the latest useful `agent_end` event plus usage snapshots instead of reparsing the full stdout buffer on process close.
- Human-readable Pi tool logging must merge streamed assistant `toolCall` arguments with later `tool_execution_*` events because providers can leave `tool_execution_start.args` empty while populating the real `pattern`/`path` via incremental `partialArgs`; grep labels should show the resolved query text instead of the placeholder `"pattern"` when that data is available.
- `app/services/pi.ts`, `app/utils/pi-message-formatter.ts`, and `app/utils/pi-usage-collector.ts` must treat Pi stdout JSON as untrusted at runtime: accept both singular `message` and plural `messages` payloads, guard iterable/content fields with `Array.isArray(...)`, and convert malformed post-exit payloads into logged review errors instead of crashing the Bun binary after `[Pi] Process exited with code 0`.
- Pi stdout still feeds JSONL event parsing and file logging after the console print budget is exhausted; only live terminal printing is suppressed.

## Runtime Stats Backends

- `app/utils/stats/darwin.ts`: samples agent RSS and cumulative CPU time from `ps`; per-process disk I/O bytes are unsupported.
- `app/utils/stats/linux.ts`: samples agent RSS and cumulative CPU time from `ps`, plus read/write byte counters from `/proc/<pid>/io`.
- `app/utils/stats/win32.ts`: samples Win32 process counters through PowerShell `Get-CimInstance Win32_Process`, including working set, cumulative user/kernel CPU time, and transfer counts.
- `app/utils/stats/index.ts`: shared collector that samples parent Bun usage from `process.memoryUsage()` and `process.resourceUsage()`, builds the agent subprocess tree, tracks peak memory/CPU/process count, and preserves the highest observed read/write counters for seen agent PIDs.
- Platform-specific unit tests must run only on the current OS and skip the others.

## Logging

`--log` is independent from `--dry-run` / `--debug`.

- `--log`: write `.gitlab-copilot-ci.{yyyy-mm-dd.hh-mm-ss}.log` in the current directory.
- `--log /path/to/dir`: write in the provided directory.
- The parser resolves the runtime type to `true | string | undefined` via `array: true` plus `coerce`.
- `--max-stdout-size`: defaults to `100mb` to match GitLab's default maximum job log file size. Live agent stdout printing stops at `80%` of that parsed byte limit and emits a warning once so CI logs keep a `20%` headroom before GitLab truncates them.

## Development Commands

- `bun run dev`
- `bun run test`
- `bun run typecheck`
- `bun run tsc`
- `bun run lint`
- `bun run biome`

## Commit Message Format

- Commit messages follow Conventional Commits via `@commitlint/config-conventional`.
- The subject must start with an emoji followed by a space.
- Preferred shape: `<type>: <emoji> <summary>`.
- Example: `feat: ✨ improve stdout print budget handling`.

## Maintenance Notes

Whenever behavior changes, update this skill so it remains a reliable source of truth.

Required updates when behavior changes:
- New or removed CLI arguments
- Review marker semantics
- Summary payload shape
- Retry or debounce workflow changes
- Module moves or renames
