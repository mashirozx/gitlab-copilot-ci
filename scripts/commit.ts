#!/usr/bin/env bun

import { execSync, spawnSync } from "node:child_process";
import { consola } from "consola";
import { colorize } from "consola/utils";

const isSymbol = (value: unknown): value is symbol => typeof value === "symbol";
const CANCEL_SYMBOL = "Symbol(cancel)";
const CUSTOM_EMOJI_VALUE = "__custom__";

// ─── Types ───────────────────────────────────────────────────────────────────

type CommitType = {
  value: string;
  hint: string;
  emoji: string;
};

// ─── Commit type definitions ─────────────────────────────────────────────────

const COMMIT_TYPES: CommitType[] = [
  {
    value: "feat",
    hint: "A new user-facing feature",
    emoji: "✨",
  },
  {
    value: "fix",
    hint: "A bug fix",
    emoji: "🐛",
  },
  {
    value: "chore",
    hint: "Build process, tooling or maintenance tasks",
    emoji: "🔧",
  },
  {
    value: "docs",
    hint: "Documentation only changes",
    emoji: "📝",
  },
  {
    value: "style",
    hint: "Code style / formatting (no logic changes)",
    emoji: "💄",
  },
  {
    value: "refactor",
    hint: "Code change that neither fixes a bug nor adds a feature",
    emoji: "♻️",
  },
  {
    value: "test",
    hint: "Adding or updating tests",
    emoji: "✅",
  },
  {
    value: "ci",
    hint: "CI/CD configuration changes",
    emoji: "🔄",
  },
  {
    value: "perf",
    hint: "Performance improvements",
    emoji: "⚡",
  },
  {
    value: "revert",
    hint: "Revert a previous commit",
    emoji: "⏪",
  },
];

const COMMON_EMOJIS = [
  "✨",
  "🐛",
  "🔧",
  "📝",
  "💄",
  "♻️",
  "✅",
  "🔄",
  "⚡",
  "⏪",
  "🚀",
  "🔖",
  "🗑️",
  "🔒",
  "🌐",
  "🎨",
  "🏗️",
  "📦",
  "🔗",
  "💡",
];

// ─── Debug mode ─────────────────────────────────────────────────────────────

const DEBUG = process.argv.includes("--debug");

if (DEBUG) {
  consola.warn(
    `${colorize("bgYellowBright", " DEBUG ")} mode — git and bun commands will be skipped.`,
  );
  consola.log("");
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const label = (text: string) => colorize("cyanBright", text);
const dim = (text: string) => colorize("gray", text);

const SINGLE_EMOJI_REGEX =
  /^(?:\p{Regional_Indicator}{2}|(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})(?:\uFE0F|\p{Emoji_Modifier})?)*)$/u;

const normalizeEmoji = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return SINGLE_EMOJI_REGEX.test(trimmed) ? trimmed : null;
};

const exitCancelled = (): never => {
  consola.log("");
  consola.info("Cancelled.");
  process.exit(0);
};

const isCancelledPromptResult = (value: unknown): boolean =>
  isSymbol(value) && value.toString() === CANCEL_SYMBOL;

const isCancelError = (error: unknown): boolean => {
  if (error instanceof Error)
    return /cancel|aborted|interrupt/i.test(error.message);
  return typeof error === "string" && /cancel|aborted|interrupt/i.test(error);
};

const safePrompt = async <T>(
  ...args: Parameters<typeof consola.prompt>
): Promise<T> => {
  try {
    const [message, options] = args;
    const result = await consola.prompt(message, {
      ...options,
      // Force symbolic cancel so Ctrl+C returns a detectable value instead of falling through.
      cancel: "symbol",
    });
    if (isCancelledPromptResult(result)) {
      exitCancelled();
    }
    return result as T;
  } catch (error) {
    if (isCancelError(error)) {
      exitCancelled();
    }
    throw error;
  }
};

const runCommandOrExit = ({
  label,
  command,
  args,
}: {
  label: string;
  command: string;
  args: string[];
}) => {
  consola.info(`Running ${label}...`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    consola.error(`${label} failed. Aborting.`);
    process.exit(result.status ?? 1);
  }
};

const hasUncommittedChanges = (): boolean => {
  const result = spawnSync("git", ["status", "--porcelain"], {
    encoding: "utf-8",
  });
  return (result.stdout ?? "").trim().length > 0;
};

const runChecks = () => {
  runCommandOrExit({
    label: "biome",
    command: "bun",
    args: ["run", "biome"],
  });
  runCommandOrExit({
    label: "tsgo",
    command: "bun",
    args: ["run", "tsgo"],
  });

  consola.info("Staging all changes...");
  execSync("git add .", { stdio: "inherit" });
};

