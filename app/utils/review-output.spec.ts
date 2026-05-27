import { describe, expect, test } from "bun:test";
import { normalizeReviewResponse } from "./review-output";

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
});
