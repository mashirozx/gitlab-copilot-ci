import { describe, expect, test } from "bun:test";
import {
  buildReviewDiscussionBody,
  getDisplayLanguages,
  getPromptTranslationLangs,
} from "./review-output";

process.env.GITLAB_TOKEN ??= "test-gitlab-token";
process.env.CI_SERVER_URL ??= "https://gitlab.example.com";
process.env.CI_PROJECT_ID ??= "1";
process.env.CI_MERGE_REQUEST_IID ??= "1";

const {
  buildPerformanceMetricsSection,
  getAgentDisplayLabel,
  renderSummaryComment,
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
    const body = buildReviewDiscussionBody({
      marker: "<!-- marker -->",
      review: reviews[0] as ReviewItemEntity,
      model: "gpt-5.4 (high)",
      displayLanguages: ["english", "zh-CN"],
      collapsedLanguages: ["zh-CN"],
    });

    expect(body).toContain("\\colorbox{#ff4d4f}");
    expect(body).toContain("gpt-5.4 (high)");
    expect(body).toContain("English first");
    expect(body).toContain("\n\n---\n\n<details>");
    expect(body).toContain("<summary>zh-CN</summary>");
    expect(body).toContain("中文第一条");
    expect(body).toContain("\n\n---");
  });

  test("uses triple newlines between non-collapsed displayed languages", () => {
    const body = buildReviewDiscussionBody({
      marker: "<!-- marker -->",
      review: reviews[0] as ReviewItemEntity,
      model: "gpt-5.4 (high)",
      displayLanguages: ["english", "zh-CN"],
      collapsedLanguages: [],
    });

    expect(body).toContain(
      "$\\colorbox{#ff4d4f}{\\color{white}{\\text{HIGH}}}$ gpt-5.4 (high)\n\nEnglish first",
    );
    expect(body).toContain("English first\n\n\n中文第一条");
  });
});

describe("renderSummaryComment", () => {
  test("renders the selected language summary block directly", () => {
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
    expect(rendered).toContain("<summary>zh-CN</summary>");
    expect(rendered).toContain("发现 2 条建议：");
    expect(rendered).toContain("- src/a.ts:10: 第一条");
    expect(rendered).toContain("- src/b.ts:20: 第二条");
  });

  test("requests and renders collapsed-only languages from the merged language set", () => {
    const translationLangs = getPromptTranslationLangs({
      langs: [],
      collapsedLangs: ["zh-CN", "english", "zh-CN"],
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
      }),
      collapsedLanguages: ["zh-CN"],
    });

    expect(rendered).toContain("<summary>zh-CN</summary>");
    expect(rendered).toContain("中文变更。");
    expect(rendered).not.toContain("English changes.");
  });

  test("keeps requested language content even when translated headers omit lang suffixes", () => {
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
      }),
      collapsedLanguages: ["en", "ja"],
    });

    expect(rendered).toContain("中文变更。");
    expect(rendered).toContain("<summary>en</summary>");
    expect(rendered).toContain("English changes.");
    expect(rendered).toContain("<summary>ja</summary>");
    expect(rendered).toContain("日本語の変更。");
  });

  test("reads summary translations directly by language key", () => {
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
    });

    expect(rendered).toContain("<summary>en</summary>");
    expect(rendered).toContain("English changes.");
    expect(rendered).toContain("<summary>ja</summary>");
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
    });

    expect(rendered).toContain("English changes.");
    expect(rendered).not.toContain("<summary>ja</summary>");
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
        model: "gpt-5.4 (high)",
        duration: 1234,
      },
      agentDisplay: "GitHub Copilot CLI 1.0.54",
    });

    expect(section).toContain("- 🤖 **Model**: gpt-5.4 (high)");
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
        model: "gpt-5.4-mini",
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

    expect(section).toContain("- 📥 **Input tokens**: 513");
    expect(section).toContain("- 📤 **Output tokens**: 74");
    expect(section).toContain("- 📚 **Cache read tokens**: 1024");
    expect(section).toContain("- ✍️ **Cache write tokens**: 0");
    expect(section).toContain("- 🔢 **Total tokens**: 1611");
    expect(section).toContain("- 💸 **Total cost**: 0");
  });
});
