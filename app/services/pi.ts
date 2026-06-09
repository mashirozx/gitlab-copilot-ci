import { spawn } from "node:child_process";
import {
  REVIEW_RESPONSE_JSON_END_MARKER,
  REVIEW_RESPONSE_JSON_START_MARKER,
} from "../constants";
import type { ReviewResponseEntity } from "../types/review.types";
import { parseAgentArgs } from "../utils/agent-args";
import { argv } from "../utils/argv";
import { withCliColorEnv } from "../utils/cli-env";
import { buildEmptyReviewResponse } from "../utils/empty-review-response";
import { env } from "../utils/env";
import { extractMarkedJsonText, parseJson, tryParseJson } from "../utils/json";
import { createPiMessageFormatter } from "../utils/pi-message-formatter";
import { getPiUsage } from "../utils/pi-usage-collector";
import { startRuntimeStatsCollector } from "../utils/stats/index.ts";
import {
  appendRecentOutputLine,
  consumeMarkedJsonChunk,
  consumeStdoutPrintBudget,
  createMarkedJsonCaptureState,
  createStdoutPrintBudgetState,
  flushLoggedStreamBuffer,
  getRecentProcessOutputText,
  getStdoutPrintSuppressedWarning,
} from "../utils/std-handler.ts";
import { getElapsedMilliseconds, getNowEpochMilliseconds } from "../utils/time";
import { logger, writeLogStream } from "./logger";

const getAllowedTools = (): string[] => {
  return ["read", "grep", "find", "ls", "bash", ...argv["tools"]].filter(
    (toolName, index, tools) => tools.indexOf(toolName) === index,
  );
};

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
  message?: PiMessage;
  messages?: PiMessage[];
  assistantMessageEvent?: {
    type?: string;
    delta?: string;
    content?: string;
    partial?: PiMessage;
  };
  usage?: ReviewResponseEntity["usage"];
};

type PiRuntimeState = {
  agentEndEvent: PiJsonEvent | null;
  hasStderrOutput: boolean;
  markedJsonCapture: ReturnType<typeof createMarkedJsonCaptureState>;
  pendingAssistantMessage: string;
  usage?: ReviewResponseEntity["usage"];
  stdoutTail: string[];
  stderrTail: string[];
};

const isPiTextContentArray = (value: unknown): value is PiTextContent[] => {
  return Array.isArray(value);
};

const getEventMessagesForStreaming = ({
  event,
}: {
  event: PiJsonEvent;
}): PiMessage[] => {
  const messages = Array.isArray(event.messages) ? event.messages : [];

  return [
    ...messages,
    ...(event.assistantMessageEvent?.partial
      ? [event.assistantMessageEvent.partial]
      : []),
    ...(event.message ? [event.message] : []),
  ];
};

const appendAssistantTextToMarkedJsonCapture = ({
  state,
  text,
}: {
  state: PiRuntimeState;
  text: string;
}): void => {
  if (!text) {
    return;
  }

  consumeMarkedJsonChunk({
    state: state.markedJsonCapture,
    text,
    startMarker: REVIEW_RESPONSE_JSON_START_MARKER,
    endMarker: REVIEW_RESPONSE_JSON_END_MARKER,
  });
};

const syncAssistantMessageCapture = ({
  state,
  nextText,
}: {
  state: PiRuntimeState;
  nextText: string;
}): void => {
  if (!nextText) {
    return;
  }

  const appendedText = nextText.startsWith(state.pendingAssistantMessage)
    ? nextText.slice(state.pendingAssistantMessage.length)
    : nextText;

  state.pendingAssistantMessage = nextText;
  appendAssistantTextToMarkedJsonCapture({
    state,
    text: appendedText,
  });
};

const updateMarkedJsonCaptureFromEvent = ({
  event,
  state,
}: {
  event: PiJsonEvent;
  state: PiRuntimeState;
}): void => {
  const partialEventType = event.assistantMessageEvent?.type;

  if (partialEventType === "text_start") {
    state.pendingAssistantMessage = "";
    return;
  }

  if (
    partialEventType === "text_delta" &&
    typeof event.assistantMessageEvent?.delta === "string"
  ) {
    state.pendingAssistantMessage += event.assistantMessageEvent.delta;
    appendAssistantTextToMarkedJsonCapture({
      state,
      text: event.assistantMessageEvent.delta,
    });
    return;
  }

  if (
    partialEventType === "text_end" &&
    typeof event.assistantMessageEvent?.content === "string"
  ) {
    syncAssistantMessageCapture({
      state,
      nextText: event.assistantMessageEvent.content,
    });
    return;
  }

  if (event.type === "message_end" || event.type === "agent_end") {
    syncAssistantMessageCapture({
      state,
      nextText: extractAssistantText({
        messages: getEventMessagesForStreaming({ event }),
      }),
    });
  }
};

