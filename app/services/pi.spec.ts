import { afterEach, describe, expect, mock, test } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

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
let mockReviewOutput: {
  error: string | null;
  jsonText: string | null;
} = {
  error: null,
  jsonText: validReviewResponseJson,
};

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

mock.module("../utils/review-output-json", () => ({
  readReviewOutputJsonFile: () => mockReviewOutput,
}));

const { argv } = await import("../utils/argv");
const { runPiReview } = await import(`./pi?test=${Date.now()}`);

afterEach(() => {
  mock.restore();
  mock.clearAllMocks();
  nextChildFactory = (): MockChildProcess => createMockChildProcess();
  mockReviewOutput = {
    error: null,
    jsonText: validReviewResponseJson,
  };
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
            content: "assistant content",
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
            content: "assistant content",
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

  test("marks the review response as critical when the agent exits non-zero", async () => {
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
            content: "assistant content",
          },
        })}\n`,
      ),
    );
    child.emit("close", 1);

    const result = await reviewPromise;

    expect(result.withCriticalError).toBe(true);
    expect(result.errors?.[0]).toBe("[Pi] Pi JSON mode exited with code 1");
    expect(result.summary.walkthrough.en).toBeUndefined();
  });

  test("defers process start failures to the close handler", async () => {
    const child = createMockChildProcess();
    nextChildFactory = () => child;

    const reviewPromise = runPiReview({
      prompt: "review this diff",
    });

    child.emit("error", new Error("spawn ENOENT"));
    child.emit("close", 1);

    const result = await reviewPromise;

    expect(result.withCriticalError).toBe(true);
    expect(result.errors?.[0]).toContain(
      "failed to start process: spawn ENOENT",
    );
    expect(result.errors?.[0]).toContain("Exit code: 1");
  });

  test("reads review JSON from shared output path", async () => {
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
            content: "no markers",
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

  test("marks a missing shared output file as a critical failure", async () => {
    const child = createMockChildProcess();
    nextChildFactory = () => child;
    mockReviewOutput = {
      error:
        "failed to read output JSON file at /tmp/output.json: ENOENT: no such file or directory, open '/tmp/output.json'",
      jsonText: null,
    };

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
            content: "assistant content",
          },
        })}\n`,
      ),
    );
    child.emit("close", 0);

    const result = await reviewPromise;

    expect(result.withCriticalError).toBe(true);
    expect(result.errors?.[0]).toContain(
      "[Pi] Pi JSON mode: no review JSON found in output file.",
    );
    expect(result.errors?.[0]).toContain("ENOENT");
  });

  test("normalizes malformed response fields into summary-visible errors", async () => {
    const child = createMockChildProcess();
    nextChildFactory = () => child;
    mockReviewOutput = {
      error: null,
      jsonText: JSON.stringify({
        readableModelName: "GPT-5.4",
        summary: {
          walkthrough: {
            en: "ok",
          },
          changes: null,
          otherSuggestions: {},
        },
        reviews: [
          {
            file_path: "app/main.ts",
            new_line: 5,
            suggestions: {
              en: {
                detail: "detail",
                abstract: 123,
              },
            },
          },
        ],
      }),
    };

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
            content: "no markers",
          },
        })}\n`,
      ),
    );
    child.emit("close", 0);

    const result = await reviewPromise;

    expect(result.summary.changes).toEqual([]);
    expect(result.reviews[0]?.suggestions).toEqual({});
    expect(result.errors).toContain(
      "[Validation] summary.changes: expected an array",
    );
    expect(result.errors).toContain(
      "[Validation] reviews[0].suggestions.en.abstract: expected a string",
    );
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
      const largeAssistantContent = `${"a".repeat(1024 * 1024)}`;

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
              content: `${"a".repeat(1024 * 1024)}`,
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

  test("exposes the child process as soon as the agent is created", async () => {
    const child = createMockChildProcess();
    const startedChildren: MockChildProcess[] = [];

    nextChildFactory = () => child;

    const reviewPromise = runPiReview({
      prompt: "review this diff",
      onChildProcessStarted: ({
        childProcess,
      }: {
        childProcess: ChildProcess;
      }) => {
        startedChildren.push(childProcess as MockChildProcess);
      },
    });

    child.emit("spawn");
    child.stdout.emit(
      "data",
      Buffer.from(
        `${JSON.stringify({
          type: "agent_end",
          message: {
            role: "assistant",
            content: "assistant content",
          },
        })}\n`,
      ),
    );
    child.emit("close", 0);

    await reviewPromise;

    expect(startedChildren).toEqual([child]);
  });
});
