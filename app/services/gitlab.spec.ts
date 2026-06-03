import { afterEach, describe, expect, mock, test } from "bun:test";

process.env.GITLAB_TOKEN ??= "test-gitlab-token";
process.env.CI_SERVER_URL ??= "https://gitlab.example.com";
process.env.CI_PROJECT_ID ??= "1";
process.env.CI_MERGE_REQUEST_IID ??= "1";

const loadGitLabModule = async () => {
  mock.module("../utils/argv", () => ({
    argv: {
      "gitlab-token": process.env.GITLAB_TOKEN,
      "gitlab-url": process.env.CI_SERVER_URL,
      "project-id": process.env.CI_PROJECT_ID,
      "mr-iid": process.env.CI_MERGE_REQUEST_IID,
      "max-git-diff-page": undefined,
      lang: [],
      "collapsed-lang": [],
      "html-marker-prefix": "copilot",
    },
  }));

  return import(`./gitlab?test=${Date.now()}`);
};

afterEach(() => {
  mock.restore();
  mock.clearAllMocks();
});

describe("buildDiscussionPosition", () => {
  test("prefers the new side when both diff line numbers are present", async () => {
    const { buildDiscussionPosition } = await loadGitLabModule();

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

  test("uses the old side when the review only targets a removed line", async () => {
    const { buildDiscussionPosition } = await loadGitLabModule();

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
