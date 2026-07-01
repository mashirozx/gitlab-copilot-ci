import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { outputJsonPath } from "../constants";
import type { ReviewResponseEntity } from "../types/review.types";
import { parseAgentArgs } from "../utils/agent-args";
import { argv } from "../utils/argv";
import { withCliColorEnv } from "../utils/cli-env";
import { buildEmptyReviewResponse } from "../utils/empty-review-response";
import { env } from "../utils/env";
import { parseJson } from "../utils/json";
import { readReviewOutputJsonFile } from "../utils/review-output-json";
import { startRuntimeStatsCollector } from "../utils/stats/index.ts";
import {
  appendRecentOutputLine,
  consumeStdoutPrintBudget,
  createStdoutPrintBudgetState,
  flushLoggedStreamBuffer,
  getRecentProcessOutputText,
  getStdoutPrintSuppressedWarning,
} from "../utils/std-handler.ts";
import { getElapsedMilliseconds, getNowEpochMilliseconds } from "../utils/time";
import { logger, writeLogStream } from "./logger";

const MAX_USAGE_OUTPUT_CAPTURE_LENGTH = 8_192;

const appendUsageOutputCapture = ({
  buffer,
  text,
}: {
  buffer: string;
  text: string;
}): string => {
  const combined = `${buffer}${text}`;

  return combined.length > MAX_USAGE_OUTPUT_CAPTURE_LENGTH
    ? combined.slice(-MAX_USAGE_OUTPUT_CAPTURE_LENGTH)
    : combined;
};

const stripAnsiSequences = ({ text }: { text: string }): string => {
  let sanitizedText = "";
  let index = 0;

  while (index < text.length) {
    if (text.charCodeAt(index) === 0x1b && text[index + 1] === "[") {
      index += 2;

      while (index < text.length) {
        const currentCharacter = text[index];

        if (
          !currentCharacter ||
          !(
            (currentCharacter >= "0" && currentCharacter <= "9") ||
            currentCharacter === ";"
          )
        ) {
          break;
        }

        index += 1;
      }

      if (text[index] === "m") {
        index += 1;
        continue;
      }
    }

    sanitizedText += text[index] ?? "";
    index += 1;
  }

  return sanitizedText;
};

const parseCompactNumber = ({
  value,
}: {
  value: string | null | undefined;
}): number | undefined => {
  if (!value) {
    return undefined;
  }

  const normalizedValue = value.trim().replaceAll(",", "").toLowerCase();
  const compactMatch = normalizedValue.match(/^(\d+(?:\.\d+)?)([kmb])?$/i);

  if (!compactMatch) {
    const parsedValue = Number(normalizedValue);
    return Number.isFinite(parsedValue) ? parsedValue : undefined;
  }

  const numericValue = Number(compactMatch[1]);
  const unit = compactMatch[2]?.toLowerCase();
  const multiplier =
    unit === "k"
      ? 1_000
      : unit === "m"
        ? 1_000_000
        : unit === "b"
          ? 1_000_000_000
          : 1;

  return Math.round(numericValue * multiplier);
};

const getLastMatch = ({
  text,
  pattern,
}: {
  text: string;
  pattern: RegExp;
}): RegExpMatchArray | undefined => {
  let lastMatch: RegExpMatchArray | undefined;

  for (const match of text.matchAll(pattern)) {
    lastMatch = match;
  }

  return lastMatch;
};

