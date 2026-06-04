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

When `--collect-runtime-stats` is enabled, the summary performance matrix also includes best-effort parent and agent runtime usage for the current OS sampler.

### CLI Arguments

| Option | Type | Default | Description |
|---|---|---|---|
| `--agent` | `string` | `github-copilot-cli` | Agent provider to use for code review. Choices: `github-copilot-cli`, `pi`. |
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
| `--debug`, `-d` | `boolean` | `false` | Review only from the diff and skip reading local repository files. |
| `--log` | `array` | none | Enable log file writing. Pass without a value to write to the current directory, or provide a path such as `--log /path/to/dir`. |
| `--max-stdout-size` | `string` | `100mb` | Maximum GitLab CI job log size used to cap live agent stdout printing. Accepts case-insensitive byte-size suffixes like `100mb`, `512kb`, or `42b`. Console stdout stops once printed output reaches `80%` of this byte limit, and printed stdout is measured with `Buffer.byteLength(...)` for accurate byte counting. This follows GitLab's job log size ceiling guidance: https://docs.gitlab.com/administration/cicd/job_logs/#maximum-log-file-size |
| `--collect-runtime-stats` | `boolean` | `false` | Collect best-effort runtime stats for the Bun parent process and the spawned review agent. Uses OS-specific samplers for macOS, Linux, and Windows; Linux and Windows can also report best-effort agent read/write byte totals, while macOS reports memory and CPU without per-process disk I/O bytes. |
| `--max-history-length` | `number` | `12` | Maximum number of prior review runs to keep in the summary-embedded review history. Older runs are discarded first. |
| `--process-max-pending-time` | `number` | `30` | Maximum number of minutes to wait for an existing in-progress review marker before skipping this run. |
| `--instruction-files` | `array` | `[]` | Repository instruction entry file paths to pass through to the LLM review prompt. Repeatable, for example `--instruction-files AGENTS.md --instruction-files .github/copilot.md`. |
| `--extra-prompts` | `string` | none | Extra prompt text to append to the generated LLM review prompt. If provided, the model must obey it. |
| `--should-teach-diff-compute` | `boolean` | `false` | Include prompt instructions that teach the LLM how to compute diff line positions manually from unified diff hunks. |
| `--tools` | `array` | `[]` | Additional agent tool names to allow beyond the built-in defaults. Repeatable, for example `--tools sh --tools read_file`. |
| `--lang` | `array` | `[]` | Display language(s) for review output, for example `--lang=zh-CN --lang=ja --lang=en`. If omitted, output defaults to the `--thinking-lang` source language. |
| `--thinking-lang` | `string` | `en` | Source language for `summary.content` and `reviews[].suggestion`. Any requested display language matching this source reuses the original content instead of a translation entry. |
| `--collapsed-lang`, `--c-lang` | `array` | `[]` | Display language(s) that should be wrapped in a GitLab `<details>` block for both inline reviews and the summary note. |
| `--collapse-changes-summary` | `boolean` | `false` | Wrap the summary note's `## 🚧 Changes` section in a GitLab `<details>` block. |
| `--collapse-review-summary` | `boolean` | `false` | Wrap the summary note's `## 🔍 Review Summary` section in a GitLab `<details>` block. |
| `--ignored-rank` | `array` | `[]` | Review rank(s) to ask the LLM to omit from inline reviews and the summary note. Allowed values: `HIGH`, `MEDIUM`, `LOW`. |
| `--log-level` | `string` | `5` | Logger output level: `0-5` (numeric), `-999/+999` (custom), or type name `fatal`, `error`, `warn`, `log`, `info`, `debug`, `trace`, `verbose`. |
| `--help` | `boolean` | n/a | Show help. |
| `--version`, `-v` | `boolean` | n/a | Show version information and exit. |

### Required Arguments

No CLI argument is strictly required as long as the relevant environment variables are present.

- `--agent` defaults to `github-copilot-cli`.
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

      When `--thinking-lang` differs from the requested display languages, the agent writes the original `summary.content` and inline `suggestion` fields in that source language, then fills `summary.translations` and `reviews[].translations` only for the remaining requested languages. If `--lang` or `--c-lang` includes the same language as `--thinking-lang`, that language is rendered directly from the original content instead of duplicated in the translations objects.

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

