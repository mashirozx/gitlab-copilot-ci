import { describe, expect, mock, test } from "bun:test";
import type { DiscussionSchema } from "@gitbeaker/rest";

const loggerMock = {
  debug: (..._args: unknown[]) => {},
  error: (..._args: unknown[]) => {},
  info: (..._args: unknown[]) => {},
  start: (..._args: unknown[]) => {},
  success: (..._args: unknown[]) => {},
  warn: (..._args: unknown[]) => {},
};

process.env.GITLAB_TOKEN ??= "test-gitlab-token";
process.env.CI_SERVER_URL ??= "https://gitlab.example.com";
process.env.CI_PROJECT_ID ??= "1";
process.env.CI_MERGE_REQUEST_IID ??= "1";

const originalArgv = [...process.argv];
const mergeRequestDiscussionsAll = mock(
  async (): Promise<DiscussionSchema[]> => [],
);

const buildDiscussion = ({
  id,
  resolved,
}: {
  id: string;
  resolved: boolean;
}): DiscussionSchema => ({
  id,
  individual_note: false,
  notes: [
    {
      resolvable: true,
      resolved,
      resolved_at: resolved ? "2026-06-03T12:00:00Z" : null,
      resolved_by_id: resolved ? 1 : null,
      resolved_by_push: false,
    },
  ] as unknown as DiscussionSchema["notes"],
});

mock.module("@gitbeaker/rest", () => ({
  Gitlab: class {
    MergeRequestDiscussions = {
      all: mergeRequestDiscussionsAll,
      create: mock(async () => ({
        id: "discussion-1",
        notes: [{ id: 1, system: false }],
      })),
    };

    MergeRequestNotes = {
      all: mock(async () => []),
      create: mock(async () => ({ id: 1, body: "" })),
      remove: mock(async () => undefined),
    };

    MergeRequests = {
      allDiffs: mock(async () => []),
      show: mock(async () => ({
        diff_refs: {
          base_sha: "base-sha",
          head_sha: "head-sha",
        },
      })),
    };
  },
}));

mock.module("./logger", () => ({
  logger: loggerMock,
}));

mock.module("../utils/argv", () => ({
  argv: {
    "collapsed-lang": [],
    "gitlab-token": process.env.GITLAB_TOKEN,
    "gitlab-url": process.env.CI_SERVER_URL,
    "html-marker-prefix": "copilot",
    lang: [],
    "mr-iid": process.env.CI_MERGE_REQUEST_IID,
    "project-id": process.env.CI_PROJECT_ID,
  },
}));

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
];

const { buildDiscussionPosition, GitLabService, filterResolvedReviewHistory } =
  await import(`./gitlab?test=${Date.now()}`);

describe("buildDiscussionPosition", () => {
  test("prefers the new side when both diff line numbers are present", () => {
    expect(
      buildDiscussionPosition({
        mergeRequest: {
          diff_refs: {
            base_sha: "base-sha",
            head_sha: "head-sha",
          },
        },
        review: {
          file_path: "src/example.ts",
          suggestion: "Use the new side only",
          new_line: 15,
          old_line: 12,
        },
      }),
    ).toEqual({
      baseSha: "base-sha",
      headSha: "head-sha",
      startSha: "base-sha",
      positionType: "text",
      newPath: "src/example.ts",
      oldPath: "src/example.ts",
      newLine: "15",
    });
  });

  test("uses the old side when the review only targets a removed line", () => {
    expect(
      buildDiscussionPosition({
        mergeRequest: {
          diff_refs: {
            base_sha: "base-sha",
            head_sha: "head-sha",
          },
        },
        review: {
          file_path: "src/example.ts",
          suggestion: "Use the removed side",
          old_line: 12,
        },
      }),
    ).toEqual({
      baseSha: "base-sha",
      headSha: "head-sha",
      startSha: "base-sha",
      positionType: "text",
      newPath: "src/example.ts",
      oldPath: "src/example.ts",
      oldLine: "12",
    });
  });
});

