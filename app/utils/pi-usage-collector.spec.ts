import { describe, expect, test } from "bun:test";
import { extractPiUsageFromOutput, getPiUsage } from "./pi-usage-collector";

describe("extractPiUsageFromOutput", () => {
  test("extracts usage from a real agent_end payload", () => {
    const output = String.raw`{"type":"agent_end","messages":[{"role":"user","content":[{"type":"text","text":"hello"}],"timestamp":1779873366761},{"role":"assistant","content":[{"type":"thinking","thinking":"","thinkingSignature":"{\"encrypted_content\":\"abc\",\"id\":\"def\",\"summary\":[],\"type\":\"reasoning\"}"},{"type":"text","text":"I acknowledge and will follow the LLM rules defined in AGENTS.md and other project guideline files.\n\nHello! How can I help?","textSignature":"{\"v\":1,\"id\":\"ghi\",\"phase\":\"final_answer\"}"}]}],"api":"openai-responses","provider":"github-copilot","model":"gpt-5.4-mini","usage":{"input":1537,"output":67,"cacheRead":0,"cacheWrite":0,"totalTokens":1604,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}},"stopReason":"stop","timestamp":1779873368055,"responseId":"xyz","willRetry":false}`;

    const usage = extractPiUsageFromOutput({
      output,
    });

    expect(usage).toEqual({
      input: 1537,
      output: 67,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 1604,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    });
  });

  test("reads usage from a singular assistant message payload", () => {
    const usage = getPiUsage({
      event: {
        type: "message_end",
        message: {
          role: "assistant",
          usage: {
            input: 2049,
            output: 213,
            cacheRead: 2048,
            cacheWrite: 0,
            totalTokens: 4310,
            cost: {
              input: 0.002049,
              output: 0.001278,
              cacheRead: 0.0004096,
              cacheWrite: 0,
              total: 0.0037366,
            },
          },
        },
      },
    });

    expect(usage).toEqual({
      input: 2049,
      output: 213,
      cacheRead: 2048,
      cacheWrite: 0,
      totalTokens: 4310,
      cost: {
        input: 0.002049,
        output: 0.001278,
        cacheRead: 0.0004096,
        cacheWrite: 0,
        total: 0.0037366,
      },
    });
  });

  test("falls back to usage found in a message_end line when agent_end usage is absent", () => {
    const output = String.raw`{"type":"message_end","message":{"role":"assistant","usage":{"input":2049,"output":213,"cacheRead":2048,"cacheWrite":0,"totalTokens":4310,"cost":{"input":0.002049,"output":0.001278,"cacheRead":0.0004096,"cacheWrite":0,"total":0.0037366}}}}
{"type":"agent_end","messages":[{"role":"assistant","content":[{"type":"text","text":"[COPILOT_JSON_START]{\"summary\":{\"content\":\"ok\"},\"reviews\":[]}[COPILOT_JSON_END]"}]}]}`;

    const usage = extractPiUsageFromOutput({
      output,
    });

    expect(usage).toEqual({
      input: 2049,
      output: 213,
      cacheRead: 2048,
      cacheWrite: 0,
      totalTokens: 4310,
      cost: {
        input: 0.002049,
        output: 0.001278,
        cacheRead: 0.0004096,
        cacheWrite: 0,
        total: 0.0037366,
      },
    });
  });
});
