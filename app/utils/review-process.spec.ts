import {
  afterAll,
  afterEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import type { MergeRequestNoteSchema } from "@gitbeaker/rest";
import { REVIEW_PENDING_POLL_INTERVAL_MS } from "../constants";
import * as time from "./time";

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
};

const loggerMock = {
  warn: (_message: string): void => {},
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
    "mr-iid": "1",
    "process-max-pending-time": 1,
    "project-id": "1",
    "thinking-lang": "en",
    tools: [],
  },
}));

const { shouldSkipForStaleCommit, waitForPendingReviewToFinish } = await import(
  "./review-process"
);

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
  loggerMock.warn = (_message: string): void => {};

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
      `[GitLab] Another review is in progress. Waiting ${Math.ceil(REVIEW_PENDING_POLL_INTERVAL_MS / 1000)} seconds before checking again.`,
    );
    expect(warnings.at(-1)).toBe(
      "[GitLab] Review is still pending after 1 minute(s). Skipping this run.",
    );
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
