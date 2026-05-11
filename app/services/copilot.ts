import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildCopilotPrompt } from "../prompts";
import type { ReviewResponse, StoredReview } from "../types/entities";
import { argv } from "../utils/argv";
import { logError, logInfo } from "./logger";

export const runCopilotReview = async ({
  diffFilePath,
  title,
  description,
  previousReviews,
}: {
  diffFilePath: string;
  title: string;
  description?: string | null;
  previousReviews?: StoredReview[];
}): Promise<ReviewResponse> => {
  const langs = (argv["lang"] as string[]) ?? [];

  const prompt = buildCopilotPrompt({
    diffFilePath,
    title,
    description,
    previousReviews,
    langs,
    debugMode: argv["debug"],
  });

  logInfo("[Copilot] Starting review process...");

  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = "";
    let stderr = "";
    let stdoutLineBuffer = "";
    let stderrLineBuffer = "";

    const env = { ...process.env };
    if (argv["copilot-github-token"]) {
      env.COPILOT_GITHUB_TOKEN = argv["copilot-github-token"];
      env.GH_TOKEN = argv["copilot-github-token"];
      env.GITHUB_TOKEN = argv["copilot-github-token"];
    }

    const child = spawn(
      argv["copilot-bin"],
      [
        "-C",
        process.cwd(),
        "--model",
        argv["copilot-model"],
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
      { env },
    );

    child.stdout.on("data", (data) => {
      const chunk = data.toString();
      stdout += chunk;
      stdoutLineBuffer += chunk;

      const lines = stdoutLineBuffer.split("\n");
      for (let i = 0; i < lines.length - 1; i++) {
        process.stdout.write(`[Copilot:out] ${lines[i]}\n`);
      }
      stdoutLineBuffer = lines[lines.length - 1] ?? "";
    });

    child.stderr.on("data", (data) => {
      const chunk = data.toString();
      stderr += chunk;
      stderrLineBuffer += chunk;

      const lines = stderrLineBuffer.split("\n");
      for (let i = 0; i < lines.length - 1; i++) {
        process.stderr.write(`[Copilot:err] ${lines[i]}\n`);
      }
      stderrLineBuffer = lines[lines.length - 1] ?? "";
    });

    child.on("close", (code) => {
      if (stdoutLineBuffer) {
        process.stdout.write(`[Copilot:out] ${stdoutLineBuffer}\n`);
      }
      if (stderrLineBuffer) {
        process.stderr.write(`[Copilot:err] ${stderrLineBuffer}\n`);
      }

      logInfo(`[Copilot] Process exited with code ${code}`);

      const text = stdout.trim() || stderr.trim();

      let jsonText: string | null = null;
      const jsonMarker = "[COPILOT_JSON_START]";
      const markerIndex = text.indexOf(jsonMarker);

      if (markerIndex !== -1) {
        const startIndex = markerIndex + jsonMarker.length;
        const endIndex = text.indexOf("\n", startIndex);
        jsonText = text
          .substring(startIndex, endIndex === -1 ? text.length : endIndex)
          .trim();
      }

      if (!jsonText) {
        const errMsg = `Copilot CLI: no JSON found in output (missing [COPILOT_JSON_START] marker). Exit code: ${code}`;
        logError("[Copilot]", errMsg);
        logInfo("[Copilot] Full output:", text);
        const duration = Date.now() - startTime;
        resolve({ comment: "", reviews: [], duration, errors: [errMsg] });
        return;
      }

      try {
        const duration = Date.now() - startTime;
        const result = JSON.parse(jsonText) as ReviewResponse;
        result.duration = duration;

        getContextInfo(env)
          .then((contextInfo) => {
            result.model = contextInfo.model;
            result.context = contextInfo.context;
            logInfo(
              "[Copilot] Parsed result:",
              JSON.stringify(result, null, 2),
            );
            resolve(result);
          })
          .catch((err) => {
            const errMsg = `Copilot CLI: failed to get context info: ${(err as Error).message}`;
            logError("[Copilot]", errMsg);
            result.errors = [...(result.errors ?? []), errMsg];
            logInfo(
              "[Copilot] Parsed result:",
              JSON.stringify(result, null, 2),
            );
            resolve(result);
          });
      } catch (e) {
        const errMsg = `Copilot CLI: failed to parse JSON response: ${(e as Error).message}`;
        logError("[Copilot]", errMsg);
        logInfo("[Copilot] JSON text:", jsonText);
        const duration = Date.now() - startTime;
        resolve({ comment: "", reviews: [], duration, errors: [errMsg] });
      }
    });

    child.on("error", (err) => {
      const errMsg = `Copilot CLI: failed to start process: ${err.message}`;
      logError("[Copilot]", errMsg);
      const duration = Date.now() - startTime;
      resolve({ comment: "", reviews: [], duration, errors: [errMsg] });
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
    logInfo("[Copilot] Fetching context information from logs...");

    try {
      const logsDir = join(homedir(), ".copilot", "logs");
      const files = readdirSync(logsDir)
        .filter((f) => f.startsWith("process-") && f.endsWith(".log"))
        .sort()
        .reverse();

      if (files.length === 0) {
        logInfo("[Copilot] No log files found");
        resolve({});
        return;
      }

      const latestLogFile = join(logsDir, files[0] ?? "");
      logInfo("[Copilot] Reading log file:", latestLogFile);

      const logContent = readFileSync(latestLogFile, "utf-8");

      const result: {
        model?: string;
        context?: ReviewResponse["context"];
      } = {};

      result.model = argv["copilot-model"];
      logInfo("[Copilot] Using model from arguments:", result.model);

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
          logInfo("[Copilot] Extracted context:", result.context);
        }
      } else {
        logInfo("[Copilot] No CompactionProcessor info found in logs");
      }

      resolve(result);
    } catch (err) {
      logError("[Copilot] Failed to read logs:", (err as Error).message);
      resolve({});
    }
  });
};
