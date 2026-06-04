import { describe, expect, test } from "bun:test";

process.env.GITLAB_TOKEN ??= "test-gitlab-token";
process.env.CI_SERVER_URL ??= "https://gitlab.example.com";
process.env.CI_PROJECT_ID ??= "1";
process.env.CI_MERGE_REQUEST_IID ??= "1";

const originalArgv = [...process.argv];

process.argv = [
  originalArgv[0] ?? "bun",
  originalArgv[1] ?? "test",
  "--gitlab-token",
  process.env.GITLAB_TOKEN,
  "--gitlab-url",
  process.env.CI_SERVER_URL,
  "--project-id",
  process.env.CI_PROJECT_ID,
  "--mr-iid",
  process.env.CI_MERGE_REQUEST_IID,
  "--thinking-lang",
  "en",
  "--model",
  "openai/gpt-5.4-mini:xhigh",
];

const { initI18n } = await import("../i18n");
await initI18n();

const {
  buildReviewDiscussionBody,
  getDisplayLanguages,
  getPromptTranslationLangs,
} = await import("./review-output");
const { formatCollapsedLanguageHeader } = await import("./lang");

const { modelDisplayName } = await import("./model-display.ts");

const {
  buildSummaryNote,
  buildPerformanceMetricsSection,
  encodeReviewHistory,
  getAgentDisplayLabel,
  renderSummaryComment,
  trimReviewHistoryRuns,
} = await import("./review-summary");

import type { ReviewItemEntity } from "../types/review.types";

const reviews: ReviewItemEntity[] = [
  {
    file_path: "src/a.ts",
    new_line: 10,
    rank: "HIGH",
    suggestion: "English first",
    translations: {
      "zh-CN": "中文第一条",
    },
  },
  {
    file_path: "src/b.ts",
    new_line: 20,
    rank: "LOW",
    suggestion: "English second",
    translations: {
      "zh-CN": "中文第二条",
    },
  },
];

const buildConcreteReviewSummaryTitle = ({
  llmName,
}: {
  llmName: string;
}): string => {
  return `# 📝 Code Review Summary by ${llmName}`;
};

describe("buildReviewDiscussionBody", () => {
  test("renders rank math and collapsed translated languages", () => {
    const collapsedHeader = formatCollapsedLanguageHeader({
      language: "zh-CN",
    });

    const body = buildReviewDiscussionBody({
      marker: "<!-- marker -->",
      review: reviews[0] as ReviewItemEntity,
      displayLanguages: ["en", "zh-CN"],
      collapsedLanguages: ["zh-CN"],
      sourceLanguage: "en",
    });

    expect(body).toContain("\\colorbox{#ff4d4f}");
    expect(body).toContain(modelDisplayName);
    expect(body).toContain("English first");
    expect(body).toContain("\n\n---\n\n<details>");
    expect(body).toContain(`<summary>${collapsedHeader}</summary>`);
    expect(body).toContain("中文第一条");
    expect(body).toContain("\n\n---");
  });

  test("uses triple newlines between non-collapsed displayed languages", () => {
    const body = buildReviewDiscussionBody({
      marker: "<!-- marker -->",
      review: reviews[0] as ReviewItemEntity,
      displayLanguages: ["en", "zh-CN"],
      collapsedLanguages: [],
      sourceLanguage: "en",
    });

    expect(body).toContain(
      `$\\colorbox{#ff4d4f}{\\color{white}{\\text{HIGH}}}$ ${modelDisplayName}\n\nEnglish first`,
    );
    expect(body).toContain("English first\n\n\n中文第一条");
  });
});

describe("modelDisplayName", () => {
  test("uses the shared configured model display constant", () => {
    expect(modelDisplayName).toContain("<kbd>");
  });
});

