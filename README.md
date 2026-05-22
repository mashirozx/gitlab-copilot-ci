# gitlab-copilot-ci

A GitLab CI tool for automated code review using GitHub Copilot CLI.

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

The binary can be used as a CI step in GitLab CI/CD pipelines.

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
  --html-marker-prefix           Prefix used for markers that identify CLI-generated GitLab MR reviews/comments
                                 Generated markers: <prefix>-review-marker, <prefix>-summary-marker, <prefix>-review-data
                                 Default: copilot. Prefix must be lowercase letters or digits so markers stay in xxx-xxx-xxx format
  -d, --debug                    Debug mode: generate mock reviews only (default: false)
  --log                          Enable log file writing
                                 - --log: write to current directory
                                 - --log /path/to/dir: write to specified directory
                                 - repeated values are allowed; only the first explicit path is used
  --log-level                    Logger output level (default: 5)
                                 - Numeric: 0 (silent) to 5 (debug), -999 (silent), +999 (verbose)
                                 - Named: fatal, error, warn, log, info, debug, trace, verbose
  --db                           Path to SQLite database for review history (optional)
  --lang                         Additional output language(s) for translations
                                 (e.g., --lang=zh-CN --lang=ja), repeatable
                                 English is always included
  -v, --version                  Show version information and exit
  --help                         Show help message
```

### Required Arguments

Must provide:
- `--gitlab-token` (or `GITLAB_TOKEN` env var)
- `--gitlab-url` (or `CI_SERVER_URL` env var)
- `--project-id` (or `CI_PROJECT_ID` env var)
- `--mr-iid` (or `CI_MERGE_REQUEST_IID` env var)

### Example GitLab CI/CD configuration:

```yaml
code-review:
  stage: review
  script:
    - ./dist/gitlab-copilot-ci-linux-x64
      --gitlab-token $CI_JOB_TOKEN
      --gitlab-url $CI_SERVER_URL
      --project-id $CI_PROJECT_ID
      --mr-iid $CI_MERGE_REQUEST_IID
```

Or with environment variables:

```yaml
code-review:
  stage: review
  script:
    - ./dist/gitlab-copilot-ci-linux-x64
  env:
    GITLAB_TOKEN: $CI_JOB_TOKEN
    CI_SERVER_URL: $CI_SERVER_URL
```

### Translation Example

```bash
./dist/gitlab-copilot-ci-linux-x64 \
  --gitlab-token YOUR_TOKEN \
  --gitlab-url https://gitlab.com \
  --project-id 123 \
  --mr-iid 456 \
  --lang=zh-CN \
  --lang=ja
```

Results will include translated sections in addition to English.

### Model Syntax

The `--model` argument accepts the same model strings used by Pi, including provider prefixes and effort shorthand:

```bash
# Provider-prefixed model, passed through as-is for both agents
./dist/gitlab-copilot-ci-linux-x64 --model openai/gpt-4o

# Effort shorthand, converted to Copilot CLI's --effort option
./dist/gitlab-copilot-ci-linux-x64 --model sonnet:high
```

For `github-copilot-cli`, the suffix after the final `:` is treated as the effort level and forwarded to the Copilot CLI `--effort` flag. For `pi`, the model string is passed through unchanged.

### Logging Example

```bash
./dist/gitlab-copilot-ci-linux-x64 \
  --log /var/log/ci \
  --gitlab-token YOUR_TOKEN \
  --gitlab-url https://gitlab.com \
  --project-id 123 \
  --mr-iid 456
```

`--log` also works without a value to log into the current directory. Internally, the parser uses `array: true` plus `coerce` so the runtime value becomes `true | string | undefined`.

Log files are created as: `.gitlab-copilot-ci.{yyyy-mm-dd.hh-mm-ss}.log`

### Review History with SQLite

```bash
./dist/gitlab-copilot-ci-linux-x64 \
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

