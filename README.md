# gitlab-copilot-ci

A Bun-based GitLab CI review binary that analyzes merge request diffs with either GitHub Copilot CLI or Pi, posts inline GitLab discussions, and maintains a top-level summary note.

## Binary Artifacts

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
- publish a summary note that includes review findings, optional translations, model or agent timing metadata, and embedded review-history data for duplicate suppression

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
  --copilot-github-token         Optional GitHub token with Copilot access for headless authentication
                                 (default: COPILOT_GITHUB_TOKEN, GH_TOKEN, or GITHUB_TOKEN)
  --project-id                   GitLab project ID (default: CI_PROJECT_ID)
  --mr-iid                       GitLab merge request IID (default: CI_MERGE_REQUEST_IID)
  --max-git-diff-page            Maximum number of GitLab merge request diff pages to fetch
                                 (positive integer; default: unlimited; GitLab currently returns 20 diff entries per page)
  --max-history-length           Maximum number of review runs kept in summary-embedded history
                                 (positive integer; default: 12)
  --process-max-pending-time     Maximum minutes to wait for an in-progress review marker
                                 before skipping the current run (positive integer; default: 30)
  --html-marker-prefix           Prefix used for markers that identify CLI-generated GitLab MR reviews/comments
                                 Generated markers: <prefix>-review-marker, <prefix>-summary-marker,
                                 <prefix>-review-data-start, <prefix>-review-data-end, <prefix>-reviewing-marker
                                 Default: copilot. Prefix must use lowercase kebab-case, for example xiaomi-mimo-code-review.
                                 Use distinct prefixes when multiple review configurations may comment on the same MR
  -d, --debug                    Debug mode: review only from the diff and skip reading local repository files
                                 (default: false)
  --log                          Enable log file writing
                                 - --log: write to current directory
                                 - --log /path/to/dir: write to specified directory
                                 - repeated values are allowed; only the first explicit path is used
  --log-level                    Logger output level (default: 5)
                                 - Numeric: 0 (silent) to 5 (debug), -999 (silent), +999 (verbose)
                                 - Named: fatal, error, warn, log, info, debug, trace, verbose
  --instruction-files            Repository instruction entry file paths passed through to the review prompt
                                 repeatable, e.g. --instruction-files AGENTS.md --instruction-files .github/copilot.md
  --extra-prompts                Extra prompt text appended to the generated review prompt
                                 if provided, the model must obey it
  --should-teach-diff-compute    Include prompt instructions for manual diff line-number computation
                                 (default: false)
  --tools                        Additional agent tools to allow beyond the built-in defaults
                                 repeatable, e.g. --tools sh --tools read_file
  --lang                         Display language(s) for review output
                                 repeatable, e.g. --lang=zh-CN --lang=ja --lang=english
                                 if omitted, output defaults to English only
  --collapsed-lang, --c-lang     Display language(s) that should be wrapped in GitLab <details> blocks
                                 for both inline reviews and the summary note
  --ignored-rank                 Review rank(s) to ask the LLM to omit from inline reviews and the summary note
                                 allowed values: HIGH, MEDIUM, LOW
  -v, --version                  Show version information and exit
  --help                         Show help message
```

### Required Arguments

Must provide:
- `--agent`: the agent provider to use for code review, either `github-copilot-cli` or `pi`

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
        --lang en --c-lang zh-CN \ # optional
        --instruction-files CLAUDE.md --instruction-files CODE-REVIEW_RULE.md \ # optional
        --extra-prompts "Focus on security implications and edge cases." \ # optional
        --ignored-rank LOW \ # optional
        --html-marker-prefix "xiaomi-mimo-code-review" # optional
```

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
bun run build:win-x64
bun run build:win-arm64

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

