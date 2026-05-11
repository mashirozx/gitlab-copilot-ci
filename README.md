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
  --gitlab-token, --gt           GitLab API token (default: GITLAB_TOKEN)
  --gitlab-url, --gu             GitLab API URL (default: GITLAB_API_URL)
  --copilot-bin                  GitHub Copilot CLI binary name or path (default: copilot)
  --copilot-model                GitHub Copilot model name (default: gpt-5.4)
  --copilot-github-token         GitHub token for Copilot authentication
                                 (default: COPILOT_GITHUB_TOKEN, GH_TOKEN, or GITHUB_TOKEN)
  --project-id, -p               GitLab project ID (default: CI_PROJECT_ID)
  --mr-iid, -m                   GitLab merge request IID (default: CI_MERGE_REQUEST_IID)
  --review-marker                HTML comment marker for review comments (default: copilot-review-marker)
  --summary-marker               HTML comment marker for summary comment (default: copilot-summary-marker)
  --review-data-tag              HTML tag for review data tracking (default: copilot-review-data)
  -d, --debug                    Debug mode: generate mock reviews only (default: false)
  --log                          Enable log file writing
                                 - --log or --log=true: write to current directory
                                 - --log=/path/to/dir: write to specified directory
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
- `--gitlab-url` (or `GITLAB_API_URL` env var)
- `--project-id` (or `CI_PROJECT_ID` env var)
- `--mr-iid` (or `CI_MERGE_REQUEST_IID` env var)

### Example GitLab CI/CD configuration:

```yaml
code-review:
  stage: review
  script:
    - ./dist/gitlab-copilot-ci-linux-x64
      --gitlab-token $CI_JOB_TOKEN
      --gitlab-url $CI_API_V4_URL
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
    GITLAB_API_URL: $CI_API_V4_URL
```

### Translation Example

```bash
./dist/gitlab-copilot-ci-linux-x64 \
  --gitlab-token YOUR_TOKEN \
  --gitlab-url https://gitlab.com/api/v4 \
  --project-id 123 \
  --mr-iid 456 \
  --lang=zh-CN \
  --lang=ja
```

Results will include translated sections in addition to English.

### Logging Example

```bash
./dist/gitlab-copilot-ci-linux-x64 \
  --log=/var/log/ci \
  --gitlab-token YOUR_TOKEN \
  --gitlab-url https://gitlab.com/api/v4 \
  --project-id 123 \
  --mr-iid 456
```

Log files are created as: `.gitlab-copilot-ci.{yyyy-mm-dd.hh-mm-ss}.log`

### Review History with SQLite

```bash
./dist/gitlab-copilot-ci-linux-x64 \
  --db=/var/lib/copilot-reviews.db \
  --gitlab-token YOUR_TOKEN \
  --gitlab-url https://gitlab.com/api/v4 \
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
bun tsgo
```

## License

MIT License - Copyright (c) 2026 mashirozx

