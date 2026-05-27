# gitlab-copilot-ci

A Bun-based GitLab CI review binary that analyzes merge request diffs with either GitHub Copilot CLI or Pi, posts inline GitLab discussions, and maintains a top-level summary note.

## Installation

```bash
bun install
```

## Building

### Build for Your Platform

Build for your current platform (requires Bun installed):

```bash
# macOS (Apple Silicon M1/M2/M3)
bun run build:darwin-arm64

# macOS (Intel x86_64)
bun run build:darwin-x64

# Linux (x86_64)
bun run build:linux-x64

# Linux (ARM64)
bun run build:linux-arm64

# Windows (x86_64)
bun run build:win-x64

# Windows (ARM64)
bun run build:win-arm64
```

## Binary Artifacts

After building, binaries are available at:

| Platform | Architecture | Path | Usage |
|----------|--------------|------|-------|
| macOS | Apple Silicon | `./dist/gitlab-copilot-ci-darwin-arm64` | `./dist/gitlab-copilot-ci-darwin-arm64 [options]` |
| macOS | Intel x86_64 | `./dist/gitlab-copilot-ci-darwin-x64` | `./dist/gitlab-copilot-ci-darwin-x64 [options]` |
| Linux | x86_64 | `./dist/gitlab-copilot-ci-linux-x64` | `./dist/gitlab-copilot-ci-linux-x64 [options]` |
| Linux | ARM64 | `./dist/gitlab-copilot-ci-linux-arm64` | `./dist/gitlab-copilot-ci-linux-arm64 [options]` |
| Windows | x86_64 | `./dist/gitlab-copilot-ci-win-x64.exe` | `.\dist\gitlab-copilot-ci-win-x64.exe [options]` |
| Windows | ARM64 | `./dist/gitlab-copilot-ci-win-arm64.exe` | `.\dist\gitlab-copilot-ci-win-arm64.exe [options]` |

## Usage

The binary is intended to run from the target repository root during a GitLab CI merge request pipeline.

Each run can:
- fetch paginated merge request diffs from GitLab
- ask the configured agent to generate inline findings plus a summary
- post inline discussions on valid diff positions
- publish a summary note that includes review findings, optional translations, and model or agent timing metadata

### CLI Arguments

```
Options:
  --agent                        Agent provider to use for code review
                                 (choices: github-copilot-cli, pi; default: github-copilot-cli)
  --gitlab-token                 GitLab API token (default: GITLAB_TOKEN)
  --gitlab-url                   GitLab server URL (default: CI_SERVER_URL)
  --agent-bin                    Agent CLI binary name or path
                                 (default: AGENT_BIN when set, else service default)
  --agent-args                   Optional extra CLI args appended to selected agent invocation
                                 (parsed as shell-like tokens)
  --model                        Model name (default: gpt-5.4)
                                 Supports provider prefixes like openai/gpt-4o and effort suffixes like sonnet:high
  --copilot-github-token         GitHub token for Copilot authentication
                                 (default: COPILOT_GITHUB_TOKEN, GH_TOKEN, or GITHUB_TOKEN)
  --project-id                   GitLab project ID (default: CI_PROJECT_ID)
  --mr-iid                       GitLab merge request IID (default: CI_MERGE_REQUEST_IID)
  --max-git-diff-page            Maximum number of GitLab merge request diff pages to fetch
                                 (positive integer; default: unlimited)
  --html-marker-prefix           Prefix used for markers that identify CLI-generated GitLab MR reviews/comments
                                 Generated markers: <prefix>-review-marker, <prefix>-summary-marker, <prefix>-review-data
                                 Default: copilot. Prefix must use lowercase kebab-case, for example xiaomi-mimo-code-review
  -d, --debug                    Debug mode: generate mock reviews only (default: false)
  --log                          Enable log file writing
                                 - --log: write to current directory
                                 - --log /path/to/dir: write to specified directory
                                 - repeated values are allowed; only the first explicit path is used
  --log-level                    Logger output level (default: 5)
                                 - Numeric: 0 (silent) to 5 (debug), -999 (silent), +999 (verbose)
                                 - Named: fatal, error, warn, log, info, debug, trace, verbose
  --db                           Path to SQLite database for review history (optional)
  --instruction-files            Repository instruction entry file paths passed through to the review prompt
                                 repeatable, e.g. --instruction-files AGENTS.md --instruction-files .github/copilot.md
  --extra-prompts                Extra prompt text appended to the generated review prompt
  --should-teach-diff-compute    Include prompt instructions for manual diff line-number computation
                                 (default: false)
  --tools                        Additional agent tools to allow beyond the built-in defaults
                                 repeatable, e.g. --tools node --tools bash
  --lang                         Display language(s) for review output
                                 repeatable, e.g. --lang=zh-CN --lang=ja --lang=english
                                 if omitted, output defaults to English only
  --collapsed-lang, --c-lang     Display language(s) that should be wrapped in GitLab <details> blocks
                                 these languages are still requested even when not repeated in --lang
  --ignored-rank                 Review rank(s) to hide from inline reviews and the summary note
                                 allowed values: HIGH, MEDIUM, LOW
  -v, --version                  Show version information and exit
  --help                         Show help message
```

