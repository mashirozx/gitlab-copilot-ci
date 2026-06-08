import { describe, expect, test } from "bun:test";
import type { ReviewResponseEntity } from "../../types/review.types";

process.env.GITLAB_TOKEN ??= "test-gitlab-token";
process.env.CI_SERVER_URL ??= "https://gitlab.example.com";
process.env.CI_PROJECT_ID ??= "1";
process.env.CI_MERGE_REQUEST_IID ??= "1";
process.env.CI_PROJECT_URL ??= "https://gitlab.example.com/group/repo-name";
process.env.CI_COMMIT_SHA ??= "1234567890abcdef1234567890abcdef12345678";
process.env.CI_COMMIT_SHORT_SHA ??= "12345678";

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

const { initI18n } = await import("../../i18n");
await initI18n({
  languageTag: "en",
  preloadLanguageTags: ["en", "ja", "zh-Hant-lzh"],
});

const { formatCollapsedLanguageHeader } = await import("../lang");
const { modelDisplayName } = await import("../model-display.ts");
const {
  buildPerformanceMetricsSection,
  buildSummaryNote,
  encodeReviewHistory,
  getAgentDisplayLabel,
  renderSummaryComment,
  trimReviewHistoryRuns,
} = await import("./summary-comment-builder");

const buildResponse = (): ReviewResponseEntity => ({
  readableModelName: "GPT-5.4",
  summary: {
    walkthrough: {
      en: "English changes.",
      ja: "日本語の変更。",
    },
    changes: [
      {
        en: {
          step: "Wire runtime summary",
          layers: [
            {
              title: "Runtime",
              files: ["app/main.ts"],
              summary: "Uses the structured summary object directly.",
            },
          ],
        },
        ja: {
          step: "実行時要約の接続",
          layers: [
            {
              title: "ランタイム",
              files: ["app/main.ts"],
              summary: "構造化された要約オブジェクトを直接使います。",
            },
          ],
        },
      },
    ],
    otherSuggestions: {
      en: "None.",
      ja: "なし。",
    },
  },
  reviews: [
    {
      file_path: "src/a.ts",
      new_line: 10,
      rank: "HIGH",
      suggestions: {
        en: {
          detail: "Use the structured summary fields directly.",
          abstract: "Use the new fields directly.",
        },
        ja: {
          detail: "構造化された summary フィールドを直接使ってください。",
          abstract: "新しいフィールドを直接使います。",
        },
      },
    },
  ],
});

describe("renderSummaryComment", () => {
  test("renders the selected language block directly from the structured summary response", () => {
    const rendered = renderSummaryComment({
      response: buildResponse(),
      displayLanguages: ["ja"],
      collapsedLanguages: [],
      hasPreviousReviewHistory: false,
    });

    expect(rendered).toContain("# 📝 GPT-5.4 によるコードレビュー要約");
    expect(rendered).toContain("## 📋 ウォークスルー");
    expect(rendered).toContain("日本語の変更。");
    expect(rendered).toContain("構造化された要約オブジェクトを直接使います。");
    expect(rendered).not.toContain("English changes.");
  });

  test("renders current-run review locations as links when a created note id is available", () => {
    process.env.CI_PROJECT_URL = "https://gitlab.example.com/group/repo-name";

    const rendered = renderSummaryComment({
      response: buildResponse(),
      displayLanguages: ["en"],
      collapsedLanguages: [],
      hasPreviousReviewHistory: false,
      currentRunDiscussions: [
        {
          discussion_id: "discussion-1",
          note_id: "18239",
          content: {
            suggestion: "Use the new fields directly.",
            file_path: "src/a.ts",
            old_line: null,
            new_line: 10,
          },
        },
      ],
    });

    expect(rendered).toContain(
      "[`src/a.ts:10`](https://gitlab.example.com/group/repo-name/-/merge_requests/1#note_18239)",
    );
  });

  test("keeps plain review locations when no created discussion link is available", () => {
    delete process.env.CI_PROJECT_URL;

    const rendered = renderSummaryComment({
      response: buildResponse(),
      displayLanguages: ["en"],
      collapsedLanguages: [],
      hasPreviousReviewHistory: false,
      currentRunDiscussions: [
        {
          discussion_id: "discussion-1",
          note_id: "18239",
          content: {
            suggestion: "Use the new fields directly.",
            file_path: "src/a.ts",
            old_line: null,
            new_line: 11,
          },
        },
      ],
    });

    expect(rendered).toContain("1. `src/a.ts:10` ");
    expect(rendered).not.toContain("[`src/a.ts:10`]");
  });

  test("renders collapsed languages with localized headers and history footer", () => {
    const englishHeader = formatCollapsedLanguageHeader({
      language: "en",
    });

    const rendered = renderSummaryComment({
      response: buildResponse(),
      displayLanguages: ["ja", "en"],
      collapsedLanguages: ["en"],
      hasPreviousReviewHistory: true,
    });

    expect(rendered).toContain(`<summary>${englishHeader}</summary>`);
    expect(rendered).toContain("English changes.");
    expect(rendered).toContain(
      "Suggestions from previous review runs are not listed here.",
    );
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
});

describe("buildPerformanceMetricsSection", () => {
  test("renders model, agent, time, and Copilot usage metrics", () => {
    const section = buildPerformanceMetricsSection({
      response: {
        ...buildResponse(),
        duration: 1234,
        usage: {
          aiCredits: 126,
          input: 2_300_000,
          output: 32_600,
          cacheRead: 2_300_000,
          totalTokens: 2_332_600,
          reasoningTokens: 15_700,
        },
      },
      agentDisplay: "GitHub Copilot CLI 1.0.54",
    });

    expect(section).toContain(`- 🤖 **Model**: ${modelDisplayName}`);
    expect(section).toContain("- 🧰 **Agent**: GitHub Copilot CLI 1.0.54");
    expect(section).toContain("- ⏱️ **Time taken**: 1s (1234ms)");
    expect(section).toContain("- 🪙 **AI Credits**: 126");
    expect(section).toContain("- 🔢 **Total tokens**: 2332600");
    expect(section).toContain("- 🧠 **Reasoning tokens**: 15700");
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
      response: buildResponse(),
      reviewHistory,
      errors: [],
      hasPreviousReviewHistory: true,
    });

    expect(summaryBody).toContain("<!-- copilot-review-data-start -->");
    expect(summaryBody).toContain(encodedReviewHistory);
    expect(summaryBody).toContain("<!-- copilot-review-data-end -->");
    expect(
      summaryBody.trim().endsWith("<!-- copilot-review-data-end -->"),
    ).toBe(true);
  });
});
