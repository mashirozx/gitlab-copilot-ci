import { argv } from "../argv";
import { getNowEpochMilliseconds } from "../time";
import { darwinRuntimeStatsBackend } from "./darwin.ts";
import { linuxRuntimeStatsBackend } from "./linux.ts";
import { buildProcessTree } from "./shared.ts";
import type {
  RuntimeProcessSample,
  RuntimeStatsBackend,
  RuntimeStatsCollector,
  RuntimeStatsParentSample,
} from "./types.ts";
import { win32RuntimeStatsBackend } from "./win32.ts";

const DEFAULT_SAMPLE_INTERVAL_MS = 500;

const getRuntimeStatsBackend = (): RuntimeStatsBackend => {
  if (process.platform === "darwin") {
    return darwinRuntimeStatsBackend;
  }

  if (process.platform === "linux") {
    return linuxRuntimeStatsBackend;
  }

  if (process.platform === "win32") {
    return win32RuntimeStatsBackend;
  }

  return {
    platform: process.platform,
    capabilities: {
      childMemory: "unsupported",
      childCpu: "unsupported",
      childDiskIo: "unsupported",
      notes: [`${process.platform} does not have a runtime stats backend.`],
    },
    sampleProcessTable: async () => [],
  };
};

const getParentRuntimeSample = (): RuntimeStatsParentSample => {
  const memoryUsage = process.memoryUsage();
  const resourceUsage = process.resourceUsage();

  return {
    rssBytes: memoryUsage.rss,
    heapUsedBytes: memoryUsage.heapUsed,
    externalBytes: memoryUsage.external,
    cpuUserMicros: resourceUsage.userCPUTime,
    cpuSystemMicros: resourceUsage.systemCPUTime,
  };
};

const sumDefinedValues = ({
  values,
}: {
  values: Array<number | undefined>;
}): number | undefined => {
  const definedValues = values.filter(
    (value): value is number => value !== undefined,
  );

  if (definedValues.length === 0) {
    return undefined;
  }

  return definedValues.reduce((total, value) => total + value, 0);
};

const buildRuntimeStatsResult = ({
  backend,
  sampleCount,
  sampleIntervalMs,
  peakParentRssBytes,
  peakParentHeapUsedBytes,
  peakParentExternalBytes,
  latestParentCpuUserMicros,
  latestParentCpuSystemMicros,
  peakTreeRssBytes,
  peakTreeCpuPercent,
  peakProcessCount,
  maxIoByPid,
}: {
  backend: RuntimeStatsBackend;
  sampleCount: number;
  sampleIntervalMs: number;
  peakParentRssBytes: number;
  peakParentHeapUsedBytes: number;
  peakParentExternalBytes: number;
  latestParentCpuUserMicros: number;
  latestParentCpuSystemMicros: number;
  peakTreeRssBytes: number;
  peakTreeCpuPercent: number;
  peakProcessCount: number;
  maxIoByPid: Map<number, { readBytes?: number; writeBytes?: number }>;
}) => {
  return {
    platform: backend.platform,
    sampleCount,
    sampleIntervalMs,
    parent: {
      peakRssBytes: peakParentRssBytes || undefined,
      peakHeapUsedBytes: peakParentHeapUsedBytes || undefined,
      peakExternalBytes: peakParentExternalBytes || undefined,
      cpuUserMicros: latestParentCpuUserMicros || undefined,
      cpuSystemMicros: latestParentCpuSystemMicros || undefined,
    },
    agent: {
      peakTreeRssBytes: peakTreeRssBytes || undefined,
      peakTreeCpuPercent:
        peakTreeCpuPercent > 0
          ? Number(peakTreeCpuPercent.toFixed(1))
          : undefined,
      peakProcessCount: peakProcessCount || undefined,
      totalReadBytes: sumDefinedValues({
        values: [...maxIoByPid.values()].map((ioStats) => ioStats.readBytes),
      }),
      totalWriteBytes: sumDefinedValues({
        values: [...maxIoByPid.values()].map((ioStats) => ioStats.writeBytes),
      }),
    },
    capabilities: backend.capabilities,
  };
};

const accumulateLifetimeIo = ({
  processTree,
  maxIoByPid,
}: {
  processTree: RuntimeProcessSample[];
  maxIoByPid: Map<number, { readBytes?: number; writeBytes?: number }>;
}): void => {
  for (const processSample of processTree) {
    const currentIo = maxIoByPid.get(processSample.pid) ?? {};
    const nextReadBytes =
      processSample.readBytes === undefined
        ? currentIo.readBytes
        : Math.max(currentIo.readBytes ?? 0, processSample.readBytes);
    const nextWriteBytes =
      processSample.writeBytes === undefined
        ? currentIo.writeBytes
        : Math.max(currentIo.writeBytes ?? 0, processSample.writeBytes);

    maxIoByPid.set(processSample.pid, {
      readBytes: nextReadBytes,
      writeBytes: nextWriteBytes,
    });
  }
};

