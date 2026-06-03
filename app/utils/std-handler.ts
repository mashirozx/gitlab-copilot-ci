import { argv } from "./argv";

type MarkedJsonCaptureState = {
  buffer: string;
  capturedParts: string[];
  markedJson: string | null;
  isCapturing: boolean;
};

type StdoutPrintBudgetState = {
  totalBytes: number;
  isSuppressed: boolean;
};

const MAX_RECENT_OUTPUT_LINES = 20;
export const STDOUT_PRINT_HEADROOM_MB = 10;
const BYTES_PER_MB = 1024 * 1024;

const getStdoutPrintBudgetMb = (): number => {
  return Math.max(argv["max-stdout-size"] - STDOUT_PRINT_HEADROOM_MB, 0);
};

export const createMarkedJsonCaptureState = (): MarkedJsonCaptureState => {
  return {
    buffer: "",
    capturedParts: [],
    markedJson: null,
    isCapturing: false,
  };
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

  const printLimitBytes = getStdoutPrintBudgetMb() * BYTES_PER_MB;

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
  const maxStdoutSizeMb = argv["max-stdout-size"];
  const printBudgetMb = getStdoutPrintBudgetMb();

  return `[${agentName}] Agent stdout reached ${printBudgetMb}MB of console print budget (${maxStdoutSizeMb}MB GitLab CI job log limit minus ${STDOUT_PRINT_HEADROOM_MB}MB safety margin, clamped at 0MB). Suppressing further agent stdout printing to avoid GitLab CI job log truncation.`;
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

export const consumeMarkedJsonChunk = ({
  state,
  text,
  startMarker,
  endMarker,
}: {
  state: MarkedJsonCaptureState;
  text: string;
  startMarker: string;
  endMarker: string;
}): void => {
  if (state.markedJson !== null) {
    return;
  }

  state.buffer += text;

  while (state.buffer.length > 0) {
    if (!state.isCapturing) {
      const startIndex = state.buffer.indexOf(startMarker);

      if (startIndex === -1) {
        const keepLength = Math.max(startMarker.length - 1, 0);
        state.buffer = state.buffer.slice(-keepLength);
        return;
      }

      state.isCapturing = true;
      state.buffer = state.buffer.slice(startIndex + startMarker.length);
    }

    const endIndex = state.buffer.indexOf(endMarker);

    if (endIndex !== -1) {
      state.capturedParts.push(state.buffer.slice(0, endIndex));
      state.markedJson = state.capturedParts.join("").trim();
      state.buffer = "";
      state.capturedParts = [];
      state.isCapturing = false;
      return;
    }

    const keepLength = Math.max(endMarker.length - 1, 0);

    if (state.buffer.length <= keepLength) {
      return;
    }

    state.capturedParts.push(
      state.buffer.slice(0, state.buffer.length - keepLength),
    );
    state.buffer = state.buffer.slice(-keepLength);
  }
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

export type { MarkedJsonCaptureState, StdoutPrintBudgetState };
