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
- The next run flattens prior `content` items and passes them to the prompt only to suppress duplicate inline findings on the same file and exact old/new line pair.
- Previous inline discussions are not auto-deleted; users resolve them manually in GitLab.

## Module Organization

| File | Purpose |
|------|---------|
| `app/main.ts` | Orchestrates debounce, stale-commit skipping, diff fetch, prompt generation, agent execution, inline discussion posting, summary replacement, and cleanup of the reviewing marker note |
| `app/constants.ts` | Shared JSON markers and CLI environment defaults |
| `app/prompts.ts` | Builds the review prompt, including diff-reading instructions, duplicate-suppression history, translation requirements, and diff-position guidance |
| `app/services/gitlab.ts` | GitLab API wrapper for MR fetch, diff pagination, note lookup/creation/deletion, history parsing, and inline discussion creation |
| `app/services/gitlab.types.ts` | GitLab-facing entities, review-history payload types, MR note types, and diff result types |
| `app/services/copilot.ts` | GitHub Copilot CLI invocation and Copilot-specific response handling |
| `app/services/pi.ts` | Pi invocation, Pi-event interpretation, human-readable console formatting, and usage extraction |
| `app/services/logger.ts` | Shared `consola` logger and optional file logging |
| `app/utils/argv.ts` | CLI argument parsing via yargs |
| `app/utils/env.ts` | Shared live getters for runtime environment variables so modules can import a central env helper without snapshotting `process.env` at import time |
| `app/utils/std-handler.ts` | Shared stdout/stderr helpers for incremental log streaming, recent-output tails, and marked-JSON capture |
| `app/utils/diff-files.ts` | Writes paginated unified diff files and can recompute positions from `diff_file` / `diff_line_code` references |
| `app/utils/review-helpers.ts` | Pure helpers for review line/location formatting |
| `app/utils/review-output.ts` | Normalizes model output and renders inline review comment bodies |
| `app/utils/review-summary.ts` | Renders summary markdown, performance/errors, history trimming, and encoded history blocks |
| `app/utils/time.ts` | Temporal-based time helpers and async sleep utility |
| `app/utils/model-name-parser.ts` | Shared model parsing helpers |
| `app/utils/commit-reference.ts` | Shared current-commit short SHA / URL / markdown reference helpers used by prompts and reviewing-marker notes |
| `app/utils/model-display.ts` | Shared normalized model display string for summaries and inline reviews |
| `app/utils/pi-message-formatter.ts` | Human-readable Pi console event formatter |
| `app/utils/pi-usage-collector.ts` | Pi usage extraction helpers |
| `app/utils/stats/*.ts` | OS-specific runtime stats samplers plus the shared collector that records parent and agent usage during agent execution |
| `app/utils/json.ts` | Safe JSON extraction/parsing helpers |
| `app/utils/cli-env.ts` | Shared CLI environment helpers |
| `app/types/review.types.ts` | Shared review/summary/usage payload types |

Rules:
- No default exports in `app/`.
- Use named imports throughout.
- Prefer pure helpers in `app/utils/` over embedding parser/formatter logic in `app/main.ts`.
- Type imports should come from the owning domain module, for example `./types/review.types` and `./services/gitlab.types`.

## CLI Arguments and Environment Variables

`app/utils/argv.ts` accepts:

- `--agent`: `github-copilot-cli` or `pi`. Default: `github-copilot-cli`.
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
- `--process-max-pending-time`: positive integer number of minutes to wait for an existing reviewing marker before skipping the current run. Default: `30`.
- `--html-marker-prefix`: lowercase kebab-case prefix used to build the marker names above. Default: `copilot`.
- `--debug` / `-d`: generate mock reviews only.
- `--log`: enable file logging; supports bare flag or a directory path.
- `--max-stdout-size`: byte-size string with case-insensitive `b`, `kb`, or `mb` suffixes. Default: `100mb`. Live agent stdout printing stops once accumulated stdout reaches `80%` of that byte limit, measured with `Buffer.byteLength(...)`, so the process keeps a `20%` safety margin below GitLab's maximum job log file size.
- `--collect-runtime-stats`: collect best-effort runtime stats for the Bun parent process and the spawned review agent while the agent runs. Default: `false`.
- `--log-level`: logger verbosity.
- `--instruction-files`: repeatable list of repository instruction entry files passed through to the prompt.
- `--extra-prompts`: appended prompt text.
- `--should-teach-diff-compute`: include the explicit unified-diff line-number teaching block. Default: `false`.
- `--tools`: repeatable extra tool allowlist entries.
- `--lang`: repeatable display languages for summary/inline output.
- `--collapsed-lang` / `--c-lang`: repeatable display languages to render in `<details>` blocks.
- `--collapse-changes-summary`: ask the model to emit the `## 🚧 Changes` heading normally, followed by a `<details>` block with summary label `Details` that contains the section body in `summary.content` and every translated summary block. Default: `false`.
- `--collapse-review-summary`: ask the model to emit the `## 🔍 Review Summary` heading normally, followed by a `<details>` block with summary label `Details` that contains the section body in `summary.content` and every translated summary block. Default: `false`.
- `--ignored-rank`: repeatable prompt-side rank suppression request with values `HIGH`, `MEDIUM`, `LOW`.
- `--version` / `-v`: print version info and exit.

Runtime environment variable reads are centralized in `app/utils/env.ts`. Keep its exports as live getters instead of import-time snapshots so tests and modules that mutate `process.env` after startup still observe current values.

