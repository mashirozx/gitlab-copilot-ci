import { describe, expect, test } from "bun:test";
import { parseModelSpec } from "./model-name-parser";

describe("parseModelSpec", () => {
  test("returns empty output for undefined or blank input", () => {
    expect(parseModelSpec({ model: undefined })).toEqual({});
    expect(parseModelSpec({ model: "" })).toEqual({});
    expect(parseModelSpec({ model: "   \t\n  " })).toEqual({});
  });

  test("keeps provider-prefixed models unchanged", () => {
    expect(parseModelSpec({ model: "openai/gpt-4o" })).toEqual({
      model: "openai/gpt-4o",
    });
  });

  test("parses effort shorthand from the model suffix", () => {
    expect(parseModelSpec({ model: "openai/gpt-4o:high" })).toEqual({
      model: "openai/gpt-4o",
      effort: "high",
    });
  });

  test("keeps a plain model with no provider or effort unchanged", () => {
    expect(parseModelSpec({ model: "gpt-4o" })).toEqual({
      model: "gpt-4o",
    });
  });

  test("splits on the final colon when the model contains multiple colons", () => {
    expect(parseModelSpec({ model: "org/model:preview:high" })).toEqual({
      model: "org/model:preview",
      effort: "high",
    });
  });
});
