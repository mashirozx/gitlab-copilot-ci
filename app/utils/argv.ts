import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { getFormattedVersion } from "./version";

export const argv = yargs(hideBin(process.argv))
  .option("gitlab-token", {
    alias: "gt",
    describe: "GitLab API token",
    type: "string",
    default: process.env.GITLAB_TOKEN,
  })
  .option("gitlab-url", {
    alias: "gu",
    describe: "GitLab API URL",
    type: "string",
    default: process.env.GITLAB_API_URL,
  })
  .option("copilot-bin", {
    describe: "GitHub Copilot CLI binary name or path",
    type: "string",
    default: process.env.COPILOT_BIN ?? "copilot",
  })
  .option("copilot-model", {
    describe: "GitHub Copilot model name",
    type: "string",
    default: "gpt-5.4",
  })
  .option("copilot-github-token", {
    describe:
      "Optional GitHub token with Copilot access for headless authentication",
    type: "string",
    default:
      process.env.COPILOT_GITHUB_TOKEN ??
      process.env.GH_TOKEN ??
      process.env.GITHUB_TOKEN,
  })
  .option("project-id", {
    alias: "p",
    describe: "GitLab project ID",
    type: "string",
    default: process.env.CI_PROJECT_ID,
  })
  .option("mr-iid", {
    alias: "m",
    describe: "GitLab merge request IID",
    type: "string",
    default: process.env.CI_MERGE_REQUEST_IID,
  })
  .option("review-marker", {
    describe: "HTML comment marker for review comments",
    type: "string",
    default: "copilot-review-marker",
  })
  .option("summary-marker", {
    describe: "HTML comment marker for summary comment",
    type: "string",
    default: "copilot-summary-marker",
  })
  .option("review-data-tag", {
    describe: "HTML comment tag for review data tracking",
    type: "string",
    default: "copilot-review-data",
  })
  .option("debug", {
    alias: "d",
    describe:
      "Debug mode: review only from the diff, skip reading local repository files",
    type: "boolean",
    default: false,
  })
  .option("log", {
    describe:
      "Enable log file writing. If true, writes to the current directory. If a string, writes to the specified directory.",
    type: "string",
    default: undefined,
  })
  .option("db", {
    describe: "Path to SQLite database for review history tracking (optional)",
    type: "string",
    default: process.env.COPILOT_DB,
  })
  .option("lang", {
    describe:
      "Additional output language(s) for translations (e.g. --lang=zh-CN --lang=ja). English is always included. Results are displayed in the order specified.",
    type: "string",
    array: true,
    default: [] as string[],
  })
  .version(
    "version",
    "Show version information and exit",
    getFormattedVersion(),
  )
  .alias("v", "version")
  .demandOption(["gitlab-token", "gitlab-url", "project-id", "mr-iid"])
  .parseSync();
