import { afterEach, describe, expect, mock, test } from "bun:test";
import { outputJsonPath } from "./constants";

const originalArgv = [...process.argv];
const originalCommitSha = process.env.CI_COMMIT_SHA;
const originalCommitShortSha = process.env.CI_COMMIT_SHORT_SHA;
const originalProjectUrl = process.env.CI_PROJECT_URL;

const loadPromptsModule = async ({
  collapseChangesSummary = false,
  collapseReviewSummary = false,
  thinkingLang = "en",
  langs = ["ja"],
  collapsedLangs = [],
}: {
  collapseChangesSummary?: boolean;
  collapseReviewSummary?: boolean;
  thinkingLang?: string;
  langs?: string[];
  collapsedLangs?: string[];
} = {}) => {
  process.env.CI_COMMIT_SHA = "1234567890abcdef";
  process.env.CI_COMMIT_SHORT_SHA = "12345678";
  process.env.CI_PROJECT_URL = "https://gitlab.example.com/group/project";

  mock.module("./utils/argv", () => ({
    argv: {
      agent: "github-copilot-cli",
      "agent-bin": undefined,
      lang: langs,
      "collapsed-lang": collapsedLangs,
      "thinking-lang": thinkingLang,
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
      'After removing duplicates, ensure the final "reviews" array is the only deduplicated output surface. Do not let this deferred history check change the walkthrough, changes list, or other suggestions beyond omitting duplicate inline findings from the final output.',
    );
    expect(prompt).not.toContain('"summary.content"');
  });

  test("describes the new structured JSON response contract", async () => {
    const { buildCopilotPrompt } = await loadPromptsModule();
    const prompt = buildCopilotPrompt({
      diffFilePaths: ["mr-diff.page-1.diff"],
      title: "Test MR",
      description: null,
      reviewHistoryFilePath: undefined,
    });

    expect(prompt).toContain('"readableModelName": "string"');
    expect(prompt).toContain(
      '"walkthrough": { "en": "string", "ja": "string" }',
    );
    expect(prompt).toContain('"changes": [');
    expect(prompt).toContain(
      '"otherSuggestions": { "en": "string", "ja": "string" }',
    );
    expect(prompt).toContain(
      '"suggestions": { "en": { "detail": "string", "abstract": "string" }, "ja": { "detail": "string", "abstract": "string" } }',
    );
    expect(prompt).not.toContain('"content"');
    expect(prompt).not.toContain('"translations"');
  });

  test("tells the model that runtime templating now owns titles, tables, and collapsed blocks", async () => {
    const { buildCopilotPrompt } = await loadPromptsModule({
      collapseChangesSummary: true,
      collapseReviewSummary: true,
    });
    const prompt = buildCopilotPrompt({
      diffFilePaths: ["mr-diff.page-1.diff"],
      title: "Test MR",
      description: null,
      reviewHistoryFilePath: undefined,
    });

    expect(prompt).toContain(
      "Do not generate the final GitLab comment template yourself. The runtime will apply the summary title, walkthrough heading, changes heading, review-summary heading, rank badges, tables, and collapsed translation blocks.",
    );
  });

  test("uses thinking-lang as the source language and merges collapsed languages into the response schema", async () => {
    const { buildCopilotPrompt } = await loadPromptsModule({
      thinkingLang: "ja",
      langs: ["ja", "zh-CN"],
      collapsedLangs: ["en"],
    });
    const prompt = buildCopilotPrompt({
      diffFilePaths: ["mr-diff.page-1.diff"],
      title: "Test MR",
      description: null,
      reviewHistoryFilePath: undefined,
    });

    expect(prompt).toContain(
      "From the very beginning of this task, immediately after receiving this prompt, think in ja.",
    );
    expect(prompt).toContain(
      "Include every requested language in every language-keyed record: ja, zh-CN, en.",
    );
    expect(prompt).toContain(
      '"walkthrough": { "ja": "string", "zh-CN": "string", "en": "string" }',
    );
    expect(prompt).toContain(
      '"suggestions": { "ja": { "detail": "string", "abstract": "string" }, "zh-CN": { "detail": "string", "abstract": "string" }, "en": { "detail": "string", "abstract": "string" } }',
    );
    expect(prompt).toContain(
      'For every review item, include all requested languages inside "suggestions".',
    );
    expect(prompt).toContain(
      "At the beginning of your reasoning, first translate the relevant task instructions in this prompt into ja for your own working understanding.",
    );
    expect(prompt).not.toContain('"summary.content"');
    expect(prompt).not.toContain('"translations"');
    expect(prompt).not.toContain('"suggestion": "string (ja)"');
  });

  test("adds a classical Chinese note when thinking-lang uses a literary Chinese variant", async () => {
    const { buildCopilotPrompt } = await loadPromptsModule({
      thinkingLang: "zh-Hant-lzh",
      langs: ["en"],
    });
    const prompt = buildCopilotPrompt({
      diffFilePaths: ["mr-diff.page-1.diff"],
      title: "Test MR",
      description: null,
      reviewHistoryFilePath: undefined,
    });

    expect(prompt).toContain("这里的“文言文”指古典汉语书面语");
    expect(prompt).toContain("在每条翻译中请使用繁體漢字");
  });

  test("adds a classical Chinese translation note when --lang requests a literary Chinese variant", async () => {
    const { buildCopilotPrompt } = await loadPromptsModule({
      thinkingLang: "en",
      langs: ["zh-Hans-lzh"],
    });
    const prompt = buildCopilotPrompt({
      diffFilePaths: ["mr-diff.page-1.diff"],
      title: "Test MR",
      description: null,
      reviewHistoryFilePath: undefined,
    });

    expect(prompt).toContain(
      "补充说明：这里的“文言文”指古典汉语书面语。在每条翻译中请使用简体汉字。",
    );
  });

  test("adds a classical Chinese translation note when --collapsed-lang requests a literary Chinese variant", async () => {
    const { buildCopilotPrompt } = await loadPromptsModule({
      thinkingLang: "en",
      langs: ["ja"],
      collapsedLangs: ["zh-Hant-lzh"],
    });
    const prompt = buildCopilotPrompt({
      diffFilePaths: ["mr-diff.page-1.diff"],
      title: "Test MR",
      description: null,
      reviewHistoryFilePath: undefined,
    });

    expect(prompt).toContain(
      "补充说明：这里的“文言文”指古典汉语书面语。在每条翻译中请使用繁體漢字。",
    );
  });

  test("instructs file-based JSON output", async () => {
    const { buildCopilotPrompt } = await loadPromptsModule();
    const prompt = buildCopilotPrompt({
      diffFilePaths: ["mr-diff.page-1.diff"],
      title: "Test MR",
      description: null,
      reviewHistoryFilePath: undefined,
    });

    expect(prompt).toContain(
      `Write the final JSON directly to this file using Node.js: ${outputJsonPath}`,
    );
    expect(prompt).toContain(
      "Use Node.js fs.writeFileSync() to write the JSON output to that file path.",
    );
    expect(prompt).toContain("The JSON output does not need to be minified.");
    expect(prompt).toContain(
      "After writing the file successfully, do not output the JSON in the final response message. The runtime will read the file directly.",
    );
    expect(prompt).toContain(
      "Do not wrap the JSON with markers. Write only the JSON object to the file, nothing else.",
    );
    expect(prompt).not.toContain("Wrap the JSON like this:");
  });
});
