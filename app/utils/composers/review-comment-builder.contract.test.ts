import { describe, expect, test } from "bun:test";
import { initI18n } from "../../i18n";
import type { ReviewItemEntity } from "../../types/review.types";
import {
  buildReviewDiscussionBody,
  getDisplayLanguages,
} from "./review-comment-builder";

await initI18n({
  languageTag: "en",
  preloadLanguageTags: ["en", "ja"],
});

const review: ReviewItemEntity = {
  file_path: "app/main.ts",
  new_line: 42,
  rank: "HIGH",
  suggestions: {
    en: {
      detail: "Use the structured summary fields directly.",
      abstract: "Use the new fields directly.",
    },
    ja: {
      detail: "構造化された summary フィールドを直接使ってください。",
      abstract: "新しいフィールドを直接使います。",
    },
  },
};

const snapshotPath = new URL(
  "./__snapshots__/review-comment-builder.contract.md",
  import.meta.url,
);

const readContractSnapshot = async ({
  path,
}: {
  path: URL;
}): Promise<string> => {
  return (await Bun.file(path).text()).replace(/\r?\n$/, "");
};

describe("review-comment-builder contract", () => {
  test("renders the inline review body consistently for display and collapsed languages", async () => {
    const displayLanguages = getDisplayLanguages({
      langs: ["ja"],
      collapsedLangs: ["en"],
      sourceLanguage: "en",
    });
    const body = buildReviewDiscussionBody({
      marker: "<!-- review-marker -->",
      review,
      displayLanguages,
      collapsedLanguages: ["en"],
      sourceLanguage: "en",
    });
    const expectedSnapshot = await readContractSnapshot({ path: snapshotPath });

    expect(body).toBe(expectedSnapshot);
  });
});
