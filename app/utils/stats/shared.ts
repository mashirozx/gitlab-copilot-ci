import { spawnSync } from "node:child_process";
import type { RuntimeProcessSample } from "./types.ts";

export const parsePsCpuTimeToMicros = ({
  text,
}: {
  text: string;
}): number | undefined => {
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  const [dayPart, clockPart] = trimmed.includes("-")
    ? trimmed.split("-", 2)
    : [undefined, trimmed];
  const segments = (clockPart ?? "").split(":");

  if (segments.length < 2 || segments.length > 3) {
    return undefined;
  }

  const dayCount = dayPart === undefined ? 0 : Number(dayPart);
  const secondCount = Number(segments.at(-1) ?? "0");
  const minuteCount = Number(segments.at(-2) ?? "0");
  const hourCount = segments.length === 3 ? Number(segments[0] ?? "0") : 0;
  const totalSeconds =
    dayCount * 24 * 60 * 60 +
    hourCount * 60 * 60 +
    minuteCount * 60 +
    secondCount;

  if (!Number.isFinite(totalSeconds)) {
    return undefined;
  }

  return Math.round(totalSeconds * 1_000_000);
};

export const buildProcessTree = ({
  rootPid,
  processTable,
}: {
  rootPid: number | null;
  processTable: RuntimeProcessSample[];
}): RuntimeProcessSample[] => {
  if (rootPid === null) {
    return [];
  }

  const byParent = new Map<number, RuntimeProcessSample[]>();

  for (const entry of processTable) {
    const children = byParent.get(entry.ppid) ?? [];
    children.push(entry);
    byParent.set(entry.ppid, children);
  }

  const queue = [rootPid];
  const visited = new Set<number>();
  const tree: RuntimeProcessSample[] = [];

  while (queue.length > 0) {
    const pid = queue.shift();

    if (pid === undefined || visited.has(pid)) {
      continue;
    }

    visited.add(pid);

    const processSample = processTable.find((entry) => entry.pid === pid);

    if (processSample) {
      tree.push(processSample);
    }

    for (const child of byParent.get(pid) ?? []) {
      queue.push(child.pid);
    }
  }

  return tree;
};

export const runCommand = ({
  command,
  args,
}: {
  command: string;
  args: string[];
}): string => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `${command} failed`);
  }

  return result.stdout;
};
