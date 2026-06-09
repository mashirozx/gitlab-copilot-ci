import { afterEach, describe, expect, mock, test } from "bun:test";

const contractEnv = {
  CI_COMMIT_SHA: "1234567890abcdef1234567890abcdef12345678",
  CI_COMMIT_SHORT_SHA: "12345678",
  CI_PROJECT_URL: "https://gitlab.example.com/group/repo-name",
  CI_JOB_URL: "https://gitlab.example.com/group/repo-name/-/jobs/15536",
} as const;

const loadReviewingCommentBuilder = async () => {
  mock.module("../argv", () => ({
    argv: {
      "thinking-lang": "en",
      agent: "github-copilot-cli",
    },
  }));

  mock.module("../env", () => ({
    env: {
      get CI_COMMIT_SHA() {
        return contractEnv.CI_COMMIT_SHA;
      },
      get CI_COMMIT_SHORT_SHA() {
        return contractEnv.CI_COMMIT_SHORT_SHA;
      },
      get CI_PROJECT_URL() {
        return contractEnv.CI_PROJECT_URL;
      },
      get CI_JOB_URL() {
        return contractEnv.CI_JOB_URL;
      },
    },
  }));

  const { initI18n } = await import("../../i18n");
  await initI18n({
    languageTag: "en",
    preloadLanguageTags: ["en"],
  });

  return import(`./reviewing-comment-builder?contract=${Date.now()}`);
};

afterEach(() => {
  mock.restore();
  mock.clearAllMocks();
});

const snapshotPath = new URL(
  "./__snapshots__/reviewing-comment-builder.contract.md",
  import.meta.url,
);

const readContractSnapshot = async ({
  path,
}: {
  path: URL;
}): Promise<string> => {
  return (await Bun.file(path).text()).replace(/\r?\n$/, "");
};

describe("reviewing-comment-builder contract", () => {
  test("renders the review-in-progress note body consistently", async () => {
    const { buildReviewingMarkerNoteBody } =
      await loadReviewingCommentBuilder();
    const body = buildReviewingMarkerNoteBody({
      htmlMarkerPrefix: "copilot",
    });
    const expectedSnapshot = await readContractSnapshot({ path: snapshotPath });

    expect(body).toBe(expectedSnapshot);
  });
});