### Required Arguments

Must provide:
- `--gitlab-token` (or `GITLAB_TOKEN` env var)
- `--gitlab-url` (or `CI_SERVER_URL` env var)
- `--project-id` (or `CI_PROJECT_ID` env var)
- `--mr-iid` (or `CI_MERGE_REQUEST_IID` env var)

### Example GitLab CI/CD Configuration

```yaml
code-review:
  stage: review
  script:
    - ./gitlab-copilot-ci \
        --gitlab-token "$CI_JOB_TOKEN" \
        --gitlab-url "$CI_SERVER_URL" \
        --project-id "$CI_PROJECT_ID" \
        --mr-iid "$CI_MERGE_REQUEST_IID"
```

Or with environment variables already present in the job:

```yaml
code-review:
  stage: review
  script:
    - ./gitlab-copilot-ci
```

If GitLab does not provide `GITLAB_TOKEN`, export it explicitly before invoking the binary.

### Summary Output

The merge request summary note:
- uses the title format `Code Review Summary by ${LLM name}`
- lists inline findings with rank badges and diff-based file locations
- can render requested languages directly or inside collapsed `<details>` sections
- includes a metrics section with model, agent CLI version, elapsed time, and context usage when available

### Translation Example

```bash
./gitlab-copilot-ci \
  --gitlab-token YOUR_TOKEN \
  --gitlab-url https://gitlab.com \
  --project-id 123 \
  --mr-iid 456 \
  --lang=zh-CN \
  --lang=ja
```

If you pass any explicit language set, only the merged `--lang` and `--collapsed-lang` selection is displayed. English appears only when it is requested explicitly.

### Collapsed Language Example

```bash
./gitlab-copilot-ci \
  --gitlab-token YOUR_TOKEN \
  --gitlab-url https://gitlab.com \
  --project-id 123 \
  --mr-iid 456 \
  --lang=english \
  --collapsed-lang=zh-CN
```

This keeps English expanded while rendering Chinese inside GitLab `<details>` blocks for both inline comments and the summary note.

### Model Syntax

The `--model` argument accepts the same model strings used by Pi, including provider prefixes and effort shorthand:

```bash
# Provider-prefixed model, passed through as-is for both agents
./gitlab-copilot-ci --model openai/gpt-4o

# Effort shorthand, converted to Copilot CLI's --effort option
./gitlab-copilot-ci --model sonnet:high
```

For `github-copilot-cli`, the suffix after the final `:` is treated as the effort level and forwarded to the Copilot CLI `--effort` flag. For `pi`, the model string is passed through unchanged.

### Logging Example

```bash
./gitlab-copilot-ci \
  --log /var/log/ci \
  --gitlab-token YOUR_TOKEN \
  --gitlab-url https://gitlab.com \
  --project-id 123 \
  --mr-iid 456
```

`--log` also works without a value to log into the current directory. Internally, the parser uses `array: true` plus `coerce` so the runtime value becomes `true | string | undefined`.

Log files are created as: `.gitlab-copilot-ci.{yyyy-mm-dd.hh-mm-ss}.log`

### Prompt Customization Example

```bash
./gitlab-copilot-ci \
  --gitlab-token YOUR_TOKEN \
  --gitlab-url https://gitlab.com \
  --project-id 123 \
  --mr-iid 456 \
  --instruction-files AGENTS.md \
  --instruction-files .github/copilot.md \
  --extra-prompts "Prioritize security and data-loss risks." \
  --should-teach-diff-compute
```

### Filtering Low-Priority Findings

```bash
./gitlab-copilot-ci \
  --gitlab-token YOUR_TOKEN \
  --gitlab-url https://gitlab.com \
  --project-id 123 \
  --mr-iid 456 \
  --ignored-rank LOW
```

### Review History with SQLite

```bash
./gitlab-copilot-ci \
  --db=/var/lib/copilot-reviews.db \
  --gitlab-token YOUR_TOKEN \
  --gitlab-url https://gitlab.com \
  --project-id 123 \
  --mr-iid 456
```

## Development

```bash
# Run in development mode
bun run dev

# Lint code
bun run lint

# Format code
bun run format

# Fix and format code
bun run biome

# Type check
bun run tsgo

# Unit tests
bun run test
```

## License

MIT License - Copyright (c) 2026 [Mashiro](https://github.com/mashirozx)