// ─── Interactive prompts ──────────────────────────────────────────────────────

const selectType = async ({ initial }: { initial?: string } = {}) => {
  const options = COMMIT_TYPES.map(({ value, hint }) => ({
    label: `${colorize("yellowBright", value.padEnd(10))} ${dim(hint)}`,
    value,
  }));

  const result = await safePrompt<string>(`Select ${label("commit type")}:`, {
    type: "select",
    initial: initial ?? options[0]?.value,
    options,
  });

  return result;
};

const selectEmoji = async ({ initial }: { initial?: string } = {}) => {
  const commonOptions = COMMON_EMOJIS.map((e) => ({ label: e, value: e }));
  commonOptions.push({
    label: colorize("gray", "[ custom… ]"),
    value: CUSTOM_EMOJI_VALUE,
  });

  let emoji = "";

  while (!emoji) {
    const picked = await safePrompt<string>(`Select ${label("emoji")}:`, {
      type: "select",
      initial:
        initial && COMMON_EMOJIS.includes(initial)
          ? initial
          : commonOptions[0]?.value,
      options: commonOptions,
    });

    if (picked === CUSTOM_EMOJI_VALUE) {
      const custom = await safePrompt<string>(
        `Enter ${label("custom emoji")}:`,
        {
          type: "text",
          placeholder: initial ?? "e.g. 🦄",
          initial: initial && !COMMON_EMOJIS.includes(initial) ? initial : "",
        },
      );

      const normalizedEmoji = custom ? normalizeEmoji(custom) : null;

      if (!normalizedEmoji) {
        consola.error("Enter exactly one emoji.");
      } else {
        emoji = normalizedEmoji;
      }
    } else {
      emoji = picked;
    }
  }

  return emoji;
};

const inputMessage = async ({ initial }: { initial?: string } = {}) => {
  let message = "";

  while (!message) {
    const result = await safePrompt<string | undefined>(
      `Enter ${label("commit message")}:`,
      {
        type: "text",
        placeholder: initial ?? "Short description of the change",
        initial: initial ?? "",
      },
    );
    message = result?.trim() ?? "";

    if (!message) {
      consola.error("Commit message cannot be empty.");
    }
  }

  return message;
};

// ─── Main loop ────────────────────────────────────────────────────────────────

const main = async ({
  defaultType,
  defaultEmoji,
  defaultMessage,
}: {
  defaultType?: string;
  defaultEmoji?: string | null; // null = use type default, undefined = keep previous
  defaultMessage?: string;
} = {}) => {
  const type = await selectType({
    initial: defaultType,
  });
  const typeDefault = COMMIT_TYPES.find((t) => t.value === type)?.emoji;
  // If user explicitly set an emoji previously (defaultEmoji != null), keep it; otherwise use type's default
  const emojiInitial =
    defaultEmoji !== undefined && defaultEmoji !== null
      ? defaultEmoji
      : typeDefault;
  const emoji = await selectEmoji({
    initial: emojiInitial,
  });
  const message = await inputMessage({
    initial: defaultMessage,
  });

  const commitMessage = `${type}: ${emoji} ${message}`;

  consola.log("");
  consola.info("Commit message:");
  consola.log(`  ${colorize("yellowBright", commitMessage)}`);
  consola.log("");

  const confirmed = await safePrompt<boolean>("Confirm?", {
    type: "confirm",
    initial: true,
  });

  if (confirmed === false) {
    consola.warn("Restarting — your previous input is pre-filled.");
    consola.log("");
    return main({
      defaultType: type,
      defaultEmoji: emoji,
      defaultMessage: message,
    });
  }

  return commitMessage;
};

// ─── Entry point ─────────────────────────────────────────────────────────────

if (!DEBUG) {
  if (!hasUncommittedChanges()) {
    consola.warn("Nothing to commit. Working tree is clean.");
    process.exit(0);
  }

  runChecks();
}

const commitMessage = await main();

if (DEBUG) {
  consola.log("");
  consola.success(
    `${colorize("bgYellowBright", " DEBUG ")} Final message: ${colorize("yellowBright", commitMessage)}`,
  );
} else {
  const result = spawnSync("git", ["commit", "-m", commitMessage], {
    stdio: "inherit",
  });

  if (result.status === 0) {
    consola.success("Committed successfully!");
  } else {
    consola.error(`git commit failed with exit code ${result.status}`);
    process.exit(result.status ?? 1);
  }
}