describe("renderSummaryComment", () => {
  test("formats collapsed language headers using localized names and flags", () => {
    const chineseHeader = formatCollapsedLanguageHeader({ language: "zh" });
    const chineseCnHeader = formatCollapsedLanguageHeader({
      language: "zh-CN",
    });
    const chineseHansHeader = formatCollapsedLanguageHeader({
      language: "zh-Hans",
    });
    const chineseHantHeader = formatCollapsedLanguageHeader({
      language: "zh-Hant",
    });
    const classicalChineseHeader = formatCollapsedLanguageHeader({
      language: "zh-lzh",
    });
    const classicalChineseHansHeader = formatCollapsedLanguageHeader({
      language: "zh-Hans-lzh",
    });
    const classicalChineseHantHeader = formatCollapsedLanguageHeader({
      language: "zh-Hant-lzh",
    });
    const englishHeader = formatCollapsedLanguageHeader({ language: "en" });
    const japaneseHeader = formatCollapsedLanguageHeader({ language: "ja" });

    expect(chineseHeader.endsWith("🇨🇳")).toBe(true);
    expect(chineseHeader.replace(" 🇨🇳", "").trim().length).toBeGreaterThan(0);

    expect(chineseCnHeader.endsWith("🇨🇳")).toBe(true);
    expect(chineseCnHeader.replace(" 🇨🇳", "")).toContain("中");

    expect(chineseHansHeader.endsWith("🇨🇳")).toBe(true);
    expect(chineseHansHeader).toContain("简");

    expect(chineseHantHeader.endsWith("🇨🇳")).toBe(true);
    expect(chineseHantHeader).toContain("繁");

    expect(classicalChineseHeader).toBe("文言文 🇨🇳");
    expect(classicalChineseHansHeader).toBe("文言文（简体） 🇨🇳");
    expect(classicalChineseHantHeader).toBe("文言文（繁體） 🇨🇳");

    expect(englishHeader.endsWith("🇬🇧")).toBe(true);
    expect(englishHeader.replace(" 🇬🇧", "")).toContain("English");

    expect(japaneseHeader).toBe("日本語");
  });

  test("renders the selected language summary block directly", () => {
    const collapsedHeader = formatCollapsedLanguageHeader({
      language: "zh-CN",
    });

    const rendered = renderSummaryComment({
      summary: {
        content: `${buildConcreteReviewSummaryTitle({ llmName: "GPT-5.4" })}

## 📋 Pull Request Changes
English changes.

## 🔍 Review Summary
Found 2 suggestion(s) from GitHub Copilot:

- src/a.ts:10: first
- src/b.ts:20: second

## 💡 Other Suggestions
None.`,
        translations: {
          "zh-CN": `# 📝 GPT-5.4 代码审查总结 (zh-CN)

## 📋 Pull Request Changes
中文变更。

## 🔍 Review Summary
发现 2 条建议：

- src/a.ts:10: 第一条
- src/b.ts:20: 第二条

## 💡 Other Suggestions
无。`,
        },
      },
      displayLanguages: ["zh-CN"],
      collapsedLanguages: ["zh-CN"],
    });

    expect(rendered).not.toContain("English changes.");
    expect(rendered).toContain(`<summary>${collapsedHeader}</summary>`);
    expect(rendered).toContain("发现 2 条建议：");
    expect(rendered).toContain("- src/a.ts:10: 第一条");
    expect(rendered).toContain("- src/b.ts:20: 第二条");
  });

  test("requests and renders collapsed-only languages from the merged language set", () => {
    const collapsedHeader = formatCollapsedLanguageHeader({
      language: "zh-CN",
    });

    const translationLangs = getPromptTranslationLangs({
      langs: [],
      collapsedLangs: ["zh-CN", "en", "zh-CN"],
      sourceLanguage: "en",
    });

    expect(translationLangs).toEqual(["zh-CN"]);

    const rendered = renderSummaryComment({
      summary: {
        content: `${buildConcreteReviewSummaryTitle({ llmName: "GPT-5.4" })}

## 📋 Pull Request Changes
English changes.

## 🔍 Review Summary
Found 1 suggestion(s) from GitHub Copilot:

- src/a.ts:10: first

## 💡 Other Suggestions
None.`,
        translations: {
          "zh-CN": `# 📝 GPT-5.4 代码审查总结 (zh-CN)

## 📋 Pull Request Changes
中文变更。

## 🔍 Review Summary
发现 1 条建议：

- src/a.ts:10: 第一条

## 💡 Other Suggestions
无。`,
        },
      },
      displayLanguages: getDisplayLanguages({
        langs: [],
        collapsedLangs: ["zh-CN"],
        sourceLanguage: "en",
      }),
      collapsedLanguages: ["zh-CN"],
      sourceLanguage: "en",
    });

    expect(rendered).toContain(`<summary>${collapsedHeader}</summary>`);
    expect(rendered).toContain("中文变更。");
    expect(rendered).not.toContain("English changes.");
  });

  test("keeps requested language content even when translated headers omit lang suffixes", () => {
    const englishHeader = formatCollapsedLanguageHeader({
      language: "en",
    });
    const japaneseHeader = formatCollapsedLanguageHeader({
      language: "ja",
    });

    const rendered = renderSummaryComment({
      summary: {
        content: `${buildConcreteReviewSummaryTitle({ llmName: "GPT-5.4" })}

## 📋 Pull Request Changes
English changes.

## 🔍 Review Summary
Found 1 suggestion(s) from GitHub Copilot:

- src/a.ts:10: first

## 💡 Other Suggestions
None.`,
        translations: {
          "zh-CN": `# 📝 GPT-5.4 代码审查总结

## 📋 Pull Request Changes
中文变更。

## 🔍 Review Summary
发现 1 条建议：

- src/a.ts:10: 第一条

## 💡 Other Suggestions
无。`,
          ja: `# 📝 GPT-5.4 コードレビュー要約

## 📋 Pull Request Changes
日本語の変更。

## 🔍 Review Summary
1 件の提案が見つかりました。

- src/a.ts:10: 1つ目

## 💡 Other Suggestions
なし。`,
        },
      },
      displayLanguages: getDisplayLanguages({
        langs: ["zh-CN"],
        collapsedLangs: ["en", "ja"],
        sourceLanguage: "en",
      }),
      collapsedLanguages: ["en", "ja"],
      sourceLanguage: "en",
    });

    expect(rendered).toContain("中文变更。");
    expect(rendered).toContain(`<summary>${englishHeader}</summary>`);
    expect(rendered).toContain("English changes.");
    expect(rendered).toContain(`<summary>${japaneseHeader}</summary>`);
    expect(rendered).toContain("日本語の変更。");
  });

  test("reads summary translations directly by language key", () => {
    const englishHeader = formatCollapsedLanguageHeader({
      language: "en",
    });
    const japaneseHeader = formatCollapsedLanguageHeader({
      language: "ja",
    });

    const rendered = renderSummaryComment({
      summary: {
        content: `${buildConcreteReviewSummaryTitle({ llmName: "GPT-5.4" })}

## 📋 Pull Request Changes
English changes.

## 🔍 Review Summary
Found 1 suggestion(s) from GitHub Copilot:

- src/a.ts:10: first

## 💡 Other Suggestions
None.`,
        translations: {
          ja: `# 📝 GPT-5.4 コードレビュー要約

## 📋 Pull Request Changes
日本語の変更。

## 🔍 Review Summary
1 件の提案が見つかりました。

- src/a.ts:10: 1つ目

## 💡 Other Suggestions
なし。`,
        },
      },
      displayLanguages: ["en", "ja"],
      collapsedLanguages: ["en", "ja"],
      sourceLanguage: "en",
    });

    expect(rendered).toContain(`<summary>${englishHeader}</summary>`);
    expect(rendered).toContain("English changes.");
    expect(rendered).toContain(`<summary>${japaneseHeader}</summary>`);
    expect(rendered).toContain("日本語の変更。");
  });

  test("skips missing requested language blocks", () => {
    const rendered = renderSummaryComment({
      summary: {
        content: `${buildConcreteReviewSummaryTitle({ llmName: "GPT-5.4" })}

## 📋 Pull Request Changes
English changes.`,
        translations: {},
      },
      displayLanguages: ["en", "ja"],
      collapsedLanguages: ["ja"],
      sourceLanguage: "en",
    });

    expect(rendered).toContain("English changes.");
    expect(rendered).not.toContain("<summary>ja</summary>");
  });

  test("renders original summary content directly for a non-English thinking language", () => {
    const japaneseHeader = formatCollapsedLanguageHeader({
      language: "ja",
    });

    const rendered = renderSummaryComment({
      summary: {
        content: `# 📝 GPT-5.4 コードレビュー要約

## 📋 Pull Request Changes
日本語の変更。

## 🔍 Review Summary
1 件の提案が見つかりました。

- src/a.ts:10: 1つ目

## 💡 Other Suggestions
なし。`,
        translations: {
          en: `${buildConcreteReviewSummaryTitle({ llmName: "GPT-5.4" })}

## 📋 Pull Request Changes
English changes.

## 🔍 Review Summary
Found 1 suggestion(s) from GitHub Copilot:

- src/a.ts:10: first

## 💡 Other Suggestions
None.`,
        },
      },
      displayLanguages: ["ja", "en"],
      collapsedLanguages: ["ja"],
      sourceLanguage: "ja",
    });

    expect(rendered).toContain(`<summary>${japaneseHeader}</summary>`);
    expect(rendered).toContain("日本語の変更。");
    expect(rendered).toContain("English changes.");
  });
});