const parseCopilotCliUsage = ({
  stdoutText,
  stderrText,
}: {
  stdoutText: string;
  stderrText: string;
}): ReviewResponseEntity["usage"] | undefined => {
  const combinedOutput = stripAnsiSequences({
    text: `${stdoutText}\n${stderrText}`,
  });
  const creditsMatch = getLastMatch({
    text: combinedOutput,
    pattern: /AI Credits\s+([0-9][\d.,]*[kmb]?)/gi,
  });
  const tokensMatch = getLastMatch({
    text: combinedOutput,
    pattern:
      /Tokens\s+↑\s*([0-9][\d.,]*[kmb]?)(?:\s*\(([0-9][\d.,]*[kmb]?)\s+cached\))?\s*[•·]\s*↓\s*([0-9][\d.,]*[kmb]?)(?:\s*\(([0-9][\d.,]*[kmb]?)\s+reasoning\))?/giu,
  });

  const inputTokens = parseCompactNumber({
    value: tokensMatch?.[1],
  });
  const cacheReadTokens = parseCompactNumber({
    value: tokensMatch?.[2],
  });
  const outputTokens = parseCompactNumber({
    value: tokensMatch?.[3],
  });
  const reasoningTokens = parseCompactNumber({
    value: tokensMatch?.[4],
  });
  const aiCredits = parseCompactNumber({
    value: creditsMatch?.[1],
  });

  const usage: ReviewResponseEntity["usage"] = {};

  if (aiCredits !== undefined) {
    usage.aiCredits = aiCredits;
  }

  if (inputTokens !== undefined) {
    usage.input = inputTokens;
  }

  if (cacheReadTokens !== undefined) {
    usage.cacheRead = cacheReadTokens;
  }

  if (outputTokens !== undefined) {
    usage.output = outputTokens;
  }

  if (reasoningTokens !== undefined) {
    usage.reasoningTokens = reasoningTokens;
  }

  if (inputTokens !== undefined || outputTokens !== undefined) {
    usage.totalTokens = (inputTokens ?? 0) + (outputTokens ?? 0);
  }

  return Object.keys(usage).length > 0 ? usage : undefined;
};

const getAllowedTools = (): string[] => {
  return [
    "write",
    "read_file",
    "list_directory",
    "search_files",
    "grep",
    "shell(node)",
    ...argv["tools"],
  ].filter((toolName, index, tools) => tools.indexOf(toolName) === index);
};

const getAllowedDirectories = (): string[] => {
  const configuredDirectories = [
    process.cwd(),
    tmpdir(),
    ...(process.platform === "win32" ? [] : ["/tmp"]),
  ];

  return configuredDirectories
    .flatMap((directoryPath) => {
      try {
        return [directoryPath, realpathSync(directoryPath)];
      } catch {
        return [directoryPath];
      }
    })
    .filter(
      (directoryPath, index, directoryPaths) =>
        directoryPaths.indexOf(directoryPath) === index,
    );
};

