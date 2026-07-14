import { describe, expect, test } from "bun:test";
import { getPromptModelSpec, parseModelSpec } from "./model-name-parser";

describe("parseModelSpec", () => {
  test("returns empty output for undefined or blank input", () => {
    expect(parseModelSpec({ model: undefined })).toEqual({});
    expect(parseModelSpec({ model: "" })).toEqual({});
    expect(parseModelSpec({ model: "   \t\n  " })).toEqual({});
  });

  test("removes provider prefixes", () => {
    expect(parseModelSpec({ model: "openai/gpt-4o" })).toEqual({
      model: "gpt-4o",
      provider: "openai",
    });
  });

  test("parses effort shorthand from the model suffix", () => {
    expect(parseModelSpec({ model: "openai/gpt-4o:high" })).toEqual({
      model: "gpt-4o",
      effort: "high",
      provider: "openai",
    });
  });

  test("treats github-copilot as a provider", () => {
    expect(
      parseModelSpec({ model: "github-copilot/gpt-5.6-terra:max" }),
    ).toEqual({
      model: "gpt-5.6-terra",
      effort: "max",
      provider: "github-copilot",
    });
  });

  test("parses a gpt-5.6-terra model with an effort suffix", () => {
    expect(parseModelSpec({ model: "gpt-5.6-terra:max" })).toEqual({
      model: "gpt-5.6-terra",
      effort: "max",
    });
  });

  test("parses a gpt-5.6-terra model without a provider or effort suffix", () => {
    expect(parseModelSpec({ model: "gpt-5.6-terra" })).toEqual({
      model: "gpt-5.6-terra",
    });
  });

  test("accepts disabled as an explicit effort suffix", () => {
    expect(parseModelSpec({ model: "mimo-v2.5-pro:disabled" })).toEqual({
      model: "mimo-v2.5-pro",
      effort: "disabled",
    });
  });

  test("keeps a plain model with no provider or effort unchanged", () => {
    expect(parseModelSpec({ model: "gpt-4o" })).toEqual({
      model: "gpt-4o",
    });
  });

  test("splits on the final colon when the model contains multiple colons", () => {
    expect(parseModelSpec({ model: "org/model:preview:high" })).toEqual({
      model: "model:preview",
      effort: "high",
      provider: "org",
    });
  });
});

describe("getPromptModelSpec", () => {
  test("returns empty output for undefined or blank input", () => {
    expect(getPromptModelSpec({ model: undefined })).toEqual({});
    expect(getPromptModelSpec({ model: "" })).toEqual({});
  });

  test("removes provider prefixes from plain configured models", () => {
    expect(getPromptModelSpec({ model: "openai/gpt-4o" })).toEqual({
      model: "gpt-4o",
      configuredModel: "gpt-4o",
    });
  });

  test("preserves explicit effort while removing provider prefixes", () => {
    expect(getPromptModelSpec({ model: "openai/gpt-4o:high" })).toEqual({
      model: "gpt-4o",
      effort: "high",
      configuredModel: "gpt-4o:high",
    });
  });

  test("preserves disabled effort while removing provider prefixes", () => {
    expect(
      getPromptModelSpec({ model: "minimax/MiniMax-M3:disabled" }),
    ).toEqual({
      model: "MiniMax-M3",
      effort: "disabled",
      configuredModel: "MiniMax-M3:disabled",
    });
  });

  test("keeps model subvariants before the effort suffix", () => {
    expect(getPromptModelSpec({ model: "org/model:preview:high" })).toEqual({
      model: "model:preview",
      effort: "high",
      configuredModel: "model:preview:high",
    });
  });
});
