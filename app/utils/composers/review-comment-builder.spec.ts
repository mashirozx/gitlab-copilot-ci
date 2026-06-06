import { describe, expect, test } from "bun:test";

process.env.GITLAB_TOKEN ??= "test-gitlab-token";
process.env.CI_SERVER_URL ??= "https://gitlab.example.com";
process.env.CI_PROJECT_ID ??= "1";
process.env.CI_MERGE_REQUEST_IID ??= "1";

const { initI18n } = await import("../../i18n");

await initI18n({
  languageTag: "en",
  preloadLanguageTags: ["en", "ja", "zh-CN"],
});

const {
  buildReviewDiscussionBody,
  getDisplayLanguages,
  getLocalizedRecordValue,
  getPromptTranslationLangs,
  getRequestedResponseLanguages,
} = await import("./review-comment-builder");

describe("review-comment-builder helpers", () => {
  test("excludes the thinking language from translation requests", () => {
    expect(
      getPromptTranslationLangs({
        langs: ["ja", "zh-CN"],
        collapsedLangs: ["en"],
        sourceLanguage: "ja",
      }),
    ).toEqual(["zh-CN", "en"]);
  });

  test("includes the thinking language in requested response languages", () => {
    expect(
      getRequestedResponseLanguages({
        langs: ["ja", "zh-CN"],
        collapsedLangs: ["en", "zh-CN"],
        sourceLanguage: "ja",
      }),
    ).toEqual(["ja", "zh-CN", "en"]);
  });

  test("defaults displayed languages to the thinking language", () => {
    expect(
      getDisplayLanguages({
        langs: [],
        collapsedLangs: [],
        sourceLanguage: "ja",
      }),
    ).toEqual(["ja"]);
  });

  test("matches localized records by base and regional language tags", () => {
    expect(
      getLocalizedRecordValue({
        record: {
          "zh-CN": "简体中文",
          en: "English",
        },
        language: "zh",
      }),
    ).toBe("简体中文");
  });

  test("renders localized review bodies and keeps the inline rank tag in the source language", () => {
    const body = buildReviewDiscussionBody({
      marker: "<!-- review-marker -->",
      review: {
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
      },
      displayLanguages: ["ja", "en"],
      collapsedLanguages: ["en"],
      sourceLanguage: "en",
    });

    expect(body).toContain("<!-- review-marker -->");
    expect(body).toContain("\\text{HIGH}");
    expect(body).toContain(
      "構造化された summary フィールドを直接使ってください。",
    );
    expect(body).toContain("Use the structured summary fields directly.");
    expect(body).toContain("English");
    expect(body).toContain("<details>");
  });
});
