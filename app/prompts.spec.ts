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
});
