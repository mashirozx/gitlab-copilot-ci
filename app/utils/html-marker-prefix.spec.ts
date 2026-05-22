import { describe, expect, test } from "bun:test";
import { normalizeHtmlMarkerPrefix } from "./html-marker-prefix.ts";

describe("normalizeHtmlMarkerPrefix", () => {
  test("uses the default prefix when input is undefined", () => {
    expect(normalizeHtmlMarkerPrefix({ prefix: undefined })).toBe("copilot");
  });

  test("accepts multi-segment kebab-case prefixes", () => {
    expect(
      normalizeHtmlMarkerPrefix({
        prefix: "xiaomi-mimo-code-review",
      }),
    ).toBe("xiaomi-mimo-code-review");
  });

  test("rejects invalid prefix characters", () => {
    expect(() =>
      normalizeHtmlMarkerPrefix({
        prefix: "xiaomi_mimo",
      }),
    ).toThrow(
      "--html-marker-prefix must use lowercase letters, numbers, and hyphens only in kebab-case format",
    );
  });
});
