import { afterAll, describe, expect, test } from "bun:test";
import { initI18n } from "../../i18n";
import { buildReviewingMarkerNoteBody } from "./reviewing-comment-builder";

const originalCommitSha = process.env.CI_COMMIT_SHA;
const originalCommitShortSha = process.env.CI_COMMIT_SHORT_SHA;
const originalProjectUrl = process.env.CI_PROJECT_URL;

process.env.CI_COMMIT_SHA = "1234567890abcdef";
process.env.CI_COMMIT_SHORT_SHA = "12345678";
process.env.CI_PROJECT_URL = "https://gitlab.example.com/group/project";

await initI18n({
  languageTag: "en",
  preloadLanguageTags: ["en"],
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
    const body = buildReviewingMarkerNoteBody({
      htmlMarkerPrefix: "copilot",
    });
    const expectedSnapshot = await readContractSnapshot({ path: snapshotPath });

    expect(body).toBe(expectedSnapshot);
  });
});

afterAll(() => {
  if (originalCommitSha === undefined) {
    delete process.env.CI_COMMIT_SHA;
  } else {
    process.env.CI_COMMIT_SHA = originalCommitSha;
  }

  if (originalCommitShortSha === undefined) {
    delete process.env.CI_COMMIT_SHORT_SHA;
  } else {
    process.env.CI_COMMIT_SHORT_SHA = originalCommitShortSha;
  }

  if (originalProjectUrl === undefined) {
    delete process.env.CI_PROJECT_URL;
  } else {
    process.env.CI_PROJECT_URL = originalProjectUrl;
  }
});