export const runCopilotReview = async ({
  prompt,
  onChildProcessStarted,
}: {
  prompt: string;
  onChildProcessStarted?: ({
    childProcess,
  }: {
    childProcess: ChildProcess;
  }) => void;
}): Promise<ReviewResponseEntity> => {
  logger.info("[Copilot] Calling copilot binary...");

  return new Promise((resolve) => {
    const startTime = getNowEpochMilliseconds();
    let stdoutLogBuffer = "";
    let stderrLogBuffer = "";
    const stdoutTail: string[] = [];
    const stderrTail: string[] = [];
    let stdoutUsageOutputCapture = "";
    let stderrUsageOutputCapture = "";
    const stdoutPrintBudget = createStdoutPrintBudgetState();

    const childEnv = withCliColorEnv({ env: { ...process.env } });
    if (argv["copilot-github-token"]) {
      childEnv.COPILOT_GITHUB_TOKEN = argv["copilot-github-token"];
      childEnv.GH_TOKEN = argv["copilot-github-token"];
      childEnv.GITHUB_TOKEN = argv["copilot-github-token"];
    }

    const allowedTools = getAllowedTools();
    const allowedDirectories = getAllowedDirectories();

    const presetArgs = [
      "--model",
      argv["model"],
      ...allowedTools.map((toolName) => `--allow-tool=${toolName}`),
      ...allowedDirectories.map(
        (directoryPath) => `--add-dir=${directoryPath}`,
      ),
      "--no-ask-user",
      "--log-level",
      "info",
    ];
    const extraAgentArgs = parseAgentArgs({
      rawArgs: argv["agent-args"],
    });
    const copilotArgs = [...presetArgs, ...extraAgentArgs, "-p", prompt];

    const agentBin = argv["agent-bin"] ?? env.COPILOT_BIN ?? "copilot";

    const child = spawn(agentBin, copilotArgs, {
      detached: true,
      env: childEnv,
      stdio: "pipe",
    });
    onChildProcessStarted?.({
      childProcess: child,
    });
    const runtimeStatsCollector = startRuntimeStatsCollector({
      rootPid: child.pid ?? null,
    });
    let processStartErrorMessage: string | null = null;

    const finalizeResult = async ({
      result,
    }: {
      result: ReviewResponseEntity;
    }): Promise<void> => {
      result.runtimeStats = await runtimeStatsCollector.stop();
      resolve(result);
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdoutUsageOutputCapture = appendUsageOutputCapture({
        buffer: stdoutUsageOutputCapture,
        text,
      });
      const stdoutBudgetResult = consumeStdoutPrintBudget({
        state: stdoutPrintBudget,
        text,
      });

      if (stdoutBudgetResult.warningReachedLimit) {
        logger.warn(
          getStdoutPrintSuppressedWarning({
            agentName: "Copilot",
          }),
        );
      }

      if (stdoutBudgetResult.shouldPrint) {
        process.stdout.write(text);
      }

      stdoutLogBuffer += text;
      stdoutLogBuffer = flushLoggedStreamBuffer({
        buffer: stdoutLogBuffer,
        prefix: "Copilot:out",
        writeLog: writeLogStream,
        consumeLine: (line) =>
          appendRecentOutputLine({
            tail: stdoutTail,
            line,
          }),
      });
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();

      stderrUsageOutputCapture = appendUsageOutputCapture({
        buffer: stderrUsageOutputCapture,
        text,
      });
      process.stderr.write(text);
      stderrLogBuffer += text;
      stderrLogBuffer = flushLoggedStreamBuffer({
        buffer: stderrLogBuffer,
        prefix: "Copilot:err",
        writeLog: writeLogStream,
        consumeLine: (line) =>
          appendRecentOutputLine({
            tail: stderrTail,
            line,
          }),
      });
    });

    child.on("spawn", () => {
      logger.start("[Copilot] Copilot CLI process started");
    });

    child.on("close", (code) => {
      if (stdoutLogBuffer) {
        writeLogStream(`[Copilot:out] ${stdoutLogBuffer}`);
        appendRecentOutputLine({
          tail: stdoutTail,
          line: stdoutLogBuffer,
        });
      }

      if (stderrLogBuffer) {
        writeLogStream(`[Copilot:err] ${stderrLogBuffer}`);
        appendRecentOutputLine({
          tail: stderrTail,
          line: stderrLogBuffer,
        });
      }

      const exitedWithCriticalFailure = code !== 0;
      const processStartErrorWithExitCode = processStartErrorMessage
        ? `${processStartErrorMessage}. Exit code: ${code}`
        : null;

      if (exitedWithCriticalFailure) {
        const errMsg =
          processStartErrorWithExitCode ??
          `[Copilot] Copilot CLI exited with code ${code}`;
        const recentOutput = getRecentProcessOutputText({
          stdoutTail,
          stderrTail,
        });

        if (recentOutput) {
          logger.info("[Copilot] Recent output:", recentOutput);
        }

        logger.info(`[Copilot] Process exited with code ${code}`);
        logger.error(errMsg);

        const duration = getElapsedMilliseconds({
          startTimeMs: startTime,
        });
        void finalizeResult({
          result: buildEmptyReviewResponse({
            duration,
            error: errMsg,
            withCriticalError: true,
          }),
        });
        return;
      }

      const { jsonText, error: jsonReadError } = readReviewOutputJsonFile();

      if (jsonText) {
        logger.info(`[Copilot] Read JSON output from file: ${outputJsonPath}`);
      }

      if (!jsonText) {
        const errMsg =
          processStartErrorWithExitCode ??
          `[Copilot] Copilot CLI: no review JSON found in output file. ${jsonReadError ?? "Unknown read error"}. Exit code: ${code}`;
        const recentOutput = getRecentProcessOutputText({
          stdoutTail,
          stderrTail,
        });

        if (recentOutput) {
          logger.info("[Copilot] Recent output:", recentOutput);
        }

        logger.info(`[Copilot] Process exited with code ${code}`);
        logger.error(`[Copilot] ${errMsg}`);

        const duration = getElapsedMilliseconds({
          startTimeMs: startTime,
        });
        void finalizeResult({
          result: buildEmptyReviewResponse({
            duration,
            error: errMsg,
            withCriticalError: exitedWithCriticalFailure,
          }),
        });
        return;
      }

      try {
        logger.info(`[Copilot] Process exited with code ${code}`);
        const duration = getElapsedMilliseconds({
          startTimeMs: startTime,
        });
        const result = parseJson<ReviewResponseEntity>({ text: jsonText });
        const cliUsage = parseCopilotCliUsage({
          stdoutText: stdoutUsageOutputCapture,
          stderrText: stderrUsageOutputCapture,
        });

        if (cliUsage) {
          result.usage = {
            ...result.usage,
            ...cliUsage,
          };
        }

        result.duration = duration;
        result.withCriticalError =
          result.withCriticalError || exitedWithCriticalFailure;

        getContextInfo(env)
          .then((contextInfo) => {
            result.context = contextInfo.context;
            logger.info(
              "[Copilot] Parsed result:",
              JSON.stringify(result, null, 2),
            );
            void finalizeResult({ result });
          })
          .catch((err) => {
            const errMsg = `[Copilot] Copilot CLI: failed to get context info: ${err instanceof Error ? err.message : String(err)}`;
            logger.error(errMsg);
            logger.error(err);
            result.errors = [...(result.errors ?? []), errMsg];
            logger.info(
              "[Copilot] Parsed result:",
              JSON.stringify(result, null, 2),
            );
            void finalizeResult({ result });
          });
      } catch (e) {
        const errMsg = `[Copilot] Copilot CLI: failed to parse JSON response: ${e instanceof Error ? e.message : String(e)}`;
        logger.error(errMsg);
        logger.error(e);
        logger.info("[Copilot] JSON text:", jsonText);
        const duration = getElapsedMilliseconds({
          startTimeMs: startTime,
        });
        void finalizeResult({
          result: buildEmptyReviewResponse({
            duration,
            error: errMsg,
          }),
        });
      }
    });

    child.on("error", (err) => {
      const errMsg = `[Copilot] Copilot CLI: failed to start process: ${err.message}`;
      logger.error(errMsg);
      logger.error(err);
      processStartErrorMessage = errMsg;
    });
  });
};

