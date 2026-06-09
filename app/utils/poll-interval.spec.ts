import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PENDING_CHECK_INTERVAL_MS,
  DEFAULT_REVIEW_MAX_PENDING_TIME_MS,
  formatPollInterval,
  parsePollInterval,
} from "./poll-interval";

describe("parsePollInterval", () => {
  test("parses supported millisecond, second, and minute suffixes", () => {
    expect(
      parsePollInterval({
        value: "250ms",
        optionName: "--mr-check-interval",
      }),
    ).toBe(250);
    expect(
      parsePollInterval({
        value: "10milliseconds",
        optionName: "--mr-check-interval",
      }),
    ).toBe(10);
    expect(
      parsePollInterval({
        value: "15s",
        optionName: "--mr-check-interval",
      }),
    ).toBe(15_000);
    expect(
      parsePollInterval({
        value: "30seconds",
        optionName: "--mr-check-interval",
      }),
    ).toBe(30_000);
    expect(
      parsePollInterval({
        value: "2m",
        optionName: "--mr-check-interval",
      }),
    ).toBe(120_000);
    expect(
      parsePollInterval({
        value: "3minutes",
        optionName: "--mr-check-interval",
      }),
    ).toBe(180_000);
  });

  test("rejects missing suffixes and non-integer values", () => {
    expect(() =>
      parsePollInterval({
        value: "10",
        optionName: "--mr-check-interval",
      }),
    ).toThrow("--mr-check-interval must use an integer duration");

    expect(() =>
      parsePollInterval({
        value: "1.5s",
        optionName: "--mr-check-interval",
      }),
    ).toThrow("--mr-check-interval must use an integer duration");
  });
});

describe("DEFAULT_PENDING_CHECK_INTERVAL_MS", () => {
  test("stays at 10 seconds", () => {
    expect(DEFAULT_PENDING_CHECK_INTERVAL_MS).toBe(10_000);
  });
});

describe("DEFAULT_REVIEW_MAX_PENDING_TIME_MS", () => {
  test("stays at 30 minutes", () => {
    expect(DEFAULT_REVIEW_MAX_PENDING_TIME_MS).toBe(1_800_000);
  });
});

describe("formatPollInterval", () => {
  test("formats configured durations for logs", () => {
    expect(formatPollInterval({ milliseconds: 60_000 })).toBe("1 minute(s)");
    expect(formatPollInterval({ milliseconds: 10_000 })).toBe("10 second(s)");
    expect(formatPollInterval({ milliseconds: 250 })).toBe(
      "250 millisecond(s)",
    );
  });
});
