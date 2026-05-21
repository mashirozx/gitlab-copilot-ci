import { tryParseJson } from "./json";

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
};

type PendingToolCall = {
  toolName?: string;
  args?: Record<string, unknown>;
};

const ANSI = {
  reset: "\u001b[0m",
  dim: "\u001b[2m",
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
    return `Read ${path}`;
  }

  if (name === "grep") {
    const query =
      typeof args?.query === "string"
        ? quote({ text: args.query })
        : '"pattern"';
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

const formatInfoLine = ({
  text,
  color = ANSI.cyan,
}: {
  text: string;
  color?: string;
}): string => {
  return `${colorize({ text: "○", color })} ${ellipsize({ text })}\n`;
};

export const createPiConsoleFormatter = (): {
  formatLine: ({ line }: { line: string }) => string;
} => {
  let cwd: string | undefined;
  const pendingToolCalls = new Map<string, PendingToolCall>();

  const formatLine = ({ line }: { line: string }): string => {
    if (!line.trim()) {
      return "";
    }

    const event = tryParseJson<PiConsoleEvent>({ text: line });
    if (event === null) {
      return `${ellipsize({ text: trimToSingleLine({ text: line }) })}\n`;
    }

    if (event.type === "session") {
      cwd = event.cwd;
      const location = event.cwd
        ? ` in ${toDisplayPath({ value: event.cwd, cwd: event.cwd })}`
        : "";
      return formatInfoLine({ text: `Pi session started${location}` });
    }

    if (event.type === "agent_start") {
      return formatInfoLine({ text: "Agent started" });
    }

    if (event.type === "agent_end") {
      return formatInfoLine({ text: "Agent finished" });
    }

    if (event.type === "compaction_start") {
      return formatInfoLine({
        text: `Context compaction started${event.reason ? ` (${event.reason})` : ""}`,
        color: ANSI.yellow,
      });
    }

    if (event.type === "compaction_end") {
      const status = event.errorMessage
        ? `failed: ${ellipsize({ text: trimToSingleLine({ text: event.errorMessage }) })}`
        : event.aborted
          ? "aborted"
          : "finished";
      const retryText = event.willRetry ? " and will retry" : "";

      return formatInfoLine({
        text: `Context compaction ${status}${retryText}`,
        color: event.errorMessage ? ANSI.red : ANSI.yellow,
      });
    }

    if (event.type === "auto_retry_start") {
      const errorText = event.errorMessage
        ? `: ${ellipsize({ text: trimToSingleLine({ text: event.errorMessage }) })}`
        : "";
      return formatInfoLine({
        text: `Retry ${event.attempt ?? "?"}/${event.maxAttempts ?? "?"} in ${event.delayMs ?? 0}ms${errorText}`,
        color: ANSI.yellow,
      });
    }

    if (event.type === "auto_retry_end") {
      const finalError = event.finalError
        ? `: ${ellipsize({ text: trimToSingleLine({ text: event.finalError }) })}`
        : "";
      return formatInfoLine({
        text: `Retry ${event.attempt ?? "?"} ${event.finalError ? `failed${finalError}` : "succeeded"}`,
        color: event.finalError ? ANSI.red : ANSI.green,
      });
    }

    if (event.type === "tool_execution_start") {
      if (event.toolCallId) {
        pendingToolCalls.set(event.toolCallId, {
          toolName: event.toolName,
          args: event.args,
        });
      }

      return "";
    }

    if (event.type === "tool_execution_update") {
      return "";
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
      const label = getToolLabel({ toolName, args, cwd });
      const detail = event.isError
        ? getErrorText({ result: event.result, fallback: event.finalError })
        : getToolDetail({ toolName, result: event.result });

      return formatToolEvent({
        label,
        detail,
        isError: Boolean(event.isError),
      });
    }

    return "";
  };

  return {
    formatLine,
  };
};
