import { describe, expect, test } from "bun:test";
import { parseLinuxIoFile, parseLinuxPsOutput } from "./linux.ts";

const platformTest = process.platform === "linux" ? test : test.skip;

describe("linux runtime stats parsing", () => {
  platformTest("parses Linux ps output and /proc io counters", () => {
    expect(
      parseLinuxPsOutput({
        stdout: "201 1 4096 00:00:02\n202 201 2048 1-00:00:00\n",
      }),
    ).toEqual([
      {
        pid: 201,
        ppid: 1,
        rssBytes: 4096 * 1024,
        cpuTimeMicros: 2_000_000,
        procPath: "/proc/201",
      },
      {
        pid: 202,
        ppid: 201,
        rssBytes: 2048 * 1024,
        cpuTimeMicros: 86_400_000_000,
        procPath: "/proc/202",
      },
    ]);
    expect(
      parseLinuxIoFile({
        text: "read_bytes: 123\nwrite_bytes: 456\n",
      }),
    ).toEqual({
      readBytes: 123,
      writeBytes: 456,
    });
  });
});
