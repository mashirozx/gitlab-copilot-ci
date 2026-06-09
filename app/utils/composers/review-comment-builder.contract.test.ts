import { afterEach, describe, expect, mock, test } from "bun:test";
import type { ReviewItemEntity } from "../../types/review.types";

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

const loadReviewCommentBuilder = async () => {
  const mockedArgv = {
    agent: "github-copilot-cli",
    "agent-bin": undefined,
    "collapsed-lang": ["en"],
    "html-marker-prefix": "copilot",
    lang: ["ja"],
    model: "gpt-5.4",
    "thinking-lang": "en",
  };

  mock.module("../argv", () => ({
    argv: mockedArgv,
  }));
  mock.module("../../utils/argv", () => ({
    argv: mockedArgv,
  }));
  mock.module("../model-display.ts", () => ({
    modelDisplayName: "gpt-5.4 <kbd>medium</kbd>",
  }));

  const { initI18n } = await import("../../i18n");
  await initI18n({
    languageTag: "en",
    preloadLanguageTags: ["en", "ja"],
  });

  return import(`./review-comment-builder?contract=${Date.now()}`);
};

afterEach(() => {
  mock.restore();
  mock.clearAllMocks();
});

describe("review-comment-builder contract", () => {
  test("renders the inline review body consistently for display and collapsed languages", async () => {
    const { buildReviewDiscussionBody, getDisplayLanguages } =
      await loadReviewCommentBuilder();
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
