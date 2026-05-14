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

**gitlab-copilot-ci** is a Bun-based shell application compiled into a binary for automated code review. The binary integrates with GitLab CI systems to perform code reviews using GitHub Copilot and post results back to merge requests.

### Two Runtime Environments

#### 1. App Runtime
- **Context**: Binary executes in CI of *external projects* (customer repositories)
- **Purpose**: Review code changes in merge requests using GitHub Copilot
- **Configuration**: Invoked with GitLab and Copilot API tokens via CLI arguments or environment variables
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

- **Review** (inline): One comment on a specific diff line. Each review is a `ReviewItem` with `file_path`, `new_line`, `suggestion`, and optional `translations: Record<string, string>` for additional languages.
- **Summary** (top-level): A single markdown comment posted to the merge request containing a human-readable overview of all reviews. Marked with HTML comment `<!-- copilot-summary-marker -->`.

### Related Terms
- **Thread/Discussion**: GitLab's term for a conversation thread on a diff line. Each review comment starts a discussion.
- **Review tracking**: Information embedded in the summary comment's HTML (`<!-- copilot-review-data:... -->`) to track which discussions were created by Copilot.

---

## Module Organization

The app source is split into focused modules under `app/`:

| File | Purpose |
|------|---------|
| `app/main.ts` | Entry point — orchestrates the review workflow |
| `app/types/entities.ts` | Shared TypeScript types (`ReviewItem`, `StoredReview`, `ReviewResponse`) |
| `app/types/sql.d.ts` | Ambient module declaration for `.sql` file imports |
| `app/prompts.ts` | Prompt template builder (`buildCopilotPrompt`) with multilingual support |
| `app/migrations/0001_initial.sql` | Initial schema: `reviews` and `schema_migrations` tables |
| `app/migrations/index.ts` | Migration registry and loader |
| `app/services/argv.ts` | CLI argument parsing via yargs |
| `app/services/logger.ts` | Consola-based logger with file reporter and module-scope `--log` initialization; uses Temporal for timestamps |
| `app/services/db.ts` | SQLite helpers with migration runner; uses Temporal for `created_at` |
| `app/services/copilot.ts` | Copilot CLI interaction (`runCopilotReview`, `getContextInfo`) |
| `app/services/gitlab.ts` | GitLab client singleton (`gitlab`) |

Rules:
- No default exports in `app/` (enforced by biome, except `app/types/sql.d.ts`)
- Use named imports throughout
- Service imports from within `app/` use `./services/xxx`
- Type imports use `./types/entities` or `../types/entities`

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

**app/main.ts** (via `app/services/argv.ts`) accepts:
- `--gitlab-token` / `GITLAB_TOKEN`: GitLab API authentication
- `--gitlab-url` / `GITLAB_API_URL`: GitLab API base URL (e.g., `https://gitlab.com/api/v4`)
- `--copilot-bin`: Path to GitHub Copilot CLI binary (default: `copilot`)
- `--copilot-model`: Model name for Copilot (default: `gpt-5.4`)
- `--copilot-github-token`: GitHub token for Copilot authentication (from `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, or `GITHUB_TOKEN`)
- `--project-id` / `CI_PROJECT_ID`: GitLab project ID
- `--mr-iid` / `CI_MERGE_REQUEST_IID`: Merge request IID
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

- `getStoredReviewsForMR()`: Returns `StoredReview[]` with English-only suggestions
- `storeReview()`: Inserts review with English suggestion stored in `suggestion` column (no secondary translations)
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

- `getStoredReviewsForMR()`: Returns `StoredReview[]` with English-only suggestions
- `storeReview()`: Inserts review with English suggestion stored in `suggestion` column (no secondary translations)
- Review ID: `{mrIid}-{file_path}-{new_line}-{epochMilliseconds}`

### Multilingual Review Output

With `--lang=zh-CN --lang=ja` option:

1. **Copilot Prompt**
   - Asks Copilot to provide translations for each review in the requested languages
   - Returns `ReviewItem` with `translations: Record<string, string>` field
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
   - `StoredReview` stores **English suggestion only** (no translations)
   - Translations are transient (used in current review, not persisted)
   - Future LLM reviewers see only the English suggestion when loading previous reviews

### Types

**ReviewItem** (request payload from Copilot):
```typescript
type ReviewItem = {
  file_path: string;
  new_line: number;
  old_line?: number;
  suggestion: string;
  translations?: Record<string, string>;  // e.g., { "zh-CN": "...", "ja": "..." }
};
```

**StoredReview** (database record):
```typescript
type StoredReview = {
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
Note: `StoredReview` does **not** include `translations` — only English suggestions are persisted.

**ReviewResponse** (Copilot output):
```typescript
type ReviewResponse = {
  comment: string;            // Markdown summary (multilingual if --lang used)
  reviews: ReviewItem[];      // Each may have translations
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
3. **Call Copilot CLI**: Spawn GitHub Copilot process with:
   - Read-only tools: `read_file`, `list_directory`, `search_files`, `grep`
   - Disabled: file modification, shell execution
4. **Parse Response**: Extract JSON marked with `[COPILOT_JSON_START]`
5. **Post Reviews**: Create inline discussions for each review item
6. **Cleanup Old**: Resolve/delete previous discussions not in current review set
7. **Post Summary**: Add top-level summary comment with tracking data and performance metrics

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
test:biome (code quality check)
    ↓
release (ensure GitLab release exists)
   ↓
build (parallel, 6 platforms)
    ↓
build jobs upload versioned binaries to the release/package registry

Create MR
    ↓
test:biome (quality gate)
```

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
- All type definitions centralized in `app/types/entities.ts`
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
- `app/types/` — TypeScript type definitions and SQL module declaration
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
