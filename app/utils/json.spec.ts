import { describe, expect, test } from "bun:test";
import { extractMarkedJsonText } from "./json";

describe("extractMarkedJsonText", () => {
  test("extracts JSON wrapped with start and end markers on one line", () => {
    expect(
      extractMarkedJsonText({
        text: '[COPILOT_JSON_START]{"summary":{"content":"ok","translations":{"zh-CN":"摘要"}},"reviews":[]}[COPILOT_JSON_END]',
        marker: "[COPILOT_JSON_START]",
        endMarker: "[COPILOT_JSON_END]",
      }),
    ).toBe(
      '{"summary":{"content":"ok","translations":{"zh-CN":"摘要"}},"reviews":[]}',
    );
  });

  test("falls back to multi-line wrapped marker extraction", () => {
    expect(
      extractMarkedJsonText({
        text: [
          "prefix",
          "[COPILOT_JSON_START]",
          '{"summary":{"content":"ok","translations":{"zh-CN":"摘要"}}}',
          "[COPILOT_JSON_END]",
          "suffix",
        ].join("\n"),
        marker: "[COPILOT_JSON_START]",
        endMarker: "[COPILOT_JSON_END]",
      }),
    ).toBe('{"summary":{"content":"ok","translations":{"zh-CN":"摘要"}}}');
  });
});