const consumePiStdoutLine = ({
  line,
  state,
}: {
  line: string;
  state: PiRuntimeState;
}): void => {
  appendRecentOutputLine({
    tail: state.stdoutTail,
    line,
  });

  const trimmedLine = line.trim();

  if (!trimmedLine) {
    return;
  }

  const event = tryParseJson<PiJsonEvent>({ text: trimmedLine });

  if (event === null) {
    logger.warn(`[Pi] Failed to parse JSON event line: ${trimmedLine}`);
    return;
  }

  updateMarkedJsonCaptureFromEvent({
    event,
    state,
  });

  const usage = getPiUsage({ event });

  if (usage) {
    state.usage = usage;
  }

  if (event.type === "agent_end") {
    state.agentEndEvent = event;
  }
};

const getEventMessages = ({
  event,
}: {
  event?: PiJsonEvent | null;
}): PiMessage[] => {
  if (!event) {
    return [];
  }

  if (event.messages !== undefined && !Array.isArray(event.messages)) {
    throw new Error(
      "Invalid agent_end payload: messages must be an array when present",
    );
  }

  const messages = event.messages ?? [];

  if (event.message) {
    return [...messages, event.message];
  }

  return messages;
};

const flushPiConsoleBuffer = ({
  buffer,
  consoleFormatter,
  write,
}: {
  buffer: string;
  consoleFormatter: ReturnType<typeof createPiMessageFormatter>;
  write: (text: string) => void;
}): string => {
  const lines = buffer.split(/\r?\n/);
  const trailing = lines.pop() ?? "";

  for (const line of lines) {
    write(consoleFormatter.formatLine({ line }));
  }

  return trailing;
};

