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

const originalArgv = [...process.argv];

process.argv = [
  originalArgv[0] ?? "bun",
  originalArgv[1] ?? "test",
  "--gitlab-token",
  process.env.GITLAB_TOKEN,
  "--gitlab-url",
  process.env.CI_SERVER_URL,
  "--project-id",
  process.env.CI_PROJECT_ID,
  "--mr-iid",
  process.env.CI_MERGE_REQUEST_IID,
  "--agent",
  "pi",
];

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

mock.module("./logger", () => ({
  logger: loggerMock,
  writeLogStream: writeLogStreamMock,
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
            content: `${REVIEW_RESPONSE_JSON_START_MARKER}{"summary":{"content":"ok","translations":{}},"reviews":[]}${REVIEW_RESPONSE_JSON_END_MARKER}`,
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
            content: `${REVIEW_RESPONSE_JSON_START_MARKER}{"summary":{"content":"ok","translations":{}},"reviews":[]}${REVIEW_RESPONSE_JSON_END_MARKER}`,
          },
        })}\n`,
      ),
    );
    child.emit("close", 0);

    const result = await reviewPromise;

    expect(result.errors).toBeUndefined();
    expect(result.summary.content).toBe("ok");
    expect(result.reviews).toEqual([]);
  });
});
