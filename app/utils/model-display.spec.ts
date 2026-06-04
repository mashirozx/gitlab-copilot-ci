import { describe, expect, test } from "bun:test";

process.env.GITLAB_TOKEN ??= "test-gitlab-token";
process.env.CI_SERVER_URL ??= "https://gitlab.example.com";
process.env.CI_PROJECT_ID ??= "1";
process.env.CI_MERGE_REQUEST_IID ??= "1";

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
  "--model",
  "openai/gpt-5.4",
];

const { getModelDisplayName, modelDisplayName } = await import(
  "./model-display.ts"
);

describe("modelDisplayName", () => {
  test("uses the eagerly computed shared configured model display", () => {
    expect(modelDisplayName).toBe("gpt-5.4 <kbd>medium</kbd>");
  });

  test("aliases MiniMax effort tags to Anthropic-compatible labels", () => {
    expect(
      getModelDisplayName({
        model: "minimax/MiniMax-M3:minimal",
      }),
    ).toBe("minimax-m3 <kbd>low</kbd>");

    expect(
      getModelDisplayName({
        model: "minimax/MiniMax-M3:low",
      }),
    ).toBe("minimax-m3 <kbd>low</kbd>");

    expect(
      getModelDisplayName({
        model: "minimax/MiniMax-M3:medium",
      }),
    ).toBe("minimax-m3 <kbd>medium</kbd>");

    expect(
      getModelDisplayName({
        model: "minimax/MiniMax-M3:high",
      }),
    ).toBe("minimax-m3 <kbd>high</kbd>");

    expect(
      getModelDisplayName({
        model: "minimax/MiniMax-M3:xhigh",
      }),
    ).toBe("minimax-m3 <kbd>high</kbd>");
  });
});
