import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { getFormattedVersion } from "./version";

export const argv = yargs(hideBin(process.argv))
  .option("agent", {
    describe: "Agent provider to use for code review",
    type: "string",
    choices: ["github-copilot", "pi"] as const,
    default: "github-copilot",
  })
  .option("gitlab-token", {
    describe: "GitLab API token",
    type: "string",
    default: process.env.GITLAB_TOKEN,
  })
  .option("gitlab-url", {
    describe: "GitLab server URL",
    type: "string",
    default: process.env.CI_SERVER_URL,
  })
  .option("agent-bin", {
    describe: "Agent CLI binary name or path",
    type: "string",
    default: process.env.AGENT_BIN,
  })
  .option("agent-args", {
    describe:
      "Optional extra CLI args appended to the selected agent binary invocation",
    type: "string",
  })
  .option("provider", {
    describe: "Agent provider name passed through to the selected agent",
    type: "string",
    default: process.env.PI_PROVIDER,
  })
  .option("model", {
    describe: "Model name",
    type: "string",
    default: "gpt-5.4",
  })
  .option("effort", {
    alias: "thinking",
    describe:
      "Optional reasoning level. For Pi: off|minimal|low|medium|high|xhigh. For Copilot: none|low|medium|high|xhigh|max.",
    type: "string",
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
    describe: "GitLab project ID",
    type: "string",
    default: process.env.CI_PROJECT_ID,
  })
  .option("mr-iid", {
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
  .option("html-marker-prefix", {
    alias: "html-marker-preffix",
    describe:
      "Prefix used to build HTML markers that identify CLI-generated GitLab MR comments: <prefix>-review-marker, <prefix>-summary-marker, <prefix>-review-data",
    type: "string",
    default: "copilot",
    coerce: (arg: string | undefined) => {
      const prefix = arg ?? "copilot";
      const markerPattern = /^[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/;
      const reviewMarker = `${prefix}-review-marker`;
      const summaryMarker = `${prefix}-summary-marker`;
      const reviewDataTag = `${prefix}-review-data`;

      if (
        !/^[a-z0-9]+$/.test(prefix) ||
        !markerPattern.test(reviewMarker) ||
        !markerPattern.test(summaryMarker) ||
        !markerPattern.test(reviewDataTag)
      ) {
        throw new Error(
          "--html-marker-prefix must be lowercase letters or numbers only so generated markers match xxx-xxx-xxx format",
        );
      }

      return prefix;
    },
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
