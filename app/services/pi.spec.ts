import { afterEach, describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import {
  REVIEW_RESPONSE_JSON_END_MARKER,
  REVIEW_RESPONSE_JSON_START_MARKER,
} from "../constants";

process.env.GITLAB_TOKEN ??= "test-gitlab-token";
process.env.CI_SERVER_URL ??= "https://gitlab.example.com";
process.env.CI_PROJECT_ID ??= "1";
process.env.CI_MERGE_REQUEST_IID ??= "1";

const loggerMock = {
  debug: (..._args: unknown[]) => {},
  error: (..._args: unknown[]) => {},
  info: (..._args: unknown[]) => {},
  start: (..._args: unknown[]) => {},
  success: (..._args: unknown[]) => {},
  warn: (..._args: unknown[]) => {},
};

const writeLogStreamMock = (_text: string) => {};

const validReviewResponseJson = JSON.stringify({
  readableModelName: "GPT-5.4",
  summary: {
    walkthrough: {
      en: "ok",
    },
    changes: [],
    otherSuggestions: {},
  },
  reviews: [],
});

type MockChildProcess = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
};

const createMockChildProcess = (): MockChildProcess => {
  const child = new EventEmitter() as MockChildProcess;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
};

let nextChildFactory = (): MockChildProcess => createMockChildProcess();

mock.module("./logger", () => ({
  logger: loggerMock,
  writeLogStream: writeLogStreamMock,
}));

mock.module("../utils/argv", () => ({
  argv: {
    agent: "pi",
    "agent-args": undefined,
    "agent-bin": undefined,
    "collect-runtime-stats": false,
    model: "gpt-5.4",
    tools: [],
    "max-stdout-size": 1024 * 1024,
  },
}));

mock.module("node:child_process", () => ({
  execSync: () => "test-commit\n",
  spawn: () => nextChildFactory(),
  spawnSync: () => ({
    status: 0,
    stdout: "",
    stderr: "",
  }),
}));

const { argv } = await import("../utils/argv");
const { runPiReview } = await import(`./pi?test=${Date.now()}`);

afterEach(() => {
  mock.restore();
  mock.clearAllMocks();
  nextChildFactory = (): MockChildProcess => createMockChildProcess();
});

