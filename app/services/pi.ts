import { spawn } from "node:child_process";
import { REVIEW_RESPONSE_JSON_MARKER } from "../constants";
import { buildCopilotPrompt } from "../prompts";
import type { ReviewResponseEntity } from "../types/review.types";
import { parseAgentArgs } from "../utils/agent-args";
import { argv } from "../utils/argv";
import { withCliColorEnv } from "../utils/cli-env";
import { extractMarkedJsonText, parseJson, tryParseJson } from "../utils/json";
import { createPiConsoleFormatter } from "../utils/pi-console";
import { getElapsedMilliseconds, getNowEpochMilliseconds } from "../utils/time";
import type { StoredReviewEntity } from "./db.types";
import { logger, writeLogStream } from "./logger";

type PiTextContent = {
  type?: string;
  text?: string;
};

type PiMessage = {
  role?: string;
  model?: string;
  stopReason?: string;
  errorMessage?: string;
  content?: string | PiTextContent[];
};

type PiJsonEvent = {
  type?: string;
  messages?: PiMessage[];
};

const flushPiConsoleBuffer = ({
  buffer,
  consoleFormatter,
  write,
}: {
  buffer: string;
  consoleFormatter: ReturnType<typeof createPiConsoleFormatter>;
  write: (text: string) => void;
}): string => {
  const lines = buffer.split(/\r?\n/);
  const trailing = lines.pop() ?? "";

  for (const line of lines) {
    write(consoleFormatter.formatLine({ line }));
  }

  return trailing;
};

const extractAssistantText = ({
  messages,
}: {
  messages?: PiMessage[];
}): string => {
  const assistantMessage = [...(messages ?? [])]
    .reverse()
    .find((message) => message.role === "assistant");

  if (!assistantMessage) {
    return "";
  }

  if (typeof assistantMessage.content === "string") {
    return assistantMessage.content;
  }

  return (assistantMessage.content ?? [])
    .filter((item) => item.type === "text")
    .map((item) => item.text ?? "")
    .join("");
};

const extractAssistantMessage = ({
  messages,
}: {
  messages?: PiMessage[];
}): PiMessage | undefined => {
  return [...(messages ?? [])]
    .reverse()
    .find((message) => message.role === "assistant");
};

const extractAssistantError = ({
  messages,
}: {
  messages?: PiMessage[];
}): string | null => {
  const assistantMessage = extractAssistantMessage({ messages });

  if (!assistantMessage?.errorMessage) {
    return null;
  }

  return assistantMessage.errorMessage;
};

const getAgentEndEvent = ({
  output,
}: {
  output: string;
}): PiJsonEvent | null => {
  const events = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      const event = tryParseJson<PiJsonEvent>({ text: line });

      if (event === null) {
        logger.warn(`[Pi] Failed to parse JSON event line: ${line}`);
        return [];
      }

      return [event];
    });

  return (
    [...events].reverse().find((event) => event.type === "agent_end") ?? null
  );
};

