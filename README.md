# gitlab-copilot-ci

A Bun-based GitLab CI review binary that analyzes merge request diffs with either GitHub Copilot CLI or Pi, posts inline GitLab discussions, and maintains a top-level summary note.

## Binary Artifacts

| Platform | Architecture | Download |
|----------|--------------|----------|
| macOS | Apple Silicon | [gitlab-copilot-ci-darwin-arm64](https://github.com/mashirozx/gitlab-copilot-ci/releases/latest/download/gitlab-copilot-ci-darwin-arm64) |
| macOS | Intel x86_64 | [gitlab-copilot-ci-darwin-x64](https://github.com/mashirozx/gitlab-copilot-ci/releases/latest/download/gitlab-copilot-ci-darwin-x64) |
| Linux (glibc) | x86_64 | [gitlab-copilot-ci-linux-x64](https://github.com/mashirozx/gitlab-copilot-ci/releases/latest/download/gitlab-copilot-ci-linux-x64) |
| Linux (glibc) | ARM64 | [gitlab-copilot-ci-linux-arm64](https://github.com/mashirozx/gitlab-copilot-ci/releases/latest/download/gitlab-copilot-ci-linux-arm64) |
| Linux (musl) | x86_64 | [gitlab-copilot-ci-linux-x64-musl](https://github.com/mashirozx/gitlab-copilot-ci/releases/latest/download/gitlab-copilot-ci-linux-x64-musl) |
| Linux (musl) | ARM64 | [gitlab-copilot-ci-linux-arm64-musl](https://github.com/mashirozx/gitlab-copilot-ci/releases/latest/download/gitlab-copilot-ci-linux-arm64-musl) |
| Windows | x86_64 | [gitlab-copilot-ci-win-x64.exe](https://github.com/mashirozx/gitlab-copilot-ci/releases/latest/download/gitlab-copilot-ci-win-x64.exe) |
| Windows | ARM64 | [gitlab-copilot-ci-win-arm64.exe](https://github.com/mashirozx/gitlab-copilot-ci/releases/latest/download/gitlab-copilot-ci-win-arm64.exe) |

### Linux Artifact Choice

- Use `linux-x64` or `linux-arm64` on glibc-based distros such as Debian and Ubuntu.
- Use `linux-x64-musl` or `linux-arm64-musl` on musl-based distros such as Alpine.
- If you run a musl binary on Alpine via `gcompat`, treat that as a compatibility layer for glibc-targeted programs, not a replacement for native musl builds. Prefer the `*-musl` artifacts when your container or host is Alpine.
- A glibc-targeted binary will usually fail on plain Alpine without `gcompat`, and a musl-targeted binary will usually fail on Debian or Ubuntu because those systems do not ship the musl loader by default.

## Usage

The binary is intended to run from the target repository root during a GitLab CI merge request pipeline.

Each run can:
- fetch paginated merge request diffs from GitLab
- ask the configured agent to generate inline findings plus a summary
- post inline discussions on valid diff positions
- publish a summary note that includes review findings, optional translations, model or agent timing metadata, and embedded review-history data for duplicate suppression

Agent output is now fully structured. The model returns `readableModelName`, localized `summary.walkthrough`, localized structured `summary.changes`, localized `summary.otherSuggestions`, and inline `reviews[].suggestions[lang].{detail,abstract}` entries. The runtime, not the model, renders GitLab headings, tables, localized section labels, rank badges, collapsed language blocks, and the final summary note layout.

When `--collect-runtime-stats` is enabled, the summary performance matrix also includes best-effort parent and agent runtime usage for the current OS sampler.

### CLI Arguments

| Option | Type | Default | Description |
|---|---|---|---|
| `--agent` | `string` | required | Agent provider to use for code review. Choices: `github-copilot-cli`, `pi`. |
| `--gitlab-token` | `string` | `GITLAB_TOKEN` | GitLab API token. |
| `--gitlab-url` | `string` | `CI_SERVER_URL` | GitLab server URL. |
| `--agent-bin` | `string` | `AGENT_BIN` when set | Agent CLI binary name or path. |
| `--agent-args` | `string` | none | Optional extra CLI args appended to the selected agent binary invocation. |
| `--model` | `string` | `gpt-5.4` | Model name. Supports provider prefixes like `openai/gpt-4o` and effort suffixes like `sonnet:high`. |
| `--copilot-github-token` | `string` | `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, or `GITHUB_TOKEN` | Optional GitHub token with Copilot access for headless authentication. |
| `--project-id` | `string` | `CI_PROJECT_ID` | GitLab project ID. |
| `--mr-iid` | `string` | `CI_MERGE_REQUEST_IID` | GitLab merge request IID. |
| `--max-git-diff-page` | `number` | unlimited | Maximum number of GitLab merge request diff pages to fetch. With the current per-page size of 20, a value of `5` reads at most the first `100` diff entries. |
| `--html-marker-prefix` | `string` | `copilot` | Prefix used to build the HTML markers that identify CLI-generated MR comments. Alias: `--html-marker-preffix`. Generates `<prefix>-review-marker`, `<prefix>-summary-marker`, `<prefix>-review-data-start`, `<prefix>-review-data-end`, and `<prefix>-reviewing-marker`. |
| `--dry-run`, `--debug`, `-d` | `boolean` | `false` | Run the real review pipeline but skip all GitLab writes, including inline comments, summary notes, and reviewing-marker notes. |
| `--post-summary-with-snippet` | `boolean` | `false` | Create a GitLab project snippet for the full summary content, then post a reduced summary comment that links to that snippet. If the review has a critical error or snippet creation fails, the runtime falls back to posting the full summary comment directly. |
| `--log` | `array` | none | Enable log file writing. Pass without a value to write to the current directory, or provide a path such as `--log /path/to/dir`. |
| `--max-stdout-size` | `string` | `100mb` | Maximum GitLab CI job log size used to cap live agent stdout printing. Accepts case-insensitive byte-size suffixes like `100mb`, `512kb`, or `42b`. Console stdout stops once printed output reaches `80%` of this byte limit, and printed stdout is measured with `Buffer.byteLength(...)` for accurate byte counting. This follows GitLab's job log size ceiling guidance: https://docs.gitlab.com/administration/cicd/job_logs/#maximum-log-file-size |
| `--collect-runtime-stats` | `boolean` | `false` | Collect best-effort runtime stats for the Bun parent process and the spawned review agent. Uses OS-specific samplers for macOS, Linux, and Windows; Linux and Windows can also report best-effort agent read/write byte totals, while macOS reports memory and CPU without per-process disk I/O bytes. |
| `--max-history-length` | `number` | `12` | Maximum number of prior review runs to keep in the summary-embedded review history. Older runs are discarded first. |
| `--review-max-pending-time` | `string` | `30minutes` | Maximum time to wait for an existing in-progress review marker before skipping this run. Accepts integer durations with suffixes `ms`, `milliseconds`, `s`, `seconds`, `minutes`, or `m`. |
| `--mr-check-interval` | `string` | `10s` | Shared poll interval for both reviewing-marker waits and latest-commit stale checks. Accepts integer durations with suffixes `ms`, `milliseconds`, `s`, `seconds`, `minutes`, or `m`. |
| `--instruction-files` | `array` | `[]` | Repository instruction entry file paths to pass through to the LLM review prompt. Repeatable, for example `--instruction-files AGENTS.md --instruction-files .github/copilot.md`. |
| `--extra-prompts` | `string` | none | Extra prompt text to append to the generated LLM review prompt. If provided, the model must obey it. |
| `--should-teach-diff-compute` | `boolean` | `false` | Include prompt instructions that teach the LLM how to compute diff line positions manually from unified diff hunks. |
| `--tools` | `array` | `[]` | Additional agent tool names to allow beyond the built-in defaults. Repeatable, for example `--tools sh --tools read_file`. |
| `--allow-all-tools` | `boolean` | `false` | Allow all agent tools and permissions. Copilot CLI receives `--allow-all`; Pi receives `--approve` and uses its default complete tool set. The runtime's built-in tool and directory allowlists are omitted to avoid conflicting flags. |
| `--lang` | `array` | `[]` | Display language(s) for review output, for example `--lang=zh-CN --lang=ja --lang=en`. If omitted, output defaults to the `--thinking-lang` source language. |
| `--thinking-lang` | `string` | `en` | Primary reasoning language and the required language key included in every language-keyed summary and review record returned by the agent. If `--lang` and `--collapsed-lang` are both omitted, rendered output defaults to this language. |
| `--collapsed-lang`, `--c-lang` | `array` | `[]` | Display language(s) that should be wrapped in a GitLab `<details>` block for both inline reviews and the summary note. |
| `--collapse-changes-summary` | `boolean` | `false` | Wrap the summary note's `## 🚧 Changes` section in a GitLab `<details>` block. |
| `--collapse-review-summary` | `boolean` | `false` | Wrap the summary note's `## 🔍 Review Summary` section in a GitLab `<details>` block. |
| `--ignored-rank` | `array` | `[]` | Review rank(s) to ask the LLM to omit from inline reviews and the summary note. Allowed values: `HIGH`, `MEDIUM`, `LOW`. |
| `--log-level` | `string` | `5` | Logger output level: `0-5` (numeric), `-999/+999` (custom), or type name `fatal`, `error`, `warn`, `log`, `info`, `debug`, `trace`, `verbose`. |
| `--help` | `boolean` | n/a | Show help. |
| `--version`, `-v` | `boolean` | n/a | Show version information and exit. |

### Required Arguments

No CLI argument is strictly required as long as the relevant environment variables are present.

- `--agent` is required.
- `--gitlab-token`, `--gitlab-url`, `--project-id`, and `--mr-iid` typically come from the GitLab CI environment.

### Example GitLab CI/CD Configuration

```yaml
code-review:
  image: node:26-alpine3.22
  before_script:
    # when using GitHub Copilot CLI as agent
    - npm install -g @github/copilot
    # when using Pi as agent
    - npm install -g @earendil-works/pi-coding-agent
  variables:
    # note that CI_JOB_TOKEN does not have permissions to post MR comments,
    # so a personal/repository access token with api scope is necessary here
    GITLAB_TOKEN: "$YOUR_GITLAB_TOKEN" # required
    # when using GitHub Copilot CLI as agent, a GitHub token is also required
    # for authentication
    GH_TOKEN: "$YOUR_GH_TOKEN" # optional
    # For Pi agent, set the necessary environment variables for used provider
    # run `pi --help` for details
    GEMINI_API_KEY: "$YOUR_GEMINI_API_KEY" # optional
  script:
    - ./gitlab-copilot-ci \
        --agent "pi" \ # required
        --model "google/gemini-3.5-flash:xhigh" \ # optional
        --thinking-lang en --lang en --c-lang zh-CN \ # optional
        --instruction-files CLAUDE.md --instruction-files CODE-REVIEW_RULE.md \ # optional
        --extra-prompts "Focus on security implications and edge cases." \ # optional
        --ignored-rank LOW \ # optional
        --html-marker-prefix "xiaomi-mimo-code-review" # optional
```

      At startup, the runtime preloads the `--thinking-lang` locale plus every language requested by `--lang` and `--c-lang`. The agent must return all of those languages directly in the structured response. Rendering then selects the requested display language from those language-keyed records, and any collapsed languages are wrapped by the runtime in GitLab `<details>` blocks.

      When `--post-summary-with-snippet` is enabled, the runtime first renders the full summary content, stores that full markdown in a public GitLab project snippet named `summary.md`, and then posts a reduced top-level summary note that links to the snippet. The reduced note keeps the summary marker, the linked summary title, the thinking-language review list, any collapsed errors section, and the hidden review-history payload. Critical-error summaries always skip snippet creation and stay full-length in the top-level note.

      For GitHub Copilot CLI runs, the performance matrix also parses Copilot's trailing usage lines and includes `AI Credits`, total tokens, and reasoning tokens when available.

### Model Syntax

The `--model` argument accepts the same model strings used by Pi, including provider prefixes and effort shorthand:

```bash
# Provider-prefixed model, passed through as-is for both agents
./gitlab-copilot-ci --model openai/gpt-4o

# Effort shorthand, converted to Copilot CLI's --effort option
./gitlab-copilot-ci --model sonnet:high

# Use together with provider prefix for Pi, passed through as-is
./gitlab-copilot-ci --model google/gemini-3.5-flash:xhigh
```

For `github-copilot-cli`, the suffix after the final `:` is treated as the effort level and forwarded to the Copilot CLI `--effort` flag. For `pi`, the model string is passed through unchanged.

## Development

```bash
# Run in development mode
bun run dev

# Build local binaries
bun run build:darwin-arm64
bun run build:darwin-x64
bun run build:linux-x64
bun run build:linux-arm64
bun run build:linux-x64-musl
bun run build:linux-arm64-musl
bun run build:win-x64
bun run build:win-arm64

# Lint code
bun run lint

# Format code
bun run format

# Fix and format code
bun run biome

# Type check
bun run typecheck

# Experimental TypeScript native preview check
bun run tsc

# Unit tests
bun run test
```

## License

MIT License - Copyright (c) 2026 [Mashiro](https://github.com/mashirozx)

