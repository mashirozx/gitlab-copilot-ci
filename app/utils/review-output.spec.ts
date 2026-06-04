import { describe, expect, test } from "bun:test";

process.env.GITLAB_TOKEN ??= "test-gitlab-token";
process.env.CI_SERVER_URL ??= "https://gitlab.example.com";
process.env.CI_PROJECT_ID ??= "1";
process.env.CI_MERGE_REQUEST_IID ??= "1";

const {
  getDisplayLanguages,
  getPromptTranslationLangs,
  normalizeReviewResponse,
} = await import("./review-output");

describe("normalizeReviewResponse", () => {
  test("keeps keyed summary translations unchanged", () => {
    const response = normalizeReviewResponse({
      response: {
        summary: {
          content: "english",
          translations: {
            "zh-CN": "中文",
            ja: "日本語",
          },
        },
        reviews: [],
      },
      translationLangs: ["zh-CN", "ja"],
    });

    expect(response.summary.translations).toEqual({
      "zh-CN": "中文",
      ja: "日本語",
    });
  });

  test("converts legacy array summary translations using requested language order", () => {
    const response = normalizeReviewResponse({
      response: {
        summary: {
          content: "english",
          translations: ["中文", "日本語"] as unknown as Record<string, string>,
        },
        reviews: [],
      },
      translationLangs: ["zh-CN", "ja"],
    });

    expect(response.summary.translations).toEqual({
      "zh-CN": "中文",
      ja: "日本語",
    });
  });

  test("excludes the thinking language from translation requests", () => {
    expect(
      getPromptTranslationLangs({
        langs: ["ja", "zh-CN"],
        collapsedLangs: ["en"],
        sourceLanguage: "ja",
      }),
    ).toEqual(["zh-CN", "en"]);
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
});
