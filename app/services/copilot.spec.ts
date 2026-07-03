import { afterEach, describe, expect, mock, test } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";

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
let mockReadFileSync = (_path: string, _encoding: BufferEncoding): string =>
  '{"readableModelName":"GPT-5.4","summary":{"walkthrough":{"en":"ok"},"changes":[],"otherSuggestions":{}},"reviews":[]}';
let spawnCalls: Array<{ command: string; args: string[] }> = [];
const mockArgv = {
  agent: "github-copilot-cli",
  "agent-args": undefined,
  "agent-bin": undefined,
  "collect-runtime-stats": false,
  "copilot-github-token": undefined,
  model: "gpt-5.4",
  tools: [],
  "max-stdout-size": 1024 * 1024,
};

mock.module("./logger", () => ({
  logger: loggerMock,
  writeLogStream: writeLogStreamMock,
}));

mock.module("../utils/argv", () => ({
  argv: mockArgv,
}));

mock.module("node:child_process", () => ({
  spawn: (command: string, args: string[]) => {
    spawnCalls.push({ command, args });
    return nextChildFactory();
  },
  spawnSync: () => ({ stdout: "", stderr: "" }),
}));

mock.module("node:fs", () => ({
  readdirSync: () => [],
  readFileSync: (path: string, encoding: BufferEncoding) =>
    mockReadFileSync(path, encoding),
}));

const { runCopilotReview } = await import(`./copilot?test=${Date.now()}`);
const { buildPerformanceMetricsSection } = await import(
  `../utils/composers/summary-comment-builder?test=${Date.now()}`
);
const { initI18n } = await import("../i18n");

await initI18n({
  languageTag: "en",
  preloadLanguageTags: ["en"],
});

afterEach(() => {
  mock.restore();
  mock.clearAllMocks();
  nextChildFactory = (): MockChildProcess => createMockChildProcess();
  mockReadFileSync = (_path: string, _encoding: BufferEncoding): string =>
    '{"readableModelName":"GPT-5.4","summary":{"walkthrough":{"en":"ok"},"changes":[],"otherSuggestions":{}},"reviews":[]}';
  spawnCalls = [];
  mockArgv.model = "gpt-5.4";
});