const writeBudgetedStdout = ({
  state,
  text,
  agentName,
}: {
  state: ReturnType<typeof createStdoutPrintBudgetState>;
  text: string;
  agentName: string;
}): void => {
  const stdoutBudgetResult = consumeStdoutPrintBudget({
    state,
    text,
  });

  if (stdoutBudgetResult.warningReachedLimit) {
    logger.warn(
      getStdoutPrintSuppressedWarning({
        agentName,
      }),
    );
  }

  if (stdoutBudgetResult.shouldPrint) {
    process.stdout.write(text);
  }
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

  if (!isPiTextContentArray(assistantMessage.content)) {
    return "";
  }

  const content = assistantMessage.content;

  return content
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

export const runPiReview = async ({
  prompt,
}: {
  prompt: string;
}): Promise<ReviewResponseEntity> => {
  logger.info("[Pi] Calling pi binary...");

  return new Promise((resolve) => {
    const consoleFormatter = createPiMessageFormatter();
    const startTime = getNowEpochMilliseconds();
    let stdoutConsoleBuffer = "";
    let stderrConsoleBuffer = "";
    let stdoutEventBuffer = "";
    let stderrLogBuffer = "";
    const stdoutPrintBudget = createStdoutPrintBudgetState();
    const piRuntimeState: PiRuntimeState = {
      agentEndEvent: null,
      hasStderrOutput: false,
      markedJsonCapture: createMarkedJsonCaptureState(),
      pendingAssistantMessage: "",
      usage: undefined,
      stdoutTail: [],
      stderrTail: [],
    };
    const allowedTools = getAllowedTools();
    const piArgs = [
      "--mode",
      "json",
      "--no-session",
      "--tools",
      allowedTools.join(","),
    ];

    const childEnv: NodeJS.ProcessEnv = withCliColorEnv({
      env: {
        ...process.env,
        PI_SKIP_VERSION_CHECK: env.PI_SKIP_VERSION_CHECK ?? "1",
        PI_TELEMETRY: env.PI_TELEMETRY ?? "0",
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

    const agentBin = argv["agent-bin"] ?? env.PI_BIN ?? "pi";

    const child = spawn(agentBin, piArgs, {
      cwd: process.cwd(),
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const runtimeStatsCollector = startRuntimeStatsCollector({
      rootPid: child.pid ?? null,
    });

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
      stdoutConsoleBuffer += text;
      stdoutConsoleBuffer = flushPiConsoleBuffer({
        buffer: stdoutConsoleBuffer,
        consoleFormatter,
        write: (formattedText) =>
          writeBudgetedStdout({
            state: stdoutPrintBudget,
            text: formattedText,
            agentName: "Pi",
          }),
      });

      stdoutEventBuffer += text;
      stdoutEventBuffer = flushLoggedStreamBuffer({
        buffer: stdoutEventBuffer,
        prefix: "Pi:out",
        writeLog: writeLogStream,
        consumeLine: (line) =>
          consumePiStdoutLine({
            line,
            state: piRuntimeState,
          }),
      });
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();

      if (text.trim().length > 0) {
        piRuntimeState.hasStderrOutput = true;
      }

      stderrConsoleBuffer += text;
      stderrConsoleBuffer = flushPiConsoleBuffer({
        buffer: stderrConsoleBuffer,
        consoleFormatter,
        write: (formattedText) => process.stderr.write(formattedText),
      });

      stderrLogBuffer += text;
      stderrLogBuffer = flushLoggedStreamBuffer({
        buffer: stderrLogBuffer,
        prefix: "Pi:err",
        writeLog: writeLogStream,
        consumeLine: (line) =>
          appendRecentOutputLine({
            tail: piRuntimeState.stderrTail,
            line,
          }),
      });
    });

    child.on("spawn", () => {
      logger.start("[Pi] Pi CLI process started");
    });

    child.on("close", (code) => {
      if (stdoutConsoleBuffer) {
        writeBudgetedStdout({
          state: stdoutPrintBudget,
          text: consoleFormatter.formatLine({
            line: stdoutConsoleBuffer,
          }),
          agentName: "Pi",
        });
      }

      if (stderrConsoleBuffer) {
        process.stderr.write(
          consoleFormatter.formatLine({
            line: stderrConsoleBuffer,
          }),
        );
      }

      if (stdoutEventBuffer) {
        writeLogStream(`[Pi:out] ${stdoutEventBuffer}`);
        consumePiStdoutLine({
          line: stdoutEventBuffer,
          state: piRuntimeState,
        });
      }

      if (stderrLogBuffer) {
        writeLogStream(`[Pi:err] ${stderrLogBuffer}`);
        appendRecentOutputLine({
          tail: piRuntimeState.stderrTail,
          line: stderrLogBuffer,
        });
      }

      logger.info(`[Pi] Process exited with code ${code}`);

      try {
        const agentEndEvent = piRuntimeState.agentEndEvent;

        if (!agentEndEvent) {
          const duration = getElapsedMilliseconds({
            startTimeMs: startTime,
          });
          const errMsg = `[Pi] Pi JSON mode exited before returning an agent_end event. Exit code: ${code}`;
          const recentOutput = getRecentProcessOutputText({
            stdoutTail: piRuntimeState.stdoutTail,
            stderrTail: piRuntimeState.stderrTail,
          });
          logger.error(errMsg);

          if (recentOutput) {
            logger.info("[Pi] Recent output:", recentOutput);
          }

          void finalizeResult({
            result: buildEmptyReviewResponse({
              duration,
              error: errMsg,
            }),
          });
          return;
        }

        const eventMessages = getEventMessages({ event: agentEndEvent });
        const assistantText = extractAssistantText({
          messages: eventMessages,
        });
        const assistantError = extractAssistantError({
          messages: eventMessages,
        });
        const jsonText =
          piRuntimeState.markedJsonCapture.markedJson ??
          extractMarkedJsonText({
            text: assistantText,
            marker: REVIEW_RESPONSE_JSON_START_MARKER,
            endMarker: REVIEW_RESPONSE_JSON_END_MARKER,
          });

        if (!jsonText) {
          const errMsg = assistantError
            ? `[Pi] Pi JSON mode returned an assistant error before review JSON was produced. Exit code: ${code}. Error: ${assistantError}`
            : `[Pi] Pi JSON mode: no JSON found in assistant output (missing ${REVIEW_RESPONSE_JSON_START_MARKER}/${REVIEW_RESPONSE_JSON_END_MARKER} markers). Exit code: ${code}`;
          logger.error(errMsg);
          logger.info("[Pi] Assistant output:", assistantText);
          const duration = getElapsedMilliseconds({
            startTimeMs: startTime,
          });
          void finalizeResult({
            result: buildEmptyReviewResponse({
              duration,
              error: errMsg,
            }),
          });
          return;
        }

        const duration = getElapsedMilliseconds({
          startTimeMs: startTime,
        });
        const result = parseJson<ReviewResponseEntity>({ text: jsonText });
        const usage =
          piRuntimeState.usage ??
          getPiUsage({
            event: agentEndEvent,
          });

        void finalizeResult({
          result: {
            ...result,
            duration,
            usage,
            withCriticalError:
              result.withCriticalError || piRuntimeState.hasStderrOutput,
          },
        });
      } catch (error) {
        const errMsg = `[Pi] Pi JSON mode: failed to parse PI output after process exit: ${error instanceof Error ? error.message : String(error)}`;
        const recentOutput = getRecentProcessOutputText({
          stdoutTail: piRuntimeState.stdoutTail,
          stderrTail: piRuntimeState.stderrTail,
        });
        logger.error(errMsg);
        logger.error(error);

        if (recentOutput) {
          logger.info("[Pi] Recent output:", recentOutput);
        }

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

    child.on("error", (error) => {
      const errMsg = `[Pi] Pi CLI: failed to start process: ${error.message}`;
      logger.error(errMsg);
      logger.error(error);
      const duration = getElapsedMilliseconds({
        startTimeMs: startTime,
      });
      void finalizeResult({
        result: buildEmptyReviewResponse({
          duration,
          error: errMsg,
        }),
      });
    });
  });
};