describe("filterResolvedReviewHistory", () => {
  test("removes only discussions marked resolved by GitLab", () => {
    const filtered = filterResolvedReviewHistory({
      reviewHistory: [
        {
          discussions: [
            {
              discussion_id: "discussion-open",
              note_id: "note-open",
              content: {
                suggestion: "Keep me",
                file_path: "src/open.ts",
                old_line: null,
                new_line: 10,
              },
            },
            {
              discussion_id: "discussion-resolved",
              note_id: "note-resolved",
              content: {
                suggestion: "Drop me",
                file_path: "src/resolved.ts",
                old_line: null,
                new_line: 20,
              },
            },
            {
              discussion_id: "discussion-missing",
              note_id: "note-missing",
              content: {
                suggestion: "Status unknown, keep me",
                file_path: "src/missing.ts",
                old_line: null,
                new_line: 30,
              },
            },
          ],
        },
      ],
      discussions: [
        buildDiscussion({
          id: "discussion-open",
          resolved: false,
        }),
        buildDiscussion({
          id: "discussion-resolved",
          resolved: true,
        }),
      ],
    });

    expect(filtered).toEqual([
      {
        discussions: [
          {
            discussion_id: "discussion-open",
            note_id: "note-open",
            content: {
              suggestion: "Keep me",
              file_path: "src/open.ts",
              old_line: null,
              new_line: 10,
            },
          },
          {
            discussion_id: "discussion-missing",
            note_id: "note-missing",
            content: {
              suggestion: "Status unknown, keep me",
              file_path: "src/missing.ts",
              old_line: null,
              new_line: 30,
            },
          },
        ],
      },
    ]);
  });

  test("keeps unresolved discussions when GitLab omits resolved_by_id", () => {
    const filtered = filterResolvedReviewHistory({
      reviewHistory: [
        {
          discussions: [
            {
              discussion_id: "discussion-open",
              note_id: "note-open",
              content: {
                suggestion: "Keep me",
                file_path: "src/open.ts",
                old_line: null,
                new_line: 10,
              },
            },
            {
              discussion_id: "discussion-resolved",
              note_id: "note-resolved",
              content: {
                suggestion: "Drop me",
                file_path: "src/resolved.ts",
                old_line: null,
                new_line: 20,
              },
            },
          ],
        },
      ],
      discussions: [
        {
          id: "discussion-open",
          individual_note: false,
          notes: [
            {
              resolvable: true,
              resolved: false,
              resolved_at: null,
              resolved_by_push: false,
            },
          ] as unknown as DiscussionSchema["notes"],
        },
        {
          id: "discussion-resolved",
          individual_note: false,
          notes: [
            {
              resolvable: true,
              resolved: true,
              resolved_at: "2026-06-03T12:00:00Z",
              resolved_by: {
                id: 1,
              },
              resolved_by_push: false,
            },
          ] as unknown as DiscussionSchema["notes"],
        },
      ] as DiscussionSchema[],
    });

    expect(filtered).toEqual([
      {
        discussions: [
          {
            discussion_id: "discussion-open",
            note_id: "note-open",
            content: {
              suggestion: "Keep me",
              file_path: "src/open.ts",
              old_line: null,
              new_line: 10,
            },
          },
        ],
      },
    ]);
  });
});

describe("GitLabService.getUnresolvedReviewHistoryFromSummary", () => {
  test("fetches all MR discussion pages before filtering resolved history", async () => {
    const fillerDiscussions = Array.from({ length: 99 }, (_, index) =>
      buildDiscussion({
        id: `filler-${index + 1}`,
        resolved: false,
      }),
    );

    mergeRequestDiscussionsAll.mockReset();
    mergeRequestDiscussionsAll
      .mockResolvedValueOnce([
        buildDiscussion({
          id: "discussion-open",
          resolved: false,
        }),
        ...fillerDiscussions,
      ])
      .mockResolvedValueOnce([
        buildDiscussion({
          id: "discussion-resolved-page-2",
          resolved: true,
        }),
      ]);

    const encodedHistory = Buffer.from(
      JSON.stringify([
        {
          discussions: [
            {
              discussion_id: "discussion-open",
              note_id: "note-open",
              content: {
                suggestion: "Keep me",
                file_path: "src/open.ts",
                old_line: null,
                new_line: 10,
              },
            },
            {
              discussion_id: "discussion-resolved-page-2",
              note_id: "note-resolved-page-2",
              content: {
                suggestion: "Drop me",
                file_path: "src/resolved.ts",
                old_line: null,
                new_line: 20,
              },
            },
          ],
        },
      ]),
      "utf8",
    ).toString("base64");
    const noteBody = `<!-- copilot-review-data-start -->
<!--
${encodedHistory}
-->
<!-- copilot-review-data-end -->`;
    const service = new GitLabService();

    expect(
      await service.getUnresolvedReviewHistoryFromSummary({ noteBody }),
    ).toEqual([
      {
        discussions: [
          {
            discussion_id: "discussion-open",
            note_id: "note-open",
            content: {
              suggestion: "Keep me",
              file_path: "src/open.ts",
              old_line: null,
              new_line: 10,
            },
          },
        ],
      },
    ]);

    expect(mergeRequestDiscussionsAll).toHaveBeenCalledTimes(2);
    expect(mergeRequestDiscussionsAll).toHaveBeenNthCalledWith(
      1,
      process.env.CI_PROJECT_ID,
      Number(process.env.CI_MERGE_REQUEST_IID),
      {
        page: 1,
        perPage: 100,
      },
    );
    expect(mergeRequestDiscussionsAll).toHaveBeenNthCalledWith(
      2,
      process.env.CI_PROJECT_ID,
      Number(process.env.CI_MERGE_REQUEST_IID),
      {
        page: 2,
        perPage: 100,
      },
    );
  });
});
