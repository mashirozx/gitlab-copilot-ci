import {
  afterAll,
  afterEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import type { MergeRequestNoteSchema } from "@gitbeaker/rest";
import * as time from "./time";

type IntervalCallback = Parameters<typeof setInterval>[0];

const originalCommitSha = process.env.CI_COMMIT_SHA;
const testCommitSha = "1234567890abcdef";

process.env.CI_COMMIT_SHA = testCommitSha;

const gitlabServiceMock = {
  getReviewingMarkerNote: async ({
    ignoreNoteId: _ignoreNoteId,
  }: {
    ignoreNoteId?: number;
  } = {}): Promise<MergeRequestNoteSchema | undefined> => {
    return undefined;
  },
  getMergeRequest: async () => {
    return {
      diff_refs: {
        head_sha: testCommitSha,
      },
    };
  },
  deleteMergeRequestNote: async ({ noteId: _noteId }: { noteId: number }) => {},
};

const loggerMock = {
  error: (_message: string): void => {},
  info: (_message: string): void => {},
  warn: (_message: string): void => {},
};

type MockChildProcess = EventEmitter & {
  exitCode: number | null;
  killed: boolean;
  kill: (signal?: NodeJS.Signals | number) => boolean;
};

const createMockChildProcess = (): MockChildProcess => {
  const child = new EventEmitter() as MockChildProcess;
  child.exitCode = null;
  child.killed = false;
  child.kill = (_signal?: NodeJS.Signals | number) => {
    child.killed = true;
    queueMicrotask(() => {
      child.exitCode = 137;
      child.emit("exit", 137, "SIGKILL");
      child.emit("close", 137, "SIGKILL");
    });
    return true;
  };
  return child;
};

mock.module("../services/gitlab", () => ({
  gitlabService: gitlabServiceMock,
}));

mock.module("../services/logger", () => ({
  logger: loggerMock,
  writeLogStream: (_message: unknown): void => {},
}));

mock.module("./argv", () => ({
  argv: {
    agent: "github-copilot-cli",
    "agent-args": undefined,
    "agent-bin": undefined,
    "collapsed-lang": [],
    "gitlab-token": "test-gitlab-token",
    "gitlab-url": "https://gitlab.example.com",
    "html-marker-prefix": "copilot",
    lang: [],
    "max-history-length": 12,
    model: undefined,
    "mr-check-interval": 10_000,
    "mr-iid": "1",
    "project-id": "1",
    "review-max-pending-time": 60_000,
    "thinking-lang": "en",
    tools: [],
  },
}));

const { argv } = await import("./argv");

const {
  cancelReviewForStaleCommit,
  shouldSkipForStaleCommit,
  startStaleCommitMonitor,
  waitForPendingReviewToFinish,
} = await import("./review-process");

const createMergeRequestNote = ({
  id,
}: {
  id: number;
}): MergeRequestNoteSchema => {
  return {
    id,
    body: "",
    attachment: null,
    author: {
      id: 1,
      name: "tester",
      username: "tester",
      state: "active",
      avatar_url: "",
      web_url: "",
    },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    system: false,
    noteable_id: 1,
    noteable_type: "MergeRequest",
    noteable_iid: 1,
    project_id: 1,
    resolvable: false,
  };
};

afterEach(() => {
  mock.restore();
  mock.clearAllMocks();

  gitlabServiceMock.getReviewingMarkerNote = async ({
    ignoreNoteId: _ignoreNoteId,
  }: {
    ignoreNoteId?: number;
  } = {}): Promise<MergeRequestNoteSchema | undefined> => {
    return undefined;
  };
  gitlabServiceMock.getMergeRequest = async () => {
    return {
      diff_refs: {
        head_sha: testCommitSha,
      },
    };
  };
  gitlabServiceMock.deleteMergeRequestNote = async ({
    noteId: _noteId,
  }: {
    noteId: number;
  }) => {};
  loggerMock.error = (_message: string): void => {};
  loggerMock.info = (_message: string): void => {};
  loggerMock.warn = (_message: string): void => {};
  argv["mr-check-interval"] = 10_000;
  argv["review-max-pending-time"] = 60_000;

  process.env.CI_COMMIT_SHA = testCommitSha;
});

afterAll(() => {
  if (originalCommitSha === undefined) {
    delete process.env.CI_COMMIT_SHA;
  } else {
    process.env.CI_COMMIT_SHA = originalCommitSha;
  }
});

describe("waitForPendingReviewToFinish", () => {
  test("ignores the current reviewing marker note id", async () => {
    const checkedIgnoreIds: Array<number | undefined> = [];

    gitlabServiceMock.getReviewingMarkerNote = async ({
      ignoreNoteId,
    } = {}) => {
      checkedIgnoreIds.push(ignoreNoteId);

      if (ignoreNoteId === 42) {
        return undefined;
      }

      return createMergeRequestNote({ id: 42 });
    };
    loggerMock.warn = () => {};
    spyOn(time, "getNowEpochMilliseconds").mockImplementation(() => 0);
    spyOn(time, "sleepMilliseconds").mockImplementation(async () => {
      throw new Error(
        "sleep should not be called when the only marker is ignored",
      );
    });

    const result = await waitForPendingReviewToFinish({
      ignoreReviewingNoteId: 42,
    });

    expect(result).toBe(true);
    expect(checkedIgnoreIds).toEqual([42]);
  });

  test("returns false after timing out on another pending review", async () => {
    let currentTimeMs = 0;
    const warnings: string[] = [];

    gitlabServiceMock.getReviewingMarkerNote = async () => {
      return createMergeRequestNote({ id: 99 });
    };
    loggerMock.warn = (message: string) => {
      warnings.push(message);
    };
    spyOn(time, "getNowEpochMilliseconds").mockImplementation(
      () => currentTimeMs,
    );
    spyOn(time, "sleepMilliseconds").mockImplementation(
      async ({ milliseconds }) => {
        currentTimeMs += milliseconds;
      },
    );

    const result = await waitForPendingReviewToFinish();

    expect(result).toBe(false);
    expect(warnings).toContain(
      "[GitLab] Another review is in progress. Waiting 10 second(s) before checking again.",
    );
    expect(warnings.at(-1)).toBe(
      "[GitLab] Review is still pending after 1 minute(s). Skipping this run.",
    );
  });

  test("uses the shared mr-check interval while waiting for another review", async () => {
    let currentTimeMs = 0;
    const sleepCalls: number[] = [];

    argv["mr-check-interval"] = 5000;
    gitlabServiceMock.getReviewingMarkerNote = async () => {
      return createMergeRequestNote({ id: 99 });
    };
    spyOn(time, "getNowEpochMilliseconds").mockImplementation(
      () => currentTimeMs,
    );
    spyOn(time, "sleepMilliseconds").mockImplementation(
      async ({ milliseconds }) => {
        sleepCalls.push(milliseconds);
        currentTimeMs += 60_000;
      },
    );

    const result = await waitForPendingReviewToFinish();

    expect(result).toBe(false);
    expect(sleepCalls).toEqual([5000]);
  });

  test("supports non-minute review max pending durations", async () => {
    let currentTimeMs = 0;
    const warnings: string[] = [];

    argv["review-max-pending-time"] = 10_000;
    gitlabServiceMock.getReviewingMarkerNote = async () => {
      return createMergeRequestNote({ id: 99 });
    };
    loggerMock.warn = (message: string) => {
      warnings.push(message);
    };
    spyOn(time, "getNowEpochMilliseconds").mockImplementation(
      () => currentTimeMs,
    );
    spyOn(time, "sleepMilliseconds").mockImplementation(
      async ({ milliseconds }) => {
        currentTimeMs += milliseconds;
      },
    );

    const result = await waitForPendingReviewToFinish();

    expect(result).toBe(false);
    expect(warnings.at(-1)).toBe(
      "[GitLab] Review is still pending after 10 second(s). Skipping this run.",
    );
  });

  test("returns false immediately when the waiting run is already stale", async () => {
    const warnings: string[] = [];

    gitlabServiceMock.getReviewingMarkerNote = async () => {
      return createMergeRequestNote({ id: 99 });
    };
    gitlabServiceMock.getMergeRequest = async () => {
      return {
        diff_refs: {
          head_sha: "bbbbbbbb",
        },
      };
    };
    loggerMock.warn = (message: string) => {
      warnings.push(message);
    };
    spyOn(time, "sleepMilliseconds").mockImplementation(async () => {
      throw new Error("sleep should not be called for stale pending runs");
    });

    const result = await waitForPendingReviewToFinish();

    expect(result).toBe(false);
    expect(warnings).toEqual([
      "[GitLab] Skipping review for 1234567890abcdef because the merge request head moved to bbbbbbbb.",
    ]);
  });
});

describe("shouldSkipForStaleCommit", () => {
  test("skips when the merge request head differs from the current CI commit", () => {
    const warnings: string[] = [];
    loggerMock.warn = (message) => {
      warnings.push(message);
    };

    const result = shouldSkipForStaleCommit({
      mergeRequestHeadSha: "bbbbbbbb",
    });

    expect(result).toBe(true);
    expect(warnings).toEqual([
      "[GitLab] Skipping review for 1234567890abcdef because the merge request head moved to bbbbbbbb.",
    ]);
  });
});

describe("cancelReviewForStaleCommit", () => {
  test("kills the agent process and deletes the reviewing marker note when the MR head moved", async () => {
    const child = createMockChildProcess();
    const deletedNoteIds: number[] = [];
    const actionOrder: string[] = [];
    let staleCommitDetected = false;
    let deletedReviewingMarker = false;

    gitlabServiceMock.getMergeRequest = async () => {
      return {
        diff_refs: {
          head_sha: "bbbbbbbb",
        },
      };
    };
    gitlabServiceMock.deleteMergeRequestNote = async ({ noteId }) => {
      actionOrder.push("delete-note");
      deletedNoteIds.push(noteId);
    };
    const originalKill = child.kill;
    child.kill = (signal?: NodeJS.Signals | number) => {
      actionOrder.push(`kill:${String(signal ?? "default")}`);
      return originalKill(signal);
    };

    const wasCancelled = await cancelReviewForStaleCommit({
      childProcess: child as unknown as ChildProcess,
      reviewingMarkerNoteId: 42,
      onStaleCommitDetected: () => {
        staleCommitDetected = true;
      },
      onReviewingMarkerDeleted: () => {
        deletedReviewingMarker = true;
      },
    });

    expect(wasCancelled).toBe(true);
    expect(staleCommitDetected).toBe(true);
    expect(deletedReviewingMarker).toBe(true);
    expect(deletedNoteIds).toEqual([42]);
    expect(child.killed).toBe(true);
    expect(actionOrder).toEqual(["kill:SIGKILL", "delete-note"]);
  });
});

describe("startStaleCommitMonitor", () => {
  test("uses the shared stale-commit polling interval and stops cleanly", async () => {
    const child = createMockChildProcess();
    const recordedIntervals: number[] = [];
    const recordedClears: Array<ReturnType<typeof setInterval>> = [];
    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;

    globalThis.setInterval = ((handler: IntervalCallback, timeout?: number) => {
      recordedIntervals.push(timeout ?? 0);
      return originalSetInterval(handler, 0);
    }) as typeof setInterval;
    globalThis.clearInterval = ((
      intervalId?: ReturnType<typeof setInterval>,
    ) => {
      recordedClears.push(intervalId as ReturnType<typeof setInterval>);
      originalClearInterval(intervalId);
    }) as typeof clearInterval;

    try {
      const monitor = startStaleCommitMonitor({
        childProcess: child as unknown as ChildProcess,
      });

      expect(recordedIntervals).toEqual([argv["mr-check-interval"]]);

      await monitor.stop();

      expect(recordedClears).toHaveLength(1);
    } finally {
      globalThis.setInterval = originalSetInterval;
      globalThis.clearInterval = originalClearInterval;
    }
  });

  test("uses the shared mr-check interval for stale-commit polling", async () => {
    const child = createMockChildProcess();
    const recordedIntervals: number[] = [];
    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;

    argv["mr-check-interval"] = 2000;
    globalThis.setInterval = ((handler: IntervalCallback, timeout?: number) => {
      recordedIntervals.push(timeout ?? 0);
      return originalSetInterval(handler, 0);
    }) as typeof setInterval;
    globalThis.clearInterval = ((
      intervalId?: ReturnType<typeof setInterval>,
    ) => {
      originalClearInterval(intervalId);
    }) as typeof clearInterval;

    try {
      const monitor = startStaleCommitMonitor({
        childProcess: child as unknown as ChildProcess,
      });

      expect(recordedIntervals).toEqual([2000]);

      await monitor.stop();
    } finally {
      globalThis.setInterval = originalSetInterval;
      globalThis.clearInterval = originalClearInterval;
    }
  });
});
