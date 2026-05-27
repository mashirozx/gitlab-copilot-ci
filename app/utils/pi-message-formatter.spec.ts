import { describe, expect, test } from "bun:test";
import { createPiMessageFormatter } from "./pi-message-formatter";

describe("createPiMessageFormatter", () => {
  test("renders streamed assistant text from non-final events", () => {
    const formatter = createPiMessageFormatter();

    const output = formatter.formatLine({
      line: JSON.stringify({
        type: "message_delta",
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "text",
                text: "Thinking through the diff.",
              },
            ],
          },
        ],
      }),
    });

    expect(output).toContain("Thinking through the diff.");
  });

  test("renders assistant thinking from message_end with preserved line breaks", () => {
    const formatter = createPiMessageFormatter();

    const output = formatter.formatLine({
      line: JSON.stringify({
        type: "message_end",
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "thinking",
                text: "First line\nSecond line",
              },
            ],
          },
        ],
      }),
    });

    expect(output).toContain("Thinking:");
    expect(output).toContain("First line");
    expect(output).toContain("Second line");
    expect(output).toContain("│");
    expect(output).toContain("└");
  });

  test("renders assistant thinking from singular message_end payloads", () => {
    const formatter = createPiMessageFormatter();

    const output = formatter.formatLine({
      line: JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          content: [
            {
              type: "thinking",
              thinking:
                "Let me start by reading the diff file and the repository guidelines.",
            },
            {
              type: "text",
              text: "I acknowledge and will follow the LLM rules defined in `AGENTS.md` and other project guideline files.",
            },
          ],
        },
      }),
    });

    expect(output).toContain("Thinking:");
    expect(output).toContain(
      "Let me start by reading the diff file and the repository guidelines.",
    );
  });

  test("renders streamed assistant text from singular message_update payloads", () => {
    const formatter = createPiMessageFormatter();

    const output = formatter.formatLine({
      line: JSON.stringify({
        type: "message_update",
        message: {
          role: "assistant",
          content: [
            {
              type: "thinking",
              thinking:
                "Let me start by reading the diff file and the repository guidelines.",
            },
            {
              type: "text",
              text: "I acknowledge and will follow the LLM rules defined in `AGENTS.md` and other project guideline files.",
            },
          ],
        },
      }),
    });

    expect(output).toContain(
      "I acknowledge and will follow the LLM rules defined in `AGENTS.md` and other project guideline files.",
    );
  });

  test("renders usage from singular assistant message_end payloads", () => {
    const formatter = createPiMessageFormatter();

    const output = formatter.formatLine({
      line: JSON.stringify({
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
              total: 0.0037366,
            },
          },
          content: [
            {
              type: "text",
              text: "Done.",
            },
          ],
        },
      }),
    });

    expect(output).toContain("Usage:");
    expect(output).toContain("Input tokens: 2049");
    expect(output).toContain("Total tokens: 4310");
    expect(output).toContain("Total cost: 0.0037366");
  });

  test("does not repeat the same usage at agent_end", () => {
    const formatter = createPiMessageFormatter();

    formatter.formatLine({
      line: JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          usage: {
            input: 10,
            output: 20,
            totalTokens: 30,
          },
        },
      }),
    });

    const output = formatter.formatLine({
      line: JSON.stringify({
        type: "agent_end",
        usage: {
          input: 10,
          output: 20,
          totalTokens: 30,
        },
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "text",
                text: "Done.",
              },
            ],
          },
        ],
      }),
    });

    expect(output).toContain("Agent finished");
    expect(output).not.toContain("Usage:");
  });

  test("renders only the new assistant text delta", () => {
    const formatter = createPiMessageFormatter();

    formatter.formatLine({
      line: JSON.stringify({
        type: "message_delta",
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "text",
                text: "Thinking",
              },
            ],
          },
        ],
      }),
    });

    const output = formatter.formatLine({
      line: JSON.stringify({
        type: "message_delta",
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "text",
                text: "Thinking more",
              },
            ],
          },
        ],
      }),
    });

    expect(output).toContain("more");
    expect(output).not.toContain("Thinking more");
  });

  test("does not print final JSON-wrapped assistant output", () => {
    const formatter = createPiMessageFormatter();

    const output = formatter.formatLine({
      line: JSON.stringify({
        type: "message_delta",
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "text",
                text: '[COPILOT_JSON_START]{"summary":{"content":"ok"},"reviews":[]}[COPILOT_JSON_END]',
              },
            ],
          },
        ],
      }),
    });

    expect(output).toBe("");
  });

  test("formats bash tool output with command and success message", () => {
    const formatter = createPiMessageFormatter();

    formatter.formatLine({
      line: JSON.stringify({
        type: "tool_execution_start",
        toolCallId: "bash-1",
        toolName: "bash",
        args: {
          command: "git status --short",
        },
      }),
    });

    const output = formatter.formatLine({
      line: JSON.stringify({
        type: "tool_execution_end",
        toolCallId: "bash-1",
        result: {
          message: "working tree clean",
        },
      }),
    });

    expect(output).toContain("Bash Tool:");
    expect(output).toContain("git status --short");
    expect(output).toContain("[Success]");
    expect(output).toContain("working tree clean");
  });

  test("formats bash tool output with fail message", () => {
    const formatter = createPiMessageFormatter();

    formatter.formatLine({
      line: JSON.stringify({
        type: "tool_execution_start",
        toolCallId: "bash-2",
        toolName: "bash",
        args: {
          command: "npm test",
        },
      }),
    });

    const output = formatter.formatLine({
      line: JSON.stringify({
        type: "tool_execution_end",
        toolCallId: "bash-2",
        isError: true,
        finalError: "command failed",
        result: {
          error: "exit code 1",
        },
      }),
    });

    expect(output).toContain("Bash Tool:");
    expect(output).toContain("npm test");
    expect(output).toContain("[Fail]");
    expect(output).toContain("exit code 1");
  });

  test("shows only the filename for read tool absolute paths outside cwd", () => {
    const formatter = createPiMessageFormatter();

    formatter.formatLine({
      line: JSON.stringify({
        type: "session",
        cwd: "/Users/mashiro/Code/gitlab-copilot-ci",
      }),
    });

    formatter.formatLine({
      line: JSON.stringify({
        type: "tool_execution_start",
        toolCallId: "read-1",
        toolName: "read",
        args: {
          path: "/var/folders/6p/lp6hpmhd6pz91gd5f92zq8440000gn/T/copilot-review-Ik4hKV/mr-diff.page-1.diff",
        },
      }),
    });

    const output = formatter.formatLine({
      line: JSON.stringify({
        type: "tool_execution_end",
        toolCallId: "read-1",
        result: {
          content: [{ text: "line 1\nline 2" }],
        },
      }),
    });

    expect(output).toContain("Read ");
    expect(output).toContain("\u001b[36mmr-diff.page-1.diff\u001b[0m");
    expect(output).not.toContain("/var/folders/");
  });

  test("shows in-workspace read paths in yellow", () => {
    const formatter = createPiMessageFormatter();

    formatter.formatLine({
      line: JSON.stringify({
        type: "session",
        cwd: "/Users/mashiro/Code/gitlab-copilot-ci",
      }),
    });

    formatter.formatLine({
      line: JSON.stringify({
        type: "tool_execution_start",
        toolCallId: "read-2",
        toolName: "read",
        args: {
          path: "/Users/mashiro/Code/gitlab-copilot-ci/app/main.ts",
        },
      }),
    });

    const output = formatter.formatLine({
      line: JSON.stringify({
        type: "tool_execution_end",
        toolCallId: "read-2",
        result: {
          content: [{ text: "line 1" }],
        },
      }),
    });

    expect(output).toContain("Read ");
    expect(output).toContain("\u001b[33mapp/main.ts\u001b[0m");
  });
});
