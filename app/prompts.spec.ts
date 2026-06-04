import { afterEach, describe, expect, mock, test } from "bun:test";

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
      'State how many review suggestions were found in the changes up to [`12345678`](https://gitlab.example.com/group/project/-/commit/1234567890abcdef). Use correct zero, singular, and plural wording instead of literal "suggestion(s)". If the count is zero, end this sentence with a period instead of a colon. If the count is one or more, end it with a colon.',
    );
    expect(prompt).not.toContain(
      "<sub>Suggestions from previous review runs are not listed here.</sub>",
    );
    expect(prompt).not.toContain("Found X review suggestion(s)");
    expect(prompt).toContain(
      'Keep the markdown commit reference from the original "summary.content" unchanged and translate only the surrounding prose.',
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
      "If the source template uses a <details> block for a section, keep the same <details>/<summary> HTML structure there",
    );
  });

  test("uses thinking-lang as the original content language and excludes it from translations", async () => {
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
      debugMode: false,
    });

    expect(prompt).toContain(
      'A structured summary object whose "content" is always markdown in ja and whose "translations" object contains translated summary markdown blocks keyed by language: zh-CN, en',
    );
    expect(prompt).toContain(
      '"suggestion": "string (ja)", "translations": { "zh-CN": "string", "en": "string" }',
    );
    expect(prompt).toContain(
      'Always write "summary.content" and every review item\'s "suggestion" in ja, regardless of --lang or --collapsed-lang.',
    );
    expect(prompt).toContain(
      "From the very beginning of this task, immediately after receiving this prompt, think in ja.",
    );
    expect(prompt).toContain(
      "At the beginning of your reasoning, first translate the relevant task instructions in this prompt into ja for your own working understanding.",
    );
    expect(prompt).toContain(
      "After that translation step, base all subsequent reasoning, analysis, and planning on that translated prompt in ja.",
    );
    expect(prompt).toContain(
      "If your runtime exposes any visible thinking, reasoning, planning, or step-by-step analysis before the final answer, emit that visible thinking in ja as well.",
    );
    expect(prompt).toContain(
      "Do not rewrite visible thinking, markdown output, or JSON string content with Unicode escape encoding such as \\uXXXX when normal UTF-8 characters can be used directly.",
    );
    expect(prompt).toContain(
      "Start reasoning in ja immediately when this prompt begins, before reading diffs or repository files.",
    );
    expect(prompt).toContain(
      "At the start of reasoning, translate the prompt instructions you rely on into ja for internal use before continuing the task.",
    );
    expect(prompt).toContain(
      "After translating those prompt instructions, keep all further reasoning grounded in that ja translation rather than switching back to another-language interpretation.",
    );
    expect(prompt).toContain(
      "If the runtime shows your thinking before the final JSON line, keep that visible thinking entirely in ja.",
    );
    expect(prompt).toContain(
      "Do not convert visible thinking, markdown, or JSON string values into Unicode escape sequences such as \\uXXXX unless JSON syntax requires escaping a specific character.",
    );
    expect(prompt).toContain(
      "Use normal UTF-8 characters directly in the final output whenever possible.",
    );
    expect(prompt).toContain(
      'If a requested display language matches ja, do not include that language in any translations object; the runtime will read that language directly from "summary.content" or "suggestion".',
    );
    expect(prompt).not.toContain('"ja": "string"');
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
      debugMode: false,
    });

    expect(prompt).toContain("这里的“文言文”指古典汉语书面语");
    expect(prompt).toContain("并使用繁體漢字");
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
      debugMode: false,
    });

    expect(prompt).toContain(
      '如果需要返回 "zh-hans-lzh" 翻译，请使用文言文撰写对应的 "summary.translations["zh-hans-lzh"]" 与每条 "reviews[].translations["zh-hans-lzh"]"',
    );
    expect(prompt).toContain("并使用简体汉字");
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
      debugMode: false,
    });

    expect(prompt).toContain(
      '如果需要返回 "zh-hant-lzh" 翻译，请使用文言文撰写对应的 "summary.translations["zh-hant-lzh"]" 与每条 "reviews[].translations["zh-hant-lzh"]"',
    );
    expect(prompt).toContain("并使用繁體漢字");
  });
});
