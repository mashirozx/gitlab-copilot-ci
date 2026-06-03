import { describe, expect, test } from "bun:test";
import {
  formatStdoutSize,
  getStdoutPrintBudgetBytes,
  parseStdoutSize,
} from "./stdout-size";

describe("parseStdoutSize", () => {
  test("parses case-insensitive size suffixes", () => {
    expect(
      parseStdoutSize({
        value: "10MB",
        optionName: "--max-stdout-size",
      }),
    ).toBe(10 * 1024 * 1024);
    expect(
      parseStdoutSize({
        value: "10kb",
        optionName: "--max-stdout-size",
      }),
    ).toBe(10 * 1024);
    expect(
      parseStdoutSize({
        value: "10B",
        optionName: "--max-stdout-size",
      }),
    ).toBe(10);
  });

  test("rejects missing suffixes", () => {
    expect(() =>
      parseStdoutSize({
        value: "10",
        optionName: "--max-stdout-size",
      }),
    ).toThrow("--max-stdout-size must use a size suffix");
  });
});

describe("getStdoutPrintBudgetBytes", () => {
  test("uses an 80 percent print budget", () => {
    expect(
      getStdoutPrintBudgetBytes({
        maxStdoutSizeBytes: 10 * 1024,
      }),
    ).toBe(8 * 1024);
  });
});

describe("formatStdoutSize", () => {
  test("renders helpful unit strings for warnings", () => {
    expect(formatStdoutSize({ bytes: 10 })).toBe("10B");
    expect(formatStdoutSize({ bytes: 10 * 1024 })).toBe("10KB");
    expect(formatStdoutSize({ bytes: 10 * 1024 * 1024 })).toBe("10MB");
  });
});
