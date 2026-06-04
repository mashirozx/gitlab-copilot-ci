import { describe, expect, test } from "bun:test";
import {
  formatCollapsedLanguageHeader,
  getLanguageDisplayName,
  getLanguageFlagEmoji,
  getLanguageFlagTag,
  normalizeLanguageTagForDisplay,
} from "./lang.ts";

describe("lang helpers", () => {
  test("keeps canonical tags and falls back empty display tags to en", () => {
    expect(normalizeLanguageTagForDisplay({ language: "en" })).toBe("en");
    expect(normalizeLanguageTagForDisplay({ language: "" })).toBe("en");
  });

  test("resolves aliased flag tags and emojis", () => {
    expect(getLanguageFlagTag({ languageTag: "zh-Hans" })).toBe("zh-CN");
    expect(getLanguageFlagEmoji({ languageTag: "zh-Hans" })).toBe("🇨🇳");
    expect(getLanguageFlagEmoji({ languageTag: "ja" })).toBe("");
  });

  test("uses fallback display names for unsupported classical Chinese tags", () => {
    expect(getLanguageDisplayName({ language: "zh-lzh" })).toBe("文言文");
    expect(getLanguageDisplayName({ language: "zh-Hant-lzh" })).toBe(
      "文言文（繁體）",
    );
  });

  test("formats collapsed language headers with cached display names and flags", () => {
    expect(formatCollapsedLanguageHeader({ language: "zh-Hans-lzh" })).toBe(
      "文言文（简体） 🇨🇳",
    );
    expect(
      formatCollapsedLanguageHeader({ language: "en" }).endsWith("🇬🇧"),
    ).toBe(true);
  });
});
