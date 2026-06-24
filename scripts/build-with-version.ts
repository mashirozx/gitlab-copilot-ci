#!/usr/bin/env bun

import { execSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const target = process.argv[2];
if (!target) {
  console.error("Usage: bun scripts/build-with-version.ts <target>");
  console.error("Example: bun scripts/build-with-version.ts bun-darwin-arm64");
  process.exit(1);
}

// Read package.json for version and name
const pkg = JSON.parse(readFileSync("./package.json", "utf-8")) as {
  name: string;
  version: string;
  repository?: string;
};

const getRepoUrl = (): string => {
  if (process.env.CI_SERVER_URL && process.env.CI_PROJECT_PATH)
    return `${process.env.CI_SERVER_URL}/${process.env.CI_PROJECT_PATH}`; // GitLab CI
  if (process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY)
    return `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}`; // GitHub Actions
  return pkg.repository ?? "";
};

const repo = getRepoUrl();

// Get current commit hash
// Try to get from CI environment variables first (GitLab CI, GitHub Actions, etc.)
// Fall back to git command if not in CI environment
const commit =
  process.env.CI_COMMIT_SHA || // GitLab CI
  process.env.GITHUB_SHA || // GitHub Actions
  process.env.CIRCLECI_SHA || // CircleCI
  process.env.BUILD_SOURCEVERSION || // Azure Pipelines
  execSync("git rev-parse HEAD", {
    encoding: "utf-8",
  }).trim();

// Strip "bun-" prefix from target for output filename and normalize Windows names
// (e.g., "bun-linux-arm64" → "linux-arm64", "bun-linux-arm64-musl" → "linux-arm64-musl")
const platformTarget = target.replace(/^bun-/, "").replace(/^windows-/, "win-");

// Build with version information embedded
// Bun --define format: VAR=VALUE (values are JS expressions, strings must be quoted in the value itself)
const defineVersion = `__BUILD_VERSION__="${pkg.version}"`;
const defineCommit = `__BUILD_COMMIT__="${commit}"`;
const definePlatform = `__BUILD_PLATFORM__="${platformTarget}"`;
const defineRepo = `__BUILD_REPO__="${repo}"`;

console.log(
  `Building ${target} with version ${pkg.version} (${commit.slice(0, 7)})`,
);

// Use spawnSync with an args array to avoid shell quoting issues on Windows
const result = spawnSync(
  "bun",
  [
    "build",
    "./app/main.ts",
    "--compile",
    `--target=${target}`,
    "--define",
    defineVersion,
    "--define",
    defineCommit,
    "--define",
    definePlatform,
    "--define",
    defineRepo,
    "--outfile",
    `./dist/gitlab-copilot-ci-${platformTarget}`,
  ],
  { stdio: "inherit" },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

// Clean up .*.bun-build temp files
// for (const fileName of readdirSync(".")) {
//   if (/^\..*\.bun-build$/.test(fileName)) {
//     rmSync(fileName, { force: true });
//   }
// }

console.log(`Build complete: ./dist/gitlab-copilot-ci-${platformTarget}`);
