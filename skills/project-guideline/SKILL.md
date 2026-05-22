---
name: project-guideline
description: Complete project structure, architecture, and development guidelines for gitlab-copilot-ci
keywords:
  - project-structure
  - app-runtime
  - ci-runtime
  - review-process
  - sqlite
  - release-process
---

# Project Guideline SKILL

## Project Overview

**gitlab-copilot-ci** is a Bun-based shell application compiled into a binary for automated code review. The binary integrates with GitLab CI systems to perform code reviews using a selectable LLM CLI provider (currently GitHub Copilot or Pi) and post results back to merge requests.

### Two Runtime Environments

#### 1. App Runtime
- **Context**: Binary executes in CI of *external projects* (customer repositories)
- **Purpose**: Review code changes in merge requests using the configured LLM service provider
- **Configuration**: Invoked with GitLab credentials plus provider-specific CLI authentication via CLI arguments or environment variables
- **State Management**: Uses SQLite (optional `--db` argument) to track review history
- **Entry Point**: `app/main.ts` (compiled to `dist/gitlab-copilot-ci` binary)

#### 2. CI Runtime
- **Context**: This project's own CI (`.gitlab-ci.yml`)
- **Purpose**: Build the binary for multiple platforms, validate builds, and create releases
- **Configuration**: Uses GitLab CI environment variables and scripts
- **Entry Points**: `scripts/ci/ensure-release.ts`, `scripts/ci/build-and-publish.ts`
- **Artifacts**: Versioned binaries (e.g., `gitlab-copilot-ci-1.0.0-darwin-arm64`)

---

## Terminology

### Review vs. Summary

- **Review** (inline): One comment on a specific diff position. Each review is a `ReviewItemEntity` with `file_path`, `suggestion`, optional `new_line`, optional `old_line`, optional `diff_file`, optional `diff_line_code`, and optional `translations: Record<string, string>` for additional languages. New review output is expected to include `diff_file` and `diff_line_code`, and at least one of `new_line` or `old_line` must be present.
- **Summary** (top-level): A single markdown comment posted to the merge request containing a human-readable overview of all reviews. It also includes a `## 💡 Other Suggestions` section for valid findings that should stay out of inline review comments because they cannot be mapped safely to an exact current diff line. Marked with HTML comment `<!-- copilot-summary-marker -->`.

### Related Terms
- **Thread/Discussion**: GitLab's term for a conversation thread on a diff line. Each review comment starts a discussion.
- **Review tracking**: Information embedded in the summary comment's HTML (`<!-- copilot-review-data:... -->`) to track which discussions were created by Copilot.
- **Discussion note deletion**: Inline review notes inside a merge-request discussion must be deleted through `MergeRequestDiscussions.removeNote(...)`, not `MergeRequestNotes.remove(...)`.
- **Tracking retention**: When a run replaces the summary comment, it must carry forward any previously tracked discussions that could not be cleaned up in the current run, plus newly created discussions from the current run.
- **Preserve behavior docs during refactors**: When moving logic between files, keep critical inline documentation with the owning code path, especially GitLab MR discussion position rules that explain `startSha = baseSha` and when `oldLine` must be omitted.

---

## Module Organization

The app source is split into focused modules under `app/`:

