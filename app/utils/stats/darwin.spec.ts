import { describe, expect, test } from "bun:test";
import { parseDarwinPsOutput } from "./darwin.ts";

const platformTest = process.platform === "darwin" ? test : test.skip;

describe("parseDarwinPsOutput", () => {
  platformTest("parses macOS ps rss and cumulative cpu time output", () => {
    const result = parseDarwinPsOutput({
      stdout: "101 1 2048 00:01.50\n102 101 1024 1:02:03\n",
    });

    expect(result).toEqual([
      {
        pid: 101,
        ppid: 1,
        rssBytes: 2048 * 1024,
        cpuTimeMicros: 1_500_000,
      },
      {
        pid: 102,
        ppid: 101,
        rssBytes: 1024 * 1024,
        cpuTimeMicros: 3_723_000_000,
      },
    ]);
  });
});
