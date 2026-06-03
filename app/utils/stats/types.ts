import type { ReviewRuntimeStatsEntity } from "../../types/review.types.ts";

export type RuntimeProcessSample = {
  pid: number;
  ppid: number;
  rssBytes?: number;
  cpuTimeMicros?: number;
  readBytes?: number;
  writeBytes?: number;
};

export type RuntimeStatsBackend = {
  platform: NodeJS.Platform;
  capabilities: ReviewRuntimeStatsEntity["capabilities"];
  sampleProcessTable: () => Promise<RuntimeProcessSample[]>;
};

export type RuntimeStatsCollector = {
  stop: () => Promise<ReviewRuntimeStatsEntity | undefined>;
};

export type RuntimeStatsParentSample = {
  rssBytes: number;
  heapUsedBytes: number;
  externalBytes: number;
  cpuUserMicros: number;
  cpuSystemMicros: number;
};