describe("getAgentDisplayLabel", () => {
  test("formats the GitHub Copilot CLI display label with version", () => {
    const label = getAgentDisplayLabel({
      agent: "github-copilot-cli",
      getCommandOutput: () =>
        "GitHub Copilot CLI 1.0.54.\nRun 'copilot update' to check for updates.\n",
    });

    expect(label).toBe("GitHub Copilot CLI 1.0.54");
  });

  test("formats the Pi Coding Agent display label with version", () => {
    const label = getAgentDisplayLabel({
      agent: "pi",
      getCommandOutput: () => "\n0.75.5\n",
    });

    expect(label).toBe("Pi Coding Agent 0.75.5");
  });

  test("parses the Pi version when it is printed to stderr", () => {
    const label = getAgentDisplayLabel({
      agent: "pi",
      getCommandOutput: () => "\n0.75.5\n",
    });

    expect(label).toBe("Pi Coding Agent 0.75.5");
  });

  test("uses the resolved Pi binary path and long version flag", () => {
    const originalPiBin = process.env.PI_BIN;
    process.env.PI_BIN = "/custom/bin/pi";

    try {
      const label = getAgentDisplayLabel({
        agent: "pi",
        getCommandOutput: ({ command, args }) => {
          expect(command).toBe("/custom/bin/pi");
          expect(args).toEqual(["--version"]);
          return "\n0.75.5\n";
        },
      });

      expect(label).toBe("Pi Coding Agent 0.75.5");
    } finally {
      if (originalPiBin === undefined) {
        delete process.env.PI_BIN;
      } else {
        process.env.PI_BIN = originalPiBin;
      }
    }
  });
});

