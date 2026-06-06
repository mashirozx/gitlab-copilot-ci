import { afterEach, describe, expect, mock, test } from "bun:test";

const loadI18nModule = async ({
  thinkingLang = "en",
}: {
  thinkingLang?: string;
} = {}) => {
  mock.module("../utils/argv", () => ({
    argv: {
      "thinking-lang": thinkingLang,
    },
  }));

  const module = await import(`./index?test=${Date.now()}`);
  await module.initI18n();
  return module;
};

afterEach(() => {
  mock.restore();
});

describe("t", () => {
  test("uses the configured locale directly", async () => {
    const { t } = await loadI18nModule({ thinkingLang: "ja" });

    expect(t("reviewProcess.reviewingMarker.queueNotice", { count: 12 })).toBe(
      "現在のレビューの後ろに、さらに 12 件のレビューが待機しています。",
    );
    expect(t("reviewSummary.performanceMetrics.summary")).toBe(
      "📊 モデル使用量・パフォーマンス指標",
    );
    expect(t("reviewSummary.errors.summary")).toBe("⚠️ エラー");
  });

  test("uses the zero branch as a distinct sentence", async () => {
    const { t } = await loadI18nModule({ thinkingLang: "en" });

    expect(t("reviewProcess.reviewingMarker.queueNotice", { count: 0 })).toBe(
      "No additional reviews are waiting behind the current one.",
    );
  });

  test("uses the singular branch when count is one", async () => {
    const { t } = await loadI18nModule({ thinkingLang: "en" });

    expect(t("reviewProcess.reviewingMarker.queueNotice", { count: 1 })).toBe(
      "There is 1 additional review waiting behind the current one.",
    );
  });

  test("supports zh-Hans and zh-Hant locale variants directly", async () => {
    const { t: tHans } = await loadI18nModule({ thinkingLang: "zh-Hans" });

    expect(tHans("reviewProcess.reviewingMarker.manualDeleteHint")).toContain(
      "手动删除这条评论",
    );

    const { t: tHant } = await loadI18nModule({ thinkingLang: "zh-Hant" });

    expect(tHant("reviewProcess.reviewingMarker.manualDeleteHint")).toContain(
      "手動刪除這則留言",
    );
  });

  test("supports classical Chinese locales directly", async () => {
    const { t } = await loadI18nModule({ thinkingLang: "zh-lzh" });

    expect(
      t("reviewProcess.reviewingMarker.queueNotice", { count: 1 }),
    ).toContain("评审待行");
  });

  test("falls back to the primary language when the region variant is missing", async () => {
    const { resolveLocaleKey, t } = await loadI18nModule({
      thinkingLang: "zh-SG",
    });

    expect(resolveLocaleKey()).toBe("zh");
    expect(
      t("reviewProcess.reviewingMarker.body", {
        commitReference: "abc123",
      }),
    ).toContain("我正在审查提交 abc123");
  });

  test("falls back to English when the configured language is unsupported", async () => {
    const { resolveLocaleKey, t } = await loadI18nModule({
      thinkingLang: "xx-YY",
    });

    expect(resolveLocaleKey()).toBe("en");
    expect(t("reviewProcess.reviewingMarker.manualDeleteHint")).toContain(
      "manually delete this comment",
    );
  });

  test("interpolates placeholders using typed parameter names", async () => {
    const { t } = await loadI18nModule({ thinkingLang: "en" });

    expect(
      t("reviewProcess.reviewingMarker.body", {
        commitReference: "abc",
      }),
    ).toBe(
      "⚠️ Code review is in progress... I am reviewing commit abc. To avoid conflicts, I will hold further reviews until the current one is concluded.",
    );
  });
});