describe("runCopilotReview", () => {
  test("warns and stops printing agent stdout once the safety threshold is reached", async () => {
    const child = createMockChildProcess();
    const stdoutWriteCalls: string[] = [];
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    const originalWarn = loggerMock.warn;
    const warnCalls: string[] = [];

    nextChildFactory = () => child;
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
      const reviewPromise = runCopilotReview({
        prompt: "review this diff",
      });
      const jsonText = `agent output ${"a".repeat(1024 * 1024)}`;

      child.emit("spawn");
      child.stdout.emit("data", Buffer.from(jsonText));
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
      process.stdout.write = originalStdoutWrite;
      loggerMock.warn = originalWarn;
    }
  });

  test("parses Copilot CLI usage lines into the performance metrics section", async () => {
    const child = createMockChildProcess();

    nextChildFactory = () => child;

    const reviewPromise = runCopilotReview({
      prompt: "review this diff",
    });
    const jsonText = "agent output";

    child.emit("spawn");
    child.stdout.emit("data", Buffer.from("AI Credits 126 (10m 47s)\n"));
    child.stdout.emit(
      "data",
      Buffer.from(
        "Tokens     ↑ 2.3m (2.3m cached) • ↓ 32.6k (15.7k reasoning)\n",
      ),
    );
    child.stdout.emit("data", Buffer.from(jsonText));
    child.emit("close", 0);

    const result = await reviewPromise;

    expect(result.usage?.aiCredits).toBe(126);
    expect(result.usage?.input).toBe(2_300_000);
    expect(result.usage?.cacheRead).toBe(2_300_000);
    expect(result.usage?.output).toBe(32_600);
    expect(result.usage?.totalTokens).toBe(2_332_600);
    expect(result.usage?.reasoningTokens).toBe(15_700);

    const section = buildPerformanceMetricsSection({
      response: result,
      agentDisplay: "GitHub Copilot CLI 1.0.54",
    });

    expect(section).toContain("- 🪙 **AI Credits**: 126");
    expect(section).toContain("- 🔢 **Total tokens**: 2332600");
    expect(section).toContain("- 🧠 **Reasoning tokens**: 15700");
  });

  test("marks the review response as critical when the agent exits non-zero", async () => {
    const child = createMockChildProcess();

    nextChildFactory = () => child;

    const reviewPromise = runCopilotReview({
      prompt: "review this diff",
    });
    const jsonText = "agent output";

    child.emit("spawn");
    child.stdout.emit("data", Buffer.from(jsonText));
    child.emit("close", 1);

    const result = await reviewPromise;

    expect(result.withCriticalError).toBe(true);
    expect(result.errors?.[0]).toBe("[Copilot] Copilot CLI exited with code 1");
    expect(result.summary.walkthrough.en).toBeUndefined();
  });

  test("defers process start failures to the close handler", async () => {
    const child = createMockChildProcess();

    nextChildFactory = () => child;

    const reviewPromise = runCopilotReview({
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
    mockReadFileSync = (_path, _encoding) =>
      '{"readableModelName":"GPT-5.4","summary":{"walkthrough":{"en":"ok"},"changes":[],"otherSuggestions":{}},"reviews":[]}';

    const reviewPromise = runCopilotReview({
      prompt: "review this diff",
    });

    child.emit("spawn");
    child.stdout.emit("data", Buffer.from("no markers in stdout"));
    child.emit("close", 0);

    const result = await reviewPromise;

    expect(result.errors).toBeUndefined();
    expect(result.summary.walkthrough.en).toBe("ok");
    expect(result.reviews).toEqual([]);
  });

  test("normalizes malformed response fields into summary-visible errors", async () => {
    const child = createMockChildProcess();

    nextChildFactory = () => child;
    mockReadFileSync = (_path, _encoding) =>
      JSON.stringify({
        readableModelName: "GPT-5.4",
        summary: {
          walkthrough: null,
          changes: [],
          otherSuggestions: {},
        },
        reviews: [
          {
            file_path: "app/main.ts",
            new_line: 10,
            suggestions: null,
          },
        ],
      });

    const reviewPromise = runCopilotReview({
      prompt: "review this diff",
    });

    child.emit("spawn");
    child.stdout.emit("data", Buffer.from("no markers in stdout"));
    child.emit("close", 0);

    const result = await reviewPromise;

    expect(result.summary.walkthrough).toEqual({});
    expect(result.reviews[0]?.suggestions).toEqual({});
    expect(result.errors).toContain(
      "[Validation] summary.walkthrough: expected an object keyed by language",
    );
    expect(result.errors).toContain(
      "[Validation] reviews[0].suggestions: expected an object keyed by language",
    );
  });

  test("allows the repo directory and temp directories for Copilot CLI", async () => {
    const child = createMockChildProcess();

    nextChildFactory = () => child;

    const reviewPromise = runCopilotReview({
      prompt: "review this diff",
    });

    child.emit("spawn");
    child.emit("close", 0);

    await reviewPromise;

    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]?.args).toContain(`--add-dir=${process.cwd()}`);
    expect(spawnCalls[0]?.args).toContain(`--add-dir=${tmpdir()}`);

    try {
      const resolvedTmpPath = realpathSync("/tmp");

      expect(spawnCalls[0]?.args).toContain("--add-dir=/tmp");
      expect(spawnCalls[0]?.args).toContain(`--add-dir=${resolvedTmpPath}`);
    } catch {
      expect(spawnCalls[0]?.args).not.toContain("--add-dir=/tmp");
    }
  });

  test("passes the parsed model string through and preserves effort without rewriting", async () => {
    const child = createMockChildProcess();

    mockArgv.model = "minimax/MiniMax-M1:minimal";
    nextChildFactory = () => child;

    const reviewPromise = runCopilotReview({
      prompt: "review this diff",
    });

    child.emit("spawn");
    child.emit("close", 0);

    await reviewPromise;

    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]?.args).toContain("--model");
    expect(spawnCalls[0]?.args).toContain("minimax/MiniMax-M1");
    expect(spawnCalls[0]?.args).not.toContain("minimax/MiniMax-M1:minimal");
    expect(spawnCalls[0]?.args).toContain("--effort");
    expect(spawnCalls[0]?.args).toContain("minimal");
    expect(spawnCalls[0]?.args).not.toContain("low");
  });

  test("exposes the child process as soon as the agent is created", async () => {
    const child = createMockChildProcess();
    const startedChildren: MockChildProcess[] = [];

    nextChildFactory = () => child;

    const reviewPromise = runCopilotReview({
      prompt: "review this diff",
      onChildProcessStarted: ({
        childProcess,
      }: {
        childProcess: ChildProcess;
      }) => {
        startedChildren.push(childProcess as MockChildProcess);
      },
    });
    const jsonText = "agent output";

    child.emit("spawn");
    child.stdout.emit("data", Buffer.from(jsonText));
    child.emit("close", 0);

    await reviewPromise;

    expect(startedChildren).toEqual([child]);
  });
});
