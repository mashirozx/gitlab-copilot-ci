import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { getFormattedVersion } from "./version";

export const argv = yargs(hideBin(process.argv))
  .option("llm-service", {
    describe: "LLM service provider to use for code review",
    type: "string",
    choices: ["github-copilot", "pi"] as const,
    default: "github-copilot",
  })
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
  .option("pi-bin", {
    describe: "Pi CLI binary name or path",
    type: "string",
    default: process.env.PI_BIN ?? "pi",
  })
  .option("pi-provider", {
    describe: "Pi model provider name",
    type: "string",
    default: process.env.PI_PROVIDER,
  })
  .option("llm-model", {
    alias: "copilot-model",
    describe: "LLM model name",
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
  .option("max-git-diff-page", {
    describe:
      "Maximum number of GitLab merge request diff pages to fetch. Defaults to unlimited. With the current per-page size of 20, a value of 5 reads at most the first 100 diff entries.",
    type: "number",
    coerce: (arg: number | undefined) => {
      if (arg === undefined) {
        return undefined;
      }

      if (!Number.isInteger(arg) || arg <= 0) {
        throw new Error("--max-git-diff-page must be a positive integer");
      }

      return arg;
    },
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
      "Enable log file writing. Pass without a value to write to the current directory, or provide a path: --log /path/to/dir.",
    type: "string",
    array: true,
    coerce: (arg: (string | null | undefined)[] | undefined) => {
      if (arg === undefined) {
        return undefined;
      } else {
        if (arg.length === 0) {
          return true;
        } else if (typeof arg[0] === "string") {
          return arg[0];
        } else {
          return undefined;
        }
      }
    },
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
  .option("log-level", {
    describe:
      "Logger output level: 0-5 (numeric), -999/+999 (custom), or type name (fatal, error, warn, log, info, debug, trace, verbose)",
    type: "string",
    default: "5",
  })
  .version(
    "version",
    "Show version information and exit",
    getFormattedVersion(),
  )
  .alias("v", "version")
  .demandOption(["gitlab-token", "gitlab-url", "project-id", "mr-iid"])
  .parseSync();