| File | Purpose |
|------|---------|
| `app/main.ts` | Entry point — orchestrates the review workflow, writes one temporary `mr-diff.page-<n>.diff` file per paginated GitLab diff page, retries failed inline posts with positions recomputed from diff-file references, and dispatches review generation to the provider selected by `--agent` |
| `app/constants.ts` | Shared app-wide constants, including the JSON marker prefix required in prompt instructions and provider CLI output parsing |
| `app/utils/cli-env.ts` | Shared CLI environment helpers, including color-preserving defaults used by both Copilot and Pi child processes |
| `app/utils/json.ts` | Shared JSON helpers for extracting marker-prefixed payloads and safe parsing |
| `app/utils/pi-console.ts` | Pi-specific console event formatter that turns Pi JSON stream events into concise, human-readable console output without changing raw log capture |
| `app/utils/time.ts` | Shared time helpers for local timestamp formatting and elapsed-millisecond measurement |
| `mr-test.ts` | Standalone GitLab MR discussion repro script that posts one inline discussion with direct `fetch()` using provided `--gitlab-token`, `--gitlab-url`, `--project-id`, and `--mr-iid`, printing endpoint, payload, and raw response for 500-debugging |
| `pi-tst.ts` | Manual Pi spawn repro script for local debugging of stdout/stderr behavior; run with `GEMINI_API_KEY=... bun run ./pi-tst.ts` and add `--bad-key` to force an auth failure path |
| `app/types/review.types.ts` | Review payload and LLM response entities used across prompt building, providers, and review-position recomputation (`ReviewItemEntity`, `ReviewResponseEntity`) |
| `app/services/db.types.ts` | SQLite review storage entity (`StoredReviewEntity`) |
| `app/services/gitlab.types.ts` | GitLab-facing entities and internal GitLab workflow data types (`TrackedDiscussionEntity`, MR context/note/discussion entities, and cleanup/diff result data types). Individual MR diff items still use gitbeaker's upstream `MergeRequestDiffSchema`. |
| `app/types/sql.d.ts` | Ambient module declaration for `.sql` file imports |
| `app/prompts.ts` | Prompt template builder (`buildCopilotPrompt`) with multilingual support, a dedicated unified-diff line-number guidance block, support for `new_line`/`old_line` review positions plus `diff_file`/`diff_line_code` references, explicit instructions to read all paginated `mr-diff.page-*.diff` files, and a markdown-only `## 💡 Other Suggestions` summary section |
| `app/utils/diff-files.ts` | Diff-page helpers for building line-addressable unified diff files, including always-on `# gitlab-meta ...` comment lines plus standard extended diff headers for file metadata such as mode changes and renames, and recomputing GitLab review positions from `diff_file` / `diff_line_code` references |
| `app/utils/review-helpers.ts` | Pure lookup helpers for the review workflow, such as finding diff entries by file path and formatting/choosing review line positions |
| `app/utils/review-summary.ts` | Pure summary markdown builders for performance/error sections and final MR summary note composition |
| `app/migrations/0001_initial.sql` | Initial schema: `reviews` and `schema_migrations` tables |
| `app/migrations/index.ts` | Migration registry and loader |
| `app/utils/argv.ts` | CLI argument parsing via yargs, including provider selection with `--agent` |
| `app/services/logger.ts` | Consola-based logger with file reporter and module-scope `--log` initialization; uses Temporal for timestamps |
| `app/services/db.ts` | `DatabaseService` that owns the optional SQLite connection, migration runner, review reads/writes, and close lifecycle; uses Temporal for `created_at` and imports its runtime SQL statements from `app/services/sql/*.sql` |
| `app/services/sql/*.sql` | Runtime SQL text files used by `DatabaseService` for schema_migrations setup, PRAGMA configuration, and review queries/writes |
| `app/services/copilot.ts` | Copilot CLI interaction (`runCopilotReview`, `getContextInfo`) using shared CLI env, JSON extraction/parsing, and elapsed-time helpers |
| `app/services/pi.ts` | Pi CLI interaction (`runPiReview`) for the `--agent=pi` provider path; it runs Pi in JSON event stream mode, passes the review prompt as a CLI argument, formats Pi console events through `app/utils/pi-console.ts`, and uses shared CLI env, JSON helpers, and elapsed-time helpers before parsing the `agent_end` event back into the shared `ReviewResponseEntity` contract |
| `app/services/gitlab.ts` | `GitLabService` wrapper around `@gitbeaker/rest` for MR fetch/diff, paginated `/diffs` retrieval, summary-note lookup/removal, discussion cleanup, and comment creation, including inline review positions that may use `new_line`, `old_line`, or both |

Rules:
- No default exports in `app/` (enforced by biome, except `app/types/sql.d.ts`)
- Use named imports throughout
- Service imports from within `app/` use `./services/xxx`
- Type imports should come from domain modules (`./types/review.types`, `./services/db.types`, `./services/gitlab.types`) rather than a single central type hub
- Naming convention: storage-related or external data structure types use `*Entity`; internal workflow structures use `*DataType`
- Pure parser/formatter/lookup logic that does not own side effects should live under `app/utils/`, not `app/main.ts`

---

## Temporal and Time Handling

- **Package**: `temporal-polyfill` (installed with `-E` for exact version)
- **Usage**: Replaces `Date.now()` throughout
  - `Temporal.Now.instant().epochMilliseconds` — milliseconds since epoch
  - `Temporal.Now.plainDateTimeISO()` — local ISO date/time (for formatting log filenames)
