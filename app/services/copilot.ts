import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { REVIEW_RESPONSE_JSON_MARKER } from "../constants";
import { buildCopilotPrompt } from "../prompts";
import type { ReviewResponse, StoredReview } from "../types/entities";
import { argv } from "../utils/argv";
import { withCliColorEnv } from "../utils/cli-env";
import { extractMarkedJsonText, parseJson } from "../utils/json";
import { getElapsedMilliseconds, getNowEpochMilliseconds } from "../utils/time";
import { logger, writeLogStream } from "./logger";

export const runCopilotReview = async ({
  diffFilePaths,
  title,
  description,
  previousReviews,
}: {
  diffFilePaths: string[];
  title: string;
  description?: string | null;
  previousReviews?: StoredReview[];
}): Promise<ReviewResponse> => {
  const langs = argv["lang"];

  const prompt = buildCopilotPrompt({
    diffFilePaths,
    title,
    description,
    previousReviews,
    langs,
    debugMode: argv["debug"],
  });

  logger.info("[Copilot] Calling copilot binary...");

  return new Promise((resolve) => {
    const startTime = getNowEpochMilliseconds();
    let stdout = "";
    let stderr = "";
    // Pause line by line tracking
    // let stdoutLineBuffer = "";
    // let stderrLineBuffer = "";

    const trackCopilotStd = () => {
      if (stdout) {
        writeLogStream(
          `[Copilot:out] ==== Copilot Output Start ====\n\n${stdout}\n\n[Copilot:out]==== Copilot Output End ====\n`,
        );
      }

      if (stderr) {
        writeLogStream(
          `[Copilot:err] ==== Copilot Error Output Start ====\n\n${stderr}\n\n[Copilot:err]==== Copilot Error Output End ====\n`,
        );
      }
    };

    const env = withCliColorEnv({ env: { ...process.env } });
    if (argv["copilot-github-token"]) {
      env.COPILOT_GITHUB_TOKEN = argv["copilot-github-token"];
      env.GH_TOKEN = argv["copilot-github-token"];
      env.GITHUB_TOKEN = argv["copilot-github-token"];
    }

    const child = spawn(
      argv["copilot-bin"],
      [
        "--model",
        argv["llm-model"],
        "--allow-tool=read_file",
        "--allow-tool=list_directory",
        "--allow-tool=search_files",
        "--allow-tool=grep",
        `--add-dir=${process.cwd()}`,
        "--no-ask-user",
        "--log-level",
        "info",
        "-p",
        prompt,
      ],
      { env, stdio: "pipe" },
    );

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      process.stdout.write(text);
      stdout += text;
      // stdoutLineBuffer += text;
      // const lines = stdoutLineBuffer.split("\n");
      // for (const line of lines) {
      //   logger.log(`[Copilot:out] ${line}`);
      // }
      // stdoutLineBuffer = lines[lines.length - 1] ?? "";
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      process.stderr.write(text);
      stderr += text;
      // stderrLineBuffer += text;
      // const lines = stderrLineBuffer.split("\n");
      // for (const line of lines) {
      //   logger.log(`[Copilot:err] ${line}`);
      // }
    });

    child.on("spawn", () => {
      logger.start("[Copilot] Copilot CLI process started");
    });

    child.on("close", (code) => {
      trackCopilotStd();
      logger.info(`[Copilot] Process exited with code ${code}`);

      const text = stdout.trim() || stderr.trim();
      const jsonText = extractMarkedJsonText({
        text,
        marker: REVIEW_RESPONSE_JSON_MARKER,
      });

      if (!jsonText) {
        const errMsg = `[Copilot] Copilot CLI: no JSON found in output (missing ${REVIEW_RESPONSE_JSON_MARKER} marker). Exit code: ${code}`;
        logger.error(`[Copilot] ${errMsg}`);
        logger.info("[Copilot] Full output:", text);
        const duration = getElapsedMilliseconds({
          startTimeMs: startTime,
        });
        resolve({
          comment: "",
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
        const result = parseJson<ReviewResponse>({ text: jsonText });
        result.duration = duration;

        getContextInfo(env)
          .then((contextInfo) => {
            result.model = contextInfo.model;
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
          comment: "",
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
        comment: "",
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
  context?: ReviewResponse["context"];
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
        model?: string;
        context?: ReviewResponse["context"];
      } = {};

      result.model = argv["llm-model"];
      logger.info("[Copilot] Using model from arguments:", result.model);

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
