import { afterEach, describe, expect, mock, test } from "bun:test";
import { initI18n } from "../../i18n";
import type { ReviewHistoryDiscussionEntity } from "../../services/gitlab.types";
import type { ReviewResponseEntity } from "../../types/review.types";

process.env.GITLAB_TOKEN = "test-gitlab-token";
process.env.CI_SERVER_URL = "https://gitlab.example.com";
process.env.CI_PROJECT_ID = "1";
process.env.CI_MERGE_REQUEST_IID = "1";
process.env.CI_PROJECT_URL = "https://gitlab.example.com/group/repo-name";

const contractEnv = {
  GITLAB_TOKEN: "test-gitlab-token",
  CI_SERVER_URL: "https://gitlab.example.com",
  CI_PROJECT_ID: "1",
  CI_MERGE_REQUEST_IID: "1",
  CI_PROJECT_URL: "https://gitlab.example.com/group/repo-name",
} as const;

const buildSnapshotPath = ({ fileName }: { fileName: string }): URL => {
  return new URL(`./__snapshots__/${fileName}`, import.meta.url);
};

const readContractSnapshot = async ({
  path,
}: {
  path: URL;
}): Promise<string> => {
  return (await Bun.file(path).text()).replace(/\r?\n$/, "");
};

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
              files: [
                "app/main.ts",
                "docs/very/long/path/to/a/summary/formatter/guide.md",
              ],
              summary: "Uses the structured summary object directly.",
            },
          ],
        },
        ja: {
          step: "実行時要約の接続",
          layers: [
            {
              title: "ランタイム",
              files: [
                "app/main.ts",
                "docs/very/long/path/to/a/summary/formatter/guide.md",
              ],
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
  duration: 1234,
  usage: {
    aiCredits: 126,
    totalTokens: 2_332_600,
    reasoningTokens: 15_700,
  },
});

const buildReview = ({
  filePath,
  line,
  rank,
  enAbstract,
  jaAbstract,
  enDetail,
  jaDetail,
}: {
  filePath: string;
  line: number;
  rank: "HIGH" | "MEDIUM" | "LOW";
  enAbstract: string;
  jaAbstract: string;
  enDetail: string;
  jaDetail: string;
}) => {
  return {
    file_path: filePath,
    new_line: line,
    rank,
    suggestions: {
      en: {
        detail: enDetail,
        abstract: enAbstract,
      },
      ja: {
        detail: jaDetail,
        abstract: jaAbstract,
      },
    },
  };
};

const buildCurrentRunDiscussion = ({
  discussionId,
  noteId,
  filePath,
  line,
  suggestion,
}: {
  discussionId: string;
  noteId: string;
  filePath: string;
  line: number;
  suggestion: string;
}): ReviewHistoryDiscussionEntity => {
  return {
    discussion_id: discussionId,
    note_id: noteId,
    content: {
      suggestion,
      file_path: filePath,
      old_line: null,
      new_line: line,
    },
  };
};

const buildPreviousHistory = (): Array<{
  discussions: ReviewHistoryDiscussionEntity[];
}> => {
  return [
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
};

const scenarios = [
  {
    name: "renders one review item with history and current-run links",
    snapshotFile: "summary-comment-builder.contract.md",
    response: buildResponse(),
    reviewHistory: buildPreviousHistory(),
    hasPreviousReviewHistory: true,
    currentRunDiscussions: [
      buildCurrentRunDiscussion({
        discussionId: "discussion-1",
        noteId: "18239",
        filePath: "src/a.ts",
        line: 10,
        suggestion: "Use the new fields directly.",
      }),
    ],
  },
  {
    name: "renders a plain review location when inline review creation failed",
    snapshotFile: "summary-comment-builder.failed-review-item.contract.md",
    response: buildResponse(),
    reviewHistory: [],
    hasPreviousReviewHistory: false,
    currentRunDiscussions: [],
  },
  {
    name: "renders the no-review summary state",
    snapshotFile: "summary-comment-builder.no-review-items.contract.md",
    response: {
      ...buildResponse(),
      reviews: [],
    },
    reviewHistory: buildPreviousHistory(),
    hasPreviousReviewHistory: true,
    currentRunDiscussions: [],
  },
  {
    name: "renders many review items with multiple links",
    snapshotFile: "summary-comment-builder.many-review-items.contract.md",
    response: {
      ...buildResponse(),
      reviews: [
        buildReview({
          filePath: "src/a.ts",
          line: 10,
          rank: "HIGH",
          enAbstract: "Use the new fields directly.",
          jaAbstract: "新しいフィールドを直接使います。",
          enDetail: "Use the structured summary fields directly.",
          jaDetail: "構造化された summary フィールドを直接使ってください。",
        }),
        buildReview({
          filePath: "src/b.ts",
          line: 22,
          rank: "LOW",
          enAbstract: "Trim the helper to one responsibility.",
          jaAbstract: "ヘルパーの責務を 1 つに絞ってください。",
          enDetail:
            "Trim the helper to one responsibility so the summary path stays easier to maintain.",
          jaDetail:
            "要約経路を保守しやすくするため、ヘルパーの責務を 1 つに絞ってください。",
        }),
      ],
    },
    reviewHistory: buildPreviousHistory(),
    hasPreviousReviewHistory: true,
    currentRunDiscussions: [
      buildCurrentRunDiscussion({
        discussionId: "discussion-1",
        noteId: "18239",
        filePath: "src/a.ts",
        line: 10,
        suggestion: "Use the new fields directly.",
      }),
      buildCurrentRunDiscussion({
        discussionId: "discussion-2",
        noteId: "18240",
        filePath: "src/b.ts",
        line: 22,
        suggestion: "Trim the helper to one responsibility.",
      }),
    ],
  },
  {
    name: "renders one review item without the history footer when no history exists",
    snapshotFile: "summary-comment-builder.no-history-list.contract.md",
    response: buildResponse(),
    reviewHistory: [],
    hasPreviousReviewHistory: false,
    currentRunDiscussions: [
      buildCurrentRunDiscussion({
        discussionId: "discussion-1",
        noteId: "18239",
        filePath: "src/a.ts",
        line: 10,
        suggestion: "Use the new fields directly.",
      }),
    ],
  },
] as const;

const loadSummaryCommentBuilder = async () => {
  mock.module("../argv", () => ({
    argv: {
      agent: "github-copilot-cli",
      "agent-bin": undefined,
      "collapsed-lang": ["en"],
      "collapse-changes-summary": true,
      "collapse-review-summary": true,
      "html-marker-prefix": "copilot",
      lang: ["ja"],
      "max-history-length": 12,
      model: "gpt-5.4",
      "thinking-lang": "en",
    },
  }));
  mock.module("../env", () => ({
    env: {
      get GITLAB_TOKEN() {
        return contractEnv.GITLAB_TOKEN;
      },
      get CI_SERVER_URL() {
        return contractEnv.CI_SERVER_URL;
      },
      get CI_PROJECT_ID() {
        return contractEnv.CI_PROJECT_ID;
      },
      get CI_MERGE_REQUEST_IID() {
        return contractEnv.CI_MERGE_REQUEST_IID;
      },
      get CI_PROJECT_URL() {
        return contractEnv.CI_PROJECT_URL;
      },
    },
  }));
  mock.module("../model-display.ts", () => ({
    modelDisplayName: "gpt-5.4 <kbd>medium</kbd>",
  }));
  mock.module("node:child_process", () => ({
    spawnSync: () => ({ stdout: "GitHub Copilot CLI 1.0.54\n", stderr: "" }),
  }));

  return import(`./summary-comment-builder?contract=${Date.now()}`);
};

await initI18n({
  languageTag: "en",
  preloadLanguageTags: ["en", "ja"],
});

afterEach(() => {
  mock.restore();
  mock.clearAllMocks();
});

describe("summary-comment-builder contract", () => {
  for (const scenario of scenarios) {
    test(scenario.name, async () => {
      const { buildSummaryNote } = await loadSummaryCommentBuilder();
      const summaryBody = buildSummaryNote({
        response: scenario.response,
        reviewHistory: scenario.reviewHistory,
        errors: [],
        hasPreviousReviewHistory: scenario.hasPreviousReviewHistory,
        currentRunDiscussions: scenario.currentRunDiscussions,
      });
      const expectedSnapshot = await readContractSnapshot({
        path: buildSnapshotPath({ fileName: scenario.snapshotFile }),
      });

      expect(summaryBody).toBe(expectedSnapshot);
    });
  }
});
