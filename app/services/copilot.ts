import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  REVIEW_RESPONSE_JSON_END_MARKER,
  REVIEW_RESPONSE_JSON_START_MARKER,
} from "../constants";
import type { ReviewResponseEntity } from "../types/review.types";
import { parseAgentArgs } from "../utils/agent-args";
import { argv } from "../utils/argv";
import { withCliColorEnv } from "../utils/cli-env";
import { env } from "../utils/env";
import { parseJson } from "../utils/json";
import { parseModelSpec } from "../utils/model-name-parser";
import {
  appendRecentOutputLine,
  consumeMarkedJsonChunk,
  createMarkedJsonCaptureState,
  flushLoggedStreamBuffer,
  getRecentProcessOutputText,
} from "../utils/std-handler.ts";
import { getElapsedMilliseconds, getNowEpochMilliseconds } from "../utils/time";
import { logger, writeLogStream } from "./logger";

const getAllowedTools = (): string[] => {
  return [
    "read_file",
    "list_directory",
    "search_files",
    "grep",
    "shell(node)",
    ...argv["tools"],
  ].filter((toolName, index, tools) => tools.indexOf(toolName) === index);
};

export const runCopilotReview = async ({
  prompt,
}: {
  prompt: string;
}): Promise<ReviewResponseEntity> => {
  logger.info("[Copilot] Calling copilot binary...");

  return new Promise((resolve) => {
    const startTime = getNowEpochMilliseconds();
    let stdoutLogBuffer = "";
    let stderrLogBuffer = "";
    const stdoutTail: string[] = [];
    const stderrTail: string[] = [];
    const stdoutJsonCapture = createMarkedJsonCaptureState();
    const stderrJsonCapture = createMarkedJsonCaptureState();

    const childEnv = withCliColorEnv({ env: { ...process.env } });
    if (argv["copilot-github-token"]) {
      childEnv.COPILOT_GITHUB_TOKEN = argv["copilot-github-token"];
      childEnv.GH_TOKEN = argv["copilot-github-token"];
      childEnv.GITHUB_TOKEN = argv["copilot-github-token"];
    }

    const modelSpec = parseModelSpec({
      model: argv["model"],
    });
    const allowedTools = getAllowedTools();
    const reasoningEffort =
      modelSpec.effort === "off"
        ? "none"
        : modelSpec.effort === "minimal"
          ? "low"
          : modelSpec.effort === "none" ||
              modelSpec.effort === "low" ||
              modelSpec.effort === "medium" ||
              modelSpec.effort === "high" ||
              modelSpec.effort === "xhigh" ||
              modelSpec.effort === "max"
            ? modelSpec.effort
            : null;

    const presetArgs = [
      "--model",
      modelSpec.model ?? argv["model"],
      ...allowedTools.map((toolName) => `--allow-tool=${toolName}`),
      `--add-dir=${process.cwd()}`,
      "--no-ask-user",
      "--log-level",
      "info",
    ];
    const extraAgentArgs = parseAgentArgs({
      rawArgs: argv["agent-args"],
    });
    const copilotArgs = [...presetArgs, ...extraAgentArgs, "-p", prompt];

    if (reasoningEffort) {
      copilotArgs.unshift(reasoningEffort);
      copilotArgs.unshift("--effort");
    }

    const agentBin = argv["agent-bin"] ?? env.COPILOT_BIN ?? "copilot";

    const child = spawn(agentBin, copilotArgs, {
      env: childEnv,
      stdio: "pipe",
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      process.stdout.write(text);
      consumeMarkedJsonChunk({
        state: stdoutJsonCapture,
        text,
        startMarker: REVIEW_RESPONSE_JSON_START_MARKER,
        endMarker: REVIEW_RESPONSE_JSON_END_MARKER,
      });
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
      process.stderr.write(text);
      consumeMarkedJsonChunk({
        state: stderrJsonCapture,
        text,
        startMarker: REVIEW_RESPONSE_JSON_START_MARKER,
        endMarker: REVIEW_RESPONSE_JSON_END_MARKER,
      });
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

      logger.info(`[Copilot] Process exited with code ${code}`);

      const jsonText =
        stdoutJsonCapture.markedJson ?? stderrJsonCapture.markedJson;

      if (!jsonText) {
        const errMsg = `[Copilot] Copilot CLI: no JSON found in output (missing ${REVIEW_RESPONSE_JSON_START_MARKER}/${REVIEW_RESPONSE_JSON_END_MARKER} markers). Exit code: ${code}`;
        const recentOutput = getRecentProcessOutputText({
          stdoutTail,
          stderrTail,
        });
        logger.error(`[Copilot] ${errMsg}`);

        if (recentOutput) {
          logger.info("[Copilot] Recent output:", recentOutput);
        }

        const duration = getElapsedMilliseconds({
          startTimeMs: startTime,
        });
        resolve({
          summary: {
            content: "",
            translations: {},
          },
          reviews: [],
          duration,
          errors: [errMsg],
        });
        return;
      }

      try {
        const duration = getElapsedMilliseconds({
          startTimeMs: startTime,
        });
        const result = parseJson<ReviewResponseEntity>({ text: jsonText });
        result.duration = duration;

        getContextInfo(env)
          .then((contextInfo) => {
            result.context = contextInfo.context;
            logger.info(
              "[Copilot] Parsed result:",
              JSON.stringify(result, null, 2),
            );
            resolve(result);
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
            resolve(result);
          });
      } catch (e) {
        const errMsg = `[Copilot] Copilot CLI: failed to parse JSON response: ${e instanceof Error ? e.message : String(e)}`;
        logger.error(errMsg);
        logger.error(e);
        logger.info("[Copilot] JSON text:", jsonText);
        const duration = getElapsedMilliseconds({
          startTimeMs: startTime,
        });
        resolve({
          summary: {
            content: "",
            translations: {},
          },
          reviews: [],
          duration,
          errors: [errMsg],
        });
      }
    });

    child.on("error", (err) => {
      const errMsg = `[Copilot] Copilot CLI: failed to start process: ${err.message}`;
      logger.error(errMsg);
      logger.error(err);
      const duration = getElapsedMilliseconds({
        startTimeMs: startTime,
      });
      resolve({
        summary: {
          content: "",
          translations: {},
        },
        reviews: [],
        duration,
        errors: [errMsg],
      });
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