export const startRuntimeStatsCollector = ({
  rootPid,
  isEnabled = argv["collect-runtime-stats"],
  sampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS,
  backend = getRuntimeStatsBackend(),
}: {
  rootPid: number | null;
  isEnabled?: boolean;
  sampleIntervalMs?: number;
  backend?: RuntimeStatsBackend;
}): RuntimeStatsCollector => {
  if (!isEnabled) {
    return {
      stop: async () => undefined,
    };
  }

  let isStopped = false;
  let sampleCount = 0;
  let peakParentRssBytes = 0;
  let peakParentHeapUsedBytes = 0;
  let peakParentExternalBytes = 0;
  let latestParentCpuUserMicros = 0;
  let latestParentCpuSystemMicros = 0;
  let peakTreeRssBytes = 0;
  let peakTreeCpuPercent = 0;
  let peakProcessCount = 0;
  let lastSampleTimeMs: number | null = null;
  let lastCpuTimeByPid = new Map<number, number>();
  const maxIoByPid = new Map<
    number,
    { readBytes?: number; writeBytes?: number }
  >();
  let pendingSample: Promise<void> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const sampleOnce = async (): Promise<void> => {
    const parentSample = getParentRuntimeSample();
    peakParentRssBytes = Math.max(peakParentRssBytes, parentSample.rssBytes);
    peakParentHeapUsedBytes = Math.max(
      peakParentHeapUsedBytes,
      parentSample.heapUsedBytes,
    );
    peakParentExternalBytes = Math.max(
      peakParentExternalBytes,
      parentSample.externalBytes,
    );
    latestParentCpuUserMicros = parentSample.cpuUserMicros;
    latestParentCpuSystemMicros = parentSample.cpuSystemMicros;

    if (rootPid !== null) {
      const processTree = buildProcessTree({
        rootPid,
        processTable: await backend.sampleProcessTable(),
      });
      const nowMs = getNowEpochMilliseconds();
      const treeRssBytes =
        sumDefinedValues({
          values: processTree.map((processSample) => processSample.rssBytes),
        }) ?? 0;

      peakTreeRssBytes = Math.max(peakTreeRssBytes, treeRssBytes);
      peakProcessCount = Math.max(peakProcessCount, processTree.length);
      accumulateLifetimeIo({
        processTree,
        maxIoByPid,
      });

      if (lastSampleTimeMs !== null) {
        const deltaWallMicros = (nowMs - lastSampleTimeMs) * 1000;

        if (deltaWallMicros > 0) {
          let treeCpuPercent = 0;

          for (const processSample of processTree) {
            const currentCpuTime = processSample.cpuTimeMicros;
            const previousCpuTime = lastCpuTimeByPid.get(processSample.pid);

            if (
              currentCpuTime !== undefined &&
              previousCpuTime !== undefined &&
              currentCpuTime >= previousCpuTime
            ) {
              treeCpuPercent +=
                ((currentCpuTime - previousCpuTime) / deltaWallMicros) * 100;
            }
          }

          peakTreeCpuPercent = Math.max(peakTreeCpuPercent, treeCpuPercent);
        }
      }

      lastCpuTimeByPid = new Map(
        processTree
          .filter(
            (
              processSample,
            ): processSample is RuntimeProcessSample & {
              cpuTimeMicros: number;
            } => processSample.cpuTimeMicros !== undefined,
          )
          .map((processSample) => [
            processSample.pid,
            processSample.cpuTimeMicros,
          ]),
      );
      lastSampleTimeMs = nowMs;
    }

    sampleCount += 1;
  };

  const scheduleNextSample = (): void => {
    if (isStopped) {
      return;
    }

    timer = setTimeout(() => {
      pendingSample = sampleOnce()
        .catch(() => {})
        .finally(() => {
          scheduleNextSample();
        });
    }, sampleIntervalMs);
  };

  pendingSample = sampleOnce().catch(() => {});
  scheduleNextSample();

  return {
    stop: async () => {
      if (isStopped) {
        return buildRuntimeStatsResult({
          backend,
          sampleCount,
          sampleIntervalMs,
          peakParentRssBytes,
          peakParentHeapUsedBytes,
          peakParentExternalBytes,
          latestParentCpuUserMicros,
          latestParentCpuSystemMicros,
          peakTreeRssBytes,
          peakTreeCpuPercent,
          peakProcessCount,
          maxIoByPid,
        });
      }

      isStopped = true;

      if (timer) {
        clearTimeout(timer);
      }

      await pendingSample;
      await sampleOnce().catch(() => {});

      return buildRuntimeStatsResult({
        backend,
        sampleCount,
        sampleIntervalMs,
        peakParentRssBytes,
        peakParentHeapUsedBytes,
        peakParentExternalBytes,
        latestParentCpuUserMicros,
        latestParentCpuSystemMicros,
        peakTreeRssBytes,
        peakTreeCpuPercent,
        peakProcessCount,
        maxIoByPid,
      });
    },
  };
};
