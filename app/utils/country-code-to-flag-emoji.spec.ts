import { describe, expect, test } from "bun:test";
import { countryCodeToFlagEmoji } from "./country-code-to-flag-emoji";

const buildEmojiFromCodePoints = (...codePoints: number[]): string => {
  return String.fromCodePoint(...codePoints);
};

describe("countryCodeToFlagEmoji", () => {
  test("throws for an empty country code", () => {
    expect(() => countryCodeToFlagEmoji("")).toThrow("countryCode is required");
  });

  test("converts ISO alpha-2 codes and IETF tags into flag emoji", () => {
    const cases = [
      ["PL", "🇵🇱"],
      ["pl", "🇵🇱"],
      ["pl-PL", "🇵🇱"],
      ["ar-AE", "🇦🇪"],
      ["pl-pl", "🇵🇱"],
    ] as const;

    for (const [countryCode, expectedFlag] of cases) {
      expect(countryCodeToFlagEmoji(countryCode)).toBe(expectedFlag);
    }
  });

  test("converts English language tags into the matching regional flag", () => {
    const cases = [
      ["en-US", "🇺🇸"],
      ["en-SG", "🇸🇬"],
      ["en-GB", "🇬🇧"],
      ["en-AU", "🇦🇺"],
      ["en-CA", "🇨🇦"],
    ] as const;

    for (const [countryCode, expectedFlag] of cases) {
      expect(countryCodeToFlagEmoji(countryCode)).toBe(expectedFlag);
    }
  });

  test("converts Chinese language tags into the matching regional flag", () => {
    const cases = [
      ["zh-CN", "🇨🇳"],
      ["zh-TW", "🇹🇼"],
      ["zh-SG", "🇸🇬"],
      ["zh-HK", "🇭🇰"],
    ] as const;

    for (const [countryCode, expectedFlag] of cases) {
      expect(countryCodeToFlagEmoji(countryCode)).toBe(expectedFlag);
    }
  });

  test("converts UK extended region codes into subdivision flag emoji", () => {
    const cases = [
      [
        "GB-SCT",
        buildEmojiFromCodePoints(
          0x1f3f4,
          0xe0067,
          0xe0062,
          0xe0073,
          0xe0063,
          0xe0074,
          0xe007f,
        ),
      ],
      [
        "gb-sct",
        buildEmojiFromCodePoints(
          0x1f3f4,
          0xe0067,
          0xe0062,
          0xe0073,
          0xe0063,
          0xe0074,
          0xe007f,
        ),
      ],
      [
        "GB-CYM",
        buildEmojiFromCodePoints(
          0x1f3f4,
          0xe0067,
          0xe0062,
          0xe0077,
          0xe006c,
          0xe0073,
          0xe007f,
        ),
      ],
    ] as const;

    for (const [countryCode, expectedFlag] of cases) {
      expect(countryCodeToFlagEmoji(countryCode)).toBe(expectedFlag);
    }
  });
});