- **Logger**: Timestamps in `.gitlab-copilot-ci.{yyyy-mm-dd.hh-mm-ss}.log` format use `Temporal.Now.plainDateTimeISO()`
- **Database**: Review `created_at` field stores `Temporal.Now.instant().epochMilliseconds` (milliseconds)
- **Review ID**: Composite ID includes `Temporal.Now.instant().epochMilliseconds` for uniqueness

---

## App Runtime Details

### CLI Arguments and Environment Variables

**app/main.ts** (via `app/utils/argv.ts`) accepts:
- `--agent`: Agent provider for review generation. Choices: `github-copilot`, `pi`. Default: `github-copilot`.
- `--gitlab-token` / `GITLAB_TOKEN`: GitLab API authentication
- `--gitlab-url` / `GITLAB_API_URL`: GitLab API base URL (e.g., `https://gitlab.com/api/v4`)
- `--agent-bin`: Path to the selected agent CLI binary (optional). Defaults to `AGENT_BIN` when set. Runtime fallback remains agent-specific (`COPILOT_BIN`/`copilot` for GitHub Copilot, `PI_BIN`/`pi` for Pi) when not provided.
- `--agent-args`: Optional extra CLI arguments appended to the selected agent invocation after built-in preset options and before the final prompt argument.
- `--provider`: Shared provider name passed through to the selected agent (currently used in the Pi path as `pi --provider`) (optional, defaults to `PI_PROVIDER` when set)
- `--model`: Shared model name option. Default: `gpt-5.4`.
- `--effort` / `--thinking`: Optional reasoning level. `--effort` is canonical and `--thinking` is a backward-compatible alias. Pi supports `off|minimal|low|medium|high|xhigh` natively via `pi --thinking`; Copilot supports a similar flag via `--reasoning-effort` (`none|low|medium|high|xhigh|max`). Runtime maps cross-provider values when needed: `off -> none`, `minimal -> low`, `none -> off`, `max -> xhigh`.
- `--copilot-github-token`: GitHub token for Copilot authentication (from `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, or `GITHUB_TOKEN`)
- `--project-id` / `CI_PROJECT_ID`: GitLab project ID
- `--mr-iid` / `CI_MERGE_REQUEST_IID`: Merge request IID
- `--max-git-diff-page`: Maximum number of paginated GitLab MR diff pages to fetch. Default: unlimited. The runtime currently requests `per_page=20`, so a limit of `N` pages means at most the first `20 * N` diff entries are provided to review generation.
- `--lang`: Additional output language(s) for translations (repeatable, e.g. `--lang=zh-CN --lang=ja`). English is always included. Results in summary/inline comments are displayed in the order specified. Default: `[]` (English only).
- `--version` / `-v`: Show version information and exit immediately. Prints: `${name} ${version} (${platform}-${arch}) - ${commit-hash}`
- `--review-marker`: HTML comment marker for inline reviews (default: `copilot-review-marker`)
- `--summary-marker`: HTML comment marker for summary (default: `copilot-summary-marker`)
- `--review-data-tag`: HTML tag for tracking review discussions (default: `copilot-review-data`)
- `--debug`: Test mode (generates mock reviews instead of real analysis)
- **`--db`**: Path to SQLite database for review history (optional)
- **`--log`**: Enable log file writing (independent of `--debug`). Standard parser pattern for a flag that may appear with or without a value:
  - Parser config: `type: "string", array: true, coerce: ...`
  - Coerced runtime type: `true | string | undefined`
  - `undefined`: logging disabled
  - `true`: `--log` with no value, write to current working directory
  - `string`: first explicit path value from `--log /path` or repeated forms like `--log /a --log /b`
  - Standard resolution: for yargs options that must support both bare-flag and string-value forms, use `array: true` to capture presence and `coerce` to normalize the final runtime shape. Do not rely on `type: "string"` alone.

### Pi Provider Runtime

When `--agent=pi` is selected:

- The app starts Pi with `--mode json --no-session --tools read,grep,find,ls`
- It forwards optional `--provider` as `pi --provider <name>`
- If `--provider` is omitted and `--model` starts with `gemini-` while `GEMINI_API_KEY` is present, the app infers `--provider google`
- It forwards `--model` as `pi --model <pattern>`
- It forwards optional `--effort` (or alias `--thinking`) as `pi --thinking <level>` with compatibility mapping for values shared from Copilot style (`none -> off`, `max -> xhigh`)
- It appends optional parsed `--agent-args` tokens after preset Pi CLI options and before the final prompt argument
- It passes the full review prompt as the final CLI argument
- It spawns Pi with stdin ignored (`stdio: ["ignore", "pipe", "pipe"]`) so the CLI does not hang waiting for EOF on stdin
- Pi's raw JSONL stream is preserved for logging and parsing, but console output is reformatted into concise event summaries during local runs
- Tool execution events are summarized on console as readable blocks such as `Read ...`, `Grep ...`, and `Glob ...`, with green bullets for success and red bullets for errors
- Noisy Pi message payload events are suppressed on console; the full raw JSON stream remains available in the log file when `--log` is enabled
- It parses Pi's JSONL stdout stream and waits for the `agent_end` event to extract the assistant's final text response
- The assistant response must still contain the shared `REVIEW_RESPONSE_JSON_MARKER` line so the app can parse the embedded review JSON
- Pi provider/auth failures can arrive entirely on stdout inside JSON events; stderr may remain empty even when the run fails
- If Pi ends with an assistant-side provider error instead of review JSON, `app/services/pi.ts` surfaces that provider error message directly in `ReviewResponseEntity.errors`

### Inline Review Positions

- GitLab MR diffs are fetched page by page from `GET /projects/:id/merge_requests/:merge_request_iid/diffs` with `per_page=20`
- Diff page counting is endpoint page counting, not changed-file counting: page 1 contains up to 20 diff entries, page 2 the next up to 20, and so on
- If `--max-git-diff-page` is set and the fetch loop reaches that page limit, later pages are skipped and a warning is appended to the summary error block
- Runtime writes each fetched diff page to its own temp unified diff file named `mr-diff.page-<n>.diff`
- Those temp diff files always include `# gitlab-meta ...` comment lines for GitLab diff fields such as old/new path, mode values, and the `new_file` / `renamed_file` / `deleted_file` booleans
- They also include standard extended Git diff headers when metadata is available, such as `old mode` / `new mode`, `new file mode`, `deleted file mode`, and `rename from` / `rename to`
- Prompted review items are expected to include `diff_file` and `diff_line_code` so failed GitLab inline positions can be recomputed from the original diff page line text reference
- If posting an inline review fails, the runtime retries once using a recomputed `file_path` / `new_line` / `old_line` derived from that diff-file reference
- `diff_line_code` must be the exact diff line text as it appears in the page file, including the leading diff marker (` `, `+`, or `-`)
- When duplicate `diff_line_code` values occur in the same diff file, recomputation tries the next later exact match first for repeated citations, then wraps to the earliest match if needed
- Prompted review items may provide `new_line`, `old_line`, or both in the `reviews` array
- The prompt includes a dedicated "How To Compute Correct Diff Line Numbers" block that teaches the reviewer model how to walk unified diff hunks and derive valid `old_line` / `new_line` values
- The MR diff input is paginated through GitLab's `GET /projects/:id/merge_requests/:merge_request_iid/diffs` endpoint using `page` and `per_page`
- Prompting tells the reviewer model to read all provided diff page files before deciding whether a changed file or diff line exists
- Every provided review line must map to a valid diff position in the current MR diff
- At least one of `new_line` or `old_line` must be present for every review item
- `GitLabService.createReviewDiscussion()` posts exactly the provided `newLine` and/or `oldLine` fields to GitLab's diff position payload
- SQLite review persistence still requires `new_line` under the current schema, so old-line-only reviews are posted to GitLab but skipped for DB storage

### Log File Writing

When `--log` flag is enabled (independent of `--debug`):

1. **Log File Creation**
   - Attempts to create a log file at: `.gitlab-copilot-ci.{yyyy-mm-dd.hh-mm-ss}.log`
  - Logger module reads `argv["log"]` at module scope and initializes file logging before other application logging runs
  - If `argv["log"] === true`: uses the current working directory
  - If `argv["log"]` is a string: uses that directory
   - Format: `yyyy-mm-dd.hh-mm-ss` (24-hour time)
   - Example: `.gitlab-copilot-ci.2025-05-13.14-30-45.log`
   - **Validation**: Before creating the log file:
     - If directory does not exist: console warning "Log directory does not exist: ...", logging skipped
     - If no write permission: console warning "No write permission in ...", logging skipped
     - Execution continues with console-only output in both error cases

2. **Log Capture**
   - When log file is successfully created, all output is written to both:
     - **Console** (stdout/stderr for real-time viewing)
     - **Log file** (with log level prefixes for filtering)
   - Log file entries include level prefixes:
     - `[INFO]` for informational messages
     - `[ERROR]` for errors
     - `[WARN]` for warnings

3. **Logger Implementation**
  - Implementation uses a shared `logger` instance from `consola`
  - File logging is added via a custom reporter that mirrors console output into the log file when enabled
  - **Does NOT override console methods**
  - Supports structured logging with automatic JSON serialization of non-string arguments in the file reporter
  - Timestamp formatting: `Temporal.Now.plainDateTimeISO()` yields `yyyy-mm-dd.hh-mm-ss`

4. **Usage Example**
   ```bash
  # Enable logging to cwd (flag with no value)
   ./dist/gitlab-copilot-ci --log \
     --gitlab-token YOUR_TOKEN \
     --gitlab-url https://gitlab.com/api/v4 \
     --project-id 123 \
     --mr-iid 456

   # Enable logging to a specific directory
   ./dist/gitlab-copilot-ci --log /var/log/ci \
     --gitlab-token YOUR_TOKEN \
     --gitlab-url https://gitlab.com/api/v4 \
     --project-id 123 \
     --mr-iid 456

   # Repeated values are allowed; only the first explicit path is used
   ./dist/gitlab-copilot-ci --log /var/log/ci --log /tmp/ignored \
     --gitlab-token YOUR_TOKEN \
     --gitlab-url https://gitlab.com/api/v4 \
     --project-id 123 \
     --mr-iid 456

   # Log file will be created: .gitlab-copilot-ci.2025-05-13.14-30-45.log
   ```

### SQLite Database & Migrations

When `--db <path>` is provided:

#### Migration System

- **Migrations stored in**: `app/migrations/`
  - SQL files (e.g., `0001_initial.sql`) define schema changes
  - `app/migrations/index.ts` imports all migrations and provides `migrations: Migration[]` array
- **Runtime DB queries stored in**: `app/services/sql/`
  - `.sql` files are imported with `with { type: "text" }` in `app/services/db.ts`
  - Current runtime statements cover `schema_migrations` bootstrap, `PRAGMA journal_mode = WAL`, review lookup by MR IID, and review upsert
- **Tracking table**: `schema_migrations` (created automatically)
  - Columns: `name TEXT PRIMARY KEY`, `applied_at INTEGER` (milliseconds via Temporal)
- **Migration runner** (`DatabaseService.runMigrations` in `app/services/db.ts`)
  - On database initialization, checks which migrations have been applied
  - Runs pending migrations in order
  - Records migration name and timestamp in `schema_migrations`
  - Splits SQL statements by `;` to support multiple statements per migration

#### Current Schema (0001_initial)

```sql
CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  new_line INTEGER NOT NULL,
  suggestion TEXT NOT NULL,        -- English suggestion only (no translations stored)
  source_snippet TEXT,
  mr_iid TEXT NOT NULL,
  created_at INTEGER NOT NULL      -- milliseconds (Temporal.Now.instant().epochMilliseconds)
);

CREATE TABLE schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
```

#### Database Initialization

```typescript
databaseService.initialize({ errors });
// 1. Reads argv["db"] and opens SQLite when configured
// 2. Sets PRAGMA journal_mode = WAL
// 3. Calls DatabaseService.runMigrations({ database }) to apply pending migrations
```

#### Review Storage

**Before**: Used `database.exec()` (deprecated in Bun)
**Now**: Uses `database.run()` (scalar statements) and `database.query().run()` for parameterized queries

- `databaseService.getStoredReviewsForMR()`: Returns `StoredReviewEntity[]` with English-only suggestions
- `databaseService.storeReview()`: Inserts review with English suggestion stored in `suggestion` column (no secondary translations)
- `databaseService.close()`: Closes the optional SQLite connection during shutdown and reports close failures into the shared error list
- Review ID: `{mrIid}-{file_path}-{new_line}-{epochMilliseconds}`

### SQLite Database & Migrations

When `--db <path>` is provided:

#### Migration System

- **Migrations stored in**: `app/migrations/`
  - SQL files (e.g., `0001_initial.sql`) define schema changes
  - `app/migrations/index.ts` imports all migrations and provides `migrations: Migration[]` array
- **Tracking table**: `schema_migrations` (created automatically)
  - Columns: `name TEXT PRIMARY KEY`, `applied_at INTEGER` (milliseconds via Temporal)
- **Migration runner** (`runMigrations` in `app/services/db.ts`)
  - On database initialization, checks which migrations have been applied
  - Runs pending migrations in order
  - Records migration name and timestamp in `schema_migrations`
  - Splits SQL statements by `;` to support multiple statements per migration

#### Current Schema (0001_initial)

```sql
CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  new_line INTEGER NOT NULL,
  suggestion TEXT NOT NULL,        -- English suggestion only (no translations stored)
  source_snippet TEXT,
  mr_iid TEXT NOT NULL,
  created_at INTEGER NOT NULL      -- milliseconds (Temporal.Now.instant().epochMilliseconds)
);

CREATE TABLE schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
```

#### Database Initialization

```typescript
const db = initializeDatabase(dbPath);
// 1. Opens SQLite at dbPath
// 2. Sets PRAGMA journal_mode = WAL
// 3. Calls runMigrations(db) to apply any pending migrations
```

#### Review Storage

**Before**: Used `database.exec()` (deprecated in Bun)
**Now**: Uses `database.run()` (scalar statements) and `database.query().run()` for parameterized queries

- `getStoredReviewsForMR()`: Returns `StoredReviewEntity[]` with English-only suggestions
- `storeReview()`: Inserts review with English suggestion stored in `suggestion` column (no secondary translations)
- Review ID: `{mrIid}-{file_path}-{new_line}-{epochMilliseconds}`

### Multilingual Review Output

With `--lang=zh-CN --lang=ja` option:

1. **Copilot Prompt**
   - Asks Copilot to provide translations for each review in the requested languages
  - Returns `ReviewItemEntity` with `translations: Record<string, string>` field
   - Example: `{ suggestion: "use const instead of let", translations: { "zh-CN": "使用 const 而不是 let", "ja": "letではなくconstを使用します" } }`

2. **Inline Comments**
   - English suggestion posted first
   - Each translation appended with blank line separator
   - Order matches `--lang` argument order
   - Example:
     ```
     use const instead of let

     使用 const 而不是 let

     letではなくconstを使用します
     ```

3. **Summary Comment**
   - English section always first (unchanged format/headings)
   - Additional sections appended for each `--lang`
   - Each section uses translated headers and content (Copilot generates these)
   - Example structure:
     ```markdown
     # 📝 Copilot Code Review
     ## 📋 Pull Request Changes [English]
     ...

     # 📝 Copilot Code Review (zh-CN)
     ## 📋 拉取请求变更
     ...

     # 📝 Copilot Code Review (ja)
     ## 📋 プルリクエストの変更
     ...
     ```

4. **Database Storage**
  - `StoredReviewEntity` stores **English suggestion only** (no translations)
   - Translations are transient (used in current review, not persisted)
   - Future LLM reviewers see only the English suggestion when loading previous reviews

### Types

**ReviewItemEntity** (request payload from Copilot):
```typescript
type ReviewItemEntity = {
  file_path: string;
  new_line: number;
  old_line?: number;
  suggestion: string;
  translations?: Record<string, string>;  // e.g., { "zh-CN": "...", "ja": "..." }
};
```

**StoredReviewEntity** (database record):
```typescript
type StoredReviewEntity = {
  id: string;
  file_path: string;
  new_line: number;
  old_line?: number;
  suggestion: string;         // English only
  source_snippet: string;
  mr_iid: string;
  created_at: number;         // milliseconds
};
```
Note: `StoredReviewEntity` does **not** include `translations` — only English suggestions are persisted.

**ReviewResponseEntity** (Copilot output):
```typescript
type ReviewResponseEntity = {
  comment: string;            // Markdown summary (multilingual if --lang used)
  reviews: ReviewItemEntity[];      // Each may have translations
  errors?: string[];
  context?: { total_length?: number; used_length?: number; usage_percentage?: number; };
  duration?: number;          // milliseconds
  model?: string;
};
```



1. **Fetch MR Details**: Get merge request info and full diff from GitLab API
2. **Prepare Prompt**: Build comprehensive prompt including:
   - MR title and description
   - Diff snapshot
   - Previous reviews from SQLite (if `--db` used)
   - Repository context (read AGENTS.md, skills/*/SKILL.md)
  - Instruction that non-inline findings stay inside the summary comment's `## 💡 Other Suggestions` section instead of being returned as structured review items
3. **Call Copilot CLI**: Spawn GitHub Copilot process with:
   - Read-only tools: `read_file`, `list_directory`, `search_files`, `grep`
   - Disabled: file modification, shell execution
4. **Parse Response**: Extract JSON marked with `[COPILOT_JSON_START]`
5. **Load Existing Summary State**: Read the existing Copilot summary note and parse tracked discussion IDs from its embedded JSON
6. **Cleanup Old**: Delete the old summary note, then resolve/delete previous tracked discussions not retained in the new review pass
7. **Post Reviews**: Create inline discussions for each review item through `GitLabService.createReviewDiscussion()`
8. **Post Summary**: Add a top-level summary comment with tracking data and performance metrics through `GitLabService.createSummaryNote()`

### Handling Previous Reviews

When an MR is updated:
1. Load previous reviews from DB
2. Pass to Copilot asking what's still valid
3. Copilot includes valid ones in returned `reviews` array
4. **Existing GitLab discussions**: Still cleaned up per standard flow (outdated = resolved, with-replies = resolved, clean = deleted)
5. DB historical records preserved for reference

### Version Information

**CLI Option**: `--version` / `-v`

**Output Format**: `${name} ${version} (${platform}-${arch}) - ${commit-hash}`

**Version Handling Strategy**:

- **Development**: When running `bun run app/main.ts --version`, version info is fetched at runtime:
  - Version and name from `package.json`
  - Platform/arch from Node.js `process.platform` and `process.arch`
  - Commit SHA from `git rev-parse HEAD` (executed in real-time)

- **Compiled Binary**: When building with `bun run build:*-*`, version info is baked into the binary:
  - Bun's `--define` flag injects values at compile time: `__BUILD_VERSION__`, `__BUILD_PLATFORM__`, `__BUILD_COMMIT__`
  - Binary's `--version` output shows the version/commit from the time of build
  - No runtime git calls needed

**Build Process** (`scripts/build-with-version.ts`):
1. Reads `package.json` for version and name
2. Executes `git rev-parse HEAD` to get current commit
3. Constructs platform string (`${process.platform}-${process.arch}`)
4. Calls `bun build` with `--define __BUILD_VERSION__`, `--define __BUILD_PLATFORM__`, `--define __BUILD_COMMIT__`
5. Cleans up `.*.bun-build` temp files after build (replaces `clean-bun-build.ts` as separate step)

---

## CI Runtime Details

### Build & Release Pipeline

```
Commit to main
    ↓
test:biome + test:unit (parallel quality gates)
    ↓
release (ensure GitLab release exists)
   ↓
build (parallel, 6 platforms)
    ↓
build jobs upload versioned binaries to the release/package registry

Create MR
    ↓
test:biome + test:unit (parallel quality gates)
```

### GitHub Actions CI

- Workflow file: `.github/workflows/test-and-release.yml`
- The `biome` and `unit-test` jobs run in parallel on every push to `main` and on pull requests targeting `main`
- The `build` matrix job waits for both `biome` and `unit-test` to pass via `needs: [biome, unit-test]`

### Build Platforms

- `darwin-arm64` (macOS ARM64 / M-series)
- `darwin-x64` (macOS Intel)
- `linux-x64` (Linux x86-64)
- `linux-arm64` (Linux ARM64)
- `win-x64` (Windows x64)
- `win-arm64` (Windows ARM64)

### Version & Release Management

- Version defined in `package.json`
- Release tag format: `v{version}` (e.g., `v1.0.0`)
- Build output filenames are platform-specific and unversioned, for example `gitlab-copilot-ci-darwin-arm64`, `gitlab-copilot-ci-win-x64.exe`, and `gitlab-copilot-ci-win-arm64.exe`
- Release/package filenames are versioned. Windows release assets keep the `.exe` suffix, for example `gitlab-copilot-ci-{version}-{platform}` for non-Windows targets and `gitlab-copilot-ci-{version}-{platform}.exe` for Windows targets

### Release Preparation

In `scripts/ci/ensure-release.ts`, before the build stage:

1. Read version from `package.json`
2. Check whether `v{version}` already exists
3. If it exists, continue
4. If it does not exist, create the release first

### Per-Platform Build and Publish

In `scripts/ci/build-and-publish.ts`, each build job:

1. Reads `PLATFORM` and `BUILD_SCRIPT` from the CI matrix
2. Checks whether the target versioned asset already exists on the release
3. If the asset exists, skip the build entirely
4. If the asset does not exist, run the platform build script
5. Rename the build output to the versioned release filename
6. Upload the renamed binary to the generic package registry and add a release asset link through the GitLab `/releases/:tag_name/assets/links` API

### Build Artifacts

- The build jobs now upload directly to the GitLab release/package registry
- No cross-job GitLab artifact handoff is required for release publishing
- The renamed binary still exists locally in `dist/` during the job, but it is not the primary handoff mechanism

### CI Build Cache

To speed up dependency installation:
- Set `BUN_INSTALL_CACHE` to `$CI_PROJECT_DIR/.bun/install/cache`
- Set `npm_config_cache` to `$CI_PROJECT_DIR/.npm`
- Create both directories before `bun install`
- Cache `.bun/install/cache` (Bun's package cache) and `.npm` (npm's cache for `npm install -g bun`)
- The CI runner may still report `No URL provided` when shared cache is not configured; that only means the cache stays local to the runner

---

### Development Guidelines

### Code Quality

- Run `bun run lint` (Biome) locally and in CI
- Errors block merges; warnings are advisory
- Use `biome.jsonc` for formatting and linting rules
- **noDefaultExport rule**: Applied to `app/**` except `app/types/sql.d.ts` (which requires default export for module declaration)

### Dependency Management

- Install with locked versions: `bun install -E <package>`
- Keep `bun.lock` committed
- Current runtime dependencies:
  - `@gitbeaker/rest` — GitLab API client
  - `yargs` — CLI argument parsing
  - `temporal-polyfill` — Temporal date/time API

### Type Checking

- Run `bun tsgo` to check TypeScript errors
- Type definitions are colocated by domain in `app/types/review.types.ts`, `app/services/db.types.ts`, and `app/services/gitlab.types.ts`
- SQL module types in `app/types/sql.d.ts` (ambient declaration)

### For LLM Maintainers

**CRITICAL**: Whenever you implement a new feature or change the project structure:
1. Update this `skills/project-guideline/SKILL.md` file to reflect the change
2. Include:
   - New CLI arguments (with defaults and descriptions)
   - New SQLite tables or schema changes
   - New runtime behavior or workflow changes
   - New terminology or concepts
   - Updated file paths or module organization
3. Ensure the description stays accurate and complete
4. Run `bun tsgo` and `bun run lint` before submitting changes

This ensures all team members (human and AI) have a single source of truth.

### Command Execution Behavior

- Before running any command, briefly explain the operation that is about to execute
- Keep the explanation short and specific to the command

This keeps the skill in sync with the codebase so future LLMs have accurate context.

---

## Key Files

- `app/main.ts` — App runtime entry point (code review execution)
- `app/migrations/` — Database migration files (SQL and registry)
- `app/services/db.ts` — Database initialization with migration runner
- `app/services/logger.ts` — Logging with Temporal timestamps
- `app/services/*.types.ts` — Domain-local TypeScript entities and data types
- `app/types/sql.d.ts` — SQL module declaration
- `scripts/ci/ensure-release.ts` — Ensure the versioned GitLab release exists before the build stage
- `scripts/ci/build-and-publish.ts` — Per-platform build, rename, upload, and link the release asset
- `.gitlab-ci.yml` — CI/CD pipeline definition
- `package.json` — Version, dependencies, build scripts
- `biome.jsonc` — Linter and formatter configuration (no-default-export rule excludes `app/types/sql.d.ts`)
- `tsconfig.json` — TypeScript configuration
- `AGENTS.md` — Project features and LLM maintenance instructions

---

## Related Skills

- `karpathy-guidelines`: Code style and best practices from Andrej Karpathy