export const getContextInfo = async (
  _env: NodeJS.ProcessEnv,
): Promise<{
  model?: string;
  context?: ReviewResponseEntity["context"];
}> => {
  return new Promise((resolve) => {
    logger.info("[Copilot] Fetching context information from logs...");

    try {
      const logsDir = join(homedir(), ".copilot", "logs");
      const files = readdirSync(logsDir)
        .filter((f) => f.startsWith("process-") && f.endsWith(".log"))
        .sort()
        .reverse();

      if (files.length === 0) {
        logger.info("[Copilot] No log files found");
        resolve({});
        return;
      }

      const latestLogFile = join(logsDir, files[0] ?? "");
      logger.info("[Copilot] Reading log file:", latestLogFile);

      const logContent = readFileSync(latestLogFile, "utf-8");

      const result: {
        context?: ReviewResponseEntity["context"];
      } = {};

      const compactionMatches = logContent.match(
        /CompactionProcessor:\s+Utilization\s+([0-9.]+)%\s+\((\d+)\/(\d+)\s+tokens\)/g,
      );
      if (compactionMatches && compactionMatches.length > 0) {
        const lastMatch = compactionMatches[compactionMatches.length - 1] ?? "";
        const detailedMatch = lastMatch.match(
          /Utilization\s+([0-9.]+)%\s+\((\d+)\/(\d+)\s+tokens\)/,
        );

        if (detailedMatch) {
          const usagePercentage = parseFloat(detailedMatch[1] ?? "0");
          const usedTokens = parseInt(detailedMatch[2] ?? "0", 10);
          const totalTokens = parseInt(detailedMatch[3] ?? "0", 10);

          result.context = {
            usage_percentage: usagePercentage,
            used_length: usedTokens,
            total_length: totalTokens,
          };
          logger.info("[Copilot] Extracted context:", result.context);
        }
      } else {
        logger.info("[Copilot] No CompactionProcessor info found in logs");
      }

      resolve(result);
    } catch (err) {
      const msg = `[Copilot] Failed to read logs: ${err instanceof Error ? err.message : String(err)}`;
      logger.error(msg);
      logger.error(err);
      resolve({});
    }
  });
};
