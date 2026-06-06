import { describe, expect, test } from "tstyche";
import type { TranslationArgs, TranslationKey } from "./index.ts";

describe("i18n types", () => {
  test("TranslationKey includes representative summary and process keys and excludes removed legacy keys", () => {
    expect<
      "reviewSummary.performanceMetrics.summary" extends TranslationKey
        ? true
        : false
    >().type.toBe<true>();
    expect<
      "reviewSummary.title" extends TranslationKey ? true : false
    >().type.toBe<true>();
    expect<
      "reviewSummary.rank.high" extends TranslationKey ? true : false
    >().type.toBe<true>();
    expect<
      "reviewProcess.reviewingMarker.body" extends TranslationKey ? true : false
    >().type.toBe<true>();
    expect<
      "reviewSummary.content" extends TranslationKey ? true : false
    >().type.toBe<false>();
  });

  test("translation argument tuples preserve placeholder names and the optional lang override", () => {
    expect<
      TranslationArgs<"reviewSummary.performanceMetrics.summary">
    >().type.toBe<
      ["reviewSummary.performanceMetrics.summary", { lang?: string }?]
    >();
    expect<
      TranslationArgs<"reviewProcess.reviewingMarker.manualDeleteHint">
    >().type.toBe<
      ["reviewProcess.reviewingMarker.manualDeleteHint", { lang?: string }?]
    >();
    expect<
      TranslationArgs<"reviewProcess.reviewingMarker.queueNotice">
    >().type.toBe<
      [
        "reviewProcess.reviewingMarker.queueNotice",
        { count: number; lang?: string },
      ]
    >();
    expect<TranslationArgs<"reviewProcess.reviewingMarker.body">>().type.toBe<
      [
        "reviewProcess.reviewingMarker.body",
        {
          commitReference: string;
          lang?: string;
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