describe("runPiReview", () => {
  test("returns the exact parse error when agent_end.messages is malformed", async () => {
    const child = createMockChildProcess();
    nextChildFactory = () => child;

    const reviewPromise = runPiReview({
      prompt: "review this diff",
    });

    child.emit("spawn");
    child.stdout.emit(
      "data",
      Buffer.from(
        `${JSON.stringify({
          type: "agent_end",
          messages: {
            role: "assistant",
            content: `${REVIEW_RESPONSE_JSON_START_MARKER}${validReviewResponseJson}${REVIEW_RESPONSE_JSON_END_MARKER}`,
          },
        })}\n`,
      ),
    );
    child.emit("close", 0);

    const result = await reviewPromise;

    expect(result.reviews).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]).toBe(
      "[Pi] Pi JSON mode: failed to parse PI output after process exit: Invalid agent_end payload: messages must be an array when present",
    );
  });

  test("accepts singular agent_end.message payloads", async () => {
    const child = createMockChildProcess();
    nextChildFactory = () => child;

    const reviewPromise = runPiReview({
      prompt: "review this diff",
    });

    child.emit("spawn");
    child.stdout.emit(
      "data",
      Buffer.from(
        `${JSON.stringify({
          type: "agent_end",
          message: {
            role: "assistant",
            content: `${REVIEW_RESPONSE_JSON_START_MARKER}${validReviewResponseJson}${REVIEW_RESPONSE_JSON_END_MARKER}`,
          },
        })}\n`,
      ),
    );
    child.emit("close", 0);

    const result = await reviewPromise;

    expect(result.errors).toBeUndefined();
    expect(result.summary.walkthrough.en).toBe("ok");
    expect(result.reviews).toEqual([]);
  });

  test("prefers incrementally captured marked JSON when agent_end text is truncated", async () => {
    const child = createMockChildProcess();
    nextChildFactory = () => child;

    const reviewPromise = runPiReview({
      prompt: "review this diff",
    });

    const markedJson = `${REVIEW_RESPONSE_JSON_START_MARKER}${validReviewResponseJson}${REVIEW_RESPONSE_JSON_END_MARKER}`;

    child.emit("spawn");
    child.stdout.emit(
      "data",
      Buffer.from(
        `${JSON.stringify({
          type: "message_update",
          assistantMessageEvent: {
            type: "text_start",
          },
        })}\n${JSON.stringify({
          type: "message_update",
          assistantMessageEvent: {
            type: "text_delta",
            delta: markedJson.slice(0, 20),
          },
        })}\n${JSON.stringify({
          type: "message_update",
          assistantMessageEvent: {
            type: "text_delta",
            delta: markedJson.slice(20),
          },
        })}\n${JSON.stringify({
          type: "message_end",
          message: {
            role: "assistant",
            content: markedJson,
          },
        })}\n${JSON.stringify({
          type: "agent_end",
          message: {
            role: "assistant",
            content: `${REVIEW_RESPONSE_JSON_START_MARKER}${validReviewResponseJson}`,
          },
        })}\n`,
      ),
    );
    child.emit("close", 0);

    const result = await reviewPromise;

    expect(result.errors).toBeUndefined();
    expect(result.summary.walkthrough.en).toBe("ok");
    expect(result.reviews).toEqual([]);
  });

  test("marks the review response as critical when the agent writes to stderr", async () => {
    const child = createMockChildProcess();
    nextChildFactory = () => child;

    const reviewPromise = runPiReview({
      prompt: "review this diff",
    });

    child.emit("spawn");
    child.stderr.emit("data", Buffer.from("fatal provider error\n"));
    child.stdout.emit(
      "data",
      Buffer.from(
        `${JSON.stringify({
          type: "agent_end",
          message: {
            role: "assistant",
            content: `${REVIEW_RESPONSE_JSON_START_MARKER}${validReviewResponseJson}${REVIEW_RESPONSE_JSON_END_MARKER}`,
          },
        })}\n`,
      ),
    );
    child.emit("close", 0);

    const result = await reviewPromise;

    expect(result.withCriticalError).toBe(true);
  });

  test("captures marked JSON from text_end content without relying on text_delta", async () => {
    const child = createMockChildProcess();
    nextChildFactory = () => child;

    const reviewPromise = runPiReview({
      prompt: "review this diff",
    });

    const markedJson = `${REVIEW_RESPONSE_JSON_START_MARKER}${validReviewResponseJson}${REVIEW_RESPONSE_JSON_END_MARKER}`;

    child.emit("spawn");
    child.stdout.emit(
      "data",
      Buffer.from(
        `${JSON.stringify({
          type: "message_update",
          assistantMessageEvent: {
            type: "text_start",
          },
        })}\n${JSON.stringify({
          type: "message_update",
          assistantMessageEvent: {
            type: "text_end",
            content: markedJson,
          },
        })}\n${JSON.stringify({
          type: "agent_end",
          message: {
            role: "assistant",
            content: "truncated",
          },
        })}\n`,
      ),
    );
    child.emit("close", 0);

    const result = await reviewPromise;

    expect(result.errors).toBeUndefined();
    expect(result.summary.walkthrough.en).toBe("ok");
    expect(result.reviews).toEqual([]);
  });

  test("warns and stops printing agent stdout once the safety threshold is reached", async () => {
    const child = createMockChildProcess();
    const stdoutWriteCalls: string[] = [];
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    const originalWarn = loggerMock.warn;
    const originalMaxStdoutSize = argv["max-stdout-size"];
    const warnCalls: string[] = [];

    nextChildFactory = () => child;
    argv["max-stdout-size"] = 20;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdoutWriteCalls.push(
        typeof chunk === "string" ? chunk : Buffer.from(chunk).toString(),
      );
      return true;
    }) as typeof process.stdout.write;
    loggerMock.warn = (...args: unknown[]) => {
      warnCalls.push(args.map((arg) => String(arg)).join(" "));
    };

    try {
      const reviewPromise = runPiReview({
        prompt: "review this diff",
      });
      const largeAssistantContent = `${REVIEW_RESPONSE_JSON_START_MARKER}${validReviewResponseJson}${REVIEW_RESPONSE_JSON_END_MARKER}${"a".repeat(1024 * 1024)}`;

      child.emit("spawn");
      child.stdout.emit(
        "data",
        Buffer.from(
          `${JSON.stringify({
            type: "agent_end",
            message: {
              role: "assistant",
              content: largeAssistantContent,
            },
          })}\n`,
        ),
      );
      child.emit("close", 0);

      const result = await reviewPromise;

      expect(result.errors).toBeUndefined();
      expect(result.summary.walkthrough.en).toBe("ok");
      expect(stdoutWriteCalls).toEqual([]);
      expect(warnCalls).toHaveLength(1);
      expect(warnCalls[0]).toContain("20% safety margin");
      expect(warnCalls[0]).toContain(
        "Suppressing further agent stdout printing",
      );
    } finally {
      argv["max-stdout-size"] = originalMaxStdoutSize;
      process.stdout.write = originalStdoutWrite;
      loggerMock.warn = originalWarn;
    }
  });

  test("computes the stdout limit from formatted PI console output instead of raw JSON", async () => {
    const child = createMockChildProcess();
    const stdoutWriteCalls: string[] = [];
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    const originalWarn = loggerMock.warn;
    const originalMaxStdoutSize = argv["max-stdout-size"];
    const warnCalls: string[] = [];

    nextChildFactory = () => child;
    argv["max-stdout-size"] = 100;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdoutWriteCalls.push(
        typeof chunk === "string" ? chunk : Buffer.from(chunk).toString(),
      );
      return true;
    }) as typeof process.stdout.write;
    loggerMock.warn = (...args: unknown[]) => {
      warnCalls.push(args.map((arg) => String(arg)).join(" "));
    };

    try {
      const reviewPromise = runPiReview({
        prompt: "review this diff",
      });

      child.emit("spawn");
      child.stdout.emit(
        "data",
        Buffer.from(
          `${JSON.stringify({
            type: "agent_end",
            message: {
              role: "assistant",
              content: `${REVIEW_RESPONSE_JSON_START_MARKER}${validReviewResponseJson}${REVIEW_RESPONSE_JSON_END_MARKER}${"a".repeat(1024 * 1024)}`,
            },
          })}\n`,
        ),
      );
      child.emit("close", 0);

      const result = await reviewPromise;

      expect(result.errors).toBeUndefined();
      expect(result.summary.walkthrough.en).toBe("ok");
      expect(stdoutWriteCalls.length).toBeGreaterThan(0);
      expect(warnCalls).toHaveLength(0);
    } finally {
      argv["max-stdout-size"] = originalMaxStdoutSize;
      process.stdout.write = originalStdoutWrite;
      loggerMock.warn = originalWarn;
    }
  });
});
