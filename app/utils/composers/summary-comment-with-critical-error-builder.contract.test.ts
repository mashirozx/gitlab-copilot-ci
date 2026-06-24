import { afterEach, describe, expect, mock, test } from "bun:test";
import type { ReviewResponseEntity } from "../../types/review.types";

process.env.CI_PROJECT_URL = "https://gitlab.example.com/group/repo-name";
process.env.CI_JOB_URL =
  "https://gitlab.example.com/group/repo-name/-/jobs/15536";

const contractEnv = {
  CI_PROJECT_URL: "https://gitlab.example.com/group/repo-name",
  CI_JOB_URL: "https://gitlab.example.com/group/repo-name/-/jobs/15536",
  CI_MERGE_REQUEST_IID: "1",
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

const loadCriticalErrorBuilder = async () => {
  mock.module("../argv", () => ({
    argv: {
      "mr-iid": contractEnv.CI_MERGE_REQUEST_IID,
      "thinking-lang": "en",
    },
  }));
  mock.module("../env", () => ({
    env: {
      get CI_PROJECT_URL() {
        return contractEnv.CI_PROJECT_URL;
      },
      get CI_JOB_URL() {
        return contractEnv.CI_JOB_URL;
      },
      get CI_JOB_ID() {
        return undefined;
      },
      get CI_MERGE_REQUEST_IID() {
        return contractEnv.CI_MERGE_REQUEST_IID;
      },
    },
  }));

  return import(
    `./summary-comment-with-critical-error-builder?contract=${Date.now()}`
  );
};

const buildResponse = (): ReviewResponseEntity => ({
  readableModelName: "GPT-5.4",
  summary: {
    walkthrough: {
      en: "English changes.",
      ja: "日本語の変更。",
    },
    changes: [],
    otherSuggestions: {
      en: "None.",
      ja: "なし。",
    },
  },
  reviews: [],
  duration: 1234,
  usage: {
    aiCredits: 126,
    totalTokens: 2_332_600,
    reasoningTokens: 15_700,
  },
  withCriticalError: true,
});

const loadCriticalErrorSummaryNoteBuilder = async () => {
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
      get CI_PROJECT_URL() {
        return contractEnv.CI_PROJECT_URL;
      },
      get CI_JOB_URL() {
        return contractEnv.CI_JOB_URL;
      },
      get CI_JOB_ID() {
        return undefined;
      },
      get CI_MERGE_REQUEST_IID() {
        return contractEnv.CI_MERGE_REQUEST_IID;
      },
      get CI_COMMIT_SHA() {
        return "1234567890abcdef1234567890abcdef12345678";
      },
      get CI_COMMIT_SHORT_SHA() {
        return "12345678";
      },
      get GITLAB_TOKEN() {
        return "test-gitlab-token";
      },
      get CI_SERVER_URL() {
        return "https://gitlab.example.com";
      },
      get CI_PROJECT_ID() {
        return "1";
      },
    },
  }));
  mock.module("../model-display.ts", () => ({
    modelDisplayName: "gpt-5.4 <kbd>medium</kbd>",
    getModelDisplayName: () => "gpt-5.4",
  }));
  mock.module("node:child_process", () => ({
    spawnSync: () => ({ stdout: "GitHub Copilot CLI 1.0.54\n", stderr: "" }),
  }));

  return import(`./summary-comment-builder?critical-contract=${Date.now()}`);
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

describe("summary-comment-with-critical-error-builder contract", () => {
  test("renders the full critical-error summary note consistently", async () => {
    const { buildSummaryNote } = await loadCriticalErrorSummaryNoteBuilder();
    const output = buildSummaryNote({
      response: buildResponse(),
      reviewHistory: [],
      errors: [],
      hasPreviousReviewHistory: false,
      currentRunDiscussions: [],
    });
    const expectedSnapshot = await readContractSnapshot({
      path: buildSnapshotPath({
        fileName: "summary-comment-with-critical-error-builder.contract.md",
      }),
    });

    expect(output).toBe(expectedSnapshot);
  });

  test("renders the english critical-error summary block", async () => {
    const { buildSummaryLanguageBlockWithCriticalError } =
      await loadCriticalErrorBuilder();
    const output = buildSummaryLanguageBlockWithCriticalError({
      readableModelName: "GPT-5.4",
      language: "en",
    });
    const expectedSnapshot = await readContractSnapshot({
      path: buildSnapshotPath({
        fileName: "summary-comment-with-critical-error-builder.en.contract.md",
      }),
    });

    expect(output).toBe(expectedSnapshot);
  });

  test("renders the japanese critical-error summary block", async () => {
    const { buildSummaryLanguageBlockWithCriticalError } =
      await loadCriticalErrorBuilder();
    const output = buildSummaryLanguageBlockWithCriticalError({
      readableModelName: "GPT-5.4",
      language: "ja",
    });
    const expectedSnapshot = await readContractSnapshot({
      path: buildSnapshotPath({
        fileName: "summary-comment-with-critical-error-builder.ja.contract.md",
      }),
    });

    expect(output).toBe(expectedSnapshot);
  });
});