describe("buildPerformanceMetricsSection", () => {
  test("renders the agent line between model and time taken", () => {
    const section = buildPerformanceMetricsSection({
      response: {
        summary: { content: "", translations: {} },
        reviews: [],
        duration: 1234,
      },
      agentDisplay: "GitHub Copilot CLI 1.0.54",
    });

    expect(section).toContain(`- 🤖 **Model**: ${modelDisplayName}`);
    expect(section).toContain("- 🧰 **Agent**: GitHub Copilot CLI 1.0.54");
    expect(section).toContain("- ⏱️ **Time taken**: 1s (1234ms)");
    expect(section.indexOf("**Model**")).toBeLessThan(
      section.indexOf("**Agent**"),
    );
    expect(section.indexOf("**Agent**")).toBeLessThan(
      section.indexOf("**Time taken**"),
    );
  });

  test("renders detailed Pi token usage when available", () => {
    const section = buildPerformanceMetricsSection({
      response: {
        summary: { content: "", translations: {} },
        reviews: [],
        duration: 1234,
        usage: {
          input: 513,
          output: 74,
          cacheRead: 1024,
          cacheWrite: 0,
          totalTokens: 1611,
          cost: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            total: 0,
          },
        },
      },
      agentDisplay: "Pi Coding Agent 0.75.5",
    });

    expect(section).toContain(
      "<summary>📊 Model Usage & Performance Matrix</summary>",
    );
    expect(section).toContain("- 📥 **Input tokens**: 513");
    expect(section).toContain("- 📤 **Output tokens**: 74");
    expect(section).toContain("- 📚 **Cache read tokens**: 1024");
    expect(section).toContain(
      "<summary>📊 Model Usage & Performance Matrix</summary>",
    );
    expect(section).toContain("- ✍️ **Cache write tokens**: 0");
    expect(section).toContain("- 🔢 **Total tokens**: 1611");
    expect(section).toContain("- 💸 **Total cost**: 0");
  });

  test("uses the localized performance summary label", () => {
    const section = buildPerformanceMetricsSection({
      response: {
        summary: { content: "", translations: {} },
        reviews: [],
        duration: 1234,
      },
      agentDisplay: "GitHub Copilot CLI 1.0.54",
    });

    expect(section).toContain(
      "<summary>📊 Model Usage & Performance Matrix</summary>",
    );
  });

  test("renders runtime stats when they are available", () => {
    const section = buildPerformanceMetricsSection({
      response: {
        summary: { content: "", translations: {} },
        reviews: [],
        runtimeStats: {
          platform: "darwin",
          sampleCount: 3,
          sampleIntervalMs: 500,
          parent: {
            peakRssBytes: 4 * 1024 * 1024,
            peakHeapUsedBytes: 2 * 1024 * 1024,
            cpuUserMicros: 1_500_000,
            cpuSystemMicros: 500_000,
          },
          agent: {
            peakTreeRssBytes: 8 * 1024 * 1024,
            peakTreeCpuPercent: 75.5,
            peakProcessCount: 2,
            totalReadBytes: 1024,
            totalWriteBytes: 2048,
          },
          capabilities: {
            childMemory: "best-effort",
            childCpu: "best-effort",
            childDiskIo: "unsupported",
            notes: ["runtime note"],
          },
        },
      },
      agentDisplay: "Pi Coding Agent 0.75.5",
    });

    expect(section).toContain(
      "<summary>📊 Model Usage & Performance Matrix</summary>",
    );
    expect(section).toContain("- 🖥️ **Runtime stats platform**: darwin");
    expect(section).toContain("- 🧠 **Parent peak RSS**: 4.00 MB");
    expect(section).toContain("- 🌲 **Agent peak tree RSS**: 8.00 MB");
    expect(section).toContain("- 🔥 **Agent peak tree CPU**: 75.5%");
    expect(section).toContain("- 📀 **Agent read bytes**: 1.00 KB");
    expect(section).toContain("- 💾 **Agent write bytes**: 2.00 KB");
    expect(section).toContain("runtime note");
    expect(section).not.toContain("## 📊 Model Usage & Performance Matrix");
  });
});

