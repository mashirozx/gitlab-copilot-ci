import { describe, expect, mock, test } from "bun:test";

process.env.GITLAB_TOKEN ??= "test-gitlab-token";
process.env.CI_SERVER_URL ??= "https://gitlab.example.com";
process.env.CI_PROJECT_ID ??= "1";
process.env.CI_MERGE_REQUEST_IID ??= "1";

mock.module("./argv", () => ({
  argv: {
    agent: "github-copilot-cli",
    model: "openai/gpt-5.4",
  },
}));

const modelDisplayModulePath = "./model-display.ts?spec=model-display";
const { getModelDisplayName, modelDisplayName } = await import(
  modelDisplayModulePath
);
mock.restore();

describe("modelDisplayName", () => {
  test("uses the eagerly computed shared configured model display", () => {
    expect(modelDisplayName).toBe("gpt-5.4 <kbd>medium</kbd>");
  });

  test("supports hideEffort for the summary-title fallback", () => {
    expect(getModelDisplayName({ hideEffort: true })).toBe("gpt-5.4");
  });
});