Documentation maintenance rule:
- Whenever `app/utils/argv.ts` changes the CLI argument surface, defaults, aliases, or descriptions, update `README.md` in the same change so the published options table stays synchronized with the implementation.

## Review Workflow

`app/main.ts` follows this sequence:

1. Check for an existing `<!-- <prefix>-reviewing-marker -->` note.
2. If present, wait 30 seconds and check again until the marker disappears or total wait exceeds `--process-max-pending-time` minutes.
3. If the marker still exists at the limit, log a warning and exit successfully without reviewing.
4. Fetch the merge request and compare `process.env.CI_COMMIT_SHA` to `mr.diff_refs.head_sha`.
5. If the MR head moved to a different commit, log a warning and exit successfully without reviewing.
6. Post a new reviewing-marker note that references the current commit (`CI_COMMIT_SHORT_SHA` / `CI_PROJECT_URL/-/commit/CI_COMMIT_SHA` when available).
7. Load the existing summary note, decode the review-history block if present, flatten prior discussion content, and feed it into the prompt only for duplicate suppression.
8. Fetch paginated MR diffs and write one temp file per page: `mr-diff.page-<n>.diff`.
9. Run the configured agent (`github-copilot-cli` or `pi`) with the generated prompt.
10. When `--collect-runtime-stats` is enabled, start the shared runtime sampler around the spawned agent process and attach the collected parent/agent stats to the normalized response before final resolve.
11. Before any GitLab writes, wait again for other reviewing-marker notes while ignoring this process's own reviewing-marker note id so the job does not block on itself.
12. Re-fetch the merge request and compare `process.env.CI_COMMIT_SHA` to the latest `mr.diff_refs.head_sha` again.
13. If the MR head moved during review preparation or agent execution, skip all inline-review and summary writes.
14. Normalize the response and post inline GitLab discussions. `--ignored-rank` is enforced by prompt instructions, not runtime post-filtering.
15. Replace the prior summary note with a new one that contains the updated markdown plus the trimmed encoded history block.
16. Delete the reviewing-marker note in a `finally` block, even if the review run fails.

### Duplicate Suppression Semantics

Prompt history is not a request to repeat or validate older comments. It is only a suppression list.

- Suppress a new inline review only when the same issue is already covered on the same file and exact same old/new line pair.
- If the same issue appears on a different file or line pair, it is a new finding and should still be reported.
- History must not inflate the summary walkthrough, change list, summary counts, or other summary prose.

## Summary Construction

`app/utils/review-summary.ts` builds the final MR summary note in this order:

1. `<!-- <prefix>-summary-marker -->`
2. Rendered summary markdown in the requested display languages. Languages listed in `--collapsed-lang` render inside `<details>` blocks whose `<summary>` label uses `Intl.DisplayNames` to show the language name in that language, and appends a flag emoji when the language tag includes a region. Plain `en` is treated as `en-GB` for the flag and plain `zh` is treated as `zh-CN` for the flag (for example `zh` -> `中文 🇨🇳`, `zh-CN` -> `中文（中国大陆） 🇨🇳`, `en` -> `English 🇬🇧`).
  - Section-level collapsing for `🚧 Changes` and `🔍 Review Summary` is prompt-driven. When `--collapse-changes-summary` or `--collapse-review-summary` is enabled, `app/prompts.ts` asks the model to emit the normal `##` heading first, then a nested `<details>` block with summary label `Details` for the section body, including translated summary blocks; `app/utils/review-summary.ts` does not rewrite those sections at render time.
3. Performance metrics section when available.
  - When `response.runtimeStats` exists, render runtime platform, peak parent memory, parent CPU time, peak agent tree memory, peak agent tree CPU, peak process count, agent read/write bytes when available, and backend notes.
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

Prompting rules for the `## 🔍 Review Summary` section:
- The summary template asks the model to mention the current commit using the shared markdown commit reference built from `CI_COMMIT_SHORT_SHA` and `CI_PROJECT_URL/-/commit/CI_COMMIT_SHA` when available.
- After the inline-review list, the template includes the separator plus the subscript history-exclusion note only when prior inline review history was passed into the prompt for duplicate suppression.

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
- `--model provider/model` passes through as-is.
- Final `:effort` suffix is translated to `copilot --effort <level>`.
- Generic stdout/stderr stream logging and marker-block capture live in `app/utils/std-handler.ts`; `app/services/copilot.ts` should keep only Copilot-specific argument building, process orchestration, and result parsing.
- Agent runtime stats collection is provider-agnostic and lives in `app/utils/stats/`; `app/services/copilot.ts` should only start and stop the shared collector around the spawned child process.
- Copilot stdout still feeds marker capture and file logging after the console print budget is exhausted; only live terminal printing is suppressed.

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

`--log` is independent from `--debug`.

- `--log`: write `.gitlab-copilot-ci.{yyyy-mm-dd.hh-mm-ss}.log` in the current directory.
- `--log /path/to/dir`: write in the provided directory.
- The parser resolves the runtime type to `true | string | undefined` via `array: true` plus `coerce`.
- `--max-stdout-size`: defaults to `100mb` to match GitLab's default maximum job log file size. Live agent stdout printing stops at `80%` of that parsed byte limit and emits a warning once so CI logs keep a `20%` headroom before GitLab truncates them.

## Development Commands

- `bun run dev`
- `bun run test`
- `bun run tsgo`
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
