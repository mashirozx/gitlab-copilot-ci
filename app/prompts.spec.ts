import { afterEach, describe, expect, test } from "bun:test";

const originalArgv = [...process.argv];

const loadPromptsModule = async () => {
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
    "--lang",
    "ja",
  ];

  return import(`./prompts?test=${Date.now()}`);
};

afterEach(() => {
  process.argv = [...originalArgv];
});

describe("buildCopilotPrompt", () => {
  test("requires walkthrough and per-step changes sections in the summary template", async () => {
    const { buildCopilotPrompt } = await loadPromptsModule();
    const prompt = buildCopilotPrompt({
      diffFilePaths: ["mr-diff.page-1.diff"],
      title: "Test MR",
      description: null,
      previousReviews: [],
      debugMode: false,
    });

    expect(prompt).toContain(
      'Include translated equivalents of "## 📋 Walkthrough", "## 🚧 Changes", "## 🔍 Review Summary", and "## 💡 Other Suggestions" section content.',
    );
    expect(prompt).toContain("## 📋 Walkthrough");
    expect(prompt).toContain("## 🚧 Changes");
    expect(prompt).toContain(
      "[Write an English walkthrough that explains the merge request's goal and how the implementation is built step by step.]",
    );
    expect(prompt).toContain(
      '[Break the merge request into key steps. For each step, start with a short bold title, then add a two-column markdown table with "Layer / File(s)" and "Summary". In the left column, name the relevant layer, module, or method and list the touched file paths. In the right column, describe what actually changed for that step.]',
    );
    expect(prompt).toContain("[Example structure for one step:]");
    expect(prompt).toContain("**Step title**");
    expect(prompt).toContain("| Layer / File(s) | Summary |");
    expect(prompt).toContain(
      "| **module/method name/desc**  <br> `path/to/file.rs`, `path/to/file.ts` | What actually changed |",
    );
    expect(prompt).toContain("[Repeat for additional steps when needed.]");
    expect(prompt).toContain("Found X suggestion(s) from changes:");
  });

  test("keeps translated summary blocks in summary.translations instead of english content", async () => {
    const { buildCopilotPrompt } = await loadPromptsModule();
    const prompt = buildCopilotPrompt({
      diffFilePaths: ["mr-diff.page-1.diff"],
      title: "Test MR",
      description: null,
      previousReviews: [],
      debugMode: false,
    });

    expect(prompt).toContain(
      'For "summary.translations["ja"]", return a complete markdown block using the same section structure, written entirely in ja.',
    );
    expect(prompt).not.toContain(
      'Then add a translated section for language "ja" using the same section structure, written entirely in ja. Place it after the divider above.',
    );
  });

  test("tells summary translations to localize only the rank word inside the LaTeX badge", async () => {
    const { buildCopilotPrompt } = await loadPromptsModule();
    const prompt = buildCopilotPrompt({
      diffFilePaths: ["mr-diff.page-1.diff"],
      title: "Test MR",
      description: null,
      previousReviews: [],
      debugMode: false,
    });

    expect(prompt).toContain(
      'Use these exact rank flags inside "summary.content":',
    );
    expect(prompt).toContain(
      'In "summary.content", keep the rank words in English exactly as shown above.',
    );
    expect(prompt).toContain(
      'In every value in "summary.translations", keep the same LaTeX rank-badge template and color as the matching English flag, but translate only the rank word inside \\text{...} into that target language.',
    );
    expect(prompt).toContain(
      "$\\colorbox{#ff4d4f}{\\color{white}{\\text{[translated HIGH]}}}$",
    );
    expect(prompt).toContain(
      "$\\colorbox{#1890ff}{\\color{white}{\\text{[translated MEDIUM]}}}$",
    );
    expect(prompt).toContain(
      "$\\colorbox{#52c41a}{\\color{white}{\\text{[translated LOW]}}}$",
    );
  });

  test("requires final response JSON to be serialized and retried with node stringify", async () => {
    const { buildCopilotPrompt } = await loadPromptsModule();
    const prompt = buildCopilotPrompt({
      diffFilePaths: ["mr-diff.page-1.diff"],
      title: "Test MR",
      description: null,
      previousReviews: [],
      debugMode: false,
    });

    expect(prompt).toContain(
      "Before emitting the final response, construct the full JSON payload with local Node.js and serialize it with Node's JSON.stringify(). Prefer this over hand-writing JSON text.",
    );
    expect(prompt).toContain(
      "If the Node.js step throws any syntax, reference, or serialization error, fix the payload immediately and rerun the same Node.js JSON.stringify() step until it succeeds.",
    );
    expect(prompt).toContain(
      "Only after Node.js successfully prints valid minified JSON may you wrap it with the start/end markers and return it.",
    );
  });
});
