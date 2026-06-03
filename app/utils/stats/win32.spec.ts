import { describe, expect, test } from "bun:test";
import { parseWin32ProcessJson } from "./win32.ts";

const platformTest = process.platform === "win32" ? test : test.skip;

describe("parseWin32ProcessJson", () => {
  platformTest("parses Win32_Process JSON output", () => {
    expect(
      parseWin32ProcessJson({
        jsonText: JSON.stringify([
          {
            ProcessId: 301,
            ParentProcessId: 1,
            WorkingSetSize: 4096,
            UserModeTime: 20000000,
            KernelModeTime: 10000000,
            ReadTransferCount: 2048,
            WriteTransferCount: 1024,
          },
        ]),
      }),
    ).toEqual([
      {
        pid: 301,
        ppid: 1,
        rssBytes: 4096,
        cpuTimeMicros: 3_000_000,
        readBytes: 2048,
        writeBytes: 1024,
      },
    ]);
  });
});
