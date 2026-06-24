import { afterEach, describe, expect, mock, test } from "bun:test";
import type { ReviewHistoryDiscussionEntity } from "../../services/gitlab.types";
import type { ReviewResponseEntity } from "../../types/review.types";

process.env.GITLAB_TOKEN = "test-gitlab-token";
process.env.CI_SERVER_URL = "https://gitlab.example.com";
process.env.CI_PROJECT_ID = "1";
process.env.CI_MERGE_REQUEST_IID = "1";
process.env.CI_PROJECT_URL = "https://gitlab.example.com/group/repo-name";
process.env.CI_JOB_URL =
  "https://gitlab.example.com/group/repo-name/-/jobs/15536";

const contractEnv = {
  GITLAB_TOKEN: "test-gitlab-token",
  CI_SERVER_URL: "https://gitlab.example.com",
  CI_PROJECT_ID: "1",
  CI_MERGE_REQUEST_IID: "1",
  CI_PROJECT_URL: "https://gitlab.example.com/group/repo-name",
  CI_JOB_URL: "https://gitlab.example.com/group/repo-name/-/jobs/15536",
  CI_COMMIT_SHA: "1234567890abcdef1234567890abcdef12345678",
  CI_COMMIT_SHORT_SHA: "12345678",
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
    name: "renders the linked snippet summary comment with review list and errors",
    snapshotFile: "summary-comment-with-snippet-builder.contract.md",
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
    errors: ["Snippet creation retried once before succeeding."],
  },
  {
    name: "renders the no-review snippet summary state without history footer",
    snapshotFile: "summary-comment-with-snippet-builder.no-review.contract.md",
    response: {
      ...buildResponse(),
      reviews: [],
    },
    reviewHistory: [],
    hasPreviousReviewHistory: false,
    currentRunDiscussions: [],
    errors: [],
  },
] as const;

const loadSummaryCommentWithSnippetBuilder = async () => {
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
      "mr-iid": contractEnv.CI_MERGE_REQUEST_IID,
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
      get CI_JOB_URL() {
        return contractEnv.CI_JOB_URL;
      },
      get CI_COMMIT_SHA() {
        return contractEnv.CI_COMMIT_SHA;
      },
      get CI_COMMIT_SHORT_SHA() {
        return contractEnv.CI_COMMIT_SHORT_SHA;
      },
    },
  }));
  mock.module("../model-display.ts", () => ({
    getModelDisplayName: () => "gpt-5.4",
    modelDisplayName: "gpt-5.4 <kbd>medium</kbd>",
  }));
  mock.module("node:child_process", () => ({
    spawnSync: () => ({ stdout: "GitHub Copilot CLI 1.0.54\n", stderr: "" }),
  }));

  return import(
    `./summary-comment-with-snippet-builder?contract=${Date.now()}`
  );
};

mock.module("../../utils/argv", () => ({
  argv: {
    "thinking-lang": "en",
  },
}));

const { initI18n } = await import("../../i18n");

await initI18n({
  languageTag: "en",
  preloadLanguageTags: ["en", "ja"],
});

afterEach(() => {
  mock.restore();
  mock.clearAllMocks();
});

describe("summary-comment-with-snippet-builder contract", () => {
  for (const scenario of scenarios) {
    test(scenario.name, async () => {
      const { buildSummaryCommentWithSnippet } =
        await loadSummaryCommentWithSnippetBuilder();
      const summaryBody = buildSummaryCommentWithSnippet({
        response: scenario.response,
        reviewHistory: scenario.reviewHistory,
        errors: scenario.errors,
        hasPreviousReviewHistory: scenario.hasPreviousReviewHistory,
        currentRunDiscussions: scenario.currentRunDiscussions,
        snippetUrl: "https://gitlab.example.com/group/repo-name/-/snippets/77",
      });
      const expectedSnapshot = await readContractSnapshot({
        path: buildSnapshotPath({ fileName: scenario.snapshotFile }),
      });

      expect(summaryBody).toBe(expectedSnapshot);
    });
  }
});
