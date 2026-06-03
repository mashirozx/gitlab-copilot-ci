import { parsePsCpuTimeToMicros, runCommand } from "./shared.ts";
import type { RuntimeProcessSample, RuntimeStatsBackend } from "./types.ts";

export const parseDarwinPsOutput = ({
  stdout,
}: {
  stdout: string;
}): RuntimeProcessSample[] => {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)$/);

      if (!match) {
        return null;
      }

      const [, pidText, ppidText, rssKbText, cpuTimeText] = match;

      return {
        pid: Number(pidText),
        ppid: Number(ppidText),
        rssBytes: Number(rssKbText) * 1024,
        cpuTimeMicros: parsePsCpuTimeToMicros({
          text: cpuTimeText,
        }),
      } satisfies RuntimeProcessSample;
    })
    .filter((entry): entry is RuntimeProcessSample => entry !== null);
};

export const darwinRuntimeStatsBackend: RuntimeStatsBackend = {
  platform: "darwin",
  capabilities: {
    childMemory: "best-effort",
    childCpu: "best-effort",
    childDiskIo: "unsupported",
    notes: [
      "macOS samples agent RSS and cumulative CPU time from ps snapshots; per-process disk I/O bytes are unavailable in this backend.",
    ],
  },
  sampleProcessTable: async () => {
    return parseDarwinPsOutput({
      stdout: runCommand({
        command: "ps",
        args: ["-axo", "pid=,ppid=,rss=,time="],
      }),
    });
  },
};
