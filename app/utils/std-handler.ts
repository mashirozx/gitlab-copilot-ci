import { argv } from "./argv";
import {
  formatStdoutSize,
  getStdoutPrintBudgetBytes,
  STDOUT_PRINT_SAFETY_MARGIN_RATIO,
} from "./stdout-size";

type StdoutPrintBudgetState = {
  totalBytes: number;
  isSuppressed: boolean;
};

const MAX_RECENT_OUTPUT_LINES = 20;
const getStdoutPrintBudgetBytesFromArgv = (): number => {
  return getStdoutPrintBudgetBytes({
    maxStdoutSizeBytes: argv["max-stdout-size"],
  });
};

export const createStdoutPrintBudgetState = (): StdoutPrintBudgetState => {
  return {
    totalBytes: 0,
    isSuppressed: false,
  };
};

export const consumeStdoutPrintBudget = ({
  state,
  text,
}: {
  state: StdoutPrintBudgetState;
  text: string;
}): {
  shouldPrint: boolean;
  warningReachedLimit: boolean;
} => {
  const chunkBytes = Buffer.byteLength(text);
  state.totalBytes += chunkBytes;

  if (state.isSuppressed) {
    return {
      shouldPrint: false,
      warningReachedLimit: false,
    };
  }

  const printLimitBytes = getStdoutPrintBudgetBytesFromArgv();

  if (state.totalBytes >= printLimitBytes) {
    state.isSuppressed = true;
    return {
      shouldPrint: false,
      warningReachedLimit: true,
    };
  }

  return {
    shouldPrint: true,
    warningReachedLimit: false,
  };
};

export const getStdoutPrintSuppressedWarning = ({
  agentName,
}: {
  agentName: string;
}): string => {
  const maxStdoutSizeBytes = argv["max-stdout-size"];
  const printBudgetBytes = getStdoutPrintBudgetBytesFromArgv();

  return `[${agentName}] Agent stdout reached ${formatStdoutSize({ bytes: printBudgetBytes })} of console print budget (${formatStdoutSize({ bytes: maxStdoutSizeBytes })} GitLab CI job log limit with a ${STDOUT_PRINT_SAFETY_MARGIN_RATIO * 100}% safety margin). Suppressing further agent stdout printing to avoid GitLab CI job log truncation.`;
};

export const appendRecentOutputLine = ({
  tail,
  line,
}: {
  tail: string[];
  line: string;
}): void => {
  tail.push(line);

  if (tail.length > MAX_RECENT_OUTPUT_LINES) {
    tail.splice(0, tail.length - MAX_RECENT_OUTPUT_LINES);
  }
};

export const flushLoggedStreamBuffer = ({
  buffer,
  prefix,
  writeLog,
  consumeLine,
}: {
  buffer: string;
  prefix: string;
  writeLog: (line: string) => void;
  consumeLine?: (line: string) => void;
}): string => {
  const lines = buffer.split(/\r?\n/);
  const trailing = lines.pop() ?? "";

  for (const line of lines) {
    writeLog(`[${prefix}] ${line}`);
    consumeLine?.(line);
  }

  return trailing;
};

export const getRecentProcessOutputText = ({
  stdoutTail,
  stderrTail,
}: {
  stdoutTail: string[];
  stderrTail: string[];
}): string => {
  const lines = [
    ...stdoutTail.map((line) => `[stdout] ${line}`),
    ...stderrTail.map((line) => `[stderr] ${line}`),
  ];

  return lines.join("\n").trim();
};

export type { StdoutPrintBudgetState };
