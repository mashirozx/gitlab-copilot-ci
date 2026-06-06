import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import type { ReviewRankEntity } from "../types/review.types";
import { env } from "./env";
import { normalizeHtmlMarkerPrefix } from "./html-marker-prefix";
import { parseStdoutSize } from "./stdout-size";
import { getFormattedVersion } from "./version";

const normalizeRankList = ({
  ranks,
  optionName,
}: {
  ranks: string[] | undefined;
  optionName: string;
}): ReviewRankEntity[] => {
  if (ranks === undefined) {
    return [];
  }

  return ranks.map((rank) => {
    const normalizedRank = rank.trim().toUpperCase();

    if (
      normalizedRank !== "HIGH" &&
      normalizedRank !== "MEDIUM" &&
      normalizedRank !== "LOW"
    ) {
      throw new Error(`${optionName} must contain only HIGH, MEDIUM, or LOW`);
    }

    return normalizedRank;
  });
};

export const argv = yargs(hideBin(process.argv))
  .option("agent", {
    describe: "Agent provider to use for code review",
    type: "string",
    choices: ["github-copilot-cli", "pi"] as const,
    default: "github-copilot-cli",
  })
  .option("gitlab-token", {
    describe: "GitLab API token",
    type: "string",
    default: env.GITLAB_TOKEN,
  })
  .option("gitlab-url", {
    describe: "GitLab server URL",
    type: "string",
    default: env.CI_SERVER_URL,
  })
  .option("agent-bin", {
    describe: "Agent CLI binary name or path",
    type: "string",
    default: env.AGENT_BIN,
  })
  .option("agent-args", {
    describe:
      "Optional extra CLI args appended to the selected agent binary invocation",
    type: "string",
  })
  .option("model", {
    describe:
      "Model name. Supports provider prefixes like openai/gpt-4o and effort suffixes like sonnet:high.",
    type: "string",
    default: "gpt-5.4",
  })
  .option("copilot-github-token", {
    describe:
      "Optional GitHub token with Copilot access for headless authentication",
    type: "string",
    default: env.COPILOT_GITHUB_TOKEN ?? env.GH_TOKEN ?? env.GITHUB_TOKEN,
  })
  .option("project-id", {
    describe: "GitLab project ID",
    type: "string",
    default: env.CI_PROJECT_ID,
  })
  .option("mr-iid", {
    describe: "GitLab merge request IID",
    type: "string",
    default: env.CI_MERGE_REQUEST_IID,
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
      "Prefix used to build HTML markers that identify CLI-generated GitLab MR comments: <prefix>-review-marker, <prefix>-summary-marker, <prefix>-review-data-start, <prefix>-review-data-end, <prefix>-reviewing-marker. Useful when multiple runs of the tool with different configurations may be commenting on the same MR, to avoid marker name collisions. Defaults to 'copilot'.",
    type: "string",
    default: "copilot",
    coerce: (arg: string | undefined) =>
      normalizeHtmlMarkerPrefix({
        prefix: arg,
      }),
  })
  .option("dry-run", {
    alias: ["debug", "d"],
    describe:
      "Run the real review pipeline but skip all GitLab writes, including inline comments, summary notes, and reviewing-marker notes.",
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
  .option("max-stdout-size", {
    describe:
      "Maximum GitLab CI job log size used to cap live agent stdout printing. Accepts case-insensitive size suffixes like 100mb, 512kb, or 42b.",
    type: "string",
    default: "100mb",
    coerce: (arg: string | undefined) => {
      if (arg === undefined) {
        return parseStdoutSize({
          value: "100mb",
          optionName: "--max-stdout-size",
        });
      }

      return parseStdoutSize({
        value: arg,
        optionName: "--max-stdout-size",
      });
    },
  })
  .option("collect-runtime-stats", {
    describe:
      "Collect best-effort parent and agent runtime stats while the review agent runs. Uses OS-specific samplers for macOS, Linux, and Windows.",
    type: "boolean",
    default: false,
  })
  .option("max-history-length", {
    describe:
      "Maximum number of prior review runs to keep in the summary-embedded review history. Older runs are discarded first.",
    type: "number",
    default: 12,
    coerce: (arg: number | undefined) => {
      if (arg === undefined) {
        return 12;
      }

      if (!Number.isInteger(arg) || arg <= 0) {
        throw new Error("--max-history-length must be a positive integer");
      }

      return arg;
    },
  })
  .option("process-max-pending-time", {
    describe:
      "Maximum number of minutes to wait for an existing in-progress review marker before skipping this run.",
    type: "number",
    default: 30,
    coerce: (arg: number | undefined) => {
      if (arg === undefined) {
        return 30;
      }

      if (!Number.isInteger(arg) || arg <= 0) {
        throw new Error(
          "--process-max-pending-time must be a positive integer",
        );
      }

      return arg;
    },
  })
  .option("instruction-files", {
    describe:
      "Repository instruction entry file paths to pass through to the LLM review prompt. Repeatable, e.g. --instruction-files AGENTS.md --instruction-files .github/copilot.md.",
    type: "string",
    array: true,
    default: [] as string[],
  })
  .option("extra-prompts", {
    describe:
      "Extra prompt text to append to the generated LLM review prompt. If provided, the model must obey it.",
    type: "string",
  })
  .option("should-teach-diff-compute", {
    describe:
      "Whether to include prompt instructions that teach the LLM how to compute diff line positions manually from unified diff hunks.",
    type: "boolean",
    default: false,
  })
  .option("tools", {
    describe:
      "Additional agent tool names to allow beyond the built-in defaults. Repeatable, e.g. --tools sh --tools read_file.",
    type: "string",
    array: true,
    default: [] as string[],
  })
  .option("lang", {
    describe:
      "Display language(s) for review output (e.g. --lang=zh-CN --lang=ja --lang=en). If omitted, output defaults to the --thinking-lang source language.",
    type: "string",
    array: true,
    default: [] as string[],
  })
  .option("thinking-lang", {
    describe:
      "Primary thinking language for prompt reasoning, default inline-rank labels, and the required language entry included in every language-keyed review and summary record.",
    type: "string",
    default: "en",
  })
  .option("collapsed-lang", {
    alias: "c-lang",
    describe:
      "Display language(s) that should be wrapped in a GitLab <details> block for both inline reviews and the summary note.",
    type: "string",
    array: true,
    default: [] as string[],
  })
  .option("collapse-changes-summary", {
    describe:
      'Wrap the summary note\'s "## 🚧 Changes" section in a GitLab <details> block.',
    type: "boolean",
    default: false,
  })
  .option("collapse-review-summary", {
    describe:
      'Wrap the summary note\'s "## 🔍 Review Summary" section in a GitLab <details> block.',
    type: "boolean",
    default: false,
  })
  .option("ignored-rank", {
    describe:
      "Review rank(s) to ask the LLM to omit from inline reviews and the summary note. Allowed values: HIGH, MEDIUM, LOW.",
    type: "string",
    array: true,
    default: [] as string[],
    coerce: (arg: string[] | undefined) =>
      normalizeRankList({
        ranks: arg,
        optionName: "--ignored-rank",
      }),
  })
  .option("log-level", {
    describe:
      "Logger output level: 0-5 (numeric), -999/+999 (custom), or type name (fatal, error, warn, log, info, debug, trace, verbose)",
    type: "string",
    default: "5",
  })
  .help("help", "Show help information and exit")
  .alias("h", "help")
  .version(
    "version",
    "Show version information and exit",
    getFormattedVersion(),
  )
  .alias("v", "version")
  .demandOption(["agent"])
  .parseSync();
