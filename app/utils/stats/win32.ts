import { runCommand } from "./shared.ts";
import type { RuntimeProcessSample, RuntimeStatsBackend } from "./types.ts";

type WindowsProcessRecord = {
  ProcessId?: number | string;
  ParentProcessId?: number | string;
  WorkingSetSize?: number | string;
  UserModeTime?: number | string;
  KernelModeTime?: number | string;
  ReadTransferCount?: number | string;
  WriteTransferCount?: number | string;
};

const WINDOWS_PROCESS_QUERY = [
  "$ErrorActionPreference = 'Stop'",
  "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize,UserModeTime,KernelModeTime,ReadTransferCount,WriteTransferCount | ConvertTo-Json -Compress",
].join("; ");

const toNumber = ({
  value,
}: {
  value: number | string | undefined;
}): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : undefined;
};

export const parseWin32ProcessJson = ({
  jsonText,
}: {
  jsonText: string;
}): RuntimeProcessSample[] => {
  const parsedValue = JSON.parse(jsonText) as
    | WindowsProcessRecord
    | WindowsProcessRecord[];
  const records = Array.isArray(parsedValue) ? parsedValue : [parsedValue];

  return records.flatMap((record) => {
    const pid = toNumber({ value: record.ProcessId });
    const ppid = toNumber({ value: record.ParentProcessId });

    if (pid === undefined || ppid === undefined) {
      return [];
    }

    const userModeTime = toNumber({ value: record.UserModeTime }) ?? 0;
    const kernelModeTime = toNumber({ value: record.KernelModeTime }) ?? 0;

    return [
      {
        pid,
        ppid,
        rssBytes: toNumber({ value: record.WorkingSetSize }),
        cpuTimeMicros: Math.round((userModeTime + kernelModeTime) / 10),
        readBytes: toNumber({ value: record.ReadTransferCount }),
        writeBytes: toNumber({ value: record.WriteTransferCount }),
      } satisfies RuntimeProcessSample,
    ];
  });
};

const runWindowsShell = (): string => {
  try {
    return runCommand({
      command: "powershell",
      args: ["-NoProfile", "-Command", WINDOWS_PROCESS_QUERY],
    });
  } catch {
    return runCommand({
      command: "pwsh",
      args: ["-NoProfile", "-Command", WINDOWS_PROCESS_QUERY],
    });
  }
};

export const win32RuntimeStatsBackend: RuntimeStatsBackend = {
  platform: "win32",
  capabilities: {
    childMemory: "best-effort",
    childCpu: "best-effort",
    childDiskIo: "best-effort",
    notes: [
      "Windows samples Win32_Process counters through PowerShell and preserves the highest observed transfer counts for agent processes seen during the run.",
    ],
  },
  sampleProcessTable: async () => {
    return parseWin32ProcessJson({
      jsonText: runWindowsShell(),
    });
  },
};
