import { basename } from "node:path";
import { tryParseJson } from "./json";
import { getPiUsage } from "./pi-usage-collector";

type PiToolTextItem = {
  text?: string;
};

type PiToolResult = {
  content?: PiToolTextItem[];
  error?: string;
  message?: string;
  stdout?: string;
  stderr?: string;
};

type PiConsoleContentItem = {
  type?: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
  partialArgs?: string;
};

type PiConsoleMessage = {
  role?: string;
  content?: string | PiConsoleContentItem[];
  usage?: Record<string, unknown>;
};

type PiAssistantMessageEvent = {
  type?: string;
  delta?: string;
  content?: string;
  partial?: PiConsoleMessage;
};

type PiConsoleEvent = {
  type?: string;
  cwd?: string;
  toolCallId?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  result?: PiToolResult | Record<string, unknown> | unknown[] | string;
  isError?: boolean;
  attempt?: number;
  maxAttempts?: number;
  delayMs?: number;
  errorMessage?: string;
  finalError?: string;
  reason?: string;
  aborted?: boolean;
  willRetry?: boolean;
  usage?: Record<string, unknown>;
  message?: PiConsoleMessage;
  messages?: PiConsoleMessage[];
  assistantMessageEvent?: PiAssistantMessageEvent;
};

type PendingToolCall = {
  toolName?: string;
  args?: Record<string, unknown>;
};

const ANSI = {
  reset: "\u001b[0m",
  dim: "\u001b[2m",
  gray: "\u001b[90m",
  magenta: "\u001b[35m",
  green: "\u001b[32m",
  red: "\u001b[31m",
  yellow: "\u001b[33m",
  cyan: "\u001b[36m",
} as const;

const colorize = ({ text, color }: { text: string; color: string }): string => {
  return `${color}${text}${ANSI.reset}`;
};

