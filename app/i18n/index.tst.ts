import { describe, expect, test } from "tstyche";
import type { TranslationArgs, TranslationKey } from "./index.ts";

describe("i18n types", () => {
  test("TranslationKey matches the exact dot-path union", () => {
    expect<TranslationKey>().type.toBe<
      | "reviewSummary.performanceMetrics.summary"
      | "reviewProcess.reviewingMarker.body"
      | "reviewProcess.reviewingMarker.manualDeleteHint"
      | "reviewProcess.reviewingMarker.queueNotice"
    >();
  });

  test("translation argument tuples preserve the expected placeholder names", () => {
    expect<
      TranslationArgs<"reviewSummary.performanceMetrics.summary">
    >().type.toBe<["reviewSummary.performanceMetrics.summary"]>();
    expect<
      TranslationArgs<"reviewProcess.reviewingMarker.manualDeleteHint">
    >().type.toBe<["reviewProcess.reviewingMarker.manualDeleteHint"]>();
    expect<
      TranslationArgs<"reviewProcess.reviewingMarker.queueNotice">
    >().type.toBe<
      ["reviewProcess.reviewingMarker.queueNotice", { count: number }]
    >();
    expect<TranslationArgs<"reviewProcess.reviewingMarker.body">>().type.toBe<
      [
        "reviewProcess.reviewingMarker.body",
        {
          commitReference: string;
        },
      ]
    >();
  });

  test("translation argument tuples reject wrong placeholder names by shape", () => {
    expect<
      TranslationArgs<"reviewSummary.performanceMetrics.summary">
    >().type.not.toBe<
      [
        "reviewSummary.performanceMetrics.summary",
        {
          count: number;
        },
      ]
    >();
    expect<
      TranslationArgs<"reviewProcess.reviewingMarker.body">
    >().type.not.toBe<
      [
        "reviewProcess.reviewingMarker.body",
        {
          commitSha: string;
        },
      ]
    >();
    expect<
      TranslationArgs<"reviewProcess.reviewingMarker.queueNotice">
    >().type.not.toBe<
      ["reviewProcess.reviewingMarker.queueNotice", { seconds: number }]
    >();
    expect<
      TranslationArgs<"reviewProcess.reviewingMarker.queueNotice">
    >().type.not.toBe<
      [
        "reviewProcess.reviewingMarker.queueNotice",
        {
          count: number;
          extra: boolean;
        },
      ]
    >();
    expect<
      TranslationArgs<"reviewProcess.reviewingMarker.manualDeleteHint">
    >().type.not.toBe<
      [
        "reviewProcess.reviewingMarker.manualDeleteHint",
        {
          seconds: number;
        },
      ]
    >();
  });
});