export const runPiReview = async ({
  diffFilePaths,
  title,
  description,
  previousReviews,
}: {
  diffFilePaths: string[];
  title: string;
  description?: string | null;
  previousReviews?: StoredReviewEntity[];
}): Promise<ReviewResponseEntity> => {
  const langs = argv["lang"];
  const prompt = buildCopilotPrompt({
    diffFilePaths,
    title,
    description,
    previousReviews,
    langs,
    debugMode: argv["debug"],
  });

  logger.info("[Pi] Calling pi binary...");

  return new Promise((resolve) => {
    const consoleFormatter = createPiConsoleFormatter();
    const startTime = getNowEpochMilliseconds();
    let stdout = "";
    let stderr = "";
    let stdoutConsoleBuffer = "";
    let stderrConsoleBuffer = "";
    const piArgs = [
      "--mode",
      "json",
      "--no-session",
      "--tools",
      "read,grep,find,ls",
    ];

    const trackPiStd = () => {
      if (stdout) {
        writeLogStream(
          `[Pi:out] ==== Pi Output Start ====\n\n${stdout}\n\n[Pi:out]==== Pi Output End ====\n`,
        );
      }

      if (stderr) {
        writeLogStream(
          `[Pi:err] ==== Pi Error Output Start ====\n\n${stderr}\n\n[Pi:err]==== Pi Error Output End ====\n`,
        );
      }
    };

    const env: NodeJS.ProcessEnv = withCliColorEnv({
      env: {
        ...process.env,
        PI_SKIP_VERSION_CHECK: process.env.PI_SKIP_VERSION_CHECK ?? "1",
        PI_TELEMETRY: process.env.PI_TELEMETRY ?? "0",
      },
    });

    if (argv["model"]) {
      piArgs.push("--model", argv["model"]);
    }

    const extraAgentArgs = parseAgentArgs({
      rawArgs: argv["agent-args"],
    });
    piArgs.push(...extraAgentArgs);

    piArgs.push(prompt);

    logger.info(`[Pi] Using model: ${argv["model"] ?? "default"}`);

    const agentBin = argv["agent-bin"] ?? process.env.PI_BIN ?? "pi";

    const child = spawn(agentBin, piArgs, {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      stdoutConsoleBuffer += text;
      stdoutConsoleBuffer = flushPiConsoleBuffer({
        buffer: stdoutConsoleBuffer,
        consoleFormatter,
        write: (formattedText) => process.stdout.write(formattedText),
      });
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      stderrConsoleBuffer += text;
      stderrConsoleBuffer = flushPiConsoleBuffer({
        buffer: stderrConsoleBuffer,
        consoleFormatter,
        write: (formattedText) => process.stderr.write(formattedText),
      });
    });

    child.on("spawn", () => {
      logger.start("[Pi] Pi CLI process started");
    });

    child.on("close", (code) => {
      if (stdoutConsoleBuffer) {
        process.stdout.write(
          consoleFormatter.formatLine({
            line: stdoutConsoleBuffer,
          }),
        );
      }

      if (stderrConsoleBuffer) {
        process.stderr.write(
          consoleFormatter.formatLine({
            line: stderrConsoleBuffer,
          }),
        );
      }

      trackPiStd();
      logger.info(`[Pi] Process exited with code ${code}`);

      const agentEndEvent = getAgentEndEvent({ output: stdout });

      if (!agentEndEvent) {
        const duration = getElapsedMilliseconds({
          startTimeMs: startTime,
        });
        const errMsg = `[Pi] Pi JSON mode exited before returning an agent_end event. Exit code: ${code}`;
        logger.error(errMsg);
        logger.info("[Pi] Full output:", stdout.trim() || stderr.trim());
        resolve({
          comment: "",
          reviews: [],
          duration,
          errors: [errMsg],
        });
        return;
      }

      const assistantText = extractAssistantText({
        messages: agentEndEvent.messages,
      });
      const assistantError = extractAssistantError({
        messages: agentEndEvent.messages,
      });
      const jsonText = extractMarkedJsonText({
        text: assistantText,
        marker: REVIEW_RESPONSE_JSON_MARKER,
      });

      if (!jsonText) {
        const errMsg = assistantError
          ? `[Pi] Pi JSON mode returned an assistant error before review JSON was produced. Exit code: ${code}. Error: ${assistantError}`
          : `[Pi] Pi JSON mode: no JSON found in assistant output (missing ${REVIEW_RESPONSE_JSON_MARKER} marker). Exit code: ${code}`;
        logger.error(errMsg);
        logger.info("[Pi] Assistant output:", assistantText);
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
        const result = parseJson<ReviewResponseEntity>({ text: jsonText });
        const model =
          [...(agentEndEvent.messages ?? [])]
            .reverse()
            .find((message) => message.role === "assistant")?.model ??
          argv["model"];

        resolve({
          ...result,
          duration,
          model,
        });
      } catch (error) {
        const errMsg = `[Pi] Pi JSON mode: failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errMsg);
        logger.error(error);
        logger.info("[Pi] JSON text:", jsonText);
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

    child.on("error", (error) => {
      const errMsg = `[Pi] Pi CLI: failed to start process: ${error.message}`;
      logger.error(errMsg);
      logger.error(error);
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
