import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { parsePsCpuTimeToMicros, runCommand } from "./shared.ts";
import type { RuntimeProcessSample, RuntimeStatsBackend } from "./types.ts";

type LinuxPsEntry = RuntimeProcessSample & {
  procPath: string;
};

export const parseLinuxPsOutput = ({
  stdout,
}: {
  stdout: string;
}): LinuxPsEntry[] => {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)$/);

      if (!match) {
        return [];
      }

      const [, pidText, ppidText, rssKbText, cpuTimeText] = match;
      const pid = Number(pidText);

      return [
        {
          pid,
          ppid: Number(ppidText),
          rssBytes: Number(rssKbText) * 1024,
          cpuTimeMicros: parsePsCpuTimeToMicros({
            text: cpuTimeText ?? "",
          }),
          procPath: `/proc/${pid}`,
        } satisfies LinuxPsEntry,
      ];
    });
};

export const parseLinuxIoFile = ({
  text,
}: {
  text: string;
}): Pick<RuntimeProcessSample, "readBytes" | "writeBytes"> => {
  const readBytes = Number(
    text.match(/(^|\n)read_bytes:\s*(\d+)/)?.[2] ?? Number.NaN,
  );
  const writeBytes = Number(
    text.match(/(^|\n)write_bytes:\s*(\d+)/)?.[2] ?? Number.NaN,
  );

  return {
    readBytes: Number.isFinite(readBytes) ? readBytes : undefined,
    writeBytes: Number.isFinite(writeBytes) ? writeBytes : undefined,
  };
};

export const linuxRuntimeStatsBackend: RuntimeStatsBackend = {
  platform: "linux",
  capabilities: {
    childMemory: "best-effort",
    childCpu: "best-effort",
    childDiskIo: "best-effort",
    notes: [
      "Linux combines ps snapshots for RSS and CPU with /proc/<pid>/io counters for agent read and write bytes.",
    ],
  },
  sampleProcessTable: async () => {
    const psEntries = parseLinuxPsOutput({
      stdout: runCommand({
        command: "ps",
        args: ["-eo", "pid=,ppid=,rss=,time="],
      }),
    });
    const procEntries = new Set(await readdir("/proc"));

    return psEntries.map((entry) => {
      if (!procEntries.has(String(entry.pid))) {
        return {
          pid: entry.pid,
          ppid: entry.ppid,
          rssBytes: entry.rssBytes,
          cpuTimeMicros: entry.cpuTimeMicros,
        } satisfies RuntimeProcessSample;
      }

      try {
        const ioStats = parseLinuxIoFile({
          text: readFileSync(`${entry.procPath}/io`, "utf8"),
        });

        return {
          pid: entry.pid,
          ppid: entry.ppid,
          rssBytes: entry.rssBytes,
          cpuTimeMicros: entry.cpuTimeMicros,
          readBytes: ioStats.readBytes,
          writeBytes: ioStats.writeBytes,
        } satisfies RuntimeProcessSample;
      } catch {
        return {
          pid: entry.pid,
          ppid: entry.ppid,
          rssBytes: entry.rssBytes,
          cpuTimeMicros: entry.cpuTimeMicros,
        } satisfies RuntimeProcessSample;
      }
    });
  },
};
