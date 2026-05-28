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
  test("returns a prompt string for a normal review", async () => {
    const { buildCopilotPrompt } = await loadPromptsModule();
    const prompt = buildCopilotPrompt({
      diffFilePaths: ["mr-diff.page-1.diff"],
      title: "Test MR",
      description: null,
      previousReviews: [],
      debugMode: false,
    });

    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });

  test("returns a prompt string for debug review mode with prior reviews", async () => {
    const { buildCopilotPrompt } = await loadPromptsModule();
    const prompt = buildCopilotPrompt({
      diffFilePaths: ["mr-diff.page-1.diff"],
      title: "Test MR",
      description: "Test description",
      previousReviews: [
        {
          id: "review-1",
          mr_iid: "2",
          file_path: "app/main.ts",
          new_line: 42,
          old_line: null,
          suggestion: "Existing suggestion",
          source_snippet: "const value = 1;",
          created_at: 0,
        },
      ],
      debugMode: true,
    });

    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });
});
