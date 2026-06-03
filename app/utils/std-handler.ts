type MarkedJsonCaptureState = {
  buffer: string;
  capturedParts: string[];
  markedJson: string | null;
  isCapturing: boolean;
};

const MAX_RECENT_OUTPUT_LINES = 20;

export const createMarkedJsonCaptureState = (): MarkedJsonCaptureState => {
  return {
    buffer: "",
    capturedParts: [],
    markedJson: null,
    isCapturing: false,
  };
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

export type { MarkedJsonCaptureState };