describe("review history summary data", () => {
  test("trims review history to the latest configured runs", () => {
    const trimmed = trimReviewHistoryRuns({
      reviewHistory: [
        {
          discussions: [
            {
              discussion_id: "1",
              note_id: "1",
              content: {
                suggestion: "oldest",
                file_path: "a.ts",
                old_line: null,
                new_line: 1,
              },
            },
          ],
        },
        {
          discussions: [
            {
              discussion_id: "2",
              note_id: "2",
              content: {
                suggestion: "middle",
                file_path: "b.ts",
                old_line: null,
                new_line: 2,
              },
            },
          ],
        },
        {
          discussions: [
            {
              discussion_id: "3",
              note_id: "3",
              content: {
                suggestion: "latest",
                file_path: "c.ts",
                old_line: null,
                new_line: 3,
              },
            },
          ],
        },
      ],
      maxHistoryLength: 2,
    });

    expect(trimmed).toHaveLength(2);
    expect(trimmed[0]?.discussions[0]?.content.suggestion).toBe("middle");
    expect(trimmed[1]?.discussions[0]?.content.suggestion).toBe("latest");
  });

  test("appends the encoded review history block at the end of the summary note", () => {
    const reviewHistory = [
      {
        discussions: [
          {
            discussion_id: "discussion-1",
            note_id: "note-1",
            content: {
              suggestion: "Existing suggestion",
              file_path: "src/a.ts",
              old_line: null,
              new_line: 10,
            },
          },
        ],
      },
    ];
    const encodedReviewHistory = encodeReviewHistory({
      reviewHistory,
    });
    const summaryBody = buildSummaryNote({
      response: {
        summary: {
          content: `${buildConcreteReviewSummaryTitle({ llmName: "GPT-5.4" })}

## 📋 Pull Request Changes
English changes.`,
          translations: {},
        },
        reviews: [],
      },
      reviewHistory,
      errors: [],
    });

    expect(summaryBody).toContain("<!-- copilot-review-data-start -->");
    expect(summaryBody).toContain(encodedReviewHistory);
    expect(summaryBody).toContain("<!-- copilot-review-data-end -->");
    expect(
      summaryBody.trim().endsWith("<!-- copilot-review-data-end -->"),
    ).toBe(true);
  });
});
