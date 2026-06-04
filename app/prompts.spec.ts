import { afterEach, describe, expect, mock, test } from "bun:test";

const originalArgv = [...process.argv];
const originalCommitSha = process.env.CI_COMMIT_SHA;
const originalCommitShortSha = process.env.CI_COMMIT_SHORT_SHA;
const originalProjectUrl = process.env.CI_PROJECT_URL;

const loadPromptsModule = async ({
  collapseChangesSummary = false,
  collapseReviewSummary = false,
}: {
  collapseChangesSummary?: boolean;
  collapseReviewSummary?: boolean;
} = {}) => {
  process.env.CI_COMMIT_SHA = "1234567890abcdef";
  process.env.CI_COMMIT_SHORT_SHA = "12345678";
  process.env.CI_PROJECT_URL = "https://gitlab.example.com/group/project";

  mock.module("./utils/argv", () => ({
    argv: {
      agent: "github-copilot-cli",
      "agent-bin": undefined,
      lang: ["ja"],
      "collapsed-lang": [],
      "html-marker-prefix": "copilot",
      "instruction-files": [],
      "extra-prompts": undefined,
      "ignored-rank": [],
      "max-history-length": 12,
      "should-teach-diff-compute": false,
      model: "gpt-5.4",
      tools: [],
      "collapse-changes-summary": collapseChangesSummary,
      "collapse-review-summary": collapseReviewSummary,
    },
  }));

  process.argv = [
    originalArgv[0] ?? "bun",
    originalArgv[1] ?? "test",
    "--gitlab-token",
    "test-token",
    "--gitlab-url",
    "https://gitlab.example.com",
    "--project-id",
    "1",
    "--mr-iid",
    "2",
  ];

  return import(`./prompts?test=${Date.now()}`);
};

afterEach(() => {
  mock.restore();
  process.argv = [...originalArgv];

  if (originalCommitSha === undefined) {
    delete process.env.CI_COMMIT_SHA;
  } else {
    process.env.CI_COMMIT_SHA = originalCommitSha;
  }

  if (originalCommitShortSha === undefined) {
    delete process.env.CI_COMMIT_SHORT_SHA;
  } else {
    process.env.CI_COMMIT_SHORT_SHA = originalCommitShortSha;
  }

  if (originalProjectUrl === undefined) {
    delete process.env.CI_PROJECT_URL;
  } else {
    process.env.CI_PROJECT_URL = originalProjectUrl;
  }
});

describe("buildCopilotPrompt", () => {
  test("returns a prompt string for a normal review", async () => {
    const { buildCopilotPrompt } = await loadPromptsModule();
    const prompt = buildCopilotPrompt({
      diffFilePaths: ["mr-diff.page-1.diff"],
      title: "Test MR",
      description: null,
      reviewHistoryFilePath: undefined,
      debugMode: false,
    });

    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });

  test("defers previous inline review history to the final duplicate-suppression step", async () => {
    const { buildCopilotPrompt } = await loadPromptsModule();
    const prompt = buildCopilotPrompt({
      diffFilePaths: ["mr-diff.page-1.diff"],
      title: "Test MR",
      description: "Test description",
      reviewHistoryFilePath: "/tmp/prior-inline-review-history.md",
      debugMode: true,
    });

    expect(prompt).toContain("## Deferred Previous Inline Review History");
    expect(prompt).toContain(
      "Do not read or use this history file during the initial diff review, repository walkthrough, or first-pass finding generation.",
    );
    expect(prompt).toContain(
      "A markdown file containing documented prior-review blocks is available at:",
    );
    expect(prompt).toContain("- /tmp/prior-inline-review-history.md");
    expect(prompt).toContain(
      'Each prior-review block includes a small "Diff" table and a freeform "Suggestions" section so rich markdown suggestions remain readable.',
    );
    expect(prompt).toContain(
      "The history file intentionally omits discussion ids and note ids because they are not relevant to duplicate detection.",
    );
    expect(prompt).toContain(
      'After removing duplicates, update the final inline-review list and X count inside "summary.content" and every translated summary block so they match the filtered final "reviews" array exactly.',
    );
    expect(prompt).not.toContain(
      "Reviews marked with this will be automatically deleted if not resolved before next update",
    );
  });

  test("includes the commit reference in the template", async () => {
    const { buildCopilotPrompt } = await loadPromptsModule();
    const prompt = buildCopilotPrompt({
      diffFilePaths: ["mr-diff.page-1.diff"],
      title: "Test MR",
      description: null,
      reviewHistoryFilePath: undefined,
      debugMode: false,
    });

    expect(prompt).toContain(
      "Found X review suggestion(s) in the changes up to [`12345678`](https://gitlab.example.com/group/project/-/commit/1234567890abcdef):",
    );
    expect(prompt).not.toContain(
      "<sub>Suggestions from previous review runs are not listed here.</sub>",
    );
    expect(prompt).toContain(
      'Keep the markdown commit reference from "Found X review suggestion(s) in the changes up to [`12345678`](https://gitlab.example.com/group/project/-/commit/1234567890abcdef):" unchanged and translate only the surrounding prose.',
    );
  });

  test("includes the review-history exclusion note only when history exists", async () => {
    const { buildCopilotPrompt } = await loadPromptsModule();
    const prompt = buildCopilotPrompt({
      diffFilePaths: ["mr-diff.page-1.diff"],
      title: "Test MR",
      description: null,
      reviewHistoryFilePath: "/tmp/prior-inline-review-history.md",
      debugMode: false,
    });

    expect(prompt).toContain(
      "***\n\n<sub>Suggestions from previous review runs are not listed here.</sub>",
    );
  });

  test("asks the model to emit collapsed changes and review sections when enabled", async () => {
    const { buildCopilotPrompt } = await loadPromptsModule({
      collapseChangesSummary: true,
      collapseReviewSummary: true,
    });
    const prompt = buildCopilotPrompt({
      diffFilePaths: ["mr-diff.page-1.diff"],
      title: "Test MR",
      description: null,
      reviewHistoryFilePath: undefined,
      debugMode: false,
    });

    expect(prompt).toContain(
      "## 🚧 Changes\n\n<details>\n<summary>Details</summary>",
    );
    expect(prompt).toContain(
      "## 🔍 Review Summary\n\n<details>\n<summary>Details</summary>",
    );
    expect(prompt).toContain(
      "If the English template uses a <details> block for a section, keep the same <details>/<summary> HTML structure there",
    );
  });
});