const ellipsize = ({
  text,
  maxLength = 120,
}: {
  text: string;
  maxLength?: number;
}): string => {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`;
};

const trimToSingleLine = ({ text }: { text: string }): string => {
  return text.replace(/\s+/g, " ").trim();
};

const toDisplayPath = ({
  value,
  cwd,
}: {
  value: string;
  cwd?: string;
}): string => {
  if (!cwd) {
    return ellipsize({ text: value });
  }

  const normalizedCwd = cwd.endsWith("/") ? cwd : `${cwd}/`;
  if (value === cwd) {
    return ".";
  }

  if (value.startsWith(normalizedCwd)) {
    return ellipsize({ text: value.slice(normalizedCwd.length) });
  }

  if (value.startsWith("/")) {
    return ellipsize({ text: basename(value) });
  }

  return ellipsize({ text: value });
};

const quote = ({ text }: { text: string }): string => {
  return JSON.stringify(ellipsize({ text: trimToSingleLine({ text }) }));
};

const countNonEmptyLines = ({ text }: { text: string }): number => {
  const trimmed = text.replace(/\n+$/, "");
  if (!trimmed) {
    return 0;
  }

  return trimmed.split(/\r?\n/).length;
};

const collectText = ({ value }: { value: unknown }): string[] => {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectText({ value: item }));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const texts: string[] = [];

  if (typeof record.text === "string") {
    texts.push(record.text);
  }

  if (Array.isArray(record.content)) {
    texts.push(
      ...record.content.flatMap((item) => collectText({ value: item })),
    );
  }

  if (typeof record.stdout === "string") {
    texts.push(record.stdout);
  }

  if (typeof record.stderr === "string") {
    texts.push(record.stderr);
  }

  if (typeof record.message === "string") {
    texts.push(record.message);
  }

  if (typeof record.error === "string") {
    texts.push(record.error);
  }

  return texts;
};

const getFirstString = ({
  values,
}: {
  values: Array<string | undefined>;
}): string | null => {
  return (
    values.find((value) => typeof value === "string" && value.length > 0) ??
    null
  );
};

const pluralize = ({
  count,
  singular,
  plural,
}: {
  count: number;
  singular: string;
  plural: string;
}): string => {
  return count === 1 ? singular : plural;
};

const getResultText = ({ result }: { result: unknown }): string => {
  return collectText({ value: result }).join("\n").trim();
};

const getErrorText = ({
  result,
  fallback,
}: {
  result: unknown;
  fallback?: string;
}): string => {
  const text = getFirstString({
    values: [getResultText({ result }), fallback],
  });

  return ellipsize({
    text: trimToSingleLine({ text: text ?? "Tool execution failed" }),
  });
};

const getPathArg = ({
  args,
  keys,
  cwd,
}: {
  args?: Record<string, unknown>;
  keys: string[];
  cwd?: string;
}): string | null => {
  for (const key of keys) {
    const value = args?.[key];
    if (typeof value === "string" && value.length > 0) {
      return toDisplayPath({ value, cwd });
    }
  }

  return null;
};

const isAbsolutePath = ({ value }: { value: string }): boolean => {
  return value.startsWith("/");
};

const isPathInsideCwd = ({
  value,
  cwd,
}: {
  value: string;
  cwd?: string;
}): boolean => {
  if (!cwd) {
    return false;
  }

  const normalizedCwd = cwd.endsWith("/") ? cwd : `${cwd}/`;
  return value === cwd || value.startsWith(normalizedCwd);
};

const getToolLabel = ({
  toolName,
  args,
  cwd,
}: {
  toolName?: string;
  args?: Record<string, unknown>;
  cwd?: string;
}): string => {
  const name = toolName ?? "tool";

  if (name === "read") {
    const path = getPathArg({ args, keys: ["path"], cwd }) ?? "file";
    const rawPath = typeof args?.path === "string" ? args.path : undefined;
    const pathColor =
      rawPath &&
      isAbsolutePath({ value: rawPath }) &&
      !isPathInsideCwd({ value: rawPath, cwd })
        ? ANSI.cyan
        : ANSI.yellow;
    return `Read ${colorize({ text: path, color: pathColor })}`;
  }

  if (name === "grep") {
    const query =
      getFirstString({
        values: [
          typeof args?.query === "string"
            ? quote({ text: args.query })
            : undefined,
          typeof args?.pattern === "string"
            ? quote({ text: args.pattern })
            : undefined,
          typeof args?.regex === "string"
            ? quote({ text: args.regex })
            : undefined,
          typeof args?.value === "string"
            ? quote({ text: args.value })
            : undefined,
        ],
      }) ?? '"pattern"';
    const scope = getPathArg({
      args,
      keys: ["path", "include", "includePattern", "cwd"],
      cwd,
    });

    return scope ? `Grep ${query} in ${scope}` : `Grep ${query}`;
  }

  if (name === "find" || name === "glob") {
    const pattern =
      getFirstString({
        values: [
          typeof args?.pattern === "string"
            ? quote({ text: args.pattern })
            : undefined,
          typeof args?.query === "string"
            ? quote({ text: args.query })
            : undefined,
        ],
      }) ?? '"*"';
    const scope = getPathArg({ args, keys: ["path", "cwd"], cwd });

    return scope ? `Glob ${pattern} in ${scope}` : `Glob ${pattern}`;
  }

  if (name === "ls" || name === "list_directory") {
    const path = getPathArg({ args, keys: ["path", "cwd"], cwd }) ?? ".";
    return `List ${path}`;
  }

  return ellipsize({ text: `${name} tool` });
};

const getToolDetail = ({
  toolName,
  result,
}: {
  toolName?: string;
  result: unknown;
}): string => {
  const resultText = getResultText({ result });
  const lineCount = countNonEmptyLines({ text: resultText });

  if (toolName === "read") {
    return `${lineCount} ${pluralize({ count: lineCount, singular: "line", plural: "lines" })} read`;
  }

  if (toolName === "grep") {
    return `${lineCount} ${pluralize({ count: lineCount, singular: "line", plural: "lines" })} found`;
  }

  if (
    toolName === "find" ||
    toolName === "glob" ||
    toolName === "ls" ||
    toolName === "list_directory"
  ) {
    return `${lineCount} ${pluralize({ count: lineCount, singular: "file", plural: "files" })} found`;
  }

  if (resultText.length > 0) {
    return ellipsize({ text: trimToSingleLine({ text: resultText }) });
  }

  return "Completed";
};

const formatToolEvent = ({
  label,
  detail,
  isError,
}: {
  label: string;
  detail: string;
  isError: boolean;
}): string => {
  const bullet = colorize({
    text: "●",
    color: isError ? ANSI.red : ANSI.green,
  });

  return `${bullet} ${label}\n${ANSI.dim}  └${ANSI.reset} ${detail}\n`;
};

const formatBlockWithGuides = ({
  header,
  lines,
  bulletColor,
  contentColor = ANSI.gray,
}: {
  header: string;
  lines: string[];
  bulletColor: string;
  contentColor?: string;
}): string => {
  const nonEmptyLines = lines.flatMap((line) =>
    line.split(/\r?\n/).map((part) => part.replace(/\r/g, "")),
  );

  if (nonEmptyLines.length === 0) {
    return `${colorize({ text: "●", color: bulletColor })} ${header}\n`;
  }

  const formattedLines = nonEmptyLines.map((line, index) => {
    const guide = index === nonEmptyLines.length - 1 ? "└" : "│";
    return `${ANSI.gray}  ${guide}${ANSI.reset} ${colorize({
      text: line,
      color: contentColor,
    })}`;
  });

  return [
    `${colorize({ text: "●", color: bulletColor })} ${header}`,
    ...formattedLines,
    "",
  ].join("\n");
};

const formatInfoLine = ({
  text,
  color = ANSI.cyan,
}: {
  text: string;
  color?: string;
}): string => {
  return `${colorize({ text: "○", color })} ${ellipsize({ text })}\n`;
};

const isPiConsoleMessageArray = (
  value: unknown,
): value is PiConsoleMessage[] => {
  return Array.isArray(value);
};

const isPiConsoleContentItemArray = (
  value: unknown,
): value is PiConsoleContentItem[] => {
  return Array.isArray(value);
};

const getEventMessages = ({
  event,
}: {
  event: PiConsoleEvent;
}): PiConsoleMessage[] => {
  const messages = isPiConsoleMessageArray(event.messages)
    ? event.messages
    : [];

  return [
    ...messages,
    ...(event.assistantMessageEvent?.partial
      ? [event.assistantMessageEvent.partial]
      : []),
    ...(event.message ? [event.message] : []),
  ];
};

const mergeToolArgs = ({
  baseArgs,
  nextArgs,
}: {
  baseArgs?: Record<string, unknown>;
  nextArgs?: Record<string, unknown>;
}): Record<string, unknown> | undefined => {
  if (!baseArgs && !nextArgs) {
    return undefined;
  }

  return {
    ...(baseArgs ?? {}),
    ...(nextArgs ?? {}),
  };
};

const getToolCallArgsFromPartial = ({
  partialArgs,
}: {
  partialArgs?: string;
}): Record<string, unknown> | undefined => {
  if (typeof partialArgs !== "string" || partialArgs.length === 0) {
    return undefined;
  }

  const parsed = tryParseJson<Record<string, unknown>>({ text: partialArgs });
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }

  return parsed;
};

const updatePendingToolCallsFromMessages = ({
  pendingToolCalls,
  messages,
}: {
  pendingToolCalls: Map<string, PendingToolCall>;
  messages: PiConsoleMessage[];
}): void => {
  for (const message of messages) {
    if (!isPiConsoleContentItemArray(message.content)) {
      continue;
    }

    for (const item of message.content) {
      if (item.type !== "toolCall" || typeof item.id !== "string") {
        continue;
      }

      const cachedToolCall = pendingToolCalls.get(item.id);
      const argsFromPartial = getToolCallArgsFromPartial({
        partialArgs: item.partialArgs,
      });

      pendingToolCalls.set(item.id, {
        toolName: item.name ?? cachedToolCall?.toolName,
        args: mergeToolArgs({
          baseArgs: mergeToolArgs({
            baseArgs: cachedToolCall?.args,
            nextArgs: item.arguments,
          }),
          nextArgs: argsFromPartial,
        }),
      });
    }
  }
};

const getAssistantTextFromMessages = ({
  messages,
}: {
  messages?: PiConsoleMessage[];
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

  if (!isPiConsoleContentItemArray(assistantMessage.content)) {
    return "";
  }

  const content = assistantMessage.content;

  return content
    .filter((item) => item.type === "text")
    .map((item) => item.text ?? "")
    .join("")
    .trim();
};

const getAssistantThinkingFromMessages = ({
  messages,
}: {
  messages?: PiConsoleMessage[];
}): string => {
  const assistantMessage = [...(messages ?? [])]
    .reverse()
    .find((message) => message.role === "assistant");

  if (
    !assistantMessage?.content ||
    typeof assistantMessage.content === "string"
  ) {
    return "";
  }

  return assistantMessage.content
    .flatMap((item) => {
      const parts: string[] = [];

      if (typeof item.thinking === "string") {
        parts.push(item.thinking);
      }

      if (item.type === "thinking" && typeof item.text === "string") {
        parts.push(item.text);
      }

      return parts;
    })
    .join("\n")
    .trim();
};

const getAssistantTextDelta = ({
  nextText,
  previousText,
}: {
  nextText: string;
  previousText: string;
}): string => {
  if (!nextText || nextText.includes("[COPILOT_JSON")) {
    return "";
  }

  if (!previousText) {
    return nextText.trim();
  }

  if (nextText === previousText) {
    return "";
  }

  if (nextText.startsWith(previousText)) {
    return nextText.slice(previousText.length).trim();
  }

  return nextText.trim();
};

const normalizeAssistantText = ({ text }: { text: string }): string => {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
};

const isTextAssistantEventType = ({ type }: { type?: string }): boolean => {
  return /^text_/.test(type ?? "");
};

const shouldRenderAssistantText = ({
  event,
}: {
  event: PiConsoleEvent;
}): boolean => {
  const partialEventType = event.assistantMessageEvent?.type;

  if (!partialEventType) {
    return true;
  }

  return !/^(thinking|toolcall|text)_/.test(partialEventType);
};

const formatAssistantText = ({ text }: { text: string }): string => {
  const normalized = normalizeAssistantText({ text });

  if (!normalized) {
    return "";
  }

  return formatBlockWithGuides({
    header: "Message:",
    lines: normalized.split(/\r?\n/),
    bulletColor: ANSI.magenta,
    contentColor: ANSI.gray,
  });
};

const formatAssistantThinking = ({
  thinking,
}: {
  thinking: string;
}): string => {
  return formatBlockWithGuides({
    header: "Thinking:",
    lines: thinking.split(/\r?\n/),
    bulletColor: ANSI.yellow,
    contentColor: ANSI.gray,
  });
};

const formatUsage = ({
  usage,
}: {
  usage: ReturnType<typeof getPiUsage>;
}): string => {
  if (!usage) {
    return "";
  }

  const lines = [
    usage.input !== undefined ? `Input tokens: ${usage.input}` : undefined,
    usage.output !== undefined ? `Output tokens: ${usage.output}` : undefined,
    usage.cacheRead !== undefined
      ? `Cache read tokens: ${usage.cacheRead}`
      : undefined,
    usage.cacheWrite !== undefined
      ? `Cache write tokens: ${usage.cacheWrite}`
      : undefined,
    usage.totalTokens !== undefined
      ? `Total tokens: ${usage.totalTokens}`
      : undefined,
    usage.cost?.input !== undefined
      ? `Input cost: ${usage.cost.input}`
      : undefined,
    usage.cost?.output !== undefined
      ? `Output cost: ${usage.cost.output}`
      : undefined,
    usage.cost?.cacheRead !== undefined
      ? `Cache read cost: ${usage.cost.cacheRead}`
      : undefined,
    usage.cost?.cacheWrite !== undefined
      ? `Cache write cost: ${usage.cost.cacheWrite}`
      : undefined,
    usage.cost?.total !== undefined
      ? `Total cost: ${usage.cost.total}`
      : undefined,
  ].filter((line): line is string => Boolean(line));

  if (lines.length === 0) {
    return "";
  }

  return formatBlockWithGuides({
    header: "Usage:",
    lines,
    bulletColor: ANSI.cyan,
    contentColor: ANSI.gray,
  });
};

const getBashCommandText = ({
  args,
}: {
  args?: Record<string, unknown>;
}): string => {
  const command =
    typeof args?.command === "string"
      ? args.command
      : typeof args?.cmd === "string"
        ? args.cmd
        : "bash";

  const extraArgs = Array.isArray(args?.args)
    ? args.args.filter((arg): arg is string => typeof arg === "string")
    : [];

  return [command, ...extraArgs].join(" ").trim();
};

const formatBashToolEvent = ({
  args,
  result,
  isError,
  fallback,
}: {
  args?: Record<string, unknown>;
  result: unknown;
  isError: boolean;
  fallback?: string;
}): string => {
  const statusText = isError ? "[Fail]" : "[Success]";
  const statusColor = isError ? ANSI.red : ANSI.green;
  const message = isError
    ? getErrorText({ result, fallback })
    : getResultText({ result }) || "Completed";

  return formatBlockWithGuides({
    header: `${colorize({ text: "Bash Tool:", color: statusColor })}`,
    lines: [
      getBashCommandText({ args }),
      `${colorize({ text: statusText, color: statusColor })} ${trimToSingleLine({ text: message })}`,
    ],
    bulletColor: statusColor,
    contentColor: ANSI.gray,
  });
};

export const createPiMessageFormatter = (): {
  formatLine: ({ line }: { line: string }) => string;
} => {
  let cwd: string | undefined;
  const pendingToolCalls = new Map<string, PendingToolCall>();
  let lastAssistantText = "";
  let lastAssistantThinking = "";
  let lastUsageFingerprint = "";
  let pendingAssistantMessage = "";

  const flushPendingAssistantMessage = (): string => {
    if (pendingAssistantMessage.length === 0) {
      return "";
    }

    const nextMessage = pendingAssistantMessage;
    pendingAssistantMessage = "";
    lastAssistantText = normalizeAssistantText({ text: nextMessage });
    return formatAssistantText({ text: nextMessage });
  };

  const getUsageOutput = ({ event }: { event: PiConsoleEvent }): string => {
    const usage = getPiUsage({ event });

    if (!usage) {
      return "";
    }

    const nextFingerprint = JSON.stringify(usage);
    if (nextFingerprint === lastUsageFingerprint) {
      return "";
    }

    lastUsageFingerprint = nextFingerprint;
    return formatUsage({ usage });
  };

  const formatLine = ({ line }: { line: string }): string => {
    if (!line.trim()) {
      return "";
    }

    const event = tryParseJson<PiConsoleEvent>({ text: line });
    if (event === null) {
      return `${ellipsize({ text: trimToSingleLine({ text: line }) })}\n`;
    }

    updatePendingToolCallsFromMessages({
      pendingToolCalls,
      messages: getEventMessages({ event }),
    });

    const partialEventType = event.assistantMessageEvent?.type;
    const bufferedMessageOutput =
      pendingAssistantMessage.length > 0 &&
      ((!partialEventType &&
        (event.type === "message_end" || event.type === "agent_end")) ||
        (partialEventType !== undefined &&
          !isTextAssistantEventType({ type: partialEventType })))
        ? flushPendingAssistantMessage()
        : "";

    if (event.type === "session") {
      cwd = event.cwd;
      const location = event.cwd
        ? ` in ${toDisplayPath({ value: event.cwd, cwd: event.cwd })}`
        : "";
      return `${bufferedMessageOutput}${formatInfoLine({ text: `Pi session started${location}` })}`;
    }

    if (event.type === "agent_start") {
      return `${bufferedMessageOutput}${formatInfoLine({ text: "Agent started" })}`;
    }

    if (event.type === "agent_end") {
      lastAssistantText = getAssistantTextFromMessages({
        messages: getEventMessages({ event }),
      });
      lastAssistantThinking = getAssistantThinkingFromMessages({
        messages: getEventMessages({ event }),
      });
      return `${bufferedMessageOutput}${formatInfoLine({ text: "Agent finished" })}${getUsageOutput({ event })}`;
    }

    if (isTextAssistantEventType({ type: partialEventType })) {
      if (partialEventType === "text_start") {
        pendingAssistantMessage = "";
        return bufferedMessageOutput;
      }

      if (
        partialEventType === "text_delta" &&
        typeof event.assistantMessageEvent?.delta === "string"
      ) {
        pendingAssistantMessage += event.assistantMessageEvent.delta;
        return bufferedMessageOutput;
      }

      if (partialEventType === "text_end") {
        if (typeof event.assistantMessageEvent?.content === "string") {
          pendingAssistantMessage = event.assistantMessageEvent.content;
        }

        return `${bufferedMessageOutput}${flushPendingAssistantMessage()}`;
      }
    }

    if (event.type === "message_end") {
      const thinking = getAssistantThinkingFromMessages({
        messages: getEventMessages({ event }),
      });
      const usageOutput = getUsageOutput({ event });

      if (!thinking || thinking === lastAssistantThinking) {
        return `${bufferedMessageOutput}${usageOutput}`;
      }

      lastAssistantThinking = thinking;
      return `${bufferedMessageOutput}${formatAssistantThinking({
        thinking,
      })}${usageOutput}`;
    }

    if (event.type === "compaction_start") {
      return `${bufferedMessageOutput}${formatInfoLine({
        text: `Context compaction started${event.reason ? ` (${event.reason})` : ""}`,
        color: ANSI.yellow,
      })}`;
    }

    if (event.type === "compaction_end") {
      const status = event.errorMessage
        ? `failed: ${ellipsize({ text: trimToSingleLine({ text: event.errorMessage }) })}`
        : event.aborted
          ? "aborted"
          : "finished";
      const retryText = event.willRetry ? " and will retry" : "";

      return `${bufferedMessageOutput}${formatInfoLine({
        text: `Context compaction ${status}${retryText}`,
        color: event.errorMessage ? ANSI.red : ANSI.yellow,
      })}`;
    }

    if (event.type === "auto_retry_start") {
      const errorText = event.errorMessage
        ? `: ${ellipsize({ text: trimToSingleLine({ text: event.errorMessage }) })}`
        : "";
      return `${bufferedMessageOutput}${formatInfoLine({
        text: `Retry ${event.attempt ?? "?"}/${event.maxAttempts ?? "?"} in ${event.delayMs ?? 0}ms${errorText}`,
        color: ANSI.yellow,
      })}`;
    }

    if (event.type === "auto_retry_end") {
      const finalError = event.finalError
        ? `: ${ellipsize({ text: trimToSingleLine({ text: event.finalError }) })}`
        : "";
      return `${bufferedMessageOutput}${formatInfoLine({
        text: `Retry ${event.attempt ?? "?"} ${event.finalError ? `failed${finalError}` : "succeeded"}`,
        color: event.finalError ? ANSI.red : ANSI.green,
      })}`;
    }

    if (event.type === "tool_execution_start") {
      if (event.toolCallId) {
        const cachedToolCall = pendingToolCalls.get(event.toolCallId);
        pendingToolCalls.set(event.toolCallId, {
          toolName: event.toolName ?? cachedToolCall?.toolName,
          args: mergeToolArgs({
            baseArgs: cachedToolCall?.args,
            nextArgs: event.args,
          }),
        });
      }

      return bufferedMessageOutput;
    }

    if (event.type === "tool_execution_update") {
      return bufferedMessageOutput;
    }

    if (event.type === "tool_execution_end") {
      const pendingTool = event.toolCallId
        ? pendingToolCalls.get(event.toolCallId)
        : undefined;

      if (event.toolCallId) {
        pendingToolCalls.delete(event.toolCallId);
      }

      const toolName = pendingTool?.toolName ?? event.toolName;
      const args = pendingTool?.args ?? event.args;

      if (toolName === "bash") {
        return formatBashToolEvent({
          args,
          result: event.result,
          isError: Boolean(event.isError),
          fallback: event.finalError,
        });
      }

      const label = getToolLabel({ toolName, args, cwd });
      const detail = event.isError
        ? getErrorText({ result: event.result, fallback: event.finalError })
        : getToolDetail({ toolName, result: event.result });

      return `${bufferedMessageOutput}${formatToolEvent({
        label,
        detail,
        isError: Boolean(event.isError),
      })}`;
    }

    if (shouldRenderAssistantText({ event })) {
      const assistantText = getAssistantTextFromMessages({
        messages: getEventMessages({ event }),
      });
      const assistantTextDelta = getAssistantTextDelta({
        nextText: assistantText,
        previousText: lastAssistantText,
      });

      if (assistantTextDelta) {
        lastAssistantText = assistantText;
        return `${bufferedMessageOutput}${formatAssistantText({
          text: assistantTextDelta,
        })}`;
      }
    }

    return bufferedMessageOutput;
  };

  return {
    formatLine,
  };
};
