import { describe, expect, test } from "bun:test";
import { parseAgentArgs } from "./agent-args";

describe("parseAgentArgs", () => {
  test("returns empty array for undefined or blank input", () => {
    expect(parseAgentArgs({ rawArgs: undefined })).toEqual([]);
    expect(parseAgentArgs({ rawArgs: "" })).toEqual([]);
    expect(parseAgentArgs({ rawArgs: "   \t\n  " })).toEqual([]);
  });

  test("splits by whitespace for simple args", () => {
    expect(parseAgentArgs({ rawArgs: "--foo bar --flag" })).toEqual([
      "--foo",
      "bar",
      "--flag",
    ]);
  });

  test("keeps quoted segments together and removes quote chars", () => {
    expect(
      parseAgentArgs({ rawArgs: "--name \"hello world\" --msg 'quoted text'" }),
    ).toEqual(["--name", "hello world", "--msg", "quoted text"]);
  });

  test("supports escaped spaces and escaped quote characters", () => {
    expect(
      parseAgentArgs({ rawArgs: '--path one\\ two --title "say\\"hi"' }),
    ).toEqual(["--path", "one two", "--title", 'say"hi']);
  });

  test("keeps trailing backslash when input ends with an escape", () => {
    expect(parseAgentArgs({ rawArgs: "--arg value\\" })).toEqual([
      "--arg",
      "value\\",
    ]);
  });

  test("treats unterminated quote as part of current token", () => {
    expect(parseAgentArgs({ rawArgs: '--msg "hello world' })).toEqual([
      "--msg",
      "hello world",
    ]);
  });
});
