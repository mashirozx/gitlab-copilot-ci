import { describe, expect, mock, test } from "bun:test";

mock.module("./argv", () => ({
  argv: {
    agent: "github-copilot-cli",
    "agent-args": undefined,
    "agent-bin": undefined,
    "copilot-github-token": undefined,
    tools: [],
    model: "gpt-5.4",
    "max-stdout-size": 11,
  },
}));

const { argv } = await import("./argv");
const { consumeStdoutPrintBudget, createStdoutPrintBudgetState } =
  await import("./std-handler");

describe("consumeStdoutPrintBudget", () => {
  test("keeps printing while total stdout stays below the safety threshold", () => {
    const state = createStdoutPrintBudgetState();
    const result = consumeStdoutPrintBudget({
      state,
      text: "a".repeat(128),
    });

    expect(result).toEqual({
      shouldPrint: true,
      warningReachedLimit: false,
    });
    expect(state.totalBytes).toBe(128);
    expect(state.isSuppressed).toBeFalse();
  });

  test("suppresses the chunk that reaches the threshold and warns only once", () => {
    const state = createStdoutPrintBudgetState();
    const thresholdChunk = "a".repeat(1024 * 1024);

    const firstResult = consumeStdoutPrintBudget({
      state,
      text: thresholdChunk,
    });
    const secondResult = consumeStdoutPrintBudget({
      state,
      text: "b",
    });

    expect(firstResult).toEqual({
      shouldPrint: false,
      warningReachedLimit: true,
    });
    expect(secondResult).toEqual({
      shouldPrint: false,
      warningReachedLimit: false,
    });
    expect(state.isSuppressed).toBeTrue();
  });

  test("treats values below the headroom as a zero print budget", async () => {
    const originalMaxStdoutSize = argv["max-stdout-size"];

    try {
      argv["max-stdout-size"] = 5;
      const state = createStdoutPrintBudgetState();

      const result = consumeStdoutPrintBudget({
        state,
        text: "a",
      });

      expect(result).toEqual({
        shouldPrint: false,
        warningReachedLimit: true,
      });
    } finally {
      argv["max-stdout-size"] = originalMaxStdoutSize;
    }
  });
});
