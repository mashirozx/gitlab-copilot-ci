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

const loadModelDisplayModule = async ({
  spec,
}: {
  spec: string;
}): Promise<typeof import("./model-display")> => {
  return import(`./model-display.ts?spec=${spec}`);
};

describe("modelDisplayName", () => {
  test("uses the eagerly computed shared configured model display", () => {
    expect(modelDisplayName).toBe("gpt-5.4 <kbd>medium</kbd>");
  });

  test("supports hideEffort for the summary-title fallback", () => {
    expect(getModelDisplayName({ hideEffort: true })).toBe("gpt-5.4");
  });

  test("renders MiniMax adaptive thinking for supported thinking levels", async () => {
    mock.module("./argv", () => ({
      argv: {
        agent: "github-copilot-cli",
        model: "minimax/MiniMax-M3:minimal",
      },
    }));

    const { getModelDisplayName: getMiniMaxModelDisplayName } =
      await loadModelDisplayModule({
        spec: "model-display-minimax-adaptive",
      });

    mock.restore();

    expect(getMiniMaxModelDisplayName()).toBe(
      "minimax-m3 <kbd>thinking: adaptive</kbd>",
    );
  });

  test("renders MiniMax disabled thinking when effort is off", async () => {
    mock.module("./argv", () => ({
      argv: {
        agent: "github-copilot-cli",
        model: "minimax/MiniMax-M3:off",
      },
    }));

    const { getModelDisplayName: getMiniMaxOffModelDisplayName } =
      await loadModelDisplayModule({
        spec: "model-display-minimax-off",
      });

    mock.restore();

    expect(getMiniMaxOffModelDisplayName()).toBe(
      "minimax-m3 <kbd>thinking: disabled</kbd>",
    );
  });

  test("renders Copilot disabled thinking when mimo and MiniMax effort is disabled", async () => {
    mock.module("./argv", () => ({
      argv: {
        agent: "github-copilot-cli",
        model: "mimo-v2.5-pro:disabled",
      },
    }));

    const { getModelDisplayName: getMimoDisabledModelDisplayName } =
      await loadModelDisplayModule({
        spec: "model-display-mimo-disabled-copilot",
      });

    mock.restore();

    expect(getMimoDisabledModelDisplayName()).toBe(
      "mimo-v2.5-pro <kbd>thinking: disabled</kbd>",
    );

    mock.module("./argv", () => ({
      argv: {
        agent: "github-copilot-cli",
        model: "minimax/MiniMax-M3:disabled",
      },
    }));

    const { getModelDisplayName: getMiniMaxDisabledModelDisplayName } =
      await loadModelDisplayModule({
        spec: "model-display-minimax-disabled",
      });

    mock.restore();

    expect(getMiniMaxDisabledModelDisplayName()).toBe(
      "minimax-m3 <kbd>thinking: disabled</kbd>",
    );
  });

  test("renders Copilot defaults for omitted mimo and MiniMax effort", async () => {
    mock.module("./argv", () => ({
      argv: {
        agent: "github-copilot-cli",
        model: "mimo-v2.5-pro",
      },
    }));

    const { getModelDisplayName: getMimoDefaultModelDisplayName } =
      await loadModelDisplayModule({
        spec: "model-display-mimo-default-copilot",
      });

    mock.restore();

    expect(getMimoDefaultModelDisplayName()).toBe(
      "mimo-v2.5-pro <kbd>thinking: enabled</kbd>",
    );

    mock.module("./argv", () => ({
      argv: {
        agent: "github-copilot-cli",
        model: "MiniMax-M3",
      },
    }));

    const { getModelDisplayName: getMiniMaxDefaultModelDisplayName } =
      await loadModelDisplayModule({
        spec: "model-display-minimax-default",
      });

    mock.restore();

    expect(getMiniMaxDefaultModelDisplayName()).toBe(
      "minimax-m3 <kbd>thinking: adaptive</kbd>",
    );
  });

  test("keeps Pi defaults disabled when mimo and MiniMax effort is omitted", async () => {
    mock.module("./argv", () => ({
      argv: {
        agent: "pi",
        model: "mimo-v2.5-pro",
      },
    }));

    const { getModelDisplayName: getPiMimoDefaultModelDisplayName } =
      await loadModelDisplayModule({
        spec: "model-display-mimo-default-pi",
      });

    mock.restore();

    expect(getPiMimoDefaultModelDisplayName()).toBe(
      "mimo-v2.5-pro <kbd>thinking: disabled</kbd>",
    );

    mock.module("./argv", () => ({
      argv: {
        agent: "pi",
        model: "MiniMax-M3",
      },
    }));

    const { getModelDisplayName: getPiMiniMaxDefaultModelDisplayName } =
      await loadModelDisplayModule({
        spec: "model-display-minimax-default-pi",
      });

    mock.restore();

    expect(getPiMiniMaxDefaultModelDisplayName()).toBe(
      "minimax-m3 <kbd>thinking: disabled</kbd>",
    );
  });
});
